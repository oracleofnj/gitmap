var theApp = (function() {
  var outerSVG = d3.select("#treemap");
  var isNarrow = outerSVG.node().getBoundingClientRect().width < 600;
  outerSVG.style("height", outerSVG.style("width")); // make square
  if (isNarrow) {
    d3.select("#tooltip-text").classed("hidden", false);
  }
  var repoMap = {fullDict: {}, leafList: [], leafDict: {}};

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
      return [{id: node.repoID, text: node.name}];
    } else {
      return node.children.map(getAllChildren).reduce(function(a,b) {return a.concat(b);}, []);
    }
  }

  function addBreadCrumbs(node, trail) {
    node.breadcrumbs = trail.concat([node.name]);
    node.sanitizedName = node.breadcrumbs.map(function(x) {return x.replace(/\W+/g,"_");}).join("-");
    repoMap.fullDict[node.breadcrumbs] = node;
    if (!node.children) {
      repoMap.leafList.push(node);
      node.repoID = repoMap.leafList.length - 1;
      repoMap.leafDict[node.name] = node;
    } else {
      node.children.forEach(function(x) {addBreadCrumbs(x,node.breadcrumbs);});
    }
  }

  function selectRepo(selectedRepo) {
    d3.selectAll(".node")
      .classed("selected", false);
    if (selectedRepo) {
      // start i at 1 to skip "github"
      for (var i=1; i < repoMap.leafList[selectedRepo].breadcrumbs.length; i++) {
        d3.selectAll(".node." + repoMap.fullDict[repoMap.leafList[selectedRepo].breadcrumbs.slice(0,i+1)].sanitizedName)
          .classed("selected", true);
      }
    }
  }

  function createTreeMap(root, level) {
    function showToolTip(node, svgCircle) {
      var repoInfo = tooltipText(node);
      circles.classed("outlined", false);
      highlightedSVGCircle = svgCircle.classed("outlined", true);

      if (isNarrow) {
        tooltip.html(repoInfo.join(", "));
      } else {
        tooltip.selectAll("tspan").remove();
        tooltip.selectAll("tspan")
          .data(repoInfo)
          .enter().append("tspan")
          .text(function(tooltipLine) {return tooltipLine;})
          .attr("x","0") // this will be overwritten below once we know how wide the box is
          .attr("dy", "1.2em");

        tooltipG
          .classed("hidden", false) //unhide
          .attr("transform", "translate(" + node.x + "," + (node.y - node.r) + ")");

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
    }

    function hideToolTip() {
      circles.classed("outlined", false);
      highlightedSVGCircle = null;
      if (isNarrow) {
        tooltip.html("");
      } else {
        tooltipG.classed("hidden", true);
      }
    }

    function addInnerMap(node) {
      if (node.children) {
        hideToolTip();
        createTreeMap(repoMap.fullDict[node.breadcrumbs], node.depth+level);
      } else {
        if (repoMap.fullDict[node.breadcrumbs].repoID === parseInt($("#selected-repo").val(),10)) {
          $("#selected-repo").val(null);
        } else {
          $("#selected-repo").val(repoMap.fullDict[node.breadcrumbs].repoID);
        }
      }
      $("#selected-repo").trigger("change");
    }

    var containerWidth = parseFloat(outerSVG.style("width"));
    var margin = isNarrow ? 5 : containerWidth * (1-Math.pow(0.95,level));
    var diameter=containerWidth-2*margin;
    var tooltip;

    var pack = d3.layout.pack()
        .padding(3)
        .size([diameter, diameter])
        .value(function() {return 1;});

    var innerSVG = outerSVG.append("g")
      .attr("transform","translate(" + margin + "," + margin + ")");

    innerSVG.append("rect") // block mouse events
      .attr("x", 0).attr("y", 0).attr("width", diameter).attr("height", diameter).attr("fill", "none").attr("pointer-events", "all");

    // d3 is going to mutate the object - make a deep copy before passing it in
    var nodes = pack.nodes(JSON.parse(JSON.stringify(root)));

    var circles = innerSVG.append("g")
      .attr("class", "circle-container")
      .selectAll("circle")
        .data(nodes)
      .enter().append("circle")
        .attr("class", function(d) {
          return d.sanitizedName + " " +
                (d.parent ? d.children ? "node" : "node node--leaf" : "node node--root") +
                (d.children ? " level" + (level + d.depth - 1) : "");
        })
        .attr("r", function(d) {return d.r;})
        .attr("cx", function(d) {return d.x;})
        .attr("cy", function(d) {return d.y;});

    if (isNarrow) {
      circles
        .style("pointer-events", "none")
        .filter(function(d) { return d.depth === 1; })
        .style("pointer-events", "all");
    }

    // Set up events.
    // Mouseover highlights a node.
    // Click highlights a node and immediately expands it.
    // Mouseout un-highlights a node.
    //
    // For an unhighlighted node, touchstart highlights it and
    // sets a timeout to expand it if not cancelled by touchend.
    // If a second touchstart comes in while
    // the first touchstart hasn't ended, the event is tossed.
    // For a highlighted node, touchstart cancels any existing
    // timeout and immediately expands it.
    // touchend and touchcancel cancel any existing timeouts.

    var highlightedSVGCircle=null, timeoutFnID=null, activeTouches=0;
    circles
      .on("mouseover", function(d) {
        showToolTip(d, d3.select(this));
      })
      .on("mouseout", function(d) {
        hideToolTip();
      })
      .on("click", function(d) {
        addInnerMap(d);
      })
      .on("touchstart", function(d) {
        console.log("touch started", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();

        activeTouches++;
        if (activeTouches > 1) {
          return;
        }

        if (highlightedSVGCircle && (highlightedSVGCircle[0][0] === d3.select(this)[0][0])) {
          // if they re-touched the already highlighted circle,
          // cancel existing timeout and immediately expand it
          if (timeoutFnID !== null) {
            clearTimeout(timeoutFnID);
            timeoutFnID = null;
          }
          addInnerMap(d);
        } else {
          // if they touched a new circle, highlight it
          showToolTip(d, d3.select(this));
          timeoutFnID = setTimeout(function() {addInnerMap(d);}, 1000);
        }
      })
      .on("touchend", function(d) {
        console.log("touch ended", d, d3.event, this);
        activeTouches--;

        if (timeoutFnID !== null) {
          clearTimeout(timeoutFnID);
          timeoutFnID = null;
        }
      })
      .on("touchcancel", function(d) {
        console.log("touch cancelled", d, d3.event, this);
        activeTouches--;

        if (timeoutFnID !== null) {
          clearTimeout(timeoutFnID);
          timeoutFnID = null;
        }
      });

    if (isNarrow) {
      tooltip = d3.select("#tooltip-text");
    } else {
      var tooltipG = innerSVG.append("g")
        .attr("class", "tooltipgroup hidden");
      var tooltipBackground = tooltipG.append("rect")
        .attr("class", "tooltipBackground")
        .attr("rx", 5)
        .attr("ry", 5);
      var tooltipTriangle = tooltipG.append("polygon")
        .attr("points", "-10,-10 10,-10 0,-3")
        .attr("class", "tooltipTriangle");

      tooltip = tooltipG.append("text");
    }

    if (level > 1) {
      var cbRadius = diameter * (isNarrow ? 0.05 : 0.03);
      var closeButtonG = innerSVG.append("g")
        .attr("class", "closebuttongroup")
        .attr("transform", "translate(" + (diameter - 3 * cbRadius) + "," + (3 * cbRadius) + ")");

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", cbRadius * (1 - Math.sqrt(2)/2))
        .attr("y1", cbRadius * (1 - Math.sqrt(2)/2))
        .attr("x2", cbRadius * (1 + Math.sqrt(2)/2))
        .attr("y2", cbRadius * (1 + Math.sqrt(2)/2));

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", cbRadius * (1 - Math.sqrt(2)/2))
        .attr("y1", cbRadius * (1 + Math.sqrt(2)/2))
        .attr("x2", cbRadius * (1 + Math.sqrt(2)/2))
        .attr("y2", cbRadius * (1 - Math.sqrt(2)/2));

      closeButtonG.append("circle")
        .attr("class", "closebuttoncircle")
        .attr("cx", cbRadius)
        .attr("cy", cbRadius)
        .attr("r", cbRadius)
        .on("click", function() { innerSVG.remove(); })
        .on("touchstart", function(d) {
          d3.event.stopPropagation();
          d3.event.preventDefault();
          innerSVG.remove();
        });
    }
  }


  return {
    createTreeMap: createTreeMap,
    getAllChildren: getAllChildren,
    addBreadCrumbs: addBreadCrumbs,
    selectRepo: selectRepo,
    repoMap: repoMap,
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
      theApp.createTreeMap(repoTree,1);

      var $sr = $("#selected-repo");
      $sr.select2({
        theme: "classic",
        placeholder: "Type or click on the map to select a repository...",
        allowClear: true,
        data: theApp.getAllChildren(repoTree).sort(function(a,b) {return a.text.localeCompare(b.text);})
      });
      $("#selected-repo-placeholder").addClass("hidden");
      $sr.removeClass("hidden");
      $sr.on("change", function() { theApp.selectRepo($("#selected-repo").val()); });
      // prevent "x" from opening dropdown - code from https://github.com/select2/select2/issues/3320
      $sr.on('select2:unselecting', function(e) {
          $sr.data('unselecting', true);
      }).on('select2:open', function(e) { // note the open event is important
          if ($sr.data('unselecting')) {
              $sr.removeData('unselecting'); // you need to unset this before close
              $sr.select2('close');
          }
      });

  });
});
