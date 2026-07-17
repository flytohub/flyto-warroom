#!/usr/bin/env python3
"""
detect-hardcoded-strings.py - Find user-facing hardcoded English text in flyto-code

Scans TSX/TS files for strings that should be wrapped in t() or tOr().
Uses AST-like heuristics to minimize false positives.

Output: TSV report (file, line, category, confidence, text, suggestion)

Usage:
    python scripts/detect-hardcoded-strings.py [--min-confidence HIGH|MEDIUM|LOW] [--fix-preview]
"""

import argparse
import re
import sys
from pathlib import Path
from dataclasses import dataclass

PROJECT_ROOT = Path(__file__).parent.parent
SRC_DIR = PROJECT_ROOT / 'src'

# ── Confidence levels ──────────────────────────────────────
HIGH = 'HIGH'
MEDIUM = 'MEDIUM'
LOW = 'LOW'

CONFIDENCE_ORDER = {HIGH: 3, MEDIUM: 2, LOW: 1}

# ── Exempt patterns (should NEVER flag) ───────────────────
# Attributes whose string values are NOT translatable
EXEMPT_ATTRS = {
    'className', 'class', 'style', 'sx', 'css',
    'key', 'ref', 'id', 'name', 'htmlFor', 'for',
    'variant', 'size', 'color', 'radius',
    'role', 'tabIndex', 'tabindex', 'type', 'target', 'rel',
    'href', 'src', 'action', 'method',
    'data-testid', 'data-test', 'data-cy',
    'xmlns', 'viewBox', 'fill', 'stroke', 'strokeWidth',
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height',
    'transform', 'clipPath', 'gradientUnits',
    'onKeyDown', 'onClick', 'onChange', 'onSubmit', 'onFocus', 'onBlur',
    'value',  # form values are data, not labels
    'defaultValue',
    'icon',  # icon component references
    'component',
    'direction', 'align', 'justify', 'spacing', 'gap', 'wrap',
    'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing',
    'position', 'display', 'overflow', 'zIndex',
    'elevation', 'disableGutters', 'dense', 'fullWidth',
    'autoComplete', 'autoFocus', 'inputMode',
    'enterKeyHint', 'pattern', 'min', 'max', 'step',
    'cols', 'rows', 'colSpan', 'rowSpan',
}

# Attributes whose string values ARE likely translatable
TRANSLATABLE_ATTRS = {
    'title', 'placeholder', 'label', 'aria-label', 'alt',
    'description', 'helperText', 'tooltip', 'message',
    'text', 'subtitle', 'caption', 'header', 'footer',
    'emptyText', 'loadingText', 'errorText',
    'confirmText', 'cancelText', 'submitText',
}

# Strings that look technical / should never be flagged
TECHNICAL_PATTERNS = [
    re.compile(r'^https?://'),               # URLs
    re.compile(r'^[a-z]+://'),               # protocol URLs
    re.compile(r'^\w+\.\w+\.\w+'),           # dotted identifiers (a.b.c)
    re.compile(r'^[A-Z_]{2,}$'),             # CONSTANTS
    re.compile(r'^\d'),                       # starts with number
    re.compile(r'^#[0-9a-fA-F]{3,8}$'),      # hex colors
    re.compile(r'^rgba?\('),                  # CSS colors
    re.compile(r'^\.\w'),                     # CSS class .name
    re.compile(r'^[\w-]+/[\w-]+'),            # paths or mimetypes
    re.compile(r'^[a-z]{1,5}$'),             # tiny tokens (px, sm, md, lg, xl)
    re.compile(r'^\{'),                       # template expressions
    re.compile(r'^application/'),             # mime types
    re.compile(r'^Bearer '),                  # auth headers
    re.compile(r'^[A-Z]{2,6}$'),             # HTTP methods, short codes
    re.compile(r'^_'),                        # internal identifiers
    re.compile(r'^\w+:\w+'),                 # namespace:key patterns
]

# Common non-translatable short strings
EXEMPT_STRINGS = {
    '', ' ', '|', '/', '·', '•', '—', '-', '–', '+', '×', '=',
    '...', '…', ',', '.', ':', ';', '!', '?',
    '(', ')', '[', ']', '{', '}', '<', '>',
    'px', 'em', 'rem', '%', 'vh', 'vw',
    'true', 'false', 'null', 'undefined', 'none',
    'div', 'span', 'button', 'input', 'form',
    'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
    'ok', 'error', 'warning', 'info', 'success',
    'asc', 'desc',
    'auto', 'inherit', 'initial', 'unset',
    'flex', 'grid', 'block', 'inline', 'none',
    'left', 'right', 'center', 'top', 'bottom',
    'row', 'column', 'wrap', 'nowrap',
    'solid', 'dashed', 'dotted',
    'small', 'medium', 'large',
    'primary', 'secondary', 'default',
    'outlined', 'contained', 'text', 'filled',
    'normal', 'bold',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'body1', 'body2', 'caption', 'subtitle1', 'subtitle2', 'overline',
    'noopener', 'noreferrer', 'noopener noreferrer',
    '_blank', '_self',
    'Enter', 'Escape', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'utf-8', 'UTF-8',
    'N/A', 'n/a', 'TBD',
}

