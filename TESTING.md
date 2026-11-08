# On-demand validation

Choose validation according to the change. None of the commands below runs from
`portable.py update`, a Git hook, or an automatic job. The updater keeps its
existing package-integrity and installation checks; those are separate from
these developer tests.

| Change or occasion | Validation |
| --- | --- |
| Routine edit | Syntax checks and the focused test for the changed feature; inspect the browser for UI changes. |
| Dataset loading, population filtering, selection, or saved-view changes; before sharing a release | Run the integration test against a matching built app and its installed datasets. |
| Saved-coordinate materialization or reference-anchor changes; occasional deliberate audit | Add `--audit-layouts` to run the exhaustive saved-layout audit. This is not required for every edit or every release. |

## Short commands

From the source clone, run these only when you want to validate:

```sh
./scripts/micove-test
./scripts/micove-test-audit
./scripts/micove-test-layout
```

The first runs integration checks; the second adds the exhaustive layout audit.
The third runs only the standalone graph-layout checks.
All three use `~/micove/web/index.html` by default and recognize the former default
app location for older installations. Supply a built entry as the sole argument,
or set `MICOVE_TEST_PAGE` once in your shell configuration for a development build:

```sh
export MICOVE_TEST_PAGE="/path/to/development/index.http.html"
```

An explicit argument takes precedence over `MICOVE_TEST_PAGE`. The previous
shortcut names and environment variable remain supported for compatibility.
Paths containing spaces are supported. None of these commands builds, updates,
or refits anything.
To use the names from any directory, add the clone's `scripts` directory to
your shell's PATH, for example in `~/.zshrc`:

```sh
export PATH="$HOME/micove-source/scripts:$PATH"
```

Open a new terminal after changing shell configuration. You can then type
`micove-test`, `micove-test-audit`, or `micove-test-layout`. Each accepts `--help`.

## Requirements and scope

Use Node.js (verified with 23.11.0); no npm dependencies are required. Run from
the source repository. The test reads a **built HTTP entry page** and its local
manifest assets, not a URL, offline export, or source `viewer.html`. No server
needs to be running. Use a trusted local MiCOVE build: the test executes its
application JavaScript in a simulated browser environment.

The Git clone contains no scientific data. Obtain datasets and metadata
directly from Pawel Gajer on an individual basis, under their own access and reuse
terms. The full integration test currently requires these dataset IDs in the
built app:

- `comb-V3V4-tx`, including deferred display and graph-layout fragments;
- `comb-V4-tx`;
- `umb-hmp-2019-panel` (40-participant panel);
- `zapps-pressmat-v4`.

It also checks loading and sample hover text for every additional dataset in
that manifest. The current rebuilt-reference fixture has 24,465 source records.
Use the matching supplied package and supplements; a smaller installation may
not contain all fixtures. Missing required fixtures stop the test rather than
produce a partial full-pass result. Prepared participant summaries and bundled
neighborhoods are optional and their availability is reported in the result.
Separately linked neighborhoods are not audited by this command.

The shared-viewer integration harness requires bundle-format datasets. AGP and
skin population viewers use separate adapters and dedicated tests; an installation
containing those entries cannot currently be passed wholesale to this legacy
harness. For a shared-viewer change, prepare a test installation with the four
required datasets and the affected bundle-format dataset (for example LSVF).
Do not alter scientific checksums or dataset identities to make the harness pass.


When SANTE is installed, integration also checks its 953 admitted samples,
325 participants, verified analyzed depths, control exclusion and unavailable
VALENCIA2 annotations, plus representative local and participant joint views
for both max-normalized methods. These checks do not rerun scientific fits.

Build or install the source revision you intend to validate first, following
[the portable instructions](PORTABLE.md). The test checks the application stored
in the entry page's manifest; editing the source clone alone does not update
that built application. Do not change dataset checksums or expected populations
to work around a mismatched installation.

## Integration checks

For an installed app at `~/micove`, run:

```sh
node rank2_feature_graph/verify_http_assets.mjs "$HOME/micove/web/index.html"
```

