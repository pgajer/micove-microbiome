# MiCOVE color specification

Specification version 36 · reviewed 5 November 2026.

Canonical MiCOVE-wide reference for dataset authors and interface developers.
Read this specification when preparing, adding or revising a MiCOVE dataset.

This document consolidates the implemented color rules for MiCOVE. Version 6 extends the existing phylotype palette to thresholded
participant stacked bars, with a fixed gray remainder and the same taxon
overrides. Version 5 added a gray non-core pure-state inspection mode, retaining
the original-pair colors within selected merged groups and stable pair colors
across comb-V3V4 reference-coverage sensitivity comparisons. It changes no
taxonomic aliases, classifications or scientific results. The source files
linked below implement the rules. Proposed extensions are explicitly separated
from current behavior.

## Distinct meanings of color

| Object or mode | Color identity | Current scope |
|---|---|---|
| Phylotype in whole-sample abundance bars | Normalized full taxon name | Shared defaults and taxon overrides across datasets |
| Original top-2 CST pair or assigned merged group | Reference pair identifier | Dataset-specific categorical palette and overrides |
| top-3 CST | Unordered triple identifier | Deterministic categorical color; dataset-specific overrides |
| VALENCIA2 CST or subtype | Explicit CST/subtype label | Fixed mapping shared wherever that annotation is available |
| Participant visit | Visit label or order | Separate visit palette |
| Hypothetical group in taxon context | Checked group membership | Red highlight by default; gray stored merged-state context |
| Reference-taxon abundance in neighborhoods | Relative abundance, 0–100% | Continuous Viridis scale |
| Subject density along graph edges | Displayed relative density | Yellow for low density, red for high density |

A taxon color is not the color of every state containing that taxon. A merged
pair label names an assigned reference group; it does not establish that its
two taxa dominate every assigned sample. G1, G2 and similar group numbers are
local to the dataset and reference target, not universal biological identities.
The active legend determines the meaning of color in a particular view.

## Sample coloring

In AGP pure or merged 1-CST connection views, selecting an edge preserves the state colors
of its boundary samples and draws other displayed samples in gray (`#dedede`).
The **Show background samples** checkbox hides or shows this gray context;
unchecked, only boundary samples from the two endpoint states are displayed.
This changes visibility and displayed counts, never membership. Connection edges
use the graph edge color (selected edges orange); reference vertices retain their
independent color. Graph counts, stored coordinates and pure labels are unchanged.
See [state connections](rank2_feature_graph/AGP_CONNECTIONS.md).

The **Color by** selector explicitly chooses sample colors independently of the
graph mode, selected samples and saved embedding:

- **q% 2-CSTs** uses saved merged assignments at the current **Largest 2-CSTs coverage**
  setting. The label follows the target (for example, 90% 2-CSTs). This percentage
  is coverage of the reference samples by the largest pure 2-CSTs, not the
  abundance of the named pair in each sample. The option is disabled where merged assignments are unavailable.
- **Pure 2-CSTs** uses original, unmerged leading-pair assignments. “Pure” does
  not imply that only two taxa occur in a sample. This is available within a
  merged group as well as in population and vertex views.
- **Cohorts** uses recorded cohort identifiers, with deterministic colors keyed
  by the complete identifier. Major cohorts have fixed, contrasting colors
  (CONTRA blue, HMP orange, JiVitA green, LSVF purple, MM vermilion); other
  identifiers use a fixed categorical palette. Colors never depend on frequency,
  selection, or which datasets are loaded. Reviewed annotation metadata takes precedence over
  older umbrella labels, joined by exact record ID (including the HMP/U01
  split in the 40-participant panel). Missing cohort metadata is Unclassified (gray).
  Distinct records retain separate cohort identities even at identical
  coordinates. A single composition point representing multiple cohorts is
  labeled Multiple cohorts (gray); its cohort is not guessed.
- **Visit colors** is available in participant mode. Participant points use
  visit labels/order; background points retain state colors or the existing
  gray-background setting.
