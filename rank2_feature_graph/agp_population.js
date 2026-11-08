// Browser-local display state only: never store samples, memberships or fitted coordinates.
function agpViewPreferences(data){
 const key='cosmix-agp-view-v1:'+encodeURIComponent(data.id),identity=[data.countSha256,data.featureSha256];
 const ids=['sampleColorScheme','agpStateScheme','sampleMethod','stateMode','unfoldFaces','participantShowVertices','agpShowBackground',
  'sampleReferenceSpheres','sampleReferenceScale','sampleReferenceColor','sampleReferenceSphereAmbient',
  'sampleReferenceSphereHighlights','participantVertexLabelSize','graphEdgeLengths','graphEmbeddingMethod',
  'graphProportionStrength','graphSpheres','graphSphereAmbient','graphSphereHighlights','graphVertexScale',
  'vertexLabels','graphVertexColor','graphEdgeColor','graphWidthBySize','graphEdgeWidth','graphWidthStrength',
  'graphFadeBySize','graphFadeStrength','graphDegreeFilter','graphMinimumDegree','agpConnectionNeighbors',
  'agpConnectionPure','agpConnectionMeasure','agpConnectionBoundary','agpConnectionMinWeight','agpConnectionMinSamples','agpConnectionLengths',...AgpOutcomes.controls];
 const detailIds=['dataControls','sampleAppearance','sampleAppearanceVertices','graphVertexCharacteristics','agpConnectionHelp','agpEmbeddingDetails','agpColorControls'];
 const el=id=>document.getElementById(id);
 let saved={},ready=false,snapshot=()=>({}),views=new Map();
 try{
  const value=JSON.parse(localStorage.getItem(key));
  if(value?.version===1&&JSON.stringify(value.identity)===JSON.stringify(identity))saved=value;
 }catch{}
 // Migrate the old independent outcome checkbox without losing the selected CST scheme.
 if(saved.controls&&!Object.hasOwn(saved.controls,'agpStateScheme')){
  const scheme=saved.controls.sampleColorScheme;
  if(data.schemes[scheme]){
   saved.controls.agpStateScheme=scheme;
   if(saved.controls.agpOutcomeEnabled===true)saved.controls.sampleColorScheme=AgpOutcomes.colorValue;
  }
 }
 const camera=value=>{
  if(!value||!['eye','center','up'].every(k=>['x','y','z'].every(a=>Number.isFinite(value[k]?.[a])&&Math.abs(value[k][a])<1e6)))return null;
  const result=Object.fromEntries(['eye','center','up'].map(k=>[k,Object.fromEntries(['x','y','z'].map(a=>[a,value[k][a]]))]));
  if(['perspective','orthographic'].includes(value.projection?.type))result.projection={type:value.projection.type};
  return result;
 };
 const validView=value=>{
  const c=camera(value?.camera);
  if(c)return {camera:c};
  if(['x','y'].every(a=>Array.isArray(value?.[a])&&value[a].length===2&&value[a].every(Number.isFinite)&&value[a][0]!==value[a][1]))return {x:[...value.x],y:[...value.y]};
  return null;
 };
 for(const [frame,value] of Object.entries(saved.views||{}).slice(-120)){
  const view=validView(value);if(frame.length<300&&view)views.set(frame,view);
 }
 function remember(plot){
  if(!plot?._agpFrame)return;
  const scene=plot._fullLayout?.scene?._scene;
  const value=validView(scene?{camera:scene.getCamera()}:{x:plot._fullLayout?.xaxis?.range,y:plot._fullLayout?.yaxis?.range});
  if(value){views.delete(plot._agpFrame);views.set(plot._agpFrame,value)}
  while(views.size>120)views.delete(views.keys().next().value);
 }
 function save(){
  if(!ready)return;
  const controls=Object.fromEntries(ids.map(id=>{const node=el(id);return [id,node.type==='checkbox'?node.checked:node.value]}));
  const details=Object.fromEntries(detailIds.map(id=>[id,el(id).open]));
  try{localStorage.setItem(key,JSON.stringify({version:1,identity,controls,details,graph:snapshot(),views:Object.fromEntries(views),
   collapsed:el('explorerLayout').classList.contains('controlsCollapsed'),
   expanded:['samplePanel','featurePanel'].filter(id=>el(id).classList.contains('agpExpanded'))}))}catch{}
 }
 return {
  graph:saved.graph,
  restore(){
   for(const id of ids){
    const node=el(id),value=saved.controls?.[id];
    if(node.type==='checkbox'){if(typeof value==='boolean')node.checked=value}
    else if(typeof value==='string'){
     if(node.tagName==='SELECT'){if([...node.options].some(o=>o.value===value&&!o.disabled))node.value=value}
     else if(node.type==='color'){if(/^#[0-9a-f]{6}$/i.test(value))node.value=value}
     else if(['range','number'].includes(node.type)&&value.trim()&&Number.isFinite(Number(value))){
      const min=node.min===''?-1e6:Number(node.min),max=node.max===''?1e6:Number(node.max),step=Number(node.step)||1;
      const base=Number.isFinite(min)?min:0;
      node.value=String(Number(Math.max(min,Math.min(max,base+Math.round((Number(value)-base)/step)*step)).toFixed(12)));
     }
    }
   }
   if(saved.controls?.sampleColorScheme===AgpOutcomes.colorValue&&el('sampleColorScheme').value!==AgpOutcomes.colorValue)
    el('sampleColorScheme').value=el('agpStateScheme').value;
   for(const id of detailIds)if(typeof saved.details?.[id]==='boolean')el(id).open=saved.details[id];
   if(typeof saved.collapsed==='boolean'){
    el('explorerLayout').classList.toggle('controlsCollapsed',saved.collapsed);el('controlSections').hidden=saved.collapsed;
    el('toggleControls').textContent=saved.collapsed?'›':'‹';el('toggleControls').setAttribute('aria-expanded',String(!saved.collapsed));
   }
   for(const id of ['samplePanel','featurePanel'])if(Array.isArray(saved.expanded)&&saved.expanded.includes(id)){
    el(id).classList.add('agpExpanded');const button=el('maximize-'+id);button.textContent='Restore';button.setAttribute('aria-expanded','true');
   }
  },
  view(plot,frame){
   plot._agpFrame=plot.id+'/'+frame;
   return views.get(plot._agpFrame)||{};
  },
  watch(plot){
   if(plot._agpRememberView)return;plot._agpRememberView=true;
   plot.on('plotly_relayout',event=>{
    if(Object.keys(event).some(k=>k.startsWith('scene.camera')||/^[xy]axis\.(range|autorange)/.test(k))){remember(plot);save()}
   });
  },
  install(graphSnapshot){
   snapshot=graphSnapshot;ready=true;
   for(const event of ['input','change','click'])document.addEventListener(event,e=>{
    if(e.target.closest?.('#samplePanel,#featurePanel,#agpOutcomeControls')||e.target.id==='toggleControls')save();
   });
   document.addEventListener('toggle',e=>{if(detailIds.includes(e.target.id))save()},true);
   const flush=()=>{remember(el('samples'));remember(el('graph3d'));save()};
   window.addEventListener('pagehide',flush);
   document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
   save();
  },save
 };
}

// AGP colors and filters are assignments in abundance space. Coordinates come from the saved population fit.
async function showAgpPopulation(data, choices, references, graphLayouts, localFits, localBank, unfoldedBank, connectionBank, mergedConnections, connectionLayouts, outcomeBank){
 connectionBank=AgpConnections.validate(connectionBank,data);
 if(connectionBank)connectionBank.merged=AgpConnections.validateMerged(mergedConnections,data);
 connectionLayouts=AgpConnectionLayouts.validate(connectionLayouts,data);
 const preferences=agpViewPreferences(data);
 const el=id=>document.getElementById(id), method=el('sampleMethod'),color=el('sampleColorScheme'),
       assign=el('stateMode'),plot=el('samples'),info=el('sampleContext'),selector=el('datasetSelect');
 const title=choices.find(item=>item.id===data.id).title;
 document.title='MiCOVE — '+title;el('sampleTitle').textContent=title;
 const header=el('samplePanel').querySelector('.sampleHeaderActions');
 const labels=el('participantShowVertices'),labelControl=labels.closest('label');
 labelControl.lastChild.textContent=' Component labels';
 labelControl.title=references?'Label each component at its highest observed relative abundance in the full AGP population.':'Install component-references.json beside the AGP population to enable observed reference positions.';
 labels.checked=false;labels.disabled=!references;
 const navigation=header.querySelector('.sampleHeaderNavigation'),save=el('saveSampleView');
 const unfold=el('unfoldFaces')||document.createElement('input');
 const unfoldControl=unfold.closest('label')||document.createElement('label');
 if(!unfold.id){
  unfold.type='checkbox';unfold.id='unfoldFaces';unfoldControl.append(unfold,' Unfold faces');
 }
 unfold.checked=false;
 const background=document.createElement('input'),backgroundControl=document.createElement('label');
 background.type='checkbox';background.id='agpShowBackground';background.checked=true;
 backgroundControl.append(background,' Show background samples');backgroundControl.hidden=true;
 backgroundControl.title='Keep samples outside the selected graph boundary in gray for context. Turn off to show only selected samples, at the same saved coordinates. A 1-CST edge connects boundary samples from both endpoint states.';
 const colorLabel=color.closest('label'),assignLabel=assign.closest('label'),methodLabel=method.closest('label');
 header.replaceChildren(navigation,save);
 el('controlSections').replaceChildren(el('dataControls'));
 el('cohortControl').hidden=true;
 el('datasetMessage').textContent=data.ids.length.toLocaleString()+' fecal samples · 340 SILVA taxa';
 const workspace=el('panelWorkspace');
 workspace.replaceChildren(el('samplePanel'),el('featurePanel'));
 const sheet=document.createElement('style');
 sheet.textContent=`
 #panelWorkspace.agpWorkspace{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:8px}
 #panelWorkspace.agpWorkspace>#samplePanel{grid-area:1/1}#panelWorkspace.agpWorkspace>#featurePanel{grid-area:1/2}
 .agpWorkspace #graphContent{grid-template-columns:minmax(0,1fr) minmax(145px,32%);gap:5px}
 .agpWorkspace #graphPlotArea{display:block;overflow:auto}
 .agpWorkspace #graphDetails{grid-column:2}
 .agpWorkspace #agpConnectionControls{min-width:0;padding:6px;margin:8px 0}
 .agpWorkspace #agpConnectionControls label{display:grid;gap:3px;margin:7px 0}
 .agpWorkspace #agpConnectionControls select,.agpWorkspace #agpConnectionControls input,.agpWorkspace #agpConnectionPicker{width:100%;min-width:0;box-sizing:border-box}
 .agpWorkspace #agpConnectionDetails{padding:8px;font-size:12px;overflow-wrap:break-word}
 .agpWorkspace #agpConnectionDetails td:not(:first-child){white-space:nowrap}
 .agpWorkspace #agpConnectionDetails table{font-size:11px;table-layout:fixed}
 .agpWorkspace #agpConnectionDetails th,.agpWorkspace #agpConnectionDetails td{padding:5px 2px}
 .agpWorkspace #agpConnectionDetails th:first-child{width:44%}
 .agpWorkspace #agpConnectionDetails th:nth-child(2){width:34%}
 .agpWorkspace #agpConnectionDetails td:first-child{overflow-wrap:anywhere}
 .agpWorkspace #agpConnectionDetails>label{display:grid;gap:4px}
 .agpWorkspace #agpConnectionControls p{font-size:12px}
 .agpWorkspace #sampleContent{grid-template-columns:minmax(0,1fr) minmax(210px,32%);grid-template-rows:minmax(0,1fr)}
 .agpWorkspace #sampleSidePanels{grid-column:2;grid-row:1}
 .agpWorkspace #sampleDetails>label{display:grid;gap:4px;margin:8px;font-size:12px}
 .agpWorkspace #sampleDetails>label.agpCheck{display:flex;align-items:center;gap:5px}
 .agpWorkspace #sampleDetails>label[hidden]{display:none}
 .agpWorkspace #sampleDetails>label select{width:100%;max-width:100%;min-width:0;box-sizing:border-box;font-size:12px}
 .agpWorkspace :is(#agpColorControls,#agpStateGraphControls){padding:8px;font-size:12px}
 .agpWorkspace :is(#agpColorControls,#agpStateGraphControls)>label{display:grid;gap:4px;margin:9px 0;max-width:100%}
 .agpWorkspace :is(#agpColorControls,#agpStateGraphControls)>label.agpCheck{display:flex;align-items:center;gap:5px;white-space:normal}
 .agpWorkspace #agpColorControls label[hidden],.agpWorkspace #agpOutcomeControls[hidden],.agpWorkspace #agpStateGraphControls[hidden]{display:none}
 .agpWorkspace :is(#agpColorControls,#agpStateGraphControls) select{width:100%;max-width:100%;min-width:0;box-sizing:border-box;font-size:12px}
 .agpWorkspace #agpStateGraphControls{border-bottom:1px solid #c9d9df}
 .agpWorkspace .sampleHeaderActions label{display:inline-flex;gap:4px;align-items:center;font-size:12px}
 .agpWorkspace .sampleHeaderActions label[hidden]{display:none}
 .agpWorkspace .agpExpanded{position:fixed!important;inset:0;z-index:1000;background:white}
 @container (max-width:480px){
   .agpWorkspace #sampleContent{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(90px,28%)}
   .agpWorkspace #sampleSidePanels{grid-column:1;grid-row:2}
 }
 @media(max-width:1050px){#panelWorkspace.agpWorkspace{display:flex;flex-direction:column;overflow:auto}.agpWorkspace>.card{flex:0 0 70vh}}
 `;
 document.head.append(sheet);workspace.classList.add('agpWorkspace');
 const appearance=el('sampleAppearanceVertices'),side=el('sampleDetails');
 const spheres=el('sampleReferenceSpheres'),scale=el('sampleReferenceScale'),tint=el('sampleReferenceColor'),
       ambient=el('sampleReferenceSphereAmbient'),highlights=el('sampleReferenceSphereHighlights'),fontSize=el('participantVertexLabelSize');
 const group=el('sampleAppearance');
 const coloring=document.createElement('details');coloring.id='agpColorControls';coloring.open=true;
 const coloringTitle=document.createElement('summary');coloringTitle.textContent='Sample coloring';
 const stateScheme=document.createElement('select'),schemeLabel=document.createElement('label');stateScheme.id='agpStateScheme';
 schemeLabel.append('States and graph',stateScheme);schemeLabel.hidden=true;
 schemeLabel.title='The CST scheme used for sample membership, the graph and local fits. Outcome probability changes colors only; this selection remains independent.';
 assignLabel.classList.add('agpCheck');
 coloring.append(coloringTitle,colorLabel,schemeLabel,assignLabel);
 appearance.querySelector('summary').after(labelControl);
 unfoldControl.classList.add('agpCheck');
 backgroundControl.classList.add('agpCheck');
 group.replaceChildren(group.querySelector('summary'),appearance);side.replaceChildren(methodLabel,unfoldControl,backgroundControl,coloring,group);
 el('sampleSidePanels').replaceChildren(side,info);info.style.padding='8px';
 el('sampleInfoDivider').remove();
 el('sampleContent').removeAttribute('data-legend-position');

 const url=new URL(location.href);url.searchParams.set('dataset',data.id);history.replaceState(null,'',url);
 selector.value=data.id;selector.onchange=()=>{url.searchParams.set('dataset',selector.value);location.assign(url.href)};
 const stress=el('sampleStress');
 stress.removeAttribute('aria-haspopup');
 stress.onclick=()=>{details.open=!details.open};
 const details=document.createElement('details');details.id='agpEmbeddingDetails';
 const summary=document.createElement('summary');summary.textContent='How the embedding was evaluated';
 const formula=document.createElement('p');
 const populationFormula=bank=>'The reported error is 100 × √mean[((3D distance − original distance) / original distance)²] over '+bank.evaluatedPairs.toLocaleString()+' held-out pairs. All three maps use Euclidean distance on screen. The original distance follows the selected method. This fit used '+(bank.pivots||4000).toLocaleString()+' pivots and '+(bank.epochs||200)+' epochs.'+
  (bank.nearbyError!==undefined?' On the separate nearby-pair set, error is '+bank.nearbyError.toFixed(2)+'%. Top-10 neighbor recovery is '+bank.recall10.toFixed(2)+'%. These results use one initialization seed.':'');
 details.append(summary,formula);
 for(const control of [selector,color,method,assign,stress,el('toggleControls')])control.disabled=false;
 el('toggleControls').onclick=()=>{
  const collapsed=el('explorerLayout').classList.toggle('controlsCollapsed');
  el('controlSections').hidden=collapsed;el('toggleControls').textContent=collapsed?'›':'‹';
  el('toggleControls').setAttribute('aria-expanded',String(!collapsed));
  requestAnimationFrame(()=>Plotly.Plots.resize(plot));
 };
 method.replaceChildren(new Option('L1-normalized · Euclidean','l1-euclidean'),new Option('Max-normalized · Euclidean','max-euclidean'),new Option('Max-normalized · L∞','max-linf'));
 color.replaceChildren(...Object.entries(data.schemes).map(([key,s])=>new Option(s.k+'-CSTs · '+s.q+'% coverage',key)));
 stateScheme.replaceChildren(...Object.entries(data.schemes).map(([key,s])=>new Option(s.k+'-CSTs · '+s.q+'% coverage',key)));
 color.title='Choose CST colors or saved outcome probabilities. Switching to outcome probability preserves the current CST scheme, selection and embedding.';
 assign.checked=true;
 const palette=['#0072b2','#d55e00','#009e73','#cc79a7','#7158a5','#ab7512','#138d9c','#914c57'];
 const stateColors=new Map();
 for(const scheme of Object.values(data.schemes))for(const state of scheme.cores){
  if(!stateColors.has(state)){const i=stateColors.size;stateColors.set(state,palette[i]||('hsl('+Math.round(i*137.508%360)+',55%,'+(35+10*(i%3))+'%)'))}
 }
 const outcomes=AgpOutcomes.install(outcomeBank,data,coloring,()=>draw(),color);
 const rows=new Map(data.ids.map((id,i)=>[id,i]));
 const graph=agpGraphPanel(data,references,rows,graphLayouts,connectionBank,preferences,connectionLayouts);
 const graphStateControls=document.createElement('div');graphStateControls.id='agpStateGraphControls';graphStateControls.hidden=true;
 el('graphDetails').prepend(graphStateControls);
 const openExport=installPngExportDialog(el,async()=>{
  await sampleReady;
  const clone=x=>JSON.parse(JSON.stringify(x)),layout=clone(plot.layout);
  layout.scene=pngExportScene(plot,clone(plot._fullLayout.scene._scene.getCamera()));
  const width=Math.max(1,plot.clientWidth),height=Math.max(1,plot.clientHeight);
  Object.assign(layout,{width,height,autosize:false});
  const s=data.schemes[stateScheme.value],selected=graph.selection();
  const rows=[{text:stateScheme.selectedOptions[0].textContent+' · '+(assign.checked?'Assigned and core samples':'Core samples only')},
   {text:plot.data.filter(t=>t.meta?.agpSamples).reduce((n,t)=>n+t.ids.length,0).toLocaleString()+' samples displayed'}];
  const outcome=outcomes.current();
  if(outcome.active)rows.push({text:outcome.title},{text:outcome.description},{text:outcome.baselineDescription},{text:outcome.scale.description},{text:'Gray: unavailable or selection context.'});
  if(selected&&!localViewActive)rows.push({text:background.checked?'Background samples shown':'Background samples hidden'});
  if(selected)rows.push({text:'Selected '+(selected.edge?'state: ':'vertex: ')+selected.name});
  for(const tr of Array.from(info.querySelector('table').rows).slice(1)){
   const cells=tr.cells;rows.push({text:cells[0].textContent+' · '+cells[3].textContent+' samples ('+cells[4].textContent+'%)',color:cells[0].firstElementChild.style.backgroundColor});
  }
  return {width,height,layout,data:clone(plot.data),rows,title:el('sampleTitle').textContent+' · '+method.selectedOptions[0].textContent,
   filename:'micove-agp-samples-'+method.value+'-'+s.q+'pct-'+s.k+'cst-'+Date.now()};
 });
 el('viewExportClose').disabled=false;save.disabled=false;save.onclick=()=>openExport('samples');
 const ranges=new Map();
 const resize=()=>{Plotly.Plots.resize(plot);graph.resize()};
 for(const [panel,button] of [[el('featurePanel'),el('maximize-featurePanel')],[el('samplePanel'),document.createElement('button')]]){
  if(!button.isConnected){button.id='maximize-'+panel.id;button.type='button';button.className='maximizePanel';button.textContent='⛶ Maximize';header.append(button)}
  button.disabled=false;button.onclick=()=>{
   const open=panel.classList.toggle('agpExpanded');
   button.textContent=open?'Restore':'⛶ Maximize';button.setAttribute('aria-expanded',String(open));
   requestAnimationFrame(resize);
  };
 }
 new ResizeObserver(resize).observe(workspace);
 let renderSamples,sampleReady,localViewActive=false;
 async function draw(){
  if(data.schemes[color.value])stateScheme.value=color.value;
  const outcomeColoring=color.value===AgpOutcomes.colorValue;
  schemeLabel.hidden=!outcomeColoring;
  graphStateControls.hidden=!outcomeColoring;
  const stateControlParent=outcomeColoring?graphStateControls:coloring;
  if(assignLabel.parentElement!==stateControlParent){
   if(outcomeColoring)graphStateControls.append(schemeLabel,assignLabel);
   else colorLabel.after(schemeLabel,assignLabel);
  }
  const s=data.schemes[stateScheme.value];
  graph.begin(s,method.value);
  const selected=graph.selection();
  const localKey=[stateScheme.value,selected?.id,assign.checked?'merged':'pure',method.value].join('/');
  const originalKey=localBank?.views[localKey];
  const ordinary=selected&&!selected.edge&&(localBank?localBank.fits[originalKey]:localFits?.[localKey]);
  const entry=ordinary&&unfoldedBank?.fits[unfoldedBank.views[localKey]];
  if(entry&&entry.original!==originalKey)throw Error('Unfolded and ordinary AGP memberships differ.');
  unfoldControl.hidden=!ordinary||!method.value.startsWith('max-');
  unfold.disabled=!entry;
  if(!entry)unfold.checked=false;
  unfoldControl.title=entry?'Rotate other dominant faces onto the selected taxon’s face.':'Install the AGP unfolded supplement to enable this view.';
  const unfolded=unfold.checked&&entry;
  const local=unfolded?.rotated?{...ordinary,coordinates:entry.coordinates,metrics:entry.metrics}:ordinary;
  localViewActive=Boolean(local);backgroundControl.hidden=!selected||Boolean(local);
  const bank=data.fits[method.value],coords=local?local.coordinates:bank.coordinates;
  const frame=local?localKey+(unfolded?.rotated?'/unfolded':''):method.value;
  const localRows=local?new Map(local.indices.map((row,index)=>[row,index])):null;
  el('sampleTitle').textContent=local?title+' · '+selected.name+' · Local 3D MDS'+(unfolded?' · Unfolded faces':''):title;
  if(selected?.connection)el('sampleTitle').textContent=title+' · Boundary: '+selected.name+' · Population map';
  const allPairsLocal=local?.metrics?.evaluationRule==='all-pairs';
  if(allPairsLocal){
   const m=local.metrics;
   const note=m.approximation==='sparse'
    ? 'Sparse metric-MDS used '+m.pivots.toLocaleString()+' pivots. Error was measured on all '+m.pairs.toLocaleString()+' pairs in this state.'
    : 'Full metric-MDS fitted all '+m.pairs.toLocaleString()+' pairs in this state.';
   formula.textContent=note+' This fit completed '+m.epochs+' SGD epochs. RMS relative error is 100 × √mean[((3D distance − original distance) / original distance)²].'+
    (m.epoch500Promotion?' This 500-epoch map replaced the earlier map because its all-pairs relative error is lower (previously '+m.epoch500Promotion.releasedError.toFixed(2)+'%). Neighbor recovery was not used to choose the replacement.':'')+
    ' Each sample retains an average of '+m.localRecall.toFixed(2)+'% of its ten original nearest neighbors in the 3D map.';
  }else formula.textContent=local?'RMS relative error compares Euclidean distances in the 3D map with original distances under the selected method. It is 100 × the square root of the mean squared relative difference. On the same '+local.metrics.pairs.toLocaleString()+' within-state pairs excluded from both fits, the local map scored '+local.metrics.localError.toFixed(2)+'% and the original epoch-200 population map scored '+local.metrics.populationError.toFixed(2)+'%. Lower is better.':populationFormula(bank);
  if(unfolded){
   formula.textContent+=' Distances use the '+method.selectedOptions[0].textContent+' geometry after unfolding around '+selected.name+'.';
   formula.textContent+=entry.rotated?' '+entry.rotated.toLocaleString()+' samples were rotated onto the anchor face. The ordinary map reports error against its own original target distances.':' Every sample already lies on the anchor face, so the ordinary coordinates apply.';
  }
  const outcome=outcomes.current();
  const xyz=[[],[],[]],colors=[],hover=[],ids=[],highlighted=[],counts=new Map(s.cores.map(key=>[key,0]));
  const coreCounts=new Map(counts);
  const displayedCounts=new Map(counts),displayedCoreCounts=new Map(counts);
  let populationCore=0;
  for(let i=0;i<data.ids.length;i++){
   const isCore=s.assignment[i]==='core',state=s.merged[i];
   if(isCore){populationCore++;coreCounts.set(state,coreCounts.get(state)+1)}
   if(!assign.checked&&!isCore)continue;
   counts.set(state,counts.get(state)+1);
   if(local&&!localRows.has(i))continue;
   const selectedSample=graph.contains(state,i);
   if(selected&&!local&&!background.checked&&!selectedSample)continue;
   displayedCounts.set(state,displayedCounts.get(state)+1);
   if(isCore)displayedCoreCounts.set(state,displayedCoreCounts.get(state)+1);
   const position=local?localRows.get(i):i;
   ids.push(data.ids[i]);highlighted.push(selectedSample);colors.push(selectedSample?stateColors.get(state):'#dedede');
   for(let j=0;j<3;j++)xyz[j].push(coords[position][j]);
   hover.push([s.labels[state],isCore?'Original core member':s.assignment[i]==='rank-support'?'Assigned by rank '+(s.k+1)+' support':'Assigned by neighbor vote']);
  }
  info.replaceChildren();
  function add(tag,value){const node=document.createElement(tag);node.textContent=value;info.append(node);return node}
  add('h3',stateScheme.selectedOptions[0].textContent);
  if(outcome.active){
   add('h3',outcome.title);add('p',outcome.description);
   const values=ids.map(id=>outcomes.lookup(id,outcome)),available=values.filter(v=>v.probability!==null).length;
   add('p',available.toLocaleString()+' estimated · '+(ids.length-available).toLocaleString()+' unavailable. Unavailable estimates are gray. Observed answers are reported separately in the hover.');
   add('p',outcome.scale.description);
   add('p',outcome.baselineDescription);
   if(outcome.scope==='state')add('p','Fitted within frozen merged 70%-1-CSTs, independently of the displayed CST coverage and pure/merged setting.');
   if(selected?.connection)add('p',background.checked?'Outcome colors highlight this graph boundary; other displayed samples are light gray context. Turn off Show background samples to hide them.':'Only boundary samples from the two connected states are shown; background samples are hidden.');
  }
  if(!outcome.active&&selected?.connection)add('p',background.checked?'Boundary samples from the two connected states retain their state colors; other displayed samples are gray. Turn off Show background samples to hide them.':'Only boundary samples from the two connected states are shown; background samples are hidden.');
  if(selected?.connection)add('p','An edge represents a boundary between two 1-CSTs, not a single state. Sample coordinates and state memberships are unchanged.');
  if(s.k===1&&(localBank||(localFits&&s.q===70))){
   if(unfolded)add('p',entry.rotated?'Unfolded around '+selected.name+' · '+entry.rotated.toLocaleString()+' samples rotated.':'Every sample lies on the anchor face. Both views use the same coordinates.');
   if(local)add('p','Local fit of '+(assign.checked?'the merged state':'the pure state')+'. Clear selection to return to the population map.');
   else if(localBank)add('p','Select a taxon in the graph to open its local 3D fit.');
   else add('p','Select Bacteroides dorei or Akkermansia muciniphila in the graph to open its local 3D fit.');
  }
  const core=[...displayedCoreCounts.values()].reduce((a,b)=>a+b,0);
  if(!local)add('p',populationCore.toLocaleString()+' of '+data.ids.length.toLocaleString()+' samples are original core members ('+(100*populationCore/data.ids.length).toFixed(2)+'%).');
  add('p',ids.length.toLocaleString()+' samples displayed · '+(ids.length-core).toLocaleString()+' assigned from other states');
  if(!ids.length)add('p','No selected boundary samples pass the current sample filter. Show background samples or change the graph/sample membership settings to see context.');
  const table=document.createElement('table');table.style.width='100%';const head=table.createTHead().insertRow();
  for(const name of ['Retained state','Core','Assigned','n','%']){const th=document.createElement('th');th.textContent=name;head.append(th)}
  for(const state of local?[selected.id]:s.cores){
   const n=displayedCounts.get(state),c=displayedCoreCounts.get(state);if(!n)continue;
   const tr=table.insertRow(),label=tr.insertCell();
   const swatch=document.createElement('span');swatch.style.cssText='display:inline-block;width:10px;height:10px;margin-right:4px;background:'+stateColors.get(state);
   label.append(swatch,s.labels[state]);
   for(const v of [c,n-c,n,(100*n/data.ids.length).toFixed(2)])tr.insertCell().textContent=v.toLocaleString();
  }
  info.append(table);add('small','Counts describe displayed samples. Percentages use all 24,421 samples. A merged label names its retained core.');info.append(details);
  stress.textContent='RMS relative error: '+(local?local.metrics.localError:bank.error).toFixed(2)+(allPairsLocal?'% (all pairs)':'% (held-out pairs)');
  if(!ranges.has(frame))ranges.set(frame,[0,1,2].map(j=>{
   const column=coords.map(v=>v[j]),lo=Math.min(...column),hi=Math.max(...column),pad=(hi-lo)*0.05;
   return [lo-pad,hi+pad];
  }));
  const [xaxis,yaxis,zaxis]=ranges.get(frame).map(range=>({range,visible:false}));
  const samples={type:'scatter3d',meta:{agpSamples:true},mode:'markers',x:xyz[0],y:xyz[1],z:xyz[2],ids,
    marker:{size:2.5,color:colors,opacity:0.8},customdata:hover,text:ids,
    hovertemplate:'%{text}<br>%{customdata[0]}<br>%{customdata[1]}<extra></extra>'};
  const components=local?[selected.id].filter(id=>references&&localRows.has(rows.get(references[id].sample))):[...new Set(s.cores.flatMap(state=>state.split(',')))];
  labels.disabled=!references||!components.length;
  const span=Math.max(...ranges.get(frame).map(([lo,hi])=>(hi-lo)/1.1))||1;
  renderSamples=()=>{
   const visible=Boolean(labels.checked&&!labels.disabled),lit=visible&&spheres.checked;
   for(const input of [spheres,scale,tint,fontSize])input.disabled=!visible;
   for(const input of [ambient,highlights])input.disabled=!lit;
   for(const input of [scale,ambient,highlights,fontSize])el(input.id+'Value').value=input.value+(input===fontSize?' px':'%');
   const note=el('sampleReferenceNote');
   note.hidden=visible;note.textContent=local&&!components.length?'The observed reference sample is outside this local fit.':references?'Turn on Component labels to show reference vertices.':labelControl.title;
   const traces=outcomes.annotate(samples,outcome,highlighted),annotations=[];
   if(visible){
    const anchors=components.map(t=>references[t]),p=anchors.map(a=>coords[local?localRows.get(rows.get(a.sample)):rows.get(a.sample)]);
    const size=5*Number(scale.value)/100;
    const hovertemplate='%{text}<br>Maximum relative abundance: %{customdata[1]}%<br>%{customdata[0]}<extra></extra>';
    const hoverData=anchors.map(a=>[a.sample,(100*a.count/a.total).toFixed(2)]);
    anchors.forEach((a,i)=>{
     annotations.push({x:p[i][0],y:p[i][1],z:p[i][2],text:a.label,
      ax:i%2===0?18:-18,ay:i%3===0?16:-16,xanchor:i%2===0?'left':'right',
      showarrow:true,arrowhead:0,arrowwidth:1,arrowcolor:'#78909c',bgcolor:'rgba(255,255,255,.85)',font:{size:Number(fontSize.value)}});
     if(lit){
      const mesh=vertexSphereMesh(p[i],size*span/600,{ambient:Number(ambient.value),highlights:Number(highlights.value)});
      traces.push({...mesh,meta:{componentReferences:true,component:components[i]},color:tint.value,
       text:a.label,customdata:mesh.x.map(()=>hoverData[i]),hovertemplate});
     }
    });
    if(!lit)traces.push({type:'scatter3d',mode:'markers',meta:{componentReferences:true},
     x:p.map(v=>v[0]),y:p.map(v=>v[1]),z:p.map(v=>v[2]),text:anchors.map(a=>a.label),
     marker:{size,symbol:'diamond',color:tint.value},customdata:hoverData,hovertemplate});
   }
   const view=preferences.view(plot,frame);
   return sampleReady=Plotly.react(plot,traces,
    {showlegend:false,margin:{l:0,r:outcome.active?60:0,b:0,t:0},uirevision:frame,scene:{aspectmode:'data',xaxis,yaxis,zaxis,annotations,...(view.camera?{camera:view.camera}:{})}},
    {responsive:true,displaylogo:false}).then(()=>preferences.watch(plot));
  };
  // The connection bank describes pure cores, independently of sample assignment.
  await Promise.all([renderSamples(),graph.update(s,connectionBank&&s.k===1?coreCounts:counts,method.value)]);
  preferences.save();
 }
 for(const control of [method,color,assign,unfold,background,stateScheme])control.onchange=draw;
 for(const control of [labels,spheres])control.onchange=()=>renderSamples();
 for(const control of [scale,tint,ambient,highlights,fontSize])control.oninput=()=>renderSamples();
 graph.onSelect(draw);
 // Options and local/connection controls must exist before restoring their values.
 info.append(details);preferences.restore();
 await draw();
 preferences.install(graph.snapshot);
}

// State counts come from the same retained-state memberships as the sample panel.
function agpGraphPanel(data,references,rows,bank,connections,preferences,connectionLayouts){
 const el=id=>document.getElementById(id);
 const plot=el('graph3d'),area=el('graphPlotArea'),toolbar=el('graphDetails').querySelector('.graphToolbar');
 const layout=document.createElement('select');
 layout.id='agpGraphLayout';
 layout.add(new Option('State diagram · 2D','diagram'));
 if(references)layout.add(new Option('Population metric-MDS · 3D','reference'));
 const fitted=new Option('Graph edge-layout · 3D','graph');
 if(bank||connectionLayouts)layout.add(fitted);
 const lengths=el('graphEdgeLengths'),algo=el('graphEmbeddingMethod'),strength=el('graphProportionStrength');
 const spheres=el('graphSpheres'),ambient=el('graphSphereAmbient'),highlights=el('graphSphereHighlights');
 const fitControls=[lengths,strength,algo],sphereControls=[spheres,ambient,highlights];
 let pairLayout=bank?'graph':'diagram',previousAlgorithm='weighted_grip',singleLayout=references?'reference':'diagram';
 const previous=preferences.graph;
 if(['diagram',...(references?['reference']:[]),...(bank?['graph']:[])].includes(previous?.pairLayout))pairLayout=previous.pairLayout;
 if([2,3].includes(previous?.layoutRevision)&&['diagram',...(references?['reference']:[]),...(connectionLayouts?['graph']:[])].includes(previous?.singleLayout))singleLayout=previous.singleLayout;
 if(['spring','mds','grip','weighted_grip'].includes(previous?.previousAlgorithm))previousAlgorithm=previous.previousAlgorithm;
 lengths.disabled=spheres.disabled=false;lengths.value='proportion';algo.value=previousAlgorithm;
 const layoutLabel=document.createElement('label');
 layoutLabel.append('Graph layout',layout);
 const controls=['graphVertexScale','vertexLabels','graphVertexColor','graphEdgeColor','graphWidthBySize',
  'graphEdgeWidth','graphWidthStrength','graphFadeBySize','graphFadeStrength','graphDegreeFilter','graphMinimumDegree'];
 const layoutNote=document.createElement('small');
 layoutNote.id='agpGraphLayoutNote';
 const connectionLengths=document.createElement('select'),connectionLengthLabel=document.createElement('label');
 connectionLengths.id='agpConnectionLengths';
 connectionLengths.add(new Option('Equal targets (1)','equal'));
 connectionLengths.add(new Option('Stronger connections → shorter targets','connection'));
 connectionLengthLabel.append('Edge lengths',connectionLengths);
 connectionLengthLabel.title='Layout targets only. Equal uses 1. Weighted uses 1 + 4 × (1 − weight / largest weight), so targets range from 1 to 5. Connection scores and sample embeddings do not change.';
 const connectionControls=document.createElement('fieldset');connectionControls.id='agpConnectionControls';
 const heading=document.createElement('legend');heading.textContent='1-CST connections';connectionControls.append(heading);
 const pureLabel=document.createElement('label'),pureGraph=document.createElement('input');
 pureLabel.style.cssText='display:flex;align-items:center;gap:6px';pureGraph.style.cssText='width:auto;margin:0;flex:none';
 pureGraph.type='checkbox';pureGraph.id='agpConnectionPure';pureGraph.checked=!connections?.merged;
 pureLabel.append(pureGraph,' Pure 1-CST graph');
 pureLabel.title='Show the retained original leading-taxon states at the selected coverage. Unchecked: use the corresponding merged states. This changes graph counts and connections, not the sample view.';
 connectionControls.append(pureLabel);
 const control=(id,label,options)=>{
  const wrap=document.createElement('label'),input=document.createElement('select');input.id=id;
  options.forEach(([value,text])=>input.add(new Option(text,value)));wrap.append(label,input);connectionControls.append(wrap);return input;
 };
 const neighbors=control('agpConnectionNeighbors','Requested neighbors',[[10,'10'],[20,'20'],[40,'40']]);neighbors.value='20';
 const measure=control('agpConnectionMeasure','Edge measure',Object.entries(AgpConnections.measures));
 const rule=control('agpConnectionBoundary','Boundary rule',[['inclusive','Inclusive'],['two-only','Two-state only']]);
 const numeric=(id,label,value,step,max)=>{
  const wrap=document.createElement('label'),input=document.createElement('input');input.type='number';input.id=id;input.min='0';input.max=max;input.step=step;input.value=value;
  wrap.append(label,input);connectionControls.append(wrap);return input;
 };
 const minWeight=numeric('agpConnectionMinWeight','Minimum edge weight',.05,.01,1);
 const minSamples=numeric('agpConnectionMinSamples','Min boundary samples / side',5,1,data.ids.length);
 const connectionNote=document.createElement('p');connectionNote.id='agpConnectionNote';connectionControls.append(connectionNote);
 const help=document.createElement('details'),helpTitle=document.createElement('summary');help.id='agpConnectionHelp';helpTitle.textContent='How connections are measured';
 const helpText=document.createElement('div');helpText.innerHTML=`<p><strong>Which states meet through nearby samples?</strong> Neighbors use original 340-taxon profiles under the selected sample method, never the 3D map. All 24,421 samples remain eligible neighbors, including states hidden by coverage in the pure graph. The merged graph regroups these same neighbors using the selected coverage’s existing assignments; the pure graph uses the original leading-taxon labels. Each center is excluded. All distances within 10⁻¹² of the cutoff are included.</p>
 <p>For states A and B, let b<sub>A</sub> and b<sub>B</sub> count records having a neighbor in the other state; n<sub>A</sub> and n<sub>B</sub> are their state sizes. Boundary weight is their geometric mean:</p>
 <math display="block"><mi>W</mi><mo>=</mo><msqrt><mfrac><msub><mi>b</mi><mi>A</mi></msub><msub><mi>n</mi><mi>A</mi></msub></mfrac><mo>×</mo><mfrac><msub><mi>b</mi><mi>B</mi></msub><msub><mi>n</mi><mi>B</mi></msub></mfrac></msqrt></math>
 <p>Two-state only additionally requires every neighbor to belong to A or B. This rule changes the boundary weight and support counts; other measures use inclusive neighborhoods.</p>
 <p>Contact intensity is the geometric mean of the two directed means of the fraction of actual neighbors in the other state. Expanded Jaccard is |H<sub>A</sub> ∩ H<sub>B</sub>| / |H<sub>A</sub> ∪ H<sub>B</sub>|, where H is a state plus all its neighbors. Jaccard can be positive without direct contact.</p>
 <p>PAGA is min(1, C/E): C counts directed cross-state links both ways; E = (e<sub>A</sub>n<sub>B</sub> + e<sub>B</sub>n<sub>A</sub>)/(N−1), with e the total outgoing links and N = 24,421. It compares link counts with uniformly random destinations and can saturate at 1.</p>
 <p>These scores describe sample proximity, not transitions, interaction probabilities or significance. Repeated participants remain; participant counts deduplicate boundary support. A state with at most h samples must have external neighbors. Display thresholds do not recompute scores. The pure-core tie audit compares pure-state scores with exact averages over uniformly chosen fixed-size tied neighborhoods; expanded Jaccard was not averaged.</p>`;
 help.append(helpTitle,helpText);connectionControls.append(help);
 const edgeDetails=document.createElement('section');edgeDetails.id='agpConnectionDetails';
 const pickerLabel=document.createElement('label'),picker=document.createElement('select');picker.id='agpConnectionPicker';pickerLabel.append('Connection',picker);edgeDetails.append(pickerLabel);
 const edgeText=document.createElement('div');edgeText.id='agpConnectionDescription';edgeDetails.append(edgeText);
 toolbar.replaceChildren(layoutLabel,connectionLengthLabel,...fitControls.map(input=>input.closest('label')),layoutNote,
  ...sphereControls.map(input=>input.closest('label')),connectionControls,...controls.map(id=>el(id).closest('label')));
 if(!bank)layoutLabel.title='Add graph-layouts-3d.json beside population.json for the fitted 3D pair graph.';
 for(const id of controls)el(id).disabled=false;
 el('graphVertexScale').closest('label').title='Scale vertex markers. Area represents sample count for 1-CSTs and degree for 2-CSTs.';
 el('graphContent').replaceChildren(area,el('graphDetails'));
 el('graphPanelHeader').replaceChildren(el('featurePanelTitle'),el('maximize-featurePanel'));
 area.replaceChildren(plot);plot.style.display='block';
 el('graphDetails').replaceChildren(el('graphInformation'),edgeDetails,document.createElement('hr'),toolbar);
 el('graphVertexCharacteristics').open=false;
 el('graphInformationTitle').removeAttribute('title');
 const names=new Map();
 for(const s of Object.values(data.schemes)){
  if(s.k===1)for(const id of s.cores)names.set(id,s.labels[id]);
 }
 for(const [id,r] of Object.entries(references||{}))names.set(id,r.label);
 // Original population-only releases may lack the reference file. Identify pair-only
 // components by subtracting the known component names from the saved pair label.
 for(const s of Object.values(data.schemes))if(s.k===2)for(const state of s.cores){
  const ids=state.split(','),parts=s.labels[state].split(' + ');
  const missing=ids.filter(id=>!names.has(id)),other=parts.filter(name=>!ids.some(id=>names.get(id)===name));
  if(missing.length===1 && other.length===1)names.set(missing[0],other[0]);
 }
 let scheme,layoutScheme,counts,method,selected=null,notify=null,connectionEdges=[],boundaryRows=new Set(),renderRevision=0;
 const connectionMode=()=>Boolean(connections&&scheme?.k===1);
 function currentEdges(){return connectionMode()?AgpConnections.edges(connections,scheme,method,neighbors.value,measure.value,rule.value,pureGraph.checked):[]}
 function contains(state,row){return !selected || (selected.connection?boundaryRows.has(row):selected.edge?state===selected.id:state.split(',').includes(selected.id))}
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear graph selection';clear.hidden=true;
 el('graphSummary').append(clear);
 const back=el('headerBackSelection'),forward=el('headerForwardSelection'),clearHeader=el('headerClearSelection');
 let history=[null],cursor=0,pendingNavigation=previous;
 function syncNavigation(){
  selected=history[cursor];clear.hidden=!selected;clearHeader.disabled=!selected;
  back.disabled=cursor===0;forward.disabled=cursor===history.length-1;
 }
 function resetNavigation(){history=[null];cursor=0;syncNavigation()}
 function select(item){
  const next=selected?.id===item?.id && selected?.edge===item?.edge?null:item;
  if(!next&&!selected)return;
  history.splice(cursor+1,Infinity,next);cursor++;syncNavigation();notify();preferences.save();
 }
 back.onclick=()=>{if(cursor>0){cursor--;syncNavigation();notify()}};
 forward.onclick=()=>{if(cursor+1<history.length){cursor++;syncNavigation();notify()}};
 clearHeader.onclick=clear.onclick=()=>select(null);
 picker.onchange=()=>{if(picker.value)select({id:picker.value,edge:true,connection:true});else if(selected?.connection)select(null)};
 for(const input of [pureGraph,neighbors,measure,rule,minWeight,minSamples])input.onchange=()=>{
  if(input.type==='number')input.value=String(Math.max(0,Math.min(Number(input.max),Number(input.value)||0)));
  notify();
 };
 function render(){
  if(!scheme)return;
  ++renderRevision;
  const pair=scheme.k===2,useFit=layout.value==='graph'&&(pair?bank:connectionLayouts),spatial=!!useFit||layout.value==='reference';
  const vertices=new Map(),edges=[],connected=connectionMode();
  if(connected){
   pureGraph.disabled=!connections.merged;
   if(pureGraph.disabled)pureGraph.checked=true;
   const labels=pureGraph.checked?connections.pureStates:connections.merged.coverages[scheme.q].memberships;
   counts=new Map(scheme.cores.map(id=>[id,0]));
   for(const value of labels){const id=String(value);if(counts.has(id))counts.set(id,counts.get(id)+1)}
  }
  const membership=pureGraph.checked?'pure':'merged';
  fitted.hidden=false;fitted.disabled=!(pair?bank:connectionLayouts);
  fitted.textContent=pair?'Graph edge-layout · 3D':'Connection graph layout · 3D';
  for(const c of fitControls)c.closest('label').hidden=!useFit||(!pair&&c!==algo);
  connectionLengthLabel.hidden=!(useFit&&!pair);
  const saved=pair&&lengths.value==='reference';
  if(saved && algo.value!=='reference'){previousAlgorithm=algo.value;algo.value='reference'}
  if(!saved && algo.value==='reference')algo.value=previousAlgorithm;
  algo.disabled=saved;strength.disabled=lengths.value!=='proportion';
  algo.closest('label').title=pair?'Choose Equal or State proportion edge targets to compare graph drawing methods.':
   'Prepared graph-only layouts: Spring preview, SGD metric MDS, GRIP with hop hierarchy, and Weighted GRIP. These do not refit the sample embedding.';
  el('graphProportionStrengthValue').textContent=strength.value;
  const lit=spatial&&spheres.checked;
  for(const c of sphereControls)c.closest('label').hidden=!spatial;
  ambient.disabled=highlights.disabled=!lit;
  el('graphSphereAmbientValue').textContent=ambient.value+'%';
  el('graphSphereHighlightsValue').textContent=highlights.value+'%';
  for(const state of scheme.cores){
   const ids=state.split(','),n=counts.get(state);
   for(const id of ids){
    if(!vertices.has(id))vertices.set(id,{id,name:names.get(id)||('Taxon '+id),degree:0,n:0,support:0});
    const v=vertices.get(id);v.n+=n;v.support=Math.max(v.support,n);if(pair)v.degree++;
   }
   if(pair)edges.push({state,ids,n});
  }
  connectionControls.hidden=scheme.k!==1;edgeDetails.hidden=!connected;
  if(!connected)picker.value='';
  for(const input of [neighbors,measure,rule,minWeight,minSamples])input.disabled=!connected;
  rule.disabled=!connected||measure.value!=='boundary';
  connectionNote.textContent=!connections?'Install pure-1cst-connections.json with the AGP data to enable weighted connections.':'';
  if(connected){
   connectionEdges=currentEdges();
   edges.push(...AgpConnections.filter(connectionEdges,Number(minWeight.value),Number(minSamples.value)));
   for(const e of edges)for(const id of e.ids)vertices.get(id).degree++;
   const diag=AgpConnections.source(connections,scheme,pureGraph.checked).geometries[method][neighbors.value].diagnostics[scheme.q];
   connectionNote.textContent='Node sizes and connections use '+(pureGraph.checked?'retained pure 1-CST cores':scheme.q+'%-1-CST merged memberships')+'. “Assign remaining samples” changes only the 3D sample view. The whole graph remains visible with or without a selected state. All distance ties included. '+Number(neighbors.value)+' requested; '+diag.maxNeighbors.toLocaleString()+' maximum actual neighbors among displayed cores. '+diag.extraTies.toLocaleString()+' of '+diag.queries.toLocaleString()+' queries have extra ties. Filters affect drawing only.';
   if(!connections.merged)connectionNote.textContent+=' Install the merged connection supplement to compare merged states.';
   const audit=connections.tieSensitivity?.find(r=>r.h===Number(neighbors.value)&&r.q===scheme.q);
   if(pureGraph.checked&&method==='max-linf'&&audit)connectionNote.textContent+=' Fixed-size tie audit: '+audit.top20_overlap+'/'+audit.top20_count+' leading boundary connections retained; rank correlation '+audit.spearman.toFixed(3)+'.';
   if(method==='max-linf'&&!pureGraph.checked)connectionNote.textContent+=' Fixed-size tie sensitivity has not been evaluated for merged states.';
   if(method==='max-linf'&&measure.value==='paga')connectionNote.textContent+=' The pure-core audit found PAGA more sensitive to ties; stable boundary rankings do not guarantee stable PAGA values.';
   const previous=selected?.connection?selected.id:'';
   picker.replaceChildren(new Option('Choose a connection',''));
   const options=[...edges].sort((a,b)=>b.weight-a.weight||a.a-b.a||a.b-b.b);
   const chosen=connectionEdges.find(e=>e.state===previous);
   if(chosen&&!options.some(e=>e.state===previous))options.unshift(chosen);
   for(const e of options)picker.add(new Option(e.ids.map(id=>names.get(id)).join(' ↔ ')+' · '+e.weight.toFixed(3)+(edges.includes(e)?'':' (hidden by filters)'),e.state));
   picker.value=previous;edgeText.replaceChildren();
   const p=text=>{const node=document.createElement('p');node.textContent=text;edgeText.append(node)};
   if(chosen){
    p(chosen.ids.map(id=>names.get(id)).join(' ↔ '));
    p(AgpConnections.measures[measure.value]+': '+chosen.weight.toFixed(4)+(measure.value==='boundary'?' · '+rule.selectedOptions[0].textContent:''));
    const table=document.createElement('table');table.style.width='100%';const head=table.insertRow();
    for(const s of ['Boundary side','n / '+membership+'-state size','%']){const th=document.createElement('th');th.textContent=s;head.append(th)}
    for(const [id,ba,n,f] of [[chosen.a,chosen.ba,chosen.nA,chosen.fa],[chosen.b,chosen.bb,chosen.nB,chosen.fb]]){
     const row=table.insertRow();for(const value of [names.get(String(id)),ba.length.toLocaleString()+' / '+n.toLocaleString(),(100*f).toFixed(2)])row.insertCell().textContent=value;
    }edgeText.append(table);
    p(chosen.n.toLocaleString()+' boundary samples · '+chosen.participants.toLocaleString()+' known participants counted once · '+chosen.unlinked+' samples without participant IDs.');
    p(chosen.n?'Boundary samples from both endpoint states are highlighted in the population map. Use Show background samples in the 3D panel to show or hide the remaining population.':'Shared-neighborhood overlap only: there are no direct boundary samples to highlight.');
    if(chosen.nA<=Number(neighbors.value)||chosen.nB<=Number(neighbors.value))p('Small-state caution: this neighbor count forces some neighbors outside a state.');
    if(measure.value==='paga'&&chosen.paga===1)p('PAGA is capped at 1; this does not mean all samples meet.');
   }else p('Click a connection, or choose one above, to inspect both sides and highlight boundary samples.');
  }
  const all=[...vertices.values()].sort((a,b)=>b.n-a.n||Number(a.id)-Number(b.id));
  const min=(pair||connected)&&el('graphDegreeFilter').checked?Number(el('graphMinimumDegree').value):0;
  const nodes=all.filter(v=>v.degree>=min),keep=new Set(nodes.map(v=>v.id));
  const visibleEdges=edges.filter(e=>e.ids.every(id=>keep.has(id)));
  const max=Math.max(...counts.values()),scale=Number(el('graphVertexScale').value)/100;
  const largest=Math.max(...all.map(v=>v.n));
  const faded=(pair||connected)&&el('graphFadeBySize').checked,fadePower=Number(el('graphFadeStrength').value);
  for(const id of controls.slice(4))el(id).closest('label').hidden=!(pair||connected);
  el('graphEdgeColor').closest('label').hidden=!(pair||connected);
  el('graphWidthBySize').closest('label').lastChild.textContent=connected?' Width by connection weight':' Width by 2-CST size';
  el('graphFadeBySize').closest('label').lastChild.textContent=connected?' Fade weak connections':' Fade small 2-CSTs';
  const quantity=connected?'connection weight':'2-CST sample count';
  el('graphWidthBySize').closest('label').title='Scale edge width by '+quantity+' relative to the largest value among the current cores. Small edges retain a visible minimum width.';
  el('graphWidthStrength').closest('label').title='Width = 1 + (edge thickness − 1) × (relative '+quantity+') raised to this strength. Lower values make widths more similar.';
  el('graphFadeBySize').closest('label').title='Opacity follows relative '+quantity+'. Lower-degree endpoints and their labels use their largest incident edge.';
  el('graphFadeStrength').closest('label').title='Opacity = (relative '+quantity+') raised to this strength. Lower values keep more edges and vertices visible.';
  el('graphMinimumDegree').disabled=!el('graphDegreeFilter').checked;
  el('graphWidthStrength').disabled=!el('graphWidthBySize').checked;
  el('graphFadeStrength').disabled=!faded;
  for(const id of ['graphVertexScale','graphEdgeWidth','graphWidthStrength','graphFadeStrength']){
   el(id+'Value').textContent=el(id).value+({graphVertexScale:'%',graphEdgeWidth:' px'}[id]||'');
  }
  el('featurePanelTitle').textContent=connected?(pureGraph.checked?'Pure 1-CST connections · '+scheme.q+'% retained cores':scheme.q+'%-1-CST connections · merged'):scheme.q+'%-'+scheme.k+'-CST graph';
  el('graphInformationTitle').textContent=connected?'Displayed '+membership+' 1-CST graph':'Displayed '+scheme.k+'-CST graph';
  el('status').textContent=nodes.length+' of '+all.length+' component taxa'+(pair?' · '+visibleEdges.length+' of '+edges.length+' retained pairs':connected?' · '+visibleEdges.length+' of '+connectionEdges.length+' possible connections':' · one vertex per retained state');
  el('graphVertexNote').textContent=(pair?'n counts samples in incident pairs. A sample contributes to both endpoints.':connected?(pureGraph.checked?'n counts original pure-core samples, excluding samples assigned from other states.':'n counts all samples assigned to each retained core at '+scheme.q+'% coverage.'):'n counts samples in each displayed state.')+' Percentages use the full AGP population.';
  if(connected)el('graphVertexNote').textContent+=' Degree counts edges passing connection filters, before degree filtering. Vertex size represents the graph’s state sample count. Click a vertex to open its pure or merged local sample view, according to “Assign remaining samples”.';
  else el('graphVertexNote').textContent+=' Click a vertex or pair to highlight its samples.';
  const tbody=el('graphVertexRows');tbody.replaceChildren();
  for(const v of all){
   const tr=tbody.insertRow(),button=document.createElement('button');
   button.type='button';button.className='graphVertexName';button.textContent=v.name;button.onclick=()=>select({id:v.id,edge:false});
   tr.insertCell().append(button);for(const value of [v.degree,v.n.toLocaleString(),(100*v.n/data.ids.length).toFixed(2)])tr.insertCell().textContent=value;
  }
  const tick=lengths.value==='proportion'?Math.round(4*Number(strength.value)):0;
  const assignment=el('stateMode').checked?'merged':'pure';
  const key=[tick?assignment:'equal',tick,algo.value].join('/');
  const connectionKey=!pair?AgpConnectionLayouts.key(scheme.q,pureGraph.checked,method,neighbors.value,measure.value,rule.value,connectionLengths.value,algo.value):null;
  const fit=useFit?(pair?(saved?bank.reference:bank.fits[key]):connectionLayouts.fits[connectionLayouts.contexts[connectionKey]]):null;
  if(useFit&&!fit)throw Error('Missing prepared AGP graph layout. Install the matching connection-layout supplement.');
  const geometryLabel={'l1-euclidean':'L1–Euclidean','max-euclidean':'Max–Euclidean','max-linf':'Max–L∞'}[method];
  const referenceOption=[...layout.options].find(o=>o.value==='reference');
  if(referenceOption)referenceOption.textContent='Population metric-MDS · '+geometryLabel+' · 3D';
  layout.title='Population metric-MDS places each taxon at its highest-abundance observed reference sample in the selected population embedding. It does not optimize the connection graph. Graph edge-layout uses the separately named graph drawing method below.';
  layoutNote.hidden=!(useFit||layout.value==='reference');
  if(layout.value==='reference')layoutNote.textContent='Population metric-MDS (SGD), '+geometryLabel+'. Vertices use their highest-abundance observed reference samples. Positions stay fixed when coverage or graph membership changes; edges are measured in original abundance space, not this 3D layout.';
  if(useFit&&pair)layoutNote.textContent=(saved?'Saved MDS reference. Edge targets are Euclidean distances between the observed reference compositions.':
   tick?'Edge target = 1 + '+strength.value+' × pair count / largest pair count.':'All edge targets are 1.')+
   ' Relative RMS edge-length error: '+(fit.rms*100).toFixed(2)+'%.';
  if(useFit&&!pair)layoutNote.textContent=algo.selectedOptions[0].textContent+'. '+
   (connectionLengths.value==='equal'?'All positive connections have target length 1.':'Target = 1 + 4 × (1 − weight / largest weight); stronger connections have shorter targets.')+
   ' Uses every positive connection among the retained states, before display filters. Filters hide objects without moving the layout. '+
   ({spring:'Deterministic 600-step spring relaxation.',mds:'SGD metric MDS of length-weighted shortest paths: 3 starts, 500 epochs.',grip:'GRIP uses hop-count hierarchy and neighborhoods, with the chosen adjacent-edge targets.','weighted_grip':'Weighted GRIP uses length-weighted shortest paths throughout its hierarchy.'}[algo.value])+
   ' Relative RMS edge-length error: '+(100*fit.rms).toFixed(2)+'%.'+
   (fit.geodesicNormalizedRmse==null?'':' Geodesic normalized RMSE: '+(100*fit.geodesicNormalizedRmse).toFixed(2)+'%.')+
   ' Disconnected component positions are arbitrary. These are graph drawing errors, not sample embedding errors.';
  const pos=useFit?new Map((pair?bank.nodes:fit.nodes).map((id,i)=>[String(id),fit.coords[i]])):new Map(all.map((v,i)=>{
   return [v.id,spatial?data.fits[method].coordinates[rows.get(references[v.id].sample)]:
    [0,-i]];
  }));
  const maxConnection=Math.max(...connectionEdges.map(e=>e.weight),1e-12);
  const traces=[],type=spatial?'scatter3d':'scatter',axes=spatial?['x','y','z']:['x','y'];
  const coord=ids=>Object.fromEntries(axes.map((a,j)=>[a,ids.map(id=>pos.get(id)[j])]));
  const active=e=>selected && (selected.edge?e.state===selected.id:e.ids.includes(selected.id));
  const lower=new Set();
  for(const e of visibleEdges){
   const [a,b]=e.ids.map(id=>vertices.get(id));
   if(a.degree<=b.degree)lower.add(a.id);
   if(b.degree<=a.degree)lower.add(b.id);
   const ratio=connected?e.weight/maxConnection:e.n/max,width=Number(el('graphEdgeWidth').value);
   const text=connected?e.ids.map(id=>names.get(id)).join(' ↔ ')+' · '+AgpConnections.measures[measure.value]+' '+e.weight.toFixed(3)+' · boundary n '+e.ba.length+' / '+e.bb.length:scheme.labels[e.state]+' · '+e.n.toLocaleString()+' samples';
   const pick={id:e.state,edge:true,connection:connected};
   // Fold the 2D edges into arcs beside one column of non-overlapping names.
   // Sampling the line also gives users several places to click a long edge.
   const start=pos.get(a.id),end=pos.get(b.id);
   const path=Array.from({length:25},(_,i)=>{
    const t=i/24,point=start.map((v,j)=>v+(end[j]-v)*t);
    if(!spatial)point[0]=-.43*(Math.abs(start[1]-end[1])/all.length)**.65*Math.sin(Math.PI*t);
    return point;
   });
   traces.push({type,mode:'lines',meta:{agpGraphEdge:e.ids},...Object.fromEntries(axes.map((axis,j)=>[axis,path.map(p=>p[j])])),
    customdata:path.map(()=>pick),text:path.map(()=>text),hovertemplate:'%{text}<extra></extra>',
    line:{color:active(e)?'#d2691e':el('graphEdgeColor').value,width:el('graphWidthBySize').checked?1+(width-1)*ratio**Number(el('graphWidthStrength').value):width},
    opacity:faded?ratio**fadePower:1});
  }
  const showLabels=el('vertexLabels').checked;
  const sizes=nodes.map(v=>scale*(pair?8*Math.sqrt(v.degree):25*Math.sqrt(v.n/largest)));
  const opacities=nodes.map(v=>(pair||connected)&&faded&&lower.has(v.id)?
   (connected?Math.max(...connectionEdges.filter(e=>e.ids.includes(v.id)).map(e=>e.weight),0)/maxConnection:v.support/max)**fadePower:1);
  // Plotly scatter3d only accepts scalar marker opacity. Apply the fade to each color.
  const rgba=(hex,alpha)=>'rgba('+hex.slice(1).match(/../g).map(h=>parseInt(h,16)).join(',')+','+alpha+')';
  const colorFor=v=>selected?.id===v.id?'#d2691e':el('graphVertexColor').value;
  if(lit){
   const centers=[...pos.values()];
   const span=Math.max(...[0,1,2].map(d=>Math.max(...centers.map(p=>p[d]))-Math.min(...centers.map(p=>p[d]))))||1;
   const material={ambient:Number(ambient.value),highlights:Number(highlights.value)};
   for(const [i,v] of nodes.entries()){
    const degree=visibleEdges.filter(e=>e.ids.includes(v.id)).length;
    const radius=(pair?4*Math.sqrt(degree||.25):12.5*Math.sqrt(v.n/largest))*scale*span/500;
    const mesh=vertexSphereMesh(pos.get(v.id),radius,material);
    traces.push({...mesh,meta:{graphSphere:v.id},color:colorFor(v),opacity:opacities[i],
     customdata:mesh.x.map(()=>({id:v.id,edge:false})),hovertemplate:v.name+'<br>'+v.n.toLocaleString()+' samples<extra></extra>'});
   }
  }
  traces.push({type,mode:spatial?'markers':showLabels?'markers+text':'markers',...coord(nodes.map(v=>v.id)),
   visible:!lit,meta:{agpGraphVertices:true},marker:{size:sizes,color:nodes.map((v,i)=>rgba(colorFor(v),opacities[i]))},
   text:nodes.map(v=>v.name),textposition:spatial?'top center':'middle right',cliponaxis:false,
   customdata:nodes.map(v=>({id:v.id,edge:false,n:v.n,degree:v.degree})),
   hovertemplate:'%{text}<br>%{customdata.n} samples<extra></extra>'});
  const sceneAxis={visible:false},axis={visible:false,fixedrange:false};
  plot.style.height=spatial?'100%':Math.max(area.clientHeight,all.length*27+40)+'px';
  const config={margin:{t:20,b:20,l:10,r:10},showlegend:false,uirevision:[scheme.q,layout.value,layout.value==='reference'?method:useFit&&!pair?connectionKey:''].join('/'),
   xaxis:{...axis,range:pair||connected?[-.48,1]:[-.10,1]},yaxis:{...axis,range:[-all.length,1]},
   scene:{aspectmode:'data',dragmode:'orbit',xaxis:sceneAxis,yaxis:sceneAxis,zaxis:sceneAxis,
    annotations:spatial&&showLabels?nodes.map((v,i)=>({x:pos.get(v.id)[0],y:pos.get(v.id)[1],z:pos.get(v.id)[2],
     text:v.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),name:'agp-vertex:'+v.id,
     showarrow:false,captureevents:false,xanchor:'center',yanchor:'bottom',yshift:sizes[i]/2+5,opacity:opacities[i],font:{family:'Arial, sans-serif',size:12,color:'#173744'}})):[]}};
  const view=preferences.view(plot,config.uirevision);
  if(spatial&&view.camera)config.scene.camera=view.camera;
  else if(!spatial&&view.x){config.xaxis.range=view.x;config.yaxis.range=view.y}
  return Plotly.react(plot,traces,config,{responsive:true,displaylogo:false}).then(()=>{
   preferences.watch(plot);
   installAgpGraphPicking(plot,select,()=>renderRevision);
  });
 }
 toolbar.oninput=event=>{
  if(connectionControls.contains(event.target))return;
  if(event.target===layout){if(scheme.k===2)pairLayout=layout.value;else singleLayout=layout.value}
  if(event.target===algo&&algo.value!=='reference')previousAlgorithm=algo.value;
  render();
 };
 return {begin(s,m){if(s!==scheme)resetNavigation();scheme=s;method=m;
   if(!connections?.merged)pureGraph.checked=true;
   if(pendingNavigation){
    const items=pendingNavigation.history,position=pendingNavigation.cursor;
    if(Array.isArray(items)&&items.length<=100&&Number.isInteger(position)&&position>=0&&position<items.length){
     const vertices=new Set(s.cores.flatMap(id=>id.split(','))),edges=new Set(currentEdges().map(e=>e.state));
     history=items.map(item=>{
      if(typeof item?.id!=='string'||typeof item.edge!=='boolean')return null;
      const connection=item.connection===true;
      const valid=connection?item.edge&&connectionMode()&&edges.has(item.id):item.edge?s.k===2&&s.cores.includes(item.id):vertices.has(item.id);
      return valid?{id:item.id,edge:item.edge,connection}:null;
     });cursor=position;syncNavigation();
    }
    pendingNavigation=null;
   }
   if(selected?.connection&&!connectionMode())resetNavigation();
   connectionEdges=currentEdges();const edge=selected?.connection&&connectionEdges.find(e=>e.state===selected.id);
   boundaryRows=new Set(edge?[...edge.ba,...edge.bb]:[]);
  },selection:()=>selected&&{...selected,name:selected.connection?selected.id.split(',').map(id=>names.get(id)).join(' ↔ '):selected.edge?scheme.labels[selected.id]:names.get(selected.id)},contains,onSelect:fn=>{notify=fn},resize:()=>{if(plot.data)Plotly.Plots.resize(plot)},
  snapshot(){
   // Bound browser storage while retaining the current selection and nearby navigation.
   const start=Math.max(0,cursor-49),end=Math.min(history.length,start+100);
   return {history:history.slice(start,end).map(item=>item?{id:item.id,edge:item.edge,connection:item.connection===true}:null),
    cursor:cursor-start,pairLayout,singleLayout,previousAlgorithm,layoutRevision:3};
  },
  update(s,c,m){if(s!==layoutScheme){layout.value=s.k===2?pairLayout:singleLayout;layoutScheme=s}scheme=s;counts=c;method=m;return render()}};
}
