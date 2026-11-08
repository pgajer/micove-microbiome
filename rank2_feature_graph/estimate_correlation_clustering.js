// Independent implementation of the published Dynamic Hybrid Tree Cut algorithm:
// Langfelder, Zhang & Horvath, Bioinformatics 24 (2008), supplementary §2.2.
// Average linkage, signed distance 1-r, branch-respecting average-distance PAM.
// No model fitting, external service, or runtime dependency is required.
function clusterEstimateCorrelations(bank, settings){
 const n=bank.featureIndices.length,at=(i,j)=>{
  if(i===j)return 0;if(i>j)[i,j]=[j,i];return 1-bank.correlations[i*n-i*(i+1)/2+j-i-1];
 };
 const method=settings.clustering||'dynamic',minSize=settings.minSize??5,split=settings.deepSplit??1;
 if(!['dynamic','threshold'].includes(method))throw Error('Unknown clustering method');
 if(!Number.isInteger(minSize)||minSize<2||!Number.isInteger(split)||split<0||split>4)throw Error('Minimum cluster size must be at least 2; splitting sensitivity must be 0–4.');
 if(!n)return {labels:[],order:[],linkage:[],method};
 // Average-linkage reciprocal-neighbor chains, with stable feature-order ties.
 let tree=bank.linkage;
 if(method==='dynamic'||!Array.isArray(tree)){
  const d=Array.from({length:n},(_,i)=>Float64Array.from({length:n},(_,j)=>at(i,j))),active=new Set(Array.from({length:n},(_,i)=>i));
  const ids=[...active],sizes=new Array(n).fill(1),chain=[];tree=[];
  while(active.size>1){
   if(!chain.length)chain.push(active.values().next().value);
   const a=chain.at(-1),previous=chain.at(-2);let b=previous??-1,best=b<0?Infinity:d[a][b];
   for(const j of active)if(j!==a&&d[a][j]<best){b=j;best=d[a][j]}
   if(b!==previous){chain.push(b);continue}
   chain.length-=2;const keep=Math.min(a,b),drop=Math.max(a,b),sa=sizes[a],sb=sizes[b];
   tree.push([Math.min(ids[a],ids[b]),Math.max(ids[a],ids[b]),best,sa+sb]);
   for(const j of active)if(j!==a&&j!==b)d[keep][j]=d[j][keep]=method==='dynamic'?(sa*d[a][j]+sb*d[b][j])/(sa+sb):Math.max(d[a][j],d[b][j]);
   active.delete(drop);ids[keep]=n+tree.length-1;sizes[keep]=sa+sb;
  }
  // Chains discover independent merges out of height order. Relabel after sorting.
  const sorted=tree.map((row,i)=>({row,id:n+i})).sort((a,b)=>a.row[2]-b.row[2]||a.id-b.id),renumber=new Map();
  tree=sorted.map(({row,id},i)=>{const [a,b,h,size]=row;renumber.set(id,n+i);const left=a<n?a:renumber.get(a),right=b<n?b:renumber.get(b);return [Math.min(left,right),Math.max(left,right),h,size]});
 }
 const order=[],stack=[2*n-2];while(stack.length){const x=stack.pop();if(x<n)order.push(x);else{const [a,b]=tree[x-n];stack.push(b,a)}}
 if(method==='threshold'){
  const labels=new Array(n).fill(0),members=Array.from({length:n},(_,i)=>[i]);
  for(const [a,b,h] of tree)members.push([...members[a],...members[b]]);
  let label=0;const todo=[2*n-2];while(todo.length){const x=todo.pop();if(x<n||tree[x-n][2]<=1-settings.threshold+1e-14){++label;for(const i of members[x])labels[i]=label}else todo.push(tree[x-n][1],tree[x-n][0])}
  return {labels,order,linkage:tree,method};
 }
 if(n<minSize||n<3)return {labels:new Array(n).fill(0),order,linkage:tree,method};
 const heights=tree.map(x=>x[2]),rank=.05*heights.length,lower=Math.floor(rank);
 // Match the reference implementation's nearest-even rounding at half ranks.
 const rounded=rank-lower===.5?(lower%2?lower+1:lower):Math.round(rank);
 const reference=heights[Math.max(0,rounded-1)],cut=reference+.99*(heights.at(-1)-reference);
 const fraction=[.64,.73,.82,.91,.95][split],maxScatter=reference+fraction*(cut-reference),minGap=.75*(1-fraction)*(cut-reference);
 const branches=[],nodes=Array.from({length:n},(_,i)=>({single:i})),context=new Array(n).fill(null),tiny=[];
 const makeBasic=leaves=>{const b={leaves,basic:true,closed:false,height:cut};branches.push(b);return b};
 const scatter=b=>{
  const size=Math.min(b.leaves.length,Math.floor(minSize/2+1+Math.sqrt(Math.max(0,b.leaves.length-minSize/2-1))));
  if(size<2)return 0;let sum=0;for(let a=0;a<size;a++)for(let c=a+1;c<size;c++)sum+=at(b.leaves[a],b.leaves[c]);return 2*sum/(size*(size-1));
 };
 const shape=(b,h)=>{const s=scatter(b);return {size:b.leaves.length>=minSize,shape:s<=maxScatter&&h-s>=minGap&&h>reference}};
 const components=b=>b.basic?[b]:b.components;
 for(const [a,b,h] of tree){
  if(h>cut){nodes.push(null);continue}
  let x=nodes[a],y=nodes[b];
  if(!x||!y){nodes.push(null);continue}
  if(x.single!==undefined&&y.single!==undefined){nodes.push(makeBasic([x.single,y.single]));continue}
  if(x.single!==undefined||y.single!==undefined){
   const leaf=x.single!==undefined?x.single:y.single,branch=x.single!==undefined?y:x;
   if(branch.basic)branch.leaves.push(leaf);else context[leaf]=branch;
   nodes.push(branch);continue;
  }
  // Test the smaller branch first. Once two valid branches separate, their
  // composite contains closed branches and later singletons stay unassigned.
  if((x.basic?x.leaves.length:Infinity)>(y.basic?y.leaves.length:Infinity))[x,y]=[y,x];
  const sx=x.basic?shape(x,h):{size:true,shape:true},sy=y.basic?shape(y,h):{size:true,shape:true};
  let weak=(!sx.size||!sx.shape)?x:(!sy.size||!sy.shape)?y:null;
  if(weak){
   const strong=weak===x?y:x,q=weak===x?sx:sy;
   if(!q.size&&q.shape)tiny.push({branch:branches.indexOf(weak),leaves:weak.leaves.slice()});
   if(strong.basic){strong.leaves.push(...weak.leaves);weak.closed=true;nodes.push(strong)}
   else {for(const i of weak.leaves)context[i]=strong;weak.closed=true;nodes.push(strong)}
  }else{
   for(const z of [x,y])if(z.basic)z.height=h;
   const composite={basic:false,components:[...components(x),...components(y)]};nodes.push(composite);
  }
 }
 const groups=branches.filter(b=>!b.closed&&shape(b,b.height).size&&shape(b,b.height).shape).map(b=>b.leaves.slice()),labels=new Array(n).fill(0);
 groups.forEach((g,k)=>g.forEach(i=>labels[i]=k+1));
 // Candidate cluster sets follow the lowest composite branch the object joined.
 const candidates=i=>context[i]?new Set(context[i].components.flatMap(b=>b.leaves.map(j=>labels[j]).filter(Boolean))):new Set();
 const radii=groups.map(g=>Math.max(...g.map(i=>g.reduce((s,j)=>s+at(i,j),0)/(g.length-1))));
 const assigned=new Set(),assign=items=>{
  let allowed=null;for(const i of items){const a=candidates(i);allowed=allowed===null?a:new Set([...allowed].filter(x=>a.has(x)))}
  let best=Infinity,label=0;for(const c of allowed||[]){const g=groups[c-1];let sum=0;for(const i of items)for(const j of g)sum+=at(i,j);const distance=sum/(items.length*g.length);if(distance<best){best=distance;label=c}}
  if(label&&(best<cut||best<radii[label-1]))for(const i of items)labels[i]=label;
  for(const i of items)assigned.add(i);
 };
 // Later-created tiny branches take precedence where nested branches overlap.
 const smallLabels=new Map();for(const t of tiny.sort((a,b)=>a.branch-b.branch))for(const i of t.leaves)if(!labels[i])smallLabels.set(i,t.branch);
 const smallGroups=new Map();for(const [i,b] of smallLabels){if(!smallGroups.has(b))smallGroups.set(b,[]);smallGroups.get(b).push(i)}
 if(settings.pamStage!==false)for(const group of smallGroups.values())assign(group);
 if(settings.pamStage!==false)for(let i=0;i<n;i++)if(!labels[i]&&!assigned.has(i))assign([i]);
 const sizes=new Map();for(const c of labels)if(c)sizes.set(c,(sizes.get(c)||0)+1);
 const names=new Map([...sizes].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([c],i)=>[c,i+1]));
 return {labels:labels.map(c=>names.get(c)||0),order,linkage:tree,method,criteria:{cut,reference,maxScatter,minGap},implementation:'micove-dynamic-hybrid-v1'};
}

