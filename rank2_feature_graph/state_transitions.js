// Descriptive paired enrollment → follow-up counts, not treatment-effect estimates.
let stateTransitionMode=false;
function stateTransitionsAvailable(){return explorationAvailable()&&!!explorationMetadata()}
function stateTransitionsActive(){return stateTransitionMode&&stateTransitionsAvailable()}
function stateTransitionModel(groups,metadata,assignments){
 const arms=Object.keys(explorationArms),nodes=new Map(),edges=new Map(),totals=Object.fromEntries(arms.map(a=>[a,0]));
 const excluded={missingVisit:0,ambiguous:0,arm:0,state:0},seen=new Set();
 const ensure=id=>{if(!nodes.has(id))nodes.set(id,{id,enrollment:0,followup:0,origins:Object.fromEntries(arms.map(a=>[a,0]))});return nodes.get(id)};
 for(const g of groups){
  if(seen.has(g.key))continue;seen.add(g.key);
  if(g.ambiguous){excluded.ambiguous++;continue}
  if(g.enrollment&&assignments[g.enrollment.profile]!=null)ensure(assignments[g.enrollment.profile]).enrollment++;
  if(g.followup&&assignments[g.followup.profile]!=null)ensure(assignments[g.followup.profile]).followup++;
  if(!g.enrollment||!g.followup){excluded.missingVisit++;continue}
  const arm=metadata.records[g.enrollment.id]?.arm;
  if(!arms.includes(arm)||metadata.records[g.followup.id]?.arm!==arm){excluded.arm++;continue}
  const from=assignments[g.enrollment.profile],to=assignments[g.followup.profile];
  if(from==null||to==null){excluded.state++;continue}
  const a=ensure(from),b=ensure(to);a.origins[arm]++;totals[arm]++;
  const key=JSON.stringify([from,to]);if(!edges.has(key))edges.set(key,{key,from,to,counts:Object.fromEntries(arms.map(a=>[a,0]))});edges.get(key).counts[arm]++;
 }
 for(const e of edges.values())e.percent=Object.fromEntries(arms.map(a=>[a,nodes.get(e.from).origins[a]?100*e.counts[a]/nodes.get(e.from).origins[a]:null]));
 return {nodes:[...nodes.values()].sort((a,b)=>b.enrollment-a.enrollment||String(a.id).localeCompare(String(b.id))),edges:[...edges.values()],totals,excluded};
}
// Conditional multinomial maximum likelihood, one observed transition per woman.
// These are visit-to-visit probabilities, not a time-homogeneous process or causal effects.
function transitionWilson(count,total){
 if(!total)return null;
 const z=1.959963984540054,p=count/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
 return [Math.max(0,c-h),Math.min(1,c+h)];
}
function fitStateTransitions(model,stateIds){
 const states=[...new Set(stateIds)],lookup=new Map(model.edges.map(e=>[e.key,e])),origins=new Map(model.nodes.map(n=>[n.id,n.origins]));
 const arms=Object.fromEntries(Object.keys(model.totals).map(arm=>[arm,states.map(from=>{
  const total=origins.get(from)?.[arm]||0;
  const cells=states.map(to=>{const count=lookup.get(JSON.stringify([from,to]))?.counts[arm]||0;return {to,count,probability:total?count/total:null,interval:transitionWilson(count,total)}});
  if(cells.reduce((sum,c)=>sum+c.count,0)!==total)throw Error('Transition state catalogue does not cover all paired destinations');
  return {from,total,sparse:total>0&&total<10,cells};
 })]));
 return {method:'Conditional multinomial maximum likelihood',step:'Enrollment to recorded follow-up',interval:'95% pointwise Wilson score; not simultaneous',states,arms};
}
function stateTransitionTiming(groups,metadata){
 const result=Object.fromEntries(Object.keys(explorationArms).map(a=>[a,{days:[],missing:0,nonpositive:0,enrollmentPriorDose:0,enrollmentDoseUnknown:0}])),seen=new Set();
 for(const g of groups){if(seen.has(g.key)||g.ambiguous||!g.enrollment||!g.followup)continue;seen.add(g.key);
  const e=metadata.records[g.enrollment.id],f=metadata.records[g.followup.id],r=result[e?.arm];if(!r||f?.arm!==e.arm)continue;
  const start=e.date?Date.parse(e.date+'T00:00:00Z'):NaN,end=f.date?Date.parse(f.date+'T00:00:00Z'):NaN;
  if(!Number.isFinite(start)||!Number.isFinite(end))r.missing++;else{const days=(end-start)/86400000;if(days<=0)r.nonpositive++;r.days.push(days)}
  if(e.priorDoses==null)r.enrollmentDoseUnknown++;else if(e.priorDoses>0)r.enrollmentPriorDose++;
 }
 for(const r of Object.values(result)){r.days.sort((a,b)=>a-b);const n=r.days.length;r.min=n?r.days[0]:null;r.max=n?r.days[n-1]:null;r.median=n?(r.days[Math.floor((n-1)/2)]+r.days[Math.floor(n/2)])/2:null;r.known=n;delete r.days}
 return result;
}
function transitionEstimateText(cell,total){return total?`${(100*cell.probability).toFixed(1)}% [${(100*cell.interval[0]).toFixed(1)}–${(100*cell.interval[1]).toFixed(1)}%]`:'Unavailable (no paired starts)'}
function stateTransitionMatrix(fit,model,labels,arm,focus=''){
 // Omit states absent from both visits for readability; the full fitted catalogue is exported.
 const states=model.nodes.map(n=>n.id),rows=new Map(fit.arms[arm].map(r=>[r.from,r])),cell=30,left=130,top=105,width=Math.max(600,left+cell*states.length+30),height=top+cell*states.length+60;
 const marks=states.map((from,i)=>{const row=rows.get(from),cells=new Map(row.cells.map(c=>[c.to,c]));
  return `<text x="${left-7}" y="${top+i*cell+20}" text-anchor="end" font-size="11">${esc(labels.get(from).key)} · N=${row.total}${row.sparse?' *':''}</text>`+states.map((to,j)=>{const c=cells.get(to),p=c.probability,fill=p==null?'#d9dfe2':`rgb(${Math.round(248-220*p)},${Math.round(251-138*p)},${Math.round(252-120*p)})`,label=`${labels.get(from).name} → ${labels.get(to).name}; ${arm}: ${c.count}/${row.total}; ${transitionEstimateText(c,row.total)}${row.sparse?'; sparse starting state (N<10)':''}`;
   return `<g role="button" tabindex="0" data-transition-origin="${esc(from)}" aria-label="${esc(label)}"><title>${esc(label)}</title><rect x="${left+j*cell}" y="${top+i*cell}" width="${cell-1}" height="${cell-1}" fill="${fill}" stroke="${from===focus?'#ce8400':'#e2eaed'}"/><text pointer-events="none" x="${left+j*cell+cell/2}" y="${top+i*cell+20}" text-anchor="middle" font-size="10" fill="${p>.65?'white':'#183743'}">${p==null?'—':Math.round(100*p)}</text></g>`;
  }).join('');
 }).join('');
 const cols=states.map((id,j)=>`<text x="${left+j*cell+cell/2}" y="${top-10}" text-anchor="middle" font-size="10">${esc(labels.get(id).key)}</text>`).join('');
 return `<svg id="stateTransitionSvg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(arm)} one-step transition probabilities" style="font-family:Arial,sans-serif;fill:#183743"><rect width="100%" height="100%" fill="white"/><text x="16" y="24" font-size="16" font-weight="bold">${esc(arm)} · enrollment → recorded follow-up</text><text x="16" y="45" font-size="12">Rows: enrollment; columns: follow-up. Cells: probability (%), scale 0–100. Diagonal = same state.</text><text x="16" y="64" font-size="12">* N &lt; 10: sparse. Gray / —: no paired starts. Select a cell for both arms and 95% intervals.</text>${cols}${marks}<text x="16" y="${height-20}" font-size="12">One transition per participant. Unadjusted visit-to-visit probabilities; not causal or long-term predictions.</text></svg>`;
}
function stateTransitionCsv(fit,labels,q){
 const rows=[['coverage_target_percent','method','step','arm','from_state','from_name','to_state','to_name','count','paired_starts','probability','lower_95','upper_95','sparse_N_lt_10','interval_scope','interpretation']];
 for(const [arm,origins] of Object.entries(fit.arms))for(const r of origins)for(const c of r.cells)rows.push([q,fit.method,fit.step,arm,r.from,labels.get(r.from)?.name||r.from,c.to,labels.get(c.to)?.name||c.to,c.count,r.total,c.probability??'',c.interval?.[0]??'',c.interval?.[1]??'',r.sparse,fit.interval,'Descriptive complete-pair visit-to-visit probabilities; variable follow-up times; fixed data-derived state catalogue; not causal or validated long-term prediction']);
 return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
}
// Union membership is binary per vertex and woman, even when states overlap.
const vertexTransitionEvents=['retention','exit','entry'];
function fitVertexTransitions(model,cores,graph){
 const retained=new Set(cores),members=new Map(),names=new Map(graph.nodes.map(n=>[String(n.id),n.label]));
 for(const e of graph.edges){if(!retained.has(e.id))continue;for(const id of new Set([String(e.from),String(e.to)])){if(!members.has(id))members.set(id,new Set());members.get(id).add(e.id)}}
 const vertices=[...members].map(([id,states])=>{
  const arms=Object.fromEntries(Object.keys(model.totals).map(arm=>{
   let inside=0,stay=0,enter=0;for(const e of model.edges){const a=states.has(e.from),b=states.has(e.to),n=e.counts[arm];if(a)inside+=n;if(a&&b)stay+=n;if(!a&&b)enter+=n}
   const outside=model.totals[arm]-inside,cell=(count,total)=>({count,total,probability:total?count/total:null,interval:transitionWilson(count,total)});
   return [arm,{retention:cell(stay,inside),exit:cell(inside-stay,inside),entry:cell(enter,outside)}];
  }));
  return {id,name:(names.get(id)||id).replaceAll('_',' '),states:[...states],enrollment:model.nodes.filter(n=>states.has(n.id)).reduce((s,n)=>s+n.enrollment,0),arms};
 }).sort((a,b)=>b.enrollment-a.enrollment||a.name.localeCompare(b.name));
 return {vertices,totals:model.totals,excluded:model.excluded};
}
function vertexTransitionCsv(fit,q){
 const rows=[['coverage','vertex_id','vertex','incident_states','event','arm','count','denominator','probability','lower_95','upper_95','denominator_definition','interpretation']];
 for(const v of fit.vertices)for(const event of vertexTransitionEvents)for(const [arm,cells] of Object.entries(v.arms)){const c=cells[event];rows.push([q,v.id,v.name,v.states.join(';'),event,arm,c.count,c.total,c.probability??'',c.interval?.[0]??'',c.interval?.[1]??'',event==='entry'?'Paired women outside union at enrollment, same arm':'Paired women inside union at enrollment, same arm','One woman once within each vertex; unions overlap across vertices. Pointwise Wilson 95% intervals; not simultaneous or causal; fixed state assignments; complete pairs only; variable visit intervals and uncertain dose timing.'])}
 return rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
}
function vertexTransitionMatrix(fit,focus=''){
 const rows=fit.vertices.filter(v=>!focus||v.id===focus),arms=Object.keys(fit.totals),left=245,top=95,step=38,cw=87,width=left+6*cw+20,height=top+rows.length*step+65;
 const headings=arms.flatMap((a,k)=>vertexTransitionEvents.map((e,j)=>`<text x="${left+(k*3+j+.5)*cw}" y="75" text-anchor="middle" font-size="12">${e}</text>`)).join('');
 const marks=rows.map((v,i)=>`<text x="${left-8}" y="${top+i*step+24}" text-anchor="end" font-size="12"><title>${esc(v.name)}</title>${esc(v.name.length>36?v.name.slice(0,35)+'…':v.name)}</text>`+arms.flatMap((a,k)=>vertexTransitionEvents.map((e,j)=>{const c=v.arms[a][e],p=c.probability,x=left+(k*3+j)*cw,y=top+i*step;return `<g role="button" tabindex="0" data-transition-origin="${esc(v.id)}"><title>${esc(v.name)} · ${a} · ${e}: ${c.count}/${c.total}; ${transitionEstimateText(c,c.total)}</title><rect x="${x}" y="${y}" width="${cw-2}" height="${step-2}" fill="${p==null?'#ddd':`rgb(${248-220*p},${251-138*p},${252-120*p})`}"/><text pointer-events="none" x="${x+cw/2}" y="${y+24}" text-anchor="middle" font-size="12" fill="${p>.65?'white':'#183743'}">${p==null?'—':(100*p).toFixed(1)+'%'}</text></g>`})).join('')).join('');
 return `<svg id="stateTransitionSvg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Vertex union retention exit and entry by treatment arm" style="font-family:Arial,sans-serif;fill:#183743"><rect width="100%" height="100%" fill="white"/><text x="16" y="24" font-size="16">Vertex unions · enrollment → recorded follow-up</text>${arms.map((a,k)=>`<text x="${left+(k*3+1.5)*cw}" y="51" text-anchor="middle" font-size="14">${esc(a)}</text>`).join('')}${headings}${marks}<text x="16" y="${height-36}" font-size="12">Retention / exit: start inside union. Entry: start outside union. Unions overlap; rows are not distributions.</text><text x="16" y="${height-17}" font-size="12">Select a vertex for details. Gray / —: no eligible starts. Descriptive complete-pair analysis.</text></svg>`;
}
function renderVertexTransitions(model,bundle,q,timing){
 const fit=fitVertexTransitions(model,bundle.cohortAnalysis.merged[q].cores,bundle.data.graphs['100']);
 const old=typeof restoredTransitionFocus==='function'?restoredTransitionFocus(el('stateTransitionFocus').value):el('stateTransitionFocus').value;el('stateTransitionFocus').innerHTML='<option value="">All vertices</option>'+fit.vertices.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');el('stateTransitionFocus').value=fit.vertices.some(v=>v.id===old)?old:'';
 const focus=el('stateTransitionFocus').value,bayes=el('stateTransitionDisplay').value==='bayes';
 el('featurePanelTitle').textContent=q+'% vertex-union '+(bayes?'treatment comparison':'transitions');
 el('stateTransitionFocusLabel').textContent='Vertex';el('stateTransitionArm').disabled=true;
 for(const id of ['stateTransitionMinimum','stateTransitionLoops','stateTransitionSize','stateTransitionWidth'])el(id).closest('label').hidden=true;
 el('stateTransitions').querySelector('.transitionLegend').hidden=true;el('stateTransitionPlot').classList.add('probabilityMatrix');
 el('transitionBayesControls').hidden=!bayes;el('exportTransitionBayes').hidden=!bayes;el('exportTransitionModel').hidden=bayes;
 el('vertexTransitionMethods').hidden=false;
 if(bayes)return renderVertexTransitionBayes(fit,q,focus);
 el('stateTransitionNote').textContent=`${Object.values(model.totals).reduce((a,b)=>a+b,0)} paired women (${Object.entries(model.totals).map(([a,n])=>a+': '+n).join('; ')}). A vertex union contains all retained ${q}% 2-CSTs incident to that vertex. Retention = inside → inside; exit = inside → outside; entry = outside → inside. Each woman is counted once per vertex, but unions overlap across vertices. Retention + exit = 100% when estimable; entry has a different denominator. All eligible pairs are used, independently of the 3D selection.`;
 el('stateTransitionFitNote').textContent=`Separate binary membership transitions; probabilities equal observed n/N. 95% Wilson intervals are pointwise, not simultaneous across vertices or coverage. Sparse: fewer than 10 eligible starts. No eligible starts means unavailable, not zero. ${model.excluded.missingVisit} incomplete, ${model.excluded.ambiguous} ambiguous, ${model.excluded.arm} arm-unverified and ${model.excluded.state} unassigned participants excluded. ${Object.entries(timing).map(([a,t])=>a+': follow-up median '+t.median+' days, range '+t.min+'–'+t.max+'; '+t.missing+' missing dates.').join(' ')} Complete-pair selection, varying visit intervals and uncertain enrollment dose timing prevent causal interpretation. The 90% and 100% assignments coincide.`;
 el('stateTransitionPlot').innerHTML=vertexTransitionMatrix(fit,focus);
 el('stateTransitionTableNote').textContent='Observed counts and probability [95% pointwise interval]. Retention and exit share the inside-at-enrollment denominator; entry uses the outside-at-enrollment denominator. Vertex membership describes assigned states, not taxon abundance.';
 el('stateTransitionTable').innerHTML='<table><thead><tr><th>Vertex union</th><th>Event</th>'+Object.keys(model.totals).map(a=>`<th>${esc(a)}<br>n/N; probability [95% interval]</th>`).join('')+'</tr></thead><tbody>'+fit.vertices.filter(v=>!focus||v.id===focus).flatMap(v=>vertexTransitionEvents.map(event=>`<tr><td>${esc(v.name)}</td><td>${event}</td>${Object.keys(model.totals).map(a=>{const c=v.arms[a][event];return `<td>${c.count}/${c.total}<br>${transitionEstimateText(c,c.total)}${c.total>0&&c.total<10?'<br>Sparse support':''}</td>`}).join('')}</tr>`)).join('')+'</tbody></table>';
 stateTransitionFitted={fit,q,vertex:true};return true;
}