For a development build, pass its `index.http.html` instead. Absolute paths are
accepted, so the public checkout can test a separately built app without copying
data into the repository.

This mode exercises dataset admission and switching, sample hovers, failed and
stale lazy loads, representative edge and vertex selections, eight graph layout
settings, four participant-view restorations, saved cameras, population
compatibility, and pure-core/non-core counts. It checks that scientific bundles
are unchanged. It does **not** scan every saved layout.

## Standalone graph-layout checks

For focused graph-layout, camera, or named-view changes, run on demand:

```sh
./scripts/micove-test-layout
# Or call the test directly:
node rank2_feature_graph/verify_graph_layout.mjs "$HOME/micove/web/index.html"
```

When calling the Node test directly, omitting the argument uses `index.http.html`
in the current directory. `EXPLORER_HTML` remains supported by that direct call,
but must name a built HTTP entry; an explicit argument takes precedence. The
shortcut instead follows `MICOVE_TEST_PAGE` and the installed-app default above.
The test reads the entry's local, checksum-verified
application, loader, validator and dataset assets. No HTTP server is required.
Offline exports and source templates are rejected with an actionable message.

It requires `comb-V3V4-tx` and `comb-V4-tx`, and checks the installed datasets'
2D/3D spring layouts, equal/proportional targets, whole-reference counts,
cohort independence, camera preservation, dataset-scoped preferences, named-view
compatibility and a dense 100% pure-state graph. Portable-coordinate restoration
uses a context without a supplied R fit. Frozen scientific bundles are hashed
individually to detect mutation without serializing the entire asset bank.

This is a simulated-browser test, not a WebGL rendering check. It does not run
an R service, rebuild the app, audit every saved layout, or run during updates.

## Exhaustive saved-layout audit

Run explicitly when needed:

```sh
node rank2_feature_graph/verify_http_assets.mjs "$HOME/micove/web/index.html" --audit-layouts
```

This runs the integration checks plus the separate
[`audit_saved_layouts.mjs`](rank2_feature_graph/audit_saved_layouts.mjs) module.
The additional audit loads all saved comb-V3V4-tx display-fit fragments and
checks the merged group, vertex-union and overview layouts across the available
cohorts and coverage levels. It compares record membership and coordinates with
the frozen fits, and reference anchors with independently scanned abundance
maxima. On the current fixture this covers 225 views, 14,971 layouts, and 48,314
anchors. Counts and elapsed seconds are reported for the package actually tested.
This is an audit of stored results, not an exhaustive test of every MiCOVE interaction
or every embedding family.

Neither mode fits new embeddings, changes datasets on disk, launches a browser,
or writes to browser preferences. The exhaustive mode can take substantially
more time and memory, so run it deliberately, not as part of ordinary updates.

## Narrow hover checks and results

For a hover-only change, use:

```sh
node rank2_feature_graph/verify_http_assets.mjs "$HOME/micove/web/index.html" --hover-only
```

This runs dataset admission/switching and hover checks and exits before the
broader selection and layout checks. It requires at least two datasets, including
coverage-dependent merged memberships. It is not a full integration pass.
`--hover-only` and `--audit-layouts` are mutually exclusive. `--help` prints usage.

A successful run exits with status 0 and prints JSON identifying its coverage.
The default integration result explicitly labels the exhaustive audit `not-run`.
An assertion or missing asset exits nonzero; preserve the error and identify the
source revision and data package when reporting it. Optional checks absent from
the package are not claimed as passed.

These tests use DOM and Plotly substitutes. They verify data flow and saved
geometry, not actual WebGL rendering, tooltip placement, or visual appearance.
UI changes still need a focused browser inspection. No browser pass or rebuild
is needed solely for edits to this test or its documentation.