# Regex: skip lines that are imports, comments, type definitions
SKIP_LINE_PATTERNS = [
    re.compile(r'^\s*import\s'),
    re.compile(r'^\s*export\s+type\s'),
    re.compile(r'^\s*//'),
    re.compile(r'^\s*\*'),
    re.compile(r'^\s*interface\s'),
    re.compile(r'^\s*type\s+\w+\s*='),
    re.compile(r'^\s*const\s+\w+:\s*Record<'),
    re.compile(r'console\.(log|warn|error|info|debug)'),
]


@dataclass
class Finding:
    file: str
    line: int
    category: str
    confidence: str
    text: str
    context: str
    suggestion: str = ''


def is_technical(s: str) -> bool:
    """Check if a string is technical (not user-facing)."""
    s = s.strip()
    if s in EXEMPT_STRINGS:
        return True
    if len(s) <= 1:
        return True
    for pat in TECHNICAL_PATTERNS:
        if pat.search(s):
            return True
    # All lowercase single word under 4 chars = likely technical token
    if re.match(r'^[a-z]{1,3}$', s):
        return True
    return False


def has_uppercase_word(s: str) -> bool:
    """Check if string contains at least one capitalized English word."""
    return bool(re.search(r'[A-Z][a-z]{2,}', s))


def looks_like_english_sentence(s: str) -> bool:
    """Check if string looks like English text (has spaces, words)."""
    s = s.strip()
    if len(s) < 3:
        return False
    # Must have at least one space (multi-word) or be a known UI label pattern
    if ' ' in s:
        return True
    # Single capitalized word longer than 3 chars (like "Categories", "Repositories")
    if re.match(r'^[A-Z][a-z]{3,}$', s):
        return True
    # Single word with common UI suffixes
    if re.match(r'^[A-Z][a-z]+(ing|tion|ment|ness|ity|able|ible|ful|less|ous|ive|ed|er|es|ly)$', s):
        return True
    return False


def scan_file(filepath: Path) -> list:
    """Scan a single file for hardcoded strings."""
    findings = []
    rel_path = str(filepath.relative_to(PROJECT_ROOT))

    try:
        lines = filepath.read_text(encoding='utf-8').splitlines()
    except Exception:
        return []

    in_sx_block = 0  # nesting depth in sx={{ }}

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()

        # Skip entire lines that are definitely not UI
        if any(p.search(stripped) for p in SKIP_LINE_PATTERNS):
            continue

        # Track sx/style blocks (CSS-in-JS)
        if 'sx={{' in line or 'sx={' in line or 'style={{' in line or 'style={' in line:
            in_sx_block += line.count('{') - line.count('}')
            continue
        if in_sx_block > 0:
            in_sx_block += line.count('{') - line.count('}')
            if in_sx_block < 0:
                in_sx_block = 0
            continue

        # ── Pattern 1: JSX text content ──
        # Match: >Some Text< or >Some Text</Tag>
        jsx_text = re.findall(r'>\s*([A-Z][^<>{}\n]{2,}?)\s*</', line)
        for text in jsx_text:
            text = text.strip()
            if is_technical(text):
                continue
            if not looks_like_english_sentence(text):
                continue
            # Check it's not already wrapped in t() or tOr()
            if f't(\'{text}\')' in line or f't("{text}")' in line:
                continue
            if '{t(' in line or '{tOr(' in line:
                # Line already has i18n calls, this might be a fragment
                # Still flag but lower confidence
                findings.append(Finding(
                    file=rel_path, line=line_num,
                    category='jsx-text',
                    confidence=MEDIUM,
                    text=text,
                    context=stripped[:120],
                ))
            else:
                findings.append(Finding(
                    file=rel_path, line=line_num,
                    category='jsx-text',
                    confidence=HIGH,
                    text=text,
                    context=stripped[:120],
                ))

        # ── Pattern 2: Translatable attributes with hardcoded strings ──
        for attr in TRANSLATABLE_ATTRS:
            # Match: attr="Some text"  (not attr={...} which is dynamic)
            pat = re.compile(rf'{attr}="([^"]+)"')
            for match in pat.finditer(line):
                text = match.group(1)
                if is_technical(text):
                    continue
                if looks_like_english_sentence(text):
                    findings.append(Finding(
                        file=rel_path, line=line_num,
                        category=f'attr:{attr}',
                        confidence=HIGH,
                        text=text,
                        context=stripped[:120],
                    ))

        # ── Pattern 3: String literals in JSX expressions that look like UI text ──
        # Match: {"Some UI text"} or {'Some UI text'}
        jsx_expr_strings = re.findall(r'\{["\']([A-Z][^"\']{3,})["\'](?:\s*\})', line)
        for text in jsx_expr_strings:
            text = text.strip()
            if is_technical(text):
                continue
            if looks_like_english_sentence(text):
                findings.append(Finding(
                    file=rel_path, line=line_num,
                    category='jsx-expr',
                    confidence=HIGH,
                    text=text,
                    context=stripped[:120],
                ))

        # ── Pattern 4: Template literals with English text in JSX ──
        # Match: {`Some text ${var}`}  — only if it has English words
        backtick_strings = re.findall(r'\{`([^`]{5,})`\}', line)
        for text in backtick_strings:
            # Remove ${...} expressions for analysis
            clean = re.sub(r'\$\{[^}]+\}', '', text).strip()
            if is_technical(clean):
                continue
            if looks_like_english_sentence(clean) and has_uppercase_word(clean):
                findings.append(Finding(
                    file=rel_path, line=line_num,
                    category='template-literal',
                    confidence=MEDIUM,
                    text=text[:80],
                    context=stripped[:120],
                ))

    return findings


