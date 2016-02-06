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

def calculate_links(repos, users):
    def get_crawled(crawlable):
        return {k: v for (k, v) in crawlable.iteritems() if v["crawled"] and "failed" not in v}
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
