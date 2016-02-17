var theApp = (function() {
  var outerSVG = d3.select("#treemap");
  outerSVG.style("height", outerSVG.style("width")); // make square

  function countChildren(node) {
    if (!node.children) {
      return 1;
    } else {
      return node.children.map(countChildren).reduce(function(a,b) {return a+b;},0);
    }
  }

  function tooltipText(node) {
    var res = [node.name];
    if (!node.children) {
      return res;
    }
    var totalChildren = countChildren(node);
    var otherChildCounts = node.children
      .filter(function(child) {return child.name != node.name;})
      .map(function(x) {return [x.name, countChildren(x)];})
      .sort(function(a, b) {return b[1] - a[1]})
      .slice(0,2);
    res = res.concat(otherChildCounts.map(function(x) {return x[0];}));
    if (totalChildren > res.length) {
      res.push("...and " + (totalChildren - res.length) + " more");
    }
    return res;
  }

  function getAllChildren(node) {
    if (!node.children) {
      return [node.name];
    } else {
      return node.children.map(getAllChildren).reduce(function(a,b) {return a.concat(b);}, []);
    }
  }

  function addBreadCrumbs(node, trail) {
    node.breadcrumbs = trail;
    if (node.children) {
      node.children.forEach(function(x) {addBreadCrumbs(x,trail.concat([node.name]));});
    }
  }

  function createTreeMap(root, level) {

    function showToolTip(d) {
      var element = innerSVG.select("#level-" + level + "-depth-" + d.depth + "-" + d.name.replace(/\W+/g,"_"));

      tooltip.selectAll("tspan").remove();
      tooltip.selectAll("tspan")
        .data(tooltipText(d))
        .enter().append("tspan")
        .text(function(tooltipLine) {return tooltipLine;})
        .attr("x","0") // this will be overwritten below once we know how wide the box is
        .attr("dy", "1.2em");

      tooltipG
        .attr("class", "tooltipgroup") //unhide
        .attr("transform", "translate(" + d.x + "," + (d.y - d.r) + ")");

      var textRect = tooltip[0][0].getBBox();

      tooltip
        .attr("y", -textRect.height-20)
        .selectAll("tspan")
        .attr("x", -textRect.width / 2);

      tooltipBackground
        .attr("width", textRect.width+10)
        .attr("height", textRect.height+10)
        .attr("x", textRect.x - textRect.width/2 - 5)
        .attr("y", -textRect.height-20);
    }

    function hideToolTip(d) {
      tooltipG.attr("class", "tooltipgroup hidden")
    }

    function addInnerMap(d) {
      var newRoot = root;
      for (var i=level; i < d.depth+level-1; i++) {
        newRoot = newRoot.children.filter(function(x) {return x.name === d.breadcrumbs[i];})[0];
      }
      // find the array element whose name is the name we want
      createTreeMap(newRoot.children.filter(function(x) {return x.name === d.name;})[0], d.depth+level);
    }

    var containerWidth = parseFloat(outerSVG.style("width"));
    var margin=(1-Math.pow(0.95,level)) * containerWidth, diameter=containerWidth-2*margin;

    var color = d3.scale.linear()
        .domain([-1, 5])
        .range(["hsl(152,80%,80%)", "hsl(228,30%,40%)"])
        .interpolate(d3.interpolateHcl);

    var pack = d3.layout.pack()
        .padding(2)
        .size([diameter, diameter])
        .value(function() {return 1;});

    var innerSVG = outerSVG.append("g")
      .attr("transform","translate(" + margin + "," + margin + ")");

    // d3 is going to mutate the object - make a deep copy before passing it in
    var nodes = pack.nodes(JSON.parse(JSON.stringify(root)));

    var circles = innerSVG.append("g")
      .attr("class", "circle-container")
      .selectAll("circle")
        .data(nodes)
      .enter().append("circle")
        .attr("class", function(d) { return d.parent ? d.children ? "node" : "node node--leaf" : "node node--root"; })
        .attr("id", function(d) {return "level-" + level + "-depth-" + d.depth + "-" + d.name.replace(/\W+/g,"_");})
        .style("fill", function(d) { return d.children ? color(level + d.depth - 1) : null; })
        .attr("r", function(d) {return d.r;})
        .attr("cx", function(d) {return d.x;})
        .attr("cy", function(d) {return d.y;})
        .on("mouseover", showToolTip)
        .on("mouseout", hideToolTip)
        .on("click", addInnerMap);

    var tooltipG = innerSVG.append("g")
      .attr("class", "tooltipgroup hidden");
    var tooltipBackground = tooltipG.append("rect")
      .attr("class", "tooltipBackground")
      .attr("rx", 5)
      .attr("ry", 5);
    var tooltipTriangle = tooltipG.append("polygon")
      .attr("points", "-10,-10 10,-10 0,-3")
      .attr("class", "tooltipTriangle");
    var tooltip = tooltipG.append("text");

    if (level > 1) {
      var closeButtonG = innerSVG.append("g")
        .attr("class", "closebuttongroup")
        .attr("transform", "translate(" + (diameter - diameter*0.1) + "," + (diameter*0.1) + ")");

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", diameter * 0.03 * (1 - Math.sqrt(2)/2))
        .attr("y1", diameter * 0.03 * (1 - Math.sqrt(2)/2))
        .attr("x2", diameter * 0.03 * (1 + Math.sqrt(2)/2))
        .attr("y2", diameter * 0.03 * (1 + Math.sqrt(2)/2));

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", diameter * 0.03 * (1 - Math.sqrt(2)/2))
        .attr("y1", diameter * 0.03 * (1 + Math.sqrt(2)/2))
        .attr("x2", diameter * 0.03 * (1 + Math.sqrt(2)/2))
        .attr("y2", diameter * 0.03 * (1 - Math.sqrt(2)/2));

      closeButtonG.append("circle")
        .attr("class", "closebuttoncircle")
        .attr("cx", diameter * 0.03)
        .attr("cy", diameter * 0.03)
        .attr("r", diameter * 0.03)
        .on("click", function() {innerSVG.remove();});

    }
  }

  return {
    createTreeMap: createTreeMap,
    getAllChildren: getAllChildren,
    addBreadCrumbs: addBreadCrumbs,
  };
})();

