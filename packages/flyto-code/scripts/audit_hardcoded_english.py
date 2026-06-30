#!/usr/bin/env python3
"""
audit_hardcoded_english.py — find user-facing English strings in
src-next/components that are NOT routed through tOr().

Targets common JSX patterns:
  <Typography>Hardcoded text</Typography>
  <Chip label="Hardcoded" />
  <Button>Hardcoded</Button>
  <MenuItem value="x">Hardcoded</MenuItem>
  <Tab label="Hardcoded" />
  Tooltip title="Hardcoded"
  placeholder="Hardcoded"

Excludes:
  - Strings already wrapped in tOr(...)
  - Comments
  - Pure technical strings (CSS values, paths, single words like 'ok', 'on')
  - Template expressions / interpolations
  - Tests
  - @fuse / @auth / @i18n template dirs

Usage:
  python3 scripts/audit_hardcoded_english.py            # full audit
  python3 scripts/audit_hardcoded_english.py path/to/file.tsx
  python3 scripts/audit_hardcoded_english.py --by-file  # group by file
  python3 scripts/audit_hardcoded_english.py --top N
"""

import re
import sys
import argparse
from pathlib import Path
from collections import defaultdict

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / 'src-next'
SKIP_DIRS = {'__tests__', '@fuse', '@auth', '@i18n', '@mock-utils', 'node_modules'}

# Patterns that indicate user-visible English text
PATTERNS = [
    # >English Text<  inside JSX (excluding tOr-wrapped)
    ('jsx_child', re.compile(r'>([A-Z][a-zA-Z][a-zA-Z0-9 ,\'\-/().·]{4,80})<')),
    # label="English Text" / placeholder="…" / title="…"
    ('attr', re.compile(r'(label|placeholder|title|aria-label|name|description)\s*=\s*"([A-Z][a-zA-Z][a-zA-Z0-9 ,\'\-/().·!?:]{4,80})"')),
    # MenuItem value="x">English  (the value tag is fine; the visible text after > matters)
    # already covered by jsx_child
    # Chip label='English' single-quoted
    ('attr_single', re.compile(r"(label|placeholder|title)\s*=\s*'([A-Z][a-zA-Z][a-zA-Z0-9 ,'\-/().·!?:]{4,80})'")),
    # const labels in object literals: { label: 'English' }
    ('obj_label', re.compile(r"\blabel:\s*['\"]([A-Z][a-zA-Z][a-zA-Z0-9 ,\'\-/().·!?:]{4,80})['\"]")),
    # subtitle: 'English' / title: 'English' / message: 'English'
    ('obj_text', re.compile(r"\b(subtitle|message|description|hint|tooltip):\s*['\"]([A-Z][a-zA-Z][a-zA-Z0-9 ,\'\-/().·!?:]{4,80})['\"]")),
]

# Strings to ignore (technical, CSS, abbreviations)
IGNORE_VALUES = {
    'true', 'false', 'undefined', 'null',
    'small', 'medium', 'large', 'fullWidth', 'standard', 'outlined', 'contained',
    'primary', 'secondary', 'inherit', 'default',
    'POST', 'GET', 'PUT', 'PATCH', 'DELETE',
    'application/json', 'text/plain',
    'ltr', 'rtl', 'auto', 'none', 'inherit',
}

# Patterns of strings that are intentional code identifiers, not UI text
NON_UI_REGEX = re.compile(r'^(https?://|/api/|className|stroke|fill|key |id |data-)|^[a-z_]+$|^\d')

def is_ui_text(s: str) -> bool:
    """Filter to plausible user-facing text."""
    s = s.strip()
    if len(s) < 5:
        return False
    if s in IGNORE_VALUES:
        return False
    if NON_UI_REGEX.match(s):
        return False
    # Needs a space or end with a word — pure CamelCase identifiers are mostly props
    if ' ' not in s and not re.search(r'[A-Z][a-z]+', s):
        return False
    # Mixed-case multi-word
    return True

def is_in_tor_wrap(line: str, match_start: int) -> bool:
    """Heuristic: was this match inside a tOr(...) call?"""
    # Look back up to 80 chars for "tOr(" without intervening )
    window = line[max(0, match_start - 80):match_start]
    last_tor = window.rfind('tOr(')
    if last_tor < 0:
        return False
    # Count parens since tOr( to see if still inside
    after = window[last_tor + 4:]
    depth = 1
    for ch in after:
        if ch == '(': depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0: return False
    return depth > 0

def is_in_comment(line: str, match_start: int) -> bool:
    """Match inside // comment? Look back to start of line."""
    head = line[:match_start]
    return '//' in head and '"' not in head[head.rfind('//'):]

def audit_file(path: Path) -> list[tuple[int, str, str]]:
    """Return list of (line_no, type, value)."""
    findings = []
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        return findings
    for line_no, line in enumerate(text.splitlines(), 1):
        # Skip comment lines
        if re.match(r'\s*//', line) or re.match(r'\s*\*', line):
            continue
        for kind, pat in PATTERNS:
            for m in pat.finditer(line):
                if kind in ('attr', 'attr_single', 'obj_text'):
                    val = m.group(2)
                else:
                    val = m.group(1)
                if not is_ui_text(val):
                    continue
                if is_in_tor_wrap(line, m.start()):
                    continue
                if is_in_comment(line, m.start()):
                    continue
                findings.append((line_no, kind, val))
    return findings

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('path', nargs='?', help='Optional path to audit (default: full src-next)')
    ap.add_argument('--by-file', action='store_true', help='Show per-file counts')
    ap.add_argument('--top', type=int, default=0, help='Show only top-N files by count')
    args = ap.parse_args()

    if args.path:
        p = Path(args.path)
        files = [p] if p.is_file() else list(p.rglob('*.tsx'))
    else:
        files = list(SRC.rglob('*.tsx'))

    files = [f for f in files if not any(d in str(f) for d in SKIP_DIRS)]

    by_file: dict[Path, list[tuple[int, str, str]]] = {}
    for f in files:
        findings = audit_file(f)
        if findings:
            by_file[f] = findings

    total = sum(len(v) for v in by_file.values())
    print(f'audit: {total} candidates in {len(by_file)} files')
    print()

    if args.by_file or args.top:
        counts = sorted(by_file.items(), key=lambda kv: -len(kv[1]))
        if args.top:
            counts = counts[:args.top]
        for f, finds in counts:
            rel = f.relative_to(REPO_ROOT)
            print(f'{len(finds):4d}  {rel}')
    elif args.path and Path(args.path).is_file():
        for ln, kind, val in by_file.get(Path(args.path), []):
            print(f'  L{ln:4d} [{kind:12s}] {val!r}')
    else:
        # Summary by namespace folder
        by_ns = defaultdict(int)
        for f, finds in by_file.items():
            try:
                parts = f.relative_to(SRC).parts
                ns = parts[1] if len(parts) > 1 else parts[0]
                by_ns[ns] += len(finds)
            except Exception: pass
        for ns, n in sorted(by_ns.items(), key=lambda kv: -kv[1]):
            print(f'  {ns:24s} {n}')

if __name__ == '__main__':
    main()
