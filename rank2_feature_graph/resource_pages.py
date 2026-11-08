"""Generate local help pages from the same checked payload as the explorer."""
import hashlib
import re
import csv
import io
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo
from html import escape
from urllib.parse import quote
from policy_document import policy_html
from taxon_palette import load_palette, palette_html

# Presentation only: frozen dataset IDs, revisions and scientific assets stay intact.
DATASET_PRESENTATION = {
    'umb-hmp-2019-panel': {
        'title': 'HMP+U01 · 40-participant panel',
        'methodsPrefix': 'University of Maryland HMP and U01 cohorts. This 40-participant panel contains 1,611 HMP and 670 U01 observations. Source filenames are date-stamped April 9, 2019 (040919 panel) and June 13, 2019 (061319 combined table); these are source-version dates, not collection dates.'},
    'hmp-u01-2019': {
        'title': 'HMP+U01 · 152-participant release',
        'methodsPrefix': 'University of Maryland HMP and U01 cohorts. This 152-participant release contains 4,863 HMP and 1,661 U01 observations. The combined source filename is date-stamped June 13, 2019 (061319); this is a source-version date, not a collection date.'},
}


def coverage_terminology(text):
    """Update display prose only; underscore/camelCase field names remain intact."""
    return re.sub(r'\b(?:reference[- ]core|reference state|core) target(s?)\b',
                  lambda m: ('Largest' if m.group(0)[0].isupper() else 'largest') +
                  ' 2-CSTs coverage' + (' levels' if m.group(1) else ''), text, flags=re.I)


def cst_terminology(text):
    """Render legacy prose without modifying frozen metadata or machine identifiers."""
    text = coverage_terminology(text)
    text = re.sub(r'\b([1-9][0-9]*|k)-udCST(s?)\b', r'top-\1 CST\2', text)
    text = re.sub(r'\b([1-9][0-9]*|k)-dCST(s?)\b', r'ordered top-\1 CST\2', text)
    return text.replace('rank-2 states', 'top-2 CSTs').replace('Rank-2 states', 'Top-2 CSTs')


def display_metadata(meta):
    presentation = DATASET_PRESENTATION.get(meta['id'], {})
    return {**meta, 'title': presentation.get('title', meta['title']),
            'methods': cst_terminology(' '.join(filter(None, [presentation.get('methodsPrefix'), meta.get('methods')]))),
            'localDescription': cst_terminology(meta.get('localDescription', ''))}


STYLE = '''body{margin:0;background:#f3f7f8;color:#193b49;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}nav{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}a{color:#086882;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #c47722;outline-offset:3px}h1,h2,h3{line-height:1.25}section,.dataset{background:white;border:1px solid #cadce3;border-radius:10px;padding:22px;margin:18px 0}.datasets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:18px}.dataset{margin:0;min-width:0}small{display:block;color:#4d6570}code{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #cadce3;padding:8px;text-align:left;overflow-wrap:anywhere}details{margin:16px 0}summary{cursor:pointer;font-weight:600}.button{display:inline-block;padding:8px 14px;border:1px solid #086882;border-radius:6px;background:#edf6f8}article{overflow-x:auto}@media(max-width:600px){main{padding:14px}section,.dataset{padding:16px}}'''


def page(title, body, explorer):
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)} · MiCOVE</title><style>{STYLE}</style></head><body><main>'
            f'<nav aria-label="MiCOVE resources"><a class="button" href="{escape(explorer)}">Open explorer</a>'
            '<a href="about.html">About, datasets and methods</a><a href="quality.html">Quality preview rules</a>'
            '<a href="reports/index.html">Vaginal microbiome report dashboard</a></nav>'
            f'<h1>{escape(title)}</h1>{body}</main></body></html>')


def source_digest(here):
    """Fingerprint builder/viewer/helper sources, policy and palette contents."""
    files = sorted([*here.glob('*.py'), *here.glob('*.js'), *here.glob('*.mjs'), *here.glob('*.R'),
                    *here.glob('mutual_overlap_ui/*'), here/'viewer.html', here/'QUALITY_PREVIEW_POLICY.md', *here.glob('palettes/*.csv')])
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(here).as_posix().encode()+b'\0'+path.read_bytes()+b'\0')
    return digest.hexdigest()


