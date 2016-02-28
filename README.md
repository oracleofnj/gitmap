# gitmap
## Visualization of GitHub Ecosystems and Project Relationships

## About This Page

This site is an attempt to create a visualization of the relationships between the ~10,000 most-starred (as of late February 2016) public repositories on GitHub. These respositories were clustered into an ecosystem hierarchy - each circle represents a cluster, and you can expand each cluster by clicking or tapping it. On the desktop, hovering over a circle shows some of the contents and clicking zooms in. On mobile, tapping once shows the contents above the map and tapping again (or holding) zooms in. Once you've zoomed in, each white dot corresponds to a single repository. 

To look up a specific project, enter the name of the repo in the search box, or click on its white dot after you've zoomed in far enough. Once you've selected one, its location in the tree will be outlined in bright yellow, and related repositories will be outlined in dark pink on the map and listed in the "Repos related to..." section. The white dot representing selected repo will turn yellow, and the dots for related repos will turn pink. Clicking the yellow (selected) dot again, or clicking the X in the select dropdown will clear the selection. Clicking on a repo in the "Repos related to..." section will select that repo.

## Algorithm and Implementation Details

The hierarchy is created by iterately applying [affinity propagation](http://www.psi.toronto.edu/index.php?q=affinity%20propagation) to the repositories, using a PageRank-inspired formula to calculate the strength of the similarities between projects. In a nutshell, repo A has an affinity for repo B if repo A's contributors starred or also contributed to repo B. These affinities are not symmetric - repo A's affinity for repo B is not equal to repo B's affinity for repo A. Two repositories are considered related if repo A's affinity for repo B, and repo B's affinity for repo A, are both above a threshold. More details [here](https://oracleofnj.github.io/gitmap/algorithm-details.html), or you can [read the code](https://github.com/oracleofnj/gitmap).

I downloaded the data and performed the clustering analysis in python, using [PyGithub](https://github.com/PyGithub/PyGithub) to access the GitHub API. The site itself is mostly written using [D3](https://github.com/mbostock/d3), with the main interface initially coming from [this block](https://bl.ocks.org/mbostock/7607535). 

The results of this algorithm are only one possible way of visualizing the data, and clearly there isn't a strict ecosystem hierarchy (should [react-bootstrap](https://github.com/react-bootstrap/react-bootstrap) be classified under react or bootstrap?). But I think that overall the results are fairly intuitive, and hopefully you can use this site to learn about useful projects that you hadn't known about before.
