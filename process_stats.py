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
        return {k: v for (k, v) in crawlable.items() if v["crawled"]}
    crawled_repos, crawled_users = get_crawled(repos), get_crawled(users)
    user_starcounts = {linker: len([s for s in crawled_users[linker]["stars"] if s in crawled_repos]) for linker in crawled_users.keys()}
    links = [(
                linker,
                linked_to,
                (crawled_repos[repo]["contributors"][linked_to]["log1p_contributions"]/crawled_repos[repo]["total_log1p_contribs"]) /
                    user_starcounts[linker]
             )
            for linker in crawled_users.keys() \
            for repo in crawled_users[linker]["stars"].keys() if repo in crawled_repos and "contributors" in crawled_repos[repo] \
            for linked_to in crawled_repos[repo]["contributors"].keys() \
            if linker != linked_to]

    return links

def calculate_gitrank(links, iters):
    d = 0.85
    users = set([l[1] for l in links])
    num_users = len(users)
    ranks = {user: 1/num_users for user in users}
    incoming_links = {user: [] for user in users}
    for (linker, linked_to, weight) in links:
        incoming_links[linked_to].append((linker, weight))

    for i in xrange(iters):
        print "round %d" % i
        ranks = {user: (1 - d)/num_users + d * sum([
                    ranks[linker] * weight \
                    for (linker, weight) in incoming_links[user]]) \
                 for user in ranks}

    return ranks
