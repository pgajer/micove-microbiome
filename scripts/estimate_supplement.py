"""Attach a reviewed estimate catalogue without changing samples or coordinates."""
import base64
import copy
import json
import os
from pathlib import Path
import re
import tempfile

import portable as p
from estimate_catalogue import STATUS_CODES, checked_file, load_catalogue, order_hash, read_json


# Scientific arrays and identifiers remain in separately distributed files.
REVIEWED = {
    '5284988f7e2a09561f091973304b74df2d222e34b63ff15e14995cc92d1d69f4': dict(
        datasetId='lsvf-v3v4-20241111', datasetRevision='bb8d80f0da6b30cb7877',
        analysisRevision='8932ed4151605b91d0cc', sampleCount=1991, featureCount=559,
        sampleOrderSha256='44d3f0200eed2a7653e642b312231f8b227ff40d15037f0d0d42fdfcc065c41c',
        featureOrderSha256='c2897169a41b5804c43ceece1748dda3687e262742859b7af2d13261d436371a',
        anchorOrderSha256={'pure-1cst': 'aed0320122624e52a18b1568df81010beaa882101ba8c29a1e5d68343359541a'},
        releaseStage='pilot'),
}

REVIEWED['ced1409d8633b388a1707432a6130938190e7de6e06a77fb4c606671ef24536b'] = {
    **REVIEWED['5284988f7e2a09561f091973304b74df2d222e34b63ff15e14995cc92d1d69f4'],
    'releaseStage': 'full',
}

REVIEWED['b697deea8ca3ab3bc961a876fb16940bdf0f726a9e77d2244f39fddc5b61cd3c'] = {
    **REVIEWED['ced1409d8633b388a1707432a6130938190e7de6e06a77fb4c606671ef24536b'],
}

REVIEWED['5d7678220f60043823b8f86a7d9d06408b46bf1cda6edfabd03afccf56a0423a'] = {
    **REVIEWED['b697deea8ca3ab3bc961a876fb16940bdf0f726a9e77d2244f39fddc5b61cd3c'],
}


REVIEWED['2f8636bef216a3921d7c2cd237f44fb2ab3a71e1fcf32f3c096e62b61fc0c267'] = {
    **REVIEWED['5d7678220f60043823b8f86a7d9d06408b46bf1cda6edfabd03afccf56a0423a'],
}


REVIEWED['7e27bc891b10f3b041b35495c3ca0f692592cd9782454f08f2234acef984044e'] = {
    **REVIEWED['2f8636bef216a3921d7c2cd237f44fb2ab3a71e1fcf32f3c096e62b61fc0c267'],
}


# Outcome exclusions and additive 38-profile map; original arrays preserved.
REVIEWED['fa6a6bcb0a73a8dce1de4f4eea654594e9447dbf761329b2e3964b40c09c98dc'] = {
    **REVIEWED['7e27bc891b10f3b041b35495c3ca0f692592cd9782454f08f2234acef984044e'],
}

# Additive equal-feature-group profile map; both previous maps and estimates retained.
REVIEWED['40d3c286b6e352e563583710aa6cef1b9d04fe6620cadcaef9b8e1cacf6df9e5'] = {
    **REVIEWED['fa6a6bcb0a73a8dce1de4f4eea654594e9447dbf761329b2e3964b40c09c98dc'],
}


# Additive k=40 response fields in the two frozen outcome-excluded profile spaces.
REVIEWED['2f946e1d084dacb7b6b6090ac1f16b692b4755623d7a9f46395840a8e50a09b0'] = {
    **REVIEWED['40d3c286b6e352e563583710aa6cef1b9d04fe6620cadcaef9b8e1cacf6df9e5'],
}


# Additional case counts reuse the original profile maps and k=40 fields.
REVIEWED['2489a580532a4b0eb7d6a9ac4ba5db7d01e2cd74d21e5c36aee7581d88f3a8e1'] = {
    **REVIEWED['2f946e1d084dacb7b6b6090ac1f16b692b4755623d7a9f46395840a8e50a09b0'],
}

# Five audited K=40 smoothed-phylotype maps; all previous fields/maps retained.
REVIEWED['e66b3982ee13ac39ee03107f5c6a48e45b4e76177ec27c7fee65d9cef3abbf7e'] = {
    **REVIEWED['2489a580532a4b0eb7d6a9ac4ba5db7d01e2cd74d21e5c36aee7581d88f3a8e1'],
}

# Query-only profiles and supplementary positions; all original coordinates fixed.
REVIEWED['5b0c8f4c48740780f5701d3844381291d2e647cb2eeaa71e91cb1badb61abeb6'] = {
    **REVIEWED['e66b3982ee13ac39ee03107f5c6a48e45b4e76177ec27c7fee65d9cef3abbf7e'],
}


def export_files(value):
    """Find shared transformation references as well as explicit file lists."""
    if isinstance(value, dict):
        if {'file', 'sha256', 'bytes'} <= value.keys():
            yield value
        for item in value.values():
            yield from export_files(item)
    elif isinstance(value, list):
        for item in value:
            yield from export_files(item)


