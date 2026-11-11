"""Install selectable, immutable VME data releases. No scientific computation."""
import copy
import json
import re
import shutil
from html import escape
from pathlib import Path

import portable as p

FORMAT = 'vme-selectable-release'
VERSION = 1


def contained(root, relative):
    if not isinstance(relative, str) or Path(relative).is_absolute() or '..' in Path(relative).parts:
        raise ValueError('Invalid release path')
    path = (root / relative).resolve()
    if root.resolve() not in path.parents:
        raise ValueError('Release path leaves its folder')
    return path


def checked_file(root, descriptor):
    path = contained(root, descriptor['path'])
    raw = path.read_bytes()
    if len(raw) != descriptor['bytes'] or p.sha(raw) != descriptor['sha256']:
        raise ValueError('Release file checksum mismatch: ' + descriptor['path'])
    return raw


def read_catalog(root):
    catalog = json.loads((root / 'catalog.json').read_text())
    if catalog.get('format') != FORMAT or catalog.get('version') != VERSION:
        raise ValueError('Unsupported data release; update MiCOVE source first')
    if not catalog.get('datasets'):
        raise ValueError('Empty data catalogue')
    for identifier in catalog['datasets']:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', identifier) or identifier == 'li-lc-neighborhoods':
            raise ValueError('Invalid dataset identifier')
    return catalog


def selection(root, requested=None, previous=None, interactive=False):
    catalog = read_catalog(root)
    available = list(catalog['datasets'])
    if interactive or (requested is None and previous is None):
        print('\nAvailable datasets (download and unzip the corresponding ZIP first):')
        for number, identifier in enumerate(available, 1):
            entry = catalog['datasets'][identifier]
            installed = contained(root, entry['manifest']['path']).is_file()
            print(f"  {number}. {entry['title']}" + (' [downloaded]' if installed else ' [not downloaded]'))
        answer = input('Select numbers separated by spaces, or all: ').strip()
        if answer.lower() == 'all':
            requested = available
        else:
            try:
                numbers = [int(x) for x in answer.replace(',', ' ').split()]
                if not numbers or any(n < 1 or n > len(available) for n in numbers):
                    raise ValueError()
                requested = [available[n - 1] for n in numbers]
            except ValueError:
                raise ValueError('Choose valid dataset numbers; nothing was changed') from None
    chosen = list(dict.fromkeys(requested if requested is not None else previous))
    if not chosen or not set(chosen) <= set(available):
        raise ValueError('Choose at least one listed dataset; unknown identifiers are not accepted')
    for identifier in chosen:
        if not contained(root, catalog['datasets'][identifier]['manifest']['path']).is_file():
            raise ValueError('Download and unzip ' + catalog['datasets'][identifier]['archive'] + ' into the release folder first')
    return chosen


def compose(root, chosen):
    catalog = read_catalog(root)
    if not chosen or len(set(chosen)) != len(chosen) or not set(chosen) <= set(catalog['datasets']):
        raise ValueError('Invalid selected dataset list')
    common = json.loads(checked_file(root, catalog['common']))
    manifest = dict(version=1, seed=copy.deepcopy(common['seed']), datasets={}, families=[], plotly=common['plotly'])
    sources = {d['url']: (root / 'common', d) for d in p.descriptors(common['plotly'])}
    for identifier in chosen:
        entry = catalog['datasets'][identifier]
        part = json.loads(checked_file(root, entry['manifest']))
        if part.get('release') != catalog['release'] or part.get('id') != identifier or part['dataset']['dataset']['id'] != identifier:
            raise ValueError('Dataset belongs to a different release')
        manifest['datasets'][identifier] = part['dataset']
        for field, value in part['seed'].items():
            if field in ('maxNormalizedEmbeddings',):
                if field in manifest['seed']:
                    raise ValueError('Conflicting dataset supplement')
                manifest['seed'][field] = value
            else:
                manifest['seed'].setdefault(field, {}).update(value)
        web = contained(root, entry['manifest']['path']).parent
        for desc in p.descriptors(part['dataset']):
            sources.setdefault(desc['url'], (web, desc))
    manifest['seed']['default'] = chosen[0]
    manifest['seed']['distributionDatasets'] = chosen
    manifest['seed']['initialView'] = dict(mode='merged', coverage='60')
    return catalog, manifest, sources


