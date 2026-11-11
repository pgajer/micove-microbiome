// Frozen CAG compositions with optional raw-read leading-taxon annotations.
const CombMg = (()=>{
 const populations=[['3.5k','3.5k reference · 3,544 profiles'],['4k','4k exploratory · 4,014 profiles']];
 const constructions=[['AZ','AZ · all samples, including zeros'],['ESZ','ESZ · exclude shared zeros'],['JPO','JPO · jointly positive only']];
 const representations=[['mean','Mean per CAG'],['length_cag','Length-corrected mean per CAG'],['length_other','Length-corrected means + species_other'],['sum_cag','Summed counts · CAGs only'],['sum_other','Summed counts · CAGs + species_other']];
 const geometries=[['l1|euclidean','L1-normalized · Euclidean'],['max|euclidean','Max-normalized · Euclidean'],['max|linf','Max-normalized · L∞']];
 const groups={reference:'Reference',accepted_inferred_70:'Inferred LSVF links · 70',unresolved_400:'Unresolved identities · 400'};
 const groupColors={reference:'#0072B2',accepted_inferred_70:'#D55E00',unresolved_400:'#888888'};
 const ctValue=v=>/^(?:|NA|N\/A|null|nan)$/i.test(String(v??'').trim())?'':String(v).trim();
 function key(s){return [s.population,s.construction,s.representation,s.geometry].join('|')}
 function rows(records,s){return records.map((r,i)=>({r,i})).filter(({r})=>(!s.cohort||r.study===s.cohort)&&(!s.group||r.exploratory_group===s.group))}
 function validate(data,s){if(!data.maps[key(s)])throw Error('This exact CAG map is unavailable. No substitute is shown.');return data.maps[key(s)]}
 function options(data){const keys=Object.keys(data.maps).map(k=>k.split('|'));return {
  populations:populations.filter(([v])=>keys.some(k=>k[0]===v)),constructions:constructions.filter(([v])=>keys.some(k=>k[1]===v)),
  representations:representations.filter(([v])=>keys.some(k=>k[2]===v)),geometries:geometries.filter(([v])=>keys.some(k=>k.slice(3).join('|')===v))};}
 function fractionLabel(s){return s.geometry.startsWith('max')?'Max-scaled value':s.representation==='sum_cag'?'Fraction of CAG reads':s.representation==='sum_other'?'Fraction of in-scope reads':'CAG fraction'}
 function denominator(s,t){if(!s.representation.startsWith('sum_'))return '';
  const inclusive=s.representation==='sum_other',scope=inclusive?'CAGs + '+t.residualCount+' residual species_other categories; all in-scope reads retained.':'CAGs only; residual reads excluded. Median retained read fraction: '+(100*t.medianReadFraction).toFixed(2)+'%.';
  return 'Raw gene-count sums, without gene averaging or length correction. '+scope+' '+(s.geometry.startsWith('l1')?'L1 denominator: '+(inclusive?'all in-scope gene reads.':'CAG reads only.'):'Max denominator: the largest included '+(inclusive?'CAG or residual':'CAG')+' read count.');}
 const escape=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 function taxonDisplay(context,n){const taxa=context.taxa.slice(0,Math.max(1,Math.min(context.taxa.length,Number(n)||8)));return {taxa,n:taxa.reduce((a,t)=>a+t.n,0),names:new Set(taxa.map(t=>t.taxon))}}
 function csv(records){const fields=[...new Set(records.flatMap(Object.keys))];const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';return [fields,...records.map(r=>fields.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n'}
 async function bytes(d){
  if(!/^\/vme-assets\/[a-f0-9]{64}\.(json|f64\.gz|tsv\.gz)$/.test(d.url)||!d.url.includes(d.sha256))throw Error('Invalid CAG asset descriptor');
  const r=await fetch(d.url);if(!r.ok)throw Error('Could not load CAG asset: HTTP '+r.status);
  const b=await r.arrayBuffer();if(b.byteLength!==d.bytes)throw Error('Incomplete CAG asset');
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(h!==d.sha256)throw Error('CAG checksum differs; reload the page.');return b;
 }
 return {populations,constructions,representations,geometries,options,fractionLabel,denominator,ctValue,groups,groupColors,key,rows,validate,escape,csv,bytes,taxonDisplay};
})();
if(typeof module!=='undefined')module.exports=CombMg;
async function showCombMgPopulation(data,choices){
 const $=id=>document.getElementById(id),E=CombMg.escape,plot=$('samples'),panel=$('samplePanel'),side=$('sampleSidePanels');
 const storageKey='micove-comb-mg-'+data.revision,identity=data.sourceContractSha256;
 let saved={};try{const x=JSON.parse(localStorage.getItem(storageKey));if(x?.identity===identity)saved=x}catch{}
 let s={population:data.default.dataset,construction:data.default.construction,representation:data.default.representation,
  geometry:data.default.normalization+'|'+data.default.target_metric,cohort:'',group:'',color:'cohort',feature:'',specimen:'',size:'3',opacity:'0.75',
  topTaxa:'8',showReferences:true,sphereReferences:true,referenceSize:'100',referenceColor:'#d62728',referenceAmbient:'85',referenceHighlights:'18',referenceLabelSize:'12',...saved.settings};
 const defaults={...s};
 try{CombMg.validate(data,s)}catch{s={...s,population:data.default.dataset,construction:data.default.construction,representation:data.default.representation,geometry:data.default.normalization+'|'+data.default.target_metric}}
 const available=CombMg.options(data);
 const style=document.createElement('style');style.textContent=`
 .combMg [hidden]{display:none!important}.combMg label{display:flex;flex-direction:column;gap:4px;margin:10px 0}.combMg select,.combMg input{max-width:100%;min-width:0}.combMg small{display:block;line-height:1.4}.combMg details{margin:10px 0;border-top:1px solid #d3e0e5;padding-top:8px}.combMg summary{font-weight:600;cursor:pointer}.combMg table{width:100%;font-size:12px;border-collapse:collapse}.combMg td,.combMg th{padding:4px;border-bottom:1px solid #e0e8eb;text-align:left;overflow-wrap:anywhere}.combMgNotice{padding:8px;background:#fff3d8;border-left:3px solid #d89b28;font-size:12px;line-height:1.4}.combMgStatus{padding:8px;line-height:1.45}.combMgSelected{font-weight:600;color:#a54500}#samplePanel.combMg{height:100%;min-height:520px}#samplePanel.combMg #sampleSidePanels{overflow:auto;flex:0 0 350px;padding:8px 12px;box-sizing:border-box}#samplePanel.combMg #sampleContent{display:flex;flex:1;min-height:0}#samplePanel.combMg #samples{position:relative;flex:1;min-width:120px;height:100%}#samplePanel.combMg #sampleInfoDivider{display:none}.combMg .sampleHeaderActions{flex-wrap:wrap}.combMg dialog{max-width:640px;max-height:85vh;overflow:auto}#samplePanel.combMgExpanded{position:fixed;inset:8px;z-index:1000;height:calc(100vh - 16px)}
 @media(max-width:900px){#samplePanel.combMg #sampleContent{flex-direction:column}#samplePanel.combMg #sampleSidePanels{flex:0 0 260px;width:auto;max-height:35vh}#samplePanel.combMg #samples{min-height:300px;height:auto}}
 `;document.head.append(style);panel.classList.add('combMg');
 $('panelWorkspace').replaceChildren(panel);$('panelWorkspace').style.display='block';
 // The common plot and side controls remain within the MiCOVE sample panel.
 $('sampleContent').replaceChildren(plot,side);side.replaceChildren();
 const make=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(parent)parent.append(n);return n};
 const button=(id,text,parent)=>{const b=make('button',text,parent);b.id=id;b.className='maximizePanel';b.type='button';return b};
 const field=(label,node,parent)=>{const l=make('label',null,parent);l.append(document.createTextNode(label),node);return node};
 const select=(id,label,items,parent)=>{const n=make('select');n.id=id;for(const [v,t] of items)n.add(new Option(t,v));field(label,n,parent);return n};
 const details=(title,parent,open=false)=>{const d=make('details',null,parent);make('summary',title,d);d.open=open;return d};
 const checkbox=(id,label,parent)=>{const n=make('input');n.type='checkbox';n.id=id;const l=field(label,n,parent).parentElement;l.style.flexDirection='row-reverse';l.style.justifyContent='flex-end';return n};
 const slider=(id,label,min,max,step,parent,unit)=>{const n=make('input');Object.assign(n,{type:'range',id,min,max,step});const l=field(label,n,parent).parentElement,o=make('output',null,l);o.id=id+'Value';n._display=()=>{o.value=n.value+unit};return n};
 const dataSection=$('dataControls'),controls=dataSection.querySelector('.sectionControls');
 const dataset=$('datasetSelect');dataset.disabled=false;dataset.value=data.id;
 const datasetField=dataset.closest('label')||field('Dataset',dataset,document.createElement('div')).parentElement;
 controls.replaceChildren(datasetField);$('controlSections').replaceChildren(dataSection);dataSection.classList.add('combMg');
 const population=select('combMgPopulation','Population',available.populations,controls);
 const cohort=select('combMgCohort','Cohort',[['','All']],controls);
 const group=select('combMgGroup','Identity group',[['','All groups']],controls);
 const notice=make('p','Exploratory CAG compositions. Individual body-site and identity holds remain.',controls);notice.className='combMgNotice';
 make('small','Confirmed/inherited participant IDs and inferred links stay separate. No confirmed visit order is available; trajectories are not enabled.',controls);
 dataset.onchange=()=>{const u=new URL(location.href);u.searchParams.set('dataset',dataset.value);u.searchParams.delete('cohort');location.assign(u.href)};
 $('toggleControls').disabled=false;$('toggleControls').onclick=()=>{const close=$('explorerLayout').classList.toggle('controlsCollapsed');$('controlSections').hidden=close;requestAnimationFrame(()=>Plotly.Plots.resize(plot))};
 const construction=select('combMgConstruction','CAG construction',available.constructions,side);construction.disabled=available.constructions.length===1;
 construction.title='Frozen species-wise correlation masks: AZ includes zeros; ESZ omits jointly zero observations; JPO uses jointly positive observations. Each construction has its own disjoint gene groups.';
 const representation=select('combMgAbundance','Abundance definition',available.representations,side);
 representation.title=data.abundanceKind==='sum'?'Sum raw gene counts within each disjoint AZ CAG. Including species_other retains residual reads and changes the normalization denominator; residual categories are not coherent CAGs.':'Means divide by all genes in the fixed group, including genes with zero counts. Length correction divides each gene count by its nucleotide length first. species_other contains heterogeneous residual categories.';
 const geometry=select('combMgGeometry','Sample embedding',available.geometries,side);
 const denominatorNote=make('small',null,side);denominatorNote.id='combMgDenominator';
 const summary=make('div',null,side);summary.id='combMgSummary';summary.className='combMgStatus';summary.setAttribute('role','status');
 const coloring=details('Sample coloring',side,true);
 const color=select('combMgColor','Color by',[['cohort','Cohorts'],['group','Identity group'],['mapping','Mapping status'],['ct','CT persistence · source coding'],['feature','CAG / residual feature']],coloring);
 if(data.taxonContext)color.add(new Option('Leading taxon (raw reads) · pure 1-CSTs','taxon'));
 const topTaxa=select('combMgTopTaxa','Number of leading taxa',[],coloring),taxonNote=make('small',null,coloring);taxonNote.id='combMgTaxonNote';
 topTaxa.title='Rank taxa by the number of samples they dominate in the full selected population. Other samples stay gray; none are reassigned or removed.';
 const featureSearch=make('input');featureSearch.id='combMgFeatureSearch';featureSearch.placeholder='Filter feature ID or taxon annotation';field('Find feature',featureSearch,coloring);
 const feature=select('combMgFeature','Feature',[],coloring);
 const featureInfo=make('small',null,coloring),legend=make('div',null,coloring);legend.id='combMgLegend';
 const appearance=details('Sample appearance',side);
 const references=details('Reference vertices',appearance,true);
 const showReferences=checkbox('combMgShowReferences','Show reference vertices',references),sphereReferences=checkbox('combMgSphereReferences','Sphere vertices',references);
 const referenceSize=slider('combMgReferenceSize','Vertex size',25,300,5,references,'%');
 const referenceColor=make('input');referenceColor.type='color';referenceColor.id='combMgReferenceColor';field('Vertex color',referenceColor,references);
 const referenceAmbient=slider('combMgReferenceAmbient','Ambient light',0,100,1,references,'%'),referenceHighlights=slider('combMgReferenceHighlights','Highlights',0,100,1,references,'%');
 const referenceLabelSize=slider('combMgReferenceLabelSize','Reference vertex label size',8,24,1,references,' px');
 const referenceNote=make('small','',references);referenceNote.id='combMgReferenceNote';
 const size=make('input');size.type='range';size.min='1';size.max='12';size.step='0.5';size.id='combMgSize';field('Point size',size,appearance);
 const opacity=make('input');opacity.type='range';opacity.min='0.05';opacity.max='1';opacity.step='0.05';opacity.id='combMgOpacity';field('Point opacity',opacity,appearance);
 const specimen=select('combMgSpecimen','Inspect sample',[['','Choose a sample']],side);
 const inspection=make('div',null,side);inspection.id='combMgInspection';
 const methods=details('Methods, interpretation and downloads',side);
 make('p','Each point is a sample profile. Selecting cohorts or identity groups restricts the saved population coordinates; it does not fit a local map. Axes are not aligned across the '+Object.keys(data.maps).length+' independent fits.',methods);
 if(data.taxonContext)make('p','Leading taxon (raw reads) assigns each sample to its most abundant taxon: a pure taxon-level 1-CST. It uses all in-scope taxonomically assigned gene reads, including residual genes, regardless of the displayed CAG representation. The N largest states are ranked by sample count; the gray remainder is not merged into them. Coverage is the fraction of samples in these states, not within-sample abundance. Taxon-count and leading-abundance ties use frozen feature order. Reference vertices mark observed samples with the largest taxon read fraction across the full selected population; ties use sample order. They are context markers, including when filtered out, and never add to sample counts. These are read fractions, not cell proportions.',methods);
 for(const caution of data.cautions)make('p',caution,methods);
 make('p',data.abundanceKind==='sum'?'Each feature sums raw counts over its fixed disjoint gene set. No gene averaging or length correction is applied. L1 divides by the sum of included features; max divides by their maximum. CAG-only L1 uses CAG reads, while the inclusive version uses all in-scope gene reads. Removing species_other changes the table and denominator, rather than merely hiding categories.':'Ordinary means: sum of gene counts / number of genes. Length-corrected means: sum of count / nucleotide length, divided by number of genes. L1 divides by the sum of displayed feature values; max divides by their maximum. Common sample denominators cancel. Residual species_other values are means, not sums.',methods);
 const exportCSV=button('combMgCSV','Export displayed samples CSV',methods),exportFeatures=button('combMgFeaturesCSV','Export feature metadata CSV',methods);
 const abundanceLink=make('a','Download full normalized table (TSV.gz)',methods);abundanceLink.style.display='block';
 const rawLink=make('a','Download raw summed counts (TSV.gz)',methods);rawLink.style.display='block';
 const accountingCSV=button('combMgAccountingCSV','Export retained-read accounting CSV',methods);accountingCSV.hidden=data.abundanceKind!=='sum';
 const taxonCSV=button('combMgTaxonCSV','Export pure 1-CST counts and references CSV',methods);taxonCSV.hidden=!data.taxonContext;
 const downloadArea=make('div',null,methods);
 const header=panel.querySelector('.sampleHeaderActions');header.replaceChildren();
 const back=button('combMgBack','← Back',header),forward=button('combMgForward','Forward →',header),clear=button('combMgClear','Clear selection',header);
 const named=button('combMgNamed','Named views…',header),png=button('combMgPNG','Save PNG…',header),max=button('combMgMaximize','⛶ Maximize',header);
 const stress=$('sampleStress');stress.disabled=false;stress.hidden=false;
 let active=null,serial=0,selectionHistory=[''],historyIndex=0,cameras=saved.cameras||{},namedViews=saved.namedViews||[],jsonCache=new Map(),matrixCache=null;
 let currentFrame=null,pickingInstalled=false;
 const bindings={population,construction,representation,geometry,cohort,group,color,feature,specimen,size,opacity,topTaxa,showReferences,sphereReferences,referenceSize,referenceColor,referenceAmbient,referenceHighlights,referenceLabelSize};
 function restoreControls(){for(const [k,n] of Object.entries(bindings))if(n.type==='checkbox')n.checked=s[k];else if(n.tagName==='SELECT'){if([...n.options].some(o=>o.value===s[k]))n.value=s[k]}else n.value=s[k]}
 restoreControls();
 function rememberCamera(){const c=plot._fullLayout?.scene?._scene?.getCamera();if(c&&currentFrame)cameras[currentFrame]=JSON.parse(JSON.stringify(c))}
 function persist(){rememberCamera();try{localStorage.setItem(storageKey,JSON.stringify({identity,settings:s,cameras,namedViews}))}catch{}}
 function getSettings(){for(const [k,n] of Object.entries(bindings))s[k]=n.type==='checkbox'?n.checked:n.value;return {...s}}
 async function json(d){if(!jsonCache.has(d.url)){const a=JSON.parse(new TextDecoder().decode(await CombMg.bytes(d)));jsonCache.set(d.url,a)}return jsonCache.get(d.url)}
 async function matrix(t){
  if(matrixCache?.sha===t.matrix.sha256)return matrixCache.values;
  const compressed=await CombMg.bytes(t.matrix),buffer=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(buffer.byteLength!==8*t.samples*t.featureCount)throw Error('Wrong abundance matrix dimensions');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==t.matrixSha256)throw Error('Abundance order/precision check failed');
  matrixCache={sha:t.matrix.sha256,values:new Float64Array(buffer)};return matrixCache.values;
 }
 function fieldName(f){return f.feature+' · '+f.taxon.replaceAll('_',' ')+' · '+f.genes+' genes'+(f.kind==='species_other'?' · residual':'')}
 function fillFeatures(features){const query=featureSearch.value.toLowerCase(),old=s.feature;feature.replaceChildren(new Option('Choose a feature',''));
  for(const f of features)if(!query||fieldName(f).toLowerCase().includes(query)||f.feature===old)feature.add(new Option(fieldName(f),f.feature));
  feature.value=[...feature.options].some(o=>o.value===old)?old:'';s.feature=feature.value;
 }
 function categorise(r,i,context,shown){
  if(s.color==='taxon'&&context){const t=context.samples[i].taxon;return shown.names.has(t)?{label:t.replaceAll('_',' '),color:trajectoryTaxonColor(t,{})}:{label:'Other leading taxa',color:'#8c8c8c'}};
  if(s.color==='feature')return {label:'Choose a feature',color:'#999999'};
  if(s.color==='group')return {label:CombMg.groups[r.exploratory_group],color:CombMg.groupColors[r.exploratory_group]};
  if(s.color==='mapping'){const label=r.mapping_status||'Unavailable';return {label,color:sampleCohortColor(label)}}
  if(s.color==='ct'){const v=CombMg.ctValue(r.ct_outcome_persist);return {label:v?'CT outcome_persist = '+v:'Unavailable',color:v==='1'?'#D55E00':v==='0'?'#0072B2':v?sampleCohortColor(v):'#999999'}}
  return {label:r.study||'Unclassified',color:sampleCohortColor(r.study)};
 }
 function inspect(){
  const i=active?.records.findIndex(r=>r.sample_id===s.specimen);inspection.replaceChildren();if(!(i>=0))return;
  const r=active.records[i];make('h3',r.sample_id,inspection).className='combMgSelected';
  const md=details('Recorded metadata and holds',inspection,true),table=make('table',null,md);
  for(const [k,v] of Object.entries(r)){const row=make('tr',null,table);make('th',k.replaceAll('_',' '),row);make('td',v||'Unavailable',row)}
  const top=make('table',null,inspection);make('caption','Largest values in the current normalized CAG table',top);
  for(const [j,value] of active.top[i]){const row=make('tr',null,top);make('td',fieldName(active.features[j]),row);make('td',value.toPrecision(5),row)}
 }
 function selectSample(id,push=true){s.specimen=id;specimen.value=id;if(push){selectionHistory=selectionHistory.slice(0,historyIndex+1);if(selectionHistory.at(-1)!==id)selectionHistory.push(id);historyIndex=selectionHistory.length-1}return render()}
 async function render(){
  rememberCamera();const attempt=++serial;const selected={...s},key=CombMg.key(selected),map=CombMg.validate(data,selected),table=data.tables[map.table];
  active=null;for(const n of [exportCSV,exportFeatures,accountingCSV,taxonCSV,png])n.disabled=true;
  summary.textContent='Loading the matching saved map…';plot.style.visibility='hidden';
  try{
   const [records,features,xyz,top,context]=await Promise.all([json(data.samples[selected.population]),json(table.features),json(map.coordinates),json(table.top),data.taxonContext?.[selected.population]?json(data.taxonContext[selected.population]):null]);
   if(attempt!==serial)return;
   if(records.length!==xyz.length||records.length!==table.samples||features.length!==table.featureCount)throw Error('CAG axes do not match');
   if(context&&(context.samples.length!==records.length||context.samples.some((r,i)=>r.sample_id!==records[i].sample_id)))throw Error('Taxon annotation sample axis differs');
   if(s.color==='taxon'&&!context){s.color='cohort';color.value=s.color}
   const shown=context?CombMg.taxonDisplay(context,s.topTaxa):null;
   topTaxa.replaceChildren(...(context?context.taxa.map((_,i)=>new Option(String(i+1),String(i+1))):[]));
   if(shown){s.topTaxa=String(shown.taxa.length);topTaxa.value=s.topTaxa}
   topTaxa.closest('label').hidden=taxonNote.hidden=s.color!=='taxon';references.hidden=!context;
   const cohorts=[...new Set(records.map(r=>r.study))].sort();cohort.replaceChildren(new Option('All',''),...cohorts.map(x=>new Option(x||'Unclassified',x)));
   if(!cohorts.includes(s.cohort))s.cohort='';cohort.value=s.cohort;
   const groups=[...new Set(records.map(r=>r.exploratory_group))];group.replaceChildren(new Option('All groups',''),...groups.map(x=>new Option(CombMg.groups[x],x)));
   if(!groups.includes(s.group))s.group='';group.value=s.group;group.disabled=groups.length<2;
   fillFeatures(features);feature.closest('label').hidden=featureSearch.closest('label').hidden=s.color!=='feature';
   const visible=CombMg.rows(records,s);specimen.replaceChildren(new Option('Choose a sample',''),...visible.map(({r})=>new Option(r.sample_id,r.sample_id)));
   if(!visible.some(({r})=>r.sample_id===s.specimen))s.specimen='';specimen.value=s.specimen;
   const featureIndex=features.findIndex(f=>f.feature===s.feature);let values=null;
   if(s.color==='feature'&&featureIndex>=0){summary.textContent='Loading exact feature values…';values=await matrix(table);if(attempt!==serial)return}
   const traces=[],counts=new Map();legend.replaceChildren();
   const hover=({r,i})=>'<b>'+E(r.sample_id)+'</b><br>'+E(r.study)+' · '+E(CombMg.groups[r.exploratory_group])+'<br>'+E(r.mapping_status||'Mapping unavailable')+
     '<br>Identity/body-site holds retained'+(context?'<br>Leading taxon: '+E(context.samples[i].taxon.replaceAll('_',' '))+' · '+(100*context.samples[i].fraction).toFixed(2)+'% of in-scope reads':'')+top[i].map(([j,v])=>'<br>'+E(features[j].feature)+': '+v.toPrecision(4)).join('');
   const points=new Map();if(s.color==='taxon'&&shown)for(const t of shown.taxa)points.set(t.taxon.replaceAll('_',' '),{color:trajectoryTaxonColor(t.taxon,{}),rows:[]});
   for(const row of visible){const cat=values?{label:'Feature value',color:null}:categorise(row.r,row.i,context,shown);if(!points.has(cat.label))points.set(cat.label,{...cat,rows:[]});points.get(cat.label).rows.push(row)}
   for(const [label,g] of points){const p=g.rows,marker={size:Number(s.size),opacity:Number(s.opacity),color:values?p.map(({i})=>values[i*features.length+featureIndex]):g.color};
    if(values)Object.assign(marker,{colorscale:'Viridis',showscale:true,cmin:0,cmax:Math.max(...p.map(({i})=>values[i*features.length+featureIndex]),1e-12),colorbar:{title:{text:CombMg.fractionLabel(s)},thickness:12}});
    traces.push({type:'scatter3d',mode:'markers',meta:{agpGraphVertices:true},name:label,x:p.map(({i})=>xyz[i][0]),y:p.map(({i})=>xyz[i][1]),z:p.map(({i})=>xyz[i][2]),marker,customdata:p.map(({r})=>({id:r.sample_id,edge:false})),text:p.map(hover),hovertemplate:'%{text}<extra></extra>',showlegend:false});
    counts.set(label,{n:p.length,color:g.color});
   }
   const selectedIndex=records.findIndex(r=>r.sample_id===s.specimen);if(selectedIndex>=0){const p=xyz[selectedIndex];traces.push({type:'scatter3d',mode:'markers',x:[p[0]],y:[p[1]],z:[p[2]],customdata:[s.specimen],marker:{size:Number(s.size)+5,color:'#D55E00',symbol:'circle-open',line:{width:3,color:'#D55E00'}},hoverinfo:'skip',showlegend:false})}
   const referenceAvailable=!!context&&s.color==='taxon',show=referenceAvailable&&s.showReferences,lit=show&&s.sphereReferences;
   showReferences.disabled=!referenceAvailable;for(const n of [sphereReferences,referenceSize,referenceColor,referenceLabelSize])n.disabled=!show;
   for(const n of [referenceAmbient,referenceHighlights])n.disabled=!lit;
   for(const n of [referenceSize,referenceAmbient,referenceHighlights,referenceLabelSize])n._display();
   referenceNote.textContent=referenceAvailable?'Observed maximum-abundance samples in the full '+s.population+' population. Labels show raw-read fractions. References outside sample filters remain as context and are excluded from counts.':'Choose Leading taxon (raw reads) to display its reference vertices.';
   const annotations=[];
   if(show){const span=Math.max(...[0,1,2].map(j=>Math.max(...xyz.map(p=>p[j]))-Math.min(...xyz.map(p=>p[j]))))||1,diameter=5*Number(s.referenceSize)/100;
    shown.taxa.forEach((t,i)=>{const p=xyz[t.referenceIndex],label=t.taxon.replaceAll('_',' ')+' ('+(100*t.referenceFraction).toFixed(2)+'%)';
     const h=E(label)+'<br>Observed reference: '+E(t.referenceSample)+'<br>Maximum across '+records.length+' samples';
     annotations.push({x:p[0],y:p[1],z:p[2],text:label,ax:i%2?18:-18,ay:i%3? -18:18,xanchor:i%2?'left':'right',showarrow:true,arrowhead:0,arrowwidth:1,arrowcolor:'#78909c',bgcolor:'rgba(255,255,255,.8)',font:{size:Number(s.referenceLabelSize),color:'#173846'}});
     if(lit)traces.push({...vertexSphereMesh(p,diameter*span/600,{ambient:Number(s.referenceAmbient),highlights:Number(s.referenceHighlights)}),color:s.referenceColor,text:h,hovertemplate:'%{text}<extra></extra>',meta:{combMgReference:t.taxon},showlegend:false});
     else traces.push({type:'scatter3d',mode:'markers',x:[p[0]],y:[p[1]],z:[p[2]],marker:{size:diameter,color:s.referenceColor,symbol:'diamond'},text:[h],hovertemplate:'%{text}<extra></extra>',meta:{combMgReference:t.taxon},showlegend:false});
    });
   }
   const layout={margin:{l:0,r:values?80:0,t:0,b:0},showlegend:false,paper_bgcolor:'white',uirevision:key,
    scene:{aspectmode:'data',camera:cameras[key],annotations,xaxis:{visible:false},yaxis:{visible:false},zaxis:{visible:false}}};
   await Plotly.react(plot,traces,layout,{responsive:true,displaylogo:false,displayModeBar:false});if(attempt!==serial)return;
   currentFrame=key;plot.style.visibility='visible';
   // A user can change a control while the first asset request is pending.
   // Install picking after the first completed render, including a replacement render.
   if(!pickingInstalled){installAgpGraphPicking(plot,item=>selectSample(item.id).catch(console.error),()=>serial);plot.on('plotly_relayout',()=>persist());pickingInstalled=true}
   active={records,features,xyz,top,visible,map,table,key,context};
   for(const n of [exportCSV,exportFeatures,accountingCSV,taxonCSV,png])n.disabled=false;
   denominatorNote.textContent=CombMg.denominator(selected,table);denominatorNote.hidden=!denominatorNote.textContent;
   $('sampleTitle').textContent='Combined metagenomes · '+selected.population+' · '+selected.construction;
   stress.textContent='RMS relative error: '+map.rmsRelativeErrorPercent.toFixed(2)+'% (all pairs)'+(visible.length!==records.length?' · full fitted population':'');
   stress.title='Click for the definition. Subsets restrict population coordinates; the displayed error belongs to the full fitted population.';
   summary.textContent=visible.length.toLocaleString()+' displayed sample profiles / '+records.length.toLocaleString()+' in this fit · '+features.length.toLocaleString()+' features. '+
    (s.group?CombMg.groups[s.group]+'. ':'')+'Exploratory; identity and body-site holds remain.';
   if(context)taxonNote.textContent='Top '+shown.taxa.length+' pure 1-CSTs cover '+(100*shown.n/records.length).toFixed(2)+'% of the full '+s.population+' population. Gray = other leading taxa. All filtered samples stay plotted. Legend n and % count displayed samples; reference markers are excluded.';
   const legendTable=make('table',null,legend),head=make('tr',null,make('thead',null,legendTable));for(const t of ['Category','n','%','c%'])make('th',t,head);const body=make('tbody',null,legendTable);let cumulative=0;
   for(const [label,v] of counts){cumulative+=v.n;const row=make('tr',null,body),name=make('td',null,row);if(v.color){const sw=make('span','■ ',name);sw.style.color=v.color}name.append(document.createTextNode(label));make('td',String(v.n),row);make('td',(100*v.n/Math.max(visible.length,1)).toFixed(2),row);make('td',(100*cumulative/Math.max(visible.length,1)).toFixed(2),row)}
   featureInfo.hidden=s.color!=='feature';
   featureInfo.textContent=featureIndex<0?'Choose a feature to inspect or color. Feature identities are specific to this population and construction.':fieldName(features[featureIndex])+'. '+(features[featureIndex].kind==='CAGC'?'Disjoint CAG.':'Residual accounting category; not a coherent CAG.')+' Values are CAG compositions, not taxon or cell proportions.';
   abundanceLink.href=table.download.url;abundanceLink.download='comb-mg-'+map.table.replaceAll('|','-')+'.tsv.gz';
   rawLink.hidden=!table.rawDownload;if(table.rawDownload){rawLink.href=table.rawDownload.url;rawLink.download='comb-mg-'+map.table.replaceAll('|','-')+'-raw-counts.tsv.gz'}
   back.disabled=historyIndex===0;forward.disabled=historyIndex===selectionHistory.length-1;clear.disabled=!s.specimen&&!s.cohort&&!s.group;
   inspect();persist();
  }catch(error){if(attempt===serial){summary.textContent='Unable to show this map: '+error.message;plot.style.visibility='hidden';active=null}throw error}
 }
 function run(){render().catch(error=>console.error(error))}
 for(const [k,n] of Object.entries(bindings)){const handler=()=>{getSettings();if(k==='specimen'){selectSample(s.specimen).catch(console.error);return}if(['population','cohort','group'].includes(k)){selectionHistory=[''];historyIndex=0}s.feature=feature.value;run()};n.onchange=handler;if(k.startsWith('reference'))n.oninput=handler}
 featureSearch.oninput=()=>{if(active)fillFeatures(active.features)};
 clear.onclick=()=>{s.cohort=s.group=s.specimen='';cohort.value=group.value=specimen.value='';selectSample('').catch(console.error)};
 back.onclick=()=>{if(historyIndex>0)selectSample(selectionHistory[--historyIndex],false).catch(console.error)};
 forward.onclick=()=>{if(historyIndex+1<selectionHistory.length)selectSample(selectionHistory[++historyIndex],false).catch(console.error)};
 max.onclick=()=>{panel.classList.toggle('combMgExpanded');max.textContent=panel.classList.contains('combMgExpanded')?'Restore':'⛶ Maximize';requestAnimationFrame(()=>Plotly.Plots.resize(plot))};
 function download(raw,name,type){for(const old of downloadArea.querySelectorAll('a'))URL.revokeObjectURL(old.href);downloadArea.replaceChildren();const a=make('a','Download '+name,downloadArea);a.href=URL.createObjectURL(new Blob([raw],{type}));a.download=name;a.style.display='block';a.click()}
 exportCSV.onclick=()=>{if(!active)return;const records=active.visible.map(({r,i})=>({...r,x:active.xyz[i][0],y:active.xyz[i][1],z:active.xyz[i][2],map:active.key,coordinate_metric:'euclidean',target_metric:active.map.targetMetric,
  ...(active.context?{leading_taxon_raw:active.context.samples[i].taxon,leading_taxon_raw_read_fraction:active.context.samples[i].fraction,leading_taxon_tie:active.context.samples[i].tied}:{}),full_population_rms_relative_error_percent:active.map.rmsRelativeErrorPercent,source_contract_sha256:identity}));download(CombMg.csv(records),'comb-mg-displayed-samples.csv','text/csv')};
 exportFeatures.onclick=()=>active&&download(CombMg.csv(active.features),'comb-mg-feature-metadata.csv','text/csv');
 accountingCSV.onclick=async()=>{if(active?.table.accounting)download(CombMg.csv(await json(active.table.accounting)),'comb-mg-retained-read-accounting.csv','text/csv')};
 taxonCSV.onclick=()=>{if(!active?.context)return;let n=0;download(CombMg.csv(active.context.taxa.map((t,i)=>{n+=t.n;return {...t,rank:i+1,percent:100*t.n/active.records.length,cumulative_percent:100*n/active.records.length,denominator:active.context.denominator}})),'comb-mg-pure-1cst-counts-and-references.csv','text/csv')};
 const dialog=make('dialog',null,panel),dialogBody=make('div',null,dialog),close=button('combMgDialogClose','Close',dialog);close.onclick=()=>dialog.close();
 stress.onclick=()=>{dialogBody.innerHTML='<h3>How closely does the 3D map preserve target distances?</h3><p>RMS relative distance error is</p><math display="block" xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mn>100</mn><mo>×</mo><msqrt><mrow><mfrac><mn>1</mn><mi>M</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>&lt;</mo><mi>j</mi></mrow><mrow/></munderover><msup><mrow><mo>(</mo><mfrac><mrow><msub><mi>d</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>−</mo><msub><mi>δ</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub></mrow><msub><mi>δ</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub></mfrac><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt><mo>%</mo></mrow></math><p>δ is the target distance between full normalized CAG profiles; d is their Euclidean distance in the saved 3D map. M is the number of unordered sample pairs. All pairs have positive targets. Smaller errors indicate closer distance approximation, not greater biological validity.</p><p>Each map used full metric MDS with SGD, inverse-squared target weights, one PCA start, seed 20261015 and 200 epochs. Best saved epoch: '+active?.map.bestEpoch+'. Convergence was not certified. The error refers to the full fitted population, including when only a cohort or identity group is visible.</p>';dialog.showModal()};
 named.onclick=()=>{dialogBody.replaceChildren();make('h3','Named views · comb-mg',dialogBody);const name=make('input');field('Name',name,dialogBody);const list=select('combMgNamedList','Saved view',namedViews.map((v,i)=>[String(i),v.name]),dialogBody);
  button('combMgSaveNamed','Save current view',dialogBody).onclick=()=>{if(!name.value.trim())return;persist();namedViews.push({name:name.value.trim(),identity,settings:{...s},cameras:JSON.parse(JSON.stringify(cameras))});persist();dialog.close()};
  button('combMgLoadNamed','Restore selected view',dialogBody).onclick=async()=>{const v=namedViews[Number(list.value)];if(!v||v.identity!==identity)return;CombMg.validate(data,v.settings);s={...defaults,...v.settings};cameras={...v.cameras};restoreControls();selectionHistory=['',s.specimen].filter((x,i,a)=>a.indexOf(x)===i);historyIndex=selectionHistory.length-1;currentFrame=null;dialog.close();await render()};dialog.showModal()};
 const pngOpen=installPngExportDialog($,async()=>{if(!active)throw Error('Wait for the saved map');return {data:plot.data,layout:{...plot.layout,scene:pngExportScene(plot,plot._fullLayout.scene._scene.getCamera())},
  width:Math.max(500,plot.clientWidth),height:Math.max(400,plot.clientHeight),title:$('sampleTitle').textContent,filename:'micove-comb-mg-'+active.key.replaceAll('|','-'),
  rows:[{text:representation.selectedOptions[0].textContent},{text:geometry.selectedOptions[0].textContent},{text:summary.textContent},{text:stress.textContent},{text:'Exploratory CAG compositions; not cell proportions. Identity and body-site holds remain.'}]}});
 $('viewExportClose').disabled=false;png.onclick=()=>pngOpen('samples');
 await render();
 window.addEventListener('pagehide',persist);
 document.title='MiCOVE — Combined metagenomes';
}
if(typeof window!=='undefined')window.showCombMgPopulation=showCombMgPopulation;
