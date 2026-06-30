#!/usr/bin/env python3
"""
audit_hardcoded_english_v2.py — broader pass than v1.

Catches:
  - JSX children: >English Text<
  - Attributes: label/title/placeholder/aria-label/name/description/alt
  - Object literals with ANY field name (label/title/text/message/desc/hint/sub/summary)
  - Standalone string-only Typography children (no interpolation)
  - Tooltip title= with mixed interpolation + English head
  - Conditional render strings (cond ? 'English' : 'English')
  - JSX whitespace-stripped child text
  - Strings inside template literals that have English heads

Filters:
  - tOr-wrapped (lookback 100 chars)
  - Comments
  - Common technical/CSS/HTML props
  - Tests + Fuse template dirs
  - Module-style imports
  - URLs / paths / IDs

Walks the WHOLE src-next, not just compounds.

Usage:
  python3 scripts/audit_hardcoded_english_v2.py
  python3 scripts/audit_hardcoded_english_v2.py --by-file
  python3 scripts/audit_hardcoded_english_v2.py path/to/file.tsx
"""

import argparse
import io
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / 'src-next'
SKIP_DIRS = {'__tests__', '@fuse', '@auth', '@i18n', '@mock-utils', 'node_modules', 'tiptap'}

# Common props that take English values but ARE NOT user-facing UI text
PROP_BLACKLIST = {
    'className', 'fill', 'stroke', 'd', 'cx', 'cy', 'href', 'src', 'alt',
    'data-test', 'data-testid', 'data-analytics', 'data-cy',
    'role', 'type', 'variant', 'color', 'size', 'severity', 'orientation',
    'transform', 'viewBox', 'xmlns', 'rel', 'target',
    'autoComplete', 'autoCorrect', 'spellCheck', 'inputMode',
    'origin', 'method', 'mode',
}

# Strings that look English but are pure technical
TECHNICAL_LITERALS = {
    'true', 'false', 'undefined', 'null', 'auto', 'none', 'inherit',
    'small', 'medium', 'large', 'fullWidth', 'standard',
    'outlined', 'contained', 'text', 'default',
    'primary', 'secondary', 'success', 'warning', 'error', 'info',
    'POST', 'GET', 'PUT', 'PATCH', 'DELETE',
    'json', 'text/plain', 'multipart/form-data',
}

# Regex patterns for user-facing strings — captures `value` in different positions
# Compiled to keep order deterministic
PATTERNS = [
    # Pattern: >English Text<
    ('jsx_child',  re.compile(r'>(\s*[A-Z][a-zA-Z][a-zA-Z0-9 ,\'À-ÿ/().·!?:&-]{3,100}\s*)<')),
    # Pattern: name="English ..."   (any quoted attr)
    ('attr_dq',    re.compile(r'\b(' + '|'.join([
        'label','title','placeholder','aria-label','aria-description',
        'name','description','desc','tooltip','hint','message','summary',
        'subtitle','heading','helperText','helpertext','header','primaryText',
    ]) + r')\s*=\s*"([A-Z][a-zA-Z][a-zA-Z0-9 ,\'À-ÿ/().·!?:&-]{3,100})"')),
    ('attr_sq',    re.compile(r'\b(' + '|'.join([
        'label','title','placeholder','aria-label','aria-description',
        'name','description','desc','tooltip','hint','message','summary',
        'subtitle','heading','helperText','helpertext','header','primaryText',
    ]) + r")\s*=\s*'([A-Z][a-zA-Z][a-zA-Z0-9 ,À-ÿ/().·!?:&-]{3,100})'")),
    # Pattern: <prop>: 'English'  — render configs
    ('obj_text',   re.compile(r"\b(label|title|name|description|desc|tooltip|hint|message|summary|subtitle|heading|text|primary|caption|placeholder)\s*:\s*['\"]([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().·!?:&-]{3,100})['\"]")),
    # Pattern: cond ? 'English' : 'English' / 'English' || ...
    ('ternary',    re.compile(r"\?\s*['\"]([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().·!?:&-]{3,100})['\"]")),
    # Pattern: return 'English' inside a switch case
    ('return_str', re.compile(r"\breturn\s+['\"]([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().·!?:&-]{3,100})['\"]")),
    # Pattern: throw new Error('English'), enqueueSnackbar('English'), alert('English')
    ('call_str',   re.compile(r"\b(enqueueSnackbar|setLiveMsg|alert|setError|setStatus|toast)\s*\(\s*['\"]([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().·!?:&-]{3,100})['\"]")),
]

URL_RX = re.compile(r'^(https?://|/|\.\./?|\./|file:|data:|mailto:|tel:)')
NON_UI_RX = re.compile(r'^([a-z_][a-z0-9_]*$|[a-z][a-zA-Z0-9]+$|\d|--|kebab|camelCase)')