// function clickDot() {
//   $("#selected-repo").val(qt.find(d3.mouse(container[0][0])).repo).trigger("change");
// }
//
// function clickLink() {
//   d3.event.preventDefault();
//   $("#selected-repo").val(d3.select(this).text()).trigger("change");
// }
//
// function selectRepo(selectedRepo) {
//   container.selectAll(".edge").remove();
//   d3.select("#related-repos").selectAll(".related-repo").remove();
//
//   if (!selectedRepo) {
//     d3.selectAll(".dot")
//       .attr("class", "dot")
//       .attr("r", 2.0 / Math.sqrt(zoomScale));
//     return;
//   }
//
//   var owner = selectedRepo.split("/")[0];
//   // TODO: refactor related repo stuff to make it more efficient and make radius class based
//   var relatedRepos = edgesPerNode[selectedRepo].filter(function(x) {
//     return x.otherRepo.split("/")[0] === owner;
//   }).sort(function(a,b) {return (a.otherRepo > b.otherRepo) ? 1 : ((a.otherRepo < b.otherRepo) ? -1 : 0);})
//   .concat(edgesPerNode[selectedRepo].filter(function(x) {
//       return x.otherRepo.split("/")[0] !== owner;
//   }).sort(function(a,b) {return (a.otherRepo > b.otherRepo) ? 1 : ((a.otherRepo < b.otherRepo) ? -1 : 0);}));
//   container.selectAll(".edge")
//     .data(relatedRepos, function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
//     .enter().append("line")
//     .attr("class", "edge")
//     .style("stroke-width", 1.0/Math.sqrt(zoomScale))
//     .attr("x1", function(d) {return x(d.edgeInfo.x1); })
//     .attr("y1", function(d) {return y(d.edgeInfo.y1); })
//     .attr("x2", function(d) {return x(d.edgeInfo.x2); })
//     .attr("y2", function(d) {return y(d.edgeInfo.y2); });
//
//   d3.select("#related-repos").selectAll(".related-repo")
//     .data(relatedRepos, function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
//     .enter().append("p")
//     .attr("class", "related-repo")
//     .append("a")
//     .attr("href", "#")
//     .attr("class", function(d) {return (d.otherRepo.split("/")[0] === owner) ? "same-owner" : "other-owner";})
//     .on("click", clickLink)
//     .text(function(d) {return d.otherRepo;});
//
//   var sameOwnerNames = relatedRepos.map(function(r) {
//     return r.otherRepo;
//   }).filter(function (n) {
//     return n.split("/")[0] === owner;
//   });
//   var otherOwnerNames = relatedRepos.map(function(r) {
//     return r.otherRepo;
//   }).filter(function (n) {
//     return n.split("/")[0] !== owner;
//   });
//
//   d3.selectAll(".dot")
//   .attr("r", function(node) {
//     if (node.repo === selectedRepo) {
//       return 4.0 / Math.sqrt(zoomScale);
//     } else if (-1 !== sameOwnerNames.indexOf(node.repo)) {
//       return 3.0 / Math.sqrt(zoomScale);
//     } else if (-1 !== otherOwnerNames.indexOf(node.repo)) {
//       return 3.0 / Math.sqrt(zoomScale);
//     } else {
//       return 2.0 / Math.sqrt(zoomScale);
//     }
//   })
//   .attr("class", function(node) {
//     if (node.repo === selectedRepo) {
//       return "dot selected-repo-node";
//     } else if (-1 !== sameOwnerNames.indexOf(node.repo)) {
//       return "dot owner-repo-node";
//     } else if (-1 !== otherOwnerNames.indexOf(node.repo)) {
//       return "dot related-repo-node";
//     } else {
//       return "dot";
//     }
//   })
// }

