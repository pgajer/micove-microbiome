# Which responses are common near this joint-profile configuration?

These fields summarize observed binary answers from other LSVF participants
near each visit in the **38-dimensional outcome-excluded joint-profile space**.
Two versions use the same clusters: equal weight per feature, or equal total
weight per feature group within each cluster. All 38 resulting dimensions
contribute equally to Euclidean distance. The displayed 3D MDS coordinates
are never used to choose neighbors. No profiles or embeddings are refitted.

For profile vectors S_i and S_j, the distance is

\[d(i,j)=\sqrt{\sum_{c=1}^{38}(S_{ic}-S_{jc})^2}.\]

Here c identifies a cluster and S_ic is the median percentile profile of that
cluster at visit i, using the chosen feature weighting. The coordinates and
their reference percentile scales remain fixed when selecting samples.

## Counting people and stopping at 40 cases

All visits of the query participant are excluded. Among other participants,
use each person's nearest visit with an observed answer for the target, then
order these representatives by distance. A missing answer is omitted, never
treated as a negative. If answers change across visits, the nearest answering
visit determines that person's response; a farther positive visit does not
replace a nearer negative one. Each person is counted once.

Stop when the neighborhood reaches the 40th positive-answer person. If T is
the number of people reached, the requested raw nearest-case estimate is

\[\widehat p(i)=40/T_i.\]

This is **40 cases**, not 40 nearest people. The neighborhood can be large for
rare targets. The stopping-rule correction (39/(T-1)) is a different estimate
and is not substituted here. Distances tied exactly are ordered by the SHA-256
hash of `nearest-cases-v1|specimen ID`, then specimen ID, consistently across
targets and geometries. This deterministic prefix can split a distance tie.

All 1,965 linked visits from 1,144 people have profile coordinates. The 26
records without participant identity remain unavailable. Five targets have
fewer than 40 positive participants even before query exclusion: reported
diabet (8), mvp (27), thyroid (27), yeasttx (21), and health: poor (11).
Their k=40 fields remain selectable but are entirely unavailable. Other
query-specific failures also remain missing; k is never lowered automatically.
Incident GC has additional query-specific shortages: 76 of 1,965 visits under
equal-feature weighting and 11 under equal-group weighting. Although 59 people
have a positive GC answer somewhere in the reference, their nearest answering
visit may be negative. The other 11 supported targets have estimates at all
1,965 visits in each space. At k=40, supported GC neighborhoods contain
785–1,143 people across the two spaces, so these colors summarize a broad
portion of the reference rather than a small local neighborhood.

## Response meanings

The 17 targets are Any incident STI, Incident CT, Incident GC, Incident TV;
reported diabet, mvp, thyroid, asthma, allergy, s_cell, anemia, metro, yeasttx;
and the four health categories excellent, good, fair and poor. All remain
excluded from the cluster profiles. They are used only as responses.

Incident-STI labels describe the selected case/control sample, not necessarily
infection at that visit or population disease risk. The CT/TV-unknown category
is missing for TV. Questionnaire yes/no fields retain their source names;
definitions and timing of abbreviations and treatment-use fields remain
unverified. Health indicators compare the named category with other answered
categories; missing health answers are excluded. Answers can change by visit.

## Using the fields

Choose **Joint-profile outcomes · k=40** under Color by, then a Target. In
either supported outcome-excluded profile representation, the estimation
geometry follows the displayed representation. On other representations,
Estimation distance explicitly selects which saved profile space supplies
the colors. It never switches to 3D distances. Target, relative colors and
color clipping are remembered. Samples and selections are unchanged.

The color scale clips only the display at the full field's 2.5th and 97.5th
percentiles. Hover values and CSV estimates are not clipped. Relative colors
divide the estimate by the full-reference observed-response mean: average
available answers within each participant, then average participants equally.
One means the reference mean. These are descriptive ratios, not risk ratios
from an adjusted clinical model. Gray means unavailable, never zero.

## What these results do not establish

Profiles were built from smoothed feature fields, with transformations,
percentile scales and clustering fixed on the full reference. Excluding the
query participant from the final response neighborhood is **not end-to-end
cross-validation**. These colors are exploratory, not calibrated probabilities,
causal effects, significance tests or evidence of clinical predictive accuracy.
No tuning of k, uncertainty intervals or new validation models were requested.
