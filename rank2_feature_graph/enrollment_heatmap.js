// All panels use one enrollment-only population and one common ordering.
const enrollmentHeatmapDistances={ordinary:'Ordinary',fermat11:'Fermat p = 1.1',fermat125:'Fermat p = 1.25'};
let enrollmentHeatmapSelection={identity:null,subjects:new Set(),anchor:null},enrollmentHeatmapRows=[];
function heatmapGroupRange(rows,subjects,first,last){
 if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<1||first>rows.length||last>rows.length)throw Error('Choose row numbers from 1 to '+rows.length);
 return new Set([...subjects,...rows.slice(Math.min(first,last)-1,Math.max(first,last)).map(r=>r.subject)]);
}
function heatmapGroupClick(rows,subjects,anchor,subject,extend){
 const index=rows.findIndex(r=>r.subject===subject);if(index<0)return {subjects:new Set(subjects),anchor};
 const previous=rows.findIndex(r=>r.subject===anchor);
 const next=extend&&previous>=0?heatmapGroupRange(rows,subjects,previous+1,index+1):new Set(subjects);
 if(!extend||previous<0){if(next.has(subject))next.delete(subject);else next.add(subject)}
 return {subjects:next,anchor:subject};
}
function heatmapSelectionBands(rows,subjects){
 const bands=[];for(let i=0;i<rows.length;i++){if(!subjects.has(rows[i].subject))continue;const last=bands.at(-1);if(last&&last[1]===i-1)last[1]=i;else bands.push([i,i])}return bands;
}
function syncHeatmapSelection(){
 syncHeatmapClusterPicker();
 const subjects=enrollmentHeatmapSelection.subjects,rows=enrollmentHeatmapRows.filter(r=>subjects.has(r.subject));
 const groups=explorationIndex(participantData().records).filter(g=>subjects.has(g.subject)),pairs=groups.filter(g=>g.enrollment&&g.followup&&!g.ambiguous).length;
 el('heatmapSelectionStatus').textContent=`${rows.length} participants selected · ${rows.filter(r=>r.arm==='Azithromycin').length} azithromycin · ${rows.filter(r=>r.arm==='Placebo').length} placebo · ${pairs} enrollment–follow-up pairs · ${groups.length-pairs} without a retained follow-up. No treatment effect is estimated.`;
 el('heatmapClearGroup').disabled=!rows.length;
 const shapes=[];for(let i=0;i<3;i++)for(const [first,last] of heatmapSelectionBands(enrollmentHeatmapRows,subjects)){const suffix=i===0?'':String(i+1);shapes.push({type:'rect',xref:'x'+suffix+' domain',yref:'y'+suffix,x0:0,x1:1,y0:first-.5,y1:last+.5,line:{color:'#111',width:2},fillcolor:'rgba(255,255,255,0)',layer:'above'})}
 return Plotly.relayout(el('enrollmentHeatmapPlot'),{shapes});
}
function applyHeatmapGroup(){
 const asset=enrollmentHeatmapAsset(),ids=asset?.records.filter(r=>enrollmentHeatmapSelection.subjects.has(r.subject)).map(r=>r.subject)||[];
 if(!ids.length)return baselineExplore.subjects?.length?updateExploration({subjects:null}):undefined;
 const continuing=explorationActive()&&baselineExplore.subjects?.length;
 return updateExploration({subjects:ids,visit:continuing?baselineExplore.visit:'paired',nearby:false,pairedOnly:false,anchor:'',lines:continuing?baselineExplore.lines:true,treatment:continuing?baselineExplore.treatment:true});
}
function enrollmentHeatmapAsset(){const a=BUNDLE_PACK.enrollmentHeatmap?.[META.id];return a?.datasetRevision===META.revision&&a.analysisRevision===participantData()?.analysisRevision?a:null}
// Precomputed official-package fits are keyed by input geometry and explicit parameters.
let enrollmentHeatmapCluster=null;
function heatmapClusterFit(asset,metric,distance,linkage,settings){
 if(settings.method==='none')return null;
 const bank=asset.clustering?.banks[metric+'|'+distance];if(!bank)throw Error('Clustering supplement unavailable for these distances');
 let key,curves=[],best={};
 if(settings.method==='fixed'){
  const {k,minK,maxK,choice}=settings;
  if(![k,minK,maxK].every(x=>Number.isInteger(x)&&x>=2&&x<=40)||minK>maxK)throw Error('Choose whole-number k values from 2 to 40, with search start ≤ end');
  for(let i=minK;i<=maxK;i++){const f=bank['fixed|'+linkage+'|'+i];if(!f)throw Error('Fixed cut unavailable');curves.push({k:i,...f})}
  for(const score of ['silhouette','dunn']){const candidates=curves.filter(f=>Number.isFinite(f[score]));best[score]=candidates.reduce((b,f)=>!b||f[score]>b[score]?f:b,null)?.k??null}
  const selected=choice==='manual'?k:best[choice];if(selected==null)throw Error('This score is undefined for every k in the search range; choose k manually');
  key='fixed|'+linkage+'|'+selected;
 }else if(settings.method==='dynamic')key='dynamic|'+linkage+'|'+settings.minSize+'|'+settings.deepSplit;
 else if(settings.method==='hdbscan')key='hdbscan|'+settings.minSize+'|'+settings.minSamples+'|'+settings.densityChoice;
 else throw Error('Unknown clustering method');
 const fit=bank[key];if(!fit)throw Error('Clustering parameters unavailable');return {key,...fit,curves,best};
}
function heatmapClusterOrder(order,fit){return !fit?order:[...order].sort((a,b)=>(fit.labels[a]||Infinity)-(fit.labels[b]||Infinity))}
// Report a cluster only when it exactly matches the highlighted participant set.
function heatmapSelectedCluster(records,fit,subjects){
 if(!fit||!subjects.size)return '';
 const labels=new Set(records.flatMap((r,i)=>subjects.has(r.subject)?[fit.labels[i]]:[]));
 if(labels.size!==1)return '';
 const label=[...labels][0],members=records.filter((r,i)=>fit.labels[i]===label);
 return members.length===subjects.size&&members.every(r=>subjects.has(r.subject))?String(label):'';
}
function heatmapClusterStep(labels,current,direction){
 if(!labels.length)return null;
 const index=labels.indexOf(current),next=index<0?(direction>0?0:labels.length-1):index+direction;
 return next>=0&&next<labels.length?labels[next]:null;
}
function syncHeatmapClusterPicker(){
 const picker=el('heatmapSelectCluster'),asset=enrollmentHeatmapAsset();
 picker.value=heatmapSelectedCluster(asset?.records||[],enrollmentHeatmapCluster,enrollmentHeatmapSelection.subjects);
 const labels=[...picker.options].map(o=>o.value).filter(v=>v!=='');
 for(const [id,direction] of [['previousHeatmapCluster',-1],['nextHeatmapCluster',1]])el(id).disabled=picker.disabled||heatmapClusterStep(labels,picker.value,direction)===null;
}
function stepHeatmapCluster(direction){
 const picker=el('heatmapSelectCluster'),labels=[...picker.options].map(o=>o.value).filter(v=>v!=='');
 const next=picker.disabled?null:heatmapClusterStep(labels,picker.value,direction);
 if(next!==null)return selectHeatmapCluster(Number(next));
}
function selectHeatmapCluster(label){
 if(!enrollmentHeatmapCluster)return;
 enrollmentHeatmapSelection.subjects=new Set(enrollmentHeatmapAsset().records.filter((r,i)=>enrollmentHeatmapCluster.labels[i]===label).map(r=>r.subject));
 enrollmentHeatmapSelection.anchor=null;return commitHeatmapSelection();
}
function heatmapClusterSettings(){return {method:el('heatmapClustering').value,choice:el('heatmapCutChoice').value,k:Number(el('heatmapK').value),minK:Number(el('heatmapKMin').value),maxK:Number(el('heatmapKMax').value),minSize:Number(el('heatmapMinSize').value),deepSplit:Number(el('heatmapDeepSplit').value),minSamples:Number(el('heatmapMinSamples').value),densityChoice:el('heatmapDensityChoice').value}}
function syncHeatmapClusterControls(asset,s){
 el('heatmapClustering').disabled=!asset.clustering;
 if(!asset.clustering){s.method='none';el('heatmapClustering').value='none'}
 el('heatmapClusteringAvailability').textContent=asset.clustering?'Clustering uses saved enrollment distances. Treatment labels and follow-up samples are not used.':'Clustering supplement not installed; distance ordering remains available.';
 for(const id of ['CutChoice','K','KMin','KMax'])el('heatmap'+id+'Control').hidden=s.method!=='fixed';
 el('heatmapK').disabled=s.choice!=='manual';
 el('heatmapMinSizeControl').hidden=!['dynamic','hdbscan'].includes(s.method);
 el('heatmapDeepSplitControl').hidden=s.method!=='dynamic';
 for(const id of ['MinSamples','DensityChoice'])el('heatmap'+id+'Control').hidden=s.method!=='hdbscan';
 if(['fixed','dynamic'].includes(s.method)&&el('heatmapLinkage').value==='none')el('heatmapLinkage').value='average';
}
const heatmapClusterColor=(id,count)=>id===0?'#999999':`hsl(${Math.round((id-1)*360/Math.max(1,count))},65%,43%)`;
async function renderHeatmapClusterResults(asset,fit){
 el('heatmapClusterResults').hidden=!fit;
 const picker=el('heatmapSelectCluster');picker.disabled=!fit;picker.innerHTML='<option value="">'+(fit?'Choose a cluster…':'Enable clustering in settings')+'</option>';
 if(!fit){syncHeatmapClusterPicker();return}
 const score=x=>x==null?'undefined':x.toFixed(3),assigned=asset.records.length-fit.unassigned;
 el('heatmapClusterSummary').textContent=`${fit.clusters} clusters · ${assigned} assigned participants · ${fit.unassigned} unassigned/noise (${(100*fit.unassigned/asset.records.length).toFixed(1)}%). Mean Silhouette: ${score(fit.silhouette)} · Dunn: ${score(fit.dunn)}. Scores use assigned samples only.`+(fit.curves.length?` Suggested k within range: Silhouette ${fit.best.silhouette??'undefined'}; Dunn ${fit.best.dunn??'undefined'}. Current k = ${fit.clusters}.`:'');
 const groups=new Map(explorationIndex(participantData().records).map(g=>[g.subject,g]));
 const labels=[...Array(fit.clusters)].map((_,i)=>i+1);if(fit.unassigned)labels.push(0);
 picker.innerHTML+=labels.map(id=>`<option value="${id}">${id?'Cluster '+id:'Unassigned/noise'} · ${fit.labels.filter(x=>x===id).length} participants</option>`).join('');
 syncHeatmapClusterPicker();
 el('heatmapClusterTable').innerHTML='<table><thead><tr><th>Cluster</th><th>n</th><th>Azithro.</th><th>Placebo</th><th>Pairs</th><th></th></tr></thead><tbody>'+labels.map(id=>{
  const rows=asset.records.filter((r,i)=>fit.labels[i]===id),paired=rows.filter(r=>{const g=groups.get(r.subject);return g?.enrollment&&g?.followup&&!g.ambiguous}).length;
  return `<tr><td><span style="color:${heatmapClusterColor(id,fit.clusters)}">■</span> ${id||'Unassigned'}</td><td>${rows.length}</td><td>${rows.filter(r=>r.arm==='Azithromycin').length}</td><td>${rows.filter(r=>r.arm==='Placebo').length}</td><td>${paired}</td><td><button type="button" data-heatmap-cluster="${id}" aria-label="Select ${id?'cluster '+id:'unassigned participants'}">Select</button></td></tr>`
 }).join('')+'</tbody></table>';
 el('heatmapClusterScores').hidden=!fit.curves.length;if(!fit.curves.length)return;
 await Plotly.react(el('heatmapClusterScores'),['silhouette','dunn'].map((score,i)=>({type:'scatter',mode:'lines+markers',x:fit.curves.map(f=>f.k),y:fit.curves.map(f=>f[score]),xaxis:i?'x2':'x',yaxis:i?'y2':'y',name:score==='dunn'?'Dunn':'Mean Silhouette',line:{color:i?'#9d3b80':'#12657e'},hovertemplate:'k = %{x}<br>%{y:.4f}<extra>'+score+'</extra>'})),{height:250,margin:{l:40,r:15,t:28,b:40},showlegend:false,xaxis:{domain:[0,.43],title:'Clusters k',dtick:5},xaxis2:{domain:[.57,1],title:'Clusters k',dtick:5},yaxis:{title:'Silhouette'},yaxis2:{anchor:'x2',title:'Dunn'},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true,displayModeBar:false});
 const plot=el('heatmapClusterScores');plot.removeAllListeners('plotly_click');plot.on('plotly_click',e=>{const k=e.points?.[0]?.x;if(!Number.isInteger(k))return;el('heatmapK').value=k;el('heatmapCutChoice').value='manual';drawEnrollmentHeatmap()});
}

