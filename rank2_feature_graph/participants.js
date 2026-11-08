// Participant display uses audited metadata and explicitly selected saved/joint coordinates.
const participantAppearanceKey='vme-participant-appearance-v1';
function loadParticipantAppearance(){
 const defaults={sampleSize:2,sampleOpacity:.7,sampleColors:true,stateBackground:true,embeddingMode:'union',graphSmoothing:10,graphBackground:false,matchBackground:false,colorBy:'visit',sphereSize:14,labelSize:12,vertexLabelSize:12,visitBoxSize:12,tableSize:13,backgroundSize:2,lineWidth:4,arrowScale:1,selectedLabelOnly:false,showLabels:true,showLines:true,showArrows:true,showVertices:true,backgroundOpacity:.25};
 try{
  const saved=JSON.parse((typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(participantAppearanceKey)||'null');
  if(['union','reference'].includes(saved?.embeddingMode))defaults.embeddingMode=saved.embeddingMode;
  if(['visit','original','merged'].includes(saved?.colorBy))defaults.colorBy=saved.colorBy;
  for(const key of ['sampleColors','stateBackground','graphBackground','selectedLabelOnly','showLabels','showLines','showArrows','showVertices','matchBackground'])if(typeof saved?.[key]==='boolean')defaults[key]=saved[key];
  for(const [key,min,max,integer] of [['sampleSize',1,12,true],['sampleOpacity',0,1,false],['graphSmoothing',2,30,true],['sphereSize',4,40,true],['labelSize',8,32,true],['vertexLabelSize',8,32,true],['visitBoxSize',10,24,true],['tableSize',10,24,true],['backgroundSize',1,12,true],['lineWidth',1,16,true],['arrowScale',.25,3,false],['backgroundOpacity',0,1,false]]){
   const value=saved?.[key];
   if(Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value)))defaults[key]=value;
  }
 }catch{}
 return defaults;
}
const participantAppearance=loadParticipantAppearance();
function saveParticipantAppearance(key){
 participantAppearance[key]=participant[key];
 try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(participantAppearanceKey,JSON.stringify(participantAppearance))}catch{}
}
let participant={active:false,key:'',record:null,axis:'visit',allTaxa:false,taxon:null,tableSort:null,catalogue:false,colorBy:'visit',stateBackground:true,...participantAppearance};
let participantBackgroundHighlight=null;
let participantOpenRevision=0,participantBrowseBusy=false;
let participantChoiceData=null,participantChoiceProject=null,participantChoiceStates=null,participantChoiceActiveKey='',participantChoiceKeys=new Set();
let participantSwitchCache={};
const participantSortTargets=new Map(),participantSortPreference="vme-participant-sort-target-v1:";
const participantColors={E:'#087f8c',V1:'#cf7318',V2:'#8651b5',Unordered:'#6b7780'};
const participantKey=r=>JSON.stringify(r.episode?[r.cohort,r.subject,r.episode]:[r.cohort,r.subject]);
function participantJointAvailable(){const c=participantData()?.capabilities;return c?.jointEmbedding!==false&&!(c?.mergedJointOnly&&activeStateMode!=='merged')}
function participantData(){const d=BUNDLE_PACK.participants?.[META.id],b=datasetRegistry.get(META.id);return d&&d.datasetRevision===b.dataset.revision&&d.analysisRevision===(b.cohortAnalysis?.revision||BUNDLE_PACK.recordAdapters?.[META.id]?.revision)?d:null}
function participantRows(key=participant.key){return (participantData()?.records||[]).filter(r=>r.subject&&participantKey(r)===key).sort((a,b)=>(a.order??Infinity)-(b.order??Infinity)||a.id.localeCompare(b.id))}
const participantGroupCache=new WeakMap();
function participantGroups(){
 const records=participantData()?.records;if(!records)return new Map();
 if(participantGroupCache.has(records))return participantGroupCache.get(records);
 const groups=new Map();for(const r of records){if(!r.subject)continue;const k=participantKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 participantGroupCache.set(records,groups);return groups;
}
function participantTiming(rows){
 if(rows.some(r=>r.transitionPolicy&&(!r.orderedEligible||!r.timeVerified)))return {available:false,reason:'Reviewed metadata holds prevent an elapsed-time trajectory; all observations remain inspectable.'};
 if(rows.length<2)return {available:false,reason:'At least two observations are needed for elapsed time.'};
 if(rows.some(r=>r.order===null||!r.timeVerified)||new Set(rows.map(r=>r.order)).size!==rows.length||new Set(rows.map(r=>r.episode||'')).size>1)return {available:false,reason:'Verified timing and unambiguous within-episode visit order are required.'};
 const ordered=rows.slice().sort((a,b)=>a.order-b.order),relative=ordered.every(r=>Number.isFinite(r.elapsedDays)&&r.timeUnit==='day'&&r.timeOrigin===ordered[0].timeOrigin);
 if(!relative&&ordered.some(r=>!r.date))return {available:false,reason:'Verified collection dates or compatible measured study days are unavailable.'};
 const times=ordered.map(r=>relative?r.elapsedDays:Date.parse(r.date+'T00:00:00Z')/86400000);
 if(relative&&new Set(times).size!==times.length)return {available:false,reason:'Same-day observations have no verified within-day sequence.'};
 if(times.some(x=>!Number.isFinite(x))||times.some((x,i)=>i&&x<times[i-1]))return {available:false,reason:'Measured times conflict with visit order.'};
 return {available:true,relative,axisLabel:rows[0].transitionPolicy?'Days since first verified retained collection':'Days since first observed collection',baseline:ordered[0].date||(relative?'study day '+times[0]:'Date unavailable'),days:Object.fromEntries(ordered.map((r,i)=>[r.id,times[i]-times[0]]))};
}
function reviewedParticipantTransition(a,b,elapsed=false){
 if(!a.transitionPolicy&&!b.transitionPolicy)return true;
 return a.transitionPolicy===b.transitionPolicy&&a.orderedEligible&&b.orderedEligible&&a.nextRecords.includes(b.index)&&(!elapsed||a.elapsedNextRecords.includes(b.index));
}
function participantSegments(rows){
 const orders=[...new Set(rows.filter(r=>Number.isSafeInteger(r.order)).map(r=>r.order))].sort((a,b)=>a-b),present=orders.map(order=>rows.filter(r=>r.order===order));
 return present.slice(1).flatMap((g,i)=>g.length===1&&present[i].length===1&&reviewedParticipantTransition(present[i][0],g[0])&&(g[0].episode||'')===(present[i][0].episode||'')&&!(Number.isFinite(g[0].elapsedDays)&&g[0].elapsedDays===present[i][0].elapsedDays)?[{from:present[i][0],to:g[0],gap:g[0].order-present[i][0].order>1}]:[]);
}
function participantDateLabel(r){
 const label=participantData()?.capabilities?.relativeTimeLabel||'Study day';
 const relative=Number.isFinite(r.elapsedDays)?label+' '+r.elapsedDays:'';
 return [r.date,relative].filter(Boolean).join(' · ')||'Date unavailable';
}
function participantVisitColor(r){return participantColors[r.label]||(r.order===null?participantColors.Unordered:`hsl(${(r.order*137.508)%360},60%,40%)`)}
function participantSnapshot(){return {...participant,auditRevision:participant.active?participantData().provenance.auditSha256:null,
 backgroundStates:participant.active&&participant.stateBackground&&participantBackgroundHighlight?.context===participantBackgroundContext()?[...participantBackgroundHighlight.pairs]:[]}}
function validateParticipantView(s,bundle){
 if(!s)return;
 const d=BUNDLE_PACK.participants?.[bundle.dataset.id];
 if(typeof s.active!=='boolean'||!['visit','elapsed'].includes(s.axis)||typeof s.allTaxa!=='boolean'||typeof s.catalogue!=='boolean'||s.taxon!==null&&(!Number.isInteger(s.taxon)||s.taxon< -1||s.taxon>=d?.features.length))throw Error('Invalid saved participant settings.');
 if(s.tableSort!=null&&(!Number.isInteger(s.tableSort.record)||s.tableSort.record<0||typeof s.tableSort.descending!=='boolean'))throw Error('Invalid saved composition sort.');
 if(s.embeddingMode!==undefined&&!['union','reference'].includes(s.embeddingMode))throw Error('Invalid participant embedding mode');
 if(s.colorBy!==undefined&&!['visit','original','merged'].includes(s.colorBy))throw Error('Invalid saved participant color mode.');
 if(s.stateBackground!==undefined&&typeof s.stateBackground!=='boolean')throw Error('Invalid saved participant background setting.');
 if(s.backgroundStates!==undefined&&(!Array.isArray(s.backgroundStates)||s.backgroundStates.some(id=>typeof id!=='string')||new Set(s.backgroundStates).size!==s.backgroundStates.length||s.backgroundStates.length&&(!s.active||!s.stateBackground)))throw Error('Invalid saved background highlight states.');
 if(s.graphSmoothing!==undefined&&(!Number.isInteger(s.graphSmoothing)||s.graphSmoothing<2||s.graphSmoothing>30))throw Error('Invalid saved subject graph smoothing.');
 if(s.sphereSize!==undefined&&(!Number.isInteger(s.sphereSize)||s.sphereSize<4||s.sphereSize>40))throw Error('Invalid saved participant sphere size.');
 if(s.labelSize!==undefined&&(!Number.isInteger(s.labelSize)||s.labelSize<8||s.labelSize>32))throw Error('Invalid saved participant label size.');
 if(s.vertexLabelSize!==undefined&&(!Number.isInteger(s.vertexLabelSize)||s.vertexLabelSize<8||s.vertexLabelSize>32))throw Error('Invalid saved reference vertex label size.');
 if(s.visitBoxSize!==undefined&&(!Number.isInteger(s.visitBoxSize)||s.visitBoxSize<10||s.visitBoxSize>24))throw Error('Invalid saved visit box font size.');
 if(s.tableSize!==undefined&&(!Number.isInteger(s.tableSize)||s.tableSize<10||s.tableSize>24))throw Error('Invalid saved composition table font size.');
 if(s.sampleSize!==undefined&&(!Number.isInteger(s.sampleSize)||s.sampleSize<1||s.sampleSize>12))throw Error('Invalid saved sample point size.');
 if(s.sampleOpacity!==undefined&&(!Number.isFinite(s.sampleOpacity)||s.sampleOpacity<0||s.sampleOpacity>1))throw Error('Invalid saved sample opacity.');
 if(s.backgroundSize!==undefined&&(!Number.isInteger(s.backgroundSize)||s.backgroundSize<1||s.backgroundSize>12))throw Error('Invalid saved background point size.');
 if(s.lineWidth!==undefined&&(!Number.isInteger(s.lineWidth)||s.lineWidth<1||s.lineWidth>16))throw Error('Invalid saved participant line thickness.');
 if(s.arrowScale!==undefined&&(!Number.isFinite(s.arrowScale)||s.arrowScale<.25||s.arrowScale>3))throw Error('Invalid saved participant arrowhead size.');
 for(const key of ['sampleColors','stateBackground','graphBackground','selectedLabelOnly','showLabels','showLines','showArrows','showVertices','matchBackground'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw Error('Invalid saved participant visibility setting.');
 if(s.backgroundOpacity!==undefined&&(!Number.isFinite(s.backgroundOpacity)||s.backgroundOpacity<0||s.backgroundOpacity>1))throw Error('Invalid saved background opacity.');
 if(s.active&&s.embeddingMode==='union'&&d?.capabilities?.jointEmbedding===false)throw Error('This dataset uses saved reference coordinates only; joint embeddings are not prepared.');
 if(s.active&&s.auditRevision!==d?.provenance.auditSha256)throw Error('The participant metadata revision differs from this saved view.');
 if(s.active){const rows=d?.records.filter(r=>r.subject&&participantKey(r)===s.key)||[];if(!rows.length||!rows.some(r=>r.index===s.record)||s.tableSort&&!rows.some(r=>r.index===s.tableSort.record)||s.axis==='elapsed'&&!participantTiming(rows).available)throw Error('Saved participant observations or timing are unavailable.')}
}
function validateParticipantBackgroundView(s,bundle,data,stateMode){
 if(!s?.backgroundStates?.length)return;
 const records=BUNDLE_PACK.participants[bundle.dataset.id].records,cohort=records.find(r=>r.index===s.record).cohort;
 const original=participantBackgroundSchemeFor(s,stateMode)==='original';
 const available=new Set(records.filter(r=>r.cohort===cohort).map(r=>original?bundle.data.samples.pair[r.profile]:data.samples.pair[r.index]));
 if(s.backgroundStates.some(id=>!available.has(id)))throw Error('Invalid saved background highlight states for this cohort and color scheme.');
}
function participantRestore(s){participantBackgroundHighlight=null;participant=s?{sampleSize:2,sampleOpacity:.7,sampleColors:true,embeddingMode:'reference',graphSmoothing:10,graphBackground:false,tableSort:null,matchBackground:false,colorBy:'visit',stateBackground:false,sphereSize:14,labelSize:12,vertexLabelSize:12,visitBoxSize:12,tableSize:13,backgroundSize:2,lineWidth:4,arrowScale:1,selectedLabelOnly:false,showLabels:true,showLines:true,showArrows:true,showVertices:!s.active,backgroundOpacity:s.stateBackground?.55:.25,...s}:{active:false,key:'',record:null,axis:'visit',allTaxa:false,taxon:null,tableSort:null,catalogue:false,colorBy:'visit',stateBackground:true,...participantAppearance};
 if(participant.active&&participant.stateBackground&&s?.backgroundStates?.length)participantBackgroundHighlight={context:participantBackgroundContext(),pairs:[...s.backgroundStates]};
 delete participant.backgroundStates;
 syncParticipantControls()}
function participantGraphSelection(){
 const rows=participantRows(),r=rows.find(r=>r.index===participant.record);if(!r||!DATA.records)return;
 let pair=DATA.samples.pair[r.index];
 // Keep record navigation usable if the trajectory reference is unavailable.
 // Otherwise follow its displayed pair, including neighboring endpoint squares.
 try{pair=trajectoryParticipantGraphPair(rows,r.index)}catch{}
 selected=current().edges.some(e=>e.id===pair)?pair:null;selectedVertex=null;
}
function participantReset(){
 participantBackgroundHighlight=null;
 const rows=participantRows();
 if(participant.active&&(!rows.length||!DATA.records||rows[0].cohort!==activeCohort||!rows.every(r=>eligibleIndices().includes(r.index))))participantRestore(null);
}
function syncParticipantControls(){
 refreshParticipantChoices();
 const available=!!participantData();el('participantMode').disabled=!available;el('participantMode').checked=participant.active;
 el('participantControls').hidden=!available;el('sampleAppearance').hidden=false;
 el('participantAvailability').hidden=available;
 el('participantAvailability').textContent=available?'':'Participant mode requires a verified dataset supplement.';
 const active=participant.active;
 if(!participantJointAvailable())participant.embeddingMode='reference';
 el('participantMatchBackground').checked=participant.matchBackground;el('participantMatchBackground').disabled=!active||!participant.stateBackground;
 el('participantColorBy').options[0].textContent=participantData()?.capabilities?.arbitraryVisits?'Visit order':'Visit labels (E, V1, V2)';
 el('participantColorBy').value=participantColorMode();el('participantColorBy').disabled=!active;
 el('participantColorBy').options[2].disabled=activeStateMode!=='merged';
 el('participantStateBackground').checked=participant.stateBackground;el('participantStateBackground').disabled=!active;
 for(const [id,key] of [['participantSelectedLabelOnly','selectedLabelOnly'],['participantShowLabels','showLabels'],['participantShowLines','showLines'],['participantShowArrows','showArrows'],['participantShowVertices','showVertices']]){el(id).checked=participant[key];el(id).disabled=!active}
 el('participantSelectedLabelOnly').disabled=!active||!participant.showLabels;
 el('participantShowArrows').disabled=!active||!participant.showLines;
 for(const id of ['participantSphereSize','participantLabelSize','participantVertexLabelSize','participantVisitBoxSize','participantTableSize','participantBackgroundSize','participantLineWidth','participantArrowScale','participantBackgroundOpacity'])el(id).disabled=!active;
 el('participantLineWidth').disabled=!active||!participant.showLines;
 el('exportParticipantComposition').disabled=!active;
 el('participantTableSize').value=participant.tableSize;el('participantTableSizeValue').textContent=participant.tableSize+' px';
 el('participantComposition').style.fontSize=participant.tableSize+'px';
 el('participantVisitBoxSize').value=participant.visitBoxSize;el('participantVisitBoxSizeValue').textContent=participant.visitBoxSize+' px';
 el('participantVertexLabelSize').value=participant.vertexLabelSize;el('participantVertexLabelSizeValue').textContent=participant.vertexLabelSize+' px';
 el('participantLabelSize').value=participant.labelSize;el('participantLabelSizeValue').textContent=participant.labelSize+' px';
 el('participantSphereSize').value=participant.sphereSize;el('participantSphereSizeValue').textContent=participant.sphereSize+' px';
 el('participantBackgroundSize').value=participant.backgroundSize;el('participantBackgroundSizeValue').textContent=participant.backgroundSize+' px';
 el('participantLineWidth').value=participant.lineWidth;el('participantLineWidthValue').textContent=participant.lineWidth+' px';
 el('participantArrowScale').value=Math.round(participant.arrowScale*100);el('participantArrowScaleValue').textContent=Math.round(participant.arrowScale*100)+'%';
 el('participantBackgroundOpacity').value=Math.round(participant.backgroundOpacity*100);el('participantBackgroundOpacityValue').textContent=Math.round(participant.backgroundOpacity*100)+'%';
 el('annotationShowControl').hidden=!active||!annotationAsset();el('annotationVerticalScale').hidden=!active||!annotationAsset();
 for(const id of ['participantVisitAppearance','participantSequence','participantTabs','participantHeaderControls','maximizedParticipantVisits','trajectoryBody','trajectoryContent','trajectoryNavigation','trajectoryVerticalControl','trajectoryRepresentationControl','trajectoryBarControls'])el(id).hidden=!active;
 for(const id of ['inspector','edgeSelect'])el(id).hidden=active;
 el('trajectoryThresholdControls').hidden=!active||trajectorySettings.representation!=='stacked';
 el('selectionTitle').textContent='Subject trajectory';
 if(typeof selectionPanelLayoutSync==='function')selectionPanelLayoutSync(active);
 for(const id of ['catalogueKind','exportCatalogue','catalogueControls','catalogueHelp','catalogueStatus','tableBox'])el(id).hidden=active&&!participant.catalogue;
 for(const id of ['participantCompositionArea','participantCompositionControls'])el(id).hidden=!active||participant.catalogue;
 if(active&&!participant.catalogue)el('catalogueTitle').textContent='Composition across visits';
 el('participantCompositionTab').setAttribute('aria-pressed',String(!participant.catalogue));el('participantCatalogueTab').setAttribute('aria-pressed',String(participant.catalogue));
 el('participantEmbeddingMode').options[0].disabled=!participantJointAvailable();
 el('participantEmbeddingMode').title=!participantJointAvailable()?'Pure-state views retain saved reference coordinates. Choose Merged groups for precomputed joint embeddings.':'Choose the saved or joint reference';
 el('participantEmbeddingMode').value=participant.embeddingMode;el('participantEmbeddingMode').disabled=!active;
 for(const id of ['sampleEmbedding','panelSampleEmbedding']){
  el(id).options[3].textContent=active&&participant.embeddingMode==='union'?'Subject states · joint 3D':'Reference embedding / restricted';
  if(active&&!maxNormalizedIds.includes(el('sampleEmbedding').value))el(id).value='reference';
 }
 if(active)for(const id of ['sampleEmbedding','panelSampleEmbedding','scope'])el(id).disabled=true;
 const timing=participantTiming(participantRows());if(!timing.available)participant.axis='visit';
 el('participantAxis').value=participant.axis;el('participantAxis').options[1].disabled=!timing.available;
 syncSampleAppearanceControls();
 el('participantAxis').title=timing.available?'Elapsed days use verified dates or measured study days.':timing.reason;
 el('participantAllTaxa').checked=participant.allTaxa;
}
// Descriptive observed switching: keep flagged visits and count gaps once.
// Never bridge missing assignments or ambiguous/repeated visit orders.
function participantTransitionFraction(rows,state){
 const ordered=rows.slice().sort((a,b)=>(a.order??Infinity)-(b.order??Infinity)||a.id.localeCompare(b.id)),counts=new Map();
 for(const r of ordered)counts.set(r.order,(counts.get(r.order)||0)+1);
 let switches=0,transitions=0;
 for(let i=1;i<ordered.length;i++){
  const a=ordered[i-1],b=ordered[i];
  if(!reviewedParticipantTransition(a,b))continue;
  if(!Number.isSafeInteger(a.order)||!Number.isSafeInteger(b.order)||counts.get(a.order)!==1||counts.get(b.order)!==1||b.order<=a.order||(a.episode||'')!==(b.episode||''))continue;
  if(Number.isFinite(a.elapsedDays)&&Number.isFinite(b.elapsedDays)&&b.elapsedDays<=a.elapsedDays)continue;
  if(a.date&&b.date&&b.date<=a.date)continue;
  const x=state(a),y=state(b);if(x===null||y===null)continue;
  transitions++;if(x!==y)switches++;
 }
 return {switches,transitions,fraction:transitions?switches/transitions:null};
}
// Keep the assignment score available as a distinct diagnostic.
function participantSwitchFraction(rows,pairs){
 return participantTransitionFraction(rows,r=>{const s=pairs?.[r.profile];if(typeof s!=='string')return null;const ids=s.split(',');return ids.length===2&&ids.every(j=>/^\d+$/.test(j))&&ids[0]!==ids[1]?ids.map(Number).sort((a,b)=>a-b).join(','):null});
}
function participantGeometricSwitchProfile(bundle,data,rows,q="60"){
 // Use the trajectory's actual endpoint-placement algorithm, per observation.
 // Equal compositions can be placed differently by their temporal neighbors.
 const settings={...trajectoryDefaults,mode:'merged',rank1:true,pairEndpoints:true,axis:'auto'};
 const model=trajectoryBuild(bundle,data,rows,settings,q,participantTiming(rows));
 const states=new Map(model.points.map(p=>[p.r.index,p.missing?null:p.state]));
 return {score:participantTransitionFraction(rows,r=>states.get(r.index)??null),
  assignment:participantSwitchFraction(rows,bundle.cohortAnalysis.merged[q].pairs),
  omitted:model.points.filter(p=>p.missing).length,
  states:model.states.map(s=>({id:s.id,label:trajectoryLabel(s,bundle),n:s.points.length}))};
}
function participantSwitchTargets(bundle=datasetRegistry.get(META.id),data=participantData()){
 if(!Array.isArray(data?.records)||!data.records.some(r=>r.subject)||!Array.isArray(data.features)||!data.features.length||!data.compositions)return [];
 return Object.keys(bundle?.cohortAnalysis?.merged||{}).filter(q=>Number(q)>0&&Number(q)<=100&&Array.isArray(bundle.cohortAnalysis.merged[q]?.pairs)).sort((a,b)=>Number(a)-Number(b));
}
function participantGeometricSwitchSupported(bundle,data){return participantSwitchTargets(bundle,data).length>0}
function participantSortTarget(){
 const targets=participantSwitchTargets();if(!targets.length)return null;
 if(!participantSortTargets.has(META.id)){let saved;try{saved=(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(participantSortPreference+META.id)}catch{}participantSortTargets.set(META.id,saved)}
 const saved=participantSortTargets.get(META.id);return targets.includes(saved)?saved:targets.includes('60')?'60':targets[0];
}
function setParticipantSortTarget(q){
 if(!participantSwitchTargets().includes(q))return;
 participantSortTargets.set(META.id,q);try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(participantSortPreference+META.id,q)}catch{}
 refreshParticipantChoices();
}
function captureParticipantSorting(){
 const target=participantSortTarget();
 return target===null?null:{target,analysisRevision:datasetRegistry.get(META.id).cohortAnalysis.revision,auditRevision:participantData().provenance.auditSha256};
}
function validateParticipantSorting(s,bundle){
 if(s===undefined||s===null)return; // Older views retain the dataset's current preference.
 const data=BUNDLE_PACK.participants?.[bundle.dataset.id];
 if(typeof s!=='object'||typeof s.target!=='string'||!participantSwitchTargets(bundle,data).includes(s.target))throw Error('Saved Subject sorting target is unavailable.');
 if(data.datasetRevision!==bundle.dataset.revision||data.analysisRevision!==bundle.cohortAnalysis.revision||s.analysisRevision!==bundle.cohortAnalysis.revision||s.auditRevision!==data.provenance.auditSha256)throw Error('Subject sorting reference or participant metadata revision differs from this saved view.');
}
function participantSwitchStats(q=participantSortTarget()){
 const data=participantData(),bundle=datasetRegistry.get(META.id);
 if(!participantSwitchTargets(bundle,data).includes(q))return null;
 if(participantSwitchCache.data!==data||participantSwitchCache.bundle!==bundle)participantSwitchCache={data,bundle,levels:new Map()};
 const pairs=bundle.cohortAnalysis.merged[q].pairs,cached=participantSwitchCache.levels.get(q);
 if(!cached||cached.pairs!==pairs){
  const groups=participantGroups(),prepared=BUNDLE_PACK.participantPreparation?.[META.id];
  let scores,profiles;
  if(prepared&&prepared.analysisRevision===data.analysisRevision&&prepared.auditRevision===data.provenance.auditSha256){
   if(prepared.version!==1||prepared.datasetRevision!==data.datasetRevision||!Array.isArray(prepared.scores[q])||prepared.scores[q].length!==groups.size)throw Error('Invalid prepared participant sorting reference');
   scores=new Map(prepared.scores[q].map(([key,switches,transitions])=>{
    if(!groups.has(key)||!Number.isSafeInteger(switches)||!Number.isSafeInteger(transitions)||switches<0||transitions<switches||transitions>=groups.get(key).length)throw Error('Invalid prepared participant switching count');
    return [key,{switches,transitions,fraction:transitions?switches/transitions:null}];
   }));
   if(scores.size!==groups.size)throw Error('Incomplete prepared participant sorting reference');
   const details=new Map();
   profiles={get(key){if(!groups.has(key))return undefined;if(!details.has(key)){
    const p=participantGeometricSwitchProfile(bundle,data,groups.get(key),q);
    if(JSON.stringify(p.score)!==JSON.stringify(scores.get(key)))throw Error('Prepared participant score differs from trajectory');
    details.set(key,p);
   }return details.get(key)}};
  }else{
   profiles=new Map([...groups].map(([key,rows])=>[key,participantGeometricSwitchProfile(bundle,data,rows,q)]));
   scores=new Map([...profiles].map(([key,p])=>[key,p.score]));
  }
  participantSwitchCache.levels.set(q,{pairs,profiles,scores});
 }
 return participantSwitchCache.levels.get(q);
}
function participantSwitchScores(q=participantSortTarget()){return participantSwitchStats(q)?.scores||null}
function refreshParticipantSortControls(){
 const targets=participantSwitchTargets(),control=el('participantSortTarget');
 control.innerHTML=targets.length?targets.map(q=>`<option value="${esc(q)}">Geometric switch · ${esc(q)}%</option>`).join(''):'<option value="">Participant ID</option>';
 control.value=participantSortTarget()||'';control.disabled=!targets.length||participantBrowseBusy;
 el('exportParticipantSwitching').disabled=!targets.length||participantBrowseBusy||!participantChoiceKeys.size;
}
function participantSwitchExportRows(){
 const targets=participantSwitchTargets(),q=participantSortTarget();if(!targets.length)return [];
 const choices=participantChoices(),levels=new Map(targets.map(target=>[target,participantSwitchStats(target)]));
 const columns=['dataset_id','dataset_revision','project','participant_id','episode','visit_count','distinct_ordered_visit_count','sort_reference_core_target_pct','whole_sample_endpoint_threshold_pct','within_pair_endpoint_threshold_pct',...targets.flatMap(target=>['geometric_state_count','switches','eligible_transitions','geometric_switch_proportion','geometric_switch_percent'].map(field=>field+'_q'+target))];
 const result=[columns,...choices.map(([key,rows])=>[META.id,datasetRegistry.get(META.id).dataset.revision,rows[0].cohort,rows[0].subject,rows[0].episode||'',rows.length,new Set(rows.filter(r=>Number.isSafeInteger(r.order)).map(r=>r.order)).size,Number(q),95,95,...targets.flatMap(target=>{const p=levels.get(target).profiles.get(key),s=p.score;return [p.states.length,s.switches,s.transitions,s.fraction??'',s.fraction===null?'':100*s.fraction]})])];
 const revision=datasetRegistry.get(META.id).cohortAnalysis?.eligibility?.revision;
 if(revision){result[0].push('analysis_revision');result.slice(1).forEach(row=>row.push(revision))}
 return result;
}
function participantSwitchCsvCell(value){
 const text=typeof value==='string'&&/^[=+@\t\r\n-]/.test(value)?"'"+value:String(value);
 return '"'+text.replaceAll('"','""')+'"';
}
function participantSwitchCsv(){return participantSwitchExportRows().map(row=>row.map(participantSwitchCsvCell).join(',')).join('\r\n')+'\r\n'}
function updateParticipantSwitchHelp(){
 const scores=participantSwitchScores(),rows=participantRows(),score=scores?.get(participant.key);
 if(!participant.active||!score){el('participantSwitchCurrent').textContent=scores?'Choose a participant to see geometric-state counts and eligible transitions.':'Geometric switch ordering requires merged assignments and a participant supplement with full compositions and visit-order metadata. This dataset retains alphabetical participant ordering.';return}
 const profile=participantSwitchStats().profiles.get(participant.key),raw=profile.assignment;
 el('participantSwitchCurrent').innerHTML=`<p><b>${esc(rows[0].subject)}: ${score.fraction===null?'unavailable':(100*score.fraction).toFixed(1)+'%'}</b> · ${score.switches} changes / ${score.transitions} eligible transitions.</p><p>Merged ${esc(participantSortTarget())}%, both ≥95% endpoint rules · ${profile.states.length} geometric states:</p><ul>`+profile.states.slice().sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id)).map(s=>`<li>${esc(s.label)}: ${s.n} observations</li>`).join('')+`</ul><p>${profile.omitted} observations lack a displayed position; adjacent transitions are excluded.</p><p>Underlying assignment switching: ${raw.fraction===null?'unavailable':(100*raw.fraction).toFixed(1)+'%'} (${raw.switches}/${raw.transitions}); not used for sorting.</p>`;
}
function participantSwitchDescription(rows){
 const score=participantSwitchScores()?.get(participantKey(rows[0]));if(!score)return '';
 return `Geometric switch proportion: ${score.fraction===null?'unavailable':(100*score.fraction).toFixed(1)+'%'} (${score.switches}/${score.transitions} eligible observed transitions) · Merged ${participantSortTarget()}% sorting reference, whole-sample and within-pair ≥95% endpoint rules. Other trajectory settings do not change this reference score. All released visits, including quality-flagged visits, are considered; unpositioned observations exclude adjacent transitions. Gaps count once; not a rate per day.`;
}
const participantIdOrder=new Intl.Collator(undefined,{numeric:true});
function participantChoices(project=el('participantCohort').value||'both'){
 const scores=participantSwitchScores(),groupProjects=project==='both'&&participantData()?.records.some(r=>r.transitionPolicy);
 return [...participantGroups()].filter(([,rs])=>project==='both'||rs[0].cohort===project).sort((a,b)=>{
  if(groupProjects&&a[1][0].cohort!==b[1][0].cohort)return a[1][0].cohort.localeCompare(b[1][0].cohort);
  const af=scores?.get(a[0])?.fraction??Infinity,bf=scores?.get(b[0])?.fraction??Infinity;
  return (af===bf?0:af-bf)||participantIdOrder.compare(a[1][0].subject,b[1][0].subject)||a[1][0].cohort.localeCompare(b[1][0].cohort);
 });
}
function participantChoiceLabel(rows){
 const visits=participantData()?.capabilities?.arbitraryVisits?[`${rows.filter(r=>r.order!==null).length} ordered visits`]:['E','V1','V2','Unordered'].filter(label=>rows.some(r=>r.label===label));
 return `${rows[0].subject} · ${rows[0].cohort} · ${rows.length} observation${rows.length===1?'':'s'} · ${visits.join(', ')}`;
}
function refreshParticipantChoices(){
 const data=participantData(),select=el('participantSelect');
 el('participantProjectControl').hidden=new Set((data?.records||[]).map(r=>r.cohort)).size<=1;
 if(data!==participantChoiceData){const control=el('participantCohort'),previous=control.value,cohorts=[...new Set((data?.records||[]).map(r=>r.cohort))];control.innerHTML='<option value="both">All projects</option>'+cohorts.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');control.value=cohorts.includes(previous)?previous:'both'}
 let project=el('participantCohort').value||'both';
 // Bookmarks can restore a participant outside the previously browsed project.
 // A deliberate project change alone leaves the current participant view intact.
 if(participant.active&&participant.key!==participantChoiceActiveKey){const rows=participantRows();if(rows.length&&project!=='both'&&project!==rows[0].cohort){project=rows[0].cohort;el('participantCohort').value=project}}
 participantChoiceActiveKey=participant.active?participant.key:'';
 const states=participantSwitchScores();
 if(data!==participantChoiceData||project!==participantChoiceProject||states!==participantChoiceStates){
  el('participantSwitchExportStatus').textContent='';
  const choices=participantChoices(project);participantChoiceKeys=new Set(choices.map(([key])=>key));
  const option=([key,rows])=>{
   const score=states?.get(key),fraction=score?.fraction,label=rows[0].subject+(states?` · ${fraction==null?'N/A':(100*fraction).toFixed(1)+'%'}`:'');
   return `<option${states?` title="${esc(`${score.switches} changes / ${score.transitions} eligible transitions · Merged ${participantSortTarget()}%`)}"`:''} value="${esc(key)}">${esc(label)}</option>`;
  };
  const grouped=project==='both'&&data?.records.some(r=>r.transitionPolicy);
  const options=grouped?[...new Set(choices.map(([,rows])=>rows[0].cohort))].sort().map(cohort=>`<optgroup label="${esc(cohort)}">${choices.filter(([,rows])=>rows[0].cohort===cohort).map(option).join('')}</optgroup>`).join(''):choices.map(option).join('');
  select.innerHTML='<option value="">Choose a participant…</option>'+options;
  participantChoiceData=data;participantChoiceProject=project;participantChoiceStates=states;
 }
 select.disabled=participantBrowseBusy||!data||participantChoiceKeys.size===0;
 el('participantCohort').disabled=participantBrowseBusy||!data;
 select.value=participant.active&&participantChoiceKeys.has(participant.key)?participant.key:'';
 select.title=(select.value?participantChoiceLabel(participantRows()):'Browse all participants in the selected project')+(states?' · Increasing geometric switch proportion. '+(select.value?participantSwitchDescription(participantRows()):'Uses the Subject sorting target and both ≥95% endpoint rules; ties use participant ID.'):'');
 const position=[...participantChoiceKeys].indexOf(select.value);
 el('previousParticipant').disabled=participantBrowseBusy||position<=0;
 el('nextParticipant').disabled=participantBrowseBusy||!participantChoiceKeys.size||position===participantChoiceKeys.size-1;
 const fraction=states?.get(select.value)?.fraction;
 el('participantChoiceSummary').textContent=(select.value?`Participant ${position+1} of ${participantChoiceKeys.size}. `+participantChoiceLabel(participantRows()):`${participantChoiceKeys.size} participants available. Next opens the first participant.`)+(states?' · '+(select.value?`Geometric switch ${fraction==null?'unavailable':(100*fraction).toFixed(1)+'%'}`:'Sorted by increasing geometric switch proportion'):'');
 refreshParticipantSortControls();updateParticipantSwitchHelp();
}
async function browseParticipant(key){
 if(participantBrowseBusy||!participantChoiceKeys.has(key))return;
 participantBrowseBusy=true;refreshParticipantChoices();el('participantMessage').textContent='Loading participant…';
 try{await openParticipant(key);await Promise.all([queue,graphQueue]);el('participantMessage').textContent=''}
 catch(e){el('participantMessage').textContent=e.message}
 finally{participantBrowseBusy=false;refreshParticipantChoices()}
}
function stepParticipant(direction){
 if(participantBrowseBusy)return;
 const keys=[...participantChoiceKeys],position=participant.active?keys.indexOf(participant.key):-1,index=position+direction;
 if(index<0||index>=keys.length)return;
 return browseParticipant(keys[index]);
}
async function openParticipant(key){
 const rows=participantRows(key);if(!rows.length)return;
 if(typeof baselineExplore!=='undefined')baselineExplore.visit='off';
 participantBackgroundHighlight=null;
 const axis=participant.axis,allTaxa=participant.allTaxa,catalogue=participant.catalogue;
 const openedDataset=META.id,revision=++participantOpenRevision,camera=participant.active?readCamera('samples'):defaultCamera,graphCamera=readCamera('graph3d'),embeddingMode=!participantJointAvailable()?'reference':participant.embeddingMode,graphSmoothing=participant.graphSmoothing,graphBackground=participant.graphBackground,matchBackground=participant.matchBackground,colorBy=participant.colorBy,stateBackground=participant.stateBackground,sphereSize=participant.sphereSize,labelSize=participant.labelSize,vertexLabelSize=participant.vertexLabelSize,visitBoxSize=participant.visitBoxSize,tableSize=participant.tableSize,backgroundSize=participant.backgroundSize,lineWidth=participant.lineWidth,arrowScale=participant.arrowScale,selectedLabelOnly=participant.selectedLabelOnly,showLabels=participant.showLabels,showLines=participant.showLines,showArrows=participant.showArrows,showVertices=participant.showVertices,backgroundOpacity=participant.backgroundOpacity;
 if(!DATA.records||activeCohort!==rows[0].cohort)await changeAnalysis(rows[0].cohort,activeStateMode,el('coverage').value);
 if(revision!==participantOpenRevision||META.id!==openedDataset||!participantData()||activeCohort!==rows[0].cohort)return;
 participant={sampleSize:participant.sampleSize,sampleOpacity:participant.sampleOpacity,sampleColors:participant.sampleColors,active:true,key,record:rows[0].index,axis,allTaxa,taxon:null,tableSort:null,catalogue,embeddingMode,graphSmoothing,graphBackground,matchBackground,colorBy,stateBackground,sphereSize,labelSize,vertexLabelSize,visitBoxSize,tableSize,backgroundSize,lineWidth,arrowScale,selectedLabelOnly,showLabels,showLines,showArrows,showVertices,backgroundOpacity};
 rank3Clear();rank3.enabled=false;syncRank3Controls();el('participantMode').checked=true;
 if(typeof saveDatasetNavigation==='function')saveDatasetNavigation();
 return chooseParticipantRecord(rows[0].index,camera,graphCamera);
}
function chooseParticipantRecord(index,camera=pendingSampleCamera||readCamera('samples'),graphCamera=pendingGraphCamera||readCamera('graph3d')){
 const r=participantRows().find(r=>r.index===index);if(!r)return;
 participant.record=index;participantGraphSelection();hiddenEdges=new Set();
 graph(graphCamera);table();return Promise.all([graphQueue,refreshSamples(camera)]);
}
async function stepParticipantVisit(direction){
 if(!participant.active||![-1,1].includes(direction))return;
 const rows=participantRows(),position=rows.findIndex(r=>r.index===participant.record),next=position+direction;
 if(position<0||next<0||next>=rows.length)return;
 await chooseParticipantRecord(rows[next].index);
 // Scroll only the visit strip, never the page or the 3D plot.
 const grid=el('participantSequence').querySelector?.('.participantVisits'),card=grid?.querySelector('.participantVisit.active');
 if(grid&&card){const box=grid.getBoundingClientRect(),visit=card.getBoundingClientRect();
  if(visit.left<box.left)grid.scrollLeft-=box.left-visit.left;
  else if(visit.right>box.right)grid.scrollLeft+=visit.right-box.right;
 }
}
function updateParticipantBackgroundOpacity(){
 const revision=sampleRevision;
 queue=queue.then(async()=>{
  // A newer sample render already uses the latest opacity. Never restyle a different view.
  if(revision!==sampleRevision||!participant.active||!el('samples').data?.[0]?.meta?.participantBackground)return;
  await Plotly.restyle('samples',{'marker.opacity':participant.backgroundOpacity},[0]);
 }).catch(e=>{el('sampleStatus').textContent='Background opacity error: '+e.message;console.error(e)});
 return queue;
}
function leaveParticipant(){++participantOpenRevision;participantRestore(null);selected=null;selectedVertex=null;draw();if(typeof saveDatasetNavigation==='function')saveDatasetNavigation()}
function participantLabel(r){return r.subject+'-'+r.label}
const participantHoverRecords=new WeakMap();
function participantRecordForId(id){
 const d=participantData();if(!d)return null;
 if(!participantHoverRecords.has(d))participantHoverRecords.set(d,new Map(d.records.map(r=>[r.id,r])));
 return participantHoverRecords.get(d).get(id)||null;
}
const compactTaxonLabels=new Map();
function compactTaxonLabel(name){
 if(!compactTaxonLabels.has(name))compactTaxonLabels.set(name,esc(taxonDisplayLabel(name)));
 return compactTaxonLabels.get(name);
}
function compactSampleHover(label,taxa){
 return `<b>${esc(label)}</b>`+(taxa||[]).slice(0,5).map(([name,pct])=>'<br>'+compactTaxonLabel(name)+': '+(pct>0&&pct<.01?'&lt;0.01':Number(pct).toFixed(2))+'%').join('');
}
function participantSampleHover(r){
 const d=participantData(),sparse=d?.compositions[r.profile]||[],prepared=BUNDLE_PACK.participantPreparation?.[META.id];
 // Frozen top-five positions avoid rescanning every full composition merely to
 // paint hover labels. Trajectory construction retains its original checks.
 const positions=prepared?.datasetRevision===d?.datasetRevision&&prepared?.analysisRevision===d?.analysisRevision&&prepared?.auditRevision===d?.provenance.auditSha256?prepared.leadingPositions?.[r.profile]:null;
 const taxa=(positions?positions.map(i=>sparse[i]):trajectoryLeadingFeatures(sparse,5)).map(([j,v])=>[d.features[j],100*v]);
 return compactSampleHover(r.subject?participantLabel(r):r.id,taxa)+(typeof valenciaHover==='function'?valenciaHover(r.profile,r.id):'')+(typeof sampleCstHover==='function'?sampleCstHover(r.profile):'');
}
function participantHover(r){return `<b>${esc(participantLabel(r))}</b><br>${esc(r.cohort)} · ${esc(r.id)}<br>Specimen: ${esc(r.specimen)}<br>Original visit: ${esc(r.originalVisit||'missing')}<br>Collection time: ${esc(participantDateLabel(r))}${r.transitionPolicy?'<br>Reviewed visit: '+esc(r.reviewedVisit||'unavailable')+'<br>Participant unit: '+esc(r.participantUnit)+'<br>Link evidence: '+esc(r.metadataEvidence)+'<br>Timing evidence: '+esc(r.timingEvidence):''}<br>${r.flags.map(esc).join('<br>')}`}
function participantVisitMetadata(r){
 if(participantData()?.capabilities?.gestationalAge===false)return participantStateDetails(r,'participantVisitState');
 const weeks=Number.isFinite(r.gestationalWeeks)?r.gestationalWeeks:null;
 const age=weeks===null?'Gestational age unavailable':`Gestation: ${weeks.toFixed(1)} weeks`;
 const ageTitle=weeks===null?'No reviewed gestational age at collection is supplied.':`Reviewed gestational age at collection, in decimal weeks. Dating source: ${(r.gestationalAgeSource||'not supplied').replaceAll('_',' ')}. Rounded for display; not an elapsed-time measure.`;
 return `<small class="participantVisitAge" title="${esc(ageTitle)}">${esc(age)}</small>${participantStateDetails(r,'participantVisitState')}`;
}
function renderParticipantSequence(rows){
 renderSubjectTrajectory();
 const visitScroll=el('participantSequence').querySelector?.('.participantVisits')?.scrollLeft||0;
 const timing=participantTiming(rows),active=rows.find(r=>r.index===participant.record),bundle=datasetRegistry.get(META.id);
 const position=rows.findIndex(r=>r.index===participant.record);
 const navigation=`<div class="participantVisitNavigation" role="group" aria-label="Browse participant visits"><button type="button" data-step-visit="-1"${position<=0?' disabled':''}>‹ Previous visit</button><span role="status" aria-live="polite">${position>=0?`${esc(rows[position].label)} · Observation ${position+1} of ${rows.length}`:'No visit selected'}</span><button type="button" data-step-visit="1"${position<0||position>=rows.length-1?' disabled':''}>Next visit ›</button></div>`;
 const button=r=>`<button type="button" class="participantVisit ${r.index===participant.record?'active':''}" style="font-size:${participant.visitBoxSize}px" data-observation="${r.index}" aria-pressed="${r.index===participant.record}" title="${esc(r.id)}">${esc(participantLabel(r))}${r.flags.length?' ⚑':''}<small>${esc(participantDateLabel(r))}${participant.axis==='elapsed'?' · day '+timing.days[r.id]:''}</small>${participantVisitMetadata(r)}</button>`;
 el('participantSequence').innerHTML=navigation+`<p><strong>${esc(rows[0].cohort)} · ${esc(rows[0].subject)}</strong> · ${rows.length} ${esc(META.observationLabel)}</p><p>${participant.axis==='elapsed'?'Visit order (equal spacing); labels give days since first observed collection ('+esc(timing.baseline)+').':'Visit order — spacing does not represent elapsed time.'}</p><div class="participantVisits" tabindex="0" role="region" aria-label="Participant visits; scroll horizontally when needed" style="font-size:${participant.visitBoxSize}px">${(participantData()?.capabilities?.arbitraryVisits?[...new Set(rows.filter(r=>r.order!==null).map(r=>r.order))].sort((a,b)=>a-b).map(order=>({order,label:rows.find(r=>r.order===order).label})):['E','V1','V2'].map((label,order)=>({order,label}))).map(({label,order})=>{const rr=rows.filter(r=>r.order===order);return `<div><strong>${label}</strong>${rr.length?rr.map(button).join(''):'<small>No ordered observation</small>'}</div>`}).join('')}</div>`+
 (rows.some(r=>r.order===null)?`<details open><summary>Unordered or uncertain observations · no connecting path</summary>${rows.filter(r=>r.order===null).map(button).join('')}</details>`:'')+
 (active?`<p>${participantHover(active)}</p><p>Original leading pair: ${esc(pairName(bundle.data.samples.pair[active.profile]))}<br>Current ${activeStateMode==='merged'?'merged group':'pure state'}: ${esc(pairName(DATA.samples.pair[active.index]))}${selected===null?' · Outside the retained graph catalogue; observation remains visible.':''}</p>`:'')+
 '<small>Lines connect observed samples only. Unknown or repeated-visit order is not inferred. '+(esc(participantData()?.capabilities?.visitLabelDescription||'')||(participantData()?.capabilities?.arbitraryVisits?'Original visits and source order positions are retained; V labels enumerate observed eligible visits.':'Missing visits are not renumbered.'))+' Participant identifiers do not independently establish pregnancy identity.</small>';
 const grid=el('participantSequence').querySelector?.('.participantVisits');if(grid)grid.scrollLeft=visitScroll;
}
function participantComposition(rows){
 const d=participantData(),totals=new Map();for(const r of rows)for(const [j,v] of d.compositions[r.profile])totals.set(j,(totals.get(j)||0)+v);
 const ranked=[...totals].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([j])=>j),shown=participant.allTaxa?ranked:ranked.slice(0,12);
 const keep=new Set(shown),values=rows.map(r=>{const p=new Map(d.compositions[r.profile]),other=[...p].filter(([j])=>!keep.has(j)).reduce((s,[,v])=>s+v,0);return {record:r,values:shown.map(j=>[j,p.get(j)||0]).concat(other>0?[[-1,other]]:[])}});
 return {shown,values,hasOther:ranked.length>shown.length};
}
function participantStateDetails(r,className){
 const bundle=datasetRegistry.get(META.id),original=bundle.data.samples.pair[r.profile];
 const originalLabel=displayGraph(bundle.data.graphs['100'],bundle.data).edges.find(e=>e.id===original)?.label||pairName(original);
 const merged=activeStateMode==='merged',pair=DATA.samples.pair[r.index],edge=merged?current().edges.find(e=>e.id===pair):null;
 const originalTitle=original===null?'One positive taxon; no second taxon is fabricated.':`${pairName(original)}; the sample's original two leading taxa, independent of merging and the reference target.`;
 const mergedTitle=merged?`${pairName(pair)}; assigned reference group at ${el('coverage').value}% target${edge?' · '+edge.key:''}. The group label need not name this sample's dominant taxa.`:'No merged assignment is applied in Pure states mode.';
 return `<small class="${className}" title="${esc(originalTitle)}"><strong>Original top-2 CST pair:</strong> ${esc(originalLabel)}</small>`+
  `<small class="${className}" title="${esc(mergedTitle)}"><strong>Assigned merged group:</strong> ${merged?esc(participantStateLabel(r)):'Not applied (Pure states)'}</small>`;
}
function participantStateLabel(r){
 const pair=DATA.samples.pair[r.index];if(pair==null)return 'No leading pair (one positive taxon)';
 return current().edges.find(e=>e.id===pair)?.label||stateDisplayLabel(pair);
}
function sortParticipantComposition(index){
 if(!participantRows().some(r=>r.index===index))return;
 participant.tableSort={record:index,descending:participant.tableSort?.record===index?!participant.tableSort.descending:true};
 return chooseParticipantRecord(index);
}
function participantPercent(value){return value>0&&value*100<.01?'<0.01%':(value*100).toFixed(2)+'%'}
function participantCompositionTable(rows=participantRows()){
 const d=participantData(),c=participantComposition(rows);
 const columns=c.values.map(v=>new Map(v.values)),taxa=[...c.shown],sortIndex=rows.findIndex(r=>r.index===participant.tableSort?.record);
 if(sortIndex>=0)taxa.sort((a,b)=>((columns[sortIndex].get(a)||0)-(columns[sortIndex].get(b)||0))*(participant.tableSort.descending?-1:1)||d.features[a].localeCompare(d.features[b])||a-b);
 if(c.hasOther)taxa.push(-1);
 return {d,c,columns,taxa};
}
function participantCompositionExportRows(){
 if(!participant.active)return [];
 const rows=participantRows(),{d,columns,taxa}=participantCompositionTable(rows),bundle=datasetRegistry.get(META.id),timing=participantTiming(rows);
 const metadata=[
  ['dataset',()=>META.id],['cohort',r=>r.cohort],['participant_id',r=>r.subject],
  ...(bundle.cohortAnalysis?.eligibility?[['analysis_revision',()=>bundle.cohortAnalysis.eligibility.revision]]:[]),
  ['record_id',r=>r.id],['specimen_id',r=>r.specimen],['visit_label',r=>r.label],
  ...((rows[0]?.transitionPolicy)?[['original_visit',r=>r.originalVisit],['reviewed_visit',r=>r.reviewedVisit],['participant_unit',r=>r.participantUnit],['ordered_observation_eligible',r=>r.orderedEligible],['exact_time_eligible',r=>r.timeVerified],['metadata_evidence',r=>r.metadataEvidence],['timing_evidence',r=>r.timingEvidence],['eligibility_flags',r=>r.eligibilityFlags.join('; ')],['scientific_release_eligible',()=>false]]:[]),
  ['visit_order',r=>r.order??''],['collection_date',r=>r.date||''],['source_elapsed_day',r=>r.elapsedDays??''],['time_origin',r=>r.timeOrigin||''],['episode',r=>r.episode||''],
  ['gestational_age_weeks',r=>r.gestationalWeeks??''],['gestational_age_source',r=>r.gestationalAgeSource||''],
  ['2_udCST_label',participantStateLabel],['2_udCST_pair_id',r=>DATA.samples.pair[r.index]],
  ['state_mode',()=>activeStateMode],['reference_target_percent',()=>Number(el('coverage').value)],
  ['original_leading_pair',r=>pairName(bundle.data.samples.pair[r.profile])],
  ['assignment_method',r=>DATA.assignment?.methods[r.profile]||'pure'],
  ['elapsed_days',r=>participant.axis==='elapsed'&&timing.available?timing.days[r.id]:''],
  ['review_flags',r=>r.flags.join('; ')],['abundance_unit',()=>'percent'],
  ['taxa_display',()=>participant.allTaxa?'all_detected':'top_12_plus_other'],
  ['sorted_by_record_id',()=>rows.find(r=>r.index===participant.tableSort?.record)?.id||''],
  ['sort_direction',()=>participant.tableSort?(participant.tableSort.descending?'descending':'ascending'):'aggregate_descending']
 ];
 return [['row_type','field_or_taxon',...rows.map(participantLabel)],
  ...metadata.map(([name,get])=>['metadata',name,...rows.map(get)]),
  ...taxa.map(j=>['taxon',j===-1?'Other taxa':d.features[j],...columns.map(col=>(col.get(j)||0)*100)]),
  ['total','Total',...columns.map(col=>[...col.values()].reduce((sum,v)=>sum+v,0)*100)]];
}
function participantCompositionCsv(){
 return participantCompositionExportRows().map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
function centerParticipantComposition(){
 const scroll=el('participantComposition').querySelector?.('.compositionScroll'),cell=scroll?.querySelector('thead th.activeVisit');
 if(!scroll||!cell||!scroll.clientWidth)return;
 const box=scroll.getBoundingClientRect(),target=cell.getBoundingClientRect(),taxon=scroll.querySelector('thead th')?.getBoundingClientRect().width||0;
 scroll.scrollLeft=Math.max(0,Math.min(scroll.scrollWidth-scroll.clientWidth,scroll.scrollLeft+target.left-box.left+target.width/2-(scroll.clientWidth+taxon)/2));
}
function renderParticipantComposition(rows){
 const {d,columns,taxa}=participantCompositionTable(rows),timing=participantTiming(rows),elapsed=participant.axis==='elapsed'&&timing.available;
 const active=r=>r.index===participant.record?' class="activeVisit"':'';
 const header=rows.map(r=>{
  const sorted=participant.tableSort?.record===r.index,order=sorted?(participant.tableSort.descending?'descending':'ascending'):'none';
  const dateAge=participantDateLabel(r)+(d.capabilities?.gestationalAge===false?'':' ('+(Number.isFinite(r.gestationalWeeks)?r.gestationalWeeks.toFixed(1):'GA unavailable')+')');
  const original=datasetRegistry.get(META.id).data.samples.pair[r.profile],merged=activeStateMode==='merged';
  const details=[participantLabel(r),`Specimen: ${r.specimen}`,`${d.capabilities?.gestationalAge===false?'Collection time':'Collection date (gestational age in weeks)'}: ${dateAge}`,
   `Original top-2 CST pair: ${stateDisplayLabel(original)} (${pairName(original)})`,
   `Assigned merged group: ${merged?participantStateLabel(r)+' ('+pairName(DATA.samples.pair[r.index])+')':'Not applied (Pure states)'}`];
  if(merged)details.push(`Largest 2-CSTs coverage: ${el('coverage').value}%. The assigned group's taxa need not dominate this sample.`);
  if(elapsed)details.push(`Elapsed day ${timing.days[r.id]}`);
  if(r.order===null)details.push('Visit order unavailable');
  details.push(...r.flags,'Sort taxa by this visit; click again to reverse.');
  const tooltip=esc(details.join('\n'));
  return `<th scope="col" aria-sort="${order}"${active(r)}><button type="button" data-sort-visit="${r.index}" aria-pressed="${r.index===participant.record}" title="${tooltip}" aria-label="${tooltip}">${esc(r.label)}${sorted?(participant.tableSort.descending?' ▼':' ▲'):''}</button></th>`;
 }).join('');
 const body=taxa.map(j=>{
  const name=j===-1?'Other taxa':d.features[j];
  return `<tr data-composition-taxon="${j}"${participant.taxon===j?' class="highlightTaxon"':''}><th scope="row"><button type="button" data-highlight-taxon="${j}" aria-pressed="${participant.taxon===j}" title="${esc(name)}" aria-label="${esc(name)}">${esc(j===-1?name:taxonDisplayLabel(name))}</button></th>${rows.map((r,i)=>{
   const value=columns[i].get(j)||0;
   return `<td${active(r)}><button type="button" data-composition-record="${r.index}" data-taxon="${j}" title="${esc(participantLabel(r)+' · '+name+': '+(value*100)+'%')}">${esc(participantPercent(value))}</button></td>`;
  }).join('')}</tr>`;
 }).join('');
 const totals=rows.map((r,i)=>`<td${active(r)}>${esc(participantPercent([...columns[i].values()].reduce((sum,v)=>sum+v,0)))}</td>`).join('');
 el('participantComposition').innerHTML=`<div class="compositionScroll" tabindex="0" role="region" aria-label="Taxon relative abundances by visit"><table class="participantCompositionTable"><thead><tr><th scope="col">Taxon</th>${header}</tr></thead><tbody>${body}</tbody><tfoot><tr><th scope="row">Total</th>${totals}</tr></tfoot></table></div><small>Columns follow visit order; column widths do not represent elapsed time. All ${d.features.length} features are accounted for. Values are rounded to two decimals; positive values below 0.01% are shown as &lt;0.01%. Displayed values may not sum to exactly 100% after rounding. Hover for unrounded percentages.</small>`;
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(centerParticipantComposition);
}
// Shared sample controls also apply outside Participant mode. Keep ordinary
// sample settings separate from the dimmer background behind participant visits.
function syncSampleAppearanceControls(referenceAvailable=true){
 const active=participant.active,visitHighlighting=typeof explorationActive==='function'&&explorationActive();
 el('samplePointGroupTitle').textContent=active?'Background samples':'Samples';
 el('samplePointColorLabel').textContent=active?'Color background by top-2 CST':'Use sample colors';
 el('samplePointSizeLabel').textContent=active?'Background point size':'Sample point size';
 el('samplePointOpacityLabel').textContent=active?'Background opacity':'Sample opacity';
 el('participantVisitAppearanceNote').hidden=active;
 el('participantStateBackground').disabled=visitHighlighting;
 el('participantStateBackground').checked=visitHighlighting|| (active?participant.stateBackground:participant.sampleColors);
 el('participantStateBackground').parentElement?.setAttribute('title',active?'Color background by community state. Uncheck for gray samples.':'Use the current sample color scheme. Uncheck for gray samples.');
 el('participantMatchBackground').parentElement?.setAttribute('title','Available when a participant is selected and background state colors are enabled.');
 el('participantMatchBackground').disabled=!active||!participant.stateBackground;
 for(const [id,key,scale] of [['participantBackgroundSize',active?'backgroundSize':'sampleSize',1],['participantBackgroundOpacity',active?'backgroundOpacity':'sampleOpacity',100]]){
  el(id).disabled=visitHighlighting;el(id).title=visitHighlighting?'Use the separate highlighted-visit and gray-background controls in Visit and enrollment neighborhoods.':'';el(id).value=participant[key]*scale;
  el(id+'Value').textContent=Math.round(participant[key]*scale)+(scale===100?'%':' px');
 }
 el('participantShowVertices').disabled=!referenceAvailable;
 el('participantVertexLabelSize').disabled=!referenceAvailable||!participant.showVertices;
 for(const id of ['sampleReferenceSpheres','sampleReferenceScale','sampleReferenceColor'])el(id).disabled=!referenceAvailable||!participant.showVertices;
 syncSampleReferenceSizeControl();syncSphereLightingControls('sample',referenceAvailable&&participant.showVertices);
 el('sampleReferenceNote').hidden=referenceAvailable;
 el('participantLabelSize').disabled=!active||!participant.showLabels;
 el('participantArrowScale').disabled=!active||!participant.showLines||!participant.showArrows;
}
function renderSamplePlot(traces,layout,config){
 syncEmbeddingChoices();
 if(typeof jointEmbeddingActive==='function'&&jointEmbeddingActive())({traces,layout}=jointEmbeddingTransform(traces,layout));
 if(!participant.active){
  const referenceLabel=a=>String(a.name||'').startsWith('endpoint-vertex:');
  const annotations=layout.scene?.annotations||[];
  const references=annotations.some(referenceLabel)||traces.some(t=>t.meta?.referenceVertices);
  syncSampleAppearanceControls(references);
  traces=traces.map(t=>{
   if(t.meta?.referenceVertices)return {...t,visible:participant.showVertices,textfont:{...t.textfont,size:participant.vertexLabelSize}};
   if(!t.meta?.sampleView||!t.marker||t.meta.edgeFaceRings||t.meta.enrollmentExploration||t.meta.enrollmentContext)return t;
   const size=Array.isArray(t.marker.size)?t.marker.size.map(n=>n*participant.sampleSize/2):participant.sampleSize;
   return {...t,marker:{...t.marker,size,opacity:participant.sampleOpacity,...(!participant.sampleColors?{color:'#a8adb2'}:{})}};
  });
  if(layout.scene)layout={...layout,scene:{...layout.scene,annotations:annotations.filter(a=>!referenceLabel(a)||participant.showVertices).map(a=>referenceLabel(a)?{...a,font:{...a.font,size:participant.vertexLabelSize}}:a)}};
 }
 return Plotly.react('samples',sampleReferenceSphereTraces(traces,layout),layout,config);
}
function participantVertexAnnotations(){
 if(!participant.showVertices)return [];
 const groups=new Map();
 for(const n of current().nodes){if(n.externalReference)continue;if(!groups.has(n.anchor_row))groups.set(n.anchor_row,[]);groups.get(n.anchor_row).push(n)}
 return [...groups].flatMap(([row,nodes],k)=>nodes.map((n,j)=>{
  const p=DATA.referenceCoords[row];
  return {x:p[0],y:p[1],z:p[2],text:esc(`${n.label} (${fmt(n.maximum)}%)`),name:'participant-reference-vertex:'+n.id,showarrow:false,captureevents:false,
   xanchor:[0,3].includes(k%4)?'right':'left',yanchor:k%2?'top':'bottom',xshift:[0,3].includes(k%4)?-12:12,yshift:(k%2?-1:1)*(12+18*j),
   bgcolor:'rgba(255,255,255,0.85)',font:{family:'Arial, sans-serif',size:participant.vertexLabelSize,color:'#24414c'}};
 }));
}
function participantColorMode(){return participant.colorBy==='merged'&&activeStateMode!=='merged'?'original':participant.colorBy}
function participantColorPair(r){return participantColorMode()==='original'?datasetRegistry.get(META.id).data.samples.pair[r.profile]:DATA.samples.pair[r.index]}
function participantBackgroundPair(r){return participant.matchBackground&&participantColorMode()!=='visit'?participantColorPair(r):DATA.samples.pair[r.index]}
function participantBackgroundSchemeFor(settings,stateMode){
 const colorBy=settings.colorBy??'visit',mode=colorBy==='merged'&&stateMode!=='merged'?'original':colorBy;
 return settings.matchBackground&&mode!=='visit'?mode:stateMode==='merged'?'merged':'original';
}
function participantBackgroundScheme(){return participantBackgroundSchemeFor(participant,activeStateMode)}
function participantBackgroundContext(){return [datasetKey(),activeCohort,el('coverage').value,participantBackgroundScheme()].join('|')}
function highlightParticipantBackground(pair,checked){
 if(!participant.active||!participant.stateBackground)return;
 const context=participantBackgroundContext(),cohort=participantRows()[0].cohort;
 if(pair!==null&&!participantData().records.some(r=>r.cohort===cohort&&participantBackgroundPair(r)===pair))return;
 const camera=pendingSampleCamera||readCamera('samples');
 const pairs=new Set(participantBackgroundHighlight?.context===context?participantBackgroundHighlight.pairs:[]);
 if(pair===null)pairs.clear();
 else if(checked??!pairs.has(pair))pairs.add(pair);else pairs.delete(pair);
 participantBackgroundHighlight=pairs.size?{context,pairs:[...pairs].sort()}:null;
 return refreshSamples(camera);
}
function participantSampleColor(r){const color=participantColorMode()==='visit'?participantVisitColor(r):edgeColor(participantColorPair(r));return typeof samplePaletteColor==='function'?samplePaletteColor(r.index,color,r,r.profile):color}
async function participantSamples(){
 const rows=participantRows();if(!rows.length){participantRestore(null);return samples()}
 const d=participantData(),b=datasetRegistry.get(META.id),union=participant.embeddingMode==='union'&&!(typeof jointEmbeddingActive==='function'&&jointEmbeddingActive()),scope=union?currentSubjectEmbeddingScope():null,embeddingMethod=el('sampleEmbedding').value;
 const camera=copyCamera(pendingSampleCamera||readCamera('samples'));let fit=null,z=b.data.samples.coords;
 el('retrySubjectEmbedding').hidden=true;
 if(!union&&datasetMaxNormalizedAsset()&&maxNormalizedIds.includes(embeddingMethod)){const population=datasetMaxNormalizedPopulationView();z=[];population.profiles.forEach((p,i)=>z[p]=population.coordinates[i])}
 if(union){
  try{
   if(!savedSubjectEmbedding(scope)){
    el('sampleTitle').textContent=samplePanelTitle('Loading subject-state embedding…',rows[0].subject,rows[0].cohort);
    el('sampleStatus').textContent='Preparing a joint 3D view of '+scope.records.length+' records in '+scope.states.length+' occupied states. Existing scientific results remain unchanged.';
    await Plotly.react('samples',[],{annotations:[{text:'Preparing joint embedding…',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false}]},{displayModeBar:false});
   }
   fit=await getSubjectEmbedding(scope);
   if(!participant.active||participant.embeddingMode!=='union'||currentSubjectEmbeddingScope().context!==scope.context||el('sampleEmbedding').value!==embeddingMethod)return;
   z=[];fit.profiles.forEach((p,i)=>z[p]=fit.coords[i]);
  }catch(error){
   if(!participant.active||participant.embeddingMode!=='union'||currentSubjectEmbeddingScope().context!==scope.context||el('sampleEmbedding').value!==embeddingMethod)return;
   el('sampleTitle').textContent=samplePanelTitle('Joint embedding unavailable',rows[0].subject,rows[0].cohort);
   el('sampleStatus').textContent=error.message+' Retry, or select Full reference under Sample appearance.';
   el('retrySubjectEmbedding').hidden=false;
   return Plotly.react('samples',[],{annotations:[{text:'Joint embedding unavailable · see Embedding and reference details',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false}]},{displayModeBar:false});
  }
 }
 const legendOpen=el('sampleLegendItems').querySelector?.('[data-background-legend]')?.open||false;
 if(!participant.stateBackground||participantBackgroundHighlight?.context!==participantBackgroundContext())participantBackgroundHighlight=null;
 const background=union?scope.records:d.records.filter(r=>r.cohort===rows[0].cohort),xyz=rs=>({x:rs.map(r=>z[r.profile][0]),y:rs.map(r=>z[r.profile][1]),z:rs.map(r=>z[r.profile][2])});
 const traces=[{type:'scatter3d',mode:'markers',meta:{participantBackground:true,legendRecords:background.map(r=>r.index)},...xyz(background),marker:{size:participant.backgroundSize,color:participant.stateBackground?background.map(r=>typeof samplePaletteColor==='function'?samplePaletteColor(r.index,edgeColor(participantBackgroundPair(r)),r,r.profile,true):edgeColor(participantBackgroundPair(r))):'#c9d2d7',opacity:participant.backgroundOpacity},hoverinfo:'skip',showlegend:false},
 {type:'scatter3d',mode:participant.showLabels?'markers+text':'markers',meta:{legendRecords:rows.map(r=>r.index)},...xyz(rows),customdata:rows.map(r=>'participant:'+r.index),text:rows.map(r=>!participant.selectedLabelOnly||r.index===participant.record?r.label:''),textposition:'top center',textfont:{size:participant.labelSize},hovertext:rows.map(participantSampleHover),hovertemplate:'%{hovertext}<extra></extra>',marker:{size:rows.map(r=>r.index===participant.record?Math.max(participant.sphereSize*1.6,participant.sphereSize+8):participant.sphereSize),color:rows.map(participantSampleColor),line:{color:'white',width:1}},showlegend:false}];
 const ranges=[0,1,2].map(k=>{const a=(union?fit.coords:z).map(p=>p[k]);return [Math.min(...a),Math.max(...a)]}),span=Math.max(...ranges.map(([a,b])=>b-a));
 for(const s of participant.showLines?participantSegments(rows):[]){
  const p=z[s.from.profile],q=z[s.to.profile],delta=q.map((x,i)=>x-p[i]),length=Math.hypot(...delta);
  traces.push({type:'scatter3d',mode:'lines',meta:{profileSegment:[s.from.index,s.to.index]},x:[p[0],q[0]],y:[p[1],q[1]],z:[p[2],q[2]],line:{color:'#244e5e',width:participant.lineWidth,dash:s.gap?'dash':'solid'},hoverinfo:'text',text:s.from.label+' → '+s.to.label+(s.gap?' (unobserved order positions)':''),showlegend:false});
  if(participant.showArrows&&length>0)traces.push({type:'cone',meta:{profileSegment:[s.from.index,s.to.index]},x:[p[0]+delta[0]*.72],y:[p[1]+delta[1]*.72],z:[p[2]+delta[2]*.72],u:[delta[0]/length],v:[delta[1]/length],w:[delta[2]/length],sizemode:'absolute',sizeref:Math.min(span*.025,length*.15)*participant.arrowScale,anchor:'tip',colorscale:[[0,'#244e5e'],[1,'#244e5e']],showscale:false,hoverinfo:'skip',showlegend:false});
 }
 const highlightPairs=new Set(participantBackgroundHighlight?.pairs||[]);
 const highlighted=highlightPairs.size?background.filter(r=>highlightPairs.has(participantBackgroundPair(r))):[];
 if(highlighted.length)traces.push({type:'scatter3d',mode:'markers',meta:{profileRecords:highlighted.map(r=>r.index)},...xyz(highlighted),name:'Highlighted background state',marker:{symbol:'circle-open',size:participant.backgroundSize+5,color:'#153f50',opacity:1},hoverinfo:'skip',showlegend:false});
 const selectedVisit=rows.find(r=>r.index===participant.record);
 if(selectedVisit)traces.push({type:'scatter3d',mode:'markers',meta:{participantSelectedVisit:true,profileRecords:[selectedVisit.index]},...xyz([selectedVisit]),
  customdata:['participant:'+selectedVisit.index],name:'Selected visit',
  marker:{symbol:'circle-open',size:Math.max(participant.sphereSize*1.6,participant.sphereSize+8)+6,color:'#000000',opacity:1,line:{color:'#000000',width:2}},
  hoverinfo:'skip',showlegend:false});
 updateSampleContext(rows.map(r=>r.index));
 el('sampleTitle').textContent=samplePanelTitle(standardSampleEmbeddingTitle(union?'Subject-state joint 3D MDS':'Population 3D MDS (restricted)'),rows[0].subject,rows[0].cohort);
 el('sampleContext').textContent='';
 el('sampleStatus').textContent=union&&fit.maxNormalizedRevision?`${scope.records.length} cohort records in ${scope.states.length} occupied states; ${fit.distinctCompositions} distinct compositions. ${maxNormalizedMethodLabel()} · ${fit.solver.backend} · ${fit.solver.epochs} epochs. ${fit.solver.backend==='analytic'?'Exact singleton or two-point layout.':'Two tested starts; completing the epoch budget is not a convergence certificate.'} Reference vertices mark observed maxima in these states.`:union&&fit.historical?`${scope.records.length} cohort records in ${scope.states.length} occupied states; ${fit.profiles.length} distinct compositions. Exact population matches an existing saved embedding; its original solver provenance is retained. No refitting or assignment changes.`:union?`${scope.records.length} cohort records in ${scope.states.length} occupied ${activeStateMode==='merged'?'merged groups':'pure states'}; ${fit.distinctCompositions} distinct compositions. Full-composition Euclidean metric MDS · ${fit.solver.backend||'exact'} · ${fit.solver.epochs} epochs. Relative RMS distance error: ${(fit.evaluation.relativeRms*100).toFixed(1)}% (${fit.evaluation.pairs} evaluated pairs). Taxon labels mark observed maxima within these states. Assignments are unchanged; colors and endpoint-placement rules do not determine membership. ${fit.solver.termination}`:'Participant mode uses the saved '+META.title+' reference embedding. Background shows the selected cohort, including records without participant links. Ordinal labels do not measure elapsed time. No coordinates or assignments are recalculated.';
 el('sampleLegend').hidden=false;el('sampleLegendItems').innerHTML=participantColorMode()==='visit'?(d.capabilities?.arbitraryVisits?[...new Map(rows.map(r=>[r.label,participantVisitColor(r)])).entries()]:Object.entries(participantColors)).map(([label,color])=>`<span class="legendItem"><span class="colorSwatch" style="background:${color}"></span>${esc(label)}</span>`).join(''):'';
 if(participantColorMode()!=='visit'){
  const original=participantColorMode()==='original',reference=new Map(displayGraph(b.data.graphs['100'],b.data).edges.map(e=>[e.id,e]));
  const ids=[...new Set(rows.map(participantColorPair))];
  el('sampleLegendItems').innerHTML=`<strong>Participant samples · ${original?'original top-2 CST pairs':'assigned merged groups'}</strong>`+ids.map(id=>`<span class="legendItem"><span class="colorSwatch" style="background:${edgeColor(id)}"></span>${esc(reference.get(id)?.label||pairName(id))}</span>`).join('');
 }
 if(participant.stateBackground){
  const original=participant.matchBackground&&participantColorMode()==='original';
  const ids=[...new Set(background.map(participantBackgroundPair))].filter(id=>id!==null).sort((a,b)=>(edgeOrder.get(a)??Infinity)-(edgeOrder.get(b)??Infinity));
  const displayed=new Map(current().edges.map(e=>[e.id,e])),reference=new Map(displayGraph(b.data.graphs['100'],b.data).edges.map(e=>[e.id,e]));
  el('sampleLegendItems').innerHTML+=`<details data-background-legend${legendOpen||highlighted.length?' open':''}><summary>Background · ${ids.length} ${original?'original top-2 CST pairs':activeStateMode==='merged'?'merged top-2 CST groups':'pure top-2 CSTs'}</summary><small>Check states to ring their background samples; uncheck to remove their rings.</small>${highlighted.length?`<p role="status">${highlighted.length} background records highlighted across ${highlightPairs.size} ${highlightPairs.size===1?'state':'states'}. Participant trajectory remains visible. <button type="button" data-clear-background-highlight>Clear all highlights</button></p>`:''}${ids.map(id=>{const e=original?reference.get(id):displayed.get(id)||reference.get(id);return `<label class="legendItem backgroundStateChoice${highlightPairs.has(id)?' selected':''}"><input type="checkbox" data-background-state="${esc(id)}"${highlightPairs.has(id)?' checked':''}><span class="colorSwatch" style="background:${edgeColor(id)}"></span>${esc(e?.key||id)}: ${esc(e?.label||pairName(id))}${displayed.has(id)?'':' (outside graph coverage)'}</label>`}).join('')}</details>`;
 }
 const stateColors=[];
 if(participantColorMode()!=='visit')stateColors.push(...pairColorEntries(rows.map(participantColorPair),participantColorMode()==='original'));
 if(participant.stateBackground)stateColors.push(...pairColorEntries(background.map(participantBackgroundPair),participant.matchBackground&&participantColorMode()==='original'));
 renderStateColors(stateColors);
 el('endpointChoices').hidden=true;renderParticipantSequence(rows);renderParticipantComposition(rows);syncParticipantControls();
 const axis=k=>({visible:false,range:[ranges[k][0]-span*.03,ranges[k][1]+span*.03],autorange:false});
 return renderSamplePlot(traces,{margin:{l:0,r:0,t:0,b:0},showlegend:false,uirevision:union?'participant-union-'+scope.context:'participant-reference-'+META.revision,scene:{camera,annotations:union?subjectEmbeddingAnnotations(scope,fit):datasetMaxNormalizedAsset()&&maxNormalizedIds.includes(embeddingMethod)?subjectEmbeddingAnnotations({states:[...new Set(background.map(r=>b.data.samples.pair[r.profile]))],profiles:background.map(r=>r.profile)},{coords:background.map(r=>z[r.profile])}):participantVertexAnnotations(),aspectmode:'data',dragmode:'orbit',xaxis:axis(0),yaxis:axis(1),zaxis:axis(2)}},{responsive:true,scrollZoom:true,displaylogo:false,displayModeBar:false});
}
function installControlHelp(){
 const explanations={
  datasetSelect:()=> 'Select the dataset to explore. Dataset-specific cohorts, states and participants update together. Choose Load dataset bundle… at the end of this list to load a prepared JSON file; it is validated before use. '+el('datasetMethods').textContent,
  populationComparison:populationControlHelp,
  cohortSelect:cohortControlHelp,
  stateMode:()=>analysisExtension()?'Checked: assign samples outside the retained pure 2-CSTs to those groups, keeping all samples. Unchecked: show only samples whose original top-two pair belongs to a retained state. At 100% coverage, samples with only one detected taxon still have no pure 2-CST.':'Merged assignments are not available for this dataset; only original pure states can be shown.',
  coverage:()=>el('analysisMessage').textContent+' The percentage selects the reference core or retained pure states; it does not refit sample coordinates.',
  sampleEmbedding:'Global and reference views keep fixed coordinates; Local 3D MDS uses the saved embedding for the selected sample set. Only supported views are available for each dataset.',
  resetPanels:'Restore the default panel proportions and sample/graph information sidebar widths.',
  reset:'Reset graph display positions without changing scientific assignments or sample coordinates.',
  export:'Export the current top-2 CST edge counts as CSV.',
  exportAssignments:'Export the reference core and assigned merged-group membership as CSV. Available in Merged groups mode.',
  participantSelect:'Choose from the list to open Participant mode. Type an ID while the dropdown is focused to jump to it.',
  participantColorBy:'Assigned group colors require Merged groups mode. Background colors can follow this state scheme using the option below.',
  participantStateBackground:'Color background samples using the current pure states or merged groups, independently of participant sample colors. Uncheck for gray samples.',
  participantMatchBackground:'Use the same original-pair or merged-group colors as the participant. When participant colors use visit labels, the background follows the current States mode.',
  participantSphereSize:'Appearance settings are remembered in this browser. The selected visit sphere is 4 px larger.',
  participantLabelSize:'Size of visit labels in the sample plot. Appearance settings are remembered in this browser.',
  participantShowLabels:'Show visit labels beside participant spheres. The Only selected visit option limits labels to the selected observation.',
  participantShowLines:'Show connecting visit lines and their enabled arrowheads. Hiding lines leaves visit spheres and labels visible.',
  participantLineWidth:'Thickness of the lines connecting visits. Available when Show visit-lines is checked; remembered in this browser.',
  participantSelectedLabelOnly:'Label only the observation selected in the trajectory, visit selector or sample plot.',
  participantShowArrows:'Show arrowheads indicating observation order along visible visit lines.',
  participantEmbeddingMode:'Joint 3D fits all cohort samples assigned to any state occupied by this subject, using full compositions and the main Pure/Merged selection. Full reference retains the earlier embedding. Fits stay fixed across visits and are saved separately.',
  participantShowVertices:'Show or hide reference markers and their labels together. Ordinary sample points at the same compositions remain visible.',
  participantVertexLabelSize:'Size of reference taxon labels in the sample plot. Remembered in this browser.',
  participantArrowScale:'100% uses the original arrowhead size, scaled to each visit segment. Remembered in this browser.',
  participantBackgroundSize:'Size of sample points, or background points in Participant mode. Each setting is remembered separately for this dataset.',
  participantBackgroundOpacity:'Opacity of sample points, or background points in Participant mode. 0% hides those points. Reference markers and selected visits are unchanged.'
 };
 for(const [copy,source] of [['panelDatasetSelect','datasetSelect'],['panelCohortSelect','cohortSelect'],['panelStateMode','stateMode'],['panelCoverage','coverage'],['panelSampleEmbedding','sampleEmbedding']])explanations[copy]=explanations[source];
 const popup=el('participantHelpPopover');document.body?.appendChild(popup);let active=null,pinned=false;
 const close=()=>{if(popup.matches(':popover-open'))popup.hidePopover();active?.setAttribute('aria-expanded','false');active=null;pinned=false};
 const open=(trigger,text,pin=false)=>{
  if(active!==trigger){close();active=trigger}
  pinned=pin;popup.textContent=typeof text==='function'?text():text;trigger.setAttribute('aria-expanded','true');
  if(!popup.matches(':popover-open'))popup.showPopover();
  const rect=trigger.getBoundingClientRect(),box=popup.getBoundingClientRect();
  popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-box.width-8))+'px';
  popup.style.top=Math.max(8,rect.bottom+box.height+8<=innerHeight?rect.bottom+6:rect.top-box.height-6)+'px';
 };
 popup.addEventListener('toggle',()=>{if(!popup.matches(':popover-open')){active?.setAttribute('aria-expanded','false');active=null;pinned=false}});
 popup.addEventListener('mouseleave',()=>{if(!pinned)close()});
 for(const [id,text] of Object.entries(explanations)){
  const control=el(id),label=control.labels?.[0];if(!label&&!control.parentNode)continue;
  const trigger=document.createElement(label?'span':'button');trigger.className=label?'participantHelpLabel':'controlHelpButton';trigger.tabIndex=0;trigger.setAttribute('role','button');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',popup.id);
  if(label){
   label.removeAttribute('title');
   const node=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()||n.nodeType===Node.ELEMENT_NODE&&n.tagName==='SPAN');
   if(!node)continue;label.insertBefore(trigger,node);trigger.appendChild(node);
  }else{
   trigger.type='button';trigger.textContent='?';trigger.setAttribute('aria-label','Help: '+control.textContent);trigger.title='Show explanation';
   const row=document.createElement('div');row.className='controlHelpAction';control.parentNode.insertBefore(row,control);row.append(control,trigger);
  }
  trigger.addEventListener('mouseenter',()=>{if(!pinned)open(trigger,text)});
  trigger.addEventListener('mouseleave',event=>{if(!pinned&&!popup.contains(event.relatedTarget))close()});
  trigger.addEventListener('focus',()=>{if(!pinned)open(trigger,text)});
  trigger.addEventListener('blur',()=>{if(!pinned)close()});
  trigger.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(active===trigger&&pinned)close();else open(trigger,text,true)});
  trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();trigger.click()}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}});
 }
 for(const section of document.querySelectorAll?.('.controlSection, #sampleAppearance, .sampleAppearanceGroup')||[])section.addEventListener('toggle',close);
 // A help bubble must not stay behind when the controls move into a maximized view.
 addEventListener('resize',close);
}
const sampleAppearanceSections=[
 ['open','sampleAppearance','vme-sample-appearance-open-v1'],
 ['visits','sampleAppearanceVisits','vme-sample-appearance-visits-open-v1'],
 ['background','sampleAppearanceBackground','vme-sample-appearance-background-open-v1'],
 ['vertices','sampleAppearanceVertices','vme-sample-appearance-vertices-open-v1']
];
function captureSampleAppearanceLayout(){return Object.fromEntries(sampleAppearanceSections.map(([field,id])=>[field,el(id).open]))}
function validateSampleAppearanceLayout(layout){
 if(layout===undefined)return; // Older named views leave the current panel layout intact.
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||sampleAppearanceSections.some(([field])=>typeof layout[field]!=='boolean'))throw Error('Invalid saved sample appearance layout.');
}
function restoreSampleAppearanceLayout(layout){
 validateSampleAppearanceLayout(layout);if(layout===undefined)return;
 for(const [field,id,key] of sampleAppearanceSections){
  el(id).open=layout[field];
  try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(key,String(layout[field]))}catch{}
 }
}
function installParticipants(){
 for(const id of ['sampleReferenceSphereAmbient','sampleReferenceSphereHighlights'])el(id).oninput=()=>updateSphereLighting('sample');
 el('sampleReferenceSpheres').onchange=()=>refreshSamples(pendingSampleCamera||readCamera('samples'));
 el('sampleReferenceScale').oninput=()=>{syncSampleReferenceSizeControl();refreshSamples(pendingSampleCamera||readCamera('samples'))};
 el('sampleReferenceColor').oninput=()=>refreshSamples(pendingSampleCamera||readCamera('samples'));
 el('participantSortTarget').onchange=()=>setParticipantSortTarget(el('participantSortTarget').value);
 el('exportParticipantSwitching').onclick=()=>{
  if(el('exportParticipantSwitching').disabled)return;
  try{
   const rows=participantSwitchExportRows(),csv=rows.map(row=>row.map(participantSwitchCsvCell).join(',')).join('\r\n')+'\r\n';
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
   a.href=url;a.download=`${META.id}_${el('participantCohort').value||'both'}_geometric_switching_all_targets_sorted_q${participantSortTarget()}.csv`.replace(/[^a-zA-Z0-9_.-]/g,'_');
   a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   el('participantSwitchExportStatus').textContent=`Exported ${rows.length-1} participants in current order, all ${participantSwitchTargets().length} targets.`;
  }catch(e){el('participantSwitchExportStatus').textContent='Export failed: '+e.message}
 };

 el('participantEmbeddingMode').onchange=()=>{participant.embeddingMode=el('participantEmbeddingMode').value;saveParticipantAppearance('embeddingMode');participantBackgroundHighlight=null;return refreshSamples(readCamera('samples'))};
 el('retrySubjectEmbedding').onclick=()=>refreshSamples(defaultCamera);
 el('fitSubjectGraph').onclick=()=>{participantGraphFrames[Number(el('dimension').value)]=null;graph(pendingGraphCamera||readCamera('graph3d'))};
 el('participantGraphSmoothing').oninput=()=>{
  const value=Number(el('participantGraphSmoothing').value);if(!Number.isInteger(value)||value<2||value>30)return;
  const camera=pendingGraphCamera||readCamera('graph3d');
  participant.graphSmoothing=value;saveParticipantAppearance('graphSmoothing');graph(camera);
 };

 el('participantGraphBackground').onchange=()=>{const camera=pendingGraphCamera||readCamera('graph3d');participant.graphBackground=el('participantGraphBackground').checked;saveParticipantAppearance('graphBackground');graph(camera)};
 for(const [,id,key] of sampleAppearanceSections){
  const section=el(id);
  try{section.open=(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(key)!=='false'}catch{}
  section.addEventListener('toggle',()=>{try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(key,String(section.open))}catch{}});
 }
 installControlHelp();
 el('sampleLegendItems').addEventListener('click',e=>{
  if(e.target.closest('[data-clear-background-highlight]')){highlightParticipantBackground(null);return}
 });
 el('sampleLegendItems').addEventListener('change',e=>{
  const checkbox=e.target.closest('[data-background-state]');if(checkbox)highlightParticipantBackground(checkbox.dataset.backgroundState,checkbox.checked);
 });
 el('exportParticipantComposition').onclick=()=>{
  if(!participant.active)return;
  const row=participantRows()[0],url=URL.createObjectURL(new Blob([participantCompositionCsv()],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=`${META.id}_${row.cohort}_${row.subject}_${activeStateMode}_${el('coverage').value}_composition.csv`.replace(/[^a-zA-Z0-9_.-]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 el('participantTableSize').oninput=()=>{
  if(!participant.active)return;
  const value=Number(el('participantTableSize').value);if(!Number.isInteger(value)||value<10||value>24)return;
  participant.tableSize=value;saveParticipantAppearance('tableSize');syncParticipantControls();
 };
 el('participantVisitBoxSize').oninput=()=>{
  if(!participant.active)return;
  const value=Number(el('participantVisitBoxSize').value);if(!Number.isInteger(value)||value<10||value>24)return;
  participant.visitBoxSize=value;saveParticipantAppearance('visitBoxSize');syncParticipantControls();renderParticipantSequence(participantRows());
 };
 el('participantMode').onchange=()=>{if(!el('participantMode').checked){leaveParticipant();return}el('participantSelect').focus();refreshParticipantChoices();el('participantMode').checked=participant.active;el('participantMessage').textContent='Choose a participant from the dropdown to open Participant mode.'};
 for(const [id,key] of [['participantSelectedLabelOnly','selectedLabelOnly'],['participantShowLabels','showLabels'],['participantShowLines','showLines'],['participantShowArrows','showArrows'],['participantShowVertices','showVertices']])el(id).onchange=()=>{
  if(!participant.active&&key!=='showVertices')return;
  const camera=pendingSampleCamera||readCamera('samples');participant[key]=el(id).checked;
  saveParticipantAppearance(key);syncParticipantControls();return refreshSamples(camera);
 };
 el('participantColorBy').onchange=()=>{
  const mode=el('participantColorBy').value;if(!participant.active||!['visit','original','merged'].includes(mode)||mode==='merged'&&!(typeof sampleMergedColors==='function'?sampleMergedColors():activeStateMode==='merged'))return;
  const camera=pendingSampleCamera||readCamera('samples');participant.colorBy=mode;saveParticipantAppearance('colorBy');if(typeof recolorSampleView==='function'){el('sampleColorScheme').value={visit:'visits',original:'pure',merged:'default'}[mode];return recolorSampleView()}return refreshSamples(camera);
 };
 el('participantMatchBackground').onchange=()=>{
  if(!participant.active)return;const camera=pendingSampleCamera||readCamera('samples');
  participant.matchBackground=el('participantMatchBackground').checked;saveParticipantAppearance('matchBackground');return refreshSamples(camera);
 };
 el('participantStateBackground').onchange=()=>{const camera=readCamera('samples'),key=participant.active?'stateBackground':'sampleColors';participant[key]=el('participantStateBackground').checked;saveParticipantAppearance(key);return refreshSamples(camera)};
 for(const [id,key,min,max,scale] of [['participantSphereSize','sphereSize',4,40,1],['participantLabelSize','labelSize',8,32,1],['participantVertexLabelSize','vertexLabelSize',8,32,1],['participantBackgroundSize','backgroundSize',1,12,1],['participantLineWidth','lineWidth',1,16,1],['participantArrowScale','arrowScale',25,300,100],['participantBackgroundOpacity','backgroundOpacity',0,100,100]]){
  el(id).oninput=()=>{
   if(!participant.active&&!['vertexLabelSize','backgroundSize','backgroundOpacity'].includes(key))return;
   const value=Number(el(id).value);if(!Number.isFinite(value))return;
   const camera=pendingSampleCamera||readCamera('samples'),setting=!participant.active&&key==='backgroundSize'?'sampleSize':!participant.active&&key==='backgroundOpacity'?'sampleOpacity':key;
   participant[setting]=Math.min(max,Math.max(min,Math.round(value)))/scale;
   saveParticipantAppearance(setting);syncParticipantControls();return participant.active&&key==='backgroundOpacity'?updateParticipantBackgroundOpacity():refreshSamples(camera);
  };
 }
 el('participantCohort').onchange=()=>{el('participantMessage').textContent='';refreshParticipantChoices();if(typeof saveDatasetNavigation==='function')saveDatasetNavigation()};
 el('participantSelect').onchange=()=>browseParticipant(el('participantSelect').value);
 el('previousParticipant').onclick=()=>stepParticipant(-1);el('nextParticipant').onclick=()=>stepParticipant(1);
 for(const id of ['participantSequence','participantComposition'])el(id).onclick=e=>{
  const step=e.target.closest('[data-step-visit]');if(step){
   if(step.disabled)return;
   const focus=document.activeElement===step;
   return stepParticipantVisit(Number(step.dataset.stepVisit)).then(()=>{
    if(focus){const panel=el('participantSequence');(panel.querySelector?.(`[data-step-visit="${step.dataset.stepVisit}"]:not(:disabled)`)||panel.querySelector?.('[data-step-visit]:not(:disabled)'))?.focus({preventScroll:true})}
   });
  }
  const sort=e.target.closest('[data-sort-visit]');if(sort){sortParticipantComposition(Number(sort.dataset.sortVisit));return}
  const taxon=e.target.closest('[data-highlight-taxon]');if(taxon){const j=Number(taxon.dataset.highlightTaxon);participant.taxon=participant.taxon===j?null:j;renderParticipantComposition(participantRows());return}
  const cell=e.target.closest('[data-composition-record]');if(cell){participant.taxon=Number(cell.dataset.taxon);chooseParticipantRecord(Number(cell.dataset.compositionRecord));return}
  const b=e.target.closest('[data-observation]');if(b)chooseParticipantRecord(Number(b.dataset.observation));
 };
 el('participantAxis').onchange=()=>{participant.axis=el('participantAxis').value;syncParticipantControls();renderParticipantSequence(participantRows());renderParticipantComposition(participantRows())};
 el('participantAllTaxa').onchange=()=>{participant.allTaxa=el('participantAllTaxa').checked;participant.taxon=null;renderParticipantComposition(participantRows())};
 el('participantCompositionTab').onclick=()=>{participant.catalogue=false;syncParticipantControls()};
 el('participantCatalogueTab').onclick=()=>{participant.catalogue=true;table();syncParticipantControls()};
 syncParticipantControls();
}

// Subject graph overlays are display-only: use the existing trajectory placement
// and full graph embedding, never refit or rewrite assignments when filtering.
let participantGraphCache=null;
function participantGraphPosition(p,e){
 if(!e||p.missing)return null;
 const g=p.placement?.g||p.g;
 if(!g)return null;
 let u=p.placement?(p.placement.side==='first'?0:1):p.t===null?null:g.d>0?(p.t-g.a)/g.d:.5;
 if(u===null||!Number.isFinite(u))return null;
 u=Math.max(0,Math.min(1,u));
 return e.from===g.ids[0]?u:1-u;
}
function participantEdgeDensity(positions,t,h=(participant.graphSmoothing??10)/100){
 const k=x=>Math.exp(-.5*(x/h)**2)/(h*Math.sqrt(2*Math.PI));
 // Periodic reflected images preserve mass at both ends even at the widest
 // supported bandwidth (0.30). Omitted Gaussian tails are below floating precision.
 return positions.reduce((s,u)=>{for(let j=-2;j<=2;j++)s+=k(t-u+2*j)+k(t+u+2*j);return s},0);
}
function participantGraphModel(){
 if(!participant.active)return null;
 const key=[datasetKey(),activeStateMode,el('coverage').value,participant.key,trajectorySettings.mode,trajectorySettings.rank1,trajectorySettings.pairEndpoints,participant.graphSmoothing??10].join('|');
 if(participantGraphCache?.key===key)return participantGraphCache;
 const rows=participantRows(),model=trajectoryBuild(datasetRegistry.get(META.id),participantData(),rows,trajectorySettings,el('coverage').value,participantTiming(rows));
 const edges=new Map(current().edges.map(e=>[e.id,e])),byEdge=new Map(),points=new Map();
 for(const p of model.points){
  const id=trajectoryGraphPair(p),edge=edges.get(id);
  const u=participantGraphPosition(p,edge);
  points.set(p.r.index,{p,id,u});
  // Collect valid displayed positions; omit edges with no valid position below.
  if(edge){if(!byEdge.has(id))byEdge.set(id,[]);if(u!==null)byEdge.get(id).push(u)}
 }
 for(const [id,positions] of byEdge)if(!positions.length)byEdge.delete(id);
 const density=new Map([...byEdge].map(([id,positions])=>[id,Array.from({length:65},(_,i)=>participantEdgeDensity(positions,i/64)/(rows.length||1))]));
 const peak=Math.max(0,...[...density.values()].flat());
 participantGraphCache={key,byEdge,points,density,peak,total:rows.length,valid:[...points.values()].filter(p=>p.u!==null).length};
 return participantGraphCache;
}
function participantFilteredGraph(g){
 const model=participantGraphModel();if(participant.graphBackground)return g;
 const edges=g.edges.filter(e=>model.byEdge.has(e.id)),ids=new Set(edges.flatMap(e=>[e.from,e.to]));
 return {...g,edges,nodes:g.nodes.filter(n=>ids.has(n.id))};
}
function syncParticipantGraph(){
 el('participantGraphControls').hidden=!participant.active;
 if(!participant.active)return;
 el('participantGraphBackground').checked=!!participant.graphBackground;
 el('fitSubjectGraph').disabled=!!participant.graphBackground||!participantGraphModel().byEdge.size;
 el('participantGraphSmoothing').value=participant.graphSmoothing??10;
 el('participantGraphSmoothingValue').textContent=(participant.graphSmoothing??10)+'%';
 const m=participantGraphModel(),p=m.points.get(participant.record),missing=m.total-m.valid;
 el('participantGraphSummary').textContent=`${m.byEdge.size} subject edges · ${m.valid}/${m.total} visits positioned. Yellow → red: low → high density.`+(missing?` ${missing} not positioned (no retained pair or valid coordinate).`:'')+(p?.u===null?' Selected visit has no position on a retained edge.':'');
}
function participantGraphHover(e){
 const m=participantGraphModel(),positions=m.byEdge.get(e.id);
 return `${esc(e.key)}: ${esc(e.label)}<br>Reference records: ${e.frequency}<br>${positions?positions.length+' positioned subject visits':'Non-subject edge'}${graphLayoutHover(e)}`;
}
function participantDensityColor(value){return `rgb(255,${Math.round(225*(1-Math.max(0,Math.min(1,value))))},0)`}
function participantGraphEnds(a,b,project,gap=12,endGap=gap){
 const pa=project(a),pb=project(b);
 const distance=pa&&pb?Math.hypot(pb.x-pa.x,pb.y-pa.y):Infinity;
 return clippedSegment(a,b,project,Math.min(gap,distance*.2),Math.min(endGap,distance*.2));
}
function participantGraphEdgeTraces(g,lookup,project=null){
 const m=participantGraphModel(),degrees=graphNodeDegrees(g),fade=graphFadeStyle(g),fading=el('graphFadeBySize')?.checked===true;
 return graphEdgeWidthGroups(g,e=>m.byEdge.has(e.id)).map(({active:subject,width,edges})=>{
  const pts=[],ids=[],text=[],colors=[];
  for(const e of edges){
   const a=lookup.get(e.from),b=lookup.get(e.to),ends=project?participantGraphEnds(a,b,project,graphVertexExtent(e.from,degrees,lookup,project)+5,graphVertexExtent(e.to,degrees,lookup,project)+5):[a,b];if(!ends)continue;
   const delta=b.map((v,j)=>v-a[j]),norm=delta.reduce((s,v)=>s+v*v,0),u=p=>norm?p.reduce((s,v,j)=>s+(v-a[j])*delta[j],0)/norm:0;
   const start=u(ends[0]),end=u(ends[1]),steps=subject?65:2;
   for(let i=0;i<steps;i++){
    const t=start+(end-start)*i/(steps-1);pts.push(a.map((v,j)=>v+delta[j]*t));ids.push(e.id);text.push(participantGraphHover(e));
    const density=subject&&m.peak?participantEdgeDensity(m.byEdge.get(e.id),t)/(m.total*m.peak):0;
    colors.push(fading?graphColorOpacity(subject?participantDensityColor(density):'#c3c9cc',fade.edge(e)):density);
   }
   pts.push([null,null,null]);ids.push(null);text.push('');colors.push(fading?'rgba(0,0,0,0)':0);
  }
  return {type:'scatter3d',mode:'lines+markers',meta:{graphEdgeGroup:Number(subject)+':'+width},x:pts.map(p=>p[0]),y:pts.map(p=>p[1]),z:pts.map(p=>p[2]),customdata:ids,text,connectgaps:false,
   line:fading?{color:colors,width}:subject?{color:colors,colorscale:[[0,'#ffe100'],[1,'#ff0000']],cmin:0,cmax:1,width,showscale:false}:{color:'#c3c9cc',width},
   marker:{size:3,color:'rgba(0,0,0,0)'},hovertemplate:'%{text}<extra></extra>'};
 });
}
function participantGraphSelected(lookup){
 const selected=participantGraphModel()?.points.get(participant.record);if(!selected||selected.u===null)return null;
 const e=current().edges.find(e=>e.id===selected.id);if(!e||!degreeFilteredGraph(current()).edges.some(edge=>edge.id===e.id))return null;const a=lookup.get(e.from),b=lookup.get(e.to);if(!a||!b)return null;
 return {xyz:a.map((v,j)=>v+(b[j]-v)*selected.u),text:`${esc(selected.p.r.label)} · ${esc(e.label)}<br>${selected.p.placement?'Categorical endpoint placement':'Position within reference pair interval'}<br>Not whole-sample abundance`,id:e.id};
}
function participantGraphMarker(lookup){
 const p=participantGraphSelected(lookup);if(!p)return [];
 return [{type:'scatter3d',mode:'markers',x:[p.xyz[0]],y:[p.xyz[1]],z:[p.xyz[2]],customdata:[p.id],text:[p.text],marker:{size:10,color:'#ffffff',line:{color:'#000000',width:4}},hovertemplate:'%{text}<extra></extra>',name:'Selected visit'}];
}
function participantGraphScene(lookup){
 // Fixed full-graph bounds prevent zoom/aspect changes when hiding other edges.
 if(!participant.active)return {};
 const points=current().nodes.map(n=>lookup.get(n.id)).filter(Boolean);
 const spans=[0,1,2].map(j=>Math.max(...points.map(p=>p[j]))-Math.min(...points.map(p=>p[j]))||1),largest=Math.max(...spans);
 return {aspectmode:'manual',aspectratio:{x:spans[0]/largest,y:spans[1]/largest,z:spans[2]/largest},...Object.fromEntries(['xaxis','yaxis','zaxis'].map((axis,j)=>{
  const values=points.map(p=>p[j]),lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo||1)*.08;
  return [axis,{visible:false,autorange:false,range:[lo-pad,hi+pad]}];
 }))};
}
function participantGraphSvgScale(){const rect=el('graph').getBoundingClientRect();return transform.k*(Math.min(rect.width/1000,rect.height/740)||1)}
function participantGraphSvg(layer,g){
 const m=participantGraphModel(),scale=participantGraphSvgScale(),degrees=graphNodeDegrees(g),fade=graphFadeStyle(g),maximum=Math.max(0,...current().edges.map(e=>e.frequency));
 for(const e of g.edges){
  const a=coords[e.from],b=coords[e.to],ends=participantGraphEnds(a,b,p=>({x:p[0]*scale,y:p[1]*scale}),graphNodeSize(degrees.get(e.from),2)+3,graphNodeSize(degrees.get(e.to),2)+3);if(!ends)continue;
  const positions=m.byEdge.get(e.id),steps=positions?64:1;
  for(let i=0;i<steps;i++){
   const at=t=>ends[0].map((v,j)=>v+(ends[1][j]-v)*t),from=at(i/steps),to=at((i+1)/steps);
   const mid=at((i+.5)/steps),delta=b.map((v,j)=>v-a[j]),norm=delta.reduce((s,v)=>s+v*v,0),t=norm?mid.reduce((s,v,j)=>s+(v-a[j])*delta[j],0)/norm:0;
   const line=node('line',{x1:from[0],y1:from[1],x2:to[0],y2:to[1],stroke:positions?participantDensityColor(m.peak?participantEdgeDensity(positions,t)/(m.total*m.peak):0):'#c3c9cc','stroke-opacity':fade.edge(e),'stroke-width':graphEdgeWidth(e,!!positions,current(),maximum)/scale,class:'edge','data-edge':e.id},layer);
   node('title',{},line,participantGraphHover(e).replaceAll('<br>','\n'));
  }
 }
 const p=participantGraphSelected(new Map(Object.entries(coords).map(([id,xy])=>[Number(id),xy])));
 if(p){const circle=node('circle',{cx:p.xyz[0],cy:p.xyz[1],r:9/scale,fill:'#ffffff',stroke:'#000000','stroke-width':3/scale},layer);node('title',{},circle,p.text.replaceAll('<br>','\n'))}
}

const participantGraphFrames={2:null,3:null};
function subjectGraphFrameKey(dimension,lookup){
 if(!participant.active||participant.graphBackground)return null;
 const g=participantFilteredGraph(current());if(!g.edges.length)return null;
 // Use fitted coordinates, not dragged SVG coordinates, for invalidation.
 const reference=dimension===3?lookup:graphLayoutMode==='reference'?new Map(current().nodes.map(n=>[n.id,[n.x,n.y]])):graphLayoutResult(2).lookup;
 return JSON.stringify([datasetKey(),participant.key,g.edges.map(e=>e.id),g.nodes.map(n=>reference.get(n.id))]);
}
function fitSubjectGraph2d(){
 const key=subjectGraphFrameKey(2);if(key===participantGraphFrames[2])return;
 participantGraphFrames[2]=key;if(!key)return;
 const points=participantFilteredGraph(current()).nodes.map(n=>coords[n.id]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
 const rect=el('graph').getBoundingClientRect(),scale=Math.min(rect.width/1000,rect.height/740)||1;
 const labelWidth=el('vertexLabels').checked?Math.max(0,...participantFilteredGraph(current()).nodes.map(n=>graphNodeLabel(n).length))*graphLabelFont.size*.6:0;
 const width=Math.max(100,1000-(labelWidth+32)/scale),height=Math.max(100,740-2*(graphLabelFont.size+24)/scale);
 const k=Math.min(50,width/Math.max(1,hi[0]-lo[0]),height/Math.max(1,hi[1]-lo[1]));
 transform={x:500-k*(lo[0]+hi[0])/2,y:370-k*(lo[1]+hi[1])/2,k};
}
async function maybeFitSubjectGraph3d(geometry=graphGeometry()){
 const key=subjectGraphFrameKey(3,geometry.lookup);if(key===participantGraphFrames[3])return;
 if(!key){participantGraphFrames[3]=null;return}
 if(await fitSubjectGraph3d(geometry.lookup,geometry.g.nodes)){participantGraphFrames[3]=key;return true}
}
function preserveSubjectGraphFrame(){
 const dimension=Number(el('dimension').value);
 participantGraphFrames[dimension]=subjectGraphFrameKey(dimension,dimension===3?graphLayoutCoordinates():null);
}
