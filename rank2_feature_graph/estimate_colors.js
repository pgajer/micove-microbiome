// Saved exploratory fields only. No fitting, membership changes or 3D distances.
const estimateModels=new WeakMap(),estimateHoverBases=new WeakMap();
const estimateNeutral='#9ca3af';
let estimateLoaded=null,estimateRequest=0;
function estimateAsset(){return BUNDLE_PACK.estimateCatalogues?.[META.id]||null}
function estimateQueryPolicy(asset=estimateAsset()){return asset?.supplementaryEstimates||null}
function estimateUnidentifiedQuery(index,asset=estimateAsset()){return !!estimateQueryPolicy(asset)?.queryRecordIndices.includes(index)}
function estimateActive(){return !!estimateAsset()&&(sampleColorMode().startsWith('estimate:')||sampleColorMode()==='joint-clusters')}
function estimateModel(asset=estimateAsset()){
 if(!asset)return null;if(estimateModels.has(asset))return estimateModels.get(asset);
 const records=BUNDLE_PACK.participants?.[asset.datasetId]?.records||[],ids=new Map(asset.sampleIds.map((id,i)=>[id,i])),profiles=new Map(),recordIndices=new Map();
 for(const r of records){recordIndices.set(r.index,ids.get(r.id));const list=profiles.get(r.profile)||[];list.push(ids.get(r.id));profiles.set(r.profile,list)}
 const features=new Map(asset.features.map(f=>[f.id,f])),policies=new Map((asset.estimationPolicies||[]).map(p=>[p.id,p]));
 const series=asset.series.map(s=>{const item={...asset.seriesDefaults,...s};return {...item,estimation:item.estimation||policies.get(item.estimationId)}});
 const byCategory=new Map(),bySeries=new Map();
 const profileGeometries=new Set((asset.geometries||[]).filter(g=>g.profileRepresentationId).map(g=>g.id));
 for(const item of series){const category=profileGeometries.has(item.geometryId)?'profile-outcomes':features.get(item.featureId).categoryId;if(!byCategory.has(category))byCategory.set(category,[]);byCategory.get(category).push(item);bySeries.set(item.id,item)}
 const storageKey='micove-estimate-colors:'+asset.datasetId+'@'+asset.revision;
 let saved;try{saved=JSON.parse(localStorage.getItem(storageKey))}catch{}
 const model={asset,ids,profiles,recordIndices,features,series,byCategory,bySeries,storageKey,choices:{},clip:saved?.clip!==false,relative:saved?.relative===true,rows:new Map()};
 for(const [category,id] of Object.entries(saved?.choices||{}))if(byCategory.get(category)?.some(s=>s.id===id))model.choices[category]=id;
 estimateModels.set(asset,model);return model;
}
function estimateSave(){const m=estimateModel();if(m)try{localStorage.setItem(m.storageKey,JSON.stringify({choices:m.choices,clip:m.clip,relative:m.relative}))}catch{}}
function estimateProfileGeometry(){
 if(typeof jointEmbeddingActive!=='function'||!jointEmbeddingActive())return null;
 return estimateAsset()?.geometries.find(g=>g.profileRepresentationId===jointEmbeddingDescriptor()?.id)||null;
}
function estimateSelection(){
 if(!estimateActive())return null;
 if(sampleColorMode()==='joint-clusters')return jointProfileSeries();
 const m=estimateModel(),category=sampleColorMode().slice(9),rows=m.byCategory.get(category)||[];
 const selected=m.bySeries.get(m.choices[category])||rows[0]||null;
 if(category!=='profile-outcomes'||!selected)return selected;
 const geometry=estimateProfileGeometry();
 return geometry?rows.find(s=>s.featureId===selected.featureId&&s.k===selected.k&&s.transformationId===selected.transformationId&&s.estimatorId===selected.estimatorId&&s.scopeId===selected.scopeId&&s.geometryId===geometry.id)||selected:selected;
}
function estimateQuantile(sorted,p){const at=(sorted.length-1)*p,low=Math.floor(at);return sorted[low]+(sorted[Math.min(low+1,sorted.length-1)]-sorted[low])*(at-low)}
function estimateLimits(values,clip=true){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?[estimateQuantile(v,clip ? .025 : 0),estimateQuantile(v,clip ? .975 : 1)]:null}
const estimateViridis=['#440154','#482878','#3e4989','#31688e','#26828e','#1f9e89','#35b779','#6ece58','#b5de2b','#fde725'];
function estimateColor(value,limits){
 if(!Number.isFinite(value)||!limits)return estimateNeutral;
 const t=limits[1]===limits[0] ? .5 : Math.max(0,Math.min(1,(value-limits[0])/(limits[1]-limits[0]))),position=t*(estimateViridis.length-1),a=Math.floor(position),b=Math.min(a+1,estimateViridis.length-1),w=position-a;
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return '#'+rgb(estimateViridis[a]).map((v,i)=>Math.round(v*(1-w)+rgb(estimateViridis[b])[i]*w).toString(16).padStart(2,'0')).join('');
}
function estimateResponseReference(series){const f=estimateModel()?.features.get(series.featureId);return f?.transformations?.find(t=>t.id===series.transformationId)?.responseReference||null}
function estimateDisplay(c){
 if(c.series.joint)return jointProfileDisplay(c);
 const m=estimateModel(),r=estimateResponseReference(c.series),relative=m.relative&&r&&Number.isFinite(r.mean)&&(r.relativeMode==='difference'||r.mean>0),mode=relative?r.relativeMode:'value';
 const convert=v=>!Number.isFinite(v)?null:mode==='ratio'?v/r.mean:mode==='difference'?v-r.mean:v;
 const format=v=>v==null?'Unavailable':mode==='ratio'?Number(v.toPrecision(4)).toLocaleString('en-US',{maximumSignificantDigits:4})+'×':estimateValueText(v,mode==='difference'?{valueDomain:'real'}:c.series);
 const limits=estimateLimitsCached(c)?.map(convert)||null;
 return {mode,reference:r,convert,format,limits,title:mode==='ratio'?'Estimate / mean':mode==='difference'?'Estimate − mean':'Response estimate',unit:mode==='ratio'?'multiple of response mean':c.series.unit};
}
function estimateColorbarSpec(c){
 const d=estimateDisplay(c);if(!d.limits)return null;
 const [lo,hi]=d.limits,collapsed=lo===hi,ticks=collapsed?[lo]:Array.from({length:5},(_,i)=>lo+(hi-lo)*i/4);
 const reference=d.mode==='ratio'?1:d.mode==='difference'?0:null;
 if(!collapsed&&reference!==null&&reference>lo+(hi-lo)*.12&&reference<hi-(hi-lo)*.12){const j=[1,2,3].reduce((a,b)=>Math.abs(ticks[a]-reference)<Math.abs(ticks[b]-reference)?a:b);ticks[j]=reference}
 const clip=estimateModel().clip,ticktext=ticks.map((v,i)=>(!collapsed&&clip?(i===0?'≤ ':i===ticks.length-1?'≥ ':''):'')+d.format(v));
 const span=collapsed?Math.max(1,Math.abs(lo))*.01:0;
 return {cmin:lo-span,cmax:hi+span,cauto:false,showscale:true,
  colorscale:collapsed?[[0,estimateColor(0,[0,0])],[1,estimateColor(0,[0,0])]]:estimateViridis.map((color,i)=>[i/(estimateViridis.length-1),color]),
  colorbar:{title:{text:d.title+'<br>'+(c.series.joint?'percentile points':d.mode==='ratio'?'1× = mean':d.mode==='difference'?'0 = mean':c.series.valueDomain==='probability'?'probability (%)':'transformed response')},tickvals:ticks,ticktext,thickness:12,len:.65,x:1,xpad:8,outlinewidth:.5,bgcolor:"white"}};
}
const estimateScaleBases=new WeakMap(),estimateScaleKeys=['showscale','colorscale','cauto','cmin','cmax','colorbar'];
async function estimateDrawColorbar(){
 const plot=el('samples');if(!plot?.data)return;
 const c=estimateCurrent(),spec=c&&estimateColorbarSpec(c);
 const target=spec?plot.data.findIndex(t=>estimateTraceIndices(t)?.length&&t.x?.length):-1;
 for(let i=0;i<plot.data.length;i++){
  const trace=plot.data[i];let values;
  if(i===target){
   if(!estimateScaleBases.has(trace))estimateScaleBases.set(trace,Object.fromEntries(estimateScaleKeys.map(k=>[k,trace.marker?.[k]??null])));
   values=spec;
  }else if(estimateScaleBases.has(trace)){values=estimateScaleBases.get(trace);estimateScaleBases.delete(trace)}else continue;
  // A native color bar alongside existing CSS-colored markers also exports to PNG.
  // Never replace their colors, points, IDs or scene/camera to draw the legend.
  await Plotly.restyle(plot,Object.fromEntries(estimateScaleKeys.map(k=>['marker.'+k,[values[k]]])),[i]);
 }
}
function estimateValueText(value,series){return value==null?'Unavailable':series.valueDomain==='probability'?(value*100).toLocaleString('en-US',{maximumSignificantDigits:4})+'%':Number(value.toPrecision(5)).toLocaleString('en-US',{maximumSignificantDigits:5})}
function estimateIndex(index,record=null,profile=null){
 const m=estimateModel();if(!m)return undefined;
 const r=record||DATA.records?.[index];if(r)return m.ids.get(r.id);
 const list=m.profiles.get(profile??index);return list?.length===1?list[0]:undefined;
}
function estimateCurrent(){const s=estimateSelection();return s&&estimateLoaded?.asset===estimateAsset()&&estimateLoaded.series.id===s.id?estimateLoaded:null}
function estimatePointColor(index,record=null,profile=null){const c=estimateCurrent();return c?estimateColor(c.row.values[estimateIndex(index,record,profile)],estimateLimitsCached(c)):estimateNeutral}
function estimateLimitsCached(c){const clip=estimateModel().clip;if(c.clip!==clip||c.limits===undefined){c.clip=clip;c.limits=estimateLimits(c.row.colorReferenceIndices?c.row.colorReferenceIndices.map(i=>c.row.values[i]):c.row.values,clip)}return c.limits}
function estimateSyncOptions(){
 const select=el('sampleColorScheme'),asset=estimateAsset(),expected=new Set((asset?.categories||[]).map(c=>'estimate:'+c.id));
 const profiles=asset?.geometries?.some(g=>g.profileRepresentationId);
 if(profiles)expected.add('estimate:profile-outcomes');
 for(const option of Array.from(select.options))if(option.value.startsWith('estimate:')&&!expected.has(option.value))option.remove();
 const categories=(asset?.categories||[]).map(category=>({value:'estimate:'+category.id,label:category.label+' · estimates'}));
 if(profiles)categories.push({value:'estimate:profile-outcomes',label:'Joint-profile outcomes'});
 if(asset?.correlations?.selectionInputs)categories.push({value:'joint-clusters',label:'Joint clusters'});
 for(const option of Array.from(select.options))if(option.value==='joint-clusters'&&!asset?.correlations?.selectionInputs)option.remove();
 return categories.map(category=>{const value=category.value;let option=Array.from(select.options).find(o=>o.value===value);
  if(!option){option=document.createElement('option');option.value=value;select.appendChild(option)}
  return [value,category.label,true];
 });
}
function estimateStepTarget(direction){
 const select=el('estimateFeature'),index=select.selectedIndex+direction;
 if(select.disabled||select.selectedIndex<0||index<0||index>=select.options.length)return;
 select.value=select.options[index].value;select.onchange();
}
function estimateInstall(){
 if(el('estimateControls'))return;
 const style=document.createElement('style');style.textContent=`#estimateControls[hidden],#estimateControls label[hidden]{display:none}#estimateControls{border-bottom:1px solid #ccdce3;padding:8px 10px}#estimateControls label{display:block;font-size:12px;margin:7px 0}#estimateControls select{display:block;width:100%;max-width:100%;font-size:12px;padding:4px}#estimateControls .estimateTargetPicker{align-items:stretch}#estimateControls .estimateTargetPicker select{min-width:0;box-sizing:border-box}#estimateControls .estimateTargetPicker button{margin:0;padding:3px;font-size:20px;line-height:1.3}#estimateControls small{display:block;margin:7px 0;line-height:1.4}#estimateControls button{font-size:12px;padding:5px 7px;margin-right:5px}.estimateLegend{width:100%;font-size:12px;line-height:1.5}.estimateRamp{height:13px;margin:7px 0;border:1px solid #b1bfc4}.estimateEnds{display:flex;justify-content:space-between;gap:12px}#estimateMethods{width:min(850px,90vw);max-height:85vh;overflow:auto;line-height:1.5}#estimateMethods pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}#estimateMethods math{display:block math;margin:16px 0;font-size:1.2em}`;document.head.appendChild(style);
 const box=document.createElement('details');box.id='estimateControls';box.open=true;box.hidden=true;
 box.innerHTML='<summary>Exploratory estimates</summary><small id="estimateStage"></small>'+[['Feature','Target'],['Transform','Transformation'],['Estimator','Estimator'],['K','Neighborhood size'],['Geometry','Estimation distance'],['Scope','Estimation scope']].map(([id,label])=>id==='Feature'?'<label for="estimateFeature">Target</label><div class="participantPicker estimateTargetPicker"><button id="previousEstimateTarget" type="button" aria-label="Previous target" title="Previous target in the selected feature group" disabled>‹</button><select id="estimateFeature" aria-label="Estimate target"></select><button id="nextEstimateTarget" type="button" aria-label="Next target" title="Next target in the selected feature group" disabled>›</button></div>':`<label>${label}<select id="estimate${id}" aria-label="Estimate ${label.toLowerCase()}"></select></label>`).join('')+'<label><input id="estimateRelative" type="checkbox"> Relative to response mean</label><small id="estimateReference"></small><label><input id="estimateClip" type="checkbox" checked> Limit colors to central 95%</label><small id="estimateDescription"></small><small id="estimateStatus" role="status"></small><button id="estimateRetry" type="button" hidden>Retry estimates</button><button id="estimateMethodsButton" type="button">Methods…</button><button id="estimateExport" type="button">Download field CSV</button><button id="estimateReport" type="button" hidden>Report PDF</button>';
 const coloring=el('sampleColoringControls');if(coloring)coloring.append(box);else el('sampleSummary').before(box);
 const fields=[['Feature','featureId'],['Transform','transformationId'],['Estimator','estimatorId'],['K','k'],['Geometry','geometryId'],['Scope','scopeId']];
 for(const [id,field] of fields)el('estimate'+id).onchange=()=>{
  const m=estimateModel(),old=estimateSelection(),wanted=el('estimate'+id).value,category=sampleColorMode().slice(9);
  let rows=m.byCategory.get(category)||[];
  for(const [,earlier] of fields){if(earlier===field)break;rows=rows.filter(s=>String(s[earlier])===String(old[earlier]))}
  rows=rows.filter(s=>String(s[field])===wanted);
  rows.sort((a,b)=>fields.reduce((score,[,f])=>score+(String(b[f])===String(old[f])?1:0)-(String(a[f])===String(old[f])?1:0),0));
  if(!rows.length)return;m.choices[category]=rows[0].id;estimateSave();estimateSyncControls();recolorSampleView().catch(estimateFailure);
 };
 el('previousEstimateTarget').onclick=()=>estimateStepTarget(-1);
 el('nextEstimateTarget').onclick=()=>estimateStepTarget(1);
 el('estimateRelative').onchange=()=>{estimateModel().relative=el('estimateRelative').checked;estimateSave();recolorSampleView().catch(estimateFailure)};
 el('estimateClip').onchange=()=>{estimateModel().clip=el('estimateClip').checked;estimateSave();recolorSampleView().catch(estimateFailure)};
 el('estimateRetry').onclick=()=>recolorSampleView().catch(estimateFailure);
 el('estimateMethodsButton').onclick=()=>estimateMethods().catch(estimateFailure);
 el('estimateExport').onclick=estimateExport;
 el('estimateReport').onclick=()=>estimateReport().catch(estimateFailure);
 const correlations=document.createElement('button');correlations.id='openEstimateCorrelations';correlations.type='button';correlations.textContent='Correlation heatmap…';correlations.onclick=estimateCorrelationOpen;box.appendChild(correlations);
}
function estimateSyncControls(){
 if(!estimateAsset()&&!el('estimateControls'))return;estimateInstall();
 if(typeof jointProfileSync==='function')jointProfileSync();
 const active=estimateActive()&&sampleColorMode()!=='joint-clusters',box=el('estimateControls');box.hidden=!active;if(!active)return;
 const m=estimateModel(),s=estimateSelection();if(!s)return;
 const feature=m.features.get(s.featureId),transform=feature.transformations.find(t=>t.id===s.transformationId);
 const profileOutcomes=sampleColorMode()==='estimate:profile-outcomes';
 if(profileOutcomes&&m.choices['profile-outcomes']!==s.id){m.choices['profile-outcomes']=s.id;estimateSave()}
 let rows=m.byCategory.get(sampleColorMode().slice(9))||[];
 const choices=[['Feature','featureId',v=>m.features.get(v).label],['Transform','transformationId',v=>feature.transformations.find(t=>t.id===v).label],['Estimator','estimatorId',v=>profileOutcomes?'Nearest-case raw (k/T)':rows.find(r=>r.estimatorId===v).estimatorLabel],['K','k',v=>(s.kMeaning==='case_participants'?'k = ':'K = ')+v+(s.kMeaning==='case_participants'?' case participants':' people')],['Geometry','geometryId',v=>m.asset.geometries.find(g=>g.id===v).label],['Scope','scopeId',v=>v==='all'||v==='global'?'Full eligible reference':m.asset.scopes.find(g=>g.id===v)?.description||v]];
 for(const [id,key,label] of choices){const node=el('estimate'+id),values=[...new Set(rows.map(r=>r[key]))];if(id==='K')values.sort((a,b)=>a-b);node.replaceChildren(...values.map(value=>{const o=document.createElement('option');o.value=String(value);o.textContent=label(value);return o}));node.value=String(s[key]);node.disabled=values.length<2;node.parentElement.hidden=['Geometry','Scope'].includes(id)&&values.length<2;rows=rows.filter(r=>r[key]===s[key])}
 el('estimateK').title=profileOutcomes?'Number of positive-answer participants, not total neighbors. Smaller k gives finer but less stable patterns. Your choice is retained across targets and profile spaces.':'';
 if(profileOutcomes&&estimateProfileGeometry()){el('estimateGeometry').disabled=true;el('estimateGeometry').parentElement.title='Follows the selected outcome-excluded profile representation. Distances use all 38 profile dimensions, not the 3D map.'}else el('estimateGeometry').parentElement.title='';
 const target=el('estimateFeature');
 el('previousEstimateTarget').disabled=target.disabled||target.selectedIndex<=0;
 el('nextEstimateTarget').disabled=target.disabled||target.selectedIndex<0||target.selectedIndex>=target.options.length-1;
 el('estimateClip').checked=m.clip;
 const reference=estimateResponseReference(s),canRelate=reference&&Number.isFinite(reference.mean)&&(reference.relativeMode==='difference'||reference.mean>0);
 el('estimateRelative').disabled=!canRelate;el('estimateRelative').checked=canRelate&&m.relative;
 el('estimateRelative').parentElement.title='Nonnegative responses use estimate / mean. Signed and logarithmic responses use estimate − mean. Each participant has equal weight in the observed-response mean, which stays fixed across selections, embeddings and neighborhood sizes.';
 el('estimateReference').textContent=reference?('Observed transformed-response mean: '+estimateValueText(reference.mean,s)+' '+s.unit+'; '+reference.participants.toLocaleString()+' participants. '+(m.relative&&canRelate?(reference.relativeMode==='ratio'?'Colors show estimate / mean; 1× is the mean.':'Colors show estimate − mean; zero is the mean.'):'')+(canRelate?'':' Relative display unavailable: the reference mean is zero or missing.')):'Install the response-reference supplement to enable relative colors.';
 el('estimateStage').textContent=m.asset.releaseStage==='pilot'?'Pilot: five example features. The complete catalogue and illustrated report are pending.':'Full catalogue: '+m.features.size.toLocaleString()+' targets and '+m.series.length.toLocaleString()+' combinations. Exploratory estimates, not calibrated risk.';
 if(estimateQueryPolicy(m.asset))el('estimateStage').textContent+=' '+estimateQueryPolicy(m.asset).policy;
 el('estimateDescription').textContent=[...new Set([feature.description,transform.description])].join(' ')+(profileOutcomes?' Distances use all 38 outcome-excluded joint profiles. '+(estimateProfileGeometry()?'Estimation space follows the displayed profile map. ':'Estimation space is selected explicitly; it is independent of this displayed map. ')+(s.counts.availableEstimateCount===0?'Unavailable at k='+s.k+': the reference includes '+s.counts.positiveParticipants+' people with a positive answer, but no query reaches the requested number after participant exclusion. Choose a smaller k to explore available support.':'One nearest answering visit per person; all identified query-participant visits excluded.'):'');
 el('estimateExport').disabled=!estimateCurrent();
 el('estimateReport').hidden=profileOutcomes||!m.asset.documentation?.some(d=>d.id==='report');
 el('openEstimateCorrelations').hidden=!m.asset.correlations||profileOutcomes;
}
function estimateFailure(error){if(el('estimateStatus')){el('estimateStatus').textContent=error.message;el('estimateRetry').hidden=false}console.error(error)}
async function estimateEnsure(){
 const request=++estimateRequest;
 if(!estimateActive()){estimateLoaded=null;return true}
 if(sampleColorMode()==='joint-clusters')return jointProfileEnsure(request);
 const m=estimateModel(),s=estimateSelection();if(!s)return false;
 if(estimateCurrent())return true;
 estimateLoaded=null;el('estimateStatus').textContent='Loading estimates…';el('estimateRetry').hidden=true;el('estimateExport').disabled=true;
 try{
  let row=m.rows.get(s.id);
  if(!row){
   const descriptor=m.asset.shards.find(d=>d.id===s.shardId);
   const shard=await VME_ASSETS.group('estimate:'+m.asset.datasetId+':'+m.asset.revision+':'+s.shardId,{parts:[descriptor.http]});
   if(shard.datasetId!==m.asset.datasetId||shard.catalogueRevision!==m.asset.revision||shard.sampleOrderSha256!==m.asset.sampleOrderSha256)throw Error('Estimate shard identity differs.');
   for(const [id,data] of Object.entries(shard.series)){if(data.values.length!==m.asset.sampleCount||data.status.length!==m.asset.sampleCount)throw Error('Estimate record count differs.');if(estimateQueryPolicy(m.asset))data.colorReferenceIndices=estimateQueryPolicy(m.asset).colorReferenceIndices;m.rows.set(id,data)}
   row=m.rows.get(s.id);if(!row)throw Error('Selected estimate is missing.');
  }
  if(request!==estimateRequest||estimateAsset()!==m.asset||estimateSelection()?.id!==s.id)return false;
  estimateLoaded={asset:m.asset,series:s,row};el('estimateStatus').textContent='';el('estimateExport').disabled=false;return true;
 }catch(error){if(request!==estimateRequest)return false;estimateFailure(error);return true}
}
function estimateTraceIndices(trace){
 const m=estimateModel();if(!m||!trace.mode?.includes('markers')||trace.meta?.edgeFaceRings)return null;
 if(trace.meta?.legendRecords)return trace.meta.legendRecords.map(i=>m.recordIndices.get(i));
 if(trace.meta?.sampleView&&trace.ids)return trace.ids.map(id=>estimateIndex(Number(id)));
 return null;
}
function estimateHover(index,c){
 if(c.series.joint)return '<br><b>'+esc(c.series.label)+'</b><br>'+esc(c.series.quantityLabel)+': '+esc(jointProfileDisplay(c).format(c.row.values[index]))+(Number.isFinite(c.row.values[index])?' (unitless, not a probability)':' · no common estimate support');
 const display=estimateDisplay(c),value=c.row.values[index],status=c.row.status[index]||'unmapped',support=c.row.support||{};
 let text='<br><b>'+esc(estimateModel().features.get(c.series.featureId).label)+' · estimate</b><br>'+esc(c.series.quantityLabel)+': '+esc(estimateValueText(value,c.series))+' '+esc(c.series.unit);
 if(display.mode!=='value'&&Number.isFinite(value))text+='<br>'+esc(display.title)+': '+esc(display.format(display.convert(value)));
 if(status!=='ok')text+='<br>'+esc(c.asset.statusCodes[status]||'No unique record mapping');
 for(const [key,values] of Object.entries(support))if(values[index]!=null)text+='<br>'+esc(({participantCount:'Answering people',neighborCount:'Neighbor observations',caseParticipantCount:'Positive-answer people',radius:'Neighborhood radius (original distance)'})[key]||key)+': '+esc(String(Number(values[index].toPrecision(5))));
 if(estimateUnidentifiedQuery(index,c.asset))text+='<br><b>Participant-exclusion limitation</b><br>'+esc(estimateQueryPolicy(c.asset).policy);
 return text;
}
async function estimateDecorateTraces(){
 await estimateDrawColorbar();
 const plot=el('samples'),c=estimateCurrent();
 for(let i=0;i<(plot.data||[]).length;i++){
  const trace=plot.data[i],indices=c?estimateTraceIndices(trace):null;
  if(c&&indices&&trace.hoverinfo!=='skip'){
   let base=estimateHoverBases.get(trace);if(!base){base={hovertext:trace.hovertext,hovertemplate:trace.hovertemplate};estimateHoverBases.set(trace,base)}
   const original=base.hovertext??trace.text??[];
   const text=indices.map((index,j)=>(Array.isArray(original)?original[j]:original||'')+estimateHover(index,c));
   await Plotly.restyle(plot,{hovertext:[text],hovertemplate:'%{hovertext}<extra></extra>'},[i]);
  }else if(estimateHoverBases.has(trace)){
   const base=estimateHoverBases.get(trace);estimateHoverBases.delete(trace);
   await Plotly.restyle(plot,{hovertext:[base.hovertext??null],hovertemplate:base.hovertemplate??null},[i]);
  }
 }
}
function estimateRenderLegend(entries){
 if(!estimateActive())return false;
 if(sampleColorMode()==='joint-clusters')return jointProfileLegend(entries);
 const m=estimateModel(),s=estimateSelection(),c=estimateCurrent(),seen=new Set(),counts=new Map();
 for(const e of entries){if(seen.has(e.key))continue;seen.add(e.key);const i=estimateIndex(e.index,e.record,e.profile),status=c?.row.status[i]||'unavailable';counts.set(status,(counts.get(status)||0)+1)}
 let html='<div class="estimateLegend"><strong>'+esc(m.features.get(s.featureId).label)+'</strong><br>'+esc(s.quantityLabel)+'<br>';
 const display=c&&estimateDisplay(c),limits=display?.limits;
 if(limits){html+='<div class="estimateRamp" style="background:linear-gradient(to right,'+estimateViridis.join(',')+')"></div><div class="estimateEnds"><span>'+(m.clip?'≤ ':'')+esc(display.format(limits[0]))+'</span><span>'+(m.clip?'≥ ':'')+esc(display.format(limits[1]))+'</span></div><div>'+esc(display.title)+' · '+esc(display.unit)+'</div><small>'+(m.clip?'Colors clipped at the 2.5th and 97.5th percentiles.':'Colors span the full estimate range.')+' Limits use the original identified reference records and stay fixed across selections and embeddings. Hover values are unchanged.</small>'}
 else html+='<p>'+(c?'No supported estimates at this neighborhood size.':'No loaded estimates for this field.')+'</p>';
 const geometry=m.asset.geometries.find(g=>g.id===s.geometryId);
 const scope=m.asset.scopes?.find(item=>item.id===s.scopeId);
 if(scope)html+='<p>'+esc(scope.description)+'</p>';
 html+='<p>'+esc(s.estimatorLabel)+'; '+(s.kMeaning==='case_participants'?'k = '+s.k+' case participants':'K = '+s.k+' nearest people')+'.<br>Estimation distance: '+esc(geometry.label)+'.<br>All visits of identified query participants excluded.</p>';
 if(estimateQueryPolicy(m.asset))html+='<p><b>Participant-exclusion limitation:</b> '+esc(estimateQueryPolicy(m.asset).policy)+'</p>';
 html+='<p>Displayed: '+seen.size.toLocaleString()+' records; '+(counts.get('ok')||0).toLocaleString()+' with estimates. Reference markers excluded.</p>';
 html+=[...counts].filter(([status])=>status!=='ok').map(([status,n])=>'<div><span class="colorSwatch" style="background:'+estimateNeutral+'"></span>'+esc(m.asset.statusCodes[status]||status)+': '+n+'</div>').join('');
 html+='<small>Gray background/dimming controls remain active. State memberships and the graph are unchanged. These are exploratory summaries, not association tests or calibrated disease risks.</small></div>';
 el('sampleLegend').hidden=false;el('sampleLegendItems').innerHTML=html;return true;
}
async function estimateReport(){
 const m=estimateModel(),descriptor=m.asset.documentation?.find(d=>d.id==='report');if(!descriptor)return;
 const button=el('estimateReport');button.disabled=true;
 try{const doc=await VME_ASSETS.group('estimate-doc:'+m.asset.revision+':report',{parts:[descriptor.http]});
  if(doc.mimeType!=='application/pdf'||!doc.base64)throw Error('The installed report is not a PDF.');
  estimateDownload(Uint8Array.from(atob(doc.base64),c=>c.charCodeAt(0)),'MiCOVE-'+m.asset.datasetId+'-exploratory-estimates.pdf','application/pdf');
 }finally{button.disabled=false}
}
function estimateDownload(text,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function estimateExport(){
 const c=estimateCurrent();if(!c)return;const display=estimateDisplay(c),m=estimateModel(),keys=Object.keys(c.row.support||{}),quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 const header=['sample_id','estimate','status',...keys,'series_id','quantity','unit','geometry','catalogue_revision','display_value','display_mode','response_mean','participant_exclusion','participant_exclusion_note'];
 const rows=m.asset.sampleIds.map((id,i)=>[id,c.row.values[i],c.row.status[i],...keys.map(key=>c.row.support[key][i]),c.series.id,c.series.quantityLabel,c.series.unit,c.series.geometryId,m.asset.revision,display.convert(c.row.values[i]),display.mode,display.reference?.mean,estimateUnidentifiedQuery(i,c.asset)?'not_guaranteed':'identified_participant_excluded',estimateUnidentifiedQuery(i,c.asset)?estimateQueryPolicy(c.asset).policy:'']);
 estimateDownload([header,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n','MiCOVE-'+m.asset.datasetId+'-'+c.series.id+'.csv','text/csv');
}
async function estimateMethods(){
 const m=estimateModel(),s=estimateSelection(),feature=m.features.get(s.featureId),transform=feature.transformations.find(t=>t.id===s.transformationId);
 let dialog=el('estimateMethods');if(!dialog){dialog=document.createElement('dialog');dialog.id='estimateMethods';document.body.appendChild(dialog)}
 dialog.replaceChildren();const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();dialog.appendChild(close);
 const print=document.createElement('button');print.textContent='Print / save methods as PDF';print.onclick=()=>{const w=window.open('','_blank');if(w){w.document.write('<!doctype html><title>MiCOVE estimate methods</title><style>body{max-width:50em;margin:3em auto;font:16px serif;line-height:1.5}button{display:none}pre{white-space:pre-wrap;font:inherit}math{display:block math;margin:20px}</style>'+dialog.innerHTML);w.document.close();w.print()}};dialog.appendChild(print);
 if(sampleColorMode()!=='estimate:profile-outcomes'&&m.asset.documentation?.some(d=>d.id==='report')){const report=document.createElement('button');report.textContent=estimateQueryPolicy(m.asset)?'Download original methods report PDF':'Download illustrated report PDF';report.onclick=()=>estimateReport().catch(estimateFailure);dialog.appendChild(report)}
 const content=document.createElement('div');content.innerHTML='<h2>What is typical among nearby participants?</h2><p>The saved field summarizes answers from other people with similar microbiome profiles. It does not show the query person’s observed answer, an association test or a calibrated disease risk.</p><h3>Nearest-people mean</h3><math><mrow><mover><mi>m</mi><mo>^</mo></mover><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo><mfrac><mn>1</mn><mi>K</mi></mfrac><munderover><mo>∑</mo><mrow><mi>j</mi><mo>=</mo><mn>1</mn></mrow><mi>K</mi></munderover><mi>g</mi><mo>(</mo><msub><mi>y</mi><mi>j</mi></msub><mo>)</mo></mrow></math><p>x is the query microbiome; K is the number of neighboring people; y is a neighbor’s recorded answer; g is the selected transformation, applied before averaging. One nearest answering visit represents each neighbor. All visits of identified query participants are excluded.</p><h3>Nearest-case estimates</h3><math><mrow><msub><mover><mi>p</mi><mo>^</mo></mover><mtext>raw</mtext></msub><mo>=</mo><mfrac><mi>k</mi><mi>T</mi></mfrac><mspace width="2em"/><msub><mover><mi>p</mi><mo>^</mo></mover><mtext>corrected</mtext></msub><mo>=</mo><mfrac><mrow><mi>k</mi><mo>−</mo><mn>1</mn></mrow><mrow><mi>T</mi><mo>−</mo><mn>1</mn></mrow></mfrac></mrow></math><p>k is the requested number of people with a positive binary answer. T is the number of neighboring people required to reach the kth positive answer. “Case” means the selected binary target, including assay reporting or observed taxon presence. It need not mean disease. The correction addresses the stopping rule; it does not establish calibration.</p>';
 const add=(heading,text)=>{const h=document.createElement('h3');h.textContent=heading;const p=document.createElement('pre');p.textContent=text;content.append(h,p)};
 if(estimateQueryPolicy(m.asset))add('Specimens without subject IDs',estimateQueryPolicy(m.asset).policy);
 add('Selected target',feature.label+'\n'+[...new Set([feature.description,transform.description])].join('\n')+'\nUnit: '+s.unit+'\nZero handling: '+transform.zeroPolicy+'\nTransformation (LaTeX): '+transform.formulaTex+'\nParameters: '+JSON.stringify(transform.parameters,null,2));
 add('Neighborhood and support',Object.entries(s.estimation||{}).filter(([k])=>k!=='id').map(([k,v])=>k+': '+v).join('\n')+'\n'+JSON.stringify(s.counts,null,2));
 const geometry=m.asset.geometries.find(g=>g.id===s.geometryId);
 if(geometry?.profileRepresentationId){
  add('Full profile space',geometry.label+'\n'+geometry.normalization+'\n'+geometry.distance+'\nThe responses remain excluded from the 38 cluster profiles. Query-participant exclusion in response aggregation is not end-to-end cross-validation.');
  const formula=document.createElement('div');formula.innerHTML='<math display="block"><mrow><mi>d</mi><mo>(</mo><mi>i</mi><mo>,</mo><mi>j</mi><mo>)</mo><mo>=</mo><msqrt><mrow><munderover><mo>∑</mo><mrow><mi>c</mi><mo>=</mo><mn>1</mn></mrow><mn>38</mn></munderover><msup><mrow><mo>(</mo><msub><mi>S</mi><mrow><mi>i</mi><mi>c</mi></mrow></msub><mo>−</mo><msub><mi>S</mi><mrow><mi>j</mi><mi>c</mi></mrow></msub><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mrow></math><p>S is a visit’s cluster profile, c identifies a cluster, and i and j identify visits. All 38 dimensions contribute equally. The raw estimate is k/T, where k is the selected case count (5, 10, 20 or 40) and T counts distinct answering people through that positive answer. Smaller k uses more local neighborhoods but is less stable. Missing support stays unavailable; changing k does not refit profiles or embeddings.</p>';content.append(formula);
 }
 add('Response colors','The bar shows the selected transformed-response estimate. Relative mode divides nonnegative estimates by the observed transformed-response mean, or subtracts that mean for signed/logarithmic responses. The reference averages available responses within each participant, then averages participants equally across the full reference. Missing/undefined targets are excluded. It is fixed across selections, embeddings and neighborhood sizes. Colors are clipped at original identified-reference percentiles 2.5 and 97.5 by default; the CSV and hover values remain unclipped. These percentiles are display limits, not confidence intervals.');
 add('Limits','Reference transformations, imputation and scaling were fixed before participant exclusion. These fields are not end-to-end cross-validated predictions.\n'+m.asset.limitations.join('\n')+'\n'+(m.asset.releaseStage==='pilot'?'Pilot examples; the complete illustrated report is pending.':''));dialog.appendChild(content);dialog.showModal();
 const doc=m.asset.documentation.find(d=>d.id===(geometry?.profileRepresentationId?'profile-outcomes':'methods'));if(doc){const text=await VME_ASSETS.group('estimate-doc:'+m.asset.revision+':'+doc.id,{parts:[doc.http]});if(dialog.open&&estimateAsset()===m.asset)add(estimateQueryPolicy(m.asset)?'Original catalogue guide (before the query-only extension)':'Catalogue reading guide',text.text)}
}