def build_identity(here):
    """Capture once per build; retain a usable source version outside Git too."""
    fingerprint = source_digest(here)
    commit, state = '', 'unavailable'
    try:
        def git(*args):
            return subprocess.check_output(['git', '-C', str(here.parent), *args],
                                           stderr=subprocess.DEVNULL, text=True).strip()
        commit = git('rev-parse', 'HEAD')
        state = 'modified' if git('status', '--porcelain', '--untracked-files=normal') else 'clean'
    except (OSError, subprocess.CalledProcessError):
        pass
    return dict(build_date=datetime.now(ZoneInfo('America/New_York')).isoformat(timespec='seconds'),
                build_timezone='America/New_York', source_commit=commit, source_tree_state=state,
                source_version=(commit[:12]+(' + modified sources' if state=='modified' else '')) if commit else 'sha256:'+fingerprint[:12],
                source_sha256=fingerprint)


def coverage_section(payload, report, identity=None):
    """Describe the just-validated assembled page, never infer completeness from files."""
    bundles = payload['bundles']
    families = payload.get('embeddingFamilies', [])
    intro = 'Coverage was not verified for this development preview.'
    details = ''
    if report is not None:
        joint = report.get('participantEmbeddings', {})
        if (report.get('status') != 'PASS' or not report.get('graphChecked')
                or report.get('networkFits') != 0
                or not report.get('scientificBundlesUnchanged')
                or joint.get('status') != 'PASS' or not joint.get('participantDataUnchanged')
                or set(report.get('datasets', {})) != {b['dataset']['id'] for b in bundles}
                or set(joint.get('datasets', {})) != set(payload.get('participants', {}))):
            raise ValueError('About coverage must match the successfully validated build')
        intro = (f"Verified during this build: {report['contexts']:,} graph settings and "
                 f"{joint['selections']:,} participant selections, with no on-demand fitting. "
                 'Counts apply to this copy of MiCOVE; rebuilding checks and refreshes this summary.')
        comparisons = report.get('sensitivityComparisons', {})
        if payload.get('sensitivityComparisonsAvailable') and set(comparisons) != {'fixed','rebuilt'}:
            raise ValueError('Published sensitivity views require their own coverage verification')
        if comparisons:
            if set(comparisons) != {'fixed','rebuilt'} or any(
                    c.get('status') != 'PASS' or not c.get('contexts')
                    or c.get('participantEmbeddings', {}).get('status') != 'PASS'
                    or c.get('participantEmbeddings', {}).get('participantDataUnchanged') is not True
                    for c in comparisons.values()):
                raise ValueError('Incomplete sensitivity comparison coverage')
            intro += (f" The two reference-coverage sensitivity comparisons additionally passed "
                      f"{sum(c['contexts'] for c in comparisons.values()):,} graph settings and "
                      f"{sum(c['participantEmbeddings']['selections'] for c in comparisons.values()):,} participant selections.")
        c = report['controls']
        names = {'spring': 'Spring', 'mds': 'metric MDS', 'grip': 'GRIP', 'weighted_grip': 'weighted GRIP'}
        methods = ', '.join(names.get(m, m) for m in c['methods'])
        strengths = c['proportionStrengths']
        details = ('<details><summary>What availability covers</summary>'
                   f'<p>Graph layouts: {escape(methods)}, in {escape(" and ".join(c["dimensions"]))} dimensions. '
                   'Equal edge targets and scaled state-proportion targets are checked at every available '
                   f'strength ({len(strengths)} settings, {min(strengths):g}–{max(strengths):g}). '
                   'Saved reference layouts are also available.</p>'
                   '<p>Participant selections count each participant/cohort/episode entry at each supported '
                   'state mode and largest 2-CSTs coverage. Participants with the same occupied states may share '
                   'a joint embedding. Reference-only means using existing full-reference coordinates, '
                   'rather than a joint embedding fitted to samples in the participant’s occupied states. '
                   'It is an intentional mode, not a missing fit.</p></details>')

    def modes(values):
        return escape(' and '.join({'pure': 'Pure states', 'merged': 'Merged groups'}.get(v, v) for v in values))

    def targets(values):
        return 'Targets: ' + escape(', '.join(str(v) + '%' for v in sorted(values, key=int)))

    rows = []
    exports = []
    identity = identity or dict(build_date='', build_timezone='', source_version='Unavailable',
                                source_commit='', source_tree_state='unavailable', source_sha256='')
    for b in bundles:
        meta = display_metadata(b['dataset'])
        graph = participant = 'Not verified in this preview'
        reference = 'Not verified'
        exported = dict(dataset_id=meta['id'], dataset=meta['title'],
                        dataset_revision=meta.get('revision', ''),
                        verification='Verified' if report is not None else 'Not verified',
                        graph_layout_availability='Not verified',
                        participant_joint_embedding_availability='Not verified',
                        reference_only_modes='Not verified')
        if report is not None:
            g = report['datasets'][meta['id']]
            exported.update(graph_layout_availability='Available',
                            graph_settings=g['contexts'], distinct_graph_layouts=g['distinctLayouts'],
                            graph_state_modes='; '.join(g['modes']),
                            graph_reference_core_targets='; '.join(str(v)+'%' for v in sorted(g['targets'], key=int)))
            graph = (f'<strong>Available</strong><small>{g["contexts"]:,} settings · '
                     f'{g["distinctLayouts"]:,} distinct layouts</small>'
                     f'<small>{modes(g["modes"])}<br>{targets(g["targets"])}</small>')
            p = joint['datasets'].get(meta['id'])
            participant = 'Not applicable — no Participant mode'
            reference = 'None required'
            exported.update(participant_joint_embedding_availability='Not applicable',
                            reference_only_modes='None required', notes='No Participant mode')
            if p:
                exported.update(participant_joint_embedding_availability='Available',
                                participant_entries=p['participants'], participant_selections=p['selections'],
                                participant_state_modes='; '.join(p['modes']),
                                participant_reference_core_targets='; '.join(str(v)+'%' for v in sorted(p['targets'], key=int)),
                                reference_only_modes='; '.join(p['referenceOnlyModes']) or 'None required',
                                notes='Participant entries distinguish cohort and episode; selections count supported state modes and targets.')
                participant = (f'<strong>Available</strong><small>{p["participants"]:,} participant entries · '
                               f'{p["selections"]:,} selections</small>'
                               f'<small>{modes(p["modes"])}<br>{targets(p["targets"])}</small>')
                if p['referenceOnlyModes']:
                    reference = f'<strong>{modes(p["referenceOnlyModes"])}</strong><small>Participant samples use saved reference coordinates.</small>'
                    exported['notes'] += ' Reference-only modes use saved full-reference coordinates.'
        exports.append(exported)
        rows.append(f'<tr data-coverage-dataset="{escape(meta["id"])}"><th scope="row">{escape(meta["title"])}</th>'
                    f'<td>{graph}</td><td>{participant}</td><td>{reference}</td></tr>')
    for f in families:
        exports.append(dict(dataset_id=f['id'], dataset=f['title'], dataset_revision=f.get('revision', ''),
                            verification='Not applicable', graph_layout_availability='Not applicable',
                            participant_joint_embedding_availability='Not applicable',
                            reference_only_modes='Sample embedding collection only',
                            notes='No state graph or participant trajectories.'))
        rows.append(f'<tr data-coverage-dataset="{escape(f["id"])}"><th scope="row">{escape(f["title"])}</th>'
                    '<td>Not applicable</td><td>Not applicable</td>'
                    '<td>Sample embedding collection only; no state graph or participant trajectories.</td></tr>')
    # Embed the export so standalone About pages and the loopback server share
    # exactly the displayed build snapshot, without a separately stale CSV file.
    columns = ['dataset_id', 'dataset', 'dataset_revision', 'verification',
               'graph_layout_availability', 'graph_settings', 'distinct_graph_layouts',
               'graph_state_modes', 'graph_reference_core_targets',
               'participant_joint_embedding_availability', 'participant_entries', 'participant_selections',
               'participant_state_modes', 'participant_reference_core_targets', 'reference_only_modes', 'notes']
    columns += ['build_date', 'build_timezone', 'source_version', 'source_commit', 'source_tree_state', 'source_sha256']
    for row in exports:
        row.update(identity)
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    # Keep dataset metadata literal when opened in spreadsheet applications.
    writer.writerows({k: "'"+v if isinstance(v, str) and v.startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else v
                      for k, v in row.items()} for row in exports)
    download = 'data:text/csv;charset=utf-8,' + quote('\ufeff' + stream.getvalue(), safe='')
    return ('<section id="view-coverage"><h2>Precomputed view coverage</h2>'
            f'<p class="coverage-build">Built: <time datetime="{escape(identity["build_date"])}">{escape(identity["build_date"] or "Unavailable")}</time> '
            f'{escape(identity["build_timezone"])}<br>Source version: <code>{escape(identity["source_version"])}</code>'
            f'<small>Source-content SHA256: <code>{escape(identity["source_sha256"] or "Unavailable")}</code></small></p>'
            f'<p>{escape(intro)}</p><p><a class="button" download="vme-view-coverage.csv" href="{download}">Export coverage CSV</a></p>'
            '<div class="coverage-scroll" tabindex="0" role="region" aria-label="Dataset view coverage">'
            '<table class="coverage"><caption>Availability by dataset and state mode</caption><thead><tr>'
            '<th scope="col">Dataset</th><th scope="col">Graph layouts</th>'
            '<th scope="col">Participant joint embeddings</th><th scope="col">Reference-only modes</th>'
            '</tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>' + details + '</section>')


