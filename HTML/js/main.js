var qt;

function getIncludedNodes(quadtree, x0, y0, x3, y3) {
  var pts = [];
  quadtree.visit(function (node, x1, y1, x2, y2) {
    var p = node.point;
    if ((p) && (p.x >= x0) && (p.x < x3) && (p.y >= y0) && (p.y < y3)) {
        pts.push(node.point);
    }
    return x1 >= x3 || y1 >= y3 || x2 < x0 || y2 < y0;
  });
  return pts;
}

function starPoints(centerX, centerY, arms, outerRadius, innerRadius) {
  // Thanks to https://dillieodigital.wordpress.com/2013/01/16/quick-tip-how-to-draw-a-star-with-svg-and-javascript/
  // via http://stackoverflow.com/questions/2710065/drawing-star-shapes-with-variable-parameters
  var results = "", angle = Math.PI / arms;
  for (var i = 0; i < 2 * arms; i++) {
    // Use outer or inner radius depending on what iteration we are in.
    var r = (i & 1) == 0 ? outerRadius : innerRadius;
    var currX = centerX + Math.cos(i * angle - Math.PI / 2) * r; // Start at -pi/2 to make first point
    var currY = centerY + Math.sin(i * angle - Math.PI / 2) * r; // at the top of the star - negative because top of screen = lowest number

    // Our first time we simply append the coordinates, subsequet times
    // we append a ", " to distinguish each coordinate pair.
    if (i == 0) {
       results = currX + "," + currY;
    } else {
       results += ", " + currX + "," + currY;
    }
  }
  return results;
}

