// Dataset activation is serialized after pending plot work. JSON imports contain no code.
installCombDisplay(BUNDLE_PACK);
const datasetRegistry=new Map(BUNDLE_PACK.bundles.map(b=>[b.dataset.id,b]));
initializeSensitivityState();
if(META.id==='comb-V3V4-tx')selectSensitivityData(defaultPopulationComparison(META.id));
let datasetSwitchRevision=0,activeCohort="all",activeStateMode="pure";
const datasetKey=()=>META.id+'@'+META.revision+(META.analysisKey?'|'+META.analysisKey:'');
const colorStorageKey=()=> 'rank2-edge-colors:'+META.id+'@'+META.revision;
function loadDatasetColors(){
 let saved=null;try{
  saved=localStorage.getItem(colorStorageKey());
  // Preserve the existing dataset's colors on the first generalized-viewer load.
  if(saved===null&&META.id==='comb-V3V4-tx')saved=localStorage.getItem('rank2-edge-colors');
  edgeColors=JSON.parse(saved||'{}');
 }catch{edgeColors={}}
 if(!edgeColors||typeof edgeColors!=='object'||Array.isArray(edgeColors))edgeColors={};
}
function datasetDisplayTitle(meta){return BUNDLE_PACK.datasetPresentation?.[meta.id]?.title||meta.title||meta.id}
// Presentation only; retain scientific metadata and all saved identifiers verbatim.
function cstTerminology(text){return text.replace(/\b([1-9][0-9]*|k)-udCST(s?)\b/g,'top-$1 CST$2').replace(/\b([1-9][0-9]*|k)-dCST(s?)\b/g,'ordered top-$1 CST$2').replaceAll('rank-2 states','top-2 CSTs').replaceAll('Rank-2 states','Top-2 CSTs')}
function datasetDisplayMethods(meta){return cstTerminology([BUNDLE_PACK.datasetPresentation?.[meta.id]?.methodsPrefix,meta.methods||'Dataset methods are not supplied.'].filter(Boolean).join(' '))}
function updateDatasetChoices(){
 const catalogue=new Map(typeof VME_ASSETS==='undefined'?[]:Object.entries(VME_ASSETS.manifest.datasets).map(([id,x])=>[id,x]));
 for(const [id,b] of datasetRegistry)catalogue.set(id,b);
 let choices=[...catalogue.values()].filter(b=>!BUNDLE_PACK.distributionDatasets||BUNDLE_PACK.distributionDatasets.includes(b.dataset.id)).map(b=>({id:b.dataset.id,title:datasetDisplayTitle(b.dataset)})).concat([...embeddingFamilyRegistry.values()],BUNDLE_PACK.optionalDatasetLinks||[]);
 if(globalThis.VMEAssetLoader)choices=VMEAssetLoader.groupSkinChoices(choices,globalThis.VME_ASSETS?.skinCohorts||[]);
 const options=choices.map(f=>`<option value="${esc(f.id)}">${esc(f.title)}</option>`).join('')+'<option value="empty">Empty</option><option value="">Load dataset bundle…</option>';
 for(const id of ['datasetSelect','panelDatasetSelect']){el(id).innerHTML=options;el(id).value=activeEmbeddingFamily?.id||META.id}
}
// Move the existing widgets, preserving their handlers, values and saved identities.
let sampleControlHeaderSlots=null;
function syncSampleControlPlacement(){
 const sidebar=el('sampleSidePanels'),active=!activeEmbeddingFamily;
 let controls=el('sampleViewControls');
 if(active){
  if(!controls){
   const widgets=[el('sampleMethod').closest('label'),el('unfoldFaces').closest('label'),el('unfoldAnchor').closest('label'),el('valenciaColorControls'),el('sampleLegendPosition').closest('label')];
   sampleControlHeaderSlots=widgets.map(node=>{const slot=document.createComment('sample header control');node.before(slot);return {node,slot}});
   controls=document.createElement('section');controls.id='sampleViewControls';controls.setAttribute('aria-label','Sample view settings');
   const coloring=document.createElement('details');coloring.id='sampleColoringControls';coloring.open=true;
   const heading=document.createElement('summary');heading.textContent='Sample coloring';coloring.append(heading,widgets[3]);
   controls.append(widgets[0],widgets[1],widgets[2],coloring,widgets[4]);sidebar.prepend(controls);
  }
  if(el('estimateControls'))el('sampleColoringControls').append(el('estimateControls'));
  if(typeof jointEmbeddingSync==='function')jointEmbeddingSync();
 }else if(controls){
  if(el('estimateControls'))el('sampleSummary').before(el('estimateControls'));
  for(const {node,slot} of sampleControlHeaderSlots){slot.replaceWith(node)}
  controls.remove();sampleControlHeaderSlots=null;
 }
}
function datasetPresentation(coverage=META.defaultCoverage){
 document.title='MiCOVE — '+datasetDisplayTitle(META)+(META.analysisKey?' · '+META.populationName+' · '+(activeStateMode==='merged'?'Merged '+coverage+'% cores':'Pure states'):'');el('datasetTitle').textContent='MiCOVE';
 el('datasetSummary').textContent=`${META.description} · ${fmt(populationSize())} ${META.observationLabel} · ${fmt(META.featureCount)} features`;
 el('datasetMethods').textContent=datasetDisplayMethods(META);
 el('graphGeometryNote').textContent=META.graphGeometryDescription||(META.analysisKey?'Graph positions and Euclidean endpoint lengths retain the combined reference geometry. Edges without selected-cohort records are hidden; the displayed subgraph is not refitted. Sample embeddings are fitted independently.':'Initial positions: SGD metric MDS of shortest-path distances using assigned Euclidean edge lengths. Drawn lengths are approximate. Disconnected component placement is arbitrary; dragging changes only the display.');
 el('legacyLinks').hidden=META.id!=='comb-V3V4-tx';
 const options=Object.keys(datasetRegistry.get(META.id).data.graphs).sort((a,b)=>Number(a)-Number(b)).map(q=>`<option value="${q}">${q}%</option>`).join('');
 for(const id of ['coverage','panelCoverage']){el(id).innerHTML=options;el(id).value=coverage}
 el('sampleEmbedding').options[0].textContent=META.overviewLabel;
 el('panelSampleEmbedding').options[0].textContent=META.overviewLabel;
 for(const id of ['sampleEmbedding','panelSampleEmbedding'])el(id).options[1].textContent=META.globalLabel||'Global / restricted';
 loadDatasetColors();edgeOrder=new Map(sensitivityPaletteEdges(datasetRegistry.get(META.id)).map((e,i)=>[e.id,i]));updateDatasetChoices();syncAnalysisControls();syncSensitivityControls();
 if(typeof syncAssociations==='function')syncAssociations();
 syncSampleControlPlacement();
}
function resetDatasetSelection(){
 pureCoverageComparison=null;
 participantReset();
 rank3Clear();
 ++sampleRevision;++graphRevision;pendingSampleCamera=null;pendingGraphCamera=null;sampleRenderedKey=null;
 selected=null;selectedVertex=null;hiddenEdges=new Set();selectionHistory.length=0;selectionFuture.length=0;
 preferredSampleEmbedding='local';el('sampleEmbedding').value='local';el('scope').value='core';el('graphScope').value='all';
 el('search').value='';el('endpointChoices').hidden=true;drag=null;
 if(participant.active)participantGraphSelection();
}
// UI defaults use existing saved assignments; never change bundle metadata/results.
function defaultDatasetView(bundle,cohort='all'){
 cohort=canonicalDisplayCohort(bundle,cohort);
 const coverage=Object.hasOwn(bundle.data.graphs,'60')?'60':bundle.dataset.defaultCoverage;
 const mode=bundle.cohortAnalysis?.specs[`${cohort}|merged|${coverage}`]?'merged':'pure';
 const view=unmodifiedProfileView(bundle,cohort,mode)?{data:bundle.data,meta:bundle.dataset}:materializeAnalysis(bundle,cohort,mode,coverage);
 return {cohort,mode,coverage,...view};
}
// Revalidate remembered selections against the current release before materializing.
function datasetActivationView(bundle,cohort='all',recall=true){
 const saved=recall&&typeof readDatasetNavigation==='function'?readDatasetNavigation(bundle.dataset.id):null;
 if(saved)saved.cohort=canonicalDisplayCohort(bundle,saved.cohort);
 if(saved&&Object.hasOwn(bundle.data.graphs,saved.coverage)){
  try{
   const view=unmodifiedProfileView(bundle,saved.cohort,saved.mode)?{data:bundle.data,meta:bundle.dataset}:materializeAnalysis(bundle,saved.cohort,saved.mode,saved.coverage);
   return {...view,cohort:saved.cohort,mode:saved.mode,coverage:saved.coverage,navigation:saved};
  }catch{} // Removed populations or unprepared combinations use the existing default.
 }
 return defaultDatasetView(bundle,cohort);
}
async function switchDataset(id,{recall=true}={}){
 if(embeddingFamilyRegistry.has(id))return activateEmbeddingFamily(id);
 if(!datasetRegistry.has(id)&&!(typeof VME_ASSETS!=='undefined'&&VME_ASSETS.manifest.datasets[id]))throw new Error('Unknown dataset '+id);
 const revision=++datasetSwitchRevision,useDefault=recall&&(id!==META.id||!!activeEmbeddingFamily);
 await loadForSelection(async()=>{await ensureDatasetLoaded(id);if(useDefault)await ensureSensitivityLoaded(defaultPopulationComparison(id))},revision,()=>switchDataset(id,{recall}));
 if(revision!==datasetSwitchRevision)return;
 const wasFamily=!!activeEmbeddingFamily;
 ++participantOpenRevision;
 await Promise.all([queue,graphQueue,typeof trajectoryQueue==='undefined'?Promise.resolve():trajectoryQueue]);
 if(revision!==datasetSwitchRevision)return;
 if(id!=='comb-V3V4-tx'&&activeSensitivityMode!=='baseline'){if(rebuiltOnlyPopulation())activeSensitivityMode='baseline';else selectSensitivityData('baseline')}
 if(typeof saveDatasetPanelSettings==='function')saveDatasetPanelSettings();
 await leaveEmbeddingFamily(revision);
 if(revision!==datasetSwitchRevision)return;
 if(id===META.id&&!wasFamily){updateDatasetChoices();return}
 await Promise.all([queue,graphQueue]);
 if(revision!==datasetSwitchRevision)return;
 if(useDefault&&id==='comb-V3V4-tx')selectSensitivityData(defaultPopulationComparison(id));
 datasetSessionReady=false;
 const bundle=datasetRegistry.get(id),view=datasetActivationView(bundle,'all',recall);
 participant.active=false;participant.key='';participant.record=null;
 DATA=view.data;META=view.meta;
 activeCohort=view.cohort;activeStateMode=view.mode;resetDatasetSelection();
 datasetPresentation(view.coverage);historyCoverage=view.coverage;
 if(typeof restoreDatasetPanelSettings==='function')restoreDatasetPanelSettings();
 if(typeof restoreDatasetParticipant==='function')restoreDatasetParticipant(view.navigation);
 if(typeof restoreDatasetSession==='function')await restoreDatasetSession();
 if(revision!==datasetSwitchRevision)return;
 if(typeof rememberDatasetLocation==='function')rememberDatasetLocation(id);
 draw(pendingSampleCamera?null:defaultCamera,true);
 await Promise.all([queue,graphQueue]);
}
async function registerDataset(bundle){
 validateBundle(bundle);
 if(datasetRegistry.has(bundle.dataset.id)||(typeof VME_ASSETS!=='undefined'&&VME_ASSETS.manifest.datasets[bundle.dataset.id]))throw new Error('Dataset '+bundle.dataset.id+' is already loaded. Reload the page to replace its bundle.');
 datasetRegistry.set(bundle.dataset.id,bundle);updateDatasetChoices();await switchDataset(bundle.dataset.id);
}

