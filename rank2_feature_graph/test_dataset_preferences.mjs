// Display-preference isolation and reload checks; no scientific data or WebGL stubs.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('rank2_feature_graph/dataset_preferences.js','utf8');
const stored=new Map([['vme-subject-trajectory-v1',JSON.stringify({fontSize:14})],['vme-named-views-v1','library']]);
const storage={get length(){return stored.size},key:i=>[...stored.keys()][i]??null,getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
function setup(id='A',native=storage){
 const nodes=new Map(),handlers={};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{id,type:['vertexLabels','sampleReferenceSpheres','graphSpheres','catalogueSelectedOnly','graphFadeBySize','graphWidthBySize','graphDegreeFilter'].includes(id)?'checkbox':'text',tagName:'INPUT',value:'',checked:true,open:false});return nodes.get(id)};
 for(const [id,value,options] of [['dimension','3',['2','3']],['graphScope','all',['all','incident']],['sampleEmbedding','local',['overview','local','global','reference']],['scope','selected',['selected','all']],['trajectoryImageFormat','png',['png','svg']],['trajectoryImageScale','1',['1','2']]])Object.assign(el(id),{value,tagName:'SELECT',options:options.map(value=>({value}))});
 const details=['annotationControls','sampleAppearance','trajectoryQualityRules','trajectoryTracks'].map(id=>Object.assign(el(id),{tagName:'DETAILS'}));
 const ctx=vm.createContext({URL,META:{id},el,document:{getElementById:el,querySelectorAll:()=>details.map(e=>Object.assign(e,{closest:()=>false})),addEventListener:(name,fn)=>handlers[name]=fn},window:{localStorage:native,addEventListener:(name,fn)=>handlers[name]=fn},console});
 vm.runInContext(fs.readFileSync('rank2_feature_graph/max_normalized_views.js','utf8'),ctx);
 vm.runInContext(source,ctx);
 const fadeSource=fs.readFileSync('rank2_feature_graph/view_tools.js','utf8');
 vm.runInContext(fadeSource.slice(fadeSource.indexOf('function sphereLightingValue'),fadeSource.indexOf('function graphSphereTraces')),ctx);
 vm.runInContext(fadeSource.slice(fadeSource.indexOf('function graphMinimumDegree'),fadeSource.indexOf('// Count observation identities')),ctx);
 vm.runInContext(fadeSource.slice(fadeSource.indexOf('function graphFadeStrengthValue'),fadeSource.indexOf('// Normalize against')),ctx);
 vm.runInContext(`
 let activeEmbeddingFamily=null;
 const trajectoryDefaults={fontSize:12},trajectoryPreference='vme-subject-trajectory-v1';
 let trajectorySettings={...trajectoryDefaults},trajectoryRanges=null,trajectoryRestoredScale=null,trajectoryContext='',trajectoryFitAll=false;
 const validateTrajectorySettings=s=>{if(!Number.isFinite(s?.fontSize)||s.fontSize<8||s.fontSize>32)throw Error('invalid')};
 const trajectorySavePreference=()=>datasetPanelStorage.setItem(trajectoryPreference,JSON.stringify(trajectorySettings));
 const annotationDefaults={version:1,autoPositive:true,selected:['nugent'],controlsOpen:false},annotationPreference='vme-annotation-tracks-v1';
 let annotationSettings={...annotationDefaults},annotationLast=null;
 const validateAnnotationSettings=s=>{if(s?.version!==1||!Array.isArray(s.selected))throw Error('invalid')};
 const saveAnnotationSettings=()=>datasetPanelStorage.setItem(annotationPreference,JSON.stringify(annotationSettings));
 const participantAppearanceKey='vme-participant-appearance-v1';
 const loadParticipantAppearance=()=>({...{sphereSize:14},...panelReadJson(participantAppearanceKey,{})});
 const participantAppearance=loadParticipantAppearance();let participant={...participantAppearance};
 const graphLayoutPreference='vme-graph-layout-v1',graphStrengthPreference='vme-graph-proportion-strength-v1',graphMethodPreference='vme-graph-embedding-method-v1',graphLabelSizeKey='vme-graph-label-size-v1';
 let graphLayoutMode='proportion',graphProportionStrength=4,graphEmbeddingMethod='weighted_grip',graphLabelFont={size:12};
 const setGraphLayoutMode=v=>{if(['proportion','reference','equal'].includes(v))graphLayoutMode=v};
 const setGraphProportionStrength=v=>{if(v!==null&&Number.isFinite(Number(v)))graphProportionStrength=Number(v)};
 const setGraphEmbeddingMethod=v=>{if(v)graphEmbeddingMethod=v};
 const setGraphLabelSize=v=>{if(v)graphLabelFont.size=Number(v)};
 let catalogueSort={key:'id',descending:false},rank3={},rank3Colors={},preferredSampleEmbedding='local';
 const validateRank3View=r=>{if(!['count','threshold'].includes(r.mode))throw Error('invalid')};
 const sampleAppearanceSections=[['open','sampleAppearance','vme-sample-appearance-open-v1']],qualityRulesExpandedKey='vme-quality-rules-open-v1';
 const syncParticipantControls=()=>{},syncRank3Controls=()=>{};
 installDatasetPanelSettings();
 `,ctx);
 const run=s=>vm.runInContext(s,ctx);
 const state=()=>JSON.parse(run('JSON.stringify({trajectorySettings,annotationSettings,participant,graphLayoutMode,graphProportionStrength,graphEmbeddingMethod,label:graphLabelFont.size,controls:panelControlSnapshot(),catalogueSort,rank3,trajectoryFitAll})'));
 return {run,el,state,handlers};
}
const a=setup();assert.equal(a.el('sampleReferenceScale').value,'100');assert.equal(a.el('sampleReferenceColor').value,'#d62728');assert.equal(a.el('sampleReferenceSpheres').checked,true);assert.equal(a.el('graphSpheres').checked,true);assert.equal(a.el('graphVertexScale').value,'100');assert.equal(a.el('graphVertexColor').value,'#d62728');assert.equal(a.el('graphEdgeColor').value,'#82a9b9');assert.equal(a.el('graphWidthStrength').value,'0.5','Legacy settings keep square-root scaling');assert.equal(a.state().trajectorySettings.fontSize,14,'legacy seed');
a.run(`trajectorySettings.fontSize=19;annotationSettings.selected=['baseline','delivery'];annotationSettings.controlsOpen=true;participant.sphereSize=23;participant.axis='elapsed';participant.allTaxa=true;participant.catalogue=true;graphLayoutMode='reference';graphProportionStrength=7;graphLabelFont.size=17;catalogueSort={key:'frequency',descending:true};rank3.enabled=true;trajectoryFitAll=true;`);
a.el('dimension').value='2';a.el('vertexLabels').checked=false;a.el('graphFadeBySize').checked=true;a.el('graphFadeStrength').value='0.25';a.el('trajectoryImageFormat').value='svg';a.el('trajectoryTracks').open=true;
a.run('restoreSampleReferenceSettings({scale:175,color:"#123456"})');a.el('sampleReferenceSpheres').checked=true;a.el('graphSpheres').checked=true;a.run('setGraphVertexScale(180);restoreGraphWidthSettings({scaled:false,maximum:9.5,strength:1.35});restoreGraphColorSettings({vertex:"#aa2233",edge:"#2244aa"})');a.run("restoreSphereLighting('graph',{ambient:40,highlights:65});restoreSphereLighting('sample',{ambient:70,highlights:30});saveDatasetPanelSettings()");const expectedA=a.state();
a.run(`META={id:'B'};restoreDatasetPanelSettings()`);
assert.equal(a.state().trajectorySettings.fontSize,14);assert.equal(a.state().participant.sphereSize,14);assert.equal(a.el('dimension').value,'3');assert.equal(a.el('trajectoryTracks').open,false);
a.run(`trajectorySettings.fontSize=10;annotationSettings.selected=['PH'];participant.sphereSize=9;graphLayoutMode='equal';saveDatasetPanelSettings()`);const expectedB=a.state();assert.equal(a.el('graphFadeBySize').checked,true);
a.run(`META={id:'A'};restoreDatasetPanelSettings()`);assert.deepEqual(a.state(),expectedA);assert.equal(a.el('trajectoryTracks').open,true);
const reload=setup('A');assert.deepEqual(reload.state(),expectedA);assert.equal(reload.el('trajectoryTracks').open,true);
const reloadB=setup('B');assert.deepEqual(reloadB.state(),expectedB);
// Recalling an overview must not create an invalid named-view preference later.
const overview=setup('overview');overview.el('sampleEmbedding').value='overview';overview.run('saveDatasetPanelSettings()');
const overviewReload=setup('overview');assert.equal(overviewReload.el('sampleEmbedding').value,'overview');assert.equal(overviewReload.run('preferredSampleEmbedding'),'local');
for(const mode of ['local','global','reference']){overview.el('sampleEmbedding').value=mode;overview.run('saveDatasetPanelSettings()');assert.equal(setup('overview').run('preferredSampleEmbedding'),mode)}
assert.equal(JSON.parse(stored.get('vme-subject-trajectory-v1')).fontSize,14,'legacy is never overwritten');
assert.equal(a.run("datasetPanelStorage.getItem('vme-named-views-v1')"),'library');
a.run(`datasetPanelStorage.setItem('vme-named-views-v1','updated library')`);assert.equal(stored.get('vme-named-views-v1'),'updated library');
// Cohorts retain the same dataset key; an embedding family has its own identity.
a.run(`META={id:'A',cohort:'second cohort'};restoreDatasetPanelSettings()`);assert.deepEqual(a.state(),expectedA);
a.run(`activeEmbeddingFamily={id:'family'};restoreDatasetPanelSettings();trajectorySettings.fontSize=25;saveDatasetPanelSettings();activeEmbeddingFamily=null;restoreDatasetPanelSettings()`);assert.deepEqual(a.state(),expectedA);
// Malformed JSON and values reset safely rather than carrying the other dataset.
stored.set('vme-dataset-panels-v1:broken:vme-panel-controls-v1','{');stored.set('vme-dataset-panels-v1:broken:vme-subject-trajectory-v1','{"fontSize":999}');
a.run(`META={id:'broken'};restoreDatasetPanelSettings()`);assert.equal(a.state().trajectorySettings.fontSize,12);assert.equal(a.el('dimension').value,'3');
// Storage denial/quota keeps same-session settings isolated without blocking use.
const denied=setup('A',{getItem(){throw Error('denied')},setItem(){throw Error('quota')}});
denied.run(`trajectorySettings.fontSize=22;saveDatasetPanelSettings();META={id:'B'};restoreDatasetPanelSettings();META={id:'A'};restoreDatasetPanelSettings()`);assert.equal(denied.state().trajectorySettings.fontSize,22);
// Restoring a named view invokes the same save hook once restoration has finished.
assert.match(fs.readFileSync('rank2_feature_graph/named_views.js','utf8'),/if\(view.neighborhood\)await renderFamily\(view.neighborhood.camera\);\s*if\(typeof saveDatasetPanelSettings==='function'\)saveDatasetPanelSettings\(\)/);
console.log('PASS: dataset A/B switching, reload, all panel settings, legacy seed, named-view library, cohorts, families, malformed values and storage denial.');

