// Dataset-scoped display preferences. Scientific assets and named-view libraries
// never pass through this namespace; legacy preferences remain migration inputs.
const datasetPanelKeys=new Set([
 'vme-legend-percent-basis-v1','vme-subject-trajectory-v1','vme-annotation-tracks-v1','vme-participant-appearance-v1',
 'vme-graph-layout-v1','vme-graph-proportion-strength-v1','vme-graph-embedding-method-v1',
 'vme-graph-label-size-v1','vme-quality-rules-open-v1','vme-rank3-colors-v1',
 'rank2-explorer-panel-layout-v2','rank2-explorer-panel-layout-v1','comb-V3V4-tx-panel-layout-v1',
 'vme-sample-information-size-v1','vme-graph-information-size-v1','udcst-explorer-controls-v1',
 'vme-sample-appearance-open-v1','vme-sample-appearance-visits-open-v1',
 'vme-sample-appearance-background-open-v1','vme-sample-appearance-vertices-open-v1',
 'micove-session-v1','vme-visit-highlight-appearance-v1','vme-panel-maximized-v1','vme-panel-controls-v1','vme-panel-details-v1','vme-catalogue-selected-only-v1','vme-pure-non-core-v1'
]);
function createDatasetPanelStorage(storage,identity){
 const memory=new Map();
 const keyFor=key=>datasetPanelKeys.has(key)?'vme-dataset-panels-v1:'+encodeURIComponent(identity())+':'+key:key;
 return {
  getItem(key){
   const scoped=keyFor(key);if(memory.has(scoped))return memory.get(scoped);
   try{const value=storage.getItem(scoped);if(value!==null)return value;
    return scoped!==key?storage.getItem(key):null;
   }catch{return null}
  },
  setItem(key,value){const scoped=keyFor(key);memory.set(scoped,String(value));try{storage.setItem(scoped,String(value))}catch{}},
  removeItem(key){const scoped=keyFor(key);memory.set(scoped,null);try{storage.removeItem(scoped)}catch{}},
  enableGraphSpheresDefault(){
   const keys=new Set(memory.keys());let updated=0,failed=0;
   try{for(let i=0;i<storage.length;i++)keys.add(storage.key(i))}catch{failed++}
   for(const key of keys){
    if(key!=='vme-panel-controls-v1'&&!/^vme-dataset-panels-v1:[^:]+:vme-panel-controls-v1$/.test(key))continue;
    try{
     const saved=JSON.parse(memory.has(key)?memory.get(key):storage.getItem(key));
     if(saved?.version!==1||!saved.controls||typeof saved.controls!=='object'||Array.isArray(saved.controls)||saved.graphSpheresDefaultVersion===1)continue;
     saved.controls.graphSpheres=true;saved.graphSpheresDefaultVersion=1;
     const value=JSON.stringify(saved);memory.set(key,value);storage.setItem(key,value);updated++;
    }catch{failed++}
   }
   return {updated,failed};
  },
  enableSampleReferenceSpheresDefault(){
   const keys=new Set(memory.keys());let updated=0,failed=0;
   try{for(let i=0;i<storage.length;i++)keys.add(storage.key(i))}catch{failed++}
   for(const key of keys){
    if(key!=='vme-panel-controls-v1'&&!/^vme-dataset-panels-v1:[^:]+:vme-panel-controls-v1$/.test(key))continue;
    try{
     const saved=JSON.parse(memory.has(key)?memory.get(key):storage.getItem(key));
     if(saved?.version!==1||!saved.controls||typeof saved.controls!=='object'||Array.isArray(saved.controls)||saved.sampleReferenceSpheresDefaultVersion===1)continue;
     saved.controls.sampleReferenceSpheres=true;saved.sampleReferenceSpheresDefaultVersion=1;
     const value=JSON.stringify(saved);memory.set(key,value);storage.setItem(key,value);updated++;
    }catch{failed++}
   }
   return {updated,failed};
  },
  resetGraphFading(){
   const keys=new Set(memory.keys());let updated=0,failed=0;
   try{for(let i=0;i<storage.length;i++)keys.add(storage.key(i))}catch{failed++}
   for(const key of keys){
    if(key!=='vme-panel-controls-v1'&&!/^vme-dataset-panels-v1:[^:]+:vme-panel-controls-v1$/.test(key))continue;
    try{
     const saved=JSON.parse(memory.has(key)?memory.get(key):storage.getItem(key));
     if(saved?.version!==1||!saved.controls||typeof saved.controls!=='object')continue;
     saved.controls.graphFadeBySize=true;saved.controls.graphFadeStrength='0.1';
     const value=JSON.stringify(saved);storage.setItem(key,value);memory.set(key,value);updated++;
    }catch{failed++}
   }
   return {updated,failed};
  }
 };
}
const datasetPanelNativeStorage=(()=>{try{return typeof window==='undefined'?localStorage:window.localStorage}catch{return null}})();
const datasetPanelStorage=createDatasetPanelStorage(datasetPanelNativeStorage,()=>{try{return activeEmbeddingFamily?.id||META.id}catch{return META.id}});
let datasetPanelReady=false,datasetPanelRestoring=false,datasetPanelLayout=null,datasetPanelControlDefaults=null,datasetPanelDetailDefaults=null;
let datasetPendingTransitionFocus=null;
const datasetPanelControlIds=['dimension','vertexLabels','graphVertexColor','graphEdgeColor','graphVertexScale','graphSpheres','graphSphereAmbient','graphSphereHighlights','sampleReferenceSphereAmbient','sampleReferenceSphereHighlights','sampleReferenceSpheres','sampleReferenceScale','sampleReferenceColor','graphFadeBySize','graphFadeStrength','graphWidthBySize','graphEdgeWidth','graphWidthStrength','graphDegreeFilter','graphMinimumDegree','graphScope','sampleEmbedding','sampleColorScheme','scope','catalogueSelectedOnly','search','trajectoryImageFormat','trajectoryImageScale',
 'catalogueKind','sampleQuery','heatmapMetric','heatmapOrderDistance','heatmapLinkage','heatmapScale','heatmapClustering','heatmapCutChoice','heatmapK','heatmapKMin','heatmapKMax','heatmapMinSize','heatmapDeepSplit','heatmapMinSamples','heatmapDensityChoice','heatmapRowFirst','heatmapRowLast','heatmapSelectRows',
 'stateTransitionLevel','stateTransitionDisplay','stateTransitionArm','stateTransitionFocus','stateTransitionMinimum','stateTransitionLoops','stateTransitionSize','stateTransitionWidth','stateTransitionZoom','transitionBayesPrior','transitionBayesThreshold'];