- **Top-3 CSTs** retains the existing rank-3 palette when that display is active.
- **VALENCIA2 CSTs / subCSTs** use saved annotations with the same fixed palette
  in every dataset. ZAPPS & PreSSMat reuses comb-V4 calls only after exact record
  and full-composition checks. LSVF uses new full-composition calls against the
  pinned August 2024 centroids, retaining unmatched taxa and source cautions.
  The two HMP/U01 releases and PAPCLEAR show unavailable choices until their
  legacy taxonomy has a verified mapping; historical CST labels are never
  silently promoted to VALENCIA2. Separately supplied annotation supplements
  must match the dataset revision, profile IDs, record mapping and compositions.

The active choice has a tooltip. Unavailable VALENCIA2 choices explain the missing prerequisite in their tooltip and the Color by tooltip. Legend counts
and percentages use the same displayed identities as before; reference markers
are excluded. A color switch restyles existing sample markers without changing
coordinates, marker visibility, reference diamonds, camera, graph selection,
component visibility, or fitting method. Existing gray-background and non-core
inspection overrides remain in force. Preferences remain dataset-specific.

When VALENCIA2 coloring is active, the Features and states graph panel shows a
single row of CST or subCST spheres using the same fixed palette. Sphere area is
proportional to count within the displayed view. Counts use the legend's eligible
observation identities (records or distinct compositions as labeled), include
visible background once, and exclude reference markers. Percentages in this
summary always use that displayed total, independently of the legend's percentage
checkbox. Missing calls appear as Unclassified; empty categories have a dash.
The row scrolls horizontally when needed. The panel temporarily becomes shorter
unless a participant trajectory is open, and switching colors restores its old
height and graph. Samples, selection and coordinates are unchanged. PNG export
captures the complete row, including categories outside the scrolled viewport.

For Li/Lc neighborhoods, **Color by** and **Sample embedding** are in the sample
panel header, alongside navigation, legend position, named views and PNG export.
The CST sphere summary follows the neighborhood's own color selection and saved
annotations. Its denominator is the number of displayed distinct neighborhood
compositions, including dimmed background when visible, counting each composition
once and excluding reference markers and rings. Source-record multiplicities do
not change these counts. Only observed categories are shown in this summary;
changing neighborhood, collection, selection or background visibility updates it.
The full reference graph and its counts remain separate from this sample summary.
No classification is inferred from the Li/Lc anchor label.

Neighborhood reference vertices use the same red base color and sphere material
as ordinary sample references. Their independent controls include sphere/diamond,
size (25–300%), color, ambient light and highlights. Defaults are spheres, 100%,
red `#d62728`, ambient 85% and highlights 18%; reference visibility is preserved.
Appearance is saved in neighborhood preferences and both named-view formats;
older views without these fields use the defaults. A common scale from the full
saved neighborhood keeps marker sizes fixed when filtering samples. Appearance
does not change reference identities, labels, sample colors, coordinates or counts.

The original-pair component controls still describe membership within a selected
merged group. Their color pickers edit the shared pair palette; select Pure
2-CSTs to see those component colors in the sample view. Cohort and VALENCIA2
colors do not redefine graph state colors or assignments.

## Graph vertex and edge colors

The graph sidebar has **Vertices** and **Edges** color pickers. The common
vertex color defaults to red (`#d62728`), and the common edge color retains
its blue default (`#82a9b9`). These base colors apply in 2D and 3D, including
exports. **Reset colors** restores these defaults for the current dataset.
Settings persist per dataset and in named views; older settings without graph
colors use the new defaults.

Orange selection highlights remain in place. Participant density edges retain
their yellow-to-red scale, and non-subject edges remain gray. Vertex labels,
3D sample colors and top-3 face colors retain their separate meanings. Fading
still adjusts opacity. Changing graph colors preserves coordinates, widths,
selection, counts and sample colors.

## Graph vertex size

**Vertex size** scales every graph marker radius/diameter together, from 25% to
300% in steps of 5%. The default, 100%, preserves the original sizes. Marker
area remains proportional to positive degree in the displayed top-2 graph;
isolated vertices retain the existing small minimum marker. This control does
not change degree, graph coordinates, sample points or edge widths. Edge gaps,
label offsets and vertex picking use the scaled marker sizes.

The setting applies in 2D and 3D, including participant graphs and exports,
and persists per dataset and in named views. Older settings use 100%.

## Sphere vertices