$(document).ready(function () {
  var edges, nodes, edgesPerNode = {}, starcounts, nodeDict;

  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = 800 - margin.left - margin.right,
      height = 800 - margin.top - margin.bottom;

  var x = d3.scale.linear().range([0, width]);
  var y = d3.scale.linear().range([height, 0]);

  var preventClick = false;
  var zoomScale = 1, zoomTranslate = [0,0], oldZoomScale = 1, oldZoomTranslate = [0,0];

  var zoom = d3.behavior.zoom()
    .scaleExtent([1, 10])
    .on("zoom", zoomed)
    .on("zoomend", recluster);

  var svg = d3.select("#scatter")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
    .attr("width", width)
    .attr("height", height)
    .call(zoom);

  var container = svg.append("g")
    .attr("id", "scatter_g");

  var rect = svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mouseover", function(){return tooltip.style("visibility", "visible");})
    .on("mousemove", hover)
    .on("mouseout", function(){return tooltip.style("visibility", "hidden");})
    .on("click", clickDot);

  var tooltip = d3.select("body")
    .append("div")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("visibility", "hidden")
    .style("font-size", "150%")
    .style("font-weight", "bold")
    .text("");

  function hover() {
    tooltip
      .text(qt.find(d3.mouse(container[0][0])).repo)
      .style("top", (d3.event.pageY-10)+"px")
      .style("left",(d3.event.pageX+10)+"px");
  }

  function clickDot() {
    if (preventClick || d3.event.defaultPrevented) {
      preventClick = false;
      return;
    }
    $("#selected-repo").val(qt.find(d3.mouse(container[0][0])).repo).trigger("change");
  }

  function clickLink() {
    d3.event.preventDefault();
    $("#selected-repo").val(d3.select(this).text()).trigger("change");
  }

  function selectRepo(selectedRepo) {
    container.selectAll(".edge").remove();
    d3.select("#related-repos").selectAll(".related-repo").remove();

    if (!selectedRepo) {
      d3.selectAll(".dot")
        .attr("class", "dot")
        .attr("r", 2.0 / Math.sqrt(zoomScale));
      return;
    }

    var owner = selectedRepo.split("/")[0];
    // TODO: refactor related repo stuff to make it more efficient and make radius class based
    var relatedRepos = edgesPerNode[selectedRepo].filter(function(x) {
      return x.otherRepo.split("/")[0] === owner;
    }).sort(function(a,b) {return (a.otherRepo > b.otherRepo) ? 1 : ((a.otherRepo < b.otherRepo) ? -1 : 0);})
    .concat(edgesPerNode[selectedRepo].filter(function(x) {
        return x.otherRepo.split("/")[0] !== owner;
    }).sort(function(a,b) {return (a.otherRepo > b.otherRepo) ? 1 : ((a.otherRepo < b.otherRepo) ? -1 : 0);}));
    container.selectAll(".edge")
      .data(relatedRepos, function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
      .enter().append("line")
      .attr("class", "edge")
      .style("stroke-width", 1.0/Math.sqrt(zoomScale))
      .attr("x1", function(d) {return x(d.edgeInfo.x1); })
      .attr("y1", function(d) {return y(d.edgeInfo.y1); })
      .attr("x2", function(d) {return x(d.edgeInfo.x2); })
      .attr("y2", function(d) {return y(d.edgeInfo.y2); });

    d3.select("#related-repos").selectAll(".related-repo")
      .data(relatedRepos, function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
      .enter().append("p")
      .attr("class", "related-repo")
      .append("a")
      .attr("href", "#")
      .attr("class", function(d) {return (d.otherRepo.split("/")[0] === owner) ? "same-owner" : "other-owner";})
      .on("click", clickLink)
      .text(function(d) {return d.otherRepo;});

    var sameOwnerNames = relatedRepos.map(function(r) {
      return r.otherRepo;
    }).filter(function (n) {
      return n.split("/")[0] === owner;
    });
    var otherOwnerNames = relatedRepos.map(function(r) {
      return r.otherRepo;
    }).filter(function (n) {
      return n.split("/")[0] !== owner;
    });

    d3.selectAll(".dot")
    .attr("r", function(node) {
      if (node.repo === selectedRepo) {
        return 4.0 / Math.sqrt(zoomScale);
      } else if (-1 !== sameOwnerNames.indexOf(node.repo)) {
        return 3.0 / Math.sqrt(zoomScale);
      } else if (-1 !== otherOwnerNames.indexOf(node.repo)) {
        return 3.0 / Math.sqrt(zoomScale);
      } else {
        return 2.0 / Math.sqrt(zoomScale);
      }
    })
    .attr("class", function(node) {
      if (node.repo === selectedRepo) {
        return "dot selected-repo-node";
      } else if (-1 !== sameOwnerNames.indexOf(node.repo)) {
        return "dot owner-repo-node";
      } else if (-1 !== otherOwnerNames.indexOf(node.repo)) {
        return "dot related-repo-node";
      } else {
        return "dot";
      }
    })
  }

  function zoomChangedEnough(percentScale, pxOverScale) {
    return (zoomScale / oldZoomScale < (1 - percentScale) || oldZoomScale / zoomScale < (1 - percentScale) ||
        Math.max(Math.abs(zoomTranslate[0] - oldZoomTranslate[0], zoomTranslate[1] - oldZoomTranslate[1])) > pxOverScale/zoomScale)
  }

  function zoomed() {
    zoomScale = d3.event.scale;
    zoomTranslate = [d3.event.translate[0], d3.event.translate[1]];
    container.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    container.selectAll(".dot")
      .attr("r", 2.0/Math.sqrt(zoomScale));
    container.selectAll(".edge")
      .style("stroke-width", 1.0/Math.sqrt(zoomScale));
    if (zoomChangedEnough(0.02, 3)) { // drag detected
      preventClick = true;
    }
  }

  function recluster() {
    // New visible range: ULC = (-d3.event.translate[0]/d3.event.scale,-d3.event.translate[1]/d3.event.scale)
    //                    LRC = ((width-d3.event.translate[0])/d3.event.scale,(height-d3.event.translate[1])/d3.event.scale)
    if (zoomChangedEnough(0.1, 10)) {
      var colors = d3.scale.category10();
      var km = kmeans(getIncludedNodes(qt,
                            -zoomTranslate[0]/zoomScale, -zoomTranslate[1]/zoomScale,
                            (width-zoomTranslate[0])/zoomScale,(height-zoomTranslate[1])/zoomScale
                            ),
        10, 300, 25);
      var top_stars = [];
      Object.keys(km.assignments).forEach(function(repo) {
        if (undefined === starcounts[top_stars[km.assignments[repo]]] || starcounts[repo] > starcounts[top_stars[km.assignments[repo]]]) {
          top_stars[km.assignments[repo]] = repo;
        }
      });
      container.selectAll(".star").remove();
      container.selectAll(".star").data(top_stars.filter(function(x) {return true;})) // skip array holes
        .enter().append("svg:polygon")
        .attr("class", "star")
        .attr("points", function(repo) {return starPoints(x(nodeDict[repo].x), y(nodeDict[repo].y), 5, 10.0/Math.sqrt(zoomScale), 5.0/Math.sqrt(zoomScale));});
    }
    oldZoomScale = zoomScale;
    oldZoomTranslate = [zoomTranslate[0], zoomTranslate[1]];
    preventClick = false;
  }

  d3.json("data/starcounts.json", function(error, stardata) {
    if (error) throw error;
    starcounts = stardata;
  });

  d3.json("data/gephi_output.json", function(error, gephi) {
    if (error) throw error;

    nodeDict = gephi.nodes;
    var nodeList = Object.keys(gephi.nodes).sort();

    nodes = nodeList.map(function(repo) {
      edgesPerNode[repo] = [];
      return {"repo": repo, "x": gephi.nodes[repo].x, "y": gephi.nodes[repo].y};
    });
    edges = gephi.edges;
    edges.forEach(function(edge) {
      edgeInfo = {
        "x1": gephi.nodes[edge.source].x,
        "y1": gephi.nodes[edge.source].y,
        "x2": gephi.nodes[edge.target].x,
        "y2": gephi.nodes[edge.target].y
      }
      edgesPerNode[edge.source].push({"otherRepo": edge.target, "edgeInfo": edgeInfo});
      edgesPerNode[edge.target].push({"otherRepo": edge.source, "edgeInfo": edgeInfo});
    });
    $("#selected-repo").select2({
      theme: "classic",
      placeholder: "Type or click on the map to select a repository...",
      allowClear: true,
      data: nodeList
    });
    $("#selected-repo-placeholder").addClass("hidden");
    $("#selected-repo").removeClass("hidden");

    x.domain(d3.extent(nodes, function(d) { return d.x; }));
    y.domain(d3.extent(nodes, function(d) { return d.y; }));

    qt = d3.geom.quadtree(nodes.map(function(repo) {
      return {"repo": repo.repo, "x": x(repo.x), "y": y(repo.y)};
    }));

    container.selectAll(".dot")
      .data(nodes, function(node) {return node.repo;})
      .enter().append("circle")
      .attr("class", "dot")
      .attr("r", 2)
      .attr("cx", function(d) { return x(d.x); })
      .attr("cy", function(d) { return y(d.y); });
  });
  $("#selected-repo").on("change", function() {selectRepo($("#selected-repo").val());});
});
