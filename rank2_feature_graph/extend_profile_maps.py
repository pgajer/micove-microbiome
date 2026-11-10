"""Estimate unidentified queries and place them in frozen profile maps.

Stages: prepare, extend, package. R computes face-aware smoothing between the
first two stages. Existing profiles, coordinates, clusters and scales are immutable.
"""
import argparse
import base64
from collections import Counter
import hashlib
import json
from pathlib import Path
import platform
import shutil
import sys

import numpy as np
import scipy
from scipy.optimize import least_squares
from scipy.spatial.distance import cdist, pdist


POLICY = ('Queries without subject IDs use the frozen identified reference people. '
          'Their own participant cannot reliably be excluded; these are descriptive '
          'estimates, not participant-excluded or cross-validated predictions. '
          'Queries never enter the smoothing or percentile reference.')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dump(path, value):
    Path(path).write_text(json.dumps(value, separators=(',', ':'), allow_nan=False)+'\n')


def read(path):
    return json.loads(Path(path).read_text())


def matrix_hash(x):
    return hashlib.sha256(np.asarray(x, dtype='<f8').tobytes()).hexdigest()


def checked(base, descriptor):
    p = base/descriptor['file']
    assert p.stat().st_size == descriptor['bytes'] and sha(p) == descriptor['sha256']
    return read(p)


def nearest_people(order, groups, query_group=-1, answers=None, k=40):
    chosen, seen = [], set()
    for j in order:
        g = groups[j]
        if g < 0 or g == query_group or g in seen or (answers is not None and not np.isfinite(answers[j])):
            continue
        seen.add(g)
        chosen.append(j)
        if len(chosen) == k:
            return np.array(chosen)
    raise ValueError('Insufficient answering reference participants')


def midpoint_percentiles(reference, queries, groups):
    """Weighted mid-CDF against the reference only, including exact ties."""
    counts = Counter(groups)
    weights = np.array([1/counts[g] for g in groups])
    order = np.argsort(reference, kind='stable')
    values, starts = np.unique(reference[order], return_index=True)
    masses = np.add.reduceat(weights[order], starts)
    cumulative = np.r_[0., np.cumsum(masses)]
    lo = np.searchsorted(values, queries, side='left')
    hi = np.searchsorted(values, queries, side='right')
    return 100*(cumulative[lo]+cumulative[hi])/(2*len(counts))


def weighted_median(values, weights):
    order = np.argsort(values, kind='stable')
    w = weights[order]
    mass, half = np.cumsum(w), sum(w)/2
    tolerance = 64*np.finfo(float).eps*sum(w)
    i = int(np.flatnonzero(mass >= half-tolerance)[0])
    if abs(mass[i]-half) <= tolerance and i+1 < len(order):
        return (values[order[i]]+values[order[i+1]])/2
    return values[order[i]]


def cluster_scores(percentiles, snapshot, fields, weighting):
    result = []
    for c in snapshot['clusters']:
        members = c['members']
        values = percentiles[:, members]
        if weighting == 'features':
            result.append(np.median(values, axis=1))
        else:
            counts = Counter(fields[j]['categoryId'] for j in members)
            weights = np.array([1/(len(counts)*counts[fields[j]['categoryId']]) for j in members])
            result.append(np.array([weighted_median(row, weights) for row in values]))
    return np.array(result).T