**Sphere vertices** is on by default and is saved per dataset and in named
views. In 2D it applies spherical shading to the existing circles; in 3D it
replaces flat dots with illuminated triangle-mesh spheres. The selected base
color, orange selection highlight and state-size opacity still apply. Lighting
adds highlights and shadows, so the displayed shades vary around each sphere.

Sphere radii use the same square-root-of-degree rule and **Vertex size** scale.
Their cross-sectional area, not volume, is proportional to positive degree.
The common radius unit is 1/500 of the largest span of the full graph layout;
it does not grow when only a subset of vertices is displayed. Unlike flat
screen-sized dots, the 3D spheres have coordinate-unit radii and grow with zoom.
Projected gaps, label offsets and picking follow their apparent size. Embedding
coordinates, memberships and counts are unchanged. PNG exports preserve the
lighting; 2D vector exports preserve the gradients. Existing dataset settings
receive a one-time migration to spheres, preserving other controls. Subsequent
choices to turn spheres off are saved and respected on reload. Named views keep
their recorded appearance; older named views without this setting remain flat.

**Ambient light** and **Highlights** sliders appear below Sphere vertices in
both panels. Each ranges from 0–100% in steps of 1%, with defaults of 85% and
18%, preserving the previous material. Lower ambient light deepens shadows;
higher highlights increase specular reflection. Diffuse light, highlight
roughness and light position remain fixed. The 2D graph uses the controls for
shadow depth and gradient highlights, retaining its former shading at the
default values. PNG and 2D SVG exports retain the chosen shading.

Lighting is independent between the graph and sample-reference panels, saved
per dataset and in named views. Older settings use the defaults. Sliders are
disabled when spheres are off; reference lighting is also disabled when reference
vertices are hidden or unavailable. In 3D, moving a slider updates only sphere
materials, preserving camera, geometry, opacity, sample colors and selection.

## Sample-view reference spheres

**Sample appearance → Reference vertices → Sphere vertices** optionally draws
reference markers as illuminated spheres. This setting starts on, is independent
of graph sphere mode, and persists per dataset and in named views. Existing dataset
settings receive a one-time migration to spheres, preserving other controls and
subsequent choices to turn spheres off. Named views keep their recorded appearance;
older named views without this setting keep diamonds. **Show reference vertices** controls both markers and labels;
the sphere checkbox is disabled while references are hidden or unavailable.

**Vertex size** scales reference marker sizes from 25–300% in 5% steps, starting
at 100%. **Vertex color** sets one base color for every reference marker, starting
with the graph's red (`#d62728`). These controls apply to spheres and diamonds,
are independent of graph appearance, and persist per dataset and in named views.
Older settings without these controls use 100% and red. Labels retain their
existing colors. Reference hovers and coordinates are preserved.
Participant views with reference labels alone gain markers at those labeled
locations (spheres when enabled, otherwise diamonds). Coincident participant
references share one marker.
Ordinary samples, participant visits, selection rings, sample counts and embeddings
retain their existing representations. Sphere radii are the existing marker size
times 1/600 of the plotted coordinate span, so they grow with zoom. PNG export
retains the lighting. This control belongs to the main 3D sample panel; the
separate Li/Lc neighborhood panel keeps its own reference-marker controls.

## Graph edge thickness

**Scale width by 2-CST size** starts enabled. **Edge thickness** ranges from
1 to 12 in half-pixel steps, with a default of 6. With scaling enabled, the
unselected width is `1 + (thickness - 1) × (n / maximum state count)^strength`;
with scaling disabled, every edge uses the chosen thickness. Widths are rounded
to half-pixel steps. Selected edges and participant-state edges gain 2 pixels.
Counts use the whole current graph, before selection or degree filtering, so
restricting a subgraph does not inflate its edge widths. Counts retain their
existing observation unit. The minimum width preserves small states; opacity
remains independently controlled by fading.

**Thickness scaling strength** appears when size scaling is enabled. Its range
is 0.05–2.00 in steps of 0.05, with default 0.50 (the previous square-root
scaling). Lower strengths make widths more similar; higher strengths emphasize
larger states. At 1.00 the width above the minimum is linear in state size.
Older saved settings and named views retain the 0.50 default.

The controls apply to ordinary and participant graphs in 2D and 3D, including
exports, and persist per dataset and in named views. Changing widths does not
change sample selection, coordinates, graph layouts, or state counts. WebGL
edges are grouped by width to avoid one trace per edge; projection trimming
updates only those edge traces.

