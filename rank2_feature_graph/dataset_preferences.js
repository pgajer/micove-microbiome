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
 'vme-panel-maximized-v1','vme-panel-controls-v1','vme-panel-details-v1','vme-catalogue-selected-only-v1','vme-pure-non-core-v1'
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
const datasetPanelControlIds=['dimension','vertexLabels','graphVertexColor','graphEdgeColor','graphVertexScale','graphSpheres','graphSphereAmbient','graphSphereHighlights','sampleReferenceSphereAmbient','sampleReferenceSphereHighlights','sampleReferenceSpheres','sampleReferenceScale','sampleReferenceColor','graphFadeBySize','graphFadeStrength','graphWidthBySize','graphEdgeWidth','graphWidthStrength','graphDegreeFilter','graphMinimumDegree','graphScope','sampleEmbedding','sampleColorScheme','scope','catalogueSelectedOnly','search','trajectoryImageFormat','trajectoryImageScale'];
function panelReadJson(key,fallback){try{return JSON.parse(datasetPanelStorage.getItem(key))??fallback}catch{return fallback}}
function panelControlSnapshot(){return Object.fromEntries(datasetPanelControlIds.map(id=>[id,el(id).type==='checkbox'?el(id).checked:el(id).value]))}
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
 datasetPanelStorage.setItem('vme-panel-details-v1',JSON.stringify(Object.fromEntries([...document.querySelectorAll('details[id]')].filter(e=>!e.closest('#namedViewsDialog, #viewExportDialog, #familyPanel')).map(e=>[e.id,e.open]))));
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
  for(const id of datasetPanelControlIds){const node=el(id),v=controls[id];
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
  const details={...datasetPanelDetailDefaults,...panelReadJson('vme-panel-details-v1',{})};
  for(const [id,v] of Object.entries(details)){const node=document.getElementById(id);if(node?.tagName==='DETAILS'&&typeof v==='boolean')node.open=v}
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
 try{const url=new URL(window.location.href);url.searchParams.set('dataset',id);window.history.replaceState(window.history.state,'',url.href)}catch{}
}
