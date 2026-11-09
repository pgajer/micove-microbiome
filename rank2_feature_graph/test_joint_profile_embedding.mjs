// Focused representation/search checks; synthetic data, no numerical fitting.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fields=[{label:'Any incident STI',featureId:'sti',categoryId:'clinical'},{label:'IL-1 beta',featureId:'il1',categoryId:'immune'},{label:'STI history',featureId:'history',categoryId:'clinical'}];
const data={format:'micove-joint-profile-embedding',version:1,id:'test',datasetId:'synthetic',catalogueRevision:'one',sampleOrderSha256:'sha',recordIndices:[0,1,3],coordinates:[[1,2,3],[4,5,6],[7,8,9]],profileScores:[[10,20],[20,30],[30,40]],snapshot:{scope:{participants:2},clusters:[{id:1,members:[0]},{id:2,members:[1]}]},excludedRecords:1,sampleCount:4};
const asset={datasetId:'synthetic',revision:'one',sampleOrderSha256:'sha',profileEmbeddings:[{id:'test',sha256:'frozen',http:{}}]},storage=new Map(),nodes=new Map();
const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:id==='sampleTitle'?'Selected state':'',dataset:{}});return nodes.get(id)};
let samples=[];
const ctx=vm.createContext({console,el,estimateAsset:()=>asset,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},VME_ASSETS:{group:async()=>structuredClone(data)},estimateModel:()=>({recordIndices:new Map([[10,0],[11,1],[12,2],[13,3]])}),estimateIndex:i=>i,participant:{active:false,arrowScale:1},updateSampleContext:ii=>{samples=ii},copyCamera:x=>structuredClone(x),readCamera:()=>null});
vm.runInContext(fs.readFileSync(new URL('./joint_profile_embedding.js',import.meta.url),'utf8'),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(ctx.jointFeatureMatches(fields,'any STI')).map(x=>x.index),[0]);
assert.deepEqual(plain(ctx.jointFeatureMatches(fields,'il 1')).map(x=>x.index),[1]);
assert.deepEqual(plain(ctx.jointFeatureMatches(fields,'unmatched')),[]);
assert.equal(ctx.jointEmbeddingActive(),false);
const source=[{type:'scatter3d',mode:'markers',x:[9,8,7,6],y:[8,7,6,5],z:[7,6,5,4],ids:['0','1','2','3'],customdata:['a','b','c','d'],text:['A','B','C','D'],marker:{color:['red','blue','green','yellow'],size:[2,3,4,5]},meta:{sampleView:'selection'}},{type:'scatter3d',meta:{referenceVertices:true},x:[99],y:[99],z:[99]}];
const frozen=JSON.stringify(source),layout={uirevision:'selection',scene:{annotations:[{name:'endpoint'}],xaxis:{range:[-1,1]}}};
assert.equal(ctx.jointEmbeddingTransform(source,layout).traces,source);
ctx.jointEmbeddingRestore({id:'test',choice:'profiles'});await ctx.jointEmbeddingEnsure();
const transformed=ctx.jointEmbeddingTransform(source,layout);
assert.equal(JSON.stringify(source),frozen,'Existing traces are unchanged');
assert.equal(layout.scene.annotations.length,1,'Existing layout is unchanged');
assert.equal(transformed.traces.length,1,'Taxonomic references are not moved into an unrelated space');
assert.deepEqual(plain(transformed.traces[0].x),[1,4,7]);
assert.deepEqual(plain(transformed.traces[0].ids),['0','1','3']);
assert.deepEqual(plain(transformed.traces[0].marker.color),['red','blue','yellow']);
assert.deepEqual(plain(transformed.traces[0].meta.jointProfileRecords),[0,1,3]);
assert.deepEqual(plain(samples),[0,1,3]);
assert.equal(transformed.layout.scene.xaxis.autorange,true);
assert.match(el('sampleStatus').textContent,/1 requested visits lack/);
ctx.participant.active=true;
const participant=ctx.jointEmbeddingTransform([{type:'scatter3d',mode:'markers',x:[0,0],y:[0,0],z:[0,0],meta:{legendRecords:[10,13]},marker:{color:'red'}},{type:'scatter3d',mode:'lines',x:[0,1],y:[0,1],z:[0,1],meta:{profileSegment:[10,13]}},{type:'cone',meta:{profileSegment:[10,13]}}],layout);
assert.deepEqual(plain(participant.traces[0].x),[1,7]);
assert.deepEqual(plain(participant.traces[1].x),[1,7]);
assert.ok(participant.traces[2].sizeref>0);
assert.deepEqual(plain(participant.traces[0].meta.legendRecords),[10,13]);
const ring=ctx.jointEmbeddingTransform([{type:'scatter3d',mode:'markers',x:[0],y:[0],z:[0],meta:{profileRecords:[13]},marker:{color:'black'}}],layout).traces[0];
assert.deepEqual(plain(ring.x),[7]);assert.equal(ring.marker.color,'black');assert.equal(ring.meta.legendRecords,undefined,'Selection ring remains outside estimate recoloring');
assert.throws(()=>ctx.jointEmbeddingRestore({id:'different',choice:'profiles'}),/original joint-profile supplement/);
ctx.jointEmbeddingRestore({id:'test',choice:'composition'});
assert.equal(ctx.jointEmbeddingTransform(source,layout).traces,source);
assert.equal(JSON.stringify(source),frozen);
const saved=JSON.parse([...storage.values()][0]);assert.equal(saved.choice,'composition');
console.log('PASS: joint-profile identity, selection/trajectory mapping, unsupported visits, feature search, persistence and unchanged existing coordinates');

