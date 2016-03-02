var theApp = (function() {
  "use strict";
  var outerSVG = d3.select("#treemap");
  var isNarrow = outerSVG.node().getBoundingClientRect().width < 500;
  outerSVG.style("height", (parseFloat(outerSVG.style("width")) - getMargin() * (isNarrow ? 2 : 1))+"px"); // make square
  outerSVG.style("width", outerSVG.style("width"));
  outerSVG.attr("width", null); // don't resize
  if (isNarrow) {
    d3.select("#tooltip-text").classed("hidden", false);
    d3.select("#breadcrumb-container").classed("mobile-tooltip", true);
  }
  var repoMap = {fullDict: {}, leafList: [], leafDict: {}, edgeList: [], rootNode: null};
  var appState = {
    selectedRepoID: null,
    selectedRepoName: "",
    svgStack: [],
    rateLimitExceeded: false,
    repoMap: repoMap,
    rootTreeMap: null,
  };
  var $sr;

  function octicon(iconType, count) {
    switch(iconType) {
      // case 'star':
      //   return '<svg aria-hidden="true" class="octicon octicon-star" height="24" role="img" version="1.1" viewBox="0 0 14 16" width="21"><path d="M14 6l-4.9-0.64L7 1 4.9 5.36 0 6l3.6 3.26L2.67 14l4.33-2.33 4.33 2.33L10.4 9.26 14 6z"></path></svg>';
      // case 'fork':
      //   return '<svg aria-hidden="true" class="octicon octicon-repo-forked" height="24" role="img" version="1.1" viewBox="0 0 10 16" width="15"><path d="M8 1c-1.11 0-2 0.89-2 2 0 0.73 0.41 1.38 1 1.72v1.28L5 8 3 6v-1.28c0.59-0.34 1-0.98 1-1.72 0-1.11-0.89-2-2-2S0 1.89 0 3c0 0.73 0.41 1.38 1 1.72v1.78l3 3v1.78c-0.59 0.34-1 0.98-1 1.72 0 1.11 0.89 2 2 2s2-0.89 2-2c0-0.73-0.41-1.38-1-1.72V9.5l3-3V4.72c0.59-0.34 1-0.98 1-1.72 0-1.11-0.89-2-2-2zM2 4.2c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z m3 10c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z m3-10c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z"></path></svg>';
      // never mind for now
      default:
        return '<span class="octicon octicon-' + iconType + '"></span>' +
               '&nbsp;' + ((count > 1000) ? ((count/1000).toFixed(1) + 'k') : count);
    }
  }

  function countChildren(node) {
    if (node.childCount) {
      // memoize
      return node.childCount;
    }
    if (!node.children) {
      return (node.childCount = 1);
    } else {
      return (node.childCount = node.children.map(countChildren).reduce(function(a,b) {return a+b;},0));
    }
  }

  function getMargin() {
    return isNarrow ? 25 : 40;
  }

//  outerSVG.style("height", (parseFloat(outerSVG.style("height")) - (getMargin() - 5))+"px"); // don't need extra space below

  function initSelectBox(rootNode) {
    function template(d) {
      if (d.id !== "") {
        return $('<span><svg width=15 height=10><circle class="legend--leaf selected" cx=5 cy=5 r=5></circle></svg>' + d.text + '</span>');
      } else {
        return d.text;
      }
    }
    $sr = $("#selected-repo");
    var s2config = {
      theme: "classic",
      placeholder: "Type here or explore the map...",
      allowClear: true,
      minimumInputLength: 3,
      templateSelection: template,
    };
    if ($('html').is('.eq-ie9')) {
      s2config.data = getAllChildren(rootNode);
    } else {
      var unsortedItems = '<option></option>' + repoMap.leafList.map(function(item,i) {return '<option value="' + i + '">' + item.name + '</option>';}).join('');
      d3.select("#selected-repo").html(unsortedItems); // fastest, doesn't work on IE9
    }
    $sr.select2(s2config);
    $("#selected-repo-placeholder").addClass("hidden");
    $sr.removeClass("hidden");
    $sr.on("change", function() {
      dispatch({
        type: "SELECT_REPO",
        byName: false,
        repoID: ($sr.val() === null || $sr.val() === "") ? null : parseInt($sr.val(), 10),
        pushHistoryEntry: true
      });
      if (appState.selectedRepoID !== null) {
        d3.select(".select2-selection__clear")
          .style("font-weight", "normal")
          .html("X"); // easier to click than &times;
      }
    });
    // prevent "x" from opening dropdown - code from https://github.com/select2/select2/issues/3320
    $sr.on('select2:unselecting', function(e) {
        $sr.data('unselecting', true);
    }).on('select2:open', function(e) { // note the open event is important
        if ($sr.data('unselecting')) {
            $sr.removeData('unselecting'); // you need to unset this before close
            $sr.select2('close');
        }
    });
  }

  function initApp(repoTree, edges) {
    repoMap.rootNode = repoTree;
    countChildren(repoTree);
    addBreadcrumbs(repoTree, []);
    addEdges(edges);
    appState.rootTreeMap = createTreeMap(repoTree,1);
    initSelectBox(repoTree);
    if ($('html').is('.eq-ie9')) {
      appState.githubAPIBroken = true;
    }
    window.addEventListener('popstate', function(e) {
      if (e.state) {
        dispatch({type: "SELECT_REPO", byName: false, repoID: e.state.repoID, pushHistoryEntry: false});
      }
    }, false);
    if (/^#!\S+\/\S+$/.test(window.location.hash)) {
      dispatch({type: "SELECT_REPO", byName: true, repoName: window.location.hash.slice(2), pushHistoryEntry: false});
    } else {
      dispatch({type: "SELECT_REPO", byName: false, repoID: null, pushHistoryEntry: false});
    }
    if (Modernizr.history) {
      history.replaceState(
        {repoID: appState.selectedRepoID},
        "Github Repository Map" + ((appState.selectedRepoID === null) ? "" : " - " + appState.selectedRepoName)
      );
    }
    d3.selectAll(".spinner").remove();
    rerender();
  }

  function tooltipText(node) {
    if (node.tooltipText) {
      // memoize
      return node.tooltipText.slice(0);
    }
    var res = (node.breadcrumbs.length === 1) ? [] : [node.name];
    if (!node.children) {
      node.tooltipText = res;
      return node.tooltipText.slice(0);
    }
    var totalChildren = countChildren(node);
    var otherChildCounts = node.children
      .filter(function(child) {return child.name != node.name;})
      .map(function(x) {return [x.name, countChildren(x)];})
      .sort(function(a, b) {return b[1] - a[1];})
      .slice(0,(node.breadcrumbs.length === 1) ? 3 : 2);
    res = res.concat(otherChildCounts.map(function(x) {return x[0];}));
    if (totalChildren > res.length) {
      res.push("...and " + (totalChildren - res.length) + " more");
    }
    node.tooltipText = res;
    return node.tooltipText.slice(0);
  }

  function getAllChildren(node) {
    if (!node.children) {
      return [{id: node.repoID, text: node.name}];
    } else {
      return node.children.map(getAllChildren).reduce(function(a,b) {return a.concat(b);}, []);
    }
  }

  function addBreadcrumbs(node, trail) {
    node.breadcrumbs = trail.concat([node.name]);
    node.sanitizedName = node.breadcrumbs.map(function(x) {return x.replace(/\W+/g,"_");}).join("-");
    repoMap.fullDict[node.breadcrumbs] = node;
    if (!node.children) {
      repoMap.leafList.push(node);
      repoMap.edgeList.push([]);
      node.repoID = repoMap.leafList.length - 1;
      repoMap.leafDict[node.name] = node;
    } else {
      node.children.forEach(function(x) {addBreadcrumbs(x,node.breadcrumbs);});
    }
  }

  function addEdges(edges) {
    edges.forEach(function(edge) {
      var source = repoMap.leafDict[edge[0]], target = repoMap.leafDict[edge[1]];
      if (source && target) {
        repoMap.edgeList[source.repoID].push(target);
        repoMap.edgeList[target.repoID].push(source);
      }
    });
  }

  function isBreadcrumbPrefix(prefixCand, breadcrumbs) {
    return prefixCand.every(function(e,i) {
      return e === breadcrumbs[i];
    });
  }

  function dispatch(action) {
    // moving towards a Redux-inspired single source of truth, but mutate the state for now
    var stackTop, outerNode, datum, createFromLevel, alreadyRendered = false;
    switch(action.type) {
      case "SELECT_REPO":
        if ((!action.createFromLevel) && ((action.byName && (appState.selectedRepoName === action.repoName)) ||
            (!action.byName && (appState.selectedRepoID === action.repoID)))) {
            // already selected, exit
              break;
        }
        if (action.byName) {
          appState.selectedRepoName = action.repoName;
          appState.selectedRepoID = (action.repoName === "") ? null : repoMap.leafDict[action.repoName].repoID;
        } else {
          appState.selectedRepoName = (action.repoID === null) ? "" : repoMap.leafList[action.repoID].name;
          appState.selectedRepoID = action.repoID;
        }
        if (action.pushHistoryEntry && Modernizr.history) {
          // back button will not work on IE9
          history.pushState(
            {repoID: appState.selectedRepoID},
            "Github Repository Map" + ((appState.selectedRepoID === null) ? "" : " - " + appState.selectedRepoName),
            (appState.selectedRepoID === null) ? window.location.pathname : ("#!" + appState.selectedRepoName)
          );
        }
        appState.svgStack = [];
        d3.selectAll(".innerMap").each(function(d) {
          if (appState.selectedRepoID === null || !isBreadcrumbPrefix(d.root.breadcrumbs, repoMap.leafList[appState.selectedRepoID].breadcrumbs)) {
            d3.select(this).remove();
          } else {
            appState.svgStack.push(d);
          }
        });
        if (appState.selectedRepoID !== null && (appState.svgStack.length === 0 || action.createFromLevel)) {
          // show the top-level map if we're only showing the root node,
          // or show the next-level map if we've been asked to
          createFromLevel = action.createFromLevel || 1;
          outerNode = d3.select(".depth1.level" + createFromLevel + "." + repoMap.fullDict[repoMap.leafList[appState.selectedRepoID].breadcrumbs.slice(0,1+createFromLevel)].sanitizedName);
          if (outerNode[0][0] !== null) {
            datum = outerNode.datum();
            createTreeMap(repoMap.fullDict[repoMap.leafList[appState.selectedRepoID].breadcrumbs.slice(0,1+createFromLevel)], 1+createFromLevel, getMargin() + datum.x - datum.r, (isNarrow ? 0 : getMargin()) + datum.y - datum.r, 2 * datum.r, true);
            alreadyRendered = true;
          }
        }
        if (!alreadyRendered) {
          rerender();
        }
        break;
      case "PUSH_MAP":
        appState.svgStack.push(action.treeMap);
        rerender();
        break;
      case "POP_MAP":
        stackTop = appState.svgStack.pop();
        if (!action.svgDescription.every(function(e,i) {return e === tooltipText(stackTop.root)[i];})) {
          console.log("Something weird happened with the stack...");
          console.log("Top of stack: ", stackTop);
          console.log("svgDescription: ", action.svgDescription);
        }
        rerender();
        break;
      case "OVER_RATE_LIMIT":
        appState.githubAPIBroken = true;
        appState.rateLimitExceeded = true;
        rerender();
        break;
      case "RATE_LIMIT_RESET":
        appState.githubAPIBroken = false;
        appState.rateLimitExceeded = false;
        rerender();
        break;
      case "GITHUB_API_BROKEN":
        appState.githubAPIBroken = true;
        rerender();
        break;
      default:
        throw "Unknown action";
    }
  }

  function rerender() {
    // console.log(appState);
    var stackTop;
    function makeLink(repoName) {
      if (!(/^\.\.\.and\ \d+\ more$/.test(repoName))) {
        return '<a href="#!' + repoName + '" class="internal-link" style="cursor:pointer;">' + repoName + '</a>';
      } else {
        return repoName;
      }
    }

    stackTop = (appState.svgStack.length > 0) ? appState.svgStack[appState.svgStack.length-1] : appState.rootTreeMap;
    d3.selectAll(".node.selected")
      .classed("selected", false);
    d3.selectAll(".node.related")
      .classed("related", false);
    d3.select("#related-repos").selectAll(".related-repo").remove();
    d3.select("#related-repo-header").html("Select a repository to find related repos");
    d3.select("#github-description").text("");
    d3.select("#github-avatar").select("img").classed("hidden", true);
    d3.select("#github-counts").html("");
    d3.select("#breadcrumbs")
      .html("Displaying: " + tooltipText(stackTop.root).map(makeLink).join(", "))
      .selectAll(".internal-link")
      .datum(function() {
        var repoName = d3.select(this).text();
        return {
          repoName: repoName,
          familyCircle: stackTop.innerSVG.selectAll(".node.depth1").filter(function(circle) {return circle.name === repoName; }),
        };
      })
      .on("click", function(d) {
        d3.event.preventDefault();
        d3.event.stopPropagation();
        stackTop.hideToolTip();
        dispatch({
          type: "SELECT_REPO",
          byName: true,
          repoName: d.repoName,
          pushHistoryEntry: true,
          createFromLevel: stackTop.level,
        })
      })
      .on("mouseover", function(d) {
        stackTop.showToolTip(d.familyCircle);
      })
      .on("mouseout", function() {
        stackTop.hideToolTip();
      });
    if (parseInt($sr.val(), 10) !== appState.selectedRepoID) { // really really slow so don't do it if we don't have to
      $sr.val(appState.selectedRepoID).trigger("change");
    }
    if (appState.selectedRepoID) {
      var repo = repoMap.leafList[appState.selectedRepoID];
      d3.select("#related-repo-header").html(
        'Repos related to ' +
        '<svg width="18px" height="10px">' +
        '<circle class="legend selected" cx="10" cy="5" r="4"></circle>' +
        '<circle class="legend--leaf selected" cx="10" cy="5" r="2"></circle>' +
        '</svg>' +
        repo.name.split("/")[1] + ":"
      );
      d3.selectAll(".node").filter(function(d) {
        return d.depth > 0 && isBreadcrumbPrefix(d.breadcrumbs, repo.breadcrumbs);
      }).classed("selected", true);
      d3.selectAll(".node").filter(function(d) {
        return repoMap.edgeList[appState.selectedRepoID].some(function(relatedRepo) {
          return d.depth > 0 && isBreadcrumbPrefix(d.breadcrumbs, relatedRepo.breadcrumbs);
        });
      }).classed("related", true);
      var owner = repo.name.split("/")[0], reposBySameOwner = [], reposByOtherOwner = [];
      repoMap.edgeList[appState.selectedRepoID].forEach(function(relatedRepo) {
        if (relatedRepo.name.split("/")[0] === owner) {
          reposBySameOwner.push(relatedRepo);
        } else {
          reposByOtherOwner.push(relatedRepo);
        }
      });
      d3.select("#related-repos").selectAll(".related-repo.same-owner")
        .data(reposBySameOwner.sort(function(a,b) { return a.name.localeCompare(b.name); }))
        .enter().append("p").attr("class", "related-repo same-owner");
      d3.select("#related-repos").selectAll(".related-repo.other-owner")
        .data(reposByOtherOwner.sort(function(a,b) { return a.name.localeCompare(b.name); }))
        .enter().append("p").attr("class", "related-repo other-owner");
      d3.select("#related-repos").selectAll(".related-repo")
        .append("svg").attr("width",13).attr("height",10)
        .append("circle").attr("class","legend--leaf related").attr("cx",5).attr("cy",5).attr("r",4);
      d3.select("#related-repos").selectAll(".related-repo")
        .append("a")
        .attr("class","related-repo-link")
        .attr("href",function(d) { return "#!"+ d.name; })
        .text(function(d) {return d.name;})
        .on("click", function(d) {
          d3.event.preventDefault();
          d3.event.stopPropagation();
          dispatch({type: "SELECT_REPO", byName: false, repoID: d.repoID, pushHistoryEntry: true});
        });

      d3.selectAll(".github-link").attr("href","https://www.github.com/" + repo.name);

      if (appState.githubAPIBroken) {
        if (appState.rateLimitExceeded) {
          d3.select("#github-description").text("I'm glad you're enjoying this! You've exceeded GitHub's API rate limit (60/hr) but you can keep using the app.");
        }
      } else {
        if (!repo.githubDetails) {
          if (!appState.rateLimitExceeded && !repo.githubDetailsRequested) {
            d3.json("https://api.github.com/repos/" + repo.name, function(error, json) {
              var msgObj;
              if (error) {
                repo.githubDetailsRequested = false;
                if (error.response) {
                  try {
                    msgObj = JSON.parse(error.response);
                    if (msgObj.message && /^API\ rate\ limit\ exceeded/.test(msgObj.message)) {
                      dispatch({type: "OVER_RATE_LIMIT"});
                      setTimeout(function() { dispatch({type: "RATE_LIMIT_RESET"}); }, 600000); // try again in 10 minutes
                    } else {
                      console.log(error, msgObj);
                      dispatch({type: "GITHUB_API_BROKEN"});
                    }
                  }
                  catch (e) {
                    console.log(error, error.response, e);
                    dispatch({type: "GITHUB_API_BROKEN"});
                  }
                } else {
                  console.log("Error with no response: ", error);
                  dispatch({type: "GITHUB_API_BROKEN"});
                }
              } else {
                repo.githubDetails = json;
                rerender();
              }
            });
            repo.githubDetailsRequested = true;
          }
        } else {
          d3.select("#github-description").text(repo.githubDetails.description);
          d3.select("#github-avatar").select("img").attr("src",repo.githubDetails.owner.avatar_url).classed("hidden", false);
          d3.select("#github-counts").html(
            octicon('star', repo.githubDetails.stargazers_count) + '<br />' +
            octicon('repo-forked', repo.githubDetails.forks_count)
          );
        }
      }
    } else {
      d3.selectAll(".github-link").attr("href",null)
    }
  }

  function createTreeMap(root, level, initialLeft, initialTop, initialDiameter, slowTransition) {
    var treeMap;

    function showToolTip(svgCircle) {
      var node = svgCircle.datum();
      var repoInfo = tooltipText(node);
      circles.classed("outlined", false);
      highlightedSVGCircle = svgCircle.classed("outlined", true);

      if (isNarrow) {
        tooltip.html(repoInfo.join(", "));
      } else {
        tooltip.selectAll("tspan").remove();
        if ((node.y - node.r) < 60) {
          // tooltip will overflow to the top
          repoInfo = [repoInfo.join(", ")]; // collapse to one line
        }
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

        var x = Math.min(Math.max(-textRect.width/2, -node.x), -textRect.width + (diameter - node.x));
        tooltip
          .attr("y", -textRect.height-20)
          .selectAll("tspan")
          .attr("x", x);

        tooltipBackground
          .attr("width", textRect.width+10)
          .attr("height", textRect.height+10)
          .attr("x", textRect.x + x - 5)
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
      hideToolTip();
      if (node.children) {
        createTreeMap(repoMap.fullDict[node.breadcrumbs], node.depth+level, margin + node.x - node.r, (isNarrow ? 0 : margin) + node.y - node.r, 2 * node.r, false);
      } else {
        dispatch({
          type: "SELECT_REPO",
          byName: false,
          repoID: (repoMap.fullDict[node.breadcrumbs].repoID === appState.selectedRepoID) ? null : repoMap.fullDict[node.breadcrumbs].repoID,
          pushHistoryEntry: true
        });
      }
    }

    function remove() {
      hideToolTip();
      innerSVG.remove();
      dispatch({type: "POP_MAP", svgDescription: tooltipText(root)});
    }

    var containerWidth = parseFloat(outerSVG.style("width"));
    var margin = getMargin();
    var diameter=containerWidth-2*margin;
    var tooltip;

    var pack = d3.layout.pack()
        .padding(3)
        .size([diameter, diameter])
        .value(function(d) {return d.childCount;})
        .sort(function(a,b) {
          return b.childCount - a.childCount;
        });

    var innerSVG = outerSVG.append("g");

    if (level > 1) {
      innerSVG.attr("class", "innerMap");

      // start small and use d3 transition for zoom effect
      innerSVG
        .attr("transform","translate(" + initialLeft + "," + initialTop + ")" +
                          " scale(" + initialDiameter / diameter + ")");
    } else {
      // start full size
      innerSVG.attr("transform","translate(" + margin + "," + (isNarrow ? 0 : margin) + ")");
    }

    innerSVG.append("rect") // block mouse events
      .attr("x", 0).attr("y", 0).attr("width", diameter).attr("height", diameter).attr("fill", "none").attr("pointer-events", "all");

    // d3 is going to mutate the object - make a deep copy before passing it in
    var nodes = pack.nodes(JSON.parse(JSON.stringify(root)));

    var circleG = innerSVG.append("g")
      .attr("class", "circle-container");
    var startTime = Date.now();
    for (var i=0; i < 5; i++) {
      circleG
        .selectAll("circle.depth" + i)
          .data(nodes.filter(function(d) { return d.depth === i; }))
        .enter().append("circle")
          .attr("class", function(d) {
            return d.sanitizedName + " depth" + d.depth + " " +
                  (d.parent ? d.children ? "node" : "node node--leaf" : "node node--root") +
                  (d.children ? " level" + (level + d.depth - 1) : "");
          })
          .attr("r", function(d) {return d.r;})
          .attr("cx", function(d) {return d.x;})
          .attr("cy", function(d) {return d.y;});
      if (((i > 2) || (isNarrow && i > 1)) && (Date.now() - startTime) > 25) {
        // keep page snappy
        break;
      }
    }
    var circles = circleG.selectAll("circle");

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
        showToolTip(d3.select(this));
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
          showToolTip(d3.select(this));
          timeoutFnID = setTimeout(function() {addInnerMap(d);}, 750);
        }
      })
      .on("touchend", function(d) {
        console.log("touch ended", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();
        activeTouches--;

        if (timeoutFnID !== null) {
          clearTimeout(timeoutFnID);
          timeoutFnID = null;
        }
      })
      .on("touchcancel", function(d) {
        console.log("touch cancelled", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();
        activeTouches--;

        if (timeoutFnID !== null) {
          clearTimeout(timeoutFnID);
          timeoutFnID = null;
        }
      })
      .on("touchmove", function(d) {
        console.log("touch moved", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();
      });

    if (level > 1) {
      var root_2_over_2 = Math.sqrt(2)/2;
      var cbRadius = diameter * (isNarrow ? 0.06 : 0.03), cbHalfWidth = cbRadius*root_2_over_2;
      var closeButtonG = innerSVG.append("g")
        .attr("class", "closebuttongroup")
        .attr("transform", "translate(" + (diameter/2*(1+root_2_over_2)) + "," + (diameter/2*(1-root_2_over_2)) + ")");

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", -cbHalfWidth)
        .attr("y1", -cbHalfWidth)
        .attr("x2", +cbHalfWidth)
        .attr("y2", +cbHalfWidth);

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", -cbHalfWidth)
        .attr("y1", +cbHalfWidth)
        .attr("x2", +cbHalfWidth)
        .attr("y2", -cbHalfWidth);

      closeButtonG.append("circle")
        .attr("class", "closebuttoncircle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", cbRadius)
        .on("click", remove)
        .on("touchstart", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
          remove();
        })
        .on("touchend", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
        })
        .on("touchcancel", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
        })
        .on("touchmove", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
        });

      innerSVG.transition().duration(slowTransition ? 1750 : 1000)
        .attr("transform", "translate(" + margin + "," + (isNarrow ? 0 : margin) + ")");
    }

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

    treeMap = {
      root: root,
      level: level,
      innerSVG: innerSVG,
      circles: circles,
      showToolTip: showToolTip,
      hideToolTip: hideToolTip,
      addInnerMap: addInnerMap,
    };
    if (level > 1) {
      innerSVG.datum(treeMap);
      dispatch({type: "PUSH_MAP", treeMap: treeMap});
    }
    return treeMap;

  }

  return {
    initApp: initApp,
    appState: appState,
  };
})();

$(document).ready(function () {
  "use strict";
  if ($("html").is(".lt-ie9")) {
    return;
  }

  d3_queue.queue(2)
    .defer(d3.json, "data/gitmap.json")
    .awaitAll(function(error, results) {
      if (error) throw error;

      theApp.initApp(results[0].tree, results[0].links);
  });
});