For changes to dataset-specific max-normalized embeddings, run
`node rank2_feature_graph/test_dataset_maxnorm.mjs` and
`python3 -m unittest discover -s scripts -p 'test_dataset_maxnorm_supplement.py'`.
These focused checks cover routing, duplicate records, participant cache separation,
revision/membership validation and incomplete-bank rejection. They require no
scientific dataset. The full integration check exercises installed supplements
when present; it never generates coordinates.

For separately supplied unfolded-coordinate banks, run
`python3 -m unittest discover -s scripts -p 'test_unfolded*py'` and
`node rank2_feature_graph/test_unfolded_views.mjs`. The edge reader admits only
reviewed ZAPPS, LSVF and HMP 40 releases. Assay record lists take precedence over
source-cohort labels, and every frozen selection must match its recorded
population. Banks retain both endpoint anchors and the full-dataset,
observation-weighted original-abundance default.

When both unfolded banks are installed, default HTTP integration tests one edge
and vertex in every LSVF and HMP 40 population, pure/merged mode and coverage
(70 and 50 contexts respectively). It checks both edge anchors, new-context
defaults, explicit off, selection history, named views, sample/color preservation
and unavailable L∞ unfolding. This is separate from the exhaustive saved-layout
audit. Browser checks must additionally inspect rendered normal/maximized views
and the stress dialog, including both tested-start errors.

When their coordinate supplements are installed, the integration test also checks
ZAPPS + PreSSMat, LSVF and HMP+U01 (40-participant panel) max-normalized
Euclidean/L∞ population, local-selection,
cohort or assay-subset, participant joint and saved-view routes. It checks that
method changes preserve samples and assignments. Missing optional banks are
reported as unavailable; they are never fitted by the test or updater.

## Enrollment association viewer

Run `node rank2_feature_graph/test_associations.mjs` for the synthetic
association schema, denominator isolation, all four coverages and cohorts,
unavailable/infinite estimates, comparison rendering and CSV checks.
It optionally checks a locally supplied enrollment supplement. The private
preparation test also reconciles original enrollment ledgers and independently
checks exact conditional probabilities and confidence limits. These checks
remain on demand and are not invoked by the update command.

See [association usage and methods](rank2_feature_graph/ASSOCIATIONS.md).


## Longitudinal viewer checks

Run the following on demand, separately from installation and updates:

```sh
node rank2_feature_graph/test_participant_exploration.mjs
node rank2_feature_graph/test_enrollment_heatmap.mjs
node rank2_feature_graph/test_state_transitions.mjs
node rank2_feature_graph/test_transition_bayes.mjs
node rank2_feature_graph/test_longitudinal_clusters.mjs
python3 -m unittest discover -s scripts -p test_meeting_release.py
```

These use synthetic examples and optionally available local assets. They do not
refit models. Dataset-specific preparation checks remain with their scientific
projects. The full HTTP integration test requires the four datasets listed in
its help; use an all-dataset installation for release validation. A recipient
with a smaller subset does not need to run these checks to install or update.

## AGP population

Optional outcome-estimate checks and their data requirements are documented in
[AGP_OUTCOMES.md](rank2_feature_graph/AGP_OUTCOMES.md). They remain on demand,
outside installation and updates, and never fit models.

Graph picking checks are also on demand:

```sh
node rank2_feature_graph/test_agp_graph_picking.cjs
node rank2_feature_graph/test_agp_graph_picking_browser.cjs http://127.0.0.1:4173 /path/to/population.json
```

The first checks click/drag event ordering and hit priorities. The browser test
uses physical mouse actions in real WebGL scenes at all three 1-CST coverages,
all three geometries and both graph memberships. It verifies one selection per
press, sphere/flat-marker/label/edge clicks, rotation, normal/maximized panels,
and exact sample identities and boundary highlights. It runs no fits and is
not part of the update command.

For the separately supplied 1-CST graph-layout bank, add `--connection-layouts`
to the browser command. It exercises all four graph algorithms, all three
geometries and coverages, pure/merged graphs, both target-length rules, physical
vertex/edge clicks, unchanged sample coordinates and selection navigation.
Run `COSMIX_AGP_LAYOUTS=/path/to/package python3 -m unittest discover -s scripts -p test_agp_connection_layouts.py` for fresh installation, upgrade, repeated
installation, corruption rejection and unchanged prior data assets. These
checks remain on demand and outside the update command.
Add `--connection-layouts` to `test_agp_persistence.cjs` to verify the new
connection-layout method, targets, camera and active selection across reloads.

