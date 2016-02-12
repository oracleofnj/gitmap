/**
 * Given an array [{"repo": "git/git", "x": 240.4, "y": 410.1},...],
 * a number of clusters to return, a maximum number of iterations,
 * and a number of times to repeat the process, returns an object
 * {
 *    "means": [{"x": 110.2, "y": 420.2}, ...],
 *    "assignments": {"git/git": 0, "torvalds/linux": 1, ...}
 * }
 */

function kmeans(repos, k, maxiters, num_reps) {
  var means = [], assignments = {}, total_dist;
  var best_means = [], best_assignments = {}, best_total_sq_dist;
  var i, l=repos.length, noChanges, rep;

  function squared_distance(x1, y1, x2, y2) {
    return (x1-x2)*(x1-x2)+(y1-y2)*(y1-y2);
  }

  function closest(x, y) {
    var dist_to_closest = Infinity, res = -1;
    for (var j=0; j < k; j++) {
      var sq=squared_distance(x, y, means[j].x, means[j].y);
      if (sq < dist_to_closest) {
        dist_to_closest = sq;
        res = j;
      }
    }
    return res;
  }

  function calculateAssignments() {
    var newAssignment;
    for (var j=0; j < l; j++) {
      repo = repos[j];
      newAssignment = closest(repo.x, repo.y);
      if (newAssignment != assignments[repo.repo]) {
        noChanges = false;
        assignments[repo.repo] = newAssignment;
      }
    }
  }

  function calculateNewMeans() {
    var counts=[], j, cluster;
    for (j=0; j < k; j++) {
      counts[j] = 0;
      means[j] = {"x": 0, "y": 0};
    }
    for (j=0; j < l; j++) {
      cluster = assignments[repos[j].repo];
      counts[cluster]++;
      means[cluster].x += repos[j].x;
      means[cluster].y += repos[j].y;
    }
    for (j=0; j < k; j++) {
      means[j].x /= counts[j];
      means[j].y /= counts[j];
    }
  }

  function calculateTotalDistance() {
    var res = 0;
    for (j=0; j < l; j++) {
      repo = repos[j];
      res += squared_distance(repo.x, repo.y, means[assignments[repo.repo]].x, means[assignments[repo.repo]].y);
    }
    return res;
  }

  best_total_sq_dist = Infinity;
  for (rep=0; rep < num_reps; rep++) {

    // initialize randomly
    for (i=0; i < k; i++) {
      chosenRepo = repos[Math.floor(Math.random() * l)];
      means[i] = {x: chosenRepo.x, y: chosenRepo.y};
    }
    i = maxiters;
    calculateAssignments();
    while (--i > 0) {
      calculateNewMeans();
      noChanges = true;
      calculateAssignments();
      if (noChanges) {
        break;
      }
    }

    total_dist = calculateTotalDistance();
    if (total_dist < best_total_sq_dist) {
      for (i=0; i < k; i++) {
        best_means[i] = {"x": means[i].x, "y": means[i].y};
      }
      for (i=0; i < l; i++) {
        best_assignments[repos[i].repo] = assignments[repos[i].repo];
      }
    }
  }
  return {means: best_means, assignments: best_assignments};
}
