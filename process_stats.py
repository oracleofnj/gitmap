from __future__ import division
import itertools as it
from collections import OrderedDict
import json
import gzip
import math
from operator import itemgetter

bots = set(["gitter-badger", "ReadmeCritic", "invalid-email-address", "bitdeli-chef",
            "greenkeeperio-bot"])

def load_repos(data_path):
    with gzip.open(data_path + "/cached_repos.json.gz", "r") as cached_repos:
        repos = json.loads(cached_repos.read())
        return OrderedDict(sorted(repos.iteritems(), key=lambda i: -i[1]["stargazers_count"]))

def load_users(data_path):
    with gzip.open(data_path + "/cached_users.json.gz", "r") as cached_users:
        users = json.loads(cached_users.read())
        return OrderedDict(sorted(users.iteritems(), key=lambda i: -i[1]["starweight"]))

def get_crawled(crawlable):
    return {k: v for (k, v) in crawlable.iteritems() if v["crawled"] and "failed" not in v}

def is_bot(user):
    return user in bots

def calc_graph(repos, users):
    crawled_repos, crawled_users = get_crawled(repos), get_crawled(users)

    # Generate unused name for phantom node which has links to all other nodes and is linked to by sinks - may not be possible?
    # PHANTOM_NODE = "PHANTOM_NODE"
    # while PHANTOM_NODE in crawled_repos or PHANTOM_NODE in crawled_users:
    #    PHANTOM_NODE = PHANTOM_NODE + "_"

    links = {}
    contrib_counts = {}

    # Create links from repo to contributors
    for (repo, repoval) in crawled_repos.iteritems():
        if "contributors" in repoval and len(repoval["contributors"]) > 0:
            total_log1p_contribs = repoval["total_log1p_contribs"]
            for (contributor, contribval) in repoval["contributors"].iteritems():
                if not is_bot(contributor):
                    if contributor in links:
                        links[contributor][1][repo] = contribval["log1p_contributions"] / total_log1p_contribs
                    else:
                        links[contributor] = ("user", {repo: contribval["log1p_contributions"] / total_log1p_contribs})

                    if contributor in contrib_counts:
                        contrib_counts[contributor] = contrib_counts[contributor] + 1
                    else:
                        contrib_counts[contributor] = 1

    # Create links from contributors to repo
    for (repo, repoval) in crawled_repos.iteritems():
        if "contributors" in repoval and len(repoval["contributors"]) > 0:
            links[repo] = ("repo", {contributor: 1.0/contrib_counts[contributor] \
                                    for contributor in repoval["contributors"].keys()\
                                    if not is_bot(contributor)}, {})

    # Create links from starrers to repo
    user_starcounts = {linker: len([s for s in crawled_users[linker]["stars"].keys() if s in links]) for linker in crawled_users.keys()}
    for (user, userval) in crawled_users.iteritems():
        if not is_bot(user):
            if "stars" in userval:
                starcount = len([s for s in userval["stars"].keys() if s in crawled_repos])
                for (repo, repoval) in userval["stars"].iteritems():
                    if repo in links:
                        links[repo][2][user] = 1.0 / starcount

    return links

def calc_gitrank_graph(links, iters=25, damping=0.85, contrib_prob=0.33333):
    num_nodes = len(links)
    users = [key for (key, val) in links.iteritems() if val[0] == "user"]
    repos = [key for (key, val) in links.iteritems() if val[0] == "repo"]
    ranks = {key: 1.0/num_nodes for key in links.keys()}

    for i in xrange(iters):
        print "round {0}".format(i+1)
        newranks = {}
        for user in users:
            # only get to a user from a repo
            newranks[user] = (1.0 - damping) / num_nodes \
                            + damping * sum([ranks[repo]*weight for (repo, weight) in links[user][1].iteritems()])

        for repo in repos:
            # two sums
            newranks[repo] = (1.0 - damping) / num_nodes \
                            + damping * contrib_prob * sum([ranks[user]*weight for (user, weight) in links[repo][1].iteritems()]) \
                            + damping * (1 - contrib_prob) * sum([ranks[user]*weight for (user, weight) in links[repo][2].iteritems()])

        ranks = newranks

    return OrderedDict(sorted([(repo, ranks[repo]) for repo in repos], key=lambda x: -x[1])), \
            OrderedDict(sorted([(user,
                                (ranks[user],
                                 OrderedDict(sorted([(repo, damping * ranks[repo] * weight) \
                                                    for (repo, weight) in links[user][1].iteritems()], key=lambda x: -x[1])))) \
                                for user in users], key=lambda x: -x[1][0]))