def assemble(root, chosen, output):
    """Validate inputs, assemble current source, then produce a candidate app."""
    root = root.resolve()
    catalog, manifest, sources = compose(root, chosen)
    server = checked_file(root, catalog['server'])
    # Verify every selected eager/deferred file before creating an application.
    for web, desc in sources.values():
        p.checked_bytes(web, desc)
    if output.exists():
        raise ValueError('Candidate output already exists')
    outweb = output / 'web'
    (outweb / 'vme-assets').mkdir(parents=True)
    for web, desc in sources.values():
        p.copy_file(p.asset_path(web, desc), p.asset_path(outweb, desc))
    page = p.assemble_viewer(p.HERE, pack='const BUNDLE_PACK={};', plotly='',
                             palette=p.load_palette(p.HERE), legend_abundance={}, overlap_available=False)
    scripts = list(re.finditer(r'<script>(.*?)</script>', page, re.S))
    application = scripts[-1][1]
    application = application[application.index('const VMRC_TAXON_PALETTE='):]
    def publish(raw):
        digest = p.sha(raw)
        desc = dict(url='/vme-assets/' + digest + '.js', sha256=digest, bytes=len(raw))
        p.asset_path(outweb, desc).write_bytes(raw)
        return desc
    manifest['application'] = publish(('VME_ASSETS.releaseControls();\n' + application).encode())
    if any(entry.get('capability') in ('skin-population-v1', 'skin-population-v2') for entry in manifest['datasets'].values()):
        from skin_supplement import viewer_bytes
        manifest['skinViewer'] = publish(viewer_bytes())
    if any(entry.get('capability') == 'cag-population-v1' for entry in manifest['datasets'].values()):
        from comb_mg_supplement import viewer_bytes as cag_viewer_bytes
        manifest['combMgViewer'] = publish(cag_viewer_bytes())
    manifest['validator'] = publish((p.HERE / 'bundle_format.js').read_bytes())
    loader = publish((p.HERE / 'asset_loader.js').read_bytes())
    bootstrap = '<script id="vme-http-manifest" type="application/json">' + p.encoded(manifest).decode().replace('</', '<\\/') + '</script><script src="' + loader['url'] + '"></script>'
    pieces = []; cursor = 0
    for index, script in enumerate(scripts):
        pieces.extend((page[cursor:script.start()], bootstrap if index == 1 else ''))
        cursor = script.end()
    pieces.append(page[cursor:])
    page = ''.join(pieces).replace('<body>', '<body><p id="vmeLoadStatus" role="status" aria-live="polite">Loading dataset…</p><button id="vmeLoadRetry" hidden>Retry loading</button>', 1)
    (outweb / 'index.html').write_text(page)
    p.write_empty_view(manifest, outweb / 'empty.html')
    cards = []
    for identifier, item in manifest['datasets'].items():
        metadata = item['dataset']
        title = catalog['datasets'][identifier]['title']
        cards.append('<article class="dataset"><h2><a href="/?dataset=' + escape(identifier, quote=True) + '">' + escape(title) + '</a></h2><p>' + escape(metadata.get('description', '')) + '</p><p>' + escape(metadata.get('methods', '')) + '</p><p>Dataset revision: ' + escape(str(metadata['revision'])) + '</p></article>')
    body = '<p>Separately distributed research data. The MIT software license does not cover these datasets or metadata. Original access and reuse terms apply. Existing exploratory/provisional limitations remain in force. Saved results were copied without refitting. Exhaustive saved-layout validation was not run for this release.</p>' + ''.join(cards)
    (outweb / 'about.html').write_text(p.resource_page('Installed datasets', body, 'index.html'))
    (outweb / 'QUALITY_PREVIEW_POLICY.md').write_bytes((p.HERE / 'QUALITY_PREVIEW_POLICY.md').read_bytes())
    (outweb / 'quality.html').write_text(p.resource_page('Quality preview rules', p.policy_html(p.HERE), 'index.html'))
    (outweb / 'reports').mkdir()
    (outweb / 'reports/index.html').write_text(p.resource_page('Analysis documents', '<p>Open an installed dataset and use its analysis Methods or PDF buttons for the accompanying documents. This copy does not include the separate development report dashboard or mutual-overlap research browser. Live R analysis services are not included.</p>', '../index.html'))
    (output / 'vme-server').write_bytes(server)
    (output / 'vme-server').chmod(0o755)
    identity = p.sha(p.encoded(dict(application=manifest['application'], release=p.sha((root / 'catalog.json').read_bytes()), datasets=chosen, skinViewer=manifest.get('skinViewer'), combMgViewer=manifest.get('combMgViewer'))))
    (outweb / 'vme-instance.txt').write_text(identity)
    launcher = LAUNCHER.replace('INSTANCE_ID', identity)
    p.write_launchers(output, launcher)
    receipt = dict(sourceSha256=p.source_digest(p.HERE), application=manifest['application'], datasets=chosen,
                   meetingRelease=dict(path=str(root), release=catalog['release'], catalogSha256=p.sha((root / 'catalog.json').read_bytes())))
    (output / 'SOURCE_AND_DATA.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (output / 'READ ME FIRST.txt').write_text('Double-click Start MiCOVE.command. Keep its Terminal open.\nTo update: stop MiCOVE, then run in your source clone:\ngit pull --ff-only && python3 scripts/portable.py update\nTo change datasets: python3 scripts/portable.py update --select-datasets\nKeep the original data release in place. Setup uses no scientific fitting.\n')


LAUNCHER = '''#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
port="${VME_PORT:-43818}"
identity=INSTANCE_ID
if /usr/bin/curl --silent --max-time 1 "http://127.0.0.1:$port/vme-instance.txt" | /usr/bin/grep -qx "$identity"; then
  if [ "${VME_NO_BROWSER:-0}" != 1 ]; then /usr/bin/open "http://127.0.0.1:$port/"; fi
  exit 0
fi
./vme-server "$PWD/web" "$port" &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true' EXIT
trap 'exit 0' INT TERM HUP
for attempt in {1..100}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then echo 'Could not start MiCOVE; check whether its port is already in use.'; exit 1; fi
  if /usr/bin/curl --silent --max-time 1 "http://127.0.0.1:$port/vme-instance.txt" | /usr/bin/grep -qx "$identity"; then
    echo "MiCOVE is ready at http://127.0.0.1:$port/ — keep this Terminal open; Control-C stops MiCOVE."
    if [ "${VME_NO_BROWSER:-0}" != 1 ]; then /usr/bin/open "http://127.0.0.1:$port/"; fi
    wait "$server_pid"
    exit 0
  fi
  /bin/sleep 0.2
done
echo 'MiCOVE did not become ready.'
exit 1
'''
