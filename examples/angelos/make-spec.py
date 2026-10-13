import importlib.util, json, re, sys

REPO = sys.argv[2]
OUT = sys.argv[1]
spec_mod = importlib.util.spec_from_file_location('bm', f'{REPO}/scripts/build-map.py')
bm = importlib.util.module_from_spec(spec_mod); spec_mod.loader.exec_module(bm)
raw_nodes, raw_edges = bm.collect()
by = {n['id']: n for n in raw_nodes}


def short(s, n=24):
    return s if len(s) <= n else s[:n - 1] + '…'


def sentence(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    m = re.match(r'(.+?[.:])(\s|$)', s)
    s = m.group(1) if m else s
    return s[:220]


def router(skill):
    return f'skill:{skill}/SKILL'


nodes, gx_id = [], {}
skills = [n['label'] for n in raw_nodes if n['kind'] == 'entry']

for n in raw_nodes:
    k = n['kind']
    if k == 'entry':
        s = n['label']
        nodes.append(dict(id=f'skill:{s}', lane='skills', label=s, kind='service',
                          summary=sentence(n['purpose']), path=n['path'], tags=[s]))
        nodes.append(dict(id=router(s), parent=f'skill:{s}', label='SKILL.md', kind='route',
                          summary=f'The {s} router: reads the ask, matches one row, opens that row\'s files.',
                          path=n['path'], tags=[s]))
        gx_id[n['id']] = router(s)
    elif k == 'group':
        s, g = n['owner'], n['label']
        gid = f'skill:{s}/{g}'
        nodes.append(dict(id=gid, parent=f'skill:{s}', label=g, kind='folder',
                          summary=n['purpose'] + '.', tags=[s]))
        gx_id[n['id']] = gid
    elif k == 'ref':
        s = n['owner']
        parent = f"skill:{s}/{n['group']}" if n.get('group') else f'skill:{s}'
        rid = f"skill:{s}/b/{n['label']}"
        nodes.append(dict(id=rid, parent=parent, label=short(n['label']), kind='module',
                          summary=sentence(n['purpose']) or f"Branch {n['label']} of {s}.",
                          path=n['path'], tags=[s, n['label']]))
        gx_id[n['id']] = rid
    elif k == 'companion':
        s = n['owner']
        cid = f"skill:{s}/b/{n['parent']}/{n['label']}"
        # Siblings of their branch, not children: a branch with children would stop being a leaf
        # and its load edges would vanish when unfolded.
        grp = by.get(f"ref:{s}/{n['parent']}", {}).get('group')
        parent = f'skill:{s}/{grp}' if grp else f'skill:{s}'
        nodes.append(dict(id=cid, parent=parent, label=short(f"{n['parent']}/{n['label']}"), kind='file',
                          summary=sentence(n['purpose']) or f"Detail read only by {n['parent']}.",
                          path=n['path'], tags=[s]))
        gx_id[n['id']] = cid
    elif k == 'shared':
        d = n['label']
        nodes.append(dict(id=f'shared:{d}', lane='shared', label=short(d), kind='datastore',
                          summary=f"Shared knowledge domain. {n['purpose']}.", path=n['path']))
    elif k == 'lens':
        d = n['parent']
        lid = f"shared:{d}/{n['label']}"
        nodes.append(dict(id=lid, parent=f'shared:{d}', label=short(n['label']), kind='file',
                          summary=sentence(n['purpose']) or n['label'], path=n['path']))
        gx_id[n['id']] = lid

edges, seen = [], set()
for e in raw_edges:
    a, b = gx_id.get(e['source']), gx_id.get(e['target'])
    if not a or not b or a == b:
        continue
    if e['kind'] == 'companion' and e['source'].startswith('ref:'):
        kind, lab = 'call', 'detail'
    elif e['kind'] == 'loads':
        kind, lab = ('data', 'reads') if b.startswith('shared:') else ('call', 'hands off')
    else:
        continue
    if (a, b) in seen:
        continue
    seen.add((a, b))
    edges.append(dict(id=f'e{len(edges)}', **{'from': a, 'to': b}, kind=kind,
                      summary=f"{a.split('/')[-1]} {lab} {b.split('/')[-1]}."))

skill_of = lambda nid: nid.split('/')[0].split(':')[1] if nid.startswith('skill:') else None
out_adj = {}
for e in edges:
    out_adj.setdefault(e['from'], []).append(e['to'])


def reach(s):
    """Everything the skill owns, plus whatever it reads: shared leaves transitively, and the
    first file of another skill it hands off to (not that skill's whole tree)."""
    own = [n['id'] for n in nodes if skill_of(n['id']) == s and not n['id'] == f'skill:{s}']
    keep, q = set(own), list(own)
    while q:
        x = q.pop()
        for y in out_adj.get(x, []):
            if y in keep:
                continue
            keep.add(y)
            if y.startswith('shared:'):
                q.append(y)
    return sorted(keep)


leaf = {n['id'] for n in nodes} - {n.get('parent') and (n['parent']) for n in nodes}
filters = []
for s in skills:
    ids = [i for i in reach(s) if i in leaf]
    filters.append(dict(label=s, nodes=ids))
    print(s, len(ids), file=sys.stderr)

spec = {
    'title': 'angelos',
    'lang': 'en',
    'summary': 'Ten skills route each ask to one branch; branches read leaves from shared knowledge domains. '
               'Derived from the files by scripts/build-map.py logic: every edge is a load path a file writes.',
    'direction': 'right',
    'initialDepth': 1,
    'lanes': [
        {'id': 'skills', 'label': 'Skills', 'subtitle': 'skills/<verb>: router plus branches'},
        {'id': 'shared', 'label': 'Shared knowledge', 'subtitle': 'shared/<domain>: leaves, no index'},
    ],
    'levels': [
        {'depth': 0, 'label': 'Skill or domain'},
        {'depth': 1, 'label': 'Branch or leaf'},
        {'depth': 2, 'label': 'Detail'},
    ],
    'filters': filters,
    'legend': {'edges': [
        {'label': 'reads shared knowledge', 'style': 'solid'},
        {'label': 'hands off or opens detail', 'style': 'dashed'},
    ]},
    'nodes': nodes,
    'edges': edges,
}

first = lambda pred: next(e['id'] for e in edges if pred(e))
cr = [e['id'] for e in edges if e['from'].startswith('skill:review/') and e['to'].startswith('shared:code-reviewers/')][:6]
spec['tour'] = {'title': 'How angelos is wired', 'steps': [
    {'title': 'One router per verb',
     'body': 'Each of the ten skills is a SKILL.md router. It reads the ask, matches one routing row, and that row names the exact files to open. Nothing else is loaded.',
     'focus': {'nodes': [router(s) for s in skills]}},
    {'title': 'Branches do the work',
     'body': 'A matched row opens one branch under skills/<verb>/branches. Review groups its branches by what is judged: code, design, document, plus concerns that stack on any of them.',
     'depth': 2, 'focus': {'nodes': [n['id'] for n in nodes if n['id'].startswith('skill:review/')]}},
    {'title': 'Shared knowledge',
     'body': 'Standards live once under shared/<domain>, as leaves with no index file. A router or branch names the leaves it reads, so the same standard serves the verb that writes and the verb that judges.',
     'focus': {'nodes': [n['id'] for n in nodes if n.get('lane') == 'shared']}},
    {'title': 'A worked path',
     'body': 'Review on a diff spawns reviewer prompts from shared/code-reviewers, one per failure class. Pick a skill in the filter bar to see only its flow and everything it reads.',
     'focus': {'edges': cr} if cr else {'nodes': [router('review')]}},
]}

json.dump(spec, open(OUT, 'w'), indent=1)
print(len(nodes), 'nodes', len(edges), 'edges', file=sys.stderr)
