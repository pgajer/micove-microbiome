// Optional, frozen visit-by-cluster representation. Existing maps remain intact.
const jointEmbeddingModels=new WeakMap();
function jointEmbeddingChoices(asset=estimateAsset()){
 const descriptors=asset?.profileEmbeddings||[];
 const preferred=asset?.datasetId==='lsvf-v3v4-20241111'&&descriptors.find(d=>d.id==='lsvf-joint-outcome-excluded-euclidean-v1');
 if(!preferred)return descriptors.slice();
 const variants=descriptors.filter(d=>d!==preferred&&preferred.exclusionPolicyId&&d.exclusionPolicyId===preferred.exclusionPolicyId);
 return [preferred,...variants,...descriptors.filter(d=>d!==preferred&&!variants.includes(d))];
}
function jointEmbeddingWeightingLabel(data){return data?.weighting==='groups'?'Equal feature-group weights':'Equal feature weights'}
function jointEmbeddingWeightingMethods(data){
 if(data.weighting!=='groups')return '<p>Every feature in a cluster contributes equally to its ordinary median percentile. A group with more cluster members therefore contributes more features.</p>';
 return '<math display="block"><mrow><msub><mi>a</mi><mrow><mi>f</mi><mi>c</mi></mrow></msub><mo>=</mo><mfrac><mn>1</mn><mrow><msub><mi>G</mi><mi>c</mi></msub><msub><mi>n</mi><mrow><mi>g</mi><mo>(</mo><mi>f</mi><mo>)</mo><mo>,</mo><mi>c</mi></mrow></msub></mrow></mfrac></mrow></math><p>a is the weight of feature f in cluster c. G counts the feature groups present in that cluster; g(f) identifies the feature’s group; n counts that group’s members in the cluster. Ten metabolites and two immune markers would receive half the total weight per group: 5% per metabolite and 25% per immune marker. Sort the feature percentiles and accumulate their weights. The weighted median is where the total crosses one half; at an exact half-weight split, average the two bounding values. This is not a median of group medians. Participant weights and cluster memberships are unchanged; all '+data.snapshot.clusters.length+' cluster dimensions still contribute equally to Euclidean distances.</p>';
}
function jointEmbeddingModel(){
 const asset=estimateAsset(),descriptors=asset?.profileEmbeddings;if(!descriptors?.length)return null;
 if(jointEmbeddingModels.has(asset))return jointEmbeddingModels.get(asset);
 const key='micove-profile-representation:'+asset.datasetId+'@'+asset.revision+':representations';let saved;
 try{saved=JSON.parse(localStorage.getItem(key))}catch{}
 if(!saved)try{const legacy=JSON.parse(localStorage.getItem('micove-profile-representation:'+asset.datasetId+'@'+asset.revision+':'+descriptors[0].id));if(legacy)saved={...legacy,selectedId:descriptors[0].id}}catch{}
 const selectedId=descriptors.some(d=>d.id===saved?.selectedId)?saved.selectedId:jointEmbeddingChoices(asset)[0].id;
 const model={key,selectedId,choice:saved?.choice==='profiles'?'profiles':'composition',cameras:saved?.cameras||{},loaded:new Map(),promises:new Map(),get data(){return this.loaded.get(this.selectedId)?.data||null},get index(){return this.loaded.get(this.selectedId)?.index}};
 if(model.cameras.profiles&&!model.cameras[selectedId])model.cameras[selectedId]=model.cameras.profiles;
 jointEmbeddingModels.set(asset,model);return model;
}
function jointEmbeddingDescriptor(id=jointEmbeddingModel()?.selectedId){return estimateAsset()?.profileEmbeddings?.find(d=>d.id===id)||null}
function jointEmbeddingCameraKey(){const m=jointEmbeddingModel();return m?.choice==='profiles'?m.selectedId:'composition'}
function jointEmbeddingSave(){const m=jointEmbeddingModel();if(m)try{localStorage.setItem(m.key,JSON.stringify({choice:m.choice,selectedId:m.selectedId,cameras:m.cameras}))}catch{}}
function jointEmbeddingSnapshot(){const m=jointEmbeddingModel();return m?{id:m.selectedId,choice:m.choice}:null}
function jointEmbeddingRestore(saved){const m=jointEmbeddingModel();if(saved?.choice==='profiles'&&!jointEmbeddingDescriptor(saved.id))throw Error('This saved view requires its original joint-profile supplement.');if(m){if(jointEmbeddingDescriptor(saved?.id))m.selectedId=saved.id;m.choice=saved?.choice==='profiles'?'profiles':'composition';jointEmbeddingSave()}}
function jointEmbeddingActive(){return jointEmbeddingModel()?.choice==='profiles'}
async function jointEmbeddingLoad(id=jointEmbeddingModel()?.selectedId){
 const m=jointEmbeddingModel(),asset=estimateAsset(),d=jointEmbeddingDescriptor(id);if(!m||!d)return null;if(m.loaded.has(id))return m.loaded.get(id).data;
 if(!m.promises.has(id))m.promises.set(id,VME_ASSETS.group('profile-embedding:'+asset.datasetId+':'+d.sha256,{parts:[d.http]}).then(data=>{
  if(data.format!=='micove-joint-profile-embedding'||data.version!==1||data.id!==d.id||data.datasetId!==asset.datasetId||data.catalogueRevision!==asset.revision||data.sampleOrderSha256!==asset.sampleOrderSha256||data.recordIndices.length!==data.coordinates.length||data.coordinates.some(p=>p.length!==3||!p.every(Number.isFinite)))throw Error('Joint-profile embedding identity or coordinates differ.');
  m.loaded.set(id,{data,index:new Map(data.recordIndices.map((r,i)=>[r,i]))});return data;
 }).catch(e=>{m.promises.delete(id);throw e}));return m.promises.get(id);
}
async function jointEmbeddingEnsure(){if(jointEmbeddingActive())await jointEmbeddingLoad()}
function jointEmbeddingInterpretation(data){return data?.snapshot.exclusionPolicy?'Disease and health outcomes, treatment-use fields, visit number and assay-availability diagnostics are excluded from these profiles. They remain available for coloring. Outcome colors are descriptive; this is not independent predictive validation.':'Outcomes and assay-availability diagnostics contribute to this original map. Coloring by them is descriptive and cannot establish independent association or predictive performance.'}
function jointEmbeddingSync(){
 const parent=el('sampleViewControls');if(!parent)return;let box=el('jointEmbeddingControls');
 if(!box){box=document.createElement('section');box.id='jointEmbeddingControls';box.innerHTML='<label>Representation<select id="sampleRepresentation"><option value="composition">Taxonomic composition</option><option value="profiles">Joint cluster profiles · 3D</option></select></label><p id="jointEmbeddingNote"></p><button type="button" id="jointEmbeddingMethods">Representation methods…</button><button type="button" id="findFeatureClusters">Find feature in clusters…</button>';parent.prepend(box);
  const style=document.createElement('style');style.textContent='#jointEmbeddingControls[hidden]{display:none!important}#jointEmbeddingControls{padding-bottom:8px;border-bottom:1px solid #ccdce3}#jointEmbeddingControls p{font-size:12px;line-height:1.45}#jointEmbeddingControls button{font-size:12px;padding:4px 6px;margin:3px 3px 3px 0}#findFeatureDialog,#jointEmbeddingMethodsDialog{width:min(820px,90vw);max-height:85vh;overflow:auto;line-height:1.5;color:#203d4b}#findFeatureDialog input{width:100%;box-sizing:border-box;padding:7px}#findFeatureDialog table{width:100%;border-collapse:collapse;font-size:13px}#findFeatureDialog td,#findFeatureDialog th{padding:7px;text-align:left;border-bottom:1px solid #d6e0e4}#findFeatureDialog button{margin:3px}#findFeatureDialog .featureSearchMembers{max-height:240px;overflow:auto}#jointEmbeddingMethodsDialog math{font-size:22px;margin:20px 0}';document.head.append(style);
  el('sampleRepresentation').onchange=async()=>{const m=jointEmbeddingModel();if(!m)return;const old=jointEmbeddingCameraKey();m.cameras[old]=copyCamera(readCamera('samples'));const value=el('sampleRepresentation').value;m.choice=value==='composition'?'composition':'profiles';if(m.choice==='profiles')m.selectedId=value;jointEmbeddingSave();syncEmbeddingChoices();jointEmbeddingSync();try{await refreshSamples(m.cameras[jointEmbeddingCameraKey()]||defaultCamera)}catch(e){el('sampleStatus').textContent=e.message}};
  el('findFeatureClusters').onclick=()=>jointFeatureSearch().catch(e=>{el('jointEmbeddingNote').textContent=e.message});el('jointEmbeddingMethods').onclick=jointEmbeddingMethods;
 }
 const m=jointEmbeddingModel(),active=jointEmbeddingActive();box.hidden=!m;if(m){const select=el('sampleRepresentation');select.replaceChildren(...[{id:'composition',label:'Taxonomic composition'},...jointEmbeddingChoices()].map(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=d.label;return o}));select.value=active?m.selectedId:'composition';el('jointEmbeddingNote').textContent=active?(m.data?m.data.snapshot.clusters.length+' frozen joint-cluster profiles · '+jointEmbeddingWeightingLabel(m.data)+' · Euclidean metric MDS. '+jointEmbeddingInterpretation(m.data):'Loading saved profile representation…'):'Choose a separate map of visits by their joint-cluster profiles, or keep the existing taxonomic maps.';el('jointEmbeddingMethods').hidden=!active}

 for(const id of ['sampleMethod','unfoldFaces','unfoldAnchor']){const node=el(id);if(node)node.closest('label').hidden=active||(id!=='sampleMethod'&&node.closest('label').hidden)}
 if(el('participantEmbeddingMode')){el('participantEmbeddingMode').disabled=active;el('participantEmbeddingMode').title=active?'This pilot uses one fixed population profile map; participant views restrict that map.':''}
}
function jointEmbeddingTraceIndices(trace){
 if(trace.meta?.profileRecords)return trace.meta.profileRecords.map(r=>estimateModel().recordIndices.get(r));
 if(trace.meta?.legendRecords)return trace.meta.legendRecords.map(r=>estimateModel().recordIndices.get(r));
 if(trace.meta?.sampleView&&trace.ids)return trace.ids.map(i=>estimateIndex(Number(i)));
 return null;
}
function jointEmbeddingFilterTrace(trace,keep){
 const n=trace.x.length,filter=v=>Array.isArray(v)&&v.length===n?keep.map(i=>v[i]):v;
 const result={...trace};for(const key of ['ids','text','hovertext','customdata','textposition'])if(key in result)result[key]=filter(result[key]);
 if(trace.marker)result.marker={...trace.marker,...Object.fromEntries(['color','size','opacity','symbol'].filter(k=>k in trace.marker).map(k=>[k,filter(trace.marker[k])]))};
 result.meta={...trace.meta};if(trace.meta?.legendRecords)result.meta.legendRecords=filter(trace.meta.legendRecords);
 if(trace.meta?.profileRecords)result.meta.profileRecords=filter(trace.meta.profileRecords);
 return result;
}
function jointEmbeddingTransform(traces,layout){
 const m=jointEmbeddingModel(),data=m?.data;if(!jointEmbeddingActive())return {traces,layout};if(!data)throw Error('Joint-profile coordinates have not loaded.');
 const output=[],shown=new Set(),omitted=new Set(),coordinate=r=>{const i=m.index.get(r);return i===undefined?null:data.coordinates[i]};
 const span=Math.max(...[0,1,2].map(k=>Math.max(...data.coordinates.map(p=>p[k]))-Math.min(...data.coordinates.map(p=>p[k]))));
 for(const trace of traces){
  if(trace.meta?.referenceVertices)continue;
  const segment=trace.meta?.profileSegment;
  if(segment){const [a,b]=segment.map(r=>coordinate(estimateModel().recordIndices.get(r)));if(!a||!b)continue;
   if(trace.type==='cone'){const v=b.map((x,i)=>x-a[i]),length=Math.hypot(...v);if(!length)continue;output.push({...trace,x:[a[0]+v[0]*.72],y:[a[1]+v[1]*.72],z:[a[2]+v[2]*.72],u:[v[0]/length],v:[v[1]/length],w:[v[2]/length],sizeref:Math.min(span*.025,length*.15)*participant.arrowScale})}
   else output.push({...trace,x:[a[0],b[0]],y:[a[1],b[1]],z:[a[2],b[2]]});continue;
  }
  const indices=jointEmbeddingTraceIndices(trace);if(!indices)continue;
  const keep=[];indices.forEach((r,i)=>{if(coordinate(r)){keep.push(i);shown.add(r)}else if(r!==undefined)omitted.add(r)});if(!keep.length)continue;
  const result=jointEmbeddingFilterTrace(trace,keep),points=keep.map(i=>coordinate(indices[i]));
  result.x=points.map(p=>p[0]);result.y=points.map(p=>p[1]);result.z=points.map(p=>p[2]);result.meta.jointProfileRecords=keep.map(i=>indices[i]);output.push(result);
 }
 m.displayed=[...shown].sort((a,b)=>a-b);
 const title=el('sampleTitle').textContent;
 const displayedDataIndices=participant.active?output.flatMap(t=>!t.meta?.participantBackground?t.meta?.legendRecords||[]:[]):output.flatMap(t=>t.meta?.sampleView?(t.ids||[]).map(Number):[]);
 updateSampleContext([...new Set(displayedDataIndices)]);
 el('sampleTitle').textContent=title+' · Joint profiles'+(data.snapshot.exclusionPolicy?' (outcomes excluded)':' (original)')+' · '+(data.weighting==='groups'?'Equal groups':'Equal features')+' · '+(shown.size===data.recordIndices.length?'Population map':'Restricted population map');
 el('sampleTitle').title='Euclidean metric MDS of '+data.snapshot.clusters.length+' frozen joint-cluster profiles; '+(shown.size===data.recordIndices.length?'full supported reference':'restricted population coordinates');
 el('sampleStatus').textContent=shown.size.toLocaleString()+' displayed visits; '+omitted.size+' requested visits lack common estimate support. The full profile reference contains '+data.recordIndices.length.toLocaleString()+' visits from '+data.snapshot.scope.participants.toLocaleString()+' participants. '+data.snapshot.clusters.length+' frozen profiles summarize K = 40 saved estimates. '+jointEmbeddingWeightingLabel(data)+'. '+jointEmbeddingInterpretation(data)+' Colors and selections do not refit this map.';
 const scene={...layout.scene,annotations:[],aspectmode:'data'};for(const k of ['xaxis','yaxis','zaxis'])scene[k]={visible:false,autorange:true};
 return {traces:output,layout:{...layout,uirevision:'joint-profile:'+data.id+':'+layout.uirevision,scene}};
}
function jointEmbeddingStress(){
 if(!jointEmbeddingActive())return false;const m=jointEmbeddingModel(),data=m?.data;
 if(!data){setEmbeddingStress('sampleStress',null,'Joint-profile representation is not loaded.');return true}
 const records=m.displayed||[],all=records.length===data.recordIndices.length;
 const result=all?data.evaluation:cachedEmbeddingStress(data.id+':'+records.join(','),()=>evaluateEmbeddingStress(records.map(r=>data.profileScores[m.index.get(r)].map((v,i)=>[i,v])),records.map(r=>data.coordinates[m.index.get(r)]),{metric:'profile_euclidean'}));
 setEmbeddingStress('sampleStress',result,'Target: Euclidean distances between the '+data.snapshot.clusters.length+' unmodified joint-profile percentile scores (0–100), with every cluster dimension equally weighted. '+(all?'All supported visits and all their unordered pairs.':'Displayed supported visits; repeated visits remain separate records. This is a restriction of the population map, not a local refit.')+' The sparse solver proxy is a separate training quantity.');return true;
}
function jointEmbeddingAfterRender(){
 jointEmbeddingSync();const note=el('sampleReferenceNote');note.dataset.originalText??=note.textContent;if(!jointEmbeddingActive()){note.textContent=note.dataset.originalText;return}syncSampleAppearanceControls(false);note.textContent='Taxonomic reference vertices are not defined in this joint-profile space. Return to Taxonomic composition to show them.';
 const m=jointEmbeddingModel();m.cameras[m.selectedId]=copyCamera(readCamera('samples'));jointEmbeddingSave();
}
function jointFeatureMatches(fields,query){
 const normalize=s=>String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),words=normalize(query).split(/\s+/).filter(Boolean);
 return fields.map((field,index)=>({field,index})).filter(({field})=>words.every(w=>normalize(field.label+' '+field.featureId).includes(w))).sort((a,b)=>a.field.label.localeCompare(b.field.label));
}
async function jointFeatureSearch(){
 const asset=estimateAsset(),embedding=await jointEmbeddingLoad();if(!asset||asset!==estimateAsset())return;
 let dialog=el('findFeatureDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='findFeatureDialog';document.body.append(dialog)}
 dialog.innerHTML='<button id="closeFindFeature" type="button" style="float:right">Close</button><h2>Find feature in clusters</h2><label>Cluster definition <select id="findFeatureDefinition"></select></label><p id="findFeatureScope"></p><label for="findFeatureQuery">Feature name (for example, any STI)</label><input id="findFeatureQuery" type="search" placeholder="any STI" autocomplete="off"><div id="findFeatureResults" aria-live="polite"></div>';
 const current=estimateCorrelationShown?.asset===asset&&estimateCorrelationShown.state.clusteringScope==='joint'?estimateCorrelationShown:null;
 if(current){const o=document.createElement('option');o.value='current';o.textContent='Current joint heatmap clusters';el('findFeatureDefinition').append(o)}
 const embeddings={};for(const d of jointEmbeddingChoices(asset)){embeddings[d.id]=await jointEmbeddingLoad(d.id);const o=document.createElement('option');o.value=d.id;o.textContent=d.label+' · frozen definition';el('findFeatureDefinition').append(o)}
 const snapshots=Object.fromEntries(Object.entries(embeddings).map(([id,e])=>[id,e.snapshot]));snapshots.current=current?jointProfileSnapshot(current):null;el('findFeatureDefinition').value=embedding.id;
 const draw=()=>{
  const source=el('findFeatureDefinition').value,snapshot=snapshots[source],fields=asset.correlations.fields,query=el('findFeatureQuery').value;
  el('findFeatureScope').textContent=(source!=='current'?'Frozen full-reference definition used for the 3D profile map. ':'Current joint heatmap definition. ')+snapshot.clusters.length+' clusters · K = '+snapshot.settings.k+' · '+snapshot.scope.records+' visits. Search all features; “Any incident STI” is the recorded target name.';
  const matches=query.trim()?jointFeatureMatches(fields,query):[];
  el('findFeatureResults').innerHTML=query.trim()?'<p>'+matches.length+' matching features'+(matches.length>50?'; first 50 shown. Refine your search.':'.')+'</p><table><thead><tr><th>Feature / group</th><th>Cluster</th><th>Color samples</th></tr></thead><tbody>'+matches.slice(0,50).map(({field,index})=>{const c=snapshot.clusters.find(c=>c.members.includes(index)),group=asset.categories.find(g=>g.id===field.categoryId)?.label||field.categoryId;return '<tr><td>'+esc(field.label)+'<br><small>'+esc(group)+'</small></td><td>'+(c?'C'+c.id+' · '+esc(jointProfileGroupCounts(c)):(snapshot.exclusionPolicy?.excluded.some(f=>f.featureId===field.featureId)?'Excluded from clustering; available for coloring':'Unassigned or constant'))+'</td><td><button type="button" data-find-feature="'+index+'">This feature</button>'+(c?'<button type="button" data-find-cluster="'+c.id+'">Cluster profile</button>':'')+'</td></tr>'+(c?'<tr><td colspan="3"><details><summary>Members of C'+c.id+'</summary><div class="featureSearchMembers">'+asset.categories.map(g=>{const members=c.members.filter(i=>fields[i].categoryId===g.id);return members.length?'<p><strong>'+esc(g.label)+'</strong>: '+members.map(i=>esc(fields[i].label)).join('; ')+'</p>':''}).join('')+'</div></details></td></tr>':'')}).join('')+'</tbody></table>':'<p>Search by any words in the feature name. Finding or coloring a feature does not move samples.</p>';
 };
 el('findFeatureQuery').oninput=draw;el('findFeatureDefinition').onchange=draw;el('closeFindFeature').onclick=()=>dialog.close();
 el('findFeatureResults').onclick=async event=>{const f=event.target.closest('[data-find-feature]'),c=event.target.closest('[data-find-cluster]'),source=el('findFeatureDefinition').value,snapshot=snapshots[source];if(!f&&!c)return;
  try{if(f){const field=asset.correlations.fields[Number(f.dataset.findFeature)],m=estimateModel(),id=field.seriesIds[String(snapshot.settings.k)];if(!m.bySeries.has(id))throw Error('Feature estimate not installed.');syncSampleColorOptions();el('sampleColorScheme').value='estimate:'+field.categoryId;m.choices[field.categoryId]=id;estimateSave();await recolorSampleView()}
   else{const m=jointProfileModel();m.snapshot=source!=='current'?{...snapshot,source:{kind:'embedding',id:source}}:snapshot;m.rows.clear();if(source!=='current')m.weighting=embeddings[source].weighting;await jointProfileChoose(Number(c.dataset.findCluster))}dialog.close();
  }catch(error){el('findFeatureScope').textContent=error.message}
 };draw();dialog.showModal();el('findFeatureQuery').focus();
}
async function jointEmbeddingMethods(){
 const data=await jointEmbeddingLoad();if(!data)return;let dialog=el('jointEmbeddingMethodsDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='jointEmbeddingMethodsDialog';document.body.append(dialog)}
 dialog.innerHTML='<button type="button" id="closeJointEmbeddingMethods" style="float:right">Close</button><button type="button" id="printJointEmbeddingMethods">Print / save PDF</button><h2>Which visits have similar joint-cluster profiles?</h2><p>This exploratory representation asks whether visits with similar combinations of estimated immune, metabolite, taxonomic and clinical patterns lie near one another.</p><p>The rows are '+data.recordIndices.length.toLocaleString()+' visits from '+data.snapshot.scope.participants+' participants; the columns are '+data.snapshot.clusters.length+' joint feature-cluster profiles. '+data.excludedRecords+' of '+data.sampleCount+' visits have no common finite estimate support and are omitted from this representation only. No missing coordinates are imputed.</p><h3>From saved estimates to profiles</h3><p>Clustering uses the frozen full reference, nearest-people estimates at K = 40, participant-weighted Spearman correlations, average linkage and Dynamic Tree Cut (minimum size 5, splitting sensitivity 1). Each feature has one declared transformation. Each saved feature estimate becomes its participant-weighted percentile: every participant has total reference weight one, divided among their visits; ties receive their midpoint rank. Each cluster profile is the '+(data.weighting==='groups'?'weighted median, with equal total weight per represented feature group':'ordinary median across its features')+'. Scores range from 0 to 100. All visits retain their own score.</p>'+jointEmbeddingWeightingMethods(data)+'<math display="block"><mrow><msub><mi>d</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>=</mo><msqrt><mrow><munderover><mo>∑</mo><mrow><mi>c</mi><mo>=</mo><mn>1</mn></mrow><mn>'+data.snapshot.clusters.length+'</mn></munderover><msup><mrow><mo>(</mo><msub><mi>S</mi><mrow><mi>i</mi><mi>c</mi></mrow></msub><mo>−</mo><msub><mi>S</mi><mrow><mi>j</mi><mi>c</mi></mrow></msub><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mrow></math><p>S is a visit’s cluster profile, c identifies a cluster, and i and j identify two visits. Their target distance is the Euclidean length of the difference between all '+data.snapshot.clusters.length+' scores. Each cluster dimension has equal weight. There is no row normalization, variance standardization, whitening or color clipping in the fitted matrix.</p><h3>Three-dimensional approximation</h3><p>Sparse metric MDS uses the SGD backend, '+data.settings.pivots+' internally randomized pivots with regional weights, 10 local neighbors, centered unscaled PCA initialization, one start and '+data.settings.epochs+' epochs. PCA retaining at least 90% variance selects local neighbors only; target distances always use all '+data.snapshot.clusters.length+' columns. Completing the epoch budget does not establish convergence.</p><p>RMS relative distance error over all '+data.evaluation.pairs.toLocaleString()+' positive-distance visit pairs: <strong>'+(100*data.evaluation.relativeRms).toFixed(2)+'%</strong>; the initial three-component PCA projection: '+(100*data.pcaEvaluation.relativeRms).toFixed(2)+'%. Zero-distance pairs excluded: '+data.evaluation.zeroPairs+'. These full-pair evaluations are separate from the sparse solver’s training proxy.</p><h3>Interpretation and limits</h3><p>The fields were smoothed in the original abundance geometry. This map summarizes those fields; it is not an independent raw multiomics map. '+jointEmbeddingInterpretation(data)+' Repeated visits are separate points and are not independent participants. Participant weighting applies to percentile and correlation references; this MDS geometry fits distinct profile vectors and does not apply participant weights to distance constraints.</p><p>The '+data.snapshot.clusters.length+'-cluster definition and profile scales remain fixed. The Representation selector offers the two outcome-excluded maps: equal feature weights and equal total weight per feature group within each cluster. Changing this representation changes the saved coordinates; it preserves selected samples and their coloring. The separate color-profile weighting checkbox changes colors only. Changing heatmap clustering does not refit either map. State, cohort and participant selections restrict these saved population coordinates; there are no local or unfolded profile fits in this pilot. Taxonomic reference vertices have no defined location in this space.</p>';
 el('closeJointEmbeddingMethods').onclick=()=>dialog.close();el('printJointEmbeddingMethods').onclick=()=>{const w=window.open('','_blank');if(w){w.document.write('<!doctype html><title>MiCOVE joint-profile representation</title><style>body{max-width:50em;margin:3em auto;font:16px serif;line-height:1.5}button{display:none}math{display:block math;margin:20px}</style>'+dialog.innerHTML);w.document.close();w.print()}};dialog.showModal();
}
