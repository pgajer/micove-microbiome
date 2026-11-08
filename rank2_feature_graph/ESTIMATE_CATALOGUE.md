# Exploratory estimate catalogue

The catalogue format describes separately distributed numerical fields for
coloring an existing dataset. It separates the question being estimated from
the 3D coordinates used to display it. Selecting a field must not change sample
membership, state assignments or embedding coordinates.

`estimate_catalogue.py` validates files against an independently reviewed
dataset identity. It does not fit models, approve an assay transformation or
publish results. Passing these checks establishes file integrity and alignment,
not scientific validity, predictive accuracy or permission to distribute data.
The viewer accepts only exports whose producer validation and scientific
identity have been reviewed and pinned in `scripts/estimate_supplement.py`.

## Files and identity

An export directory contains `manifest.json`, `sample-order.json`, and one or
more feature files, called shards. A shard holds numerical arrays for a subset
of the catalogue's series. Keeping arrays out of the manifest allows a viewer
to load one feature at a time. Each file descriptor has `file`, `sha256` and
`bytes`; paths must remain within the export directory, including after resolving
symbolic links. Files must contain strict JSON without duplicate keys or
non-finite numbers.

The manifest has `format: "micove-estimate-catalogue"`, `version: 1`, a producer
`revision`, and these fields matching a trusted identity receipt:

- `datasetId`, `datasetRevision`, `analysisRevision`;
- `sampleCount`, `sampleOrderSha256`, `featureOrderSha256`.

The trusted receipt must come from the existing dataset, not from the submitted
catalogue. It also provides `featureCount` when taxon indices are used. The
sample-order file contains `{"sampleIds": [...]}` with unique IDs in exact
dataset order. Order hashes use the UTF-8 strings joined by LF, with a final LF
and no header. They differ from checksums of complete files.

The validator rejects reordered IDs even if the producer recalculates all file
checksums. Numerical arrays use this same record order; repeated observations
from one participant remain separate records.

## Definitions in the manifest

All registry entries have unique `id` values.

| Registry | Required description |
|---|---|
| `categories` | `label`, `description` |
| `geometries` | `label`, `normalization`, `distance` in the original analysis space |
| `features` | `categoryId`, `label`, `description`, `unit`, `valueType` (`continuous` or `binary`), `transformations` |
| `shards` | `file`, `sha256`, `bytes` |

A taxon feature may also declare its original zero-based `featureIndex`.
A transformation has `id`, `label`, `formulaTex`, `description`, `outputUnit`,
`zeroPolicy` and a `parameters` object. Definitions must state whether a
transformation happens before or after estimation. For example, averaging
log-transformed measurements differs from taking the log of an estimated mean.

Specify the log base and treatment of nonpositive values. For a scaled asinh
transformation, state the positive scale, units, reference population and
weighting used to compute it. A record-weighted median need not equal a median
computed after reducing each participant to one observation. CLR transformations
must define their denominator features and handling of zeros. These scientific
choices require producer review; the validator checks that definitions exist,
not that their prose or parameter values are scientifically appropriate.

A transformation may additionally supply `responseReference` with `mean`,
`participants`, `records`, `relativeMode` (`ratio` or `difference`), `weighting`
and `population`. Counts are nonnegative integers; participants cannot exceed
records or the catalogue population. A finite mean requires answering people;
null is used when there are none. Ratio mode requires a nonnegative mean, and
the UI disables division by zero. The reviewed LSVF extension computes each
participant's available transformed-response mean, then averages people equally.
Signed and logarithmic targets use differences; nonnegative targets use ratios.
This population reference is independent of the current sample selection.

`displayReference` records the extension's revision, source manifest and registry
checksums and arithmetic validation. The scientific catalogue revision and all
prediction shard hashes remain unchanged. Older catalogues without this metadata
still have absolute response bars; relative mode explains the missing supplement.
Native color bars preserve CSS marker colors (including gray context), sample
coordinates and camera, and appear in PNG exports. Percentiles describe color
clipping, not uncertainty; CSVs retain the original estimate and add `display_value`,
`display_mode` and `response_mean`.