function enrollmentHeatmapModel(asset,metric,orderDistance,linkage,scaled,fit=null){
 const methods=asset.methods[metric];
 if(!methods||!methods[orderDistance]||!['none','average','complete','single'].includes(linkage))throw Error('Unsupported heatmap ordering');
 const order=heatmapClusterOrder(linkage==='none'?asset.records.map((_,i)=>i):methods[orderDistance].orders[linkage],fit);
 const rows=order.map(i=>asset.records[i]);
 const panels=Object.entries(enrollmentHeatmapDistances).map(([key,title])=>{const matrix=methods[key],raw=order.map(i=>order.map(j=>matrix.values[i][j])),divisor=scaled?matrix.median:1;return {key,title,raw,z:raw.map(row=>row.map(v=>v/divisor)),divisor,p:matrix.p}});
 return {rows,order,panels};
}
function enrollmentHeatmapHeight(width){return Math.min(740,Math.max(310,Math.round(width*.283+180)))}
async function resizeEnrollmentHeatmap(){
 const plot=el('enrollmentHeatmapPlot'),height=enrollmentHeatmapHeight(plot.clientWidth);
 plot.style.height=height+'px';
 return Plotly.relayout(plot,{height,width:plot.clientWidth});
}
async function drawEnrollmentHeatmap(){
 const asset=enrollmentHeatmapAsset();if(!asset)return;
 const settings=heatmapClusterSettings();syncHeatmapClusterControls(asset,settings);
 const metric=el('heatmapMetric').value,orderDistance=el('heatmapOrderDistance').value,linkage=el('heatmapLinkage').value,scaled=el('heatmapScale').value==='median';
 let fit;try{fit=heatmapClusterFit(asset,metric,orderDistance,linkage,settings)}catch(e){el('heatmapClusteringAvailability').textContent='Not applied: '+e.message+'. Previous plot and group remain.';return}
 if(settings.method==='fixed'&&settings.choice!=='manual')el('heatmapK').value=fit.clusters;
 enrollmentHeatmapCluster=fit;
 const model=enrollmentHeatmapModel(asset,metric,orderDistance,linkage,scaled,fit),n=model.rows.length;
 await renderHeatmapClusterResults(asset,fit);
 enrollmentHeatmapRows=model.rows;
 const labels=model.rows.map(r=>r.subject+' · '+r.arm),traces=[],annotations=[];
 const max=scaled?Math.max(...model.panels.flatMap(p=>p.z.map(row=>Math.max(...row)))):null;
 const height=enrollmentHeatmapHeight(el('enrollmentHeatmapPlot').clientWidth);
 el('enrollmentHeatmapPlot').style.height=height+'px';
 const layout={height,margin:{t:35,b:95,l:18,r:14},font:{size:10},paper_bgcolor:'#fff',plot_bgcolor:'#fff',showlegend:false,annotations,dragmode:el('heatmapSelectRows').checked?false:'zoom',uirevision:metric+'|'+orderDistance+'|'+linkage};
 for(const [i,panel] of model.panels.entries()){
  const suffix=i===0?'':String(i+1),axis='x'+suffix,yaxis='y'+suffix,start=i/3+.025,end=(i+1)/3-.025;
  layout['xaxis'+suffix]={domain:[start,end],showticklabels:false,ticks:'',zeroline:false};
  layout['yaxis'+suffix]={domain:[0,fit ? .94 : 1],showticklabels:false,autorange:'reversed',zeroline:false,anchor:axis};
  traces.push({type:'heatmap',x:labels,y:labels,z:panel.z,customdata:panel.raw.map((row,i)=>row.map(v=>[v,i+1])),xaxis:axis,yaxis,zmin:0,zmax:max??Math.max(...panel.z.map(row=>Math.max(...row))),colorscale:'Viridis',zsmooth:false,colorbar:{orientation:'h',x:(start+end)/2,xanchor:'center',y:-.18,yanchor:'top',len:end-start,thickness:8,title:{text:scaled?'Distance / median':'Raw distance (p = '+panel.p+')',side:'bottom'}},hovertemplate:'Row %{customdata[1]}: %{y}<br>Column: %{x}<br>Raw distance: %{customdata[0]:.6g}'+(scaled?'<br>Distance / median: %{z:.3f}':'')+'<extra>'+panel.title+'</extra>'});
  const stripeAxis='x'+(i+4);
  layout['xaxis'+(i+4)]={domain:[start-.012,start-.004],visible:false,anchor:yaxis};
  traces.push({type:'heatmap',x:['Treatment'],y:labels,z:model.rows.map(r=>[r.arm==='Azithromycin'?0:1]),xaxis:stripeAxis,yaxis,zmin:0,zmax:1,colorscale:[[0,explorationArms.Azithromycin],[.4999,explorationArms.Azithromycin],[.5,explorationArms.Placebo],[1,explorationArms.Placebo]],showscale:false,hovertemplate:'%{y}<extra>Randomized assignment</extra>'});
  if(fit){
   const caxis='x'+(i+7);layout['xaxis'+(i+7)]={domain:[start-.024,start-.016],visible:false,anchor:yaxis};
   const scale=[];for(let id=0;id<=fit.clusters;id++){const lo=id/(fit.clusters+1),hi=(id+1)/(fit.clusters+1);scale.push([lo,heatmapClusterColor(id,fit.clusters)],[hi,heatmapClusterColor(id,fit.clusters)])}
   traces.push({type:'heatmap',meta:{clusterStripe:true,orientation:'vertical'},x:['Cluster'],y:labels,z:model.order.map(i=>[fit.labels[i]+.5]),customdata:model.order.map(i=>[fit.labels[i]||'Unassigned/noise']),xaxis:caxis,yaxis,zmin:0,zmax:fit.clusters+1,colorscale:scale,showscale:false,hovertemplate:'%{y}<br>Cluster: %{customdata}<extra>Click to select this group</extra>'});
   // Share the matrix x axis so column colors stay aligned when zooming.
   const topAxis='y'+(i+4);layout['yaxis'+(i+4)]={domain:[.965,1],visible:false,anchor:axis,fixedrange:true};
   traces.push({type:'heatmap',meta:{clusterStripe:true,orientation:'horizontal'},x:labels,y:['Cluster'],z:[model.order.map(i=>fit.labels[i]+.5)],customdata:[model.order.map(i=>fit.labels[i]||'Unassigned/noise')],xaxis:axis,yaxis:topAxis,zmin:0,zmax:fit.clusters+1,colorscale:scale,showscale:false,zsmooth:false,hovertemplate:'%{x}<br>Cluster: %{customdata}<extra>Click to select this group</extra>'});
  }
  annotations.push({text:panel.title,x:(start+end)/2,y:1.07,xref:'paper',yref:'paper',showarrow:false,font:{size:12}});
 }
 el('heatmapRowFirst').max=el('heatmapRowLast').max=n;
 el('heatmapOrderDistance').disabled=linkage==='none'&&settings.method==='none';
 const count=arm=>model.rows.filter(r=>r.arm===arm).length;
 el('enrollmentHeatmapStatus').textContent=`${n} enrollment samples · ${n} participants. Azithromycin: ${count('Azithromycin')}; placebo: ${count('Placebo')}. Same row and column order in all panels. `+(linkage==='none'?'Ordered by participant ID.':`${linkage[0].toUpperCase()+linkage.slice(1)} linkage on ${enrollmentHeatmapDistances[orderDistance]} distances.`);
 // Keep display and analysis state separate: no change to samples, selections or embeddings.
 await Plotly.react(el('enrollmentHeatmapPlot'),traces,layout,{responsive:true,displaylogo:false,scrollZoom:false,modeBarButtonsToRemove:['select2d','lasso2d'],toImageButtonOptions:{format:'png',filename:'sante-enrollment-distance-heatmap',scale:2}});
 const plot=el('enrollmentHeatmapPlot');
 plot.removeAllListeners('plotly_click');plot.on('plotly_click',event=>{
  if(!el('heatmapSelectRows').checked)return;
  const point=event.points?.[0],label=point?.data?.meta?.orientation==='horizontal'?point.x:point?.y;
  const row=enrollmentHeatmapRows.find(r=>r.subject+' · '+r.arm===label);if(!row)return;
  if(point.data?.meta?.clusterStripe&&enrollmentHeatmapCluster){const index=asset.records.findIndex(r=>r.subject===row.subject);selectHeatmapCluster(enrollmentHeatmapCluster.labels[index]);return}
  enrollmentHeatmapSelection={...enrollmentHeatmapSelection,...heatmapGroupClick(enrollmentHeatmapRows,enrollmentHeatmapSelection.subjects,enrollmentHeatmapSelection.anchor,row.subject,!!event.event?.shiftKey)};
  commitHeatmapSelection();
 });
 await syncHeatmapSelection();
}
// The dock shares the catalogue's resize/maximize controls; it never blocks the 3D view.
let heatmapDockReady=false,heatmapDockDataset=null,heatmapDockDismissed=false,heatmapDockIdentity=null;
function syncEnrollmentHeatmapPanel(){
 if(!heatmapDockReady)return false;
 if(heatmapDockDataset!==META.id){heatmapDockDataset=META.id;heatmapDockDismissed=false;heatmapDockIdentity=null}
 const asset=enrollmentHeatmapAsset(),active=!!asset&&explorationActive()&&!heatmapDockDismissed;
 el('exportHeatmapClusterings').disabled=!asset?.clustering||heatmapClusteringExportBusy;
 const panel=el('enrollmentHeatmapPanel'),wasHidden=panel.hidden;
 panel.hidden=!active;el('cataloguePanel').classList.toggle('heatmapDocked',active);el('closeEnrollmentHeatmap').hidden=!active;
 if(!active)return false;
 el('catalogueTitle').textContent='Enrollment distance heatmap';
 const identity=asset.datasetRevision+'|'+asset.analysisRevision+'|'+asset.inputSha256;
 if(enrollmentHeatmapSelection.identity!==identity)enrollmentHeatmapSelection={identity,subjects:new Set(),anchor:null};
 const subjects=new Set(baselineExplore.subjects||[]),changed=subjects.size!==enrollmentHeatmapSelection.subjects.size||[...subjects].some(id=>!enrollmentHeatmapSelection.subjects.has(id));
 enrollmentHeatmapSelection.subjects=subjects;
 if(heatmapDockIdentity!==identity||wasHidden){
  heatmapDockIdentity=identity;
  if(wasHidden&&!(typeof panelReadJson==='function'&&panelReadJson('vme-panel-controls-v1',{}).controls?.heatmapMetric))el('heatmapMetric').value=baselineExplore.metric;
  // Let panel visibility/layout settle before Plotly measures its width.
  if(typeof window!=='undefined')requestAnimationFrame(()=>drawEnrollmentHeatmap().catch(heatmapError));
 }else if(changed&&el('enrollmentHeatmapPlot').data)syncHeatmapSelection();
 return true;
}
function heatmapError(error){el('enrollmentHeatmapStatus').textContent='Heatmap could not be drawn: '+error.message}
async function commitHeatmapSelection(){
 await syncHeatmapSelection();
 return applyHeatmapGroup();
}
function installEnrollmentHeatmap(){
 heatmapDockReady=true;
 el('exportHeatmapClusterings').onclick=exportHeatmapClusterings;
 el('openEnrollmentHeatmap').onclick=async()=>{
  if(!enrollmentHeatmapAsset())return;
  heatmapDockDismissed=false;
  const maximized=document.querySelector('.card.maximized');
  if(maximized)el('maximize-'+maximized.id).click();
  if(!explorationActive())await updateExploration({visit:'paired'});
  else table();
  el('cataloguePanel').scrollTop=0;
 };
 el('previousHeatmapCluster').onclick=()=>stepHeatmapCluster(-1);
 el('nextHeatmapCluster').onclick=()=>stepHeatmapCluster(1);
 el('heatmapSelectCluster').onchange=()=>{if(el('heatmapSelectCluster').value!=='')selectHeatmapCluster(Number(el('heatmapSelectCluster').value))};
 el('heatmapClusterTable').onclick=event=>{const b=event.target.closest?.('[data-heatmap-cluster]');if(b)selectHeatmapCluster(Number(b.dataset.heatmapCluster))};
 el('heatmapAddRange').onclick=()=>{try{enrollmentHeatmapSelection.subjects=heatmapGroupRange(enrollmentHeatmapRows,enrollmentHeatmapSelection.subjects,Number(el('heatmapRowFirst').value),Number(el('heatmapRowLast').value));commitHeatmapSelection()}catch(e){el('heatmapSelectionStatus').textContent=e.message}};
 el('heatmapClearGroup').onclick=()=>{enrollmentHeatmapSelection.subjects=new Set();enrollmentHeatmapSelection.anchor=null;commitHeatmapSelection()};
 el('heatmapSelectRows').onchange=()=>Plotly.relayout(el('enrollmentHeatmapPlot'),{dragmode:el('heatmapSelectRows').checked?false:'zoom'});
 el('closeEnrollmentHeatmap').onclick=()=>{heatmapDockDismissed=true;table()};
 for(const id of ['heatmapMetric','heatmapOrderDistance','heatmapLinkage','heatmapScale','heatmapClustering','heatmapCutChoice','heatmapK','heatmapKMin','heatmapKMax','heatmapMinSize','heatmapDeepSplit','heatmapMinSamples','heatmapDensityChoice'])el(id).onchange=()=>drawEnrollmentHeatmap().catch(heatmapError);
}

