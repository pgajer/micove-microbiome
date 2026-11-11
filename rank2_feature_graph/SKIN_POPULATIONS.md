# Exploratory skin populations

**Distribution withdrawn, 11 November 2026.** The skin data packages are no
longer distributed. The processing, adapter and viewer code remains available.
The descriptions and installation
examples below document the former release; they do not indicate that skin data
are currently supplied with MiCOVE. Other datasets are unaffected.

The separately distributed skin v2 packages provide three population maps:
L1-normalized Euclidean, max-normalized Euclidean and max-normalized L∞.
Each map uses its own original-space target distances. A participant or visit
selection keeps those population coordinates; it is not a locally fitted map.
Different populations have unrelated axes.

The Dataset selector groups the seven production populations under **Skin**.
Choose one using **Cohort**; no All-cohorts overlay is offered. Existing links to
individual dataset IDs still work. Container links use
`?dataset=skin&cohort=skin1975-1841`, with the corresponding original ID.
Partial installations list only installed populations. The old EAT/COPSAC v1
fixtures remain separate.

## Genus-state annotation controls

The separately supplied genus-state sidecar is bound to each original exchange
revision and manifest. It does not replace counts, coordinates, eligibility or
trajectory edges. **Largest 2-CSTs coverage** offers 60%, 70%, 80%, 90% and 100%,
retaining complete frequency tiers. Actual coverage may exceed the target,
including reaching 100% for smaller populations.

**Assign remaining samples to retained states** is on by default, retaining all
otherwise matching specimens. Turning it off shows only original members of the
retained pure cores. **Color by** independently selects the current-coverage
merged genus groups, original pure genus pairs, cohort or verified visit order.
Changing colors never changes membership or coordinates. Counts use displayed
specimens; percentages use the full eligible population of the selected cohort.

Assignments are calculated within each cohort from genus-pooled proportions:
observed top-three-category support first, then Euclidean neighbor voting with
frozen original-core and direct-support donors. Neighbor assignments never
propagate. Source abundance ties use frozen category order; coverage ties retain
whole frequency tiers. Higher-rank and unassigned-taxonomy categories remain
explicit. Pair display order follows total relative abundance across the cohort.
These genus groups annotate ASV-based maps; they are not genus-level embeddings.
A merged pair label need not equal every assigned specimen's original top pair.

The first registered release contains four Huang collection populations
(Flores temporal skin, American Gut skin subset, maternal forehead and ABTX)
and three study-10894 populations (infant forearm, maternal forearm and maternal
right areola). These remain separate from the existing v1 EAT/COPSAC fixtures.
Registration pins the exact dataset, study, title, capability, revision and
manifest checksum. Unregistered or modified bundles fail before activation.

## Metadata, trajectories and warnings

Valid abundance profiles remain visible even when participant or visit metadata
are uncertain. Participant navigation includes only verified identities. Unknown
or unverified attributes remain explicit in specimen views and exports; an
unlinked specimen is not counted as an additional known participant. The Flores
population includes 414 specimens without verified participant links.

Trajectories use only the vetted, consecutive same-site edges supplied by the
data producer. Select a participant to display these paths. Filtering to a site
or visit retains the existing induced edge set and never creates a bridge over
hidden visits. Both displayed specimens and trajectory exports contain exactly
their corresponding visible membership. ABTX has no temporal edges. Study 10894
uses ordinal visit times and excludes HR.20. Speed is disabled throughout this
release. Family annotations never create maternal–infant trajectories.

The unresolved batch/metadata notices and method-specific distance distortion
and neighbor recovery remain visible and accompany specimen, edge and PNG
exports. No additional contaminant filter is introduced by installation.
The maternal-forearm population has particularly weak local neighbor recovery;
important apparent neighborhoods require checking in the original abundance
space. A low overall distance error is not evidence of biological validity.

When verified visit coloring is selected, colors identify visit order within a population, with unknown visits gray. For
more than eight visit orders the palette repeats; the textual visit legend and
hover label identify the order explicitly. Neither colors nor straight line
lengths encode elapsed time. All selections retain the same padded population
frame, preventing a narrow subset from changing the displayed axis proportions.

## Installation and updates

The installer accepts one or more registered exchange directories:

```sh
python3 scripts/portable.py update --skin-exchange /path/to/first-exchange /path/to/second-exchange
python3 scripts/portable.py update --skin-states /path/to/state-supplement-v1
```

It remembers those paths for subsequent ordinary updates. Keep these data outside
the installed app. The sparse count tables are validated offline and remain in
the separate data package; the plotting payload never contains a dense ASV
matrix. Installation stages and verifies a candidate before replacing the app;
the previous installation is retained for recovery. An unchanged revision is
idempotent; a conflicting revision fails.

A selectable skin-only catalogue supports fresh single-population or combined
installations using the standard `--catalog` and `--datasets` options. Dataset
and metadata reuse terms are separate from the software license.

## On-demand checks

```sh
python3 -m unittest discover -s scripts -p test_skin_supplement.py
COSMIX_SKIN_BUNDLE=/path/to/registered-exchange python3 -m unittest discover -s scripts -p test_skin_supplement.py
node rank2_feature_graph/test_skin_population_v2.cjs /path/to/installed-app
COSMIX_SKIN_STATES=/path/to/state-supplement-v1 python3 -m unittest discover -s scripts -p test_skin_states.py
```

The first command checks types without scientific files; the second additionally
checks registered data, attachment identity, tampering and failure preservation.
The JavaScript check verifies selection membership, vetted edges and coordinate
coverage in each installed v2 population. Browser rendering, navigation, common
framing and warning-bearing downloads require separate browser checks. Tests
are on demand and are not part of the ordinary update command. No test refits a
model. With a sidecar installed, the JavaScript check also exercises every
coverage/assignment combination and participant path restriction. The state
checks reject mismatched identities, sample order, counts, tiers and display
order, and verify idempotent attachment without changing original map assets.


## Linked genus features and states graph

With the reviewed genus-state supplement, each selected cohort has a features
and states graph. Vertices are the supplied genus or labeled higher-rank
categories; edges are retained 2-CSTs at the active coverage. Click a vertex or
edge, use its named selector, or focus a graph target and press Enter/Space.
A vertex selects the deduplicated union of incident retained states. Assignment
on uses saved merged memberships; off uses original core members. A selected
vertex does not mean that all selected specimens contain that genus.

Graph selection intersects participant, site and visit filters. Paths retain
only vetted edges whose endpoints remain displayed. Colors and embedding-method
changes preserve the graph selection, specimen identities and stored sample
coordinates. Coverage changes clear graph selection; Clear graph selection
preserves other filters, while Clear selection resets all filters. Cohort
switching starts a new graph context.

Graph counts show the filter-matching context before graph selection, with
full-cohort membership in tooltips. Its deterministic layout shows connectivity;
it is independent of the three ASV sample embeddings. Layout is stable for a
coverage while colors, filters and assignment change. Genus-state and exploratory
warnings remain in specimen, trajectory and sample-PNG exports. The separate
SVG graph export includes cohort, coverage and warnings in its description.
Both graph and sample panels can be maximized. Dense graphs also have named
selectors and hover labels. No numerical embedding is generated by this view.