def supplementary_position(targets, fixed):
    """Minimize all positive reference-pair squared relative errors in three variables.

    This is supplementary placement, not a refit of metric MDS. Each query is
    independent; no reference coordinate is an optimization variable.
    """
    positive = targets > 0
    d, z = targets[positive], fixed[positive]
    zero = fixed[~positive]
    if len(zero):
        if not np.all(zero == zero[0]):
            raise ValueError('Identical target profiles have inconsistent fixed coordinates')
        point = zero[0].copy()
        return point, dict(method='exact duplicate', success=True, starts=0,
                           relativeRms=float(np.sqrt(np.mean((np.linalg.norm(z-point, axis=1)/d-1)**2))))
    def residual(x):
        return np.linalg.norm(x-z, axis=1)/d-1
    def jacobian(x):
        delta = x-z
        return delta/np.maximum(np.linalg.norm(delta, axis=1), 1e-15)[:, None]/d[:, None]
    nearest = np.argsort(d, kind='stable')[:3]
    # Linearized trilateration plus local and global deterministic starts.
    a = 2*(z[1:]-z[0])
    b = np.sum(z[1:]**2, axis=1)-np.sum(z[0]**2)-d[1:]**2+d[0]**2
    linear = np.linalg.lstsq(a, b, rcond=None)[0]
    starts = [linear, np.average(z, axis=0, weights=1/d**2), z.mean(axis=0)]
    starts.extend(z[j] for j in nearest)
    fits = [least_squares(residual, x, jac=jacobian, method='trf',
                          ftol=1e-11, xtol=1e-11, gtol=1e-11, max_nfev=2000) for x in starts]
    best = min(fits, key=lambda r: np.sum(r.fun**2))
    assert best.success and np.isfinite(best.x).all()
    return best.x, dict(method='fixed-reference relative-distance least squares', success=bool(best.success),
        starts=len(starts), relativeRms=float(np.sqrt(np.mean(best.fun**2))),
        nearestReferenceRms=float(np.sqrt(np.mean(residual(z[nearest[0]])**2))),
        evaluations=int(best.nfev), optimality=float(best.optimality), message=best.message)


def evaluate(profiles, coordinates, metric):
    targets = pdist(profiles, metric=metric)
    embedded = pdist(coordinates)
    positive = targets > 0
    error = embedded[positive]/targets[positive]-1
    return dict(relativeRms=float(np.sqrt(np.mean(error**2))), pairs=int(positive.sum()),
        zeroPairs=int((~positive).sum()), profiles=len(profiles), sampled=False,
        normalizedRms=float(np.sqrt(np.sum((embedded-targets)**2)/np.sum(targets**2))),
        maximumRelativeError=float(np.max(np.abs(error))))


def prepare(args):
    args.run.mkdir(parents=True, exist_ok=False)
    m = read(args.base/'manifest.json')
    a = np.load(args.registry/'targets.npz')
    ids = checked(args.base, m['sampleOrder'])['sampleIds']
    assert list(a['ids']) == ids
    records = np.flatnonzero(a['groups'] >= 0)
    queries = np.flatnonzero(a['groups'] < 0)
    assert len(records) == 1965 and len(queries) == 26
    priority = sorted(range(len(ids)), key=lambda j: (hashlib.sha256(('nearest-cases-v1|'+ids[j]).encode()).hexdigest(), ids[j]))
    checks = records[np.linspace(0, len(records)-1, 8, dtype=int)]
    a['X'].astype('<f8').tofile(args.run/'abundances.bin')
    dump(args.run/'input.json', dict(sourceManifestSha256=sha(args.base/'manifest.json'),
        targetsSha256=sha(args.registry/'targets.npz'), targetDefinitionsSha256=sha(args.registry/'targets.json'),
        matrixSha256=sha(args.run/'abundances.bin'), rows=len(ids), columns=a['X'].shape[1],
        referenceRecords=records.tolist(), queryRecords=queries.tolist(), checkRecords=checks.tolist(),
        participantGroups=a['groups'].tolist(), tiePriority=priority, policy=POLICY,
        resources=dict(workers=1, memoryGiB=4), existingCoordinates='fixed, exact preservation'))