// Navigation is persisted after committed actions, independently of display writes.
a.run(`
 let activeCohort='PreSSMat',activeStateMode='merged',DATA={records:[]};
 const navRecords=[{index:0,cohort:'PreSSMat',subject:'1'},{index:1,cohort:'PreSSMat',subject:'1'},{index:2,cohort:'ZAPPS',subject:'1'}];
 const participantData=()=>({records:navRecords});
 const participantRows=key=>navRecords.filter(r=>JSON.stringify([r.cohort,r.subject])===key);
 let navEligible=[0,1];const eligibleIndices=()=>navEligible;
 const participantRestore=s=>{participant={...s}};
 const rank3Clear=()=>{};let graphSelectionCount=0;const participantGraphSelection=()=>graphSelectionCount++;
 META={id:'A'};participant={...participant,active:true,key:JSON.stringify(['PreSSMat','1'])};el('coverage').value='70';el('participantCohort').value='PreSSMat';saveDatasetNavigation();
`);
const navA=JSON.parse(a.run("JSON.stringify(readDatasetNavigation('A'))"));
assert.deepEqual(navA,{version:1,cohort:'PreSSMat',mode:'merged',coverage:'70',participant:'["PreSSMat","1"]',project:'PreSSMat'});
a.run(`META={id:'B'};activeCohort='ZAPPS';el('coverage').value='90';participant.key=JSON.stringify(['ZAPPS','1']);saveDatasetNavigation()`);
assert.equal(a.run("readDatasetNavigation('A').coverage"),'70');assert.equal(a.run("readDatasetNavigation('B').coverage"),'90');
a.run(`META={id:'A'};activeCohort='PreSSMat';restoreDatasetParticipant(readDatasetNavigation('A'))`);
assert.equal(a.run('participant.active'),true);assert.equal(a.run('participant.key'),'["PreSSMat","1"]');assert.equal(a.run('participant.record'),0);
// Stale or cross-cohort keys cannot reopen a participant, even when the numeric ID matches.
a.run(`activeCohort='ZAPPS';restoreDatasetParticipant(readDatasetNavigation('A'))`);assert.equal(a.run('participant.active'),false);
a.run(`activeCohort='PreSSMat';navEligible=[0];restoreDatasetParticipant(readDatasetNavigation('A'))`);assert.equal(a.run('participant.active'),false);
a.run(`navEligible=[0,1];restoreDatasetParticipant({...readDatasetNavigation('A'),participant:'removed'})`);assert.equal(a.run('participant.active'),false);
a.run('restoreDatasetParticipant(null)');assert.equal(a.run('participant.active'),false);
a.run('saveDatasetNavigation()');assert.equal(a.run("readDatasetNavigation('A').participant"),null);
// Families do not overwrite their source collection's participant/cohort preferences.
a.run(`activeEmbeddingFamily={id:'family'};el('coverage').value='60';saveDatasetNavigation();activeEmbeddingFamily=null`);assert.equal(a.run("readDatasetNavigation('A').coverage"),'90');
// A new runtime reads the same saved navigation (no reliance on in-memory state).
const navReload=setup('B');assert.equal(navReload.run("readDatasetNavigation('B').participant"),'["ZAPPS","1"]');
for(const [id,value] of [['badjson','{'],['badversion','{"version":2}'],['badmode','{"version":1,"cohort":"all","mode":"invented","coverage":"60"}']]){stored.set('vme-dataset-navigation-v1:'+id,value);assert.equal(a.run(`readDatasetNavigation('${id}')`),null)}
console.log('PASS: navigation isolation/reload, cohort-qualified identities, missing/filtered participants, deselection, malformed records and family exclusion.');