let stateTransitionFitted=null;

function stateTransitionPercent(value){return value==null?'—':value>0&&value<.1?'&lt;0.1%':value.toFixed(1)+'%'}
function stateTransitionSvg(model,labels,{minimum=1,focus='',loops=true,scale=1,width=1}={}){
 const nodes=model.nodes,lookup=new Map(),max=Math.max(1,...nodes.map(n=>n.enrollment)),r=260,c=380;
 nodes.forEach((n,i)=>{const angle=-Math.PI/2+2*Math.PI*i/nodes.length;lookup.set(n.id,{x:c+r*Math.cos(angle),y:c+r*Math.sin(angle),radius:n.enrollment?28*scale*Math.sqrt(n.enrollment/max):4})});
 const visible=model.edges.filter(e=>(loops||e.from!==e.to)&&(!focus||e.from===focus||e.to===focus)&&Object.values(e.counts).reduce((s,n)=>s+n,0)>=minimum);
 const defs=Object.entries(explorationArms).map(([arm,color],i)=>`<marker id="transitionArrow${i}" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L6,3 L0,6" fill="${color}"/></marker>`).join('');
 const paths=visible.flatMap(e=>Object.entries(explorationArms).map(([arm,color],i)=>{
  const n=e.counts[arm];if(!n)return '';
  const a=lookup.get(e.from),b=lookup.get(e.to);let d;
  if(e.from===e.to){const rr=a.radius+20+i*16;d=`M ${a.x-a.radius*.7} ${a.y-a.radius*.7} C ${a.x-rr*2} ${a.y-rr*2}, ${a.x+rr*2} ${a.y-rr*2}, ${a.x+a.radius*.7} ${a.y-a.radius*.7}`}
  else{const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,bend=18+i*14,mx=(a.x+b.x)/2-uy*bend,my=(a.y+b.y)/2+ux*bend;
   const da=Math.hypot(mx-a.x,my-a.y),db=Math.hypot(mx-b.x,my-b.y);
   d=`M ${a.x+(mx-a.x)*(a.radius+2)/da} ${a.y+(my-a.y)*(a.radius+2)/da} Q ${mx} ${my} ${b.x+(mx-b.x)*(b.radius+5)/db} ${b.y+(my-b.y)*(b.radius+5)/db}`;
  }
  const text=`${labels.get(e.from).name} → ${labels.get(e.to).name}; ${arm}: ${n}/${lookupOrigin(model,e.from,arm)} (${stateTransitionPercent(e.percent[arm])})`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".65" stroke-width="${width*(1+5*Math.sqrt(e.percent[arm]/100))}" marker-end="url(#transitionArrow${i})"><title>${esc(text)}</title></path>`;
 })).join('');
 const spheres=nodes.filter(n=>!focus||n.id===focus||visible.some(e=>e.from===n.id||e.to===n.id)).map(n=>{const p=lookup.get(n.id),label=labels.get(n.id),length=Math.hypot(p.x-c,p.y-c),lx=p.x+(p.x-c)*(p.radius+18)/length,ly=p.y+(p.y-c)*(p.radius+18)/length;return `<g class="transitionStateNode" role="button" tabindex="0" data-transition-origin="${esc(n.id)}" aria-label="Focus ${esc(label.key)}: ${esc(label.name)}" aria-pressed="${n.id===focus}">${n.id===focus?`<circle cx="${p.x}" cy="${p.y}" r="${p.radius+5}" fill="none" stroke="#172f40" stroke-width="3"/>`:""}<circle cx="${p.x}" cy="${p.y}" r="${p.radius}" fill="${n.enrollment?'url(#transitionNode)':'white'}" stroke="#576e79"><title>${esc(label.name)}; enrollment n=${n.enrollment}, follow-up n=${n.followup}; ${Object.keys(explorationArms).map(a=>a+': '+n.origins[a]).join('; ')}</title></circle><text x="${lx}" y="${ly}" text-anchor="middle" font-size="12" stroke="white" stroke-width="3" paint-order="stroke">${esc(label.key)} · ${n.enrollment}</text></g>`}).join('');
 return `<svg id="stateTransitionSvg" xmlns="http://www.w3.org/2000/svg" width="760" height="760" viewBox="0 0 760 760" role="group" aria-label="Enrollment to follow-up state transitions" style="font-family:Arial,sans-serif;fill:#183743"><rect width="100%" height="100%" fill="white"/><defs>${defs}<radialGradient id="transitionNode" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#b6cdd5"/><stop offset="1" stop-color="#526e79"/></radialGradient></defs>${paths}${spheres}</svg>`;
}
// Scale the complete drawing, independently of node area and transition width.
function sizeStateTransitionGraph(){
 const plot=el('stateTransitionPlot'),svg=plot?.querySelector('.transitionStateNode')?.ownerSVGElement;
 if(!svg||plot.classList.contains('probabilityMatrix'))return;
 const zoom=Number(el('stateTransitionZoom').value)/100;
 plot.style.setProperty('--transition-zoom',zoom);
 el('stateTransitionZoomValue').textContent=Math.round(zoom*100)+'%';
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(growStateTransitionPanel);
}
function growStateTransitionPanel(){
 if(typeof longitudinalActive==='function'&&longitudinalActive()){growLongitudinalPanel();return}
 const workspace=el('panelWorkspace'),panel=el('featurePanel'),plot=el('stateTransitionPlot');
 const expanded=stateTransitionsActive()&&el('stateTransitionDisplay').value==='graph'&&el('stateTransitionLevel').value==='states'&&Number(el('stateTransitionZoom').value)>100&&!panel.classList.contains('maximized');
 workspace.classList.toggle('transitionGraphExpanded',expanded);
 if(!expanded){workspace.style.removeProperty('--transition-panel-height');return}
 // Give the full graph room above the results table, without changing saved layout ratios.
 const height=plot.getBoundingClientRect().bottom-panel.getBoundingClientRect().top+panel.scrollTop+el('stateTransitions').scrollTop+16;
 workspace.style.setProperty('--transition-panel-height',Math.ceil(height)+'px');
}
function selectTransitionOrigin(event){
 const cell=event.target.closest('[data-transition-origin]');if(!cell)return;
 const id=cell.dataset.transitionOrigin;
 el('stateTransitionFocus').value=id;renderStateTransitions();
 if(event.type==='keydown'){
  const selected=[...el('stateTransitionPlot').querySelectorAll('[data-transition-origin]')].find(node=>node.dataset.transitionOrigin===id);
  selected?.focus();
 }
}
function lookupOrigin(model,id,arm){return model.nodes.find(n=>n.id===id).origins[arm]}
function renderStateTransitions(){
 const control=el('graphPanelModeControl');if(!control)return false;
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(growStateTransitionPanel);
 control.hidden=!stateTransitionsAvailable();el('graphPanelMode').value=stateTransitionsActive()?'transitions':'features';
 const box=el('stateTransitions');box.hidden=!stateTransitionsActive();if(box.hidden)return false;
 el('graphContent').hidden=true;el('cstSummary').hidden=true;el('namedGraphViews').hidden=true;
 if(typeof cstSummaryPanelLayoutSync==='function')cstSummaryPanelLayoutSync(false);
 const vertex=el('stateTransitionLevel').value==='vertices';
 const graphOption=el('stateTransitionDisplay').querySelector('option[value=graph]');graphOption.disabled=vertex;graphOption.hidden=vertex;
 if(vertex&&el('stateTransitionDisplay').value==='graph')el('stateTransitionDisplay').value='probabilities';
 el('vertexTransitionMethods').hidden=!vertex;
 el('stateTransitionZoom').closest('label').hidden=vertex||el('stateTransitionDisplay').value!=='graph';
 for(const id of ['transitionStateMethods','transitionStateBayesMethods'])el(id).hidden=vertex;
 el('exportTransitionModel').textContent=vertex?'Export vertex probabilities CSV':'Export complete probability model CSV';
 el('stateTransitionCsvDownload').hidden=true;stateTransitionFitted=null;transitionBayesCurrent=null;
 const q=el('coverage').value,bundle=datasetRegistry.get(META.id),assignments=bundle.cohortAnalysis?.merged?.[q]?.pairs;
 el('featurePanelTitle').textContent=q+'% 2-CST transitions';
 if(!assignments){el('stateTransitionNote').textContent='Merged assignments are unavailable at this coverage.';el('stateTransitionPlot').innerHTML='';el('stateTransitionTable').innerHTML='';return true}
 const groups=explorationIndex(participantData().records),model=stateTransitionModel(groups,explorationMetadata(),assignments);
 const fit=fitStateTransitions(model,bundle.cohortAnalysis.merged[q].cores),timing=stateTransitionTiming(groups,explorationMetadata());
 if(vertex)return renderVertexTransitions(model,bundle,q,timing);
 const coreKeys=new Map(bundle.cohortAnalysis.merged[q].cores.map((id,i)=>[id,'G'+(i+1)]));
 const labels=new Map(bundle.data.graphs['100'].edges.map((e,i)=>[e.id,{key:coreKeys.get(e.id)||'S'+(i+1),name:legendCstLabel(e.id,bundle,true,e.label||stateDisplayLabel(e.id))}]));
 model.nodes.forEach(n=>{if(!labels.has(n.id))labels.set(n.id,{key:String(n.id),name:String(n.id)})});
 const old=typeof restoredTransitionFocus==='function'?restoredTransitionFocus(el('stateTransitionFocus').value):el('stateTransitionFocus').value;el('stateTransitionFocus').innerHTML='<option value="">All states</option>'+model.nodes.map(n=>`<option value="${esc(n.id)}">${esc(labels.get(n.id).key+': '+labels.get(n.id).name)}</option>`).join('');el('stateTransitionFocus').value=labels.has(old)?old:'';
 const focus=el('stateTransitionFocus').value,minimum=Math.max(1,Number(el('stateTransitionMinimum').value)||1),loops=el('stateTransitionLoops').checked;
 const options={focus,minimum,loops,scale:Number(el('stateTransitionSize').value),width:Number(el('stateTransitionWidth').value)};
 const bayes=el('stateTransitionDisplay').value==='bayes';el('transitionBayesControls').hidden=!bayes;el('exportTransitionBayes').hidden=!bayes;el('exportTransitionModel').hidden=bayes;
 if(bayes)return renderTransitionBayes(fit,labels,q,focus);
 const matrix=el('stateTransitionDisplay').value==='probabilities',arm=el('stateTransitionArm').value;
 el('featurePanelTitle').textContent=q+'% 2-CST '+(matrix?'one-step probabilities':'transitions');
 el('stateTransitionArm').disabled=!matrix;el('stateTransitionFocusLabel').textContent=matrix?'Starting state':'Focus';
 for(const id of ['stateTransitionMinimum','stateTransitionLoops','stateTransitionSize','stateTransitionWidth']){el(id).disabled=matrix;el(id).closest('label').hidden=matrix}
 el('stateTransitions').querySelector('.transitionLegend').hidden=matrix;
 el('stateTransitionPlot').classList.toggle('probabilityMatrix',matrix);
 el('stateTransitionPlot').innerHTML=matrix?stateTransitionMatrix(fit,model,labels,arm,focus):stateTransitionSvg(model,labels,options);
 sizeStateTransitionGraph();
 stateTransitionFitted={fit,labels,q};
 const summaries=Object.entries(fit.arms).map(([a,rs])=>{const observed=rs.filter(r=>r.total),sparse=observed.filter(r=>r.sparse),t=timing[a];return `${a}: ${sparse.length}/${observed.length} starting states have fewer than 10 paired participants. Follow-up interval: median ${t.median??'unavailable'} days, range ${t.min??'—'}–${t.max??'—'}; ${t.missing} missing dates, ${t.nonpositive} nonpositive intervals.`});
 el('stateTransitionFitNote').textContent=`One-step model: enrollment → recorded follow-up. ${summaries.join(' ')} 95% intervals describe uncertainty for each probability separately, not simultaneous evidence across states or coverage levels. No paired starts means unavailable; an observed zero is not proof that a transition is impossible. The 90% and 100% SANTE assignments are identical.`;
 const rows=model.edges.filter(e=>(loops||e.from!==e.to)&&(!focus||e.from===focus||e.to===focus)&&Object.values(e.counts).reduce((a,b)=>a+b,0)>=minimum).sort((a,b)=>Object.values(b.counts).reduce((s,n)=>s+n,0)-Object.values(a.counts).reduce((s,n)=>s+n,0));
 const arms=Object.keys(explorationArms),N=Object.values(model.totals).reduce((a,b)=>a+b,0);
 el('stateTransitionNote').textContent=matrix?`${N} paired participants (${arms.map(a=>a+': '+model.totals[a]).join('; ')}). One enrollment → recorded follow-up per woman. Select a starting state for probabilities and 95% intervals in both arms. These are descriptive, not treatment-effect estimates.`:`${model.nodes.reduce((sum,n)=>sum+n.enrollment,0)} enrollment samples; ${N} paired participants (${arms.map(a=>a+': '+model.totals[a]).join('; ')}). One enrollment and one follow-up per participant. % = transition count / all paired women in the same starting state and arm. Width follows this percentage; node area follows all eligible enrollment samples, including those without follow-up. Hollow nodes have no enrollment samples. ${model.excluded.missingVisit} incomplete, ${model.excluded.ambiguous} ambiguous, ${model.excluded.arm} arm-unverified and ${model.excluded.state} unassigned participants excluded. All eligible pairs are used, independently of the 3D selection. Select a sphere or its label to focus on that state and its incoming and outgoing edges; choose All states to reset. Graph size enlarges the drawing and its area up to the panel width; maximize for more room. Filters hide edges without changing denominators. These are descriptive transitions, not treatment-effect estimates.`;
 const fitRows=Object.fromEntries(arms.map(a=>[a,new Map(fit.arms[a].map(r=>[r.from,r]))]));
 const tableRows=matrix&&focus?fit.states.map(to=>({from:focus,to})):matrix?model.edges.slice().sort((a,b)=>Object.values(b.counts).reduce((s,n)=>s+n,0)-Object.values(a.counts).reduce((s,n)=>s+n,0)):rows;
 el('stateTransitionTableNote').textContent=matrix?(focus?'All possible follow-up states for the selected starting state, including unobserved transitions.':'Observed transitions in both arms. Select a matrix cell or starting state to include zero-count destinations.'):'Visible graph edges. Filters do not change the fitted probabilities or intervals.';
 el('stateTransitionTable').innerHTML='<table><thead><tr><th>Enrollment → follow-up</th>'+arms.map(a=>`<th>${esc(a)}<br>n / N; probability [95% interval]</th>`).join('')+'</tr></thead><tbody>'+tableRows.map(e=>`<tr><td>${esc(labels.get(e.from).key+': '+labels.get(e.from).name)} → ${esc(labels.get(e.to).key+': '+labels.get(e.to).name)}</td>${arms.map(a=>{const r=fitRows[a].get(e.from),c=r.cells.find(c=>c.to===e.to);return `<td>${c.count} / ${r.total}<br>${transitionEstimateText(c,r.total)}${r.sparse?'<br><strong>Sparse starting state (N &lt; 10)</strong>':''}</td>`}).join('')}</tr>`).join('')+'</tbody></table>';
 return true;
}
function installStateTransitions(){
 if(!el('graphPanelMode'))return;
 el('exportTransitionBayes').onclick=exportTransitionBayes;
 for(const id of ['transitionBayesPrior','transitionBayesThreshold'])el(id).onchange=()=>renderStateTransitions();
 el('stateTransitionPlot').onclick=selectTransitionOrigin;
 el('stateTransitionPlot').onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-transition-origin]')){event.preventDefault();selectTransitionOrigin(event)}};
 el('stateTransitionZoom').oninput=sizeStateTransitionGraph;
 new ResizeObserver(growStateTransitionPanel).observe(el('stateTransitionPlot'));
 el('exportTransitionModel').onclick=()=>{if(!stateTransitionFitted)return;const {fit,labels,q,vertex}=stateTransitionFitted,url=URL.createObjectURL(new Blob([vertex?vertexTransitionCsv(fit,q):stateTransitionCsv(fit,labels,q)],{type:'text/csv'})),a=el('stateTransitionCsvDownload'),previous=a.href;a.href=url;a.download=META.id+'-'+q+(vertex?'-vertex-union-transitions.csv':'-one-step-transition-model.csv');a.textContent='Download '+q+'% model CSV';a.hidden=false;a.click();if(previous?.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(previous),60000)};
 el('graphPanelMode').onchange=()=>{stateTransitionMode=el('graphPanelMode').value==='transitions';graph();renderCountedSampleLegend()};
 el('vertexTransitionMethods').onclick=openVertexTransitionMethods;
 for(const id of ['stateTransitionLevel','stateTransitionDisplay','stateTransitionArm','stateTransitionFocus','stateTransitionMinimum','stateTransitionLoops','stateTransitionSize','stateTransitionWidth'])el(id).onchange=()=>renderStateTransitions();
}
