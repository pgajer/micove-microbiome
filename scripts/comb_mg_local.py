"""Prepare, fit, independently verify and package local pure 1-CST CAG maps.

Run explicitly with an existing checked comb-mg package and an isolated library
containing an optimized build of the chosen grip source. Never run by an update.
"""
import argparse
import copy
import fcntl
import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

import comb_mg_supplement as c


def save(path, value):
    tmp = path.with_suffix(path.suffix+'.tmp')
    tmp.write_bytes(c.p.encoded(value)); tmp.replace(path)


def read(root, desc):
    return json.loads(c.p.checked_bytes(root, desc))


def prepare(package, root, coverage):
    import numpy as np
    assert coverage == 90, 'This release fits the states covering 90% per population'
    assert not (root/'plan.json').exists(), 'Existing plan preserved'
    entry = c.package(package); data = read(package, entry['parts'][0])['combMgPopulation']
    assert data['abundanceKind'] == 'sum' and data.get('taxonContext')
    runtime = json.loads((root/'runtime.json').read_text())
    worker = Path(__file__).with_name('comb_mg_local_mds.R')
    shutil.copy2(worker,root/worker.name)
    tasks = []; memberships = {}; top_taxa = {}
    for pop in data['samples']:
        records = read(package,data['samples'][pop]); context = read(package,data['taxonContext'][pop])
        chosen=[];n=0
        for t in context['taxa']:
            chosen.append(t);n+=t['n']
            if 100*n>=coverage*len(records):break
        memberships[pop]=dict(target=coverage,actual=100*n/len(records),states=chosen)
        table=data['tables'][pop+'|AZ|sum_other|l1'];features=read(package,table['features'])
        with gzip.open(c.p.asset_path(package,table['rawDownload']),'rt') as f:
            header=next(f).rstrip('\n').split('\t');rows=[line.rstrip('\n').split('\t') for line in f]
        assert header==['sample_id']+[f['feature'] for f in features]
        assert [r[0] for r in rows]==[r['sample_id'] for r in records]
        counts=np.array([r[1:] for r in rows],dtype=float)
        top_taxa[pop]=c.taxon_top(counts,features,records)
        assert all(t[0][0]==s['taxon'] and abs(t[0][1]-s['fraction'])<1e-14
                   for t,s in zip(top_taxa[pop]['values'],context['samples']))
        del counts,rows
        for tkey,table in data['tables'].items():
            if not tkey.startswith(pop+'|'):continue
            raw=gzip.decompress(c.p.checked_bytes(package,table['matrix']))
            assert c.p.sha(raw)==table['matrixSha256']
            X=np.frombuffer(raw,dtype='<f8').reshape(table['samples'],table['featureCount'])
            for t in chosen:
                indices=[i for i,s in enumerate(context['samples']) if s['taxon']==t['taxon']]
                assert len(indices)==t['n'] and len(indices)>=4
                state_id=c.p.sha(c.p.encoded([pop,t['taxon']]))[:16]
                inp=root/'inputs'/state_id/tkey.replace('|','_');inp.mkdir(parents=True)
                matrix=inp/'matrix.bin';matrix.write_bytes(np.asarray(X[indices],dtype='<f8').tobytes())
                for key,bank in data['maps'].items():
                    if bank['table']!=tkey:continue
                    dest=root/'fits'/c.p.sha(c.p.encoded([key,t['taxon']]))[:20];dest.mkdir(parents=True)
                    xyz=read(package,bank['coordinates'])
                    ref=max(indices,key=lambda i:context['samples'][i]['fraction'])
                    info=dict(map=key,taxon=t['taxon'],indices=indices,sample_ids=[records[i]['sample_id'] for i in indices],
                        n=len(indices),p=X.shape[1],metric=bank['targetMetric'],matrix=str(matrix.relative_to(root)),
                        matrix_sha256=c.sha_file(matrix),population_xyz=[xyz[i] for i in indices],
                        source_table_sha256=table['matrixSha256'],source_contract=data['sourceContractSha256'],
                        worker_sha256=c.sha_file(worker),runtime_sha256=c.p.sha(c.p.encoded(runtime)),
                        reference=dict(taxon=t['taxon'],referenceIndex=ref,referenceSample=records[ref]['sample_id'],
                                       referenceFraction=context['samples'][ref]['fraction']))
                    info['task_sha256']=c.p.sha(c.p.encoded(info));save(dest/'input.json',info)
                    tasks.append(dict(directory=str(dest.relative_to(root)),n=len(indices),sha256=info['task_sha256']))
            del X,raw
    save(root/'top_taxa.json',top_taxa)
    save(root/'plan.json',dict(package=str(package),source_manifest_sha256=c.sha_file(package/'manifest.json'),
         runtime=runtime,tasks=sorted(tasks,key=lambda t:-t['n']),memberships=memberships,
         epochs=200,backend='sgd',pair_weights='inverse_squared',starts=1,
         initialization='Lower scale-profiled error of PCA and population subset'))
    print('Prepared',len(tasks),'local fits',flush=True)


