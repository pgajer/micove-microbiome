"""Extend frozen estimate fields to unidentified queries without refitting anything.

Existing predictions, response transformations, reference people, profiles,
embeddings and correlation banks are immutable. Outputs use a new directory.
"""
import argparse
import base64
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
from scipy.spatial.distance import cdist

POLICY = ('Specimens without subject IDs are queries only. Their own participant '
          'cannot reliably be excluded; estimates for these specimens are descriptive, '
          'not participant-excluded or cross-validated predictions. All reference '
          'people, response transformations and existing estimates remain fixed.')


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, separators=(',', ':'), allow_nan=False)+'\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def refresh(root, descriptor):
    path = root/descriptor['file']
    descriptor.update(sha256=sha(path), bytes=path.stat().st_size)


def answering_people(ranked, groups, responses, query_group=-1, anchors=None, anchor=None):
    eligible = ranked[(groups[ranked] >= 0) & (groups[ranked] != query_group)
                      & np.isfinite(responses[ranked])]
    if anchors is not None:
        eligible = eligible[anchors[eligible] == anchor]
    first = np.unique(groups[eligible], return_index=True)[1]
    return eligible[np.sort(first)]


def estimate(neighbors, distances, responses, binary, estimator, k, outside=False):
    result = dict(value=None, status='outside_scope' if outside else
                  ('insufficient_neighbors' if estimator == 'knn' else 'insufficient_cases'),
                  support={key: None for key in
                           ('neighborCount', 'participantCount', 'caseParticipantCount', 'radius')})
    if outside:
        return result
    y = responses[neighbors]
    hits = np.flatnonzero(y == 1) if binary else []
    supported = len(neighbors) >= k if estimator == 'knn' else len(hits) >= k
    count = (k if estimator == 'knn' else int(hits[k-1])+1) if supported else len(neighbors)
    cases = int(np.sum(y[:count] == 1)) if binary else None
    result['support'].update(neighborCount=count, participantCount=count, caseParticipantCount=cases)
    if supported:
        # Sequential accumulation matches the original native scanner.
        value = float(np.cumsum(y[:count])[-1]/count) if estimator == 'knn' else (
            k/count if estimator == 'nearest-case-raw' else (k-1)/(count-1))
        result.update(value=value, status='ok')
        result['support']['radius'] = float(distances[neighbors[count-1]])
    return result


