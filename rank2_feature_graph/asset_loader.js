// Immutable HTTP data loader. The offline export does not execute this module.
(function(root){
'use strict';
function mergePack(target,part,append=false){
 for(const [key,value] of Object.entries(part)){
  if(key==='bundles'){target.bundles??=[];for(const b of value){if(target.bundles.some(x=>x.dataset.id===b.dataset.id))throw Error('Duplicate dataset asset');target.bundles.push(b)}}
  else if(['datasetMaxNormalizedEmbeddings','datasetUnfoldedEmbeddings','datasetUnfoldedEdgeEmbeddings'].includes(key)){
   target[key]??={};for(const [id,bank] of Object.entries(value)){const previous=target[key][id]||{};target[key][id]={...previous,...bank,fits:Object.assign(previous.fits||{},bank.fits||{})}}
  }
  else if(['subjectEmbeddings','graphLayouts','combDisplay'].includes(key)){
   const previous=target[key]||{};target[key]={...previous,...value};
   for(const field of ['fits','contexts','deferredFits'])if(previous[field]||value[field])target[key][field]=append?Object.assign(previous[field]||{},value[field]):{...previous[field],...value[field]};
  }else if(key==='embeddingFamilies'){target.embeddingFamilies??=[];target.embeddingFamilies.push(...value)}
  else if(key==='familyNeighborhoods'){
   const family=target.embeddingFamilies?.find(f=>f.id===value.id);if(!family)throw Error('Missing neighborhood family');family.neighborhoods.push(...value.neighborhoods);
  }else if(value&&typeof value==='object'&&!Array.isArray(value))target[key]={...target[key],...value};
  else target[key]=value;
 }
 return target;
}
function createLoader(manifest,request=fetch,digest=bytes=>crypto.subtle.digest('SHA-256',bytes)){
 if(manifest.version!==1)throw Error('Unsupported HTTP asset manifest');
 const pending=new Map(),loaded=new Map();
 async function fragment(descriptor){
  if(!/^\/vme-assets\/[a-f0-9]{64}\.json$/.test(descriptor.url)||!descriptor.url.includes(descriptor.sha256))throw Error('Invalid asset identity');
  const response=await request(descriptor.url);if(!response.ok)throw Error('Could not load dataset asset (HTTP '+response.status+'). Retry loading.');
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==descriptor.bytes)throw Error('Incomplete dataset asset. Retry loading.');
  const hash=[...new Uint8Array(await digest(bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==descriptor.sha256)throw Error('Dataset asset checksum differs. Reload the page before retrying.');
  return JSON.parse(new TextDecoder().decode(bytes));
 }
 async function group(key,entry,validate=()=>{}){
  if(loaded.has(key))return loaded.get(key);
  if(pending.has(key))return pending.get(key);
  if(!entry)throw Error('This dataset or view is not in the current release.');
  const promise=(async()=>{
   const parts=new Array(entry.parts.length);let next=0;
   await Promise.all(Array.from({length:Math.min(4,parts.length)},async()=>{while(next<parts.length){const i=next++;parts[i]=await fragment(entry.parts[i]);}}));
   const value={};for(const part of parts)mergePack(value,part,true);
   await validate(value);loaded.set(key,value);return value;
  })();
  pending.set(key,promise);
  try{return await promise}finally{pending.delete(key)}
 }
 // Materialize the existing comparison fit references before activation. Keep
 // cached baseline fragments unchanged so baseline views can still be restored.
 async function prepareSensitivity(base){
  const id='comb-V3V4-tx',fits={...base.combDisplay.fits};
  for(const index of new Set(Object.values(base.combDisplay.deferredFits||{}))){
   const part=await group('fit:'+id+':combDisplay:'+index,{parts:[manifest.datasets[id].deferred.combDisplay.parts[index]]});
   Object.assign(fits,part.combDisplay.fits);
  }
  const part=await group('sensitivity',manifest.sensitivity),pool={...fits,...part.sensitivityFitPool};
  const comparisons=Object.fromEntries(Object.entries(part.sensitivityComparisons).map(([mode,item])=>[mode,{...item,display:{...item.display,
   fits:Object.fromEntries(item.display.fitKeys.map(key=>{if(!pool[key])throw Error('Missing sensitivity fit');return [key,pool[key]]}))}}]));
  return {...part,sensitivityComparisons:comparisons};
 }
 return {manifest,loaded,group,mergePack,prepareSensitivity,
  dataset:(id,validate)=>group('dataset:'+id,manifest.datasets[id],validate),
  fitChunk:(id,role,index)=>group('fit:'+id+':'+role+':'+index,{parts:[manifest.datasets[id].deferred[role].parts[index]]}),
  sensitivity:()=>group('sensitivity',manifest.sensitivity),
  neighborhoods:()=>group('neighborhoods',manifest.neighborhoods)};
}
function skinCohorts(manifest){
 return Object.values(manifest.datasets).filter(x=>x.capability==='skin-population-v2'&&(!manifest.seed.distributionDatasets||manifest.seed.distributionDatasets.includes(x.dataset.id))).map(x=>x.dataset);
}
function groupSkinChoices(choices,cohorts){
 const ids=new Set(cohorts.map(x=>x.id)),out=[];let added=false;
 for(const item of choices){if(ids.has(item.id)){if(!added){out.push({id:'skin',title:'Skin'});added=true}}else if(!out.some(x=>x.id===item.id))out.push(item)}
 return out;
}
function resolveSkinDataset(id,cohort,cohorts){
 if(id!=='skin')return id;
 const found=cohort?cohorts.find(x=>x.id===cohort):cohorts[0];
 if(!found)throw Error(cohort?'The requested skin cohort is not installed. Choose an installed cohort or dataset.':'No skin cohorts are installed.');
 return found.id;
}
root.VMEAssetLoader={createLoader,mergePack,skinCohorts,groupSkinChoices,resolveSkinDataset};
if(typeof document==='undefined')return;
let requested=new URLSearchParams(location.search).get('dataset');
if(!requested)try{requested=localStorage.getItem('micove-last-dataset-v1')}catch{}
if(requested==='empty'){location.replace(new URL('empty.html',location.href).href);return}
const optionalNode=document.getElementById('vme-optional-neighborhoods'),optional=optionalNode?JSON.parse(optionalNode.textContent):null;
const primary=JSON.parse(document.getElementById('vme-http-manifest').textContent);
if(optional)for(const entry of Object.values(primary.datasets)){
 if(entry.capability && !optional.seed.optionalDatasetLinks.some(x=>x.id===entry.dataset.id))optional.seed.optionalDatasetLinks.push(entry.dataset);
}
const manifest=optional?.families.some(f=>f.id===requested)?optional:primary,loader=createLoader(manifest);
root.VME_ASSETS=loader;
loader.skinCohorts=skinCohorts(primary);
// A population-only view has its own initialization. Route changes before an older
// graph viewer tries to validate the selected population as a graph bundle.
document.addEventListener('change',event=>{
 if(!['datasetSelect','panelDatasetSelect'].includes(event.target.id)||!(event.target.value==='skin'||primary.datasets[event.target.value]?.capability))return;
 event.stopImmediatePropagation();const url=new URL(location.href);url.searchParams.set('dataset',event.target.value);url.searchParams.delete('cohort');location.assign(url.href);
},true);
const status=document.getElementById('vmeLoadStatus'),retry=document.getElementById('vmeLoadRetry');
loader.status=message=>{status.textContent=message;status.hidden=!message};
loader.retry=action=>{retry.hidden=!action;retry.onclick=action?()=>Promise.resolve().then(action).catch(error=>loader.status(error.message)):null};
const controls=[...document.querySelectorAll('input,select,button')].filter(e=>e!==retry),disabled=controls.map(e=>e.disabled);
controls.forEach(e=>e.disabled=true);
const selector=document.getElementById('datasetSelect');
const choices=groupSkinChoices([{id:'empty',title:'Empty'},...Object.values(manifest.datasets).filter(x=>!manifest.seed.distributionDatasets||manifest.seed.distributionDatasets.includes(x.dataset.id)).map(x=>({id:x.dataset.id,title:manifest.seed.datasetPresentation?.[x.dataset.id]?.title||x.dataset.title})),...manifest.families,...(manifest.seed.optionalDatasetLinks||[])],loader.skinCohorts);
for(const item of choices){const option=document.createElement('option');option.value=item.id;option.textContent=item.title;selector.appendChild(option)}
let validationLibrary=null;
let selected=choices.some(x=>x.id===requested)||loader.skinCohorts.some(x=>x.id===requested)?requested:manifest.seed.default,revision=0,library=null;
selector.value=loader.skinCohorts.some(x=>x.id===selected)?'skin':selected;selector.disabled=false;
const script=descriptor=>new Promise((resolve,reject)=>{const e=document.createElement('script');e.src=descriptor.url;e.integrity='sha256-'+btoa(String.fromCharCode(...Uint8Array.from(descriptor.sha256.match(/../g),x=>parseInt(x,16))));e.onload=resolve;e.onerror=()=>{e.remove();reject(Error('Could not load application code. Retry loading.'))};document.body.appendChild(e)});
loader.validateDataset=(value,id)=>{
 const b=value.bundles?.[0],expected=manifest.datasets[id]?.dataset;
 if(value.bundles?.length!==1||!expected||b.dataset.id!==id||b.dataset.revision!==expected.revision)throw Error('Dataset identity differs from the current release.');
 root.validateBundle(b);
 if(value.participants?.[id])root.validateParticipantSupplement(value.participants[id],b,value.recordAdapters?.[id]);
 const prepared=value.participantPreparation?.[id],data=value.participants?.[id];
 if(prepared&&(prepared.version!==1||prepared.datasetRevision!==b.dataset.revision||prepared.analysisRevision!==data?.analysisRevision||prepared.auditRevision!==data?.provenance.auditSha256||!prepared.scores||JSON.stringify(Object.keys(prepared.scores).sort())!==JSON.stringify(Object.keys(value.combDisplay?.merged||b.cohortAnalysis?.merged||{}).sort())))throw Error('Prepared participant sorting reference differs from the dataset.');
 if(prepared){
  const positions=prepared.leadingPositions;
  if(!positions||Object.keys(positions).length!==Object.keys(data.compositions).length)throw Error('Incomplete prepared participant hover reference.');
  for(const [profile,sparse] of Object.entries(data.compositions)){
   const top=positions[profile];
   if(!Array.isArray(top)||top.length!==Math.min(5,sparse.length)||new Set(top).size!==top.length||top.some(i=>!Number.isSafeInteger(i)||i<0||i>=sparse.length))throw Error('Invalid prepared participant hover position.');
   for(let i=1;i<top.length;i++){const a=sparse[top[i-1]],b=sparse[top[i]];if(a[1]<b[1]||a[1]===b[1]&&a[0]>b[0])throw Error('Invalid prepared participant hover order.');}
  }
 }
};
async function start(id){
 if(id==='empty'){location.assign(new URL('empty.html',location.href).href);return}
 if(manifest.seed.optionalDatasetLinks?.some(item=>item.id===id)){const url=new URL(location.href);url.searchParams.set('dataset',id);location.assign(url.href);return}
 const attempt=++revision;selected=id;loader.retry(null);loader.status('Loading '+(choices.find(x=>x.id===id)?.title||manifest.datasets[id]?.dataset.title||id)+'…');
 try{
  id=resolveSkinDataset(id,new URLSearchParams(location.search).get('cohort'),loader.skinCohorts);
  try{localStorage.setItem('micove-last-dataset-v1',id)}catch{}
  const dataset=manifest.datasets[id]?id:manifest.neighborhoods.datasets[0];
  library??=script(manifest.plotly).catch(error=>{library=null;throw error});
  const capability=manifest.datasets[id]?.capability;
  if(['skin-population-v1','skin-population-v2','agp-population-v1'].includes(capability)){
   const skin=capability.startsWith('skin-population-');
   const [part]=await Promise.all([loader.dataset(id),library,script(skin?manifest.skinViewer:manifest.agpViewer)]);
   if(attempt!==revision)return;
   const data=skin?part.skinPopulation:part.agpPopulation;
   if(data?.id!==id||data.revision!==manifest.datasets[id].dataset.revision)throw Error('Population identity mismatch.');
   await (capability==='skin-population-v2'?root.showSkinPopulationV2:skin?root.showSkinPopulation:root.showAgpPopulation)(capability==='skin-population-v2'?{...data,genusStates:part.skinStates}:data,choices,part.agpReferences,part.agpGraphLayouts,part.agpLocalFits,part.agpLocalBank,part.agpUnfolded,part.agpConnections,part.agpMergedConnections,part.agpConnectionLayouts,part.agpOutcomeEstimates);
   loader.status('');return;
  }
  validationLibrary??=script(manifest.validator).catch(error=>{validationLibrary=null;throw error});
  const [value]=await Promise.all([loader.dataset(dataset,async value=>{await validationLibrary;loader.validateDataset(value,dataset)}),library]);
  if(attempt!==revision)return;
  const pack=mergePack({...manifest.seed,bundles:[],embeddingFamilies:manifest.families},value);
  if(dataset==='comb-V3V4-tx'&&manifest.sensitivity){
   loader.status('Loading rebuilt reference comparison…');
   const part=await loader.prepareSensitivity(value),base={...value.bundles[0]};delete base.cohortAnalysis;
   for(const item of Object.values(part.sensitivityComparisons))root.validateParticipantSupplement(item.records.participants,base,item.records.adapter);
   mergePack(pack,part);
  }
  if(attempt!==revision)return;
  root.BUNDLE_PACK=pack;
  loader.initialDataset=dataset;
  const url=new URL(location.href);url.searchParams.set('dataset',id);history.replaceState(null,'',url);
  // Loading and validation finish before the existing application installs its
  // handlers. During this short phase another startup cannot race installation.
  selector.disabled=true;loader.releaseControls=()=>{controls.forEach((e,i)=>{e.disabled=disabled[i]});delete loader.releaseControls};
  await script(manifest.application);
  if(!root.VME_APP_INSTALLED)throw Error('Application initialization failed. Reload the page to retry.');
  if(manifest.datasets[id])loader.status('');loader.retry(null);
 }catch(error){if(attempt!==revision)return;selector.disabled=false;loader.status(error.message);loader.retry(()=>root.BUNDLE_PACK?location.reload():start(selected))}
}
selector.onchange=()=>start(selector.value);
start(selected);
})(typeof globalThis==='undefined'?this:globalThis);
