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
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('estimate_correlation_clustering.js',import.meta.url),'utf8'),context);vm.runInContext(fs.readFileSync(new URL('estimate_correlations.js',import.meta.url),'utf8'),context);
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
context.sampleColorMode=()=> 'estimate:profile-outcomes';run('estimateCorrelationColorSync(estimateCorrelationState())');
assert.equal(run('estimateCorrelationState().open'),false);
assert.notEqual(run('estimateCorrelationState().rows'),'profile-outcomes');
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
assert.equal(run('representatives.get(7).label'),'C7');
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
assert.match(drawn.traces[1].text[0],/C1 · Group X: 1/);
assert.match(drawn.traces[2].text[1],/C2 · Group X: 1/);
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

// Cluster graph weights use signed means over feature pairs, never correlations
// of cluster averages. Opposing pairs can cancel and unassigned fields stay out.
const clone=v=>JSON.parse(JSON.stringify(v));
run(`graphBank={featureIndices:[0,1,2,3],correlations:[.6,.8,-.8,-.4,.4,-.2]};
 graphData={fields:[0,1,2,3].map(i=>({featureId:'f'+i,label:'Field '+i,categoryId:i<2?'left':'right'}))};
 graphLabels=[1,1,2,2];graphView={bank:graphBank,data:graphData,labels:graphLabels,state:{graphThreshold:.3,graphSign:'both'},representatives:estimateCorrelationRepresentatives(graphBank,graphLabels,graphData)};
 graphPanel={id:'left--right',rows:[0,1],cols:[2,3],symmetric:false};
 graph=estimateCorrelationGraph(graphPanel,graphView);`);
assert.equal(run('graph.nodes.length'),2);assert.equal(run('graph.edges.length'),1);
assert.equal(run('graph.edges[0].count'),4);assert.ok(Math.abs(run('graph.edges[0].mean'))<1e-14);
assert.equal(run('graph.edges[0].positive'),2);assert.equal(run('graph.edges[0].negative'),2);
assert.equal(run('graph.edges[0].min'),-.8);assert.equal(run('graph.edges[0].max'),.8);
assert.equal(run('graph.nodes[0].within.mean'),.6);assert.equal(run('graph.nodes[1].within.mean'),-.2);
assert.equal(run('estimateCorrelationGraphEdges(graph,graphView.state).length'),0);
assert.equal(run('estimateCorrelationGraphEdges(graph,{graphThreshold:0,graphSign:"both"}).length'),1);
run('signedGraph={edges:[{mean:-.5},{mean:.5},{mean:.49},{mean:0}]}');
assert.deepEqual(Array.from(run('estimateCorrelationGraphEdges(signedGraph,{graphThreshold:.5,graphSign:"both"}).map(e=>e.mean)')),[-.5,.5]);
assert.deepEqual(Array.from(run('estimateCorrelationGraphEdges(signedGraph,{graphThreshold:.5,graphSign:"positive"}).map(e=>e.mean)')),[.5]);
assert.deepEqual(Array.from(run('estimateCorrelationGraphEdges(signedGraph,{graphThreshold:.5,graphSign:"negative"}).map(e=>e.mean)')),[-.5]);
run('sameClusterGraph=estimateCorrelationGraph(graphPanel,{...graphView,labels:[3,3,3,0],representatives:estimateCorrelationRepresentatives(graphBank,[3,3,3,0],graphData)})');
assert.equal(run('sameClusterGraph.nodes.length'),2,'Two group subsets of one joint cluster remain distinct nodes');
assert.equal(run('sameClusterGraph.edges[0].source.cluster===sameClusterGraph.edges[0].target.cluster'),true);
assert.equal(run('sameClusterGraph.edges[0].count'),2);assert.equal(run('sameClusterGraph.unassigned'),1);
assert.equal(run('sameClusterGraph.nodes[1].within.mean'),null,'Singleton within-node mean is undefined');
run('withinPanel={rows:[0,1,2,3],cols:[0,1,2,3],symmetric:true};withinGraph=estimateCorrelationGraph(withinPanel,graphView)');
assert.equal(run('withinGraph.edges.length'),1,'No self-loops or duplicate undirected edges');
const positionsBefore=clone(run('[...estimateCorrelationGraphPositions(withinGraph,true).positions]'));
run('estimateCorrelationGraphEdges(withinGraph,{graphThreshold:1,graphSign:"negative"})');
assert.deepEqual(clone(run('[...estimateCorrelationGraphPositions(withinGraph,true).positions]')),positionsBefore,'Filtering edges leaves node positions unchanged');
run('edgeHighlight=estimateCorrelationHighlightShapes(withinPanel,graphLabels,{kind:"edge",row:1,col:2})');
assert.equal(run('edgeHighlight.length'),1,'Only the lower-triangle block is outlined');
assert.equal(run('edgeHighlight[0].path'),'M -0.5,1.5 L 1.5,1.5 L 1.5,3.5 L -0.5,3.5 Z');
assert.equal(run('estimateCorrelationHighlightShapes(graphPanel,graphLabels,{kind:"node",side:"cols",cluster:2}).length'),1);
assert.equal(run('estimateCorrelationHighlightShapes(graphPanel,graphLabels,null).length'),0);
await run('estimateCorrelationApplyHighlight(plot,{kind:"node",side:"rows",cluster:2})');
assert.ok(resized.at(-1).update.shapes.length>2);
await run('estimateCorrelationApplyHighlight(plot,null)');assert.equal(resized.at(-1).update.shapes.length,2);
assert.equal(JSON.stringify({selection,coordinates}),before);
const graphFiles=run('estimateCorrelationFiles(estimateCorrelationShown)').filter(f=>f.name.startsWith('graphs/'));
assert.equal(graphFiles.length,6);assert.match(graphFiles[0].text,/feature_count/);assert.match(graphFiles[1].text,/positive_fraction.*negative_fraction.*displayed/);
assert.equal(run('estimateCorrelationState().graphThreshold'),.3);assert.equal(run('estimateCorrelationState().graphSign'),'both');
console.log('PASS: signed graph means/cancellation, pair counts, same-cluster bipartite edges, singletons/unassigned, sign/threshold filters, linked lower-triangle highlights, graph exports, and unchanged scientific state.');

