// Descriptive summaries of saved fields. Never refit an estimate or embedding.
const jointProfileInputs=new WeakMap();
function jointProfileActive(){return !!estimateAsset()?.correlations&&sampleColorMode()==='joint-clusters'}
function jointProfileKey(asset){return 'micove-joint-profiles:'+asset.datasetId+'@'+asset.revision+':'+asset.correlations.revision+(asset.correlations.exclusionPolicy?':'+asset.correlations.exclusionPolicy.id:'')}
function jointProfileModel(){
 const m=estimateModel();if(!m?.asset.correlations)return null;if(m.jointProfiles)return m.jointProfiles;
 let saved;try{saved=JSON.parse(localStorage.getItem(jointProfileKey(m.asset)))}catch{}
 const fields=m.asset.correlations.fields,valid=saved?.snapshot?.version===1&&saved.snapshot.clusters?.every(c=>c.id>0&&c.members?.length&&c.members.every(i=>Number.isInteger(i)&&fields[i]));
 return m.jointProfiles={snapshot:valid?saved.snapshot:null,chosen:valid?saved.chosen:null,weighting:saved?.weighting==='groups'?'groups':'features',rows:new Map()};
}
function jointProfileSave(){const m=jointProfileModel();if(m)try{localStorage.setItem(jointProfileKey(estimateAsset()),JSON.stringify({snapshot:m.snapshot,chosen:m.chosen,weighting:m.weighting}))}catch{}}
function jointProfileWeightingLabel(weighting){return weighting==='groups'?'Equal feature-group weights':'Equal feature weights'}
function jointProfileDefinition(){const m=jointProfileModel();return m?.snapshot?.clusters.find(c=>c.id===m.chosen)||null}
function jointProfileSeries(){
 const m=jointProfileModel(),c=jointProfileDefinition();
 if(m?.seriesSnapshot===m?.snapshot&&m?.seriesCluster===c?.id&&m?.series?.weighting===m?.weighting)return m.series;
 const series={id:'joint:'+JSON.stringify([m?.snapshot?.key,c?.id,m?.weighting]),joint:true,weighting:m?.weighting,quantityLabel:m?.weighting==='groups'?'Group-balanced median percentile':'Median feature percentile',unit:'percentile points',valueDomain:'real',label:c?'C'+c.id:'Joint cluster',k:m?.snapshot?.settings.k};
 if(m){m.series=series;m.seriesSnapshot=m.snapshot;m.seriesCluster=c?.id}return series;
}
function jointProfileSnapshot(view){
 const groups=new Map();view.labels.forEach((id,i)=>{if(id>0){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(view.bank.featureIndices[i])}});
 const settings=Object.fromEntries(['k','unit','method','clustering','minSize','deepSplit','threshold'].map(k=>[k,view.state[k]]));
 const clusters=[...groups].sort((a,b)=>a[0]-b[0]).map(([id,members])=>({id,members,label:'C'+id}));
 const scope={label:view.scope.label,key:view.scope.key,records:view.bank.records,participants:view.bank.participants};
 return {version:1,source:{kind:'heatmap'},...(view.asset.correlations.exclusionPolicy?{exclusionPolicy:view.asset.correlations.exclusionPolicy}:{}),settings,scope,clusters,key:JSON.stringify([view.asset.correlations.revision,settings,scope.key,clusters])};
}
async function jointProfileInput(asset,k){
 let cache=jointProfileInputs.get(asset);if(!cache){cache=new Map();jointProfileInputs.set(asset,cache)}if(cache.has(k))return cache.get(k);
 const data=asset.correlations,descriptor=data.selectionInputs?.banks.find(b=>b.k===k);
 if(!descriptor)throw Error('Install the correlation-input supplement to color joint clusters.');
 const input=await VME_ASSETS.group('correlation-input:'+asset.datasetId+':'+data.selectionInputs.revision+':'+descriptor.id,{parts:[descriptor.http]});
 if(input.revision!==data.selectionInputs.revision||input.catalogueRevision!==asset.revision||input.sampleOrderSha256!==asset.sampleOrderSha256||input.datasetId!==asset.datasetId||input.k!==k||input.featureIds.length!==data.fields.length||input.featureIds.some((id,i)=>id!==data.fields[i].featureId))throw Error('Joint-profile inputs do not match this dataset.');
 cache.set(k,input);return input;
}
// Equal feature mass, or equal group mass divided among its member features.
function jointProfileMemberWeights(members,fields,weighting='features'){
 if(!members.length)throw Error('A profile needs at least one member.');
 if(weighting==='features')return members.map(()=>1/members.length);
 if(weighting!=='groups')throw Error('Unknown joint-profile weighting.');
 const groups=members.map(i=>fields[i]?.categoryId),counts=new Map();
 if(groups.some(g=>typeof g!=='string'||!g))throw Error('Every profile member needs a feature group.');
 for(const g of groups)counts.set(g,(counts.get(g)||0)+1);
 return groups.map(g=>1/(counts.size*counts.get(g)));
}
function jointProfileWeightedMedian(values,weights){
 const order=values.map((_,i)=>i).sort((a,b)=>values[a]-values[b]),total=weights.reduce((a,b)=>a+b,0),half=total/2,tolerance=64*Number.EPSILON*total;let mass=0;
 for(let j=0;j<order.length;j++){
  const i=order[j];mass+=weights[i];
  // An exact half-weight split has a median interval; use its midpoint,
  // agreeing with the ordinary median when all feature weights are equal.
  if(Math.abs(mass-half)<=tolerance&&j+1<order.length)return (values[i]+values[order[j+1]])/2;
  if(mass>half)return values[i];
 }
 return values[order[order.length-1]];
}
function jointProfileScores(input,members,sampleCount,fields=[],weighting='features'){
 // Participant-weighted mid-distribution percentiles are identical in both
 // modes: each participant has total weight one, split over reference visits.
 const n=input.recordIndices.length,counts=new Map();for(const g of input.participantGroups)counts.set(g,(counts.get(g)||0)+1);
 if(input.participantGroups.length!==n||!counts.size||!members.length)throw Error('Empty or invalid joint-profile reference.');
 const featureWeights=jointProfileMemberWeights(members,fields,weighting);
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
 input.recordIndices.forEach((r,i)=>{if(!Number.isInteger(r)||r<0||r>=sampleCount)throw Error('Joint-profile sample index differs.');const percentiles=ranks.map(v=>v[i]);
  if(weighting==='groups')values[r]=jointProfileWeightedMedian(percentiles,featureWeights);
  else{const sorted=percentiles.sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);values[r]=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2}
  status[r]='ok';
 });
 return {values,status,referenceRecords:n,referenceParticipants:total,weighting,featureWeights};
}
async function jointProfilePrepare(){
 const asset=estimateAsset(),s={...estimateCorrelationState(),clusteringScope:'joint'},scope=estimateCorrelationScope(),data=asset.correlations;let bank;
 if(scope.kind==='selection')bank=await estimateCorrelationCompute(await jointProfileInput(asset,s.k),scope,s);
 else{const d=data.banks.find(b=>b.k===s.k&&b.unit===s.unit&&b.method===s.method);if(!d)throw Error('Joint-cluster correlation bank is not installed.');bank=await VME_ASSETS.group('correlation:'+asset.datasetId+':'+data.revision+':'+d.id,{parts:[d.http]});if(bank.revision!==data.revision)throw Error('Correlation revision differs.')}
 if(!bank||asset!==estimateAsset())return null;
 if(bank.catalogueRevision!==asset.revision||bank.sampleOrderSha256!==asset.sampleOrderSha256||bank.datasetId!==asset.datasetId)throw Error('Joint-cluster bank identity differs.');
 if(bank.issue)throw Error(bank.issue);
 bank=estimateCorrelationAnalysisBank(bank,data);
 const clustering=await estimateCorrelationCluster(bank,s);if(!clustering||asset!==estimateAsset())return null;
 return jointProfileSnapshot({asset,bank,labels:clustering.labels,representatives:estimateCorrelationRepresentatives(bank,clustering.labels,data),state:s,scope});
}
async function jointProfileChoose(id,view=null){
 const asset=estimateAsset(),m=jointProfileModel();if(view){if(view.asset!==asset||view.state.clusteringScope!=='joint')return;m.snapshot=jointProfileSnapshot(view);m.rows.clear()}
 if(!m.snapshot){const snapshot=await jointProfilePrepare();if(!snapshot||asset!==estimateAsset())return;m.snapshot=snapshot}
 m.chosen=m.snapshot.clusters.some(c=>c.id===id)?id:m.snapshot.clusters[0]?.id??null;jointProfileSave();
 syncSampleColorOptions();el('sampleColorScheme').value='joint-clusters';estimateSyncControls();await recolorSampleView();
}
async function jointProfileEnsure(request){
 const asset=estimateAsset(),m=jointProfileModel();estimateLoaded=null;el('jointProfileStatus').textContent='Preparing cluster profile…';
 try{
  if(!m.snapshot){const snapshot=await jointProfilePrepare();if(!snapshot||request!==estimateRequest||asset!==estimateAsset())return false;m.snapshot=snapshot;m.chosen=snapshot.clusters[0]?.id??null;jointProfileSave()}
  const definition=jointProfileDefinition();if(!definition){el('jointProfileStatus').textContent='No assigned joint clusters in the saved definition. Choose Jointly in the heatmap, adjust its settings and use Color 3D samples beside a cluster.';jointProfileSync();return true}
  const series=jointProfileSeries();let row=m.rows.get(series.id);
  if(!row){const input=await jointProfileInput(asset,m.snapshot.settings.k);if(request!==estimateRequest||asset!==estimateAsset())return false;row=jointProfileScores(input,definition.members,asset.sampleCount,asset.correlations.fields,series.weighting);m.rows.set(series.id,row)}
  if(request!==estimateRequest||asset!==estimateAsset()||jointProfileSeries().id!==series.id)return false;
  estimateLoaded={asset,series,row};el('jointProfileStatus').textContent='';jointProfileSync();return true;
 }catch(error){if(request!==estimateRequest)return false;el('jointProfileStatus').textContent='Cluster profile unavailable: '+error.message;console.error(error);return true}
}
function jointProfileDisplay(c){return {mode:'joint_percentile',reference:null,convert:v=>Number.isFinite(v)?v:null,format:v=>v==null?'Unavailable':Number(v.toFixed(2))+'',limits:estimateLimitsCached(c),title:c.series.weighting==='groups'?'Median percentile · equal groups':'Median feature percentile',unit:'percentile points (0–100)'}}
function jointProfileGroupCounts(cluster){const asset=estimateAsset();return estimateClusterGroupCounts(cluster.members,asset.correlations.fields,asset.categories)}
function jointProfileDefinitionLabel(snapshot){
 if(!snapshot)return 'No cluster chosen';
 const frozen=typeof jointEmbeddingModel==='function'?jointEmbeddingModel()?.data:null;
 if(snapshot.source?.kind==='embedding'||frozen?.snapshot.key===snapshot.key)return 'Frozen '+snapshot.clusters.length+'-cluster map'+(snapshot.exclusionPolicy?' · Outcomes excluded':' · Original, outcomes included');
 return snapshot.source?.kind==='heatmap'?'Saved heatmap clustering'+(snapshot.exclusionPolicy?' · Outcomes excluded':''):'Saved joint clustering (earlier session)';
}
function jointProfileComparableDefinition(snapshot){
 if(!snapshot)return null;const s=snapshot.settings;
 // Display labels and source metadata are not part of cluster membership.
 return JSON.stringify([snapshot.exclusionPolicy?.id||null,s.k,s.unit,s.method,s.clustering,s.clustering==='dynamic'?[s.minSize,s.deepSplit]:s.threshold,
  snapshot.scope.key,snapshot.scope.records,snapshot.scope.participants,
  snapshot.clusters.map(c=>[c.id,[...c.members].sort((a,b)=>a-b)]).sort((a,b)=>a[0]-b[0])]);
}
function jointProfileHeatmapRelation(snapshot,view){
 if(!view||view.asset!==estimateAsset())return 'The heatmap definition is being prepared. The saved color definition is unchanged.';
 if(view.state.clusteringScope!=='joint')return 'The heatmap currently clusters feature groups separately. This saved joint color definition is unchanged.';
 return jointProfileComparableDefinition(snapshot)===jointProfileComparableDefinition(jointProfileSnapshot(view))
  ?'The saved color definition matches the current heatmap clustering. Changing heatmap settings will not change it.'
  :'The saved color definition differs from the current heatmap clustering; the same cluster number may have different members. Use Color 3D samples beside a heatmap cluster to replace it.';
}
function jointProfileHeatmapSync(){
 const box=el('jointProfileSummary');if(!box)return;
 const m=jointProfileModel(),c=jointProfileDefinition();box.hidden=!jointProfileActive()||!c;if(box.hidden)return;
 el('jointProfileSavedLabel').textContent='C'+c.id+' · '+c.members.length+' features · Saved definition: '+jointProfileDefinitionLabel(m.snapshot)+'.';
 el('jointProfileSavedDescription').textContent=jointProfileDescription();
 el('jointProfileHeatmapRelation').textContent=jointProfileHeatmapRelation(m.snapshot,estimateCorrelationShown)+' Downloads use this saved color definition, not the current heatmap. The 3D embedding is unchanged.';
 el('jointProfileExport').disabled=!jointProfileExportReady();
 el('jointProfileExportStatus').textContent='';
}
function jointProfileDescription(){const m=jointProfileModel(),c=jointProfileDefinition();if(!c)return 'Choose Jointly in the heatmap, then use a cluster’s Color 3D samples action.';const s=m.snapshot.settings;return 'C'+c.id+' · '+c.members.length+' features · '+jointProfileGroupCounts(c)+'. '+jointProfileWeightingLabel(m.weighting)+'. Membership: '+m.snapshot.scope.label+'; '+m.snapshot.scope.records+' visits, '+m.snapshot.scope.participants+' participants; K = '+s.k+'; '+s.method+'; '+(s.unit==='participants'?'participant means':'participant-weighted visits')+'; '+(s.clustering==='dynamic'?'Dynamic Tree Cut, minimum '+s.minSize+', sensitivity '+s.deepSplit:'minimum correlation '+s.threshold)+'. Definition saved until you choose a cluster from another definition. Percentiles always use the full common-support reference; each visit retains its own profile.'}
function jointProfileInstall(){
 if(el('jointProfileControls'))return;const box=document.createElement('details');box.id='jointProfileControls';box.open=true;box.hidden=true;
 box.innerHTML='<summary>Joint cluster profile</summary><label for="jointProfileCluster">Cluster target</label><div class="participantPicker"><button type="button" id="jointProfilePrevious" aria-label="Previous joint cluster">‹</button><select id="jointProfileCluster" aria-label="Joint cluster target"></select><button type="button" id="jointProfileNext" aria-label="Next joint cluster">›</button></div><label title="Off: every feature has equal weight. On: every group present in this cluster has equal total weight, divided equally among its features. The profile is their weighted median percentile; membership and percentile references stay fixed."><input id="jointProfileEqualGroups" type="checkbox"> Weight feature groups equally</label><p id="jointProfileDefinitionLabel"></p><p id="jointProfileDescription"></p><label><input id="jointProfileClip" type="checkbox" checked> Limit colors to central 95%</label><p id="jointProfileStatus" role="status"></p><p>Choose a new definition with <b>Color 3D samples</b> beside a cluster in the heatmap panel. Profile documentation and downloads are there too.</p>';
 el('sampleColoringControls').appendChild(box);
 const style=document.createElement('style');style.textContent='#jointProfileControls[hidden],#jointClusterCatalogue[hidden]{display:none!important}#jointProfileControls{padding:8px 10px;border-bottom:1px solid #ccdce3;font-size:12px;line-height:1.5}#jointProfileControls select{width:100%;min-width:0}#jointProfileControls button{font-size:12px;margin:3px 0;padding:4px}#jointClusterCatalogue{border:1px solid #ccdce3;padding:8px;margin-top:10px;font-size:12px}#jointClusterCatalogue table{width:100%;border-collapse:collapse}#jointClusterCatalogue th,#jointClusterCatalogue td{padding:5px;text-align:left;border-bottom:1px solid #dae2e5}#jointClusterCatalogue .jointMembers{overflow:auto;max-height:330px}#jointClusterCatalogue summary{cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px}#jointClusterCatalogue summary>span:before{content:"▸ "}#jointClusterCatalogue details[open]>summary>span:before{content:"▾ "}#jointClusterCatalogue summary button{flex-shrink:0}#jointProfileSummary[hidden]{display:none!important}#jointProfileSummary{border:1px solid #ccdce3;border-radius:5px;padding:8px;margin:10px 0}#jointProfileSummary h3{font-size:14px;margin:0 0 5px}#jointProfileSummary button{margin:3px 5px 3px 0}';document.head.appendChild(style);
 el('jointProfileCluster').onchange=()=>jointProfileChoose(Number(el('jointProfileCluster').value)).catch(estimateCorrelationError);
 for(const [id,direction] of [['Previous',-1],['Next',1]])el('jointProfile'+id).onclick=()=>{const s=el('jointProfileCluster'),o=s.options[s.selectedIndex+direction];if(o){s.value=o.value;s.onchange()}};
 el('jointProfileEqualGroups').onchange=()=>{jointProfileModel().weighting=el('jointProfileEqualGroups').checked?'groups':'features';jointProfileSave();recolorSampleView().catch(e=>{el('jointProfileStatus').textContent=e.message})};
 el('jointProfileClip').onchange=()=>{estimateModel().clip=el('jointProfileClip').checked;estimateSave();recolorSampleView().catch(estimateFailure)};
}
function jointProfileSync(){
 if(!estimateAsset()?.correlations&&!el('jointProfileControls'))return;jointProfileInstall();const box=el('jointProfileControls');box.hidden=!jointProfileActive();jointProfileHeatmapSync();if(box.hidden)return;
 const m=jointProfileModel(),select=el('jointProfileCluster');select.replaceChildren(...(m.snapshot?.clusters||[]).map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent='C'+c.id+' · '+jointProfileGroupCounts(c);return o}));select.value=m.chosen;select.disabled=!select.options.length;
 el('jointProfilePrevious').disabled=select.selectedIndex<=0;el('jointProfileNext').disabled=select.selectedIndex<0||select.selectedIndex>=select.options.length-1;
 el('jointProfileDescription').textContent=jointProfileDescription();el('jointProfileEqualGroups').checked=m.weighting==='groups';el('jointProfileClip').checked=estimateModel().clip;el('jointProfileDefinitionLabel').textContent='Saved definition: '+jointProfileDefinitionLabel(m.snapshot)+'.';
}
function jointProfileCatalogue(view){
 let box=el('jointClusterCatalogue');if(!box){box=document.createElement('section');box.id='jointClusterCatalogue';el('estimateCorrelationGallery').before(box)}
 box.hidden=view.state.clusteringScope!=='joint';if(box.hidden)return;
 const snapshot=jointProfileSnapshot(view),asset=view.asset,fields=view.data.fields;
 box.innerHTML='<h3>Joint cluster catalogue</h3><p>All joint clusters in this analysis, independent of heatmap display filters. Open a cluster for its members, grouped by feature type. Color 3D samples saves that cluster definition and uses your current profile weighting. In the sample sidebar, choose equal feature weights (default) or equal total weight per feature group.</p>'+snapshot.clusters.map(c=>'<details><summary><span>'+'C'+c.id+' · '+esc(jointProfileGroupCounts(c))+'</span><button type="button" data-joint-cluster="'+c.id+'" aria-label="Color 3D samples by C'+c.id+'">Color 3D samples</button></summary><p>'+esc(jointProfileGroupCounts(c))+'</p><div class="jointMembers"><table><thead><tr><th>Feature type</th><th>Feature / individual target</th><th>Transformation</th></tr></thead><tbody>'+asset.categories.flatMap(g=>c.members.filter(i=>fields[i].categoryId===g.id).sort((a,b)=>fields[a].label.localeCompare(fields[b].label)||a-b).map(i=>'<tr><td>'+esc(g.label)+'</td><td><button type="button" data-correlation-feature="'+i+'">'+esc(fields[i].label)+'</button></td><td>'+esc(fields[i].transformationLabel)+'</td></tr>')).join('')+'</tbody></table></div></details>').join('')+'<p>'+view.labels.filter(id=>!id).length+' unassigned features are not a cluster and have no combined profile. Constant fields are excluded. Assay-availability members, when present, describe measurement availability. Equal-feature weighting lets large groups contribute more; equal-group weighting divides the same total weight among each group’s members.</p>';
 box.onclick=e=>{const c=e.target.closest?.('[data-joint-cluster]'),f=e.target.closest?.('[data-correlation-feature]');if(c){e.preventDefault();jointProfileChoose(Number(c.dataset.jointCluster),view).catch(estimateCorrelationError)}else if(f)estimateCorrelationSelect(Number(f.dataset.correlationFeature)).catch(estimateCorrelationError)};
}
function jointProfileLegend(entries){
 const c=estimateCurrent(),d=c&&jointProfileDisplay(c),definition=jointProfileDefinition(),seen=new Set(),supported=new Set();
 for(const e of entries){seen.add(e.key);if(c&&Number.isFinite(c.row.values[estimateIndex(e.index,e.record,e.profile)]))supported.add(e.key)}
 let html='<div class="estimateLegend"><strong>'+esc(definition?'C'+definition.id+' · '+jointProfileGroupCounts(definition):'Joint cluster profile')+'</strong><p>'+esc(jointProfileWeightingLabel(jointProfileModel().weighting))+' · median feature percentile · unitless summary of saved estimates, not an outcome probability.</p>';
 if(d?.limits)html+='<div class="estimateRamp" style="background:linear-gradient(to right,'+estimateViridis.join(',')+')"></div><div class="estimateEnds"><span>'+esc(d.format(d.limits[0]))+'</span><span>'+esc(d.format(d.limits[1]))+'</span></div><p>'+(estimateModel().clip?'Colors clipped at the 2.5th and 97.5th percentiles.':'Full profile range.')+' Hover values are unchanged. Color limits stay fixed across sample selections.</p>';
 html+='<p>'+esc(jointProfileDescription())+'</p><p>'+supported.size+' of '+seen.size+' displayed records have a profile. Gray: no common estimate support. Reference markers excluded.</p>'+(c?'<p>Percentile reference: '+c.row.referenceRecords+' visits from '+c.row.referenceParticipants+' equally weighted participants.</p>':'')+'</div>';
 el('sampleLegend').hidden=false;el('sampleLegendItems').innerHTML=html;return true;
}
function jointProfileMethods(){
 let dialog=el('estimateMethods');if(!dialog){dialog=document.createElement('dialog');dialog.id='estimateMethods';document.body.appendChild(dialog)}
 dialog.innerHTML='<button type="button" id="closeJointProfileMethods">Close</button><h2>Where is this joint cluster relatively high or low?</h2><p>Features have different units. For each saved feature estimate, calculate its weighted percentile in the full common-support reference. Then take the median across the cluster’s features for each visit, optionally weighting each feature group equally.</p><math><mrow><msub><mi>p</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>=</mo><mn>100</mn><mfrac><mrow><munder><mo>∑</mo><mi>r</mi></munder><msub><mi>w</mi><mi>r</mi></msub><mo>[</mo><mn>1</mn><mo>{</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>r</mi></mrow></msub><mo>&lt;</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>}</mo><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mn>1</mn><mo>{</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>r</mi></mrow></msub><mo>=</mo><msub><mi>x</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>}</mo><mo>]</mo></mrow><mrow><munder><mo>∑</mo><mi>r</mi></munder><msub><mi>w</mi><mi>r</mi></msub></mrow></mfrac></mrow></math><math><mrow><msub><mi>S</mi><mrow><mi>C</mi><mi>v</mi></mrow></msub><mo>=</mo><msub><mtext>median</mtext><mrow><mi>f</mi><mo>∈</mo><mi>C</mi></mrow></msub><msub><mi>p</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub></mrow></math><p>x is a saved estimate; f is a feature; v is the visit being colored; r runs over reference visits. Each reference visit has weight w = 1 / the number of reference visits from its participant. Thus each participant contributes total weight one. The indicator 1{condition} is one when true and zero otherwise; ties receive half their combined weight. C is the selected cluster; S is its median feature percentile, averaging the middle two values for an even number of features.</p><h3>Optional equal-group weighting</h3><math><mrow><msub><mi>a</mi><mi>f</mi></msub><mo>=</mo><mfrac><mn>1</mn><mrow><mi>G</mi><msub><mi>n</mi><mrow><mi>g</mi><mo>(</mo><mi>f</mi><mo>)</mo></mrow></msub></mrow></mfrac><mspace width="2em"/><msub><mi>S</mi><mrow><mi>C</mi><mi>v</mi></mrow></msub><mo>=</mo><msub><mtext>weighted median</mtext><mrow><mi>f</mi><mo>∈</mo><mi>C</mi></mrow></msub><mo>(</mo><msub><mi>p</mi><mrow><mi>f</mi><mi>v</mi></mrow></msub><mo>;</mo><msub><mi>a</mi><mi>f</mi></msub><mo>)</mo></mrow></math><p>G is the number of feature groups represented in this cluster; g(f) is the group containing feature f; n is that group’s number of cluster members. Thus every group has total weight 1/G. For example, ten metabolites and two immune markers receive 50% weight per group: 5% per metabolite and 25% per immune marker. Groups absent from the cluster get no weight. Availability diagnostics, if present, count as their own group.</p><p>Sort feature percentiles from low to high and accumulate their weights. The weighted median is the value where cumulative weight crosses one half. If it reaches exactly one half between two values, use their average. This preserves the ordinary median when weights are equal. This is a weighted median of all feature percentiles, not a median of group medians. Participant weights used to calculate percentiles are unchanged.</p><p>The reference contains all visits with common finite support in the saved correlation-input bank at the chosen K. Visits outside this reference are gray. The same full reference sets the percentile scales even for a cluster formed within a selected state. Averaging visits for clustering changes cluster membership only; colors still summarize each visit’s estimates.</p><p>By default each feature has equal weight. A group with more features contributes more. The optional equal-group mode assigns the same total weight to every feature group present in this cluster, divided equally among its member features; no signs are flipped. Opposing feature patterns can cancel in the median. Unassigned and constant features are not combined. Availability diagnostics are identified in the catalogue. The result is a median of feature percentiles, not the percentile of a single measured variable, a probability, or evidence of association.</p><p>Changing weighting changes only the profile aggregation and its color limits. The feature percentiles, cluster membership and K remain fixed. Cluster membership, K and the reference scale remain pinned until explicitly replaced. Heatmap changes do not silently alter these colors. Color clipping affects only display; downloads retain unmodified scores and the complete definition.</p>';
 el('closeJointProfileMethods').onclick=()=>dialog.close();dialog.showModal();
}
function jointProfileExportReady(){const c=estimateCurrent();return !!(c?.asset===estimateAsset()&&c?.series.joint&&c.series.id===jointProfileSeries().id)}
async function jointProfileExport(){
 if(!jointProfileExportReady())throw Error('Wait for the selected color profile to finish loading.');
 const c=estimateCurrent();const m=jointProfileModel(),cluster=jointProfileDefinition(),fields=estimateAsset().correlations.fields;
 const definition={...m.snapshot,definitionSourceLabel:jointProfileDefinitionLabel(m.snapshot),selectedCluster:cluster.id,weighting:c.series.weighting,weightingLabel:jointProfileWeightingLabel(c.series.weighting),medianRule:'At an exact half-weight split, average the two bounding percentiles',features:cluster.members.map((i,j)=>({...fields[i],profileWeight:c.row.featureWeights[j]})),score:c.series.quantityLabel+' of participant-weighted mid-distribution feature percentiles (0–100)',reference:'Full common-support visit reference; participant weight 1, divided over visits',referenceRecords:c.row.referenceRecords,referenceParticipants:c.row.referenceParticipants,catalogueRevision:estimateAsset().revision,correlationRevision:estimateAsset().correlations.revision,sampleOrderSha256:estimateAsset().sampleOrderSha256,colorLimits:estimateLimitsCached(c),colorsClipped:estimateModel().clip};
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv=[['sample_id','median_feature_percentile','status','weighting'],...estimateAsset().sampleIds.map((id,i)=>[id,c.row.values[i],c.row.status[i],c.series.weighting])].map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
 // One archive avoids browser restrictions on multiple automatic downloads.
 const files=[{name:'profile.csv',text:csv},{name:'definition.json',text:JSON.stringify(definition,null,2)}];
 const zip=await heatmapZip(files);estimateDownload(zip,'MiCOVE-joint-cluster-'+cluster.id+'-equal-'+c.series.weighting+'.zip','application/zip');
}