// Partition correlation fields before building trees, rather than cutting a
// joint tree and splitting its labels afterwards. Preserve original bank order.
function clusterEstimateCorrelationGroups(bank,settings){
 if(settings.clusteringScope==='joint')return {...clusterEstimateCorrelations(bank,settings),scope:'joint'};
 const n=bank.featureIndices.length,ids=settings.groupIds;
 if(!Array.isArray(ids)||ids.length!==n||ids.some(g=>typeof g!=='string'||!g))throw Error('Feature group IDs must match the correlation bank.');
 const members=new Map();ids.forEach((g,i)=>{if(!members.has(g))members.set(g,[]);members.get(g).push(i)});
 const labels=new Array(n).fill(0),order=[],groups=[];let offset=0;
 for(const [categoryId,indices] of members){
  const correlations=[];for(let a=0;a<indices.length;a++)for(let b=a+1;b<indices.length;b++){let i=indices[a],j=indices[b];if(i>j)[i,j]=[j,i];correlations.push(bank.correlations[i*n-i*(i+1)/2+j-i-1])}
  // Neither the joint hierarchy nor between-group correlations enter this fit.
  const part=clusterEstimateCorrelations({featureIndices:indices.map(i=>bank.featureIndices[i]),correlations},settings);
  part.labels.forEach((c,i)=>{labels[indices[i]]=c?offset+c:0});order.push(...part.order.map(i=>indices[i]));
  groups.push({categoryId,indices,...part,labels:part.labels.map(c=>c?offset+c:0)});offset+=Math.max(0,...part.labels);
 }
 return {labels,order,linkage:[],groups,scope:'separate',method:settings.clustering,implementation:'micove-groupwise-correlation-clustering-v1'};
}
