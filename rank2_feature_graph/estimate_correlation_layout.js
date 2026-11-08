// Display-only full-pair metric MDS. No prediction fields or sample coordinates.
function fitEstimateCorrelationMds(input){
 const {nodes,targets}=input,n=nodes.length,pairs=n*(n-1)/2;
 if(targets.length!==pairs||targets.some(d=>!Number.isFinite(d)||d<0))throw Error('Invalid cluster-distance targets');
 const settings={implementation:'micove-correlation-mds-sgd-v1',backend:'browser JavaScript SGD',dimension:2,seed:20261108,starts:3,epochs:500,objective:'sum of squared distance errors; all node pairs equally weighted',checkpoint:'lowest raw stress among initial, each 10th epoch and final coordinates; optimal uniform scaling'};
 const a=new Int32Array(pairs),b=new Int32Array(pairs);let t=0;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){a[t]=i;b[t++]=j}
 const targetSS=targets.reduce((s,d)=>s+d*d,0),mean=pairs?targets.reduce((s,d)=>s+d,0)/pairs:0;
 function evaluate(coords){
  let dot=0,ss=0;for(let q=0;q<pairs;q++){const d=Math.hypot(coords[a[q]][0]-coords[b[q]][0],coords[a[q]][1]-coords[b[q]][1]);dot+=d*targets[q];ss+=d*d}
  const scale=ss?dot/ss:1,center=[0,0];for(const p of coords){center[0]+=p[0]/Math.max(1,n);center[1]+=p[1]/Math.max(1,n)}
  const positions=coords.map(p=>[(p[0]-center[0])*scale,(p[1]-center[1])*scale]);let rawStress=0,relative=0,positivePairs=0,zeroPairs=0,zeroMaxError=0;
  for(let q=0;q<pairs;q++){const distance=Math.hypot(positions[a[q]][0]-positions[b[q]][0],positions[a[q]][1]-positions[b[q]][1]),error=distance-targets[q];rawStress+=error*error;if(targets[q]>0){relative+=(error/targets[q])**2;positivePairs++}else{zeroPairs++;zeroMaxError=Math.max(zeroMaxError,distance)}}
  return {positions,rawStress,relativeRms:positivePairs?Math.sqrt(relative/positivePairs):null,normalizedRmse:targetSS?Math.sqrt(rawStress/targetSS):null,positivePairs,zeroPairs,zeroMaxError};
 }
 if(n<2||targetSS===0)return {...evaluate(nodes.map(()=>[0,0])),settings:{...settings,starts:0,epochs:0},bestStart:null,bestEpoch:0};
 let best=null;
 for(let start=0;start<settings.starts;start++){
  let seed=(settings.seed+start*104729)>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296};
  const coords=nodes.map((_,i)=>{const angle=2*Math.PI*(i/n+.12*(random()-.5));return start===0?[mean*Math.cos(angle),mean*Math.sin(angle)]:[(random()-.5)*mean*2,(random()-.5)*mean*2]});
  const order=Int32Array.from({length:pairs},(_,i)=>i);
  const keep=epoch=>{const fit=evaluate(coords);if(!best||fit.rawStress<best.rawStress)best={...fit,bestStart:start+1,bestEpoch:epoch}};keep(0);
  for(let epoch=0;epoch<settings.epochs;epoch++){
   for(let q=pairs-1;q>0;q--){const j=Math.floor(random()*(q+1)),v=order[q];order[q]=order[j];order[j]=v}
   const eta=.3*Math.pow(.002/.3,epoch/Math.max(1,settings.epochs-1));
   for(const q of order){const i=a[q],j=b[q];let dx=coords[i][0]-coords[j][0],dy=coords[i][1]-coords[j][1],d=Math.hypot(dx,dy);if(d<1e-15){const angle=random()*2*Math.PI;dx=Math.cos(angle)*1e-12;dy=Math.sin(angle)*1e-12;d=1e-12}const step=.5*eta*(d-targets[q])/d;dx*=step;dy*=step;coords[i][0]-=dx;coords[i][1]-=dy;coords[j][0]+=dx;coords[j][1]+=dy}
   if((epoch+1)%10===0||epoch+1===settings.epochs)keep(epoch+1);
  }
 }
 return {...best,settings};
}
