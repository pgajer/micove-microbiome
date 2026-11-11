// Screen-space labels for the comb-mg reference graph. Scientific coordinates
// stay in Plotly; independent HTML buttons carry the immutable state identity.
const CombMgGraphLabels=(()=>{
 function pack(items,bounds,obstacles=[]){
  const gap=4,placed=[],result=new Map(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const overlap=(a,b)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
  const blocked=r=>obstacles.some(p=>Math.hypot(p.x-clamp(p.x,r.x,r.x+r.width),p.y-clamp(p.y,r.y,r.y+r.height))<p.radius+2);
  for(const item of [...items].sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.id).localeCompare(String(b.id)))){
   const {width,height}=item;if(width>bounds.width||height>bounds.height)continue;
   const left=bounds.x,right=left+bounds.width-width,top=bounds.y,bottom=top+bounds.height-height;
   const xs=new Set([clamp(item.x-width/2,left,right),left,right]);
   const ys=new Set([clamp(item.y-(item.radius||0)-height-5,top,bottom),clamp(item.y+(item.radius||0)+5,top,bottom),bottom]);
   for(let y=top;y<=bottom;y+=height+gap)ys.add(y);
   for(const r of placed){xs.add(clamp(r.x-width-gap,left,right));xs.add(clamp(r.x+r.width+gap,left,right));ys.add(clamp(r.y-height-gap,top,bottom));ys.add(clamp(r.y+r.height+gap,top,bottom))}
   const candidates=[];for(const x of xs)for(const y of ys)candidates.push({x,y,width,height,score:(x+width/2-item.x)**2+(y+height/2-item.y)**2});
   candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
   const best=candidates.find(r=>!placed.some(p=>overlap(r,p))&&!blocked(r));
   if(best){placed.push(best);result.set(item.id,best)}
  }
  return result;
 }
 function gesture(){
  let press=null;
  return {
   start(e,revision){press={x:e.clientX,y:e.clientY,pointer:e.pointerId,revision,moved:e.button!==0||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey}},
   move(e){if(press&&e.pointerId===press.pointer&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>=5)press.moved=true},
   cancel(){if(press)press.moved=true},
   accept(e,revision){const p=press;press=null;return !e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&(e.detail===0||!!p&&!p.moved&&p.revision===revision&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<5)}
  };
 }
 function install({plot,host,note,select,revision,project=point=>agpGraphScreenPoint(plot,point)}){
  const doc=plot.ownerDocument,scope=doc.defaultView,layer=doc.createElement('div');layer.className='combMgGraphLabels';host.append(layer);
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('aria-hidden','true');layer.append(svg);
  let entries=[],selected='',enabled=false,signature='',frame=0,pressActive=false;
  const click=gesture();
  scope.addEventListener('pointermove',e=>click.move(e),true);
  scope.addEventListener('pointerup',e=>{click.move(e);pressActive=false},true);
  scope.addEventListener('pointercancel',()=>{click.cancel();pressActive=false},true);
  scope.addEventListener('blur',e=>{if(e.target===scope){click.cancel();pressActive=false}},true);
  function set(nodes,state,visible){
   selected=state;enabled=visible;signature='';click.cancel();pressActive=false;
   for(const entry of entries)entry.button.remove();entries=[];svg.replaceChildren();layer.hidden=!visible;note.hidden=!visible;
   if(!visible)return;
   for(const node of nodes){
    const button=doc.createElement('button');button.type='button';button.className='combMgGraphLabel';button.dataset.taxon=node.taxon;
    button.setAttribute('aria-label','Select pure 1-CST '+node.taxon.replaceAll('_',' '));button.setAttribute('aria-pressed',String(state===node.taxon));
    const name=doc.createElement('span');name.textContent=node.taxon.replaceAll('_',' ');button.append(name);
    const count=doc.createElement('small');count.textContent=node.n.toLocaleString()+' · '+(100*node.fraction).toFixed(2)+'%';button.append(count);
    button.title=name.textContent+' · '+count.textContent+' of the full population';button.style.visibility='hidden';layer.append(button);
    button.onpointerdown=e=>{click.start(e,revision());pressActive=true};
    button.onclick=e=>{e.stopPropagation();if(enabled&&button.isConnected&&click.accept(e,revision()))select(node.taxon)};
    entries.push({node,button});
   }
   update();
  }
  function update(){
   if(!enabled||plot.hidden||!host.isConnected||pressActive)return;
   const rect=host.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
   const points=entries.map(({node})=>{
    const p=project(node.point);if(!p)return null;
    const offsets=[0,1,2].map(j=>project(node.point.map((v,k)=>v+(j===k?node.sphereRadius:0))));
    const radius=offsets.every(Boolean)?Math.sqrt(offsets.reduce((s,o)=>s+(o.x-p.x)**2+(o.y-p.y)**2,0)/2):7;
    return {...p,x:p.x-rect.left,y:p.y-rect.top,radius:Math.max(radius,node.taxon===selected?13:0)};
   });
   const key=JSON.stringify([rect.width,rect.height,points.map(p=>p&&[p.x,p.y,p.radius].map(x=>Math.round(x*10))),selected]);
   if(key===signature)return;signature=key;
   const items=[];entries.forEach(({node,button},i)=>{
    const p=points[i];if(!p||p.x<0||p.y<0||p.x>rect.width||p.y>rect.height)return;
    items.push({id:node.taxon,...p,width:button.offsetWidth,height:button.offsetHeight,priority:(node.taxon===selected?1e9:0)+node.n});
   });
   const positions=pack(items,{x:6,y:6,width:Math.max(0,rect.width-12),height:Math.max(0,rect.height-12)},points.filter(Boolean));
   svg.replaceChildren();svg.setAttribute('width',rect.width);svg.setAttribute('height',rect.height);
   entries.forEach(({node,button},i)=>{
    const r=positions.get(node.taxon),p=points[i];button.style.visibility=r?'visible':'hidden';button.tabIndex=r?0:-1;if(!r)return;
    button.style.left=r.x+'px';button.style.top=r.y+'px';
    const end={x:Math.max(r.x,Math.min(r.x+r.width,p.x)),y:Math.max(r.y,Math.min(r.y+r.height,p.y))},distance=Math.hypot(end.x-p.x,end.y-p.y);
    if(distance<=p.radius+2)return;
    const line=doc.createElementNS(svg.namespaceURI,'line'),start={x:p.x+(end.x-p.x)*(p.radius+2)/distance,y:p.y+(end.y-p.y)*(p.radius+2)/distance};
    for(const [k,v] of Object.entries({x1:start.x,y1:start.y,x2:end.x,y2:end.y}))line.setAttribute(k,v);
    line.dataset.taxon=node.taxon;svg.append(line);
   });
   note.textContent=positions.size===entries.length?'All '+entries.length+' state labels shown.':positions.size+' of '+entries.length+' labels shown; enlarge the graph or use Selected state for any state.';
  }
  // Read the live projected camera, including while Plotly is rotating. No
  // Plotly relayout is needed, so label placement cannot reset its camera.
  function tick(){if(!host.isConnected)return;update();frame=scope.requestAnimationFrame(tick)}
  frame=scope.requestAnimationFrame(tick);
  return {set,suspend(){enabled=false;layer.hidden=true;click.cancel();pressActive=false},destroy(){scope.cancelAnimationFrame(frame);layer.remove()}};
 }
 return {pack,gesture,install};
})();
if(typeof module!=='undefined')module.exports=CombMgGraphLabels;
