"""Validate state-local correlations against independent NumPy calculations.

Pilot: three largest merged 60%-2-CSTs, all saved K/method/visit combinations.
Expansion: every state and coverage, K=40 Spearman in both visit modes. Other
settings remain available on demand through the same pilot-validated worker.
Existing estimates, memberships and embeddings are read-only.
"""
import argparse
import base64
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

import numpy as np


def read(p):
    return json.loads(Path(p).read_text())


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def write(p, data):
    Path(p).write_text(json.dumps(data, indent=2, allow_nan=False)+'\n')


def reference(input_data, selected, unit, method, excluded):
    positions = {r: i for i, r in enumerate(input_data['recordIndices'])}
    records = sorted(set(selected).intersection(positions))
    rows = np.array([positions[r] for r in records], dtype=int)
    groups = np.array(input_data['participantGroups'])[rows]
    people, inverse, counts = np.unique(groups, return_inverse=True, return_counts=True)
    info = dict(selectedRecords=records, records=len(rows), participants=len(people), featureIndices=[])
    if len(people) < 3:
        return info, np.empty(0)
    width = len(input_data['recordIndices'])
    x = np.frombuffer(base64.b64decode(input_data['valuesBase64']), dtype='<f8').reshape(-1, width)[:, rows].T
    if unit == 'participants':
        means = np.zeros((len(people), x.shape[1]))
        np.add.at(means, inverse, x)
        x = means/counts[:, None]
        weights = np.ones(len(people))
    else:
        weights = 1/counts[inverse]
    scale = np.max(np.abs(x), axis=0)
    keep = (np.ptp(x, axis=0) > 32*np.finfo(float).eps*scale)
    for i in excluded:
        keep[i] = False
    indices = np.flatnonzero(keep)
    x, scale = x[:, keep].copy(), scale[keep]
    if method == 'spearman':
        for j in range(x.shape[1]):
            order = np.argsort(x[:, j], kind='stable')
            values, starts = np.unique(x[order, j], return_index=True)
            mass = np.add.reduceat(weights[order], starts)
            ranks = (np.cumsum(mass)-mass/2)/weights.sum()
            x[:, j] = ranks[np.searchsorted(values, x[:, j])]
    else:
        x /= scale
    weights /= weights.sum()
    centered = x-(weights[:, None]*x).sum(axis=0)
    z = centered*np.sqrt(weights[:, None])
    z /= np.sqrt((z*z).sum(axis=0))
    matrix = np.clip(z.T@z, -1, 1)
    info['featureIndices'] = indices.tolist()
    return info, matrix[np.triu_indices(len(indices), 1)]