a.run("window.location={href:'http://127.0.0.1:4173/?dataset=A&other=x#plot'};window.history={state:{kept:true},replaceState(state,title,url){this.url=url;this.savedState=state}};rememberDatasetLocation('B')");
assert.equal(a.run('window.history.url'),'http://127.0.0.1:4173/?dataset=B&other=x#plot');assert.equal(a.run('window.history.savedState.kept'),true);
console.log('PASS: reload URL follows the active dataset while preserving other query parameters and history state.');

const legendPref=setup('legendA');
legendPref.run("datasetPanelStorage.setItem('vme-legend-percent-basis-v1','selected')");
assert.equal(setup('legendA').run("datasetPanelStorage.getItem('vme-legend-percent-basis-v1')"),'selected');
assert.equal(setup('legendB').run("datasetPanelStorage.getItem('vme-legend-percent-basis-v1')"),null);
legendPref.run("activeEmbeddingFamily={id:'legendFamily'}");
assert.equal(legendPref.run("datasetPanelStorage.getItem('vme-legend-percent-basis-v1')"),null);

stored.set('vme-dataset-panels-v1:legacy-fade:vme-panel-controls-v1',JSON.stringify({version:1,controls:{graphFadeBySize:true}}));
assert.equal(setup('legacy-fade').el('graphFadeStrength').value,'0.25');
assert.equal(setup('new-fade').el('graphFadeStrength').value,'0.1');
const zero=setup('zero-fade');zero.el('graphFadeStrength').value='0';zero.run('saveDatasetPanelSettings()');
assert.equal(setup('zero-fade').el('graphFadeStrength').value,'0.05');
console.log('PASS: fading strength isolates by dataset, clamps old values and defaults to enabled at 0.10.');