function panelReadJson(key,fallback){try{return JSON.parse(datasetPanelStorage.getItem(key))??fallback}catch{return fallback}}
function panelControlSnapshot(){return Object.fromEntries(datasetPanelControlIds.filter(id=>el(id)).map(id=>[id,el(id).type==='checkbox'?el(id).checked:el(id).value]))}
function saveDatasetPanelSettings(){
 if(!datasetPanelReady||datasetPanelRestoring)return;
 trajectorySavePreference();saveAnnotationSettings();
 for(const key of Object.keys(participantAppearance))participantAppearance[key]=participant[key];
 datasetPanelStorage.setItem(participantAppearanceKey,JSON.stringify(participantAppearance));
 datasetPanelStorage.setItem(graphLayoutPreference,graphLayoutMode);
 datasetPanelStorage.setItem(graphStrengthPreference,String(graphProportionStrength));
 datasetPanelStorage.setItem(graphMethodPreference,graphEmbeddingMethod);
 datasetPanelStorage.setItem(graphLabelSizeKey,String(graphLabelFont.size));
 const controls={version:1,graphSpheresDefaultVersion:1,sampleReferenceSpheresDefaultVersion:1,controls:panelControlSnapshot(),composition:{axis:participant.axis,allTaxa:participant.allTaxa,catalogue:participant.catalogue,stateBackground:participant.stateBackground},catalogueSort:{...catalogueSort},rank3:{enabled:rank3.enabled,mode:rank3.mode,threshold:rank3.threshold,basis:rank3.basis,color:rank3.color,background:rank3.background},fitAll:trajectoryFitAll};
 datasetPanelStorage.setItem('vme-panel-controls-v1',JSON.stringify(controls));
 savePanelDetails();
 saveDatasetSession();
 if(datasetPanelLayout)datasetPanelLayout.save();
}
function restoreDatasetPanelSettings(){
 if(!datasetPanelReady)return;
 datasetPanelRestoring=true;
 try{
  if(typeof estimateSyncOptions==='function')estimateSyncOptions();
  trajectorySettings={...trajectoryDefaults,taxonColors:{}};
  try{const s=panelReadJson(trajectoryPreference,null);validateTrajectorySettings(s);trajectorySettings={...trajectoryDefaults,...s,endpointFontSize:s.endpointFontSize??s.fontSize}}catch{}
  trajectoryRanges=null;trajectoryRestoredScale=null;trajectoryContext='';trajectoryFitAll=false;
  annotationSettings={...annotationDefaults,selected:[...annotationDefaults.selected]};annotationLast=null;
  try{const s=panelReadJson(annotationPreference,null);validateAnnotationSettings(s);annotationSettings={...annotationDefaults,...s,selected:[...s.selected],autoPositive:s.autoPositive??true}}catch{}
  Object.assign(participantAppearance,loadParticipantAppearance());Object.assign(participant,participantAppearance);
  setGraphLayoutMode('proportion');setGraphProportionStrength(4);setGraphEmbeddingMethod('weighted_grip');setGraphLabelSize(12,false);
  setGraphLayoutMode(datasetPanelStorage.getItem(graphLayoutPreference));setGraphProportionStrength(datasetPanelStorage.getItem(graphStrengthPreference));setGraphEmbeddingMethod(datasetPanelStorage.getItem(graphMethodPreference));setGraphLabelSize(datasetPanelStorage.getItem(graphLabelSizeKey),false);
  const saved=panelReadJson('vme-panel-controls-v1',null),valid=saved?.version===1;
  const controls={...datasetPanelControlDefaults,...(valid?saved.controls:{})};
  datasetPendingTransitionFocus=typeof controls.stateTransitionFocus==='string'?controls.stateTransitionFocus:null;
  for(const id of datasetPanelControlIds){const node=el(id),v=controls[id];if(!node)continue;
   if(node.type==='checkbox'){if(typeof v==='boolean')node.checked=v}
   else if(typeof v==='string'&&(node.tagName!=='SELECT'||[...node.options].some(o=>o.value===v)))node.value=v;
  }
  // Clamp legacy strengths to the current slider range; preserve saved on/off choices.
  setGraphFadeStrength(valid&&saved.controls?.graphFadeStrength!==undefined?saved.controls.graphFadeStrength:valid&&saved.controls?.graphFadeBySize===true ? .25 : .1);
  el('sampleReferenceSpheres').checked=!(valid&&saved.sampleReferenceSpheresDefaultVersion===1&&saved.controls?.sampleReferenceSpheres===false);
  // Migrate the former off default once, then respect subsequent user choices.
  el('graphSpheres').checked=!(valid&&saved.graphSpheresDefaultVersion===1&&saved.controls?.graphSpheres===false);
  for(const [panel,prefix] of [['graph','graphSphere'],['sample','sampleReferenceSphere']])restoreSphereLighting(panel,{ambient:valid?saved.controls?.[prefix+'Ambient']:undefined,highlights:valid?saved.controls?.[prefix+'Highlights']:undefined});
  setGraphVertexScale(valid?saved.controls?.graphVertexScale:undefined);
  restoreSampleReferenceSettings({scale:valid?saved.controls?.sampleReferenceScale:undefined,color:valid?saved.controls?.sampleReferenceColor:undefined});
  restoreGraphColorSettings({vertex:valid?saved.controls?.graphVertexColor:undefined,edge:valid?saved.controls?.graphEdgeColor:undefined});
  restoreGraphWidthSettings({scaled:valid?saved.controls?.graphWidthBySize:undefined,maximum:valid?saved.controls?.graphEdgeWidth:undefined,strength:valid?saved.controls?.graphWidthStrength:undefined});
  restoreGraphDegreeSettings({enabled:valid&&saved.controls?.graphDegreeFilter===true,minimum:valid?saved.controls?.graphMinimumDegree:2});
  participant.axis=valid&&saved.composition?.axis==='elapsed'?'elapsed':'visit';
  for(const k of ['allTaxa','catalogue','stateBackground'])participant[k]=valid&&typeof saved.composition?.[k]==='boolean'?saved.composition[k]:k==='stateBackground';
  if(valid&&['id','key','label','frequency','length'].includes(saved.catalogueSort?.key)&&typeof saved.catalogueSort?.descending==='boolean')catalogueSort={...saved.catalogueSort};else catalogueSort={key:'id',descending:false};
  trajectoryFitAll=valid&&saved.fitAll===true;
  rank3={enabled:false,mode:'count',threshold:50,basis:'reference',color:'rank3',background:false,selected:[],vertex:null};
  if(valid&&saved.rank3){try{const r={...saved.rank3,selected:[],vertex:null};validateRank3View(r);rank3=r}catch{rank3.enabled=false}}
  // Overview is a display state, not a valid preference for a selected group.
  preferredSampleEmbedding=['local','global','reference',...maxNormalizedIds].includes(el('sampleEmbedding').value)?el('sampleEmbedding').value:'local';
  rank3Colors=panelReadJson('vme-rank3-colors-v1',{});if(!rank3Colors||typeof rank3Colors!=='object'||Array.isArray(rank3Colors))rank3Colors={};
  panelDetailsSeen=new WeakSet();restorePanelDetails();
  el('annotationControls').open=annotationSettings.controlsOpen;
  for(const [,id,key] of sampleAppearanceSections)el(id).open=datasetPanelStorage.getItem(key)!=='false';
  el('trajectoryQualityRules').open=datasetPanelStorage.getItem(qualityRulesExpandedKey)==='true';
  if(datasetPanelLayout)datasetPanelLayout.restore();
  syncParticipantControls();syncRank3Controls();
 }finally{datasetPanelRestoring=false}
}
function installDatasetPanelSettings(){
 if(typeof window==='undefined')return;
 datasetPanelStorage.enableGraphSpheresDefault();
 datasetPanelStorage.enableSampleReferenceSpheresDefault();
 datasetPanelControlDefaults=panelControlSnapshot();
 datasetPanelDetailDefaults=Object.fromEntries([...document.querySelectorAll('details[id]')].map(e=>[e.id,e.open]));
 datasetPanelReady=true;restoreDatasetPanelSettings();
 const save=()=>saveDatasetPanelSettings();
 // Bubble listeners run after each widget's own handler updates its state.
 for(const name of ['input','change','click'])document.addEventListener(name,event=>{
  if(event.target.closest?.('#namedViewsDialog, #viewExportDialog, #familyPanel')||['datasetSelect','panelDatasetSelect'].includes(event.target.id))return;
  save();
 });
 document.addEventListener('toggle',event=>{if(event.target.tagName==='DETAILS')save()},true);
 window.addEventListener('pagehide',save);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});
 if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.tagName==='DETAILS'||n.querySelector?.('details')))))restorePanelDetails()}).observe(document.body,{childList:true,subtree:true});
}

