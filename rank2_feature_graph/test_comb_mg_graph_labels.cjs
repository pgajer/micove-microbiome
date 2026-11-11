const assert=require('node:assert/strict');
const {pack,gesture}=require('./comb_mg_graph_labels.js');
const items=Array.from({length:91},(_,i)=>({id:'state_'+i,x:160+i%5,y:210+i%7,width:90+(i%5)*18,height:35,radius:6,priority:i===90?1e9:91-i}));
const before=JSON.stringify(items),small={x:6,y:6,width:318,height:360},large={x:6,y:6,width:1230,height:720};
function check(result,bounds){
 const rows=[...result.values()];
 for(const r of rows){
  assert(r.x>=bounds.x&&r.y>=bounds.y&&r.x+r.width<=bounds.x+bounds.width+1e-8&&r.y+r.height<=bounds.y+bounds.height+1e-8);
  for(const s of rows)if(r!==s)assert(r.x+r.width<=s.x||s.x+s.width<=r.x||r.y+r.height<=s.y||s.y+s.height<=r.y,'Labels must not overlap');
 }
}
const obstacle={x:160,y:210,radius:24},packed=pack(items,small,[obstacle]);check(packed,small);assert(packed.has('state_90'));assert(packed.size>5&&packed.size<91);
for(const r of packed.values())assert(Math.hypot(obstacle.x-Math.max(r.x,Math.min(r.x+r.width,obstacle.x)),obstacle.y-Math.max(r.y,Math.min(r.y+r.height,obstacle.y)))>=26);
assert.deepEqual([...pack(items,small,[obstacle])],[...packed]);assert.equal(JSON.stringify(items),before);
const roomy=pack(items,large,[obstacle]);check(roomy,large);assert.equal(roomy.size,91);
assert.equal(pack([{id:'long',width:500,height:30,x:0,y:0}],small).size,0);
assert.equal(pack(items,{x:0,y:0,width:0,height:0}).size,0);
const g=gesture(),event={button:0,pointerId:1,clientX:10,clientY:20,detail:1};
g.start(event,3);assert(g.accept(event,3));assert(!g.accept(event,3),'A pointer click cannot be dispatched twice');
g.start(event,3);g.move({...event,clientX:30});g.move(event);assert(!g.accept(event,3),'Dragging back to the start is not a click');
g.start(event,3);g.cancel();assert(!g.accept(event,3));
g.start(event,3);assert(!g.accept(event,4),'An outdated render cannot select a state');
g.start({...event,ctrlKey:true},3);assert(!g.accept(event,3));
assert(g.accept({detail:0},4),'Keyboard activation works without a mouse press');
console.log(`PASS: ${packed.size}/91 crowded labels,91/91 expanded, no overlap or marker collisions, selected priority, deterministic placement, unchanged inputs and drag/stale/modifier protection.`);
