import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const data={revision:'c1',fields:[
 {featureId:'a',label:'One, "quoted"',categoryId:'x',transformationLabel:'Log',transformationId:'log',seriesIds:{40:'a40'}},
 {featureId:'b',label:'Two',categoryId:'y',transformationLabel:'Raw',transformationId:'raw',seriesIds:{40:'b40'}},
 {featureId:'c',label:'Three',categoryId:'x',transformationLabel:'Raw',transformationId:'raw',seriesIds:{40:'c40'}},
 {featureId:'d',label:'Constant',categoryId:'y',transformationLabel:'Raw',transformationId:'raw',seriesIds:{40:'d40'}}
]};
// A-B .9 and B-C .8 must not chain A-C .2 into one cluster at .7.
const bank={featureIndices:[0,1,2],correlations:[.9,.2,.8],linkage:[[0,1,.1,2],[2,3,.8,3]],order:[2,0,1],excluded:[{featureIndex:3,reason:'Constant estimate field'}],k:40,unit:'visits',method:'spearman',records:9,participants:5};
const asset={datasetId:'synthetic',revision:'v1',sampleOrderSha256:'hash',correlations:data};
const element={value:'original'},model={bySeries:new Map([['a40',{}]]),choices:{}};
const selection={state:'existing',ids:[1,2]},coordinates=[[1,2,3],[4,5,6]],before=JSON.stringify({selection,coordinates});let recolors=0;
const context={console,Map,WeakMap,Set,Number,Math,JSON,Array,estimateAsset:()=>asset,el:()=>element,
 estimateModel:()=>model,syncSampleColorOptions(){},estimateSave(){},recolorSampleView:async()=>{recolors++},selection,coordinates};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('estimate_correlations.js',import.meta.url),'utf8'),context);
context.bank=bank;context.asset=asset;context.data=data;
const run=s=>vm.runInContext(s,context);
for(let i=0;i<3;i++)assert.equal(run(`estimateCorrelationValue(bank,${i},${i})`),1);
assert.equal(run('estimateCorrelationValue(bank,2,0)'),.2);
const labels=Array.from(run('estimateCorrelationClusters(bank,.7)'));
assert.equal(labels[0],labels[1]);assert.notEqual(labels[0],labels[2]);
assert.equal(new Set(run('estimateCorrelationClusters(bank,0)')).size,1);
assert.equal(new Set(run('estimateCorrelationClusters(bank,1)')).size,3);
run('estimateCorrelationShown={asset,data,bank,descriptor:{id:"40-visits-spearman",sha256:"source"},labels:estimateCorrelationClusters(bank,.7),rows:[0,1],cols:[2],state:{k:40,unit:"visits",threshold:.7}}');
const files=run('estimateCorrelationFiles(estimateCorrelationShown)');
assert.equal(files.length,5);assert.match(files[0].text, /"row_feature_id","c"/);
assert.match(files[0].text, /"a","0.2"/);assert.match(files[1].text,/"One, ""quoted"""/);
assert.match(files[1].text,/"d","Constant".*"","false","Constant estimate field"/);
assert.equal(JSON.parse(files[2].text).participants,5);
await run('estimateCorrelationSelect(0)');
assert.equal(element.value,'estimate:x');assert.equal(model.choices.x,'a40');assert.equal(recolors,1);
assert.equal(JSON.stringify({selection,coordinates}),before);
assert.match(run('estimateCorrelationMethodsHtml()'),/<math>/);
console.log('PASS: packed matrix, non-chaining complete-linkage threshold, exports, undefined constants, formulas and recolor-only selection.');

// Graph membership follows the active cohort and visible incident states, not context traces.
context.localStorage={getItem:()=>null,setItem(){}};
asset.categories=[{id:'x'},{id:'y'}];asset.sampleIds=['a','b','c','d'];
model.ids=new Map(asset.sampleIds.map((id,i)=>[id,i]));
context.META={id:'synthetic',populationName:'Current cohort'};
context.DATA={records:asset.sampleIds.map(id=>({id})),samples:{pair:['1,2','1,3','2,3','1,2']}};
context.eligibleIndices=()=>[0,1,2];context.selected='1,2';context.selectedVertex=null;
context.current=()=>({nodes:[{id:1,label:'Anchor'}],edges:[{id:'1,2',label:'A + B'}]});
context.visibleIncidentEdges=()=>[{id:'1,2'},{id:'1,3'}];
context.el=id=>id==='coverage'?{value:'70'}:id==='cohortSelect'?{value:'cohort'}:element;
assert.deepEqual(Array.from(run('estimateCorrelationScope().recordIndices')),[0]);
context.selected=null;context.selectedVertex=1;
assert.deepEqual(Array.from(run('estimateCorrelationScope().recordIndices')),[0,1]);
context.visibleIncidentEdges=()=>[{id:'1,3'}];
assert.deepEqual(Array.from(run('estimateCorrelationScope().recordIndices')),[1]);
run('estimateCorrelationState().follow=false');assert.equal(run('estimateCorrelationScope().kind'),'full');
run('estimateCorrelationState().follow=true');context.selectedVertex=null;
assert.equal(run('estimateCorrelationScope().kind'),'full');
console.log('PASS: selected edge/vertex membership, cohort restriction, hidden incident states and full-reference toggle.');