def extend(args):
    inp, m = read(args.run/'input.json'), read(args.base/'manifest.json')
    assert inp['sourceManifestSha256'] == sha(args.base/'manifest.json')
    assert inp['targetsSha256'] == sha(args.registry/'targets.npz')
    assert inp['targetDefinitionsSha256'] == sha(args.registry/'targets.json')
    a = np.load(args.registry/'targets.npz')
    fields = m['correlations']['fields']
    targets = {(t['featureId'], t['transformationId']): t for t in read(args.registry/'targets.json')}
    selection = checked(args.base, next(d for d in m['correlations']['selectionInputs']['banks'] if d['k'] == 40))
    reference = np.array(inp['referenceRecords'])
    queries = np.array(inp['queryRecords'])
    checks = np.array(inp['checkRecords'])
    chosen = np.r_[queries, checks]
    assert list(reference) == selection['recordIndices']
    yref = np.frombuffer(base64.b64decode(selection['valuesBase64']), dtype='<f8').reshape(len(fields), -1).T
    distances = cdist(a['X'][chosen], a['X'])
    priority = np.array(inp['tiePriority'])
    orders = priority[np.argsort(distances[:, priority], axis=1, kind='stable')]
    values, groups = a['values'], a['groups']
    estimates = np.zeros((len(chosen), len(fields)))
    for f, field in enumerate(fields):
        target = targets[(field['featureId'], field['transformationId'])]
        assert target['scope'] == 'global' and target['anchorExcluded'] is None
        y = values[:, target['index']]
        for row, query in enumerate(chosen):
            neighbors = nearest_people(orders[row], groups, groups[query], y)
            # Preserve the native scanner's ordered, sequential double summation.
            estimates[row, f] = sum(float(y[j]) for j in neighbors)/40
    checkpos = np.searchsorted(reference, checks)
    delta = float(np.max(np.abs(estimates[len(queries):]-yref[checkpos])))
    assert delta < 1e-12, ('Known-record estimator reproduction failed', delta)
    percentiles = np.array([midpoint_percentiles(yref[:, f], estimates[:, f], selection['participantGroups']) for f in range(len(fields))]).T
    frozen_ranks = np.array([midpoint_percentiles(yref[:, f], yref[checkpos, f], selection['participantGroups']) for f in range(len(fields))]).T
    assert np.allclose(percentiles[len(queries):], frozen_ranks, atol=1e-9)
    selection['queryRecords'] = queries.tolist()
    selection['queryValuesBase64'] = base64.b64encode(estimates[:len(queries)].T.astype('<f8').tobytes()).decode()
    selection['queryPolicy'] = POLICY
    dump(args.run/'selection-40.json', selection)
    smooth = read(args.run/'query-smoothing.json')
    assert smooth['records'] == chosen.tolist() and smooth['inputSha256'] == sha(args.run/'input.json')
    report = dict(passed=True, records=len(reference), queries=len(queries), estimatorCheckMaximumDifference=delta,
        sourceManifestSha256=inp['sourceManifestSha256'], policy=POLICY, fits={},
        runtime=dict(python=sys.version, numpy=np.__version__, scipy=scipy.__version__, platform=platform.platform()),
        sourceSha256=sha(__file__), smoothingSha256=sha(args.run/'query-smoothing.json'))
    for descriptor in m['profileEmbeddings']+m['smoothedEmbeddings']:
        old = checked(args.base, descriptor)
        assert old['recordIndices'] == reference.tolist()
        fixed, saved = np.array(old['coordinates']), np.array(old['profileScores'])
        is_smooth = old['format'] == 'micove-smoothed-phylotype-embedding'
        if is_smooth:
            variant = 'l1' if old['normalization'] == 'l1' else 'maxPost' if old['postMaxNormalization'] else 'maxRaw'
            scores = np.array(smooth[variant])
        else:
            scores = cluster_scores(percentiles, old['snapshot'], fields, old['weighting'])
        reproduction = float(np.max(np.abs(scores[len(queries):]-saved[checkpos])))
        assert reproduction < 1e-9, (old['id'], reproduction)
        new_scores = scores[:len(queries)]
        metric = 'chebyshev' if old.get('targetMetric') == 'linf' else 'euclidean'
        distances = cdist(new_scores, saved, metric=metric)
        positions, diagnostics = [], []
        for query, d in zip(queries, distances):
            point, diagnostic = supplementary_position(d, fixed)
            positions.append(point)
            diagnostics.append(dict(record=int(query), specimen=str(a['ids'][query]), **diagnostic))
        coordinates = np.vstack([fixed, positions])
        profiles = np.vstack([saved, new_scores])
        original_evaluation = evaluate(saved, fixed, metric)
        assert abs(original_evaluation['relativeRms']-old['evaluation']['relativeRms']) < 1e-9
        evaluation = evaluate(profiles, coordinates, metric)
        finite = distances > 0
        cross = cdist(positions, fixed)[finite]/distances[finite]-1
        assert np.array_equal(coordinates[:len(reference)], fixed)
        result = dict(old)
        result.update(recordIndices=np.r_[reference, queries].tolist(), coordinates=coordinates.tolist(),
            profileScores=profiles.tolist(), excludedRecords=0, evaluation=evaluation,
            supplementary=dict(version=1, recordIndices=queries.tolist(), referenceRecords=reference.tolist(),
                policy=POLICY, parentSha256=descriptor['sha256'], originalEvaluation=old['evaluation'],
                originalCoordinatesSha256=matrix_hash(fixed), originalProfilesSha256=matrix_hash(saved),
                extendedProfilesSha256=matrix_hash(profiles), method='fixed-reference relative-distance least squares',
                targetPairs='Each new query to every frozen reference visit; new-query pairs evaluated, not fitted.',
                referencePairRelativeRms=float(np.sqrt(np.mean(cross**2))), diagnostics=diagnostics,
                placementSettings=dict(starts=6, maxEvaluations=2000, tolerance=1e-11, implementation='scipy.optimize.least_squares; trf; analytic Jacobian'),
                sourceManifestSha256=inp['sourceManifestSha256'], smoothingSha256=report['smoothingSha256']))
        dest = args.run/descriptor['file']
        dest.parent.mkdir(parents=True, exist_ok=True)
        dump(dest, result)
        report['fits'][old['id']] = dict(file=descriptor['file'], sha256=sha(dest),
            profilesReproducedMaximumDifference=reproduction, originalEvaluation=original_evaluation,
            evaluation=evaluation, queryReferenceRelativeRms=result['supplementary']['referencePairRelativeRms'],
            existingCoordinatesUnchanged=True, existingProfilesUnchanged=True)
        print(old['id'], evaluation['relativeRms'], 'query-reference', result['supplementary']['referencePairRelativeRms'], flush=True)
    dump(args.run/'validation.json', report)