def checked_catalogue(folder):
    folder = Path(folder)
    digest = p.sha((folder / 'manifest.json').read_bytes())
    expected = REVIEWED.get(digest)
    if expected is None:
        raise ValueError('Estimate catalogue has not been reviewed for this source version')
    manifest, summary = load_catalogue(folder, expected)
    receipt = read_json((folder / 'validation.json').read_bytes())
    if receipt.get('passed') is not True or receipt.get('manifestSha256') != digest or receipt.get('revision') != manifest['revision']:
        raise ValueError('Estimate catalogue validation receipt differs')
    for field in ('features', 'series', 'sampleCount'):
        actual = summary.get(field, summary['samples'])
        if receipt.get(field) != actual:
            raise ValueError('Estimate catalogue receipt count differs: ' + field)
    for descriptor in export_files(manifest):
        checked_file(folder, descriptor)
    return manifest, expected, digest


def attach(page_path, folder):
    page_path, folder = Path(page_path), Path(folder)
    catalogue, expected, digest = checked_catalogue(folder)
    page = page_path.read_text()
    manifest = p.read_manifest(page_path)
    dataset = catalogue['datasetId']
    entry = manifest['datasets'].get(dataset)
    if entry is None:
        return None  # Preserve the optional input when this dataset is uninstalled.
    # Resolve only the owning dataset's eager parts; never touch fitted banks.
    participants = None
    for descriptor in entry['parts']:
        part = read_json(p.checked_bytes(page_path.parent, descriptor))
        candidate = part.get('participants', {}).get(dataset)
        if candidate is not None:
            participants = candidate
    if (entry['dataset']['revision'] != expected['datasetRevision'] or not participants
            or participants['analysisRevision'] != expected['analysisRevision']
            or order_hash([r['id'] for r in participants['records']]) != expected['sampleOrderSha256']
            or len(participants['features']) != expected['featureCount']):
        raise ValueError('Estimate catalogue does not match the installed dataset')
    packaged = copy.deepcopy(catalogue)
    packaged['releaseStage'] = expected['releaseStage']
    packaged['sampleIds'] = [r['id'] for r in participants['records']]
    packaged['statusCodes'] = {**STATUS_CODES, **catalogue.get('statusCodes', {})}
    directory = page_path.parent / 'vme-assets'
    directory.mkdir(parents=True, exist_ok=True)

    def publish(data):
        raw = p.encoded(data)
        sha = p.sha(raw)
        descriptor = dict(url='/vme-assets/' + sha + '.json', sha256=sha, bytes=len(raw))
        target = p.asset_path(page_path.parent, descriptor)
        if target.exists():
            p.checked_bytes(page_path.parent, descriptor)
        else:
            target.write_bytes(raw)
        return descriptor

    shards = {}
    for descriptor in packaged['shards']:
        http = publish(read_json(checked_file(folder, descriptor)))
        descriptor['http'] = http
        shards[descriptor['id']] = http
    correlations = {}
    for descriptor in packaged.get('correlations', {}).get('banks', []):
        http = publish(read_json(checked_file(folder, descriptor)))
        descriptor['http'] = http
        correlations[descriptor['id']] = http
    for descriptor in packaged.get('correlations', {}).get('selectionInputs', {}).get('banks', []):
        http = publish(read_json(checked_file(folder, descriptor)))
        descriptor['http'] = http
        correlations[descriptor['id']] = http
    representations = {}
    for descriptor in packaged.get('profileEmbeddings', []) + packaged.get('smoothedEmbeddings', []):
        http = publish(read_json(checked_file(folder, descriptor)))
        descriptor['http'] = http
        representations[descriptor['id']] = http
    # Package checked documentation as JSON so the existing integrity loader can
    # retrieve it on demand; text is rendered without trusting source HTML.
    documents = {}
    for descriptor in packaged.get('documentation', []):
        raw = checked_file(folder, descriptor)
        name = Path(descriptor['file']).name
        if name.lower().endswith('.pdf'):
            if not raw.startswith(b'%PDF-'):
                raise ValueError('Invalid estimate report PDF signature')
            document = dict(name=name, mimeType='application/pdf', base64=base64.b64encode(raw).decode('ascii'))
        else:
            document = dict(name=name, text=raw.decode())
        http = publish(document)
        descriptor['http'] = http
        documents[descriptor['id']] = http
    index = publish({'estimateCatalogues': {dataset: packaged}})
    previous = entry.get('estimateAssets', {}).get('index', {}).get('url')
    entry['parts'] = [d for d in entry['parts'] if d['url'] != previous] + [index]
    entry['estimateAssets'] = dict(index=index, shards=shards, documents=documents, correlations=correlations, representations=representations)
    encoded = p.encoded(manifest).decode().replace('</', '<\\/')
    page = re.sub(p.PATTERN, lambda _: '<script id="vme-http-manifest" type="application/json">' + encoded + '</script>', page, count=1, flags=re.S)
    with tempfile.NamedTemporaryFile(dir=page_path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(page.encode())
    os.replace(temporary, page_path)
    return digest
