// Bookmarks contain settings and optional small R graph-layout snapshots; never sample data or assignments.
const namedViewsKey='vme-named-3d-views-v1';
function readNamedViews(storage=localStorage){
 const raw=storage.getItem(namedViewsKey);if(raw===null)return [];
 let data;try{data=JSON.parse(raw)}catch{throw Error('Saved views could not be read. Existing storage has been left untouched.')}
 if(data?.version!==1||!Array.isArray(data.views)||data.views.some(v=>!v||typeof v.id!=='string'||typeof v.name!=='string')||new Set(data.views.map(v=>v.id)).size!==data.views.length)throw Error('Saved views use an unreadable format. Existing storage has been left untouched.');
 return data.views;
}
function writeNamedViews(views,storage=localStorage){
 try{storage.setItem(namedViewsKey,JSON.stringify({version:1,views}))}catch{throw Error('Could not save views in this browser. Storage may be full or unavailable; previous saved views are unchanged.')}
}
const namedViewsFileFormat='vaginal-microbiome-explorer-named-views',namedViewsFileLimit=5*1024*1024;
function exportNamedViewsJson(views){
 if(!views.length)throw Error('Save a named view before exporting.');
 return JSON.stringify({format:namedViewsFileFormat,version:1,views},null,2)+'\n';
}
function namedViewFingerprint(view){
 // Ignore local identity and collision-renamed titles when detecting repeat imports.
 const {id,name,...settings}=view;
 const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
 return JSON.stringify(ordered(settings));
}
function parseNamedViewsJson(text){
 if(new Blob([text]).size>namedViewsFileLimit)throw Error('Named-view files must be at most 5 MiB.');
 let file;try{file=JSON.parse(text)}catch{throw Error('This file is not valid JSON. No views were imported.');}
 if(file?.format!==namedViewsFileFormat||file.version!==1||!Array.isArray(file.views)||!file.views.length||file.views.length>1000)throw Error('Unsupported named-view file. Expected version 1 with 1–1000 views.');
 const ids=new Set();
 for(const view of file.views){
  if(!view||typeof view.id!=='string'||!view.id||ids.has(view.id)||typeof view.name!=='string'||!view.name.trim()||view.name.length>100||typeof view.description!=='string'||typeof view.savedAt!=='string'||!Number.isFinite(Date.parse(view.savedAt)))throw Error('Invalid named-view entry or duplicate identifier. No views were imported.');
  ids.add(view.id);
 }
 return file.views;
}
function namedViewImportSummary(view){
 const bundle=datasetRegistry.get(view.dataset),matching=!!bundle&&bundle.dataset.revision===view.datasetRevision;
 const p=view.selection?.participant,metadata=BUNDLE_PACK.participants?.[view.dataset];
 const record=p?.active&&matching&&p.auditRevision===metadata?.provenance.auditSha256?metadata?.records.find(r=>r.index===p.record):null;
 let participant='None';
 if(p?.active){
  let key;try{key=JSON.parse(p.key)}catch{}
  participant=record?`${record.subject} · ${record.cohort} · ${record.label}`:Array.isArray(key)&&key.length===2&&key.every(v=>typeof v==='string')?`${key[1]} · ${key[0]} (metadata unavailable)`:'Participant metadata unavailable';
 }
 const states=Array.isArray(p?.backgroundStates)?p.backgroundStates:[],reference=new Map(matching?displayGraph(bundle.data.graphs['100'],bundle.data).edges.map(e=>[e.id,e.label]):[]);
 const scheme=p?participantBackgroundSchemeFor(p,view.stateMode):null;
 const text=value=>typeof value==='string'?value:'Unavailable';
 return {dataset:bundle?datasetDisplayTitle(bundle.dataset):text(view.dataset),context:`${text(view.cohort)} · ${view.stateMode==='merged'?'Merged groups':view.stateMode==='pure'?'Pure states':'Unavailable mode'} · ${text(view.coverage)}% target${view.participantSorting?' · Subject sorting: '+text(view.participantSorting.target)+'%':''}`,participant,
  highlights:states.length?`${states.length} ${scheme==='merged'?'assigned merged groups':'original top-2 CST pairs'}:\n`+states.map(id=>reference.get(id)||`State ${text(id)} (label unavailable)`).join('\n'):'None'};
}
function previewNamedViewsJson(text,storage=localStorage){
 const views=parseNamedViewsJson(text),existing=readNamedViews(storage),fingerprints=new Set(existing.map(namedViewFingerprint)),names=new Set(existing.map(v=>v.name.toLocaleLowerCase()));
 return views.map(view=>{
  let error=null;try{validateNamedView(view)}catch(e){error=e.message}
  const duplicate=fingerprints.has(namedViewFingerprint(view));
  return {view,...namedViewImportSummary(view),error,duplicate,status:error?'Unavailable: '+error:duplicate?'Already saved; will be skipped':names.has(view.name.trim().toLocaleLowerCase())?'Ready; name will be renamed':'Ready to import'};
 });
}
function importNamedViewsJson(text,storage=localStorage,newId=()=>crypto.randomUUID(),selectedIds=null){
 const fileViews=parseNamedViewsJson(text);
 if(selectedIds!==null&&(!Array.isArray(selectedIds)||!selectedIds.length||new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>!fileViews.some(v=>v.id===id))))throw Error('Choose at least one available view to import.');
 const chosen=selectedIds===null?fileViews:fileViews.filter(v=>selectedIds.includes(v.id));
 for(const view of chosen){try{validateNamedView(view)}catch(error){throw Error(`Cannot import “${view.name}”: ${error.message} No views were imported.`)}}
 const views=readNamedViews(storage),fingerprints=new Set(views.map(namedViewFingerprint)),names=new Set(views.map(v=>v.name.toLocaleLowerCase()));
 const imported=[];let skipped=0,renamed=0;
 for(const view of chosen){
  const fingerprint=namedViewFingerprint(view);if(fingerprints.has(fingerprint)){skipped++;continue;}
  const title=view.name.trim();let name=title,index=2;
  while(names.has(name.toLocaleLowerCase())){const suffix=` (imported ${index++})`;name=title.slice(0,100-suffix.length)+suffix;}
  if(name!==title)renamed++;
  let id=newId();while(views.some(v=>v.id===id))id=newId();
  const added={...view,id,name};views.push(added);imported.push(added);names.add(name.toLocaleLowerCase());fingerprints.add(fingerprint);
 }
 // All validation and merging finish before one atomic localStorage write.
 if(imported.length)writeNamedViews(views,storage);
 return {imported:imported.length,skipped,renamed,selectedId:imported[0]?.id};
}
async function captureNamedView(){
 await waitGraphEmbedding();
 await Promise.all([queue,graphQueue,trajectoryQueue]);
 if(el('dimension').value!=='3')throw Error('Switch the graph to 3D before saving a named 3D view. Existing views can still be restored.');
 if(activeEmbeddingFamily)await familyRenderQueue;
 return captureNamedViewSettings();
}
function captureNamedViewSettings(includeNeighborhood=true){
 const base=datasetRegistry.get(META.id),selection=selectionSnapshot(),participantSorting=captureParticipantSorting();
 const view={version:1,populationComparison:META.id==='comb-V3V4-tx'&&!activeEmbeddingFamily?activeSensitivityMode:'baseline',...(includeNeighborhood&&activeEmbeddingFamily?{neighborhood:familyBookmark('Neighborhood',false)}:{}),displayRevision:activeStateMode==='merged'?base.cohortAnalysis?.displayRevision:null,dataset:base.dataset.id,datasetRevision:base.dataset.revision,analysisRevision:unmodifiedProfileView(base,activeCohort,activeStateMode)?null:displayAnalysisRevision(base),
  pureCoverage:capturePureCoverage(),annotations:annotationSnapshot(),participantSorting,subjectEmbeddingFit:captureSubjectEmbeddingFit(),qualityRulesExpanded:el('trajectoryQualityRules').open,sampleAppearance: captureSampleAppearanceLayout(),trajectory:trajectorySnapshot(),cohort:activeCohort,stateMode:activeStateMode,coverage:el('coverage').value,selection,vertexLabels:el('vertexLabels').checked,graphFadeBySize:el('graphFadeBySize').checked,graphFadeStrength:graphFadeStrength(),graphEdgeWidth:graphWidthSettings(),graphColors:graphColorSettings(),graphVertexScale:graphVertexScale(),graphSpheres:graphSpheresEnabled(),graphSphereLighting:sphereLightingSettings('graph'),sampleSphereLighting:sphereLightingSettings('sample'),sampleReferenceSpheres:el('sampleReferenceSpheres').checked,sampleReferenceAppearance:sampleReferenceSettings(),graphDegreeFilter:graphDegreeSettings(),graphLabelSize:graphLabelFont.size,graphLayout:graphLayoutMode,graphProportionStrength,graphEmbeddingMethod,graphEmbeddingFit:captureGraphEmbeddingFit(),graphEmbeddingRuntime:graphLayoutMode!=='reference'&&graphEmbeddingMethod!=='spring'?graphLayoutResult(3).runtimeId:null,
  description:[selection.participant?.active?'Participant '+participantRows()[0].subject:selection.edgeFaces?.enabled?'Faces around selected edge ('+selection.edgeFaces.checked.length+' checked)':selection.rank3?.enabled?'Top-3 CST faces: '+(selection.rank3.selected.length?selection.rank3.selected.length+' selected':selection.rank3.vertex!==null?'incident to vertex '+selection.rank3.vertex:'filtered overview'):'Top-2 CSTs',datasetDisplayTitle(base.dataset),analysisExtension()?.populations[activeCohort]?.title||recordExtension()?.populations[activeCohort]?.title||'Full reference',activeStateMode==='merged'?'Merged groups':'Pure states',el('coverage').value+'% target',...(participantSorting?['Subject sorting: '+participantSorting.target+'%']:[]),'Graph: '+graphLayoutLabels[graphLayoutMode]+' / '+(graphLayoutMode==='reference'?'Saved MDS':graphEmbeddingLabels[graphEmbeddingMethod])+(graphLayoutMode==='proportion'?' (strength '+graphProportionStrength+')':''),selectedVertex!==null?'Vertex: '+current().nodes.find(n=>n.id===selectedVertex)?.label:selected!==null?'State: '+current().edges.find(e=>e.id===selected)?.label:'All displayed states'].join(' · ')};
 if(selection.unfoldFaces){if(selection.selectedVertex===null)view.unfoldedEdgeRevision=unfoldedEdgeAsset().revision;else view.unfoldedRevision=unfoldedAsset().revision;view.description+=' · Unfolded faces'+(selection.selectedVertex===null?' · Anchor: '+unfoldedAnchorLabel(selection.unfoldAnchorFeatureId):'')}
 if(maxNormalizedIds.includes(selection.embedding)){view.maxNormalizedRevision=maxNormalizedAsset().populationRevision||maxNormalizedAsset().revision;view.description+=' · '+maxNormalizedMethodLabel(maxNormalizedMethod(selection.embedding));if(maxNormalizedIsLocal()){view.maxNormalizedLocalRevision=maxNormalizedLocalLevel().revision;view.description+=' · Local selection'}}
 if(view.pureCoverage)view.description+=' · '+(view.pureCoverage.nonCore?'Non-core samples only (gray)':'Core samples only')+' · Fixed reference';
 if(selection.jointRepresentation?.choice==='profiles')view.description+=' · Joint cluster profiles (fixed population map; composition settings retained for switching back)';
 if(view.populationComparison!=='baseline')view.description=BUNDLE_PACK.combDisplay.sensitivityLabel+' · '+view.description;
 return view;
}
function validateNamedView(view){
 const mode=view?.populationComparison||'baseline';
 if(view?.dataset==='comb-V3V4-tx'&&rebuiltOnlyPopulation()&&(mode!=='rebuilt'||view.neighborhood))throw Error('This saved view requires the archived VME population. The current package contains only Rebuilt reference.');
 if(!['baseline','fixed','rebuilt'].includes(mode)||mode!=='baseline'&&(view.dataset!=='comb-V3V4-tx'||view.neighborhood))throw Error('Invalid population comparison');
 const previous=activeSensitivityMode;
 try{
  if(view?.dataset==='comb-V3V4-tx'&&mode!==previous)selectSensitivityData(mode);
  return validateNamedViewCurrent(view);
 }finally{if(activeSensitivityMode!==previous){if(rebuiltOnlyPopulation()&&previous==='baseline')activeSensitivityMode=previous;else selectSensitivityData(previous)}}
}
function validateNamedViewCurrent(view){
 if(view?.version!==1)throw Error('This saved view uses an unsupported version.');
 if(view.neighborhood){if(view.neighborhood.graphView||view.cohort!=='all'||view.selection?.participant?.active)throw Error('Invalid neighborhood graph context');validateFamilyBookmark(view.neighborhood);if(view.neighborhood.selection.collection!==view.dataset)throw Error('Neighborhood and graph collections differ')}
 validatePureCoverage(view.pureCoverage,view);
 validateSampleAppearanceLayout(view.sampleAppearance);
 validateQualityRulesExpanded(view.qualityRulesExpanded);
 validateSphereLighting(view.graphSphereLighting);validateSphereLighting(view.sampleSphereLighting);
 validateAnnotationSettings(view.annotations);
 const bundle=datasetRegistry.get(view.dataset);if(!bundle)throw Error('Load dataset '+view.dataset+' before restoring this view.');
 const representation=view.selection?.jointRepresentation;
 if(representation&&(!['composition','profiles'].includes(representation.choice)||representation.choice==='profiles'&&!BUNDLE_PACK.estimateCatalogues?.[view.dataset]?.profileEmbeddings?.some(d=>d.id===representation.id)))throw Error('The saved joint-profile representation is not installed.');
 if(bundle.dataset.revision!==view.datasetRevision)throw Error('Dataset revision differs from this saved view. Load the original bundle to restore it.');
 if(view.graphLabelSize!==undefined&&(!Number.isInteger(view.graphLabelSize)||view.graphLabelSize<6||view.graphLabelSize>24))throw Error('The saved graph label size is invalid.');
 if(view.graphLayout!==undefined&&!Object.hasOwn(graphLayoutLabels,view.graphLayout))throw Error('The saved graph layout is invalid.');
 if(view.graphFadeStrength!==undefined&&(typeof view.graphFadeStrength!=='number'||!Number.isFinite(view.graphFadeStrength)||view.graphFadeStrength<0||view.graphFadeStrength>1))throw Error('The saved graph fading strength is invalid.');
 if(view.sampleReferenceAppearance!==undefined){const s=view.sampleReferenceAppearance;if(!s||typeof s!=='object'||typeof s.scale!=='number'||!Number.isFinite(s.scale)||s.scale<25||s.scale>300||!validGraphColor(s.color))throw Error('The saved reference vertex appearance is invalid.')}
 if(view.sampleReferenceSpheres!==undefined&&typeof view.sampleReferenceSpheres!=='boolean')throw Error('The saved reference sphere setting is invalid.');
 if(view.graphSpheres!==undefined&&typeof view.graphSpheres!=='boolean')throw Error('The saved graph sphere setting is invalid.');
 if(view.graphVertexScale!==undefined&&(typeof view.graphVertexScale!=='number'||!Number.isFinite(view.graphVertexScale)||view.graphVertexScale<25||view.graphVertexScale>300))throw Error('The saved graph vertex size is invalid.');
 if(view.graphColors!==undefined&&(!view.graphColors||!validGraphColor(view.graphColors.vertex)||!validGraphColor(view.graphColors.edge)))throw Error('The saved graph colors are invalid.');
 if(view.graphEdgeWidth!==undefined&&(!view.graphEdgeWidth||typeof view.graphEdgeWidth.scaled!=='boolean'||typeof view.graphEdgeWidth.maximum!=='number'||!Number.isFinite(view.graphEdgeWidth.maximum)||view.graphEdgeWidth.maximum<1||view.graphEdgeWidth.maximum>12||(view.graphEdgeWidth.strength!==undefined&&(typeof view.graphEdgeWidth.strength!=='number'||!Number.isFinite(view.graphEdgeWidth.strength)||view.graphEdgeWidth.strength<.05||view.graphEdgeWidth.strength>2))))throw Error('The saved graph edge width is invalid.');
 if(view.graphDegreeFilter!==undefined&&(!view.graphDegreeFilter||typeof view.graphDegreeFilter.enabled!=='boolean'||!Number.isSafeInteger(view.graphDegreeFilter.minimum)||view.graphDegreeFilter.minimum<0))throw Error('The saved graph degree filter is invalid.');
 if(view.graphFadeBySize!==undefined&&typeof view.graphFadeBySize!=='boolean')throw Error('The saved graph fading setting is invalid.');
 if(view.graphProportionStrength!==undefined&&(typeof view.graphProportionStrength!=='number'||!Number.isFinite(view.graphProportionStrength)||view.graphProportionStrength<0||view.graphProportionStrength>10||Math.abs(view.graphProportionStrength*4-Math.round(view.graphProportionStrength*4))>1e-9))throw Error('The saved graph proportion strength is invalid.');
 if(view.graphEmbeddingMethod!==undefined&&!Object.hasOwn(graphEmbeddingLabels,view.graphEmbeddingMethod))throw Error('The saved graph embedding method is invalid.');
 if(view.graphEmbeddingRuntime!=null&&(typeof view.graphEmbeddingRuntime!=='string'||!/^\w{64}$/.test(view.graphEmbeddingRuntime)))throw Error('Invalid saved graph runtime identity.');
 if(view.displayRevision&&view.displayRevision!==bundle.cohortAnalysis?.displayRevision)throw Error('Display extension revision differs from this named view.');
 const base=unmodifiedProfileView(bundle,view.cohort,view.stateMode);
 if(!['pure','merged'].includes(view.stateMode)||!Object.hasOwn(bundle.data.graphs,view.coverage))throw Error('Saved state mode or coverage is unavailable.');
 if(!base&&(!displayAnalysisRevision(bundle)||displayAnalysisRevision(bundle)!==view.analysisRevision))throw Error('Cohort-analysis revision differs from this saved view. Load the original bundle to restore it.');
 validateGraphEmbeddingFit(view,bundle);
 validateRank3View(view.selection?.rank3,bundle);
 validateParticipantView(view.selection?.participant,bundle);
 explorationValidate(view.selection?.enrollmentExploration,bundle);
 validateParticipantSorting(view.participantSorting,bundle);
 validateNamedSubjectEmbedding(view,bundle);
 validateTrajectoryView(view.trajectory,bundle,view.coverage,view.selection?.participant?.active);
 if(view.selection?.participant?.active){const r=BUNDLE_PACK.participants[view.dataset].records.find(r=>r.index===view.selection.participant.record);if(base||!['all','ZAPPS+PreSSMat',r.cohort].includes(view.cohort))throw Error('Saved participant cohort is inconsistent.')}
 const data=base?bundle.data:materializeAnalysis(bundle,view.cohort,view.stateMode,view.coverage).data,g=data.graphs[view.coverage],s=view.selection;
 validateParticipantBackgroundView(s?.participant,bundle,data,view.stateMode);
 validateEdgeFacesView(s,bundle,data);
 if(!s||s.selected!==null&&s.selectedVertex!==null||s.selected!==null&&!g.edges.some(e=>e.id===s.selected)||s.selectedVertex!==null&&!g.nodes.some(n=>n.id===s.selectedVertex)||!Array.isArray(s.hiddenEdges)||s.hiddenEdges.some(id=>!g.edges.some(e=>e.id===id)))throw Error('The saved selection is unavailable in this dataset.');
 if(!['overview','global','local','reference',...maxNormalizedIds].includes(s.embedding)||!['local','global','reference',...maxNormalizedIds].includes(s.preferredEmbedding)||!['selected','core','all'].includes(s.scope)||!['all','incident'].includes(s.graphScope)||typeof view.vertexLabels!=='boolean')throw Error('The saved display settings are invalid.');
 validateMaxNormalizedNamedView(view);
 for(const camera of [s.sampleCamera,s.graphCamera]){
  if(!camera||!['eye','center','up'].every(k=>['x','y','z'].every(a=>Number.isFinite(camera[k]?.[a])))||!['perspective','orthographic'].includes(camera.projection?.type)||Math.hypot(...Object.values(camera.up))===0)throw Error('The saved camera is invalid.');
 }
 return view;
}
async function ensureNamedViewAssets(view){
 await ensureDatasetLoaded(view.dataset);
 if(view.neighborhood)await ensureEmbeddingFamiliesLoaded();
 await ensureSensitivityLoaded(view.populationComparison||'baseline');
 if(view.dataset==='comb-V3V4-tx'&&!view.selection?.participant?.active){
  const mode=view.populationComparison||'baseline',asset=(mode==='baseline'||rebuiltOnlyPopulation()?sensitivityBaseline:sensitivityVariants.get(mode))?.display;
  if(!asset)return;
  const s=view.selection,kind=s?.selectedVertex!=null?'vertex':'group',selection=s?.selectedVertex??s?.selected;
  const pure=view.stateMode==='pure'&&!!recordExtension(datasetRegistry.get(view.dataset))?.eligibility;
  if(selection!=null&&(view.stateMode==='merged'||pure)){
   const pop=view.cohort==='all'?'records':view.cohort,supplement=BUNDLE_PACK.pureVertexLocal;
   const entry=supplement?.populationRevision===asset.revision?supplement.fits[supplement.contexts[JSON.stringify([pop,String(view.coverage),Number(selection)])]]:null;
   const key=pure&&kind==='vertex'?entry?.existingFit:asset.contexts[JSON.stringify([kind,pop,pure?100:Number(view.coverage),selection])];
   if(key)await ensurePreparedFit(view.dataset,'combDisplay',key,asset);
  }
 }
}
async function restoreNamedView(view){
 const loadingRevision=++datasetSwitchRevision;
 await loadForSelection(()=>ensureNamedViewAssets(view),loadingRevision,()=>restoreNamedView(view));
 if(loadingRevision!==datasetSwitchRevision)return;
 // Validate before switching datasets or clearing the current selection.
 validateNamedView(view);if(!view.graphEmbeddingFit)await checkGraphRuntime(view.graphEmbeddingRuntime);cancelGraphStrengthUpdate();
 if(view.dataset==='comb-V3V4-tx'&&!view.neighborhood&&(view.populationComparison||'baseline')!==activeSensitivityMode){
  if(META.id==='comb-V3V4-tx'&&!activeEmbeddingFamily)await changeSensitivity(view.populationComparison||'baseline');
  else selectSensitivityData(view.populationComparison||'baseline');
 }
 if(view.neighborhood)await activateEmbeddingFamily(view.neighborhood.family,view.neighborhood);else await switchDataset(view.dataset,{recall:false});
 await changeAnalysis(view.cohort,view.stateMode,view.coverage);
 if(view.participantSorting)setParticipantSortTarget(view.participantSorting.target);
 setGraphLayoutMode(view.graphLayout??'reference');setGraphProportionStrength(view.graphProportionStrength??4);setGraphEmbeddingMethod(view.graphEmbeddingMethod??'spring');el('dimension').value='3';restoreGraphEmbeddingFit(view);positions();
 el('dimension').value='3';el('vertexLabels').checked=view.vertexLabels;el('graphFadeBySize').checked=view.graphFadeBySize===true;setGraphFadeStrength(view.graphFadeStrength??(view.graphFadeBySize ? .25 : .1));restoreGraphWidthSettings(view.graphEdgeWidth);restoreGraphColorSettings(view.graphColors);setGraphVertexScale(view.graphVertexScale);el('graphSpheres').checked=view.graphSpheres===true;restoreSphereLighting('graph',view.graphSphereLighting);restoreSphereLighting('sample',view.sampleSphereLighting);el('sampleReferenceSpheres').checked=view.sampleReferenceSpheres===true;restoreSampleReferenceSettings(view.sampleReferenceAppearance);restoreGraphDegreeSettings(view.graphDegreeFilter);setGraphLabelSize(view.graphLabelSize??12);
 restoreTrajectoryView(view.trajectory);
 restoreAnnotationSettings(view.annotations);
 restoreSubjectEmbeddingFit(view);
 restorePureCoverage(view.pureCoverage);
 await restoreSelection(copyCamera(view.selection));
 restoreSampleAppearanceLayout(view.sampleAppearance);
 restoreQualityRulesExpanded(view.qualityRulesExpanded);
 await waitGraphEmbedding();
 await Promise.all([queue,graphQueue,trajectoryQueue]);
 if(view.neighborhood)await renderFamily(view.neighborhood.camera);
 if(typeof saveDatasetPanelSettings==='function')saveDatasetPanelSettings();
 if(typeof saveDatasetNavigation==='function')saveDatasetNavigation();
}
(function installNamedViews(){
 if(typeof window==='undefined')return;
 const dialog=el('namedViewsDialog'),list=el('namedViewsList'),name=el('namedViewName'),message=el('namedViewsMessage'),details=el('namedViewDetails');
 let captured=null,busy=false,readable=true,undo=null,importText=null;
 const controls=['namedViewSave','namedViewUpdate','namedViewRestore','namedViewDelete','namedViewUndo','namedViewsClose','namedViewsList','namedViewName','namedViewsExport','namedViewExport','namedViewsImport','namedViewsImportConfirm','namedViewsImportCancel','namedViewsImportAll','namedViewsImportNone'];
 const importChecks=()=>[...el('namedViewsImportRows').querySelectorAll('input[data-import-view]')];
 function importButtons(){
  const checks=importChecks(),chosen=checks.filter(c=>c.checked).length;
  checks.forEach(c=>c.disabled=busy||c.dataset.unavailable==='true');
  el('namedViewsImportConfirm').disabled=busy||!chosen;
  el('namedViewsImportCount').textContent=`${chosen} of ${checks.length} views selected. Nothing is saved until you choose Import selected views.`;
 }
 function clearImport(){importText=null;el('namedViewsImportRows').replaceChildren();el('namedViewsImportPreview').hidden=true;el('namedViewsManagement').hidden=false}
 const selectedView=()=>readNamedViews().find(v=>v.id===list.value);
 function buttons(){
  controls.forEach(id=>el(id).disabled=busy);
  importButtons();
  if(busy)return;
  el('namedViewSave').disabled=!readable||!captured;
  el('namedViewRestore').disabled=el('namedViewDelete').disabled=!readable||!list.value;
  el('namedViewUpdate').disabled=!readable||!captured||!list.value;
  el('namedViewExport').disabled=!readable||!list.value;
  el('namedViewsExport').disabled=!readable||!list.children.length||list.children.length===1;
  el('namedViewsImport').disabled=!readable;
  el('namedViewUndo').hidden=!undo;
 }
 function describe(){const v=selectedView();details.textContent=v?`${v.description}\nSaved ${new Date(v.savedAt).toLocaleString()}`:'No saved view selected.';buttons()}
 function refresh(id=list.value){
  const views=readNamedViews();list.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=views.length?'Choose a saved view…':'No saved views yet';list.appendChild(placeholder);
  for(const v of views){const option=document.createElement('option');option.value=v.id;option.textContent=v.name;list.appendChild(option)}
  list.value=views.some(v=>v.id===id)?id:'';describe();
 }
 async function action(task){
  if(busy)return;busy=true;buttons();message.textContent='Working…';
  try{await task()}catch(error){message.textContent=error.message}finally{busy=false;buttons()}
 }
 async function open(){
  clearImport();captured=null;readable=true;undo=null;message.textContent='Capturing both 3D views…';name.value='';dialog.showModal();
  await action(async()=>{
   try{refresh()}catch(error){readable=false;throw error}
   captured=await captureNamedView();message.textContent='Current view captured. Give it a name, or restore an earlier view.';
  });
 }
 function save(replace){
  return action(async()=>{
   const title=name.value.trim();if(!title||title.length>100)throw Error('Enter a view name (1–100 characters).');
   const views=readNamedViews(),old=replace?selectedView():null;
   if(replace&&!old)throw Error('Choose the view to replace.');
   if(views.some(v=>v.id!==old?.id&&v.name.toLocaleLowerCase()===title.toLocaleLowerCase()))throw Error('That name already exists. Choose it and use Replace selected, or enter another name.');
   const view={...captured,id:old?.id||crypto.randomUUID(),name:title,savedAt:new Date().toISOString()};
   writeNamedViews(old?views.map(v=>v.id===old.id?view:v):[...views,view]);undo=null;refresh(view.id);message.textContent=`Saved “${title}” in this browser.`;
  });
 }
 el('namedSampleViews').onclick=el('namedGraphViews').onclick=open;
 list.onchange=()=>{try{describe();name.value=selectedView()?.name||'';message.textContent='Restore the selected view, or replace it with the view captured when this dialog opened.'}catch(e){message.textContent=e.message}};
 el('namedViewSave').onclick=()=>save(false);el('namedViewUpdate').onclick=()=>save(true);
 function download(views){
  const json=exportNamedViewsJson(views),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='micove-views.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  message.textContent=`Exported ${views.length} named view(s). Import this JSON in another explorer using the same dataset revisions.`;
 }
 el('namedViewsExport').onclick=()=>action(async()=>download(readNamedViews()));
 el('namedViewExport').onclick=()=>action(async()=>{const view=selectedView();if(!view)throw Error('Choose a saved view.');download([view])});
 el('namedViewsImport').onclick=()=>el('namedViewsFile').click();
 el('namedViewsFile').onchange=()=>action(async()=>{
  const input=el('namedViewsFile'),file=input.files?.[0];input.value='';if(!file)return;
  clearImport();
  if(file.size>namedViewsFileLimit)throw Error('Named-view files must be at most 5 MiB.');
  const text=await file.text();
  for(const view of parseNamedViewsJson(text)){try{await ensureNamedViewAssets(view)}catch{ /* The preview retains unavailable rows and their validation errors. */ }}
  const rows=previewNamedViewsJson(text);
  importText=text;el('namedViewsImportFilename').textContent=file.name;
  for(const row of rows){
   const tr=document.createElement('tr'),choice=document.createElement('td'),label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.dataset.importView=row.view.id;check.dataset.unavailable=String(!!row.error);check.checked=!row.error&&!row.duplicate;check.disabled=!!row.error;
   check.setAttribute('aria-label','Import '+row.view.name);label.appendChild(check);const title=document.createElement('span');title.textContent=row.view.name;label.appendChild(title);choice.appendChild(label);tr.appendChild(choice);
   for(const value of [row.dataset+'\n'+row.context,row.participant,row.highlights,row.status]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}
   el('namedViewsImportRows').appendChild(tr);
  }
  el('namedViewsManagement').hidden=true;el('namedViewsImportPreview').hidden=false;
  message.textContent='Review the file and choose views to import. Unavailable views cannot be selected.';
 });
 el('namedViewsImportRows').addEventListener('change',importButtons);
 el('namedViewsImportAll').onclick=()=>{importChecks().forEach(c=>c.checked=c.dataset.unavailable!=='true');importButtons()};
 el('namedViewsImportNone').onclick=()=>{importChecks().forEach(c=>c.checked=false);importButtons()};
 el('namedViewsImportCancel').onclick=()=>{clearImport();buttons();message.textContent='Import cancelled. Saved views and the current plot are unchanged.'};
 el('namedViewsImportConfirm').onclick=()=>action(async()=>{
  if(importText===null)throw Error('Choose a JSON file first.');
  const ids=importChecks().filter(c=>c.checked).map(c=>c.dataset.importView);
  const result=importNamedViewsJson(importText,localStorage,()=>crypto.randomUUID(),ids);clearImport();undo=null;refresh(result.selectedId);
  message.textContent=`Imported ${result.imported} view(s); ${result.skipped} already present; ${result.renamed} renamed to keep existing views. Select a view and choose Restore selected. The current plot is unchanged.`;
 });
 el('namedViewRestore').onclick=()=>action(async()=>{const v=selectedView();if(!v)throw Error('Choose a saved view.');await restoreNamedView(v);captured=await captureNamedView();message.textContent=`Restored “${v.name}”: dataset, selection${v.selection.participant?.active?', participant trajectory and '+(v.selection.participant.backgroundStates?.length||0)+' highlighted background states':''}, and both 3D cameras. Close to explore.`});
 el('namedViewDelete').onclick=()=>action(async()=>{const v=selectedView();if(!v)return;writeNamedViews(readNamedViews().filter(item=>item.id!==v.id));undo=v;refresh();message.textContent=`Deleted “${v.name}”. You can undo until this dialog closes.`});
 el('namedViewUndo').onclick=()=>action(async()=>{if(!undo)return;const views=readNamedViews();if(views.some(v=>v.id===undo.id||v.name.toLocaleLowerCase()===undo.name.toLocaleLowerCase()))throw Error('A view with that name already exists.');writeNamedViews([...views,undo]);const id=undo.id;undo=null;refresh(id);message.textContent='Deleted view restored.'});
 el('namedViewsClose').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 dialog.addEventListener('close',()=>{clearImport();captured=null;undo=null});
 window.addEventListener('storage',event=>{if(event.key===namedViewsKey&&dialog.open&&!busy){try{refresh()}catch(e){readable=false;message.textContent=e.message;buttons()}}});
})();
