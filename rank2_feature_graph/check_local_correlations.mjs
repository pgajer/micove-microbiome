// On-demand numerical check of the same worker and clustering code as the viewer.
import fs from 'node:fs';
import vm from 'node:vm';
import readline from 'node:readline';
import assert from 'node:assert/strict';
const [catalogue]=process.argv.slice(2),manifest=JSON.parse(fs.readFileSync(catalogue+'/manifest.json'));
const context={atob};vm.createContext(context);
for(const file of ['estimate_correlation_compute.js','estimate_correlation_clustering.js'])vm.runInContext(fs.readFileSync(new URL(file,import.meta.url),'utf8'),context);
const inputs=new Map();
for await(const line of readline.createInterface({input:process.stdin})){
 try{
  const job=JSON.parse(line),descriptor=manifest.correlations.selectionInputs.banks.find(b=>b.k===job.k);
  if(!inputs.has(job.k))inputs.set(job.k,JSON.parse(fs.readFileSync(catalogue+'/'+descriptor.file)));
  const before=performance.now();
  const raw=context.computeEstimateCorrelations(inputs.get(job.k),job.records,job.unit,job.method);
  const bank=context.estimateCorrelationAnalysisBank(raw,manifest.correlations),clusterCounts={};
  if(!bank.issue){
   const settings={clustering:'dynamic',minSize:5,deepSplit:1,groupIds:bank.featureIndices.map(i=>manifest.correlations.fields[i].categoryId)};
   for(const scope of ['separate','joint']){
    const fit=context.clusterEstimateCorrelationGroups(bank,{...settings,clusteringScope:scope});
    assert.equal(fit.labels.length,bank.featureIndices.length);
    assert.equal(new Set(fit.order).size,bank.featureIndices.length);
    assert(fit.labels.every(x=>Number.isInteger(x)&&x>=0));
    clusterCounts[scope]=new Set(fit.labels.filter(x=>x>0)).size;
   }
  }
  const data=Float64Array.from(bank.correlations);
  fs.writeFileSync(job.binary,Buffer.from(data.buffer));
  console.log(JSON.stringify({...bank,correlations:undefined,linkage:undefined,order:undefined,clusterCounts,seconds:(performance.now()-before)/1000}));
 }catch(error){console.log(JSON.stringify({error:error.stack}));process.exitCode=1;break}
}