assert.equal(setup('new-fade').el('graphFadeBySize').checked,true);
const off=setup('saved-off');off.el('graphFadeBySize').checked=false;off.el('graphFadeStrength').value='0.13';off.run('saveDatasetPanelSettings()');
assert.equal(setup('saved-off').el('graphFadeBySize').checked,false);
assert.equal(setup('saved-off').el('graphFadeStrength').value,'0.13');

const degree=setup('degree-filter');degree.el('graphDegreeFilter').checked=true;degree.el('graphMinimumDegree').value='3';degree.run('saveDatasetPanelSettings()');
assert.equal(setup('degree-filter').el('graphDegreeFilter').checked,true);
assert.equal(setup('degree-filter').el('graphMinimumDegree').value,'3');
assert.equal(setup('new-degree-filter').el('graphDegreeFilter').checked,false);
assert.equal(setup('new-degree-filter').el('graphMinimumDegree').value,'2');
const beforeReset=new Map(stored),reset=degree.run('datasetPanelStorage.resetGraphFading()');assert.ok(reset.updated>0);assert.equal(reset.failed,1,"Malformed settings are reported and left intact");
for(const [key,value] of beforeReset){
 if(key==='vme-panel-controls-v1'||/^vme-dataset-panels-v1:[^:]+:vme-panel-controls-v1$/.test(key)){
  if(value==='{'){assert.equal(stored.get(key),value);continue}
  const old=JSON.parse(value),updated=JSON.parse(stored.get(key));
  assert.equal(updated.controls.graphFadeBySize,true);assert.equal(updated.controls.graphFadeStrength,'0.1');
  old.controls.graphFadeBySize=true;old.controls.graphFadeStrength='0.1';assert.deepEqual(updated,old);
 }else assert.equal(stored.get(key),value);
}
assert.equal(degree.run("JSON.parse(datasetPanelStorage.getItem('vme-panel-controls-v1')).controls.graphFadeStrength"),'0.1','In-memory settings reset too');
assert.equal(setup('saved-off').el('graphFadeBySize').checked,true);
console.log('PASS: degree-filter preferences and explicit all-dataset fading reset preserve unrelated preferences and named-view libraries.');

