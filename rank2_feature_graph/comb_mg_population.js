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
 function taxonDisplay(context,coverage=80){
  const target=Number(coverage),targetCoverage=Number.isFinite(target)&&target>0?Math.min(100,target):80,taxa=[];let n=0;
  for(const t of context.taxa){taxa.push(t);n+=t.n;if(100*n+1e-10>=targetCoverage*context.sampleCount)break}
  return {taxa,n,names:new Set(taxa.map(t=>t.taxon)),targetCoverage,actualCoverage:100*n/context.sampleCount};
 }
 function taxonCoverageSetting(context,settings){
  if(Number(settings.taxonCoverage)>0)return String(Math.min(100,Number(settings.taxonCoverage)));
  // Preserve the colored states in older saved views that specified a count.
  if(Number(settings.topTaxa)>0){const n=context.taxa.slice(0,Number(settings.topTaxa)).reduce((sum,t)=>sum+t.n,0);return String(100*n/context.sampleCount)}
  return '80';
 }
 function stateRows(filtered,context,taxon){return taxon?filtered.filter(({i})=>context?.samples[i].taxon===taxon):filtered}
 function stateGraph(context,shown,xyz,filtered){
  const counts=new Map();for(const {i} of filtered){const t=context.samples[i].taxon;counts.set(t,(counts.get(t)||0)+1)}
  const maximum=context.taxa[0]?.n||1;
  return shown.taxa.map(t=>({...t,point:xyz[t.referenceIndex],fraction:t.n/context.sampleCount,
   radiusFraction:Math.sqrt(t.n/maximum),filteredCount:counts.get(t.taxon)||0}));
 }
 function localCoordinates(populationXYZ,payload,records,context,taxon){
  const indices=context.samples.flatMap((s,i)=>s.taxon===taxon?[i]:[]);
  if(JSON.stringify(payload.indices)!==JSON.stringify(indices)||payload.sampleIds.length!==indices.length||payload.xyz.length!==indices.length||
    indices.some((i,j)=>payload.sampleIds[j]!==records[i].sample_id)||payload.xyz.some(p=>p.length!==3||!p.every(Number.isFinite)))throw Error('Local fit membership or coordinate axis differs');
  const xyz=populationXYZ.slice();indices.forEach((i,j)=>{xyz[i]=payload.xyz[j]});return xyz;
 }
 function taxonHover(values){return '<br><b>Top 5 taxa · relative abundance</b>'+values.map(([t,f])=>'<br>'+escape(t.replaceAll('_',' '))+': '+(100*f).toFixed(2)+'%').join('')+'<br>% of in-scope taxonomically assigned reads';}
 function selection(s){return {stateTaxon:s.stateTaxon||'',specimen:s.specimen||''}}
 function csv(records){const fields=[...new Set(records.flatMap(Object.keys))];const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';return [fields,...records.map(r=>fields.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n'}
 async function bytes(d){
  if(!/^\/vme-assets\/[a-f0-9]{64}\.(json|f64\.gz|tsv\.gz)$/.test(d.url)||!d.url.includes(d.sha256))throw Error('Invalid CAG asset descriptor');
  const r=await fetch(d.url);if(!r.ok)throw Error('Could not load CAG asset: HTTP '+r.status);
  const b=await r.arrayBuffer();if(b.byteLength!==d.bytes)throw Error('Incomplete CAG asset');
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(h!==d.sha256)throw Error('CAG checksum differs; reload the page.');return b;
 }
 return {populations,constructions,representations,geometries,options,fractionLabel,denominator,ctValue,groups,groupColors,key,rows,validate,escape,csv,bytes,taxonDisplay,taxonCoverageSetting,stateRows,stateGraph,selection,localCoordinates,taxonHover};
})();
if(typeof module!=='undefined')module.exports=CombMg;
async function showCombMgPopulation(data,choices){
 const $=id=>document.getElementById(id),E=CombMg.escape,plot=$('samples'),panel=$('samplePanel'),side=$('sampleSidePanels');
 const storageKey='micove-comb-mg-'+data.revision,identity=data.sourceContractSha256;
 let saved={};try{const x=JSON.parse(localStorage.getItem(storageKey));if(x?.identity===identity)saved=x}catch{}
 const defaults={population:data.default.dataset,construction:data.default.construction,representation:data.default.representation,
  geometry:data.default.normalization+'|'+data.default.target_metric,cohort:'',group:'',color:'cohort',feature:'',specimen:'',size:'3',opacity:'0.75',
  taxonCoverage:null,stateTaxon:'',stateGraphLayout:'grid',stateGraphSize:'100',showReferences:true,sphereReferences:true,referenceSize:'100',referenceColor:'#d62728',referenceAmbient:'85',referenceHighlights:'18',referenceLabelSize:'12'};
 let s={...defaults,...saved.settings};
 try{CombMg.validate(data,s)}catch{s={...s,population:data.default.dataset,construction:data.default.construction,representation:data.default.representation,geometry:data.default.normalization+'|'+data.default.target_metric}}
 const available=CombMg.options(data);
 const style=document.createElement('style');style.textContent=`
 .combMg [hidden]{display:none!important}.combMg label{display:flex;flex-direction:column;gap:4px;margin:10px 0}.combMg select,.combMg input{max-width:100%;min-width:0}.combMg small{display:block;line-height:1.4}.combMg details{margin:10px 0;border-top:1px solid #d3e0e5;padding-top:8px}.combMg summary{font-weight:600;cursor:pointer}.combMg table{width:100%;font-size:12px;border-collapse:collapse}.combMg td,.combMg th{padding:4px;border-bottom:1px solid #e0e8eb;text-align:left;overflow-wrap:anywhere}#combMgLegend td:not(:first-child),#combMgLegend th:not(:first-child){white-space:nowrap;overflow-wrap:normal}.combMgNotice{padding:8px;background:#fff3d8;border-left:3px solid #d89b28;font-size:12px;line-height:1.4}.combMgStatus{padding:8px;line-height:1.45}.combMgSelected{font-weight:600;color:#a54500}#samplePanel.combMg{height:100%;min-height:520px}#samplePanel.combMg #sampleSidePanels{overflow:auto;flex:0 0 350px;padding:8px 12px;box-sizing:border-box}#samplePanel.combMg #sampleContent{display:flex;flex:1;min-height:0}#samplePanel.combMg #samples{position:relative;flex:1;min-width:120px;height:100%}#samplePanel.combMg #sampleInfoDivider{display:none}.combMg .sampleHeaderActions{flex-wrap:wrap}.combMg dialog{max-width:640px;max-height:85vh;overflow:auto}#samplePanel.combMgExpanded{position:fixed;inset:8px;z-index:1000;height:calc(100vh - 16px)}
 @media(max-width:900px){#samplePanel.combMg #sampleContent{flex-direction:column}#samplePanel.combMg #sampleSidePanels{flex:0 0 260px;width:auto;max-height:35vh}#samplePanel.combMg #samples{min-height:300px;height:auto}}
 #panelWorkspace.combMgWorkspace{display:grid!important;grid-template-columns:minmax(540px,1.5fr) minmax(330px,1fr);grid-template-rows:minmax(520px,1fr);gap:12px;overflow:auto}
 #panelWorkspace.combMgWorkspace>#samplePanel{grid-area:1/1;min-height:520px}
 #panelWorkspace.combMgWorkspace #sampleSidePanels{flex-basis:270px}
 #combMgGraphPanel{grid-area:1/2;display:flex;flex-direction:column;min-height:520px;padding:12px;overflow:auto;background:white}
 .combMgGraphHeader{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.combMgGraphHeader h2{flex:1;margin:0;font-size:16px}
 #combMgStateGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;overflow:auto;align-content:start;min-height:150px;flex:1;padding:4px}
 .combMgStateNode{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:5px;background:white;border:2px solid transparent;border-radius:8px;padding:10px 6px;cursor:pointer;color:#173846;overflow-wrap:anywhere;font:inherit}
 .combMgStateNode:hover,.combMgStateNode:focus-visible{background:#eef5f7;border-color:#b6cbd3}.combMgStateNode[aria-pressed=true]{border-color:#d55e00;background:#fff5e9}
 .combMgStateSphereSlot{display:flex;align-items:center;justify-content:center;min-height:78px;flex-shrink:0}
 .combMgStateSphere{display:block;border-radius:50%;background-color:var(--taxon-color);background-image:radial-gradient(circle at 32% 25%,rgba(255,255,255,.9) 0%,rgba(255,255,255,.25) 15%,transparent 40%,rgba(0,0,0,.45) 100%)}
 #combMgGraphStage{position:relative;flex:1;min-height:320px;width:100%}#combMgStatePlot{position:absolute;inset:0;width:100%;height:100%}.combMgGraphLabels{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4}.combMgGraphLabels svg{position:absolute;inset:0;pointer-events:none}.combMgGraphLabels line{stroke:#8b9da5;stroke-width:.8}.combMgGraphLabel{position:absolute;box-sizing:border-box;width:max-content;max-width:min(210px,calc(100% - 12px));padding:3px 5px;border:1px solid #d4e0e5;border-radius:4px;background:rgba(255,255,255,.95);color:#173846;font:11px/14px Arial,sans-serif;cursor:pointer;pointer-events:auto;text-align:center;white-space:normal;overflow-wrap:anywhere}.combMgGraphLabel span{display:block}.combMgGraphLabel small{font-size:10px;line-height:13px;white-space:nowrap}.combMgGraphLabel[aria-pressed=true]{background:#fff0d8;border-color:#d55e00}.combMgGraphLabel:hover,.combMgGraphLabel:focus-visible{outline:2px solid #517a8e;outline-offset:0}#combMgGraphLabelNote{font-size:12px;min-height:36px;margin:5px 0}#combMgGraphStatus{padding:8px 0;line-height:1.45;font-size:12px}
 #combMgGraphPanel.combMgExpanded{position:fixed;inset:8px;z-index:1000;min-height:0;height:calc(100vh - 16px)}
 @media(max-width:1200px){#panelWorkspace.combMgWorkspace{grid-template-columns:1fr;grid-template-rows:minmax(580px,1fr) minmax(480px,1fr)}#combMgGraphPanel{grid-area:2/1;min-height:480px}}
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
 const graphPanel=make('section',null,$('panelWorkspace'));graphPanel.id='combMgGraphPanel';graphPanel.className='card combMg';graphPanel.hidden=!data.taxonContext;
 if(data.taxonContext)$('panelWorkspace').classList.add('combMgWorkspace');
 const graphHeader=make('div',null,graphPanel);graphHeader.className='combMgGraphHeader';const graphTitle=make('h2','Pure 1-CST graph',graphHeader);graphTitle.id='combMgGraphTitle';
 const allStates=button('combMgAllStates','All states',graphHeader),graphMax=button('combMgGraphMaximize','⛶ Maximize',graphHeader);
 const graphStatus=make('div',null,graphPanel);graphStatus.id='combMgGraphStatus';graphStatus.setAttribute('role','status');
 const stateTaxon=select('combMgStateTaxon','Selected state',[['','All states']],graphPanel);
 const graphControls=details('Graph appearance',graphPanel);
 const stateGraphLayout=select('combMgStateGraphLayout','Graph layout',[['grid','Frequency grid'],['references','Observed reference samples · 3D']],graphControls);
 stateGraphLayout.title='Grid positions show frequency order, not biological distance. The 3D view uses the observed taxon-reference specimens in the current sample embedding; it does not fit a new graph layout.';
 const stateGraphSize=slider('combMgStateGraphSize','Sphere size',25,300,5,graphControls,'%');
 make('small','Sphere area is proportional to full-population state sample count. Colors identify the same pure states as Leading taxon coloring. No connections are inferred.',graphControls);
 const graphGrid=make('div',null,graphPanel);graphGrid.id='combMgStateGrid';graphGrid.setAttribute('aria-label','Pure 1-CST state spheres');
 const graphLabelNote=make('div',null,graphPanel);graphLabelNote.id='combMgGraphLabelNote';graphLabelNote.hidden=true;graphLabelNote.setAttribute('role','status');
 const graphStage=make('div',null,graphPanel);graphStage.id='combMgGraphStage';graphStage.hidden=true;
 const graphPlot=make('div',null,graphStage);graphPlot.id='combMgStatePlot';graphPlot.hidden=true;
 graphPanel.style.display=data.taxonContext?'':'none';
 const dataSection=$('dataControls'),controls=dataSection.querySelector('.sectionControls');
 const dataset=$('datasetSelect');dataset.disabled=false;dataset.value=data.id;for(const option of dataset.options)if(option.value===data.id)option.textContent='comb-mg';
 const datasetField=dataset.closest('label')||field('Dataset',dataset,document.createElement('div')).parentElement;
 controls.replaceChildren(datasetField);$('controlSections').replaceChildren(dataSection);dataSection.classList.add('combMg');
 const population=select('combMgPopulation','Population',available.populations,controls);
 const cohort=select('combMgCohort','Cohort',[['','All']],controls);
 const group=select('combMgGroup','Identity group',[['','All groups']],controls);
 const notice=make('p','Exploratory CAG compositions. Individual body-site and identity holds remain.',controls);notice.className='combMgNotice';
 make('small','Confirmed/inherited participant IDs and inferred links stay separate. No confirmed visit order is available; trajectories are not enabled.',controls);
 dataset.onchange=()=>{const u=new URL(location.href);u.searchParams.set('dataset',dataset.value);u.searchParams.delete('cohort');location.assign(u.href)};
 $('toggleControls').disabled=false;$('toggleControls').onclick=()=>{const close=$('explorerLayout').classList.toggle('controlsCollapsed');$('controlSections').hidden=close;requestAnimationFrame(()=>{Plotly.Plots.resize(plot);if(!graphPlot.hidden)Plotly.Plots.resize(graphPlot)})};
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
 const taxonCoverage=select('combMgTaxonCoverage','Pure 1-CST sample coverage',[],coloring),taxonNote=make('small',null,coloring);taxonNote.id='combMgTaxonNote';
 taxonCoverage.title='Choose the smallest set of the most frequent pure 1-CSTs covering at least this percentage of the full selected population. Actual coverage may exceed the target. Remaining samples stay gray; none are reassigned or removed. Equal-count states use their saved order.';
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
 make('p','Each point is a sample profile. States reaching 90% coverage have saved local fits when installed; selecting one loads its local map automatically. Remaining states use a labeled population-map subset. Cohort and identity filters restrict the current fit. The graph keeps population counts and reference positions. All states returns to the population map while preserving cohort and identity filters. Axes are not aligned across the '+Object.keys(data.maps).length+' independent fits.',methods);
 if(data.taxonContext)make('p','Leading taxon (raw reads) assigns each sample to its most abundant taxon: a pure taxon-level 1-CST. It uses all in-scope taxonomically assigned gene reads, including residual genes, regardless of the displayed CAG representation. States rank by sample count; the smallest set reaching the chosen sample-coverage target receives individual colors. Actual coverage may exceed the target because states are not split. The remaining samples stay gray and are not merged into retained states. Coverage refers to the full chosen population, not the filtered display or within-sample abundance. Taxon-count and leading-abundance ties use frozen feature order. Reference vertices mark observed samples with the largest taxon read fraction in the active fit: the selected pure state for local maps, or the full population otherwise. Ties use sample order. They are context markers, including when filtered out, and never add to sample counts. These are read fractions, not cell proportions.',methods);
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
 let active=null,serial=0,selectionHistory=[CombMg.selection({})],historyIndex=0,cameras=saved.cameras||{},namedViews=saved.namedViews||[],jsonCache=new Map(),matrixCache=null;
 let currentFrame=null,graphFrame=null,pickingInstalled=false,graphPickingInstalled=false;
 const graphLabels=CombMgGraphLabels.install({plot:graphPlot,host:graphStage,note:graphLabelNote,select:taxon=>selectState(taxon).catch(console.error),revision:()=>serial});
 new ResizeObserver(()=>{if(!graphPlot.hidden)Plotly.Plots.resize(graphPlot)}).observe(graphStage);
 const bindings={population,construction,representation,geometry,cohort,group,color,feature,specimen,size,opacity,taxonCoverage,stateTaxon,stateGraphLayout,stateGraphSize,showReferences,sphereReferences,referenceSize,referenceColor,referenceAmbient,referenceHighlights,referenceLabelSize};
 function restoreControls(){for(const [k,n] of Object.entries(bindings))if(n.type==='checkbox')n.checked=s[k];else if(n.tagName==='SELECT'){if([...n.options].some(o=>o.value===s[k]))n.value=s[k]}else n.value=s[k]}
 restoreControls();
 function rememberCamera(){const c=plot._fullLayout?.scene?._scene?.getCamera();if(c&&currentFrame)cameras[currentFrame]=JSON.parse(JSON.stringify(c));const g=graphPlot._fullLayout?.scene?._scene?.getCamera();if(g&&graphFrame&&!graphPlot.hidden)cameras[graphFrame]=JSON.parse(JSON.stringify(g))}
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
  if(active.taxonTop){const taxa=make('table',null,inspection);make('caption','Top 5 taxa · % of in-scope taxonomically assigned reads',taxa);for(const [taxon,fraction] of active.taxonTop.values[i]){const row=make('tr',null,taxa);make('td',taxon.replaceAll('_',' '),row);make('td',(100*fraction).toFixed(2)+'%',row)}}
  const top=make('table',null,inspection);make('caption','Largest values in the current normalized CAG table',top);
  for(const [j,value] of active.top[i]){const row=make('tr',null,top);make('td',fieldName(active.features[j]),row);make('td',value.toPrecision(5),row)}
 }
 function recordSelection(){const current=CombMg.selection(s);selectionHistory=selectionHistory.slice(0,historyIndex+1);if(JSON.stringify(selectionHistory.at(-1))!==JSON.stringify(current))selectionHistory.push(current);historyIndex=selectionHistory.length-1}
 function resetHistory(){selectionHistory=[CombMg.selection({})];historyIndex=0;recordSelection()}
 function selectSample(id,push=true){s.specimen=id;specimen.value=id;if(push)recordSelection();return render()}
 function selectState(taxon){if(taxon&&!active?.shown?.names.has(taxon))return Promise.resolve();s.stateTaxon=taxon;s.specimen='';recordSelection();return render()}
 async function drawStateGraph(model,attempt){
  const {context,shown,populationXYZ:xyz,filtered,key}=model;if(!context)return;
  const nodes=CombMg.stateGraph(context,shown,xyz,filtered);
  graphTitle.textContent='Pure 1-CST graph · '+Number(shown.targetCoverage.toFixed(2))+'% target';
  graphStatus.textContent=nodes.length+' states · '+shown.actualCoverage.toFixed(2)+'% actual coverage of '+context.sampleCount.toLocaleString()+' samples. '+
   (s.stateTaxon?'Selected: '+s.stateTaxon.replaceAll('_',' ')+'. ':'Click a sphere or its label to select a state. ')+
   'Counts and sphere areas use the full '+s.population+' population; selecting a state preserves the current cohort/identity filters. '+
   (s.stateGraphLayout==='grid'?'Grid order is by frequency; positions do not encode distances.':'Positions are observed reference specimens in the population MDS; no new fit is computed.');
  stateTaxon.replaceChildren(new Option('All states',''),...nodes.map(t=>new Option(t.taxon.replaceAll('_',' ')+' · '+t.n,t.taxon)));stateTaxon.value=s.stateTaxon;
  allStates.disabled=!s.stateTaxon;stateGraphSize._display();
  graphGrid.hidden=s.stateGraphLayout!=='grid';graphPlot.hidden=s.stateGraphLayout!=='references';graphStage.hidden=graphPlot.hidden;graphLabelNote.hidden=graphPlot.hidden;
  if(!graphGrid.hidden){graphLabels.set([],s.stateTaxon,false);graphGrid.style.gridTemplateColumns='repeat(auto-fit,minmax('+Math.max(140,72*Number(s.stateGraphSize)/100+24)+'px,1fr))';graphGrid.replaceChildren();for(const t of nodes){
   const b=button('',null,graphGrid);b.removeAttribute('id');b.className='combMgStateNode';b.dataset.taxon=t.taxon;
   b.setAttribute('aria-label','Select pure 1-CST '+t.taxon.replaceAll('_',' '));b.setAttribute('aria-pressed',String(s.stateTaxon===t.taxon));
   b.title=t.taxon.replaceAll('_',' ')+' · '+t.n+' samples ('+(100*t.fraction).toFixed(2)+'% of full population) · '+t.filteredCount+' within current cohort/identity filters';
   const slot=make('span',null,b);slot.className='combMgStateSphereSlot';slot.style.height=72*Number(s.stateGraphSize)/100+'px';
   const sphere=make('span',null,slot);sphere.className='combMgStateSphere';sphere.setAttribute('aria-hidden','true');sphere.style.setProperty('--taxon-color',trajectoryTaxonColor(t.taxon,{}));
   sphere.style.width=sphere.style.height=72*Number(s.stateGraphSize)/100*t.radiusFraction+'px';
   make('span',t.taxon.replaceAll('_',' '),b);make('small',t.n.toLocaleString()+' · '+(100*t.fraction).toFixed(2)+'%',b);
   b.onclick=()=>selectState(t.taxon).catch(console.error);
  }}else{
   const span=Math.max(...[0,1,2].map(j=>Math.max(...xyz.map(p=>p[j]))-Math.min(...xyz.map(p=>p[j]))))||1;
   for(const t of nodes)t.sphereRadius=span*.035*Number(s.stateGraphSize)/100*t.radiusFraction;
   const traces=nodes.map(t=>({...vertexSphereMesh(t.point,t.sphereRadius,{ambient:85,highlights:18}),
    color:trajectoryTaxonColor(t.taxon,{}),meta:{graphSphere:t.taxon},text:E(t.taxon.replaceAll('_',' '))+'<br>'+t.n+' samples · '+(100*t.fraction).toFixed(2)+'%<br>'+t.filteredCount+' within current filters<br>Reference specimen: '+E(t.referenceSample),hovertemplate:'%{text}<extra></extra>',showlegend:false}));
   const chosen=nodes.find(t=>t.taxon===s.stateTaxon);if(chosen)traces.push({type:'scatter3d',mode:'markers',x:[chosen.point[0]],y:[chosen.point[1]],z:[chosen.point[2]],marker:{symbol:'circle-open',size:22,color:'#d55e00',line:{width:3}},hoverinfo:'skip',showlegend:false});
   const frame='graph|'+key;
   await Plotly.react(graphPlot,traces,{margin:{l:0,r:0,t:0,b:0},showlegend:false,uirevision:frame,scene:{aspectmode:'data',camera:cameras[frame]||{projection:{type:'orthographic'}},annotations:[],xaxis:{visible:false},yaxis:{visible:false},zaxis:{visible:false}}},{responsive:true,displayModeBar:false,displaylogo:false});
   if(attempt!==serial)return;graphFrame=frame;graphLabels.set(nodes,s.stateTaxon,true);
   if(!graphPickingInstalled){installAgpGraphPicking(graphPlot,item=>selectState(item.id).catch(console.error),()=>serial);graphPlot.on('plotly_relayout',persist);graphPickingInstalled=true}
  }
 }
 resetHistory();
 async function render(){
  rememberCamera();const attempt=++serial;const selected={...s},key=CombMg.key(selected),map=CombMg.validate(data,selected),table=data.tables[map.table];
  active=null;graphLabels.suspend();for(const n of [exportCSV,exportFeatures,accountingCSV,taxonCSV,png,stateTaxon,allStates])n.disabled=true;
  for(const b of graphGrid.querySelectorAll('button'))b.disabled=true;graphPlot.style.pointerEvents='none';
  summary.textContent='Loading the matching saved map…';plot.style.visibility='hidden';
  try{
   const [records,features,populationXYZ,top,context,taxonTop]=await Promise.all([json(data.samples[selected.population]),json(table.features),json(map.coordinates),json(table.top),data.taxonContext?.[selected.population]?json(data.taxonContext[selected.population]):null,data.taxonTop?.[selected.population]?json(data.taxonTop[selected.population]):null]);
   let xyz=populationXYZ;
   if(attempt!==serial)return;
   if(records.length!==xyz.length||records.length!==table.samples||features.length!==table.featureCount)throw Error('CAG axes do not match');
   if(context&&(context.samples.length!==records.length||context.samples.some((r,i)=>r.sample_id!==records[i].sample_id)))throw Error('Taxon annotation sample axis differs');
   if(s.color==='taxon'&&!context){s.color='cohort';color.value=s.color}
   if(context){s.taxonCoverage=CombMg.taxonCoverageSetting(context,s);delete s.topTaxa}
   const shown=context?CombMg.taxonDisplay(context,s.taxonCoverage):null;
   let selectionNote='';if(s.stateTaxon&&!shown?.names.has(s.stateTaxon)){selectionNote='The previous state is outside the selected coverage; showing all states. ';s.stateTaxon=s.specimen='';resetHistory()}
   const local=s.stateTaxon?data.localFits?.[key]?.[s.stateTaxon]:null;
   let fitXYZ=populationXYZ;
   if(local){const payload=await json(local.coordinates);if(attempt!==serial)return;xyz=CombMg.localCoordinates(populationXYZ,payload,records,context,s.stateTaxon);fitXYZ=payload.xyz}
   const fittedMap=local||map,fittedCount=fitXYZ.length,frameKey=local?key+'|local|'+s.stateTaxon:key;
   if(taxonTop&&(taxonTop.sampleIds.length!==records.length||taxonTop.sampleIds.some((id,i)=>id!==records[i].sample_id)))throw Error('Taxon abundance sample axis differs');
   const targets=[10,20,30,40,50,60,70,80,90,95,99,100];
   if(shown&&!targets.includes(shown.targetCoverage))targets.push(shown.targetCoverage);
   taxonCoverage.replaceChildren(...targets.sort((a,b)=>a-b).map(q=>new Option((Number.isInteger(q)?q:q.toFixed(2))+'%'+(Number.isInteger(q)?'':' · saved view'),String(q))));
   if(shown)taxonCoverage.value=s.taxonCoverage;
   taxonCoverage.closest('label').hidden=taxonNote.hidden=!context;references.hidden=!context;
   const cohorts=[...new Set(records.map(r=>r.study))].sort();cohort.replaceChildren(new Option('All',''),...cohorts.map(x=>new Option(x||'Unclassified',x)));
   if(!cohorts.includes(s.cohort))s.cohort='';cohort.value=s.cohort;
   const groups=[...new Set(records.map(r=>r.exploratory_group))];group.replaceChildren(new Option('All groups',''),...groups.map(x=>new Option(CombMg.groups[x],x)));
   if(!groups.includes(s.group))s.group='';group.value=s.group;group.disabled=groups.length<2;
   fillFeatures(features);feature.closest('label').hidden=featureSearch.closest('label').hidden=s.color!=='feature';
   const filtered=CombMg.rows(records,s),visible=CombMg.stateRows(filtered,context,s.stateTaxon);specimen.replaceChildren(new Option('Choose a sample',''),...visible.map(({r})=>new Option(r.sample_id,r.sample_id)));
   if(!visible.some(({r})=>r.sample_id===s.specimen))s.specimen='';specimen.value=s.specimen;
   const featureIndex=features.findIndex(f=>f.feature===s.feature);let values=null;
   if(s.color==='feature'&&featureIndex>=0){summary.textContent='Loading exact feature values…';values=await matrix(table);if(attempt!==serial)return}
   const traces=[],counts=new Map();legend.replaceChildren();
   const hover=({r,i})=>'<b>'+E(r.sample_id)+'</b><br>'+E(r.study)+' · '+E(CombMg.groups[r.exploratory_group])+'<br>'+E(r.mapping_status||'Mapping unavailable')+
     '<br>Identity/body-site holds retained'+(context?'<br>Leading taxon: '+E(context.samples[i].taxon.replaceAll('_',' '))+' · '+(100*context.samples[i].fraction).toFixed(2)+'% of in-scope reads':'')+(taxonTop?CombMg.taxonHover(taxonTop.values[i]):top[i].map(([j,v])=>'<br>'+E(features[j].feature)+': '+v.toPrecision(4)).join(''));
   const points=new Map();if(s.color==='taxon'&&shown)for(const t of shown.taxa.filter(t=>!s.stateTaxon||t.taxon===s.stateTaxon))points.set(t.taxon.replaceAll('_',' '),{color:trajectoryTaxonColor(t.taxon,{}),rows:[]});
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
   referenceNote.textContent=referenceAvailable?'Observed maximum-abundance samples in '+(local?'the selected pure 1-CST':'the full '+s.population+' population')+'. Labels show actual raw-read fractions. References outside cohort/identity filters remain as context and are excluded from counts.':'Choose Leading taxon (raw reads) to display its reference vertices.';
   const annotations=[];
   if(show){const span=Math.max(...[0,1,2].map(j=>Math.max(...fitXYZ.map(p=>p[j]))-Math.min(...fitXYZ.map(p=>p[j]))))||1,diameter=5*Number(s.referenceSize)/100;
    (local?[local.reference]:shown.taxa.filter(t=>!s.stateTaxon||t.taxon===s.stateTaxon)).forEach((t,i)=>{const p=xyz[t.referenceIndex],label=t.taxon.replaceAll('_',' ')+' ('+(100*t.referenceFraction).toFixed(2)+'%)';
     const h=E(label)+'<br>Observed reference: '+E(t.referenceSample)+'<br>Maximum across '+fittedCount+' '+(local?'samples in this pure 1-CST':'population samples');
     annotations.push({x:p[0],y:p[1],z:p[2],text:label,ax:i%2?18:-18,ay:i%3? -18:18,xanchor:i%2?'left':'right',showarrow:true,arrowhead:0,arrowwidth:1,arrowcolor:'#78909c',bgcolor:'rgba(255,255,255,.8)',font:{size:Number(s.referenceLabelSize),color:'#173846'}});
     if(lit)traces.push({...vertexSphereMesh(p,diameter*span/600,{ambient:Number(s.referenceAmbient),highlights:Number(s.referenceHighlights)}),color:s.referenceColor,text:h,hovertemplate:'%{text}<extra></extra>',meta:{combMgReference:t.taxon},showlegend:false});
     else traces.push({type:'scatter3d',mode:'markers',x:[p[0]],y:[p[1]],z:[p[2]],marker:{size:diameter,color:s.referenceColor,symbol:'diamond'},text:[h],hovertemplate:'%{text}<extra></extra>',meta:{combMgReference:t.taxon},showlegend:false});
    });
   }
   const layout={margin:{l:0,r:values?80:0,t:0,b:0},showlegend:false,paper_bgcolor:'white',uirevision:frameKey,
    scene:{aspectmode:'data',camera:cameras[frameKey],annotations,xaxis:{visible:false},yaxis:{visible:false},zaxis:{visible:false}}};
   await Plotly.react(plot,traces,layout,{responsive:true,displaylogo:false,displayModeBar:false});if(attempt!==serial)return;
   currentFrame=frameKey;plot.style.visibility='visible';
   // A user can change a control while the first asset request is pending.
   // Install picking after the first completed render, including a replacement render.
   if(!pickingInstalled){installAgpGraphPicking(plot,item=>selectSample(item.id).catch(console.error),()=>serial);plot.on('plotly_relayout',()=>persist());pickingInstalled=true}
   const model={records,features,xyz,populationXYZ,top,taxonTop,visible,filtered,map,local,fittedMap,fittedCount,table,key,frameKey,context,shown};
   await drawStateGraph(model,attempt);if(attempt!==serial)return;active=model;stateTaxon.disabled=false;graphPlot.style.pointerEvents='';
   for(const n of [exportCSV,exportFeatures,accountingCSV,taxonCSV,png])n.disabled=false;
   denominatorNote.textContent=CombMg.denominator(selected,table);denominatorNote.hidden=!denominatorNote.textContent;
   $('sampleTitle').textContent='comb-mg · '+selected.population+' · '+selected.construction+(s.stateTaxon?' · Pure 1-CST: '+s.stateTaxon.replaceAll('_',' ')+(local?' · Local 3D MDS':' · Population fit subset'):'');
   stress.textContent='RMS relative error: '+fittedMap.rmsRelativeErrorPercent.toFixed(2)+'% (all pairs)'+(visible.length!==fittedCount?' · full fitted '+(local?'state':'population'):'');
   stress.title='Click for the definition. Error covers all pairs in the fitted '+(local?'pure 1-CST':'population')+', before cohort or identity filters.';
   summary.textContent=visible.length.toLocaleString()+' displayed sample profiles / '+fittedCount.toLocaleString()+' in this fit · '+features.length.toLocaleString()+' features. '+
    (s.stateTaxon?'Selected pure 1-CST: '+s.stateTaxon.replaceAll('_',' ')+'. ':'')+selectionNote+(s.group?CombMg.groups[s.group]+'. ':'')+'Exploratory; identity and body-site holds remain.';
   if(context)taxonNote.textContent='Target '+Number(shown.targetCoverage.toFixed(2))+'% · actual '+shown.actualCoverage.toFixed(2)+'% ('+shown.n.toLocaleString()+' / '+records.length.toLocaleString()+' samples) in the '+shown.taxa.length+' largest pure 1-CSTs of the full '+s.population+' population. '+(s.color==='taxon'?'Gray = other leading taxa. ':'This coverage controls the pure 1-CST graph. ')+(s.stateTaxon?'Showing the selected state within the current filters. ':'All filtered samples stay plotted. ')+'Legend n and % count displayed samples; reference markers are excluded.';
   const legendTable=make('table',null,legend),head=make('tr',null,make('thead',null,legendTable));for(const t of ['Category','n','%','c%'])make('th',t,head);const body=make('tbody',null,legendTable);let cumulative=0;
   for(const [label,v] of counts){cumulative+=v.n;const row=make('tr',null,body),name=make('td',null,row);if(v.color){const sw=make('span','■ ',name);sw.style.color=v.color}name.append(document.createTextNode(label));make('td',String(v.n),row);make('td',(100*v.n/Math.max(visible.length,1)).toFixed(2),row);make('td',(100*cumulative/Math.max(visible.length,1)).toFixed(2),row)}
   featureInfo.hidden=s.color!=='feature';
   featureInfo.textContent=featureIndex<0?'Choose a feature to inspect or color. Feature identities are specific to this population and construction.':fieldName(features[featureIndex])+'. '+(features[featureIndex].kind==='CAGC'?'Disjoint CAG.':'Residual accounting category; not a coherent CAG.')+' Values are CAG compositions, not taxon or cell proportions.';
   abundanceLink.href=table.download.url;abundanceLink.download='comb-mg-'+map.table.replaceAll('|','-')+'.tsv.gz';
   rawLink.hidden=!table.rawDownload;if(table.rawDownload){rawLink.href=table.rawDownload.url;rawLink.download='comb-mg-'+map.table.replaceAll('|','-')+'-raw-counts.tsv.gz'}
   back.disabled=historyIndex===0;forward.disabled=historyIndex===selectionHistory.length-1;clear.disabled=!s.specimen&&!s.stateTaxon&&!s.cohort&&!s.group;
   inspect();persist();
  }catch(error){if(attempt===serial){summary.textContent='Unable to show this map: '+error.message;plot.style.visibility='hidden';active=null}throw error}
 }
 function run(){render().catch(error=>console.error(error))}
 for(const [k,n] of Object.entries(bindings)){const handler=()=>{getSettings();if(k==='specimen'){selectSample(s.specimen).catch(console.error);return}if(k==='stateTaxon'){selectState(s.stateTaxon).catch(console.error);return}if(['population','cohort','group'].includes(k))resetHistory();s.feature=feature.value;run()};n.onchange=handler;if(k.startsWith('reference')||k==='stateGraphSize')n.oninput=handler}
 featureSearch.oninput=()=>{if(active)fillFeatures(active.features)};
 clear.onclick=()=>{s.cohort=s.group=s.specimen=s.stateTaxon='';cohort.value=group.value=specimen.value='';selectSample('').catch(console.error)};
 allStates.onclick=()=>selectState('').catch(console.error);
 back.onclick=()=>{if(historyIndex>0){Object.assign(s,selectionHistory[--historyIndex]);run()}};
 forward.onclick=()=>{if(historyIndex+1<selectionHistory.length){Object.assign(s,selectionHistory[++historyIndex]);run()}};
 max.onclick=()=>{panel.classList.toggle('combMgExpanded');max.textContent=panel.classList.contains('combMgExpanded')?'Restore':'⛶ Maximize';requestAnimationFrame(()=>Plotly.Plots.resize(plot))};
 graphMax.onclick=()=>{graphPanel.classList.toggle('combMgExpanded');graphMax.textContent=graphPanel.classList.contains('combMgExpanded')?'Restore':'⛶ Maximize';if(!graphPlot.hidden)requestAnimationFrame(()=>Plotly.Plots.resize(graphPlot))};
 function download(raw,name,type){for(const old of downloadArea.querySelectorAll('a'))URL.revokeObjectURL(old.href);downloadArea.replaceChildren();const a=make('a','Download '+name,downloadArea);a.href=URL.createObjectURL(new Blob([raw],{type}));a.download=name;a.style.display='block';a.click()}
 exportCSV.onclick=()=>{if(!active)return;const records=active.visible.map(({r,i})=>({...r,x:active.xyz[i][0],y:active.xyz[i][1],z:active.xyz[i][2],map:active.frameKey,fitting_scope:active.local?'local pure 1-CST':'population',fit_sample_count:active.fittedCount,fit_rms_relative_error_percent:active.fittedMap.rmsRelativeErrorPercent,coordinate_metric:'euclidean',target_metric:active.map.targetMetric,
  ...(active.context?{leading_taxon_raw:active.context.samples[i].taxon,leading_taxon_raw_read_fraction:active.context.samples[i].fraction,leading_taxon_tie:active.context.samples[i].tied}:{}),
  ...(active.context?{pure_1cst_target_coverage_percent:active.shown.targetCoverage,pure_1cst_in_color_set:active.shown.names.has(active.context.samples[i].taxon)}:{}),selected_pure_1cst:s.stateTaxon,full_population_rms_relative_error_percent:active.map.rmsRelativeErrorPercent,source_contract_sha256:identity}));download(CombMg.csv(records),'comb-mg-displayed-samples.csv','text/csv')};
 exportFeatures.onclick=()=>active&&download(CombMg.csv(active.features),'comb-mg-feature-metadata.csv','text/csv');
 accountingCSV.onclick=async()=>{if(active?.table.accounting)download(CombMg.csv(await json(active.table.accounting)),'comb-mg-retained-read-accounting.csv','text/csv')};
 taxonCSV.onclick=()=>{if(!active?.context)return;let n=0;download(CombMg.csv(active.context.taxa.map((t,i)=>{n+=t.n;return {...t,rank:i+1,percent:100*t.n/active.records.length,cumulative_percent:100*n/active.records.length,denominator:active.context.denominator,target_coverage_percent:active.shown.targetCoverage,in_color_set:active.shown.names.has(t.taxon)}})),'comb-mg-pure-1cst-counts-and-references.csv','text/csv')};
 const dialog=make('dialog',null,panel),dialogBody=make('div',null,dialog),close=button('combMgDialogClose','Close',dialog);close.onclick=()=>dialog.close();
 stress.onclick=()=>{dialogBody.innerHTML='<h3>How closely does the 3D map preserve target distances?</h3><p>RMS relative distance error is</p><math display="block" xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mn>100</mn><mo>×</mo><msqrt><mrow><mfrac><mn>1</mn><mi>M</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>&lt;</mo><mi>j</mi></mrow><mrow/></munderover><msup><mrow><mo>(</mo><mfrac><mrow><msub><mi>d</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>−</mo><msub><mi>δ</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub></mrow><msub><mi>δ</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub></mfrac><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt><mo>%</mo></mrow></math><p>δ is the target distance between full normalized CAG profiles; d is their Euclidean distance in the saved 3D map. M is the number of unordered sample pairs. All pairs have positive targets. Smaller errors indicate closer distance approximation, not greater biological validity.</p><p>Each map used full metric MDS with SGD, inverse-squared target weights, one start ('+E(active?.local?active.local.settings.initialization:'PCA')+'), seed 20261015 and 200 epochs. Best saved epoch: '+active?.fittedMap.bestEpoch+'. Completing the epoch budget is not a convergence certificate. The error refers to all '+active?.fittedCount+' samples in the fitted '+(active?.local?'pure 1-CST':'population')+', before cohort/identity filters. Local fits choose the lower relative-error starting map from scaled PCA and scaled population coordinates.</p>';dialog.showModal()};
 named.onclick=()=>{dialogBody.replaceChildren();make('h3','Named views · comb-mg',dialogBody);const name=make('input');field('Name',name,dialogBody);const list=select('combMgNamedList','Saved view',namedViews.map((v,i)=>[String(i),v.name]),dialogBody);
  button('combMgSaveNamed','Save current view',dialogBody).onclick=()=>{if(!name.value.trim())return;persist();namedViews.push({name:name.value.trim(),identity,settings:{...s},cameras:JSON.parse(JSON.stringify(cameras))});persist();dialog.close()};
  button('combMgLoadNamed','Restore selected view',dialogBody).onclick=async()=>{const v=namedViews[Number(list.value)];if(!v||v.identity!==identity)return;CombMg.validate(data,v.settings);s={...defaults,...v.settings};cameras={...v.cameras};restoreControls();resetHistory();currentFrame=graphFrame=null;dialog.close();await render()};dialog.showModal()};
 const pngOpen=installPngExportDialog($,async()=>{if(!active)throw Error('Wait for the saved map');return {data:plot.data,layout:{...plot.layout,scene:pngExportScene(plot,plot._fullLayout.scene._scene.getCamera())},
  width:Math.max(500,plot.clientWidth),height:Math.max(400,plot.clientHeight),title:$('sampleTitle').textContent,filename:'micove-comb-mg-'+active.frameKey.replaceAll('|','-'),
  rows:[{text:representation.selectedOptions[0].textContent},{text:geometry.selectedOptions[0].textContent},{text:summary.textContent},...(s.color==='taxon'?[{text:taxonNote.textContent}]:[]),{text:stress.textContent},{text:'Exploratory CAG compositions; not cell proportions. Identity and body-site holds remain.'}]}});
 $('viewExportClose').disabled=false;png.onclick=()=>pngOpen('samples');
 await render();
 window.addEventListener('pagehide',persist);
 document.title='MiCOVE — comb-mg';
}
if(typeof window!=='undefined')window.showCombMgPopulation=showCombMgPopulation;
