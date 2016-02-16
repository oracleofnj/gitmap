import json
with open("newestoutput.json") as f:
    gitmap = json.loads(f.read())

from ete3 import Tree
t = Tree()
for root in gitmap.keys():
    node = t.add_child(name="R_" + root)
    for grandpa in gitmap[root].keys():
            g_node = node.add_child(name="G_" + grandpa)
            for dad in gitmap[root][grandpa].keys():
                    d_node = node.add_child(name="D_" + dad)
                    for child in gitmap[root][grandpa][dad]:
                            d_node.add_child(name=child)
