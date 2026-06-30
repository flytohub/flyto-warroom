#!/usr/bin/env python3
"""fix-grid-minmax.py — third-pass codemod for CSS Grid overflow.

`repeat(N, 1fr)` is shorthand for `repeat(N, minmax(auto, 1fr))`. When
a cell holds an unbreakable string (file hash, domain, package name,
long technology id) the `auto` lower bound expands the column past
the container, triggering horizontal scroll.

This pass rewrites integer-count `repeat(N, 1fr)` to
`repeat(N, minmax(0, 1fr))` so columns shrink to the track width
regardless of content. Idempotent — running twice is a no-op.

Auto-fill / auto-fit variants are left alone (those have their own
min-width clause and are intentional).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent / 'src-next'

# repeat(<digit>, 1fr) — only catches the explicit-count form.
PAT = re.compile(r"repeat\((\d+),\s*1fr\)")
REP = r"repeat(\1, minmax(0, 1fr))"


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'components' / 'compounds'
    changed = 0
    edits = 0
    for fp in target.rglob('*.tsx'):
        original = fp.read_text(encoding='utf-8')
        modified, n = PAT.subn(REP, original)
        if n == 0:
            continue
        edits += n
        changed += 1
        rel = fp.relative_to(ROOT.parent)
        print(f'  {rel}: {n} edit(s)')
        fp.write_text(modified, encoding='utf-8')
    print(f'\n{changed} files, {edits} edits')
    return 0


if __name__ == '__main__':
    sys.exit(main())
