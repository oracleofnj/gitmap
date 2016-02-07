from __future__ import division
import itertools as it
from collections import OrderedDict
import json
import gzip
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

def userToString(user, rank_and_sources):
    return "{0:8.4f} {1:32} Top 3 Sources: {2}".format(1e6*rank_and_sources[0], user,
            ", ".join(["{0}: {1:.4f}".format(source, 1e6*weight) for (source, weight) in rank_and_sources[1].items()[:3]]))

def repoToString(repo, rank):
    return "{0:8.4f} {1:64}".format(1e6*rank, repo)

if __name__ == "__main__":
    data_path = "./downloaded_data"
    repos, users = load_repos(data_path), load_users(data_path)
    links = calc_graph(repos, users)
    repo_ranks, user_ranks = calc_gitrank_graph(links)
    for (i, (user, rank_and_sources)) in enumerate(it.islice(user_ranks.iteritems(), 100)):
        print "{0:4} {1}".format(i+1, userToString(user, rank_and_sources))
    for (i, (repo, rank)) in enumerate(it.islice(repo_ranks.iteritems(), 100)):
        print "{0:4} {1}".format(i+1, repoToString(repo, rank))