// Independent representations retain their own coordinates, cameras and identity.
const outcomeExcluded={...structuredClone(data),id:'excluded',coordinates:[[11,12,13],[14,15,16],[17,18,19]],snapshot:{...data.snapshot,exclusionPolicy:{id:'excluded-v1'}}};
asset.profileEmbeddings.push({id:'excluded',sha256:'new',http:{}});
ctx.VME_ASSETS.group=async key=>structuredClone(key.endsWith(':new')?outcomeExcluded:data);
ctx.jointEmbeddingRestore({id:'excluded',choice:'profiles'});await ctx.jointEmbeddingEnsure();
assert.equal(ctx.jointEmbeddingSnapshot().id,'excluded');assert.deepEqual(plain(ctx.jointEmbeddingModel().data.coordinates),outcomeExcluded.coordinates);
const excludedTraces=ctx.jointEmbeddingTransform(source,layout).traces;
assert.deepEqual(plain(excludedTraces[0].ids),plain(transformed.traces[0].ids),'Switching representations retains selected samples');
assert.deepEqual(plain(excludedTraces[0].marker),plain(transformed.traces[0].marker),'Switching representations retains colors and appearance');
assert.match(ctx.jointEmbeddingInterpretation(ctx.jointEmbeddingModel().data),/excluded.*available for coloring/);
ctx.jointEmbeddingRestore({id:'test',choice:'profiles'});await ctx.jointEmbeddingEnsure();
assert.deepEqual(plain(ctx.jointEmbeddingModel().data.coordinates),data.coordinates,'Original map remains byte-equivalent after switching');
assert.equal(ctx.jointEmbeddingSnapshot().id,'test');
console.log('PASS: multiple frozen representations, saved identity, separate coordinate caches and original map preservation.');

