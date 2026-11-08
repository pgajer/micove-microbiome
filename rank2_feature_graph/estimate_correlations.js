// Correlations of saved estimate fields; never fit models or alter sample membership.
const estimateCorrelationViews=new WeakMap();
let estimateCorrelationShown=null,estimateCorrelationRequest=0;
function estimateCorrelationAsset(){return estimateAsset()?.correlations||null}
function estimateCorrelationState(){
 const asset=estimateAsset(),data=asset?.correlations;if(!data)return null;
 if(estimateCorrelationViews.has(asset))return estimateCorrelationViews.get(asset);
 const key='micove-estimate-correlations:'+asset.datasetId+'@'+data.revision;
 let saved={};try{saved=JSON.parse(localStorage.getItem(key))||{}}catch{}
 const groups=new Set(['all',...asset.categories.map(c=>c.id)]);
 const state={key,open:saved.open===true,k:[10,20,40,80].includes(saved.k)?saved.k:data.defaultK,
  unit:saved.unit==='participants'?'participants':'visits',method:saved.method==='pearson'?'pearson':'spearman',
  threshold:Number.isFinite(saved.threshold)?Math.max(0,Math.min(1,saved.threshold)):data.defaultThreshold,
  rows:groups.has(saved.rows)?saved.rows:'immune-markers',cols:groups.has(saved.cols)?saved.cols:'metabolites',
  search:typeof saved.search==='string'?saved.search:'',cluster:typeof saved.cluster==='string'?saved.cluster:'all'};
 if(!groups.has(state.rows))state.rows='all';if(!groups.has(state.cols))state.cols='all';
 estimateCorrelationViews.set(asset,state);return state;
}
function estimateCorrelationSave(){const s=estimateCorrelationState();if(s)try{localStorage.setItem(s.key,JSON.stringify(s))}catch{}}
function estimateCorrelationValue(bank,i,j){if(i===j)return 1;if(i>j)[i,j]=[j,i];const n=bank.featureIndices.length;return bank.correlations[i*n-i*(i+1)/2+j-i-1]}
function estimateCorrelationClusters(bank,threshold){
 const n=bank.featureIndices.length,parent=Array.from({length:n},(_,i)=>i),representatives=[...parent];
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 for(const [a,b,d] of bank.linkage){const left=representatives[a],right=representatives[b];if(d<=1-threshold+1e-14)parent[root(right)]=root(left);representatives.push(root(left))}
 const names=new Map();for(const i of bank.order){const r=root(i);if(!names.has(r))names.set(r,names.size+1)}
 return parent.map((_,i)=>names.get(root(i)));
}
function estimateCorrelationInstall(){
 if(el('estimateCorrelationPanel'))return;
 const style=document.createElement('style');style.textContent=`#estimateCorrelationPanel[hidden],#closeEstimateCorrelation[hidden]{display:none!important}#cataloguePanel.correlationDocked>:not(.panelHeader):not(#estimateCorrelationPanel){display:none!important}#cataloguePanel.correlationDocked>.panelHeader>:not(#catalogueTitle):not(#maximize-cataloguePanel):not(#closeEstimateCorrelation){display:none!important}#estimateCorrelationPanel{padding:10px;min-height:400px}#estimateCorrelationControls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:12px}#estimateCorrelationControls label{display:flex;align-items:center;gap:5px}#estimateCorrelationControls select,#estimateCorrelationControls input[type=search],#estimateCorrelationControls input[type=number],#estimateCorrelationControls button{font:inherit;min-height:29px;box-sizing:border-box}#estimateCorrelationControls input[type=number]{width:65px}#estimateCorrelationControls input[type=search]{width:180px}#estimateCorrelationPlot{width:100%;height:480px}#cataloguePanel.maximized #estimateCorrelationPlot{height:65vh;min-height:480px}#estimateCorrelationPanel p{font-size:12px;line-height:1.5}#estimateCorrelationPanel details{margin-top:8px}#estimateCorrelationAssignments{max-height:260px;overflow:auto}#estimateCorrelationAssignments table{font-size:12px;width:100%;border-collapse:collapse}#estimateCorrelationAssignments td,#estimateCorrelationAssignments th{padding:5px;border-bottom:1px solid #dae2e5;text-align:left}#estimateCorrelationAssignments button{font:inherit;text-align:left;border:0;background:transparent;color:#12657a;cursor:pointer}#estimateCorrelationMethods{width:min(860px,90vw);max-height:85vh;overflow:auto;font-size:15px;line-height:1.55}#estimateCorrelationMethods math{display:block math;margin:18px;font-size:1.15em}#estimateCorrelationPair{min-height:22px}`;
 document.head.appendChild(style);
 const panel=document.createElement('section');panel.id='estimateCorrelationPanel';panel.hidden=true;panel.setAttribute('aria-label','Estimate correlations');
 panel.innerHTML=`<details id="correlationSettings"><summary>Heatmap settings</summary><div id="estimateCorrelationControls">
 <label>Rows <select id="correlationRows" aria-label="Correlation row group"></select></label>
 <label>Columns <select id="correlationCols" aria-label="Correlation column group"></select></label>
 <label>Neighborhood <select id="correlationK" aria-label="Correlation neighborhood size">${[10,20,40,80].map(k=>`<option value="${k}">K = ${k} people</option>`).join('')}</select></label>
 <label>Correlation <select id="correlationMethod"><option value="spearman">Spearman</option><option value="pearson">Pearson</option></select></label>
 <label title="Average each participant’s visits first, then compare participants equally. Unchecked: keep all visits with equal total weight per participant."><input type="checkbox" id="correlationAverage"> Average visits per participant</label>
 <label title="Complete-linkage clusters: every pair has correlation at least this value. Filters below keep these joint clusters unchanged.">Minimum correlation <input type="number" id="correlationThreshold" min="0" max="1" step="0.05" value="0.7"></label>
 <label>Cluster <select id="correlationCluster" aria-label="Feature cluster"></select></label>
 <input type="search" id="correlationSearch" aria-label="Find row features" placeholder="Find row features…">
 </div></details><div class="correlationActions"><button type="button" id="correlationMethods">Methods…</button> <button type="button" id="correlationExport" disabled>Download results ZIP</button> <a id="correlationDownload" hidden>Download prepared ZIP</a></div>
 <p id="estimateCorrelationStatus" role="status" aria-live="polite"></p>
 <div id="estimateCorrelationPlot"></div><p>Correlations compare <b>saved estimates across the full LSVF reference</b>, independently of the 3D selection. Colors use −1 to +1; clipping and relative response colors do not affect the calculation. Feature clusters use all nonconstant fields jointly; group and search filters only change what is shown.</p>
 <p id="estimateCorrelationPair">Click a heatmap cell to inspect its two fields.</p>
 <details><summary>Feature clusters and transformations</summary><p>Click a feature to color the existing 3D samples by its estimate at this K. Samples, selection and embedding stay unchanged.</p><div id="estimateCorrelationAssignments"></div></details>
 <details><summary id="estimateCorrelationExcludedTitle">Excluded constant fields</summary><div id="estimateCorrelationExcluded"></div></details>`;
 el('cataloguePanel').appendChild(panel);
 const close=document.createElement('button');close.id='closeEstimateCorrelation';close.className='maximizePanel';close.type='button';close.textContent='Edge catalogue';close.hidden=true;el('catalogueTitle').after(close);
 close.onclick=()=>{estimateCorrelationState().open=false;estimateCorrelationSave();table()};
 for(const [id,key] of [['Rows','rows'],['Cols','cols'],['K','k'],['Method','method'],['Threshold','threshold'],['Cluster','cluster']])el('correlation'+id).onchange=()=>{
  const s=estimateCorrelationState(),v=el('correlation'+id).value;s[key]=['k','threshold'].includes(key)?Number(v):v;
  if(key==='threshold')s.threshold=Math.max(0,Math.min(1,Number.isFinite(s.threshold)?s.threshold:.7));
  if(['k','method','threshold'].includes(key))s.cluster='all';estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError);
 };
 el('correlationThreshold').oninput=()=>{const node=el('correlationThreshold');if(node.value!==''&&node.validity.valid)node.onchange()};
 el('correlationAverage').onchange=()=>{const s=estimateCorrelationState();s.unit=el('correlationAverage').checked?'participants':'visits';s.cluster='all';estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError)};
 el('correlationSearch').oninput=()=>{estimateCorrelationState().search=el('correlationSearch').value;estimateCorrelationSave();drawEstimateCorrelations().catch(estimateCorrelationError)};
 el('correlationMethods').onclick=estimateCorrelationMethods;
 el('correlationExport').onclick=()=>exportEstimateCorrelations().catch(estimateCorrelationError);
 el('estimateCorrelationAssignments').onclick=e=>{const b=e.target.closest?.('[data-correlation-feature]');if(b)estimateCorrelationSelect(Number(b.dataset.correlationFeature)).catch(estimateCorrelationError)};
}
function estimateCorrelationOpen(){const s=estimateCorrelationState();if(!s)return;const maximized=document.querySelector('.card.maximized');if(maximized&&maximized.id!=='cataloguePanel')el('maximize-'+maximized.id).click();s.open=true;estimateCorrelationSave();table();el('cataloguePanel').scrollIntoView({block:'nearest'})}
function syncEstimateCorrelationPanel(){
 const s=estimateCorrelationState(),active=!!s?.open;
 if(!active){if(el('estimateCorrelationPanel')){el('estimateCorrelationPanel').hidden=true;el('closeEstimateCorrelation').hidden=true;el('cataloguePanel').classList.remove('correlationDocked')}estimateCorrelationShown=null;return false}
 estimateCorrelationInstall();const hidden=el('estimateCorrelationPanel').hidden;
 el('estimateCorrelationPanel').hidden=false;el('closeEstimateCorrelation').hidden=false;el('cataloguePanel').classList.add('correlationDocked');
 el('catalogueTitle').textContent='Estimate correlations';
 // These two existing modes own the same dock; do not change their saved settings.
 el('cataloguePanel').classList.remove('heatmapDocked');
 if(hidden||estimateCorrelationShown?.asset!==estimateAsset())requestAnimationFrame(()=>drawEstimateCorrelations().catch(estimateCorrelationError));
 return true;
}
function estimateCorrelationError(error){if(el('estimateCorrelationStatus'))el('estimateCorrelationStatus').textContent='Correlations unavailable: '+error.message;console.error(error)}
async function drawEstimateCorrelations(){
 const asset=estimateAsset(),data=asset?.correlations,s=estimateCorrelationState();if(!data||!s.open)return;
 const request=++estimateCorrelationRequest;
 for(const id of ['Rows','Cols']){const node=el('correlation'+id);node.replaceChildren(...[{id:'all',label:'All groups'},...asset.categories].map(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.label+(g.id==='assay-availability'?' (diagnostics)':'');return o}));node.value=s[id.toLowerCase()]}
 el('correlationK').value=s.k;el('correlationMethod').value=s.method;el('correlationAverage').checked=s.unit==='participants';el('correlationThreshold').value=s.threshold;el('correlationSearch').value=s.search;
 el('correlationExport').disabled=true;el('correlationDownload').hidden=true;
 el('estimateCorrelationStatus').textContent='Loading saved correlations…';
 const descriptor=data.banks.find(b=>b.k===s.k&&b.unit===s.unit&&b.method===s.method);if(!descriptor)throw Error('This comparison is not installed.');
 const bank=await VME_ASSETS.group('correlation:'+asset.datasetId+':'+data.revision+':'+descriptor.id,{parts:[descriptor.http]});
 if(request!==estimateCorrelationRequest||estimateAsset()!==asset||!s.open)return;
 if(bank.revision!==data.revision||bank.catalogueRevision!==asset.revision||bank.sampleOrderSha256!==asset.sampleOrderSha256||bank.datasetId!==asset.datasetId)throw Error('Correlation data do not match this dataset.');
 const labels=estimateCorrelationClusters(bank,s.threshold),n=labels.length;
 const members=new Map();bank.order.forEach(i=>{const c=labels[i];if(!members.has(c))members.set(c,[]);members.get(c).push(i)});
 const relevant=[...members].filter(([,list])=>[s.rows,s.cols].every(group=>group==='all'||list.some(i=>data.fields[bank.featureIndices[i]].categoryId===group)));
 const clusters=el('correlationCluster');clusters.replaceChildren(...[['all','All clusters'],...relevant.map(([c,list])=>[String(c),'Cluster '+c+' · '+list.length+' fields'])].map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o}));if(s.cluster!=='all'&&!relevant.some(([c])=>c===Number(s.cluster)))s.cluster='all';clusters.value=s.cluster;
 const field=i=>data.fields[bank.featureIndices[i]],query=s.search.trim().toLowerCase();
 const matches=i=>(s.cluster==='all'||labels[i]===Number(s.cluster));
 const rows=bank.order.filter(i=>matches(i)&&(s.rows==='all'||field(i).categoryId===s.rows)&&(!query||(field(i).label+' '+field(i).transformationLabel).toLowerCase().includes(query)));
 const cols=bank.order.filter(i=>matches(i)&&(s.cols==='all'||field(i).categoryId===s.cols));
 const shown={asset,data,bank,descriptor,labels,rows,cols,state:{...s}};estimateCorrelationShown=shown;
 const names=items=>items.map(i=>field(i).label+' · '+field(i).transformationLabel);
 const x=names(cols),y=names(rows),z=rows.map(i=>cols.map(j=>estimateCorrelationValue(bank,i,j)));
 const palette=['#0072b2','#e69f00','#009e73','#cc79a7','#56b4e9','#d55e00','#6a51a3','#666666'];
 const traces=[{type:'heatmap',x,y,z,zmin:-1,zmax:1,colorscale:[[0,'#2166ac'],[.5,'#f7f7f7'],[1,'#b2182b']],colorbar:{title:{text:s.method==='spearman'?'Spearman ρ':'Pearson r'},thickness:12,len:.8},hoverongaps:false,hovertemplate:'%{y}<br>%{x}<br>Correlation: %{z:.4f}<extra></extra>'}];
 // Column strips identify feature groups and the global positive-correlation clusters.
 for(const [name,color,hover] of [
  ['Group',i=>palette[asset.categories.findIndex(g=>g.id===field(i).categoryId)%palette.length],i=>asset.categories.find(g=>g.id===field(i).categoryId)?.label],
  ['Cluster',i=>palette[(labels[i]-1)%palette.length],i=>'Cluster '+labels[i]]]){
  traces.push({type:'scatter',mode:'markers',x,y:cols.map(()=>name),yaxis:'y2',marker:{symbol:'square',size:Math.max(3,Math.min(16,el('estimateCorrelationPlot').clientWidth/Math.max(1,cols.length))),color:cols.map(color)},text:cols.map(i=>hover(i)+' · '+field(i).label),hovertemplate:'%{text}<extra></extra>',showlegend:false});
 }
 await Plotly.react(el('estimateCorrelationPlot'),traces,{margin:{l:rows.length<=35?100:50,r:80,t:10,b:cols.length<=30?155:45},
  xaxis:{type:'category',categoryorder:'array',categoryarray:x,showticklabels:cols.length<=30,tickvals:x,ticktext:cols.map(i=>field(i).label.length>36?field(i).label.slice(0,33)+'…':field(i).label),tickfont:{size:10},tickangle:-50,title:cols.length>30?'Column features (hover to identify)':''},
  yaxis:{type:'category',categoryorder:'array',categoryarray:y,autorange:'reversed',domain:[0,.88],showticklabels:rows.length<=35,tickvals:y,ticktext:rows.map(i=>field(i).label),title:rows.length>35?'Row features':''},
  yaxis2:{domain:[.92,1],anchor:'x',type:'category',categoryorder:'array',categoryarray:['Cluster','Group'],fixedrange:true},
  annotations:rows.length&&cols.length?[]:[{text:'No fields match these filters.',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false}],
  font:{size:11,color:'#25444f'},paper_bgcolor:'#ffffff',plot_bgcolor:'#eeeeee',showlegend:false,dragmode:'zoom'}, {responsive:true,displaylogo:false,toImageButtonOptions:{filename:'MiCOVE-estimate-correlations',format:'png'}});
 if(request!==estimateCorrelationRequest)return;
 const plot=el('estimateCorrelationPlot');plot.removeAllListeners?.('plotly_click');plot.on('plotly_click',event=>{
  const p=event.points?.[0];if(p?.curveNumber!==0||!Array.isArray(p.pointNumber))return;
  const [ri,ci]=p.pointNumber,i=rows[ri],j=cols[ci];if(i===undefined||j===undefined)return;
  const box=el('estimateCorrelationPair');box.replaceChildren(document.createTextNode(field(i).label+' ↔ '+field(j).label+': '+estimateCorrelationValue(bank,i,j).toFixed(4)+' · '));
  for(const [index,label] of [[i,'Color by row field'],[j,'Color by column field']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>estimateCorrelationSelect(bank.featureIndices[index]).catch(estimateCorrelationError);box.appendChild(b)}
 });
 el('estimateCorrelationStatus').textContent=`${rows.length} × ${cols.length} fields · K = ${s.k} nearest people · ${s.unit==='participants'?bank.participants.toLocaleString()+' participant means':bank.records.toLocaleString()+' visits'} · equal participant weights · ${members.size} joint clusters at correlation ≥ ${s.threshold}. ${bank.excluded.length} constant fields excluded.`;
 const visible=[...new Set([...rows,...cols])].sort((a,b)=>labels[a]-labels[b]||bank.order.indexOf(a)-bank.order.indexOf(b));
 el('estimateCorrelationAssignments').innerHTML='<table><thead><tr><th>Cluster</th><th>Feature</th><th>Group</th><th>Transformation</th></tr></thead><tbody>'+visible.map(i=>{const f=field(i);return `<tr><td>${labels[i]}</td><td><button type="button" data-correlation-feature="${bank.featureIndices[i]}">${esc(f.label)}</button></td><td>${esc(asset.categories.find(g=>g.id===f.categoryId)?.label||f.categoryId)}</td><td>${esc(f.transformationLabel)}</td></tr>`}).join('')+'</tbody></table>';
 el('estimateCorrelationExcludedTitle').textContent='Excluded constant fields · '+bank.excluded.length;
 el('estimateCorrelationExcluded').textContent=bank.excluded.map(e=>data.fields[e.featureIndex].label+' ('+data.fields[e.featureIndex].transformationLabel+')').join('; ');
 el('correlationExport').disabled=false;
}
async function estimateCorrelationSelect(index){
 const view=estimateCorrelationShown;if(!view||view.asset!==estimateAsset())return;
 const f=view.data.fields[index],seriesId=f.seriesIds[String(view.state.k)],m=estimateModel();if(!m.bySeries.has(seriesId))throw Error('Field not installed.');
 syncSampleColorOptions();el('sampleColorScheme').value='estimate:'+f.categoryId;m.choices[f.categoryId]=seriesId;estimateSave();
 // Recolor only: do not call sample selection, navigation or embedding functions.
 await recolorSampleView();
}
function estimateCorrelationMethods(){
 let dialog=el('estimateCorrelationMethods');if(!dialog){dialog=document.createElement('dialog');dialog.id='estimateCorrelationMethods';document.body.appendChild(dialog)}
 dialog.innerHTML='<button type="button" id="closeCorrelationMethods">Close</button> <button type="button" id="printCorrelationMethods">Print / save as PDF</button>'+estimateCorrelationMethodsHtml();
 el('closeCorrelationMethods').onclick=()=>dialog.close();
 el('printCorrelationMethods').onclick=()=>{const w=window.open('','_blank');if(w){w.document.write('<!doctype html><title>MiCOVE estimate correlation methods</title><style>body{max-width:50em;margin:3em auto;font:16px serif;line-height:1.5}math{display:block math;margin:20px}button{display:none}</style>'+estimateCorrelationMethodsHtml());w.document.close();w.print()}};
 dialog.showModal();
}
function estimateCorrelationMethodsHtml(){return `<h2>Which estimated responses vary together across microbiome profiles?</h2>
 <p>Each feature supplies one saved nearest-people estimate at every eligible query visit. The heatmap compares these fields within and between feature groups, using the same K for every feature. It does not compare raw assay measurements or the distances in the 3D embedding.</p>
 <h3>Visits or participant means</h3><p>Let a<sub>iv</sub> be a feature’s saved estimate for visit v of participant i, and m<sub>i</sub> the number of that participant’s visits. With the checkbox off, each visit receives weight 1/m<sub>i</sub>, so every participant has total weight one. With it on, first calculate the mean over each participant’s visits, then give every participant weight one.</p>
 <math><mrow><msub><mi>w</mi><mi>iv</mi></msub><mo>=</mo><mfrac><mn>1</mn><msub><mi>m</mi><mi>i</mi></msub></mfrac><mspace width="2em"/><msub><mover><mi>a</mi><mo>¯</mo></mover><mi>i</mi></msub><mo>=</mo><mfrac><mn>1</mn><msub><mi>m</mi><mi>i</mi></msub></mfrac><munder><mo>∑</mo><mi>v</mi></munder><msub><mi>a</mi><mi>iv</mi></msub></mrow></math>
 <h3>Correlation</h3><p>Pearson correlation measures agreement in linear variation. For two fields a and b, let ā and b̄ denote their weighted means, and let ℓ index visits or participant means. The numerator measures whether deviations tend to have the same sign; the denominator removes their units.</p>
 <math><mrow><mi>r</mi><mo>=</mo><mfrac><mrow><munder><mo>∑</mo><mi>ℓ</mi></munder><msub><mi>w</mi><mi>ℓ</mi></msub><mo>(</mo><msub><mi>a</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>a</mi><mo>¯</mo></mover><mo>)</mo><mo>(</mo><msub><mi>b</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>b</mi><mo>¯</mo></mover><mo>)</mo></mrow><msqrt><mrow><munder><mo>∑</mo><mi>ℓ</mi></munder><msub><mi>w</mi><mi>ℓ</mi></msub><msup><mrow><mo>(</mo><msub><mi>a</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>a</mi><mo>¯</mo></mover><mo>)</mo></mrow><mn>2</mn></msup><munder><mo>∑</mo><mi>ℓ</mi></munder><msub><mi>w</mi><mi>ℓ</mi></msub><msup><mrow><mo>(</mo><msub><mi>b</mi><mi>ℓ</mi></msub><mo>−</mo><mover><mi>b</mi><mo>¯</mo></mover><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mfrac></mrow></math>
 <p>Spearman correlation (default) uses weighted ranks instead of the original values. The rank of a value is the total weight below it plus half the total weight tied with it, divided by total weight. Apply the same weighted correlation formula to these ranks. This measures agreement in ordering, including nonlinear increasing relationships. For equally weighted participant means it is ordinary Spearman correlation with average ranks.</p>
 <p>+1 means perfect agreement, −1 means perfectly opposite patterns, and zero means no linear agreement (Pearson) or rank agreement (Spearman). A zero value does not rule out other relationships. Constant fields have undefined correlation and are excluded; they are never coded as zero correlation.</p>
 <h3>Positive-correlation clusters</h3><p>Use distance d = 1 − r and complete linkage: the distance between two clusters is the largest distance between any pair across them. Cut the hierarchy at 1 − t, where t is the selected minimum correlation. Every pair inside a cluster then has correlation at least t. These are descriptive feature groups, not sample clusters or statistical significance declarations. Negative correlations remain visible but do not join positive clusters.</p>
 <math><mrow><mi>d</mi><mo>(</mo><mi>A</mi><mo>,</mo><mi>B</mi><mo>)</mo><mo>=</mo><munder><mo>max</mo><mrow><mi>a</mi><mo>∈</mo><mi>A</mi><mo>,</mo><mi>b</mi><mo>∈</mo><mi>B</mi></mrow></munder><mo>(</mo><mn>1</mn><mo>−</mo><msub><mi>r</mi><mi>ab</mi></msub><mo>)</mo></mrow></math>
 <p>All nonconstant fields define one joint hierarchy for each K, correlation method and visit mode. Group, search and cluster filters only select which rows and columns to display. Cluster numbers are local to these settings and should not be compared across settings as stable identities.</p>
 <h3>Transformations and limitations</h3><p>One transformation per feature: phylotype relative abundance; metabolite log delivered signal; immune-marker median-scaled asinh; log bacterial load; reported lactic-acid concentration; clinical selected-sample proportion or numeric value; and assay-availability proportion. Exact transformations appear in the feature table and exported assignments. Lactic-acid uncorrected readings can be negative. Supplier imputations and substitutions remain.</p>
 <p>The current banks use the same 1,965 visits from 1,144 identified participants. No pairwise imputation, 3D selection restriction, color winsorization or relative-color transformation is applied. Shared training observations, smoothing, compositional constraints and assay handling can create correlation. This is not evidence of causality, independent biological modules, calibrated disease risk or end-to-end predictive validation. No independence-based p-values are provided.</p>
 <p>References: <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html" target="_blank" rel="noopener">Spearman correlation</a>; <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.cluster.hierarchy.linkage.html" target="_blank" rel="noopener">complete linkage</a>.</p>`}