def package(args):
    audit = read(args.run/'validation.json')
    assert audit['passed'] and audit['sourceManifestSha256'] == sha(args.base/'manifest.json')
    shutil.copytree(args.base, args.output)  # Fails rather than overwriting a release.
    m = read(args.output/'manifest.json')
    for d in m['profileEmbeddings']+m['smoothedEmbeddings']:
        source = args.run/d['file']
        assert sha(source) == audit['fits'][d['id']]['sha256']
        shutil.copyfile(source, args.output/d['file'])
        d.update(sha256=sha(source), bytes=source.stat().st_size)
    descriptor = next(d for d in m['correlations']['selectionInputs']['banks'] if d['k'] == 40)
    shutil.copyfile(args.run/'selection-40.json', args.output/descriptor['file'])
    descriptor.update(sha256=sha(args.output/descriptor['file']), bytes=(args.output/descriptor['file']).stat().st_size)
    doc = args.output/'documentation/supplementary-profiles.md'
    shutil.copyfile(Path(__file__).with_name('SUPPLEMENTARY_PROFILES.md'), doc)
    m['documentation'].append(dict(id='supplementary-profiles', label='Specimens without participant identity',
        file=str(doc.relative_to(args.output)), sha256=sha(doc), bytes=doc.stat().st_size))
    for identifier, name in [('joint-profile-methods', 'JOINT_PROFILE_EMBEDDING.md'),
                             ('smoothed-phylotypes', 'SMOOTHED_PHYLOTYPES.md')]:
        d = next(d for d in m['documentation'] if d['id'] == identifier)
        dest = args.output/d['file']
        shutil.copyfile(Path(__file__).with_name(name), dest)
        d.update(sha256=sha(dest), bytes=dest.stat().st_size)
    m['supplementaryProfileProvenance'] = dict(parentSha256=sha(args.base/'manifest.json'),
        queries=26, policy=POLICY, validationSha256=sha(args.run/'validation.json'),
        inputSha256=sha(args.run/'input.json'), sources={n:sha(Path(__file__).with_name(n)) for n in
            ['extend_profile_maps.py', 'smooth_profile_queries.R']})
    shutil.copyfile(args.run/'validation.json', args.output/'supplementary-validation.json')
    (args.output/'validation.json').rename(args.output/('base-validation-'+sha(args.base/'manifest.json')[:12]+'.json'))
    dump(args.output/'manifest.json', m)
    print('Packaged', sha(args.output/'manifest.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['prepare', 'extend', 'package'])
    for name in ['base', 'registry', 'run']:
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    globals()[args.stage](args)
