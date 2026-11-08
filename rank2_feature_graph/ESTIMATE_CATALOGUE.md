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