function estimateCorrelationFiles(view){
 const {asset,data,bank,descriptor,labels,rows,cols,state}=view;
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv=rs=>rs.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
 const fields=data.fields,at=i=>fields[bank.featureIndices[i]],visible=new Set([...rows,...cols].map(i=>bank.featureIndices[i]));
 const indices=new Map(bank.featureIndices.map((f,i)=>[f,i])),excluded=new Map(bank.excluded.map(e=>[e.featureIndex,e.reason]));
 const assignments=[['feature_id','feature','group','transformation','transformation_id','series_id','cluster','shown_in_matrix','exclusion_reason'],...fields.map((f,i)=>[f.featureId,f.label,f.categoryId,f.transformationLabel,f.transformationId,f.seriesIds[String(bank.k)],indices.has(i)?labels[indices.get(i)]:'',visible.has(i),excluded.get(i)||''])];
 return [
  {name:'correlations.csv',text:csv([['row_feature_id',...cols.map(i=>at(i).featureId)],...rows.map(i=>[at(i).featureId,...cols.map(j=>estimateCorrelationValue(bank,i,j))])])},
  {name:'feature_clusters.csv',text:csv(assignments)},
  {name:'settings.json',text:JSON.stringify({datasetId:asset.datasetId,catalogueRevision:asset.revision,correlationRevision:data.revision,bankId:descriptor.id,bankSha256:descriptor.sha256,sampleOrderSha256:asset.sampleOrderSha256,records:bank.records,participants:bank.participants,settings:state,clustering:data.clustering,supportPolicy:data.supportPolicy},null,2)},
  {name:'methods.html',text:'<!doctype html><meta charset="utf-8"><title>MiCOVE estimate correlations</title><style>body{max-width:55em;margin:3em auto;line-height:1.5}math{display:block math;margin:20px}</style>'+estimateCorrelationMethodsHtml()},
  {name:'README.txt',text:'MiCOVE estimate correlations\n\ncorrelations.csv: the displayed row-by-column correlation matrix, using immutable feature IDs.\nfeature_clusters.csv: all catalogue features, their selected transformation/series, cluster number, visibility and exclusion reason. Constant fields have no cluster. Group/search filters do not recalculate clusters.\nsettings.json: K, participant/visit mode, method, threshold, display filters, counts and source checksums.\nmethods.html: formulas, definitions and limitations; open in a browser and print/save as PDF.\n\nValues are correlations of unclipped saved estimates, not raw measurement correlations or significance tests. All pairs have the same declared support. Cluster numbers are specific to the saved settings.\n'}
 ];
}
async function exportEstimateCorrelations(){
 const view=estimateCorrelationShown;if(!view||view.asset!==estimateAsset())return;
 el('correlationExport').disabled=true;
 try{const zip=await heatmapZip(estimateCorrelationFiles(view)),link=el('correlationDownload');if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);link.href=URL.createObjectURL(zip);link.download='MiCOVE-'+view.asset.datasetId+'-estimate-correlations-'+view.descriptor.id+'.zip';link.hidden=false;link.click()}
 finally{el('correlationExport').disabled=false}
}
