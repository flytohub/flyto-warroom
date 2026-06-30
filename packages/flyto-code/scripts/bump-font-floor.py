#!/usr/bin/env python3
"""bump-font-floor.py — one-off codemod.

Per feedback_font_size_floor memory: user dislikes tiny text. Bumps
fontSize: 9/10/11 -> 12/13 and rewrites text.disabled -> text.secondary
across src-next/components/compounds. Safe transforms only — no
attempt to widen chip/badge fontSize:12 (those are legitimately compact
inline elements).

Usage:
    python scripts/bump-font-floor.py            # apply
    python scripts/bump-font-floor.py --dry-run  # preview
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent / 'src-next'

# Replacement rules. Each: regex -> replacement. Order matters when
# patterns overlap.
RULES = [
    # numeric fontSize: 9 / 10 / 11 — bump to 12 / 12 / 13
    (re.compile(r"fontSize:\s*9(?![0-9])"),  "fontSize: 12"),
    (re.compile(r"fontSize:\s*10(?![0-9])"), "fontSize: 12"),
    (re.compile(r"fontSize:\s*11(?![0-9])"), "fontSize: 13"),

    # string fontSize: '9px' / '10px' / '11px'
    (re.compile(r"fontSize:\s*['\"]9px['\"]"),  "fontSize: '12px'"),
    (re.compile(r"fontSize:\s*['\"]10px['\"]"), "fontSize: '12px'"),
    (re.compile(r"fontSize:\s*['\"]11px['\"]"), "fontSize: '13px'"),

    # text.disabled almost always means "deemphasized text" not
    # "disabled UI state" in this codebase — switch to text.secondary
    # for better readability per user feedback.
    (re.compile(r"color:\s*['\"]text\.disabled['\"]"), "color: 'text.secondary'"),
    (re.compile(r'color="text\.disabled"'),            'color="text.secondary"'),
]


def transform(text: str) -> tuple[str, int]:
    total = 0
    for pat, rep in RULES:
        text, n = pat.subn(rep, text)
        total += n
    return text, total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--root', default=str(ROOT / 'components' / 'compounds'),
                    help='Directory tree to walk (default: src-next/components/compounds)')
    args = ap.parse_args()

    root = Path(args.root)
    changed = 0
    edits = 0
    for fp in root.rglob('*.tsx'):
        original = fp.read_text(encoding='utf-8')
        modified, n = transform(original)
        if n == 0:
            continue
        edits += n
        changed += 1
        rel = fp.relative_to(ROOT.parent)
        print(f'  {rel}: {n} edit(s)')
        if not args.dry_run:
            fp.write_text(modified, encoding='utf-8')

    print(f'\n{"DRY: " if args.dry_run else ""}{changed} files, {edits} edits')
    return 0


if __name__ == '__main__':
    sys.exit(main())