For browser-local state restoration, run on demand against an installation with
the reviewed AGP local, unfolded and connection supplements:

```sh
node rank2_feature_graph/test_agp_persistence.cjs http://127.0.0.1:4173
```

This uses an isolated Playwright/Chrome context to check reload, reopening a tab,
switching to comb-V3V4-tx and back, selected states/connections, navigation,
appearance, cameras and invalid/unavailable browser storage. It does not alter
your browser preferences, run models or join the ordinary update command.

The optional pure 1-CST connection bank and its on-demand integrity/browser
checks are documented in [AGP connections](rank2_feature_graph/AGP_CONNECTIONS.md).
Check pure versus merged mode, all three geometries and neighbor counts,
inclusive/two-state-only boundaries, thresholds, edge details/highlights,
navigation, reference spheres, and a representative ordinary dataset.
The tests verify unchanged sample identities and coordinates; no fits run.

Install the separate reviewed AGP population using
`python3 scripts/portable.py update --agp-population /path/to/population.json`.
Updates remember the supplied file. Both reviewed epoch-200 and epoch-500 population packages are supported.
To upgrade, supply the epoch-500 `population.json` once with the same command.
Keep its optional reference, graph-layout, local and unfolded supplements beside it.
The population update preserves state memberships. Local fits retain their own
epoch budgets and evaluation targets. The test checks displayed population errors,
epoch counts and rendered coordinates against the supplied package. It uses Playwright
and Chrome. Place the optional `local-1cst-all.json` beside `population.json` for all pure and merged 1-CST views at 70%, 80% and 90%. For the reviewed full metric-MDS maps, place `local-1cst-through-5006.json` beside `population.json`. That supplement keeps the 400-pivot maps for memberships above 5,006 samples. To use the reviewed 4,000-pivot maps for all four larger *B. dorei* memberships as well, place `local-1cst-reviewed.json` beside `population.json`. This newest supplement contains every local map, takes precedence over older supplements, and does not require the older files. MiCOVE reports all-pairs error and ten-neighbor recovery for both these sparse fits and the smaller full fits. To enable **Unfold faces** for both max-normalized local methods, add `local-1cst-unfolded.json` beside the reviewed bank. Pure states already lie on their anchor face. The browser check verifies map selection, unfolding and restoration of the ordinary coordinates at each coverage. Older installations with only `local-1cst-pilot.json` retain the two pilot states at 70%. Run `node rank2_feature_graph/test_agp_population.cjs http://127.0.0.1:4173 /path/to/population.json`
with the origin of the running installation. It checks all four coverage schemes,
both assignment settings and the three saved population geometries.


The optional matched pair `local-1cst-error500.json` and
`local-1cst-unfolded-error500.json` supersedes the reviewed local banks. It adopts
16 saved pilot maps (nine ordinary, seven unfolded) with lower all-pairs RMS
relative distance error; neighbor recovery is not an adoption criterion. All
other fits and memberships remain unchanged. Install them beside the supplied
population file; the updater rejects mismatched ordinary/unfolded banks.

Run the data-backed adoption and upgrade checks on demand:

```sh
COSMIX_AGP_ERROR500=/path/to/new-package \
COSMIX_AGP_PREVIOUS=/path/to/previous-package \
python3 -m unittest discover -s scripts -p test_agp_epoch500.py
```

These checks use existing saved assets, do not run fits, and are outside the
update command. The browser integration test above also recognizes the new pair.

Optional correlation-graph weighted-GRIP service: see [GRAPH_LAYOUTS.md](GRAPH_LAYOUTS.md)
for the focused JavaScript, HTTP and real-R tests. These run only on demand and
are not part of installation or updating.
