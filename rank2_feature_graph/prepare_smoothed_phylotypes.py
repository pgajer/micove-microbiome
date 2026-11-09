"""Freeze inputs for participant-excluded, K=40 phylotype smoothing.

The registry and scientific catalogue are distributed separately from source.
This producer never replaces an existing run or changes source populations.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalogue', type=Path, required=True)
    parser.add_argument('--registry', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    m = json.loads((args.catalogue/'manifest.json').read_text())
    assert sha(args.registry/'targets.npz') == m['displayReference']['sourceTargetsSha256']
    z = np.load(args.registry/'targets.npz')
    ids = z['ids'].astype(str)
    assert json.loads((args.catalogue/m['sampleOrder']['file']).read_text())['sampleIds'] == ids.tolist()
    records = np.flatnonzero(z['groups'] >= 0)
    X = z['X'][records]
    assert np.isfinite(X).all() and (X >= 0).all()
    assert np.allclose(X.sum(axis=1), 1, rtol=0, atol=1e-12)
    features = sorted((f for f in m['features'] if f['categoryId'] == 'phylotypes'), key=lambda f: f['featureIndex'])
    assert [f['sourceName'] for f in features] == z['feature_names'].tolist()
    args.output.mkdir(parents=True, exist_ok=False)
    X.astype('<f8').tofile(args.output/'abundances.bin')
    priority = sorted(range(len(records)), key=lambda j: (hashlib.sha256(('nearest-cases-v1|'+ids[records[j]]).encode()).hexdigest(), ids[records[j]]))
    data = dict(format='micove-smoothed-phylotype-input', version=1, datasetId=m['datasetId'],
                catalogueRevision=m['revision'], sampleOrderSha256=m['sampleOrderSha256'],
                sourceManifestSha256=sha(args.catalogue/'manifest.json'), sourceTargetsSha256=sha(args.registry/'targets.npz'),
                sampleCount=len(ids), recordIndices=records.tolist(), recordIds=ids[records].tolist(),
                participantGroups=z['groups'][records].tolist(), participants=len(set(z['groups'][records].tolist())),
                featureIds=[f['id'] for f in features], featureNames=z['feature_names'].tolist(),
                rows=len(records), columns=X.shape[1], matrixSha256=sha(args.output/'abundances.bin'),
                tiePriority=priority, K=40, filtering='none', scriptSha256=sha(__file__))
    (args.output/'input.json').write_text(json.dumps(data, indent=2)+'\n')
    print(json.dumps({k:data[k] for k in ('rows','columns','participants','matrixSha256')}))


if __name__ == '__main__':
    main()
