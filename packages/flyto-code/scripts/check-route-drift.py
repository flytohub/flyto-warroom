#!/usr/bin/env python3
"""
check-route-drift.py - Detect API contract drift between frontend client and backend router.

Compares HTTP endpoints called from `flyto-code/src-next/` against routes
registered in `flyto-engine/api/*.go`. Catches the class of bug
where the backend retires a route and the frontend keeps calling the
dead URL for days (VA report 5-day 404 incident 2026-05-29; reports/generate
404 same day — both flagged in handoff Review Notes).

Two failure modes:
  - frontend-missing: frontend calls a route the backend doesn't register.
                      ALMOST always a real bug — the page is 404'ing.
  - backend-unused:   backend registers a route the frontend never calls.
                      Often legitimate (uptime probes, webhooks, sibling apps),
                      so this side is opt-in via --report-unused. Allowlist
                      it once with an owner + reason.

Path normalisation: both sides collapse template segments to `{*}` before
matching. Frontend ${orgId} / ${repoId} -> {*}; backend {id} / {repoID} -> {*}.
Query strings are stripped. Methods must match exactly (GET / POST / ...).

Usage:
    python3 scripts/check-route-drift.py [options]

Options:
    --engine-path PATH        Path to flyto-engine repo (default: ../flyto-engine).
                              If the path is missing or api/*.go can't be read,
                              the script exits 0 with a "skipped" notice — lets
                              CI run before the engine repo is checked out.
    --allowlist PATH          Path to allowlist file (default: scripts/route-drift.allowlist).
    --strict                  Exit 1 on any drift after allowlist (CI mode).
                              Default exit 0 so dev iterations don't block.
    --report-unused           Also list backend-only routes (noisy first run;
                              opt-in until you've written the allowlist).
    --json                    Machine-readable JSON output (for hook scripts).

Exit codes:
    0  No drift OR running without --strict.
    1  Drift found AND --strict.
    2  Argument / I/O error.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
SRC_NEXT = PROJECT_ROOT / 'src-next'

# Methods we care about. OPTIONS / HEAD are not used by the engine today;
# adding them here later is safe — keep this list narrow so we don't pick
# up `'POST'` literals inside i18n keys or test fixtures.
HTTP_METHODS = {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}

# Files we DON'T scan on the frontend side.
SKIP_PATH_PARTS = {'__tests__', '__test__', 'node_modules', '.gen.ts'}

# Frontend call patterns we recognise:
#
#   request('GET', '/path')
#   request<Type>('POST', `/path/${orgId}`, body)
#   requestBlob('POST', `/path`, body)
#   fetch(`${BASE}/path`, { method: 'POST', ... })
#   const url = `${BASE}/path`; fetch(url, { method: 'POST', ... })
#
# The first two cover the lib/engine helper; the third covers raw fetch
# calls that bypass `request()` (e.g. reports.ts:generateReportPdf).
#
# These regexes only locate the CALL — the path is then read off via
# `extract_template_literal` which handles ${} blocks with nested quotes
# (common pattern: `/issues${query ? '?' + query : ''}`).
RX_REQUEST_NAME = re.compile(r"""\brequest(?:Blob)?\b""")
RX_FETCH_CALL = re.compile(r"""\bfetch\(\s*""")
RX_FETCH_METHOD = re.compile(r"""method\s*:\s*['"](?P<method>[A-Z]+)['"]""")
RX_API_LITERAL_ASSIGN = re.compile(
    r"""\b(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*=\s*(?=['"`])"""
)


def _skip_ws(text: str, i: int) -> int:
    while i < len(text) and text[i].isspace():
        i += 1
    return i


def _skip_angle_type_args(text: str, start: int) -> int | None:
    """Skip a TypeScript generic argument list beginning at '<'.

    Regex like `<[^>]+>` fails on real client calls such as
    `request<{ findings: Array<{ id: string }> }>(...)`. This small scanner
    balances nested angle brackets and ignores quoted string literal types.
    """
    if start >= len(text) or text[start] != '<':
        return None
    i = start + 1
    depth = 1
    quote: str | None = None
    while i < len(text):
        c = text[i]
        if quote:
            if c == '\\' and i + 1 < len(text):
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "'\"`":
            quote = c
            i += 1
            continue
        if c == '<':
            depth += 1
        elif c == '>':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return None


def parse_request_call(text: str, start: int) -> tuple[str, str, int] | None:
    """Parse request/requestBlob method + path from a call starting at start."""
    m = RX_REQUEST_NAME.match(text, start)
    if not m:
        return None
    i = _skip_ws(text, m.end())
    if i < len(text) and text[i] == '<':
        skipped = _skip_angle_type_args(text, i)
        if skipped is None:
            return None
        i = _skip_ws(text, skipped)
    if i >= len(text) or text[i] != '(':
        return None
    i = _skip_ws(text, i + 1)
    if i >= len(text) or text[i] not in "'\"":
        return None
    method, i = extract_template_literal(text, i)
    if method not in HTTP_METHODS:
        return None
    i = _skip_ws(text, i)
    if i >= len(text) or text[i] != ',':
        return None
    i = _skip_ws(text, i + 1)
    if i >= len(text) or text[i] not in "'\"`":
        return None
    raw, after = extract_template_literal(text, i)
    return method, raw, after


def extract_template_literal(text: str, start: int) -> tuple[str, int]:
    """Given text where text[start] is ', ", or `, walk forward and
    return (literal_content_with_template_expressions_preserved,
    end_index_after_closing_quote).

    For backtick literals, ${...} blocks are kept verbatim in the output
    (with the leading `$` retained) so the caller's normalise() can
    collapse them to {*}. Nested quotes inside ${...} (e.g.
    `${query ? '?' + query : ''}`) are skipped over without ending
    the outer template.
    """
    quote = text[start]
    i = start + 1
    out: list[str] = []
    n = len(text)
    while i < n:
        c = text[i]
        if c == '\\' and i + 1 < n:
            out.append(text[i:i + 2])
            i += 2
            continue
        if c == quote:
            return ''.join(out), i + 1
        # Backtick literal: ${...} expression starts.
        if quote == '`' and c == '$' and i + 1 < n and text[i + 1] == '{':
            out.append('${')
            j = i + 2
            depth = 1
            while j < n and depth > 0:
                cc = text[j]
                if cc == '{':
                    depth += 1
                    out.append(cc)
                    j += 1
                elif cc == '}':
                    depth -= 1
                    out.append(cc)
                    j += 1
                elif cc in "'\"":
                    # Skip a quoted string within the expression. Don't
                    # let its closing-quote-of-the-outer-template
                    # interpretation trip up the outer walker.
                    sq = cc
                    out.append(cc)
                    j += 1
                    while j < n:
                        if text[j] == '\\' and j + 1 < n:
                            out.append(text[j:j + 2])
                            j += 2
                        elif text[j] == sq:
                            out.append(sq)
                            j += 1
                            break
                        else:
                            out.append(text[j])
                            j += 1
                else:
                    out.append(cc)
                    j += 1
            i = j
            continue
        out.append(c)
        i += 1
    return ''.join(out), n

# Backend route pattern:
#   mux.HandleFunc("POST /api/v1/...", post(srv.handleX))
#   mux.HandleFunc("GET /health", srv.handleHealth)
RX_BACKEND = re.compile(
    r"""mux\.HandleFunc\(\s*"(?P<method>GET|POST|PUT|PATCH|DELETE)\s+(?P<path>[^"]+)"""
)


def normalise(path: str) -> str:
    """Strip query string and collapse template segments to `{*}` so a
    frontend `/orgs/${orgId}/scans/${scanId}` matches a backend
    `/orgs/{id}/scans/{scanID}`.

    Also drops any trailing ${...} expression that the source uses for
    optional-query-string concatenation (recognised by '?' or '&'
    appearing inside the expression body, e.g.
    `${query ? '?' + query : ''}`). Those are NOT path segments and
    treating them as one creates false drift.
    """
    # 1. Drop trailing query-string padders. A ${...} is recognised
    #    as query-string concatenation (NOT a path segment) when:
    #      (a) the expression body contains a literal '?' or '&'
    #          — e.g. `${query ? '?' + query : ''}` is obviously
    #            query padding, OR
    #      (b) the character immediately before `${` is NOT '/' AND
    #          the expression is the last template in the path
    #          — path-segment templates always come right after a '/'
    #            (e.g. `/scans/${scanId}`), whereas query-suffix
    #            templates concatenate onto the end of a segment
    #            (e.g. `/issues${qs}`). The trailing `${qs}` pattern
    #            is the most common cause of noise; the variable's
    #            runtime value carries the '?' even though the
    #            source doesn't.
    i = path.find('${')
    while i != -1:
        depth, j = 1, i + 2
        while j < len(path) and depth > 0:
            if path[j] == '{':
                depth += 1
            elif path[j] == '}':
                depth -= 1
            j += 1
        body = path[i + 2:j - 1]
        prev_char = path[i - 1] if i > 0 else ''
        has_query_marker = '?' in body or '&' in body
        is_concat_suffix = prev_char != '/' and prev_char != ''
        if has_query_marker or is_concat_suffix:
            path = path[:i]
            break
        i = path.find('${', j)

    # 2. Strip literal query string.
    path = path.split('?', 1)[0].rstrip('/')
    if path == '':
        path = '/'
    # 3. Frontend ${...} -> {*}; backend {...} -> {*}.
    path = re.sub(r'\$\{[^}]+\}', '{*}', path)
    path = re.sub(r'\{[^}]+\}', '{*}', path)
    return path


def _record(hits: dict[tuple[str, str], list[str]], method: str, raw: str,
            rel: str, line: int) -> None:
    """Normalise + filter a single call. Drops dynamic-base paths that
    don't start with `/api/` after normalisation — those use a
    runtime-resolved `basePath` and can't be drift-checked statically."""
    if not raw:
        return
    norm = normalise(raw)
    # Only flyto-engine routes belong in this check. External APIs can also
    # look like `/api/v4/...` after stripping their dynamic host (GitLab), but
    # they are not registered in flyto-engine and would be false drift.
    if not (norm.startswith('/api/v1/') or norm.startswith('/scim/')):
        return
    hits[(method, norm)].append(f'{rel}:{line}')


def strip_template_base_prefix(raw: str) -> str | None:
    """Drop a leading template expression when it is only a base URL.

    Raw fetchers often call `${env.engineUrl}/api/...` instead of the shared
    request() helper. The route shape after the dynamic prefix is still fully
    statically checkable; only skip when the suffix is not an engine route.
    """
    if not raw.startswith('${'):
        return raw

    depth, i = 1, 2
    while i < len(raw) and depth > 0:
        if raw[i] == '{':
            depth += 1
        elif raw[i] == '}':
            depth -= 1
        i += 1
    if depth != 0:
        return None

    suffix = raw[i:]
    if suffix.startswith('/api/') or suffix.startswith('/scim/'):
        return suffix
    return None


def scan_api_literal_assignments(text: str) -> dict[str, list[tuple[int, str]]]:
    """Find local variables assigned to statically checkable engine URLs.

    Multipart uploads sometimes build a URL first and then call fetch(url, ...).
    Treating those as invisible creates false "backend-only" drift. Keep all
    assignments and resolve fetch(identifier) to the nearest preceding one.
    """
    assignments: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for m in RX_API_LITERAL_ASSIGN.finditer(text):
        quote_pos = _skip_ws(text, m.end())
        if quote_pos >= len(text) or text[quote_pos] not in "'\"`":
            continue
        raw, _ = extract_template_literal(text, quote_pos)
        stripped = strip_template_base_prefix(raw)
        if stripped is None:
            continue
        norm = normalise(stripped)
        if not (norm.startswith('/api/v1/') or norm.startswith('/scim/')):
            continue
        assignments[m.group('name')].append((m.start(), stripped))
    return assignments


def resolve_identifier_assignment(assignments: dict[str, list[tuple[int, str]]],
                                  name: str,
                                  before: int) -> str | None:
    choices = assignments.get(name)
    if not choices:
        return None
    for pos, raw in reversed(choices):
        if pos < before:
            return raw
    return None


def scan_frontend(root: Path) -> dict[tuple[str, str], list[str]]:
    """Return {(method, normalised_path): [callsite, ...]} found under root."""
    hits: dict[tuple[str, str], list[str]] = defaultdict(list)
    for f in root.rglob('*'):
        if f.suffix not in {'.ts', '.tsx'}:
            continue
        if any(part in f.as_posix() for part in SKIP_PATH_PARTS):
            continue
        if f.name.endswith('.test.ts') or f.name.endswith('.test.tsx'):
            continue
        try:
            text = f.read_text(encoding='utf-8')
        except OSError:
            continue

        rel = f.relative_to(PROJECT_ROOT).as_posix()
        api_assignments = scan_api_literal_assignments(text)

        # request() / requestBlob() — parse instead of using a single regex
        # because TypeScript generic args may contain nested `>` characters.
        for m in RX_REQUEST_NAME.finditer(text):
            parsed = parse_request_call(text, m.start())
            if not parsed:
                continue
            method, raw, _ = parsed
            line = text[: m.start()].count('\n') + 1
            _record(hits, method, raw, rel, line)

        # fetch(`...`, { method: 'X', ... }) or fetch(urlVar, { ... }).
        # Look ahead within the call for method:'X'. Default GET.
        for m in RX_FETCH_CALL.finditer(text):
            arg_start = _skip_ws(text, m.end())
            if arg_start >= len(text):
                continue
            after = arg_start
            if text[arg_start] in "'\"`":
                raw, after = extract_template_literal(text, arg_start)
                # Strip leading ${BASE} / ${env.engineUrl} / ${basePath} when
                # the remaining suffix is clearly a statically checkable route.
                stripped = strip_template_base_prefix(raw)
                if stripped is None:
                    continue
                raw = stripped
            else:
                ident = re.match(r"""[A-Za-z_$][\w$]*""", text[arg_start:])
                if not ident:
                    continue
                name = ident.group(0)
                after = arg_start + len(name)
                raw = resolve_identifier_assignment(api_assignments, name, m.start())
                if raw is None:
                    continue
            # Look ahead for method: 'X' within the same call expression
            # (cap window at 600 chars to avoid runaway).
            window = text[after:after + 600]
            mm = RX_FETCH_METHOD.search(window)
            method = mm.group('method') if mm else 'GET'
            if method not in HTTP_METHODS:
                continue
            line = text[: m.start()].count('\n') + 1
            _record(hits, method, raw, rel, line)

    return hits


def scan_backend(api_dir: Path) -> dict[tuple[str, str], list[str]]:
    """Return {(method, normalised_path): [callsite, ...]}."""
    hits: dict[tuple[str, str], list[str]] = defaultdict(list)
    for f in sorted(api_dir.glob('*.go')):
        if f.name.endswith('_test.go'):
            continue
        try:
            text = f.read_text(encoding='utf-8')
        except OSError as exc:
            raise SystemExit(f'cannot read backend route file {f}: {exc}') from exc
        for m in RX_BACKEND.finditer(text):
            key = (m.group('method'), normalise(m.group('path')))
            line = text[: m.start()].count('\n') + 1
            hits[key].append(f'flyto-engine/api/{f.name}:{line}')
    return hits


def load_allowlist(path: Path) -> tuple[set[tuple[str, str]], set[tuple[str, str]]]:
    """Read allowlist file. Returns (frontend_only, backend_only) sets of
    (method, normalised_path). Line format:
        frontend-only METHOD /api/path
        backend-only  METHOD /api/path
    Lines starting with '#' or blank are ignored.
    """
    frontend_only: set[tuple[str, str]] = set()
    backend_only: set[tuple[str, str]] = set()
    if not path.exists():
        return frontend_only, backend_only
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(None, 2)
        if len(parts) < 3:
            print(f'WARN: malformed allowlist line: {raw!r}', file=sys.stderr)
            continue
        kind, method, p = parts[0], parts[1].upper(), parts[2]
        if method not in HTTP_METHODS:
            print(f'WARN: unknown method in allowlist: {raw!r}', file=sys.stderr)
            continue
        key = (method, normalise(p))
        if kind == 'frontend-only':
            frontend_only.add(key)
        elif kind == 'backend-only':
            backend_only.add(key)
        else:
            print(f'WARN: unknown allowlist kind {kind!r}: {raw!r}', file=sys.stderr)
    return frontend_only, backend_only


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n', 1)[0])
    ap.add_argument('--engine-path', default='../flyto-engine', type=Path)
    ap.add_argument('--allowlist', default=SCRIPT_DIR / 'route-drift.allowlist', type=Path)
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--report-unused', action='store_true')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    api_dir = args.engine_path / 'api'
    if not api_dir.exists():
        msg = (f'check-route-drift: skipping — backend api dir not found at {api_dir}. '
               f'Pass --engine-path or check out flyto-engine next to flyto-code.')
        if args.json:
            print(json.dumps({'skipped': True, 'reason': str(api_dir)}))
        else:
            print(msg)
        return 0

    if not SRC_NEXT.exists():
        print(f'ERROR: src-next not found at {SRC_NEXT}', file=sys.stderr)
        return 2

    frontend = scan_frontend(SRC_NEXT)
    backend = scan_backend(api_dir)
    allow_fe, allow_be = load_allowlist(args.allowlist)

    fe_keys = set(frontend)
    be_keys = set(backend)

    frontend_missing = sorted(fe_keys - be_keys - allow_fe)
    backend_unused = sorted(be_keys - fe_keys - allow_be)

    drift = bool(frontend_missing) or (args.report_unused and bool(backend_unused))

    if args.json:
        print(json.dumps({
            'frontend_missing': [
                {'method': m, 'path': p, 'callsites': frontend[(m, p)]}
                for m, p in frontend_missing
            ],
            'backend_unused': [
                {'method': m, 'path': p, 'callsites': backend[(m, p)]}
                for m, p in backend_unused
            ] if args.report_unused else [],
            'allowlist_size': {
                'frontend_only': len(allow_fe),
                'backend_only': len(allow_be),
            },
            'totals': {
                'frontend_calls': len(fe_keys),
                'backend_routes': len(be_keys),
            },
        }, indent=2))
    else:
        print(f'frontend calls: {len(fe_keys)}  backend routes: {len(be_keys)}  '
              f'allowlist: {len(allow_fe)}fe + {len(allow_be)}be')
        if frontend_missing:
            print('\n=== frontend -> MISSING backend route (likely 404 in prod) ===')
            for m, p in frontend_missing:
                print(f'  {m:6} {p}')
                for cs in frontend[(m, p)]:
                    print(f'         at {cs}')
        else:
            print('\n=== frontend -> MISSING backend route: none ===')
        if args.report_unused:
            if backend_unused:
                print('\n=== backend route -> not called from frontend ===')
                for m, p in backend_unused:
                    print(f'  {m:6} {p}')
                    for cs in backend[(m, p)]:
                        print(f'         at {cs}')
            else:
                print('\n=== backend route -> not called from frontend: none ===')

    return 1 if (args.strict and drift) else 0


if __name__ == '__main__':
    sys.exit(main())