## Optional graph fading by state size

**Fade small 2-CSTs** starts enabled, with **Fading strength** set to 0.10.
Edge opacity is `(state count / largest state count)^strength`, using the full
current reference graph (chosen population, pure/merged mode and coverage target).
The slider ranges from 0.05 to 0.25 in steps of 0.01. Lower values make smaller
states more visible without changing their ordering; uncheck fading for full
opacity. At the default 0.10, a state at 1% of the largest count has approximately
63.1% opacity. Saved on/off choices persist. Saved strengths from the former
0–1 range are clamped to 0.05–0.25 and rounded to the nearest step when loaded.
Previously enabled views without a strength use 0.25 (their former strength 1
clamped to the new range); otherwise missing/invalid strengths use 0.10.
Preferences and named views retain the resulting strength. Selecting
a subgraph does not renormalize this denominator. Counts use that graph's
existing observation unit, including distinct profiles where applicable.

The lower-degree endpoint of each displayed edge is faded; both endpoints
qualify on degree ties. Each qualifying vertex and its label use the largest
opacity among all its displayed incident edges. Other vertices, including
isolated vertices, remain opaque. Degrees count displayed top-2 connections.
Colors retain their existing meanings, including the participant density scale;
the selected visit marker and top-3 faces retain their own appearance. Hover
and selection remain available even for faint edges. Fading persists per dataset
and in named views, applies in 2D/3D and exports, and changes no counts or geometry.

## Pure core/non-core comparison

In the pure-state overview, **Show non-core samples only (gray)** colors all
non-core pure-state samples `#a8adb2`, overriding categorical sample palettes
for this inspection. Core samples retain the chosen sample palette. The toggle
uses the selected reference catalogue and eligible population, preserves all
assignments, and compares both sets in saved full-reference coordinates. Records
without a catalogued pair are reported separately rather than called non-core.

## Hypothetical-group context colors

The mutual-overlap browser's **Group only** view uses original pure-state colors
from the main MiCOVE palette when embedded, with local pure-state overrides. A
standalone browser uses a deterministic state-ID hue fallback. Overrides persist
by dataset release and do not change the main MiCOVE palette.

In **Taxon context**, records assigned to q%-merged reference pairs containing
the chosen taxon form the gray background (`#a8adb2`, opacity 0.3). Checked
hypothetical constituents use one highlight color, initially `#d62728`, opacity
0.85. The Highlight picker changes only that display color and is saved with the
comparison. Unchecked constituents stay hidden. Highlighted group records outside
the context remain visible. Gray/red encode context versus hypothetical membership,
not abundance, proximity, merge confidence or biological classifications. Pure-state
color pickers are disabled in this mode; their saved colors return in Group only.

## Phylotype palette

### Permanent sources and matching

The source palette is the validated union of
[16S_taxaKey.csv](rank2_feature_graph/palettes/16S_taxaKey.csv) and
[VIRGO2_taxaKey.csv](rank2_feature_graph/palettes/VIRGO2_taxaKey.csv), distributed by Jacques Ravel to
the VMRC Research Team on 22 September 2026. The detailed
development source record retains checksums and the
historical-name review. Both originals remain byte-identical.

Use the final `Color` column. `Michael_original_Color` is historical provenance;
`Text` is an original display label, not a taxonomic identity. The tables contain
27 and 53 rows, with 15 overlapping names and no recommended-color conflicts:
65 union entries, comprising 64 taxon names and `other`.

Matching replaces underscores with spaces, collapses whitespace and ignores
case. It does not remove rank prefixes or strain suffixes, infer synonyms, or
match abbreviated names. Species, genus and database-cluster labels remain
distinct. In particular, `g_Prevotella` and `Prevotella` are separate keys.

| Example taxon | Recommended color |
|---|---|
| Lactobacillus iners | `#00CD00` |
| Lactobacillus crispatus | `#FDCC45` |
| Gardnerella vaginalis | `#1E90FF` |
| Fannyhessea vaginae | `#0000CD` |
| Ca. Lachnocurva vaginae (source key `Ca_Lachnocurva_vaginae`) | `#EE7AE9` |
| Other taxa | `#8C8C8C` |

The complete source tables, rather than this example table, define the palette.
They are also available with swatches and original CSV downloads on the
About color-reference page in your running viewer.

