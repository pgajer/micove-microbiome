# Optional reference validation. Requires dynamicTreeCut and jsonlite in R's library.
# Rscript rank2_feature_graph/verify_dynamic_tree_cut.R output.json [saved-bank.json] [browser-tree.json]
# Without a bank, generate 12 synthetic correlation matrices. No estimates are fit.
args <- commandArgs(TRUE)
stopifnot(length(args) >= 1)
suppressPackageStartupMessages(library(dynamicTreeCut))
suppressPackageStartupMessages(library(jsonlite))
if (length(args) > 1) {
  bank <- fromJSON(args[2]); n <- length(bank$featureIndices)
  d <- matrix(0, n, n); q <- 1L
  for (i in seq_len(n-1L)) for (j in (i+1L):n) {
    d[i,j] <- d[j,i] <- 1-bank$correlations[q]; q <- q+1L
  }
  examples <- list(d)
} else {
  examples <- lapply(1:12, function(seed) {
    set.seed(seed); p <- c(24,47,51,71,90,101)[1+seed%%6]
    x <- matrix(rnorm(80*p),80,p)
    for (j in seq_len(p)) x[,j] <- x[,j]+(1+seed%%4)*sin((1:80)/(1+j%%6))
    1-cor(x)
  })
}
results <- lapply(examples, function(d) {
  hc <- hclust(as.dist(d),method='average'); n <- nrow(d)
  # Isolate branch cutting from floating-point/tied hierarchical merge choices.
  if (length(args)>2) {
    tree <- fromJSON(args[3]); z <- tree$linkage[,1:2]
    hc$merge <- matrix(as.integer(ifelse(z<n,-z-1,z-n+1)),ncol=2)
    hc$height <- tree$linkage[,3]; hc$order <- tree$order+1L
  }
  merges <- ifelse(hc$merge<0,-hc$merge-1,hc$merge+n-1)
  values <- unlist(lapply(seq_len(n-1L),function(i)d[i,(i+1L):n]))
  cases <- list()
  for (minimum in c(2,5,10,20)) for (sensitivity in 0:4) {
    z <- cutreeHybrid(hc,d,minClusterSize=minimum,deepSplit=sensitivity,verbose=0)
    cases[[length(cases)+1L]] <- list(minSize=minimum,deepSplit=sensitivity,labels=z$labels)
  }
  list(bank=list(featureIndices=0:(n-1),correlations=1-values,
                 linkage=cbind(merges,hc$height,0),order=hc$order-1),cases=cases)
})
write_json(list(reference=paste('dynamicTreeCut',packageVersion('dynamicTreeCut')),
                examples=results),args[1],digits=17,auto_unbox=TRUE)
