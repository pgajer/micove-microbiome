// Panel sizing is independent of selections, coordinates and camera history.
var selectionPanelLayoutSync=null,cstSummaryPanelLayoutSync=null;
(function installPanelSizing(){
 if(typeof window==='undefined')return;
 const workspace=document.getElementById('panelWorkspace'),column=document.getElementById('columnDivider'),row=document.getElementById('rowDivider');
 const storageKey='rank2-explorer-panel-layout-v2',defaults={left:.55,top:.68};
 let graphTopBeforeSummary=null;
 let sizes={...defaults},active=null,resizePending=false,resizeAgain=false,maximized=null,refitSubjectAfterResize=false,refitJointSamplesAfterResize=false;
 try{
  const current=(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(storageKey),saved=JSON.parse(current||(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem('rank2-explorer-panel-layout-v1')||(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem('comb-V3V4-tx-panel-layout-v1'));
  // Preserve each column's chosen width when migrating the former graph-left layout.
  if(saved&&Number.isFinite(saved.left)&&Number.isFinite(saved.top))sizes={left:current?saved.left:1-saved.left,top:saved.top};
 }catch{}
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 // Keep the sample information preference separate from the four-panel layout.
 const infoArea=document.getElementById('sampleContent'),infoDivider=document.getElementById('sampleInfoDivider');
 const infoKey='vme-sample-information-size-v1',infoDefaults={width:.3,height:.4,position:'right'};
 const infoPosition=document.getElementById('sampleLegendPosition');
 let infoSize={...infoDefaults},infoDrag=null;
 try{const saved=JSON.parse((typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(infoKey));for(const axis of ['width','height'])if(Number.isFinite(saved?.[axis]))infoSize[axis]=clamp(saved[axis],0,.65);if(['right','bottom'].includes(saved?.position))infoSize.position=saved.position}catch{}
 function infoLimits(){
  const wide=infoSize.position==='right',axis=wide?'width':'height',rect=infoArea.getBoundingClientRect(),space=Math.max(1,rect[axis]-14);
  return {wide,axis,rect,space,min:Math.min(.3,(wide?180:80)/space),max:wide?.6:.65};
 }
 function applyInfo(persist=false){
  infoArea.dataset.legendPosition=infoSize.position;infoPosition.value=infoSize.position;
  const l=infoLimits(),value=clamp(infoSize[l.axis],l.min,l.max);
  // Clamp the displayed size, without overwriting a preference on window resize.
  infoArea.style.setProperty('--info-'+l.axis,value+'fr');infoArea.style.setProperty('--plot-'+l.axis,(1-value)+'fr');
  infoDivider.setAttribute('aria-orientation',l.wide?'vertical':'horizontal');
  infoDivider.setAttribute('aria-valuemin',Math.ceil(l.min*100));infoDivider.setAttribute('aria-valuemax',Math.floor(l.max*100));
  infoDivider.setAttribute('aria-valuenow',Math.round(value*100));infoDivider.setAttribute('aria-valuetext',Math.round(value*100)+'% for information');
  if(persist)try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(infoKey,JSON.stringify(infoSize))}catch{}
 }
 infoPosition.addEventListener('change',()=>{
  infoSize.position=infoPosition.value==='bottom'?'bottom':'right';applyInfo(true);resizePlots();
 });
 function finishInfo(event){
  if(!infoDrag||event.pointerId!==infoDrag.pointerId)return;
  infoDrag=null;if(infoDivider.hasPointerCapture(event.pointerId))infoDivider.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizingPanels','resizingColumns','resizingRows');applyInfo(true);resizePlots();
 }
 infoDivider.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();const l=infoLimits();
  infoDrag={pointerId:event.pointerId,axis:l.axis};infoDivider.setPointerCapture(event.pointerId);infoDivider.focus();
  document.body.classList.add('resizingPanels',l.wide?'resizingColumns':'resizingRows');
 });
 infoDivider.addEventListener('pointermove',event=>{
  if(!infoDrag||event.pointerId!==infoDrag.pointerId)return;const l=infoLimits();
  if(l.axis!==infoDrag.axis){finishInfo(event);return}
  infoSize[l.axis]=clamp(l.wide?(l.rect.left+l.rect.width-event.clientX-7)/l.space:(l.rect.top+l.rect.height-event.clientY-7)/l.space,l.min,l.max);
  applyInfo();resizePlots();
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])infoDivider.addEventListener(name,finishInfo);
 infoDivider.addEventListener('dblclick',()=>{infoSize[infoLimits().axis]=infoDefaults[infoLimits().axis];applyInfo(true);resizePlots()});
 infoDivider.addEventListener('keydown',event=>{
  const l=infoLimits(),grow=l.wide?'ArrowLeft':'ArrowUp',shrink=l.wide?'ArrowRight':'ArrowDown';
  if(![grow,shrink,'Home','End'].includes(event.key))return;event.preventDefault();
  const current=clamp(infoSize[l.axis],l.min,l.max),step=event.shiftKey?.1:.02;
  infoSize[l.axis]=event.key==='Home'?l.min:event.key==='End'?l.max:clamp(current+(event.key===grow?step:-step),l.min,l.max);
  applyInfo(true);resizePlots();
 });
 // Graph controls occupy their own right-hand column, independent of sample information.
 const graphArea=document.getElementById('graphContent'),graphDivider=document.getElementById('graphInfoDivider');
 const graphInfoKey='vme-graph-information-size-v1',graphInfoDefault=.35;
 let graphInfoSize=graphInfoDefault,graphInfoDrag=null;
 try{const value=JSON.parse((typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(graphInfoKey));if(Number.isFinite(value))graphInfoSize=clamp(value,0,.7)}catch{}
 function graphInfoLimits(){const rect=graphArea.getBoundingClientRect(),space=Math.max(1,rect.width-14);return {rect,space,min:Math.min(.35,180/space),max:.7}}
 function applyGraphInfo(persist=false){
  const l=graphInfoLimits(),value=clamp(graphInfoSize,l.min,l.max);
  graphArea.style.setProperty('--graph-info-width',value+'fr');graphArea.style.setProperty('--graph-plot-width',(1-value)+'fr');
  graphDivider.setAttribute('aria-valuemin',Math.ceil(l.min*100));graphDivider.setAttribute('aria-valuemax',70);graphDivider.setAttribute('aria-valuenow',Math.round(value*100));graphDivider.setAttribute('aria-valuetext',Math.round(value*100)+'% for graph controls and information');
  if(persist)try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(graphInfoKey,JSON.stringify(graphInfoSize))}catch{}
 }
 function finishGraphInfo(event){
  if(!graphInfoDrag||event.pointerId!==graphInfoDrag)return;graphInfoDrag=null;
  if(graphDivider.hasPointerCapture(event.pointerId))graphDivider.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizingPanels','resizingColumns');applyGraphInfo(true);resizePlots();
 }
 graphDivider.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();graphInfoDrag=event.pointerId;graphDivider.setPointerCapture(event.pointerId);graphDivider.focus();document.body.classList.add('resizingPanels','resizingColumns')});
 graphDivider.addEventListener('pointermove',event=>{if(event.pointerId!==graphInfoDrag)return;const l=graphInfoLimits();graphInfoSize=clamp((l.rect.left+l.rect.width-event.clientX-7)/l.space,l.min,l.max);applyGraphInfo();resizePlots()});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])graphDivider.addEventListener(name,finishGraphInfo);
 graphDivider.addEventListener('dblclick',()=>{graphInfoSize=graphInfoDefault;applyGraphInfo(true);resizePlots()});
 graphDivider.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const l=graphInfoLimits(),value=clamp(graphInfoSize,l.min,l.max),step=event.shiftKey?.1:.02;
  graphInfoSize=event.key==='Home'?l.min:event.key==='End'?l.max:clamp(value+(event.key==='ArrowLeft'?step:-step),l.min,l.max);applyGraphInfo(true);resizePlots();
 });
 function limits(){const rect=workspace.getBoundingClientRect(),width=Math.max(1,rect.width-14),height=Math.max(1,rect.height-14);return {rect,width,height,leftMin:Math.min(.4,320/width),topMin:Math.min(.45,220/height),topMax:Math.max(.65,1-140/height)}}
 function resizePlots(){
  if(resizePending){resizeAgain=true;return}resizePending=true;
  window.requestAnimationFrame(async()=>{
   resizeAgain=false;
   try{
    await Promise.all([queue,graphQueue]);
    for(const id of ['samples','graph3d','enrollmentHeatmapPlot','heatmapClusterScores']){const plot=document.getElementById(id);if((!maximized||maximized.id===(id==='samples'?'samplePanel':id==='graph3d'?'featurePanel':'cataloguePanel'))&&plot?.data&&plot.clientWidth>0&&plot.clientHeight>0&&plot.style.display!=='none'){if(id==='enrollmentHeatmapPlot'&&typeof resizeEnrollmentHeatmap==='function')await resizeEnrollmentHeatmap();else await Plotly.Plots.resize(plot)}}
    if((!maximized||maximized.id==='cataloguePanel')&&typeof resizeEstimateCorrelationPlots==='function')await resizeEstimateCorrelationPlots();
    if(refitJointSamplesAfterResize&&(!maximized||maximized.id==='samplePanel')){
     refitJointSamplesAfterResize=false;
     await fitSubjectSamples3d();
    }
    if(!maximized||maximized.id==='featurePanel'){
     if(refitSubjectAfterResize){
      refitSubjectAfterResize=false;
      participantGraphFrames[Number(el('dimension').value)]=null;
      if(el('dimension').value==='2'&&participant.active&&!participant.graphBackground)graph();
     }
     if(el('dimension').value==='3'){await maybeFitSubjectGraph3d();await trimGraphEdges()}else sizeGraphLabels2d();
    }
    if(typeof centerParticipantComposition==='function')centerParticipantComposition();
   }catch(error){console.error(error)}finally{resizePending=false;if(resizeAgain)resizePlots()}
  });
 }
 function apply(persist=false){
  applyInfo();applyGraphInfo();
  const l=limits();sizes.left=clamp(sizes.left,l.leftMin,1-l.leftMin);sizes.top=clamp(sizes.top,l.topMin,l.topMax);
  for(const [name,value] of Object.entries({'left-share':sizes.left,'right-share':1-sizes.left,'top-share':sizes.top,'bottom-share':1-sizes.top}))workspace.style.setProperty('--'+name,value+'fr');
  for(const [divider,value,min,max] of [[column,sizes.left,l.leftMin,1-l.leftMin],[row,sizes.top,l.topMin,l.topMax]]){
   divider.setAttribute('aria-valuenow',Math.round(value*100));divider.setAttribute('aria-valuemin',Math.ceil(min*100));divider.setAttribute('aria-valuemax',Math.floor(max*100));divider.setAttribute('aria-valuetext',Math.round(value*100)+'% '+(divider===column?'left':'upper'));
  }
  if(persist)try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(storageKey,JSON.stringify({...sizes,top:graphTopBeforeSummary??sizes.top}))}catch{}
  resizePlots();
 }
 cstSummaryPanelLayoutSync=active=>{
  // Compact only the right column; never shrink a visible subject trajectory.
  active=active&&!workspace.classList.contains('subjectTrajectoryVisible');
  if(active&&graphTopBeforeSummary===null){graphTopBeforeSummary=sizes.top;sizes.top=Math.min(sizes.top,340/limits().height);apply()}
  else if(!active&&graphTopBeforeSummary!==null){sizes.top=graphTopBeforeSummary;graphTopBeforeSummary=null;apply()}
 };
 function finish(event){
  if(!active||event.pointerId!==active.pointerId)return;
  const old=active;active=null;
  if(old.divider.hasPointerCapture(event.pointerId))old.divider.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizingPanels','resizingColumns','resizingRows');apply(true);
 }
 for(const [divider,axis] of [[column,'left'],[row,'top']]){
  divider.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   event.preventDefault();active={divider,axis,pointerId:event.pointerId};divider.setPointerCapture(event.pointerId);divider.focus();document.body.classList.add('resizingPanels',axis==='left'?'resizingColumns':'resizingRows');
  });
  divider.addEventListener('pointermove',event=>{
   if(!active||active.divider!==divider||event.pointerId!==active.pointerId)return;
   const l=limits();sizes[axis]=axis==='left'?(event.clientX-l.rect.left-7)/l.width:(event.clientY-l.rect.top-7)/l.height;apply();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(name,finish);
  divider.addEventListener('dblclick',()=>{sizes[axis]=defaults[axis];apply(true)});
  divider.addEventListener('keydown',event=>{
   const negative=axis==='left'?'ArrowLeft':'ArrowUp',positive=axis==='left'?'ArrowRight':'ArrowDown';
   if(![negative,positive,'Home','End'].includes(event.key))return;
   event.preventDefault();const l=limits(),step=event.shiftKey?.1:.02;
   sizes[axis]=event.key==='Home'?(axis==='left'?l.leftMin:l.topMin):event.key==='End'?(axis==='left'?1-l.leftMin:l.topMax):sizes[axis]+(event.key===negative?-step:step);apply(true);
  });
 }
 document.getElementById('resetPanels').addEventListener('click',()=>{sizes={...defaults};infoSize={...infoDefaults};graphInfoSize=graphInfoDefault;applyInfo(true);applyGraphInfo(true);apply(true)});
 window.addEventListener('resize',()=>{applyInfo();applyGraphInfo();if(!maximized)apply();else resizePlots()});
 if(typeof ResizeObserver!=='undefined'){
  const observer=new ResizeObserver(resizePlots);for(const id of ['samples','graph3d','graphPanelHeader'])observer.observe(document.getElementById(id));
  new ResizeObserver(()=>{applyInfo();resizePlots()}).observe(infoArea);
  new ResizeObserver(()=>{applyGraphInfo();resizePlots()}).observe(graphArea);
 }
 // Sidebar state is separate from panel sizing and scientific view selections.
 const shell=document.getElementById('explorerLayout'),toggle=document.getElementById('toggleControls'),controls=document.getElementById('controlSections');
 const sidebarKey='udcst-explorer-controls-v1',sectionIds=['dataControls','stateControls','sampleControls','layoutControls'];
 let collapsed=false;
 try{
  const saved=JSON.parse((typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).getItem(sidebarKey)||'null');
  if(saved&&typeof saved.collapsed==='boolean')collapsed=saved.collapsed;
  for(const id of sectionIds)if(typeof saved?.sections?.[id]==='boolean')document.getElementById(id).open=saved.sections[id];
 }catch{}
 function saveSidebar(){try{(typeof datasetPanelStorage==='undefined'?localStorage:datasetPanelStorage).setItem(sidebarKey,JSON.stringify({collapsed,sections:Object.fromEntries(sectionIds.map(id=>[id,document.getElementById(id).open]))}))}catch{}}
 function sidebar(persist=false){
  shell.classList.toggle('controlsCollapsed',collapsed);controls.hidden=collapsed;
  toggle.setAttribute('aria-expanded',String(!collapsed));toggle.textContent=collapsed?'›':'‹';
  toggle.title=collapsed?'Show controls':'Collapse controls';toggle.setAttribute('aria-label',toggle.title);
  if(persist)saveSidebar();
  apply();
 }
 toggle.addEventListener('click',()=>{collapsed=!collapsed;sidebar(true);toggle.focus({preventScroll:true})});
 for(const id of sectionIds)document.getElementById(id).addEventListener('toggle',saveSidebar);
 sidebar();
 const panelNames={featurePanel:'Features and top-2 CSTs graph',samplePanel:'3D sample view',cataloguePanel:'Edge catalogue',selectionPanel:'Subject trajectory'};
 const panels=Object.keys(panelNames).map(id=>document.getElementById(id));
 let backgroundState=[],previousScroll=null;
 function restoreBackground(){for(const [node,inert] of backgroundState)node.inert=inert;backgroundState=[]}
 function maximizePanel(panel){
  const restoring=maximized===panel;
  if(panel.id==='featurePanel'||maximized?.id==='featurePanel')refitSubjectAfterResize=true;
  if(panel.id==='samplePanel'||maximized?.id==='samplePanel')refitJointSamplesAfterResize=true;
  if(active)finish({pointerId:active.pointerId});
  if(infoDrag)finishInfo({pointerId:infoDrag.pointerId});
  if(graphInfoDrag!==null)finishGraphInfo({pointerId:graphInfoDrag});
  if(!maximized)previousScroll={left:window.scrollX,top:window.scrollY};
  restoreBackground();
  if(maximized){const button=document.getElementById('maximize-'+maximized.id);maximized.classList.remove('maximized');button.textContent='⛶ Maximize';button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Maximize '+panelNames[maximized.id]);button.title='Fill window'}
  maximized=restoring?null:panel;
  // Move the existing controls so selection, handlers and disclosure state stay shared.
  const participantHost=document.getElementById(maximized?.id==='samplePanel'?'sampleNavigation':'controlSections');
  for(const id of ['enrollmentExploreSection','participantSection']){
   const section=document.getElementById(id);
   if(section.parentElement!==participantHost){
    if(maximized?.id==='samplePanel')participantHost.appendChild(section);
    else participantHost.insertBefore(section,document.getElementById('layoutControls'));
   }
  }
  const datasetLabel=document.getElementById(maximized?.id==='samplePanel'?'panelDatasetSelect':'datasetSelect').closest('label');
  datasetLabel.after(document.getElementById('populationComparisonControl'));
  datasetLabel.after(document.getElementById('datasetMethodsPanel'));
  document.getElementById(maximized?.id==='samplePanel'?'sampleNavigation':'controlSections').appendChild(document.getElementById('explorerAbout'));
  const sequenceHost=document.getElementById(maximized?.id==='samplePanel'?'maximizedParticipantVisits':'selectionPanel');
  for(const id of ['participantVisitAppearance','participantSequence']){
   const node=document.getElementById(id);
   if(node.parentElement!==sequenceHost)sequenceHost.appendChild(node);
  }
  document.body.classList.toggle('panelMaximized',!!maximized);workspace.classList.toggle('hasMaximized',!!maximized);
  if(maximized){
   maximized.classList.add('maximized');
   const button=document.getElementById('maximize-'+maximized.id);button.textContent='↙ Restore';button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','Restore four-panel layout');button.title='Restore panels (Escape)';
   // Disable sibling branches, never a wrapper containing the maximized panel.
   for(let branch=maximized;branch&&branch!==document.body;branch=branch.parentElement){
    for(const node of branch.parentElement.children){
     if(node===branch||node.tagName==='SCRIPT'||node.id==='viewExportDialog'||node.id==='namedViewsDialog'||node.id==='embeddingStressDialog'||node.id==='neighborhoodDistanceDialog'||node.id==='participantHelpPopover')continue;
     backgroundState.push([node,node.inert]);node.inert=true;
    }
   }
   button.focus({preventScroll:true});
  }else{
   if(previousScroll)window.scrollTo({...previousScroll,behavior:'instant'});
   document.getElementById('maximize-'+panel.id).focus({preventScroll:true});previousScroll=null;
  }
  applyInfo();applyGraphInfo();resizePlots();
 }
 selectionPanelLayoutSync=show=>{
  workspace.classList.toggle('subjectTrajectoryVisible',show);
  cstSummaryPanelLayoutSync(typeof cstSphereSummaryActive==='function'&&cstSphereSummaryActive());
  document.getElementById('inspector').hidden=show;document.getElementById('stateEdgeSelector').hidden=show;
  if(!show&&maximized?.id==='selectionPanel')maximizePanel(maximized);
 };
 selectionPanelLayoutSync(participant.active);
 for(const panel of panels)document.getElementById('maximize-'+panel.id).addEventListener('click',()=>maximizePanel(panel));
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&maximized&&!document.querySelector('dialog[open]')){event.preventDefault();maximizePanel(maximized)}});
 if(typeof datasetPanelStorage!=='undefined'){
  datasetPanelLayout={
   save(){
    for(const [key,value] of [[storageKey,{...sizes,top:graphTopBeforeSummary??sizes.top}],[infoKey,infoSize],[graphInfoKey,graphInfoSize]])datasetPanelStorage.setItem(key,JSON.stringify(value));
    saveSidebar();datasetPanelStorage.setItem('vme-panel-maximized-v1',maximized?.id||'');
   },
   restore(){
    graphTopBeforeSummary=null;sizes={...defaults};infoSize={...infoDefaults};graphInfoSize=graphInfoDefault;collapsed=false;
    try{const current=datasetPanelStorage.getItem(storageKey),v=JSON.parse(current||datasetPanelStorage.getItem('rank2-explorer-panel-layout-v1')||datasetPanelStorage.getItem('comb-V3V4-tx-panel-layout-v1'));if(v&&Number.isFinite(v.left)&&Number.isFinite(v.top))sizes={left:current?v.left:1-v.left,top:v.top}}catch{}
    try{const v=JSON.parse(datasetPanelStorage.getItem(infoKey));for(const axis of ['width','height'])if(Number.isFinite(v?.[axis]))infoSize[axis]=clamp(v[axis],0,.65);if(['right','bottom'].includes(v?.position))infoSize.position=v.position}catch{}
    try{const v=JSON.parse(datasetPanelStorage.getItem(graphInfoKey));if(Number.isFinite(v))graphInfoSize=clamp(v,0,.7)}catch{}
    try{const v=JSON.parse(datasetPanelStorage.getItem(sidebarKey));if(typeof v?.collapsed==='boolean')collapsed=v.collapsed;for(const id of sectionIds)if(typeof v?.sections?.[id]==='boolean')document.getElementById(id).open=v.sections[id]}catch{}
    let target=datasetPanelStorage.getItem('vme-panel-maximized-v1')||'';
    if(target==='selectionPanel'&&!participant.active)target='';
    if(maximized?.id!==target){if(maximized)maximizePanel(maximized);if(panelNames[target])maximizePanel(document.getElementById(target))}
    sidebar();apply();
   }
  };
  datasetPanelLayout.restore();
 }
 apply();
})();
