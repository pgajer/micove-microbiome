// Descriptive summaries of saved fields. Never refit an estimate or embedding.
const jointProfileInputs=new WeakMap();
function jointProfileActive(){return !!estimateAsset()?.correlations&&sampleColorMode()==='joint-clusters'}
function jointProfileKey(asset){return 'micove-joint-profiles:'+asset.datasetId+'@'+asset.revision+':'+asset.correlations.revision}
function jointProfileModel(){
 const m=estimateModel();if(!m?.asset.correlations)return null;if(m.jointProfiles)return m.jointProfiles;
 let saved;try{saved=JSON.parse(localStorage.getItem(jointProfileKey(m.asset)))}catch{}
 const fields=m.asset.correlations.fields,valid=saved?.snapshot?.version===1&&saved.snapshot.clusters?.every(c=>c.id>0&&c.members?.length&&c.members.every(i=>Number.isInteger(i)&&fields[i]));
 return m.jointProfiles={snapshot:valid?saved.snapshot:null,chosen:valid?saved.chosen:null,rows:new Map()};
}
function jointProfileSave(){const m=jointProfileModel();if(m)try{localStorage.setItem(jointProfileKey(estimateAsset()),JSON.stringify({snapshot:m.snapshot,chosen:m.chosen}))}catch{}}
function jointProfileDefinition(){const m=jointProfileModel();return m?.snapshot?.clusters.find(c=>c.id===m.chosen)||null}
function jointProfileSeries(){
 const m=jointProfileModel(),c=jointProfileDefinition();
 if(m?.seriesSnapshot===m?.snapshot&&m?.seriesCluster===c?.id&&m?.series)return m.series;
 const series={id:'joint:'+JSON.stringify([m?.snapshot?.key,c?.id]),joint:true,quantityLabel:'Median feature percentile',unit:'percentile points',valueDomain:'real',label:c?.label||'Joint cluster',k:m?.snapshot?.settings.k};
 if(m){m.series=series;m.seriesSnapshot=m.snapshot;m.seriesCluster=c?.id}return series;
}
function jointProfileSnapshot(view){
 const groups=new Map();view.labels.forEach((id,i)=>{if(id>0){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(view.bank.featureIndices[i])}});
 const settings=Object.fromEntries(['k','unit','method','clustering','minSize','deepSplit','threshold'].map(k=>[k,view.state[k]]));
 const clusters=[...groups].sort((a,b)=>a[0]-b[0]).map(([id,members])=>({id,members,label:view.representatives.get(id).label}));
 const scope={label:view.scope.label,key:view.scope.key,records:view.bank.records,participants:view.bank.participants};
 return {version:1,settings,scope,clusters,key:JSON.stringify([view.asset.correlations.revision,settings,scope.key,clusters])};
}
async function jointProfileInput(asset,k){
 let cache=jointProfileInputs.get(asset);if(!cache){cache=new Map();jointProfileInputs.set(asset,cache)}if(cache.has(k))return cache.get(k);
 const data=asset.correlations,descriptor=data.selectionInputs?.banks.find(b=>b.k===k);
 if(!descriptor)throw Error('Install the correlation-input supplement to color joint clusters.');
 const input=await VME_ASSETS.group('correlation-input:'+asset.datasetId+':'+data.selectionInputs.revision+':'+descriptor.id,{parts:[descriptor.http]});
 if(input.revision!==data.selectionInputs.revision||input.catalogueRevision!==asset.revision||input.sampleOrderSha256!==asset.sampleOrderSha256||input.datasetId!==asset.datasetId||input.k!==k||input.featureIds.length!==data.fields.length||input.featureIds.some((id,i)=>id!==data.fields[i].featureId))throw Error('Joint-profile inputs do not match this dataset.');
 cache.set(k,input);return input;
}
// Weighted mid-distribution percentiles: ties receive half their combined mass.
// Each participant has total weight one, split equally over reference visits.
function jointProfileScores(input,members,sampleCount){
 const n=input.recordIndices.length,counts=new Map();for(const g of input.participantGroups)counts.set(g,(counts.get(g)||0)+1);
 if(input.participantGroups.length!==n||!counts.size||!members.length)throw Error('Empty or invalid joint-profile reference.');
 const bytes=Uint8Array.from(atob(input.valuesBase64),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),total=counts.size;
 if(bytes.length!==8*n*input.featureIds.length)throw Error('Joint-profile input dimensions differ.');
 const ranks=members.map(f=>{
  const values=Array.from({length:n},(_,i)=>view.getFloat64(8*(f*n+i),true));
  if(!values.every(Number.isFinite))throw Error('Joint profiles require common finite feature support.');
  const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>values[a]-values[b]||a-b),result=new Float64Array(n);let mass=0;
  for(let a=0;a<n;){let b=a,weight=0;while(b<n&&values[order[b]]===values[order[a]]){weight+=1/counts.get(input.participantGroups[order[b]]);b++}
   const rank=100*(mass+weight/2)/total;for(let j=a;j<b;j++)result[order[j]]=rank;mass+=weight;a=b}
  return result;
 });
 const values=new Array(sampleCount).fill(null),status=new Array(sampleCount).fill('no_joint_support');
 input.recordIndices.forEach((r,i)=>{if(!Number.isInteger(r)||r<0||r>=sampleCount)throw Error('Joint-profile sample index differs.');const sorted=ranks.map(v=>v[i]).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);values[r]=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;status[r]='ok'});
 return {values,status,referenceRecords:n,referenceParticipants:total};
}
async function jointProfilePrepare(){
 const asset=estimateAsset(),s={...estimateCorrelationState(),clusteringScope:'joint'},scope=estimateCorrelationScope(),data=asset.correlations;let bank;
 if(scope.kind==='selection')bank=await estimateCorrelationCompute(await jointProfileInput(asset,s.k),scope,s);
 else{const d=data.banks.find(b=>b.k===s.k&&b.unit===s.unit&&b.method===s.method);if(!d)throw Error('Joint-cluster correlation bank is not installed.');bank=await VME_ASSETS.group('correlation:'+asset.datasetId+':'+data.revision+':'+d.id,{parts:[d.http]});if(bank.revision!==data.revision)throw Error('Correlation revision differs.')}
 if(!bank||asset!==estimateAsset())return null;
 if(bank.catalogueRevision!==asset.revision||bank.sampleOrderSha256!==asset.sampleOrderSha256||bank.datasetId!==asset.datasetId)throw Error('Joint-cluster bank identity differs.');
 if(bank.issue)throw Error(bank.issue);
 const clustering=await estimateCorrelationCluster(bank,s);if(!clustering||asset!==estimateAsset())return null;
 return jointProfileSnapshot({asset,bank,labels:clustering.labels,representatives:estimateCorrelationRepresentatives(bank,clustering.labels,data),state:s,scope});
}
async function jointProfileChoose(id,view=null){
 const asset=estimateAsset(),m=jointProfileModel();if(view){if(view.asset!==asset||view.state.clusteringScope!=='joint')return;m.snapshot=jointProfileSnapshot(view);m.rows.clear()}
 if(!m.snapshot){const snapshot=await jointProfilePrepare();if(!snapshot||asset!==estimateAsset())return;m.snapshot=snapshot}
 m.chosen=m.snapshot.clusters.some(c=>c.id===id)?id:m.snapshot.clusters[0]?.id??null;jointProfileSave();
 syncSampleColorOptions();el('sampleColorScheme').value='joint-clusters';estimateSyncControls();await recolorSampleView();
}
async function jointProfileRefresh(){
 const asset=estimateAsset(),m=jointProfileModel(),view=estimateCorrelationShown;
 const snapshot=view?.asset===asset&&view.state.clusteringScope==='joint'?jointProfileSnapshot(view):await jointProfilePrepare();
 if(!snapshot||asset!==estimateAsset())return;m.snapshot=snapshot;m.rows.clear();m.chosen=snapshot.clusters[0]?.id??null;jointProfileSave();await recolorSampleView();estimateSyncControls();
}
async function jointProfileEnsure(request){
 const asset=estimateAsset(),m=jointProfileModel();estimateLoaded=null;el('jointProfileStatus').textContent='Preparing cluster profile…';
 try{
  if(!m.snapshot){const snapshot=await jointProfilePrepare();if(!snapshot||request!==estimateRequest||asset!==estimateAsset())return false;m.snapshot=snapshot;m.chosen=snapshot.clusters[0]?.id??null;jointProfileSave()}
  const definition=jointProfileDefinition();if(!definition){el('jointProfileStatus').textContent='No assigned joint clusters at these settings. Change clustering settings and refresh.';jointProfileSync();return true}
  const series=jointProfileSeries();let row=m.rows.get(series.id);
  if(!row){const input=await jointProfileInput(asset,m.snapshot.settings.k);if(request!==estimateRequest||asset!==estimateAsset())return false;row=jointProfileScores(input,definition.members,asset.sampleCount);m.rows.set(series.id,row)}
  if(request!==estimateRequest||asset!==estimateAsset()||jointProfileSeries().id!==series.id)return false;
  estimateLoaded={asset,series,row};el('jointProfileStatus').textContent='';jointProfileSync();return true;
 }catch(error){if(request!==estimateRequest)return false;el('jointProfileStatus').textContent='Cluster profile unavailable: '+error.message;console.error(error);return true}
}
function jointProfileDisplay(c){return {mode:'joint_percentile',reference:null,convert:v=>Number.isFinite(v)?v:null,format:v=>v==null?'Unavailable':Number(v.toFixed(2))+'',limits:estimateLimitsCached(c),title:'Median feature percentile',unit:'percentile points (0–100)'}}
function jointProfileGroupCounts(cluster){const asset=estimateAsset(),fields=asset.correlations.fields;return asset.categories.map(g=>({label:g.label,n:cluster.members.filter(i=>fields[i].categoryId===g.id).length})).filter(g=>g.n).map(g=>g.label+': '+g.n).join(' · ')}
function jointProfileDescription(){const m=jointProfileModel(),c=jointProfileDefinition();if(!c)return 'Choose joint clustering in the heatmap, or refresh to create joint clusters using its current settings.';const s=m.snapshot.settings;return c.label+' · '+c.members.length+' features · '+jointProfileGroupCounts(c)+'. Membership: '+m.snapshot.scope.label+'; '+m.snapshot.scope.records+' visits, '+m.snapshot.scope.participants+' participants; K = '+s.k+'; '+s.method+'; '+(s.unit==='participants'?'participant means':'participant-weighted visits')+'; '+(s.clustering==='dynamic'?'Dynamic Tree Cut, minimum '+s.minSize+', sensitivity '+s.deepSplit:'minimum correlation '+s.threshold)+'. Definition pinned until you choose or refresh a cluster. Percentiles always use the full common-support reference; each visit retains its own profile.'}
function jointProfileInstall(){
 if(el('jointProfileControls'))return;const box=document.createElement('details');box.id='jointProfileControls';box.open=true;box.hidden=true;
 box.innerHTML='<summary>Joint cluster profile</summary><label for="jointProfileCluster">Cluster target</label><div class="participantPicker"><button type="button" id="jointProfilePrevious" aria-label="Previous joint cluster">‹</button><select id="jointProfileCluster" aria-label="Joint cluster target"></select><button type="button" id="jointProfileNext" aria-label="Next joint cluster">›</button></div><p id="jointProfileDescription"></p><label><input id="jointProfileClip" type="checkbox" checked> Limit colors to central 95%</label><p id="jointProfileStatus" role="status"></p><button type="button" id="jointProfileRefresh">Use current heatmap clusters</button> <button type="button" id="jointProfileOpen">Cluster catalogue…</button> <button type="button" id="jointProfileMethods">Profile definition…</button> <button type="button" id="jointProfileExport">Download profile + definition</button>';
 el('sampleColoringControls').appendChild(box);
 const style=document.createElement('style');style.textContent='#jointProfileControls[hidden],#jointClusterCatalogue[hidden]{display:none!important}#jointProfileControls{padding:8px 10px;border-bottom:1px solid #ccdce3;font-size:12px;line-height:1.5}#jointProfileControls select{width:100%;min-width:0}#jointProfileControls button{font-size:12px;margin:3px 0;padding:4px}#jointClusterCatalogue{border:1px solid #ccdce3;padding:8px;margin-top:10px;font-size:12px}#jointClusterCatalogue table{width:100%;border-collapse:collapse}#jointClusterCatalogue th,#jointClusterCatalogue td{padding:5px;text-align:left;border-bottom:1px solid #dae2e5}#jointClusterCatalogue .jointMembers{overflow:auto;max-height:330px}#jointClusterCatalogue summary{cursor:pointer;font-weight:600}';document.head.appendChild(style);
 el('jointProfileCluster').onchange=()=>jointProfileChoose(Number(el('jointProfileCluster').value)).catch(estimateCorrelationError);
 for(const [id,direction] of [['Previous',-1],['Next',1]])el('jointProfile'+id).onclick=()=>{const s=el('jointProfileCluster'),o=s.options[s.selectedIndex+direction];if(o){s.value=o.value;s.onchange()}};
 el('jointProfileClip').onchange=()=>{estimateModel().clip=el('jointProfileClip').checked;estimateSave();recolorSampleView().catch(estimateFailure)};
 el('jointProfileRefresh').onclick=()=>jointProfileRefresh().catch(e=>{el('jointProfileStatus').textContent=e.message});
 el('jointProfileOpen').onclick=()=>{const s=estimateCorrelationState();s.clusteringScope='joint';estimateCorrelationOpen();drawEstimateCorrelations().catch(estimateCorrelationError)};
 el('jointProfileMethods').onclick=jointProfileMethods;el('jointProfileExport').onclick=jointProfileExport;
}
function jointProfileSync(){
 if(!estimateAsset()?.correlations&&!el('jointProfileControls'))return;jointProfileInstall();const box=el('jointProfileControls');box.hidden=!jointProfileActive();if(box.hidden)return;
 const m=jointProfileModel(),select=el('jointProfileCluster');select.replaceChildren(...(m.snapshot?.clusters||[]).map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label+' · '+c.members.length+' features';return o}));select.value=m.chosen;select.disabled=!select.options.length;
 el('jointProfilePrevious').disabled=select.selectedIndex<=0;el('jointProfileNext').disabled=select.selectedIndex<0||select.selectedIndex>=select.options.length-1;
 el('jointProfileDescription').textContent=jointProfileDescription();el('jointProfileClip').checked=estimateModel().clip;el('jointProfileExport').disabled=!estimateCurrent();
}
function jointProfileCatalogue(view){
 let box=el('jointClusterCatalogue');if(!box){box=document.createElement('section');box.id='jointClusterCatalogue';el('estimateCorrelationGallery').before(box)}
 box.hidden=view.state.clusteringScope!=='joint';if(box.hidden)return;
 const snapshot=jointProfileSnapshot(view),asset=view.asset,fields=view.data.fields;
 box.innerHTML='<h3>Joint cluster catalogue</h3><p>All joint clusters in this analysis, independent of heatmap display filters. Open a cluster for its members, grouped by feature type. Coloring pins that definition and uses the median feature percentile, with equal weight per feature.</p>'+snapshot.clusters.map(c=>'<details><summary>'+esc(c.label)+' · '+c.members.length+' features</summary><p>'+esc(jointProfileGroupCounts(c))+'</p><button type="button" data-joint-cluster="'+c.id+'">Color 3D samples by this cluster</button><div class="jointMembers"><table><thead><tr><th>Feature type</th><th>Feature / individual target</th><th>Transformation</th></tr></thead><tbody>'+asset.categories.flatMap(g=>c.members.filter(i=>fields[i].categoryId===g.id).sort((a,b)=>fields[a].label.localeCompare(fields[b].label)||a-b).map(i=>'<tr><td>'+esc(g.label)+'</td><td><button type="button" data-correlation-feature="'+i+'">'+esc(fields[i].label)+'</button></td><td>'+esc(fields[i].transformationLabel)+'</td></tr>')).join('')+'</tbody></table></div></details>').join('')+'<p>'+view.labels.filter(id=>!id).length+' unassigned features are not a cluster and have no combined profile. Constant fields are excluded. Assay-availability members, when present, describe measurement availability. A large feature group contributes more to the median; features are not balanced by group.</p>';
 box.onclick=e=>{const c=e.target.closest?.('[data-joint-cluster]'),f=e.target.closest?.('[data-correlation-feature]');if(c)jointProfileChoose(Number(c.dataset.jointCluster),view).catch(estimateCorrelationError);else if(f)estimateCorrelationSelect(Number(f.dataset.correlationFeature)).catch(estimateCorrelationError)};
}
function jointProfileLegend(entries){
 const c=estimateCurrent(),d=c&&jointProfileDisplay(c),definition=jointProfileDefinition(),seen=new Set(),supported=new Set();
 for(const e of entries){seen.add(e.key);if(c&&Number.isFinite(c.row.values[estimateIndex(e.index,e.record,e.profile)]))supported.add(e.key)}
 let html='<div class="estimateLegend"><strong>'+esc(definition?.label||'Joint cluster profile')+'</strong><p>Median feature percentile · unitless summary of saved estimates, not an outcome probability.</p>';
 if(d?.limits)html+='<div class="estimateRamp" style="background:linear-gradient(to right,'+estimateViridis.join(',')+')"></div><div class="estimateEnds"><span>'+esc(d.format(d.limits[0]))+'</span><span>'+esc(d.format(d.limits[1]))+'</span></div><p>'+(estimateModel().clip?'Colors clipped at the 2.5th and 97.5th percentiles.':'Full profile range.')+' Hover values are unchanged. Color limits stay fixed across sample selections.</p>';
 html+='<p>'+esc(jointProfileDescription())+'</p><p>'+supported.size+' of '+seen.size+' displayed records have a profile. Gray: no common estimate support. Reference markers excluded.</p>'+(c?'<p>Percentile reference: '+c.row.referenceRecords+' visits from '+c.row.referenceParticipants+' equally weighted participants.</p>':'')+'</div>';
 el('sampleLegend').hidden=false;el('sampleLegendItems').innerHTML=html;return true;
}
function jointProfileMethods(){
 let dialog=el('estimateMethods');if(!dialog){dialog=document.createElement('dialog');dialog.id='estimateMethods';document.body.appendChild(dialog)}
 dialog.innerHTML='<button type="button" id="closeJointProfileMethods">Close</button><h2>Where is this joint cluster relatively high or low?</h2><p>Features have different units. For each saved feature estimate, calculate its weighted percentile in the full common-support reference. Then take the median across the cluster’s features for each visit.</p><math><mrow><msub><mi>p</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>=</mo><mn>100</mn><mfrac><mrow><munder><mo>∑</mo><mi>r</mi></munder><msub><mi>w</mi><mi>r</mi></msub><mo>[</mo><mn>1</mn><mo>{</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>r</mi></mrow></msub><mo>&lt;</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>}</mo><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mn>1</mn><mo>{</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>r</mi></mrow></msub><mo>=</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>}</mo><mo>]</mo></mrow><mrow><munder><mo>∑</mo><mi>r</mi></munder><msub><mi>w</mi><mi>r</mi></msub></mrow></mfrac></mrow></math><math><mrow><msub><mi>S</mi><mrow><mi>C</mi><mi>v</mi></mrow></msub><mo>=</mo><msub><mtext>median</mtext><mrow><mi>f</mi><mo>∈</mo><mi>C</mi></mrow></msub><msub><mi>p</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub></mrow></math><p>x is a saved estimate; f is a feature; v is the visit being colored; r runs over reference visits. Each reference visit has weight w = 1 / the number of reference visits from its participant. Thus each participant contributes total weight one. The indicator 1{condition} is one when true and zero otherwise; ties receive half their combined weight. C is the selected cluster; S is its median feature percentile, averaging the middle two values for an even number of features.</p><p>The reference contains all visits with common finite support in the saved correlation-input bank at the chosen K. Visits outside this reference are gray. The same full reference sets the percentile scales even for a cluster formed within a selected state. Averaging visits for clustering changes cluster membership only; colors still summarize each visit’s estimates.</p><p>Each feature has equal influence. A group with more features contributes more; no signs are flipped. Opposing feature patterns can cancel in the median. Unassigned and constant features are not combined. Availability diagnostics are identified in the catalogue. The result is a median of feature percentiles, not the percentile of a single measured variable, a probability, or evidence of association.</p><p>Cluster membership, K and the reference scale remain pinned until explicitly replaced. Heatmap changes do not silently alter these colors. Color clipping affects only display; downloads retain unmodified scores and the complete definition.</p>';
 el('closeJointProfileMethods').onclick=()=>dialog.close();dialog.showModal();
}
async function jointProfileExport(){
 const c=estimateCurrent();if(!c?.series.joint)return;const m=jointProfileModel(),cluster=jointProfileDefinition(),fields=estimateAsset().correlations.fields;
 const definition={...m.snapshot,selectedCluster:cluster.id,features:cluster.members.map(i=>fields[i]),score:'Median of participant-weighted mid-distribution feature percentiles (0–100)',reference:'Full common-support visit reference; participant weight 1, divided over visits',referenceRecords:c.row.referenceRecords,referenceParticipants:c.row.referenceParticipants,catalogueRevision:estimateAsset().revision,correlationRevision:estimateAsset().correlations.revision,sampleOrderSha256:estimateAsset().sampleOrderSha256,colorLimits:estimateLimitsCached(c),colorsClipped:estimateModel().clip};
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv=[['sample_id','median_feature_percentile','status'],...estimateAsset().sampleIds.map((id,i)=>[id,c.row.values[i],c.row.status[i]])].map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
 // One archive avoids browser restrictions on multiple automatic downloads.
 const files=[{name:'profile.csv',text:csv},{name:'definition.json',text:JSON.stringify(definition,null,2)}];
 const zip=await heatmapZip(files);estimateDownload(zip,'MiCOVE-joint-cluster-'+cluster.id+'.zip','application/zip');
}
