# Supplementary queries only; preserve the original participant-linked reference.
# Usage: Rscript smooth_profile_queries.R RUN OPTIMIZED_DGRAPHS_SOURCE
Sys.setenv(OMP_NUM_THREADS='1',OMP_THREAD_LIMIT='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS='1')
suppressPackageStartupMessages({library(jsonlite);library(digest)})
a<-commandArgs(trailingOnly=TRUE);run<-normalizePath(a[1]);root<-normalizePath(a[2])
pkgload::load_all(root,recompile=FALSE,quiet=TRUE)
inputFile<-file.path(run,'input.json');inp<-read_json(inputFile,simplifyVector=TRUE)
stopifnot(digest(file=file.path(run,'abundances.bin'),algo='sha256')==inp$matrixSha256)
X<-matrix(readBin(file.path(run,'abundances.bin'),'double',n=inp$rows*inp$columns,size=8,endian='little'),inp$rows,inp$columns,byrow=TRUE)
U<-X/apply(X,1,max);groups<-inp$participantGroups;priority<-match(seq_len(nrow(X)),inp$tiePriority+1L)
queries<-c(inp$queryRecords,inp$checkRecords)+1L;reference<-inp$referenceRecords+1L
sources<-c(list.files(file.path(root,'R'),full.names=TRUE,pattern='\\.R$'),list.files(file.path(root,'src'),full.names=TRUE,pattern='\\.(cpp|h|hpp|c|so)$'),file.path(root,'DESCRIPTION'))
hashes<-setNames(vapply(sources,function(f)digest(file=f,algo='sha256'),''),substring(sources,nchar(root)+2))
neighbors<-function(P,intrinsic=FALSE){
 t(vapply(queries,function(q){
  distance<-if(intrinsic)as.numeric(dgraphs::linf.simplex.distances(P,sources=q,targets=reference)) else sqrt(rowSums(sweep(P[reference,,drop=FALSE],2,P[q,])^2))
  order<-reference[order(distance,priority[reference])]
  if(groups[q]>=0)order<-order[groups[order]!=groups[q]]
  order<-order[!duplicated(groups[order])];stopifnot(length(order)>=40L)
  order[seq_len(40L)]
 },integer(40)))
}
l1<-neighbors(X);face<-neighbors(U,TRUE)
average<-function(P,N)t(vapply(seq_len(nrow(N)),function(i)colMeans(P[sort(N[i,]),,drop=FALSE]),numeric(ncol(P))))
A<-average(X,l1);B<-average(U,face);C<-B/apply(B,1,max)
rows<-function(M)lapply(seq_len(nrow(M)),function(i)unname(M[i,]))
stopifnot(all(is.finite(A)),all(is.finite(B)),all(is.finite(C)),max(abs(rowSums(A)-1))<1e-12)
write_json(list(records=as.list(queries-1L),l1=rows(A),maxRaw=rows(B),maxPost=rows(C),
 l1Neighbors=rows(l1-1L),faceNeighbors=rows(face-1L),inputSha256=digest(file=inputFile,algo='sha256'),
 runtimeHashes=hashes,session=capture.output(sessionInfo())),file.path(run,'query-smoothing.json'),auto_unbox=TRUE,digits=16)
cat('Smoothed',length(inp$queryRecords),'queries and',length(inp$checkRecords),'reference checks; reference unchanged\n')