// Save only committed navigation, never the intermediate state of a plot update.
// Keep the participant's cohort-qualified key, not an index that could change in a release.
function datasetNavigationKey(id){return 'vme-dataset-navigation-v1:'+encodeURIComponent(id)}
function readDatasetNavigation(id){
 try{
  const saved=JSON.parse(datasetPanelStorage.getItem(datasetNavigationKey(id)));
  return saved?.version===1&&typeof saved.cohort==='string'&&['pure','merged'].includes(saved.mode)&&typeof saved.coverage==='string'?saved:null;
 }catch{return null}
}
function saveDatasetNavigation(){
 if(!datasetPanelReady||activeEmbeddingFamily)return;
 datasetPanelStorage.setItem(datasetNavigationKey(META.id),JSON.stringify({version:1,cohort:activeCohort,mode:activeStateMode,coverage:el('coverage').value,participant:participant.active?participant.key:null,project:el('participantCohort').value||'both'}));
}
function restoreDatasetParticipant(saved){
 if(!datasetPanelReady||activeEmbeddingFamily)return;
 // A different dataset may contain an identical participant ID. Never carry it over.
 participant.active=false;participant.key='';participant.record=null;
 const projects=new Set((participantData()?.records||[]).map(r=>r.cohort));
 el('participantCohort').value=projects.has(saved?.project)?saved.project:'both';
 if(typeof saved?.participant==='string'&&DATA.records){
  const rows=participantRows(saved.participant),eligible=new Set(eligibleIndices());
  if(rows.length&&rows[0].cohort===activeCohort&&rows.every(r=>eligible.has(r.index))){
   participantRestore({...participant,active:true,key:saved.participant,record:rows[0].index,taxon:null,tableSort:null});
   rank3Clear();rank3.enabled=false;participantGraphSelection();
  }
 }
 syncParticipantControls();syncRank3Controls();
}
function rememberDatasetLocation(id){
 if(typeof window==='undefined'||!window.history?.replaceState)return;
 try{datasetPanelStorage.setItem('micove-last-dataset-v1',id);const url=new URL(window.location.href);url.searchParams.set('dataset',id);window.history.replaceState(window.history.state,'',url.href)}catch{}
}