def verify(root, dest):
    import numpy as np
    from scipy.spatial.distance import pdist
    info=json.loads((dest/'input.json').read_text());result=json.loads((dest/'complete.json').read_text())
    assert result['task_sha256']==info['task_sha256']==c.p.sha(c.p.encoded({k:v for k,v in info.items() if k!='task_sha256'}))
    assert c.sha_file(dest/'coordinates.tsv')==result['coordinates_sha256']
    assert c.sha_file(dest/'fit.rds')==result['fit_sha256']
    raw=(root/info['matrix']).read_bytes();assert c.p.sha(raw)==info['matrix_sha256']
    X=np.frombuffer(raw,dtype='<f8').reshape(info['n'],info['p'])
    Y=np.loadtxt(dest/'coordinates.tsv');assert Y.shape==(info['n'],3) and np.isfinite(Y).all()
    D=pdist(X,metric='chebyshev' if info['metric']=='linf' else 'euclidean')
    assert np.isfinite(D).all() and (D>0).all()
    rms=float(np.sqrt(np.mean((pdist(Y)/D-1)**2)))
    population_rms=float(np.sqrt(np.mean((pdist(info['population_xyz'])/D-1)**2)))
    assert abs(rms-result['rms_relative_error'])<1e-8 and rms<=population_rms+1e-8
    save(dest/'verification.json',dict(passed=True,task_sha256=info['task_sha256'],pairs=len(D),
         rms_relative_error=rms,population_subset_rms=population_rms,
         coordinates_sha256=result['coordinates_sha256'],verifier_sha256=c.sha_file(Path(__file__))))


