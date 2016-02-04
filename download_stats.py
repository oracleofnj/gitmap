# Uses PyGithub by Vincent Jacques @jacquev6
from github import *
from collections import OrderedDict
import datetime
import itertools as it
import math
import json
import gzip

def load_repos(g, data_path):
    try:
        with gzip.open(data_path + "/cached_repos.json.gz", "r") as cached_repos:
            repos = json.loads(cached_repos.read())
            return OrderedDict(sorted(repos.iteritems(), key=lambda i: -i[1]["stargazers_count"]))
    except IOError:
        # No cached data, pre-populate with the first 10 repos
        return OrderedDict([(repo.owner.login + "/" + repo.name,
                                {"repoObj": repo,
                                 "id": repo.id,
                                 "stargazers_count": repo.stargazers_count,
                                 "crawled": False}) \
                            for repo in g.search_repositories("stars:>1", sort="stars", order="desc")[:10]])
    else:
        raise

def load_users(g, data_path):
    try:
        with gzip.open(data_path + "/cached_users.json.gz", "r") as cached_users:
            users = json.loads(cached_users.read())
            return OrderedDict(sorted(users.iteritems(), key=lambda i: -i[1]["starweight"]))
    except IOError:
        # No cached data, will just get crawled
        return OrderedDict()
    else:
        raise

def save_repos(repo_dict, data_path):
    repos_as_json = json.dumps({key: {subkey: subval for (subkey, subval) in val.items() if subkey != "repoObj"} for (key, val) in repo_dict.items()})
    with gzip.open(data_path + "/cached_repos.json.gz", "w") as cached_repos:
        cached_repos.write(repos_as_json)

def save_users(user_dict, data_path):
    users_as_json = json.dumps({key: {subkey: subval for (subkey, subval) in val.items() if subkey != "userObj"} for (key, val) in user_dict.items()})
    with gzip.open(data_path + "/cached_users.json.gz", "w") as cached_users:
        cached_users.write(users_as_json)

def get_contributors(repo):
    try:
        return [(contributor, contributor.login, contributor.contributions, contributor.id) \
                for contributor in repo.get_contributors()], True
    except GithubException as e:
        if e.data[u'message'] == u'The history or contributor list is too large to list contributors for this repository via the API.':
            # Linux!!
            return [(repo.owner, repo.owner.login, 100, repo.owner.id)], True
        elif e.data[u'message'] == u'Repository access blocked':
            print "Github Exception: ", e.data[u'block']
            return [], False
        else:
            raise

def get_stars(user):
#    try:
        return [repo for repo in user.get_starred()], True
#    except GithubException as e:
#        print "Github Exceptione.data
#        return [], False

def get_next(crawlables):
    next_crawlable = next(it.dropwhile(lambda x: x[1]["crawled"], crawlables.items()))
    return next_crawlable[0], next_crawlable[1]

def process_contributors(next_repo_key, contributors, to_crawl):
    to_crawl["repos"][next_repo_key]["contributors"] = dict()
    total_contribs = sum([math.log1p(cTuple[2]) for cTuple in contributors])
    to_crawl["repos"][next_repo_key]["total_log1p_contribs"] = total_contribs
    total_starweight = to_crawl["repos"][next_repo_key]["stargazers_count"]
    for cTuple in contributors:
        to_crawl["repos"][next_repo_key]["contributors"][cTuple[1]] = \
                {"contributions": cTuple[2],
                 "log1p_contributions": math.log1p(cTuple[2]),
                 "id": cTuple[3]}
        if cTuple[1] in to_crawl["users"]:
            # Add their proportional share of star count
            to_crawl["users"][cTuple[1]]["starweight"] += \
                 total_starweight * math.log1p(cTuple[2]) / total_contribs
        else:
            to_crawl["users"][cTuple[1]] = \
                {"id": cTuple[3],
                 "userObj": cTuple[0],
                 "starweight": total_starweight * math.log1p(cTuple[2]) / total_contribs,
                 "crawled": False}
    # Reorder "users" by follower count descending
    to_crawl["users"] = OrderedDict(sorted(to_crawl["users"].iteritems(), key=lambda i: -i[1]["starweight"]))

def process_stars(next_user_key, stars, to_crawl):
    to_crawl["users"][next_user_key]["stars"] = dict()
    for star in stars:
        repo_fullname = star.owner.login + "/" + star.name
        to_crawl["users"][next_user_key]["stars"][repo_fullname] = \
                {"id": star.id}
        if repo_fullname in to_crawl["repos"]:
            pass # for now
        else:
            to_crawl["repos"][repo_fullname] = \
                {"repoObj": star,
                 "id": star.id,
                 "stargazers_count": star.stargazers_count,
                 "crawled": False}
    # Reorder "repos" by star count descending
    to_crawl["repos"] = OrderedDict(sorted(to_crawl["repos"].iteritems(), key=lambda i: -i[1]["stargazers_count"]))

def mark_repo_complete(to_crawl, next_repo_key, success):
    to_crawl["repos"][next_repo_key]["crawled"] = True
    if not success:
        to_crawl["repos"][next_repo_key]["failed"] = True

def mark_user_complete(to_crawl, next_user_key, success):
    to_crawl["users"][next_user_key]["crawled"] = True
    if not success:
        to_crawl["users"][next_user_key]["failed"] = True

def crawl_github(git_uname, git_pw, data_path):
    g = Github(login_or_token=git_uname, password=git_pw, per_page=100)
    to_crawl = {"repos": load_repos(g, data_path), "users": load_users(g, data_path)}
    i = 0
    print "Logged in as %s" % g.get_user().name ## temporary hack to reset rate limiting
    while g.rate_limiting[0] > 250:
        print "API calls remaining before %s: %d" % (
            datetime.datetime.fromtimestamp(g.rate_limiting_resettime).strftime('%Y-%m-%d %H:%M:%S'),
            g.rate_limiting[0])
        next_repo_key, next_repo_val = get_next(to_crawl["repos"])
        print "Processing repo: %s (%d stars)" % (next_repo_key, next_repo_val["stargazers_count"])
        if "repoObj" not in next_repo_val: # cached from disk
            next_repo_val["repoObj"] = g.get_repo(next_repo_key)
        contributors, success = get_contributors(next_repo_val["repoObj"])
        if success:
            process_contributors(next_repo_key, contributors, to_crawl)
        mark_repo_complete(to_crawl, next_repo_key, success)

        next_user_key, next_user_val = get_next(to_crawl["users"])
        print "Processing user: %s (%f starweight)" % (next_user_key, next_user_val["starweight"])
        if "userObj" not in next_user_val: # cached from disk
            next_user_val["userObj"] = g.get_user(next_user_key)
        stars, success = get_stars(next_user_val["userObj"])
        if success:
            process_stars(next_user_key, stars, to_crawl)
        mark_user_complete(to_crawl, next_user_key, success)

        # save progress every 25 users/repos
        i = i + 1
        if i % 25 == 0:
            print "Processed %d times, saving..." % i
            save_repos(to_crawl["repos"], data_path)
            save_users(to_crawl["users"], data_path)


    save_repos(to_crawl["repos"], data_path)
    save_users(to_crawl["users"], data_path)
    return to_crawl

if __name__ == "__main__":
    username = raw_input("GitHub username: ")
    password = raw_input("GitHub password: ")
    crawl_github(username, password, "./downloaded_data")
