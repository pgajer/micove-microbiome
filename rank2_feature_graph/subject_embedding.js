// Subject-state joint coordinates are additive display assets, never assignments.
const subjectEmbeddingCache=new Map(),subjectEmbeddingPending=new Map();
const subjectEmbeddingDecoded=new Map();
function subjectEmbeddingScope(bundle,data,cohort,mode,q,key){
 const visits=data.records.filter(r=>participantKey(r)===key);
 if(!visits.length||visits.some(r=>r.cohort!==cohort))throw Error('Subject embedding cohort mismatch');
 const labels=mode==='merged'?bundle.cohortAnalysis.merged[q].pairs:bundle.data.samples.pair;
 const states=[...new Set(visits.map(r=>labels[r.profile]))].sort();
 const members=new Set(states),records=data.records.filter(r=>r.cohort===cohort&&members.has(labels[r.profile]));
 const profiles=[...new Set(records.map(r=>r.profile))].sort((a,b)=>a-b);
 const context=JSON.stringify([bundle.dataset.id,bundle.dataset.revision,data.analysisRevision,data.provenance.auditSha256,cohort,mode,q,states]);
 return {context,states,records,profiles};
}
function currentSubjectEmbeddingScope(){return subjectEmbeddingScope(datasetRegistry.get(META.id),participantData(),activeCohort,activeStateMode,el('coverage').value,participant.key)}
function validateSubjectEmbeddingFit(fit,scope){
 if(!fit||fit.context!==scope.context||JSON.stringify(fit.profiles)!==JSON.stringify(scope.profiles)||fit.coords?.length!==scope.profiles.length||fit.coords.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x))))throw Error('Joint embedding does not match the subject’s state population');
 if(fit.maxNormalizedRevision){
  const bank=BUNDLE_PACK.datasetMaxNormalizedEmbeddings?.[JSON.parse(scope.context)[0]],key=bank?.subjects[scope.context],source=bank?.fits[key+':'+fit.metric];
  if(!source||bank.revision!==fit.maxNormalizedRevision||source.receipt!==fit.receipt||JSON.stringify(decodeSavedCoordinates(source))!==JSON.stringify(fit.coords))throw Error('Joint max-normalized fit differs from its saved supplement.');
  return fit;
 }
 if(fit.historical&&fit.displayRevision===BUNDLE_PACK.combDisplay?.revision&&fit.provenance&&/^[a-f0-9]{64}$/.test(fit.receipt))return fit;
 const error=fit.evaluation?.relativeRms,singleton=fit.evaluation?.profiles===1&&fit.solver?.backend==='analytic'&&fit.coords.length>0&&fit.coords.every(p=>p.every((x,j)=>x===fit.coords[0][j]));
 const validError=error===null?singleton:Number.isFinite(error)&&error>=0;
 if(fit.settings?.version!=='subject-union-mds-v1'||fit.settings.backend!=='sgd'||fit.settings.dimension!==3||!fit.solver||!fit.evaluation||!validError||!/^[a-f0-9]{64}$/.test(fit.receipt??''))throw Error('Invalid joint embedding solver receipt');
 return fit;
}
function savedSubjectEmbedding(scope){
 if(typeof datasetMaxNormalizedSubject==='function'&&datasetMaxNormalizedAsset()&&maxNormalizedIds.includes(el('sampleEmbedding').value))return datasetMaxNormalizedSubject(scope);
 if(subjectEmbeddingCache.has(scope.context))return validateSubjectEmbeddingFit(subjectEmbeddingCache.get(scope.context),scope);
 const packaged=typeof combSubjectFit==='function'?combSubjectFit(scope):null;if(packaged){validateSubjectEmbeddingFit(packaged,scope);subjectEmbeddingCache.set(scope.context,packaged);return packaged;}
 const assets=typeof BUNDLE_PACK==='undefined'?null:BUNDLE_PACK.subjectEmbeddings;
 const key=assets?.contexts?.[scope.context];if(!key)return null;
 if(assets.version!==1)throw Error('Unsupported packaged joint embeddings');
 let saved=subjectEmbeddingDecoded.get(key);
 if(!saved){
  const source=assets.fits[key];
  if(!source&&Object.hasOwn(assets.deferredFits||{},key))return null;
  if(!source||source.coordinateEncoding!=='float64-le-base64')throw Error('Invalid packaged joint embedding');
  const coords=decodeSavedCoordinates(source);
  const {coordinates,coordinateEncoding,...metadata}=source;
  saved={...metadata,coords};subjectEmbeddingDecoded.set(key,saved);
 }
 const fit=validateSubjectEmbeddingFit({...saved,context:scope.context},scope);
 subjectEmbeddingCache.set(scope.context,fit);return fit;
}
async function getSubjectEmbedding(scope){
 if(typeof datasetMaxNormalizedSubject==='function'&&datasetMaxNormalizedAsset()&&maxNormalizedIds.includes(el('sampleEmbedding').value))return datasetMaxNormalizedSubject(scope);
 if(participantData()?.capabilities?.jointEmbedding===false)throw Error('Joint embedding generation is disabled for this reviewed reference-only dataset.');
 // Capture the exact prepared asset before yielding. Never treat a deferred
 // fit as absent and fall through to numerical generation.
 const revision=datasetSwitchRevision,id=META.id;
 if(!subjectEmbeddingCache.has(scope.context)){
  const display=datasetRegistry.get(id).cohortAnalysis?.combDisplay&&activeStateMode==='merged';
  const role=display?'combDisplay':'subjectEmbeddings',asset=BUNDLE_PACK[role];
  const key=display?combSubjectFitKey(scope):asset?.contexts?.[scope.context];
  await ensurePreparedFit(id,role,key,asset);
  if(revision!==datasetSwitchRevision||id!==META.id)throw Error('The selected view changed while loading joint coordinates.');
 }
 const saved=savedSubjectEmbedding(scope);if(saved)return saved;
 if(subjectEmbeddingPending.has(scope.context))return subjectEmbeddingPending.get(scope.context);
 const d=participantData(),b=datasetRegistry.get(META.id);
 const request={context:scope.context,profiles:scope.profiles,features:d.features.length,compositions:scope.profiles.map(p=>d.compositions[p]),initial:scope.profiles.map(p=>b.data.samples.coords[p])};
 const promise=(async()=>{
  const response=await fetch('/api/subject-embedding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  const fit=await response.json();if(!response.ok)throw Error(fit.error||'Joint embedding service unavailable');
  validateSubjectEmbeddingFit(fit,scope);subjectEmbeddingCache.set(scope.context,fit);return fit;
 })();
 subjectEmbeddingPending.set(scope.context,promise);
 try{return await promise}finally{subjectEmbeddingPending.delete(scope.context)}
}
function subjectEmbeddingAnnotations(scope,fit){
 if(!participant.showVertices)return [];
 const data=participantData(),bundle=datasetRegistry.get(META.id),ids=[...new Set(scope.states.filter(Boolean).flatMap(s=>bundle.cohortAnalysis?.combDisplay&&BUNDLE_PACK.combDisplay.rank1[s]?[BUNDLE_PACK.combDisplay.rank1[s]]:s.split(',').map(Number)))];
 return ids.map(id=>{
  let best=-1,maximum=-1;
  scope.profiles.forEach((p,i)=>{const value=data.compositions[p].find(v=>v[0]===id-1)?.[1]??0;if(value>maximum){best=i;maximum=value}});
  const p=fit.coords[best],name=taxonDisplayLabel(bundle.data.featureNames[id]);
  return {x:p[0],y:p[1],z:p[2],name:'participant-reference-vertex:'+id,text:esc(`${name} (${fmt(100*maximum)}%)`),showarrow:false,captureevents:false,xanchor:'center',yanchor:'bottom',yshift:12,bgcolor:'rgba(255,255,255,.85)',font:{family:'Arial, sans-serif',size:participant.vertexLabelSize,color:'#24414c'}};
 });
}
function captureSubjectEmbeddingFit(){
 if(typeof jointEmbeddingActive==='function'&&jointEmbeddingActive())return null;
 if(!participant.active||participant.embeddingMode!=='union')return null;
 const scope=currentSubjectEmbeddingScope();return copyCamera(validateSubjectEmbeddingFit(savedSubjectEmbedding(scope),scope));
}
function validateNamedSubjectEmbedding(view,bundle){
 if(view.selection?.jointRepresentation?.choice==='profiles'){if(view.subjectEmbeddingFit!=null)throw Error('Unexpected taxonomic local fit in a joint-profile view');return}
 const p=view.selection?.participant;
 if(p?.active&&p.embeddingMode==='union'){
  const d=BUNDLE_PACK.participants[view.dataset],scope=subjectEmbeddingScope(bundle,d,view.cohort,view.stateMode,view.coverage,p.key);
  if(view.subjectEmbeddingFit?.maxNormalizedRevision&&view.selection.embedding?.replace(/-local$/,'')!=='maxnorm-'+view.subjectEmbeddingFit.metric)throw Error('Named joint fit uses a different normalization or metric.');
  if(view.selection.embedding?.startsWith('maxnorm-')&&!view.subjectEmbeddingFit?.maxNormalizedRevision)throw Error('Named joint fit is missing its max-normalized provenance.');
  validateSubjectEmbeddingFit(view.subjectEmbeddingFit,scope);
 }else if(view.subjectEmbeddingFit!=null)throw Error('Unexpected joint embedding in this named view');
}
function restoreSubjectEmbeddingFit(view){if(view.subjectEmbeddingFit&&!view.subjectEmbeddingFit.maxNormalizedRevision)subjectEmbeddingCache.set(view.subjectEmbeddingFit.context,copyCamera(view.subjectEmbeddingFit))}

// Decode the exact little-endian doubles without per-byte iterator callbacks.
function decodeSavedCoordinates(source){
 const binary=atob(source.coordinates),bytes=new Uint8Array(binary.length);
 if(bytes.length!==source.profiles.length*24)throw Error('Incomplete packaged joint coordinates');
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const view=new DataView(bytes.buffer);
 return source.profiles.map((_,i)=>[view.getFloat64(i*24,true),view.getFloat64(i*24+8,true),view.getFloat64(i*24+16,true)]);
}
async function ensurePreparedFit(id,role,key,asset){
 if(!key||asset?.fits?.[key])return;
 if(typeof VME_ASSETS==='undefined'||!Object.hasOwn(asset?.deferredFits||{},key))throw Error('Missing packaged joint embedding');
 const part=await VME_ASSETS.fitChunk(id,role,asset.deferredFits[key]);
 if(Object.keys(part).length!==1||!part[role]?.fits?.[key])throw Error('Prepared fit fragment does not match its index');
 // Preserve the baseline display object used by comparison/restoration code.
 Object.assign(asset.fits,part[role].fits);
}
async function ensureAllPreparedFits(id,role,asset){
 const keys=Object.keys(asset?.deferredFits||{}),chunks=new Map();
 for(const key of keys)if(!asset.fits[key])chunks.set(asset.deferredFits[key],key);
 const representatives=[...chunks.values()];
 for(let i=0;i<representatives.length;i+=4)await Promise.all(representatives.slice(i,i+4).map(key=>ensurePreparedFit(id,role,key,asset)));
}
