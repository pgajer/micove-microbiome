"""Assemble the viewer from source without requiring scientific preparation files."""
import json
import re
from policy_document import policy_html


def assemble_viewer(here, *, pack, plotly, palette, legend_abundance, overlap_available):
    js = plotly
    replacements = {'TAXON_PALETTE': json.dumps({k: palette[k] for k in ['version', 'colors', 'sources']}, separators=(',', ':')), 'QUALITY_POLICY': policy_html(here), 'PLOTLY': js, 'BUNDLES': pack, **{key: (here/name).read_text() for key, name in [('BUNDLE_VALIDATOR', 'bundle_format.js'), ('DATASET_PREFERENCES', 'dataset_preferences.js'), ('DATASET_CONTROLLER', 'datasets.js'), ('COHORT_CONTROLLER', 'cohort_views.js'), ('PANEL_LAYOUT', 'panel_layout.js'), ('SAMPLE_INSPECTOR', 'sample_inspector.js'), ('VIEW_TOOLS', 'view_tools.js'), ('GRAPH_LAYOUT', 'graph_layout.js'), ('NAMED_VIEWS', 'named_views.js'), ('RANK3', 'rank3.js'), ('PARTICIPANTS', 'participants.js'), ('SUBJECT_EMBEDDING', 'subject_embedding.js'), ('TRAJECTORY_QUALITY', 'trajectory_quality.js'), ('ANNOTATIONS', 'annotation_tracks.js'), ('TRAJECTORY', 'subject_trajectory.js')]}}
    replacements['VIEW_TOOLS'] = (here/'sphere_geometry.js').read_text() + '\n' + (here/'png_export.js').read_text() + '\n' + replacements['VIEW_TOOLS']
    replacements['PARTICIPANTS'] += '\n' + (here/'participant_exploration.js').read_text() + '\n' + (here/'enrollment_heatmap.js').read_text() + '\n' + (here/'state_transitions.js').read_text() + '\n' + (here/'transition_bayes.js').read_text() + '\ninstallStateTransitions();' + '\n' + (here/'longitudinal_clusters.js').read_text()
    replacements['TRAJECTORY'] += '\n' + (here/'trajectory_stacked.js').read_text()
    replacements['SAMPLE_INSPECTOR'] += '\n' + (here/'embedding_stress.js').read_text()
    replacements['SAMPLE_INSPECTOR'] += '\n' + (here/'associations.js').read_text() + '\n' + (here/'association_graphs.js').read_text()
    replacements['SAMPLE_INSPECTOR'] += '\n' + (here/'pure_state_tables.js').read_text()
    replacements['SAMPLE_INSPECTOR'] += '\nconst legendAbundanceTotals=BUNDLE_PACK.legendAbundanceTotals||' + json.dumps(legend_abundance,separators=(',',':'),allow_nan=False) + ';\n' + (here/'legend_counts.js').read_text()
    replacements['SAMPLE_INSPECTOR'] += '\n' + (here/'mutual_overlap_entry.js').read_text().replace('/*OVERLAP_AVAILABLE*/', 'true' if overlap_available else 'false')
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'record_views.js').read_text() + '\n' + (here/'comb_v3v4_display.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'control_excluded_views.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'sensitivity_views.js').read_text() + '\n' + (here/'max_normalized_views.js').read_text() + '\n' + (here/'unfolded_views.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'valencia2.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'estimate_colors.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'estimate_cluster_profiles.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'estimate_correlation_compute.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'estimate_correlation_clustering.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'estimate_correlation_layout.js').read_text()
    replacements['COHORT_CONTROLLER'] += '\n' + (here/'estimate_correlations.js').read_text()
    replacements['EMBEDDING_FAMILIES']=(here/'embedding_families.js').read_text()+'\n'+(here/'principal_paths.js').read_text()
    page = re.sub(r'/\*(TAXON_PALETTE|QUALITY_POLICY|PLOTLY|BUNDLES|BUNDLE_VALIDATOR|DATASET_PREFERENCES|DATASET_CONTROLLER|COHORT_CONTROLLER|PANEL_LAYOUT|SAMPLE_INSPECTOR|VIEW_TOOLS|NAMED_VIEWS|RANK3|PARTICIPANTS|SUBJECT_EMBEDDING|GRAPH_LAYOUT|TRAJECTORY_QUALITY|TRAJECTORY|ANNOTATIONS|EMBEDDING_FAMILIES)\*/', lambda match: replacements[match.group(1)], (here/'viewer.html').read_text())
    return page