const equalGroups={...structuredClone(outcomeExcluded),id:'excluded-groups',weighting:'groups',coordinates:[[21,22,23],[24,25,26],[27,28,29]]};
asset.profileEmbeddings.push({id:'excluded-groups',sha256:'groups',http:{}});
ctx.VME_ASSETS.group=async key=>structuredClone(key.endsWith(':groups')?equalGroups:key.endsWith(':new')?outcomeExcluded:data);
ctx.jointEmbeddingRestore({id:'excluded-groups',choice:'profiles'});await ctx.jointEmbeddingEnsure();
const groupTraces=ctx.jointEmbeddingTransform(source,layout).traces;
assert.deepEqual(plain(groupTraces[0].x),[21,24,27]);
assert.deepEqual(plain(groupTraces[0].ids),plain(excludedTraces[0].ids));
assert.deepEqual(plain(groupTraces[0].marker),plain(excludedTraces[0].marker),'Profile weighting preserves current coloring');
assert.equal(ctx.jointEmbeddingWeightingLabel(equalGroups),'Equal feature-group weights');
assert.equal(ctx.jointEmbeddingWeightingLabel(outcomeExcluded),'Equal feature weights');
ctx.jointEmbeddingRestore({id:'excluded',choice:'profiles'});await ctx.jointEmbeddingEnsure();
assert.deepEqual(plain(ctx.jointEmbeddingModel().data.coordinates),outcomeExcluded.coordinates,'Equal-feature coordinates remain intact');
assert.equal(JSON.stringify(source),frozen);
console.log('PASS: independent equal-group map identity, coordinates, selection and color preservation.');

// Smoothed abundance maps use the same identity-safe selection/color adapter.
const smooth={...structuredClone(data),format:'micove-smoothed-phylotype-embedding',id:'smooth',
 coordinates:[[31,32,33],[34,35,36],[37,38,39]],profileScores:[[.8,.1],[.7,.2],[.6,.4]],
 featureIds:['a','b'],featureNames:['A','B'],K:40,participants:2,normalization:'max',
 postMaxNormalization:false,neighborMetric:'intrinsic-euclidean-faces',targetMetric:'linf'};
delete smooth.snapshot;
asset.smoothedEmbeddings=[{id:'smooth',sha256:'smoothed',http:{}}];
ctx.VME_ASSETS.group=async key=>structuredClone(key.endsWith(':smoothed')?smooth:data);
ctx.jointEmbeddingRestore({id:'smooth',choice:'profiles'});await ctx.jointEmbeddingEnsure();
const smoothTraces=ctx.jointEmbeddingTransform(source,layout).traces;
assert.deepEqual(plain(smoothTraces[0].x),[31,34,37]);
assert.deepEqual(plain(smoothTraces[0].ids),plain(transformed.traces[0].ids));
assert.deepEqual(plain(smoothTraces[0].marker),plain(transformed.traces[0].marker));
assert.equal(smoothTraces.length,1,'No invented taxonomic reference positions');
assert.match(ctx.smoothedEmbeddingNote(smooth),/face-aware intrinsic Euclidean neighbors/);
assert.match(ctx.smoothedEmbeddingNote(smooth),/L∞ MDS target/);
assert.match(ctx.smoothedEmbeddingTitle(smooth),/no post-normalization/);
assert.match(ctx.smoothedEmbeddingTitle({...smooth,postMaxNormalization:true}),/post-normalized/);
assert.match(el('sampleTitle').textContent,/Smoothed phylotypes/);
ctx.jointEmbeddingRestore({id:'test',choice:'profiles'});await ctx.jointEmbeddingEnsure();
assert.deepEqual(plain(ctx.jointEmbeddingModel().data.coordinates),data.coordinates);
assert.equal(JSON.stringify(source),frozen);
console.log('PASS: smoothed abundance representations preserve selections, colors and existing maps; smoothing and MDS metrics remain distinct.');