def run(root, workers, memory):
    import psutil
    assert 1<=workers<=12 and 2<=memory<=55
    plan=json.loads((root/'plan.json').read_text());pending=list(plan['tasks']);active={};done=[];failed=[]
    for file,digest in plan['runtime']['library_files'].items():
        assert c.sha_file(root/file)==digest, 'Changed fitting runtime'
    lock=(root/'run.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    env=dict(os.environ,OMP_NUM_THREADS='1',OMP_THREAD_LIMIT='1',OPENBLAS_NUM_THREADS='1',
             MKL_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS='1')
    save(root/'allocation.json',dict(workers=workers,memory_GiB=memory,pid=os.getpid()))
    while pending or active:
        for task_id,(proc,log,task,stage) in list(active.items()):
            if proc.poll() is None:continue
            log.close();del active[task_id]
            if proc.returncode:failed.append(task_id);continue
            if stage=='fit':pending.insert(0,dict(task,verify=True))
            else:done.append(task_id)
        parent=psutil.Process();rss=0
        for process in [parent]+parent.children(recursive=True):
            try:rss+=process.memory_info().rss
            except psutil.NoSuchProcess:pass
        while pending and not failed and len(active)<workers and rss+(len(active)+1)*1.3*1024**3<memory*1024**3:
            assert shutil.disk_usage(root).free>10*1024**3,'Low free disk: no new admission'
            task=pending.pop(0);dest=root/task['directory'];info=json.loads((dest/'input.json').read_text())
            assert info['task_sha256']==task['sha256'] and c.sha_file(root/'comb_mg_local_mds.R')==info['worker_sha256']
            task_id=dest.name; verification=dest/'verification.json'
            if verification.exists():
                v=json.loads(verification.read_text());assert v['passed'] and v['task_sha256']==task['sha256']
                assert c.sha_file(dest/'coordinates.tsv')==v['coordinates_sha256'];done.append(task_id);continue
            stage='verify' if (dest/'complete.json').exists() else 'fit'
            cmd=[sys.executable,str(Path(__file__).resolve()),'verify',str(root),'--fit',str(dest)] if stage=='verify' else ['Rscript',str(root/'comb_mg_local_mds.R'),str(root),str(dest)]
            log=(dest/(stage+'.log')).open('a');proc=subprocess.Popen(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
            active[task_id]=(proc,log,task,stage)
        save(root/'status.json',dict(completed=len(done),requested=len(plan['tasks']),active={k:dict(pid=v[0].pid,stage=v[3]) for k,v in active.items()},
             failed=failed,rss_GiB=rss/1024**3,time=time.time()))
        if failed and not active:raise RuntimeError('Failed fits preserved: '+','.join(failed))
        if pending or active:time.sleep(1)
    print('Verified',len(done),'local fits',flush=True)


def pack(root, output):
    import numpy as np
    plan=json.loads((root/'plan.json').read_text());source=Path(plan['package'])
    assert c.sha_file(source/'manifest.json')==plan['source_manifest_sha256']
    assert not output.exists(),'Existing package preserved'
    shutil.copytree(source,output)
    manifest=json.loads((output/'manifest.json').read_text());entry=manifest['entry']
    data=read(source,entry['parts'][0])['combMgPopulation'];data['title']='comb-mg';data['localFits']={};data['taxonTop']={}
    def publish(value):
        raw=c.p.encoded(value);h=c.p.sha(raw);d=dict(url='/vme-assets/'+h+'.json',sha256=h,bytes=len(raw))
        c.p.asset_path(output,d).write_bytes(raw);entry['resources'].append(d);return d
    for pop,values in json.loads((root/'top_taxa.json').read_text()).items():data['taxonTop'][pop]=publish(values)
    summaries=[]
    for task in plan['tasks']:
        dest=root/task['directory']
        info=json.loads((dest/'input.json').read_text());result=json.loads((dest/'complete.json').read_text());v=json.loads((dest/'verification.json').read_text())
        assert v['passed'] and v['task_sha256']==task['sha256']==info['task_sha256']==result['task_sha256']
        assert c.sha_file(dest/'coordinates.tsv')==v['coordinates_sha256']==result['coordinates_sha256']
        assert c.sha_file(dest/'fit.rds')==result['fit_sha256']
        xyz=np.loadtxt(dest/'coordinates.tsv').tolist()
        bank=dict(coordinates=publish(dict(indices=info['indices'],sampleIds=info['sample_ids'],xyz=xyz)),
          n=info['n'],rmsRelativeErrorPercent=100*v['rms_relative_error'],populationSubsetErrorPercent=100*v['population_subset_rms'],
          pairs=v['pairs'],targetMetric=info['metric'],coordinateMetric='euclidean',bestEpoch=result['best_epoch'],converged=result['converged'],
          reference=info['reference'],taskSha256=info['task_sha256'],inputSha256=info['matrix_sha256'],
          settings=dict(backend='sgd',approximation='full',epochs=200,starts=1,seed=20261015,pair_weights='inverse_squared',
                        initialization=result['initial'],runtime_sha256=info['runtime_sha256']))
        data['localFits'].setdefault(info['map'],{})[info['taxon']]=bank
        summaries.append(dict(map=info['map'],taxon=info['taxon'],n=info['n'],local=bank['rmsRelativeErrorPercent'],population=bank['populationSubsetErrorPercent']))
    data['capabilities']['localFits']=True
    data['localFitCoverage']=plan['memberships']
    old=entry['parts'][0];entry['resources'].append(old)
    entry['parts']=[publish(dict(combMgPopulation=data))];entry['resources'].remove(entry['parts'][0]);entry['dataset']['title']='comb-mg'
    save(output/'manifest.json',manifest)
    receipt=json.loads((output/'validation.json').read_text());receipt['localFits']=dict(passed=True,count=len(summaries),allPairs=True,coverage=90)
    save(output/'validation.json',receipt);save(root/'summary.json',summaries)
    (output/'README.txt').write_text('MiCOVE comb-mg: unchanged population maps plus local pure 1-CST maps and top-five taxon read fractions.\nInstall using portable.py update --comb-mg PACKAGE; retain the complete folder.\nLocal fits use 200-epoch full SGD metric MDS; empirical read compositions are not cell counts. Identity and body-site holds remain.\n')
    c.package(output);print(output,flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['prepare','run','verify','pack']);p.add_argument('root',type=Path)
    p.add_argument('--package',type=Path);p.add_argument('--coverage',type=float,default=90);p.add_argument('--workers',type=int,default=6)
    p.add_argument('--memory-gib',type=float,default=12);p.add_argument('--fit',type=Path);p.add_argument('--output',type=Path);a=p.parse_args()
    if a.action=='prepare':prepare(a.package.resolve(),a.root.resolve(),a.coverage)
    elif a.action=='run':run(a.root.resolve(),a.workers,a.memory_gib)
    elif a.action=='verify':verify(a.root.resolve(),a.fit.resolve())
    else:pack(a.root.resolve(),a.output.resolve())
