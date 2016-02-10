import sys
import json

def process_node(node_dict, f):
    line = f.readline()
    if line != "  [\n":
        raise ValueError("Unexpected line: " + line)

    line = f.readline()
    if line[:7] != "    id ":
        raise ValueError("Unexpected line: " + line)
    else:
        node = line[7:-1]

    line = f.readline()
    if line[:10] != "    label ":
        raise ValueError("Unexpected line: " + line)
    line = f.readline()
    if line != "    graphics\n":
        raise ValueError("Unexpected line: " + line)
    line = f.readline()
    if line != "    [\n":
        raise ValueError("Unexpected line: " + line)

    line = f.readline()
    if line[:8] != "      x ":
        raise ValueError("Unexpected line: " + line)
    else:
        x = float(line[8:-1])

    line = f.readline()
    if line[:8] != "      y ":
        raise ValueError("Unexpected line: " + line)
    else:
        y = float(line[8:-1])

    line = f.readline()
    if line != "      z 0.0\n":
        raise ValueError("Unexpected line: " + line)
    line = f.readline()
    if line != "    ]\n":
        raise ValueError("Unexpected line: " + line)
    line = f.readline()
    if line != "  ]\n":
        raise ValueError("Unexpected line: " + line)

    node_dict[node] = {"x": x, "y": y}

def process_edge(edge_list, f):
    line = f.readline()
    if line != "  [\n":
        raise ValueError("Unexpected line: " + line)

    line = f.readline()
    if line[:7] != "    id ":
        raise ValueError("Unexpected line: " + line)

    line = f.readline()
    if line[:11] != "    source ":
        raise ValueError("Unexpected line: " + line)
    else:
        source = line[11:-1]

    line = f.readline()
    if line[:11] != "    target ":
        raise ValueError("Unexpected line: " + line)
    else:
        target = line[11:-1]

    line = f.readline()
    if line != "  ]\n":
        raise ValueError("Unexpected line: " + line)

    edge_list.append({"source": source, "target":target})

def process_file(filename):
    output_dict = {"nodes": {}, "edges": []}
    with open(sys.argv[1]) as f:
        while True:
            line = f.readline()
            if line == "": # EOF
                break
            elif line == "  node\n":
                process_node(output_dict["nodes"], f)
            elif line == "  edge\n":
                process_edge(output_dict["edges"], f)

    print(json.dumps(output_dict, indent=2))

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print "Please specify exactly one file to process (e.g. python gephi_to_json.py Untitled.gml)"
    else:
        process_file(sys.argv[1])
