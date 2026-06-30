#!/usr/bin/env python3
"""
audit_v3_thorough.py — combines multiple detection passes.

Passes (each yields candidate (line, kind, text)):
  P1 single-line JSX child:        >English Text<
  P2 multi-line JSX child:         >\n  English Text  \n<
  P3 JSX child with interpolation: >...{x} English...<  AND  >English {x}...<
  P4 attr quoted:                  prop="English"
  P5 attr single quoted:           prop='English'
  P6 attr template literal:        prop={`English ${x}`}
  P7 obj-literal text field:       {label/title/text/...: 'English'}
  P8 ternary string:               cond ? 'English' : ...
  P9 conditional render:           cond && 'English'
  P10 array of strings:            ['English', 'Another']
  P11 toast/snackbar/alert calls:  enqueueSnackbar('English')

Each pass applies the same filters: tOr-wrap, comments, technical
identifier, URL/path/CSS.

Run:
  python3 scripts/audit_v3_thorough.py            # namespace summary
  python3 scripts/audit_v3_thorough.py --top 30
  python3 scripts/audit_v3_thorough.py --full     # full per-file
  python3 scripts/audit_v3_thorough.py path/file.tsx
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

PROP_BLACKLIST = {
    'className', 'fill', 'stroke', 'd', 'href', 'src', 'rel', 'target',
    'data-test', 'data-testid', 'data-analytics', 'data-cy',
    'role', 'type', 'variant', 'color', 'size', 'severity', 'orientation',
    'transform', 'viewBox', 'xmlns', 'autoComplete', 'autoCorrect',
    'spellCheck', 'inputMode', 'method', 'mode', 'enctype', 'wrap',
    'aria-hidden', 'aria-expanded', 'aria-controls', 'aria-current',
    'origin', 'allow', 'allowfullscreen',
}
PROP_WHITELIST = {  # always inspect these props
    'label', 'title', 'placeholder', 'aria-label', 'aria-description',
    'name', 'description', 'desc', 'tooltip', 'hint', 'message', 'summary',
    'subtitle', 'heading', 'helperText', 'helpertext', 'header',
    'primaryText', 'secondaryText', 'children',
}
TECHNICAL = {
    'true','false','undefined','null','auto','none','inherit','small','medium',
    'large','fullWidth','standard','outlined','contained','text','default',
    'primary','secondary','success','warning','error','info',
    'POST','GET','PUT','PATCH','DELETE','application/json','text/plain',
}
TOAST_FUNCS = ('enqueueSnackbar', 'setLiveMsg', 'alert', 'setError', 'setStatus', 'toast')
TEXT_FIELDS = ('label','title','name','description','desc','tooltip','hint',
               'message','summary','subtitle','heading','text','primary','caption',
               'placeholder','helpertext','helperText','header','prompt')

URL_RX = re.compile(r'^(https?://|/|\.\./?|\./|file:|data:|mailto:|tel:|sk-|pk-)')
NON_UI_RX = re.compile(r'^([a-z_][a-z0-9_]*$|[a-z][a-zA-Z0-9]+$|\d|--|kebab|camelCase)')
SINGLE_CAMEL = re.compile(r'^[A-Z][a-z]+(?:[A-Z][a-z]+)*$')

def is_ui_text(s: str) -> bool:
    s = s.strip()
    if len(s) < 4: return False
    if s in TECHNICAL: return False
    if '&&' in s or s.endswith('('): return False
    if URL_RX.match(s): return False
    if NON_UI_RX.match(s): return False
    # Single CamelCase word ≤ 8 chars is usually an identifier
    if SINGLE_CAMEL.match(s) and len(s) <= 8: return False
    # Must contain space OR punctuation OR multiple-word indicator
    if ' ' not in s and not any(c in s for c in "'!?.,:&-"):
        # Allow 2+ word CamelCase
        if not re.search(r'[a-z][A-Z]', s): return False
    return True

def is_in_tor_context(text: str, pos: int) -> bool:
    """Look back up to 200 chars for tOr( with unclosed paren."""
    window = text[max(0, pos - 200):pos]
    last = window.rfind('tOr(')
    if last < 0: return False
    after = window[last + 4:]
    depth = 1
    in_str = None
    for ch in after:
        if in_str:
            if ch == in_str and (len(after) > 0): in_str = None
            continue
        if ch in ('"', "'", '`'): in_str = ch; continue
        if ch == '(': depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0: return False
    return depth > 0

def is_in_comment_block(text: str, pos: int) -> bool:
    """Inside /* ... */ block?"""
    open_idx = text.rfind('/*', 0, pos)
    if open_idx < 0: return False
    close_idx = text.find('*/', open_idx)
    return close_idx > pos

def is_in_line_comment(line: str, pos_in_line: int) -> bool:
    head = line[:pos_in_line]
    if '//' in head:
        slash = head.rfind('//')
        quotes = head[:slash].count("'") + head[:slash].count('"') + head[:slash].count('`')
        if quotes % 2 == 0: return True
    return False

def line_of_pos(text: str, pos: int) -> int:
    return text[:pos].count('\n') + 1

def line_at(text: str, pos: int) -> str:
    """Return line text for diagnostics."""
    start = text.rfind('\n', 0, pos) + 1
    end = text.find('\n', pos)
    if end < 0: end = len(text)
    return text[start:end]

# ────────────────────────────────────────────────────────────────
# Detection passes
# ────────────────────────────────────────────────────────────────

# P1 + P2: JSX child (single OR multi-line)
JSX_CHILD = re.compile(r'>(\s*[A-Z][^<>{}\n]*?)\s*(?:<|\n\s*<)', re.DOTALL)
# Simpler multi-line: `>\n   English   \n<`
JSX_CHILD_MULTI = re.compile(r'>\s*\n\s*([A-Z][a-zA-Z][^<>\n]{3,200})\s*\n\s*<', re.DOTALL)

# P3: JSX child with leading interpolation: `>{x} English`
JSX_TEMPLATE_HEAD = re.compile(r'>[^<>]*?\}\s*([A-Z][a-zA-Z][^<>{}\n]{3,100}?)\s*<')

# P4 P5: attribute quoted - we'll iterate all `prop="..."` and `prop='...'`
ATTR_DQ = re.compile(r'\b([a-zA-Z][a-zA-Z-]*)\s*=\s*"([A-Z][a-zA-Z][^"\n]{3,150})"')
ATTR_SQ = re.compile(r"\b([a-zA-Z][a-zA-Z-]*)\s*=\s*'([A-Z][a-zA-Z][^'\n]{3,150})'")

# P6: attribute with template literal head: prop={`English ${...}`}
ATTR_TPL = re.compile(r"\b([a-zA-Z][a-zA-Z-]*)\s*=\s*\{\s*`([A-Z][a-zA-Z][^`$]{3,150})")

# P7: obj field
OBJ_FIELD = re.compile(r"\b(" + '|'.join(TEXT_FIELDS) + r")\s*:\s*['\"]([A-Z][a-zA-Z][^'\"\n]{3,150})['\"]")

# P8: ternary string
TERNARY = re.compile(r"\?\s*['\"]([A-Z][a-zA-Z][^'\"\n]{3,150})['\"]")

# P9: cond && 'English' inside JSX
JSX_COND = re.compile(r"\{\s*[a-zA-Z_$][a-zA-Z0-9_$.\[\]]*\s*&&\s*['\"]([A-Z][a-zA-Z][^'\"\n]{3,150})['\"]")

# P11: toast / alert calls
TOAST_CALL = re.compile(r"\b(" + '|'.join(TOAST_FUNCS) + r")\s*\(\s*['\"]([A-Z][a-zA-Z][^'\"\n]{3,200})['\"]")

PASSES = [
    ('jsx_child',       JSX_CHILD,         1),
    ('jsx_multi',       JSX_CHILD_MULTI,   1),
    ('jsx_tpl_head',    JSX_TEMPLATE_HEAD, 1),
    ('attr_dq',         ATTR_DQ,           2),  # group(2) = value, group(1) = attr name
    ('attr_sq',         ATTR_SQ,           2),
    ('attr_tpl',        ATTR_TPL,          2),
    ('obj_field',       OBJ_FIELD,         2),
    ('ternary',         TERNARY,           1),
    ('jsx_cond',        JSX_COND,          1),
    ('toast',           TOAST_CALL,        2),
]

def audit_file(path: Path) -> list[tuple[int, str, str]]:
    findings: list[tuple[int, str, str]] = []
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        return findings
    seen: set[tuple[int, str]] = set()
    for kind, pat, group_idx in PASSES:
        for m in pat.finditer(text):
            if (m.lastindex or 0) < group_idx: continue
            val = m.group(group_idx)
            if not val: continue
            # Attr filters
            if kind in ('attr_dq', 'attr_sq', 'attr_tpl'):
                attr = m.group(1)
                if attr in PROP_BLACKLIST: continue
                if attr not in PROP_WHITELIST and not attr.startswith('aria-'):
                    # Only inspect whitelisted attrs to reduce noise
                    continue
            if not is_ui_text(val): continue
            pos = m.start()
            if is_in_tor_context(text, pos): continue
            if is_in_comment_block(text, pos): continue
            ln_no = line_of_pos(text, pos)
            line = line_at(text, pos)
            if kind == 'obj_field' and re.search(r'\b(labelKey|titleKey|nameKey|descKey|hintKey|valueKey|i18nKey)\s*:', line):
                continue
            ln_pos = pos - (text.rfind('\n', 0, pos) + 1)
            if is_in_line_comment(line, ln_pos): continue
            key = (ln_no, val.strip())
            if key in seen: continue
            seen.add(key)
            findings.append((ln_no, kind, val.strip()))
    return sorted(findings)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('path', nargs='?')
    ap.add_argument('--by-file', action='store_true')
    ap.add_argument('--top', type=int, default=0)
    ap.add_argument('--full', action='store_true')
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
        if out: by_file[f] = out
    total = sum(len(v) for v in by_file.values())
    print(f'audit_v3: {total} candidates in {len(by_file)} files (of {len(files)} scanned)')
    print()

    if args.path and Path(args.path).is_file():
        for ln, kind, val in by_file.get(Path(args.path), []):
            print(f'  L{ln:4d} [{kind:11s}] {val!r}')
        return 0

    if args.by_file or args.top:
        ranked = sorted(by_file.items(), key=lambda kv: -len(kv[1]))
        if args.top: ranked = ranked[:args.top]
        for f, finds in ranked:
            print(f'{len(finds):4d}  {f.relative_to(REPO_ROOT)}')
        return 0

    if args.full:
        for f, finds in sorted(by_file.items(), key=lambda kv: -len(kv[1])):
            print(f'--- {f.relative_to(REPO_ROOT)} ({len(finds)}) ---')
            for ln, kind, val in finds:
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

if __name__ == '__main__':
    sys.exit(main())
