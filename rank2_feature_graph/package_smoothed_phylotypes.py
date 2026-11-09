"""Append checked smoothed-phylotype maps to a new estimate supplement."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


VARIANTS = ['l1-euclidean', 'max-raw-euclidean', 'max-post-euclidean', 'max-raw-linf', 'max-post-linf']


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--validation', type=Path, required=True,
                        help='Independent all-pairs and smoothing audit receipt for this run')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Preserve existing supplements; choose a new output directory')
    manifest = json.loads((args.base/'manifest.json').read_text())
    inp = json.loads((args.run/'input.json').read_text())
    audit = json.loads(args.validation.read_text())
    assert audit.get('passed') is True and audit['rows'] == inp['rows']
    assert audit['phylotypes'] == inp['columns']
    assert inp['sourceManifestSha256'] == sha(args.base/'manifest.json')
    shutil.copytree(args.base, args.output)
    outputs = []
    for variant in VARIANTS:
        source = args.run/variant/'embedding.json'
        data = json.loads(source.read_text())
        assert audit['fits'][variant]['embeddingSha256'] == sha(source)
        assert data['variant'] == variant and data['recordIndices'] == inp['recordIndices']
        assert data['datasetId'] == manifest['datasetId'] and data['sampleOrderSha256'] == manifest['sampleOrderSha256']
        dest = args.output/'smoothed-embeddings'/source.parent.name/'embedding.json'
        dest.parent.mkdir(parents=True, exist_ok=False)
        shutil.copyfile(source, dest)
        norm = 'L1' if data['normalization'] == 'l1' else 'Max'
        metric = 'L∞' if data['targetMetric'] == 'linf' else 'Euclidean'
        post = '' if norm == 'L1' else ' · '+('Post-normalized' if data['postMaxNormalization'] else 'No post-normalization')
        outputs.append(dict(id=data['id'], label=f'Smoothed phylotypes · K40 · {norm} · {metric}{post}',
                            file=str(dest.relative_to(args.output)), sha256=sha(dest), bytes=dest.stat().st_size))
    manifest['smoothedEmbeddings'] = manifest.get('smoothedEmbeddings', []) + outputs
    doc = args.output/'documentation/smoothed-phylotypes.md'
    shutil.copyfile(Path(__file__).with_name('SMOOTHED_PHYLOTYPES.md'), doc)
    manifest['documentation'].append(dict(id='smoothed-phylotypes', label='Smoothed phylotype representations',
        file=str(doc.relative_to(args.output)), sha256=sha(doc), bytes=doc.stat().st_size))
    manifest['smoothedPhylotypeProvenance'] = dict(inputSha256=sha(args.run/'input.json'),
        sourceManifestSha256=sha(args.base/'manifest.json'), smoothingSha256=sha(args.run/'smoothing.json'),
        sourceTargetsSha256=inp['sourceTargetsSha256'], K=40, filtering='none', variants=VARIANTS,
        participantPolicy='One nearest visit per other participant; equal weights; exclude the entire query participant.',
        maxNeighborMetric='dgraphs intrinsic Euclidean shortest paths on max-normalized faces, including intermediate faces.',
        tiePolicy='Distance then SHA256(nearest-cases-v1|specimen ID), then specimen ID.',
        summationOrder='Frozen source record order; identical neighbor sets produce identical averages.',
        validationSha256=sha(args.validation),
        producerSha256={name: sha(Path(__file__).with_name(name)) for name in
            ['prepare_smoothed_phylotypes.py', 'fit_smoothed_phylotypes.R', 'package_smoothed_phylotypes.py']})
    shutil.copyfile(args.validation, args.output/'smoothed-validation.json')
    (args.output/'validation.json').rename(args.output/('base-validation-'+sha(args.base/'manifest.json')[:12]+'.json'))
    (args.output/'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'), allow_nan=False)+'\n')
    print(sha(args.output/'manifest.json'))


if __name__ == '__main__':
    main()
