# Combined metagenomic CAG compositions

**Release withdrawn, 11 November 2026.** The 54 mean-based CAG maps and their
data package have been removed from the current distribution at the investigator's
request. A replacement based on summed abundances is pending. Older summed maps
used overlapping memberships and are not substituted for this disjoint catalogue.
The adapter, viewer and generating code are retained. The contract and commands
below document the withdrawn release; they are not current installation guidance.

`comb-mg` is an optional, separately distributed exploratory dataset. It uses
54 saved maps of samples described by disjoint co-abundant gene groups (CAGs).
It adds no taxon CSTs, VALENCIA calls or participant trajectories. Existing
datasets retain their populations, settings and fitted coordinates.

The independent choices are 3.5k reference / 4k exploratory population;
AZ / ESZ / JPO CAG construction; ordinary mean / length-corrected mean /
length-corrected mean including residual `species_other`; and L1–Euclidean /
max–Euclidean / max–L∞ geometry. The initial choice is 3.5k, AZ,
length-corrected CAG means, L1–Euclidean. Existing saved preferences take priority.
All output-coordinate distances are Euclidean, including max–L∞ targets.

The 3.5k population contains 3,544 profiles. The 4k release adds 70 inferred
LSVF links and 400 unresolved identities. All frozen identity/body-site holds,
source fields, original study values and distinct inferred identity fields are
retained. Cohort and identity-group filters restrict the saved population map;
they do not fit a local view. Counts describe profiles, not independent people.
No visit order is confirmed. Missing clinical values stay unavailable. The 31
flagged L. iners-assigned genes remain present, with their unresolved annotation
noted. Display does not resolve biological-admission or identity holds.

AZ includes zero observations in the original species-wise correlation; ESZ
excludes jointly zero observations; JPO uses jointly positive observations.
The later frozen assignment makes memberships disjoint. These labels identify
constructions, not new calculations performed by MiCOVE. Feature identities
belong to a population and construction; they must not be aligned by index or
similar taxon name. Parent-catalogue column numbers can have gaps in CAG-only
subsets. The normalized TSV header defines the actual ordered feature axis.

Ordinary CAG means average counts over every gene in the fixed group, including
zeros. Length correction divides each gene's count by its own nucleotide length
before averaging. Common sample-level denominators cancel when normalizing the
selected features. L1 divides by their sum; max divides by their maximum.
Residual categories enter as means, not sums alongside means. They are
heterogeneous accounting categories, not coherent CAGs. These values are CAG
compositions, not automatically organism, strain or cell proportions.

Every fit used full metric MDS, SGD, inverse-squared target-distance weights,
one PCA start, seed 20261015, and 200 epochs. They are independent of older
sum-based 1,000-epoch maps. All selected epoch 200; none certified convergence.
The error button explains the independently verified all-pairs RMS relative
error. Filtered views retain the full fitted population's labeled error.
Independently fitted map axes are not aligned.

## Packaging and installation

Obtain the reviewed data package from Pawel Gajer. Install it once alongside an
existing MiCOVE installation:

```sh
python3 ~/micove-source/scripts/portable.py update --comb-mg /path/to/MiCOVE-comb-mg-package
```

The ordinary update remembers the package path. Keep it outside the app folder.
Software updates do not download biological data. Optional local previews use
`.preview/comb-mg.json` with `{"package":"/absolute/path/to/package"}`.
The ordinary build validates and attaches the package without fitting.

Maintainers prepare a new package from the reviewed scientific result directory:

```sh
python3 scripts/comb_mg_supplement.py --source /path/to/reviewed/results --output /path/to/new/package
```

Preparation checks publication gates, all selector combinations, hashes, exact
sample and feature axes, metadata groups, normalized values and saved map/error
receipts. It serializes coordinates exactly and compresses row-major float64
values without rounding. Maps load independently; full arrays load only for
feature coloring. Source measurements and saved fits are never overwritten.
The package includes a validation receipt and the source publication receipt.
Do not edit either to admit a new scientific revision: review and update its
contract pin instead. The adapter needs NumPy only for maintainer preparation;
installation uses Python's standard library.

Sample hover/click inspection shows exact sample IDs, leading CAG values and
metadata. Feature inspection exposes immutable IDs, annotation group, group kind,
gene count and original parent-column metadata. It does not invent individual
gene annotations or unverified clinical overlays. Cohort colors use the shared
MiCOVE palette; identity colors explicitly distinguish the 70 and 400 groups.
Feature colors show the actual current normalized value. Sample and feature CSV
exports, full normalized TSV downloads, PNG exports, named views and per-dataset
preferences preserve the selected map identity and limitations.

## On-demand checks

```sh
python3 -m unittest discover -s scripts -p test_comb_mg_supplement.py
MICOVE_COMB_MG_PACKAGE=/path/to/package python3 -m unittest discover -s scripts -p test_comb_mg_supplement.py
node rank2_feature_graph/test_comb_mg_population.cjs /path/to/package
```

No check reruns scientific fits. Inspect the rendered viewer, selector changes,
metadata/group filters, feature colors, sample clicks, navigation, named-view
restoration, exports and normal/maximized layout. Check a representative existing
dataset too. HTTP or DOM-only tests do not establish WebGL rendering.
