function familyEmbeddingTitle(view,anchor){
 const geometry={
  abundance_euclidean:'Sum-normalized Euclidean',
  'abundance Euclidean':'Sum-normalized Euclidean',
  hellinger:'Sum-normalized Hellinger',
  jensen_shannon:'Sum-normalized Jensen–Shannon',
  ratio_euclidean:anchor+'-normalized Euclidean',
  sqrt_ratio_euclidean:'Square-root '+anchor+'-normalized Euclidean'
 }[view.metric]||'Normalization/metric unspecified';
 const construction=view.construction==='Complete Fermat'?'Fermat p='+view.power+' · 3D MDS'
  :view.construction==='Symmetric kNN + MST'?'kNN + MST shortest paths · 3D MDS'
  :view.construction==='PCA projection'?'3D PCA'
  :view.construction==='direct Euclidean targets'?'3D MDS':view.construction;
 return geometry+' · '+construction;
}
// Generic, versioned embedding collections share MiCOVE's dataset selector and Plotly runtime.
// They do not masquerade as rank-2 bundles or invent state/participant capabilities.
const embeddingFamilyRegistry=new Map((BUNDLE_PACK.embeddingFamilies||[]).map(f=>[f.id,f]));
let activeEmbeddingFamily=null,familySelection=null,familyRenderQueue=Promise.resolve(),familyRenderVersion=0;
let familyLabelTargets=[],familyCancelLabelDrag=()=>{};
let familyGraphReady=false;
const familyPreferenceKey='vme-embedding-family-selection-v1',familyViewsKey='vme-embedding-family-views-v1';
const familyColorModes=['abundance','dominance2','merged2','rank3','valencia2-cst','valencia2-subtype'],familyCoverages=['60','70','80','90'];
// Exact Viridis stops from the bundled Plotly runtime, shared by markers and legend.
const familyAbundanceColorscale=['#440154','#48186a','#472d7b','#424086','#3b528b','#33638d','#2c728e','#26828e','#21918c','#1fa088','#28ae80','#3fbc73','#5ec962','#84d44b','#addc30','#d8e219','#fde725'].map((color,i)=>[Math.min(i*16,255)/255,color]);
function familyAbundanceGradient(){return 'linear-gradient(to right, '+familyAbundanceColorscale.map(([value,color])=>color+' '+(100*value)+'%').join(', ')+')'}
const familyReferenceCache=new WeakMap();
function familyColorReference(collection,mode='merged2'){
 if(mode.startsWith('valencia2-'))return familyValenciaReference(collection);
 const b=datasetRegistry.get(collection),a=b?.cohortAnalysis;
 if(!a?.records||!a.merged)throw Error('Reviewed state-color references are unavailable');
 const reference={policy:'full-reference-records-v1',revision:[b.dataset.revision,a.revision,a.displayRevision||''].join('|')};
 if(mode==='dominance2'){
  const full=BUNDLE_PACK.neighborhoodCompositions?.[collection];
  if(!full?.revision||full.datasetRevision!==b.dataset.revision)throw Error('Full neighborhood compositions are unavailable or stale');
  reference.policy='merged-pair-strict-dominance-v1';reference.revision+='|'+full.revision;
 }
 return reference;
}
function familyDominance(bundle,profile,pair){
 const full=BUNDLE_PACK.neighborhoodCompositions?.[bundle.dataset.id],row=full?.compositions[profile];
 if(!row||full.profileIds[profile]!==bundle.data.samples.ids[profile])throw Error('Full composition identity is unavailable');
 const singleton=BUNDLE_PACK.combDisplay?.baseRevision===bundle.dataset.revision?BUNDLE_PACK.combDisplay.rank1?.[pair]:null;
 if(singleton)return {state:pair+'|singleton',winner:null,singleton:true};
 const taxa=pair.split(',').map(Number);
 if(taxa.length!==2||taxa[0]===taxa[1]||taxa.some(j=>!Number.isInteger(j)||j<1||!bundle.data.featureNames[j]||full.features[j-1]!==bundle.data.featureNames[j]))throw Error('Dominance pair feature identity differs');
 const values=taxa.map(j=>row.find(v=>v[0]===j-1)?.[1]??0);
 if(values.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Invalid dominance abundance');
 const side=values[0]>values[1]?0:values[1]>values[0]?1:null,winner=side===null?null:taxa[side];
 return {state:pair+(winner===null?'|tie':'|dominant:'+winner),winner,side,taxa,values,singleton:false};
}
function familyDominanceColor(parent,side){
 if(side===null)return '#a7b2b7';
 // Related dark/light shades preserve the parent group's hue and custom palette.
 const rgb=parent.slice(1).match(/../g).map(v=>parseInt(v,16));
 return '#'+rgb.map(v=>Math.round(side===0?v*.72:v*.62+255*.38).toString(16).padStart(2,'0')).join('');
}
function familyReferenceStates(bundle){
 if(familyReferenceCache.has(bundle))return familyReferenceCache.get(bundle);
 const base=rank3Base(bundle),records=bundle.cohortAnalysis.records,counts=new Map();
 for(const r of records){const id=base.membership[r.profile];if(id)counts.set(id,(counts.get(id)||0)+1)}
 const rows=base.rows.map(r=>({...r,basisCount:counts.get(r.id)||0,percent:100*(counts.get(r.id)||0)/records.length}));
 const result={base,rows,N:records.length};familyReferenceCache.set(bundle,result);return result;
}
// Reuse the UMB HMP assignment, coverage-tie and palette conventions. Never fit,
// reassign profiles, or change the plotted neighborhood when changing colors.
function familyColorModel(hood,selection){
 const mode=selection.colorMode||'abundance',coverage=selection.colorCoverage||'60';
 if(!familyColorModes.includes(mode)||!familyCoverages.includes(coverage))throw Error('Invalid neighborhood color settings');
 if(mode==='abundance')return {mode,coverage,colors:hood.abundance.map(v=>100*v),states:hood.profileIds.map(()=>null),labels:hood.profileIds.map(()=>''),legend:[],note:'Reference-taxon abundance, fixed 0–100% scale.',reference:null};
 if(mode.startsWith('valencia2-'))return familyValenciaModel(hood,mode);
 const bundle=datasetRegistry.get(hood.collection),b=bundle.data,a=bundle.cohortAnalysis,reference=familyColorReference(hood.collection,mode);
 let states,labels,colors,legendKeys,note;
 if(mode==='merged2'||mode==='dominance2'){
  const m=a.merged[coverage];if(!m||m.pairs.length!==b.samples.ids.length)throw Error('Merged color assignments are incomplete');
  const edges=new Map(displayGraph(b.graphs['100'],b).edges.map(e=>[e.id,e]));
  const order=new Map(b.graphs['100'].edges.map((e,i)=>[e.id,i]));let custom={};
  try{let stored=localStorage.getItem('rank2-edge-colors:'+hood.collection+'@'+bundle.dataset.revision);if(stored===null&&hood.collection==='comb-V3V4-tx')stored=localStorage.getItem('rank2-edge-colors');custom=JSON.parse(stored||'{}')||{}}catch{}
  states=hood.profileIndices.map(p=>m.pairs[p]);
  if(states.some(id=>!m.cores.includes(id)))throw Error('Neighborhood has an unknown merged-group assignment');
  labels=states.map(id=>{
   const singleton=BUNDLE_PACK.combDisplay?.baseRevision===bundle.dataset.revision?BUNDLE_PACK.combDisplay.rank1?.[id]:null;
   const label=singleton?'Single-taxon compatibility group · '+taxonDisplayLabel(b.featureNames[singleton]):edges.get(id)?.label||id.split(',').map(j=>taxonDisplayLabel(b.featureNames[j])).join(' + ');
   return 'G'+(m.cores.indexOf(id)+1)+': '+label;
  });
  colors=states.map(id=>edgeColor(id,custom,order));legendKeys=states;
  note=`Merged top-2 CST groups · Largest 2-CSTs coverage: ${coverage}% (${Number(m.referenceCoreCoverage).toFixed(2)}% achieved). Frozen assignments cover all ${a.records.length.toLocaleString()} source records; core names need not be the leading taxa of absorbed samples. All neighborhood compositions remain plotted.`;
  if(mode==='dominance2'){
   const parents=states,split=parents.map((id,i)=>familyDominance(bundle,hood.profileIndices[i],id));
   states=split.map(d=>d.state);legendKeys=states;
   labels=split.map((d,i)=>{
    if(d.singleton)return labels[i]+' — unsplit (one taxon)';
    const names=d.taxa.map(j=>taxonDisplayLabel(b.featureNames[j]));
    return 'G'+(m.cores.indexOf(parents[i])+1)+': '+(d.side===null?names.join(' = ')+' — equal-abundance boundary':names[d.side]+' > '+names[1-d.side]);
   });
   colors=split.map((d,i)=>d.singleton?colors[i]:familyDominanceColor(colors[i],d.side));
   note=`Assigned-pair abundance order within merged top-2 CST groups · Largest 2-CSTs coverage: ${coverage}% (${Number(m.referenceCoreCoverage).toFixed(2)}% achieved). Compare the two assigned core taxa using full-precision whole-sample abundances, not the sample's own leading pair. Dark/light shades distinguish the two dominance regions. Exact equality (including both absent) is a gray boundary, not a third dominance state. One-taxon compatibility groups remain unsplit. All neighborhood compositions remain plotted.`;
  }
 }else{
  const {base,rows,N}=familyReferenceStates(bundle),retained=rank3Retained(rows,N,'coverage',Number(coverage)),keep=new Set(retained.map(r=>r.id));
  states=hood.profileIndices.map(p=>base.membership[p]);
  labels=states.map(id=>id?base.byId.get(id).key+': '+base.byId.get(id).label+(keep.has(id)?'':' — outside retained coverage'):'Fewer than three positive taxa');
  colors=states.map(id=>!id?'#a7b2b7':keep.has(id)?rank3Color(id,hood.collection):'#d5dce0');
  legendKeys=states.map(id=>!id?'unclassified':keep.has(id)?id:'outside');
  const achieved=100*retained.reduce((s,r)=>s+r.basisCount,0)/N;
  note=`Original top-3 CST triples (not merged) · ${coverage}% coverage target across all ${N.toLocaleString()} source records of ${hood.collection}; ${achieved.toFixed(2)}% retained, including all frequency ties at the boundary. Other triples are light gray; fewer than three positive taxa are gray. All neighborhood compositions remain plotted.`;
 }
 const counts=new Map();legendKeys.forEach((id,i)=>{if(!counts.has(id))counts.set(id,{id,label:id==='outside'?'Other top-3 CSTs (outside coverage)':labels[i],color:colors[i],n:0});counts.get(id).n++});
 return {mode,coverage,colors,states,labels,legendKeys,legend:[...counts.values()].sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id)),note,reference};
}
function familyContext(selection=familySelection,family=activeEmbeddingFamily){
 if(!family||!selection)throw Error('No embedding collection selected');
 const hood=family.neighborhoods.find(h=>h.anchor===selection.anchor&&h.collection===selection.collection&&h.size===Number(selection.size));
 const view=hood?.views.find(v=>v.id===selection.view);
 if(!hood||!view)throw Error('Neighborhood or embedding is unavailable in this release');
 return {family,hood,view,key:family.revision+'|'+hood.key+'|'+view.id};
}
// Join by frozen profile identity, never by record index or 3D proximity.
function familyGraphMembership(hood,state){
 const bundle=datasetRegistry.get(hood.collection),pairs=state.mode==='merged'?bundle.cohortAnalysis.merged[state.coverage].pairs:bundle.data.samples.pair;
 const triples=rank3Base(bundle).membership,hidden=new Set(state.hiddenEdges||[]),faces=state.faces===null?null:new Set(state.faces),rings=new Set(state.rings||[]);
 const active=faces!==null||state.edge!==null||state.vertex!==null;
 const mask=hood.profileIndices.map(p=>faces!==null?faces.has(triples[p]):state.vertex!==null?state.incident.includes(pairs[p])&&!hidden.has(pairs[p]):state.edge!==null?pairs[p]===state.edge:true);
 const ring=hood.profileIndices.map((p,i)=>mask[i]&&pairs[p]===state.edge&&rings.has(triples[p]));
 return {active,mask,ring,triples:hood.profileIndices.map(p=>triples[p]),pairs:hood.profileIndices.map(p=>pairs[p]),count:mask.filter(Boolean).length};
}
function familySessionContext(){return [activeEmbeddingFamily.id,activeEmbeddingFamily.revision,familySelection.collection,datasetRegistry.get(familySelection.collection).dataset.revision,activeStateMode,el('coverage').value]}
function readFamilySession(){try{return JSON.parse(localStorage.getItem('micove-neighborhood-session-v1:'+activeEmbeddingFamily.id))}catch{return null}}
function saveFamilySession(){
 if(!familyGraphReady||!activeEmbeddingFamily||typeof selectionSnapshot!=='function'||typeof datasetPanelRestoring!=='undefined'&&datasetPanelRestoring)return;
 try{localStorage.setItem('micove-neighborhood-session-v1:'+activeEmbeddingFamily.id,JSON.stringify({context:familySessionContext(),selection:selectionSnapshot()}))}catch{}
}
function validFamilySession(saved){
 if(!saved||JSON.stringify(saved.context)!==JSON.stringify(familySessionContext()))return false;
 const s=saved.selection,g=current();
 if(!s||s.participant?.active||s.selected!==null&&!g.edges.some(e=>e.id===s.selected)||s.selectedVertex!==null&&!g.nodes.some(n=>n.id===s.selectedVertex)||s.selected!==null&&s.selectedVertex!==null||!Array.isArray(s.hiddenEdges)||s.hiddenEdges.some(id=>!g.edges.some(e=>e.id===id)))return false;
 try{validateRank3View(s.rank3,datasetRegistry.get(META.id));validateEdgeFacesView(s,datasetRegistry.get(META.id),DATA)}catch{return false}
 return true;
}
async function restoreFamilySession(saved){
 if(!validFamilySession(saved))return;
 const context=JSON.stringify(familySessionContext());
 // The shared selection inspector also reads the reference's saved local fit.
 await ensureNamedViewAssets({dataset:META.id,populationComparison:activeSensitivityMode,cohort:activeCohort,stateMode:activeStateMode,coverage:el('coverage').value,selection:saved.selection});
 if(!activeEmbeddingFamily||context!==JSON.stringify(familySessionContext()))return;
 await restoreSelection(saved.selection);
}
function familyGraphState(){
 return {mode:activeStateMode,coverage:el('coverage').value,edge:selected,vertex:selectedVertex,hiddenEdges:[...hiddenEdges],incident:selectedVertex===null?[]:incidentEdges().map(e=>e.id),
  faces:rank3UsesSamples()?(rank3View().active?rank3View().selected:rank3View().rows).map(r=>r.id):null,rings:edgeFacesActive()?edgeFaces.checked:[]};
}
function familyInspectSelection(){
 selectionControls();
 const {hood}=familyContext(),linked=familyGraphMembership(hood,familyGraphState()),g=current();
 let details='';el('edgeSelect').value=selected||'';
 if(rank3UsesSamples()){
  const v=rank3View(),rows=v.active?v.selected:v.rows;
  details=`<p>${rows.length} original top-3 CSTs · ${fmt(rows.reduce((n,r)=>n+r.frequency,0))} reference ${esc(META.observationLabel)}.</p>`+rows.map(r=>`<div>${esc(r.key+': '+r.label)} · ${fmt(r.frequency)}</div>`).join('');
 }else if(selectedVertex!==null){
  const v=g.nodes.find(n=>n.id===selectedVertex),edges=incidentEdges();
  details=`<p>Selected reference vertex: ${esc(v.label)} · full-reference maximum ${fmt(v.maximum)}%.<br>${edges.length} incident states; ${visibleIncidentEdges().length} enabled.</p>${incidentTable(edges)}<p>Size and PCA summaries above describe the full reference states, not this neighborhood. Unchecking a state removes it from the highlighted union without refitting.</p>`;
 }else if(selected!==null){
  const e=g.edges.find(e=>e.id===selected),nodes=new Map(g.nodes.map(n=>[n.id,n]));
  details=`<p>${esc(e.key+': '+e.label)}<br>${fmt(e.frequency)} reference ${esc(META.observationLabel)} · ${fmt(100*e.frequency/populationSize())}% of reference population.<br>Euclidean endpoint distance: ${fmt(e.length)} percentage points (not drawn length).</p>`+[e.from,e.to].map(j=>{const n=nodes.get(j);return `<div>${esc(n.label)}: reference maximum ${fmt(n.maximum)}% · ${esc(n.anchor_id)}</div>`}).join('');
 }else details=`<p>No vertex or state selected. The reference graph has ${g.nodes.length} vertices and ${g.edges.length} edges. All neighborhood compositions remain visible.</p>`;
 el('inspector').innerHTML=`<p><strong>${linked.active?'Matching':'All'} neighborhood compositions: ${fmt(linked.count)} / ${fmt(hood.size)}</strong><br>Fixed ${esc(hood.anchor)} neighborhood in ${esc(hood.collection)}; no local refit. Background visibility changes only the display.</p>${details}`;
}
async function prepareFamilyGraph(){
 if(familyGraphReady&&typeof saveDatasetPanelSettings==='function')saveDatasetPanelSettings();
 const revision=++datasetSwitchRevision;familyGraphReady=false;
 await Promise.all([queue,graphQueue,familyRenderQueue]);
 if(revision!==datasetSwitchRevision||!activeEmbeddingFamily)return;
 const bundle=datasetRegistry.get(familySelection.collection),q=familySelection.graphCoverage||familySelection.colorCoverage,mode=familySelection.graphMode||'merged';
 const view=unmodifiedProfileView(bundle,'all',mode)?{data:bundle.data,meta:bundle.dataset}:materializeAnalysis(bundle,'all',mode,q);
 DATA=view.data;META=view.meta;activeCohort='all';activeStateMode=mode;
 resetDatasetSelection();rank3.enabled=false;rank3.background=familySelection.graphBackground;familyGraphReady=true;
 datasetPresentation(q);historyCoverage=q;
 if(typeof restoreDatasetPanelSettings==='function')restoreDatasetPanelSettings();
 rank3.enabled=false;rank3.background=familySelection.graphBackground;
 pendingGraphCamera=copyCamera(defaultCamera);syncFamilySelectors();draw();
 await Promise.all([graphQueue,familyRenderQueue]);
}
function familyVertexReference(collection,scope='neighborhood'){
 const r=familyColorReference(collection,scope==='neighborhood'?'dominance2':'merged2');
 return {...r,policy:'observed-2-udcst-vertices-'+scope+'-v1'};
}
function familyVertexModel(hood,selection){
 const coverage=selection.colorCoverage||'60',scope=selection.vertexScope||'neighborhood';
 if(!familyCoverages.includes(coverage)||!['neighborhood','collection'].includes(scope))throw Error('Invalid reference vertex settings');
 const bundle=datasetRegistry.get(hood.collection),b=bundle.data,m=bundle.cohortAnalysis.merged[coverage];
 const reference=familyVertexReference(hood.collection,scope),rank1=BUNDLE_PACK.combDisplay?.baseRevision===bundle.dataset.revision?BUNDLE_PACK.combDisplay.rank1||{}:{};
 const features=[...new Set(m.cores.flatMap(id=>rank1[id]?[Number(rank1[id])]:id.split(',').map(Number)))].sort((a,b)=>a-b);
 const positions=new Map(hood.profileIndices.map((p,i)=>[p,i])),nodes=new Map(b.graphs['100'].nodes.map(n=>[n.id,n]));
 const best=new Map(),full=BUNDLE_PACK.neighborhoodCompositions?.[hood.collection];
 if(scope==='neighborhood'){
  const wanted=new Set(features);
  for(const [p,i] of positions){
   const row=full.compositions[p];if(!row||full.profileIds[p]!==hood.profileIds[i]||b.samples.ids[p]!==hood.profileIds[i])throw Error('Reference vertex composition identity differs');
   for(const [j,value] of row){const feature=j+1;if(!wanted.has(feature))continue;
    if(full.features[j]!==b.featureNames[feature]||!Number.isFinite(value)||value<=0)throw Error('Invalid reference vertex abundance');
    const old=best.get(feature);
    if(!old||value>old.value)best.set(feature,{index:i,profile:p,value,ties:1});
    else if(value===old.value){old.ties++;if(p<old.profile){old.profile=p;old.index=i}}
   }
  }
 }
 const vertices=[],omitted=[];
 for(const feature of features){
  const n=nodes.get(feature);if(!n)throw Error('Unknown reference vertex');
  let anchor=best.get(feature);
  if(scope==='collection'){
   const p=n.anchor_row;
   if(b.samples.ids[p]!==n.anchor_id)throw Error('Collection reference vertex identity differs');
   const i=positions.get(p);anchor=i===undefined?null:{index:i,profile:p,value:n.maximum/100,ties:n.maximum_ties};
  }
  if(!anchor){omitted.push(feature);continue}
  vertices.push({feature,index:anchor.index,profileId:hood.profileIds[anchor.index],label:taxonDisplayLabel(b.featureNames[feature]),maximum:anchor.value*100,ties:anchor.ties});
 }
 const note=`${vertices.length} of ${features.length} reference taxa labeled at Largest 2-CSTs coverage: ${coverage}%. `+(scope==='neighborhood'?`Observed maxima within this neighborhood, not full-collection maxima; ${omitted.length} taxa absent. Exact ties use frozen collection row order.`:`Full-collection reference samples; ${omitted.length} lie outside this neighborhood and are not projected.`)+' Labels show maximum whole-sample abundance. Coordinates and membership are unchanged.';
 return {scope,coverage,vertices,omitted,note,reference};
}
function familyLabelOffsetKey(key,scope,feature,profileId){return JSON.stringify([key,scope,feature,profileId])}
function familyViewLabelOffsets(selection,key){return Object.fromEntries(Object.entries(selection.vertexLabelOffsets||{}).filter(([id])=>{const k=JSON.parse(id);return k[0]===key&&k[1]===selection.vertexScope}))}
function familyLabelOffsets(value,family){
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>5000)throw Error('Invalid saved label offsets');
 const contexts=new Map(family.neighborhoods.flatMap(h=>h.views.map(v=>[family.revision+'|'+h.key+'|'+v.id,h]))),result={};
 for(const [key,xy] of Object.entries(value)){
  let k;try{k=JSON.parse(key)}catch{throw Error('Invalid saved label offset identity')}
  const hood=Array.isArray(k)&&k.length===4?contexts.get(k[0]):null;
  if(!hood||!['neighborhood','collection'].includes(k[1])||!Number.isInteger(k[2])||k[2]<1||!hood.profileIds.includes(k[3])||!Array.isArray(xy)||xy.length!==2||xy.some(x=>!Number.isFinite(x)||Math.abs(x)>5000))throw Error('Invalid saved label offset');
  result[key]=[...xy];
 }
 return result;
}
function familyShiftLabel(annotation,offset=[0,0]){return {...annotation,xshift:annotation.xshift+offset[0],yshift:annotation.yshift+offset[1]}}
function familyVertexOverlay(model,xyz,size,key,offsets={}){
 const groups=new Map();for(const v of model.vertices){if(!groups.has(v.index))groups.set(v.index,[]);groups.get(v.index).push(v)}
 const anchors=[...groups],labelKeys=[],annotations=anchors.flatMap(([i,vertices],k)=>vertices.map((v,j)=>{
 const offsetKey=familyLabelOffsetKey(key,model.scope,v.feature,v.profileId);labelKeys.push(offsetKey);
 return familyShiftLabel({
  x:xyz[0][i],y:xyz[1][i],z:xyz[2][i],text:esc(v.label+' ('+Number(v.maximum.toPrecision(4))+'%)'),name:'family-reference-vertex:'+v.feature,
  showarrow:false,captureevents:false,xanchor:[0,3].includes(k%4)?'right':'left',yanchor:k%2?'top':'bottom',xshift:[0,3].includes(k%4)?-12:12,yshift:(k%2?-1:1)*(12+(size+6)*j),
  bgcolor:'rgba(255,255,255,0.85)',font:{family:'Arial, sans-serif',size,color:'#24414c'}
 },offsets[offsetKey]);}));
 const trace={type:'scatter3d',mode:'markers',x:anchors.map(([i])=>xyz[0][i]),y:anchors.map(([i])=>xyz[1][i]),z:anchors.map(([i])=>xyz[2][i]),
  customdata:anchors.map(([i])=>i),meta:{familyKey:key,familyReference:true,referenceVertices:true},marker:{size:8,symbol:'diamond',color:'#24414c',line:{color:'#ffffff',width:1}},showlegend:false,
  text:anchors.map(([,vs])=>esc(vs[0].profileId)+'<br>'+vs.map(v=>esc(v.label)+': '+v.maximum+'% ('+v.ties+' maximizing composition(s))').join('<br>')+'<br>'+esc(model.scope==='neighborhood'?'Observed neighborhood maximum':'Observed full-collection maximum')),
  hovertemplate:'%{text}<extra></extra>'};
 return {annotations,trace,labelKeys};
}
// Plotly can report a stale closest point after replacing diamond traces with
// several meshes. Resolve reference hits from their rendered screen positions.
function familyReferenceAtPointer(plot,pointer,key,project=point=>graphScreenPoint(point,plot)){
 if(!pointer)return null;
 const hits=[];
 for(const trace of plot.data||[]){
  if(!trace.meta?.familyReference||trace.meta.familyKey!==key)continue;
  const mesh=trace.meta.referenceSphere;
  for(let n=0;n<(mesh?1:trace.x.length);n++){
   const center=['x','y','z'].map(axis=>mesh?(Math.min(...trace[axis])+Math.max(...trace[axis]))/2:trace[axis][n]),screen=project(center);
   if(!screen)continue;
   let radius=Array.isArray(trace.marker?.size)?trace.marker.size[n]:trace.marker?.size||8;
   if(mesh){
    const r=(Math.max(...trace.x)-Math.min(...trace.x))/2,offsets=[0,1,2].map(j=>project(center.map((v,k)=>v+(j===k?r:0))));
    if(offsets.some(v=>!v))continue;
    radius=Math.sqrt(offsets.reduce((sum,v)=>sum+(v.x-screen.x)**2+(v.y-screen.y)**2,0)/2);
   }
   const distance=Math.hypot(pointer.x-screen.x,pointer.y-screen.y);
   if(distance<=radius+3)hits.push({distance,z:screen.z,point:{data:trace,customdata:trace.customdata[n],text:trace.text?.[n]}});
  }
 }
 hits.sort((a,b)=>a.z-b.z||a.distance-b.distance);return hits[0]?.point||null;
}
function installFamilyPicking(plot,selectPoint,state=()=>activeEmbeddingFamily?{key:familyContext().key,version:familyRenderVersion}:null){
 let press=null,token=0;
 plot.on('plotly_click',event=>{if(press&&!press.moved&&!press.pick)press.pick=event.points?.[0]});
 plot.addEventListener('pointerdown',event=>{
  ++token;const context=state();
  press=context&&event.button===0&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey?{...context,x:event.clientX,y:event.clientY,pointerId:event.pointerId,token,moved:false,pick:null}:null;
 },true);
 plot.addEventListener('pointermove',event=>{if(press&&event.pointerId===press.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>=5)press.moved=true},true);
 plot.addEventListener('pointerup',event=>{
  if(!press||event.pointerId!==press.pointerId)return;const click=press;press=null;
  if(click.moved||Math.hypot(event.clientX-click.x,event.clientY-click.y)>=5)return;
  const point=familyReferenceAtPointer(plot,{x:event.clientX,y:event.clientY},click.key)||click.pick;
  setTimeout(()=>{const current=state();if(point&&click.token===token&&current?.key===click.key&&current.version===click.version)selectPoint(point)},0);
 },true);
 const cancel=()=>{press=null;++token};plot.addEventListener('pointercancel',cancel,true);plot.addEventListener('pointerleave',cancel,true);
}
function installFamilyLabelDragging(report){
 const plot=el('familyPlot');let drag=null;
 const hit=(x,y)=>{
  if(!activeEmbeddingFamily||!familySelection.showVertices)return null;
  for(const node of [...plot.querySelectorAll('.annotation-scene')].reverse()){
   const index=Number(node.getAttribute('data-index')),key=familyLabelTargets[index],box=node.querySelector('.annotation-text')?.getBoundingClientRect();
   if(key&&box?.width&&box.height&&x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom)return {node,index,key};
  }
  return null;
 };
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation()};
 const reset=()=>{
  if(!drag)return;const d=drag;drag=null;
  if(d.transform===null)d.node.removeAttribute('transform');else d.node.setAttribute('transform',d.transform);
  plot.style.cursor='';if(plot.hasPointerCapture(d.pointer))plot.releasePointerCapture(d.pointer);
 };
 familyCancelLabelDrag=reset;
 plot.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.isPrimary===false)return;
  const target=hit(e.clientX,e.clientY);if(!target)return;
  stop(e);drag={...target,pointer:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,transform:target.node.getAttribute('transform'),version:familyRenderVersion,camera:familyCamera(),offset:[...(familySelection.vertexLabelOffsets[target.key]||[0,0])]};
  plot.setPointerCapture(e.pointerId);plot.style.cursor='grabbing';
 },true);
 plot.addEventListener('pointermove',e=>{
  if(!drag){plot.style.cursor=hit(e.clientX,e.clientY)?'grab':'';return}
  if(e.pointerId!==drag.pointer)return;stop(e);
  drag.dx=e.clientX-drag.x;drag.dy=e.clientY-drag.y;
  // Preview only the SVG label. No Plotly update, 3D point or camera mutation.
  drag.node.setAttribute('transform',`translate(${drag.dx},${drag.dy}) ${drag.transform||''}`);
 },true);
 plot.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;stop(e);const d=drag;reset();
  if(d.version!==familyRenderVersion||Math.hypot(d.dx,d.dy)<3)return;
  if(!Object.hasOwn(familySelection.vertexLabelOffsets,d.key)&&Object.keys(familySelection.vertexLabelOffsets).length>=5000){report(Error('Saved label-position limit reached; reset positions in unused views first.'));return}
  // Plotly yshift is positive upward; browser pointer y is positive downward.
  const limit=x=>Math.max(-5000,Math.min(5000,x));
  familySelection.vertexLabelOffsets={...familySelection.vertexLabelOffsets,[d.key]:[limit(d.offset[0]+d.dx),limit(d.offset[1]-d.dy)]};
  syncFamilySelectors();renderFamily(d.camera).catch(report);
 },true);
 for(const event of ['pointercancel','lostpointercapture'])plot.addEventListener(event,reset,true);
 for(const event of ['mousedown','click','dblclick'])plot.addEventListener(event,e=>{if(drag||hit(e.clientX,e.clientY))stop(e)},true);
 plot.addEventListener('wheel',e=>{if(drag)stop(e)},{capture:true,passive:false});
 window.addEventListener('blur',reset);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){stop(e);reset()}},true);
}
function decodeFamilyCoordinates(view,n){
 const bytes=Uint8Array.from(atob(view.coordinates),c=>c.charCodeAt(0));
 if(bytes.byteLength!==n*24)throw Error('Embedding coordinate length mismatch');
 const data=new DataView(bytes.buffer),xyz=[[],[],[]];
 for(let i=0;i<n;i++)for(let j=0;j<3;j++){
  const value=data.getFloat64(24*i+8*j,true);if(!Number.isFinite(value))throw Error('Nonfinite embedding coordinate');xyz[j].push(value);
 }
 return xyz;
}
// Independent neighborhood appearance; older preferences gain the shared defaults.
function familyReferenceAppearance(value={}){
 const v=value&&typeof value==='object'?value:{};
 const number=(key,min,max,fallback,step=1)=>typeof v[key]==='number'&&Number.isFinite(v[key])&&v[key]>=min&&v[key]<=max?Math.round(v[key]/step)*step:fallback;
 return {spheres:v.spheres!==false,scale:number('scale',25,300,100,5),color:typeof v.color==='string'&&/^#[0-9a-f]{6}$/i.test(v.color)?v.color.toLowerCase():'#d62728',ambient:number('ambient',0,100,85),highlights:number('highlights',0,100,18)};
}
function validateFamilyReferenceAppearance(value){
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.spheres!=='boolean'||typeof value.color!=='string'||!/^#[0-9a-f]{6}$/i.test(value.color)||[['scale',25,300],['ambient',0,100],['highlights',0,100]].some(([k,min,max])=>!Number.isFinite(value[k])||value[k]<min||value[k]>max))throw Error('Invalid saved neighborhood vertex appearance');
}
function familyDefaults(family,selection={}){
 const anchor=family.anchors.some(a=>a.id===selection.anchor)?selection.anchor:family.anchors[0].id;
 const candidates=family.neighborhoods.filter(h=>h.anchor===anchor);
 const collection=candidates.some(h=>h.collection===selection.collection)?selection.collection:candidates[0].collection;
 const hood=candidates.find(h=>h.collection===collection&&h.size===Number(selection.size))||candidates.find(h=>h.collection===collection&&h.size===4000&&anchor==='Li'&&collection==='comb-V3V4-tx')||candidates.find(h=>h.collection===collection);
 const view=hood.views.find(v=>v.id===selection.view)||hood.views.find(v=>v.metric==='abundance_euclidean'&&v.id.endsWith('_p1'))||hood.views[0];
 if(selection.colorMode?.startsWith('valencia2-')&&!(typeof familyValenciaAvailable==='function'&&familyValenciaAvailable(collection)))selection={...selection,colorMode:'abundance'};
 return {...(typeof principalDefaults==='function'?principalDefaults(hood,selection):{}),anchor,collection,size:hood.size,view:view.id,pointSize:Math.max(1,Math.min(8,Number(selection.pointSize)||3)),opacity:Math.max(.1,Math.min(1,Number(selection.opacity)||.8)),colorMode:familyColorModes.includes(selection.colorMode)?selection.colorMode:'abundance',colorCoverage:familyCoverages.includes(selection.colorCoverage)?selection.colorCoverage:'60',showVertices:selection.showVertices===true,vertexAppearance:familyReferenceAppearance(selection.vertexAppearance),vertexScope:selection.vertexScope==='collection'?'collection':'neighborhood',vertexLabelSize:Number.isInteger(selection.vertexLabelSize)&&selection.vertexLabelSize>=8&&selection.vertexLabelSize<=32?selection.vertexLabelSize:12,vertexLabelOffsets:familyLabelOffsets(selection.vertexLabelOffsets,family),graphBackground:selection.graphBackground!==false,graphMode:selection.graphMode==='pure'?'pure':'merged',graphCoverage:['60','70','80','90','100'].includes(selection.graphCoverage)?selection.graphCoverage:selection.colorCoverage||'60'};
}
function familyCamera(){return el('familyPlot')?._fullLayout?liveViewCamera(el('familyPlot')):null}
function familyBookmark(name='View',includeGraph=true){
 const {family,hood,view}=familyContext();
 return {format:'vme-embedding-view',version:1,name,family:family.id,revision:family.revision,
  collectionRevision:family.collections[hood.collection].revision,coordinateSha256:view.coordinateSha256,
  selection:{...familySelection},...(typeof principalReference==='function'?{principalReference:principalReference(hood,familySelection)}:{}),camera:familyCamera(),...(includeGraph&&familyGraphReady?{graphView:captureNamedViewSettings(false)}:{}),...(familySelection.showVertices?{vertexReference:familyVertexReference(hood.collection,familySelection.vertexScope)}:{}),...((familySelection.colorMode||'abundance')!=='abundance'?{colorReference:familyColorReference(hood.collection,familySelection.colorMode)}:{})};
}
function validateFamilyBookmark(bookmark){
 if(bookmark?.format!=='vme-embedding-view'||bookmark.version!==1||typeof bookmark.name!=='string'||!bookmark.name.trim()||bookmark.name.length>100)throw Error('Unsupported embedding view');
 const family=embeddingFamilyRegistry.get(bookmark.family);
 if(!family||family.revision!==bookmark.revision)throw Error('Embedding collection release is unavailable');
 const {hood,view}=familyContext(bookmark.selection,family);
 if(family.collections[hood.collection].revision!==bookmark.collectionRevision||view.coordinateSha256!==bookmark.coordinateSha256)throw Error('Saved view provenance does not match the loaded embedding');
 const s=bookmark.selection;
 if(typeof principalValidateBookmark==='function')principalValidateBookmark(bookmark,hood);
 if(s.graphBackground!==undefined&&typeof s.graphBackground!=='boolean'||s.graphMode!==undefined&&!['pure','merged'].includes(s.graphMode)||s.graphCoverage!==undefined&&!['60','70','80','90','100'].includes(s.graphCoverage))throw Error('Invalid neighborhood graph settings');
 if(bookmark.graphView){if(bookmark.graphView.neighborhood||bookmark.graphView.dataset!==hood.collection||bookmark.graphView.cohort!=='all'||bookmark.graphView.selection?.participant?.active)throw Error('Saved graph does not match this neighborhood');validateNamedView(bookmark.graphView)}
 familyLabelOffsets(s.vertexLabelOffsets,family);validateFamilyReferenceAppearance(s.vertexAppearance);
 if(s.showVertices!==undefined&&typeof s.showVertices!=='boolean'||s.vertexScope!==undefined&&!['neighborhood','collection'].includes(s.vertexScope)||s.vertexLabelSize!==undefined&&(!Number.isInteger(s.vertexLabelSize)||s.vertexLabelSize<8||s.vertexLabelSize>32))throw Error('Invalid saved reference vertex settings');
 if(s.showVertices){const expected=familyVertexReference(hood.collection,s.vertexScope);if(bookmark.vertexReference?.policy!==expected.policy||bookmark.vertexReference?.revision!==expected.revision)throw Error('Saved reference vertices are unavailable or changed')}
 if(s.colorMode!==undefined&&!familyColorModes.includes(s.colorMode)||s.colorCoverage!==undefined&&!familyCoverages.includes(s.colorCoverage))throw Error('Invalid saved color settings');
 if((s.colorMode||'abundance')!=='abundance'){
  const expected=familyColorReference(hood.collection,s.colorMode);
  if(bookmark.colorReference?.policy!==expected.policy||bookmark.colorReference?.revision!==expected.revision)throw Error('Saved state-color reference is unavailable or changed');
 }
 if(!Number.isFinite(s.pointSize)||s.pointSize<1||s.pointSize>8||!Number.isFinite(s.opacity)||s.opacity<.1||s.opacity>1)throw Error('Invalid point appearance');
 if(bookmark.camera!==null){
  if(!bookmark.camera||!['eye','up','center'].every(k=>bookmark.camera[k]&&['x','y','z'].every(a=>Number.isFinite(bookmark.camera[k][a]))))throw Error('Invalid saved camera');
  if(bookmark.camera.projection&&!['perspective','orthographic'].includes(bookmark.camera.projection.type))throw Error('Invalid camera projection');
 }
 return bookmark;
}
function readFamilyViews(){
 const raw=localStorage.getItem(familyViewsKey);if(raw===null)return [];
 const list=JSON.parse(raw);if(!Array.isArray(list))throw Error('Saved embedding views are unreadable; storage was not changed');return list;
}
function refreshFamilyBookmarks(){
 const list=readFamilyViews();el('familySavedViews').innerHTML='<option value="">Choose a saved view…</option>'+list.map((b,i)=>`<option value="${i}">${esc(b.name)}</option>`).join('');
}
function familyDownload(name,text,type='application/json'){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function syncFamilySelectors(){
 const f=activeEmbeddingFamily,s=familySelection;
 const options=(rows,value)=>rows.map(([id,label])=>`<option value="${esc(id)}"${String(id)===String(value)?' selected':''}>${esc(label)}</option>`).join('');
 el('familyAnchor').innerHTML=options(f.anchors.map(a=>[a.id,a.label]),s.anchor);
 el('familyCollection').innerHTML=options(Object.entries(f.collections).map(([id,c])=>[id,c.title]),s.collection);
 el('familySize').innerHTML=options(f.neighborhoods.filter(h=>h.anchor===s.anchor&&h.collection===s.collection).map(h=>[h.size,h.size/1000+'k distinct compositions']),s.size);
 const {hood}=familyContext();el('familyEmbedding').innerHTML=options(hood.views.map(v=>[v.id,v.label]),s.view);
 el('familyPointSize').value=s.pointSize;el('familyOpacity').value=s.opacity;
 const valenciaAvailable=typeof familyValenciaAvailable==='function'&&familyValenciaAvailable(s.collection);
 for(const option of el('familyColorMode').options)if(option.value.startsWith('valencia2-')){option.hidden=!valenciaAvailable;option.disabled=!valenciaAvailable;}
 el('familyColorMode').value=s.colorMode;el('familyColorCoverage').value=s.colorCoverage;el('familyColorCoverage').disabled=(s.colorMode==='abundance'||s.colorMode.startsWith('valencia2-'))&&!s.showVertices;
 if(familyGraphReady)el('rank3SampleColor').disabled=s.colorMode.startsWith('valencia2-');
 el('familyShowVertices').checked=s.showVertices;el('familyVertexScope').value=s.vertexScope;el('familyVertexScope').disabled=!s.showVertices;
 el('familyVertexLabelSize').value=s.vertexLabelSize;el('familyVertexLabelSize').disabled=!s.showVertices;el('familyVertexLabelSizeValue').textContent=s.vertexLabelSize+' px';
 el('familyResetLabelPositions').disabled=!s.showVertices;
 const appearance=familyReferenceAppearance(s.vertexAppearance);el('familyVertexSpheres').checked=appearance.spheres;el('familyVertexSpheres').disabled=!s.showVertices;
 for(const [suffix,field] of [['Scale','scale'],['Color','color'],['Ambient','ambient'],['Highlights','highlights']]){
  el('familyVertex'+suffix).value=String(appearance[field]);el('familyVertex'+suffix).disabled=!s.showVertices||(['ambient','highlights'].includes(field)&&!appearance.spheres);
  if(field!=='color')el('familyVertex'+suffix+'Value').textContent=appearance[field]+'%';
 }
 el('familyGraphBackground').checked=s.graphBackground;
 if(typeof syncPrincipalControls==='function')syncPrincipalControls();
 for(const id of ['datasetSelect','panelDatasetSelect'])el(id).value=f.id;
 el('datasetMethods').textContent=f.selectionRule+' '+f.limitations;
 el('datasetSummary').textContent=f.title+' · '+f.neighborhoods.length+' separately defined neighborhoods';
 el('legacyLinks').hidden=true;
 document.title='MiCOVE — '+f.title;
 saveFamilySession();
 try{localStorage.setItem(familyPreferenceKey,JSON.stringify({family:f.id,revision:f.revision,selection:s,maximized:document.body.classList.contains('familyMaximized')}))}catch{}
}
function renderFamily(camera=null){
 familyCancelLabelDrag();familyLabelTargets=[];
 const token=++familyRenderVersion,context=familyContext(),selection={...familySelection};
 familyRenderQueue=familyRenderQueue.catch(()=>{}).then(async()=>{
  if(token!==familyRenderVersion||!activeEmbeddingFamily)return;
  const {family,hood,view,key}=context,xyz=decodeFamilyCoordinates(view,hood.size);
  const base=datasetRegistry.get(hood.collection).data,color=familyColorModel(hood,selection);
  const graphState=familyGraphReady?familyGraphState():null,graphLinked=graphState?familyGraphMembership(hood,graphState):{active:false,mask:hood.profileIds.map(()=>true),ring:[],count:hood.size};
  const principal=typeof principalModel==='function'?principalModel(hood,selection):null,linked=principal?principalLinked(hood,selection,graphLinked):graphLinked;
  const hover=hood.profileIds.map((id,i)=>esc(id)+'<br>'+esc(hood.anchor)+' abundance: '+(hood.abundance[i]*100).toPrecision(5)+'%<br>'+hood.multiplicity[i]+' source record(s)'+(color.labels[i]?'<br>'+esc(color.labels[i]):'')+'<br>'+base.sampleTopFeatures[hood.profileIndices[i]].map(([name,value])=>esc(name.replaceAll('_',' '))+': '+Number(value).toPrecision(4)+'%').join('<br>'));
  if(color.mode.startsWith('valencia2-'))hover.forEach((text,i)=>{hover[i]=text+valenciaHover(hood.profileIndices[i],null,BUNDLE_PACK.valencia2[hood.collection])});
  const cstHover=sampleCstHoverModel(false,datasetRegistry.get(hood.collection),graphState?.coverage||selection.colorCoverage||'60');
  hover.forEach((text,i)=>{hover[i]=text+sampleCstHover(hood.profileIndices[i],cstHover)});
  if(principal)hover.forEach((text,i)=>{hover[i]=text+'<br>'+esc(principalErrorText(principal,i))});
  const foreground=hood.profileIds.map((_,i)=>i).filter(i=>linked.mask[i]),background=hood.profileIds.map((_,i)=>i).filter(i=>!linked.mask[i]);
  const graphColorOverride=familyGraphReady&&rank3.enabled&&rank3.color==='rank3'&&!color.mode.startsWith('valencia2-');
  const trace=(indices,dimmed=false)=>({type:'scatter3d',mode:'markers',x:indices.map(i=>xyz[0][i]),y:indices.map(i=>xyz[1][i]),z:indices.map(i=>xyz[2][i]),ids:indices.map(i=>hood.profileIds[i]),
   customdata:indices,text:indices.map(i=>hover[i]),hovertemplate:'%{text}<extra></extra>',meta:{familyKey:key},
   marker:{size:selection.pointSize,opacity:dimmed?.12:selection.opacity,color:dimmed?'#b9c2c7':indices.map(i=>graphColorOverride?rank3Color(linked.triples[i],hood.collection):color.colors[i]),showscale:false,...(!dimmed&&color.mode==='abundance'&&!graphColorOverride?{cmin:0,cmax:100,colorscale:familyAbundanceColorscale}:{})}});
  const showBackground=familyGraphReady&&rank3UsesSamples()?rank3.background:selection.graphBackground;
  const traces=[...(linked.active&&showBackground&&background.length?[trace(background,true)]:[]),trace(foreground)];
  const ringIndices=foreground.filter(i=>linked.ring[i]);
  if(ringIndices.length){const rings=trace(ringIndices);rings.meta.familyRing=true;rings.marker={symbol:'circle-open',size:ringIndices.map(i=>linked.triples[i]===edgeFaces.focused?9:6),color:ringIndices.map(i=>rank3Color(linked.triples[i],hood.collection)),line:{width:2},opacity:1};traces.push(rings)}
  const vertices=selection.showVertices?familyVertexModel(hood,selection):null,overlay=vertices?familyVertexOverlay(vertices,xyz,selection.vertexLabelSize,key,selection.vertexLabelOffsets):null;
  if(overlay)traces.push(overlay.trace);
  const pinned=principal?principalProfileTrace(hood,selection,xyz,hover,key):null;if(pinned)traces.push(pinned);
  const layout={margin:{l:0,r:0,t:5,b:0},uirevision:key,showlegend:false,
   scene:{...(camera?{camera}:{}),annotations:overlay?.annotations||[],aspectmode:'data',dragmode:'orbit',...Object.fromEntries(['xaxis','yaxis','zaxis'].map((axis,j)=>{const lo=Math.min(...xyz[j]),hi=Math.max(...xyz[j]),pad=(hi-lo||1)*.05;return [axis,{visible:false,autorange:false,range:[lo-pad,hi+pad]}]}))}};
  const referenceSettings={...familyReferenceAppearance(selection.vertexAppearance),showVertices:selection.showVertices,coordinateSpan:Math.max(...xyz.map(axis=>Math.max(...axis)-Math.min(...axis)))};
  await Plotly.react('familyPlot',sampleReferenceSphereTraces(traces,layout,referenceSettings),layout,
   {responsive:true,scrollZoom:true,displaylogo:false,displayModeBar:false});
  // A previously maximized or hidden canvas retains its old pixel width until resized.
  await Plotly.Plots.resize(el('familyPlot'));
  if(token!==familyRenderVersion)return;
  familyLabelTargets=overlay?.labelKeys||[];
  if(familyGraphReady)familyInspectSelection();
  el('familyVertexNote').textContent=vertices?.note||'Labels use observed taxon maxima for the selected top-2 CST reference coverage. Enable to choose neighborhood or full-collection scope.';
  el('familyHeaderColor').title=color.note;el('familyHeaderEmbedding').title=view.label;
  el('familyColorNote').textContent=color.note;el('familyLegendSection').hidden=false;
  el('familyLegendTitle').textContent=graphColorOverride?'Graph top-3 CST coloring':color.mode==='abundance'?'Reference abundance':'State colors · neighborhood counts';
  const anchorLabel=family.anchors.find(a=>a.id===hood.anchor)?.label||hood.anchor;
  el('familyColorLegend').innerHTML=color.mode==='abundance'&&!graphColorOverride?`<p>${esc(anchorLabel)} relative abundance</p><div class="familyAbundanceScale" role="img" aria-label="${esc(anchorLabel)} relative abundance: 0% (purple) to 100% (yellow)" style="background:${familyAbundanceGradient()}"></div><div class="familyAbundanceTicks" aria-hidden="true">${[0,25,50,75,100].map(v=>`<span>${v}%</span>`).join('')}</div><small>Whole-composition abundance · fixed 0–100% range.</small>`:countedFamilyLegend(hood,color,foreground,background,linked.active&&showBackground,graphColorOverride,linked);
  if(typeof renderCstSphereSummary==='function'){
   const population=legendPopulation(datasetRegistry.get(hood.collection));
   renderCstSphereSummary(familyDisplayedEntries(hood,foreground,background,linked.active&&showBackground,population),population,{neighborhood:true});
  }
  for(const [id,source] of [['familyBackSelection','headerBackSelection'],['familyForwardSelection','headerForwardSelection'],['familyClearSelection','headerClearSelection']])if(el(id))el(id).disabled=el(source).disabled;
  renderFamilyStress(hood,view,xyz);
  el('familyTitle').textContent=`${hood.anchor} · ${hood.collection} · ${hood.size/1000}k compositions`;
  el('familyTitle').title=el('familyTitle').textContent+' · '+familyEmbeddingTitle(view,hood.anchor);
  el('familySummary').textContent=`${hood.size.toLocaleString()} distinct compositions · ${hood.sourceRecords.toLocaleString()} source records · ${hood.views.length} saved embedding${hood.views.length===1?'':'s'}. Minimum ${hood.anchor} abundance: ${(Math.min(...hood.abundance)*100).toPrecision(5)}%. ${hood.nonDominant.toLocaleString()} compositions are dominated by another taxon.`;
  el('familyCaveats').textContent=family.limitations+(view.evaluation?' V4 fits are exploratory: a separate 64-query diagnostic per neighborhood found 33–69% mean retention of original-space ten-nearest neighbors after PCA-based neighbor search. This is a preparation diagnostic, not a measure of 3D embedding neighbor retention. No pivot-count or epoch-budget sensitivity study was performed.':'');
  const solver=view.solver,md=solver.metadata;
  el('familyMethod').textContent=view.origin+'. '+(view.evaluation?`SGD, ${solver.epochs} epochs, one random start, seed ${solver.seed}. Sampled Euclidean distance error: normalized RMSE ${(100*view.evaluation.normalizedRmse).toFixed(2)}%; RMS relative error ${(100*view.evaluation.relativeRms).toFixed(2)}% (${view.evaluation.pairs.toLocaleString()} pairs).`:
   md?`Historical ${md.engine} / ${md.approximation}, ${md.settings.max_iter} epochs, seed ${md.settings.seed}. Saved target-normalized RMSE: ${(100*md.target_normalized_rmse).toFixed(2)}%. Original display alignment retained.`:'Historical reference-ratio PCA projection; not an MDS fit.');
  el('familyReceipt').textContent=JSON.stringify({collection:hood.collection,collectionRevision:family.collections[hood.collection].revision,referenceEligibilityRevision:hood.referenceEligibilityRevision,profile:hood.anchorProfile,coordinateSha256:view.coordinateSha256,solver:view.solver,evaluation:view.evaluation,alignment:view.alignment},null,2);
  const pin=principal?hood.profileIds.indexOf(selection.principalProfile):-1;
  if(pin>=0)el('familySelected').innerHTML=hover[pin]+(linked.mask[pin]?'':'<br>Selected profile is outside the current path/reference-graph highlight.');
  else el('familySelected').textContent=principal?'Click a profile to inspect its composition and reconstruction error. A black ring marks the selected profile.':'Click a point to inspect its composition ID and leading taxa.';
  if(principal)renderPrincipalInformation(hood,selection,linked);
  el('familyStatus').textContent='Loaded '+view.label+(linked.active?` · Highlighted: ${linked.count.toLocaleString()} of ${hood.size.toLocaleString()} neighborhood compositions; ${showBackground?'other compositions dimmed':'other compositions hidden'}. Fixed embedding.`:'');
  el('familyGraphNote').textContent=`Graph and catalogue: full ${hood.collection} reference (${activeStateMode==='merged'?'merged top-2 CST groups':'original top-2 CST pairs'}, ${el('coverage').value}% target). Counts are reference counts, not neighborhood counts. Selections intersect this neighborhood; its saved coordinates never change. Sample coloring has its own coverage selector.`;
 });
 return familyRenderQueue;
}
async function activateEmbeddingFamily(id,bookmark=null){
 const revision=++datasetSwitchRevision;
 await loadForSelection(ensureEmbeddingFamiliesLoaded,revision,()=>activateEmbeddingFamily(id,bookmark));
 if(revision!==datasetSwitchRevision)return;
 const f=embeddingFamilyRegistry.get(id);if(!f)throw Error('Unknown embedding collection');
 if(bookmark)validateFamilyBookmark(bookmark);
 if(bookmark?.graphView){const {graphView,...neighborhood}=bookmark;return restoreNamedView({...graphView,neighborhood})}
 await Promise.all([queue,graphQueue,familyRenderQueue]);if(revision!==datasetSwitchRevision)return;
 if(activeSensitivityMode!=='baseline')selectSensitivityData('baseline');
 if(typeof saveDatasetPanelSettings==='function')saveDatasetPanelSettings();
 if(typeof datasetPanelRestoring!=='undefined')datasetPanelRestoring=true;
 try{for(const button of document.querySelectorAll('.maximizePanel[aria-expanded="true"]'))button.click()}finally{if(typeof datasetPanelRestoring!=='undefined')datasetPanelRestoring=false}
 let saved=null,maximized=false;try{const p=JSON.parse(localStorage.getItem(familyPreferenceKey));if(p?.family===id&&p.revision===f.revision){saved=p.selection;maximized=p.maximized===true}}catch{}
 if(typeof rememberDatasetLocation==='function')rememberDatasetLocation(id);
 activeEmbeddingFamily=f;familyGraphReady=false;familySelection=familyDefaults(f,bookmark?.selection||saved||familySelection||{});
 document.body.classList.add('embeddingFamilyActive');el('familyPanel').hidden=false;
 const selection=familySelection,resume=bookmark?null:readFamilySession();
 syncFamilySelectors();refreshFamilyBookmarks();await prepareFamilyGraph();
 if(!familyGraphReady||activeEmbeddingFamily!==f||familySelection!==selection)return;
 await restoreFamilySession(resume);
 await renderFamily(bookmark?.camera||null);if(!bookmark&&maximized&&!document.body.classList.contains('familyMaximized'))el('familyMaximize').click();window.dispatchEvent(new Event('resize'));
}
async function leaveEmbeddingFamily(revision=datasetSwitchRevision){
 if(!activeEmbeddingFamily)return;
 familyCancelLabelDrag();familyLabelTargets=[];
 ++familyRenderVersion;await familyRenderQueue;if(revision!==datasetSwitchRevision)return;activeEmbeddingFamily=null;familyGraphReady=false;
 document.body.classList.remove('embeddingFamilyActive','familyMaximized');el('familyPanel').hidden=true;
 el('familyMaximize').textContent='⛶ Maximize';el('familyMaximize').setAttribute('aria-expanded','false');
 datasetPresentation(el('coverage').value);window.dispatchEvent(new Event('resize'));
}
// Layout preferences do not participate in embedding, selection or camera state.
function familyInformationSize(width,preference){
 const space=Math.max(1,width-14),min=Math.min(.3,180/space),max=.6;
 return {space,min,max,value:Math.max(min,Math.min(max,Number.isFinite(preference)?preference:.3))};
}
function installFamilyInformationSizing(){
 const area=el('familyBody'),divider=el('familyInfoDivider'),key='vme-neighborhood-information-width-v1',positionKey='vme-neighborhood-information-position-v1';
 let width=.3,height=.4,position='right',drag=null;
 try{const saved=JSON.parse(localStorage.getItem(key));if(Number.isFinite(saved))width=saved;const other=JSON.parse(localStorage.getItem(positionKey));if(other?.position==='bottom')position='bottom';if(Number.isFinite(other?.height))height=other.height}catch{}
 const vertical=()=>position==='bottom';
 const limits=()=>familyInformationSize(area.getBoundingClientRect()[vertical()?'height':'width'],vertical()?height:width);
 const setPreference=value=>{if(vertical())height=value;else width=value};
 function apply(persist=false){
  area.dataset.legendPosition=position;el('familyLegendPosition').value=position;
  const l=limits(),axis=vertical()?'height':'width';area.style.setProperty('--family-info-'+axis,l.value+'fr');area.style.setProperty('--family-plot-'+axis,(1-l.value)+'fr');
  divider.setAttribute('aria-orientation',vertical()?'horizontal':'vertical');
  divider.setAttribute('aria-valuemin',Math.ceil(l.min*100));divider.setAttribute('aria-valuemax',60);divider.setAttribute('aria-valuenow',Math.round(l.value*100));divider.setAttribute('aria-valuetext',Math.round(l.value*100)+'% for legend and information');
  if(persist)try{localStorage.setItem(key,JSON.stringify(width));localStorage.setItem(positionKey,JSON.stringify({position,height}))}catch{}
 }
 function finish(event){
  if(drag!==event.pointerId)return;drag=null;
  if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizingPanels','resizingColumns','resizingRows');apply(true);
 }
 el('familyLegendPosition').onchange=()=>{position=el('familyLegendPosition').value==='bottom'?'bottom':'right';apply(true);if(activeEmbeddingFamily)Plotly.Plots.resize(el('familyPlot'))};
 divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag=event.pointerId;divider.setPointerCapture(drag);divider.focus();document.body.classList.add('resizingPanels',vertical()?'resizingRows':'resizingColumns')});
 divider.addEventListener('pointermove',event=>{if(drag!==event.pointerId)return;const r=area.getBoundingClientRect(),l=limits(),distance=vertical()?r.bottom-event.clientY:r.right-event.clientX;setPreference(Math.max(l.min,Math.min(l.max,(distance-7)/l.space)));apply()});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(name,finish);
 divider.addEventListener('keydown',event=>{
  const grow=vertical()?'ArrowUp':'ArrowLeft',shrink=vertical()?'ArrowDown':'ArrowRight';
  if(![grow,shrink,'Home','End'].includes(event.key))return;event.preventDefault();const l=limits(),step=event.shiftKey?.1:.02;
  setPreference(event.key==='Home'?l.min:event.key==='End'?l.max:Math.max(l.min,Math.min(l.max,l.value+(event.key===grow?step:-step))));apply(true);
 });
 const reset=()=>{width=.3;height=.4;apply(true)};divider.addEventListener('dblclick',reset);el('resetPanels')?.addEventListener('click',reset);
 new ResizeObserver(()=>apply()).observe(area);apply();
}
function installEmbeddingFamilies(){
 if(typeof window==='undefined')return; // Headless contract fixtures test the pure helpers separately.
 if(!embeddingFamilyRegistry.size)return;
 const style=document.createElement('style');style.textContent=`
 body.embeddingFamilyActive #samplePanel,body.embeddingFamilyActive #sampleControls,body.embeddingFamilyActive #valenciaColorControls,body.embeddingFamilyActive #participantSection,body.embeddingFamilyActive #enrollmentExploreSection,body.embeddingFamilyActive label:has(>#cohortSelect){display:none!important}
 #familySidebarControls{display:none}body.embeddingFamilyActive #familySidebarControls{display:block}
 #familySidebarControls label{min-width:0;max-width:100%}#familySidebarControls input{box-sizing:border-box;width:100%;min-width:0}#familySidebarControls p{font-size:12px;white-space:normal}
 #familySidebarControls label:has(>input[type=checkbox]){display:flex;align-items:center;gap:6px;white-space:normal}#familySidebarControls input[type=checkbox]{width:auto;flex:0 0 auto}
 #familyColorLegend{max-height:min(36vh,320px);overflow:auto;font-size:12px}.familyLegendRow{display:flex;align-items:flex-start;gap:6px;margin:6px 0}.familyLegendRow .colorSwatch{margin-top:3px}
 .familyAbundanceScale{height:18px;border:1px solid #bacbd1;border-radius:3px}.familyAbundanceTicks{display:flex;justify-content:space-between;font-size:11px;margin-top:4px}
 #panelWorkspace>#familyPanel[hidden]{display:none}#familyPanel{grid-area:1/1/4/2;display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto;box-sizing:border-box;padding:12px;gap:8px}
 #familyEmbedding,#familyColorMode{font-size:12px;padding:3px 5px;min-width:0;max-width:230px} #familyHeaderActions{margin-left:auto} #familyHeaderEmbedding,#familyHeaderColor{max-width:100%} #familyInformation .sectionControls{font-size:12px} #familyInformation input[type=range]{display:block;width:100%} #familyInformation label{white-space:normal} #familyInformation .controlSection{border:0;padding:0} #familyBody[data-legend-position=bottom]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,var(--family-plot-height,.6fr)) 14px minmax(0,var(--family-info-height,.4fr))} #familyBody[data-legend-position=bottom] #familyPlot{grid-area:1/1} #familyBody[data-legend-position=bottom] #familyInformation{grid-area:3/1} #familyBody[data-legend-position=bottom] #familyInfoDivider{grid-area:2/1;cursor:row-resize} #familyBody[data-legend-position=bottom] #familyInfoDivider::after{width:auto;height:4px;top:5px;left:0;right:0}#familyBody{display:grid;grid-template-columns:minmax(0,var(--family-plot-width,.7fr)) 14px minmax(0,var(--family-info-width,.3fr));grid-template-rows:minmax(0,1fr);flex:1;min-height:0;min-width:0}#familyPlot{height:100%;min-height:120px;min-width:0;overflow:hidden}#familyInformation{overflow:auto;min-height:0;min-width:0;font-size:12px;border:1px solid #d1dce0;border-radius:5px;padding:8px;box-sizing:border-box;background:rgba(255,255,255,.96);overflow-wrap:anywhere}#familyReceipt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}#familyInformation p{margin:8px 0}
 #familyInfoDivider{cursor:col-resize}#familyInfoDivider::after{width:4px;left:5px;top:0;bottom:0}#familyInformation details{padding:6px 0;border-bottom:1px solid #d1dce0}#familyInformation summary{font-weight:600;color:#244e5e}#familyInformation small{display:block;margin:6px 0}#familyInformation [hidden]{display:none!important}#familyInformation button{font-size:12px;margin:4px 0;max-width:100%}
 #familyBookmarkTools{display:flex;flex-direction:column;gap:8px}#familyStatus{display:block;min-height:1.5em;overflow-wrap:anywhere;background:#edf4f5;padding:6px;border-radius:5px}
 body.familyMaximized #panelWorkspace>#familyPanel{grid-area:1/1/4/4}body.familyMaximized #panelWorkspace>.card:not(#familyPanel),body.familyMaximized #panelWorkspace>.panelDivider{display:none}
 #familyGraphNote{display:block;font-size:12px;margin-bottom:6px}`;
 document.head.appendChild(style);
 const panel=document.createElement('section');panel.id='familyPanel';panel.className='card';panel.hidden=true;
 panel.innerHTML=`<div class="panelHeader"><div class="embeddingHeading"><h2 id="familyTitle">Embedding collection</h2><button id="familyStress" class="embeddingStress" type="button" aria-haspopup="dialog">RMS relative error: calculating…</button></div><div id="familyHeaderActions" class="sampleHeaderActions"><div class="sampleHeaderNavigation" role="group" aria-label="Neighborhood selection navigation"><button id="familyBackSelection" class="maximizePanel" disabled>← Back</button><button id="familyForwardSelection" class="maximizePanel" disabled>Forward →</button><button id="familyClearSelection" class="maximizePanel" disabled>Clear selection</button></div><label id="familyHeaderEmbedding" class="sampleHeaderEmbedding">Sample embedding </label><label id="familyHeaderColor" class="sampleHeaderEmbedding">Color by </label><label class="legendPositionControl">Legend <select id="familyLegendPosition" aria-label="Neighborhood legend position"><option value="right">Right</option><option value="bottom">Bottom</option></select></label><button id="familyNamedViews" class="maximizePanel">Named views…</button><button id="familyPNG" class="maximizePanel">Save PNG…</button><button id="familyMaximize" class="maximizePanel" aria-expanded="false">⛶ Maximize</button></div></div>
 <div id="familyControls"><label>Anchor<select id="familyAnchor"></select></label><label>Collection<select id="familyCollection"></select></label><label>Neighborhood size<select id="familySize"></select></label><label>Embedding method<select id="familyEmbedding"></select></label></div>
 <small id="familyStatus" role="status"></small><div id="familyBody"><div id="familyPlot" aria-label="Neighborhood 3D embedding"></div><aside id="familyInformation"><p id="familySummary"></p><p id="familyMethod"></p><details><summary>Interpretation and limitations</summary><p id="familyCaveats"></p><p>Neighborhood membership is ordered by reference abundance, not by distance under each displayed metric. Colors show whole-composition abundance on a fixed 0–100% scale. Error values from different target metrics or weighting schemes are not a common ranking.</p></details><label>Point size<input id="familyPointSize" type="range" min="1" max="8" step="1" value="3"></label><label>Opacity<input id="familyOpacity" type="range" min="0.1" max="1" step="0.1" value="0.8"></label><button id="familyResetCamera">Reset camera</button><h3>Selected composition</h3><p id="familySelected"></p><button id="familyCSV">Export coordinates CSV</button><button id="familyProvenance">Export provenance JSON</button><details><summary>Solver receipt</summary><pre id="familyReceipt"></pre></details></aside></div>
 <details><summary>Saved neighborhood views</summary><p>These views retain the exact collection, neighborhood, embedding and camera. They require this same asset release; they do not contain sample data.</p><div id="familyBookmarkTools"><input id="familyViewName" maxlength="100" placeholder="View name" aria-label="Neighborhood view name"><button id="familySave">Save new view</button><select id="familySavedViews" aria-label="Saved neighborhood views"></select><button id="familyRestore">Restore</button><button id="familyExportView">Export current view JSON</button><button id="familyImportView">Import view JSON</button><input id="familyViewFile" type="file" accept=".json" hidden></div></details>`;
 el('panelWorkspace').prepend(panel);
 const graphNote=document.createElement('small');graphNote.id='familyGraphNote';panel.querySelector('.panelHeader').after(graphNote);
 const graphBackground=document.createElement('label');graphBackground.innerHTML='<input id="familyGraphBackground" type="checkbox" checked> Show dimmed unselected neighborhood samples';
 el('familyInformation').prepend(graphBackground);
 el('familyCaveats').nextElementSibling.textContent='Neighborhood membership is ordered by reference abundance, not by distance under each displayed metric. Reference-abundance coloring uses a fixed 0–100% scale; state coloring follows the full-reference rules under Sample colors. Error values from different target metrics or weighting schemes are not a common ranking.';
 // Move the existing widgets, preserving their identities and event handlers.
 // Keep this sidebar available even when the plot is maximized.
 const sidebar=document.createElement('div');sidebar.id='familySidebarControls';
 sidebar.innerHTML='<details class="controlSection" open><summary>Neighborhood</summary><div id="familySelectionHost"></div></details><details class="controlSection" open><summary>Appearance</summary><div id="familyAppearanceControls" class="sectionControls"></div></details>';
 el('dataControls').after(sidebar);
 el('familyControls').className='sectionControls';el('familySelectionHost').appendChild(el('familyControls'));
 const colorSection=document.createElement('details');colorSection.className='controlSection';colorSection.open=true;
 colorSection.innerHTML='<summary>Sample colors</summary><div class="sectionControls"><label>Color by<select id="familyColorMode"><option value="abundance">Reference abundance</option><option value="dominance2">Assigned-pair abundance order</option><option value="merged2">Merged top-2 CST groups</option><option value="rank3">Original top-3 CSTs</option><option value="valencia2-cst">VALENCIA2 CSTs</option><option value="valencia2-subtype">VALENCIA2 subCSTs</option></select></label><label>Reference coverage<select id="familyColorCoverage"><option value="60">60%</option><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option></select></label><details><summary>Coloring rules</summary><small id="familyColorNote"></small></details><details id="familyLegendSection" open hidden><summary>State colors · neighborhood counts</summary><div id="familyColorLegend"></div></details></div>';
 el('familySelectionHost').parentElement.after(colorSection);
 el('familyLegendSection').querySelector('summary').id='familyLegendTitle';
 for(const id of ['familyPointSize','familyOpacity'])el('familyAppearanceControls').appendChild(el(id).closest('label'));
 el('familyAppearanceControls').appendChild(el('familyResetCamera'));
 el('familyAppearanceControls').appendChild(graphBackground);
 const vertexControls=document.createElement('details');vertexControls.className='controlSection';vertexControls.open=true;
 vertexControls.innerHTML='<summary>Reference vertices</summary><div class="sectionControls"><label><input id="familyShowVertices" type="checkbox"> Show reference vertices</label><label>Reference scope<select id="familyVertexScope"><option value="neighborhood">Maxima within neighborhood</option><option value="collection">Full-collection reference samples</option></select></label><label>Label size · <output id="familyVertexLabelSizeValue">12 px</output><input id="familyVertexLabelSize" type="range" min="8" max="32" step="1" value="12"></label><small id="familyVertexNote"></small></div>';
 el('familyAppearanceControls').closest('details').before(vertexControls);
 const referenceAppearanceControls=document.createElement('div');
 referenceAppearanceControls.innerHTML='<label title="Draw reference vertices as illuminated spheres instead of diamonds. Sample points keep their appearance. Spheres grow with zoom."><input id="familyVertexSpheres" type="checkbox" checked> Sphere vertices</label><label title="Fill light on the whole sphere. Lower values deepen shadows; higher values brighten the shaded side.">Ambient light · <output id="familyVertexAmbientValue">85%</output><input id="familyVertexAmbient" aria-label="Neighborhood reference ambient light" type="range" min="0" max="100" step="1" value="85"></label><label title="Strength of the shiny reflection. Lower values are matte; higher values add more shine.">Highlights · <output id="familyVertexHighlightsValue">18%</output><input id="familyVertexHighlights" aria-label="Neighborhood reference highlights" type="range" min="0" max="100" step="1" value="18"></label><label title="Scale reference markers only; sample points and embedding coordinates are unchanged.">Vertex size · <output id="familyVertexScaleValue">100%</output><input id="familyVertexScale" aria-label="Neighborhood reference vertex size" type="range" min="25" max="300" step="5" value="100"></label><label title="One base color for all reference vertices, in sphere and diamond modes. Sample colors and reference labels are unchanged.">Vertex color<input id="familyVertexColor" aria-label="Neighborhood reference vertex color" type="color" value="#d62728"></label>';
 el('familyShowVertices').closest('label').after(referenceAppearanceControls);

 const labelHelp=document.createElement('small');labelHelp.textContent='Drag a label to separate it from other labels; its reference marker stays fixed. Drag the background to rotate. Escape cancels a label drag. Positions are saved per neighborhood, embedding and reference scope.';
 const resetLabels=document.createElement('button');resetLabels.id='familyResetLabelPositions';resetLabels.textContent='Reset label positions';resetLabels.title='Reset manual label offsets for this neighborhood, embedding and reference scope, at all coverage levels.';
 vertexControls.querySelector('.sectionControls').append(labelHelp,resetLabels);
 const savedViews=el('familyBookmarkTools').closest('details');savedViews.classList.add('controlSection');sidebar.appendChild(savedViews);
 el('familyBookmarkTools').classList.add('sectionControls');
 // One information column, beside the plot in both workspace and maximized views.
 // Move nodes rather than copying them so status updates and inspection stay live.
 const information=el('familyInformation'),divider=document.createElement('div');
 divider.id='familyInfoDivider';divider.className='panelDivider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label','Resize neighborhood legend and information');divider.setAttribute('aria-controls','familyPlot familyInformation');divider.title='Drag to resize; arrow keys adjust width; double-click resets';
 information.before(divider);
 const section=(title,nodes,open=false)=>{const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title;details.open=open;details.append(summary,...nodes);return details};
 const interpretation=el('familyCaveats').closest('details'),receipt=el('familyReceipt').closest('details'),colorRules=el('familyColorNote').closest('details');
 information.querySelector('h3').remove();
 information.replaceChildren(el('familyLegendSection'),el('familyStatus'),
  section('Neighborhood and embedding',[el('familySummary'),el('familyMethod')],true),
  section('Selected composition',[el('familySelected')],true),
  section('Reference graph and selection',[graphNote]),colorRules,
  section('Reference vertex labels',[el('familyVertexNote'),labelHelp]),interpretation,
  section('Exports',[el('familyCSV'),el('familyProvenance')]),receipt,
  section('About saved views',[savedViews.querySelector('p')]));
 // Preserve each neighborhood's existing choices and event handlers while
 // grouping display settings in the plot sidebar, as in ordinary datasets.
 for(const [id,host] of [['familyEmbedding','familyHeaderEmbedding'],['familyColorMode','familyHeaderColor']]){
  const control=el(id),oldLabel=control.closest('label');el(host).appendChild(control);oldLabel.remove();
 }
 colorSection.hidden=true;
 const viewControls=document.createElement('section');viewControls.className='sampleViewControls';viewControls.setAttribute('aria-label','Sample view settings');
 const coloring=section('Sample coloring',[el('familyHeaderColor'),colorRules],true);coloring.className='sampleColoringControls';
 viewControls.append(el('familyHeaderEmbedding'),coloring,el('familyLegendPosition').closest('label'));
 information.prepend(viewControls);
 const appearance=section('Sample appearance',[vertexControls,el('familyAppearanceControls')],true);
 information.insertBefore(appearance,el('familyStatus'));
 el('familyColorCoverage').closest('label').firstChild.textContent='Largest 2-CSTs coverage';
 colorRules.prepend(el('familyColorCoverage').closest('label'));
 el('familyAppearanceControls').classList.add('familyAppearanceControls');
 sidebar.querySelector('details:has(>#familyAppearanceControls)')?.remove();
 // The now-empty Appearance section is not a second set of controls.
 for(const details of sidebar.querySelectorAll('details'))if(details.querySelector('summary')?.textContent==='Appearance')details.remove();
 information.appendChild(savedViews);
 el('familyNamedViews').onclick=()=>el('namedSampleViews').click();
 el('familyBackSelection').onclick=backSelection;el('familyForwardSelection').onclick=forwardSelection;el('familyClearSelection').onclick=clearSelection;
 installFamilyInformationSizing();
 new ResizeObserver(()=>{if(activeEmbeddingFamily)Plotly.Plots.resize(el('familyPlot'))}).observe(el('familyPlot'));
 const report=error=>{el('familyStatus').textContent=error.message||String(error)};
 installFamilyLabelDragging(report);
 el('familyResetLabelPositions').onclick=()=>{const camera=familyCamera(),key=familyContext().key,scope=familySelection.vertexScope;familySelection.vertexLabelOffsets=Object.fromEntries(Object.entries(familySelection.vertexLabelOffsets).filter(([id])=>{const k=JSON.parse(id);return k[0]!==key||k[1]!==scope}));syncFamilySelectors();renderFamily(camera).catch(report)};
 for(const [id,field] of [['familyAnchor','anchor'],['familyCollection','collection'],['familySize','size'],['familyEmbedding','view']])el(id).onchange=()=>{
  const before=familySelection;familySelection=familyDefaults(activeEmbeddingFamily,{...before,[field]:el(id).value});syncFamilySelectors();
  if(field==='collection')prepareFamilyGraph().catch(report);else{selectionHistory.length=0;selectionFuture.length=0;inspect();renderFamily().catch(report)}
 };
 el('familyGraphBackground').onchange=()=>{familySelection.graphBackground=el('familyGraphBackground').checked;rank3.background=familySelection.graphBackground;syncRank3Controls();syncFamilySelectors();renderFamily(familyCamera()).catch(report)};
 for(const [id,field] of [['familyPointSize','pointSize'],['familyOpacity','opacity']])el(id).onchange=()=>{const camera=familyCamera();familySelection[field]=Number(el(id).value);syncFamilySelectors();renderFamily(camera).catch(report)};
 for(const [id,field] of [['familyColorMode','colorMode'],['familyColorCoverage','colorCoverage']])el(id).onchange=()=>{const camera=familyCamera();familySelection[field]=el(id).value;syncFamilySelectors();renderFamily(camera).catch(report)};
 for(const [id,field] of [['familyShowVertices','showVertices'],['familyVertexScope','vertexScope'],['familyVertexLabelSize','vertexLabelSize']])el(id).onchange=()=>{const camera=familyCamera();familySelection[field]=field==='showVertices'?el(id).checked:field==='vertexLabelSize'?Number(el(id).value):el(id).value;syncFamilySelectors();renderFamily(camera).catch(report)};
 el('familyResetCamera').onclick=()=>Plotly.relayout('familyPlot',{'scene.camera':{eye:{x:1.25,y:1.25,z:1.25},up:{x:0,y:0,z:1},center:{x:0,y:0,z:0}}});
 el('familyMaximize').onclick=()=>{const active=document.body.classList.toggle('familyMaximized');el('familyMaximize').textContent=active?'↙ Restore':'⛶ Maximize';el('familyMaximize').setAttribute('aria-expanded',String(active));Plotly.Plots.resize(el('familyPlot'));if(activeEmbeddingFamily&&(typeof datasetPanelRestoring==='undefined'||!datasetPanelRestoring))syncFamilySelectors()};
 window.addEventListener('resize',()=>{if(activeEmbeddingFamily)Plotly.Plots.resize(el('familyPlot'))});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('familyMaximized'))el('familyMaximize').click()});
 for(const [suffix,field] of [['Spheres','spheres'],['Scale','scale'],['Color','color'],['Ambient','ambient'],['Highlights','highlights']]){
  const control=el('familyVertex'+suffix);
  control[field==='spheres'?'onchange':'oninput']=()=>{const camera=familyCamera();familySelection.vertexAppearance=familyReferenceAppearance({...familySelection.vertexAppearance,[field]:field==='spheres'?control.checked:field==='color'?control.value:Number(control.value)});syncFamilySelectors();renderFamily(camera).catch(report)};
 }
 el('familyPNG').onclick=()=>el('saveSampleView').click();
 el('familyCSV').onclick=()=>{
  const {family,hood,view}=familyContext(),xyz=decodeFamilyCoordinates(view,hood.size),color=familyColorModel(hood,familySelection),quote=x=>'"'+String(x).replaceAll('"','""')+'"';
  const rows=[['family_revision','collection','anchor','size','embedding','profile_id','source_records','reference_abundance','x','y','z','color_mode','reference_coverage','state_id','state_label','color_reference'],...hood.profileIds.map((id,i)=>[family.revision,hood.collection,hood.anchor,hood.size,view.id,id,hood.multiplicity[i],hood.abundance[i],xyz[0][i],xyz[1][i],xyz[2][i],color.mode,color.mode==='abundance'?'':color.coverage??'',color.states[i]??'',color.labels[i],color.reference?.revision||''])];
  if(hood.referenceEligibilityRevision){rows[0].push('reference_eligibility_revision');rows.slice(1).forEach(row=>row.push(hood.referenceEligibilityRevision))}
  familyDownload(hood.key.replaceAll('|','-')+'.csv',rows.map(r=>r.map(quote).join(',')).join('\n'),'text/csv');
 };
 el('familyProvenance').onclick=()=>{const {family,hood,view,key}=familyContext();const {coordinates,...metadata}=view;const {mode,coverage,note,reference}=familyColorModel(hood,familySelection);familyDownload('neighborhood-provenance.json',JSON.stringify({family:family.id,revision:family.revision,referenceEligibilityRevision:hood.referenceEligibilityRevision,principalPaths:typeof principalReference==='function'?{reference:principalReference(hood,familySelection),model:familySelection.principalModel,path:familySelection.principalPath}:null,selectionRule:family.selectionRule,limitations:family.limitations,collection:hood.collection,collectionRevision:family.collections[hood.collection].revision,anchor:hood.anchor,size:hood.size,profileIds:hood.profileIds,view:metadata,coloring:{mode,coverage:mode==='abundance'?null:coverage,note,reference},referenceVertices:familySelection.showVertices?{...familyVertexModel(hood,familySelection),appearance:familyReferenceAppearance(familySelection.vertexAppearance),labelSize:familySelection.vertexLabelSize,labelOffsets:familyViewLabelOffsets(familySelection,key)}:null},null,2))};
 el('familySave').onclick=()=>{try{const name=el('familyViewName').value.trim();if(!name)throw Error('Enter a view name');const b=validateFamilyBookmark(familyBookmark(name)),list=readFamilyViews();list.push(b);localStorage.setItem(familyViewsKey,JSON.stringify(list));refreshFamilyBookmarks();el('familyStatus').textContent='Saved '+name}catch(error){report(error)}};
 el('familyRestore').onclick=()=>{try{if(el('familySavedViews').value==='')throw Error('Choose a saved view');const b=validateFamilyBookmark(readFamilyViews()[Number(el('familySavedViews').value)]);activateEmbeddingFamily(b.family,b).catch(report)}catch(error){report(error)}};
 el('familyExportView').onclick=()=>familyDownload('neighborhood-view.json',JSON.stringify(familyBookmark(el('familyViewName').value.trim()||el('familyTitle').textContent),null,2));
 el('familyImportView').onclick=()=>el('familyViewFile').click();
 el('familyViewFile').onchange=async()=>{try{const file=el('familyViewFile').files?.[0];if(!file)return;if(file.size>1024*1024)throw Error('View JSON must be under 1 MiB');const b=JSON.parse(await file.text());await activateEmbeddingFamily(b.family,b);el('familyViewName').value=b.name;el('familyStatus').textContent='Restored imported view; use Save new view to keep it'}catch(error){report(error)}finally{el('familyViewFile').value=''}};
 // Attach only after Plotly has initialized the event emitter.
 const originalRender=renderFamily;
 let clickInstalled=false;
 renderFamily=function(camera){return originalRender(camera).then(()=>{
  if(clickInstalled||!el('familyPlot').on)return;clickInstalled=true;
  installFamilyPicking(el('familyPlot'),p=>{
   if(!activeEmbeddingFamily)return;const ctx=familyContext();if(p?.data?.meta?.familyKey!==ctx.key)return;
   const i=p.customdata;if(!Number.isInteger(i)||i<0||i>=ctx.hood.size)return;
   if(p.data.meta.familyReference){
    const vertices=familyVertexModel(ctx.hood,familySelection).vertices.filter(v=>v.index===i&&current().nodes.some(n=>n.id===v.feature));
    if(vertices.length===1)selectVertex(vertices[0].feature);
    else if(vertices.length>1){el('familySelected').innerHTML='Choose a feature at this shared reference: '+vertices.map(v=>`<button data-family-vertex="${v.feature}">${esc(v.label)}</button>`).join('');return}
   }else if(typeof principalModel==='function'&&principalModel(ctx.hood,familySelection)){
    familySelection.principalProfile=ctx.hood.profileIds[i];syncFamilySelectors();renderFamily(familyCamera()).catch(report);
   }else{
    const linked=familyGraphMembership(ctx.hood,familyGraphState());
    if(p.data.meta.familyRing)focusEdgeFace(linked.triples[i]);
    else if(rank3UsesSamples()&&linked.triples[i])selectRank3(linked.triples[i]);
    else if(current().edges.some(e=>e.id===linked.pairs[i]))select(linked.pairs[i]);
   }
   familyRenderQueue.then(()=>{if(activeEmbeddingFamily&&familyContext().key===ctx.key)el('familySelected').innerHTML=p.text});
  });
 })};
 el('familySelected').onclick=e=>{const button=e.target.closest('[data-family-vertex]');if(button)selectVertex(Number(button.dataset.familyVertex))};
 if(typeof installPrincipalPaths==='function')installPrincipalPaths();
 if(embeddingFamilyRegistry.has(requestedDataset))activateEmbeddingFamily(requestedDataset).catch(report);
}
