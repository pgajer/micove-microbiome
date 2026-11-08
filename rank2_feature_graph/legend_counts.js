// Counts describe observations in the rendered view, never reference/overlay markers.
// Percentages use either the complete eligible release or all displayed identities.
const legendPopulationCache=new WeakMap();
function legendPopulation(bundle,records=false){
 const b=bundle.data,a=bundle.cohortAnalysis,adapter=BUNDLE_PACK.recordAdapters?.[bundle.dataset.id];
 const source=records?(a?.records||adapter?.records||BUNDLE_PACK.participants?.[bundle.dataset.id]?.records):null;
 let cache=legendPopulationCache.get(bundle);if(!cache){cache=new Map();legendPopulationCache.set(bundle,cache)}
 const key=records?'records':'profiles',previous=cache.get(key);if(previous&&previous.source===source)return previous;
 const profileKey=p=>b.geometryProfile?.[p]??p;
 const profiles=a?.eligibleProfiles||(adapter?.eligibility?[...new Set(adapter.records.map(r=>r.profile))]:b.eligibleIndices||b.samples.ids.map((_,i)=>i));
 const distinct=bundle.dataset.observationUnit==='distinct-composition';
 const identities=new Set(records?(source||[]).map((r,i)=>r.id??i):profiles.map(p=>distinct?profileKey(p):p));
 const byProfile=new Map();if(source)source.forEach((r,i)=>{if(!byProfile.has(r.profile))byProfile.set(r.profile,[]);byProfile.get(r.profile).push({record:r,key:r.id??i})});
 const result={source,profiles,identities,byProfile,N:identities.size,profileKey:distinct?profileKey:p=>p,
  unit:records?(a?.observationLabel||adapter?.observationLabel||(bundle.dataset.observationUnit==='sample'?bundle.dataset.observationLabel:'source records')||'observations'):(distinct?'distinct compositions':bundle.dataset.observationLabel||'observations'),
  name:bundle.dataset.title||bundle.dataset.id};
 cache.set(key,result);return result;
}
// Hover membership always uses the complete eligible dataset, independent of
// cohort, graph selection, visible points and the legend percentage toggle.
const sampleCstHoverCache=new WeakMap();
function sampleHoverRecordMode(){const b=datasetRegistry.get(META.id);return participant.active||!!DATA.records||b?.cohortAnalysis?.populationVersion===2&&b.dataset.observationUnit!=='distinct-composition'}
function sampleCstHoverModel(records=sampleHoverRecordMode(),bundle=datasetRegistry.get(META.id),coverage=el('coverage').value){
 const population=legendPopulation(bundle,records),merged=bundle.cohortAnalysis?.merged?.[coverage],triples=rank3Base(bundle);
 let cache=sampleCstHoverCache.get(bundle);if(!cache){cache=new Map();sampleCstHoverCache.set(bundle,cache)}
 const key=(records?'records:':'profiles:')+coverage,old=cache.get(key);
 if(old&&old.population===population&&old.merged===merged&&old.triples===triples)return old;
 const pure=bundle.data.samples.pair,counts=[new Map(),new Map(),new Map()],seen=new Set();
 const add=(identity,profile)=>{
  if(!population.identities.has(identity)||seen.has(identity))return;seen.add(identity);
  [pure[profile],merged?.pairs?.[profile],triples.membership[profile]].forEach((id,k)=>{if(id!=null)counts[k].set(id,(counts[k].get(id)||0)+1)});
 };
 if(records)(population.source||[]).forEach((r,i)=>add(r.id??i,r.profile));
 else population.profiles.forEach(profile=>add(population.profileKey(profile),profile));
 const labels=new Map(displayGraph(bundle.data.graphs['100'],bundle.data).edges.map(e=>[e.id,e.label]));
 const model={bundle,records,coverage,population,merged,triples,pure,counts,labels,rows:new Map()};cache.set(key,model);return model;
}
function sampleCstHover(profile,model=sampleCstHoverModel()){
 if(model.rows.has(profile))return model.rows.get(profile);
 const {bundle,records,coverage,population,merged,triples,pure,counts,labels}=model,N=population.N;
 const label=id=>legendCstLabel(id,bundle,records,labels.get(id)||String(id).split(',').map(j=>taxonDisplayLabel(bundle.data.featureNames[j]||j)).join(' + '));
 const line=(title,id,k,missing)=>{
  if(id==null)return '<br>'+title+': '+missing;
  const n=counts[k].get(id)||0,pct=N?(n>0&&100*n/N<.01?'&lt;0.01':(100*n/N).toFixed(2)):'—';
  return '<br>'+title+': '+esc(label(id))+' (n='+n.toLocaleString()+'; '+pct+'%)';
 };
 const top=bundle.data.sampleTopFeatures[profile]||[],pair=top.length>=2&&top[1][1]>0?pure[profile]:null;
 const text=line('Pure 2-CST',pair,0,'none (fewer than two positive taxa)')+
  line(esc(coverage)+'% merged 2-CST',merged?.pairs?.[profile],1,merged?'unassigned':'unavailable')+
  line('Pure 3-CST',triples.membership[profile],2,'none (fewer than three positive taxa)')+
  '<br>n: '+esc(population.unit)+'; % of full dataset (N='+N.toLocaleString()+').';
 model.rows.set(profile,text);return text;
}
function legendRows(entries,classify){
 const seen=new Set(),groups=new Map();
 for(const entry of entries){if(seen.has(entry.key))continue;seen.add(entry.key);const value=classify(entry)||{},id=value.id==null||value.id===''?'unclassified':String(value.id),group=value.group||'';
  const key=JSON.stringify([group,id]);if(!groups.has(key))groups.set(key,{...value,id,group,label:id==='unclassified'?'Unclassified':value.label||id,color:value.color||'#7c878d',n:0});groups.get(key).n++;
 }
 return [...groups.values()].sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label));
}
const legendPercentPreference='vme-legend-percent-basis-v1';
function legendSelectedPercent(){return datasetPanelStorage.getItem(legendPercentPreference)==='selected'}
function legendCstLabel(id,bundle,records,fallback){
 const parts=String(id).split(',');
 // Dominance expressions and single-taxon compatibility labels carry other meanings.
 if(!/^[0-9]+(?:,[0-9]+){1,2}$/.test(String(id))||/single-taxon/i.test(fallback))return fallback;
 const asset=legendAbundanceTotals[bundle.dataset.id],mode=bundle.dataset.id==='comb-V3V4-tx'?activeSensitivityMode:'baseline';
 const summary=asset?.populations[mode]?.[records?'records':'profiles'];
 if(!summary||asset.datasetRevision!==bundle.dataset.revision)return fallback;
 if(summary.N!==legendPopulation(bundle,records).N)throw Error('Legend abundance population differs from its denominator');
 parts.sort((a,b)=>summary.totals[Number(b)-1]-summary.totals[Number(a)-1]||Number(a)-Number(b));
 const prefix=String(fallback).match(/^[GT]\d+: /)?.[0]||'';
 return prefix+parts.map(j=>taxonDisplayLabel(bundle.data.featureNames[j])).join(' + ');
}
function legendTable(rows,population,{title='Sample categories',note='',controls=false,viewN=rows.reduce((n,r)=>n+r.n,0)}={}){
 const selected=legendSelectedPercent(),N=selected?viewN:population.N;
 const percent=n=>N?(100*n/N<.01&&n>0?'&lt;0.01':(100*n/N).toFixed(2)):'—';
 const number=n=>n.toLocaleString(),grouped=new Map();rows.forEach(r=>{if(!grouped.has(r.group||''))grouped.set(r.group||'',[]);grouped.get(r.group||'').push(r)});
 let body='',cumulative=0;for(const [group,items] of grouped){if(group)body+=`<tr class="legendGroup"><th colspan="4">${esc(group)}</th></tr>`;
  body+=items.map(r=>{cumulative+=r.n;const check=controls&&r.backgroundPair!=null?`<input type="checkbox" data-background-state="${esc(r.backgroundPair)}"${r.checked?' checked':''}>`:'';
   const swatch=`<span class="colorSwatch" style="background:${r.ring?'transparent':r.color};border:1px solid ${r.color}${r.ring?';border-radius:50%':''}"></span>`;
   return `<tr class="legendItem"><td><label${check?' class="backgroundStateChoice"':''}>${check}${swatch}<span>${esc(r.label)}</span></label></td><td class="legendNumber">${number(r.n)}</td><td class="legendNumber">${percent(r.n)}</td><td class="legendNumber">${percent(cumulative)}</td></tr>`}).join('');
 }
 const basis=selected?'all displayed samples, including visible background once':'full eligible '+population.name;
 return `<div class="sampleLegendCounts"><div class="legendTitle"><strong>${esc(title)}</strong><label class="legendBasis" title="Use all displayed observations, including visible background once, as the denominator for % and c%"><input type="checkbox" data-legend-percent-selected${selected?' checked':''}>Selected samples</label></div><small class="legendCountNote">n: ${esc(population.unit)} in this view. % and c% of ${esc(basis)}: N = ${number(N)} ${esc(population.unit)}. c% accumulates down the table. Reference markers excluded.</small><table class="sampleLegendTable"><thead><tr><th scope="col">Category</th><th scope="col">n</th><th scope="col">%</th><th scope="col" title="Cumulative percentage in displayed row order">c%</th></tr></thead><tbody>${body||'<tr><td colspan="4">No samples in the current view.</td></tr>'}</tbody></table>${note?`<small>${esc(note)}</small>`:''}</div>`;
}
function installLegendCounts(){
 for(const id of ['sampleLegendItems','familyColorLegend'])el(id)?.addEventListener('change',e=>{
  const checkbox=e.target.closest('[data-legend-percent-selected]');if(!checkbox)return;
  datasetPanelStorage.setItem(legendPercentPreference,checkbox.checked?'selected':'global');
  if(id==='familyColorLegend')renderFamily(familyCamera()).catch(error=>{el('familyStatus').textContent=error.message||String(error)});else renderCountedSampleLegend();
 });
}
function legendVisibleTrace(trace){return trace.visible!==false&&trace.visible!=='legendonly'&&trace.opacity!==0&&trace.marker?.opacity!==0&&trace.mode?.includes('markers')}
function legendTraceIndices(traces){
 const indices=new Set();for(const t of traces){if(!t.meta?.sampleView||t.meta.edgeFaceRings||!legendVisibleTrace(t))continue;
  (t.ids||[]).forEach((id,k)=>{const i=Number(id);if(Number.isInteger(i)&&i>=0&&[t.x[k],t.y[k],t.z[k]].every(Number.isFinite))indices.add(i)});
 }return [...indices];
}
function renderCountedSampleLegend(){
 if(typeof longitudinalLegend==='function'&&longitudinalLegend())return;
 if(typeof syncCstSphereSummary==='function')syncCstSphereSummary();
 if(typeof explorationLegend==='function'&&explorationLegend())return;
 const bundle=datasetRegistry.get(META.id),traces=el('samples').data||[],isParticipant=participant.active;
 const recordMode=isParticipant||!!DATA.records||bundle.cohortAnalysis?.populationVersion===2&&bundle.dataset.observationUnit!=='distinct-composition';
 const population=legendPopulation(bundle,recordMode),entries=[];
 if(isParticipant){
  // Foreground takes precedence over the same record in the background trace.
  const participantRecords=new Map(participantData().records.map(r=>[r.index,r]));
  for(const foreground of [true,false])for(const t of traces){if(!legendVisibleTrace(t)||!t.meta?.legendRecords||!!t.meta.participantBackground===foreground)continue;
   t.meta.legendRecords.forEach((index,k)=>{const r=participantRecords.get(index);if(r&&[t.x[k],t.y[k],t.z[k]].every(Number.isFinite))entries.push({key:r.id??index,profile:r.profile,index,record:r,background:!foreground})});
  }
 }else for(const index of legendTraceIndices(traces)){
  if(index>=DATA.samples.ids.length)continue;
  const profile=DATA.records?DATA.records[index].profile:index;
  if(recordMode){const records=DATA.records?[{record:DATA.records[index],key:DATA.records[index].id??index}]:population.byProfile.get(profile)||[];records.forEach(r=>entries.push({...r,index,profile}))}
  else entries.push({key:population.profileKey(profile),index,profile});
 }
 const eligible=entries.filter(e=>population.identities.has(e.key)),nonCore=pureCoverageActive()&&pureCoverageComparison.nonCore;
 if(typeof renderCstSphereSummary==='function')renderCstSphereSummary(eligible,population);
 if(typeof estimateRenderLegend==='function'&&estimateRenderLegend(eligible))return;
 const valencia=valenciaActive()&&!nonCore,triples=!isParticipant&&!nonCore&&!valencia&&rank3.enabled&&rank3.color==='rank3';
 const components=!isParticipant&&!!mergedComponentKey(),candidates=!isParticipant&&candidateActive();
 const reference=new Map(displayGraph(bundle.data.graphs['100'],bundle.data).edges.map(e=>[e.id,e])),displayed=new Map(current().edges.map(e=>[e.id,e]));
 const tripleBase=triples||edgeFacesActive()?rank3Base():null,sub=el('sampleColorScheme').value==='valencia2-subtype';
 const pairValue=(id,original=false)=>({id,label:id==null?'Unclassified':legendCstLabel(id,bundle,recordMode,(original?reference:displayed).get(id)?.label||stateDisplayLabel(id)),color:id==null?'#7c878d':edgeColor(id)});
 const rows=legendRows(eligible,e=>{
  const group=isParticipant?(e.background?'Background (excluding participant samples)':'Participant samples'):'';
  if(nonCore)return {id:'non-core',label:'Non-core pure-state samples',color:'#a8adb2'};
  if(typeof sampleColorCategory==='function'&&sampleColorBundle()){
   if(isParticipant&&e.background&&!participant.stateBackground)return {id:'background',label:'Background samples',color:'#c9d2d7',group};
   const category=sampleColorCategory(e.index,isParticipant||DATA.records?e.record:null,e.profile,{background:e.background});
   if(category?.pair)return {...pairValue(category.id,category.original),group,...(e.background&&category.id===participantBackgroundPair(e.record)?{backgroundPair:category.id,checked:participantBackgroundHighlight?.pairs.includes(category.id)}:{})};
   if(category)return {...category,label:sampleColorMode()==='rank3'?legendCstLabel(category.id,bundle,recordMode,category.label):category.label,group};
  }
  if(valencia){const a=valenciaProfile(e.profile),id=a?.[sub?'subCST':'cst'];return {id,label:id,color:(sub?valenciaSubtypeColors:valenciaCstColors)[id]||'#7c878d',group}}
  if(triples){const id=tripleBase.membership[e.profile],r=tripleBase.byId.get(id);return {id,label:r?legendCstLabel(id,bundle,recordMode,r.key+': '+r.label):null,color:rank3Color(id)}}
  if(isParticipant){
   if(e.background&&!participant.stateBackground)return {id:'background',label:'Background samples',color:'#c9d2d7',group};
   if(!e.background&&participantColorMode()==='visit')return {id:e.record.label||null,label:e.record.label,color:participantVisitColor(e.record),group};
   const id=e.background?participantBackgroundPair(e.record):participantColorPair(e.record),original=e.background?participantBackgroundScheme()==='original':participantColorMode()==='original';
   return {...pairValue(id,original),group,...(e.background?{backgroundPair:id,checked:participantBackgroundHighlight?.pairs.includes(id)}:{})};
  }
  const original=candidates||components&&DATA.samples.pair[e.index]===selected,id=original?(DATA.purePairs||DATA.samples.pair)[e.index]:DATA.samples.pair[e.index];
  return {...pairValue(id,original),group:components?(original?'Original pure states in selected group':'Other displayed groups'):''};
 });
 const title=typeof sampleColorTitle==='function'&&sampleColorBundle()&&!nonCore?sampleColorTitle():valencia?'VALENCIA2 '+(sub?'subtypes':'CSTs'):triples?'Top-3 CSTs':isParticipant?'Participant and background categories':'Top-2 CSTs';
 let html=legendTable(rows,population,{title,controls:isParticipant&&!valencia,note:'Counts include displayed background samples once.'+(!valencia&&!nonCore&&legendAbundanceTotals[META.id]?' CST component names follow their total relative abundance across the full eligible dataset, using the counting unit above.':'')});
 if(isParticipant&&!valencia&&participant.stateBackground&&rows.some(r=>r.backgroundPair!=null)){
  // Retain the existing highlight interaction without counting its ring overlay.
  html+='<small>Background checkboxes ring matching background records; counts do not change.</small>';
  if(participantBackgroundHighlight?.pairs.length)html+='<button type="button" data-clear-background-highlight>Clear all highlights</button>';
 }
 if(edgeFacesActive()){
  const ringIndices=new Set(traces.filter(t=>t.meta?.edgeFaceRings&&legendVisibleTrace(t)).flatMap(t=>t.ids.map(Number)));
  const ringRows=legendRows(eligible.filter(e=>ringIndices.has(e.index)),e=>{const id=tripleBase.membership[e.profile],r=tripleBase.byId.get(id);return {id,label:r?legendCstLabel(id,bundle,recordMode,r.key+': '+r.label):null,color:rank3Color(id),ring:true}});
  html+=legendTable(ringRows,population,{title:'Top-3 CST rings · already counted above',viewN:rows.reduce((n,r)=>n+r.n,0),note:'Ring counts overlap the sample-category counts; do not add them.'});
 }
 el('sampleLegend').hidden=false;el('sampleLegendItems').innerHTML=html;
}
// Match plotted neighborhood compositions, including visible background once.
// Record multiplicities, reference markers and highlight-ring overlays do not count.
function familyDisplayedEntries(hood,foreground,background,showBackground,population){
 return [...foreground.map(i=>({i})),...(showBackground?background.map(i=>({i,background:true})):[])]
  .map(e=>({...e,profile:hood.profileIndices[e.i],key:population.profileKey(hood.profileIndices[e.i])}))
  .filter(e=>population.identities.has(e.key));
}
function countedFamilyLegend(hood,color,foreground,background,showBackground,graphColorOverride,linked){
 const bundle=datasetRegistry.get(hood.collection),population=legendPopulation(bundle);
 const base=graphColorOverride?rank3Base(datasetRegistry.get(hood.collection)):null,categories=new Map(color.legend.map(r=>[r.id,r]));
 const entries=familyDisplayedEntries(hood,foreground,background,showBackground,population);
 const counts=legendRows(entries,e=>{
  const i=e.i;if(e.background)return {id:'background',label:'Other displayed compositions',color:'#b9c2c7',group:'Dimmed background'};
  if(graphColorOverride){const id=linked.triples[i],r=base.byId.get(id);return {id,label:r?legendCstLabel(id,bundle,false,r.key+': '+r.label):null,color:rank3Color(id,hood.collection)}}
  const id=color.legendKeys?.[i]??color.states[i],r=categories.get(id);
  const label=r?.label||color.labels[i];
  return {id:id==='unclassified'?null:id,label:['merged2','rank3'].includes(color.mode)?legendCstLabel(id,bundle,false,label):label,color:color.colors[i]};
 });
 return legendTable(counts,population,{title:graphColorOverride?'Top-3 CSTs':color.mode.startsWith('valencia2-')?'VALENCIA2 '+(color.mode==='valencia2-subtype'?'subtypes':'CSTs'):'State categories',note:'n counts displayed distinct compositions, not their source-record multiplicities.'+(graphColorOverride||['merged2','rank3'].includes(color.mode)?' CST component names follow their total relative abundance across the full eligible source collection.':'')});
}
