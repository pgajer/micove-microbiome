# A sample map of joint-cluster profiles

## What question does this view answer?

Do visits with similar combinations of estimated immune, metabolic, taxonomic
and clinical patterns lie near one another? This representation places **visits**
in three dimensions. Its input columns are feature-cluster profiles; the feature
clusters themselves are not the plotted points.

Choose **Representation → Joint profiles · Outcomes excluded · Equal features**,
**Joint profiles · Outcomes excluded · Equal groups**, or
**Joint profiles · Original (outcomes included)** at the top of the sample
sidebar. **Taxonomic composition** returns to the existing embeddings. State,
cohort and participant selections restrict the fixed profile map. They do not
refit it. Coloring, navigation and PNG export work in either representation.
Taxonomic reference vertices and face unfolding apply only to composition space.

For LSVF, **Outcomes excluded · Equal features** is the default joint-profile definition and
appears first among the profile representations. An explicitly saved choice of
the original map is still restored, including older single-map preferences and
named views. With no saved representation, the viewer still opens in taxonomic
composition space. This preference changes neither selections nor coloring.
Installations with only the original supplement continue to use that map.

The two outcome-excluded maps use exactly the same 38 clusters and visits.
**Equal features** takes the ordinary median of a cluster's feature percentiles.
**Equal groups** gives each feature group represented in that cluster the same
total weight, divided among its member features, then takes a weighted median.
These groups are assay/feature types, such as immune markers and metabolites;
they are not different cohorts. A cluster containing features from only one
group has the same profile under both definitions.

Selecting a representation preserves selected samples and the coloring mode.
For **Joint-profile outcomes · k=40**, the saved response estimates follow the
selected outcome-excluded profile geometry. Other color fields remain fixed.
The separate **Weight
feature groups equally** checkbox controls cluster-profile coloring and does
not change the selected map. Thus either geometry can be colored by the same
individual feature or by either color-profile definition.

The [nearest-case response option](PROFILE_OUTCOMES.md) uses all 38 profile
coordinates, independently of their 3D approximation. The raw estimate is
40/T after excluding the query participant. It includes the 17 excluded
response fields; five cannot support k=40 and remain unavailable. Earlier
abundance-space estimates remain under their original Color by groups.

**Find feature in clusters…** searches recorded feature names. For example,
“any STI” finds **Any incident STI**. It is excluded from the new clustering
and remains available for coloring. The original definition retains it in C9.
The search shows the feature group, cluster membership and grouped member list.
Choose **This feature** to color by its saved estimate, or **Cluster profile**
for the aggregate. When a joint heatmap is open, its current cluster definition
is separately available; it may differ from the embedding's frozen definition.
The sample sidebar labels the saved color definition. The heatmap panel's
**Current color profile** section compares it with the current heatmap and
provides the profile formulas and download. **Color 3D samples** beside a
heatmap cluster explicitly adopts that definition for coloring; the saved 3D
map remains unchanged.

## Outcome-excluded representation

The additive LSVF v4 supplement preserves the original 39-profile representation
and every saved individual estimate. It adds a new 38-profile map. Its explicit
exclusion policy removes 23 fields from correlation displays and from both joint
and separate clustering: four incident-STI fields; seven reported-condition
fields (`diabet`, `mvp`, `thyroid`, `asthma`, `allergy`, `s_cell`, `anemia`);
all four `health` categories; `metro` and `yeasttx` treatment-use fields;
visit number; and five assay-availability indicators. Original wording and
uncertain questionnaire definitions are retained. BV/Nugent scores are absent
from this metadata source. All excluded targets remain individually colorable.

The 1,096 remaining nonconstant fields form 38 clusters using the same full
reference and settings below. The new map contains 1,965 visits from 1,144
participants and 1,963 distinct vectors. Independent percentile/median and
all-pair error calculations agree with the packaged results. RMS relative
error is **19.84%**, versus **35.61%** for its initial PCA projection, over
1,929,628 positive-distance pairs; two zero-distance pairs are excluded.
These numbers evaluate a different target geometry from the original map and
are not a head-to-head improvement claim.

