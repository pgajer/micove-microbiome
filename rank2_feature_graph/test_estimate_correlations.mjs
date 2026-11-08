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
assert.equal(files.length,6);assert.match(files[0].text, /"row_feature_id","c"/);
assert.match(files[0].text, /"a","0.2"/);assert.match(files[1].text,/"One, ""quoted"""/);
assert.match(files[1].text,/"d","Constant".*"","false","Constant estimate field"/);
assert.equal(JSON.parse(files.find(f=>f.name==='settings.json').text).participants,5);
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

// Automatic group selection, lower-triangle masks, common row ordering and all-panel exports.
context.sampleColorMode=()=> 'estimate:x';
run('estimateCorrelationColorSync(estimateCorrelationState())');
assert.equal(run('estimateCorrelationState().open'),true);
assert.equal(run('estimateCorrelationState().rows'),'x');
assert.equal(run('estimateCorrelationState().cols'),'all');
assert.equal(run('estimateCorrelationState().clustering'),'dynamic');
assert.equal(run('estimateCorrelationState().minSize'),5);
assert.equal(run('estimateCorrelationState().deepSplit'),1);
run('estimateCorrelationState().open=false;estimateCorrelationColorSync(estimateCorrelationState())');
assert.equal(run('estimateCorrelationState().open'),false,'Edge catalogue dismissal lasts within the same color mode');
context.sampleColorMode=()=> 'estimate:y';run('estimateCorrelationColorSync(estimateCorrelationState())');
assert.equal(run('estimateCorrelationState().rows'),'y');assert.equal(run('estimateCorrelationState().open'),true);
context.sampleColorMode=()=> 'default';run('estimateCorrelationColorSync(estimateCorrelationState())');
assert.equal(run('estimateCorrelationState().open'),false);
asset.categories=[{id:'x',label:'Group X'},{id:'y',label:'Group Y'},{id:'assay-availability',label:'Assay availability'}];
run("testPanels=estimateCorrelationPanels(asset,bank,{rows:'x',cols:'all',cluster:'all'},[2,0,1],[2,1,2],[2,0])");
assert.equal(run('testPanels.length'),3);
assert.equal(run('testPanels[0].symmetric'),true);
assert.equal(run('testPanels[2].diagnostic'),true);
assert.equal(run('testPanels.every(p=>p.rows===testPanels[0].rows)'),true);
assert.deepEqual(JSON.parse(JSON.stringify(run('estimateCorrelationMatrix(bank,testPanels[0])'))),[[null,null],[.2,null]]);
run('estimateCorrelationShown.panels=testPanels');
const expanded=run('estimateCorrelationFiles(estimateCorrelationShown)');
assert.equal(expanded.filter(f=>f.name.startsWith('matrices/')).length,3);
assert.match(expanded.find(f=>f.name==='matrices/x--x.csv').text, /"c","1","0.2"/,'Export preserves the full symmetric matrix');
assert.equal(JSON.stringify({selection,coordinates}),before);
console.log('PASS: automatic group opening/switching, lower triangles, aligned rows, diagnostics, full-matrix ZIP exports and unchanged selection/coordinates.');