def main(args):
    assert not args.output.exists(), 'Preserve existing releases.'
    m = read(args.base/'manifest.json')
    assert sha(args.registry/'targets.npz') == m['displayReference']['sourceTargetsSha256']
    arrays = np.load(args.registry/'targets.npz')
    x, y, groups, anchors, ids = (arrays[k] for k in ('X', 'values', 'groups', 'anchors', 'ids'))
    assert ids.tolist() == read(args.base/m['sampleOrder']['file'])['sampleIds']
    known, queries = np.flatnonzero(groups >= 0), np.flatnonzero(groups < 0)
    assert len(known) == 1965 and len(queries) == 26
    targets = {(t['featureId'], t['transformationId']): t for t in read(args.registry/'targets.json')}
    # Check two identified queries for every series against the saved results.
    checks = known[[0, len(known)//2]]
    query_rows = np.r_[queries, checks]
    priority = np.array(sorted(range(len(ids)), key=lambda j: (
        hashlib.sha256(('nearest-cases-v1|'+str(ids[j])).encode()).hexdigest(), str(ids[j]))))
    distances = {'l1-euclidean': cdist(x[query_rows], x)}
    profile_sources = {}
    for g in m['geometries']:
        if not g.get('profileRepresentationId'):
            continue
        d = next(d for d in m['profileEmbeddings'] if d['id'] == g['profileRepresentationId'])
        assert sha(args.base/d['file']) == d['sha256']
        p = read(args.base/d['file'])
        assert p['inputMatrixSha256'] == g['inputMatrixSha256']
        assert set(p['recordIndices']) == set(range(len(ids)))
        profiles = np.empty((len(ids), len(p['profileScores'][0])))
        profiles[p['recordIndices']] = p['profileScores']
        distances[g['id']] = cdist(profiles[query_rows], profiles)
        profile_sources[g['id']] = dict(representationId=d['id'], sha256=d['sha256'],
            originalInputMatrixSha256=g['inputMatrixSha256'],
            extendedProfilesSha256=p['supplementary']['extendedProfilesSha256'])
    orders = {g: priority[np.argsort(d[:, priority], axis=1, kind='stable')] for g, d in distances.items()}
    by_shard = defaultdict(list)
    for s in m['series']:
        by_shard[s['shardId']].append({**m['seriesDefaults'], **s})
    metadata = {s['id']: s for s in m['series']}
    field_positions = {sid: (int(k), i) for i, f in enumerate(m['correlations']['fields'])
                       for k, sid in f['seriesIds'].items()}
    query_fields = {k: np.full((len(queries), len(m['correlations']['fields'])), np.nan)
                    for k in (10, 20, 40, 80)}
    shutil.copytree(args.base, args.output)
    totals, by_geometry, numerical_checks = Counter(), defaultdict(Counter), 0
    maximum_difference = 0.
    for si, descriptor in enumerate(m['shards']):
        assert sha(args.base/descriptor['file']) == descriptor['sha256']
        shard = read(args.base/descriptor['file'])
        cache = {}
        for s in by_shard[descriptor['id']]:
            t = targets[s['featureId'], s['transformationId']]
            answers = y[:, t['index']]
            geometry = s['geometryId']
            cache_key = (t['index'], geometry)
            if cache_key not in cache:
                within = t['scope'] != 'global'
                cache[cache_key] = [answering_people(ranked, groups, answers, groups[q],
                    anchors if within else None, anchors[q]) for q, ranked in zip(query_rows, orders[geometry])]
            row = shard['series'][s['id']]
            for j, q in enumerate(query_rows):
                outside = t['scope'] != 'global' and anchors[q] == t['anchorExcluded']
                r = estimate(cache[cache_key][j], distances[geometry][j], answers, t['binary'],
                             s['estimatorId'], s['k'], outside)
                if j >= len(queries):
                    assert row['status'][q] == r['status'], (s['id'], int(q), r)
                    for a, b in [(row['values'][q], r['value'])] + [
                        (row['support'][key][q], val) for key, val in r['support'].items()]:
                        if a is None or b is None:
                            assert a is b, (s['id'], int(q), a, b)
                        else:
                            maximum_difference = max(maximum_difference, abs(a-b))
                            assert np.isclose(a, b, rtol=1e-12, atol=1e-12), (s['id'], int(q), a, b)
                    numerical_checks += 1
                    continue
                assert row['values'][q] is None and row['status'][q] in ('unknown_participant', 'outside_scope')
                row['values'][q], row['status'][q] = r['value'], r['status']
                for key, value in r['support'].items():
                    row['support'][key][q] = value
                totals[r['status']] += 1
                by_geometry[geometry][r['status']] += 1
                if s['id'] in field_positions:
                    k, column = field_positions[s['id']]
                    query_fields[k][j, column] = r['value']
            metadata[s['id']]['counts']['availableEstimateCount'] = row['status'].count('ok')
        # Every old value, status and support entry must be exactly preserved.
        old = read(args.base/descriptor['file'])
        for sid, row in shard['series'].items():
            for a, b in [(row['values'], old['series'][sid]['values']), (row['status'], old['series'][sid]['status'])] + [
                    (vals, old['series'][sid]['support'][key]) for key, vals in row['support'].items()]:
                assert all(a[i] == b[i] for i in known), sid
        write(args.output/descriptor['file'], shard)
        refresh(args.output, descriptor)
        if si % 100 == 0:
            print(si+1, '/', len(m['shards']), dict(totals), flush=True)
    for d in m['correlations']['selectionInputs']['banks']:
        data = read(args.base/d['file'])
        values = query_fields[d['k']]
        assert np.isfinite(values).all()
        encoded = base64.b64encode(np.asarray(values.T, dtype='<f8').tobytes()).decode()
        if 'queryValuesBase64' in data:
            old = np.frombuffer(base64.b64decode(data['queryValuesBase64']), dtype='<f8')
            assert np.array_equal(old, values.T.ravel())
            # Preserve the prior K=40 supplementary profile input byte for byte.
            continue
        data.update(queryRecords=queries.tolist(), queryValuesBase64=encoded, queryPolicy=POLICY)
        write(args.output/d['file'], data)
        refresh(args.output, d)
    for d in m['profileEmbeddings']+m['smoothedEmbeddings']+m['correlations']['banks']:
        assert sha(args.output/d['file']) == d['sha256']
    for policy in m['estimationPolicies']:
        policy['queryPopulation'] = 'All frozen specimens, with query-only estimates for 26 specimens without subject IDs.'
        policy['participantExclusion'] = 'All visits of identified query participants excluded. '+POLICY
        policy['queryExclusion'] = policy['participantExclusion']
    provenance = dict(version=1, queryRecordIndices=queries.tolist(), colorReferenceIndices=known.tolist(),
        policy=POLICY, parentSha256=sha(args.base/'manifest.json'), targetsSha256=sha(args.registry/'targets.npz'),
        targetsDefinitionSha256=sha(args.registry/'targets.json'), profileSources=profile_sources,
        sourceSha256=sha(__file__), threads=1, memoryBudgetGiB=4, queryEstimateCounts=dict(totals),
        countsByGeometry=dict(by_geometry), originalSeriesChecks=numerical_checks,
        maximumReproductionDifference=maximum_difference, existingEstimatesUnchanged=True,
        embeddingsUnchanged=True, referencePopulationsUnchanged=True)
    m['supplementaryEstimates'] = provenance
    d = next(d for d in m['documentation'] if d['id'] == 'supplementary-profiles')
    shutil.copyfile(Path(__file__).with_name('SUPPLEMENTARY_PROFILES.md'), args.output/d['file'])
    refresh(args.output, d)
    write(args.output/'supplementary-estimates-validation.json', dict(passed=True, **provenance))
    (args.output/'validation.json').rename(args.output/('base-validation-'+sha(args.base/'manifest.json')[:12]+'.json'))
    write(args.output/'manifest.json', m)
    print(json.dumps(provenance, indent=2), flush=True)
    print('Manifest', sha(args.output/'manifest.json'), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('base', 'registry', 'output'):
        parser.add_argument('--'+name, type=Path, required=True)
    main(parser.parse_args())