The equal-group map uses the same 1,965 visits, 1,144 participants and 38
clusters. Twenty-two clusters contain multiple feature groups; weighting changes
at least one profile value in 21 clusters. Single-group profiles remain unchanged.
Both fits use the same solver settings and seed. The equal-feature fit is reused
after exact input-matrix and runtime-provenance verification.

| Outcome-excluded profile definition | RMS relative distance error | Positive-distance pairs | Zero-distance pairs |
| --- | ---: | ---: | ---: |
| Equal features | 19.84% | 1,929,628 | 2 |
| Equal groups | 23.31% | 1,929,629 | 1 |

Independent calculations verify every profile and each all-pairs error. Each
error measures approximation of that definition's own target distances; these
values do not select a scientifically preferable weighting. One pair of visits
with identical equal-feature profiles differs under equal-group weighting, so
the number of positive-distance pairs differs by one. The equal-group fit has
1,964 distinct vectors and a three-component PCA baseline error of 41.53%.
Both representations omit the same 26 visits without common estimate support.

Retained pairwise correlations are reused exactly. The excluded rows/columns
are removed before rebuilding each hierarchy; the original all-field hierarchy
is never pruned and reused as if it were refitted. The policy is recorded in
saved cluster definitions and exports. Source fields and numerical banks are
preserved. Older saved color definitions remain distinguishable from current
heatmap definitions; cluster numbers are not identities across definitions.
Labels use C1, C2, etc., with feature-group counts rather than a representative
feature name. Search identifies excluded targets explicitly and still offers
**This feature** for coloring.

The new map is outcome-excluded, not externally validated: estimates still share
the original abundance-neighborhood smoothing and reference observations.
Coloring by an outcome does not establish predictive performance or causality.

## Original pilot and common profile definition

The LSVF pilot contains 1,965 visits from 1,144 participants, with 39 profile
columns. Twenty-six of the dataset's 1,991 visits lack common finite estimate
support; only this representation omits them. Their original data and maps
remain available. There are 1,964 distinct profile vectors.

The full-reference feature clustering uses K = 40 nearest-people estimates,
participant-weighted Spearman correlation, average linkage and Dynamic Tree Cut
with minimum size 5 and splitting sensitivity 1. It includes all feature groups,
with one declared transformation per feature. The 1,117 nonconstant fields form
39 joint clusters. Cluster membership and identifiers are frozen in the asset.

For reference visit r from participant i, give it weight w_r = 1/m_i, where m_i
is that participant's number of included reference visits. For saved feature
estimate x_fr, define its weighted midpoint percentile at visit v:

\[
p_{fv}=100\frac{\sum_r w_r\,[\mathbf1(x_{fr}<x_{fv})+
\tfrac12\mathbf1(x_{fr}=x_{fv})]}{\sum_r w_r}.
\]

Here f names a feature, v the visit being scored, and r each reference visit.
The indicator is one when its condition holds and zero otherwise. Tied values
receive half their combined reference weight. Every participant contributes
total weight one to the percentile reference.

For cluster c, the equal-feature profile S_vc is the ordinary median of its members'
percentiles at visit v. An even-sized cluster uses the mean of the middle two.
Every feature has equal weight **within** its cluster. Percentiles and membership
stay fixed when samples are selected.

For the equal-group representation, feature f in cluster c receives weight

\[
a_{fc}=\frac{1}{G_c n_{g(f),c}},\qquad
S_{vc}=\operatorname{weighted\ median}_{f\in c}(p_{fv};a_{fc}).
\]

G_c counts the feature groups present in the cluster; g(f) identifies a
feature's group; n_{g(f),c} counts that group's members in this cluster.
For example, ten metabolites and two immune markers give each group half
the weight: 5% per metabolite and 25% per immune marker. Sort percentiles from
low to high and accumulate these weights; the weighted median is where the
total crosses one half. At an exact half-weight split, average the two bounding
values. This is a weighted median of individual features, not a median of group
medians. No sign is reversed. The participant weights used to calculate feature
percentiles are identical in both representations.