// Placement and divider direction use the real information-layout handlers.
{
 const layout=fs.readFileSync('rank2_feature_graph/panel_layout.js','utf8').split(' // Graph controls occupy')[0];
 function information(saved){
  const memory=new Map(saved?[['vme-sample-information-size-v1',JSON.stringify(saved)]]:[]),nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,dataset:{},value:'',attributes:{},handlers:{},style:{setProperty(k,v){this[k]=v}},
   getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000}),setAttribute(k,v){this.attributes[k]=v},addEventListener(k,f){this.handlers[k]=f},
   setPointerCapture(){},hasPointerCapture:()=>false,focus(){}});return nodes.get(id)};
  const ctx=vm.createContext({window:{},document:{getElementById:node,body:{classList:{add(){},remove(){}}}},localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)}});
  vm.runInContext(layout+'\nfunction resizePlots(){}\napplyInfo();})();',ctx);
  return {area:node('sampleContent'),select:node('sampleLegendPosition'),divider:node('sampleInfoDivider'),memory};
 }
 const ui=information({width:.25,height:.4});
 assert.equal(ui.area.dataset.legendPosition,'right','Legacy size settings default to right');
 ui.select.value='bottom';ui.select.handlers.change();
 assert.equal(ui.area.dataset.legendPosition,'bottom');
 assert.equal(ui.divider.attributes['aria-orientation'],'horizontal');
 const key=k=>ui.divider.handlers.keydown({key:k,preventDefault(){}});
 key('ArrowUp');assert.equal(ui.divider.attributes['aria-valuenow'],42,'Up grows bottom information');
 key('ArrowDown');assert.equal(ui.divider.attributes['aria-valuenow'],40);
 ui.divider.handlers.pointerdown({button:0,pointerId:1,preventDefault(){}});
 ui.divider.handlers.pointermove({pointerId:1,clientY:500,clientX:0});
 ui.divider.handlers.pointerup({pointerId:1});
 assert.equal(ui.divider.attributes['aria-valuenow'],50,'Bottom drag measures from the bottom edge');
 ui.select.value='right';ui.select.handlers.change();
 assert.equal(ui.divider.attributes['aria-valuenow'],25,'Switching preserves independent width');
 key('ArrowLeft');assert.equal(ui.divider.attributes['aria-valuenow'],27);
 ui.select.value='bottom';ui.select.handlers.change();
 assert.equal(ui.divider.attributes['aria-valuenow'],50,'Switching preserves independent height');
 const restored=information(JSON.parse(ui.memory.get('vme-sample-information-size-v1')));
 assert.equal(restored.select.value,'bottom');assert.equal(restored.divider.attributes['aria-valuenow'],50);
 assert.equal(information({position:'invalid'}).select.value,'right');
 console.log('PASS: right/bottom placement, legacy default, separate sizes, keyboard/drag direction and reload.');
}

