const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const C=require('./comb_mg_population.js');
const folder=process.argv[2];assert(folder,'Pass the prepared comb-mg package folder');
const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
const read=d=>JSON.parse(fs.readFileSync(path.join(folder,d.url)));
const data=read(m.entry.parts[0]).combMgPopulation;let checks=0;
const original=JSON.stringify(data);
for(const [pop,d] of Object.entries(data.taxonContext||{})){
 const context=read(d),records=read(data.samples[pop]),shown=C.taxonDisplay(context,8);
 assert.deepEqual(context.samples.map(s=>s.sample_id),records.map(s=>s.sample_id));
 assert.equal(shown.taxa.length,8);assert.equal(shown.n,pop==='3.5k'?2682:2986);
 assert.equal(C.taxonDisplay(context,10000).n,records.length);
 assert(context.taxa.every((t,i)=>i===0||context.taxa[i-1].n>=t.n));
 for(const t of shown.taxa)assert.equal(t.referenceSample,records[t.referenceIndex].sample_id);
 const before=JSON.stringify(context);C.taxonDisplay(context,1);assert.equal(JSON.stringify(context),before);
}
for(const v of ['',null,'NA',' NaN ','N/A'])assert.equal(C.ctValue(v),'');
assert.equal(C.ctValue('0'),'0');assert.equal(C.ctValue('1'),'1');
const options=C.options(data);
if(data.abundanceKind==='sum'){
 assert.deepEqual(options.constructions.map(x=>x[0]),['AZ']);assert.deepEqual(options.representations.map(x=>x[0]),['sum_cag','sum_other']);
 assert.equal(C.fractionLabel({representation:'sum_other',geometry:'l1|euclidean'}),'Fraction of in-scope reads');
 assert.equal(C.fractionLabel({representation:'sum_cag',geometry:'l1|euclidean'}),'Fraction of CAG reads');
 assert.equal(C.fractionLabel({representation:'sum_cag',geometry:'max|linf'}),'Max-scaled value');
 assert.throws(()=>C.validate(data,{population:'3.5k',construction:'AZ',representation:'mean',geometry:'l1|euclidean'}),/unavailable/);
}
for(const [population] of options.populations)for(const [construction] of options.constructions)for(const [representation] of options.representations)for(const [geometry] of options.geometries){
 const s={population,construction,representation,geometry,cohort:'',group:''},bank=C.validate(data,s),records=read(data.samples[population]);
 const xyz=read(bank.coordinates),t=data.tables[bank.table],features=read(t.features),top=read(t.top);
 assert.equal(xyz.length,records.length);assert.equal(new Set(records.map(r=>r.sample_id)).size,records.length);
 assert.equal(top.length,records.length);assert(xyz.every(p=>p.length===3&&p.every(Number.isFinite)));
 assert(top.every(a=>a.every(([j,v])=>Number.isInteger(j)&&j>=0&&j<features.length&&Number.isFinite(v)&&v>=0)));
 for(const group of ['',...new Set(records.map(r=>r.exploratory_group))])for(const cohort of ['',...new Set(records.map(r=>r.study))]){
  const got=C.rows(records,{...s,group,cohort}),expected=records.filter(r=>(!group||r.exploratory_group===group)&&(!cohort||r.study===cohort));
  assert.deepEqual(got.map(x=>x.r),expected);assert(got.every(x=>records[x.i]===x.r));checks++;
 }
 const restored=JSON.parse(JSON.stringify(s));assert.equal(C.validate(data,restored),bank);
}
assert.throws(()=>C.validate(data,{population:'3.5k',construction:'AZ',representation:'mean',geometry:'l1|linf'}),/unavailable/);
assert.equal(JSON.stringify(data),original,'Selection does not mutate data');
assert.equal(C.escape('<name>'), '&lt;name&gt;');assert(C.csv([{id:'a,"b',value:null}]).includes('"a,""b"'));
console.log('PASS: all',Object.keys(data.maps).length,'saved maps,',checks,'cohort/group filters, exact index joins, invalid-method rejection, restoration and unchanged inputs.');
