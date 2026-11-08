// Additive, pinned annotations. No classifications or embeddings are computed here.
// The shared color selector stays in the sample header in normal and maximized views.
const valenciaSubtypeColors={'I-A':'#ff6868','I-B':'#ffd4da','II':'#b4ff68','III-A':'#ffbc6b','III-B':'#e4a67b','IV-A':'#c1adec','IV-B':'#91a8ed','IV-C0':'#989898','IV-C1':'#ffc0cb','IV-C2':'#a8e5e5','IV-C3':'#9acc9a','IV-C4':'#800080','V':'#ffff71'};
const valenciaCstColors={'I':'#df5555','II':'#64a52d','III':'#ed993b','IV-A':'#9a7bc4','IV-B':'#5477c7','IV-C':'#737373','V':'#b6a616'};
// Color identities are independent of graph selection and fitted coordinates.
const sampleCohortCache=new WeakMap();
function sampleColorBundle(){return typeof datasetRegistry==='undefined'?null:datasetRegistry.get(META.id)}
function sampleMergedColors(){return sampleColorBundle()?.cohortAnalysis?.merged?.[el('coverage').value]||null}
function sampleColorMode(){return el('sampleColorScheme').value||'default'}
function sampleColorTitle(){
 const mode=sampleColorMode();
 if(typeof estimateActive==='function'&&estimateActive())return estimateSelection()?.quantityLabel||'Exploratory estimates';
 return mode==='default'?el('coverage').value+'% 2-CSTs':mode==='pure'?'Pure 2-CSTs':mode==='cohorts'?'Cohorts':mode==='visits'?'Visit colors':mode==='rank3'?'Top-3 CSTs':mode==='valencia2-subtype'?'VALENCIA2 subCSTs':'VALENCIA2 CSTs';
}
function valenciaUnavailableReason(){
 if(['umb-hmp-2019-panel','hmp-u01-2019','papclear-v3v4-provisional-20261017'].includes(META.id))return 'VALENCIA2 is unavailable: the legacy taxon names need a verified mapping to the VALENCIA2 reference. Historical CST labels are not VALENCIA2 calls.';
 return 'VALENCIA2 is unavailable: verified annotations have not been supplied for this dataset. Install its VALENCIA2 supplement.';
}
function sampleColorHelp(){
 if(typeof estimateActive==='function'&&estimateActive())return 'Exploratory participant-excluded estimates in original L1-normalized Euclidean space. Select a target and neighborhood size in the sample sidebar. Colors change; samples, selections and coordinates do not.';
 if(sampleColorMode().startsWith('valencia2-')&&!valenciaAsset())return valenciaUnavailableReason();
 const help={default:'Color by merged 2-CST group at the chosen dataset coverage. This percentage does not describe taxon abundance.',pure:'Original, unmerged top-two-taxa assignments. Pure does not mean that a sample contains only two taxa.',cohorts:'Recorded cohort membership. Missing metadata is Unclassified. A composition shared across cohorts is labeled Multiple cohorts when records are represented by a single point.',visits:'Participant visit labels or order. Available during a participant trajectory; background samples retain their state colors or gray background setting.',rank3:'Original top-three-taxa assignments; coloring does not change the selected samples.', 'valencia2-cst':'Saved VALENCIA2 CST annotations; no classifications are recalculated.','valencia2-subtype':'Saved VALENCIA2 subCST annotations; no classifications are recalculated.'};
 return (help[sampleColorMode()]||help.default)+(sampleColorMode().startsWith('valencia2-')?' The graph panel summarizes displayed CST sizes. Samples and coordinates stay unchanged.':' Only colors change.');
}
function sampleCohortModel(){
 const bundle=sampleColorBundle();if(!bundle)return null;
 const source=bundle.cohortAnalysis?.records||BUNDLE_PACK.recordAdapters?.[META.id]?.records||BUNDLE_PACK.participants?.[META.id]?.records||[];
 const annotations=BUNDLE_PACK.annotations?.[META.id]?.records;
 const cached=sampleCohortCache.get(bundle);if(cached?.source===source&&cached.annotations===annotations)return cached;
 const reviewed=new Map((annotations||[]).map(r=>[r.id,r.cohort]));
 const byProfile=new Map(),byId=new Map();
 for(const original of source){const r={...original,cohort:reviewed.get(original.id)??original.cohort};byId.set(r.id,r);if(!byProfile.has(r.profile))byProfile.set(r.profile,new Set());byProfile.get(r.profile).add(r.cohort||null)}
 const model={source,annotations,byProfile,byId};sampleCohortCache.set(bundle,model);return model;
}
// Fixed cohort identities: never rank or reassign colors within a displayed subset.
const sampleMajorCohortColors=Object.freeze({
 CONTRA:'#0072B2',HMP:'#E69F00',JiVitA:'#009E73',LSVF:'#AA4499',MM:'#D55E00',
 PRJNA549339:'#8C564B',GALE:'#56B4E9',V400:'#CC79A7',Douching:'#8C8C00',
 CHARM:'#222222',U01:'#332288',PreSSMat:'#44AA99',ZAPPS:'#CC3311',PAPCLEAR:'#882255'
});
const sampleOtherCohortPalette=['#393B79','#637939','#8C6D31','#843C39','#7B4173','#3182BD','#31A354','#756BB1','#636363','#E6550D','#6BAED6','#74C476','#9E9AC8','#969696','#FD8D3C','#CE6DBD','#BD9E39','#AD494A','#8CA252','#6B6ECF'];
function sampleCohortColor(id){
 if(!id)return '#7c878d';if(id==='Multiple cohorts')return '#686868';
 if(Object.hasOwn(sampleMajorCohortColors,id))return sampleMajorCohortColors[id];
 let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;
 return sampleOtherCohortPalette[hash%sampleOtherCohortPalette.length];
}
function sampleColorCategory(index,record=null,profile=null,{background=false}={}){
 const bundle=sampleColorBundle();if(!bundle)return null;
 record=record||DATA.records?.[index];profile=profile??record?.profile??index;
 const mode=sampleColorMode(),pure=bundle.data.samples.pair[profile];
 if(typeof estimateActive==='function'&&estimateActive())return {id:null,color:estimatePointColor(index,record,profile)};
 if(mode==='cohorts'){
  const model=sampleCohortModel(),r=record?model.byId.get(record.id)||record:null,cohorts=model.byProfile.get(profile);
  const id=r?(r.cohort||null):cohorts?.size===1?[...cohorts][0]:cohorts?.size>1?'Multiple cohorts':null;
  return {id,label:id,color:sampleCohortColor(id)};
 }
 if(mode==='visits'&&!background&&participant.active&&record)return {id:record.label||null,label:record.label,color:participantVisitColor(record)};
 if(mode.startsWith('valencia2-')){const a=valenciaProfile(profile),sub=mode==='valencia2-subtype',id=a?.[sub?'subCST':'cst'];return {id,label:id,color:(sub?valenciaSubtypeColors:valenciaCstColors)[id]||'#7c878d'}}
 if(mode==='rank3'){const base=rank3Base(),id=base.membership[profile];return {id,label:base.byId.get(id)?.label,color:rank3Color(id)}}
 const original=mode==='pure'||mode==='visits'&&activeStateMode==='pure';
 const merged=sampleMergedColors(),id=original?pure:merged?(merged.pairs?.[profile]??null):pure;
 return {id,label:id==null?null:pairName(id),color:id==null?'#7c878d':edgeColor(id),pair:true,original};
}
function samplePaletteColor(index,fallback,record=null,profile=null,background=false){
 if(['#93b3c1','#d5dce0'].includes(fallback))return fallback;
 return sampleColorCategory(index,record,profile,{background})?.color||fallback;
}
function syncSampleColorOptions(){
 if(!sampleColorBundle())return;
 const select=el('sampleColorScheme'),merged=!!sampleMergedColors(),available=!!valenciaAsset();
 const options=[['default',el('coverage').value+'% 2-CSTs',merged],['pure','Pure 2-CSTs',true],['cohorts','Cohorts',true],['visits','Visit colors',participant.active],['rank3','Top-3 CSTs',rank3.enabled],['valencia2-cst','VALENCIA2 CSTs',available],['valencia2-subtype','VALENCIA2 subCSTs',available]];
 if(typeof estimateSyncOptions==='function')options.push(...estimateSyncOptions());
 for(const [value,label,enabled] of options){const option=Array.from(select.options).find(o=>o.value===value);if(option){const valencia=value.startsWith('valencia2-');option.textContent=label+(valencia&&!enabled?' (unavailable)':'');option.disabled=!enabled;option.hidden=!enabled&&value!=='default'&&!valencia}}
 if(!options.some(([value,,enabled])=>enabled&&value===select.value))select.value=merged?'default':'pure';
 select.title=sampleColorHelp()+(available?'':' '+valenciaUnavailableReason());
 el('sampleColorLabel').title=select.title;
 for(const option of Array.from(select.options)){const old=select.value;select.value=option.value;option.title=sampleColorHelp();select.value=old}
 el('sampleColorHelp').textContent=sampleColorHelp();
 const mode=sampleColorMode(),legacy={default:'merged',pure:'original',visits:'visit'}[mode];
 el('participantColorBy').disabled=!participant.active||!legacy;
 if(legacy){el('participantColorBy').value=legacy;el('participantColorBy').options[2].disabled=!merged}
 el('participantColorBy').title='The same coloring choice as Color by above. Use Color by for Cohorts or VALENCIA2.';
 if(typeof estimateSyncControls==='function')estimateSyncControls();
}
let sampleRecolorRevision=0;
async function recolorSampleView(){
 // Wait for an in-flight selection render, then update only marker colors.
 const revision=++sampleRecolorRevision;
 if(typeof queue!=='undefined')await queue;
 if(revision!==sampleRecolorRevision)return;
 syncSampleColorOptions();
 if(typeof estimateEnsure==='function'&&!await estimateEnsure())return;
 if(revision!==sampleRecolorRevision)return;
 const plot=el('samples'),records=typeof participantData==='function'?participantData()?.records:[],byIndex=new Map((records||[]).map(r=>[r.index,r]));
 for(let k=0;k<(plot.data||[]).length;k++){
  const trace=plot.data[k];if(!trace.mode?.includes('markers')||trace.meta?.edgeFaceRings)continue;
  let colors;
  if(trace.meta?.legendRecords){
   const background=!!trace.meta.participantBackground;
   colors=background&&!participant.stateBackground?'#c9d2d7':trace.meta.legendRecords.map(i=>{const r=byIndex.get(i);return samplePaletteColor(i,'#7c878d',r,r?.profile,background)});
  }else if(trace.meta?.sampleView&&trace.ids){
   if(typeof pureCoverageActive==='function'&&pureCoverageActive()&&pureCoverageComparison.nonCore)continue;
   colors=participant.sampleColors===false?'#a8adb2':trace.ids.map((id,j)=>samplePaletteColor(Number(id),Array.isArray(trace.marker.color)&&['#93b3c1','#d5dce0'].includes(trace.marker.color[j])?trace.marker.color[j]:'#7c878d'));
  }else continue;
  await Plotly.restyle(plot,{'marker.color':[colors]},[k]);
  if(revision!==sampleRecolorRevision)return;
 }
 if(typeof estimateDecorateTraces==='function')await estimateDecorateTraces();
 syncValenciaControls();renderCountedSampleLegend();
 if(typeof sampleRenderedKey!=='undefined')sampleRenderedKey=sampleViewKey();
 if(typeof saveDatasetPanelSettings==='function')saveDatasetPanelSettings();
}
function valenciaAsset(){return BUNDLE_PACK.valencia2?.[META.id]||null}
function valenciaActive(){return !!valenciaAsset()&&['valencia2-cst','valencia2-subtype'].includes(el('sampleColorScheme').value)}
function valenciaProfile(profile){return valenciaAsset()?.profiles[profile]||null}
function valenciaSampleProfile(i){return DATA.records?DATA.records[i]?.profile:i}
function valenciaColorForProfile(profile,fallback){
 if(!valenciaActive())return fallback;
 const a=valenciaProfile(profile);if(!a)return '#7c878d';
 return el('sampleColorScheme').value==='valencia2-subtype'?valenciaSubtypeColors[a.subCST]:valenciaCstColors[a.cst];
}
function valenciaSampleColor(i,fallback){return sampleColorBundle()?samplePaletteColor(i,fallback):fallback==='#93b3c1'?fallback:valenciaColorForProfile(valenciaSampleProfile(i),fallback)}
function valenciaHover(profile,recordId=null,asset=valenciaAsset()){
 const a=asset?.profiles[profile];if(!a)return '';
 return `<br><b>VALENCIA2 CST ${esc(a.cst)} · ${esc(a.subCST)}</b><br>Similarity: ${a.score.toFixed(4)} · margin: ${a.margin.toFixed(4)}<br>Reference-matched abundance: ${(100*a.matchedFraction).toFixed(2)}%<br>Runner-up: ${esc(a.runnerUp)}${a.tieCount>1?'<br>Near/exact tie (≤1e-12); reference order breaks exact ties':''}`;
}
const valenciaRecordMaps=new WeakMap();
function familyValenciaAvailable(collection){return !!BUNDLE_PACK.valencia2?.[collection]}
function familyValenciaReference(collection){
 const a=BUNDLE_PACK.valencia2?.[collection];if(!a)throw Error('VALENCIA2 is unavailable for this collection');
 return {policy:'VALENCIA2-full-union-v1',revision:a.revision+'|'+a.referenceSha256};
}
function familyValenciaModel(hood,mode){
 const reference=familyValenciaReference(hood.collection),a=BUNDLE_PACK.valencia2[hood.collection];
 const palette=mode==='valencia2-subtype'?valenciaSubtypeColors:valenciaCstColors;
 const profiles=hood.profileIndices.map((p,i)=>{
  const row=a.profiles[p];if(!row||row.id!==hood.profileIds[i])throw Error('Neighborhood VALENCIA2 profile identity differs');
  return row;
 });
 const states=profiles.map(p=>(mode==='valencia2-subtype'?p?.subCST:p?.cst)||null),counts=new Map();
 states.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
 return {mode,coverage:null,states,colors:states.map(s=>palette[s]||'#7c878d'),labels:states.map(s=>s?'VALENCIA2 '+s:'Unclassified'),
  legend:[...Object.keys(palette),null].filter(id=>counts.has(id)).map(id=>({id,label:id?'VALENCIA2 '+id:'Unclassified',color:palette[id]||'#7c878d',n:counts.get(id)})),
  note:'VALENCIA2 assignments from full sample compositions, independent of reference coverage. Counts are distinct neighborhood compositions. Hover for similarity, margin and matched abundance; these are not confidence probabilities. Source quality holds remain. Coordinates, graph selections and dimmed backgrounds are unchanged.',reference};
}
function valenciaRecordMap(){
 const a=valenciaAsset();if(!a)return new Map();
 if(!valenciaRecordMaps.has(a))valenciaRecordMaps.set(a,new Map(a.records.map(r=>[r.id,r])));
 return valenciaRecordMaps.get(a);
}
function syncValenciaControls(){
 const available=!!valenciaAsset();
 el('valenciaColorControls').hidden=false;
 syncSampleColorOptions();
 el('exportValencia2').disabled=!available;
 el('valenciaExportDescription').textContent=available?`Exports all ${valenciaAsset().records.length.toLocaleString('en-US')} source records for ${META.id}, diagnostics and reconciled historical labels—not only the current view.`:'';
 el('rank3SampleColor').disabled=valenciaActive();
 el('participantMatchBackground').disabled=true;
 el('participantMatchBackground').parentElement?.setAttribute('title','Background colors now follow Color by automatically. Visit colors use the current States mode for backgrounds. Turn off Background state colors for gray.');
 if(!valenciaActive()){el('sampleLegend').setAttribute('aria-label','Sample color legend');el('sampleStateColorMessage').textContent='';}
}
function renderValenciaLegend(){
 syncValenciaControls();
 if(!valenciaActive()||(typeof pureCoverageActive==='function'&&pureCoverageActive()&&pureCoverageComparison.nonCore))return;
 const sub=el('sampleColorScheme').value==='valencia2-subtype',colors=sub?valenciaSubtypeColors:valenciaCstColors;
 el('sampleLegend').hidden=false;
 el('sampleLegend').setAttribute('aria-label','VALENCIA2 sample color legend');
 el('sampleLegendItems').innerHTML='<strong>VALENCIA2 '+(sub?'subtypes':'CSTs')+'</strong>'+Object.entries(colors).map(([label,color])=>`<span class="legendItem"><span class="colorSwatch" style="background:${color};border:1px solid #62727a"></span>${esc(label)}</span>`).join('')+
 '<small>Sample colors only; graph states, selections and coordinates are unchanged. Dimmed nonmembers and gray background settings are retained. Hover for similarity, runner-up margin and reference coverage. These are not confidence probabilities; existing scientific holds remain in force.</small>';
 // Existing state-color controls still edit the graph, not the VALENCIA palette.
 el('sampleStateColorMessage').textContent='State colors affect graph/state displays, not the fixed VALENCIA2 palette.';
 if(participant.active){el('participantColorBy').disabled=true;el('participantMatchBackground').disabled=true;}
 if(rank3.enabled)el('rank3SampleColor').disabled=true;
}
function valenciaCsv(asset=valenciaAsset()){
 if(!asset)throw Error('VALENCIA2 annotations unavailable');
 const header=['record_id','profile_id','VALENCIA2_CST','VALENCIA2_subCST','similarity','runner_up','margin','tie_count','matched_fraction','unmatched_fraction','historical_status','historical_labels_json','scientific_holds','source_release_eligible','source_analysis_included','source_metadata_json','annotation_revision','reference_sha256',...asset.subtypes.map(s=>s+'_sim')];
 const rows=asset.records.map(r=>{const p=asset.profiles[r.profile];return [r.id,p.id,p.cst,p.subCST,p.score,p.runnerUp,p.margin,p.tieCount,p.matchedFraction,1-p.matchedFraction,r.historical.status,JSON.stringify(r.historical.labels),r.scientificHolds,r.releaseEligible,r.sourceAnalysisIncluded,r.sourceMetadata?JSON.stringify(r.sourceMetadata):'',asset.revision,asset.referenceSha256,...p.scores]});
 if(asset.eligibilityRevision){header.push('eligibility_revision');rows.forEach(row=>row.push(asset.eligibilityRevision))}
 return [header,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
el('sampleColorScheme').onchange=()=>recolorSampleView().catch(error=>{el('sampleStatus').textContent=error.message;console.error(error)});
el('exportValencia2').onclick=()=>{
 const url=URL.createObjectURL(new Blob([valenciaCsv()],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=valenciaAsset().datasetId+'_VALENCIA2_assignments.csv';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// A color-dependent summary of rendered observations, independent of graph state.
function cstSphereSummaryModel(entries,profiles,subtype=false){
 const palette=subtype?valenciaSubtypeColors:valenciaCstColors;
 const rows=new Map(Object.entries(palette).map(([label,color])=>[label,{label,color,n:0}])),seen=new Set();
 for(const entry of entries){
  if(seen.has(entry.key))continue;seen.add(entry.key);
  const label=profiles[entry.profile]?.[subtype?'subCST':'cst']||'Unclassified';
  if(!rows.has(label))rows.set(label,{label,color:'#7c878d',n:0});rows.get(label).n++;
 }
 const N=seen.size,max=Math.max(1,...[...rows.values()].map(r=>r.n));
 return {N,rows:[...rows.values()].map(r=>({...r,percent:N?100*r.n/N:null,radius:36*Math.sqrt(r.n/max)}))};
}
function cstSummaryNeighborhood(){return typeof activeEmbeddingFamily!=='undefined'&&!!activeEmbeddingFamily}
function cstSummaryColorMode(){return cstSummaryNeighborhood()?familySelection.colorMode:sampleColorMode()}
function cstSummaryTitle(){return cstSummaryColorMode()==='valencia2-subtype'?'VALENCIA2 subCSTs':'VALENCIA2 CSTs'}
function cstSphereSummaryActive(){
 if(cstSummaryNeighborhood())return cstSummaryColorMode().startsWith('valencia2-')&&familyValenciaAvailable(familySelection.collection);
 return valenciaActive()&&!(typeof explorationActive==='function'&&explorationActive())&&
  !(typeof pureCoverageActive==='function'&&pureCoverageActive()&&pureCoverageComparison.nonCore);
}
function cstSphereSummarySvg(model,title){
 const width=Math.max(480,model.rows.length*80),step=width/model.rows.length;
 return `<svg id="cstSummarySvg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="184" viewBox="0 0 ${width} 184" role="img" aria-label="${esc(title)}: sample counts and percentages" style="font-family:Arial,sans-serif;font-size:13px;fill:#183743"><rect width="100%" height="100%" fill="white"/><defs>${model.rows.map((r,i)=>`<radialGradient id="cstSummaryGradient${i}" cx=".32" cy=".28" r=".72"><stop offset="0" stop-color="white"/><stop offset=".3" stop-color="${r.color}"/><stop offset=".7" stop-color="${r.color}"/><stop offset="1" stop-color="#303b42"/></radialGradient>`).join('')}</defs>${model.rows.map((r,i)=>{
  const x=step*(i+.5),pct=r.percent==null?'—':r.percent>0&&r.percent<.01?'&lt;0.01%':r.percent.toFixed(2)+'%';
  return `<g data-cst-summary-category="${esc(r.label)}" data-count="${r.n}"><title>${esc(r.label)}: n = ${r.n.toLocaleString()}, ${pct} of displayed observations</title><text x="${x}" y="23" text-anchor="middle" font-weight="bold">${esc(r.label)}</text>${r.n?`<circle cx="${x}" cy="77" r="${r.radius}" fill="url(#cstSummaryGradient${i})"/>`:`<text x="${x}" y="82" text-anchor="middle" fill="#7c878d">—</text>`}<text x="${x}" y="139" text-anchor="middle">n = ${r.n.toLocaleString()}</text><text x="${x}" y="162" text-anchor="middle">${pct}</text></g>`;
 }).join('')}</svg>`;
}
function syncCstSphereSummary(){
 if(typeof longitudinalActive==='function'&&longitudinalActive())return false;
 const box=el('cstSummary');if(!box)return false;
 if(typeof stateTransitionsActive==='function'&&stateTransitionsActive()){renderStateTransitions();return false}
 const active=cstSphereSummaryActive(),changed=box.hidden===active;
 box.hidden=!active;el('graphContent').hidden=active;
 el('featurePanelTitle').textContent=active?cstSummaryTitle():'Features and states graph';
 el('namedGraphViews').hidden=active;
 if(typeof cstSummaryPanelLayoutSync==='function')cstSummaryPanelLayoutSync(active);
 if(changed&&typeof window!=='undefined')window.requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 return active;
}
function renderCstSphereSummary(entries,population,{neighborhood=false}={}){
 // Hidden ordinary sample traces must never overwrite a neighborhood summary.
 if(cstSummaryNeighborhood()!==neighborhood||!el('cstSummary')||!syncCstSphereSummary())return;
 const asset=neighborhood?BUNDLE_PACK.valencia2[familySelection.collection]:valenciaAsset();
 const model=cstSphereSummaryModel(entries,asset.profiles,cstSummaryColorMode()==='valencia2-subtype');
 if(neighborhood)model.rows=model.rows.filter(r=>r.n>0);
 el('cstSummaryRow').innerHTML=cstSphereSummarySvg(model,cstSummaryTitle());
 el('cstSummaryNote').textContent=`n: ${population.unit}. Percentages use all ${model.N.toLocaleString()} displayed ${population.unit}, including visible background once; reference markers excluded. Sphere area is proportional to n within this view. A dash means no samples. Scroll sideways if needed.`;
}