// Default ordering is independent of immutable catalogue order and explicit preferences.
const originalId='lsvf-joint39-euclidean-v1',excludedId='lsvf-joint-outcome-excluded-euclidean-v1';
const lsvf={datasetId:'lsvf-v3v4-20241111',revision:'v4',profileEmbeddings:[{id:originalId},{id:excludedId}]};
const prefix='micove-profile-representation:'+lsvf.datasetId+'@'+lsvf.revision;
function preferences(a=lsvf,entries=[]){
 const values=new Map(entries),context=vm.createContext({estimateAsset:()=>a,localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}});
 vm.runInContext(fs.readFileSync(new URL('./joint_profile_embedding.js',import.meta.url),'utf8'),context);
 return {context,values,model:context.jointEmbeddingModel()};
}
const fresh=preferences();
assert.equal(fresh.model.selectedId,excludedId);assert.equal(fresh.model.choice,'composition');
assert.deepEqual(plain(fresh.context.jointEmbeddingChoices()).map(d=>d.id),[excludedId,originalId]);
assert.deepEqual(lsvf.profileEmbeddings.map(d=>d.id),[originalId,excludedId],'Catalogue order remains unchanged');
const balancedId='lsvf-joint-outcome-excluded-equal-groups-euclidean-v1';
const threeMaps={...lsvf,profileEmbeddings:[{id:originalId},{id:excludedId,exclusionPolicyId:'policy'},{id:balancedId,exclusionPolicyId:'policy'}]};
const three=preferences(threeMaps);
assert.deepEqual(plain(three.context.jointEmbeddingChoices()).map(d=>d.id),[excludedId,balancedId,originalId]);
assert.equal(three.model.selectedId,excludedId,'Equal-feature outcome-excluded default remains unchanged');
const withSmooth={...threeMaps,smoothedEmbeddings:[{id:'smooth'}]};
assert.equal(preferences(withSmooth).model.selectedId,excludedId,'Adding smoothed maps preserves the existing default');
const smoothedSaved=preferences(withSmooth);
smoothedSaved.context.jointEmbeddingRestore({id:'smooth',choice:'profiles'});
assert.equal(preferences(withSmooth,[...smoothedSaved.values]).model.selectedId,'smooth');
three.context.jointEmbeddingRestore({id:balancedId,choice:'profiles'});
assert.equal(preferences(threeMaps,[...three.values]).model.selectedId,balancedId,'Equal-group choice persists separately');
for(const selectedId of [originalId,excludedId]){
 const saved={choice:'profiles',selectedId,cameras:{[selectedId]:{eye:{x:2,y:3,z:4}}}};
 const restored=preferences(lsvf,[[prefix+':representations',JSON.stringify(saved)]]);
 assert.equal(restored.model.selectedId,selectedId);assert.equal(restored.model.choice,'profiles');
 restored.context.jointEmbeddingSave();
 const reloaded=preferences(lsvf,[...restored.values]);
 assert.deepEqual(plain(reloaded.context.jointEmbeddingSnapshot()),{id:selectedId,choice:'profiles'});
 assert.deepEqual(plain(reloaded.model.cameras),saved.cameras);
}
const stale=preferences(lsvf,[[prefix+':representations',JSON.stringify({choice:'profiles',selectedId:'missing'})]]);
assert.equal(stale.model.selectedId,excludedId);assert.equal(stale.model.choice,'profiles');
const legacyCamera={eye:{x:3,y:2,z:1}},legacy=preferences(lsvf,[[prefix+':'+originalId,JSON.stringify({choice:'profiles',cameras:{profiles:legacyCamera}})]]);
assert.equal(legacy.model.selectedId,originalId);assert.equal(legacy.model.choice,'profiles');
assert.deepEqual(plain(legacy.model.cameras[originalId]),legacyCamera);
legacy.context.jointEmbeddingSave();
assert.equal(preferences(lsvf,[...legacy.values]).model.selectedId,originalId);
assert.equal(preferences({...lsvf,profileEmbeddings:[lsvf.profileEmbeddings[0]]}).model.selectedId,originalId);
assert.equal(preferences({...lsvf,datasetId:'other'}).model.selectedId,originalId);
assert.equal(preferences({...lsvf,profileEmbeddings:[]}).model,null);
fresh.context.jointEmbeddingRestore({id:originalId,choice:'profiles'});
assert.equal(fresh.model.selectedId,originalId,'Explicit named views retain the original map');
console.log('PASS: outcome-excluded LSVF default, legacy and explicit saved maps, camera persistence, catalogue preservation and other-dataset fallback.');

