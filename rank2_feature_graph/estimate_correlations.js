// Correlations of saved estimate fields; never fit models or alter sample membership.
const estimateCorrelationViews=new WeakMap();
let estimateCorrelationShown=null,estimateCorrelationRequest=0,estimateCorrelationRequestedScope=null,estimateCorrelationJob=null;
const estimateCorrelationSelectionCache=new Map(),estimateCorrelationClusterCache=new WeakMap();
const estimateCorrelationRepresentativeCache=new WeakMap();
function estimateCorrelationAsset(){return estimateAsset()?.correlations||null}
function estimateCorrelationState(){
 const asset=estimateAsset(),data=asset?.correlations;if(!data)return null;
 if(estimateCorrelationViews.has(asset))return estimateCorrelationViews.get(asset);
 const key='micove-estimate-correlations:'+asset.datasetId+'@'+data.revision;
 let saved={};try{saved=JSON.parse(localStorage.getItem(key))||{}}catch{}
 const groups=new Set(['all',...asset.categories.map(c=>c.id)]);
 const state={key,lastColor:typeof saved.lastColor==='string'?saved.lastColor:undefined,open:saved.open===true,follow:saved.follow!==false,clusterScope:saved.clusterScope||'full',k:[10,20,40,80].includes(saved.k)?saved.k:data.defaultK,
  unit:saved.unit==='participants'?'participants':'visits',method:saved.method==='pearson'?'pearson':'spearman',
  threshold:Number.isFinite(saved.threshold)?Math.max(0,Math.min(1,saved.threshold)):data.defaultThreshold,
  rows:groups.has(saved.rows)?saved.rows:'immune-markers',cols:groups.has(saved.cols)?saved.cols:'all',
  clusteringScope:saved.clusteringScope==='joint'?'joint':'separate',clustering:saved.clustering==='threshold'?'threshold':'dynamic',minSize:Number.isInteger(saved.minSize)&&saved.minSize>=2?saved.minSize:5,deepSplit:Number.isInteger(saved.deepSplit)&&saved.deepSplit>=0&&saved.deepSplit<=4?saved.deepSplit:1,
  graphThreshold:Number.isFinite(saved.graphThreshold)?Math.max(0,Math.min(1,saved.graphThreshold)):.3,graphSign:['both','positive','negative'].includes(saved.graphSign)?saved.graphSign:'both',
  search:typeof saved.search==='string'?saved.search:'',cluster:['joint','separate'].includes(saved.clusteringScope)&&typeof saved.cluster==='string'?saved.cluster:'all'};
 if(!groups.has(state.rows))state.rows='all';if(!groups.has(state.cols))state.cols='all';
 estimateCorrelationViews.set(asset,state);return state;
}
function estimateCorrelationSave(){const s=estimateCorrelationState();if(s)try{localStorage.setItem(s.key,JSON.stringify(s))}catch{}}
function estimateCorrelationClusterNavigation(){
 const select=el('correlationCluster');
 el('previousCorrelationCluster').disabled=select.disabled||select.selectedIndex<=0;
 el('nextCorrelationCluster').disabled=select.disabled||select.selectedIndex<0||select.selectedIndex>=select.options.length-1;
}
function estimateCorrelationStepCluster(direction){
 const select=el('correlationCluster'),index=select.selectedIndex+direction;
 if(select.disabled||select.selectedIndex<0||index<0||index>=select.options.length)return;
 select.value=select.options[index].value;select.onchange();
}
function estimateCorrelationValue(bank,i,j){if(i===j)return 1;if(i>j)[i,j]=[j,i];const n=bank.featureIndices.length;return bank.correlations[i*n-i*(i+1)/2+j-i-1]}
function estimateCorrelationRepresentatives(bank,labels,data,category=null){
 // Use all cluster members in the specified group, before display filters.
 const groups=new Map();labels.forEach((c,i)=>{if(category&&data.fields[bank.featureIndices[i]].categoryId!==category)return;if(!groups.has(c))groups.set(c,[]);groups.get(c).push(i)});
 return new Map([...groups].map(([id,indices])=>{
  let representative=null,meanCorrelation=null;
  if(id)for(const i of indices){
   const mean=indices.length===1?1:indices.reduce((sum,j)=>sum+(i===j?0:estimateCorrelationValue(bank,i,j)),0)/(indices.length-1);
   if(representative===null||mean>meanCorrelation+1e-12||(Math.abs(mean-meanCorrelation)<=1e-12&&bank.featureIndices[i]<bank.featureIndices[representative])){representative=i;meanCorrelation=mean}
  }
  const feature=representative===null?null:data.fields[bank.featureIndices[representative]];
  return [id,{id,size:indices.length,representative,featureId:feature?.featureId||null,featureLabel:feature?.label||null,categoryId:feature?.categoryId||null,meanCorrelation,
   label:id?'C'+id+' · ['+feature.label+']':'Unassigned'}];
 }));
}
function estimateCorrelationGroupRepresentatives(bank,labels,data){return new Map([...new Set(bank.featureIndices.map(i=>data.fields[i].categoryId))].map(category=>[category,estimateCorrelationRepresentatives(bank,labels,data,category)]))}
function estimateCorrelationRepresentative(view,id,category){return view.groupRepresentatives?.get(category)?.get(id)||view.representatives.get(id)}
function estimateCorrelationFieldRepresentative(view,i){return estimateCorrelationRepresentative(view,view.labels[i],view.data.fields[view.bank.featureIndices[i]].categoryId)}
function estimateCorrelationSetRepresentative(view,id,indices){const categories=new Set(indices.filter(i=>view.labels[i]===id).map(i=>view.data.fields[view.bank.featureIndices[i]].categoryId));return estimateCorrelationRepresentative(view,id,categories.size===1?[...categories][0]:null)}
function estimateCorrelationClusterColor(id){return id?'hsl('+((id*137.508)%360)+',55%,48%)':'#a0a0a0'}
function estimateCorrelationPairSummary(bank,a,b,within=false){
 let count=0,sum=0,min=Infinity,max=-Infinity,positive=0,negative=0;
 for(const i of a)for(const j of b){if(i===j||(within&&i>j))continue;const r=estimateCorrelationValue(bank,i,j);count++;sum+=r;min=Math.min(min,r);max=Math.max(max,r);positive+=r>0;negative+=r<0}
 return {count,mean:count?sum/count:null,min:count?min:null,max:count?max:null,positive,negative,zero:count-positive-negative};
}
function estimateCorrelationGraph(panel,view){
 const {bank,labels}=view;
 const groups=(indices,side)=>[...new Set(indices.map(i=>labels[i]).filter(Boolean))].sort((a,b)=>a-b).map(cluster=>{
  const members=indices.filter(i=>labels[i]===cluster),representative=estimateCorrelationSetRepresentative(view,cluster,indices);return {key:side+':'+cluster,side,cluster,members,representative,label:representative.label,within:estimateCorrelationPairSummary(bank,members,members,true)};
 });
 const left=groups(panel.rows,'rows'),right=panel.symmetric?left:groups(panel.cols,'cols'),nodes=panel.symmetric?left:[...left,...right],edges=[];
 for(let a=0;a<left.length;a++)for(let b=panel.symmetric?a+1:0;b<right.length;b++){
  const source=left[a],target=right[b],stats=estimateCorrelationPairSummary(bank,source.members,target.members);
  if(stats.count)edges.push({key:source.key+'--'+target.key,source,target,...stats});
 }
 return {nodes,edges,unassigned:new Set([...panel.rows,...panel.cols].filter(i=>!labels[i])).size};
}
function estimateCorrelationGraphEdges(graph,state){return graph.edges.filter(e=>Math.abs(e.mean)+1e-12>=(state.graphThreshold??.3)&&(state.graphSign==='positive'?e.mean>0:state.graphSign==='negative'?e.mean<0:true))}
function estimateCorrelationGraphVisible(graph,state){const edges=estimateCorrelationGraphEdges(graph,state),connected=new Set(edges.flatMap(e=>[e.source.key,e.target.key]));return {edges,nodes:graph.nodes.filter(n=>connected.has(n.key)),isolated:graph.nodes.filter(n=>!connected.has(n.key))}}
function estimateCorrelationHighlightShapes(panel,labels,selection){
 if(!selection)return [];
 const rows=estimateCorrelationClusterRuns(panel.rows,labels),cols=estimateCorrelationClusterRuns(panel.cols,labels),shapes=[];
 for(const r of rows)for(const c of cols){
  const match=selection.kind==='edge'?(r.id===selection.row&&c.id===selection.col||(panel.symmetric&&r.id===selection.col&&c.id===selection.row)):
   ((selection.side!=='cols'&&r.id===selection.cluster)||((panel.symmetric||selection.side==='cols')&&c.id===selection.cluster));
  if(!match)continue;
  let points=[[c.start-.5,r.start-.5],[c.end+.5,r.start-.5],[c.end+.5,r.end+.5],[c.start-.5,r.end+.5]];
  if(panel.symmetric){const clipped=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=a[1]-a[0],db=b[1]-b[0];if(da>=0)clipped.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])}}points=clipped}
  if(points.length<3||Math.abs(points.reduce((area,a,i)=>{const b=points[(i+1)%points.length];return area+a[0]*b[1]-a[1]*b[0]},0))<1e-12)continue;
  shapes.push({type:'path',xref:'x',yref:'y',path:'M '+points.map(p=>p.join(',')).join(' L ')+' Z',fillcolor:'rgba(255,191,0,0.16)',line:{color:'#956000',width:2},layer:'above'});
 }
 return shapes;
}
function estimateCorrelationApplyHighlight(plot,selection){
 const {panel,view}=plot._estimateCorrelationView;plot._estimateCorrelationHighlight=selection;
 return Plotly.relayout(plot,{shapes:[...estimateCorrelationClusterGuides(panel,view.labels).shapes,...estimateCorrelationHighlightShapes(panel,view.labels,selection)]});
}
function estimateCorrelationGraphPositions(graph,symmetric){
 const positions=new Map(),rows=graph.nodes.filter(n=>n.side==='rows'),cols=graph.nodes.filter(n=>n.side==='cols');
 const height=symmetric?Math.max(380,Math.min(760,graph.nodes.length*22)):Math.max(300,70+Math.max(rows.length,cols.length)*32);
 if(symmetric)graph.nodes.forEach((n,i)=>{const angle=2*Math.PI*i/Math.max(1,graph.nodes.length)-Math.PI/2;positions.set(n.key,{x:330+140*Math.cos(angle),y:height/2+(height/2-65)*Math.sin(angle)})});
 else for(const [list,x] of [[rows,220],[cols,440]])list.forEach((n,i)=>positions.set(n.key,{x,y:45+(height-90)*(i+.5)/Math.max(1,list.length)}));
 return {positions,height};
}
function estimateCorrelationInstallGraph(section,plot,panel,view){
 const details=document.createElement('details');details.className='correlationGraph';details.open=true;
 const summary=document.createElement('summary');summary.textContent='Feature cluster graph';details.append(summary);
 const note=document.createElement('p');note.className='correlationGraphNote';details.append(note);
 const host=document.createElement('div');host.className='correlationGraphDrawing';details.append(host);
 const actions=document.createElement('div');actions.className='correlationActions';
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear graph highlight';clear.disabled=true;
 const jump=document.createElement('button');jump.type='button';jump.textContent='Show highlighted heatmap';jump.disabled=true;actions.append(clear,jump);details.append(actions);
 const info=document.createElement('p');info.className='correlationGraphSelection';info.setAttribute('role','status');info.textContent='Click a node or edge to highlight its heatmap rows, columns or block. Node area counts features; red edges are positive, blue edges negative.';details.append(info);
 const members=document.createElement('details'),memberTitle=document.createElement('summary'),memberText=document.createElement('p');memberTitle.textContent='Highlighted features';members.hidden=true;members.append(memberTitle,memberText);details.append(members);section.append(details);
 const graph=estimateCorrelationGraph(panel,view),field=i=>view.data.fields[view.bank.featureIndices[i]],{positions,height}=estimateCorrelationGraphPositions(graph,panel.symmetric);
 let selected=null;
 const show=(selection,text,lists)=>{selected=selection;clear.disabled=!selection;jump.disabled=!selection;info.textContent=text;members.hidden=!selection;memberText.textContent=lists||'';estimateCorrelationApplyHighlight(plot,selection).catch(estimateCorrelationError);draw()};
 clear.onclick=()=>show(null,'Graph highlight cleared. Click a node or edge to inspect another connection.','');
 jump.onclick=()=>plot.scrollIntoView({block:'start',behavior:'smooth'});
 function draw(){
  const {edges,nodes,isolated}=estimateCorrelationGraphVisible(graph,view.state);
  if(selected&&(selected.kind==='edge'?!edges.some(e=>e.key===selected.key):!nodes.some(n=>n.key===selected.key))){selected=null;clear.disabled=true;jump.disabled=true;members.hidden=true;info.textContent='The highlighted graph item is hidden by the current edge filters.';estimateCorrelationApplyHighlight(plot,null).catch(estimateCorrelationError)}
  note.textContent=nodes.length+' connected cluster nodes · '+edges.length+' of '+graph.edges.length+' connections · '+isolated.length+' degree-zero nodes hidden · |mean correlation| ≥ '+view.state.graphThreshold.toFixed(2)+' · '+({both:'both signs',positive:'positive only',negative:'negative only'}[view.state.graphSign])+'. '+(graph.unassigned?graph.unassigned+' unassigned fields remain in the heatmap, without graph nodes. ':'')+(panel.symmetric?'No self-loops.':'Left: row group; right: column group. '+(view.state.clusteringScope==='joint'?'The same joint cluster can appear on both sides.':'Each group was clustered independently.'));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 660 '+height);svg.setAttribute('role','group');svg.setAttribute('aria-label',panel.title+' cluster graph');svg.style.height=height+'px';
  const add=(tag,attrs,parent=svg)=>{const item=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))item.setAttribute(k,String(v));parent.append(item);return item};
  const interactive=(g,text,callback)=>{g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',text);add('title',{},g).textContent=text;g.onclick=callback;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();callback()}}};
  for(const edge of edges){
   const a=positions.get(edge.source.key),b=positions.get(edge.target.key),g=add('g',{'class':'correlationGraphEdge'+(selected?.key===edge.key?' graphHighlighted':''),'data-edge':edge.key});
   const line={x1:a.x,y1:a.y,x2:b.x,y2:b.y};add('line',{...line,stroke:edge.mean<0?'#2166ac':edge.mean>0?'#b2182b':'#849299','stroke-width':1+6*Math.abs(edge.mean)},g);add('line',{...line,stroke:'transparent','stroke-width':14},g);
   const text=edge.source.label+' ↔ '+edge.target.label+': mean '+edge.mean.toFixed(3)+'; '+edge.count+' feature pairs; range '+edge.min.toFixed(3)+' to '+edge.max.toFixed(3)+'; '+(100*edge.positive/edge.count).toFixed(1)+'% positive, '+(100*edge.negative/edge.count).toFixed(1)+'% negative'+(edge.zero?', '+edge.zero+' zero':'')+'.';
   interactive(g,text,()=>show({kind:'edge',key:edge.key,row:edge.source.cluster,col:edge.target.cluster},text,'Rows: '+edge.source.members.map(i=>field(i).label).join('; ')+'. Columns: '+edge.target.members.map(i=>field(i).label).join('; ')+'.'));
  }
  const maxSize=Math.max(1,...graph.nodes.map(n=>n.members.length));
  for(const node of nodes){
   const at=positions.get(node.key),g=add('g',{'class':'correlationGraphNode'+(selected?.key===node.key?' graphHighlighted':''),'data-node':node.key});
   add('circle',{cx:at.x,cy:at.y,r:20*Math.sqrt(node.members.length/maxSize),fill:estimateCorrelationClusterColor(node.cluster),stroke:'#183743','stroke-width':1.5},g);
   // Include small nodes in a generous hit area without changing their drawn area.
   add('circle',{cx:at.x,cy:at.y,r:23,fill:'transparent'},g);
   const left=panel.symmetric?at.x<330:node.side==='rows',x=at.x+(left?-27:27),label=add('text',{x,y:at.y-3,'text-anchor':left?'end':'start','font-size':12},g);
   const short=panel.symmetric&&graph.nodes.length>12?'C'+node.cluster:node.label.length>24?node.label.slice(0,22)+'…':node.label;label.textContent=short;
   const countLabel=node.members.length+(node.members.length===1?' feature':' features');
   add('text',{x,y:at.y+12,'text-anchor':left?'end':'start','font-size':11},g).textContent=countLabel;
   const text=node.label+' · '+countLabel+' in this '+(panel.symmetric?'group':node.side==='rows'?'row group':'column group')+'; mean within-group correlation '+(node.within.mean===null?'undefined (singleton)':node.within.mean.toFixed(3))+'. Representative chosen from this cluster’s members in the corresponding feature group, before display filters.';
   interactive(g,text,()=>show({kind:'node',key:node.key,side:node.side,cluster:node.cluster},text,node.members.map(i=>field(i).label).join('; ')));
  }
  if(!nodes.length)add('text',{x:330,y:height/2,'text-anchor':'middle'}).textContent=!graph.nodes.length?'No assigned clusters in these display filters.':panel.symmetric&&graph.nodes.length===1?'Only one assigned cluster; no between-cluster edges.':!graph.edges.length?'No cluster pairs are available in these groups.':'No connections pass the current edge filters.';
  host.replaceChildren(svg);
 }
 details._estimateCorrelationRedraw=draw;draw();
}
function estimateCorrelationClusterRuns(indices,labels){
 const runs=[];indices.forEach((i,k)=>{const id=labels[i],last=runs.at(-1);if(last?.id===id)last.end=k;else runs.push({id,start:k,end:k})});return runs;
}
function estimateCorrelationClusterGuides(panel,labels){
 const rows=estimateCorrelationClusterRuns(panel.rows,labels),cols=estimateCorrelationClusterRuns(panel.cols,labels),shapes=[];
 if(panel.rows.length&&panel.cols.length){
  const line=(x0,x1,y0,y1)=>shapes.push({type:'line',xref:'x',yref:'y',x0,x1,y0,y1,line:{color:'#526773',width:1.25},layer:'above'});
  for(const run of rows.slice(1)){const b=run.start-.5;line(-.5,panel.symmetric?b:panel.cols.length-.5,b,b)}
  for(const run of cols.slice(1)){const b=run.start-.5;line(b,b,panel.symmetric?b:-.5,panel.rows.length-.5)}
 }
 return {rows,cols,shapes};
}
function estimateCorrelationClusterKey(section,panel,view){
 const key=document.createElement('div');key.className='correlationClusterKey';key.setAttribute('aria-label','Clusters in '+panel.title);
 const entries=new Map();for(const i of [...panel.rows,...panel.cols]){const group=view.data.fields[view.bank.featureIndices[i]].categoryId,id=view.labels[i];entries.set(group+':'+id,{id,group,info:estimateCorrelationFieldRepresentative(view,i)})}
 const multipleGroups=new Set([...entries.values()].map(e=>e.group)).size>1;
 for(const {id,group:category,info} of [...entries.values()].sort((a,b)=>(a.id||Infinity)-(b.id||Infinity)||a.group.localeCompare(b.group))){
  const group=view.asset.categories.find(g=>g.id===category)?.label||category,button=document.createElement('span');button.className='correlationClusterLabel';button.textContent=(multipleGroups?group+': ':'')+info.label;
  button.style.borderLeftColor=estimateCorrelationClusterColor(id);
  button.title=id?info.label+' · '+group+' · '+info.size+' fields in this cluster and feature group. Representative: highest mean signed correlation to the other members of this group subset ('+info.meanCorrelation.toFixed(3)+'), before display filters.':'Unassigned fields are not a cluster.';
  key.append(button);
 }
 section.append(key);
}
function estimateCorrelationClusters(bank,threshold){
 const n=bank.featureIndices.length,parent=Array.from({length:n},(_,i)=>i),representatives=[...parent];
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 for(const [a,b,d] of bank.linkage){const left=representatives[a],right=representatives[b];if(d<=1-threshold+1e-14)parent[root(right)]=root(left);representatives.push(root(left))}
 const names=new Map();for(const i of bank.order){const r=root(i);if(!names.has(r))names.set(r,names.size+1)}
 return parent.map((_,i)=>names.get(root(i)));
}
function estimateCorrelationScope(){
 const s=estimateCorrelationState(),m=estimateModel();
 if(!s?.follow||(selectedVertex===null&&selected===null))return {key:'full',kind:'full',label:'Full eligible LSVF reference'};
 const pairs=new Set(selectedVertex!==null?visibleIncidentEdges().map(e=>e.id):[selected]),eligible=new Set(eligibleIndices()),indices=new Set();
 if(DATA.records){for(const i of eligible)if(pairs.has(DATA.samples.pair[i])){const r=m.ids.get(DATA.records[i].id);if(r!==undefined)indices.add(r)}}
 else for(const r of BUNDLE_PACK.participants?.[META.id]?.records||[])if(eligible.has(r.profile)&&pairs.has(DATA.samples.pair[r.profile])){const i=m.ids.get(r.id);if(i!==undefined)indices.add(i)}
 const records=[...indices].sort((a,b)=>a-b),vertex=selectedVertex!==null?current().nodes.find(n=>n.id===selectedVertex):null;
 const label=(vertex?'Vertex: '+vertex.label:'State: '+(current().edges.find(e=>e.id===selected)?.label||selected))+' · '+el('coverage').value+'% coverage · '+(META.populationName||el('cohortSelect').selectedOptions[0]?.textContent||'Current cohort');
 return {key:JSON.stringify([META.id,records,label]),kind:'selection',label,recordIndices:records,coverage:el('coverage').value,vertex:selectedVertex,edges:[...pairs],cohort:el('cohortSelect').value};
}
function estimateCorrelationCancel(){if(estimateCorrelationJob){estimateCorrelationJob.worker.terminate();estimateCorrelationJob.resolve(null);estimateCorrelationJob=null}}
function estimateCorrelationCompute(input,scope,s){
 const key=JSON.stringify([estimateAsset().datasetId,estimateAsset().revision,input.revision,scope.key,s.k,s.unit,s.method]);
 if(estimateCorrelationSelectionCache.has(key))return Promise.resolve(estimateCorrelationSelectionCache.get(key));
 const code=computeEstimateCorrelations.toString()+"\nself.onmessage=e=>{try{self.postMessage({bank:computeEstimateCorrelations(...e.data)})}catch(error){self.postMessage({error:error.message})}}";
 const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));let worker;
 try{worker=new Worker(url)}finally{URL.revokeObjectURL(url)}
 return new Promise((resolve,reject)=>{
  const finish=()=>{worker.terminate();if(estimateCorrelationJob?.worker===worker)estimateCorrelationJob=null};
  estimateCorrelationJob={worker,resolve};
  worker.onerror=e=>{finish();reject(Error(e.message||'Correlation calculation failed'))};
  worker.onmessage=e=>{finish();if(e.data.error){reject(Error(e.data.error));return}const bank=e.data.bank;estimateCorrelationSelectionCache.set(key,bank);while(estimateCorrelationSelectionCache.size>3)estimateCorrelationSelectionCache.delete(estimateCorrelationSelectionCache.keys().next().value);resolve(bank)};
  worker.postMessage([input,scope.recordIndices,s.unit,s.method]);
 });
}
function estimateCorrelationCluster(bank,s){
 const key=JSON.stringify([s.clusteringScope,s.clustering,s.minSize,s.deepSplit,s.threshold]),cache=estimateCorrelationClusterCache.get(bank)||new Map();
 estimateCorrelationClusterCache.set(bank,cache);if(cache.has(key))return Promise.resolve(cache.get(key));
 const code=clusterEstimateCorrelations.toString()+'\n'+clusterEstimateCorrelationGroups.toString()+"\nself.onmessage=e=>{try{self.postMessage({result:clusterEstimateCorrelationGroups(...e.data)})}catch(error){self.postMessage({error:error.message})}}";
 const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));let worker;try{worker=new Worker(url)}finally{URL.revokeObjectURL(url)}
 return new Promise((resolve,reject)=>{
  const finish=()=>{worker.terminate();if(estimateCorrelationJob?.worker===worker)estimateCorrelationJob=null};estimateCorrelationJob={worker,resolve};
  worker.onerror=e=>{finish();reject(Error(e.message||'Clustering failed'))};
  worker.onmessage=e=>{finish();if(e.data.error){reject(Error(e.data.error));return}cache.set(key,e.data.result);while(cache.size>5)cache.delete(cache.keys().next().value);resolve(e.data.result)};
  worker.postMessage([bank,{clusteringScope:s.clusteringScope,groupIds:bank.featureIndices.map(i=>estimateCorrelationAsset().fields[i].categoryId),clustering:s.clustering,minSize:s.minSize,deepSplit:s.deepSplit,threshold:s.threshold}]);
 });
}
function estimateCorrelationColorSync(s){
 if(!s)return;const mode=sampleColorMode();if(s.lastColor===mode)return;
 s.lastColor=mode;s.open=mode.startsWith('estimate:');
 if(s.open){s.rows=mode.slice(9);s.cols='all';s.cluster='all';s.search=''}estimateCorrelationSave();
}
function estimateCorrelationClearPlots(){
 const gallery=el('estimateCorrelationGallery');if(!gallery)return;
 for(const p of gallery.querySelectorAll('.correlationPlot'))Plotly.purge(p);gallery.replaceChildren();
}
function estimateCorrelationInstall(){
 if(el('estimateCorrelationPanel'))return;
 const style=document.createElement('style');style.textContent=`#estimateCorrelationPanel[hidden],#closeEstimateCorrelation[hidden],#estimateCorrelationPanel label[hidden]{display:none!important}#cataloguePanel.correlationDocked>:not(.panelHeader):not(#estimateCorrelationPanel){display:none!important}#cataloguePanel.correlationDocked>.panelHeader>:not(#catalogueTitle):not(#maximize-cataloguePanel):not(#closeEstimateCorrelation){display:none!important}#estimateCorrelationPanel{padding:10px;min-height:400px;flex:0 0 auto;min-width:0}#cataloguePanel.correlationDocked{overflow-y:auto}#cataloguePanel.correlationDocked>.panelHeader{position:sticky;top:-14px;z-index:10;background:white;padding:5px 0}.correlationControls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:12px}.correlationControls label{display:flex;align-items:center;gap:5px}.correlationControls select,.correlationControls input,#estimateCorrelationPanel .correlationActions select,#estimateCorrelationPanel button{font:inherit;min-height:29px;box-sizing:border-box}.correlationControls input[type=checkbox]{min-height:0}#estimateCorrelationPanel .correlationActions{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:8px;font-size:12px}#estimateCorrelationPanel .correlationClusterControl{display:flex;align-items:center;gap:5px;max-width:100%}#estimateCorrelationPanel .correlationClusterPicker{align-items:stretch;min-width:0;max-width:380px}#estimateCorrelationPanel .correlationClusterPicker select{min-width:0;width:100%}#estimateCorrelationPanel .correlationClusterPicker button{margin:0;padding:3px;font-size:20px;line-height:1.3}.correlationControls input[type=number]{width:65px}.correlationControls input[type=search]{width:180px}#estimateCorrelationGallery{overflow:visible;max-height:none}.correlationGraphDrawing svg{display:block;width:100%;overflow:visible}.correlationGraph{border:1px solid #d5e0e4;border-radius:5px;padding:8px}.correlationGraph summary{font-size:13px;font-weight:600}.correlationGraphNode,.correlationGraphEdge{cursor:pointer}.correlationGraphNode text{fill:#183743;paint-order:stroke;stroke:white;stroke-width:3px;stroke-linejoin:round}.correlationGraphNode:focus,.correlationGraphEdge:focus{outline:none}.correlationGraphNode:focus circle:first-child,.correlationGraphNode:hover circle:first-child,.correlationGraphNode.graphHighlighted circle:first-child{stroke:#956000;stroke-width:4}.correlationGraphEdge:focus line:first-child,.correlationGraphEdge:hover line:first-child,.correlationGraphEdge.graphHighlighted line:first-child{stroke:#956000;stroke-width:7}.correlationGraphSelection{overflow-wrap:anywhere}.correlationControls{margin-bottom:8px}.correlationControls label{white-space:normal}.correlationGraphSettings{margin:8px 0;padding:6px 0;border-bottom:1px solid #d5e0e4}.correlationPlot{width:100%;height:410px}.correlationHeatmap{border-top:1px solid #ccdce3;margin-top:12px}.correlationHeatmap h3{font-size:14px;margin:12px 5px 0}.correlationClusterKey{display:flex;flex-wrap:wrap;gap:4px 8px;padding:8px 5px 0;font-size:11px;line-height:1.4}.correlationClusterLabel{border-left:5px solid;padding:2px 5px;background:#f4f7f8;max-width:100%;overflow-wrap:anywhere}#estimateCorrelationPanel p{font-size:12px;line-height:1.5}#estimateCorrelationPanel details{margin-top:8px}#estimateCorrelationAssignments{max-height:260px;overflow:auto}#estimateCorrelationAssignments table{font-size:12px;width:100%;border-collapse:collapse}#estimateCorrelationAssignments td,#estimateCorrelationAssignments th{padding:5px;border-bottom:1px solid #dae2e5;text-align:left}#estimateCorrelationAssignments button{font:inherit;text-align:left;border:0;background:transparent;color:#12657a;cursor:pointer}#estimateCorrelationMethods{width:min(860px,90vw);max-height:85vh;overflow:auto;font-size:15px;line-height:1.55}#estimateCorrelationMethods math{display:block math;margin:18px;font-size:1.15em}#estimateCorrelationPair{min-height:22px}`;
 document.head.appendChild(style);
 const panel=document.createElement('section');panel.id='estimateCorrelationPanel';panel.hidden=true;panel.setAttribute('aria-label','Estimate correlations');
 panel.innerHTML=`<div id="correlationClusteringControls" class="correlationControls"><label>Cluster groups <select id="correlationClusteringScope"><option value="separate">Separately (default)</option><option value="joint">Jointly</option></select></label> <label>Clustering <select id="correlationClustering"><option value="dynamic">Dynamic Tree Cut</option><option value="threshold">Minimum correlation</option></select></label>
 <label title="Minimum number of features in a basic cluster: within one feature group in Separate mode, across groups in Joint mode.">Minimum cluster size <input type="number" id="correlationMinSize" required min="2" step="1" value="5"></label>
 <label title="Higher values permit finer splits. This is not a resampling-stability setting.">Splitting sensitivity <select id="correlationDeepSplit">${[0,1,2,3,4].map(v=>`<option value="${v}">${v}</option>`).join('')}</select></label>
 <label title="Complete linkage: every pair within a cluster meets this threshold.">Minimum correlation <input type="number" id="correlationThreshold" min="0" max="1" step="0.05" value="0.7"></label>
</div><p id="correlationClusteringScopeNote"></p><details id="correlationSettings"><summary>Heatmap settings</summary><div id="estimateCorrelationControls" class="correlationControls">
 <label title="Recalculate correlations and feature clusters within the selected edge or vertex union. Clear the graph selection or uncheck to use the full reference."><input type="checkbox" id="correlationFollow" checked> Follow graph selection</label>
 <label>Focus group <select id="correlationRows" aria-label="Correlation row group"></select></label>
 <label>Compare with <select id="correlationCols" aria-label="Correlation column group"></select></label>
 <label>Neighborhood <select id="correlationK" aria-label="Correlation neighborhood size">${[10,20,40,80].map(k=>`<option value="${k}">K = ${k} people</option>`).join('')}</select></label>
 <label>Correlation <select id="correlationMethod"><option value="spearman">Spearman</option><option value="pearson">Pearson</option></select></label>
 <label title="Average each participant’s visits first, then compare participants equally. Unchecked: keep all visits with equal total weight per participant."><input type="checkbox" id="correlationAverage"> Average visits per participant</label>
 <input type="search" id="correlationSearch" aria-label="Find row features" placeholder="Find row features…">
 </div></details><div class="correlationActions"><div class="correlationClusterControl"><label for="correlationCluster">Cluster</label><div class="participantPicker correlationClusterPicker"><button id="previousCorrelationCluster" type="button" aria-label="Previous feature cluster" title="Previous item in the cluster list" disabled>‹</button><select id="correlationCluster" aria-label="Feature cluster" disabled></select><button id="nextCorrelationCluster" type="button" aria-label="Next feature cluster" title="Next item in the cluster list" disabled>›</button></div></div><button type="button" id="correlationMethods">Methods…</button> <button type="button" id="correlationExport" disabled>Download results ZIP</button> <a id="correlationDownload" hidden>Download prepared ZIP</a></div>
 <div class="correlationControls correlationGraphSettings"><b>Cluster graph edges</b><label title="Display edges whose signed mean correlation has at least this magnitude. This is not a significance threshold.">|Mean correlation| ≥ <input id="correlationGraphThreshold" type="number" min="0" max="1" step="0.01" value="0.3"></label><label>Sign <select id="correlationGraphSign"><option value="both">Both signs</option><option value="positive">Positive</option><option value="negative">Negative</option></select></label></div>
 <p id="estimateCorrelationStatus" role="status" aria-live="polite"></p><p id="estimateCorrelationPair">Click a heatmap cell to inspect its two fields.</p>
 <div id="estimateCorrelationGallery"></div>
 <p>Correlations compare <b>saved estimates</b>, with one transformation per feature and a shared K. All heatmaps use −1 to +1; relative colors and clipping do not affect them. Clustering scope is selected above. Representatives come from the corresponding feature group; search filters do not change them. Group, Cluster and search filters change the displayed heatmaps and graph subsets only. Graph clicks highlight without filtering or changing the 3D view. Graph node counts refer to features, not participants. These are exploratory patterns, not tests of association between raw measurements.</p>
 <details><summary>Feature clusters and transformations</summary><p>Click a feature to color the existing 3D samples at this K. Samples, selection and embedding stay unchanged.</p><div id="estimateCorrelationAssignments"></div></details>
 <details><summary id="estimateCorrelationExcludedTitle">Excluded constant fields</summary><div id="estimateCorrelationExcluded"></div></details>`;
 el('cataloguePanel').appendChild(panel);
 const close=document.createElement('button');close.id='closeEstimateCorrelation';close.className='maximizePanel';close.type='button';close.textContent='Edge catalogue';close.hidden=true;el('catalogueTitle').after(close);
 close.onclick=()=>{estimateCorrelationState().open=false;estimateCorrelationSave();table()};
 for(const [id,key] of [['Rows','rows'],['Cols','cols'],['K','k'],['Method','method'],['Threshold','threshold'],['Cluster','cluster'],['Clustering','clustering'],['ClusteringScope','clusteringScope'],['MinSize','minSize'],['DeepSplit','deepSplit']])el('correlation'+id).onchange=()=>{
  const node=el('correlation'+id);if(node.validity&&!node.validity.valid)return;
  const s=estimateCorrelationState(),v=node.value;s[key]=['k','threshold','minSize','deepSplit'].includes(key)?Number(v):v;
  if(key!=='cluster')s.cluster='all';estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError);
 };
 for(const id of ['MinSize','Threshold'])el('correlation'+id).oninput=()=>{const node=el('correlation'+id);if(node.value!==''&&node.validity.valid)node.onchange()};
 el('previousCorrelationCluster').onclick=()=>estimateCorrelationStepCluster(-1);el('nextCorrelationCluster').onclick=()=>estimateCorrelationStepCluster(1);
 el('correlationFollow').onchange=()=>{const s=estimateCorrelationState();s.follow=el('correlationFollow').checked;s.cluster='all';estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError)};
 el('correlationAverage').onchange=()=>{const s=estimateCorrelationState();s.unit=el('correlationAverage').checked?'participants':'visits';s.cluster='all';estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError)};
 el('correlationSearch').oninput=()=>{estimateCorrelationState().search=el('correlationSearch').value;estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError)};
 for(const [id,key] of [['GraphThreshold','graphThreshold'],['GraphSign','graphSign']])el('correlation'+id).onchange=()=>{
  const node=el('correlation'+id);if(node.value===''||(node.validity&&!node.validity.valid))return;
  const s=estimateCorrelationState();s[key]=key==='graphThreshold'?Number(node.value):node.value;estimateCorrelationSave();
  if(estimateCorrelationShown){estimateCorrelationShown.state[key]=s[key];for(const graph of document.querySelectorAll('#estimateCorrelationGallery .correlationGraph'))graph._estimateCorrelationRedraw?.();el('correlationDownload').hidden=true}
 };
 el('correlationGraphThreshold').oninput=()=>el('correlationGraphThreshold').onchange();
 el('correlationMethods').onclick=estimateCorrelationMethods;el('correlationExport').onclick=()=>exportEstimateCorrelations().catch(estimateCorrelationError);
 el('estimateCorrelationAssignments').onclick=e=>{const b=e.target.closest?.('[data-correlation-feature]');if(b)estimateCorrelationSelect(Number(b.dataset.correlationFeature)).catch(estimateCorrelationError)};
}
function estimateCorrelationOpen(){const s=estimateCorrelationState();if(!s)return;const maximized=document.querySelector('.card.maximized');if(maximized&&maximized.id!=='cataloguePanel')el('maximize-'+maximized.id).click();s.open=true;estimateCorrelationSave();table();el('cataloguePanel').scrollIntoView({block:'nearest'})}
function syncEstimateCorrelationPanel(){
 const s=estimateCorrelationState();estimateCorrelationColorSync(s);const active=!!s?.open;
 if(!active){if(el('estimateCorrelationPanel')){el('estimateCorrelationPanel').hidden=true;el('closeEstimateCorrelation').hidden=true;el('cataloguePanel').classList.remove('correlationDocked')}estimateCorrelationShown=null;estimateCorrelationRequestedScope=null;++estimateCorrelationRequest;estimateCorrelationCancel();return false}
 estimateCorrelationInstall();const hidden=el('estimateCorrelationPanel').hidden;
 el('estimateCorrelationPanel').hidden=false;el('closeEstimateCorrelation').hidden=false;el('cataloguePanel').classList.add('correlationDocked');
 el('catalogueTitle').textContent=(estimateAsset().categories.find(g=>g.id===s.rows)?.label||'All groups')+' · Estimate correlations';
 // These two existing modes own the same dock; do not change their saved settings.
 el('cataloguePanel').classList.remove('heatmapDocked');
 if(hidden||estimateCorrelationShown?.asset!==estimateAsset()||estimateCorrelationRequestedScope!==estimateCorrelationScope().key||estimateCorrelationShown?.state.rows!==s.rows)requestAnimationFrame(()=>drawEstimateCorrelations().catch(estimateCorrelationError));
 return true;
}
function estimateCorrelationError(error){if(el('estimateCorrelationStatus'))el('estimateCorrelationStatus').textContent='Correlations unavailable: '+error.message;console.error(error)}
async function drawEstimateCorrelations(){
 const asset=estimateAsset(),data=asset?.correlations,s=estimateCorrelationState();if(!data||!s.open)return;
 const request=++estimateCorrelationRequest,scope=estimateCorrelationScope();estimateCorrelationCancel();
 el('catalogueTitle').textContent=(asset.categories.find(g=>g.id===s.rows)?.label||'All groups')+' · Estimate correlations';
 if(s.clusterScope!==scope.key){s.cluster='all';s.clusterScope=scope.key;estimateCorrelationSave()}
 estimateCorrelationRequestedScope=scope.key;estimateCorrelationShown=null;
 for(const id of ['Rows','Cols']){const node=el('correlation'+id);node.replaceChildren(...[{id:'all',label:'All groups'},...asset.categories].map(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.label+(g.id==='assay-availability'?' (diagnostics)':'');return o}));node.value=s[id.toLowerCase()]}
 el('correlationFollow').checked=s.follow;el('correlationK').value=s.k;el('correlationMethod').value=s.method;el('correlationAverage').checked=s.unit==='participants';el('correlationThreshold').value=s.threshold;el('correlationSearch').value=s.search;
 for(const [id,key] of [['Clustering','clustering'],['ClusteringScope','clusteringScope'],['MinSize','minSize'],['DeepSplit','deepSplit'],['GraphThreshold','graphThreshold'],['GraphSign','graphSign']])el('correlation'+id).value=s[key];
 for(const id of ['MinSize','DeepSplit'])el('correlation'+id).parentElement.hidden=s.clustering!=='dynamic';el('correlationThreshold').parentElement.hidden=s.clustering!=='threshold';
 el('correlationClusteringScopeNote').textContent=s.clusteringScope==='joint'?'Joint clustering: one hierarchy across all included feature groups, including assay-availability diagnostics. A cluster may mix groups. Each group uses its own representative, with the shared cluster ID.':'Separate clustering: an independent hierarchy within each feature group. Minimum size counts features within that group; groups with too few features may remain unassigned. Between-group panels compare these independently formed clusters.';
 el('correlationCluster').disabled=true;estimateCorrelationClusterNavigation();
 el('correlationExport').disabled=true;el('correlationDownload').hidden=true;
 el('estimateCorrelationPair').textContent='Click a heatmap cell to inspect its two fields.';
 el('estimateCorrelationAssignments').replaceChildren();el('estimateCorrelationExcluded').replaceChildren();
 estimateCorrelationClearPlots();
 el('estimateCorrelationStatus').textContent=scope.label+' · '+(scope.kind==='selection'?'Loading saved estimate inputs…':'Loading saved correlations…');
 let descriptor,bank;
 if(scope.kind==='selection'){
  descriptor=data.selectionInputs?.banks.find(b=>b.k===s.k);
  if(!descriptor)throw Error('Install the selection-correlation supplement, or uncheck Follow graph selection to use the full reference.');
  const input=await VME_ASSETS.group('correlation-input:'+asset.datasetId+':'+data.selectionInputs.revision+':'+descriptor.id,{parts:[descriptor.http]});
  if(request!==estimateCorrelationRequest||estimateAsset()!==asset||!s.open)return;
  if(input.revision!==data.selectionInputs.revision||input.catalogueRevision!==asset.revision||input.sampleOrderSha256!==asset.sampleOrderSha256||input.datasetId!==asset.datasetId||input.k!==s.k||input.featureIds.some((id,i)=>data.fields[i]?.featureId!==id)||input.featureIds.length!==data.fields.length)throw Error('Correlation inputs do not match this dataset.');
  el('estimateCorrelationStatus').textContent=scope.label+' · Recalculating correlations and clusters for '+scope.recordIndices.length.toLocaleString()+' selected samples…';
  bank=await estimateCorrelationCompute(input,scope,s);
 }else{
  descriptor=data.banks.find(b=>b.k===s.k&&b.unit===s.unit&&b.method===s.method);if(!descriptor)throw Error('This comparison is not installed.');
  bank=await VME_ASSETS.group('correlation:'+asset.datasetId+':'+data.revision+':'+descriptor.id,{parts:[descriptor.http]});
  if(bank.revision!==data.revision)throw Error('Correlation revision differs.');
 }
 if(!bank||request!==estimateCorrelationRequest||estimateAsset()!==asset||!s.open)return;
 if(bank.catalogueRevision!==asset.revision||bank.sampleOrderSha256!==asset.sampleOrderSha256||bank.datasetId!==asset.datasetId)throw Error('Correlation data do not match this dataset.');
 if(bank.issue){el('estimateCorrelationStatus').textContent=scope.label+' · '+bank.records+' eligible visits from '+bank.participants+' participants. '+bank.issue;el('estimateCorrelationExcludedTitle').textContent='Correlation unavailable';return}
 el('estimateCorrelationStatus').textContent=scope.label+' · Clustering saved estimate fields…';
 const clustering=await estimateCorrelationCluster(bank,s);if(!clustering||request!==estimateCorrelationRequest||estimateAsset()!==asset||!s.open)return;
 const {labels}=clustering,order=[...clustering.order].sort((a,b)=>(labels[a]||Infinity)-(labels[b]||Infinity));
 const members=new Map();order.forEach(i=>{const c=labels[i];if(!members.has(c))members.set(c,[]);members.get(c).push(i)});
 const field=i=>data.fields[bank.featureIndices[i]],relevant=[...members].filter(([,list])=>s.rows==='all'||list.some(i=>field(i).categoryId===s.rows));
 let representativeSet=estimateCorrelationRepresentativeCache.get(clustering);if(!representativeSet){representativeSet={representatives:estimateCorrelationRepresentatives(bank,labels,data),groupRepresentatives:estimateCorrelationGroupRepresentatives(bank,labels,data)};estimateCorrelationRepresentativeCache.set(clustering,representativeSet)}
 const {representatives,groupRepresentatives}=representativeSet,representativeView={data,bank,labels,representatives,groupRepresentatives};
 const clusters=el('correlationCluster');clusters.replaceChildren(...[['all','All clusters'],...relevant.map(([c,list])=>[String(c),estimateCorrelationRepresentative(representativeView,c,s.rows).label+' · '+(s.rows==='all'?list.length:list.filter(i=>field(i).categoryId===s.rows).length)+' fields'])].map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o}));
 if(s.cluster!=='all'&&!relevant.some(([c])=>c===Number(s.cluster)))s.cluster='all';clusters.value=s.cluster;
 const matches=i=>s.cluster==='all'||labels[i]===Number(s.cluster),query=s.search.trim().toLowerCase();
 const rows=order.filter(i=>matches(i)&&(s.rows==='all'||field(i).categoryId===s.rows)&&(!query||(field(i).label+' '+field(i).transformationLabel).toLowerCase().includes(query)));
 const panels=estimateCorrelationPanels(asset,bank,s,order,labels,rows);
 const cols=[...new Set(panels.flatMap(p=>p.cols))],shown={asset,data,bank,descriptor,labels,representatives,groupRepresentatives,rows,cols,panels,clustering,scope,state:{...s}};estimateCorrelationShown=shown;
 const gallery=el('estimateCorrelationGallery');
 for(const [index,p] of panels.entries()){
  if(request!==estimateCorrelationRequest)return;
  const section=document.createElement(p.diagnostic?'details':'section');section.className='correlationHeatmap';
  const heading=document.createElement(p.diagnostic?'summary':'h3');heading.textContent=p.title+(p.diagnostic?' · diagnostics':'');section.append(heading);
  estimateCorrelationClusterKey(section,p,shown);
  const plot=document.createElement('div');plot.className='correlationPlot';plot.id=index?'estimateCorrelationPlot-'+index:'estimateCorrelationPlot';section.append(plot);gallery.append(section);
  const render=async()=>{await estimateCorrelationDrawPlot(plot,p,shown);estimateCorrelationInstallGraph(section,plot,p,shown)};
  if(p.diagnostic){let drawn=false;section.ontoggle=()=>{if(section.open&&!drawn){drawn=true;render().catch(estimateCorrelationError)}}}else await render();
 }
 if(request!==estimateCorrelationRequest)return;
 const count=[...members.keys()].filter(Boolean).length;
 el('estimateCorrelationStatus').textContent=`${scope.label} · ${panels.length} heatmaps · K = ${s.k} nearest people · ${s.unit==='participants'?bank.participants.toLocaleString()+' participant means from '+bank.records.toLocaleString()+' visits':bank.records.toLocaleString()+' visits from '+bank.participants.toLocaleString()+' participants'} · equal participant weights · ${count} ${s.clusteringScope==='joint'?'joint':'within-group'} feature clusters · ${s.clustering==='dynamic'?'Dynamic Tree Cut; minimum '+s.minSize+', sensitivity '+s.deepSplit:'minimum correlation '+s.threshold} · ${members.get(0)?.length||0} unassigned · ${bank.excluded.length} constant fields excluded.`+(scope.kind==='selection'?' Selected: '+scope.recordIndices.length+' samples; '+(scope.recordIndices.length-bank.records)+' lack common estimate support.':'')+(bank.participants<20?' Small selection: correlations and clusters may be unstable.':'');
 const visible=[...new Set([...rows,...cols])];
 el('estimateCorrelationAssignments').innerHTML='<table><thead><tr><th>Cluster</th><th>Feature</th><th>Group</th><th>Transformation</th></tr></thead><tbody>'+visible.map(i=>{const f=field(i);return `<tr><td>${esc(estimateCorrelationFieldRepresentative(shown,i).label)}</td><td><button type="button" data-correlation-feature="${bank.featureIndices[i]}">${esc(f.label)}</button></td><td>${esc(asset.categories.find(g=>g.id===f.categoryId)?.label||f.categoryId)}</td><td>${esc(f.transformationLabel)}</td></tr>`}).join('')+'</tbody></table>';
 el('estimateCorrelationExcludedTitle').textContent='Excluded constant fields · '+bank.excluded.length;
 el('estimateCorrelationExcluded').textContent=bank.excluded.map(e=>data.fields[e.featureIndex].label+' ('+data.fields[e.featureIndex].transformationLabel+')').join('; ');
 el('correlationCluster').disabled=false;estimateCorrelationClusterNavigation();el('correlationExport').disabled=false;estimateCorrelationSave();
}
function estimateCorrelationPanels(asset,bank,s,order,labels,rows){
 const focus=asset.categories.find(g=>g.id===s.rows)||{id:'all',label:'All groups'},field=i=>asset.correlations.fields[bank.featureIndices[i]];
 const groups=s.cols==='all'?[focus,...asset.categories.filter(g=>g.id!==focus.id)]:[asset.categories.find(g=>g.id===s.cols)].filter(Boolean);
 return groups.map(g=>{
  const symmetric=g.id===focus.id,cols=symmetric?rows:order.filter(i=>(s.clusteringScope==='separate'||s.cluster==='all'||labels[i]===Number(s.cluster))&&(g.id==='all'||field(i).categoryId===g.id));
  return {id:focus.id+'--'+g.id,title:focus.label+' × '+g.label,rows,cols,symmetric,diagnostic:g.id==='assay-availability'&&g.id!==focus.id};
 });
}
function estimateCorrelationMatrix(bank,p){return p.rows.map((i,ri)=>p.cols.map((j,ci)=>p.symmetric&&ci>=ri?null:estimateCorrelationValue(bank,i,j)))}
function estimateCorrelationPlotGuides(plot,p,view){
 const {labels,representatives}=view,x=p.cols,y=p.rows;
 const guides=estimateCorrelationClusterGuides(p,labels);
 const code=id=>id?'C'+id:'U';
 const height=Math.min(650,Math.max(390,p.rows.length*15+210));
 const left=p.rows.length<=35?185:80,bottom=p.cols.length<=30?130:45,width=Math.max(150,(plot.clientWidth||600)-left-100),rowPixels=(height-70-bottom)*.9/Math.max(1,y.length);
 const annotations=[];
 // Full representative names remain in the key; narrow bands use compact codes.
 let last=-Infinity;
 for(const r of guides.cols){const center=(r.start+r.end)/2,pixel=(center+.5)/Math.max(1,x.length)*width;if(pixel-last<23)continue;last=pixel;annotations.push({xref:'x',yref:'paper',x:center,y:1.04,text:code(r.id),showarrow:false,textangle:-55,font:{size:10},yanchor:'bottom',hovertext:esc(estimateCorrelationSetRepresentative(view,r.id,p.cols).label)})}
 last=-Infinity;
 for(const r of guides.rows){const center=(r.start+r.end)/2,pixel=(center+.5)*rowPixels;if(pixel-last<14)continue;last=pixel;annotations.push({xref:'paper',yref:'y',x:0,y:center,xshift:p.rows.length<=35?-145:-18,text:code(r.id),showarrow:false,font:{size:10},xanchor:'right',hovertext:esc(estimateCorrelationSetRepresentative(view,r.id,p.rows).label)})}
 if(!p.rows.length||!p.cols.length)annotations.push({text:'No nonconstant fields match these filters.',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false});
 else if(p.symmetric&&p.rows.length<2)annotations.push({text:'At least two features are needed for a within-group comparison.',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false});
 return {height,left,bottom,width,rowPixels,guides,annotations};
}
async function resizeEstimateCorrelationPlots(){
 for(const plot of document.querySelectorAll('#estimateCorrelationGallery .correlationPlot')){
  const saved=plot._estimateCorrelationView,width=plot.clientWidth;if(!saved||width<=0||width===plot._estimateCorrelationWidth)continue;
  plot._estimateCorrelationWidth=width;
  const g=estimateCorrelationPlotGuides(plot,saved.panel,saved.view);
  await Plotly.relayout(plot,{width,annotations:g.annotations});
  await Plotly.restyle(plot,{'marker.size':Math.max(3,Math.min(14,g.width/Math.max(1,saved.panel.cols.length)))},[1]);
 }
}
async function estimateCorrelationDrawPlot(plot,p,view){
 const {bank,data,labels,state,representatives}=view,field=i=>data.fields[bank.featureIndices[i]],names=list=>list.map(i=>field(i).featureId),x=names(p.cols),y=names(p.rows);
 const clusterColor=i=>estimateCorrelationClusterColor(labels[i]),label=i=>estimateCorrelationFieldRepresentative(view,i).label;
 const {height,left,bottom,width,rowPixels,guides,annotations}=estimateCorrelationPlotGuides(plot,p,view);
 plot.style.height=height+'px';plot._estimateCorrelationWidth=plot.clientWidth;plot._estimateCorrelationView={panel:p,view};
 const traces=[{type:'heatmap',x,y,z:estimateCorrelationMatrix(bank,p),zmin:-1,zmax:1,colorscale:[[0,'#2166ac'],[.5,'#f7f7f7'],[1,'#b2182b']],colorbar:{title:{text:state.method==='spearman'?'Spearman ρ':'Pearson r'},thickness:12,len:.8},hoverongaps:false,hovertemplate:'%{y}<br>%{x}<br>Correlation: %{z:.4f}<extra></extra>'},
 {type:'scatter',mode:'markers',x,y:p.cols.map(()=>'Cluster'),yaxis:'y2',marker:{symbol:'square',size:Math.max(3,Math.min(14,width/Math.max(1,x.length))),color:p.cols.map(clusterColor)},text:p.cols.map(i=>esc(label(i))+'<br>'+esc(field(i).label)),hovertemplate:'%{text}<extra></extra>'},
 {type:'scatter',mode:'markers',x:p.rows.map(()=>0),y,xaxis:'x2',marker:{symbol:'square',size:Math.max(3,Math.min(10,rowPixels)),color:p.rows.map(clusterColor)},text:p.rows.map(i=>esc(label(i))+'<br>'+esc(field(i).label)),hovertemplate:'%{text}<extra></extra>'}];
 await Plotly.react(plot,traces,{height,margin:{l:left,r:100,t:70,b:bottom},
 xaxis:{domain:[0,.96],type:'category',categoryorder:'array',categoryarray:x,range:[-.5,x.length-.5],showticklabels:p.cols.length<=30,tickvals:x,ticktext:p.cols.map(i=>field(i).label),tickangle:-55},
 yaxis:{domain:[0,.9],type:'category',categoryorder:'array',categoryarray:y,range:[y.length-.5,-.5],showticklabels:p.rows.length<=35,tickvals:y,ticktext:p.rows.map(i=>field(i).label)},
 yaxis2:{domain:[.95,1],anchor:'x',type:'category',fixedrange:true,showticklabels:false,showgrid:false,zeroline:false},
 xaxis2:{domain:[.98,1],anchor:'y',range:[-1,1],fixedrange:true,showticklabels:false,showgrid:false,zeroline:false},
 shapes:guides.shapes,annotations,
 font:{size:11,color:'#25444f'},paper_bgcolor:'#fff',plot_bgcolor:'#fff',showlegend:false,dragmode:'zoom'}, {responsive:true,displaylogo:false,toImageButtonOptions:{filename:'MiCOVE-estimate-correlations-'+p.id,format:'png'}});
 plot.removeAllListeners?.('plotly_click');plot.on('plotly_click',event=>{
  const point=event.points?.[0];if(point?.curveNumber!==0||!Array.isArray(point.pointNumber)||point.z==null)return;
  const [ri,ci]=point.pointNumber,i=p.rows[ri],j=p.cols[ci];if(i===undefined||j===undefined)return;
  const box=el('estimateCorrelationPair');box.replaceChildren(document.createTextNode(field(i).label+' ('+label(i)+') ↔ '+field(j).label+' ('+label(j)+'): '+estimateCorrelationValue(bank,i,j).toFixed(4)+' · '));
  for(const [index,label] of [[i,'Color by row field'],[j,'Color by column field']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>estimateCorrelationSelect(bank.featureIndices[index]).catch(estimateCorrelationError);box.appendChild(b)}
 });
}

async function estimateCorrelationSelect(index){
 const view=estimateCorrelationShown;if(!view||view.asset!==estimateAsset())return;
 const f=view.data.fields[index],seriesId=f.seriesIds[String(view.state.k)],m=estimateModel();if(!m.bySeries.has(seriesId))throw Error('Field not installed.');
 syncSampleColorOptions();el('sampleColorScheme').value='estimate:'+f.categoryId;m.choices[f.categoryId]=seriesId;estimateSave();
 // Recolor only: do not call sample selection, navigation or embedding functions.
 await recolorSampleView();
}
function estimateCorrelationMethods(){
 let dialog=el('estimateCorrelationMethods');if(!dialog){dialog=document.createElement('dialog');dialog.id='estimateCorrelationMethods';document.body.appendChild(dialog)}
 dialog.innerHTML='<button type="button" id="closeCorrelationMethods">Close</button> <button type="button" id="printCorrelationMethods">Print / save as PDF</button>'+estimateCorrelationMethodsHtml();
 el('closeCorrelationMethods').onclick=()=>dialog.close();
 el('printCorrelationMethods').onclick=()=>{const w=window.open('','_blank');if(w){w.document.write('<!doctype html><title>MiCOVE estimate correlation methods</title><style>body{max-width:50em;margin:3em auto;font:16px serif;line-height:1.5}math{display:block math;margin:20px}button{display:none}</style>'+estimateCorrelationMethodsHtml());w.document.close();w.print()}};
 dialog.showModal();
}
function estimateCorrelationMethodsHtml(){return `<h2>Which estimated responses vary together across microbiome profiles?</h2>
 <p>Each feature supplies one saved nearest-people estimate at every eligible query visit. The heatmap compares these fields within and between feature groups, using the same K for every feature. It does not compare raw assay measurements or the distances in the 3D embedding.</p>
 <h3>Visits or participant means</h3><p>Let a<sub>iv</sub> be a feature’s saved estimate for visit v of participant i, and m<sub>i</sub> the number of that participant’s included visits. When following graph selection, only selected visits contribute, even if other visits from the same participant exist. Recompute weights, participant means and ranks within this subset. With the checkbox off, each visit receives weight 1/m<sub>i</sub>, so every participant has total weight one. With it on, first calculate the mean over each participant’s visits, then give every participant weight one.</p>
 <math><mrow><msub><mi>w</mi><mi>iv</mi></msub><mo>=</mo><mfrac><mn>1</mn><msub><mi>m</mi><mi>i</mi></msub></mfrac><mspace width="2em"/><msub><mover><mi>a</mi><mo>¯</mo></mover><mi>i</mi></msub><mo>=</mo><mfrac><mn>1</mn><msub><mi>m</mi><mi>i</mi></msub></mfrac><munder><mo>∑</mo><mi>v</mi></munder><msub><mi>a</mi><mi>iv</mi></msub></mrow></math>
 <h3>Correlation</h3><p>Pearson correlation measures agreement in linear variation. For two fields a and b, let ā and b̄ denote their weighted means, and let ℓ index visits or participant means. The numerator measures whether deviations tend to have the same sign; the denominator removes their units.</p>
 <math><mrow><mi>r</mi><mo>=</mo><mfrac><mrow><munder><mo>∑</mo><mi>ℓ</mi></munder><msub><mi>w</mi><mi>ℓ</mi></msub><mo>(</mo><msub><mi>a</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>a</mi><mo>¯</mo></mover><mo>)</mo><mo>(</mo><msub><mi>b</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>b</mi><mo>¯</mo></mover><mo>)</mo></mrow><msqrt><mrow><munder><mo>∑</mo><mi>ℓ</mi></munder><msub><mi>w</mi><mi>ℓ</mi></msub><msup><mrow><mo>(</mo><msub><mi>a</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>a</mi><mo>¯</mo></mover><mo>)</mo></mrow><mn>2</mn></msup><munder><mo>∑</mo><mi>ℓ</mi></munder><msub><mi>w</mi><mi>ℓ</mi></msub><msup><mrow><mo>(</mo><msub><mi>b</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>b</mi><mo>¯</mo></mover><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mfrac></mrow></math>
 <p>Spearman correlation (default) uses weighted ranks instead of the original values. The rank of a value is the total weight below it plus half the total weight tied with it, divided by total weight. Apply the same weighted correlation formula to these ranks. This measures agreement in ordering, including nonlinear increasing relationships. For equally weighted participant means it is ordinary Spearman correlation with average ranks.</p>
 <p>+1 means perfect agreement, −1 means perfectly opposite patterns, and zero means no linear agreement (Pearson) or rank agreement (Spearman). A zero value does not rule out other relationships. Constant fields have undefined correlation and are excluded; they are never coded as zero correlation.</p>
 <h3>Separate or joint feature clustering</h3><p>By default, each feature group is clustered separately: build a hierarchy from its own within-group correlations, then cut that hierarchy with the selected method. Between-group correlations cannot change these memberships. Minimum size therefore counts features within one group. Small groups may remain entirely unassigned; their heatmaps remain visible, without graph nodes. Cluster IDs are unique across the current groups, not evidence that similarly numbered clusters are related.</p><p>Choose Jointly to cluster one combined matrix instead, including assay-availability diagnostics. Those clusters can mix feature types. The Cluster dropdown filters focus rows; in Separate mode, comparison columns keep all clusters of the other group so cross-group connections remain visible. In Joint mode it retains the matching joint cluster in both groups.</p><h3>Feature-clustering method</h3><p>Dynamic Tree Cut is the default (minimum cluster size 5, splitting sensitivity 1). It uses average linkage on signed correlation distances d = 1 − r. Branches are checked for sufficient size, a compact core and separation from the surrounding tree; a second, branch-respecting assignment step attaches sufficiently close unassigned fields. Higher splitting sensitivity (0–4) permits finer splits. Unassigned fields remain visible. These are clusters of features, not participants.</p><math><mrow><msub><mi>d</mi><mi>ab</mi></msub><mo>=</mo><mn>1</mn><mo>−</mo><msub><mi>r</mi><mi>ab</mi></msub><mspace width="2em"/><mi>D</mi><mo>(</mo><mi>A</mi><mo>,</mo><mi>B</mi><mo>)</mo><mo>=</mo><mfrac><mn>1</mn><mrow><mo>|</mo><mi>A</mi><mo>|</mo><mo>|</mo><mi>B</mi><mo>|</mo></mrow></mfrac><munder><mo>∑</mo><mrow><mi>a</mi><mo>∈</mo><mi>A</mi><mo>,</mo><mi>b</mi><mo>∈</mo><mi>B</mi></mrow></munder><msub><mi>d</mi><mi>ab</mi></msub></mrow></math><p>Here r is the selected Pearson or Spearman correlation, a and b denote features, A and B are clusters, and |A| and |B| are their feature counts. Average linkage compares the mean distance across all pairs in the two clusters. Negative correlations give larger distances rather than being treated as similarity. Dynamic Tree Cut does not enforce a minimum within-cluster correlation or measure resampling stability.</p><p>The browser independently implements the published hybrid procedure: 99% cut height relative to the fifth-percentile merge height, sensitivity-dependent core scatter/gap limits, and average-distance assignment respecting the tree and small branches. Ties follow frozen feature order; partitions can differ from other implementations at tied merges. The selected settings, numerical cut criteria and full hierarchy are included in the ZIP.</p><h3>Alternative: minimum correlation</h3><p>Use distance d = 1 − r and complete linkage: the distance between two clusters is the largest distance between any pair across them. Cut the hierarchy at 1 − t, where t is the selected minimum correlation. Every pair inside a cluster then has correlation at least t. These are descriptive feature groups, not sample clusters or statistical significance declarations. Negative correlations remain visible but do not join positive clusters.</p>
 <math><mrow><mi>d</mi><mo>(</mo><mi>A</mi><mo>,</mo><mi>B</mi><mo>)</mo><mo>=</mo><munder><mo>max</mo><mrow><mi>a</mi><mo>∈</mo><mi>A</mi><mo>,</mo><mi>b</mi><mo>∈</mo><mi>B</mi></mrow></munder><mo>(</mo><mn>1</mn><mo>−</mo><msub><mi>r</mi><mi>ab</mi></msub><mo>)</mo></mrow></math>
 <p>Each sample subset, K, correlation method, visit mode and clustering scope defines its own hierarchy or set of group hierarchies. Group, search and cluster filters only select which rows and columns to display. Cluster numbers are local to these settings and should not be compared across settings as stable identities. Tied distances can make a partition sensitive to floating-point rounding. Subset calculations use deterministic nearest-neighbor chains, preferring the previous chain member on ties and otherwise frozen feature order.</p>
 <h3>Cluster labels and representatives</h3><p>Labels use C3 · [feature name], keeping the same number as the Cluster dropdown. For each cluster and feature group, the representative is the member with the highest mean signed correlation to all other members of that cluster in the same group (equivalently, the smallest mean distance 1 − r). Numerical ties within 10<sup>−12</sup> use frozen feature order; a singleton represents itself. The representative belongs to the corresponding feature group and is a descriptive label, not a biological driver. In Joint mode, the same C number can have different representative names in the two groups. An All groups view spanning several groups uses the whole-cluster representative for a combined node; individual feature labels and keys remain group-specific. Group/search filters do not change it. Unassigned fields receive no representative. New samples or correlation/clustering settings can change both membership and representative.</p><p>Boundary lines separate clusters on both axes; within-group lines stop at the diagonal. Colored strips identify each feature’s cluster on hover. Compact C labels appear where space allows; the complete representative labels remain in the key above each panel and the dropdown. The ZIP includes each cluster/group representative and its mean correlation within that group subset.</p><h3>Within- and between-group displays</h3><p>Selecting an estimate group in Color by automatically opens its within-group heatmap first, followed by comparisons with the other feature groups. Within-group plots show the lower triangle without the diagonal; downloads retain the full matrix. Focus rows keep the same order across panels. Assay-availability comparisons are separately labeled diagnostics. Separate mode keeps diagnostics in their own hierarchy; Joint mode includes them in the combined hierarchy. Showing or hiding a panel does not change cluster membership.</p><h3>Transformations and limitations</h3><p>One transformation per feature: phylotype relative abundance; metabolite log delivered signal; immune-marker median-scaled asinh; log bacterial load; reported lactic-acid concentration; clinical selected-sample proportion or numeric value; and assay-availability proportion. Exact transformations appear in the feature table and exported assignments. Lactic-acid uncorrected readings can be negative. Supplier imputations and substitutions remain.</p>
 <p>The full-reference banks use 1,965 visits from 1,144 identified participants. Following a selected edge or vertex intersects its sample membership with this common support. A vertex uses its visible incident states; unrelated background samples and reference markers are excluded. Clearing selection or unchecking Follow graph selection restores the full reference. At least three eligible participants are required; constant fields are excluded separately for every subset. The original prediction fields are retained: no neighborhood estimates are refitted within a selection. Conditioning on microbiome-defined membership can change or induce correlations. No pairwise imputation, color winsorization or relative-color transformation is applied. Shared training observations, smoothing, compositional constraints and assay handling can create correlation. This is not evidence of causality, independent biological modules, calibrated disease risk or end-to-end predictive validation. No independence-based p-values are provided.</p>
 <h3>How strongly do two feature clusters vary together?</h3><p>A graph node contains the displayed members of one cluster in one feature group. Its area is proportional to that feature count. The within-group graph has one node per represented cluster and no self-loops. A between-group graph has separate row-group and column-group nodes; in Joint mode, two subsets of the same joint cluster can be connected. Unassigned fields are not a cluster and have no graph node. Nodes with degree zero after the edge threshold/sign filters are hidden; their features remain in the heatmap. A one-feature cluster remains visible if it has a displayed edge. Layout positions depend on the displayed nodes, not on the edge threshold or sign.</p>
 <math><mrow><msub><mi>w</mi><mi>AB</mi></msub><mo>=</mo><mfrac><mn>1</mn><mrow><mo>|</mo><mi>P</mi><mo>|</mo></mrow></mfrac><munder><mo>∑</mo><mrow><mo>(</mo><mi>a</mi><mo>,</mo><mi>b</mi><mo>)</mo><mo>∈</mo><mi>P</mi></mrow></munder><msub><mi>r</mi><mi>ab</mi></msub><mspace width="2em"/><mi>P</mi><mo>=</mo><mo>{</mo><mo>(</mo><mi>a</mi><mo>,</mo><mi>b</mi><mo>)</mo><mo>:</mo><mi>a</mi><mo>∈</mo><mi>A</mi><mo>,</mo><mi>b</mi><mo>∈</mo><mi>B</mi><mo>,</mo><mi>a</mi><mo>≠</mo><mi>b</mi><mo>}</mo></mrow></math>
 <p>A and B are the node feature sets, r<sub>ab</sub> is the selected correlation between their saved estimate fields, and P contains cross-node pairs excluding a feature paired with itself. For disjoint sets, |P| = |A||B|. The edge weight w is their arithmetic mean signed correlation. Positive and negative correlations can cancel: an absent edge need not mean that every feature pair is weak. Edge details therefore report the range, number of pairs and fractions positive and negative. Within-node means use distinct unordered pairs; a singleton has no such mean.</p><p>An edge is displayed when |w| ≥ the chosen threshold (default 0.30) and its sign passes the sign selector (default both). Thickness increases with |w|; red means positive, blue negative, and zero gray. This is a descriptive display threshold, not a significance test. The shared controls apply to every graph. Clicking a node outlines its heatmap rows/columns; clicking an edge outlines the cross-node block. Clear graph highlight restores the undecorated matrix. These clicks do not filter features, change samples or move the embedding. The Cluster dropdown and search remain separate display filters. Downloads include all candidate graph edges, including those hidden by threshold/sign, and their displayed flag.</p>
 <p>References: <a href="https://doi.org/10.1093/bioinformatics/btm563" target="_blank" rel="noopener">Dynamic Tree Cut</a>; <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html" target="_blank" rel="noopener">Spearman correlation</a>; <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.cluster.hierarchy.linkage.html" target="_blank" rel="noopener">complete linkage</a>.</p>`}
function estimateCorrelationFiles(view){
 const {asset,data,bank,descriptor,labels,rows,cols,state,scope,panels,clustering}=view;
 const representatives=view.representatives||estimateCorrelationRepresentatives(bank,labels,data);
 const groupRepresentatives=view.groupRepresentatives||estimateCorrelationGroupRepresentatives(bank,labels,data),representativeView={...view,representatives,groupRepresentatives};
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv=rs=>rs.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
 const fields=data.fields,at=i=>fields[bank.featureIndices[i]],visible=new Set([...rows,...cols].map(i=>bank.featureIndices[i]));
 const indices=new Map(bank.featureIndices.map((f,i)=>[f,i])),excluded=new Map(bank.excluded.map(e=>[e.featureIndex,e.reason]));
 const assignments=[['feature_id','feature','group','transformation','transformation_id','series_id','cluster','shown_in_matrix','exclusion_reason','cluster_label','representative_feature_id'],...fields.map((f,i)=>{const info=indices.has(i)?estimateCorrelationRepresentative(representativeView,labels[indices.get(i)],f.categoryId):null;return [f.featureId,f.label,f.categoryId,f.transformationLabel,f.transformationId,f.seriesIds[String(bank.k)],indices.has(i)?(labels[indices.get(i)]||'Unassigned'):'',visible.has(i),excluded.get(i)||'',info?.label||'',info?.featureId||'']})];
 return [
  {name:'correlations.csv',text:csv([['row_feature_id',...cols.map(i=>at(i).featureId)],...rows.map(i=>[at(i).featureId,...cols.map(j=>estimateCorrelationValue(bank,i,j))])])},
  {name:'feature_clusters.csv',text:csv(assignments)},
  {name:'cluster_representatives.csv',text:csv([['cluster','feature_group','cluster_label','representative_feature_id','representative_feature','representative_group','mean_within_group_subset_correlation','group_subset_size','full_cluster_size'],...[...groupRepresentatives].flatMap(([group,reps])=>[...reps.values()].sort((a,b)=>(a.id||Infinity)-(b.id||Infinity)).map(r=>[r.id||'Unassigned',group,r.label,r.featureId,r.featureLabel,r.categoryId,r.meanCorrelation,r.size,representatives.get(r.id).size]))])},
  {name:'settings.json',text:JSON.stringify({datasetId:asset.datasetId,catalogueRevision:asset.revision,correlationRevision:data.revision,bankId:descriptor.id,bankSha256:descriptor.sha256,sampleOrderSha256:asset.sampleOrderSha256,records:bank.records,participants:bank.participants,scope:scope||{kind:'full'},calculation:scope?.kind==='selection'?'browser worker; saved fields restricted before aggregation and ranks; clustering computed from the resulting correlations':'saved full-reference bank',settings:state,clusterLabelRule:'Member maximizing mean signed correlation to the other cluster members in the same feature group, before display filters; ties within 1e-12 use frozen feature order; singleton represents itself; Unassigned has no representative',clustering:clustering?{scope:clustering.scope||state.clusteringScope||'joint',groupHierarchies:clustering.groups?.map(g=>({categoryId:g.categoryId,featureIds:g.indices.map(i=>at(i).featureId),criteria:g.criteria,implementation:g.implementation})),method:clustering.method,implementation:clustering.implementation||'complete-linkage-threshold',distance:'1 - signed correlation',linkage:state.clustering==='dynamic'?'average':'complete',minSize:state.minSize,deepSplit:state.deepSplit,threshold:state.threshold,criteria:clustering.criteria,pamStage:state.clustering==='dynamic',pamRespectsDendro:true}:data.clustering,panels:panels?.map(p=>({id:p.id,title:p.title,rows:p.rows.map(i=>at(i).featureId),columns:p.cols.map(i=>at(i).featureId),lowerTriangleOnly:p.symmetric,diagnostics:p.diagnostic})),supportPolicy:data.supportPolicy},null,2)},
  {name:'methods.html',text:'<!doctype html><meta charset="utf-8"><title>MiCOVE estimate correlations</title><style>body{max-width:55em;margin:3em auto;line-height:1.5}math{display:block math;margin:20px}</style>'+estimateCorrelationMethodsHtml()},
  ...(scope?.kind==='selection'?[{name:'selected_samples.csv',text:csv([['record_index','sample_id','included_in_correlation'],...scope.recordIndices.map(i=>[i,asset.sampleIds[i],bank.selectedRecords.includes(i)])])}]:[]),
  ...(panels||[]).map(p=>({name:'matrices/'+p.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv',text:csv([['row_feature_id',...p.cols.map(i=>at(i).featureId)],...p.rows.map(i=>[at(i).featureId,...p.cols.map(j=>estimateCorrelationValue(bank,i,j))])])})),
  ...(panels||[]).flatMap(p=>{
   const graph=estimateCorrelationGraph(p,representativeView),visible=estimateCorrelationGraphVisible(graph,state),shown=new Set(visible.edges.map(e=>e.key)),prefix='graphs/'+p.id.replace(/[^a-zA-Z0-9_-]/g,'_');
   return [{name:prefix+'-nodes.csv',text:csv([['node','side','cluster','cluster_label','feature_count','mean_within_node_correlation','feature_ids_json','representative_feature_id','displayed_degree','displayed'],...graph.nodes.map(n=>{const degree=visible.edges.filter(e=>e.source===n||e.target===n).length;return [n.key,n.side,n.cluster,n.label,n.members.length,n.within.mean,JSON.stringify(n.members.map(i=>at(i).featureId)),n.representative.featureId,degree,degree>0]})])},
    {name:prefix+'-edges.csv',text:csv([['source','target','mean_correlation','feature_pair_count','minimum','maximum','positive_fraction','negative_fraction','zero_fraction','displayed'],...graph.edges.map(e=>[e.source.key,e.target.key,e.mean,e.count,e.min,e.max,e.positive/e.count,e.negative/e.count,e.zero/e.count,shown.has(e.key)])])}];
  }),
  ...(clustering?.groups?clustering.groups.flatMap(g=>{const prefix='clusterings/'+g.categoryId.replace(/[^a-zA-Z0-9_-]/g,'_');return [{name:prefix+'-tree.csv',text:csv([['node','left_node','right_node','height','size'],...g.linkage.map((r,i)=>[g.indices.length+i,...r])])},{name:prefix+'-leaves.csv',text:csv([['node','feature_id','cluster'],...g.indices.map((b,i)=>[i,at(b).featureId,g.labels[i]||'Unassigned'])])}]}):clustering?[{name:'clustering_tree.csv',text:csv([['node','left_node','right_node','height','size'],...clustering.linkage.map((r,i)=>[bank.featureIndices.length+i,...r])])},{name:'clustering_leaves.csv',text:csv([['node','feature_id'],...bank.featureIndices.map((f,i)=>[i,fields[f].featureId])])}]:[]),
  {name:'README.txt',text:'MiCOVE estimate correlations\n\ncorrelations.csv: the focus rows by the union of comparison columns, using immutable feature IDs.\nmatrices/: one CSV per titled heatmap, including diagnostics. Symmetric matrices are exported in full, with their diagonal, although only the lower triangle is drawn.\nclusterings/: Separate mode exports one tree and leaf-ID map per feature group. clustering_tree.csv and clustering_leaves.csv: Joint mode exports the combined hierarchy. Leaf node numbers are zero-based; internal nodes begin at the number of nonconstant fields. Heights are signed correlation distances (1-r).\nfeature_clusters.csv: all catalogue features, their selected transformation/series, cluster number and representative label, visibility and exclusion reason.\ncluster_representatives.csv: one row per cluster and feature group, its representative immutable feature ID, group, mean correlation within the group subset, subset size and full cluster size. Representatives maximize mean signed correlation to the other members in that same feature group, before display filters; ties within 1e-12 use frozen feature order. Unassigned fields have no representative. Constant fields have no cluster. Group/search filters do not recalculate clusters.\ngraphs/: node membership, displayed degree/visibility and all candidate mean-correlation edges for each displayed panel, including edges hidden by threshold/sign (displayed=false). Node counts are features, not people. Unassigned fields have no graph nodes.\nsettings.json: K, participant/visit mode, correlation method, separate/joint clustering scope, group hierarchy criteria and clustering method, minimum size, splitting sensitivity, threshold, per-panel feature IDs, display filters, sample scope, counts and source checksums. For a selection, the checksum identifies the saved input fields used by the browser calculation.\nselected_samples.csv (selection only): chosen sample IDs and inclusion in common estimate support.\nmethods.html: formulas, definitions and limitations; open in a browser and print/save as PDF.\n\nValues are correlations of unclipped saved estimates, not raw measurement correlations or significance tests. All pairs have the same declared support. Cluster numbers are specific to the saved settings.\n'}
 ];
}
async function exportEstimateCorrelations(){
 const view=estimateCorrelationShown;if(!view||view.asset!==estimateAsset())return;
 el('correlationExport').disabled=true;
 try{const zip=await heatmapZip(estimateCorrelationFiles(view)),link=el('correlationDownload');if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);link.href=URL.createObjectURL(zip);link.download='MiCOVE-'+view.asset.datasetId+'-estimate-correlations-'+view.descriptor.id+(view.scope?.kind==='selection'?'-selected-'+view.state.unit+'-'+view.state.method:'')+'.zip';link.hidden=false;link.click()}
 finally{el('correlationExport').disabled=false}
}
