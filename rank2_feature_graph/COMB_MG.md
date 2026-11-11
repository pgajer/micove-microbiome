# Combined metagenomic CAG compositions

## Current release: disjoint AZ sums

The current optional `comb-mg` release contains **12 saved 3D maps**: two
populations, two abundance definitions and three geometries. It replaces the
withdrawn mean-based release. Older sums based on overlapping gene memberships
are not substituted. No models are fitted during installation or viewing.

The initial view is **3.5k reference · AZ · summed CAGs + species_other ·
L1-normalized Euclidean**. Saved preferences are bound to this scientific
revision, so preferences from the withdrawn release cannot select a mean map.

| Population | Profiles | CAGs only | CAGs + species_other |
|---|---:|---:|---:|
| 3.5k reference | 3,544 | 1,896 features | 2,543 features |
| 4k exploratory | 4,014 | 1,901 features | 2,548 features |

AZ identifies the fixed species-wise correlation construction that includes
zero observations. The catalogue's final gene memberships are disjoint. Each
feature sums raw gene read counts over its fixed gene set; no division by gene
number or gene length is applied. The 647 `species_other` categories contain
residual genes and are not coherent co-abundance clusters.

**The denominator matters.** CAG-only L1 fractions divide by CAG reads only;
the median retained fraction of all in-scope reads is 62.14% for 3.5k and 60.23%
for 4k. Inclusive L1 fractions divide by all in-scope gene reads. Removing
`species_other` changes the table and denominator, rather than merely hiding
categories. Max normalization divides by the largest included feature count.
The sidebar explains the active denominator. Normalized tables, raw summed
counts and per-sample retained-read accounting can be exported.

Each table has L1–Euclidean, max–Euclidean and max–L∞ maps. All output-coordinate
distances are Euclidean. Fits use full metric MDS with SGD, inverse-squared
target-distance weights, one PCA start, seed 20261015 and 200 epochs. All selected
epoch 200; none certified convergence. The error button reports independently
verified all-pairs RMS relative distance error for the full fitted population,
including when filters restrict the display. Independently fitted axes are not
aligned.

The additional **70 inferred LSVF links** and **400 unresolved identities** stay
separate from the 3,544 reference profiles. Original metadata and identity/body-site
holds remain. Filters restrict saved coordinates; inclusion is not confirmation
of eligibility or identity. No confirmed visit order is available, so trajectories
are not enabled. Read compositions are not cell or strain proportions; CAGs do
not receive invented taxonomic CST or VALENCIA assignments. The 31 flagged
L. iners-assigned genes retain their unresolved annotation caution.

### Leading taxa and observed references

**Color by → Leading taxon (raw reads) · pure 1-CSTs** uses the most abundant
taxon in each sample. Reads are summed across that taxon's disjoint CAGs and
residual genes, then divided by all in-scope taxonomically assigned gene reads.
These annotations stay fixed across the CAG-only/inclusive and three geometry
choices. They describe raw reads, not calibrated cell abundances or CAG states.
The preserved gene-viewer annotations agree for all 3,544 reference samples.

**Number of leading taxa** ranks pure 1-CSTs by their sample counts in the full
chosen population. Count ties and leading-taxon abundance ties use frozen feature
order; neither current population has an abundance tie. The default eight states
cover 75.68% of 3.5k and 74.39% of 4k. Remaining samples stay gray as Other leading
taxa. Changing N never filters samples or reassigns their state. A coverage-based
selector would choose the smallest N reaching its target; this is sample coverage,
not the taxon's relative abundance within individual samples. No merged labels
are generated. The legend's n, % and c% describe displayed samples; marker
overlays do not enter those counts. Full-population rankings and reference
samples remain fixed when cohort or identity filters change.

**Sample appearance → Reference vertices** marks each displayed taxon's observed
maximum-abundance sample at its saved 3D coordinates. Its label includes the actual
raw-read fraction; it is not a hypothetical pure-taxon corner or state centroid.
The maximum is searched over the full selected population, including specimens
where another taxon dominates. Equal maxima use frozen sample order. References
outside current sample filters remain as labeled context without adding samples.
Show reference vertices, Sphere vertices, Vertex size/color, Ambient light,
Highlights and label-size controls match the ordinary sample viewer and persist
with saved settings and named views. Navigation, exports and coordinates remain
unchanged. Sample CSV exports include leading taxon and read fraction; a separate
CSV gives all pure 1-CST counts, cumulative percentages and reference specimens.

The optional annotation adds content-addressed assets to a new package while
preserving every existing map, abundance table and metadata record. An installed
unannotated package can be upgraded only when those scientific fields are exactly
identical. Older packages remain usable, with the extra coloring option absent.

### Installation and verification

Obtain the separately distributed package from Pawel Gajer. Keep it outside the
app folder, then use:

```sh
python3 ~/micove-source/scripts/portable.py update --comb-mg /path/to/MiCOVE-comb-mg-sums-package
```

The usual update remembers this package path; it does not download datasets.
Maintainers prepare the package with `scripts/comb_mg_supplement.py --source
/path/to/reviewed/results --output /path/to/new/package`. The adapter verifies the
pinned scientific contract, publication gate, axes, group counts, raw-read
accounting, normalization and map-error receipts. It preserves float64 values
and exact saved coordinates. A local `.preview/comb-mg.json` registration points
to the prepared package; an ordinary build only validates and attaches it.

Checks are on demand, outside installation and updates:

```sh
MICOVE_COMB_MG_PACKAGE=/path/to/package python3 -m unittest discover -s scripts -p test_comb_mg_supplement.py
node rank2_feature_graph/test_comb_mg_population.cjs /path/to/package
```

Before release, also inspect all 12 saved maps in the browser, both populations,
residual and denominator labels, 70/400 identity filters, feature coloring,
metadata inspection, exports, saved choices and an unaffected dataset. Automated
selector tests alone do not establish actual 3D rendering.

## Historical mean-based release — withdrawn

The following preserves the former release's methods and reproduction commands.
It is not current installation guidance. Its generated data remain withdrawn;
the generating and viewer support code is retained.

**Release withdrawn, 11 November 2026.** The 54 mean-based CAG maps and their
data package have been removed from the current distribution at the investigator's
request. It was replaced by the disjoint AZ sums described above. Older summed maps
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