The **Target** picker has previous/next buttons in the dropdown order within the
selected feature group. They stop at each end and use the same saved-field
selection as the dropdown, preserving other settings where supported.

## Optional estimate correlations

The `correlations` extension contains an independent revision, one declared
transformation/series per feature and checksum-addressed banks for each shared K,
correlation method and visit mode. It does not replace the original catalogue.
Banks load on demand and preserve the dataset and sample-order identities.
Each bank stores its nonconstant feature indices, excluded constant fields,
upper-triangular correlations (row-major, without the diagonal), complete-linkage
tree and leaf order. The diagonal is one only for included nonconstant fields.

The reviewed LSVF release compares K = 10, 20, 40 and 80 nearest-people fields,
with Spearman or Pearson correlation. All chosen fields share 1,965 query visits
from 1,144 identified participants; unknown identities are excluded. The producer
asserts common support and never fills missing predictions. Unchecked **Average
visits per participant** gives each visit weight one divided by that person's
visit count. Checked averages each person's fields across visits before equal-
person correlation. Weighted Spearman uses weighted mid-distribution ranks and
weighted Pearson correlation of those ranks; exact ties share a rank.

Use unclipped saved estimates. Relative color scales do not change the heatmap.
**Follow graph selection** is initially on: an edge restricts correlations to its
samples in the current cohort, and a vertex to its visible incident-state union.
Unrelated background samples and reference markers are excluded. Clear the graph
selection or uncheck this option to restore the full eligible reference.
Only selected visits contribute in either counting mode; recompute participant
means, equal-person weights, ranks and clusters within the selection. The original
response estimates remain fixed, with no refitting within a state.

Optional `selectionInputs` banks contain one compact, finite float64 little-endian
feature-major array per K, alongside checked feature order, eligible record
indices and participant-group IDs. They preserve exact saved estimate values.
A cancellable background worker computes subset correlations and complete linkage;
only three recent subset results are cached. At least three eligible participants
are required. Constant fields are excluded separately for every subset. The saved
full-reference banks and all original estimate arrays remain unchanged.

**Dynamic Tree Cut** is the default feature clustering, with **Minimum cluster
size = 5** and **Splitting sensitivity = 1** (range 0–4). An independent browser
implementation follows the published Dynamic Hybrid procedure on average linkage
of signed distance `1 - correlation`: branch size, core scatter and separation,
then average-distance assignment respecting the dendrogram and small branches.
Unassigned fields retain label zero and are displayed as Unassigned. This is not
resampling stability and does not guarantee a minimum within-cluster correlation.
The implementation is checked against R dynamicTreeCut 1.63-1 using the optional
reference validator below, including LSVF banks and synthetic examples.

The **Minimum correlation** alternative retains complete linkage cut at `1 - t`,
so every within-cluster pair has correlation at least `t`. Negative correlations
remain visible but are not treated as similarity. Both methods cluster all
nonconstant fields jointly, including diagnostic fields. Group, search and
cluster filters affect display only. Cluster identifiers are specific to the
sample scope, correlation method, visit mode, K and clustering settings. Near-tied
hierarchical merges can differ between R and the browser. Shared-tree validation
checks the cut independently of these numerical ordering choices.

Selecting an estimate group in **Color by** automatically opens its heatmaps in
the catalogue panel. The first is a within-group lower triangle, without the
trivial diagonal; the remaining panels compare that group with each other group.
The focus rows share one order. Cluster boundary lines appear on both axes;
within-group lines stop at the diagonal. Labels use **C3 · [feature name]**,
with the same numeric ID as the Cluster dropdown. The representative maximizes
mean signed correlation to the other members of the full joint cluster
(equivalently, minimizes mean distance `1 - r`). Numerical ties within `1e-12`
use frozen feature order. Singletons represent themselves; Unassigned fields
have no representative. The representative may come from another feature group.
It is a descriptive label, not evidence of biological importance. Display filters
never change representatives; changes to samples or calculation settings can.
Compact axis codes and hover strips share a full-label key above each heatmap. Assay-availability comparisons appear in a
separately labeled, collapsed diagnostics section. **Focus group** and **Compare
with** permit manual comparisons. The shared scale is −1 to +1. The panel scrolls
and retains Maximize. **Edge catalogue** dismisses it until the next change of
estimate color group; **Correlation heatmap…** can reopen it. Changing to ordinary
sample colors restores the catalogue.