// Details may be constructed after data load or recreated when heatmaps change.
// Keep absent sections in storage instead of losing them on the next write.
let panelDetailsSeen=new WeakSet();
function panelDetailKey(node){
 if(node.closest?.('dialog, #familyViewsDialog'))return null;
 if(node.id)return node.id;
 const parent=node.parentElement?.closest('[id]'),summary=node.querySelector?.('summary');
 return parent&&summary?'section:'+parent.id+':'+summary.textContent.trim():null;
}
function panelDetailNodes(){return [...document.querySelectorAll('details')].map(node=>[panelDetailKey(node),node]).filter(([key])=>key)}
function restorePanelDetails(){
 if(!datasetPanelReady)return;
 const values={...datasetPanelDetailDefaults,...panelReadJson('vme-panel-details-v1',{})};
 for(const [key,node] of panelDetailNodes())if(!panelDetailsSeen.has(node)){
  panelDetailsSeen.add(node);
  if(!Object.hasOwn(datasetPanelDetailDefaults,key))datasetPanelDetailDefaults[key]=node.open;
  if(typeof values[key]==='boolean')node.open=values[key];
 }
}
function savePanelDetails(){
 restorePanelDetails();
 datasetPanelStorage.setItem('vme-panel-details-v1',JSON.stringify({...panelReadJson('vme-panel-details-v1',{}),...Object.fromEntries(panelDetailNodes().map(([key,node])=>[key,node.open]))}));
}