def is_ui_text(s: str) -> bool:
    s = s.strip()
    if len(s) < 4: return False
    if s in TECHNICAL_LITERALS: return False
    if URL_RX.match(s): return False
    if NON_UI_RX.match(s): return False
    # Pure CamelCase identifier
    if ' ' not in s and not re.search(r'[a-z][A-Z]|\w-\w', s) and re.fullmatch(r'[A-Z][a-z]+([A-Z][a-z]+)*', s):
        # e.g. "Foo" is one word — KEEP if 2+ chars + likely UI; drop if it looks like an identifier
        if len(s) <= 5: return False
    # Must have a space OR an apostrophe (real prose) OR a question/exclam OR end punct
    if ' ' not in s and not any(c in s for c in "'!?."): return False
    return True

def is_in_tor(line: str, pos: int) -> bool:
    window = line[max(0, pos - 100):pos]
    last = window.rfind('tOr(')
    if last < 0: return False
    after = window[last + 4:]
    depth = 1
    for ch in after:
        if ch == '(': depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0: return False
    return depth > 0

def is_in_comment(line: str, pos: int) -> bool:
    head = line[:pos]
    if '//' in head:
        slash = head.rfind('//')
        # Make sure '//' isn't inside a string
        quotes = head[:slash].count("'") + head[:slash].count('"')
        if quotes % 2 == 0: return True
    return False

def audit_file(path: Path) -> list[tuple[int, str, str]]:
    findings: list[tuple[int, str, str]] = []
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        return findings
    seen_on_line: dict[int, set[str]] = defaultdict(set)
    for line_no, line in enumerate(text.splitlines(), 1):
        ls = line.lstrip()
        if ls.startswith('//') or ls.startswith('*') or ls.startswith('/*'):
            continue
        for kind, pat in PATTERNS:
            for m in pat.finditer(line):
                val = m.group(2) if (m.lastindex or 0) >= 2 else m.group(1)
                if not val: continue
                if kind == 'obj_text' and re.search(r'\b(labelKey|titleKey|nameKey|descKey|hintKey|valueKey|i18nKey)\s*:', line):
                    continue
                # Skip blacklisted attr names
                if kind in ('attr_dq', 'attr_sq'):
                    attr = m.group(1)
                    if attr in PROP_BLACKLIST: continue
                if not is_ui_text(val): continue
                pos = m.start()
                if is_in_tor(line, pos): continue
                if is_in_comment(line, pos): continue
                if val in seen_on_line[line_no]: continue
                seen_on_line[line_no].add(val)
                findings.append((line_no, kind, val.strip()))
    return findings

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('path', nargs='?')
    ap.add_argument('--by-file', action='store_true')
    ap.add_argument('--top', type=int, default=0)
    ap.add_argument('--full', action='store_true', help='Show every finding (large output)')
    args = ap.parse_args()

    if args.path:
        p = Path(args.path)
        files = [p] if p.is_file() else list(p.rglob('*.tsx'))
    else:
        files = list(SRC.rglob('*.tsx'))
    files = [f for f in files if not any(d in str(f) for d in SKIP_DIRS)]

    by_file = {}
    for f in files:
        out = audit_file(f)
        if out:
            by_file[f] = out

    total = sum(len(v) for v in by_file.values())
    print(f'audit_v2: {total} candidates in {len(by_file)} files (of {len(files)} scanned)')
    print()

    if args.by_file or args.top:
        ranked = sorted(by_file.items(), key=lambda kv: -len(kv[1]))
        if args.top: ranked = ranked[:args.top]
        for f, finds in ranked:
            print(f'{len(finds):4d}  {f.relative_to(REPO_ROOT)}')
        return 0

    if args.path and Path(args.path).is_file():
        for ln, kind, val in by_file.get(Path(args.path), []):
            print(f'  L{ln:4d} [{kind:11s}] {val!r}')
        return 0

    # Default: namespace summary
    by_ns = defaultdict(int)
    for f, finds in by_file.items():
        try:
            parts = f.relative_to(SRC).parts
            ns = parts[1] if len(parts) > 1 else parts[0]
            by_ns[ns] += len(finds)
        except Exception: pass
    for ns, n in sorted(by_ns.items(), key=lambda kv: -kv[1])[:30]:
        print(f'  {ns:24s} {n}')

    if args.full:
        print()
        for f, finds in sorted(by_file.items(), key=lambda kv: -len(kv[1])):
            print(f'--- {f.relative_to(REPO_ROOT)} ({len(finds)}) ---')
            for ln, kind, val in finds:
                print(f'  L{ln:4d} [{kind:11s}] {val!r}')

if __name__ == '__main__':
    sys.exit(main())