def main(args):
    assert not args.output.exists(), 'Preserve prior validation evidence.'
    args.output.mkdir(parents=True)
    manifest = read(args.catalogue/'manifest.json')
    asset = read(args.dataset_asset)
    bundle = next(b for b in asset['bundles'] if b['dataset']['id'] == manifest['datasetId'])
    analysis = bundle['cohortAnalysis']
    assert [r['id'] for r in analysis['records']] == read(args.catalogue/manifest['sampleOrder']['file'])['sampleIds']
    names = {str(n['id']): n['label'] for n in bundle['data']['graphs']['100']['nodes']}
    states = []
    for q, merged in analysis['merged'].items():
        spec = analysis['specs']['all|merged|'+q]
        memberships = {s: [] for s in spec['states']}
        for i in spec['population']:
            memberships[merged['pairs'][analysis['records'][i]['profile']]].append(i)
        assert sum(map(len, memberships.values())) == len(spec['population'])
        for edge, records in memberships.items():
            # Independent check against the saved fitting membership.
            assert sorted(records) == sorted(analysis['fits'][spec['states'][edge]]['indices'])
            states.append(dict(coverage=int(q), edge=edge, label=' + '.join(names[j] for j in edge.split(',')), recordIndices=records))
    all_states = states
    if args.phase == 'pilot':
        states = sorted([s for s in states if s['coverage'] == 60], key=lambda s: -len(s['recordIndices']))[:3]
        settings = [(k, u, m) for k in (10, 20, 40, 80) for u in ('visits', 'participants') for m in ('spearman', 'pearson')]
    else:
        assert read(args.pilot/'summary.json')['passed'], 'The pilot must pass before expansion.'
        settings = [(40, u, 'spearman') for u in ('visits', 'participants')]
    source_files = [Path(__file__), Path(__file__).with_suffix('.mjs'),
                    Path(__file__).with_name('estimate_correlation_compute.js'),
                    Path(__file__).with_name('estimate_correlation_clustering.js')]
    provenance = dict(phase=args.phase, catalogueSha256=sha(args.catalogue/'manifest.json'),
        datasetAssetSha256=sha(args.dataset_asset), sources={p.name: sha(p) for p in source_files},
        workers=1, memoryBudgetGiB=4, numpy=np.__version__, node=subprocess.check_output(['node','--version'],text=True).strip(),
        frozenEstimates=True, membershipsValidatedAgainstSavedFits=True, embeddingsRefitted=False,
        settings=settings, coverageInventory=dict(Counter(s['coverage'] for s in all_states)))
    write(args.output/'plan.json', provenance)
    excluded_ids = {f['featureId'] for f in manifest['correlations']['exclusionPolicy']['excluded']}
    excluded = [i for i, f in enumerate(manifest['correlations']['fields']) if f['featureId'] in excluded_ids]
    inputs, cache, results = {}, {}, []
    child = subprocess.Popen(['node','--max-old-space-size=2048',str(Path(__file__).with_suffix('.mjs')),str(args.catalogue)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        for state in states:
            for k, unit, method in settings:
                key = json.dumps([state['recordIndices'], k, unit, method])
                digest = hashlib.sha256(key.encode()).hexdigest()[:16]
                if key not in cache:
                    if k not in inputs:
                        d = next(d for d in manifest['correlations']['selectionInputs']['banks'] if d['k'] == k)
                        assert sha(args.catalogue/d['file']) == d['sha256']
                        inputs[k] = read(args.catalogue/d['file'])
                    start = time.monotonic()
                    expected, correlations = reference(inputs[k], state['recordIndices'], unit, method, excluded)
                    binary = args.output/(digest+'.f64')
                    job = dict(k=k, unit=unit, method=method, records=state['recordIndices'], binary=str(binary))
                    child.stdin.write(json.dumps(job)+'\n');child.stdin.flush()
                    result = json.loads(child.stdout.readline())
                    assert 'error' not in result, result
                    for field in ('records','participants','selectedRecords','featureIndices'):
                        assert result[field] == expected[field], (state, field)
                    actual = np.fromfile(binary, dtype='<f8')
                    assert actual.shape == correlations.shape
                    error = float(np.max(np.abs(actual-correlations))) if len(actual) else 0.
                    assert error < 1e-10, (state['edge'], k, unit, method, error)
                    assert bool(result.get('issue')) == (expected['participants'] < 3)
                    cache[key] = dict(checkId=digest, **expected, supported=not bool(result.get('issue')), issue=result.get('issue'),
                        maximumAbsoluteDifference=error, clusters=result['clusterCounts'], omittedRecords=len(state['recordIndices'])-expected['records'],
                        seconds=time.monotonic()-start, binarySha256=sha(binary))
                    write(args.output/(digest+'.json'), cache[key])
                results.append({**state, 'k':k,'unit':unit,'method':method,**cache[key]})
            print(args.phase, state['coverage'], state['edge'], len(state['recordIndices']), 'checked', flush=True)
        child.stdin.close();assert child.wait() == 0
    finally:
        if child.poll() is None:
            child.terminate();child.wait()
    summary = dict(passed=True, **provenance, states=len(states), comparisons=len(results), uniqueCalculations=len(cache),
        reusedCalculations=len(results)-len(cache), maximumAbsoluteDifference=max(r['maximumAbsoluteDifference'] for r in results),
        supportedStates=len({(r['coverage'],r['edge']) for r in results if r['supported']}),
        unsupportedStates=len({(r['coverage'],r['edge']) for r in results if not r['supported']}),
        smallSupportedStates=len({(r['coverage'],r['edge']) for r in results if r['supported'] and r['participants'] < 20}))
    write(args.output/'results.json', results);write(args.output/'summary.json', summary)
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('catalogue','dataset-asset','output'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--phase', choices=['pilot','all'], required=True)
    parser.add_argument('--pilot', type=Path)
    main(parser.parse_args())