// Session snapshots contain identities and display choices, never fitted arrays.
let datasetSessionReady=false,datasetSessionRestoring=false,datasetSessionDefaults=null;
function datasetSessionContext(){return [META.id,activeCohort,activeStateMode,el('coverage').value]}
function restoredTransitionFocus(current){const value=datasetPendingTransitionFocus;datasetPendingTransitionFocus=null;return value??current}
function sessionAuxiliary(){return {
 exploration:{...baselineExplore},longitudinal:{...longitudinalState},
 association:Object.fromEntries(['active','level','coverage','mode','cohort','selected','filter'].map(k=>[k,associationView[k]])),
 transitions:stateTransitionMode,heatmapDismissed:heatmapDockDismissed,
 unfoldedChoices:[...unfoldedEdgeChoices],edgeFacesSort:{...edgeFacesSort}
}}
function saveDatasetSession(){
 if(datasetSessionRestoring)return;
 if(activeEmbeddingFamily){if(typeof saveFamilySession==='function')saveFamilySession();return}
 if(!datasetSessionReady)return;
 saveDatasetNavigation();
 const base=datasetRegistry.get(META.id);
 datasetPanelStorage.setItem('micove-session-v1',JSON.stringify({version:1,revision:base.dataset.revision,analysisRevision:displayAnalysisRevision(base),context:datasetSessionContext(),selection:selectionSnapshot(),auxiliary:sessionAuxiliary(),pureCoverage:capturePureCoverage()}));
}
function sessionCamera(camera){return camera&&['eye','center','up'].every(k=>['x','y','z'].every(a=>Number.isFinite(camera[k]?.[a])))&&Math.hypot(...Object.values(camera.up))>0?camera:null}
async function restoreDatasetSession(){
 if(activeEmbeddingFamily)return;
 datasetSessionReady=false;datasetSessionRestoring=true;const context=JSON.stringify(datasetSessionContext());
 try{
  datasetSessionDefaults??=JSON.parse(JSON.stringify(sessionAuxiliary()));
  const base=datasetRegistry.get(META.id),stored=panelReadJson('micove-session-v1',null);
  const saved=stored?.version===1&&stored.revision===base.dataset.revision&&stored.analysisRevision===displayAnalysisRevision(base)&&JSON.stringify(stored.context)===JSON.stringify(datasetSessionContext())?stored:null;
  const aux={...datasetSessionDefaults,...saved?.auxiliary};
  baselineExplore=explorationDefaults();
  try{if(aux.exploration?.dataset===META.id){if(aux.exploration.visit!=='off')explorationValidate(aux.exploration,base);baselineExplore={...baselineExplore,...aux.exploration}}}catch{}
  Object.assign(longitudinalState,datasetSessionDefaults.longitudinal);
  const l=aux.longitudinal,c=BUNDLE_PACK.longitudinalClusters?.[META.id]?.cohorts[l?.cohort];
  if(l?.dataset===META.id&&c?.banks[l.metric+'|'+l.distance]?.fits[l.size+'|'+l.split]&&c.results[l.pair]){
   Object.assign(longitudinalState,l);
   if(l.subjects){const ids=new Set(c.visits.map(r=>r.subject));longitudinalState.subjects=l.subjects.filter(id=>ids.has(id))}
  }
  Object.assign(associationView,datasetSessionDefaults.association);
  const a=aux.association;
  if(META.id==='zapps-pressmat-v4'&&['edge','vertex'].includes(a?.level)&&['60','70','80','90'].includes(a.coverage)&&['both','ZAPPS','PreSSMat'].includes(a.cohort)&&['matched','all'].includes(a.mode))Object.assign(associationView,a);
  for(const [id,key] of [['associationLevel','level'],['associationCoverage','coverage'],['associationMode','mode'],['associationCohort','cohort'],['associationSearch','filter']])if(el(id))el(id).value=associationView[key];
  stateTransitionMode=aux.transitions===true;heatmapDockDataset=META.id;heatmapDockDismissed=aux.heatmapDismissed===true;heatmapDockIdentity=null;
  unfoldedEdgeChoices.clear();for(const entry of aux.unfoldedChoices||[])if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]?.enabled==='boolean')unfoldedEdgeChoices.set(entry[0],entry[1]);
  if(aux.edgeFacesSort)edgeFacesSort={...aux.edgeFacesSort};
  const s=saved?.selection,g=current();
  if(s&&(s.selected===null||g.edges.some(e=>e.id===s.selected))&&(s.selectedVertex===null||g.nodes.some(n=>n.id===s.selectedVertex))&&!(s.selected!==null&&s.selectedVertex!==null)){
   // Deferred comb local assets must arrive before graph inspection or drawing.
   await ensureNamedViewAssets({dataset:META.id,populationComparison:activeSensitivityMode,cohort:activeCohort,stateMode:activeStateMode,coverage:el('coverage').value,selection:s});
   if(context!==JSON.stringify(datasetSessionContext()))return;
   selected=s.selected;selectedVertex=s.selectedVertex;
   hiddenEdges=new Set((s.hiddenEdges||[]).filter(id=>g.edges.some(e=>e.id===id)));
   try{validateParticipantView(s.participant,base);validateParticipantBackgroundView(s.participant,base,DATA,activeStateMode);participantRestore(s.participant)}catch{}
   try{validateRank3View(s.rank3,base);rank3Restore(s.rank3)}catch{}
   try{validateEdgeFacesView(s,base,DATA);edgeFacesRestore(s.edgeFaces)}catch{}
   restoreUnfoldedChoice(s);
   try{validatePureCoverage(saved.pureCoverage,{dataset:META.id,coverage:el('coverage').value,cohort:activeCohort,stateMode:activeStateMode,selection:s});restorePureCoverage(saved.pureCoverage)}catch{}
   pendingSampleCamera=sessionCamera(s.sampleCamera);pendingGraphCamera=sessionCamera(s.graphCamera);
  }
  syncExplorationControls();syncLongitudinalControls();syncParticipantControls();syncRank3Controls();syncAssociations();
 }catch(error){datasetMessage('Some saved settings could not be restored: '+error.message)}
 finally{datasetSessionRestoring=false;datasetSessionReady=true}
}
