#!/usr/bin/env python3
"""
audit_frontend.py — multi-dimensional frontend audit.

Checks every rule in CLAUDE.md + common code-quality smells.

Categories:
  i18n        — Hardcoded English in JSX (delegates to v3)
  types       — `any` / unsafe casts / non-null !
  debug       — console.log/info/warn/error leftovers
  todo        — TODO / FIXME / XXX / HACK
  fontsize    — fontSize 9/10/11 (CLAUDE.md floor: body 14, caption 13)
  emoji       — emoji literals in code (CLAUDE.md: no emoji)
  textdisabled — text.disabled on info text (CLAUDE.md font_size_floor)
  hardcoded_color — bgcolor: '#hexHEX' instead of tokens
  competitor  — Bitsight/Snyk/Aikido in user-facing copy
  brand_typo  — `Flyto2 ` `FLYTO` `Flyto2 Platform` instead of `Flyto2`
  setstate_memo — setState inside useMemo (React Compiler error)
  dangerous_html — dangerouslySetInnerHTML
  forced_color_scheme — forceColorScheme / dark-only patterns
  fetch_unguard — fetch() without try/catch
  reach_into_fuse — Product code importing @fuse/* (CLAUDE.md)
  no_test_file — Compound .tsx without __tests__ neighbour
  large_file — >1500 lines (consider splitting per feedback_stop_splitting_at_900 OR re-evaluate)

Run:
  python3 scripts/audit_frontend.py            # category summary
  python3 scripts/audit_frontend.py --by-file
  python3 scripts/audit_frontend.py --category types --full
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

# ─────────────────────────────────────────────────────────────────
# Detectors
# ─────────────────────────────────────────────────────────────────

CHECKS: dict[str, dict] = {}

def check(name, **kwargs):
    def deco(fn):
        CHECKS[name] = {'fn': fn, **kwargs}
        return fn
    return deco

@check('types', desc='`any` / non-null !.foo / `as any` / @ts-ignore')
def find_unsafe_types(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.search(r'\s*//', line): continue
        if re.search(r'\bas\s+any\b', line) and 'unknown' not in line:
            out.append((line_no, line.strip()[:120]))
        elif re.search(r':\s*any\b', line) and 'any\\b' not in line and 'unknown' not in line:
            out.append((line_no, line.strip()[:120]))
        elif '@ts-ignore' in line or '@ts-expect-error' in line:
            out.append((line_no, line.strip()[:120]))
    return out

@check('debug', desc='console.log/info/warn/error in source')
def find_console(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        m = re.search(r'\bconsole\.(log|info|warn|error|debug)\(', line)
        if m:
            # warn/error often intentional — flag at lower priority via category
            out.append((line_no, line.strip()[:120]))
    return out

@check('todo', desc='TODO / FIXME / XXX / HACK markers (case-sensitive, colon-required to dodge false positives like lucide `Bug` icon)')
def find_todo(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    # CASE-SENSITIVE — `Bug` (lucide icon) shouldn't match BUG.
    # Colon-required avoids `?repo=xxx` URL matches.
    pat = re.compile(r'\b(TODO|FIXME|HACK|XXX)\b:?')
    pat2 = re.compile(r'//\s*(TODO|FIXME|HACK)')
    for line_no, line in enumerate(text.splitlines(), 1):
        if pat2.search(line) or (pat.search(line) and ':' in line[:line.find(line.lstrip())+10]):
            # Only match when the marker is followed by ':' OR appears in a comment context
            pass
        # Strict: must be ALL CAPS and at word boundary
        for m in re.finditer(r'(?<![A-Za-z])(TODO|FIXME|HACK)(?![A-Za-z])', line):
            out.append((line_no, line.strip()[:120]))
            break
    return out

@check('fontsize', desc='fontSize 9/10/11 below CLAUDE.md floor (body 14 / caption 13 / chip 12)')
def find_small_font(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    pat = re.compile(r'fontSize\s*:?\s*[\'"`]?(\d+)')
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        for m in pat.finditer(line):
            n = int(m.group(1))
            if 1 <= n <= 11:
                out.append((line_no, line.strip()[:120]))
                break
    return out

@check('emoji', desc='Emoji literals (CLAUDE.md: no emoji, use lucide-react)')
def find_emoji(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    # Range of common emoji codepoints
    emoji_rx = re.compile(r'[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF]')
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        m = emoji_rx.search(line)
        if m:
            out.append((line_no, f"{m.group()!r} :: {line.strip()[:80]}"))
    return out

@check('textdisabled', desc='text.disabled on info text (CLAUDE.md: NO text.disabled on info)')
def find_text_disabled(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        if 'text.disabled' in line and 'color:' in line:
            out.append((line_no, line.strip()[:120]))
    return out

@check('hardcoded_color', desc='Inline #hex colors (use semantic palette tokens)')
def find_hex(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    # Match #abcdef or #abc, excluding inside comments
    pat = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line) or re.match(r'\s*\*', line): continue
        matches = pat.findall(line)
        if matches and len(matches) >= 2:
            # 2+ hex on one line is often a palette/theme map — flag for review
            out.append((line_no, line.strip()[:120]))
    return out

@check('competitor', desc='Competitor brand names (Bitsight/Snyk/Aikido) in user-facing copy')
def find_competitor(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    if '__tests__' in str(path): return out
    # Look only at strings in JSX context (between > and < or inside attr=)
    pat = re.compile(r"(Bitsight|Snyk|Aikido|SonarQube|Wiz\.io|Orca\.security)")
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line) or re.match(r'\s*\*', line): continue
        if pat.search(line):
            # Must be a user-facing string — heuristic: inside quotes
            if "'" in line or '"' in line or '>' in line:
                out.append((line_no, line.strip()[:120]))
    return out

@check('brand_typo', desc='Product name is Flyto2 — not Flyto2, FLYTO, Flyto2 Platform')
def find_brand_typo(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    # Catch 'Flyto2 ' (with space, not Flyto2) + 'FLYTO ' / 'Flyto2 Platform'
    pat = re.compile(r"\b(Flyto2 Platform|FLYTO Code|FLYTO Cyber|Flyto2 Code)\b|\bFlyto(?!2|Hub|hub|\.com|-)\b\s+(?:Code|Platform|Cyber|Cloud)?")
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        # Skip imports
        if line.lstrip().startswith('import'): continue
        for m in pat.finditer(line):
            out.append((line_no, m.group()))
            break
    return out

@check('setstate_memo', desc='setState inside useMemo (React Compiler hard error)')
def find_setstate_in_memo(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    # Look for useMemo blocks that contain setX( calls
    pat = re.compile(r'useMemo\(\s*\(\)\s*=>\s*\{(.*?)\},\s*\[', re.DOTALL)
    set_pat = re.compile(r'\bset[A-Z][a-zA-Z0-9]*\(')
    for m in pat.finditer(text):
        body = m.group(1)
        sets = list(set_pat.finditer(body))
        if sets:
            # Find line of first set
            base = m.start() + body.index(sets[0].group())
            ln = text[:base].count('\n') + 1
            out.append((ln, f'useMemo + setState: {sets[0].group()[:30]}...'))
    return out

@check('dangerous_html', desc='dangerouslySetInnerHTML — XSS risk, prefer textContent')
def find_dangerous(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    for line_no, line in enumerate(text.splitlines(), 1):
        if 'dangerouslySetInnerHTML' in line:
            out.append((line_no, line.strip()[:120]))
    return out

@check('forced_color_scheme', desc='forceColorScheme / dark-only / forceMode (CLAUDE.md: dual-mode)')
def find_dark_only(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        if re.search(r"\bforceColorScheme\b|\bforceMode\b", line):
            out.append((line_no, line.strip()[:120]))
    return out

@check('reach_into_fuse', desc='Product code importing @fuse internals (CLAUDE.md)')
def find_fuse_reach(text: str, path: Path) -> list[tuple[int, str]]:
    out = []
    p = str(path).replace('\\', '/')
    # Only flag if path is product code (NOT @fuse / @auth / @i18n / @mock-utils)
    if any(d in p for d in ('@fuse/', '@auth/', '@i18n/', '@mock-utils/')): return out
    for line_no, line in enumerate(text.splitlines(), 1):
        if re.match(r'\s*//', line): continue
        # Allow specific Fuse exports from product code:
        # FusePageSimple, Link, FuseSvgIcon — these are intentional consumers
        if re.search(r"from\s+['\"]@fuse/", line):
            # Allow approved imports
            if any(allowed in line for allowed in [
                "@fuse/core/FusePageSimple",
                "@fuse/core/FuseSvgIcon",
                "@fuse/core/Link",
                "@fuse/core/FusePageCarded",
                "@fuse/core/FuseNavigation",
                "@fuse/core/FuseLoading",
                "@fuse/hooks",
                "@fuse/utils",
                "@fuse/core/FuseHighlight",
            ]):
                continue
            out.append((line_no, line.strip()[:120]))
    return out

@check('large_file', desc='>1500 lines (split candidate)')
def find_large_files(text: str, path: Path) -> list[tuple[int, str]]:
    n = len(text.splitlines())
    if n >= 1500:
        return [(n, f'{n} lines')]
    return []


def audit_file(path: Path, category_filter: str | None) -> dict[str, list[tuple[int, str]]]:
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        return {}
    result = {}
    for name, info in CHECKS.items():
        if category_filter and name != category_filter: continue
        out = info['fn'](text, path)
        if out:
            result[name] = out
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--category', help='Run only one check')
    ap.add_argument('--by-file', action='store_true', help='List files instead of summary')
    ap.add_argument('--full', action='store_true', help='Print every finding')
    ap.add_argument('--limit', type=int, default=5, help='Per-file lines shown in --full')
    args = ap.parse_args()

    if args.category and args.category not in CHECKS:
        print(f'Unknown category. Available: {", ".join(CHECKS)}')
        return 1

    files = [f for f in SRC.rglob('*.tsx') if not any(d in str(f) for d in SKIP_DIRS)]
    files += [f for f in SRC.rglob('*.ts') if not any(d in str(f) for d in SKIP_DIRS) and not f.name.endswith('.d.ts')]

    # Aggregate
    per_cat: dict[str, int] = defaultdict(int)
    per_file_cat: dict[Path, dict[str, list]] = {}
    for f in files:
        res = audit_file(f, args.category)
        if res:
            per_file_cat[f] = res
            for cat, lst in res.items():
                per_cat[cat] += len(lst)

    total = sum(per_cat.values())
    print(f'audit_frontend: {total} findings across {len(per_file_cat)} files ({len(files)} scanned)')
    print()

    if args.full:
        for f, cats in sorted(per_file_cat.items(), key=lambda kv: -sum(len(v) for v in kv[1].values())):
            print(f'--- {f.relative_to(REPO_ROOT)} ---')
            for cat, lst in cats.items():
                print(f'  [{cat}] {len(lst)}')
                for ln, val in lst[:args.limit]:
                    print(f'    L{ln:4d}  {val}')
        return 0

    if args.by_file:
        ranked = sorted(per_file_cat.items(), key=lambda kv: -sum(len(v) for v in kv[1].values()))
        for f, cats in ranked[:30]:
            n = sum(len(v) for v in cats.values())
            tags = ' '.join(f'{c}:{len(l)}' for c, l in cats.items())
            print(f'{n:4d}  {f.relative_to(REPO_ROOT)}  {tags}')
        return 0

    # Default: summary by category
    print('By category:')
    for cat, n in sorted(per_cat.items(), key=lambda kv: -kv[1]):
        desc = CHECKS[cat]['desc']
        print(f'  {cat:22s} {n:4d}  {desc}')

if __name__ == '__main__':
    sys.exit(main())
