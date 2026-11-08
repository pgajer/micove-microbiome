// A population-only dataset has no graph or independently fitted participant coordinates.
async function showSkinPopulation(data, choices) {
 const el=id=>document.getElementById(id);
 const title=choices.find(x=>x.id===data.id).title;
 document.title='MiCOVE — '+title;
 el('sampleTitle').textContent=title;
 const method=el('sampleMethod'), plot=el('samples'), selector=el('datasetSelect');
 const participant=el('participantSelect');
 const fields=el('participantSection').querySelector('.sectionControls');
 function field(label,input){
  const node=document.createElement('label');node.append(label+' ',input);return node;
 }
 function select(id,all,items){
  const node=document.createElement('select');node.id=id;node.add(new Option(all,''));
  for(const [value,label] of items)node.add(new Option(label,value));
  return node;
 }
 const records=data.records;
 const byId=new Map(records.map(r=>[r.specimenId,r]));
 const sites=[...new Set(records.map(r=>r.site))].sort();
 const siteLabel=s=>s==='elbow'?'Elbow crease':'Forearm';
 const visits=new Map(records.map(r=>[r.visitOrder,r.visitLabel]).sort((a,b)=>a[0]-b[0]));
 const site=select('skinSite','All sites',sites.map(s=>[s,siteLabel(s)]));
 const visit=select('skinVisit','All visits',[...visits]);
 const specimen=select('skinSpecimen','All specimens',[]);
 const download=document.createElement('button');download.textContent='Export displayed specimens';
 participant.replaceChildren(new Option('All participants',''));
 for(const id of [...new Set(records.map(r=>r.participantId))].sort()) participant.add(new Option(id,id));
 fields.replaceChildren(field('Participant',participant),field('Body site',site),field('Visit',visit),
                        field('Specimen',specimen),download);
 el('controlSections').replaceChildren(el('dataControls'),el('participantSection'));
 el('cohortControl').hidden=true;
 el('datasetMessage').textContent='Population embeddings. Graph and local fits are unavailable for this cohort.';
 el('panelWorkspace').replaceChildren(el('samplePanel'));
 el('panelWorkspace').style.display='block';
 el('samplePanel').style.height='100%';
 const detail=el('sampleContext');
 el('sampleSidePanels').replaceChildren(detail);
 detail.style.padding='0 10px';
 el('sampleInfoDivider').setAttribute('role','presentation');
 el('sampleInfoDivider').removeAttribute('tabindex');
 el('sampleInfoDivider').removeAttribute('title');
 el('sampleInfoDivider').style.pointerEvents='none';
 const viewControls=document.createElement('section');viewControls.className='sampleViewControls';viewControls.setAttribute('aria-label','Sample view settings');
 viewControls.append(method.closest('label'));el('sampleSidePanels').prepend(viewControls);
 el('samplePanel').querySelector('.sampleHeaderActions').replaceChildren();
 el('sampleStress').hidden=true;
 el('toggleControls').onclick=()=>{
  const collapsed=el('explorerLayout').classList.toggle('controlsCollapsed');
  el('controlSections').hidden=collapsed;
  el('toggleControls').textContent=collapsed?'›':'‹';
  el('toggleControls').setAttribute('aria-expanded',String(!collapsed));
  requestAnimationFrame(()=>Plotly.Plots.resize(plot));
 };
 selector.value=data.id;selector.onchange=()=>{
  const url=new URL(location.href);url.searchParams.set('dataset',selector.value);location.assign(url.href);
 };
 method.replaceChildren(new Option('L1-normalized · Euclidean','l1-euclidean'),
   new Option('Max-normalized · Euclidean','max-euclidean'),new Option('Max-normalized · L∞','max-linf'));
 for(const input of [selector,method,participant,site,visit,specimen,download,el('toggleControls')])input.disabled=false;
 const url=new URL(location.href);url.searchParams.set('dataset',data.id);history.replaceState(null,'',url);
 let shown=[];
 const visitColor=r=>r.visitOrder===1?'#087f8c':'#cf7318';
 const text=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 function rowLabel(r){return [r.specimenId,r.participantId,siteLabel(r.site),r.visitLabel].join(' · ')}
 async function draw(){
  const bank=data.banks[method.value], coords=bank.coordinates;
  shown=records.filter(r=>(!site.value||r.site===site.value)&&(!visit.value||String(r.visitOrder)===visit.value));
  const subjects=shown.filter(r=>!participant.value||r.participantId===participant.value);
  const old=specimen.value;
  specimen.replaceChildren(new Option('All specimens',''));
  for(const r of subjects)specimen.add(new Option(r.specimenId,r.specimenId));
  if(subjects.some(r=>r.specimenId===old))specimen.value=old;
  const members=new Set(subjects.map(r=>r.specimenId));
  const pairs=participant.value?data.pairs.filter(([a,b])=>members.has(a)&&members.has(b)):[];
  const traces=[];
  function trace(ids,props){
   if(ids.length)traces.push({type:'scatter3d',ids,x:ids.map(i=>coords[i][0]),
    y:ids.map(i=>coords[i][1]),z:ids.map(i=>coords[i][2]),showlegend:false,...props});
  }
  for(const [a,b] of pairs)trace([a,b],{mode:'lines',name:siteLabel(byId.get(a).site),
    line:{width:6,color:'#456577'},hoverinfo:'skip'});
  function markers(rows,background){
   trace(rows.map(r=>r.specimenId),{mode:'markers',text:rows.map(r=>text(rowLabel(r))),hoverinfo:'text',
    marker:{size:rows.map(r=>r.specimenId===specimen.value?11:background?3:7),
     color:background?'#aebbc2':rows.map(visitColor),opacity:background?0.35:1}});
  }
  markers(shown.filter(r=>!members.has(r.specimenId)),true);markers(subjects,false);
  detail.replaceChildren();
  function line(tag,value){const e=document.createElement(tag);e.textContent=value;detail.append(e)}
  line('h3',participant.value?'Participant '+participant.value:'Population');
  line('p',subjects.length+' specimens · '+(participant.value?pairs.length+' same-site trajectories':new Set(shown.map(r=>r.participantId)).size+' participants'));
  if(participant.value||specimen.value){
   for(const [order,label] of visits){
    const group=subjects.filter(r=>r.visitOrder===order&&(!specimen.value||r.specimenId===specimen.value));
    if(!group.length)continue;
    line('h4','Visit '+order+' · '+label);
    for(const r of group)line('p',siteLabel(r.site)+' · '+r.specimenId);
   }
   for(const [a,b] of pairs)line('p',siteLabel(byId.get(a).site)+' · '+a+' → '+b);
  }
  line('p','Teal marks the earlier visit and orange marks the later visit. Lines connect visits at the same body site.');
  download.textContent=participant.value?'Export participant specimens':'Export displayed specimens';
  await Plotly.react(plot,traces,{margin:{l:0,r:0,t:5,b:0},uirevision:data.id+'|'+method.value,
   scene:{aspectmode:'data',xaxis:{title:'',visible:false},yaxis:{title:'',visible:false},zaxis:{title:'',visible:false}}},
   {responsive:true,displaylogo:false});
 }
 for(const input of [method,participant,site,visit,specimen])input.onchange=draw;
 download.onclick=()=>{
  const rows=shown.filter(r=>!participant.value||r.participantId===participant.value);
  const raw=JSON.stringify(rows.map(r=>({datasetId:data.id,revision:data.revision,...r})),null,2);
  const href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const a=document.createElement('a');a.href=href;a.download=data.id+'-displayed-specimens.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(href),30000);
 };
 await draw();
}