STYLE += '.coverage-scroll{overflow-x:auto}.coverage{min-width:720px}.coverage caption{text-align:left;margin-bottom:10px}.coverage th{background:#edf6f8}.coverage td,.coverage th{vertical-align:top}.coverage small{margin-top:4px}.coverage-scroll:focus-visible{outline:3px solid #c47722}'


def resource_pages(here, payload, explorer='index.html', *, coverage=None, identity=None):
    identity = identity or build_identity(here)
    if source_digest(here) != identity['source_sha256']:
        raise ValueError('MiCOVE sources changed during the build; rebuild before publishing')
    cards = []
    for bundle in payload['bundles']:
        meta = display_metadata(bundle['dataset'])
        supplement = payload.get('participants', {}).get(meta['id'])
        support = 'Participant trajectories are not available for this dataset in this build.'
        if supplement:
            records = supplement['records']
            people = {(r['cohort'], r['subject']) for r in records if r.get('subject')}
            scope = 'ZAPPS + PreSSMat subset' if meta['id'] == 'comb-V4-tx' else 'Released participant metadata'
            support = (f'{scope}: {len(records):,} records; {len(people):,} identified participants. '
                       f'{supplement.get("summary", {}).get("missingIdentity", 0):,} records lack participant identity. '
                       'Participant trajectories, composition tables and quality previews are available. '
                       'Visit order and elapsed time depend on verified metadata; unknown timing stays explicit.')
        if meta['id'] in payload.get('recordAdapters', {}):
            support = support.replace('Released participant metadata', 'Reviewed metadata; inherited scientific release holds retained').replace('identified participants', 'participant/episode keys')
            support += (' All five merged reference targets and precomputed subject-state joint embeddings are available; pure views retain frozen coordinates. Scientific release holds remain in force.' if payload.get('combDisplayAvailable') else ' Record/study views reuse frozen coordinates. Merged states and subject-state joint embeddings are not prepared.')
        modes = 'Pure states and merged groups' if bundle.get('cohortAnalysis') or meta['id']=='comb-V3V4-tx' and payload.get('combDisplayAvailable') else 'Pure states'
        eligibility = payload.get('recordAdapters', {}).get(meta['id'], {}).get('eligibility')
        population_note = f"{len(bundle['data']['samples']['ids']):,} {escape(meta['observationLabel'])} in the full sample representation"
        revision_note = escape(meta['revision'])
        if eligibility:
            profile_count = len({r['profile'] for r in payload['recordAdapters'][meta['id']]['records']})
            population_note = f"{eligibility['retainedRecords']:,} eligible records · {profile_count:,} distinct compositions"
            support += " 82 explicit laboratory controls excluded; 548 low-reference-coverage records retained with diagnostics. Original data and control QC assets remain archived."
            if payload.get('sensitivityComparisonsAvailable'):
                support += (" The Population comparison selector also offers two 24,465-record sensitivity views "
                            "excluding <90% VALENCIA2 reference-matched abundance: fixed baseline reference or "
                            "rebuilt reference. Neither replaces this dataset or establishes nonvaginal origin. "
                            "Existing Li/Lc neighborhoods remain on the current baseline.")
            support = support.replace("pure views retain frozen coordinates", "pure views use corrected-population fits or explicitly labelled restrictions")
            revision_note += " / eligibility: " + escape(eligibility['revision'])
        cards.append(f'''<article class="dataset" data-dataset="{escape(meta['id'])}">
<h3>{escape(meta['title'])}</h3><p>{population_note} · {meta['featureCount']:,} features.</p>
<p>{escape(support)}</p><p>{modes}; sample embeddings and feature graphs.</p>
<a class="button" href="{escape(explorer)}?dataset={quote(meta['id'], safe='')}">Explore {escape(meta['title'])}</a>
<details><summary>Dataset methods and limitations</summary><p>{escape(meta.get('methods', 'See dataset methods in the explorer.'))}</p><p>{escape(meta.get('localDescription', ''))}</p></details>
<small>Dataset release: <code>{revision_note}</code></small></article>''')
    for family in payload.get('embeddingFamilies',[]):
        cards.append(f'''<article class="dataset" data-dataset="{escape(family['id'])}">
<h3>{escape(family['title'])}</h3><p>Choose Li or Lc, then comb-V3V4-tx or comb-V4-tx, then 2k, 4k or 8k distinct compositions. Collections remain separate.</p>
<p>V3–V4: 360 unchanged historical MDS embeddings and six PCA views. V4: six new original-abundance Euclidean 3D sparse-SGD embeddings. This collection provides embedding inspection, not new rank-2 assignments or participant trajectories.</p>
<p>{escape(family['selectionRule'])} {escape(family['limitations'])}</p>
<a class="button" href="{escape(explorer)}?dataset={quote(family['id'],safe='')}">Explore {escape(family['title'])}</a><small>Asset release: {escape(family['revision'])}</small></article>''')
    # Identify the actual source content, including uncommitted edits, rather than
    # labelling a working-tree build with a potentially stale Git commit alone.
    body = '''<p>MiCOVE connects sample compositions, community states and participant observations. The explorer opens directly; this page provides context and dataset documentation.</p>
<section><h2>Start exploring</h2><p>Select a dataset, then a state or participant. Sample plots show composition geometry; feature graphs organize states by their taxa. Use named views to save the dataset, selection, highlighted background states and camera, or export those views as JSON for another browser with the same dataset release.</p><p>Default startup: UMB HMP when included, Merged groups, 60% largest 2-CSTs coverage, and weighted GRIP with scaled state-proportion edge lengths. Dataset availability is specific to this local build.</p></section>
<h2>Datasets included in this build</h2><p>Counts below describe each released representation, before display filters. Records, distinct compositions and participants are different units. Datasets retain their own assay, taxonomy and population definitions; their coordinates are not a shared embedding.</p>
<div class="datasets">'''+''.join(cards)+'''</div>
<section id="terminology"><h2>Community-state terminology</h2>
<p>Select the <em>k</em> most abundant taxa of a sample, with t<sub>(j)</sub> denoting the taxon at abundance rank <em>j</em>.</p>
<table><thead><tr><th>Construction</th><th>Name</th><th>Representation</th></tr></thead><tbody>
<tr><td>Retains abundance order</td><td>Ordered top-k CST</td><td>(t<sub>(1)</sub>, …, t<sub>(k)</sub>)</td></tr>
<tr><td>Discards abundance order</td><td>Top-k CST</td><td>{t<sub>(1)</sub>, …, t<sub>(k)</sub>}</td></tr></tbody></table>
<p>A top-2 CST {<i>L. iners</i>, <i>L. crispatus</i>} includes either species ranked first and the other second. Its ordered counterpart specifies which is first. Neither type requires a minimum combined abundance. Dataset-specific tie and positive-taxon rules remain unchanged; see Dataset methods.</p>
<p>Earlier names were k-udCSTs for unordered types and level-k dominance CSTs (k-dCSTs) for ordered types. Use <strong>top-2 CSTs</strong> in prose, without a plural apostrophe. Existing assignments, dataset identifiers, old links and saved views are preserved. Legacy machine field names remain compatible.</p>
<p><strong>Distinct constructions:</strong> merged groups need not match a sample’s original top-2 CST. “Assigned-pair abundance order” compares an assigned core pair and is not necessarily an ordered top-2 CST. A whole-sample ≥95% vertex is a mass-qualified display state; an ordinary top-1 CST requires only the most abundant taxon.</p></section>
<section><h2>How to interpret the views</h2><ul>
<li><strong>Original top-2 CST pair:</strong> the sample’s unordered leading pair of taxa. A single-positive sample may have no pair.</li>
<li><strong>Assigned merged group:</strong> the reference core receiving a sample under the saved assignment procedure. Its named taxa need not be the sample’s dominant taxa. The largest 2-CSTs coverage selects cores; merged views retain the selected population.</li>
<li><strong>Graph geometry:</strong> vertices represent taxa and edges represent pairs. Layout choices include metric MDS, GRIP and weighted GRIP. Equal or scaled proportion-based edge targets are display choices; fitted edge lengths are approximate. Endpoint L2 distance is a full-composition Euclidean distance in percentage points, not the drawn edge length.</li>
<li><strong>Top-3 CST faces:</strong> triangles represent original leading triples with independent count, percentage and coverage filters. A face may appear even when some of its edges are absent from the selected pair graph.</li>
<li><strong>Subject trajectories:</strong> observations follow verified visit order or time within a fixed reference. Merged groups are the default where supported, density is off, and ≥95% single-taxon and separately identified within-pair endpoint rules are on. Interval endpoints name taxa; connecting lines do not establish unobserved intermediate states. Visit order spacing does not imply equal elapsed time.</li>
<li><strong>Quality preview:</strong> flags identify read-depth or assignment-support concerns without removing observations or changing assignments. State-size counts refer to the trajectory reference population, not the participant’s number of visits.</li></ul>
<p><a href="quality.html">Read the quality preview rules</a> for thresholds, count sources, missing evidence and interpretation.</p></section>
<section><h2>Local access and reproducibility</h2><p>The loopback address opens MiCOVE on the computer running it. Share named-view JSON with someone who has the matching dataset release; a localhost link does not publish the application or datasets. Generated pages and scientific assets stay outside the source-only Git repository.</p><p>This page and the quality page are regenerated with the explorer. Reload after a rebuild to see updates; older standalone copies retain their bundled rules and dataset releases.</p>
<details><summary>Application build identity</summary><p>Source-content SHA256: <code>'''+identity['source_sha256']+'''</code>. Dataset release identifiers appear on each card. The quality page displays its rule version and includes the exact Markdown source.</p></details></section>'''
    default_title = next(display_metadata(b['dataset'])['title'] for b in payload['bundles'] if b['dataset']['id'] == payload['default'])
    body = body.replace('UMB HMP when included', escape(default_title))
    body = body.replace('<h2>Datasets included in this build</h2>', coverage_section(payload, coverage, identity) + '<h2>Datasets included in this build</h2>')
    body += palette_html(load_palette(here))
    policy = policy_html(here)
    return {'about.html': page('About, datasets and methods', body, explorer),
            'quality.html': page('Quality preview rules', '<p>These are inspection flags only. Scientific assignments and observations are preserved.</p>'+policy, explorer),
            'QUALITY_PREVIEW_POLICY.md': (here/'QUALITY_PREVIEW_POLICY.md').read_text()}