run('groupReps=estimateCorrelationGroupRepresentatives(bank,[7,7,7],data);groupView={bank,data,labels:[7,7,7],representatives:estimateCorrelationRepresentatives(bank,[7,7,7],data),groupRepresentatives:groupReps}');
assert.equal(run('estimateCorrelationFieldRepresentative(groupView,0).featureId'),'a','Group X representative is from X, not global representative B');
assert.equal(run('estimateCorrelationFieldRepresentative(groupView,1).featureId'),'b');
assert.equal(run('estimateCorrelationFieldRepresentative(groupView,2).featureId'),'a','Group search does not rename representative');
run('groupGraph=estimateCorrelationGraph({rows:[0,2],cols:[1],symmetric:false},groupView)');
assert.equal(run('groupGraph.nodes[0].label'),'C7');assert.equal(run('groupGraph.nodes[1].label'),'C7');assert.match(run('groupGraph.nodes[0].composition'),/2/);assert.match(run('groupGraph.nodes[1].composition'),/1/);
assert.equal(run('groupGraph.nodes[0].cluster===groupGraph.nodes[1].cluster'),true,'Joint ID stays shared while labels become group-specific');
run('separatePanels=estimateCorrelationPanels(asset,bank,{rows:"x",cols:"all",cluster:"2",clusteringScope:"separate"},[0,1,2],[2,1,2],[0,2])');
assert.deepEqual(Array.from(run('separatePanels[1].cols')),[1],'Selecting an independent focus cluster keeps comparison-group columns');
assert.equal(run('estimateCorrelationState().clusteringScope'),'separate');
// Older preferences migrate to Separate and discard now-stale cluster IDs;
// an explicit later Joint choice and its valid display selection are retained.
const savedAsset={...asset};context.estimateAsset=()=>savedAsset;context.localStorage.getItem=()=>JSON.stringify({cluster:'99',minSize:8,graphThreshold:.4});
assert.equal(run('estimateCorrelationState().clusteringScope'),'separate');assert.equal(run('estimateCorrelationState().cluster'),'all');assert.equal(run('estimateCorrelationState().minSize'),8);assert.equal(run('estimateCorrelationState().graphThreshold'),.4);
context.estimateAsset=()=>({...asset});context.localStorage.getItem=()=>JSON.stringify({clusteringScope:'joint',cluster:'7'});
assert.equal(run('estimateCorrelationState().clusteringScope'),'joint');assert.equal(run('estimateCorrelationState().cluster'),'7');context.estimateAsset=()=>asset;
run('groupExportView={...estimateCorrelationShown,...groupView,state:{...estimateCorrelationShown.state,clusteringScope:"separate"},clustering:{scope:"separate",method:"threshold",groups:[{categoryId:"x",indices:[0,2],labels:[7,7],linkage:[[0,1,.8,2]]},{categoryId:"y",indices:[1],labels:[8],linkage:[]}]}}');
const groupExports=run('estimateCorrelationFiles(groupExportView)');
assert.equal(groupExports.filter(f=>f.name.startsWith('clusterings/')).length,4);
assert(!groupExports.some(f=>f.name==='clustering_tree.csv'));
assert.match(groupExports.find(f=>f.name==='cluster_representatives.csv').text, /"7","x","C7"/);
assert.match(groupExports.find(f=>f.name==='cluster_representatives.csv').text, /"7","y","C7"/);
assert.equal(JSON.parse(groupExports.find(f=>f.name==='settings.json').text).clustering.scope,'separate');
assert.equal(JSON.stringify({selection,coordinates}),before);
console.log('PASS: group-specific representatives in joint mode, comparison columns, separate default/migration, explicit joint persistence, per-group tree exports, and preserved selections/embeddings.');
run('connectedGraph={nodes:[{key:"a"},{key:"b"},{key:"c"}],edges:[]};connectedGraph.edges=[{key:"ab",source:connectedGraph.nodes[0],target:connectedGraph.nodes[1],mean:.6},{key:"bc",source:connectedGraph.nodes[1],target:connectedGraph.nodes[2],mean:-.4}]');
assert.deepEqual(Array.from(run('estimateCorrelationGraphVisible(connectedGraph,{graphThreshold:.5,graphSign:"both"}).nodes.map(n=>n.key)')),['a','b']);
assert.deepEqual(Array.from(run('estimateCorrelationGraphVisible(connectedGraph,{graphThreshold:.3,graphSign:"negative"}).nodes.map(n=>n.key)')),['b','c']);
assert.equal(run('estimateCorrelationGraphVisible(connectedGraph,{graphThreshold:1,graphSign:"both"}).nodes.length'),0);
assert.equal(run('connectedGraph.nodes.length'),3,'Visibility does not delete clusters');
console.log('PASS: degree-zero nodes hidden after both magnitude and sign filters; source graph retained.');