// The method menu defaults to direct averages, while saved alternatives remain exact.
const smoothedVariants=['l1-euclidean','max-raw-euclidean','max-post-euclidean','max-raw-linf','max-post-linf'];
const smoothedDescriptors=smoothedVariants.map(variant=>({id:'lsvf-smoothed-k40-'+variant+'-v1',label:'Smoothed phylotypes · '+variant+(variant.includes('raw')?' · No post-normalization':''),sha256:variant,http:{}}));
const allMaps={...threeMaps,smoothedEmbeddings:smoothedDescriptors};
const menus=preferences(allMaps),unchangedCatalogue=JSON.stringify(allMaps);
assert.deepEqual(plain(menus.context.jointEmbeddingMenuChoices()).map(d=>d.id),[excludedId,balancedId,originalId,...smoothedDescriptors.filter(d=>!d.id.includes('-post-')).map(d=>d.id)]);
assert.equal(JSON.stringify(allMaps),unchangedCatalogue);
assert.equal(menus.model.selectedId,excludedId,'Global joint-profile default remains unchanged');
for(const metric of ['euclidean','linf']){
 const raw='lsvf-smoothed-k40-max-raw-'+metric+'-v1',post=raw.replace('-raw-','-post-');
 assert.equal(menus.context.smoothedEmbeddingPair(post).raw.id,raw);
 const restored=preferences(allMaps,[[prefix+':representations',JSON.stringify({choice:'profiles',selectedId:post})]]);
 assert.equal(restored.model.selectedId,post,'Explicit saved post-normalized choice is reproducible');
 restored.context.jointEmbeddingRestore({id:post,choice:'profiles'});
 assert.equal(restored.context.jointEmbeddingSnapshot().id,post,'Named post-normalized views remain exact');
}
const incomplete={...allMaps,smoothedEmbeddings:smoothedDescriptors.filter(d=>!d.id.includes('-raw-'))};
assert.deepEqual(plain(preferences(incomplete).context.jointEmbeddingMenuChoices()).map(d=>d.id),[excludedId,balancedId,originalId,...incomplete.smoothedEmbeddings.map(d=>d.id)],'An unpaired alternative is not hidden');