def repo_to_repo_links(links, contrib_prob=0.33333):
    repos = [key for (key, val) in links.iteritems() if val[0] == "repo"]
    repo_to_repo = {linked_to: {linker: 0 for linker in repos} for linked_to in repos}
    ig1 = itemgetter(1)
    for linked_to in repos:
        for (user, userweight) in links[linked_to][1].iteritems():
            for (linker, linkerweight) in links[user][1].iteritems():
                repo_to_repo[linked_to][linker] = repo_to_repo[linked_to][linker] \
                                                + contrib_prob * linkerweight * userweight
        for (user, userweight) in links[linked_to][2].iteritems():
            for (linker, linkerweight) in links[user][1].iteritems():
                repo_to_repo[linked_to][linker] = repo_to_repo[linked_to][linker] \
                                                + (1-contrib_prob) * linkerweight * userweight
        repo_to_repo[linked_to] = OrderedDict([x for x in sorted(repo_to_repo[linked_to].iteritems(), key=ig1, reverse=True) if x[1] >= 0.001])

    linkedrepos = sorted([(r1, r2, repo_to_repo[r1][r2], repo_to_repo[r2][r1]) \
                           for r1 in repos for r2 in repos \
                           if r1 in repo_to_repo[r2] and r2 in repo_to_repo[r1] and r1 < r2],
                          key = lambda x: -x[2]-x[3])

    return repo_to_repo, linkedrepos

def calc_similarities(r2r, repos, initial_pref=0, num_iters=10, damping=0.95):
    ig1 = itemgetter(1)
    selfsims = sorted([(repo, r2r[repo][repo]) for repo in r2r.keys()], key=ig1, reverse=True)
    selfsims_dict = {repo: selfsim for (repo, selfsim) in selfsims}
    starred_repos = sorted([(repo, repos[repo]["stargazers_count"], selfsims_dict[repo]) for repo in selfsims_dict.keys()], key=ig1, reverse=True)
    ordered_repos = [repo for (repo, sg, ss) in starred_repos]
    starcounts_dict = {repo: sg for (repo, sg, ss) in starred_repos}

    sim = {}
    for (exemplar, points) in r2r.iteritems():
        for (point, weight) in points.iteritems():
            if point not in sim:
                sim[point] = {}
            sim[point][exemplar] = weight if point != exemplar else initial_pref
            ### math.log(starcounts_dict[exemplar]/100) * weight if point != exemplar else initial_pref

    avail = {exemplar: {point: 0 \
            for point in r2r[exemplar].keys()} for exemplar in ordered_repos}

    oldresp, oldavail, damp = None, None, 1
    for i in xrange(num_iters):
        # todo: fix damping
        resp = {}
        for point in sim.keys():
            avail_plus_sim = [(cand, avail[cand][point] + sim[point][cand]) \
                                for cand in sim[point].keys()]
            best, second_best = (None, 0), (None, 0)
            for (cand, a_plus_s) in avail_plus_sim:
                if a_plus_s > best[1]:
                    second_best = best
                    best = (cand, a_plus_s)
                elif a_plus_s > second_best[1]:
                    second_best = (cand, a_plus_s)
                else:
                    pass

            resp[point] = {exemplar: \
                            (oldresp[point][exemplar]*(1-damp) if oldresp != None else 0) + \
                            (damp if oldresp != None else 1) * \
                            (sim[point][exemplar] - \
                            (best[1] if best[0] != exemplar else second_best[1]))\
                            for exemplar in sim[point].keys()}

        avail = {}
        for exemplar in ordered_repos:
            positive_resps = sum([max(0, resp[otherpoint][exemplar]) for otherpoint in r2r[exemplar].keys()])
            avail[exemplar] = {point: \
                                (oldavail[exemplar][point]*(1-damp) if oldavail != None else 0) + \
                                (damp if oldavail != None else 1) * \
                (min(0, resp[exemplar][exemplar] + positive_resps - max(0, resp[point][exemplar]) - max(0, resp[exemplar][exemplar])) \
                    if point != exemplar else \
                (positive_resps - max(0, resp[exemplar][exemplar]))) \
                for point in r2r[exemplar].keys()}

        oldresp, oldavail, damp = resp, avail, damp * damping

    return resp, avail

