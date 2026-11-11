"""Package and attach reviewed mean-based CAG maps; never fit or change inputs."""
import argparse
import csv
import gzip
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile

import portable as p

ID = 'comb-mg'
REVISION = 'disjoint-cag-means-20261111'
SOURCE_PIN = '4fe7a9791a1d1e1f0bb59cad98488043422f1db8656691f73e8398b9de7533af'
CAPABILITY = 'cag-population-v1'


def sha_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def table(path):
    with Path(path).open(newline='') as f:
        return list(csv.DictReader(f, delimiter='\t'))


def unique(rows, key):
    ids = [row[key] for row in rows]
    require(all(ids) and len(ids) == len(set(ids)), 'Empty or duplicate ' + key)
    return ids


def checked(path, expected):
    require(sha_file(path) == expected, 'Changed scientific asset: ' + str(path))


def map_key(row):
    return '|'.join(row[k] for k in ('dataset', 'construction', 'representation', 'normalization', 'target_metric'))


def prepare(source, output):
    """Serial bounded conversion of saved maps/tables to lazy HTTP assets."""
    import numpy as np
    source, output = Path(source).resolve(), Path(output).resolve()
    require(not output.exists(), 'Choose a new output directory; existing packages are preserved')
    checked(source / 'micove_assets.json', SOURCE_PIN)
    contract = json.loads((source / 'micove_assets.json').read_text())
    gate = json.loads((source / 'publication_verification.json').read_text())
    complete = json.loads((source / 'mds_complete.json').read_text())
    require(gate['passed'] is True and complete['verified'] is True and complete['fits'] == 54,
            'Scientific publication gate has not passed')
    for name, sha in gate['files'].items():
        checked(source / name, sha)
    rows = contract['maps']
    keys = {map_key(r) for r in rows}
    expected = {'|'.join(x + y) for x in itertools.product(['3.5k', '4k'], ['AZ', 'ESZ', 'JPO'],
                ['mean', 'length_cag', 'length_other']) for y in [('l1', 'euclidean'), ('max', 'euclidean'), ('max', 'linf')]}
    require(len(rows) == 54 and keys == expected and len(table(source / 'map_index.tsv')) == 54
            and len(table(source / 'table_index.tsv')) == 36, 'Incomplete selector grid')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='comb-mg-', dir=output.parent) as tmp:
        root = Path(tmp) / 'package'; root.mkdir(); (root / 'vme-assets').mkdir()
        descriptors = {}
        def publish(raw, suffix):
            digest = p.sha(raw); url = '/vme-assets/' + digest + suffix
            dest = root / url.lstrip('/')
            if not dest.exists(): dest.write_bytes(raw)
            desc = dict(url=url, sha256=digest, bytes=len(raw)); descriptors[url] = desc
            return desc
        def js(value): return publish(p.encoded(value), '.json')
        data = dict(id=ID, revision=REVISION, title='Combined metagenomes · CAG compositions',
                    sourceContractSha256=SOURCE_PIN, default=contract['default'], maps={}, tables={}, samples={},
                    capabilities=dict(taxonCST=False, valencia=False, trajectories=False, localFits=False,
                                      cagFeatures=True, sampleMetadata=True),
                    cautions=contract['cautions'] + [
                        'Exploratory CAG compositions, not organism, strain or cell proportions.',
                        'Identity and individual body-site holds remain. Inferred links are not confirmed identities.',
                        'No confirmed visit order: participant trajectories are unavailable.',
                        'The 31 flagged L. iners-assigned genes remain present; their annotation is unresolved.',
                        'All maps used 200 SGD epochs, not continuations of older sum-based maps; none certified convergence.'])
        populations = {}; verified = []
        for r in rows:
            key = map_key(r); tkey = '|'.join(key.split('|')[:-1])
            folder = Path(r['samples_tsv']).parent
            receipt = json.loads((folder / 'complete.json').read_text())
            require(receipt['verified'] is True, 'Unverified abundance table')
            if tkey not in data['tables']:
                for field in ['samples_tsv', 'features_tsv', 'abundance_npy', 'abundance_tsv']:
                    file = Path(r[field]); checked(file, receipt['files'][str(file.relative_to(folder))])
                inp_path = Path(r['abundance_npy']).parent / 'input.json'
                checked(inp_path, receipt['files'][str(inp_path.relative_to(folder))])
                inp = json.loads(inp_path.read_text())
                records = table(r['samples_tsv']); features = table(r['features_tsv'])
                ids = unique(records, 'sample_id'); unique(records, 'record_id'); unique(features, 'feature')
                require(len(records) == r['samples'] and len(features) == r['features'], 'Axes/count mismatch')
                # column_0based is the parent catalogue column: CAG-only tables
                # retain gaps left by residual categories. Use the actual axis.
                with gzip.open(r['abundance_tsv'], 'rt') as f:
                    header = next(csv.reader(f, delimiter='\t'))
                require(header == ['sample_id'] + [f['feature'] for f in features], 'Feature order mismatch')
                groups = {g: sum(x['exploratory_group'] == g for x in records) for g in contract['samples'][r['dataset']]}
                require(groups == contract['samples'][r['dataset']], 'Exploratory labels changed')
                require(all(not x['visit_id'] for x in records), 'New visit semantics require review')
                require(not any(x['sample_role'] in ['laboratory_control', 'control', 'empty_well'] for x in records), 'Laboratory control in map')
                if r['dataset'] in populations:
                    require(records == populations[r['dataset']], 'Population metadata differs between maps')
                else:
                    populations[r['dataset']] = records; data['samples'][r['dataset']] = js(records)
                a = np.load(r['abundance_npy'], mmap_mode='r', allow_pickle=False)
                require(a.shape == (r['samples'], r['features']) and np.isfinite(a).all() and (a >= 0).all(), 'Invalid abundance array')
                sums = a.sum(axis=1) if r['normalization'] == 'l1' else a.max(axis=1)
                require(np.allclose(sums, 1, rtol=0, atol=1e-10), 'Normalization mismatch')
                raw = np.asarray(a, dtype='<f8', order='C').tobytes()
                require(p.sha(raw) == inp['matrix_sha256'], 'Saved binary/order differs from array')
                # Stable feature order resolves display-only ties. No abundance changes.
                top = np.argsort(-a, axis=1, kind='stable')[:, :5]
                tops = [[[int(j), float(a[i,j])] for j in indices] for i, indices in enumerate(top)]
                data['tables'][tkey] = dict(samples=r['samples'], featureCount=r['features'],
                    features=js(features), top=js(tops), matrix=publish(gzip.compress(raw, compresslevel=1, mtime=0), '.f64.gz'),
                    matrixSha256=inp['matrix_sha256'], samplesSha256=inp['sample_sha256'], featuresSha256=inp['features_sha256'],
                    download=publish(Path(r['abundance_tsv']).read_bytes(), '.tsv.gz'))
                del raw, a, top
            coords = table(r['coordinates_tsv']); checked(r['coordinates_tsv'], r['coordinates_sha256'])
            require(unique(coords, 'sample_id') == [x['sample_id'] for x in populations[r['dataset']]], 'Coordinate ID order mismatch')
            require([x['exploratory_group'] for x in coords] == [x['exploratory_group'] for x in populations[r['dataset']]], 'Coordinate group mismatch')
            xyz = [[float(x[c]) for c in ['x','y','z']] for x in coords]
            require(all(math.isfinite(v) for x in xyz for v in x), 'Nonfinite coordinates')
            verification = json.loads(Path(r['verification_json']).read_text()); settings = json.loads(Path(r['settings_json']).read_text())
            require(verification['passed'] is True and verification['all_coordinate_pairs_evaluated'] is True
                    and verification['pairs'] == len(coords)*(len(coords)-1)//2, 'Invalid all-pairs verification')
            require(math.isclose(100*verification['rms_relative_error'], r['rms_relative_error_percent'], abs_tol=1e-10), 'Error unit mismatch')
            require(settings['backend'] == 'sgd' and settings['epochs'] == 200 and settings['embedding_metric'] == 'euclidean'
                    and settings['target_metric'] == r['target_metric'] and settings['normalization'] == r['normalization']
                    and settings['matrix_sha256'] == data['tables'][tkey]['matrixSha256'], 'Map settings mismatch')
            data['maps'][key] = dict(table=tkey, coordinates=js(xyz), rmsRelativeErrorPercent=r['rms_relative_error_percent'],
                bestEpoch=r['best_epoch'], converged=r['converged'], pairs=verification['pairs'], targetMetric=r['target_metric'],
                coordinateMetric='euclidean', settings=settings, coordinatesSha256=r['coordinates_sha256'])
            verified.append(dict(key=key, samples=len(coords), features=r['features'], exactIdOrder=True))
            print('Verified', key, flush=True)
        main = js({'combMgPopulation': data})
        entry = dict(capability=CAPABILITY, dataset=dict(id=ID,title=data['title'],revision=REVISION,
                     description='Exploratory frozen disjoint CAG compositions; identity and body-site holds retained.'),
                     parts=[main], resources=[d for d in descriptors.values() if d != main])
        (root / 'manifest.json').write_bytes(p.encoded(dict(format='micove-comb-mg-v1', sourceContractSha256=SOURCE_PIN, entry=entry)))
        (root / 'validation.json').write_bytes(p.encoded(dict(passed=True, maps=verified, tables=len(data['tables']),
            sourceContractSha256=SOURCE_PIN, scientificFitsRerun=False, coordinateValuesPreserved=True)))
        shutil.copy2(source / 'publication_verification.json', root / 'source-publication-verification.json')
        (root / 'README.txt').write_text('MiCOVE comb-mg: 54 frozen mean-based CAG maps. No fits run by the adapter.\nInstall with portable.py update --comb-mg PACKAGE; updates remember this package.\nKeep the entire folder together. Values are float64 little-endian row-major in gzip.\nSource metadata and scientific holds are preserved; this is exploratory, not a taxon or cell abundance release.\n')
        root.rename(output)
    return output


def package(directory):
    directory = Path(directory)
    m = json.loads((directory / 'manifest.json').read_text()); v = json.loads((directory / 'validation.json').read_text())
    require(m['format'] == 'micove-comb-mg-v1' and m['sourceContractSha256'] == SOURCE_PIN
            and v['passed'] is True and len(v['maps']) == 54 and v['tables'] == 36, 'Unreviewed/incomplete comb-mg package')
    require(m['entry']['capability'] == CAPABILITY and m['entry']['dataset']['id'] == ID
            and m['entry']['dataset']['revision'] == REVISION, 'comb-mg identity mismatch')
    for d in p.descriptors(m['entry']):
        f = p.asset_path(directory, d)
        require(f.stat().st_size == d['bytes'] and sha_file(f) == d['sha256'], 'Changed comb-mg asset: ' + str(f))
    return m['entry']


def viewer_bytes():
    # Reuse the authoritative shared cohort palette without initializing taxon/CST code.
    shared = (p.HERE/'valencia2.js').read_text().split('const sampleMajorCohortColors=', 1)[1].split('function sampleColorCategory', 1)[0]
    return b'(() => {\nconst sampleMajorCohortColors=' + shared.encode() + b'\n' + (p.HERE/'png_export.js').read_bytes() + b'\n' + (p.HERE/'agp_graph_picking.js').read_bytes() + b'\n' + (p.HERE/'comb_mg_population.js').read_bytes() + b'\n})();'


def attach(page, directory):
    page, directory = Path(page), Path(directory)
    entry = package(directory); manifest = p.read_manifest(page)
    require(manifest['datasets'].get(ID, entry) == entry, 'Conflicting installed comb-mg revision')
    for d in p.descriptors(entry):
        dest = p.asset_path(page.parent, d); dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            require(dest.stat().st_size == d['bytes'] and sha_file(dest) == d['sha256'], 'Conflicting HTTP asset')
        else:
            shutil.copy2(p.asset_path(directory, d), dest)
    def publish(raw):
        digest = p.sha(raw); d = dict(url='/vme-assets/'+digest+'.js', sha256=digest, bytes=len(raw))
        p.asset_path(page.parent, d).write_bytes(raw); return d
    manifest['combMgViewer'] = publish(viewer_bytes())
    loader = publish((p.HERE/'asset_loader.js').read_bytes())
    manifest['datasets'][ID] = entry
    allowed = manifest['seed'].get('distributionDatasets')
    if allowed is not None and ID not in allowed: allowed.append(ID)
    html, n = re.subn(p.PATTERN, lambda _: '<script id="vme-http-manifest" type="application/json">'+
        p.encoded(manifest).decode().replace('</','<\\/')+'</script>', page.read_text(), count=1, flags=re.S)
    require(n == 1, 'Missing HTTP manifest')
    html, n = re.subn(r'<script src="/vme-assets/[a-f0-9]{64}\.js"></script>', '<script src="'+loader['url']+'"></script>', html)
    require(n == 1, 'Ambiguous HTTP loader')
    with tempfile.NamedTemporaryFile('w', dir=page.parent, delete=False) as f: f.write(html)
    Path(f.name).replace(page)
    p.write_empty_view(manifest, page.parent/'empty.html', page.name.replace('.http.html','.html'))
    return p.sha(p.encoded([entry,manifest['combMgViewer'],loader]))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True); parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args(); prepare(args.source,args.output)
