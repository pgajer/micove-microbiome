"""Add participant-excluded nearest-case fields in frozen joint-profile spaces.

Inputs are separately distributed, reviewed registry/profile files. This command
does not refit profiles, clusters or embeddings, or replace an existing export.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np


TARGETS = ['Any incident STI', 'Incident CT', 'Incident GC', 'Incident TV'] + [
    'Reported ' + s for s in ('diabet', 'mvp', 'thyroid', 'asthma', 'allergy',
                              's_cell', 'anemia', 'metro', 'yeasttx')
] + ['health: ' + s for s in ('excellent', 'good', 'fair', 'poor')]
CASE_SIZES = (5, 10, 20, 40)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, obj):
    Path(path).write_text(json.dumps(obj, allow_nan=False, separators=(',', ':')) + '\n')


def descriptor(root, path):
    return dict(file=str(path.relative_to(root)), sha256=sha(path), bytes=path.stat().st_size)


def scan(distances, order, groups, responses, k):
    """Select nearest answering visit before reading its binary answer.

    One person can have different answers across visits. A farther positive visit
    never replaces that person's nearer negative answer. Ties use supplied order.
    """
    n = len(groups)
    result = dict(values=[None]*n, status=['insufficient_cases']*n,
                  support={key: [None]*n for key in
                           ('participantCount', 'neighborCount', 'caseParticipantCount', 'radius')})
    for q, ranked in enumerate(order):
        if groups[q] < 0:
            result['status'][q] = 'unknown_participant'
            continue
        eligible = ranked[(groups[ranked] >= 0) & (groups[ranked] != groups[q])
                          & np.isfinite(responses[ranked])]
        # np.unique returns first occurrences by group; sort their positions to
        # restore distance order before using the outcome.
        first = np.unique(groups[eligible], return_index=True)[1]
        neighbors = eligible[np.sort(first)]
        hits = np.flatnonzero(responses[neighbors] == 1)
        supported = len(hits) >= k
        count = int(hits[k-1]+1) if supported else len(neighbors)
        cases = k if supported else len(hits)
        for key, value in [('participantCount', count), ('neighborCount', count),
                           ('caseParticipantCount', cases)]:
            result['support'][key][q] = int(value)
        if supported:
            result['values'][q] = k/count
            result['status'][q] = 'ok'
            result['support']['radius'][q] = float(distances[q, neighbors[count-1]])
    return result


def main():
    from scipy.spatial.distance import pdist, squareform
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-catalogue', type=Path, required=True)
    parser.add_argument('--registry', type=Path, required=True)
    parser.add_argument('--equal-features', type=Path, required=True)
    parser.add_argument('--equal-groups', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--case-sizes', type=int, nargs='+', default=list(CASE_SIZES), choices=CASE_SIZES)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Output already exists; preserve earlier exports.')
    manifest = read(args.base_catalogue/'manifest.json')
    assert sha(args.registry/'targets.npz') == manifest['displayReference']['sourceTargetsSha256']
    registry = np.load(args.registry/'targets.npz')
    features = read(args.registry/'feature_dictionary.json')
    targets = read(args.registry/'targets.json')
    ids = registry['ids'].astype(str)
    assert read(args.base_catalogue/manifest['sampleOrder']['file'])['sampleIds'] == ids.tolist()
    assert len(ids) == manifest['sampleCount']
    selected = []
    for name in TARGETS:
        f = next(f for f in features if f['sourceName'] == name)
        t = next(t for t in targets if t['featureId'] == f['id'] and t['transformationId'] == 'probability')
        assert t['binary'] and f['id'] in {f['id'] for f in manifest['features']}
        selected.append((f, t))
    sizes = sorted(set(args.case_sizes))
    for k in sizes:
        policy_id = 'profile-nearest-case-'+str(k)+'-v1'
        if any(p['id'] == policy_id for p in manifest['estimationPolicies']):
            continue
        policy = copy.deepcopy(next(p for p in manifest['estimationPolicies'] if p['id'] == 'participant-excluded'))
        policy.update(id=policy_id,
            trainingPopulation='Finite observed binary answers among visits with frozen outcome-excluded joint profiles and known participants.',
            queryPopulation='The same 1,965 profile visits; 26 records without participant identity remain unavailable.',
            boundaryStoppingRule=f'Stop at positive-answer participant number {k}; report {k}/T. No adaptive k or fallback.',
            validationDesign='Descriptive, not cross-validated prediction. Profiles, percentile scales and clusters were frozen using the full reference; query-participant exclusion applies only to the final response aggregation.')
        manifest['estimationPolicies'].append(policy)
    outputs, audit, inputs, reused = [], [], {}, []
    original_series = {s['id']: s for s in manifest['series']}
    previous = None
    for weighting, folder in [('features', args.equal_features), ('groups', args.equal_groups)]:
        inp = read(folder/'input.json')
        assert inp['weighting'] == weighting and inp['columns'] == 38
        assert inp['sampleOrderSha256'] == manifest['sampleOrderSha256']
        assert sha(folder/'matrix.bin') == inp['matrixSha256']
        records = np.asarray(inp['recordIndices'], dtype=int)
        assert inp['recordIds'] == ids[records].tolist()
        groups = registry['groups'][records]
        assert np.array_equal(groups, inp['participantGroups']) and (groups >= 0).all()
        assert set(records) == set(np.flatnonzero(registry['groups'] >= 0))
        if previous is not None:
            assert inp['snapshot'] == previous['snapshot'] and inp['recordIndices'] == previous['recordIndices']
        previous = inp
        x = np.fromfile(folder/'matrix.bin', dtype='<f8').reshape(inp['rows'], inp['columns'])
        assert np.isfinite(x).all()
        rep = next(d for d in manifest['profileEmbeddings'] if d['id'] == inp['representationId'])
        data = read(args.base_catalogue/rep['file'])
        assert data['inputMatrixSha256'] == inp['matrixSha256']
        assert data['recordIndices'] == records.tolist()
        assert np.allclose(data['profileScores'], x, rtol=0, atol=1e-10)
        excluded = {f['featureId'] for f in inp['snapshot']['exclusionPolicy']['excluded']}
        assert all(f['id'] in excluded for f, _ in selected)
        distances = squareform(pdist(x, metric='euclidean'))
        priority = np.array(sorted(range(len(records)), key=lambda j: (
            hashlib.sha256(('nearest-cases-v1|'+ids[records[j]]).encode()).hexdigest(), ids[records[j]])))
        order = priority[np.argsort(distances[:, priority], axis=1, kind='stable')]
        geometry_id = 'joint38-outcome-excluded-equal-'+weighting+'-euclidean'
        geometry = dict(id=geometry_id,
            label='38 joint profiles · Equal '+weighting+' · Euclidean',
            normalization='Frozen median feature percentiles; equal '+weighting+' within each cluster; all 38 dimensions equally weighted.',
            distance='Euclidean in all 38 profile columns; not distances in the 3D map.',
            description='Outcome-excluded frozen profiles; nearest answering visit per person; all query-participant visits excluded.',
            profileRepresentationId=rep['id'], inputMatrixSha256=inp['matrixSha256'])
        old_geometry = next((g for g in manifest['geometries'] if g['id'] == geometry_id), None)
        if old_geometry:
            assert old_geometry == geometry
        else:
            manifest['geometries'].append(geometry)
        inputs[weighting] = dict(inputSha256=sha(folder/'input.json'), matrixSha256=inp['matrixSha256'],
            representationId=rep['id'], representationSha256=rep['sha256'], records=len(records), participants=len(set(groups.tolist())))
        for k in sizes:
            policy_id = 'profile-nearest-case-'+str(k)+'-v1'
            shard_id = 'profile-outcomes-'+weighting+'-k'+str(k)+'-v1'
            shard = dict(format='micove-estimate-shard', version=1, datasetId=manifest['datasetId'],
                       catalogueRevision=manifest['revision'], sampleOrderSha256=manifest['sampleOrderSha256'], series={})
            for f, t in selected:
                sid = f['id']+'--profile-'+weighting+'--nearest-case-raw--'+str(k)
                if sid in original_series:
                    old = original_series[sid]
                    assert old['k'] == k and old['geometryId'] == geometry_id and old['featureId'] == f['id']
                    reused.append(sid)
                    continue
                y = registry['values'][records, t['index']]
                assert np.isin(y[np.isfinite(y)], [0, 1]).all()
                row = scan(distances, order, groups, y, k)
                full = dict(values=[None]*len(ids), status=['unknown_participant']*len(ids),
                            support={key: [None]*len(ids) for key in row['support']})
                for j, i in enumerate(records):
                    full['values'][i], full['status'][i] = row['values'][j], row['status'][j]
                    for key in row['support']:
                        full['support'][key][i] = row['support'][key][j]
                shard['series'][sid] = full
                valid = np.isfinite(y)
                positive = y == 1
                counts = dict(trainingObservations=int(valid.sum()), trainingParticipants=len(set(groups[valid].tolist())),
                    positiveObservations=int(positive.sum()), positiveParticipants=len(set(groups[positive].tolist())),
                    queryCount=len(ids), availableEstimateCount=row['status'].count('ok'))
                manifest['series'].append(dict(id=sid, featureId=f['id'], transformationId='probability',
                    geometryId=geometry_id, estimatorId='nearest-case-raw', estimatorLabel='Nearest-case raw (k/T)',
                    k=k, kMeaning='case_participants', scopeId='global', estimationId=policy_id,
                    quantityLabel=f['label']+' — nearest-case estimate', unit='probability', shardId=shard_id,
                    valueDomain='probability', counts=counts,
                    limitations=[f'Unavailable where {k} positive-answer people cannot be reached. A person contributes the answer from their nearest answering visit, not any positive visit.']))
                audit.append(dict(target=f['sourceName'], featureId=f['id'], geometryId=geometry_id, k=k,
                    **counts, insufficientCases=row['status'].count('insufficient_cases'),
                    reachedPeopleRange=[min(row['support']['participantCount']), max(row['support']['participantCount'])]))
            if shard['series']:
                assert not any(d['id'] == shard_id for d in manifest['shards']), 'Do not replace a partial existing shard.'
                outputs.append((shard_id, shard))
        print(weighting, 'complete', flush=True)
    shutil.copytree(args.base_catalogue, args.output)
    for shard_id, shard in outputs:
        path = args.output/'features'/(shard_id+'.json')
        write(path, shard)
        manifest['shards'].append(dict(id=shard_id, **descriptor(args.output, path)))
    provenance = dict(version=1, revision='profile-nearest-case-grid-v1', caseSizes=sizes, estimator='k/T',
        sourceManifestSha256=sha(args.base_catalogue/'manifest.json'),
        registrySha256={name: sha(args.registry/name) for name in ['targets.npz', 'targets.json', 'feature_dictionary.json']},
        inputs=inputs, scriptSha256=sha(__file__), support=audit, reusedSeries=reused,
        threads=1, memoryBudgetGiB=2, modelsRefitted=False)
    manifest['profileOutcomeNeighborhoods'] = provenance
    doc = args.output/'documentation/profile-outcomes-k-grid.md'
    shutil.copyfile(Path(__file__).with_name('PROFILE_OUTCOMES.md'), doc)
    for previous_doc in manifest['documentation']:
        if previous_doc['id'] == 'profile-outcomes':
            previous_doc['id'] = 'profile-outcomes-archive-'+sha(args.base_catalogue/'manifest.json')[:12]
    manifest['documentation'].append(dict(id='profile-outcomes', label='Nearest-case estimates in joint-profile spaces', **descriptor(args.output, doc)))
    write(args.output/'manifest.json', manifest)
    # The old validation receipt belongs to the unchanged base. Preserve it, but
    # require a new validator receipt before this additive export can be installed.
    (args.output/'validation.json').rename(args.output/('base-validation-'+sha(args.base_catalogue/'manifest.json')[:12]+'.json'))
    write(args.output/'profile-outcome-neighborhoods-audit.json', provenance)
    print(json.dumps(audit, indent=2))


if __name__ == '__main__':
    main()
