"""Bounded local R graph layouts. No sample tables, shell input or arbitrary paths."""
from pathlib import Path
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RUNTIME = Path(os.environ.get('MICOVE_GRAPH_CACHE', ROOT/'.preview'/'graph_layouts'))
INSTALLED = os.environ.get('MICOVE_GRIP_INSTALLED') == '1'
GRIP = ROOT.parent/'grip'
SNAPSHOTS = ROOT/'.preview'/'grip_runtime'
WORKER = HERE/'graph_layout_worker.R'
SETTINGS = {'version':'graph-layout-r-v2', 'seed':20261016, 'mds_backend':'sgd',
            'mds_starts':3, 'mds_epochs':500, 'grip_rounds':160, 'grip_final_rounds':384,
            'threads':1, 'max_nodes':512, 'max_edges':10000}
LOCK = threading.Lock()
ENV = {**os.environ, **{k:'1' for k in ['OMP_NUM_THREADS','OMP_THREAD_LIMIT','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS']}, 'MAKEFLAGS':'-j1'}
# launchd does not inherit the interactive shell PATH.
RSCRIPT = os.environ.get('MICOVE_RSCRIPT') or shutil.which('Rscript') or '/Library/Frameworks/R.framework/Resources/bin/Rscript'

def digest(paths, root=None):
    h=hashlib.sha256()
    for p in sorted(paths):
        h.update(str(p.relative_to(root) if root else p.name).encode());h.update(p.read_bytes())
    return h.hexdigest()

def source_files(root):
    files=[root/'DESCRIPTION',root/'NAMESPACE']
    files += [p for p in (root/'src').rglob('*') if p.is_file() and (p.suffix in ['.cpp','.c','.h','.hpp'] or p.name.startswith('Makevars'))]
    files += [p for folder in ['R','inst'] for p in (root/folder).rglob('*') if p.is_file() and p.name!='.DS_Store']
    files += [root/name for name in ['configure','configure.win','cleanup','cleanup.win','LICENSE','LICENSE.md'] if (root/name).is_file()]
    return files

def source_identity(root=GRIP):
    return digest(source_files(root),root)

def binaries(root):
    return list((root/'src').glob('*.so'))+list((root/'src').glob('*.dll'))

def runtime_source(receipt):
    if receipt.get('load') == 'installed':
        return '-'
    if not receipt.get('sourceTree'):
        raise ValueError('Prepare the isolated VME grip runtime: python3 rank2_feature_graph/graph_layout_service.py --prepare')
    root=(ROOT/receipt['sourceTree']).resolve()
    if not root.is_relative_to(SNAPSHOTS.resolve()):raise ValueError('Invalid VME grip snapshot path')
    return root