### Resolution and editing

Resolve colors in this order:

1. A valid user override for the normalized full name.
2. An exact normalized match in the VMRC union.
3. A deterministic full-name hash color for an unlisted taxon.

The fallback is a MiCOVE display color, not a VMRC recommendation. The editor's
hover help identifies unmatched taxa. `trajectoryTaxonColor` in
[subject_trajectory.js](rank2_feature_graph/subject_trajectory.js) defines the exact hash and HSL
conversion. Fallback colors are stable for a given normalized name; uniqueness
or perceptual separation of all colors is not guaranteed.

The **Taxon colors** editor applies each choice across all state rows in the
whole-sample abundance view and across visits in **Stacked bars**. Stacked bars
show selected phylotypes at their measured whole-sample abundances; the
threshold-omitted mass is **Other phylotypes**, using the same fixed gray.
Visit-specific selection can therefore put a taxon in gray at one visit even
when it is individually colored at another. It does not recolor top-k CST categories, VALENCIA2
CSTs or graph vertices. Other taxa remains fixed gray `#8C8C8C` and is not
editable. Dark text beside colored swatches keeps pale colors readable.

Taxon overrides persist in trajectory browser preferences and in named-view
`trajectory.taxonColors`. Imported overrides use normalized full-name keys and
six-digit hexadecimal values, with at most 4,096 entries. Older named views
without the map restore defaults. Reset removes an override and resolves the
current default again. Image exports use the selected colors.

## Top-k CST palettes

### top-2 CST pairs and merged groups

The `edgeColor` function in [viewer.html](rank2_feature_graph/viewer.html), together with
[datasets.js](rank2_feature_graph/datasets.js), assigns each pair its position in the dataset's
full 100% reference graph edge order. The first 20 colors are:

```text
#1f77b4 #ff7f0e #2ca02c #d62728 #9467bd
#8c564b #e377c2 #7f7f7f #bcbd22 #17becf
#393b79 #637939 #8c6d31 #843c39 #7b4173
#3182bd #31a354 #756bb1 #e6550d #636363
```

Later positions use a deterministic HSL hue progression defined by `edgeColor`.
A valid pair override takes precedence; a null pair uses `#7C878D`. Colors are
keyed by the pair identifier, not the displayed G number or abbreviated label.
Original pairs and merged reference groups with the same pair identifier share
a color within the dataset. This is not a universal cross-dataset pair mapping:
feature identifiers and edge order can differ between releases.

The fixed-reference and rebuilt-reference sensitivity views of comb-V3V4 use
the current baseline's full 100% graph edge order for color identity. Removing
edges from a rebuilt graph must not shift the default colors of surviving
pairs. Both comparisons share the baseline pair overrides; VALENCIA2 and
phylotype color rules are unchanged. This is a display convention, not a
requirement to keep baseline graph topology or weights in the rebuilt view.

The **State colors** editor beneath the sample legend edits these categories.
Overrides are stored under `rank2-edge-colors:<dataset-id>@<revision>`; the
original combined V3–V4 key is retained as a migration fallback. Cohort views
share the dataset's pair preferences. Reset removes the selected override.

### top-3 CST states

[rank3.js](rank2_feature_graph/rank3.js) constructs each triple identifier by sorting its feature
IDs. `rank3Color` hashes that identifier into an HSL color with 62% saturation
and 43% lightness; null membership uses `#A7B2B7`. A valid custom color wins.
Overrides use a persistent browser key indexed by dataset ID and triple ID.
The **State colors** editor updates the applicable samples, faces and legend.
A triple is not colored by mixing its three phylotype colors.

### Persistence boundary

Pair/triple color overrides are browser preferences. Current named-view
capture does not include the `edgeColors` or `rank3Colors` maps. Saving state
selections and participant coloring modes therefore does not make custom
top-k CST palettes portable to another browser. Taxon overrides have explicit
named-view support, as described above. Do not promise equivalent persistence
for the two systems without extending and testing the saved-view format.

## VALENCIA2 CSTs and subtypes

[valencia2.js](rank2_feature_graph/valencia2.js) defines the following fixed display mappings.
These mappings are separate from the VMRC phylotype tables and from top-k CST
palettes. This document records MiCOVE's implementation; it does not assert that
these are a universal externally mandated CST standard.

