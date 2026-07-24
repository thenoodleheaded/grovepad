#!/usr/bin/env python3
"""Regenerates src/utils/recipes/recipeData.ts from the template catalogue document.

    python3 scripts/build-recipes.py

Python rather than the usual .mjs because the source is a .docx — a zip of XML —
and Python reads both from its standard library while Node needs a dependency.

The document is the only input. Widget types, skin values, port ids, and command
ids are read straight out of its own inventory section, except the Tracker's
skins: those are the Atlas catalogue, so they are resolved against
src/widgets/atlasCatalog.ts by label. Nothing here is hand-maintained.

This script does not validate against the live registry — that is the job of
src/utils/recipes/recipeCatalogue.test.ts, which re-checks every recipe against
the real field and command descriptors. Regenerate, then run the test.
"""

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / 'docs' / 'Grovepad-Template-Catalogue.docx'
ATLAS = ROOT / 'src' / 'widgets' / 'atlasCatalog.ts'
OUT = ROOT / 'src' / 'utils' / 'recipes' / 'recipeData.ts'

COL, ROW = 400, 300


def document_lines() -> list[str]:
    """The document's paragraphs as plain text, in order."""
    xml = zipfile.ZipFile(DOCX).read('word/document.xml').decode('utf-8')
    out = []
    for para in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S):
        text = ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', para, re.S))
        for entity, char in (('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                             ('&quot;', '"'), ('&apos;', "'")):
            text = text.replace(entity, char)
        out.append(text)
    return out


def parse_ports(body: str) -> list[dict]:
    if body == 'None.':
        return []
    ports = []
    for part in body.rstrip('.').split(';'):
        m = re.match(r'^\s*(.+?)\s*\[([a-zA-Z_0-9]+)\]\s*(?:\(.*?\))?\s*$', part)
        if m:
            ports.append({'label': m.group(1), 'id': m.group(2)})
    return ports


def parse(lines: list[str]) -> tuple[dict, list[dict]]:
    """Splits the document into its widget inventory and its templates."""
    inventory: dict[str, dict] = {}
    record = None
    INV = re.compile(r'^(.+?)\s\s+\[([a-zA-Z_0-9]+)\]\s+·\s+(PUBLIC|EXISTING-ONLY)\s*$')

    for line in lines:
        m = INV.match(line)
        if m:
            record = {'label': m.group(1).strip(), 'type': m.group(2), 'skins': []}
            inventory[m.group(2)] = record
            continue
        if record is None:
            continue
        if line.startswith('Skins. '):
            for part in line[7:].rstrip('.').split(';'):
                mm = re.match(r'^\s*(.+?)\s*\[([a-zA-Z_0-9]+)\]\s*$', part)
                if mm:
                    record['skins'].append({'label': mm.group(1), 'value': mm.group(2)})

    GT = re.compile(r'^GT-(\d+)\s\s+(.+?)\s*$')
    META = re.compile(r'^LEVEL\s+(\d)\s+·\s+([A-Z]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$')
    WIRE = re.compile(
        r'^Wire\s+(\d+)\s+—\s+([A-Z])\s+·\s+.+?\s+\[([a-zA-Z_0-9]+)\]\s*→\s*'
        r'([A-Z])\s+·\s+.+?\s+\[([a-zA-Z_0-9]+)\]\s*;\s*(.+?)\s*\.?\s*$')
    SHELF = re.compile(r'^(\d+)\s+templates?\s+·\s+browse tags:\s*(.+?)\.\s*Entries')

    templates: list[dict] = []
    current = None
    shelf = None

    for i, line in enumerate(lines):
        if SHELF.match(line):
            shelf = lines[i - 2].strip()
            continue
        m = GT.match(line)
        if m:
            current = {'id': 'GT-' + m.group(1), 'title': m.group(2), 'shelf': shelf,
                       'level': None, 'graph': '', 'setup': '', 'tags': [],
                       'outcome': '', 'place': '', 'construct': '', 'relations': '', 'wires': []}
            templates.append(current)
            continue
        if current is None:
            continue
        mm = META.match(line)
        if mm:
            current['level'] = int(mm.group(1))
            current['graph'] = mm.group(3)
            current['setup'] = mm.group(4)
            current['tags'] = [s.strip() for s in mm.group(5).split('·')]
        elif line.startswith('Outcome. '):
            current['outcome'] = line[9:].strip()
        elif line.startswith('Place. '):
            current['place'] = line[7:].strip()
        elif line.startswith('Construct. '):
            current['construct'] = line[11:].strip()
        elif line.startswith('Relations. '):
            current['relations'] = line[11:].strip()
        elif line.startswith('Wire '):
            mw = WIRE.match(line)
            if not mw:
                sys.exit(f'unparsed wire in {current["id"]}: {line}')
            current['wires'].append({
                'from': mw.group(2), 'fromPort': mw.group(3),
                'to': mw.group(4), 'toPort': mw.group(5), 'spec': mw.group(6)})

    return inventory, templates


def atlas_labels() -> dict[str, str]:
    """Tracker skins are Atlas presets, keyed by their catalogue label."""
    body = ATLAS.read_text(encoding='utf-8').split('export const ATLAS_CATALOG')[1]
    return {label: key for key, label in re.findall(r"^\s{2}([a-z_0-9]+):A\('([^']+)'", body, re.M)}


def resolve(inventory: dict, templates: list[dict], atlas: dict) -> list[dict]:
    label_to_type = {}
    for type_id, record in inventory.items():
        label_to_type.setdefault(record['label'], type_id)

    resolved = []
    for t in templates:
        slots = []
        for chunk in t['place'].rstrip('.').split(';'):
            m = re.match(r'^([A-Z])\s*=\s*(.+?)\s*$', chunk.strip())
            if not m:
                sys.exit(f'unparsed placement in {t["id"]}: {chunk!r}')
            letter, body = m.group(1), m.group(2).strip()

            title = None
            mt = re.search(r'\(\s*[“"](.+?)[”"]\s*\)\s*$', body)
            if mt:
                title, body = mt.group(1), body[:mt.start()].strip()

            skin_label = None
            ms = re.match(r'^(.+?)\s*/\s*(.+?)\s+skin\s*$', body)
            if ms:
                body, skin_label = ms.group(1).strip(), ms.group(2).strip()

            widget_type = label_to_type.get(body)
            if widget_type is None:
                sys.exit(f'unknown widget label in {t["id"]}: {body!r}')

            skin = None
            if skin_label:
                for option in inventory[widget_type]['skins']:
                    if option['label'].lower() == skin_label.lower():
                        skin = option['value']
                        break
                if skin is None and widget_type == 'tracker':
                    skin = atlas.get(skin_label)
                if skin is None:
                    sys.exit(f'unknown skin in {t["id"]}: {widget_type}/{skin_label!r}')

            slots.append({'slot': letter, 'type': widget_type, 'skin': skin, 'title': title})

        letters = {s['slot'] for s in slots}

        relations = []
        if t['relations']:
            for chunk in t['relations'].rstrip('.').split(';'):
                m = re.match(r'^([A-Z])\s*—\s*([a-z-]+)\s*→\s*([A-Z])\s*$', chunk.strip())
                if not m:
                    sys.exit(f'unparsed relation in {t["id"]}: {chunk!r}')
                if m.group(1) in letters and m.group(3) in letters:
                    relations.append({'from': m.group(1), 'to': m.group(3), 'kind': m.group(2)})

        wires = []
        for w in t['wires']:
            spec = w['spec']
            if spec.startswith('value wire'):
                kind, edge = 'value', None
                transform = 'clamp_0_100' if 'clamp' in spec else None
            elif spec.startswith('trigger wire'):
                kind, transform = 'trigger', None
                edge = 'rising' if 'rising' in spec else 'change' if 'change' in spec else None
                if edge is None:
                    sys.exit(f'unknown trigger edge in {t["id"]}: {spec!r}')
            else:
                sys.exit(f'unknown wire spec in {t["id"]}: {spec!r}')
            if w['from'] in letters and w['to'] in letters:
                wires.append({**{k: w[k] for k in ('from', 'fromPort', 'to', 'toPort')},
                              'kind': kind, 'transform': transform, 'edge': edge})

        resolved.append({**{k: t[k] for k in ('id', 'title', 'shelf', 'level', 'graph',
                                              'setup', 'tags', 'outcome', 'construct')},
                         'slots': slots, 'relations': relations, 'wires': wires})
    return resolved


def layout(recipe: dict) -> dict[str, tuple[float, float]]:
    """An opening arrangement. The store's collision solver owns final placement."""
    letters = [s['slot'] for s in recipe['slots']]
    if len(letters) == 1:
        return {letters[0]: (0, 0)}

    relations, wires = recipe['relations'], recipe['wires']
    pos: dict[str, tuple[float, float]] = {}

    # A mind map fans its children out beneath the root.
    if relations and not wires:
        roots = {r['from'] for r in relations}
        root = next((s for s in letters if s in roots), letters[0])
        children = [s for s in letters if s not in roots]
        pos[root] = (0, 0)
        per = min(len(children), 5)
        for i, child in enumerate(children):
            row, col = divmod(i, per)
            width = min(len(children) - row * per, per)
            pos[child] = ((col - (width - 1) / 2) * COL, (row + 1) * ROW)
        return pos

    # A circuit reads left to right, one column per step away from its sources.
    if wires:
        depth = {s: 0 for s in letters}
        for _ in range(len(letters)):
            for w in wires:
                depth[w['to']] = max(depth[w['to']], depth[w['from']] + 1)
        columns: dict[int, list[str]] = {}
        for s in letters:
            columns.setdefault(depth[s], []).append(s)
        for d, members in columns.items():
            for i, s in enumerate(members):
                pos[s] = (d * COL, (i - (len(members) - 1) / 2) * ROW)
        return pos

    per = min(3, len(letters))
    for i, s in enumerate(letters):
        row, col = divmod(i, per)
        pos[s] = (col * COL, row * ROW)
    return pos


def quote(value) -> str:
    return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ') + "'"


def slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', text.lower().replace('&', 'and')).strip('-')


def emit(recipes: list[dict]) -> str:
    shelves = list(dict.fromkeys(r['shelf'] for r in recipes))
    out = [
        '// GENERATED FILE — do not edit by hand.',
        '// Source: docs/Grovepad-Template-Catalogue.docx (repository snapshot, 25 July 2026).',
        '// Regenerate with `python3 scripts/build-recipes.py`. Every entry is validated',
        '// against the live registry by src/utils/recipes/recipeCatalogue.test.ts.',
        "import type { RecipeDefinition, RecipeShelf } from './recipeTypes'",
        '',
        'export const RECIPE_SHELVES: readonly RecipeShelf[] = [',
    ]
    out += [f'  {{ id: {quote(slug(s))}, label: {quote(s)} }},' for s in shelves]
    out += ['] as const', '', 'export const RECIPES: readonly RecipeDefinition[] = [']

    for recipe in recipes:
        pos = layout(recipe)
        body = [
            f'    id: {quote(recipe["id"])},',
            f'    title: {quote(recipe["title"])},',
            f'    shelf: {quote(slug(recipe["shelf"]))},',
            f'    level: {recipe["level"]},',
            f'    setup: {quote(recipe["setup"])},',
            f'    graph: {quote(recipe["graph"])},',
            '    tags: [' + ', '.join(quote(t) for t in recipe['tags']) + '],',
            f'    outcome: {quote(recipe["outcome"])},',
            f'    construct: {quote(recipe["construct"])},',
        ]

        slots = []
        for slot in recipe['slots']:
            x, y = pos[slot['slot']]
            entry = (f'{{ slot: {quote(slot["slot"])}, type: {quote(slot["type"])}, '
                     f'x: {x:g}, y: {y:g}')
            if slot['skin']:
                entry += f', skin: {quote(slot["skin"])}'
            if slot['title']:
                entry += f', title: {quote(slot["title"])}'
            slots.append(entry + ' }')
        body.append('    slots: [' + ', '.join(slots) + '],')

        if recipe['relations']:
            body.append('    relations: [' + ', '.join(
                f'{{ from: {quote(r["from"])}, to: {quote(r["to"])}, kind: {quote(r["kind"])} }}'
                for r in recipe['relations']) + '],')

        if recipe['wires']:
            wires = []
            for w in recipe['wires']:
                entry = (f'{{ from: {quote(w["from"])}, fromPort: {quote(w["fromPort"])}, '
                         f'to: {quote(w["to"])}, toPort: {quote(w["toPort"])}, '
                         f'kind: {quote(w["kind"])}')
                if w['transform']:
                    entry += f', transform: {quote(w["transform"])}'
                if w['edge']:
                    entry += f', edge: {quote(w["edge"])}'
                wires.append(entry + ' }')
            body.append('    wires: [' + ', '.join(wires) + '],')

        out.append('  {\n' + '\n'.join(body) + '\n  },')

    out += [']', '']
    return '\n'.join(out)


def main() -> None:
    if not DOCX.exists():
        sys.exit(f'missing source document: {DOCX}')
    inventory, templates = parse(document_lines())
    recipes = resolve(inventory, templates, atlas_labels())
    OUT.write_text(emit(recipes), encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {len(recipes)} recipes, '
          f'{sum(len(r["slots"]) for r in recipes)} cards, '
          f'{sum(len(r["relations"]) for r in recipes)} relations, '
          f'{sum(len(r["wires"]) for r in recipes)} wires')


if __name__ == '__main__':
    main()