def runtime_identity():
    if INSTALLED:
        try:
            info=json.loads(subprocess.check_output([RSCRIPT,'--vanilla','-e',
                'cat(jsonlite::toJSON(list(path=find.package("grip"),versions=c(R=R.version.string,vapply(c("grip","Rcpp","igraph","jsonlite"),function(p)as.character(packageVersion(p)),""))),auto_unbox=TRUE))'],
                text=True,env=ENV,timeout=20))
            root=Path(info['path'])
            # Hash the installed R database, native library and metadata, not just its version.
            files=[p for p in root.rglob('*') if p.is_file() and p.relative_to(root).parts[0] in ['R','libs','Meta','DESCRIPTION','NAMESPACE']]
            if not files:raise ValueError('Installed grip has no runtime files')
            identity={'load':'installed','packageSha256':digest(files,root),'runtimeVersions':info['versions'],
                      'worker':digest([WORKER]),'settings':SETTINGS}
            identity['id']=hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()
            return identity
        except (OSError,subprocess.SubprocessError,ValueError) as error:
            raise ValueError('Install R, grip and jsonlite before using Start MiCOVE with GRIP.command; see GRAPH_LAYOUTS.md.') from error
    try:
        receipt=json.loads((RUNTIME/'optimized_runtime.json').read_text())
    except FileNotFoundError as error:
        raise ValueError('Prepare local grip with: python3 rank2_feature_graph/graph_layout_service.py --prepare') from error
    root=runtime_source(receipt)
    try:
        valid=receipt['source']==source_identity(root) and receipt['binary']==digest(binaries(root),root) and bool(binaries(root))
    except OSError:
        valid=False
    if not valid:
        raise ValueError('VME grip snapshot changed or is incomplete; run python3 rank2_feature_graph/graph_layout_service.py --prepare before fitting.')
    try:
        versions=subprocess.check_output([RSCRIPT,'--vanilla','-e','cat(jsonlite::toJSON(c(R=R.version.string,vapply(c("Rcpp","igraph","jsonlite","pkgload"),function(p)as.character(packageVersion(p)),"")),auto_unbox=TRUE))'],text=True,env=ENV)
    except (OSError,subprocess.SubprocessError) as error:
        raise ValueError('The R graph runtime or its support packages are unavailable; prepare the local runtime again.') from error
    identity={**receipt,'worker':digest([WORKER]),'settings':SETTINGS,'runtimeVersions':json.loads(versions)}
    identity['id']=hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()
    return identity

def prepare():
    RUNTIME.mkdir(parents=True,exist_ok=True)
    stamp=str(time.time_ns());log=RUNTIME/('optimized-build-'+stamp+'.log')
    snapshot=SNAPSHOTS/stamp/'grip'
    before=source_identity(GRIP)
    for source in source_files(GRIP):
        target=snapshot/source.relative_to(GRIP);target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
    if before!=source_identity(GRIP) or before!=source_identity(snapshot):
        raise ValueError('grip source changed during snapshot capture; retry preparation. Previous runtime remains active.')
    # Compile only the private source copy; never touch the development checkout.
    command=[RSCRIPT,'--vanilla','-e','p<-commandArgs(TRUE)[1];pkgbuild::compile_dll(p,debug=FALSE,force=TRUE);pkgload::load_all(p,recompile=FALSE,quiet=TRUE);cat("\\nRUNTIME:",R.version.string,"\\n")',str(snapshot)]
    with log.open('w') as stream:subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT,check=True,env=ENV,timeout=600)
    if before!=source_identity(snapshot):raise ValueError('grip snapshot sources changed during compilation; previous runtime remains active.')
    if not binaries(snapshot):raise ValueError('No compiled grip library; previous runtime remains active.')
    version=subprocess.check_output([RSCRIPT,'--version'],text=True,stderr=subprocess.STDOUT).strip()
    receipt={'source':before,'binary':digest(binaries(snapshot),snapshot),'sourceTree':str(snapshot.relative_to(ROOT)),
             'upstream':str(GRIP),'R':version,'Rscript':RSCRIPT,'optimized':True,'log':log.name}
    # Retain previous receipts and switch only after the new snapshot builds successfully.
    temporary=RUNTIME/('optimized-runtime-'+stamp+'.json');temporary.write_text(json.dumps(receipt,indent=2))
    shutil.copy2(temporary,RUNTIME/('optimized-runtime-'+stamp+'.tmp'))
    (RUNTIME/('optimized-runtime-'+stamp+'.tmp')).replace(RUNTIME/'optimized_runtime.json')
    print('Prepared isolated optimized grip runtime:',runtime_identity()['id'])

