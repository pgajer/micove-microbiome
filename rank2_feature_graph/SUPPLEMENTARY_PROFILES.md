# How can specimens without participant IDs appear in the profile maps?

The LSVF dataset contains 1,991 specimens. The original profile maps fitted
1,965 specimens linked to 1,144 participants. The remaining 26 specimens now
have estimated profiles and supplementary positions in all five smoothed
phylotype maps and all three joint-profile maps. Every original coordinate,
profile, cluster membership and percentile reference is preserved.

## Estimating a profile

Use the same 1,965 reference specimens and take one nearest eligible visit per
identified participant, then average the nearest 40 people. Unidentified
specimens are queries only: they never enter the reference or affect another
specimen's estimates. For known query participants, all of their visits remain
excluded. For the 26 unidentified queries, we cannot determine whether a
reference visit belongs to the query's participant. Exclusion of that
participant therefore cannot be guaranteed. These estimates are descriptive,
not participant-excluded or cross-validated predictions.

Smoothed phylotypes use ambient Euclidean neighborhoods for L1 abundances and
the same dgraphs face-aware intrinsic Euclidean neighborhoods for all
max-normalized variants. Average all 559 coordinates in frozen record order;
no taxa are filtered. Post-normalization divides each average by its own
largest coordinate only in the explicitly post-normalized variants.

Joint-profile fields use their existing transformed responses and ambient
L1–Euclidean neighborhoods. For a feature with missing responses, use each
participant's nearest answering visit. Convert the resulting estimate into a
percentile against the frozen, participant-weighted reference estimates:

\[
R_f(v)=100\frac{\sum_r w_r\{\mathbf1(v_{rf}<v)+\tfrac12\mathbf1(v_{rf}=v)\}}
{\sum_r w_r},\qquad w_r=1/n_{g(r)}.
\]

Here v is a query's estimated feature value, v_rf is the saved reference
estimate for feature f at visit r, g(r) is that visit's participant, and
n_g(r) counts that participant's reference visits. The indicator is one when
its condition is true. Every participant has total weight one. Ties receive
half their reference weight; values outside the reference range receive zero
or 100. Queries do not change this reference distribution. Combine feature
percentiles using the saved clusters and the map's existing equal-feature or
equal-group median definition. The original map retains its outcome-containing
definition; the other two retain their outcome exclusions.

## Placing a specimen without moving the map

For each new specimen q, minimize

\[
\frac1{|P_q|}\sum_{j\in P_q}
\left(\frac{\|z-z_j\|_2-d_{qj}}{d_{qj}}\right)^2.
\]

Only z, the new point's three coordinates, can change. Every z_j is a frozen
reference position. The target d_qj is the distance between the complete
estimated profiles in this map's Euclidean or L-infinity metric. P_q contains
all reference specimens with positive target distance. The optimizer uses
six deterministic starts and an analytic derivative. This is a supplementary
placement, not a new metric-MDS fit. An exactly duplicated profile uses its
existing position. Distances among new specimens are evaluated afterward;
they are not additional fitting constraints.

The displayed RMS relative distance error covers all positive-distance pairs
of the displayed specimens. The archived original error and the error for
new-to-reference pairs are retained separately. A fixed map may not represent
every new profile well; the supplementary error measures that limitation.
Low distance error does not validate outcome prediction.

## References and coloring

Original taxonomic reference specimens are restored at their supplementary
positions. Labels retain their actual observed taxon abundances, not smoothed
abundances. Hover text identifies their unknown-participant limitation.
Reference markers do not add observations to counts or evaluation pairs.

Saved K=40 joint-cluster profiles can color these supplementary specimens
using the same frozen percentile reference. Other estimate catalogues are
unchanged; a previously unavailable response estimate remains unavailable
and is shown in gray. Unknown participant identity still prevents participant
trajectory linkage and participant-level cross-validation for these records.