// starcounts = results[0];
// gephi = results[1];
// nodeDict = gephi.nodes;
// var nodeList = Object.keys(gephi.nodes).sort();
//
// nodes = nodeList.map(function(repo) {
//   edgesPerNode[repo] = [];
//   return {"repo": repo, "x": gephi.nodes[repo].x, "y": gephi.nodes[repo].y};
// });
// edges = gephi.edges;
// edges.forEach(function(edge) {
//   edgeInfo = {
//     "x1": gephi.nodes[edge.source].x,
//     "y1": gephi.nodes[edge.source].y,
//     "x2": gephi.nodes[edge.target].x,
//     "y2": gephi.nodes[edge.target].y
//   }
//   edgesPerNode[edge.source].push({"otherRepo": edge.target, "edgeInfo": edgeInfo});
//   edgesPerNode[edge.target].push({"otherRepo": edge.source, "edgeInfo": edgeInfo});
// });

$(document).ready(function () {
  var edges, nodes, edgesPerNode = {}, starcounts, nodeDict;

  d3_queue.queue(2)
    .defer(d3.json, "data/compressed_gitmap.json")
    .awaitAll(function(error, results) {
      if (error) throw error;

      repoTree = results[0];
      theApp.addBreadCrumbs(repoTree, []);

      $("#selected-repo").select2({
        theme: "classic",
        placeholder: "Type or click on the map to select a repository...",
        allowClear: true,
        data: theApp.getAllChildren(repoTree)
      });
      $("#selected-repo-placeholder").addClass("hidden");
      $("#selected-repo").removeClass("hidden");

      theApp.createTreeMap(repoTree,1);

  });
  $("#selected-repo").on("change", function() {selectRepo($("#selected-repo").val());});
});
