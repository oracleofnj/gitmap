from __future__ import division
from collections import OrderedDict
import json
import gzip

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
            links[repo] = ("repo", {contributor: 1.0/contrib_counts[contributor] for contributor in repoval["contributors"].keys()}, {})

    # Create links from starrers to repo
    user_starcounts = {linker: len([s for s in crawled_users[linker]["stars"].keys() if s in links]) for linker in crawled_users.keys()}
    for (user, userval) in crawled_users.iteritems():
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

    return OrderedDict(sorted([(user, ranks[user]) for user in users], key=lambda x: -x[1])), \
            OrderedDict(sorted([(repo, ranks[repo]) for repo in repos], key=lambda x: -x[1]))

def calculate_links(repos, users):
    crawled_repos, crawled_users = get_crawled(repos), get_crawled(users)
    user_starcounts = {linker: len([s for s in crawled_users[linker]["stars"].keys() if s in crawled_repos]) for linker in crawled_users.keys()}
    links = {linked_to: {} \
             for (repo, repoval) in crawled_repos.iteritems() if "contributors" in repoval \
             for linked_to in repoval["contributors"].keys()}
    for (linker, linkerval) in crawled_users.iteritems():
        for repo in linkerval["stars"].keys():
            if repo in crawled_repos and "contributors" in crawled_repos[repo]:
                total_log1p_contribs = crawled_repos[repo]["total_log1p_contribs"]
                for (linked_to, linked_val) in crawled_repos[repo]["contributors"].iteritems():
                    if linked_to != linker:
                        if repo not in links[linked_to]:
                            links[linked_to][repo] = []
                        links[linked_to][repo].append((linker, linked_val["log1p_contributions"] / (total_log1p_contribs * user_starcounts[linker])))

    return links

def calculate_gitranks(links, iters):
    d = 0.85
    users = links.keys()
    num_users = len(users)
    ranks = {user: (1.0/num_users, {}) for user in users}

    for i in xrange(iters):
        print "round %d" % i
        newranks = {}
        for user in ranks.keys():
            reporanks = {repo: d * sum([ranks[linker][0]*weight for (linker, weight) in repolinks]) for (repo, repolinks) in links[user].iteritems()}
            newranks[user] = ((1 - d) / num_users + sum(reporanks.values()), OrderedDict(sorted(reporanks.iteritems(), key=lambda x: -x[1])))
        ranks = newranks

    return OrderedDict(sorted(ranks.iteritems(), key=lambda x: -x[1][0]))

def toString(user, rank_and_sources):
    return "{0:8.4f} {1:32} Top 3 Sources: {2}".format(1e6*rank_and_sources[0], user,
            ", ".join(["{0}: {1:.4f}".format(source, 1e6*weight) for (source, weight) in rank_and_sources[1].items()[:3]]))
