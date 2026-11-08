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
