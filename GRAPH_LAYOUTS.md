# Optional weighted-GRIP layouts

In an estimate-correlation panel, choose **Cluster graphs → Layout → 2D weighted
GRIP**. It draws the retained connections using the existing `grip::grip()`
weighted engine. The circular/bipartite and metric-MDS choices work without R.
This changes cluster graph coordinates only: estimates, feature clusters, sample
selections and sample embeddings stay unchanged.

## Enable it on a Mac

Install [R](https://cran.r-project.org/bin/macosx/). In R, run:

```r
install.packages(c("remotes", "jsonlite"))
remotes::install_github("pgajer/grip", build_vignettes = FALSE)
```

Building grip from source requires the macOS command-line developer tools
(`xcode-select --install` in Terminal). These are optional dependencies, installed
separately under their own licenses. MiCOVE does not bundle or translate grip.

Update MiCOVE using your usual update command. Stop the regular MiCOVE launcher,
then double-click **Start MiCOVE with GRIP.command** in the app folder. Keep its
Terminal open and open **http://127.0.0.1:43818**. It uses the same browser origin
as the ordinary installed app, preserving browser preferences. If Rscript is not
on your PATH, set `MICOVE_RSCRIPT` to its full path before starting. `VME_PORT`
remains supported for an alternative port; preferences are separate per origin.

The launcher uses Python 3, already required by the updater. Without R or grip,
the viewer still opens and the weighted layout explains which dependency is
missing. The other layouts remain available. The regular launcher, installer
and update command do not fit graphs or install R packages.

## What distances and errors mean

For a retained edge with mean signed feature correlation r, its length is
`sqrt(2 * (1 - r))`. Positive correlations are close, negative correlations far
apart. A perfect positive correlation receives length 0.000001 because the
weighted engine requires positive lengths. The export records both the original
length and this floor.

The graph uses the current edge magnitude and sign filters, omitting degree-zero
nodes. Each connected component is fitted separately with `metric="edge_length"`,
`length.normalization="none"`, 160 rounds and 384 final rounds. The seed is
20261016 plus the component number. One- and two-node components use exact
coordinates. A single scale per component minimizes squared error against its
weighted shortest-path distances; rotations preserve distances. Components are
packed side by side. Their separation has no quantitative meaning.

The displayed RMS relative graph-distance error compares drawing distances with
weighted shortest-path lengths over all connected pairs. Disconnected pairs are
excluded and counted. Hover shows direct-edge error; click opens formulas and
explanations. Weighted GRIP's multilevel force calculation does not directly
minimize this diagnostic. Metric MDS uses direct all-pair correlation targets,
so the two displayed errors have different reference distances.

Changing edge filters can change the weighted layout. Nodes and edges retain
linked heatmap highlighting. The ZIP includes coordinates, component IDs,
retained edges, shortest-path distances and diagnostics with solver settings,
package/runtime fingerprints and a request hash. The service caches exact
requests with the actual runtime identity. Fits are serialized, single-threaded,
limited to 512 nodes and 10,000 edges, and have a 90-second timeout. Cache size is
bounded at 100 MiB; no prior results are automatically deleted. Installed caches
are under `~/Library/Caches/MiCOVE/graph-layouts`.

Only loopback HTTP is served. Requests accept numeric graph inputs, never code or
file paths. Only cluster information enters R; no measurements or sample
embeddings are fitted. The service does not upload data.

## On-demand checks

From the source clone:

```sh
node rank2_feature_graph/test_estimate_correlation_layout.mjs
python3 -m unittest discover -s rank2_feature_graph -p test_optional_graph_service.py
```

The latter checks the service's HTTP and input boundaries without requiring R.
To additionally exercise the installed R engine, run:

```sh
MICOVE_TEST_GRIP=1 python3 -m unittest discover -s rank2_feature_graph -p test_optional_graph_service.py
```

All checks remain outside the update command. Developers using a source checkout
of grip can prepare an isolated optimized runtime with
`python3 rank2_feature_graph/graph_layout_service.py --prepare` and serve an
installed app with `serve_graph_layouts.py --web /path/to/app/web --source-runtime`.
Preparation preserves the original grip checkout and prior runtime snapshots.