// Representatives are central members of the full signed-correlation cluster,
// not the first visible field, the largest absolute correlation, or a subset medoid.
run('representatives=estimateCorrelationRepresentatives(bank,[7,7,7],data)');
assert.equal(run('representatives.get(7).featureId'),'b');
assert.equal(run('representatives.get(7).label'),'C7 · [Two]');
assert.ok(Math.abs(run('representatives.get(7).meanCorrelation')-.85)<1e-14);
assert.equal(run('representatives.get(7).categoryId'),'y','Representative need not belong to focus group X');
run('tieBank={...bank,featureIndices:[2,0],correlations:[-.8]};tieReps=estimateCorrelationRepresentatives(tieBank,[4,4],data)');
assert.equal(run('tieReps.get(4).featureId'),'a','Ties use frozen feature order, not dendrogram order');
run('singleReps=estimateCorrelationRepresentatives(bank,[2,0,0],data)');
assert.equal(run('singleReps.get(2).featureId'),'a');
assert.equal(run('singleReps.get(0).representative'),null);
assert.equal(run('singleReps.get(0).label'),'Unassigned');
assert.equal(run('singleReps.get(2).meanCorrelation'),1);
run('triGuides=estimateCorrelationClusterGuides({rows:[2,0,1],cols:[2,0,1],symmetric:true},[2,2,1])');
assert.equal(run('triGuides.shapes.length'),2);
assert.deepEqual(JSON.parse(JSON.stringify(run('triGuides.shapes.map(s=>[s.x0,s.x1,s.y0,s.y1])'))),[[-.5,.5,.5,.5],[.5,.5,.5,2.5]]);
run('rectGuides=estimateCorrelationClusterGuides({rows:[0,1],cols:[2,1],symmetric:false},[2,2,1])');
assert.equal(run('rectGuides.shapes.length'),1);
assert.equal(run('rectGuides.shapes[0].y0'),-.5);
assert.equal(run('rectGuides.shapes[0].y1'),1.5);
assert.equal(run('estimateCorrelationClusterGuides({rows:[],cols:[0],symmetric:false},[2]).shapes.length'),0);
const repFile=expanded.find(f=>f.name==='cluster_representatives.csv');
assert.match(repFile.text,/representative_feature_id/);assert.match(repFile.text,/C2/);
assert.match(expanded.find(f=>f.name==='feature_clusters.csv').text,/cluster_label/);
assert.equal(JSON.stringify({selection,coordinates}),before);
console.log('PASS: central representatives, signed means, stable tie order, unassigned/singleton labels, rectangular/triangular boundaries, representative exports and unchanged scientific state.');

let drawn;
context.esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
context.Plotly={react:async(plot,traces,layout)=>{drawn={traces,layout}}};
context.plot={clientWidth:900,style:{},removeAllListeners(){},on(){}};
run('drawView={bank,data,labels:[2,2,1],state:{method:"spearman"},representatives:estimateCorrelationRepresentatives(bank,[2,2,1],data)}');
await run('estimateCorrelationDrawPlot(plot,{id:"x--x",rows:[2,0,1],cols:[2,0,1],symmetric:true},drawView)');
assert.equal(drawn.layout.shapes.length,2);
assert.deepEqual(Array.from(drawn.traces[0].x),['c','a','b']);
assert.equal(drawn.traces[0].z[2][0],.8,'Cluster decoration leaves correlations and order unchanged');
assert.match(drawn.traces[1].text[0],/C1 · \[Three\]/);
assert.match(drawn.traces[2].text[1],/C2 · \[One/);
assert.ok(drawn.layout.annotations.some(a=>a.text==='C2'&&a.yref==='y'));
assert.ok(drawn.layout.annotations.some(a=>a.text==='C2'&&a.xref==='x'));
console.log('PASS: both axes use matching cluster labels; plot decorations preserve matrix values and feature order.');

const resized=[];
const anotherPlot={...context.plot,clientWidth:500,_estimateCorrelationWidth:900};
context.plot.clientWidth=400;
context.document={querySelectorAll:()=>[context.plot,anotherPlot]};
context.Plotly.relayout=async(p,update)=>resized.push({p,update});
context.Plotly.restyle=async()=>{};
await run('resizeEstimateCorrelationPlots()');
assert.deepEqual(resized.map(r=>r.update.width),[400,500]);
assert.ok(resized.every(r=>Object.keys(r.update).every(k=>['width','annotations'].includes(k))),'Resize preserves zoom ranges and data');
await run('resizeEstimateCorrelationPlots()');assert.equal(resized.length,2,'Unchanged sizes do not rerender');
console.log('PASS: all heatmaps resize with the panel; annotation spacing adapts without resetting data or zoom.');
