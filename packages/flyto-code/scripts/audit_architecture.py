#!/usr/bin/env python3
"""
audit_architecture.py — structural audit of flyto-code frontend.

Reports across these dimensions:

  1. Folder layout — file counts, total lines per domain
  2. Compound test coverage — which compounds have __tests__
  3. File size distribution — split candidates (>1500), tiny files (<20)
  4. Circular imports — would break tree-shaking
  5. Cross-domain coupling — compound A importing compound B
  6. Routes — registered modules vs lazy-loaded
  7. lib/engine — domain split, missing types
  8. Atoms — what's heavy enough to be promoted to compound
  9. Hooks — custom hooks not in @hooks/
 10. Style budget — inline styles vs theme tokens
 11. Path-alias compliance — relative imports outside same folder
 12. Re-export hygiene — index.ts barrel files

Run:
  python3 scripts/audit_architecture.py            # full report
  python3 scripts/audit_architecture.py --section routes
  python3 scripts/audit_architecture.py --csv      # machine-readable
"""

import argparse
import io
import re
import sys
from collections import defaultdict, Counter
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / 'src-next'
SKIP_DIRS = {'__tests__', '@fuse', '@auth', '@i18n', '@mock-utils', 'node_modules', 'tiptap'}

def all_files() -> list[Path]:
    out = []
    for f in SRC.rglob('*'):
        if not f.is_file():
            continue
        if f.suffix not in ('.ts', '.tsx'):
            continue
        if f.name.endswith('.d.ts'):
            continue
        if any(d in str(f) for d in SKIP_DIRS):
            continue
        out.append(f)
    return out

def line_count(p: Path) -> int:
    try:
        return sum(1 for _ in p.read_text(encoding='utf-8').splitlines())
    except OSError:
        return 0

def rel(p: Path) -> str:
    return str(p.relative_to(REPO_ROOT)).replace('\\', '/')

# ─────────────────────────────────────────────────────────────────
# Sections
# ─────────────────────────────────────────────────────────────────

def section_layout(files: list[Path]):
    print('\n## 1. Folder layout — file counts + lines per domain\n')
    domains = defaultdict(lambda: {'files': 0, 'lines': 0, 'tsx': 0, 'ts': 0})
    for f in files:
        # domain = first directory under src-next/ (or under components/)
        rel_parts = f.relative_to(SRC).parts
        if len(rel_parts) < 2:
            continue
        d = rel_parts[0]
        if d in ('components', 'app', 'lib', 'hooks'):
            # one level deeper
            if len(rel_parts) >= 3:
                d = f'{rel_parts[0]}/{rel_parts[1]}'
        domains[d]['files'] += 1
        domains[d]['lines'] += line_count(f)
        if f.suffix == '.tsx':
            domains[d]['tsx'] += 1
        else:
            domains[d]['ts'] += 1
    print(f'{"domain":42s} {"files":>5s} {"tsx":>5s} {"ts":>5s} {"lines":>7s}')
    for d, info in sorted(domains.items(), key=lambda kv: -kv[1]['lines'])[:25]:
        print(f'{d:42s} {info["files"]:>5d} {info["tsx"]:>5d} {info["ts"]:>5d} {info["lines"]:>7d}')


def section_tests(files: list[Path]):
    print('\n## 2. Test coverage — compounds without __tests__\n')
    compounds_dir = SRC / 'components' / 'compounds'
    if not compounds_dir.exists():
        print('  (no compounds folder)')
        return
    untested = []
    tested_count = 0
    for cdir in sorted(compounds_dir.iterdir()):
        if not cdir.is_dir() or cdir.name in SKIP_DIRS:
            continue
        has_test = (cdir / '__tests__').exists()
        if has_test:
            tested_count += 1
        else:
            untested.append(cdir.name)
    print(f'  Total compound folders: {tested_count + len(untested)}')
    print(f'  With __tests__: {tested_count}')
    print(f'  Without __tests__: {len(untested)}')
    if untested:
        print('\n  Missing (alphabetical):')
        for name in untested:
            print(f'    {name}')