def validate_request(x):
    if not isinstance(x,dict) or set(x)!={'method','dimension','nodes','edges','initial','context'}:raise ValueError('Invalid graph-layout request fields')
    if x['method'] not in ['mds','grip','weighted_grip'] or type(x['dimension']) is not int or x['dimension'] not in [2,3]:raise ValueError('Invalid embedding method or dimension')
    nodes=x['nodes'];edges=x['edges'];initial=x['initial'];d=x['dimension']
    if not isinstance(nodes,list) or not 1<=len(nodes)<=512 or any(type(v) is not int or not 0<=v<1000000 for v in nodes) or len(set(nodes))!=len(nodes):raise ValueError('Graph must contain 1–512 unique integer vertices')
    def finite(v):return type(v) in [int,float] and math.isfinite(v)
    if not isinstance(initial,list) or len(initial)!=len(nodes) or any(not isinstance(p,list) or len(p)!=d or any(not finite(v) or abs(v)>1e9 for v in p) for p in initial):raise ValueError('Invalid initial coordinates')
    if not isinstance(edges,list) or not 1<=len(edges)<=10000:raise ValueError('Graph must contain 1–10000 edges')
    known=set(nodes);seen=set()
    for e in edges:
        if not isinstance(e,list) or len(e)!=3 or type(e[0]) is not int or type(e[1]) is not int or e[0] not in known or e[1] not in known or e[0]==e[1] or not finite(e[2]) or not 0<e[2]<=10000:raise ValueError('Invalid endpoints or positive edge length')
        key=tuple(sorted(e[:2]))
        if key in seen:raise ValueError('Duplicate edge')
        seen.add(key)
    if not isinstance(x['context'],str) or len(x['context'])>1024:raise ValueError('Invalid graph context')
    return x

def fit_graph(request):
    x=validate_request(request)
    with LOCK:
        identity=runtime_identity()
        key=hashlib.sha256(json.dumps({'request':x,'runtime':identity},sort_keys=True,separators=(',',':')).encode()).hexdigest()
        folder=RUNTIME/key;result_path=folder/'result.json'
        if result_path.exists():
            envelope=json.loads(result_path.read_text())
            if envelope['runtimeId']!=identity['id'] or envelope['request']!=x:raise ValueError('Cached layout metadata does not match this request')
            payload=envelope['result'];checksum=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
            if checksum!=envelope['resultSha256']:raise ValueError('Cached graph layout checksum mismatch')
            return {**payload,'cached':True}
        if sum(p.stat().st_size for p in RUNTIME.rglob('*') if p.is_file())>100*1024*1024:raise ValueError('Graph cache reached 100 MiB; existing fits remain usable. No files were deleted.')
        folder.mkdir(parents=True,exist_ok=True)
        attempt=folder/str(time.time_ns());attempt.mkdir()
        source=attempt/'input.json';target=attempt/'output.json';source.write_text(json.dumps(x))
        with (attempt/'fit.log').open('w') as log:
            try:
                subprocess.run([RSCRIPT,'--vanilla',str(WORKER),str(runtime_source(identity)),str(source),str(target)],stdout=log,stderr=subprocess.STDOUT,env=ENV,check=True,timeout=90)
            except (subprocess.SubprocessError,OSError) as e:
                raise ValueError('R graph fit failed; diagnostic log retained at '+str(attempt/'fit.log')) from e
        if runtime_identity()['id']!=identity['id']:raise ValueError('Local grip runtime changed during fitting; result was not published')
        result=json.loads(target.read_text())
        if result['nodes']!=x['nodes'] or result['dimension']!=x['dimension'] or len(result['coords'])!=len(x['nodes']) or any(len(p)!=x['dimension'] or any(not math.isfinite(v) for v in p) for p in result['coords']):raise ValueError('R returned invalid graph coordinates')
        result.update(runtimeId=identity['id'],requestHash=key,settings=SETTINGS)
        envelope={'request':x,'runtimeId':identity['id'],'runtime':identity,'result':result,'resultSha256':hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()}
        temporary=folder/'result.tmp';temporary.write_text(json.dumps(envelope,allow_nan=False));temporary.replace(result_path)
        return {**result,'cached':False}

if __name__=='__main__':
    if sys.argv[1:]==['--prepare']:prepare()
    else:print(json.dumps(fit_graph(json.load(sys.stdin))))