A heatmap cell or feature-table link colors the existing 3D samples without
changing selection or coordinates. Cluster and its previous/next buttons stay
outside **Heatmap settings**, along with the clustering method and its parameters.
The catalogue panel is the single vertical scroll area; the gallery has no
nested height limit, so the last heatmap and its graph remain reachable in
normal and maximized views. The participant-averaging checkbox, shared K and
Follow graph selection remain available. Saved clustering preferences persist;
older settings without a clustering method adopt the new defaults.

Each heatmap has an expandable **Feature cluster graph** beneath it. Within-group
graphs use one node per represented joint cluster; between-group graphs use
separate row-group and column-group nodes, including connections between subsets
of the same joint cluster. Node area counts displayed features in that group,
not participants or the entire joint cluster. Unassigned fields have no graph
node, and isolated nodes remain visible. Positions stay fixed when edge filters
change. Dense within-group graphs use compact C codes with full labels on hover.

An edge is the arithmetic mean **signed** correlation over all cross-node feature
pairs (excluding a feature paired with itself). The shared magnitude threshold
defaults to 0.30; sign choices are Both, Positive and Negative. Positive edges
are red, negative blue, zero gray; width increases with absolute mean. There
are no within-group self-loops. Positive and negative pairs can cancel, so edge
details also give pair count, range and positive/negative fractions. Node details
give the mean over distinct within-node pairs; singletons have no such mean.
These are descriptive summaries, not significance tests.

Click a graph node to outline its heatmap rows/columns, or an edge to outline its
block; the feature list and a **Show highlighted heatmap** button accompany the
selection. These clicks keep the full current display context and never change
sample selection, estimates or embeddings. **Clear graph highlight** removes the
outline. The separate Cluster dropdown and search still filter both heatmap and
graph display subsets. Graph threshold and sign choices persist across reopening.
Joint clustering uses all nonconstant feature groups, including assay-availability
diagnostics: minimum size 5 can therefore mean one immune marker plus four
metabolites, rather than five immune markers. Each panel uses the same assignments.

**Download results ZIP** includes one CSV per heatmap in `matrices/` (full
symmetric matrices, including their diagonals), a combined `correlations.csv`,
feature assignments and transformations, `cluster_representatives.csv` with
representative IDs and mean correlations, the full hierarchy and leaf-ID map,
exact settings, panel identities, source checksums, a README and methods HTML.
`graphs/` adds node feature membership and all candidate edge summaries per panel,
with a `displayed` flag identifying threshold/sign filtering.
Subset exports also include `selected_samples.csv`. The methods page provides
formulas and Print / save as PDF. Correlations describe smoothed estimate fields,
not raw measurements or significance tests. Shared neighborhoods, compositional
constraints, assay handling and larger K can strengthen concordance.

On-demand checks (never part of installation or updates):

```sh
node rank2_feature_graph/test_estimate_correlations.mjs
node rank2_feature_graph/test_estimate_clustering.mjs
# Optional reference check; requires R packages dynamicTreeCut and jsonlite:
Rscript rank2_feature_graph/verify_dynamic_tree_cut.R /tmp/micove-tree-reference.json
node rank2_feature_graph/test_estimate_clustering.mjs /tmp/micove-tree-reference.json
# Append a saved correlation-bank JSON to the R command to validate that bank.
# For ties, compare the branch cut on exactly the browser's hierarchy:
node rank2_feature_graph/test_estimate_clustering.mjs --tree bank.json /tmp/micove-tree.json
Rscript rank2_feature_graph/verify_dynamic_tree_cut.R /tmp/micove-tree-reference.json bank.json /tmp/micove-tree.json
node rank2_feature_graph/test_estimate_clustering.mjs /tmp/micove-tree-reference.json
```

Each `series` entry describes one available combination:

- `featureId`, `transformationId`, `geometryId`, `estimatorId`, `estimatorLabel`,
  `k`, `kMeaning`, `scopeId`, `resultKind`, `quantityLabel`, `unit`, `shardId`;