// Asset admission is separate from activation: stale selections may finish
// loading, but cannot replace the user's newer selection or mutate its settings.
const datasetLoads=new Map();let sensitivityLoad=null,neighborhoodLoad=null;
async function ensureDatasetLoaded(id){
 if(datasetRegistry.has(id))return;
 if(typeof VME_ASSETS==='undefined')throw Error('Load dataset '+id+' before restoring this view.');
 if(datasetLoads.has(id))return datasetLoads.get(id);
 const promise=(async()=>{
  const part=await VME_ASSETS.dataset(id,value=>VME_ASSETS.validateDataset(value,id));
  VME_ASSETS.mergePack(BUNDLE_PACK,part);
  if(part.combDisplay)installCombDisplay(BUNDLE_PACK);
  datasetRegistry.set(id,part.bundles[0]);initializeSensitivityState();
 })();datasetLoads.set(id,promise);
 try{await promise}finally{datasetLoads.delete(id)}
}
async function ensureSensitivityLoaded(mode){
 if(mode==='baseline'||sensitivityVariants.has(mode))return;
 await ensureDatasetLoaded('comb-V3V4-tx');
 if(rebuiltOnlyPopulation()){if(mode!=='rebuilt')throw Error('Population unavailable in the rebuilt-only package');return}
 if(typeof VME_ASSETS==='undefined')return;
 if(!sensitivityLoad)sensitivityLoad=(async()=>{
  const part=await VME_ASSETS.prepareSensitivity({combDisplay:sensitivityBaseline.display});
  for(const item of Object.values(part.sensitivityComparisons)){
   const b={...sensitivityBaseline.bundle};delete b.cohortAnalysis;
   validateParticipantSupplement(item.records.participants,b,item.records.adapter);
  }
  VME_ASSETS.mergePack(BUNDLE_PACK,part);initializeSensitivityState();
 })().catch(error=>{sensitivityLoad=null;throw error});
 await sensitivityLoad;
}
async function ensureEmbeddingFamiliesLoaded(){
 if(typeof VME_ASSETS==='undefined'||!VME_ASSETS.manifest.neighborhoods)return;
 if(!neighborhoodLoad)neighborhoodLoad=(async()=>{
  for(const id of VME_ASSETS.manifest.neighborhoods.datasets)await ensureDatasetLoaded(id);
  const part=await VME_ASSETS.neighborhoods();
  // Replace selector-only metadata, never append duplicate family identities.
  BUNDLE_PACK.embeddingFamilies=[];VME_ASSETS.mergePack(BUNDLE_PACK,part);
  principalAsset=BUNDLE_PACK.principalPaths||null;
  for(const family of part.embeddingFamilies)embeddingFamilyRegistry.set(family.id,family);
 })().catch(error=>{neighborhoodLoad=null;throw error});
 await neighborhoodLoad;
}
let assetStatusRevision=0;
async function loadForSelection(task,revision,retry){
 const statusRevision=++assetStatusRevision;
 if(typeof VME_ASSETS!=='undefined'){datasetMessage('');VME_ASSETS.status('Loading selected view…');VME_ASSETS.retry(null)}
 try{await task();if(statusRevision===assetStatusRevision&&typeof VME_ASSETS!=='undefined'){VME_ASSETS.status('');if(revision!==datasetSwitchRevision)updateDatasetChoices()}}
 catch(error){
  if(statusRevision===assetStatusRevision&&typeof VME_ASSETS!=='undefined'){
   VME_ASSETS.status(revision===datasetSwitchRevision?error.message:'');
   if(revision===datasetSwitchRevision)VME_ASSETS.retry(retry);
  }
  if(revision===datasetSwitchRevision)throw error;
 }
}

