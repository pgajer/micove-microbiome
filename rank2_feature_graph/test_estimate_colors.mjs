import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',options:[],textContent:'',hidden:false,setAttribute(){}});return elements.get(id)};
el('sampleColorScheme').value='estimate:assay';
const records=[{id:'one',index:10,profile:0},{id:'two',index:20,profile:1},{id:'three',index:30,profile:2}];
const asset={datasetId:'test',revision:'pilot',sampleIds:records.map(r=>r.id),sampleCount:3,categories:[{id:'assay',label:'Assay'}],features:[{id:'f',categoryId:'assay',label:'Target'}],seriesDefaults:{geometryId:'original'},series:[{id:'a',featureId:'f',shardId:'one',quantityLabel:'Mean',unit:'units',valueDomain:'real'},{id:'b',featureId:'f',shardId:'two',quantityLabel:'Probability',unit:'probability',valueDomain:'probability'}],shards:[{id:'one',http:{url:'one'}},{id:'two',http:{url:'two'}}],statusCodes:{unknown_participant:'Unknown participant'}};
const data={records,samples:{coords:[[0,1,2],[1,2,3],[4,5,6]]}};
const plot={data:[{mode:'markers',meta:{sampleView:'key'},ids:['0','1','2'],x:[0,1,4],y:[1,2,5],z:[2,3,6],text:['original one','original two','original three'],marker:{color:['red','blue','green']},hovertemplate:'%{text}'},{mode:'markers+text',meta:{legendRecords:[20]},text:['V1'],hovertext:['original participant hover'],marker:{color:'blue'},x:[1],y:[2],z:[3]},{mode:'markers',meta:{reference:true},marker:{color:'red'},x:[8],y:[9],z:[10]}],layout:{scene:{camera:{eye:{x:2,y:1,z:3}}}}};
elements.set('samples',plot);
const replies=new Map(),calls=[];
const context={console,Map,WeakMap,Set,Number,JSON,Object,Array,Math,String,el,META:{id:'test'},BUNDLE_PACK:{estimateCatalogues:{test:asset},participants:{test:{records}}},DATA:data,
 localStorage:{getItem:()=>null,setItem(){}},sampleColorMode:()=>el('sampleColorScheme').value,esc:x=>String(x),
 VME_ASSETS:{group:async(key,entry)=>replies.get(entry.parts[0].url)},Plotly:{restyle:async(p,updates,indices)=>{calls.push({updates,indices});for(const i of indices)for(const [key,value] of Object.entries(updates)){if(key==='hovertext')p.data[i][key]=value[0];else if(key==='marker.color')p.data[i].marker.color=value[0];else p.data[i][key]=value}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('estimate_colors.js',import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
assert.deepEqual(Array.from(run('estimateLimits([null,-2,0,2],false)')),[-2,2]);
assert.equal(run('estimateColor(null,[0,1])'),'#9ca3af');
assert.notEqual(run('estimateColor(0,[0,1])'),'#9ca3af');
assert.equal(run('estimateColor(-1,[0,1])'),run('estimateColor(0,[0,1])'));
assert.equal(run('estimateColor(2,[0,1])'),run('estimateColor(1,[0,1])'));
assert.equal(run('estimateValueText(1,{valueDomain:"probability"})'),'100%');
assert.equal(run('estimateValueText(0,{valueDomain:"probability"})'),'0%');
assert.equal(run('estimateValueText(1e-12,{valueDomain:"probability"})'),'0.0000000001%');

const shard=(id,values)=>({datasetId:'test',catalogueRevision:'pilot',sampleOrderSha256:asset.sampleOrderSha256,series:{[id]:{values,status:['ok','ok','unknown_participant'],support:{participantCount:[10,10,null]}}}});
replies.set('one',shard('a',[0,-2,null]));replies.set('two',shard('b',[.2,.8,null]));
const unchanged=JSON.stringify({data,coords:plot.data.map(t=>[t.x,t.y,t.z,t.text,t.meta]),layout:plot.layout});
assert.equal(await run('estimateEnsure()'),true);
assert.equal(run('estimateIndex(1)'),1);
assert.deepEqual(Array.from(run('estimateTraceIndices(el("samples").data[1])')),[1]);
assert.equal(run('estimateTraceIndices(el("samples").data[2])'),null);
await run('estimateDecorateTraces()');
assert.match(plot.data[0].hovertext[0],/original one.*estimate/);
assert.match(plot.data[0].hovertext[2],/Unknown participant/);
assert.equal(plot.data[1].text[0],'V1');
assert.equal(plot.data[2].hovertext,undefined);
assert.equal(unchanged,JSON.stringify({data,coords:plot.data.map(t=>[t.x,t.y,t.z,t.text,t.meta]),layout:plot.layout}));
el('sampleColorScheme').value='pure';await run('estimateEnsure()');await run('estimateDecorateTraces()');
assert.equal(plot.data[0].hovertemplate,'%{text}');assert.equal(plot.data[1].hovertext[0],'original participant hover');

// A slower previous choice must not replace the newer field.
el('sampleColorScheme').value='estimate:assay';run('estimateModel().rows.clear();estimateModel().choices.assay="a"');
let release;replies.set('one',new Promise(resolve=>{release=resolve}));
const pending=run('estimateEnsure()');run('estimateModel().choices.assay="b"');await run('estimateEnsure()');release(shard('a',[0,-2,null]));
assert.equal(await pending,false);assert.equal(run('estimateCurrent().series.id'),'b');
// Fixed limits are derived from the full field, independent of a displayed subset.
Array.from(run('estimateLimitsCached(estimateCurrent())')).forEach((v,i)=>assert.ok(Math.abs(v-[.215,.785][i])<1e-12));
context.META={id:'unaffected'};assert.equal(run('estimateActive()'),false);
console.log('PASS: zero/null, negative and probability fields, full-field limits, identity mapping, preserved coordinates/camera/reference/visit labels, hover restoration and stale-load rejection.');

// Exercise the shared recoloring entry point with the catalogue hooks active.
context.META={id:'test'};
context.datasetRegistry=new Map([['test',{data:{samples:{pair:['a','b','c']}}}]]);
context.participant={stateBackground:true,sampleColors:true};
context.participantData=()=>({records});
context.renderCountedSampleLegend=()=>{};
vm.runInContext(fs.readFileSync(new URL('valencia2.js',import.meta.url),'utf8'),context);
run('syncSampleColorOptions=()=>{};syncValenciaControls=()=>{}');
const selected={edge:'a',members:[0,1]},selectedBefore=JSON.stringify(selected);
context.selection=selected;
await run('recolorSampleView()');
assert.equal(plot.data[0].marker.color[0],run('estimatePointColor(0)'));
assert.equal(plot.data[0].marker.color[2],'#9ca3af');
assert.equal(plot.data[1].marker.color[0],run('estimatePointColor(1)'));
assert.equal(plot.data[2].marker.color,'red');
assert.equal(unchanged,JSON.stringify({data,coords:plot.data.map(t=>[t.x,t.y,t.z,t.text,t.meta]),layout:plot.layout}));
assert.equal(JSON.stringify(selected),selectedBefore);
assert.ok(calls.every(c=>Object.keys(c.updates).every(k=>['marker.color','hovertext','hovertemplate'].includes(k))));
console.log('PASS: shared recoloring entry point changes only sample marker colors and hover fields, preserving selection, coordinates, camera and references.');
