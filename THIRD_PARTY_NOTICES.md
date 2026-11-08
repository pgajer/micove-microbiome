# Third-party notices

## VMRC / VIBRANT taxon color tables

The files `rank2_feature_graph/palettes/16S_taxaKey.csv` and
`rank2_feature_graph/palettes/VIRGO2_taxaKey.csv` contain the microbial taxon
color specifications supplied by Jacques Ravel to the VMRC Research Team on
September 22, 2026, under the title "Microbial Taxa Color Codes."

These tables are included with permission for public redistribution, confirmed
by the MiCOVE maintainer on October 24, 2026. Attribution and the original table
contents are retained. This permission is recorded separately from MiCOVE's MIT
license; the tables are not relicensed under MIT by this repository.

The tables are interface color configuration, not participant observations or
research datasets. Their inclusion does not grant access to the separately
distributed research data described in [LICENSING.md](LICENSING.md).

## Separately supplied runtime dependencies

The portable viewer uses the Plotly JavaScript library supplied in the separate
runtime data package. Preserve its bundled license and copyright notices.
The clean source snapshot does not vendor that library.

The optional local weighted-GRIP service invokes a separately installed
[grip R package](https://github.com/pgajer/grip), licensed GPL-3 or later. Its
code and R runtime are not bundled with MiCOVE's MIT-licensed source or app.
See GRAPH_LAYOUTS.md for installation and operation.