function datasetMessage(message){for(const id of ['datasetMessage','panelDatasetMessage'])el(id).textContent=message}
for(const id of ['datasetSelect','panelDatasetSelect'])el(id).onchange=()=>{
 const value=el(id).value;
 if(value==='empty'){location.assign(new URL('empty.html',location.href).href);return}
 if(value==='skin'||['skin-population-v1','skin-population-v2'].includes(globalThis.VME_ASSETS?.manifest.datasets[value]?.capability)||BUNDLE_PACK.optionalDatasetLinks?.some(item=>item.id===value)){const url=new URL(location.href);url.searchParams.set('dataset',value);url.searchParams.delete('cohort');location.assign(url.href);return}
 if(value===''){
  // Restore both selectors before opening the picker, including when it is canceled.
  updateDatasetChoices();el('datasetFile').value='';el('datasetFile').click();return;
 }
 return switchDataset(value).catch(error=>{updateDatasetChoices();datasetMessage(error.message)});
};
el('datasetFile').onchange=async()=>{
 const file=el('datasetFile').files?.[0];if(!file)return;
 datasetMessage('Validating '+file.name+'…');
 try{const bundle=JSON.parse(await file.text());await registerDataset(bundle);datasetMessage('Loaded '+datasetDisplayTitle(bundle.dataset))}
 catch(error){datasetMessage(error.message)}finally{el('datasetFile').value=''}
};
const initialDatasetView=datasetActivationView(datasetRegistry.get(META.id),META.id===BUNDLE_PACK.default?(BUNDLE_PACK.initialView?.cohort||'all'):'all');
activeCohort=initialDatasetView.cohort;activeStateMode=initialDatasetView.mode;
DATA=initialDatasetView.data;META=initialDatasetView.meta;
const initialCoverage=initialDatasetView.coverage;
el('dimension').value='3';
datasetPresentation(initialCoverage);initializeAnalysisControls();