| CST | Color | Subtype | Color |
|---|---|---|---|
| I | `#DF5555` | I-A | `#FF6868` |
| | | I-B | `#FFD4DA` |
| II | `#64A52D` | II | `#B4FF68` |
| III | `#ED993B` | III-A | `#FFBC6B` |
| | | III-B | `#E4A67B` |
| IV-A | `#9A7BC4` | IV-A | `#C1ADEC` |
| IV-B | `#5477C7` | IV-B | `#91A8ED` |
| IV-C | `#737373` | IV-C0 | `#989898` |
| | | IV-C1 | `#FFC0CB` |
| | | IV-C2 | `#A8E5E5` |
| | | IV-C3 | `#9ACC9A` |
| | | IV-C4 | `#800080` |
| V | `#B6A616` | V | `#FFFF71` |

When VALENCIA2 coloring is active and available, the corresponding mapping
colors sample profiles, including participant samples and supported neighborhood
views. A missing profile annotation uses `#7C878D`. Existing dimming and gray
background choices can remain gray. The taxon and top-k CST editors do not edit
these fixed mappings. Coloring uses existing annotations; selecting the palette
does not classify samples, change assignments or fit coordinates.

## Other encodings that must not be confused with CST identity

[participants.js](rank2_feature_graph/participants.js) assigns visit colors E `#087F8C`,
V1 `#CF7318`, V2 `#8651B5`, and Unordered `#6B7780`. Other ordered visits use a
deterministic order-based hue. The participant color selector can instead use
original pairs or assigned merged groups. Background samples can follow that
state scheme or remain gray. Subject graph density uses a separate yellow–red
scale; it is not the state palette.

[embedding_families.js](rank2_feature_graph/embedding_families.js) uses fixed 0–100% Viridis for
reference-taxon abundance. Its dominance display uses dark/light variants of
the parent pair color, with gray for ties. Those shades describe dominance
within the displayed pair, not independent taxon identities. Annotation-track
colors and quality/selection outlines have their own meanings, documented in
the annotation controls and help in the viewer and
[QUALITY_PREVIEW_POLICY.md](rank2_feature_graph/QUALITY_PREVIEW_POLICY.md).

## Proposed extensions — not activated

The historical-name proposal in the development documentation
includes Atopobium vaginae → Fannyhessea vaginae,
Sneathia amnii → Sneathia vaginalis, and BVAB1 → Ca. Lachnocurva vaginae.
These aliases are not currently applied. Additional proposals without a VMRC
target would require explicitly labeled MiCOVE extension colors.

A future alias registry should record the original name, target color identity,
dataset scope, relationship, evidence and review date. Color aliases must not
merge abundance columns or alter scientific taxonomy. Preserve genus/species,
strain and database-cluster distinctions; unresolved cases such as BVAB2 remain
unmapped. Preserve existing user overrides and explicitly handle conflicts.

A universal cross-dataset top-k CST palette, portable custom pair/triple colors in
named views, and an editable VALENCIA2 palette are also possible future changes;
this specification does not implement them.

## Maintenance and acceptance checks

Update this specification with any change to color meaning, precedence,
identity matching or persistence. Keep original VMRC CSVs and their provenance;
version any replacement or extension explicitly. Do not silently replace colors
by changing feature order, abbreviations or synonym handling.

For palette changes, check exact VMRC matches, fallback labels, distinct
rank/suffix keys, Other gray, override precedence, Reset, reload and applicable
named-view round trips. Compare normal/maximized views, legends and image
exports. Verify that assignments, abundance values, coordinates and current
camera/range settings are unchanged. Test active VALENCIA2 and gray-background
precedence separately from ordinary top-k CST coloring.

Existing checks include `test_taxon_palette.py`, `test_valencia2.mjs` and
`verify_named_views.mjs`; their scopes differ and none alone certifies every
color mode. New persistence or alias behavior requires focused tests.

The original version-1 documentation-only consolidation was checked against
the linked sources. Version 2 accompanies the comparison-view implementation
and its palette-order regression check. The About page currently
publishes the VMRC tables; this full specification is repository documentation.

## Enrollment association overlays

