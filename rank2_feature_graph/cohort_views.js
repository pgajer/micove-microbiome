// Cohort views are materialized from one frozen reference assignment and saved fits.
function analysisExtension(){return datasetRegistry.get(META.id)?.cohortAnalysis}
function eligibleIndices(){return DATA.eligibleIndices||DATA.samples.ids.map((_,i)=>i)}
function populationSize(){return DATA.eligibleIndices?.length??DATA.samples.ids.length}
function cohortChoiceLabel(title){
 return ['Reference-matched abundance ≥90% — sensitivity','All control-excluded records'].includes(title)?'All':title;
}
function cohortControlHelp(){
 if(META.id==='comb-V3V4-tx'&&typeof rebuiltOnlyPopulation==='function'&&rebuiltOnlyPopulation())return 'All includes every cohort in this dataset. Choosing an individual cohort restricts the same eligible samples. '+populationControlHelp();
 const base='Choose the population within the current dataset. Reference assignments and saved embeddings are retained.';
 return META.id==='comb-V3V4-tx'&&typeof activeSensitivityMode!=='undefined'&&activeSensitivityMode!=='baseline'
  ? 'All includes every cohort within the selected Population. Choosing an individual cohort restricts that same population. Fixed reference and Rebuilt reference both retain samples with at least 90% VALENCIA2 reference-matched abundance; see Population for the filter and reference definitions.'
  : base;
}
// These released sample fits target full, sum-normalized relative abundances.
// Imported datasets need their own provenance; never infer their geometry from a name.
function standardSampleEmbeddingTitle(method){
 if(typeof datasetMaxNormalizedAsset==='function'&&datasetMaxNormalizedAsset()&&maxNormalizedIds.includes(el('sampleEmbedding').value))return maxNormalizedMethodLabel()+' · '+method;
 const known=['comb-V3V4-tx','comb-V4-tx','umb-hmp-2019-panel','lsvf-v3v4-20241111','hmp-u01-2019','papclear-v3v4-provisional-20261017','zapps-pressmat-v4','sante-16s'].includes(META.id);
 return (known?'Sum-normalized Euclidean':'Normalization/metric unspecified')+' · '+method;
}
function samplePanelTitle(method,selection='',cohortOverride=null){
 const key=typeof activeCohort==='undefined'?'all':activeCohort;
 const a=typeof analysisExtension==='function'?analysisExtension():null;
 const cohort=cohortOverride||(key==='all'?'All cohorts':a?.populations?.[key]?.title||META.populationName||key);
 if(typeof jointEmbeddingActive==='function'&&jointEmbeddingActive())return [cohort,selection].filter(Boolean).join(' · ');
 const population=META.id==='comb-V3V4-tx'&&typeof rebuiltOnlyPopulation==='function'&&rebuiltOnlyPopulation()?'':META.id==='comb-V3V4-tx'
  ? ({baseline:'Current dataset',fixed:'Fixed reference',rebuilt:'Rebuilt reference'}[typeof activeSensitivityMode==='undefined'?'baseline':activeSensitivityMode]||'Current dataset')
  : 'Full dataset';
 // Keep provenance available on hover and in standalone exports without repeating
 // the header's method selector in the visible title.
 el('sampleTitle').title=[cohort,population,method,selection].filter(Boolean).join(' · ');
 const scope=/unavailable|Loading/i.test(method)?method:
  method.includes('(restricted)')?(method.includes('Local 3D')?'Local fit subset':'Global fit subset'):
  selection&&method.includes('Subject-state joint')?'Joint local fit':
  selection&&method.includes('Local 3D')?'Local fit':'';
 const unfolded=method.includes('Unfolded faces')?'Unfolded faces'+(selectedVertex===null&&typeof unfoldedAnchorFeatureId!=='undefined'&&unfoldedAnchorFeatureId!==null?' · Anchor: '+unfoldedAnchorLabel(unfoldedAnchorFeatureId):''):'';
 if(unfolded&&selectedVertex===null)el('sampleTitle').title+=' · Anchor: '+unfoldedAnchorLabel(unfoldedAnchorFeatureId);
 return [cohort,selection,scope,unfolded].filter(Boolean).join(' · ');
}
function sampleEmbeddingTitle(overview=false){
 const mode=el('sampleEmbedding').value;
 const isMax=maxNormalizedIds.includes(mode),local=mode==='local'||isMax&&maxNormalizedIsLocal();
 let scope;
 if(local&&!overview){
  const fit=localSelectionFit();
  scope=fit?.fittingScope==='population-restriction'?'Population 3D MDS (restricted)':
   fit?.fittingScope==='local-restriction'?'Local 3D MDS (restricted)':'Local 3D MDS';
 }else{
  const fit=overview?DATA.overviewEmbeddings?.[el('coverage').value]:null;
  const restricted=!overview||fit?.fittingScope==='population-restriction'||isMax&&(activeCohort!=='all'||activeStateMode==='pure');
  scope=isMax&&datasetMaxNormalizedAsset()&&overview?(activeCohort==='all'?'Population 3D MDS':'Cohort 3D MDS'):restricted?'Population 3D MDS (restricted)':'Population 3D MDS';
  if(isMax&&datasetMaxNormalizedAsset()&&overview){
   const fitted=datasetMaxNormalizedPopulationView();
   const shown=new Set((DATA.overviewEmbeddings?.[el('coverage').value]?.indices||eligibleIndices()).map(i=>DATA.records?.[i]?.profile??i));
   if(fitted?.profiles.some(p=>!shown.has(p)))scope+=' (restricted)';
  }
 }
 if(isMax)return (mode.startsWith('maxnorm-euclidean')?'Max-normalized Euclidean':'Max-normalized L∞')+(typeof unfoldedEnabled==='function'&&unfoldedEnabled()?' · Unfolded faces':'')+' · '+scope;
 return standardSampleEmbeddingTitle(scope);
}
function syncAnalysisControls(){
 const a=analysisExtension(),records=recordExtension();
 el('explorerDescription').textContent=activeStateMode==='merged'?'Vertices are features; edges name reference core groups. Merged groups retain every selected record. Select an edge or vertex to inspect samples; clear the selection for the overview.':'Vertices are features; edges group samples by their unordered leading pair. Coverage selects retained states. Select an edge or vertex to inspect samples; clear the selection for the overview.';
 const choices=a?Object.keys(a.populations).filter(c=>!a.eligibility||c!=='records'):records?['all',...Object.keys(records.populations)]:['all'];
 const singleCohort=choices.length<=1||!!a&&new Set(a.records.map(r=>r.cohort).filter(Boolean)).size===1&&choices.filter(c=>c!=='all').length<=1;
 el('cohortControl').hidden=singleCohort;el('panelCohortControl').hidden=singleCohort;
 for(const id of ['cohortSelect','panelCohortSelect']){
  el(id).innerHTML=choices.map(c=>`<option value="${esc(c)}">${esc(a?(c==='all'&&activeStateMode==='pure'&&a.combDisplay&&!a.eligibility?'Frozen distinct-profile view':cohortChoiceLabel(a.populations[c].title)):records?(c==='all'?'Frozen distinct-profile view':cohortChoiceLabel(records.populations[c].title)):'Full combined reference')}</option>`).join('');el(id).value=activeCohort;el(id).disabled=!a&&!records;el(id).title=cohortControlHelp();
 }
 for(const id of ['stateMode','panelStateMode']){el(id).value=activeStateMode;el(id).checked=activeStateMode==='merged';el(id).disabled=!a}
 const coverageHelp='Choose the largest pure 2-CSTs that together cover at least this percentage of the reference dataset. '+(activeStateMode==='merged'?'Remaining samples are assigned to these groups; all samples stay in the view.':'Show samples belonging to these states.');
 for(const id of ['coverageLabel','panelCoverageLabel']){el(id).textContent='Largest 2-CSTs coverage';el(id).title=coverageHelp}
 for(const id of ['coverage','panelCoverage'])el(id).title=coverageHelp;
 el('scope').options[2].textContent=DATA.eligibleIndices?'Full selected population':'Full dataset';
 const message=!a?(records?'Reviewed source-record and participant views use existing coordinates. Merged states are not prepared.':'Cohort and merged-state assets are not supplied for this dataset.'):activeStateMode==='merged'?'Merged groups retain every selected record. Core pairs name groups; absorbed samples may have different leading taxa.':'Pure-state coverage filters the selected cohort using the reference state catalogue.';
 for(const id of ['analysisMessage','panelAnalysisMessage'])el(id).textContent=message;
 el('exportAssignments').disabled=!a||activeStateMode!=='merged';
 el('export').textContent=activeStateMode==='merged'?'Export core counts CSV':'Export edges CSV';
}
function materializeAnalysis(bundle,cohort,mode,q){
 if(bundle.cohortAnalysis?.combDisplay)return materializeCombDisplay(bundle,cohort,mode,q);
 if(!bundle.cohortAnalysis&&recordExtension(bundle)){if(mode!=='pure')throw Error('Merged states are not prepared');return materializeRecordView(bundle,cohort)}
 const a=bundle.cohortAnalysis,b=bundle.data,spec=a.specs[`${cohort}|${mode}|${q}`];
 if(!spec)throw new Error('Requested cohort view is unavailable');
 const records=a.records,population=spec.population,popSet=new Set(population),m=a.merged[q];
 const labels=mode==='merged'?m.pairs:b.samples.pair;
 const profileRecords=new Map();records.forEach((r,i)=>{if(!profileRecords.has(r.profile)||popSet.has(i)&&!popSet.has(profileRecords.get(r.profile)))profileRecords.set(r.profile,i)});
 const sourceGraph=mode==='merged'?b.graphs['100']:b.graphs[q];
 const sourceCoords=mode==='merged'?b.coords3d['100']:b.coords3d[q];
 const nodePositions=new Map(sourceGraph.nodes.map((n,i)=>[n.id,sourceCoords[i]]));
 const nodesByID=new Map(b.graphs['100'].nodes.map(n=>[n.id,n]));
 const edgesByID=new Map(b.graphs['100'].edges.map(e=>[e.id,e]));
 const coreRank=new Map(spec.cores.map((s,i)=>[s,i+1]));
 const edges=spec.cores.filter(s=>spec.states[s]).map(s=>({...edgesByID.get(s),key:(mode==='merged'?(a.groupNamespace?`${a.groupNamespace}-q${q}-G`:'G'):'E')+coreRank.get(s),frequency:a.fits[spec.states[s]].n}));
 const features=new Set(edges.flatMap(e=>[e.from,e.to]));
 const nodes=sourceGraph.nodes.filter(n=>features.has(n.id)).map(n=>({...n,anchor_row:profileRecords.get(n.anchor_row),anchor_id:records[profileRecords.get(n.anchor_row)].id}));
 const fullFit=a.fits[spec.global],globalByProfile=new Map(fullFit.profileIndices.map((p,i)=>[p,fullFit.profileCoords[i]]));
 const globalCoords=records.map(r=>globalByProfile.get(r.profile)||b.samples.coords[r.profile]);
 for(const [j,ref] of Object.entries(fullFit.references)){const row=profileRecords.get(ref.profile);globalCoords[row]=ref.coords}
 const fitCache=new Map();
 function fit(key){if(fitCache.has(key))return fitCache.get(key);const f=a.fits[key],byProfile=new Map(f.profileIndices.map((p,i)=>[p,f.profileCoords[i]]));const result={...f,fittingScope:'local',coords:f.indices.map(i=>byProfile.get(records[i].profile)),source:'Independent selected-population Euclidean fit (duplicate profiles share coordinates)'};fitCache.set(key,result);return result}
 function references(key,ids,indices){const f=a.fits[key],included=new Set(indices);return ids.map(j=>{const ref=f.references[j],n=nodesByID.get(j),row=profileRecords.get(n.anchor_row);return {...ref,feature:j,row,id:records[row].id,member:included.has(row)}})}
 const included=population.filter(i=>spec.states[labels[records[i].profile]]);
 const overview={fittingScope:included.length===population.length?'population':'population-restriction',indices:included,n:included.length,coords:included.map(i=>globalCoords[i]),source:'Independently fitted selected population, restricted to displayed states'};
 const localEmbeddings={},endpointProjections={},pcaDimensions={},vertexFits={},vertexMap={},vertexReferences={};
 for(const [s,key] of Object.entries(spec.states)){const f=fit(key);localEmbeddings[s]=f;endpointProjections[s]=references(key,s.split(',').map(Number),f.indices);pcaDimensions[s]={n:f.n,...f.pca}}
 for(const [j,key] of Object.entries(spec.vertices)){const f=fit(key);vertexFits[key]=f;vertexMap[q+'_'+j]=key;const ids=[...new Set(edges.filter(e=>e.from===Number(j)||e.to===Number(j)).flatMap(e=>[e.from,e.to]))];vertexReferences[key]=references(key,ids,f.indices)}
 const unseen=new Set(features);let components=0;while(unseen.size){components++;const todo=[unseen.values().next().value];unseen.delete(todo[0]);while(todo.length){const j=todo.pop();for(const e of edges){const k=e.from===j?e.to:e.to===j?e.from:null;if(k!==null&&unseen.delete(k))todo.push(k)}}}
 const g={nodes,edges,coverage:100*included.length/population.length,components};
 const data={...b,samples:{ids:records.map(r=>r.id),pair:records.map(r=>labels[r.profile]),...(b.samples.dominantGe95?{dominantGe95:records.map(r=>b.samples.dominantGe95[r.profile])}:{}),coords:globalCoords},sampleTopFeatures:records.map(r=>b.sampleTopFeatures[r.profile]),eligibleIndices:population,referenceCoords:records.map(r=>b.samples.coords[r.profile]),records,purePairs:records.map(r=>b.samples.pair[r.profile]),assignment:mode==='merged'?m:null,graphs:Object.fromEntries(Object.keys(b.graphs).map(t=>[t,g])),coords3d:Object.fromEntries(Object.keys(b.graphs).map(t=>[t,nodes.map(n=>nodePositions.get(n.id))])),overviewEmbeddings:Object.fromEntries(Object.keys(b.graphs).map(t=>[t,overview])),overviewEndpointProjections:Object.fromEntries(Object.keys(b.graphs).map(t=>[t,references(spec.global,[...features],included)])),localEmbeddings,endpointProjections,pcaDimensions,vertexEmbeddings:{fits:vertexFits,mapping:vertexMap},vertexEndpointProjections:vertexReferences};
 const name=a.populations[cohort].title;
 const methods=mode==='merged'?population.reduce((counts,i)=>{const k=m.methods[records[i].profile];counts[k]=(counts[k]||0)+1;return counts},{}):null;
 const note=mode==='merged'?`Reference cores cover ${fmt(m.referenceCoreCoverage)}% of reference ${a.observationLabel||'library records'}. This population: ${fmt(methods.core||0)} core, ${fmt(methods.rank3||0)} rank-3-supported, ${fmt(methods.knn||0)} nearest-neighbor assignments; 100% assigned. Neighbor fallback uses full-composition Euclidean distances and frozen core/rank-3 donors; no recursive voting.`:'Coverage uses the unchanged reference pure-state catalogue.';
 const meta={...bundle.dataset,analysisKey:`${a.revision}|${cohort}|${mode}|${q}`,viewMode:mode,populationName:name,description:`${name} · ${mode==='merged'?'Merged core groups':'Pure states'}`,observationUnit:'sample',observationLabel:a.observationLabel||'library records',overviewLabel:`${name} — cohort 3D MDS`,overviewDescription:'Independent direct-3D SGD fit of this selected population; pure coverage restricts that fit. Duplicate compositions share coordinates. '+note,globalLabel:'Selected population / restricted',globalDescription:name+' cohort 3D MDS',localDescription:a.localDescription||'Independent full-feature Euclidean 3D metric MDS, SGD, one PCA start, seed 20261013 and 100 epochs (analytic for ≤4 distinct profiles). Epoch completion is not convergence. PCA summaries count library records.',methods:a.methods||'Counts refer to released library records, not independent participants. '+note+' Graph positions and edge lengths retain the combined reference geometry for comparison; missing cohort edges do not refit that layout. Cohort fits cannot be compared by raw coordinate positions alone. Core pairs label merged groups and need not be dominant in every assigned sample.'};
 return {data,meta};
}
async function changeAnalysis(cohort=activeCohort,mode=activeStateMode,q=el('coverage').value){
 if(activeEmbeddingFamily)cohort='all';
 const rememberedMethod=maxNormalizedIds.includes(el('sampleEmbedding').value)?maxNormalizedMethod():null;
 const revision=++datasetSwitchRevision,bundle=datasetRegistry.get(activeEmbeddingFamily?familySelection.collection:META.id);
 cohort=canonicalDisplayCohort(bundle,cohort);
 await Promise.all([queue,graphQueue]);if(revision!==datasetSwitchRevision)return;
 if((mode!=='pure'||cohort!=='all'&&!recordExtension(bundle))&&!bundle.cohortAnalysis)throw new Error('This dataset has no cohort-analysis assets');
 const view=unmodifiedProfileView(bundle,cohort,mode)?{data:bundle.data,meta:bundle.dataset}:materializeAnalysis(bundle,cohort,mode,q);
 activeCohort=cohort;activeStateMode=mode;DATA=view.data;META=view.meta;
 if(activeEmbeddingFamily)familyGraphReady=true;
 if(recordExtension(bundle))el('participantCohort').value=recordExtension(bundle).populations[cohort]&&cohort!=='records'?cohort:'both';
 const neighborhoodCamera=activeEmbeddingFamily?familyCamera():null;
 resetDatasetSelection();datasetPresentation(q);
 if(rememberedMethod&&maxNormalizedAsset()){el('sampleEmbedding').value=rememberedMethod;preferredSampleEmbedding=rememberedMethod}
 historyCoverage=q;draw(activeEmbeddingFamily?null:defaultCamera);
 if(typeof saveDatasetNavigation==='function')saveDatasetNavigation();
 await Promise.all([queue,graphQueue]);
 if(activeEmbeddingFamily){syncFamilySelectors();await renderFamily(neighborhoodCamera)}
}
function assignmentDetails(i){
 const r=viewRecord(i);if(!r)return '';
 let s=`<br>Cohort: ${esc(r.cohort)}<br>Participant: ${esc(r.subject||'not available')}<br>Visit: ${esc(r.visit||'not available')}`;
 if(DATA.assignment){const m=DATA.assignment,p=r.profile,v=m.fallback[p];s+=`<br>Merged core: ${esc(DATA.samples.pair[i].split(',').map(j=>DATA.featureNames[j]).join(' + '))}<br>Assignment: ${esc(m.methods[p])}`;if(v)s+=`<br>Neighbor vote: ${v.votes}/${v.voters} (${fmt(100*v.voteShare)}%); ${v.neighborhood} neighbors searched<br>Nearest winning donor distance (proportion units): ${fmt(v.nearestDistance)}`}
 return s;
}
function exportAssignmentRows(){
 const a=analysisExtension(),q=el('coverage').value,m=a.merged[q];
 const rows=[['record_id','cohort','participant_id','visit','pure_state','merged_core','assignment','vote_share','neighbors','nearest_distance','bridge_rank3','bridge_score','bridge_source_count','bridge_core_count','vote_ties','neighbor_radius']];
 for(const i of eligibleIndices()){const r=a.records[i],p=r.profile,v=m.fallback[p]||{},bridge=m.bridges[datasetRegistry.get(META.id).data.samples.pair[p]]||{};rows.push([r.id,r.cohort,r.subject,r.visit,datasetRegistry.get(META.id).data.samples.pair[p],m.pairs[p],m.methods[p],v.voteShare??'',v.neighborhood??'',v.nearestDistance??'',bridge.rank3??'',bridge.score??'',bridge.sourceIntersection??'',bridge.coreIntersection??'',v.tiedGroups??'',v.radius??''])}
 if(a.eligibility){rows[0].push('eligibility_revision');rows.slice(1).forEach(row=>row.push(a.eligibility.revision))}
 return rows;
}
function initializeAnalysisControls(){
 for(const [c,m] of [['cohortSelect','stateMode'],['panelCohortSelect','panelStateMode']]){
  el(c).onchange=()=>changeAnalysis(el(c).value,activeStateMode).catch(e=>{syncAnalysisControls();datasetMessage(e.message)});
  el(m).onchange=()=>changeAnalysis(activeCohort,el(m).checked?'merged':'pure').catch(e=>{syncAnalysisControls();datasetMessage(e.message)});
 }
 el('coverage').onchange=()=>{if(activeCohort!=='all'||activeStateMode!=='pure')return changeAnalysis();draw();if(typeof saveDatasetNavigation==='function')saveDatasetNavigation()};
 el('exportAssignments').onclick=()=>{const rows=exportAssignmentRows(),text=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=`${META.id}_${activeCohort}_merged_${el('coverage').value}_assignments.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
}

function updateAssignmentExportHelp(){
 const box=el('assignmentExportHelp');
 box.hidden=!DATA.assignment;
 if(!DATA.assignment){box.innerHTML='';return}
 const observed=new Set(eligibleIndices().map(i=>DATA.samples.pair[i]));
 const missing=DATA.assignment.cores.filter(id=>!observed.has(id));
 box.innerHTML='<summary>Assignment export help</summary><p>Export assignments CSV includes each eligible record in the selected dataset/cohort, its original state, merged group, assignment method and supporting diagnostics. Graph selections and visibility checkboxes do not restrict this export.</p><p>Export edges CSV retains all reference core groups, including zero-count rows. The catalogue’s Export CSV instead follows its displayed rows and filters.</p>'+(missing.length?`<p>Reference groups with no records in this dataset/cohort: ${missing.map(id=>esc(stateDisplayLabel(id))).join('; ')}.</p>`:'<p>Every reference core group has records in this dataset/cohort.</p>');
}
function inspect(){
 syncPureTable();mergedComponentModel();updateAssignmentExportHelp();
 if(activeEmbeddingFamily&&familyGraphReady){familyInspectSelection();return}
 if(participant.active){renderParticipantSequence(participantRows());return}
 if(rank3UsesSamples()){rank3Inspect();return}
 inspectBase();if(pureTableIsCandidate())renderPureEvidenceTable(true);else renderMergedComponentTable();
 if(!DATA.assignment)return;
 const box=document.createElement('details');box.style.whiteSpace='normal';
 box.innerHTML='<summary>How samples are assigned</summary><ul><li><b>Original core membership:</b> samples whose original top-2 CST is a reference core group.</li><li><b>Top-3 CST support:</b> samples assigned from a non-core state through a shared top-3 CST connecting it to a reference core. This is a sample count, not a count of distinct top-3 CSTs.</li><li><b>Nearest-neighbor assignment:</b> remaining samples assigned by votes from nearby reference compositions.</li></ul><p>Merged groups are named after their reference core pair. Those two phylotypes are not necessarily the two most abundant in every sample assigned to the group.</p><p>Assignment counts describe the displayed samples; reference diamonds are excluded. Full assignment details are available through Layout and exports.</p>';
 el('inspector').appendChild(box);
}

function edgeExportRows(){
 const basic=['edge_id','pair_id','pair_label','frequency','euclidean_length_percentage_coordinates'];
 const finish=rows=>{const revision=analysisExtension()?.eligibility?.revision;if(revision){rows[0].push('analysis_revision');rows.slice(1).forEach(row=>row.push(revision))}return rows};
 if(!DATA.assignment)return finish([basic,...current().edges.map(e=>[e.key,e.id,e.label,e.frequency,e.length])]);
 const base=new Map(displayGraph(datasetRegistry.get(META.id).data.graphs['100']).edges.map(e=>[e.id,e])),observed=new Map(current().edges.map(e=>[e.id,e]));
 return finish([[...basic,'reference_dataset','population','core_target_percent','population_records','population_percent'],...DATA.assignment.cores.map((id,k)=>{const e=base.get(id),rank1=DATA.rank1Groups?.[id],n=rank1?eligibleIndices().filter(i=>DATA.samples.pair[i]===id).length:observed.get(id)?.frequency||0;return [(analysisExtension().groupNamespace?`${analysisExtension().groupNamespace}-q${el('coverage').value}-G`:'G')+(k+1),id,stateDisplayLabel(id),n,rank1?null:e.length,META.id,META.populationName,el('coverage').value,populationSize(),100*n/populationSize()]})]);
}
