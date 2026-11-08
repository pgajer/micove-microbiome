/* Aggregate association results live separately from exploratory sample/graph state. */
const associationView={active:false,level:'edge',coverage:'90',mode:'matched',cohort:'both',selected:null,filter:'',bank:null};
function validateAssociationBank(bank){
 const require=(ok,message)=>{if(!ok)throw Error('Association supplement: '+message)};
 require(bank?.version===1&&bank.dataset==='zapps-pressmat-v4'&&bank.outcome==='original-study-sptb'&&bank.window==='approved-enrollment'&&bank.annotation==='enrollment-merged-rank2','unsupported population or schema');
 require(JSON.stringify(Object.keys(bank.coverages).sort())===JSON.stringify(['60','70','80','90']),'expected four coverage levels');
 for(const q of ['60','70','80','90']){
  const r=bank.coverages[q],count=r.edges.length,nodes=new Set(r.nodes.map(n=>n.id));
  require(r.coverage===Number(q)&&r.actualCoverage>=Number(q)&&r.actualCoverage<=100,'coverage differs');
  require(count>0&&count<=10000&&new Set(r.edges.map(e=>e.id)).size===count&&nodes.size===r.nodes.length&&r.testFamilySize===count*2,'reference size differs');
  for(const key of ['graphId','partitionId','membershipSha256'])require(/^[a-f0-9]{64}$/.test(r[key]),'missing reference identity');
  require(JSON.stringify(Object.keys(r.cohorts).sort())===JSON.stringify(['PreSSMat','ZAPPS']),'cohort identity differs');
  for(const c of ['ZAPPS','PreSSMat']){
   for(const key of ['n','cases','matchedN','matchedCases'])require(r.cohorts[c][key]===bank.coverages['60'].cohorts[c][key],'population changes across coverage');
   const pop=r.cohorts[c],{n,cases,matchedN,matchedCases}=pop;require([n,cases,matchedN,matchedCases].every(Number.isInteger)&&n>0&&cases>=0&&cases<=n&&matchedN>=0&&matchedN<=n&&matchedCases>=0&&matchedCases<=matchedN&&matchedCases<=cases,'invalid cohort population');
   for(const mode of ['all','matched']){
    const rows=r.edges.map(e=>e.results[c][mode]);
    require(rows.every(x=>Number.isInteger(x.n)&&Number.isInteger(x.cases)&&x.cases>=0&&x.cases<=x.n&&Number.isFinite(x.expected)&&x.expected>=0&&x.expected<=x.n+1e-8),'invalid counts');
    require(rows.reduce((s,x)=>s+x.n,0)===(mode==='all'?n:matchedN)&&rows.reduce((s,x)=>s+x.cases,0)===(mode==='all'?cases:matchedCases)&&Math.abs(rows.reduce((s,x)=>s+x.expected,0)-(mode==='all'?cases:matchedCases))<1e-6,'counts do not reconcile');
   }
   for(const e of r.edges)require(nodes.has(e.from)&&nodes.has(e.to)&&e.from!==e.to,'unknown endpoint');
   if(r.vertices){
    require(r.vertices.length===nodes.size&&new Set(r.vertices.map(v=>v.id)).size===nodes.size&&r.vertexTestFamilySize===(bank.vertexMultiplicity?bank.vertexMultiplicity.familySize:2*nodes.size),'vertex reference size differs');
    for(const v of r.vertices){
     require(nodes.has(v.id),'unknown vertex');
     const incident=r.edges.filter(e=>e.from===v.id||e.to===v.id);
     require(v.incidentEdges.length===incident.length&&new Set(v.incidentEdges).size===incident.length&&incident.every(e=>v.incidentEdges.includes(e.id)),'incident states differ');
     for(const mode of ['all','matched'])for(const key of ['n','cases','expected'])require(Math.abs(v.results[c][mode][key]-incident.reduce((sum,e)=>sum+e.results[c][mode][key],0))<1e-6,'vertex union counts differ');
    }
   }
   for(const e of [...r.edges,...(r.vertices||[])]){
    const x=e.results[c].exact;
    require(typeof x.supported==='boolean'&&Number.isInteger(x.sets)&&x.sets>=0,'invalid support');
    for(const k of ['p','holm','by'])require(x[k]===null||(Number.isFinite(x[k])&&x[k]>=0&&x[k]<=1),'invalid probability');
    for(const k of ['logOR','low','high'])require(x[k]===null||Number.isFinite(x[k])||['Infinity','-Infinity'].includes(x[k]),'invalid log odds');
    if(x.supported)require(x.sets>0&&['p','holm','by','logOR','low','high'].every(k=>x[k]!==null),'incomplete supported test');
   }
  }
 }
 if(bank.vertexMultiplicity)validateVertexMultiplicity(bank,require);
 const hasJoint=Object.values(bank.coverages).some(r=>r.edges.some(e=>['ZAPPS','PreSSMat'].some(c=>'jointHolm' in e.results[c].exact||'jointBy' in e.results[c].exact)));
 require(!hasJoint||Boolean(bank.edgeMultiplicity),'joint edge values lack family provenance');
 if(bank.edgeMultiplicity)validateEdgeMultiplicity(bank,require);
 return bank;
}
function validateVertexMultiplicity(bank,require){
 const f=bank.vertexMultiplicity,groups=new Map();let raw=0;
 require(f.version===1&&f.scope==='all-coverages-unique-vertex-cohort'&&JSON.stringify(f.coverages)==='[60,70,80,90]','unknown vertex adjustment scope');
 for(const q of ['60','70','80','90']){
  require(Array.isArray(bank.coverages[q].vertices),'joint family requires all vertices');
  for(const v of bank.coverages[q].vertices)for(const c of ['ZAPPS','PreSSMat']){
   const x=v.results[c].exact,key=x.analysisId;require(/^[a-f0-9]{64}$/.test(key||''),'missing analysis identity');
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push({q:Number(q),id:v.id,name:v.name,c,x});raw++;
  }
 }
 const m=groups.size;
 require(f.familySize===m&&f.displayedTests===raw&&f.duplicateTests===raw-m,'joint vertex family size differs');
 require(f.unavailableTests===[...groups.values()].filter(g=>!g[0].x.supported).length,'unavailable test count differs');
 for(const entries of groups.values()){
  const first=entries[0],qs=entries.map(e=>e.q).sort((a,b)=>a-b);
  require(new Set(qs).size===qs.length,'duplicate analysis within coverage');
  for(const e of entries){
   require(e.id===first.id&&e.name===first.name&&e.c===first.c&&['supported','sets','logOR','low','high','p','holm','by'].every(k=>e.x[k]===first.x[k]),'identical analyses disagree');
   require(JSON.stringify(e.x.identicalCoverages)===JSON.stringify(qs),'identical coverage labels differ');
  }
 }
 const tests=[...groups.values()].map(g=>g[0].x).sort((a,b)=>(a.supported?a.p:1)-(b.supported?b.p:1));
 let holm=0,by=1;const harmonic=Array.from({length:m},(_,i)=>1/(i+1)).reduce((a,b)=>a+b,0);
 for(let i=0;i<m;i++){const x=tests[i];holm=Math.min(1,Math.max(holm,(m-i)*(x.supported?x.p:1)));if(x.supported)require(Math.abs(x.holm-holm)<1e-10,'joint Holm value differs')}
 for(let i=m-1;i>=0;i--){const x=tests[i];by=Math.min(by,(x.supported?x.p:1)*m*harmonic/(i+1),1);if(x.supported)require(Math.abs(x.by-by)<1e-10,'joint BY value differs')}
}
function validateEdgeMultiplicity(bank,require){
 const f=bank.edgeMultiplicity,tests=Object.values(bank.coverages).flatMap(r=>r.edges.flatMap(e=>['ZAPPS','PreSSMat'].map(c=>e.results[c].exact))),m=tests.length;
 require(f.version===1&&f.scope==='all-coverages-edge-cohort'&&JSON.stringify(f.coverages)==='[60,70,80,90]'&&f.deduplicated===false,'unknown joint edge scope');
 require(f.familySize===m&&m===140,'joint edge family size differs');
 require(f.unavailableTests===tests.filter(x=>!x.supported).length,'joint edge unavailable count differs');
 require(/^[a-f0-9]{64}$/.test(f.sourceSha256||''),'missing joint edge source identity');
 for(const x of tests)for(const k of ['jointHolm','jointBy'])require(x.supported?Number.isFinite(x[k])&&x[k]>=0&&x[k]<=1:x[k]===null,'invalid joint edge probability');
 tests.sort((a,b)=>(a.supported?a.p:1)-(b.supported?b.p:1));
 let holm=0,by=1;const h=Array.from({length:m},(_,i)=>1/(i+1)).reduce((a,b)=>a+b,0);
 for(let i=0;i<m;i++){const x=tests[i];holm=Math.min(1,Math.max(holm,(m-i)*(x.supported?x.p:1)));if(x.supported)require(Math.abs(x.jointHolm-holm)<1e-10,'joint edge Holm differs')}
 for(let i=m-1;i>=0;i--){const x=tests[i];by=Math.min(by,(x.supported?x.p:1)*m*h/(i+1),1);if(x.supported)require(Math.abs(x.jointBy-by)<1e-10,'joint edge BY differs')}
}
function associationHasJointEdges(){return associationView.level==='edge'&&Boolean(associationView.bank.edgeMultiplicity)}
function associationAdjustmentScope(){
 return associationView.level==='vertex'&&associationView.bank.vertexMultiplicity?'all-coverages-unique-vertex-cohort':'within-coverage';
}
function associationAdjustmentDescription(release){
 if(associationHasJointEdges())return 'Holm and Benjamini–Yekutieli (BY) are shown for two families: '+release.testFamilySize+' cohort–state tests at this coverage, and all '+associationView.bank.edgeMultiplicity.familySize+' cohort–state tests across 60%, 70%, 80% and 90%. Joint values reuse the saved report correction without deduplicating repeated edge tests. Unavailable tests count as p = 1 but display as unavailable. Neither family includes vertex tests, other outcomes or analysis branches. Filtering the table does not change either family.';
 if(associationAdjustmentScope()==='all-coverages-unique-vertex-cohort'){
  const f=associationView.bank.vertexMultiplicity;
  return 'Holm and Benjamini–Yekutieli (BY) adjustments use one family of '+f.familySize+' unique vertex–cohort analyses across 60%, 70%, 80% and 90% coverage. '+f.displayedTests+' displayed tests include '+f.duplicateTests+' repeated analyses, counted once using identical matched membership and model inputs. Unavailable tests count as p = 1. This family excludes edge tests, other outcomes and analysis branches.';
 }
 return 'Holm and Benjamini–Yekutieli (BY) adjustments use '+(associationView.level==='vertex'?'a separate vertex family':'the saved edge family')+' of '+associationFamily(release)+' cohort-'+(associationView.level==='vertex'?'vertex':'state')+' tests at this coverage. They do not cover searching across coverage levels, other outcomes or analyses.';
}
function associationNumber(x,digits=2){if(x===null||x===undefined||Number.isNaN(Number(x)))return 'Unavailable';if(Number(x)===Infinity)return '∞';if(Number(x)===-Infinity)return '−∞';if(Number(x)>0&&Number(x)<10**(-digits))return Number(x).toExponential(2);return Number(x).toLocaleString(undefined,{maximumFractionDigits:digits})}
function associationOR(x){return x===null?null:Math.exp(Number(x))}
function associationEffect(result,mode){
 if(mode==='matched')return result.exact.supported?Number(result.exact.logOR)/Math.LN2:null;
 const r=result.all;return r.n&&r.expected>0?Math.log2(r.cases/r.expected):null;
}
function associationColor(value){
 if(value===null||Number.isNaN(value))return '#a3abb0';
 const t=Math.min(1,Math.abs(value)/3),start=[222,226,228],end=value<0?[33,102,172]:[178,24,43];
 return '#'+start.map((v,i)=>Math.round(v+(end[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
function associationItems(release){return associationView.level==='vertex'?(release.vertices||[]):release.edges}
function associationFamily(release){return associationView.level==='vertex'?release.vertexTestFamilySize:release.testFamilySize}
function associationRows(release,cohorts,filter=''){
 const f=filter.toLowerCase();return associationItems(release).filter(e=>e.name.replaceAll('_',' ').toLowerCase().includes(f)).flatMap(e=>cohorts.map(c=>({edge:e,cohort:c,result:e.results[c]})));
}
function associationChoose(id){associationView.selected=id;renderAssociations();}
function syncAssociations(){
 if(typeof window==='undefined'||!window.VME_ASSOCIATIONS_INSTALLED)return;
 for(const [id,key] of [['associationLevel','level'],['associationCoverage','coverage'],['associationMode','mode'],['associationCohort','cohort'],['associationSearch','filter']])el(id).value=associationView[key];
 const supported=META.id==='zapps-pressmat-v4'&&!(typeof activeEmbeddingFamily!=='undefined'&&activeEmbeddingFamily);
 let error='';
 try{if(supported&&BUNDLE_PACK.associationResults?.[META.id])associationView.bank=validateAssociationBank(BUNDLE_PACK.associationResults[META.id])}catch(e){associationView.bank=null;error=e.message}
 if(!supported||!associationView.bank)associationView.active=false;
 el('associationEnable').checked=associationView.active;el('associationEnable').disabled=!supported||!associationView.bank;
 el('associationImport').disabled=!supported;
 el('associationAvailability').textContent=error||(!supported?'Enrollment association results are available for ZAPPS & PreSSMat.':!associationView.bank?'Load the separately supplied enrollment association supplement.':'One approved enrollment specimen per woman. Original study case designations.');
 document.body.classList.toggle('associationActive',associationView.active);
 el('associationWorkspace').hidden=!associationView.active;el('associationOptions').hidden=!associationView.active;
 if(typeof mountAssociationGraphControls==='function')mountAssociationGraphControls(associationView.active);
 if(associationView.active)renderAssociations();
 else if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
function associationGraph(release,cohort){
 const vertexMode=associationView.level==='vertex',chosen=release.vertices?.find(v=>v.id===associationView.selected);
 const nodes=release.nodes,positions=new Map(nodes.map((n,i)=>{const angle=2*Math.PI*i/nodes.length-Math.PI/2;return [n.id,{x:420+190*Math.cos(angle),y:335+250*Math.sin(angle)}]}));
 const edges=release.edges.map(e=>{
  const a=positions.get(e.from),b=positions.get(e.to),r=e.results[cohort],count=r[associationView.mode==='matched'?'matched':'all'].n,color=vertexMode?'#b6c2c7':associationColor(associationEffect(r,associationView.mode)),selected=vertexMode?chosen?.incidentEdges.includes(e.id):e.id===associationView.selected;
  const title=e.name.replaceAll('_',' ')+' · '+cohort+' · '+count+' women';
  return `<g class="${vertexMode?'':'associationEdge'}" ${vertexMode?'':`role="button" tabindex="0" aria-label="${esc(title)}" data-association-edge="${esc(e.id)}"`}><title>${esc(title)}</title>${selected?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#172f3b" stroke-width="9"/>`:''}<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="${selected?5:3}" ${count?'':'stroke-dasharray="5 4"'}/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="12"/></g>`;
 }).join('');
 const vertices=nodes.map(n=>{
  const p=positions.get(n.id),left=p.x<419,right=p.x>421,degree=release.edges.filter(e=>e.from===n.id||e.to===n.id).length,label=typeof taxonDisplayLabel==='function'?taxonDisplayLabel(n.name):n.name.replaceAll('_',' '),v=release.vertices?.find(v=>v.id===n.id),selected=vertexMode&&n.id===associationView.selected,color=vertexMode?associationColor(associationEffect(v.results[cohort],associationView.mode)):'#344e5a';
  const title=n.name.replaceAll('_',' ')+(vertexMode?' · '+v.results[cohort][associationView.mode==='matched'?'matched':'all'].n+' women · union of '+degree+' states':'');
  return `<g ${vertexMode?`class="associationVertex" role="button" tabindex="0" aria-label="${esc(title)}" data-association-edge="${esc(n.id)}"`:''}><title>${esc(title)}</title><circle cx="${p.x}" cy="${p.y}" r="${(vertexMode?7:3)+Math.sqrt(degree)*2}" fill="${color}" stroke="${selected?'#172f3b':'#617681'}" stroke-width="${selected?3:1}"/><text x="${p.x+(left?-18:right?18:0)}" y="${p.y+(left||right?5:p.y<335?-20:30)}" text-anchor="${left?'end':right?'start':'middle'}" font-size="20" fill="#183743">${esc(label)}</text></g>`
 }).join('');
 const pop=release.cohorts[cohort],matched=associationView.mode==='matched';
 return `<article class="associationGraphCard"><h3>${esc(cohort)}</h3><p>${matched?pop.matchedN:pop.n} women · ${matched?pop.matchedCases:pop.cases} cases${matched?' · original matched sets':''}</p><svg viewBox="-50 0 940 680" role="group" aria-label="${cohort} enrollment 2-CST association graph">${edges}${vertices}</svg></article>`;
}
function associationForest(edge,cohorts){
 const matched=associationView.mode==='matched',xmin=160,xmax=620,y0=42,scale=x=>xmin+(Math.max(-6,Math.min(6,x))+6)/12*(xmax-xmin);
 let svg=`<line x1="${scale(0)}" x2="${scale(0)}" y1="15" y2="${40+cohorts.length*52}" stroke="#647b85" stroke-dasharray="4 4"/>`;
 for(const [i,c] of cohorts.entries()){
  const y=y0+i*52,r=edge.results[c],x=associationEffect(r,associationView.mode);
  svg+=`<text x="8" y="${y+5}" font-size="15">${esc(c)}</text>`;
  if(x===null){svg+=`<text x="${xmin}" y="${y+5}" font-size="14">Unavailable: no informative matched sets or no women</text>`;continue}
  if(matched){const lo=Number(r.exact.low)/Math.LN2,hi=Number(r.exact.high)/Math.LN2;svg+=`<line x1="${scale(lo)}" x2="${scale(hi)}" y1="${y}" y2="${y}" stroke="#486574" stroke-width="3"/>`;if(lo < -6)svg+=`<text x="${xmin-15}" y="${y+5}">←</text>`;if(hi>6)svg+=`<text x="${xmax+4}" y="${y+5}">→</text>`;}
  svg+=Math.abs(x)>6?`<text x="${scale(x)-6}" y="${y+6}" font-size="22" fill="${associationColor(x)}">${x>0?'▶':'◀'}</text>`:`<circle cx="${scale(x)}" cy="${y}" r="6" fill="${associationColor(x)}" stroke="#344e5a"/>`;
 }
 const bottom=52+cohorts.length*52;
 for(const [x,label] of [[-6,'1/64'],[-3,'1/8'],[0,'1'],[3,'8'],[6,'64']])svg+=`<text x="${scale(x)}" y="${bottom}" text-anchor="middle" font-size="13">${label}</text>`;
 return `<svg class="associationForest" viewBox="0 0 680 ${bottom+18}" role="img" aria-label="Cohort comparison for ${esc(edge.name)}"><title>${matched?'Matched odds ratios and 95% exact confidence intervals':'Observed/expected case ratios'}; arrows indicate values outside the displayed scale.</title>${svg}</svg><small>${matched?`Matched odds ratio, ${associationView.level==='vertex'?'incident-state union':'state'} versus the rest · 95% exact confidence interval`:'Observed/expected cases · descriptive ratios, no confidence intervals'} · logarithmic axis. Arrows/triangles mark bounds/estimates outside 1/64–64; exact values appear below.</small>`;
}
function renderAssociations(){
 if(!associationView.active||!associationView.bank)return;
 const r=associationView.bank.coverages[associationView.coverage],cohorts=associationView.cohort==='both'?['ZAPPS','PreSSMat']:[associationView.cohort],matched=associationView.mode==='matched';
 const available=Boolean(r.vertices?.length);el('associationLevel').querySelector?.('option[value="vertex"]')?.toggleAttribute('disabled',!available);
 if(!available&&associationView.level==='vertex')associationView.level='edge';
 el('associationLevel').value=associationView.level;
 el('associationVertexAvailability').textContent=available?'Vertex unions count each woman once. A woman can belong to two different vertex unions; vertex counts do not sum to the cohort total.':'Vertex results require the extended association supplement.';
 const items=associationItems(r),vertexMode=associationView.level==='vertex',entity=vertexMode?'vertex':'state';
 if(!items.some(e=>e.id===associationView.selected))associationView.selected=items[0].id;
 const selected=items.find(e=>e.id===associationView.selected);
 el('associationTitle').textContent=`Enrollment associations · ${r.coverage}%-2-CSTs · ${vertexMode?'Vertex unions':'Edges'}`;
 el('associationScope').textContent=`Frozen pooled-enrollment reference · ${r.edges.length} states · core coverage ${associationNumber(r.actualCoverage)}% · all ${Object.values(r.cohorts).reduce((s,p)=>s+p.n,0).toLocaleString()} women assigned. Outcome: original study sPTB case designation. This is a selected case–control sample, not population pregnancy risk. The exploration cohort, coverage and sample filters do not apply here.`;
 if(typeof renderAssociationGraphs==='function')renderAssociationGraphs();
 else el('associationGraphs').innerHTML=cohorts.map(c=>associationGraph(r,c)).join('');
 el('associationScale').innerHTML=`<span class="associationGradient"></span> Blue: ${matched?'lower odds':'fewer cases than expected'} · midpoint: ${matched?'OR = 1':'O/E = 1'} · red: ${matched?'higher odds':'more cases than expected'}. Same scale in both cohorts, saturated at ≤1/8 and ≥8. Colors show estimates, not statistical significance. Gray: unavailable. ${vertexMode?'Vertex colors show incident-state union effects; edges are neutral context. Selected incident edges are outlined.':'Edge colors show state effects.'} Graph display controls match the main 2-CST panel. Sizes and fading use pooled enrollment counts; graph filters never change the tests.`;
 if(typeof associationGraphState!=='undefined'&&!associationGraphState.effectColors)el('associationScale').textContent='Association colors are off. Base vertex and edge colors apply; statistical estimates remain in the table and cohort comparison.';
 el('associationSelectedTitle').textContent=selected.name.replaceAll('_',' ');
 el('associationComparison').innerHTML=associationForest(selected,cohorts);
 const rows=associationRows(r,cohorts,associationView.filter);
 const headers=[vertexMode?'Vertex · incident-state union':'State','Cohort','Women','Cases','Controls','Cases %','Expected cases',matched?'Matched OR (95% CI)':'Observed / expected',...(matched?['Informative sets','p',vertexMode?'Holm p':'Holm p · this coverage',vertexMode?'BY p':'BY p · this coverage',...(associationHasJointEdges()?['Holm p · all four coverages','BY p · all four coverages']:[])]:[])];
 el('associationTable').innerHTML=`<table><caption>${matched?'Original informative matched-set subset':'All approved enrollment women'} · ${rows.length} cohort-${entity} rows</caption><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(({edge,cohort,result})=>{
  const v=result[matched?'matched':'all'],x=result.exact,estimate=matched?(x.supported?`${associationNumber(associationOR(x.logOR))} (${associationNumber(associationOR(x.low))}–${associationNumber(associationOR(x.high))})`:'Unavailable'):associationNumber(v.expected?v.cases/v.expected:null);
  const values=[cohort,v.n,v.cases,v.n-v.cases,v.n?associationNumber(100*v.cases/v.n):'—',associationNumber(v.expected),estimate,...(matched?[x.sets,...['p','holm','by',...(associationHasJointEdges()?['jointHolm','jointBy']:[])].map(k=>x.supported?associationNumber(x[k],4):'Unavailable')]:[])];
  return `<tr class="${edge.id===associationView.selected?'selected':''}"><th scope="row"><button data-association-edge="${esc(edge.id)}" aria-pressed="${edge.id===associationView.selected}">${esc(edge.name.replaceAll('_',' '))}</button></th>${values.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`;
 }).join('')}</tbody></table>`;
 el('associationMethod').textContent=matched?`Exact conditional ${vertexMode?'incident-state-union':'state'}-versus-rest odds ratios preserve original matched sets; expected cases sum each set’s ${vertexMode?'union':'state'} membership fraction. Counts use only that same matched subset (ZAPPS ${r.cohorts.ZAPPS.matchedN} women; PreSSMat ${r.cohorts.PreSSMat.matchedN}). ${associationAdjustmentDescription(r)} Zero/infinite odds and unbounded intervals are retained; unavailable tests are not zero effects.`:`Expected cases = women in the ${vertexMode?'incident-state union':'state'} × the cohort case fraction among all approved enrollment women. No hypothesis test or adjusted p-value is attached to this descriptive comparison. This population differs from the original informative matched-set subset.`;
 el('associationProvenance').textContent=`${r.status}\nRelease: ${r.sourceRelease}\nGraph: ${r.graphId}\nPartition: ${r.partitionId}\nEnrollment ledger SHA-256: ${r.membershipSha256}\n${vertexMode?'Vertex analysis: '+JSON.stringify({analysis:r.vertexAnalysis,multiplicity:associationView.bank.vertexMultiplicity||null})+'\n':''}${associationHasJointEdges()?'Edge joint adjustment: '+JSON.stringify(associationView.bank.edgeMultiplicity)+'\n':''}${Object.entries(r.sources).map(([name,hash])=>name+': '+hash).join('\n')}`;
 el('associationDetail').textContent='Selected '+entity+': '+selected.name.replaceAll('_',' ')+(vertexMode?' · Union of '+selected.incidentEdges.length+' incident states':'')+' · '+cohorts.map(c=>{const v=selected.results[c][matched?'matched':'all'],x=selected.results[c].exact;return c+': '+v.cases+' cases / '+v.n+' women; '+associationNumber(v.expected)+' expected'+(matched?'; OR '+(x.supported?associationNumber(associationOR(x.logOR))+' (95% CI '+associationNumber(associationOR(x.low))+'–'+associationNumber(associationOR(x.high))+')':'unavailable'):'')}).join(' · ');
 for(const button of el('associationWorkspace').querySelectorAll('[data-association-edge]')){
  button.onclick=()=>associationChoose(button.dataset.associationEdge);
  if(button.tagName.toLowerCase()==='g')button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();associationChoose(button.dataset.associationEdge)}};
 }
}
function associationCSV(){
 const r=associationView.bank.coverages[associationView.coverage],cohorts=associationView.cohort==='both'?['ZAPPS','PreSSMat']:[associationView.cohort],matched=associationView.mode==='matched';
 const header=['coverage','graph_id','partition_id','outcome','window','population',associationView.level==='vertex'?'vertex_id':'state_id',associationView.level==='vertex'?'vertex':'state','cohort','women','cases','controls','expected_cases','observed_expected','odds_ratio','ci_low','ci_high','informative_sets','p','holm_p','by_p','test_family_size','association_level','incident_state_ids','adjustment_scope','analysis_id','identical_coverages','joint_holm_p','joint_by_p','joint_test_family_size','joint_adjustment_scope'];
 const rows=associationRows(r,cohorts,associationView.filter).map(({edge,cohort,result})=>{const v=result[matched?'matched':'all'],x=result.exact;return [r.coverage,r.graphId,r.partitionId,associationView.bank.outcome,associationView.bank.window,matched?'original_matched_sets':'all_approved_enrollment',edge.id,edge.name,cohort,v.n,v.cases,v.n-v.cases,v.expected,v.expected?v.cases/v.expected:null,...(matched?[...['logOR','low','high'].map(k=>x.supported?associationOR(x[k]):null),x.sets,...['p','holm','by'].map(k=>x.supported?x[k]:null),associationFamily(r)]:Array(8).fill(null)),associationView.level,(edge.incidentEdges||[edge.id]).join(';'),matched?associationAdjustmentScope():null,matched?x.analysisId:null,matched?(x.identicalCoverages||[]).join(';'):null,...(matched&&associationHasJointEdges()?[x.supported?x.jointHolm:null,x.supported?x.jointBy:null,associationView.bank.edgeMultiplicity.familySize,associationView.bank.edgeMultiplicity.scope]:Array(4).fill(null))]});
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [header,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}
function installAssociations(){
 // The minimal legacy test fixture has no HTML parser; rendering is checked in a browser.
 if(typeof el('sampleControls')?.insertAdjacentHTML!=='function')return;
 el('stateControls').insertAdjacentHTML('afterend',`<details id="associationSection" class="controlSection" open><summary>Associations</summary><div class="sectionControls"><label><input id="associationEnable" type="checkbox"> Enrollment associations</label><small id="associationAvailability" role="status"></small><div id="associationOptions" hidden><label>Association level<select id="associationLevel"><option value="edge">Edges · 2-CSTs</option><option value="vertex">Vertices · incident-state unions</option></select></label><small id="associationVertexAvailability"></small><label>Largest 2-CSTs coverage<select id="associationCoverage"><option value="60">60%</option><option value="70">70%</option><option value="80">80%</option><option value="90" selected>90%</option></select></label><label>Compare cohorts<select id="associationCohort"><option value="both">Side by side</option><option>ZAPPS</option><option>PreSSMat</option></select></label><label>Show<select id="associationMode"><option value="matched">Exact matched odds ratios</option><option value="all">Observed / expected cases</option></select></label><small>Approved enrollment · original study case designation · frozen enrollment reference. Other outcomes, visits and annotations are not yet available.</small></div><button id="associationImport" type="button">Load association supplement…</button><input id="associationFile" type="file" accept="application/json,.json" hidden></div></details>`);
 el('panelWorkspace').insertAdjacentHTML('beforebegin',`<section id="associationWorkspace" class="card" hidden aria-label="Enrollment association results"><div class="panelHeader"><h2 id="associationTitle"></h2><button id="associationClose" type="button">Return to exploration</button></div><p id="associationScope"></p><div id="associationGraphs"></div><p id="associationScale"></p><section class="associationComparisonCard"><h3 id="associationSelectedTitle"></h3><div id="associationComparison"></div><p id="associationDetail" role="status"></p></section><div class="associationTableControls"><label>Find a state or vertex <input id="associationSearch" type="search" placeholder="Phylotype name"></label><button id="associationExport" type="button">Export results CSV</button></div><p id="associationMethod"></p><div id="associationTable" tabindex="0" aria-label="Scrollable association results"></div><details><summary>Analysis status and source identities</summary><pre id="associationProvenance"></pre></details></section>`);
 const style=document.createElement('style');style.textContent=`
 body.associationActive #panelWorkspace{display:none!important}body.associationActive #sampleControls,body.associationActive #stateControls,body.associationActive #participantSection,body.associationActive #enrollmentExploreSection,body.associationActive #valenciaColorControls,body.associationActive #layoutControls,body.associationActive #dataControls label:has(#cohortSelect){display:none!important}
 #associationWorkspace{grid-column:2;grid-row:1;overflow:auto;min-width:0;max-height:calc(100vh - 28px)}#associationWorkspace[hidden],#associationOptions[hidden]{display:none!important}#associationWorkspace .panelHeader{flex-wrap:wrap}#associationClose{margin-left:auto}#associationScope{padding:10px;background:#edf4f5;border-left:4px solid #507987;font-size:13px}#associationGraphs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:12px}.associationGraphCard{border:1px solid #d1dce0;border-radius:6px;overflow:hidden}.associationGraphCard h3{margin:10px 14px 0}.associationGraphCard p{margin:0 14px;font-size:13px}.associationGraphCard svg{display:block;width:100%;height:auto;max-height:610px}.associationEdge,.associationVertex{cursor:pointer}.associationVertex:focus circle{stroke:#111;stroke-width:4}.associationEdge:focus{outline:none}.associationEdge:focus line:not(:last-child){stroke:#111;stroke-width:8}#associationScale,#associationMethod,#associationDetail{font-size:13px}.associationGradient{display:inline-block;width:130px;height:12px;background:linear-gradient(to right,#2166ac,#dee2e4,#b2182b);margin-right:8px}.associationComparisonCard{border:1px solid #d1dce0;border-radius:6px;padding:12px;margin:12px 0}.associationComparisonCard h3{margin:0}.associationForest{width:100%;max-width:740px;display:block}.associationTableControls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.associationTableControls input{max-width:220px}#associationTable{overflow:auto;max-height:540px}#associationTable table{font-variant-numeric:tabular-nums}#associationTable th,#associationTable td{white-space:nowrap}#associationTable tbody th{position:static;background:inherit;white-space:normal;min-width:200px}#associationTable button{border:0;background:transparent;text-align:left;padding:0;color:#12657e}#associationTable caption{text-align:left;padding:8px}#associationProvenance{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}#associationSection small{white-space:normal}#associationOptions label{display:block}#associationOptions select{width:100%}
 `;document.head.appendChild(style);
 el('associationEnable').onchange=()=>{associationView.active=el('associationEnable').checked;syncAssociations()};
 el('associationClose').onclick=()=>{associationView.active=false;syncAssociations()};
 for(const [id,key] of [['associationLevel','level'],['associationCoverage','coverage'],['associationCohort','cohort'],['associationMode','mode']])el(id).onchange=()=>{associationView[key]=el(id).value;renderAssociations()};
 el('associationSearch').oninput=()=>{associationView.filter=el('associationSearch').value;renderAssociations()};
 el('associationImport').onclick=()=>el('associationFile').click();
 el('associationFile').onchange=async()=>{
  const file=el('associationFile').files[0];if(!file)return;
  try{if(file.size>2*1024*1024)throw Error('Association supplement exceeds 2 MiB');const bank=validateAssociationBank(JSON.parse(await file.text()));BUNDLE_PACK.associationResults??={};BUNDLE_PACK.associationResults[bank.dataset]=bank;associationView.bank=bank;associationView.active=META.id===bank.dataset;syncAssociations()}
  catch(e){el('associationAvailability').textContent=e.message}finally{el('associationFile').value=''}
 };
 el('associationExport').onclick=()=>{const url=URL.createObjectURL(new Blob([associationCSV()],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`vme-enrollment-associations-${associationView.coverage}-${associationView.level}-${associationView.mode}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
 if(typeof installAssociationGraphs==='function')installAssociationGraphs();
 window.VME_ASSOCIATIONS_INSTALLED=true;syncAssociations();
}
