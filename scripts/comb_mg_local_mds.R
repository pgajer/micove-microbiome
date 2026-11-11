# Full metric MDS of one fixed pure 1-CST. Inputs are already normalized.
options(warn=1)
Sys.setenv(OMP_NUM_THREADS="1", OMP_THREAD_LIMIT="1", OPENBLAS_NUM_THREADS="1",
           MKL_NUM_THREADS="1", VECLIB_MAXIMUM_THREADS="1")
suppressPackageStartupMessages({library(jsonlite); library(digest)})
args <- commandArgs(trailingOnly=TRUE)
root <- normalizePath(args[1]); dest <- normalizePath(args[2])
.libPaths(c(file.path(root,"library"),.libPaths()))
suppressPackageStartupMessages(library(grip))
info <- read_json(file.path(dest,"input.json"),simplifyVector=TRUE)
savejson <- function(x,name) {
  tmp <- file.path(dest,paste0(name,".tmp"))
  write_json(x,tmp,auto_unbox=TRUE,digits=17,null="null",pretty=TRUE)
  stopifnot(file.rename(tmp,file.path(dest,name)))
}
main <- function() {
  started <- proc.time()[["elapsed"]]
  stopifnot(!file.exists(file.path(dest,"complete.json")))
  source <- file.path(root,info$matrix)
  stopifnot(digest(file=source,algo="sha256")==info$matrix_sha256)
  X <- matrix(readBin(source,"double",n=info$n*info$p,size=8,endian="little"),info$n,info$p,byrow=TRUE)
  stopifnot(all(is.finite(X)), all(X>=0))
  D <- as.matrix(dist(X,method=if(info$metric=="linf") "maximum" else "euclidean"))
  stopifnot(all(is.finite(D)), all(D[upper.tri(D)]>0))
  pca <- prcomp(X,center=TRUE,scale.=FALSE,rank.=3L)$x[,1:3,drop=FALSE]
  population <- as.matrix(info$population_xyz)
  stopifnot(identical(dim(population),c(as.integer(info$n),3L)))
  evaluate <- function(Y) {
    target <- D[upper.tri(D)]; embedded <- as.matrix(dist(Y))[upper.tri(D)]
    ratio <- embedded/target; scale <- sum(ratio)/sum(ratio^2)
    list(rms=sqrt(mean((ratio-1)^2)),scale=scale,scaled_rms=sqrt(mean((scale*ratio-1)^2)))
  }
  ep <- evaluate(pca); eg <- evaluate(population)
  from <- if(ep$scaled_rms<=eg$scaled_rms) "PCA" else "population subset"
  initial <- if(from=="PCA") pca*ep$scale else population*eg$scale
  rm(X);gc()
  notices <- character()
  fit <- withCallingHandlers(grip::metric.mds(distance.matrix=D,dim=3L,
    approximation="full",backend="sgd",pair.weights="inverse_squared",init=initial,
    n.init=1L,max.iter=200L,seed=20261015L,diagnostics=FALSE,
    sgd.control=list(scheduler="zheng",schedule.epsilon=.1,checkpoint.every=1L,
                     max.workspace.bytes=1024^3,keep.state=TRUE)),
    warning=function(w){notices<<-c(notices,conditionMessage(w));invokeRestart("muffleWarning")})
  final <- evaluate(fit$coords)
  stopifnot(all(is.finite(fit$coords)),final$rms<=min(ep$scaled_rms,eg$scaled_rms)+1e-8)
  saveRDS(fit,file.path(dest,"fit.rds"),compress=FALSE)
  write.table(fit$coords,file.path(dest,"coordinates.tsv"),sep="\t",row.names=FALSE,col.names=FALSE,quote=FALSE)
  write.table(fit$metadata$history,file.path(dest,"history.tsv"),sep="\t",row.names=FALSE,quote=FALSE)
  savejson(fit$metadata,"solver.json")
  writeLines(capture.output(sessionInfo()),file.path(dest,"session.txt"))
  savejson(list(task_sha256=info$task_sha256,rms_relative_error=final$rms,
    initial=from,pca=ep,population=eg,seconds=proc.time()[["elapsed"]]-started,
    best_epoch=fit$metadata$starts$best_epoch,converged=fit$metadata$converged,
    termination=fit$metadata$termination,warnings=unique(notices),
    coordinates_sha256=digest(file=file.path(dest,"coordinates.tsv"),algo="sha256"),
    fit_sha256=digest(file=file.path(dest,"fit.rds"),algo="sha256")),"complete.json")
}
tryCatch(main(),error=function(e){savejson(list(error=conditionMessage(e)),"failure.json");stop(e)})
