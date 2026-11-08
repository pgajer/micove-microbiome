# Small, display-only graph fits; invoked with validated JSON by the loopback service.
args <- commandArgs(TRUE)
if(args[1]=='-')loadNamespace('grip') else pkgload::load_all(args[1], recompile=FALSE, quiet=TRUE)
x <- jsonlite::read_json(args[2], simplifyVector=TRUE)
d <- as.integer(x$dimension); nodes <- as.integer(x$nodes); n <- length(nodes)
edges <- as.matrix(x$edges); storage.mode(edges) <- 'double'
uv <- cbind(match(edges[,1],nodes),match(edges[,2],nodes)); lengths <- edges[,3]
G <- igraph::make_empty_graph(n,directed=FALSE)
if(nrow(uv))G <- igraph::add_edges(G,as.vector(t(uv)))
igraph::E(G)$weight <- lengths
cc <- igraph::components(G); coords <- matrix(0,n,d); records <- list(); right <- 0
edge.error <- 0; geodesic.error <- 0; geodesic.scale <- 0
for(component in seq_len(cc$no)){
 ii <- which(cc$membership==component); k <- length(ii)
 keep <- which(uv[,1] %in% ii); ee <- matrix(match(uv[keep,,drop=FALSE],ii),ncol=2)
 ll <- lengths[keep]; sub <- igraph::induced_subgraph(G,ii)
 # Explicitly bounded dense graph distance targets: the service caps n at 512.
 D <- igraph::distances(sub,weights=igraph::E(sub)$weight)
 seed <- 20261016L+component
 if(k<=2){
  P <- matrix(0,k,d);if(k==2)P[2,1] <- D[1,2]
  record <- list(component=component,method='exact graph with at most two vertices',seed=seed)
 }else if(x$method=='mds'){
  dim.fit <- min(d,k-1L)
  fit <- grip::metric.mds(distance.matrix=D,dim=dim.fit,backend='sgd',approximation='full',init='random',n.init=3L,max.iter=500L,seed=seed,pair.weights='uniform',diagnostics=FALSE,sgd.control=list(scheduler='zheng',schedule.epsilon=.1))
  P <- fit$coords;if(dim.fit<d)P <- cbind(P,matrix(0,k,d-dim.fit))
  record <- list(component=component,method='metric.mds',backend='sgd',seed=seed,n.init=3L,epochs=500L,metadata=fit$metadata)
 }else{
  call <- list(edges=ee,n=k,edge.weights=ll,dim=d,metric=if(x$method=='grip')'hop' else 'edge_length',seed=seed,rounds=160L,final.rounds=384L)
  if(x$method=='weighted_grip')call$length.normalization <- 'none'
  P <- do.call(grip::grip,call)
  record <- list(component=component,method='grip',settings=call,defaults=lapply(formals(grip::grip),function(v)paste(deparse(v),collapse=' ')))
 }
 P <- as.matrix(P);stopifnot(nrow(P)==k,ncol(P)==d,all(is.finite(P)))
 # GRIP's force system has its own output scale. Profile one uniform scale
 # against the same geodesic targets before reporting errors in target units.
 raw.distances <- as.matrix(dist(P));upper <- upper.tri(D)
 record$unscaled_geodesic_raw_stress <- sum((raw.distances[upper]-D[upper])^2)
 factor <- if(sum(raw.distances[upper]^2)>0)sum(raw.distances[upper]*D[upper])/sum(raw.distances[upper]^2) else 1
 P <- P*factor;record$output_scale <- factor
 # Fix the arbitrary orientation against the reference; no rescaling or change in distances.
 initial <- as.matrix(x$initial)[ii,seq_len(d),drop=FALSE]
 P <- scale(P,scale=FALSE); initial <- scale(initial,scale=FALSE)
 if(k>1){sv <- svd(crossprod(P,initial));P <- P %*% (sv$u %*% t(sv$v))}
 distances <- as.matrix(dist(P));upper <- upper.tri(D)
 raw <- sum((distances[upper]-D[upper])^2); denom <- sum(D[upper]^2)
 record$achieved_geodesic_raw_stress <- raw
 record$geodesic_normalized_rmse <- if(denom>0)sqrt(raw/denom) else 0
 geodesic.error <- geodesic.error+raw;geodesic.scale <- geodesic.scale+denom
 if(length(keep))edge.error <- edge.error+sum((distances[ee]/ll-1)^2)
 P[,1] <- P[,1]-min(P[,1])+right;right <- max(P[,1])+2
 coords[ii,] <- P;records[[component]] <- record
}
coords <- scale(coords,scale=FALSE)
result <- list(method=x$method,dimension=d,nodes=as.list(nodes),coords=lapply(seq_len(n),function(i)unname(coords[i,])),relativeRms=if(nrow(edges))sqrt(edge.error/nrow(edges)) else 0,geodesicNormalizedRmse=if(geodesic.scale>0)sqrt(geodesic.error/geodesic.scale) else 0,components=records,runtime=list(R=R.version.string,grip=as.character(utils::packageVersion('grip')),igraph=as.character(utils::packageVersion('igraph')),source=args[1],load='source_optimized'),solverVersion='graph-layout-r-v2')
result$runtime$source <- NULL
result$runtime$load <- if(args[1]=='-')'installed' else 'source_optimized'
jsonlite::write_json(result,args[3],auto_unbox=TRUE,digits=16,na='null',null='null')
