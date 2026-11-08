import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context={console,Math,Number,Array,Int32Array,Map,Set,WeakMap};vm.createContext(context);
for(const name of ['estimate_correlation_layout.js','estimate_correlations.js'])vm.runInContext(fs.readFileSync(new URL(name,import.meta.url),'utf8'),context);
const run=s=>vm.runInContext(s,context),fit=input=>{context.input=input;return run('fitEstimateCorrelationMds(input)')};
const packed=points=>points.flatMap((a,i)=>points.slice(i+1).map(b=>Math.hypot(a[0]-b[0],a[1]-b[1])));
const planar={nodes:['a','b','c','d','e'],targets:packed([[0,0],[1,0],[0,1],[1,1],[.3,.6]])},before=JSON.stringify(planar),result=fit(planar);
assert(result.relativeRms<.003,'Recover known planar distances to 0.3%');assert.equal(JSON.stringify(planar),before,'Input targets untouched');
assert.equal(JSON.stringify(result),JSON.stringify(fit(planar)),'Reproducible coordinates and diagnostics');
let rel=0,raw=0,q=0;for(let i=0;i<5;i++)for(let j=i+1;j<5;j++){const e=Math.hypot(...result.positions[i].map((v,k)=>v-result.positions[j][k]))-planar.targets[q];rel+=(e/planar.targets[q++])**2;raw+=e*e}
assert(Math.abs(result.relativeRms-Math.sqrt(rel/q))<1e-12);assert(Math.abs(result.rawStress-raw)<1e-12);
const nonplanar=fit({nodes:[0,1,2,3],targets:Array(6).fill(1)});assert(nonplanar.relativeRms>.1,'Impossible planar targets retain nonzero approximation error');
const zeros=fit({nodes:[0,1,2],targets:[0,1,1]});assert.equal(zeros.zeroPairs,1);assert.equal(zeros.positivePairs,2);assert(zeros.zeroMaxError<.01);assert(zeros.relativeRms<.01);
const degenerate=fit({nodes:[0,1],targets:[0]});assert.equal(degenerate.relativeRms,null);assert.equal(degenerate.rawStress,0);assert.equal(degenerate.zeroMaxError,0);
assert.equal(fit({nodes:[],targets:[]}).positions.length,0);assert.equal(fit({nodes:['x'],targets:[]}).relativeRms,null);
assert.throws(()=>fit({nodes:[0,1],targets:[NaN]}),/Invalid/);
// Between-group MDS includes same-side pairs; graph display edges remain bipartite.
context.bank={featureIndices:[0,1,2],correlations:[.8,-.5,.2]};
run('graph={nodes:[{key:"rows:1",side:"rows",members:[0]},{key:"cols:2",side:"cols",members:[1]},{key:"cols:3",side:"cols",members:[2]}],edges:[]};targets=estimateCorrelationLayoutInput(graph,bank)');
assert.equal(run('targets.targets.length'),3);assert(Math.abs(run('targets.targets[2]')-Math.sqrt(1.6))<1e-12);
run('graph.nodes.push({key:"same:1",side:"cols",members:[0]})');assert.equal(run('estimateCorrelationLayoutInput(graph,bank).targets[2]'),0,'Duplicate memberships target zero');
context.result=result;
// Independent x/y stretching would make the reported error disagree with the picture.
context.graph5={nodes:planar.nodes.map(key=>({key}))};
const positions=run('estimateCorrelationMdsPositions(graph5,result,400)');let scale;
for(let i=0;i<5;i++)for(let j=i+1;j<5;j++){const a=positions.get(planar.nodes[i]),b=positions.get(planar.nodes[j]),d=Math.hypot(a.x-b.x,a.y-b.y)/Math.hypot(...result.positions[i].map((v,k)=>v-result.positions[j][k]));if(scale===undefined)scale=d;assert(Math.abs(d-scale)<1e-8)}
console.log('PASS: planar recovery, nonplanar error, independent diagnostic calculation, zero/empty targets, deterministic fits, immutable inputs, full between-group targets, duplicate membership and isotropic rendering.');
// Worker reuse, exact-input cache, cancellation, and export agreement.
let workers=0,posts=0;
class Worker {
 constructor(){workers++;this.alive=true}
 postMessage(message){posts++;queueMicrotask(()=>{if(this.alive)this.onmessage({data:{id:message.id,fit:fit(message.input)}})})}
 terminate(){this.alive=false}
}
Object.assign(context,{Worker,Blob:class {},URL:{createObjectURL:()=> 'worker:test',revokeObjectURL(){}},planar});
const concurrent=await Promise.all([run('estimateCorrelationLayoutFit(planar)'),run('estimateCorrelationLayoutFit(planar)')]);
assert.equal(posts,1,'Identical queued fits shared');assert.equal(workers,1);assert.equal(concurrent[0],concurrent[1]);
await run('estimateCorrelationLayoutFit(planar)');assert.equal(posts,1,'Exact cache avoids refit');
run('altered={...planar,targets:planar.targets.map(d=>d*1.1)}');await run('estimateCorrelationLayoutFit(altered)');assert.equal(posts,2,'Changed target invalidates cache');assert.equal(workers,1);
run('cancelInput={nodes:[0,1],targets:[.123]}');const cancelled=run('estimateCorrelationLayoutFit(cancelInput)');run('estimateCorrelationLayoutCancel()');assert.equal(await cancelled,null);
context.saved={input:{...planar,nodes:planar.nodes.map(key=>({key}))},fit:result};
const exported=run('estimateCorrelationLayoutFiles("graphs/test",saved,rows=>JSON.stringify(rows))');
assert.equal(exported.length,3);const distances=JSON.parse(exported[1].text);assert.equal(distances.length,11);assert.equal(distances[1][2],planar.targets[0]);
const meta=JSON.parse(exported[2].text);assert.equal(meta.relativeRms,result.relativeRms);assert.equal(meta.settings.epochs,500);
assert.equal(run('estimateCorrelationLayoutFiles("x",null,()=>"").length'),0);
console.log('PASS: serial worker reuse, duplicate-job/cache reuse, numerical cache invalidation, cancellation and exact diagnostic exports.');
// Retained-edge geometry: signed lengths, shortest paths and disconnected scope.
run('weightedGraph={nodes:[{key:"a",members:[0]},{key:"b",members:[1]},{key:"c",members:[2]},{key:"d",members:[3]}],edges:[]}; weightedGraph.edges=[{source:weightedGraph.nodes[0],target:weightedGraph.nodes[1],mean:.9},{source:weightedGraph.nodes[1],target:weightedGraph.nodes[2],mean:-.8},{source:weightedGraph.nodes[0],target:weightedGraph.nodes[2],mean:.1}]');
run('weightedInput=estimateCorrelationWeightedInput(weightedGraph,{graphThreshold:.3,graphSign:"both"})');
assert.equal(run('weightedInput.nodes.length'),3,'Degree-zero nodes excluded from fit');
assert.equal(run('weightedInput.edges.length'),2);assert(run('weightedInput.edges[1].length>weightedInput.edges[0].length'),'Negative edge requests longer length');
assert(Math.abs(run('estimateCorrelationGraphDistances(weightedInput).distances[0][2]')-Math.sqrt(.2)-Math.sqrt(3.6))<1e-12,'Path length sums retained edges');
run('positiveInput=estimateCorrelationWeightedInput(weightedGraph,{graphThreshold:.3,graphSign:"positive"})');assert.equal(run('positiveInput.nodes.length'),2,'Sign filtering changes weighted graph membership');
run('perfectGraph={nodes:weightedGraph.nodes.slice(0,2),edges:[{source:weightedGraph.nodes[0],target:weightedGraph.nodes[1],mean:1}]};perfectInput=estimateCorrelationWeightedInput(perfectGraph,{graphThreshold:.3,graphSign:"both"})');
assert.equal(run('perfectInput.edges[0].rawLength'),0);assert.equal(run('perfectInput.edges[0].length'),1e-6,'Strictly positive floor recorded');
run('disconnected={nodes:[0,1,2,3],edges:[{source:0,target:1,length:2},{source:2,target:3,length:3}]};disconnectedPositions=[[0,0],[2,0],[1000,0],[1003,0]];weightedDiagnostics=estimateCorrelationWeightedDiagnostics(disconnected,disconnectedPositions)');
assert.equal(run('weightedDiagnostics.relativeRms'),0);assert.equal(run('weightedDiagnostics.componentCount'),2);assert.equal(run('weightedDiagnostics.connectedPairs'),2);assert.equal(run('weightedDiagnostics.disconnectedPairs'),4,'Arbitrary component spacing excluded from error');
run('triangle={nodes:[0,1,2],edges:[{source:0,target:1,length:1},{source:1,target:2,length:1},{source:0,target:2,length:3}]}');
assert.equal(run('estimateCorrelationGraphDistances(triangle).distances[0][2]'),2,'Shorter alternate route can override a direct edge');
assert.equal(run('estimateCorrelationWeightedDiagnostics({nodes:[],edges:[]},[]).relativeRms'),null);
assert.equal(run('weightedGraph.nodes.length'),4,'Original graph preserved');
console.log('PASS: signed positive lengths, floor provenance, retained-edge paths, disconnected-pair exclusion, alternate routes and input preservation.');
// Local-service queue, exact runtime identity, stale jobs and portable error message.
let requests=0,active=0,maxActive=0,runtimeId='r1',offline=false;
context.fetch=async(url,options)=>{
 if(offline)throw Error('offline');
 if(!options?.method)return {ok:true,json:async()=>({runtimeId})};
 requests++;active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,2));active--;
 const request=JSON.parse(options.body),distance=request.edges[0][2];
 return {ok:true,json:async()=>({...request,coords:[[0,0],[distance,0]],runtimeId,requestHash:String(requests),settings:{threads:1},runtime:{grip:'test'},components:[]})};
};
const shared=await Promise.all([run('estimateCorrelationWeightedFit(positiveInput)'),run('estimateCorrelationWeightedFit(positiveInput)')]);
assert.equal(requests,1);assert.equal(shared[0],shared[1]);assert.equal(shared[0].relativeRms,0);
await run('estimateCorrelationWeightedFit(positiveInput)');assert.equal(requests,1,'Same runtime reuses exact result');
runtimeId='r2';await run('estimateCorrelationWeightedFit(positiveInput)');assert.equal(requests,2,'Runtime change invalidates result');
await Promise.all([run('estimateCorrelationWeightedFit(perfectInput)'),run('estimateCorrelationWeightedFit({...positiveInput,threshold:.4})')]);assert.equal(maxActive,1,'R requests serialized');
const old=run('estimateCorrelationWeightedFit({...positiveInput,threshold:.5})');run('estimateCorrelationLayoutCancel()');assert.equal(await old,null,'Queued stale job never applied');
offline=true;await assert.rejects(run('estimateCorrelationWeightedFit(positiveInput)'),/Start MiCOVE with GRIP/);
context.weightedSaved={method:'weighted_grip',input:run('positiveInput'),fit:shared[0]};
const weightedExported=run('estimateCorrelationLayoutFiles("x",weightedSaved,rows=>JSON.stringify(rows))');
assert.equal(weightedExported.length,4);assert(weightedExported.some(f=>f.name.endsWith('weighted-grip-distances.csv')));assert.equal(JSON.parse(weightedExported[3].text).connectedPairs,1);
console.log('PASS: serialized service, runtime-aware cache, cancellation, unavailable-service guidance and weighted export agreement.');