// Migrate every pre-default dataset record once, including unvisited families.
const legacySphere={version:1,controls:{graphSpheres:false,graphVertexScale:'180',graphEdgeColor:'#2244aa'},other:{kept:true}};
const sphereKeys=['vme-panel-controls-v1','vme-dataset-panels-v1:legacy-A:vme-panel-controls-v1','vme-dataset-panels-v1:family%3Aexample:vme-panel-controls-v1'];
for(const key of sphereKeys)stored.set(key,JSON.stringify(legacySphere));
const library=stored.get('vme-named-views-v1'),migrated=setup('legacy-A');
assert.equal(migrated.el('graphSpheres').checked,true);
for(const key of sphereKeys){const value=JSON.parse(stored.get(key));assert.equal(value.controls.graphSpheres,true);assert.equal(value.graphSpheresDefaultVersion,1);assert.equal(value.controls.graphVertexScale,'180');assert.equal(value.controls.graphEdgeColor,'#2244aa');assert.deepEqual(value.other,{kept:true})}
assert.equal(stored.get('vme-named-views-v1'),library,'Named-view library is untouched');
migrated.el('graphSpheres').checked=false;migrated.run('saveDatasetPanelSettings()');
assert.equal(setup('legacy-A').el('graphSpheres').checked,false,'Later explicit off survives migration and reload');
assert.equal(setup('new-dataset').el('graphSpheres').checked,true,'New datasets start with spheres');
const unavailable=setup('legacy-A',{length:1,key:()=>sphereKeys[1],getItem:k=>k===sphereKeys[1]?JSON.stringify(legacySphere):null,setItem(){throw Error('quota')}});
assert.equal(unavailable.el('graphSpheres').checked,true,'Storage failure still applies migration in memory');
console.log('PASS: sphere default on, migration of legacy/unvisited dataset and family settings, other controls preserved, later off retained, named views untouched, storage denial fallback.');

