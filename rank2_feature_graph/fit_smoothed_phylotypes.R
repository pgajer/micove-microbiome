# Usage: Rscript fit_smoothed_phylotypes.R RUN PACKAGE_ROOT prepare|VARIANT
# Compile optimized local package snapshots once before starting any worker.
options(warn=1)
Sys.setenv(OMP_NUM_THREADS='1',OMP_THREAD_LIMIT='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS='1')
suppressPackageStartupMessages({library(jsonlite);library(digest)})
a<-commandArgs(trailingOnly=TRUE);run<-normalizePath(a[1]);root<-normalizePath(a[2]);task<-a[3]
for(pkg in c('dgraphs','grip'))pkgload::load_all(file.path(root,pkg),recompile=FALSE,quiet=TRUE)
inp<-read_json(file.path(run,'input.json'),simplifyVector=TRUE)
stopifnot(digest(file=file.path(run,'abundances.bin'),algo='sha256')==inp$matrixSha256)
X<-matrix(readBin(file.path(run,'abundances.bin'),'double',n=inp$rows*inp$columns,size=8,endian='little'),inp$rows,inp$columns,byrow=TRUE)
runtimeFiles<-unlist(lapply(c('dgraphs','grip'),function(pkg)c(list.files(file.path(root,pkg,'R'),full.names=TRUE,pattern='\\.R$'),list.files(file.path(root,pkg,'src'),full.names=TRUE,pattern='\\.(cpp|h|hpp|c|so)$'),file.path(root,pkg,'DESCRIPTION'))))
runtimeHash<-function()digest(vapply(runtimeFiles,function(f)digest(file=f,algo='sha256'),''),algo='sha256')
runtime<-runtimeHash()
writeJson<-function(x,path)write_json(x,path,auto_unbox=TRUE,digits=16,null='null',pretty=FALSE)
rows<-function(M)lapply(seq_len(nrow(M)),function(i)unname(M[i,]))
if(task=='prepare'){
 stopifnot(!file.exists(file.path(run,'smoothed.rds')))
 U<-X/apply(X,1,max);K<-inp$K;n<-nrow(X);groups<-inp$participantGroups;priority<-match(seq_len(n),inp$tiePriority+1L)
 neighbors<-function(points,intrinsic=FALSE){
  indices<-matrix(0L,n,K);radii<-numeric(n);crossFace<-integer(n);tieSplits<-integer(n)
  faces<-lapply(seq_len(n),function(i)which(points[i,]==max(points[i,])))
  for(i in seq_len(n)){
   distance<-if(intrinsic)as.numeric(dgraphs::linf.simplex.distances(points,sources=i)) else sqrt(rowSums(sweep(points,2,points[i,])^2))
   ordered<-order(distance,priority);ordered<-ordered[groups[ordered]!=groups[i]];ordered<-ordered[!duplicated(groups[ordered])]
   stopifnot(length(ordered)>=K);take<-ordered[seq_len(K)];indices[i,]<-take;radii[i]<-distance[take[K]]
   crossFace[i]<-sum(vapply(take,function(j)!length(intersect(faces[[i]],faces[[j]])),FALSE))
   tieSplits[i]<-as.integer(length(ordered)>K&&distance[ordered[K+1L]]==radii[i])
   if(i%%100==0)cat(if(intrinsic)'face-aware' else 'euclidean',i,'/',n,'\n')
  }
  list(indices=indices,radii=radii,crossFace=crossFace,tieSplits=tieSplits)
 }
 l1<-neighbors(X);face<-neighbors(U,TRUE)
 # Equal-weight sets have no order. Sum in frozen record order so identical
 # neighborhoods remain exactly identical rather than roundoff-near-duplicates.
 average<-function(P,N)t(vapply(seq_len(n),function(i)colMeans(P[sort(N[i,]),,drop=FALSE]),numeric(ncol(P))))
 A<-average(X,l1$indices);B<-average(U,face$indices);C<-B/apply(B,1,max)
 stopifnot(max(abs(rowSums(A)-1))<1e-12,all(is.finite(B)),all(apply(C,1,max)==1),runtimeHash()==runtime)
 saveRDS(list(l1=A,maxRaw=B,maxPost=C,l1Neighbors=l1,faceNeighbors=face,runtimeHash=runtime),file.path(run,'smoothed.rds'))
 writeJson(list(l1=lapply(l1,function(v)if(is.matrix(v))rows(v-1L) else v),face=lapply(face,function(v)if(is.matrix(v))rows(v-1L) else v),postScale=apply(B,1,max),runtimeHash=runtime),file.path(run,'smoothing.json'))
 for(pair in list(list('l1',A),list('max-raw',B),list('max-post',C)))writeBin(as.double(t(pair[[2]])),file.path(run,paste0(pair[[1]],'.bin')),size=8,endian='little')
 cat('PREPARATION COMPLETE; all',ncol(X),'phylotypes retained\n');quit(save='no')
}
stopifnot(task%in%c('l1-euclidean','max-raw-euclidean','max-post-euclidean','max-raw-linf','max-post-linf'))
folder<-file.path(run,task);dir.create(folder,showWarnings=FALSE);stopifnot(!file.exists(file.path(folder,'fit.rds')))
s<-readRDS(file.path(run,'smoothed.rds'));stopifnot(runtime==s$runtimeHash)
metric<-if(grepl('linf$',task))'linf' else 'euclidean'
X<-if(startsWith(task,'l1'))s$l1 else if(startsWith(task,'max-raw'))s$maxRaw else s$maxPost
matrixFile<-file.path(run,paste0(if(startsWith(task,'l1'))'l1' else if(startsWith(task,'max-raw'))'max-raw' else 'max-post','.bin'))
uniqueRows<-which(!duplicated(X));U<-X[uniqueRows,,drop=FALSE];keys<-apply(X,1,digest,algo='sha256');mapping<-match(keys,keys[uniqueRows])
stopifnot(!anyNA(mapping))
settings<-list(backend='sgd',dimension=3L,preparationSeed=20261015L,seed=20261015L,starts=1L,epochs=800L,initialization='centered unscaled PCA',targetMetric=metric,q=10L,neighborVarianceTarget=if(metric=='linf')NULL else .9,pivotSelection='randomized',pivots=min(200L,max(1L,floor(nrow(U)/4))),scheduler='zheng',scheduleEpsilon=.1,workspaceBytes=1024^3,matrixSha256=digest(file=matrixFile,algo='sha256'),runtimeSha256=runtime)
pc<-prcomp(U,center=TRUE,scale.=FALSE);initial<-pc$x[,1:3,drop=FALSE];began<-proc.time()[['elapsed']]
prep<-grip::prepare.sparse.mds(U,method=metric,pivot.selection='randomized',n.pivots=settings$pivots,q=settings$q,neighbor.variance.target=settings$neighborVarianceTarget,seed=settings$preparationSeed,max.workspace.bytes=settings$workspaceBytes)
saveRDS(list(prepared=prep,initial=initial,settings=settings,uniqueRows=uniqueRows,mapping=mapping),file.path(folder,'prepared.rds'))
fit<-grip::metric.mds(prepared=prep,approximation='sparse',backend='sgd',dim=3L,init=initial,n.init=1L,max.iter=settings$epochs,seed=settings$seed,diagnostics=FALSE,sgd.control=list(scheduler='zheng',schedule.epsilon=.1,max.workspace.bytes=settings$workspaceBytes))
stopifnot(all(is.finite(fit$coords)),runtimeHash()==runtime)
saveRDS(list(fit=fit,settings=settings,mapping=mapping,uniqueRows=uniqueRows),file.path(folder,'fit.rds'))
evaluate<-function(Y){
 total<-0;sumSq<-0;zero<-0;targetSq<-0;errorSq<-0
 for(i in seq_len(nrow(X)-1L)){
  jj<-seq.int(i+1L,nrow(X));delta<-sweep(X[jj,,drop=FALSE],2,X[i,]);d<-if(metric=='linf')apply(abs(delta),1,max) else sqrt(rowSums(delta^2));z<-sqrt(rowSums(sweep(Y[jj,,drop=FALSE],2,Y[i,])^2));positive<-d>0
  e<-z[positive]/d[positive]-1;sumSq<-sumSq+sum(e^2);total<-total+sum(positive);zero<-zero+sum(!positive);errorSq<-errorSq+sum((z-d)^2);targetSq<-targetSq+sum(d^2)
 }
 list(relativeRms=sqrt(sumSq/total),pairs=total,zeroPairs=zero,profiles=nrow(X),sampled=FALSE,normalizedRms=sqrt(errorSq/targetSq))
}
Z<-fit$coords[mapping,,drop=FALSE];evaluation<-evaluate(Z);baseline<-evaluate(initial[mapping,,drop=FALSE])
result<-list(format='micove-smoothed-phylotype-embedding',version=1,id=paste0('lsvf-smoothed-k40-',task,'-v1'),variant=task,datasetId=inp$datasetId,catalogueRevision=inp$catalogueRevision,sampleOrderSha256=inp$sampleOrderSha256,sampleCount=inp$sampleCount,recordIndices=as.list(inp$recordIndices),coordinates=rows(Z),profileScores=rows(X),featureIds=as.list(inp$featureIds),featureNames=as.list(inp$featureNames),participants=inp$participants,K=inp$K,normalization=if(startsWith(task,'l1'))'l1' else 'max',postMaxNormalization=startsWith(task,'max-post'),neighborMetric=if(startsWith(task,'l1'))'ambient-euclidean' else 'intrinsic-euclidean-faces',targetMetric=metric,filtering='none',settings=settings,evaluation=evaluation,pcaEvaluation=baseline,distinctProfiles=nrow(U),excludedRecords=inp$sampleCount-nrow(X),seconds=proc.time()[['elapsed']]-began,solverProxy=fit$metadata$sparse_proxy_stress,solverMetadata=fit$metadata,inputMatrixSha256=settings$matrixSha256,smoothingSha256=digest(file=file.path(run,'smoothing.json'),algo='sha256'))
writeJson(result,file.path(folder,'embedding.json'));writeLines(capture.output(sessionInfo()),file.path(folder,'session.txt'))
cat('COMPLETE',task,'all-pairs RMS relative error',evaluation$relativeRms,'PCA',baseline$relativeRms,'seconds',result$seconds,'\n')