The separate Associations workspace uses the frozen enrollment graph, never
recolors the exploratory all-visit graph. Both cohorts share a diverging
log2-ratio scale: blue (#2166ac) below one, neutral (#dee2e4) at one, red
(#b2182b) above one, saturated at ratios 1/8 and 8. The ratio is explicitly
matched odds or descriptive observed/expected cases. Gray (#a3abb0) means
unavailable, not evidence for no association. Width and size fading use the main graph controls, with pooled enrollment
state counts shared across cohorts. No p-value fading is applied. Selection adds a dark outline without
replacing the effect color. Zero/infinite estimates remain explicit.

In vertex association mode the same scale colors participant unions of incident
states. Context edges use the chosen base edge color; selected incident edges and the
selected vertex receive a dark outline. Estimates are computed from union
membership, not averaged edge effects. Degree controls vertex size in both
modes. Switching analysis level leaves exploratory colors and coordinates alone.

The association workspace reuses the main graph toolbar and its saved appearance
settings. Effect colors override vertex color in vertex mode or edge color in
edge mode. The corresponding base-color control is disabled while the overlay
is on; unchecking Association colors restores both base colors. Selection uses
a dark outline rather than overwriting effects. Lighting affects perceived sphere
colors as in the main panel. Size fading can obscure small states; the unfaded
results table and common color legend remain available.


## SANTE enrollment exploration

The optional treatment-assignment display uses blue `#0072b2` for azithromycin
and orange `#d55e00` for placebo, consistently for samples and paired connecting
lines. It requires source-bound treatment annotations for every released sample.
This override is controlled in the separate Visit and enrollment neighborhoods
section. Visit highlights default to blue `#0072b2`, with a configurable color.
Treatment coloring overrides that single color; heatmap-selected trajectories
turn treatment coloring on. Other samples remain visible in muted gray
`#a8adb2`. The ordinary Color by selector is disabled during highlighting.
Highlighted and gray context markers have independent size/opacity controls.
Defaults are 6 px / 70% and 2 px / 28%; treatment coloring does not alter them.
Connecting lines have independent thickness/opacity controls (3 px / 60% by
default), retaining treatment colors or the chosen highlight color.
Zero opacity hides markers or lines without changing membership or legend counts.
The highlighted and context sets are disjoint; legend counts include each sample
once. Visit identity uses shape: enrollment circles, follow-up diamonds, delivery
squares. The anchor participant has larger markers. A treatment color denotes
randomized assignment, not actual dose exposure before specimen collection.

## Enrollment heatmap clustering

Cluster colors are display annotations for one chosen partition, independent of
CST/taxon and treatment colors. Positive cluster IDs are assigned by first
occurrence in the fixed source participant order; their hues are spaced around
the color wheel for the current cluster count. IDs/hues do not imply identity
across parameter choices. Unassigned/noise is gray (`#999999`) and remains
visible. Treatment retains its established blue/orange mapping in the adjacent
strip and selected participants' 3D trajectories. Cluster number, table counts
and hover text supplement color; color alone does not encode membership.

### American Gut Project

The 24,421-sample SILVA population supports 70%-, 80%- and 90%-1-CSTs and
40%-2-CSTs. Colors identify the retained original-taxon cores and stay
consistent across coverage levels, checkbox settings and population embeddings.
With assignment enabled, the legend separates original members from samples
assigned by higher-rank support or neighbor vote. With it disabled, the plot
shows the original core members in their saved population coordinates.
Percentages use all 24,421 samples. Pair names put the taxon with greater total
relative abundance across this population first.

### Exploratory skin population maps

Skin v2 populations appear under one Skin entry, with independent populations
selected using Cohort. There is no pooled map or cross-cohort assignment.
An optional, revision-bound genus-state supplement adds pure and current-coverage
merged genus 2-CST colors. These annotate unchanged ASV-based coordinates.
Coverage uses whole frequency tiers within the selected population. With
assignment off, only original members of retained pure cores are displayed;
with assignment on, remaining specimens retain their precomputed within-cohort
assignments. Changing Color by alone never filters samples or changes maps.

State colors are deterministically keyed by the unordered full category IDs,
including higher-rank and unassigned-taxonomy fallbacks. Numeric pair keys remain
population-local. Pair labels order components by population total relative
abundance. Labels and counts supplement color, which is not guaranteed unique
across the many rare pairs. Cohort coloring is uniform within the selected cohort.
The legend's n counts displayed specimens; % and c% use all eligible specimens
in that cohort, including when only original retained cores are visible.

Verified visit order remains a separate discrete palette; unknown or unverified
visits are gray. Colors repeat after eight visit orders, so textual legends and
hover labels identify the order. Visit colors do not imply elapsed time or
cross-study correspondence. Filtering retains only existing same-site edges with
both endpoints visible; no hidden visits are bridged. Unknown metadata, genus/ASV
distinctions and exploratory notices remain in views and exports. Coverage,
assignment visibility and color preferences persist separately per population.


### Skin genus-state graph

The skin cohort graph uses red feature vertices and blue connectivity edges.
Pair midpoint markers use the same category-keyed colors as the sample states;
selected and incident edges are highlighted in orange. These graph annotations
do not override the independent sample Color by choice. Graph selection follows
the current assignment checkbox and retained cores, while coloring alone changes
no membership. Unknown genus assignments retain their explicit higher-rank labels.

### Separately supplied exploratory estimate catalogues

An installed LSVF estimate catalogue adds Phylotypes, Metabolites, Immune markers,
Bacterial load and Clinical metadata choices to **Color by**, each labeled
“estimates”. Dependent target, transformation, estimator and neighborhood-size
controls appear in the sample sidebar. Only saved combinations are offered.
These fields exclude the query participant and use their declared original-space
distance, independently of the selected display embedding. They do not change
state membership, selections, graph structure, references or coordinates.

Viridis spans the 2.5th–97.5th percentiles of the full selected estimate field by
default (linear interpolation). **Limit colors to central 95%** can be unchecked
to use the full finite range. Limits stay fixed across selections and embeddings;
only colors are clipped, while hover values and CSV downloads retain the original
values. Zero remains a valid value. Undefined estimates use gray `#9ca3af`, with
their reasons in the legend and hover text. Existing gray background/dimming
controls take precedence; reference vertices retain their own appearance.

Binary fields show percentages but are not necessarily disease probabilities:
for example, assay reporting is conditional on assay availability. The methods
dialog and feature descriptions retain measurement, imputation and sampling
limitations. The first five-feature integration catalogue is explicitly a pilot;
its full illustrated report is pending. Preferences are stored by dataset and
catalogue revision. See [catalogue format](rank2_feature_graph/ESTIMATE_CATALOGUE.md).

### AGP outcome probability colors

AGP's **Color by** dropdown is in **Sample coloring** in the sample panel's right
sidebar. **Outcome probability** reveals the outcome and model controls there;
there is no separate enable checkbox or left-panel outcome section. Switching
to this mode preserves the CST scheme and selection. **States and graph** allows
independent scheme changes while probability colors are active. Returning to a
CST color item selects that scheme. The assignment checkbox is in the same
sidebar. Existing saved outcome views migrate without changing their coverage.

Viridis limits are the 2.5th and 97.5th percentiles of non-null predictions
for the current outcome, estimator, sample policy, fitting population and estimate
type (linear interpolation, R type 7). Tail colors are clipped; predictions and
hover values remain unchanged. Limits use the full prediction set and stay fixed
across selections and embeddings. Colorbar end labels use ≤ and ≥. Equal limits
produce one color and one labeled value; a tiny display-only padding avoids
a degenerate renderer range. Unavailable estimates
are gray (`#9ca3af`); samples outside a selected graph boundary are lighter gray
(`#dedede`). Hover text distinguishes these from missing recorded answers.
Zero is a valid estimate, never an unavailable code. State colors and counts
remain in the CST table and graph; reference vertices retain their own color.
The fixed frozen 70%-1-CST fitting populations are independent of display
coverage or pure/merged filtering. See [outcome estimates](rank2_feature_graph/AGP_OUTCOMES.md).

**Relative to cohort mean** divides each saved probability by the observed outcome
frequency among answered index samples (one per participant, missing excluded).
This whole-cohort baseline is fixed across sample policies, selections and model
settings for each outcome. Ratios use winsorized percentile limits in multiples
(×), with 1× equal to the cohort mean. Both hover probability and ratio remain
unclipped. Scaling values and bounds together preserves the colors. The checkbox
is disabled if the cohort mean is zero or unavailable; no model is refitted.