// Reference-sphere migration is independent of the completed graph migration.
const legacyReferenceSphere={...legacySphere,graphSpheresDefaultVersion:1,controls:{...legacySphere.controls,sampleReferenceSpheres:false}};
for(const key of sphereKeys)stored.set(key,JSON.stringify(legacyReferenceSphere));
const referenceMigrated=setup('legacy-A');
for(const key of sphereKeys){const value=JSON.parse(stored.get(key));assert.equal(value.controls.sampleReferenceSpheres,true);assert.equal(value.sampleReferenceSpheresDefaultVersion,1);assert.equal(value.controls.graphSpheres,false);assert.equal(value.controls.graphVertexScale,'180');assert.deepEqual(value.other,{kept:true})}
assert.equal(referenceMigrated.el('sampleReferenceSpheres').checked,true);
assert.equal(stored.get('vme-named-views-v1'),library,'Reference migration leaves named views untouched');
referenceMigrated.el('sampleReferenceSpheres').checked=false;referenceMigrated.run('saveDatasetPanelSettings()');
assert.equal(setup('legacy-A').el('sampleReferenceSpheres').checked,false,'Later reference-sphere off survives reload');
assert.equal(setup('new-reference-dataset').el('sampleReferenceSpheres').checked,true);
const referenceUnavailable=setup('legacy-A',{length:1,key:()=>sphereKeys[1],getItem:k=>k===sphereKeys[1]?JSON.stringify(legacyReferenceSphere):null,setItem(){throw Error('quota')}});
assert.equal(referenceUnavailable.el('sampleReferenceSpheres').checked,true,'Reference migration survives storage failure in memory');
console.log('PASS: reference spheres default on, all saved datasets migrated independently of graph spheres, later off retained, named views preserved, storage failure fallback.');

assert.equal(reload.el('graphSphereAmbient').value,'40');assert.equal(reload.el('sampleReferenceSphereHighlights').value,'30');assert.equal(reloadB.el('graphSphereAmbient').value,'85');assert.equal(reloadB.el('sampleReferenceSphereHighlights').value,'18');
console.log('PASS: independent graph/reference lighting survives dataset switching and reload; older datasets retain material defaults.');

