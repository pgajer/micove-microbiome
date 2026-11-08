// Prepare a frozen visit-by-cluster matrix from a reviewed estimate catalogue.
// Usage: node prepare_joint_profile_embedding.mjs CATALOGUE OUTPUT [features|groups]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const [folder,out,weighting='features']=process.argv.slice(2);
if(!folder||!out||!['features','groups'].includes(weighting))throw Error('Expected CATALOGUE OUTPUT [features|groups]');
if(fs.existsSync(out))throw Error('Preserve existing run: output directory already exists');
const here=path.dirname(fileURLToPath(import.meta.url)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const manifestRaw=fs.readFileSync(path.join(folder,'manifest.json')),asset=JSON.parse(manifestRaw),data=asset.correlations;
function read(d){const raw=fs.readFileSync(path.join(folder,d.file));if(raw.length!==d.bytes||sha(raw)!==d.sha256)throw Error('Input checksum differs: '+d.file);return JSON.parse(raw)}
const descriptor=data.banks.find(b=>b.k===40&&b.unit==='visits'&&b.method==='spearman'),bank=read(descriptor);
const inputDescriptor=data.selectionInputs.banks.find(b=>b.k===40),input=read(inputDescriptor);
if(input.sampleOrderSha256!==asset.sampleOrderSha256||input.catalogueRevision!==asset.revision||bank.catalogueRevision!==asset.revision)throw Error('Input identity differs');
if(input.featureIds.length!==data.fields.length||input.featureIds.some((id,i)=>id!==data.fields[i].featureId)||new Set(input.recordIndices).size!==input.recordIndices.length)throw Error('Input field or record order differs');
const context=vm.createContext({atob,console});
const sources=['estimate_correlation_clustering.js','estimate_cluster_profiles.js'];
for(const name of sources)vm.runInContext(fs.readFileSync(path.join(here,name),'utf8'),context);
const settings={k:40,unit:'visits',method:'spearman',clustering:'dynamic',minSize:5,deepSplit:1,threshold:.7};
const result=context.clusterEstimateCorrelations(bank,settings),groups=new Map();
result.labels.forEach((c,i)=>{if(c>0){if(!groups.has(c))groups.set(c,[]);groups.get(c).push(bank.featureIndices[i])}});
const clusters=[...groups].sort((a,b)=>a[0]-b[0]).map(([id,members])=>({id,members,label:'C'+id}));
const scope={kind:'full',key:'full',label:'Full common-support reference',records:input.recordIndices.length,participants:new Set(input.participantGroups).size};
const snapshot={version:1,settings,scope,clusters,key:JSON.stringify([data.revision,settings,scope.key,clusters])};
const profiles=clusters.map(c=>context.jointProfileScores(input,c.members,asset.sampleCount,data.fields,weighting));
const matrix=input.recordIndices.map(i=>profiles.map(p=>p.values[i]));
if(!matrix.length||matrix.some(r=>r.some(v=>!Number.isFinite(v)||v<0||v>100)))throw Error('Nonfinite profile matrix');
const raw=Buffer.alloc(matrix.length*clusters.length*8);matrix.flat().forEach((v,i)=>raw.writeDoubleLE(v,i*8));
const recordIds=read(asset.sampleOrder).sampleIds;
const metadata={format:'micove-joint-profile-input',version:1,datasetId:asset.datasetId,catalogueRevision:asset.revision,correlationRevision:data.revision,sampleOrderSha256:asset.sampleOrderSha256,sampleCount:asset.sampleCount,recordIndices:input.recordIndices,recordIds:input.recordIndices.map(i=>recordIds[i]),participantGroups:input.participantGroups,weighting,snapshot,rows:matrix.length,columns:clusters.length,matrixSha256:sha(raw),sources:{manifestSha256:sha(manifestRaw),correlations:descriptor,estimates:inputDescriptor,implementation:Object.fromEntries(sources.map(n=>[n,sha(fs.readFileSync(path.join(here,n)))]))},fields:data.fields,excludedRecords:asset.sampleCount-matrix.length};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'matrix.bin'),raw);fs.writeFileSync(path.join(out,'input.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify({rows:metadata.rows,columns:metadata.columns,participants:scope.participants,weighting,excludedRecords:metadata.excludedRecords,matrixSha256:metadata.matrixSha256,sti:clusters.filter(c=>c.members.some(i=>data.fields[i].label.toLowerCase().includes('any incident sti'))).map(c=>c.id)}));
