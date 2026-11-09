# What community structure remains after averaging nearby participants?

The LSVF smoothed-phylotype representations compare the geometry of locally
averaged taxon profiles. A point still identifies an original visit. Its
coordinates represent the average phylotype profile of 40 other participants.
All 559 phylotypes are retained, including constant fields and observed zeros.
No outcomes, immune markers, metabolites or clinical fields enter these maps.

## Reference and neighborhoods

The reference contains 1,965 visits from 1,144 participants. The 26 source records
without participant identity have no participant-excluded smoothed coordinates;
they remain available in the original dataset and taxonomic embeddings.

For each query visit, exclude all visits of its participant. Select each other
person's nearest visit, then retain the 40 closest people with equal weights.
Use these same representatives for every phylotype. Exact distance ties use
SHA-256 of `nearest-cases-v1|specimen ID`, then specimen ID. A tied shell may be
split deterministically. K counts people, not cases or visits.
The selected representatives are averaged in frozen record order. This gives
identical vectors for identical neighbor sets, avoiding artificial near-zero
distances caused by different floating-point summation orders. It does not
alter neighbor membership or remove small positive biological distances.

L1 profiles divide counts by their sum. Their smoothing neighbors use ambient
Euclidean distance. Max profiles divide counts by their largest component.
Their smoothing neighbors use `dgraphs::linf.simplex.distances()`: shortest
Euclidean-length paths on the union of max-normalized faces. These paths may
cross intermediate faces. All tied maximal coordinates are admissible faces;
no single dominant taxon is chosen to restrict neighbor search.

This face-aware neighbor metric is **not** the maximum-coordinate-difference
L-infinity metric. All four max-normalized variants share exactly the same
face-aware neighborhoods. MDS uses the separate target metric stated below.

## Averaging and optional post-normalization

For query x and phylotype j, average the normalized profiles of its neighbors:

\[
\bar u_j(x)=\frac{1}{K}\sum_{r\in N_K(x)}u_{rj},\qquad K=40.
\]

Here r identifies a neighboring person's chosen visit, N_K is the selected set,
and u_rj is its normalized abundance. L1 averages already sum to one. Max
averages can have a maximum below one when neighboring profiles have different
dominant taxa. The optional post-normalization divides the entire average
vector by its largest component:

\[
\hat u_j(x)=\frac{\bar u_j(x)}{\max_h\bar u_h(x)}.
\]

h ranges over all phylotypes in the same visit. This is not a maximum across
visits. No features are removed before or after normalization.

| Variant | Smoothing neighbors | Post-normalization | MDS target |
|---|---|---|---|
| L1 | Ambient Euclidean | None | Euclidean |
| Max, direct average | Face-aware intrinsic Euclidean | None | Euclidean |
| Max, projected average | Same face-aware neighbors | Divide by maximum | Euclidean |
| Max, direct average | Same face-aware neighbors | None | L-infinity |
| Max, projected average | Same face-aware neighbors | Divide by maximum | L-infinity |

## Three-dimensional metric MDS

For smoothed vectors s_i and s_j, the target distance is either

\[
d_{ij}=\sqrt{\sum_h(s_{ih}-s_{jh})^2}
\quad\text{or}\quad
d_{ij}=\max_h|s_{ih}-s_{jh}|.
\]

All phylotype dimensions contribute without standardization. The fit seeks
3D positions z whose Euclidean distances approximate these targets. The sparse
SGD recipe uses 200 internally randomized pivots with regional weights, 10 local
interactions, centered unscaled PCA initialization, 800 epochs, one start and
seed 20261015. Euclidean preparation uses a PCA projection retaining at least
90% variance only to select local fitting interactions; targets always use
the complete vectors. L-infinity preparation uses exact original-coordinate
neighbors without PCA. Smoothing neighbors and sparse fitting interactions
have different roles and are not interchangeable. Exact duplicate vectors share
fitting coordinates and are restored to their source visits.

For every unordered pair of visits with positive target distance, calculate

\[
E=100\sqrt{\frac{1}{|P|}\sum_{(i,j)\in P}
\left(\frac{\|z_i-z_j\|_2-d_{ij}}{d_{ij}}\right)^2}.
\]

P is the set of positive-distance pairs, d is the chosen smoothed target
distance, and z is the saved 3D position. E is RMS relative distance error in
percent. Zero-distance pairs are counted separately because relative error is
undefined there. All visit pairs are evaluated, including pairs used in fitting;
this is not held-out predictive validation. The sparse training proxy is a
different quantity. The full-reference error is displayed below the plot title;
restricted selections may use a reproducible sampled error, labeled as such.

## Interpretation and MiCOVE behavior

Fixed K spans wider radii in sparse regions and may blur rare community states.
Post-max-normalization can change relationships around mixed dominant taxa.
Lower MDS error means better approximation of that particular target geometry,
not proof that smoothing recovered biological truth. An epoch budget is not
a convergence certificate.

Choose a saved map under Representation. Existing embeddings, state memberships,
colors and selections are preserved. Selections and participant trajectories
restrict population coordinates; they do not trigger local refits. Reference
taxon markers are omitted because no independent smoothed reference positions
were fitted. Existing outcome colors remain their original fields, with their
original estimation spaces; they are not refitted on these maps. Representation
methods provides formulas and Print / save PDF.