def section_sizes(files: list[Path]):
    print('\n## 3. File size distribution\n')
    sizes = [(f, line_count(f)) for f in files]
    sizes.sort(key=lambda kv: -kv[1])
    total_lines = sum(n for _, n in sizes)
    n_files = len(sizes)
    median = sizes[n_files // 2][1] if sizes else 0
    print(f'  Total source lines:  {total_lines:,}')
    print(f'  File count:          {n_files}')
    print(f'  Median file size:    {median}')
    print('  Largest 12 files (split candidates >1500):')
    for f, n in sizes[:12]:
        flag = ' ⚠️' if n > 1500 else ''
        print(f'    {n:5d}  {rel(f)}{flag}')
    print('\n  Tiny files (<20 lines) — likely consolidation candidates:')
    tiny = [(f, n) for f, n in sizes if n < 20 and 'index.ts' not in f.name]
    for f, n in tiny[:8]:
        print(f'    {n:3d}  {rel(f)}')
    if len(tiny) > 8:
        print(f'    ... and {len(tiny) - 8} more')


def section_circular(files: list[Path]):
    print('\n## 4. Circular imports (would break tree-shaking)\n')
    # Build import graph
    graph: dict[str, set[str]] = defaultdict(set)
    file_map: dict[str, Path] = {}
    for f in files:
        key = rel(f)
        file_map[key] = f
        try:
            t = f.read_text(encoding='utf-8')
        except OSError:
            continue
        for m in re.finditer(r"from\s+['\"]([^'\"]+)['\"]", t):
            target = m.group(1)
            if target.startswith('.') or target.startswith('@'):
                graph[key].add(target)
    # Detect cycles via DFS — bounded to alias-resolved internal imports
    # NOTE: this is a heuristic; we don't fully resolve TS path aliases.
    # We look for direct 2-cycle (A→B and B→A) only.
    cycles: list[tuple[str, str]] = []
    for src, targets in graph.items():
        src_short = Path(src).stem
        for t in targets:
            t_stem = Path(t).stem
            if t_stem == src_short:
                continue
            # Check if any file imports `src`
            for other_src, other_targets in graph.items():
                if other_src == src:
                    continue
                if Path(other_src).stem != t_stem:
                    continue
                if any(Path(ot).stem == src_short for ot in other_targets):
                    pair = tuple(sorted([src_short, t_stem]))
                    if pair not in [tuple(sorted([a, b])) for a, b in cycles]:
                        cycles.append(pair)
    if not cycles:
        print('  None detected (2-cycle scan)')
    else:
        for a, b in cycles[:8]:
            print(f'  {a} ↔ {b}')


def section_coupling(files: list[Path]):
    print('\n## 5. Cross-compound coupling — A imports B (5 most-imported)\n')
    counts: dict[str, int] = Counter()
    for f in files:
        try:
            t = f.read_text(encoding='utf-8')
        except OSError:
            continue
        for m in re.finditer(r"from\s+['\"]@compounds/([a-zA-Z0-9_-]+)/", t):
            domain = m.group(1)
            # Don't count self-imports
            try:
                src_parts = f.relative_to(SRC / 'components' / 'compounds').parts
                if src_parts and src_parts[0] == domain:
                    continue
            except ValueError:
                pass
            counts[domain] += 1
    for d, n in counts.most_common(8):
        print(f'  {n:4d}  @compounds/{d}/* imported by other compounds')


def section_routes(files: list[Path]):
    print('\n## 6. Routes — module registry + lazy-load coverage\n')
    modules_file = SRC / 'types' / 'modules.ts'
    if not modules_file.exists():
        print('  types/modules.ts not found')
        return
    t = modules_file.read_text(encoding='utf-8')
    ids = re.findall(r"\bid:\s*'([a-z][a-zA-Z0-9_-]+)'", t)
    paths = re.findall(r"\bpath:\s*'([^']+)'", t)
    lazy = re.findall(r"\blazyImport:\s*\(\)", t)
    print(f'  Module entries:         {len(ids)}')
    print(f'  Path declarations:      {len(paths)}')
    print(f'  Lazy-imports declared:  {len(lazy)}')
    # Check FULL_BLEED_PAGES
    layout = SRC / 'app' / '(control-panel)' / 'flyto' / 'workspace' / 'WorkspaceLayout.tsx'
    if layout.exists():
        lt = layout.read_text(encoding='utf-8')
        m = re.search(r'FULL_BLEED_PAGES\s*=\s*\[(.*?)\]', lt, re.DOTALL)
        if m:
            bleeds = re.findall(r"'([^']+)'", m.group(1))
            print(f'  FULL_BLEED_PAGES:       {len(bleeds)} routes')


def section_engine(files: list[Path]):
    print('\n## 7. lib/engine domain split\n')
    eng = SRC / 'lib' / 'engine'
    if not eng.exists():
        print('  lib/engine not found')
        return
    counts: dict[str, dict] = {}
    for sub in eng.iterdir():
        if sub.is_dir():
            tsf = [f for f in sub.rglob('*.ts') if not f.name.endswith('.d.ts')]
            lines = sum(line_count(f) for f in tsf)
            counts[sub.name] = {'files': len(tsf), 'lines': lines}
    for d, info in sorted(counts.items(), key=lambda kv: -kv[1]['lines']):
        print(f'  {d:15s} files={info["files"]:>3d}  lines={info["lines"]:>5d}')


def section_atoms(files: list[Path]):
    print('\n## 8. Atoms — heavy atoms that should be promoted to compound\n')
    atoms_dir = SRC / 'components' / 'atoms'
    if not atoms_dir.exists():
        return
    candidates = []
    for f in atoms_dir.rglob('*.tsx'):
        n = line_count(f)
        if n >= 200:
            candidates.append((f, n))
    if candidates:
        for f, n in sorted(candidates, key=lambda kv: -kv[1])[:8]:
            print(f'  {n:5d}  {rel(f)}')
    else:
        print('  All atoms are <200 lines — healthy primitives layer')


def section_hooks(files: list[Path]):
    print('\n## 9. Custom hooks — declared in @hooks vs inline\n')
    hooks_dir = SRC / 'hooks'
    declared = set()
    if hooks_dir.exists():
        for f in hooks_dir.rglob('*.ts*'):
            for m in re.finditer(r'\bexport\s+(?:default\s+)?(?:function|const)\s+(use[A-Z][a-zA-Z0-9]+)', f.read_text(encoding='utf-8')):
                declared.add(m.group(1))
    print(f'  Hooks declared in @hooks/: {len(declared)}')
    # find inline `function useX` in compounds (not @hooks/)
    inline_hooks = []
    for f in files:
        if 'hooks' in str(f.relative_to(SRC).parts[0]):
            continue
        try:
            t = f.read_text(encoding='utf-8')
        except OSError:
            continue
        for m in re.finditer(r'\b(?:export\s+)?function\s+(use[A-Z][a-zA-Z0-9]+)', t):
            name = m.group(1)
            if name not in declared:
                inline_hooks.append((rel(f), name))
    print(f'  Custom hooks inline (not in @hooks/): {len(inline_hooks)}')
    seen = set()
    for path, name in inline_hooks[:8]:
        if name not in seen:
            seen.add(name)
            print(f'    {name:30s} {path}')


def section_path_aliases(files: list[Path]):
    print('\n## 10. Relative imports outside same folder (CLAUDE.md path-alias rule)\n')
    bad: list[tuple[Path, int, str]] = []
    for f in files:
        try:
            t = f.read_text(encoding='utf-8')
        except OSError:
            continue
        for line_no, line in enumerate(t.splitlines(), 1):
            m = re.search(r"from\s+['\"]((?:\.\./)+[^'\"]+)['\"]", line)
            if m:
                rel_path = m.group(1)
                # Only flag if `../` count > 1 (crosses 2+ folder boundaries)
                if rel_path.count('../') >= 2:
                    bad.append((f, line_no, rel_path))
    print(f'  Imports with 2+ `../` (should use @alias): {len(bad)}')
    seen_paths = set()
    for f, ln, p in bad[:8]:
        key = rel(f)
        if key in seen_paths:
            continue
        seen_paths.add(key)
        print(f'  L{ln:4d}  {rel(f)} → {p}')


def section_barrels(files: list[Path]):
    print('\n## 11. Barrel index.ts re-exports\n')
    barrels = []
    for f in files:
        if f.name != 'index.ts':
            continue
        try:
            t = f.read_text(encoding='utf-8')
        except OSError:
            continue
        if 'export ' in t:
            n = sum(1 for ln in t.splitlines() if re.search(r'^export', ln))
            if n >= 2:
                barrels.append((f, n))
    print(f'  Barrel re-export files: {len(barrels)}')
    for f, n in sorted(barrels, key=lambda kv: -kv[1])[:8]:
        print(f'    {n:3d} exports  {rel(f)}')


def section_compounds_inventory(files: list[Path]):
    print('\n## 12. Compound inventory — per-domain\n')
    compounds_dir = SRC / 'components' / 'compounds'
    if not compounds_dir.exists():
        return
    inv = []
    for cdir in sorted(compounds_dir.iterdir()):
        if not cdir.is_dir():
            continue
        tsf = [f for f in cdir.rglob('*.tsx') if '__tests__' not in str(f)]
        if not tsf:
            continue
        lines = sum(line_count(f) for f in tsf)
        has_tests = (cdir / '__tests__').exists()
        inv.append((cdir.name, len(tsf), lines, has_tests))
    print(f'{"domain":24s} {"files":>5s} {"lines":>7s} tests')
    for name, n, ln, ht in sorted(inv, key=lambda kv: -kv[2]):
        mark = '✓' if ht else '·'
        print(f'  {name:22s} {n:>5d} {ln:>7d}  {mark}')


SECTIONS = {
    'layout': section_layout,
    'tests': section_tests,
    'sizes': section_sizes,
    'circular': section_circular,
    'coupling': section_coupling,
    'routes': section_routes,
    'engine': section_engine,
    'atoms': section_atoms,
    'hooks': section_hooks,
    'aliases': section_path_aliases,
    'barrels': section_barrels,
    'inventory': section_compounds_inventory,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--section', choices=list(SECTIONS), help='Run only one section')
    args = ap.parse_args()

    files = all_files()
    print('# Architecture audit — flyto-code')
    print(f'# Scanned {len(files)} .ts/.tsx files under src-next/')

    secs = [args.section] if args.section else SECTIONS.keys()
    for name in secs:
        SECTIONS[name](files)
    return 0


if __name__ == '__main__':
    sys.exit(main())