// Export saved results only: no clustering, distance calculation or 3D refitting.
const heatmapCsv=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
function heatmapExportConfig(bank,key){
 const [geometry,distance]=bank.split('|'),[algorithm,a,b,c]=key.split('|');
 if(!/^(l1-euclidean|max-euclidean|max-linf)$/.test(geometry)||!enrollmentHeatmapDistances[distance])throw Error('Unknown export geometry');
 let filename,parameters={linkage:'',requested_k:'',minimum_cluster_size:'',deep_split:'',minimum_samples:'',cluster_selection:''};
 if(algorithm==='fixed'){parameters.linkage=a;parameters.requested_k=Number(b);filename=`fixed_${a}_k-${b}`}
 else if(algorithm==='dynamic'){parameters.linkage=a;parameters.minimum_cluster_size=Number(b);parameters.deep_split=Number(c);filename=`dynamic_${a}_min-${b}_split-${c}`}
 else if(algorithm==='hdbscan'){parameters.minimum_cluster_size=Number(a);parameters.minimum_samples=Number(b);parameters.cluster_selection=c;filename=`hdbscan_min-${a}_samples-${b}_${c}`}
 else throw Error('Unknown export clustering');
 if(!/^[a-z0-9_-]+$/.test(filename))throw Error('Invalid export filename');
 return {geometry,distance,algorithm,...parameters,file:`assignments/${geometry}/${distance}/${filename}.csv`};
}
function heatmapClusteringReadme(asset,count){return `# Enrollment clustering archive

## What question does this archive help answer?
Which enrollment communities group together, and how do those groups change with normalization, distance and clustering parameters?

This archive contains ALL ${count} saved clustering solutions for ${asset.records.length} enrollment participants in ${asset.dataset}. It is not restricted to the selected cluster, highlighted participants, current method, or displayed k-search range. It uses the installed, validated supplement; exporting does not recompute any analysis.

## Start here
1. Open clustering_index.csv: one row per solution, with its assignment-file path, parameters, number of clusters, unassigned count, mean Silhouette and Dunn scores.
2. Open that assignment CSV under assignments/<geometry>/<distance>/. Every file contains every enrollment participant exactly once, in the source order, including unassigned participants.
3. Join participant_index (1-based) to participants.csv for sample ID, participant ID, randomized treatment assignment, collection date and recorded earlier-day dose count. These annotations were not used to form clusters.
4. cluster_sizes.csv lists cluster sizes, including label 0 when present. README.md is this guide.

Example: assignments/max-euclidean/fermat125/fixed_average_k-4.csv contains the four-group average-linkage cut of Fermat p=1.25 distances after max normalization with Euclidean base distances.

## Files and columns
- participants.csv: participant_index, sample_id, participant_id, profile_index, treatment_assignment, collection_date, earlier_day_doses. profile_index is the original saved 0-based abundance-profile key; it is not a heatmap row. Missing annotations are empty, not zero. earlier_day_doses excludes same-day timing and does not establish whether the specimen preceded the first dose.
- clustering_index.csv: clustering_id identifies a geometry, distance and parameter key. assignment_file is the relative path. Blank parameter cells mean not applicable. requested_k is the requested fixed cut; clusters is the resulting positive-label count. assigned_n excludes unassigned_n. Blank scores mean undefined, not zero.
- assignments/...csv: participant_index, sample_id and participant_id identify each row; cluster is an integer; assignment_status is assigned or unassigned/noise; cluster_color is the corresponding VME color within this solution.
- cluster_sizes.csv: clustering_id, cluster, assignment_status, n, percent_of_all_enrollment. The denominator includes every enrollment participant, including noise.
- distances/<geometry>/<distance>.csv: raw symmetric distance matrices. The first column and header are 1-based participant_index values matching participants.csv. Values are not divided by the median used for optional heatmap color scaling.
- orders/<geometry>/<distance>.csv: participant_index and 1-based row ranks for participant-ID, average-linkage, complete-linkage and single-linkage ordering. To reproduce a clustered heatmap, sort positive cluster labels ascending, put label 0 last, and preserve the selected ordering within each group. HDBSCAN itself has no linkage parameter; the heatmap ordering is a separate display choice.
- manifest.json: archive format version, dataset/analysis revisions, source hashes, export time, file count, geometry descriptions, and current UI settings for orientation only.
- saved-data.json: the complete installed enrollment supplement, including every saved assignment, distance, ordering, score, software version and source hash. Its internal arrays and saved ordering indices are 0-based. CSV indices are 1-based. Hashes describe the original canonical source objects, not the whitespace/order of this JSON serialization.

## Cluster labels and parameters
Labels 1, 2, ... are local to ONE solution; cluster 1 in two files need not contain the same people. Positive labels were numbered by first occurrence in source participant order. Label 0 means unassigned/noise, not an additional biological cluster. Colors likewise have meaning only within one solution.

fixed: hierarchical clustering followed by a fixed tree cut. linkage is average, complete or single; requested_k ranges from 2 to 40 in the current supplement.
dynamic: Dynamic Tree Cut, hybrid method; minimum_cluster_size is 5, 10, 20 or 40 and deep_split is 0–4 (larger values permit finer splits). The saved implementation uses pamStage=true, pamRespectsDendro=true and the default cut height.
hdbscan: HDBSCAN on precomputed distances. minimum_cluster_size and minimum_samples each take 5, 10, 20 or 40. minimum_samples INCLUDES the point itself in this scikit-learn implementation. eom selects persistent clusters by excess of mass; leaf selects finer terminal clusters. Neither is a resampling stability test.

Each of the nine geometries has 117 fixed cuts, 60 dynamic cuts and 32 HDBSCAN solutions in the current supplement. No-clustering display mode and automatic selection by a score are not extra fitted solutions: the score selector chooses an existing fixed cut within its requested search range; exact score ties favor smaller k.

## Geometry and distance
l1-euclidean: divide each profile by its total abundance, then use Euclidean distance.
max-euclidean: divide by its largest abundance, then use Euclidean distance.
max-linf: divide by its largest abundance, then use the largest absolute coordinate difference (L-infinity distance).
ordinary: direct distance between these normalized profiles.
fermat11 / fermat125: shortest-path cost through the complete enrollment-only graph, summing base edge distances raised to p=1.1 / 1.25. No p-th root or median scaling is applied to stored distances. The intermediates are enrollment profiles from both treatment arms; follow-up, delivery and 3D embedding coordinates are not inputs.

## Reading the scores
Mean Silhouette compares each assigned participant's average distance within its cluster with its smallest average distance to another cluster, normalized by the larger of those two distances. Values near 1 indicate separation, near 0 indicate a boundary, and negative values indicate greater proximity to another cluster. Singleton silhouettes are zero.
Dunn is the smallest distance between participants in different clusters divided by the largest within-cluster diameter. Higher values indicate greater separation relative to cluster spread, but a single unusual point can dominate the score.
Both scores exclude unassigned/noise observations. They are undefined unless there are at least two clusters and fewer clusters than assigned participants; Dunn is also undefined for zero maximum within-cluster diameter. Compare the unassigned fraction as well as the score. Scores across different geometries are not an absolute ranking of biological truth.

## Scope and limits
These are exploratory enrollment clusters, not CST annotations, treatment effects or validated biological states. This archive contains saved labels and summaries, not unsaved hierarchical merge tables, full HDBSCAN condensed trees, posterior probabilities, bootstrap stability estimates or original abundance profiles. Full saved provenance is retained in saved-data.json. The current UI settings in manifest.json do not restrict the export. Dataset access and reuse terms still apply to these participant-level files; they are separate from the VME software license.
`;}
function* heatmapClusteringFiles(asset,view={},createdAt=new Date().toISOString()){
 if(!asset?.clustering?.banks)throw Error('Clustering supplement not installed');
 const index=[['clustering_id','assignment_file','geometry','normalization','base_metric','distance','fermat_p','algorithm','linkage','requested_k','minimum_cluster_size','deep_split','minimum_samples','cluster_selection','clusters','assigned_n','unassigned_n','mean_silhouette','dunn']],sizes=[['clustering_id','cluster','assignment_status','n','percent_of_all_enrollment']];
 let count=0;
 for(const bank of Object.keys(asset.clustering.banks).sort())for(const key of Object.keys(asset.clustering.banks[bank]).sort()){
  const f=asset.clustering.banks[bank][key],c=heatmapExportConfig(bank,key),id=bank+'|'+key;
  if(f.labels.length!==asset.records.length)throw Error('Cluster membership length mismatch');
  index.push([id,c.file,c.geometry,c.geometry.startsWith('l1')?'L1':'max',c.geometry==='max-linf'?'L-infinity':'Euclidean',c.distance,asset.methods[c.geometry][c.distance].p,c.algorithm,c.linkage,c.requested_k,c.minimum_cluster_size,c.deep_split,c.minimum_samples,c.cluster_selection,f.clusters,asset.records.length-f.unassigned,f.unassigned,f.silhouette,f.dunn]);
  const counts=new Map();for(const label of f.labels)counts.set(label,(counts.get(label)||0)+1);
  for(const [label,n] of [...counts].sort((a,b)=>a[0]-b[0]))sizes.push([id,label,label===0?'unassigned/noise':'assigned',n,100*n/asset.records.length]);
  yield {name:c.file,text:heatmapCsv([['participant_index','sample_id','participant_id','cluster','assignment_status','cluster_color'],...asset.records.map((r,i)=>[i+1,r.id,r.subject,f.labels[i],f.labels[i]===0?'unassigned/noise':'assigned',heatmapClusterColor(f.labels[i],f.clusters)])])};count++;
 }
 yield {name:'participants.csv',text:heatmapCsv([['participant_index','sample_id','participant_id','profile_index','treatment_assignment','collection_date','earlier_day_doses'],...asset.records.map((r,i)=>[i+1,r.id,r.subject,r.profile,r.arm,r.date,r.priorDoses])])};
 const geometries=[];
 for(const geometry of Object.keys(asset.methods).sort())for(const distance of Object.keys(asset.methods[geometry]).sort()){
  const m=asset.methods[geometry][distance],ranks={};
  for(const [link,order] of Object.entries(m.orders)){ranks[link]=[];order.forEach((i,rank)=>{ranks[link][i]=rank+1})}
  yield {name:`distances/${geometry}/${distance}.csv`,text:heatmapCsv([['participant_index',...asset.records.map((r,i)=>i+1)],...m.values.map((row,i)=>[i+1,...row])])};
  yield {name:`orders/${geometry}/${distance}.csv`,text:heatmapCsv([['participant_index','participant_id_rank','average_rank','complete_rank','single_rank'],...asset.records.map((r,i)=>[i+1,i+1,ranks.average[i],ranks.complete[i],ranks.single[i]])])};
  geometries.push({geometry,distance,p:m.p,positiveDistanceMedian:m.median});
 }
 yield {name:'clustering_index.csv',text:heatmapCsv(index)};
 yield {name:'cluster_sizes.csv',text:heatmapCsv(sizes)};
 yield {name:'README.md',text:heatmapClusteringReadme(asset,count)};
 yield {name:'saved-data.json',text:JSON.stringify(asset)};
 yield {name:'manifest.json',text:JSON.stringify({format:'vme-enrollment-clusterings',version:1,dataset:asset.dataset,datasetRevision:asset.datasetRevision,analysisRevision:asset.analysisRevision,exportedAt:createdAt,participants:asset.records.length,clusterings:count,files:count+2*geometries.length+6,inputSha256:asset.inputSha256,clusteringSha256:asset.clustering.sha256,baseSha256:asset.clustering.baseSha256,geometries,displayOnly:view,scope:'All saved solutions and enrollment participants; no current selection or search-range filtering'},null,2)};
}
// ZIP32 with UTF-8 filenames, CRC checksums and optional browser-native deflate.
const heatmapZipCrcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function heatmapZipCrc(bytes){let c=0xffffffff;for(const b of bytes)c=heatmapZipCrcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
async function heatmapZip(files,onProgress=()=>{},compress=true){
 const encoder=new TextEncoder(),parts=[],directory=[];let offset=0,count=0;
 let useDeflate=false;if(compress&&typeof CompressionStream!=='undefined'){try{new CompressionStream('deflate-raw');useDeflate=true}catch{}}
 for(const file of files){
  if(++count>65535)throw Error('Too many files for ZIP32');
  if(file.name.startsWith('/')||file.name.split('/').some(p=>p==='..'))throw Error('Unsafe archive path');
  const name=encoder.encode(file.name),raw=encoder.encode(file.text),crc=heatmapZipCrc(raw);
  const data=useDeflate?new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()):raw;
  if(name.length>65535||Math.max(raw.length,data.length,offset+30+name.length+data.length)>=0xffffffff)throw Error('Archive exceeds ZIP32 size limits');
  const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(8,useDeflate?8:0,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,raw.length,true);v.setUint16(26,name.length,true);local.set(name,30);
  const central=new Uint8Array(46+name.length),d=new DataView(central.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(10,useDeflate?8:0,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,raw.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);central.set(name,46);
  parts.push(local,data);directory.push(central);offset+=local.length+data.length;
  if(count%25===0){onProgress(count);await new Promise(resolve=>setTimeout(resolve,0))}
 }
 const size=directory.reduce((s,d)=>s+d.length,0);if(offset+size+22>=0xffffffff)throw Error('Archive exceeds ZIP32 size limits');
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,count,true);e.setUint16(10,count,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);onProgress(count);
 return new Blob([...parts,...directory,end],{type:'application/zip'});
}
let heatmapClusteringExportBusy=false;
async function exportHeatmapClusterings(){
 const asset=enrollmentHeatmapAsset();if(!asset?.clustering||heatmapClusteringExportBusy)return;
 heatmapClusteringExportBusy=true;const button=el('exportHeatmapClusterings'),status=el('heatmapExportStatus'),link=el('heatmapClusteringDownload');button.disabled=true;link.hidden=true;
 try{
  status.textContent='Preparing all saved enrollment clusterings…';
  const view={geometry:el('heatmapMetric').value,distance:el('heatmapOrderDistance').value,ordering:el('heatmapLinkage').value,colorScale:el('heatmapScale').value,clustering:heatmapClusterSettings(),highlightedParticipants:enrollmentHeatmapSelection.subjects.size};
  const zip=await heatmapZip(heatmapClusteringFiles(asset,view),n=>{status.textContent=`Packaging ${asset.dataset}: ${n} files…`});
  const old=link.href;link.href=URL.createObjectURL(zip);link.download=asset.dataset+'-enrollment-clusterings.zip';link.hidden=false;link.textContent='Download prepared ZIP';
  status.textContent=`${asset.dataset}: all ${Object.values(asset.clustering.banks).reduce((n,b)=>n+Object.keys(b).length,0)} saved clusterings · ${asset.records.length} participants · ${(zip.size/1048576).toFixed(1)} MiB. README.md explains the archive.`;
  link.click();if(old?.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(old),60000);
 }catch(error){status.textContent='Export failed: '+error.message}
 finally{heatmapClusteringExportBusy=false;button.disabled=!enrollmentHeatmapAsset()?.clustering}
}
