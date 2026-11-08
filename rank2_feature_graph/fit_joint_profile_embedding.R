# A separate exploratory representation; never overwrites taxonomic coordinates.
# Rscript fit_joint_profile_embedding.R RUN_DIRECTORY LOCAL_PACKAGE_ROOT
options(warn=1)
Sys.setenv(OMP_NUM_THREADS='1',OMP_THREAD_LIMIT='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS='1')
suppressPackageStartupMessages({library(jsonlite);library(digest)})
args<-commandArgs(trailingOnly=TRUE);run<-normalizePath(args[1]);root<-normalizePath(args[2])
input<-read_json(file.path(run,'input.json'),simplifyVector=FALSE)
stopifnot(digest(file=file.path(run,'matrix.bin'),algo='sha256')==input$matrixSha256)
if(file.exists(file.path(run,'fit.rds')))stop('Preserve completed fit; use a new output directory')
X<-matrix(readBin(file.path(run,'matrix.bin'),'double',n=input$rows*input$columns,size=8,endian='little'),input$rows,input$columns,byrow=TRUE)
stopifnot(all(is.finite(X)),all(X>=0),all(X<=100))
for(pkg in c('dgraphs','grip')){
 pkgbuild::compile_dll(file.path(root,pkg),debug=FALSE,force=TRUE)
 pkgload::load_all(file.path(root,pkg),recompile=FALSE,quiet=TRUE)
}
files<-unlist(lapply(c('dgraphs','grip'),function(pkg)c(list.files(file.path(root,pkg,'R'),full.names=TRUE,pattern='\\.R$'),list.files(file.path(root,pkg,'src'),full.names=TRUE,pattern='\\.(cpp|h|hpp|so)$'),file.path(root,pkg,'DESCRIPTION'))))
hashes<-function()as.list(setNames(vapply(files,function(p)digest(file=p,algo='sha256'),''),files))
runtime<-list(mode='source_optimized',debug=FALSE,hashes=hashes(),revisions=setNames(lapply(c('dgraphs','grip'),function(p)system2('git',c('-C',file.path(root,p),'rev-parse','HEAD'),stdout=TRUE)),c('dgraphs','grip')),threads=as.list(Sys.getenv(c('OMP_NUM_THREADS','OMP_THREAD_LIMIT','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS'))))
write_json(runtime,file.path(run,'runtime.json'),auto_unbox=TRUE,pretty=TRUE);writeLines(capture.output(sessionInfo()),file.path(run,'session.txt'))
uniqueRows<-which(!duplicated(X));U<-X[uniqueRows,,drop=FALSE]
# Exact hashes identify duplicate vectors without rounded string comparisons.
keys<-apply(X,1,digest,algo='sha256');mapping<-match(keys,keys[uniqueRows]);stopifnot(!anyNA(mapping))
settings<-list(backend='sgd',dimension=3L,preparationSeed=20261015L,seed=20261015L,starts=1L,epochs=800L,initialization='centered unscaled PCA',target='Euclidean distances between unmodified joint-profile percentile vectors',q=10L,neighborVarianceTarget=.9,pivotSelection='randomized',pivots=min(200L,max(1L,floor(nrow(U)/4))),scheduler='zheng',scheduleEpsilon=.1,workspaceBytes=1024^3,weighting=input$weighting,matrixSha256=input$matrixSha256,runtimeSha256=digest(runtime,algo='sha256'))
write_json(settings,file.path(run,'settings.json'),auto_unbox=TRUE,pretty=TRUE)
pc<-prcomp(U,center=TRUE,scale.=FALSE);initial<-pc$x[,1:3,drop=FALSE]
began<-proc.time()[['elapsed']]
prep<-grip::prepare.sparse.mds(U,method='euclidean',pivot.selection='randomized',n.pivots=settings$pivots,q=settings$q,neighbor.variance.target=.9,seed=settings$preparationSeed,max.workspace.bytes=settings$workspaceBytes)
saveRDS(list(prepared=prep,initial=initial,settings=settings,uniqueRows=uniqueRows,mapping=mapping),file.path(run,'prepared.rds'))
fit<-grip::metric.mds(prepared=prep,approximation='sparse',backend='sgd',dim=3L,init=initial,n.init=1L,max.iter=settings$epochs,seed=settings$seed,diagnostics=FALSE,sgd.control=list(scheduler='zheng',schedule.epsilon=.1,max.workspace.bytes=settings$workspaceBytes))
elapsed<-proc.time()[['elapsed']]-began
stopifnot(all(is.finite(fit$coords)),identical(runtime$hashes,hashes()))
saveRDS(list(fit=fit,settings=settings,runtime=runtime,mapping=mapping,uniqueRows=uniqueRows,seconds=elapsed),file.path(run,'fit.rds'))
evaluate<-function(Y){
 total<-0;sumSq<-0;zero<-0;targetSq<-0;errorSq<-0;maxError<-0
 for(i in seq_len(nrow(X)-1L)){
  jj<-seq.int(i+1L,nrow(X));d<-sqrt(rowSums(sweep(X[jj,,drop=FALSE],2,X[i,])^2));z<-sqrt(rowSums(sweep(Y[jj,,drop=FALSE],2,Y[i,])^2));positive<-d>0
  e<-z[positive]/d[positive]-1;sumSq<-sumSq+sum(e^2);total<-total+sum(positive);zero<-zero+sum(!positive);errorSq<-errorSq+sum((z-d)^2);targetSq<-targetSq+sum(d^2);maxError<-max(maxError,abs(e))
 }
 list(relativeRms=sqrt(sumSq/total),pairs=total,zeroPairs=zero,profiles=nrow(X),sampled=FALSE,normalizedRms=sqrt(errorSq/targetSq),maximumRelativeError=maxError)
}
Z<-fit$coords[mapping,,drop=FALSE];evaluation<-evaluate(Z);baseline<-evaluate(initial[mapping,,drop=FALSE])
# The local PCA search is audited separately from embedding distortion.
search<-sweep(U,2,prep$pca$center)%*%prep$pca$loadings
queries<-unique(as.integer(round(seq(1,nrow(U),length.out=min(100,nrow(U))))))
retention<-vapply(queries,function(i){a<-setdiff(order(rowSums(sweep(U,2,U[i,])^2),seq_len(nrow(U))),i)[1:10];b<-setdiff(order(rowSums(sweep(search,2,search[i,])^2),seq_len(nrow(U))),i)[1:10];length(intersect(a,b))/10},0.)
rows<-function(M)lapply(seq_len(nrow(M)),function(i)unname(M[i,]))
result<-list(format='micove-joint-profile-embedding',version=1,id='lsvf-joint39-euclidean-v1',datasetId=input$datasetId,catalogueRevision=input$catalogueRevision,correlationRevision=input$correlationRevision,sampleOrderSha256=input$sampleOrderSha256,sampleCount=input$sampleCount,recordIndices=input$recordIndices,coordinates=rows(Z),profileScores=rows(X),snapshot=input$snapshot,weighting=input$weighting,settings=settings,evaluation=evaluation,pcaEvaluation=baseline,distinctProfiles=nrow(U),excludedRecords=input$excludedRecords,seconds=elapsed,pcaVariance3=sum(pc$sdev[1:3]^2)/sum(pc$sdev^2),neighborSearch=list(dimensions=prep$pca$dimension,varianceRetained=prep$pca$achieved,meanRecovery=mean(retention),minimumRecovery=min(retention),queries=length(queries)),solverProxy=fit$metadata$sparse_proxy_stress,solverMetadata=fit$metadata,inputMatrixSha256=input$matrixSha256)
write_json(result,file.path(run,'embedding.json'),auto_unbox=TRUE,digits=16,pretty=FALSE,null='null')
cat('COMPLETE',nrow(X),'visits',ncol(X),'profiles',nrow(U),'distinct; all-pairs RMS relative error',evaluation$relativeRms,'PCA',baseline$relativeRms,'seconds',elapsed,'\n')