- `valueDomain`: `probability`, `nonnegative` or `real`;
- `estimation`: descriptions for `trainingPopulation`, `queryPopulation`,
  `weighting`, `queryExclusion`, `participantExclusion` and `tiePolicy`;
- `counts`: `trainingObservations`, `queryCount`, `availableEstimateCount`,
  with optional `trainingParticipants`, `positiveObservations` and
  `positiveParticipants` (null when unknown).

`k` is a positive integer. Its counting unit is either `neighbors` or
`case_participants`; these must never be presented as the same tuning parameter.
Use `resultKind` to distinguish an exploratory fitted field, a field excluding
the query participant and cross-validated predictions. Optional `referenceValue`
requires a finite number and an explanatory `referenceLabel`.

The reserved scope `all` covers the existing dataset. Other `scopes` entries
provide `id`, `description` and exact zero-based `recordIndices`. A restricted
field must be null with status `outside_scope` outside that membership.
Duplicate selector combinations and unreferenced shards are rejected.

Large catalogues can place common scalar fields in `seriesDefaults`. Explicit
series values override those defaults. Allowed defaults are `geometryId`,
`estimatorId`, `estimatorLabel`, `k`, `kMeaning`, `scopeId`, `resultKind`,
`quantityLabel`, `unit`, `valueDomain` and `estimationId`. A shared
`estimationPolicies` entry contains `id` plus the policy descriptions above;
series can reference it using `estimationId` instead of an inline `estimation`.
The aliases `observationWeighting` and `ties` are accepted for `weighting` and
`tiePolicy`, respectively. Conflicting aliases are rejected. Additional method
descriptions, such as a boundary stopping rule, remain part of that policy.

For estimates restricted to neighbors sharing each query's pure leading-taxon
state, a scope can instead declare `type: "query-anchor"`, an
`anchorAssignmentId`, and boolean `excludeFeatureAnchor`. The last flag excludes
queries whose leading taxon is the target taxon, which avoids presenting a
taxon's ratio to itself as a varying response. Such targets need a
`featureIndex`. This scope defines eligible queries; validation of the actual
neighbor restriction remains the producer's responsibility.

Each `anchorAssignments` entry has `id`, `file`, `sha256` and `bytes`. Its file
contains `datasetId`, `sampleOrderSha256` and the aligned `anchorFeatureIds`
array, using one-based taxon IDs and null for unavailable anchors. The trusted
receipt must supply `anchorOrderSha256`, an object mapping assignment IDs to
independently checked order hashes. Hash the string form of each integer,
using the literal string `null` for missing anchors and the same LF rule as
sample IDs. Missing anchors and excluded self ratios must have `outside_scope`
status and null support. This checks assignments without recomputing states.

## Numerical arrays and missingness

Each shard has `format: "micove-estimate-shard"`, `version: 1`, `datasetId`,
`catalogueRevision`, `sampleOrderSha256`, and a `series` object indexed by series
ID. Each series contains only:

```json
{
  "values": [0, 0.4, null],
  "status": ["ok", "ok", "unknown_participant"],
  "support": {"participantCount": [10, 10, null]}
}
```

This three-record illustration uses the same structure as a complete export;
all arrays must have the dataset's full record count. Finite estimates have
status `ok`; every other status requires null. Probability estimates must lie
in [0, 1]; they are rejected, never silently clipped, if outside this domain.
Real-valued transformed fields may be negative.

Built-in unavailable statuses are `outside_scope`, `unknown_participant`,
`insufficient_neighbors`, `insufficient_cases`, `invalid_input` and
`unsupported_transform`. Additional statuses need explanations in the manifest's
`statusCodes` object. Built-in meanings cannot be overridden. A missing observed
measurement does not necessarily imply a missing neighborhood estimate.

Optional support arrays need descriptions in `supportDefinitions`. Their values
are nonnegative numbers or null. `neighborCount`, `participantCount` and
`caseParticipantCount` must contain integers or null. Support describes how the
estimate was formed; it must not be substituted for a confidence interval.
Where present, case-participant counts cannot exceed participant counts, which
cannot exceed neighbor counts. Support is null for `unknown_participant` and
`outside_scope`. An exhausted neighborhood can retain available counts even
when its estimate is null.
Raw questionnaire rows are not part of this numerical interchange format.

