#!/usr/bin/env python3
"""Build current VME source against a separately shared, immutable Mac data package."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import fcntl
import socket
import subprocess
import tempfile
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'rank2_feature_graph'
sys.path.insert(0, str(HERE))
from viewer_source import assemble_viewer
from empty_view import write_empty_view
from taxon_palette import load_palette
from resource_pages import source_digest, page as resource_page, coverage_terminology
from policy_document import policy_html

PATTERN = r'<script id="vme-http-manifest" type="application/json">(.*?)</script>'


def encoded(value):
    return json.dumps(value, separators=(',', ':'), allow_nan=False).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_manifest(path):
    match = re.search(PATTERN, path.read_text(), re.S)
    if not match:
        raise ValueError('No VME data manifest: ' + str(path))
    manifest = json.loads(match[1])
    if manifest.get('version') != 1:
        raise ValueError('Unsupported data manifest version')
    return manifest


def descriptors(value):
    if isinstance(value, dict):
        if 'url' in value and 'sha256' in value and 'bytes' in value:
            yield value
        for part in value.values():
            yield from descriptors(part)
    elif isinstance(value, list):
        for part in value:
            yield from descriptors(part)


def asset_path(web, desc):
    url = desc['url']
    if not re.fullmatch(r'/vme-assets/[a-f0-9]{64}\.(json|js)', url):
        raise ValueError('Invalid asset path: ' + url)
    if Path(url).stem != desc['sha256']:
        raise ValueError('Asset filename/hash mismatch')
    path = (web / url.lstrip('/')).resolve()
    if web.resolve() not in path.parents:
        raise ValueError('Asset leaves data package')
    return path


def checked_bytes(web, desc):
    raw = asset_path(web, desc).read_bytes()
    if len(raw) != desc['bytes'] or sha(raw) != desc['sha256']:
        raise ValueError('Data asset checksum mismatch: ' + desc['url'])
    return raw


def package_manifest(package):
    if not (package / 'PACKAGE_MANIFEST.json').is_file():
        raise ValueError('Select the complete unzipped VME package, not its web subfolder')
    return read_manifest(package / 'web/index.html')


def package_views(web, manifest):
    result = {}
    for desc in manifest.get('neighborhoods', {}).get('parts', []):
        part = json.loads(checked_bytes(web, desc))
        for hood in part.get('familyNeighborhoods', {}).get('neighborhoods', []):
            for view in hood['views']:
                result[view['id']] = (hood, view)
    return result


def export_metadata(package, output):
    """Author-only: export diagnostics/summaries, never observations or refits."""
    old = package_manifest(package)
    current = read_manifest(ROOT / 'index.http.html')
    app = checked_bytes(ROOT, current['application']).decode()
    match = re.search(r'const legendAbundanceTotals=(?:BUNDLE_PACK.legendAbundanceTotals\|\|)?', app)
    if not match:
        raise ValueError('Build the current viewer before exporting metadata')
    totals, _ = json.JSONDecoder().raw_decode(app[match.end():])
    revisions = {key: value['dataset']['revision'] for key, value in old['datasets'].items()}
    for key, revision in revisions.items():
        if current['datasets'][key]['dataset']['revision'] != revision or totals[key]['datasetRevision'] != revision:
            raise ValueError('Dataset changed; export a new data package: ' + key)
    old_views = package_views(package / 'web', old)
    current_views = package_views(ROOT, current)
    diagnostics = {}
    for key, (hood, view) in old_views.items():
        new_hood, new_view = current_views[key]
        if (hood['profileIds'] != new_hood['profileIds'] or
                view['coordinateSha256'] != new_view['coordinateSha256'] or
                view['alignment'] != new_view['alignment']):
            raise ValueError('Embedding changed; a new data package is required: ' + key)
        if new_view.get('distanceEvaluation'):
            diagnostics[key] = new_view['distanceEvaluation']
    metadata = dict(version=1, baseManifestSha256=sha(encoded(old)), datasetRevisions=revisions,
                    legendAbundanceTotals={k: totals[k] for k in revisions},
                    embeddingStressDiagnostics=diagnostics)
    with output.open('xb') as stream:
        stream.write(encoded(metadata))
    print(f'Metadata: {output} ({output.stat().st_size / 1024:.1f} KiB); SHA256 {sha(output.read_bytes())}')


def validate_metadata(metadata, manifest, views):
    if metadata.get('version') != 1 or metadata.get('baseManifestSha256') != sha(encoded(manifest)):
        raise ValueError('Metadata belongs to a different data package')
    revisions = {k: v['dataset']['revision'] for k, v in manifest['datasets'].items()}
    if metadata['datasetRevisions'] != revisions:
        raise ValueError('Metadata dataset revisions differ')
    for key, revision in revisions.items():
        if metadata['legendAbundanceTotals'][key]['datasetRevision'] != revision:
            raise ValueError('Legend metadata revision differs')
    for key, value in metadata['embeddingStressDiagnostics'].items():
        hood, view = views[key]
        if (value['fingerprint']['coordinateSha256'] != view['coordinateSha256'] or
                value['fingerprint']['scale'] != view['alignment']['scale'] or
                value['profiles'] != hood['size']):
            raise ValueError('Diagnostic coordinates differ: ' + key)


def copy_file(source, destination):
    source, destination = Path(source), Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Immutable data can share disk blocks; generated code always gets new files.
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def updated_launcher(package, instance):
    launcher_path = next((package / name for name in ('Start MiCOVE.command', 'Start CoSMiX.command', 'Start VME.command') if (package / name).is_file()), package / 'Start VME.command')
    launcher = launcher_path.read_text().replace('43817', '43818')
    launcher = launcher.replace('/vme-health', '/vme-instance.txt').replace('VME-portable-2026-10-23', instance)
    prior = package / 'web/vme-instance.txt'
    if prior.is_file():
        identity = prior.read_text().strip()
        if not re.fullmatch(r'[a-f0-9]{64}', identity):
            raise ValueError('Invalid packaged launcher identity')
        launcher = launcher.replace(identity, instance)
    return launcher.replace('Vaginal Microbiome Explorer', 'MiCOVE').replace('CoSMiX', 'MiCOVE')


def write_launchers(output, launcher):
    """Canonical launcher plus existing-user aliases; native server format is unchanged."""
    (output / 'Start MiCOVE.command').write_text(launcher)
    (output / 'Start MiCOVE.command').chmod(0o755)
    for name in ('Start CoSMiX.command', 'Start VME.command'):
        (output / name).symlink_to('Start MiCOVE.command')
    (output / 'micove-server').symlink_to('vme-server')


def prepare(package, metadata_path, output, announce=True):
    if output.exists():
        raise ValueError('Choose a new output folder; existing copies are never overwritten')
    original = package_manifest(package)
    web = package / 'web'
    metadata = json.loads(metadata_path.read_text())
    validate_metadata(metadata, original, package_views(web, original))
    manifest = copy.deepcopy(original)
    manifest['seed'].update({k: metadata[k] for k in ('legendAbundanceTotals', 'embeddingStressDiagnostics')})
    if metadata.get('associationResults'):
        from association_supplement import validate as validate_associations
        for dataset, bank in metadata['associationResults'].items():
            if dataset not in original['datasets'] or bank['dataset'] != dataset:
                raise ValueError('Association supplement requires its owning dataset')
            validate_associations(bank)
        manifest['seed']['associationResults'] = metadata['associationResults']
    if metadata.get('maxNormalizedEmbeddings'):
        from max_normalized_supplement import population, validate
        validate(metadata['maxNormalizedEmbeddings'], population(package, original),
                 original['datasets']['comb-V3V4-tx']['dataset']['revision'])
        manifest['seed']['maxNormalizedEmbeddings'] = metadata['maxNormalizedEmbeddings']
    dataset_banks=metadata.get('datasetMaxNormalizedEmbeddings',{})
    if dataset_banks:
        from dataset_maxnorm_supplement import validate as validate_dataset_maxnorm
        for dataset,bank in dataset_banks.items():
            if dataset not in original['datasets']:raise ValueError('Embedding supplement requires dataset '+dataset)
            parts=[json.loads(checked_bytes(web,d)) for d in original['datasets'][dataset]['parts']]
            bundle=next(b for part in parts for b in part.get('bundles',[]) if b['dataset']['id']==dataset)
            participants=next(part['participants'][dataset] for part in parts if dataset in part.get('participants',{}))
            subject_contexts={k:v for part in parts for k,v in part.get('subjectEmbeddings',{}).get('contexts',{}).items()}
            validate_dataset_maxnorm(bank,bundle,participants,{'contexts':subject_contexts})
    unfolded_banks=metadata.get('datasetUnfoldedEmbeddings',{})
    if unfolded_banks:
        from unfolded_supplement import validate as validate_unfolded
        for dataset,bank in unfolded_banks.items():
            if dataset not in original['datasets']:raise ValueError('Unfolded supplement requires dataset '+dataset)
            parts=[json.loads(checked_bytes(web,d)) for d in original['datasets'][dataset]['parts']]
            bundle=next(b for part in parts for b in part.get('bundles',[]) if b['dataset']['id']==dataset)
            participants=next(part['participants'][dataset] for part in parts if dataset in part.get('participants',{}))
            validate_unfolded(bank,bundle,participants,next((part['combDisplay'] for part in parts if 'combDisplay' in part),None))
    unfolded_edge_banks=metadata.get('datasetUnfoldedEdgeEmbeddings',{})
    if unfolded_edge_banks:
        from unfolded_edge_supplement import validate as validate_unfolded_edges
        for dataset,bank in unfolded_edge_banks.items():
            if dataset not in original['datasets']:raise ValueError('Unfolded edge supplement requires dataset '+dataset)
            parts=[json.loads(checked_bytes(web,d)) for d in original['datasets'][dataset]['parts']]
            bundle=next(b for part in parts for b in part.get('bundles',[]) if b['dataset']['id']==dataset)
            participants=next(part['participants'][dataset] for part in parts if dataset in part.get('participants',{}))
            validate_unfolded_edges(bank,bundle,participants,display=next((part['combDisplay'] for part in parts if 'combDisplay' in part),None))
    valencia_banks = metadata.get('valencia2', {})
    if valencia_banks:
        from valencia_supplement import validate as validate_valencia
        for dataset, asset in valencia_banks.items():
            if dataset not in original['datasets']: raise ValueError('VALENCIA2 supplement requires dataset ' + dataset)
            parts = [json.loads(checked_bytes(web, d)) for d in original['datasets'][dataset]['parts']]
            if any(dataset in part.get('valencia2', {}) for part in parts):
                raise ValueError('VALENCIA2 supplement would replace existing annotations: ' + dataset)
            bundle = next(b for part in parts for b in part.get('bundles', []) if b['dataset']['id'] == dataset)
            participants = next(part['participants'][dataset] for part in parts if dataset in part.get('participants', {}))
            validate_valencia(asset, bundle, participants)
    pure_vertices = metadata.get('pureVertexLocal')
    if pure_vertices:
        from pure_vertex_supplement import package_part, saved_fits, validate as validate_pure_vertices
        validate_pure_vertices(pure_vertices, package_part(package, original),
                               dict(saved_fits(package, original)))
        manifest['seed'].pop('pureVertexLocal', None)
    # Validate all scientific asset bytes before creating an output directory.
    retained = copy.deepcopy(original)
    for key in ('application', 'validator'):
        retained.pop(key, None)
    assets = {d['url']: d for d in descriptors(retained)}
    for desc in assets.values():
        checked_bytes(web, desc)
    sums = {}
    for line in (package / 'SHA256SUMS.txt').read_text().splitlines():
        digest, name = line.split('  ', 1)
        sums[name] = digest
    if sha((package / 'vme-server').read_bytes()) != sums.get('vme-server'):
        raise ValueError('Packaged native server checksum differs')
    for name in ('mutual-overlap', 'reports'):
        for path in (web / name).rglob('*'):
            if path.is_file():
                if web.resolve() not in path.resolve().parents:
                    raise ValueError('Resource leaves data package')
                if sha(path.read_bytes()) != sums.get(path.relative_to(package).as_posix()):
                    raise ValueError('Resource checksum differs: ' + str(path))
    page = assemble_viewer(HERE, pack='const BUNDLE_PACK={};', plotly='', palette=load_palette(HERE),
                           legend_abundance={}, overlap_available=(web / 'mutual-overlap/index.html').is_file())
    scripts = list(re.finditer(r'<script>(.*?)</script>', page, re.S))
    application = scripts[-1][1]
    application = application[application.index('const VMRC_TAXON_PALETTE='):]
    loader = (HERE / 'asset_loader.js').read_text()
    output.mkdir(parents=True)
    outweb = output / 'web'
    for url, desc in assets.items():
        copy_file(asset_path(web, desc), outweb / url.lstrip('/'))
    def publish(raw, suffix='js'):
        digest = sha(raw)
        url = '/vme-assets/' + digest + '.' + suffix
        path = outweb / url.lstrip('/')
        if not path.exists():
            path.write_bytes(raw)
        return dict(url=url, bytes=len(raw), sha256=digest)
    manifest['application'] = publish(('VME_ASSETS.releaseControls();\n' + application).encode())
    manifest['validator'] = publish((HERE / 'bundle_format.js').read_bytes())
    if pure_vertices:
        manifest['datasets']['comb-V3V4-tx']['parts'].append(publish(encoded({'pureVertexLocal': pure_vertices}), 'json'))
    for dataset, asset in valencia_banks.items():
        manifest['datasets'][dataset]['parts'].append(publish(encoded({'valencia2': {dataset: asset}}), 'json'))
    for field,banks in [('datasetMaxNormalizedEmbeddings',dataset_banks),('datasetUnfoldedEmbeddings',unfolded_banks),('datasetUnfoldedEdgeEmbeddings',unfolded_edge_banks)]:
        for dataset,bank in banks.items():
            parts=manifest['datasets'][dataset]['parts']
            parts.append(publish(encoded({field:{dataset:{**bank,'fits':{}}}}),'json'))
            rows={};size=0
            for key,fit in bank['fits'].items():
                length=len(encoded(fit))
                if rows and size+length>4*1024*1024:
                    parts.append(publish(encoded({field:{dataset:{'fits':rows}}}),'json'));rows={};size=0
                rows[key]=fit;size+=length
            if rows:parts.append(publish(encoded({field:{dataset:{'fits':rows}}}),'json'))
    loader_desc = publish(loader.encode())
    bootstrap = '<script id="vme-http-manifest" type="application/json">' + encoded(manifest).decode().replace('</', '<\\/') + '</script><script src="' + loader_desc['url'] + '"></script>'
    pieces = []; cursor = 0
    for i, match in enumerate(scripts):
        pieces.extend((page[cursor:match.start()], bootstrap if i == 1 else ''))
        cursor = match.end()
    pieces.append(page[cursor:])
    page = ''.join(pieces).replace('<body>', '<body><p id="vmeLoadStatus" role="status" aria-live="polite">Loading dataset…</p><button id="vmeLoadRetry" type="button" hidden>Retry loading</button>', 1)
    (outweb / 'index.html').write_text(page)
    write_empty_view(manifest, outweb / 'empty.html')
    for name in ('about.html', 'portable.html'):
        (outweb / name).write_text(coverage_terminology((web / name).read_text()).replace('Vaginal Microbiome Explorer', 'MiCOVE').replace(' · VME</title>', ' · MiCOVE</title>').replace('CoSMiX', 'MiCOVE'))
    (outweb / 'QUALITY_PREVIEW_POLICY.md').write_bytes((HERE / 'QUALITY_PREVIEW_POLICY.md').read_bytes())
    (outweb / 'quality.html').write_text(resource_page('Quality preview rules', policy_html(HERE), 'index.html'))
    # Retain the data-package provenance, clearly separated from the new interface.
    about = outweb / 'about.html'
    about.write_text(about.read_text().replace('<main>', '<main><h1>MiCOVE</h1><p>Microbiome Community State Space Explorer</p><p><strong>Interface updated from GitHub source.</strong> Source fingerprint: ' + source_digest(HERE)[:12] + '. The dataset and original build provenance below describe the separately supplied data package.</p>', 1))
    for name in ('mutual-overlap', 'reports'):
        if (web / name).is_dir():
            shutil.copytree(web / name, outweb / name, copy_function=copy_file)
    shutil.copy2(package / 'vme-server', output / 'vme-server')
    instance = sha(encoded(dict(source=source_digest(HERE), metadata=sha(metadata_path.read_bytes()), package=sha(encoded(original)))))
    (outweb / 'vme-instance.txt').write_text(instance)
    launcher = updated_launcher(package, instance)
    write_launchers(output, launcher)
    receipt = dict(sourceSha256=source_digest(HERE), baseManifestSha256=sha(encoded(original)),
                   metadataSha256=sha(metadata_path.read_bytes()), dataPackage=str(package),
                   metadataFile=str(metadata_path),
                   datasets=list(manifest['seed']['distributionDatasets']), application=manifest['application'],
                   diagnosticCount=len(metadata['embeddingStressDiagnostics']))
    (output / 'SOURCE_AND_DATA.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (output / 'READ ME FIRST.txt').write_text('Double-click Start MiCOVE.command. Keep its Terminal open.\nThis copy uses current GitHub interface source with your separately supplied data.\nNo fitting or data changes occurred. Port: 43818.\nFor another update: stop this viewer, then in your source clone run git pull --ff-only followed by python3 scripts/portable.py update.\nThe original data package stays unchanged. SOURCE_AND_DATA.json records both identities.\n')
    if announce:
        print('Ready: ' + str(output / 'Start MiCOVE.command'))


def attach_neighborhoods(page_path, optional_web):
    """Expose historical neighborhoods in an isolated loader, never merge populations."""
    page_path, optional_web = Path(page_path), Path(optional_web)
    page = page_path.read_text()
    if 'id="vme-optional-neighborhoods"' in page:
        raise ValueError('Optional neighborhoods already installed in this page')
    main = read_manifest(page_path)
    saved_optional = re.search(r'<script id="vme-optional-neighborhoods" type="application/json">(.*?)</script>', (optional_web / 'index.html').read_text(), re.S)
    extra = copy.deepcopy(json.loads(saved_optional[1]) if saved_optional else read_manifest(optional_web / 'index.html'))
    if [f['id'] for f in extra.get('families', [])] != ['li-lc-neighborhoods']:
        raise ValueError('Expected the preserved Li/Lc neighborhood family')
    dependencies = extra['neighborhoods']['datasets']
    extra['datasets'] = {k: extra['datasets'][k] for k in dependencies}
    extra.pop('sensitivity', None)
    extra['seed'].pop('sensitivityComparisonsAvailable', None)
    extra['seed']['distributionDatasets'] = []
    extra['seed']['default'] = dependencies[0]
    extra['seed']['optionalDatasetLinks'] = [
        dict(id=k, title=main['seed'].get('datasetPresentation', {}).get(k, {}).get('title', v['dataset']['title']))
        for k, v in main['datasets'].items()
        if k in main['seed'].get('distributionDatasets', main['datasets'])]
    main['seed']['optionalDatasetLinks'] = [dict(id=f['id'], title=f['title']) for f in extra['families']]
    # Same interface code in both contexts; only the data manifest changes.
    for key in ('application', 'validator', 'plotly'):
        extra[key] = main[key]
    retained = {k:v for k,v in extra.items() if k not in ('application','validator','plotly')}
    assets = {d['url']:d for d in descriptors(retained)}
    for desc in assets.values():
        checked_bytes(optional_web, desc)
    for desc in assets.values():
        source, target = asset_path(optional_web, desc), asset_path(page_path.parent, desc)
        if target.exists():
            checked_bytes(page_path.parent, desc)
        else:
            copy_file(source, target)
    encoded_main = encoded(main).decode().replace('</', '<\\/')
    encoded_extra = encoded(extra).decode().replace('</', '<\\/')
    page = re.sub(PATTERN, lambda _: '<script id="vme-http-manifest" type="application/json">' + encoded_main + '</script>' +
                  '<script id="vme-optional-neighborhoods" type="application/json">' + encoded_extra + '</script>', page, count=1, flags=re.S)
    temporary = page_path.with_suffix(page_path.suffix + '.optional-tmp')
    temporary.write_text(page)
    temporary.replace(page_path)
    write_empty_view(main, page_path.parent / 'empty.html', page_path.name.replace('.http.html', '.html'))
    return sha(encoded(extra))


def install_neighborhoods(output, package, metadata):
    # Keep the historical package immutable and independently validated.
    with tempfile.TemporaryDirectory(prefix='vme-neighborhoods-', dir=output.parent) as temp:
        companion = Path(temp) / 'app'
        prepare(package, metadata, companion, announce=False)
        validate_prepared(companion)
        digest = attach_neighborhoods(output / 'web/index.html', companion / 'web')
    receipt_path = output / 'SOURCE_AND_DATA.json'
    receipt = json.loads(receipt_path.read_text())
    receipt['optionalNeighborhoods'] = dict(dataPackage=str(package), metadataFile=str(metadata), manifestSha256=digest)
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    extend_instance(output, 'neighborhoods', digest)


def extend_instance(output, supplement, digest):
    identity_path=output/'web/vme-instance.txt'
    previous=identity_path.read_text().strip()
    identity=sha(encoded({'base':previous, supplement:digest}))
    launcher=output/'Start VME.command'
    launcher.write_text(launcher.read_text().replace(previous,identity))
    identity_path.write_text(identity)


@contextmanager
def update_lock(output):
    """Serialize updates without leaving a stale lock after a process exits."""
    with (output.parent / ('.' + output.name + '-update.lock')).open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Another update is running for ' + str(output)) from None
        yield


@contextmanager
def stopped_viewer(output):
    """Reserve the launch port and reject this app running on another port."""
    processes = subprocess.check_output(['/bin/ps', '-ww', '-axo', 'command='], text=True)
    for line in processes.splitlines():
        arguments = line.partition('vme-server ')[2].rsplit(' ', 1)
        if (len(arguments) == 2 and arguments[1].isdigit()
                and Path(arguments[0]).resolve() == (output / 'web').resolve()):
            raise ValueError('Stop the viewer with Control-C in its Terminal before updating')
    port = int(os.environ.get('VME_PORT', '43818'))
    if not 1024 <= port <= 65535:
        raise ValueError('VME_PORT must be between 1024 and 65535')
    with socket.socket() as reservation:
        try:
            reservation.bind(('127.0.0.1', port))
        except OSError:
            raise ValueError(f'Port {port} is in use. Stop the viewer before updating') from None
        yield


def validate_prepared(output):
    """Re-read the finished candidate, including newly generated script bytes."""
    web = output / 'web'
    manifest = read_manifest(web / 'index.html')
    optional = re.search(r'<script id="vme-optional-neighborhoods" type="application/json">(.*?)</script>', (web / 'index.html').read_text(), re.S)
    manifests = [manifest] + ([json.loads(optional[1])] if optional else [])
    for desc in descriptors(manifests):
        checked_bytes(web, desc)
    html = (web / 'index.html').read_text()
    loaders = re.findall(r'<script src="(/vme-assets/([a-f0-9]{64})\.js)"></script>', html)
    if not loaders:
        raise ValueError('Prepared viewer has no loader')
    for url, digest in loaders:
        raw = (web / url.lstrip('/')).read_bytes()
        checked_bytes(web, dict(url=url, sha256=digest, bytes=len(raw)))
    receipt = json.loads((output / 'SOURCE_AND_DATA.json').read_text())
    if optional and receipt.get('optionalNeighborhoods', {}).get('manifestSha256') != sha(encoded(manifests[1])):
        raise ValueError('Optional neighborhood manifest differs from its receipt')
    if receipt['application'] != manifest['application']:
        raise ValueError('Prepared application receipt differs')
    if not re.fullmatch('[a-f0-9]{64}', (web / 'vme-instance.txt').read_text()):
        raise ValueError('Prepared viewer identity is invalid')
    if not os.access(output / 'vme-server', os.X_OK):
        raise ValueError('Prepared native server is not executable')
    subprocess.run(['/bin/bash', '-n', str(output / 'Start VME.command')], check=True)


def recover_update(output, journal):
    """Recover a replacement interrupted between moving the old and new app."""
    if not journal.exists():
        return
    record = json.loads(journal.read_text())
    name = record['transaction']
    if Path(name).name != name or not name.startswith(output.name + '-update-'):
        raise ValueError('Invalid update recovery record: ' + str(journal))
    transaction = output.parent / name
    if transaction.is_symlink() or (transaction / 'previous').is_symlink():
        raise ValueError('Update recovery paths must not be symbolic links')
    previous = transaction / 'previous'
    if not output.exists() and record['hadPrevious']:
        if not previous.is_dir():
            raise ValueError('Previous app is missing; inspect ' + str(transaction))
        previous.rename(output)
        print('Recovered previous app: ' + str(output))
    journal.unlink()


def app_destination(output=None):
    """Use a new MiCOVE home or preserve an existing installation and safe aliases."""
    home = Path.home()
    known = [home / name for name in ('micove', 'cosmix', 'vme')]

    def destination(path):
        seen = set()
        while path.is_symlink():
            if path not in known or path in seen:
                raise ValueError('The app folder must not be an unrelated or dangling symbolic link')
            seen.add(path)
            target = path.readlink()
            path = Path(os.path.abspath(path.parent / target))
            if path not in known:
                raise ValueError('The app folder must not be an unrelated or dangling symbolic link')
        journal = path.parent / ('.' + path.name + '-update.json')
        if seen and not (path.is_dir() or journal.is_file()):
            raise ValueError('The app folder must not be an unrelated or dangling symbolic link')
        return path

    if output is None:
        installed = set()
        for path in known:
            resolved = destination(path)
            journal = resolved.parent / ('.' + resolved.name + '-update.json')
            if (resolved / 'SOURCE_AND_DATA.json').is_file() or journal.is_file():
                installed.add(resolved)
        if len(installed) > 1:
            raise ValueError('Multiple MiCOVE installations found. Choose --output ~/micove, ~/cosmix or ~/vme.')
        output = next(iter(installed), known[0])
    return destination(Path(output).expanduser().absolute()).resolve()


def update(package=None, metadata_path=None, output=None, neighborhood_package=None, neighborhood_metadata=None,
           catalog=None, datasets=None, select_datasets=False, agp_population=None, skin_exchanges=None, skin_states=None,
           estimate_catalogues=None):
    output = app_destination(output)
    # Reject the source checkout before creating any locks or staging folders.
    if output == ROOT or output in ROOT.parents or ROOT in output.parents:
        raise ValueError('Keep the source clone (for example ~/micove-source) separate from the app (normally ~/micove)')
    output.parent.mkdir(parents=True, exist_ok=True)
    with update_lock(output), stopped_viewer(output):
        journal = output.parent / ('.' + output.name + '-update.json')
        recover_update(output, journal)
        old_receipt = {}
        if output.exists():
            if (output / '.git').exists() or not (output / 'SOURCE_AND_DATA.json').is_file():
                raise ValueError('Existing output is not a prepared VME app; it will not be replaced')
            old_receipt = json.loads((output / 'SOURCE_AND_DATA.json').read_text())
            if not all((output / name).is_file() for name in ('vme-server', 'Start VME.command', 'web/index.html')):
                raise ValueError('Existing app is incomplete; inspect it before updating')
        meeting = catalog is not None or (old_receipt.get('meetingRelease') and package is None)
        if meeting:
            import meeting_release
            if any((package, metadata_path, neighborhood_package, neighborhood_metadata)):
                raise ValueError('Use either a selectable release or the older package/metadata installation')
            saved_release = old_receipt.get('meetingRelease', {})
            release_root = Path(catalog or saved_release['path']).expanduser().resolve()
            if any((output == release_root, output in release_root.parents, release_root in output.parents)):
                raise ValueError('Keep data outside the app folder')
            if catalog is None and sha((release_root / 'catalog.json').read_bytes()) != saved_release['catalogSha256']:
                raise ValueError('The installed release catalogue changed; supply --catalog explicitly for a new release')
            if meeting_release.read_catalog(release_root).get('synthetic'):
                if output in (Path.home() / 'micove', Path.home() / 'cosmix', Path.home() / 'vme') or (old_receipt and
                        saved_release.get('catalogSha256') != sha((release_root / 'catalog.json').read_bytes())):
                    raise ValueError('Use a separate test app folder for synthetic skin fixtures')
            chosen = meeting_release.selection(release_root, datasets,
                old_receipt.get('datasets') if saved_release else None, select_datasets)
        else:
            if datasets is not None or select_datasets:
                raise ValueError('Dataset selection requires --catalog for a selectable data release')
            package = Path(package or old_receipt.get('dataPackage') or
                           Path.home() / 'Downloads/VME-Mac-Meeting-2026-10-23').expanduser().resolve()
            metadata_path = Path(metadata_path or old_receipt.get('metadataFile') or
                                 Path.home() / 'Downloads/VME-metadata-2026-10-24.json').expanduser().resolve()
            if (output == package or output in package.parents or package in output.parents
                    or output == metadata_path or output in metadata_path.parents):
                raise ValueError('Keep the original data package and metadata outside the app folder')
            saved_optional = old_receipt.get('optionalNeighborhoods', {})
            neighborhood_package = neighborhood_package or saved_optional.get('dataPackage')
            neighborhood_metadata = neighborhood_metadata or saved_optional.get('metadataFile')
            if bool(neighborhood_package) != bool(neighborhood_metadata):
                raise ValueError('Supply both the neighborhood package and its metadata')
            if neighborhood_package:
                neighborhood_package = Path(neighborhood_package).expanduser().resolve()
                neighborhood_metadata = Path(neighborhood_metadata).expanduser().resolve()
                if any(p == output or output in p.parents or p in output.parents for p in (neighborhood_package, neighborhood_metadata)):
                    raise ValueError('Keep optional neighborhood inputs outside the app folder')
        transaction = Path(tempfile.mkdtemp(prefix=output.name + '-update-', dir=output.parent))
        candidate, previous = transaction / 'candidate', transaction / 'previous'
        try:
            if meeting:
                meeting_release.assemble(release_root, chosen, candidate)
            else:
                prepare(package, metadata_path, candidate, announce=False)
                if neighborhood_package:
                    install_neighborhoods(candidate, neighborhood_package, neighborhood_metadata)
            agp_population = agp_population or old_receipt.get('agpPopulation')
            if agp_population:
                from agp_supplement import attach
                population_path = Path(agp_population).expanduser().resolve()
                if output == population_path or output in population_path.parents:
                    raise ValueError('Keep the AGP population outside the app folder')
                digest = attach(candidate/'web/index.html', population_path)
                extend_instance(candidate, 'agp', digest)
                receipt_path = candidate/'SOURCE_AND_DATA.json'
                receipt = json.loads(receipt_path.read_text())
                receipt['agpPopulation'] = str(population_path)
                receipt_path.write_text(json.dumps(receipt, indent=2)+'\n')
            skin_exchanges = skin_exchanges if skin_exchanges is not None else old_receipt.get('skinExchanges')
            if skin_exchanges:
                from skin_supplement import attach as attach_skin
                paths = [Path(path).expanduser().resolve() for path in skin_exchanges]
                if any(output == path or output in path.parents or path in output.parents for path in paths):
                    raise ValueError('Keep skin exchange data outside the app folder')
                digest = attach_skin(candidate/'web/index.html', paths)
                extend_instance(candidate, 'skin', digest)
                receipt_path = candidate/'SOURCE_AND_DATA.json'
                receipt = json.loads(receipt_path.read_text())
                receipt['skinExchanges'] = list(map(str, paths))
                receipt_path.write_text(json.dumps(receipt, indent=2)+'\n')
            skin_states = skin_states or old_receipt.get('skinStates')
            if skin_states:
                from skin_states import attach as attach_states
                states_path = Path(skin_states).expanduser().resolve()
                if output == states_path or output in states_path.parents or states_path in output.parents:
                    raise ValueError('Keep skin state data outside the app folder')
                # A changed selectable subset may contain no skin populations.
                if any(e.get('capability') == 'skin-population-v2' for e in read_manifest(candidate/'web/index.html')['datasets'].values()):
                    digest = attach_states(candidate/'web/index.html', states_path)
                    extend_instance(candidate, 'skin-states', digest)
                receipt_path = candidate/'SOURCE_AND_DATA.json'
                receipt = json.loads(receipt_path.read_text())
                receipt['skinStates'] = str(states_path)
                receipt_path.write_text(json.dumps(receipt, indent=2)+'\n')
            estimate_catalogues = estimate_catalogues if estimate_catalogues is not None else old_receipt.get('estimateCatalogues')
            if estimate_catalogues:
                from estimate_supplement import attach as attach_estimates
                paths = [Path(path).expanduser().resolve() for path in estimate_catalogues]
                if any(output == path or output in path.parents or path in output.parents for path in paths):
                    raise ValueError('Keep estimate catalogue data outside the app folder')
                for path in paths:
                    digest = attach_estimates(candidate/'web/index.html', path)
                    if digest:
                        extend_instance(candidate, 'estimate-catalogue', digest)
                receipt_path = candidate/'SOURCE_AND_DATA.json'
                receipt = json.loads(receipt_path.read_text())
                receipt['estimateCatalogues'] = list(map(str, paths))
                receipt_path.write_text(json.dumps(receipt, indent=2)+'\n')
            validate_prepared(candidate)
            # Write recovery information before either directory is moved.
            with journal.open('x') as stream:
                json.dump(dict(transaction=transaction.name, hadPrevious=output.exists()), stream)
                stream.flush()
                os.fsync(stream.fileno())
            if output.exists():
                output.rename(previous)
            candidate.rename(output)
            journal.unlink()
        except BaseException:
            if previous.exists() and not output.exists():
                previous.rename(output)
                if journal.exists():
                    journal.unlink()
            print('Update did not finish. Diagnostic files retained at: ' + str(transaction), file=sys.stderr)
            raise
        print('Ready: ' + str(output / 'Start MiCOVE.command'))
        if previous.exists():
            print('Previous app retained at: ' + str(previous))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('prepare', 'export-metadata'):
        item = sub.add_parser(command)
        item.add_argument('--package', type=Path, required=True)
        item.add_argument('--output', type=Path, required=True)
        if command == 'prepare':
            item.add_argument('--metadata', type=Path, required=True)
    item = sub.add_parser('update', help='Install MiCOVE or update the existing app')
    item.add_argument('--package', type=Path, help='Original data package (remembered after setup)')
    item.add_argument('--metadata', type=Path, help='Metadata supplement (remembered after setup)')
    item.add_argument('--output', type=Path, help='App folder (default: ~/micove, or an existing ~/cosmix or ~/vme installation)')
    item.add_argument('--neighborhood-package', type=Path, help='Optional historical Li/Lc data package (remembered locally)')
    item.add_argument('--neighborhood-metadata', type=Path, help='Matching neighborhood metadata (remembered locally)')
    item.add_argument('--catalog', type=Path, help='Folder containing a selectable release catalog.json')
    item.add_argument('--datasets', nargs='+', help='Exact dataset IDs to install; replaces the installed selection')
    item.add_argument('--select-datasets', action='store_true', help='Choose datasets interactively')
    item.add_argument('--agp-population', type=Path, help='Reviewed AGP SILVA population file (remembered locally)')
    item.add_argument('--skin-exchange', nargs='+', type=Path, help='Registered skin v2 exchange directories (remembered locally)')
    item.add_argument('--skin-states', type=Path, help='Reviewed skin genus-state sidecar directory (remembered locally)')
    item.add_argument('--estimate-catalogue', nargs='+', type=Path, help='Reviewed exploratory estimate directories (remembered locally)')
    args = parser.parse_args()
    try:
        if args.command == 'update':
            update(args.package, args.metadata, args.output, args.neighborhood_package, args.neighborhood_metadata,
                   args.catalog, args.datasets, args.select_datasets, args.agp_population, args.skin_exchange, args.skin_states,
                   args.estimate_catalogue)
        elif args.command == 'prepare':
            prepare(args.package.resolve(), args.metadata.resolve(), args.output.resolve())
        else:
            export_metadata(args.package.resolve(), args.output.resolve())
    except (ValueError, KeyError, OSError, EOFError, subprocess.SubprocessError) as error:
        parser.exit(1, 'MiCOVE setup: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
