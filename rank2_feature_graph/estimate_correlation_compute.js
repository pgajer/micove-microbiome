// Runs in an isolated worker. Inputs are saved fields, never refitted responses.
function computeEstimateCorrelations(input, selectedRecords, unit, method){
 const positions=new Map(input.recordIndices.map((r,i)=>[r,i])),selection=[...new Set(selectedRecords)].filter(r=>positions.has(r)).sort((a,b)=>a-b);
 const visits=selection.map(r=>positions.get(r)),groups=new Map();
 for(const i of visits){const g=input.participantGroups[i];if(!groups.has(g))groups.set(g,[]);groups.get(g).push(i)}
 const participantVisits=[...groups.values()],n=unit==='participants'?groups.size:visits.length;
 const bank={format:'micove-estimate-correlations',version:1,datasetId:input.datasetId,catalogueRevision:input.catalogueRevision,sampleOrderSha256:input.sampleOrderSha256,
  k:input.k,unit,method,records:visits.length,participants:groups.size,selectedRecords:selection,featureIndices:[],excluded:[],correlations:[],linkage:[],order:[]};
 if(groups.size<3){bank.issue='At least three participants with saved estimates are required.';return bank}
 if(!['visits','participants'].includes(unit)||!['pearson','spearman'].includes(method))throw Error('Unknown correlation setting');
 const bytes=Uint8Array.from(atob(input.valuesBase64),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),width=input.recordIndices.length;
 const w=unit==='participants'?new Float64Array(n).fill(1):Float64Array.from(visits,i=>1/groups.get(input.participantGroups[i]).length);
 const total=w.reduce((a,b)=>a+b,0),normalized=[],rankOrder=Array.from({length:n},(_,i)=>i);
 for(let f=0;f<input.featureIds.length;f++){
  const value=i=>view.getFloat64(8*(f*width+i),true);
  let x=unit==='participants'?Float64Array.from(participantVisits,list=>list.reduce((s,i)=>s+value(i),0)/list.length):Float64Array.from(visits,value);
  let lo=Infinity,hi=-Infinity,scale=0;for(const v of x){lo=Math.min(lo,v);hi=Math.max(hi,v);scale=Math.max(scale,Math.abs(v))}
  if(hi-lo<=32*Number.EPSILON*scale){bank.excluded.push({featureIndex:f,reason:'Constant estimate field in this selection'});continue}
  if(method==='spearman'){
   const order=rankOrder.slice().sort((a,b)=>x[a]-x[b]||a-b),ranks=new Float64Array(n);let mass=0;
   for(let a=0;a<n;){let b=a+1,weight=w[order[a]];while(b<n&&x[order[b]]===x[order[a]])weight+=w[order[b++]];
    const rank=(mass+weight/2)/total;for(let j=a;j<b;j++)ranks[order[j]]=rank;mass+=weight;a=b}x=ranks;
  }else for(let i=0;i<n;i++)x[i]/=scale;
  let mean=0;for(let i=0;i<n;i++)mean+=w[i]*x[i]/total;
  let norm=0;for(let i=0;i<n;i++){x[i]=(x[i]-mean)*Math.sqrt(w[i]/total);norm+=x[i]*x[i]}norm=Math.sqrt(norm);
  for(let i=0;i<n;i++)x[i]/=norm;
  normalized.push(x);bank.featureIndices.push(f);
 }
 const p=normalized.length,dist=Array.from({length:p},()=>new Float64Array(p));
 for(let i=0;i<p;i++)for(let j=i+1;j<p;j++){
  let sum=0;const a=normalized[i],b=normalized[j];for(let k=0;k<n;k++)sum+=a[k]*b[k];
  const r=Math.max(-1,Math.min(1,sum));bank.correlations.push(r);dist[i][j]=dist[j][i]=1-r;
 }
 // Reciprocal nearest-neighbor chains implement complete linkage in O(p²).
 // Ties prefer the previous chain member, then frozen feature order.
 const active=new Set(Array.from({length:p},(_,i)=>i)),ids=Array.from(active),sizes=new Array(p).fill(1),chain=[];
 while(active.size>1){
  if(!chain.length)chain.push(active.values().next().value);
  const a=chain[chain.length-1],previous=chain[chain.length-2];let b=previous??-1,best=b<0?Infinity:dist[a][b];
  for(const j of active)if(j!==a&&dist[a][j]<best){b=j;best=dist[a][j]}
  if(b!==previous){chain.push(b);continue}
  chain.length-=2;const keep=Math.min(a,b),drop=Math.max(a,b),left=Math.min(ids[a],ids[b]),right=Math.max(ids[a],ids[b]);
  bank.linkage.push([left,right,best,sizes[a]+sizes[b]]);ids[keep]=p+bank.linkage.length-1;sizes[keep]=sizes[a]+sizes[b];
  active.delete(drop);for(const j of active)if(j!==keep)dist[keep][j]=dist[j][keep]=Math.max(dist[a][j],dist[b][j]);
 }
 const stack=p?[p+bank.linkage.length-1]:[];
 while(stack.length){const node=stack.pop();if(node<p)bank.order.push(node);else{const [a,b]=bank.linkage[node-p];stack.push(b,a)}}
 return bank;
}