## Validation and release

Run the checks on demand, before packaging an export:

```sh
python3 rank2_feature_graph/estimate_catalogue.py /path/to/export \
  --identity /path/to/reviewed-dataset-identity.json
python3 -m unittest discover -s rank2_feature_graph \
  -p test_estimate_catalogue.py -v
```

Tests use synthetic records only. They cover identity mismatches, missingness,
domains, scope restrictions, participant counts, duplicate control choices,
checksums and confined file paths. Neither command runs statistical models.

Release also requires the producer's methodological review and validation
receipt, documented limitations and matching methods/report assets. Before
viewer publication, verify representative continuous, binary, null and
restricted fields, changing choices while loading, saved settings, exports and
an unaffected dataset. Numerical files and private identity receipts stay out
of public source control and follow the dataset's existing access terms.

## Installing a reviewed supplement

Scientific files are distributed separately by the dataset owner. With a
compatible LSVF package already installed, add the reviewed export directory:

```sh
python3 scripts/portable.py update --output ~/micove \
  --estimate-catalogue /path/to/reviewed/export
```

The ordinary update remembers this path. Keep the export outside the app folder;
updates replace the application atomically. An optional export is retained in
the installation receipt if its owning dataset is temporarily uninstalled. It
never installs a dataset or changes its records, state assignments or coordinates.
The local HTTP development build can read the ignored
`.preview/estimate-catalogues.json` configuration with a `catalogues` array of
absolute export paths. Offline HTML exports do not include this supplement.

Color by adds the installed categories. The sample sidebar selects target,
transformation, estimator and neighborhood size. Fields load one feature at a
time with checksum verification. All-unavailable fields remain unavailable;
MiCOVE never substitutes another size or estimator. The legend distinguishes
missing reasons and shows the estimation distance independently of the display
embedding. Continuous colors use full-field limits, optionally clipped to the
2.5th and 97.5th percentiles; hover and CSV retain unclipped values.

The five-feature LSVF pilot is explicitly labeled as an integration pilot. Its
100 series cover continuous, binary and anchor-restricted examples. It is not
the complete scientific catalogue. Methods opens the question, estimator
formulas, transformation definitions, participant exclusions, support and
limitations, with print/save-as-PDF. The producer's complete illustrated report
is a separate release gate for the full catalogue.

Focused checks, independent of ordinary app updates:

```sh
node rank2_feature_graph/test_estimate_colors.mjs
node rank2_feature_graph/test_sample_coloring.mjs
python3 -m unittest discover -s scripts -p test_estimate_supplement.py -v
python3 -m unittest discover -s scripts -p test_portable.py -v
```

These cover lazy loading, stale-choice rejection, zero/negative/null fields,
color-scale limits, hover restoration and unchanged coordinates/camera,
additive packaging, identity rejection, and preservation of an existing install.
Inspect an actual HTTP installation for rendering and interaction behavior too.

## Complete LSVF catalogue, version 2

The reviewed full release includes 1,129 targets and 30,516 combinations at the
same 1,991 frozen positions. Seven categories include lactic acid and assay
availability in addition to the pilot categories. Both original signed D/L
readings and corrected measurements remain available as distinct targets.
Negative uncorrected readings are not labeled negative biological concentrations.
An unsupported combination stays gray with its reason, including when every
query is unsupported; the viewer never substitutes another neighborhood size.

The illustrated 12-page report is independently checksum-verified and downloaded
through **Report PDF** or the methods dialog. PDF bytes are packaged intact;
text documentation remains text. Frozen preprocessing, imputation and reference
scales mean these fields are not end-to-end cross-validated predictions.

Per-point field lookup uses a prebuilt index, while numerical arrays remain in
one lazy shard per target. No full array catalogue is loaded into the browser.
The uncompressed scientific export is about 2.85 GB and is supplied separately;
software updates remember the installed export path. Full validation and asset
integrity checks run when packaging the supplement, without fitting models.