// Exercise the real menu and checkbox handlers with identity-tagged sample traces.
asset.smoothedEmbeddings=smoothedDescriptors;
const variantData=Object.fromEntries(smoothedDescriptors.map((d,i)=>[d.sha256,{...structuredClone(smooth),id:d.id,normalization:i?'max':'l1',postMaxNormalization:d.id.includes('-post-'),targetMetric:d.id.includes('linf')?'linf':'euclidean',coordinates:smooth.coordinates.map(p=>p.map(v=>v+i))}]));
ctx.VME_ASSETS.group=async key=>structuredClone(variantData[key.split(':').at(-1)]||data);
const ui=new Map();
class Node{
 constructor(id=''){this.id=id;this.dataset={};this.children=[];this.hidden=false;this.checked=false}
 set innerHTML(text){this.html=text;for(const match of text.matchAll(/id="([^"]+)"/g))ui.set(match[1],new Node(match[1]))}
 prepend(node){this.children.unshift(node);ui.set(node.id,node)}
 append(node){this.children.push(node)}
 replaceChildren(...nodes){this.children=nodes}
 closest(){return this.parent??={hidden:false}}
}
for(const id of ['sampleViewControls','sampleMethod','unfoldFaces','unfoldAnchor','participantEmbeddingMode','sampleStatus','sampleTitle'])ui.set(id,new Node(id));
ctx.el=id=>ui.get(id)||null;
ctx.document={createElement:()=>new Node(),head:new Node()};
ctx.syncEmbeddingChoices=()=>{};ctx.defaultCamera={eye:{x:1,y:1,z:1}};
let rendered;
ctx.refreshSamples=async()=>{await ctx.jointEmbeddingEnsure();rendered=ctx.jointEmbeddingTransform(source,layout);ctx.jointEmbeddingSync()};
ctx.jointEmbeddingSync();
for(const metric of ['euclidean','linf']){
 const raw='lsvf-smoothed-k40-max-raw-'+metric+'-v1',post=raw.replace('-raw-','-post-'),select=ui.get('sampleRepresentation'),box=ui.get('smoothedPostNormalize');
 select.value=raw;await select.onchange();
 assert.equal(ctx.jointEmbeddingSnapshot().id,raw);assert.equal(box.checked,false);assert.equal(ui.get('smoothedPostNormalizeControl').hidden,false);
 const before=plain(rendered.traces[0]);
 box.checked=true;await box.onchange();
 assert.equal(ctx.jointEmbeddingSnapshot().id,post);assert.equal(select.value,raw);assert.equal(box.checked,true);
 assert.deepEqual(plain(rendered.traces[0].ids),before.ids);assert.deepEqual(plain(rendered.traces[0].marker),before.marker);
 assert.notDeepEqual(plain(rendered.traces[0].x),before.x,'Checkbox changes coordinates to the saved alternative');
 ctx.jointEmbeddingRestore({id:post,choice:'profiles'});ctx.jointEmbeddingSync();assert.equal(box.checked,true);
 box.checked=false;await box.onchange();assert.equal(ctx.jointEmbeddingSnapshot().id,raw);assert.deepEqual(plain(rendered.traces[0].x),before.x);
 box.checked=true;await box.onchange();
}
ui.get('sampleRepresentation').value='lsvf-smoothed-k40-l1-euclidean-v1';await ui.get('sampleRepresentation').onchange();
assert.equal(ui.get('smoothedPostNormalizeControl').hidden,true,'L1 has no post-max-normalization control');
ui.get('sampleRepresentation').value='composition';await ui.get('sampleRepresentation').onchange();
assert.equal(ui.get('smoothedPostNormalizeControl').hidden,true);assert.equal(rendered.traces,source);
assert.equal(JSON.stringify(source),frozen);
console.log('PASS: default direct averages, optional post-normalization, menu/checkbox handlers, saved alternatives, stable sample IDs and coloring.');

// Observed reference specimens are positioned by exact identity in each map.
// Deliberately wrong source rows/coordinates must never leak into new maps.
const referenceNodes=[{id:1,label:'Taxon A',anchor_id:'specimen-a',anchor_row:999,maximum:97},{id:2,label:'Taxon B',anchor_id:'specimen-d',anchor_row:998,maximum:82},{id:3,label:'Taxon C',anchor_id:'specimen-a',maximum:3},{id:4,label:'Unsupported taxon',anchor_id:'specimen-c',maximum:60}];
ctx.current=()=>({nodes:referenceNodes});ctx.esc=String;ctx.fmt=String;
ctx.estimateModel=()=>({ids:new Map([['specimen-a',0],['specimen-b',1],['specimen-c',2],['specimen-d',3]]),recordIndices:new Map([[10,0],[11,1],[12,2],[13,3]])});
ctx.participant.active=false;ctx.participant.showVertices=true;ctx.participant.vertexLabelSize=16;
const refsOnly={type:'scatter3d',meta:{referenceVertices:true},customdata:['endpoint-vertices:1,2,3,4'],x:[99],y:[99],z:[99]};
const selectedSource=[{...source[0],ids:['1'],x:[8],y:[7],z:[6],marker:{color:['blue'],size:[3]}},refsOnly];
ctx.jointEmbeddingRestore({id:'test',choice:'profiles'});await ctx.jointEmbeddingEnsure();
const selectedReferences=ctx.jointEmbeddingTransform(selectedSource,layout),refTrace=selectedReferences.traces.find(t=>t.meta?.jointReference);
assert.deepEqual(plain(refTrace.x),[1,7],'References use the correct saved map, including specimens outside selection');
assert.deepEqual(plain(refTrace.customdata),['endpoint-vertices:1,3','endpoint-vertices:2'],'One marker per specimen; keep both taxon identities');
assert.deepEqual(plain(selectedReferences.layout.scene.annotations.map(a=>a.name)),['endpoint-vertex:1','endpoint-vertex:3','endpoint-vertex:2']);
assert.equal(selectedReferences.layout.scene.annotations[0].font.size,16);
assert.match(refTrace.text[0],/original observed taxon abundances.*not smoothed/);
assert.deepEqual(plain(ctx.jointEmbeddingModel().displayed),[1],'Reference specimens never enter distance-error or sample-count populations');
assert.deepEqual(plain(samples),[1]);assert.deepEqual(plain(selectedReferences.traces[0].marker),{color:['blue'],size:[3]});
assert.deepEqual(plain(ctx.jointEmbeddingModel().references),{available:3,total:4,missing:['Unsupported taxon']});
ctx.participant.showVertices=false;
const hiddenReferences=ctx.jointEmbeddingTransform(selectedSource,layout);
assert.equal(hiddenReferences.traces.find(t=>t.meta?.jointReference).visible,false);assert.equal(hiddenReferences.layout.scene.annotations.length,0);
assert.equal(ctx.jointEmbeddingModel().references.available,3,'References remain available while hidden');
ctx.participant.showVertices=true;ctx.participant.active=true;
const participantReferences=ctx.jointEmbeddingTransform([{type:'scatter3d',x:[0],y:[0],z:[0],meta:{legendRecords:[11]}}],{scene:{annotations:[]}});
assert.equal(participantReferences.layout.scene.annotations.length,3,'Participant mode can restore references without existing labels');
assert.deepEqual(plain(ctx.jointEmbeddingModel().displayed),[1]);
ctx.participant.active=false;
const limited=ctx.jointEmbeddingReferences([refsOnly],{scene:{annotations:[]}});
assert.equal(limited.traces[0].visible,true);
const edgeRefs=ctx.jointEmbeddingReferences([{...refsOnly,customdata:['endpoint-vertices:2']}],{scene:{annotations:[]}});
assert.deepEqual(plain(edgeRefs.traces[0].x),[7],'Edge views keep the requested endpoint references');
ctx.VME_ASSETS.group=async key=>structuredClone(key.endsWith(':smoothed')?smooth:data);
asset.smoothedEmbeddings.push({id:'smooth',sha256:'smoothed',http:{}});
ctx.jointEmbeddingRestore({id:'smooth',choice:'profiles'});await ctx.jointEmbeddingEnsure();
const smoothReferences=ctx.jointEmbeddingTransform(selectedSource,layout);
assert.deepEqual(plain(smoothReferences.traces.find(t=>t.meta?.jointReference).x),[31,37]);
assert.deepEqual(plain(smoothReferences.traces[0].ids),['1']);
assert.deepEqual(plain(smoothReferences.traces[0].marker),{color:['blue'],size:[3]});
const referenceNote={dataset:{},textContent:"No references",hidden:true};ui.set("sampleReferenceNote",referenceNote);
let referenceAvailable;
ctx.syncSampleAppearanceControls=available=>{referenceAvailable=available};
ctx.jointEmbeddingAfterRender();assert.equal(referenceAvailable,true);assert.equal(referenceNote.hidden,false);
assert.match(referenceNote.textContent,/Unsupported taxon.*omitted/);
assert.equal(JSON.stringify(source),frozen);assert.equal(refsOnly.x[0],99);
console.log('PASS: observed reference identities, saved-map coordinates, missing-reference disclosure, selection/color/count preservation, participant mode and visibility.');