def gen_exemplars(resp, avail):
    exemplars = {point: max(resp[point].keys(), key=lambda exemplar: resp[point][exemplar] + avail[exemplar][point]) \
                for point in resp.keys()}
    children = {}
    for (point, exemplar) in exemplars.items():
        if exemplar not in children:
            children[exemplar] = []
        children[exemplar].append(point)

    return exemplars, children

def userToString(user, rank_and_sources):
    return "{0:8.4f} {1:32} Top 3 Sources: {2}".format(1e6*rank_and_sources[0], user,
            ", ".join(["{0}: {1:.4f}".format(source, 1e6*weight) for (source, weight) in rank_and_sources[1].items()[:3]]))

def repoToString(repo, rank):
    return "{0:8.4f} {1:64}".format(1e6*rank, repo)

def collapseTreeNode(node):
    if "children" in node:
        for child in node["children"]:
            collapseTreeNode(child)
        if len(node["children"]) == 1:
            if node["name"] != node["children"][0]["name"]:
                raise ValueError("Expected " + node["name"] + " to equal " + node["children"][0]["name"])
            elif "children" not in node["children"][0]:
                del node["children"]
            else:
                node["children"] = node["children"][0]["children"]

if __name__ == "__main__":
    data_path = "./downloaded_data"
    repos, users = load_repos(data_path), load_users(data_path)
    links = calc_graph(repos, users)
    r2r, linkedrepos = repo_to_repo_links(links)
    resp, avail = calc_similarities(r2r, repos, 0, 20)
    ex, ch = gen_exemplars(resp, avail)

    lowest = [x for x in ch if x in ch[x]]
    r2r_lowest = {r1: {r2: r2r[r1][r2] for r2 in r2r[r1].keys() if r2 in lowest} for r1 in r2r.keys() if r1 in lowest}
    resp, avail = calc_similarities(r2r_lowest, repos, 0, 30, 0.97)
    ex2, ch2 = gen_exemplars(resp, avail)

    midlevel = [x for x in ch2 if x in ch2[x]]
    r2r_midlevel = {r1: {r2: r2r_lowest[r1][r2] for r2 in r2r_lowest[r1].keys() if r2 in midlevel} for r1 in r2r_lowest.keys() if r1 in midlevel}
    resp, avail = calc_similarities(r2r_midlevel, repos, 0, 50, 0.99)
    ex3, ch3 = gen_exemplars(resp, avail)

    toplevel = [x for x in ch3 if x in ch3[x]]
    r2r_toplevel = {r1: {r2: r2r_midlevel[r1][r2] for r2 in r2r_midlevel[r1].keys() if r2 in toplevel} for r1 in r2r_midlevel.keys() if r1 in toplevel}
    resp, avail = calc_similarities(r2r_toplevel, repos, 0, 100, 0.99)
    ex4, ch4 = gen_exemplars(resp, avail)

    d3_gitmap = {"name": "github", "children": [ \
                    {"name": root, "children": [ \
                        {"name": greatgrandpa, "children": [ \
                            {"name": grandpa, "children": [ \
                                {"name": dad, "children": \
                                    [{"name": child} \
                                    for child in sorted(ch[dad])]} \
                                for dad in sorted(ch2[grandpa])]} \
                            for grandpa in sorted(ch3[greatgrandpa])]} \
                        for greatgrandpa in sorted(ch4[root])]} \
                    for root in sorted(ch4.keys())]}
    collapseTreeNode(d3_gitmap)
    full_gitmap = {"tree": d3_gitmap, "links": [(r1, r2) for (r1, r2, r3, r4) in linkedrepos]}
    with open("gitmap.json", "w") as f:
        f.write(json.dumps(full_gitmap)) #, indent=2))


    # repo_ranks, user_ranks = calc_gitrank_graph(links)
    # for (i, (user, rank_and_sources)) in enumerate(it.islice(user_ranks.iteritems(), 100)):
    #    print "{0:4} {1}".format(i+1, userToString(user, rank_and_sources))
    # for (i, (repo, rank)) in enumerate(it.islice(repo_ranks.iteritems(), 100)):
    #    print "{0:4} {1}".format(i+1, repoToString(repo, rank))
    # gitmap = {root: {grandpa: {dad: sorted(ch[dad]) for dad in ch2[grandpa]} for grandpa in ch3[root]} for root in ch3.keys()}
    # print json.dumps(gitmap, indent=4, sort_keys=True)
