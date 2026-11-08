// Evaluation of preserved coordinates, never a fitting objective or a refit.
const embeddingStressSeed=20261024,embeddingStressCache=new Map(),embeddingStressDetails=new Map();
function stressPairs(n,limit=20000,seed=embeddingStressSeed){
 const total=n*(n-1)/2,pairs=[];
 if(total<=limit){for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)pairs.push([i,j]);return {pairs,sampled:false}}
 let state=seed>>>0;const random=()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296},seen=new Set();
 while(pairs.length<limit){let i=Math.floor(random()*n),j=Math.floor(random()*n);if(i===j)continue;if(i>j)[i,j]=[j,i];const key=i*n+j;if(!seen.has(key)){seen.add(key);pairs.push([i,j])}}
 return {pairs,sampled:true};
}
function stressDistance(a,b,metric='abundance_euclidean',anchor=null){
 let i=0,j=0,sum=0;const ratio=metric.includes('ratio'),root=metric==='sqrt_ratio_euclidean',hell=metric==='hellinger',js=metric==='jensen_shannon';
 const maximum=metric.startsWith('maxnorm_'),infinity=metric==='maxnorm_linf';
 const ar=maximum?Math.max(...a.map(v=>v[1])):ratio?a.find(v=>v[0]===anchor)?.[1]:1,br=maximum?Math.max(...b.map(v=>v[1])):ratio?b.find(v=>v[0]===anchor)?.[1]:1;
 if(!(ar>0&&br>0))throw Error('Reference abundance is zero in ratio coordinates.');
 while(i<a.length||j<b.length){const ai=a[i]?.[0]??Infinity,bj=b[j]?.[0]??Infinity,k=Math.min(ai,bj);let u=ai===k?a[i++][1]:0,v=bj===k?b[j++][1]:0;
  if(ratio||maximum){u/=ar;v/=br}
  if(js){if(u>0)sum+=u*Math.log2(2*u/(u+v));if(v>0)sum+=v*Math.log2(2*v/(u+v))}
  else{if(root||hell){u=Math.sqrt(u);v=Math.sqrt(v)}sum=infinity?Math.max(sum,Math.abs(u-v)):sum+(u-v)**2}
 }
 return infinity?sum:Math.sqrt(Math.max(0,sum/(hell||js?2:1)));
}
function evaluateEmbeddingStress(rows,coords,{metric='abundance_euclidean',anchor=null,scale=1,limit=20000}={}){
 if(rows.length!==coords.length||!(scale>0))throw Error('Coordinate and target identities differ.');
 const {pairs,sampled}=stressPairs(rows.length,limit);let sum=0,used=0,zero=0;
 for(const [i,j] of pairs){const target=stressDistance(rows[i],rows[j],metric,anchor);if(target===0){zero++;continue}
  const embedded=Math.hypot(...coords[i].map((v,k)=>v-coords[j][k]))/scale;
  const error=embedded/target-1;if(!Number.isFinite(error))throw Error('Nonfinite target-distance error.');sum+=error*error;used++;
 }
 return {relativeRms:used?Math.sqrt(sum/used):null,pairs:used,zeroPairs:zero,profiles:rows.length,sampled,seed:sampled?embeddingStressSeed:null,displayScale:scale};
}
function setEmbeddingStress(id,result,scope){
 const button=el(id);if(!button)return;
 embeddingStressDetails.set(id,{result,scope});
 button.textContent='RMS relative error: '+(result?.relativeRms!=null?(100*result.relativeRms).toFixed(2)+'%'+(result.sampled?' (sampled)':''):'unavailable');
 button.title='Show the stress formula, target metric and evaluation scope';
}
function cachedEmbeddingStress(key,calculate){
 if(embeddingStressCache.has(key))return embeddingStressCache.get(key);
 const value=calculate();if(embeddingStressCache.size>=16)embeddingStressCache.delete(embeddingStressCache.keys().next().value);embeddingStressCache.set(key,value);return value;
}
function renderSampleStress(){
 if(typeof jointEmbeddingStress==='function'&&jointEmbeddingStress())return;
 try{
  const bundle=datasetRegistry.get(META.id),supplement=participantData(),asset=BUNDLE_PACK.stressCompositions?.[META.id],compositions=(asset?.datasetRevision===bundle.dataset.revision?asset.compositions:null)||supplement?.compositions;
  if(!compositions)throw Error('Full target compositions are not supplied for this dataset.');
  const records=participant.active?new Map(supplement.records.map(r=>[r.index,r])):null,points=new Map();
  const put=(profile,t,k)=>{if(!Number.isInteger(profile))return;const xyz=[t.x[k],t.y[k],t.z[k]];if(!xyz.every(Number.isFinite))return;const identity=bundle.data.geometryProfile?.[profile]??profile;if(!points.has(identity))points.set(identity,{profile,xyz})};
  for(const t of el('samples').data||[]){if(!legendVisibleTrace(t))continue;
   if(participant.active){if(t.meta?.legendRecords)t.meta.legendRecords.forEach((index,k)=>put(records.get(index)?.profile,t,k));}
   else if(t.meta?.sampleView&&!t.meta.edgeFaceRings)(t.ids||[]).forEach((id,k)=>{const index=Number(id);put(DATA.records?DATA.records[index]?.profile:index,t,k)});
  }
  const ordered=[...points].sort((a,b)=>a[0]-b[0]).map(([,p])=>p),rows=ordered.map(p=>compositions[p.profile]);
  if(rows.some(r=>!r))throw Error('Full target compositions are missing for some displayed profiles; no partial-population score is substituted.');
  if(typeof maxNormalizedStress==='function'&&maxNormalizedStress(ordered,rows))return;
  const key=JSON.stringify([META.id,bundle.dataset.revision,asset?.matrixSha256||supplement.provenance.matrixSha256,ordered]);
  const result=cachedEmbeddingStress(key,()=>evaluateEmbeddingStress(rows,ordered.map(p=>p.xyz)));
  setEmbeddingStress('sampleStress',result,'Target: original full-composition Euclidean distance. Population: displayed profile identities, including visible background once; reference markers and repeated records at the same profile are excluded. Filtering changes this evaluation population; it does not refit the embedding.');
 }catch(error){setEmbeddingStress('sampleStress',null,error.message)}
}
function renderFamilyStress(hood,view,xyz){
 try{
  const supplemental=BUNDLE_PACK.embeddingStressDiagnostics?.[view.id];
  if(!view.distanceEvaluation&&supplemental&&supplemental.fingerprint.coordinateSha256===view.coordinateSha256&&supplemental.fingerprint.scale===view.alignment.scale&&supplemental.profiles===hood.size)view={...view,distanceEvaluation:supplemental};
  const scope='Target: '+view.metric+' · '+view.construction+(view.construction==='Complete Fermat'?' · p='+view.power:'')+'. Population: the full '+hood.size.toLocaleString()+'-profile neighborhood, independent of highlight or visibility filters.';
  if(view.distanceEvaluation){setEmbeddingStress('familyStress',{...view.distanceEvaluation,sampled:true},scope+' Sampling: '+view.distanceEvaluation.scope+'.');return}
  if(view.evaluation){setEmbeddingStress('familyStress',{...view.evaluation,profiles:hood.size,sampled:true,displayScale:1},scope+' Sampling: '+view.evaluation.scope+'.');return}
  if(view.construction==='Complete Fermat'&&Number(view.power)!==1)throw Error(scope+' The original Fermat target matrix is not available at its recorded source path. The saved display-path graph is not a verified replacement; no score is substituted.');
  if(!['Complete Fermat','PCA projection'].includes(view.construction))throw Error('The target geometry is not documented for this view.');
  const asset=BUNDLE_PACK.neighborhoodCompositions[hood.collection],name=hood.anchor==='Li'?'Lactobacillus_iners':'Lactobacillus_crispatus',anchor=asset.features.indexOf(name);
  const result=cachedEmbeddingStress(hood.key+'|'+view.coordinateSha256+'|'+asset.revision,()=>evaluateEmbeddingStress(hood.profileIndices.map(p=>asset.compositions[p]),hood.profileIndices.map((_,i)=>xyz.map(axis=>axis[i])),{metric:view.metric,anchor,scale:view.alignment.scale}));
  setEmbeddingStress('familyStress',result,scope);
 }catch(error){setEmbeddingStress('familyStress',null,error.message)}
}
function installEmbeddingStress(){
 const style=document.createElement('style');style.textContent=`.embeddingHeading{flex:1;min-width:180px}.embeddingStress{display:block;border:0;background:transparent;color:#355d70;font:inherit;font-size:12px;text-align:left;text-decoration:none;padding:4px 0 0;cursor:pointer}.embeddingStress:hover{color:#12657e}.embeddingStress:focus-visible{outline:2px solid #12657e;outline-offset:3px}#embeddingStressDialog{max-width:650px;width:calc(100% - 60px);max-height:85vh;overflow:auto;border:1px solid #9bb3bf;border-radius:8px;padding:20px;color:#203d4b}#embeddingStressDialog::backdrop{background:#0005}#embeddingStressDialog math{font-size:23px;margin:22px 0;overflow:auto}#embeddingStressDialog p,#embeddingStressDialog li{font-size:14px;line-height:1.5}#embeddingStressDialog button{float:right}`;document.head.appendChild(style);
 const dialog=document.createElement('dialog');dialog.id='embeddingStressDialog';dialog.setAttribute('aria-labelledby','embeddingStressTitle');
 dialog.innerHTML=String.raw`<button type="button" id="embeddingStressClose" aria-label="Close stress explanation">Close</button><h2 id="embeddingStressTitle">Root mean squared relative error</h2><p id="embeddingStressValue"></p>
 <math xmlns="http://www.w3.org/1998/Math/MathML" display="block" aria-label="Stress percent equals 100 times the square root of the mean squared relative distance error"><semantics><mrow><msub><mi>S</mi><mo>%</mo></msub><mo>=</mo><mn>100</mn><msqrt><mrow><mfrac><mn>1</mn><mrow><mo>|</mo><mi>P</mi><mo>|</mo></mrow></mfrac><munder><mo>∑</mo><mrow><mo>(</mo><mi>i</mi><mo>,</mo><mi>j</mi><mo>)</mo><mo>∈</mo><mi>P</mi></mrow></munder><msup><mrow><mo>(</mo><mfrac><mrow><msub><mover><mi>d</mi><mo>^</mo></mover><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>−</mo><msub><mi>d</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub></mrow><msub><mi>d</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub></mfrac><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mrow><annotation encoding="application/x-tex">S_{\%}=100\sqrt{\frac{1}{|P|}\sum_{(i,j)\in P}\left(\frac{\widehat d_{ij}-d_{ij}}{d_{ij}}\right)^2}</annotation></semantics></math>
 <ul><li><i>i, j</i>: two profile identities in the evaluated population.</li><li><i>P</i>: evaluated unordered pairs with strictly positive target distance; |<i>P</i>| is their number. Zero-distance pairs are excluded because relative error would be undefined.</li><li><i>dᵢⱼ</i>: the distance prescribed by this embedding’s target metric, including any graph shortest-path or Fermat construction.</li><li><i>d̂ᵢⱼ</i>: Euclidean distance between the two saved 3D coordinates, with any recorded display-only scale factor undone. Rotation and translation do not affect it.</li><li><i>S</i><sub>%</sub>: RMS relative error expressed as a percentage. Zero means exact distance preservation; values can exceed 100%.</li></ul>
 <p id="embeddingStressScope"></p><p id="embeddingStressEvaluation"></p><p>Every evaluated pair has equal weight. This emphasizes fractional errors at short target distances. It differs from target-normalized RMSE, which divides the sum of squared errors by the sum of squared target distances, and from a sparse solver’s training-stress proxy. A sampled estimate is not an exact all-pairs value, and scores against different target metrics are not a common ranking.</p>`;
 document.body.appendChild(dialog);el('embeddingStressClose').onclick=()=>dialog.close();
 document.addEventListener('click',event=>{const button=event.target.closest?.('.embeddingStress');if(!button)return;const {result,scope}=embeddingStressDetails.get(button.id)||{};
  el('embeddingStressValue').textContent=button.textContent;el('embeddingStressScope').textContent=(scope||'Diagnostic not yet available.')+(button.id==='sampleStress'&&!(typeof jointEmbeddingActive==='function'&&jointEmbeddingActive())&&!participant.active&&!hasSelection()?' '+(maxNormalizedDescription()||(el('sampleEmbedding').value==='reference'?'Combined-reference direct 3D coordinates restricted to the selected population.':META.overviewDescription)||''):'');
  el('embeddingStressEvaluation').textContent=result?`${result.profiles?.toLocaleString()??'—'} profiles; ${result.pairs.toLocaleString()} positive-distance pairs. ${result.sampled?'Sampled estimate'+(Number.isInteger(result.seed)?'; seed '+result.seed:'')+'.':'All profile pairs evaluated.'}${result.zeroPairs?' '+result.zeroPairs+' zero-distance pairs excluded.':''}${result.displayScale&&result.displayScale!==1?' Saved display distances divided by '+result.displayScale.toPrecision(7)+'.':''}`:'';
  dialog.showModal();
 });
}