The target distance between visits i and j is

\[
d_{ij}=\sqrt{\sum_{c=1}^{G}(S_{ic}-S_{jc})^2}.
\]

Here G is the number of clusters: 39 in the original pilot, 38 in either
outcome-excluded map. Every cluster dimension receives equal weight, including
in the equal-group representation. Weighting changes each cluster's profile;
it does not balance feature groups across the full distance calculation.
Scores remain on their original
0–100 percentile scale: no row normalization, variance standardization,
whitening or winsorization is applied. Color clipping changes display only.

## Metric MDS and checks

The pilot uses the same primary sparse recipe as the original LSVF Euclidean
fits: SGD, 200 internally randomized pivots with regional weights, q = 10 local
neighbors, 800 epochs, one start, preparation/fitting seeds 20261015, and
centered unscaled three-component PCA initialization. The Zheng schedule uses
epsilon 0.1. A PCA projection retaining at least 90% variance selects local
neighbors; all distance targets use the full profile matrix. Exact duplicate
rows share fitting coordinates and are restored to their original visits.

For every unordered visit pair with a positive target distance, evaluate

\[
E=100\sqrt{\frac1{|P|}\sum_{(i,j)\in P}
\left(\frac{\|z_i-z_j\|_2-d_{ij}}{d_{ij}}\right)^2}.
\]

z_i is a visit's saved 3D position; P is the set of evaluated positive-distance
pairs. E is root mean squared relative distance error, expressed as a percentage.
Zero means exact preservation. This is distinct from the sparse training proxy.

On all **1,929,629** positive-distance pairs, the fitted error is **19.87%**,
compared with **35.13%** for the initial three-component PCA projection. One
zero-distance pair is excluded from relative error. All-pair diagnostics include
training pairs; they are not a held-out validation study. A separate implementation
verified the input percentiles/medians and the streamed distance-error calculation.
Finishing 800 epochs is not a convergence certificate; this pilot tests one start.

The on-screen stress uses the full all-pairs result when the entire supported
reference is shown. Restricted views evaluate their displayed visits, using a
reproducible sample of pairs when needed. They retain population coordinates.

## Interpretation

These are **saved neighborhood-smoothed fields**, estimated using the original
abundance geometry, not independent raw multiomics measurements. Clinical
outcomes, including STI, and assay-availability diagnostics participate in the
original all-profile map and are excluded from the new map. In the original map,
STI coloring describes a component of the constructed space. In either map,
coloring cannot establish independent association or predictive performance. Separate
visits remain separate points, not independent participants. Participant weighting
governs percentiles and correlations; the MDS constraints fit distinct vectors
without participant weights. Profiles may hide opposing feature patterns.

## Reproduction and distribution

Scientific arrays remain in the separately supplied estimate supplement. Adding
the representation extends that catalogue without changing its existing fields,
record identities or embedding banks. Installation validates asset checksums,
record mappings, cluster membership structure, finite coordinates and evaluation
counts. Older catalogues remain supported and have no representation selector.

The preparation and fit are explicit, on-demand scientific commands; neither
installation nor the usual update command runs them:

```sh
node rank2_feature_graph/prepare_joint_profile_embedding.mjs CATALOGUE NEW_RUN_DIRECTORY features
Rscript rank2_feature_graph/fit_joint_profile_embedding.R NEW_RUN_DIRECTORY LOCAL_R_PACKAGE_ROOT
```

The run saves the frozen matrix, membership definition, preparation, complete fit,
solver settings, runtime/source hashes and pair diagnostics. The fitter loads
optimized local grip and dgraphs sources and uses one numerical thread. Keep
completed runs; use a new directory for a changed definition or solver experiment.

Focused data-free UI tests remain on demand:

```sh
node rank2_feature_graph/test_joint_profile_embedding.mjs
python3 -m unittest discover -s rank2_feature_graph -p test_estimate_catalogue.py
python3 -m unittest discover -s scripts -p test_estimate_supplement.py
```