def generate_i18n_key(text: str, filepath: str) -> str:
    """Generate a suggested i18n key from the text and file context."""
    # Extract component domain from filepath
    parts = Path(filepath).parts
    domain = ''
    for i, p in enumerate(parts):
        if p == 'compounds' and i + 1 < len(parts):
            domain = parts[i + 1]
            break
        if p == 'pages':
            domain = 'page'
            break
        if p == 'atoms':
            domain = 'common'
            break

    if not domain:
        domain = 'common'

    # Generate key from text
    words = re.sub(r'[^a-zA-Z0-9\s]', '', text).strip().split()
    if len(words) > 4:
        words = words[:4]
    key_part = ''.join(w[0].upper() + w[1:].lower() if i > 0 else w.lower() for i, w in enumerate(words))

    return f'{domain}.{key_part}'


def main():
    parser = argparse.ArgumentParser(
        description='Detect hardcoded English strings in flyto-code'
    )
    parser.add_argument(
        '--min-confidence',
        choices=['HIGH', 'MEDIUM', 'LOW'],
        default='MEDIUM',
        help='Minimum confidence level to report (default: MEDIUM)'
    )
    parser.add_argument(
        '--fix-preview',
        action='store_true',
        help='Show suggested i18n key for each finding'
    )
    parser.add_argument(
        '--output',
        choices=['table', 'tsv', 'json'],
        default='table',
        help='Output format (default: table)'
    )
    args = parser.parse_args()

    min_conf = CONFIDENCE_ORDER[args.min_confidence]

    # Scan all TSX/TS files
    all_findings = []
    file_count = 0

    for ext in ['*.tsx', '*.ts']:
        for filepath in SRC_DIR.rglob(ext):
            rel = str(filepath.relative_to(SRC_DIR))
            if 'node_modules' in rel:
                continue
            if '__tests__' in rel or '.test.' in filepath.name:
                continue
            if filepath.suffix == '.d.ts':
                continue
            if 'types' in filepath.parent.name and filepath.suffix == '.ts':
                # Skip pure type definition files
                continue

            file_count += 1
            findings = scan_file(filepath)
            all_findings.extend(findings)

    # Filter by confidence
    filtered = [f for f in all_findings if CONFIDENCE_ORDER[f.confidence] >= min_conf]

    # Sort by confidence (HIGH first), then file, then line
    filtered.sort(key=lambda f: (-CONFIDENCE_ORDER[f.confidence], f.file, f.line))

    # Output
    print(f'Scanned {file_count} files')
    print(f'Found {len(filtered)} hardcoded strings (>= {args.min_confidence} confidence)')
    print(f'  HIGH:   {sum(1 for f in filtered if f.confidence == HIGH)}')
    print(f'  MEDIUM: {sum(1 for f in filtered if f.confidence == MEDIUM)}')
    print()

    if args.output == 'json':
        import json
        print(json.dumps([{
            'file': f.file, 'line': f.line, 'category': f.category,
            'confidence': f.confidence, 'text': f.text,
            'suggestion': generate_i18n_key(f.text, f.file) if args.fix_preview else ''
        } for f in filtered], indent=2, ensure_ascii=False))
    elif args.output == 'tsv':
        print('FILE\tLINE\tCONFIDENCE\tCATEGORY\tTEXT')
        for f in filtered:
            print(f'{f.file}\t{f.line}\t{f.confidence}\t{f.category}\t{f.text}')
    else:
        # Table format
        for f in filtered:
            conf_icon = {'HIGH': '[!]', 'MEDIUM': '[~]', 'LOW': '[.]'}[f.confidence]
            print(f'  {conf_icon} {f.file}:{f.line}')
            print(f'      {f.category}: "{f.text}"')
            if args.fix_preview:
                key = generate_i18n_key(f.text, f.file)
                print(f'      suggested: t(\'{key}\')')
            print()

    if filtered:
        sys.exit(1)
    else:
        print('No hardcoded strings found!')
        sys.exit(0)


if __name__ == '__main__':
    main()