// A real session snapshot restores model-backed widgets, not merely DOM values.
const session=setup('session');session.run(`
 let activeCohort='all',activeStateMode='merged',DATA={records:[]};
 el('coverage').value='60';
 const base={dataset:{id:'session',revision:'r1'}};
 const datasetRegistry=new Map([['session',base],['other',{dataset:{id:'other',revision:'r1'}}]]);
 const displayAnalysisRevision=()=> 'analysis1';
 let selected=null,selectedVertex=4,hiddenEdges=new Set(['4,5']);
 const current=()=>({nodes:[{id:4},{id:5}],edges:[{id:'4,5'}]});
 const explorationDefaults=()=>({dataset:null,visit:'off',k:20});let baselineExplore={dataset:'session',visit:'enrollment',k:40};
 const longitudinalState={dataset:'session',enabled:false};const associationView={active:false,level:'edge',coverage:'90',mode:'matched',cohort:'both',selected:null,filter:'',bank:'not serialized'};
 let stateTransitionMode=true,heatmapDockDismissed=true,heatmapDockDataset=null,heatmapDockIdentity=null;
 const unfoldedEdgeChoices=new Map([['edge',{anchor:4,enabled:false}]]);let edgeFacesSort={key:'edgeCount',descending:true};
 const camera={eye:{x:1,y:2,z:3},center:{x:0,y:0,z:0},up:{x:0,y:0,z:1}};
 let pendingSampleCamera=null,pendingGraphCamera=null;
 const selectionSnapshot=()=>({selected,selectedVertex,hiddenEdges:[...hiddenEdges],participant:{active:false},rank3:{enabled:false},edgeFaces:null,unfoldFaces:false,sampleCamera:camera,graphCamera:camera});
 const capturePureCoverage=()=>null,restorePureCoverage=()=>{},validatePureCoverage=()=>{};
 const BUNDLE_PACK={},activeSensitivityMode='baseline';let loaded=false,unfolded=null;
 const ensureNamedViewAssets=async()=>{loaded=true};
 const validateParticipantView=()=>{},validateParticipantBackgroundView=()=>{},participantRestore=s=>{participant=s};
 const validateEdgeFacesView=()=>{},edgeFacesRestore=()=>{},rank3Restore=s=>{rank3=s};
 const restoreUnfoldedChoice=s=>{unfolded=s.unfoldFaces};
 const explorationValidate=()=>{},syncExplorationControls=()=>{},syncLongitudinalControls=()=>{},syncAssociations=()=>{};
 const datasetMessage=message=>{throw Error(message)};
 datasetSessionReady=true;saveDatasetSession();
 selectedVertex=null;hiddenEdges.clear();baselineExplore=explorationDefaults();stateTransitionMode=false;heatmapDockDismissed=false;
`);
await session.run('restoreDatasetSession()');
assert.equal(session.run('selectedVertex'),4);assert.equal(session.run('hiddenEdges.has("4,5")'),true);
assert.equal(session.run('baselineExplore.k'),40);assert.equal(session.run('baselineExplore.visit'),'enrollment');
assert.equal(session.run('stateTransitionMode'),true);assert.equal(session.run('heatmapDockDismissed'),true);
assert.equal(session.run('loaded'),true);assert.equal(session.run('unfolded'),false);
assert.equal(session.run('pendingSampleCamera.eye.y'),2);
const payload=JSON.parse(session.run("datasetPanelStorage.getItem('micove-session-v1')"));assert(!('bank' in payload.auxiliary.association));
// A changed data release cannot silently restore old memberships/participant IDs.
session.run("base.dataset.revision='r2';selectedVertex=null");await session.run('restoreDatasetSession()');assert.equal(session.run('selectedVertex'),null);
session.run("META={id:'other'};selectedVertex=null");await session.run('restoreDatasetSession()');assert.equal(session.run('selectedVertex'),null);assert.equal(session.run('baselineExplore.visit'),'off');
// Newly constructed details restore before being saved, and absent details survive saves.
const dynamic=setup('dynamic');dynamic.run("datasetPanelStorage.setItem('vme-panel-details-v1',JSON.stringify({later:false,absent:true}));restoreDatasetPanelSettings()");
const node=dynamic.el('later');Object.assign(node,{tagName:'DETAILS',open:true,closest:()=>false});dynamic.run("document.querySelectorAll=()=>[el('later')];restorePanelDetails();savePanelDetails()");assert.equal(node.open,false);
assert.equal(dynamic.run("panelReadJson('vme-panel-details-v1',{}).absent"),true);
node.open=true;dynamic.run('savePanelDetails()');dynamic.run("document.querySelectorAll=()=>[];savePanelDetails()");assert.equal(dynamic.run("panelReadJson('vme-panel-details-v1',{}).later"),true);
console.log('PASS: revision-checked graph/exploration session, deferred assets, hidden edges, unfolding, analysis modes and late/absent sections.');

// Neighborhoods keep their linked graph selection independently of ordinary datasets.
const familySource=fs.readFileSync('rank2_feature_graph/embedding_families.js','utf8');
session.run(familySource.slice(familySource.indexOf('function familySessionContext'),familySource.indexOf('function familyGraphState')));
session.run(`
 const localStorage=window.localStorage;let familyGraphReady=true;
 const familySelection={collection:'session'};activeEmbeddingFamily={id:'neighborhood',revision:'f1'};
 META={id:'session'};selectedVertex=4;selected=null;hiddenEdges=new Set(['4,5']);
 saveFamilySession();
`);
// The fixture's rank-3 validator expects a mode; real snapshots already include it.
session.run(`const storedFamily=readFamilySession();storedFamily.selection.rank3.mode='count';`);
assert.equal(session.run('validFamilySession(storedFamily)'),true);
session.run("storedFamily.context[1]='outdated'");assert.equal(session.run('validFamilySession(storedFamily)'),false);
session.run("storedFamily.context[1]='f1';storedFamily.selection.selectedVertex=999");assert.equal(session.run('validFamilySession(storedFamily)'),false);
session.run(`
 storedFamily.selection.selectedVertex=4;loaded=false;let familyRestored=false;
 const restoreSelection=async s=>{if(!loaded)throw Error('Missing deferred local fit');familyRestored=s.selectedVertex===4};
`);
await session.run('restoreFamilySession(storedFamily)');assert.equal(session.run('familyRestored'),true);
console.log('PASS: neighborhood graph snapshots are isolated and reject changed references or missing vertices.');
