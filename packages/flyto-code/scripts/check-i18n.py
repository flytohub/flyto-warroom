#!/usr/bin/env python3
"""
check-i18n.py - Validate i18n sync status for flyto-code

Checks:
1. public/i18n/ files are in sync with flyto-i18n/dist/
2. Code references (t('key')) have corresponding translations (orphan detection)
3. Files that were deleted from source are flagged

Usage:
    python scripts/check-i18n.py [--fix] [--i18n-path PATH]

Options:
    --fix           Auto-fix by syncing from flyto-i18n/dist
    --i18n-path     Path to flyto-i18n repo (default: ../flyto-i18n)

Exit codes:
    0  All checks passed
    1  Issues found (stale files or orphaned keys)
"""

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLIC_I18N = PROJECT_ROOT / 'public' / 'i18n'
# Source root migrated from src/ to src-next/ — scan the live directory.
SRC_DIR = PROJECT_ROOT / 'src-next'
ORPHAN_ALLOWLIST = SCRIPT_DIR / 'i18n-orphan-allowlist.txt'

# Scopes that flyto-code copies from flyto-i18n/dist
SYNCED_SCOPES = ['cloud', 'code', 'console', 'data', 'app', 'cortex']

# The scope used by this project for key validation
OWN_SCOPE = 'code'
KEY_PREFIX = 'code.'

# Regex patterns to extract translation keys from code
T_CALL_PATTERNS = [
    re.compile(r"""(?<![.\w])t\(['"]([^'"]+)['"]\s*[,)]"""),
    re.compile(r"""(?<![.\w])tOr\(['"]([^'"]+)['"]\s*,"""),
]

SCAN_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx'}

# Keys that are dynamically constructed (skip validation)
DYNAMIC_KEY_PREFIXES = [
    'modules.',
]

# Test/dummy keys used in test files (not real translations)
TEST_KEYS = {
    'greeting', 'hello', 'key', 'label', 'missing', 'missing.key',
    'msg', 'nonexistent.key', 'x',
}


def load_orphan_allowlist() -> set:
    """Load the set of known-missing keys that are allowed to be absent."""
    if not ORPHAN_ALLOWLIST.exists():
        return set()
    allowed = set()
    for line in ORPHAN_ALLOWLIST.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            allowed.add(line)
    return allowed


def flatten_nested(obj: dict, prefix: str = '') -> dict:
    """Flatten nested dict to dot-notation keys."""
    flat = {}
    for key, value in obj.items():
        # build-dist.py preserves a leaf/branch collision by writing the
        # parent leaf under "_self" (for example integrations.auth._self).
        # Runtime flattening lifts that back to integrations.auth, so this
        # checker must do the same or valid translated leaf keys look orphaned.
        if key == '_self' and prefix:
            full_key = prefix
        else:
            full_key = f'{prefix}.{key}' if prefix else key
        if isinstance(value, dict):
            flat.update(flatten_nested(value, full_key))
        else:
            flat[full_key] = value
    return flat


def check_scope_sync(i18n_path: Path, scope: str) -> list:
    """Check if a scope's files are in sync with dist."""
    issues = []
    dist_scope_dir = i18n_path / 'dist' / scope
    local_scope_dir = PUBLIC_I18N / scope

    if not dist_scope_dir.exists():
        return []  # scope doesn't exist in dist, skip

    if not local_scope_dir.exists():
        issues.append(f"[MISSING] public/i18n/{scope}/ directory not found")
        return issues

    # Check for files in dist but missing locally
    dist_files = set(f.name for f in dist_scope_dir.glob('*.json'))
    local_files = set(f.name for f in local_scope_dir.glob('*.json'))

    missing = dist_files - local_files
    extra = local_files - dist_files

    for f in sorted(missing):
        issues.append(f"[MISSING] {scope}/{f} exists in dist but not in public/i18n")

    for f in sorted(extra):
        issues.append(f"[EXTRA] {scope}/{f} exists locally but not in dist (should be deleted)")

    # Check for content differences in common files
    common = dist_files & local_files
    stale_count = 0
    for f in sorted(common):
        dist_data = (dist_scope_dir / f).read_text(encoding='utf-8')
        local_data = (local_scope_dir / f).read_text(encoding='utf-8')
        if dist_data != local_data:
            stale_count += 1

    if stale_count:
        issues.append(f"[STALE] {scope}/: {stale_count} file(s) have content differences vs dist")

    return issues


def check_all_scopes(i18n_path: Path) -> list:
    """Check all synced scopes."""
    all_issues = []

    for scope in SYNCED_SCOPES:
        issues = check_scope_sync(i18n_path, scope)
        all_issues.extend(issues)

    # Also check for extra scope directories that shouldn't exist
    if PUBLIC_I18N.exists():
        local_scopes = set(
            d.name for d in PUBLIC_I18N.iterdir()
            if d.is_dir() and d.name != '.git'
        )
        dist_scopes = set(
            d.name for d in (i18n_path / 'dist').iterdir()
            if d.is_dir()
        ) if (i18n_path / 'dist').exists() else set()

        extra_scopes = local_scopes - dist_scopes - set(SYNCED_SCOPES)
        for scope in sorted(extra_scopes):
            all_issues.append(f"[EXTRA] public/i18n/{scope}/ exists locally but not in dist")

    return all_issues


def extract_keys_from_code() -> set:
    """Extract all t('key') and tOr('key', ...) references from source code."""
    keys = set()

    for ext in SCAN_EXTENSIONS:
        for file_path in SRC_DIR.rglob(f'*{ext}'):
            rel = str(file_path.relative_to(SRC_DIR))
            if 'node_modules' in rel:
                continue

            try:
                content = file_path.read_text(encoding='utf-8')
            except Exception:
                continue

            for pattern in T_CALL_PATTERNS:
                for match in pattern.finditer(content):
                    key = match.group(1)
                    if '{' in key or '$' in key or '`' in key or '(' in key:
                        continue
                    if key.endswith('.'):
                        continue
                    keys.add(key)

    return keys


def check_orphaned_keys(i18n_path: Path) -> list:
    """Check for keys referenced in code but missing from translations.

    Keys in i18n-orphan-allowlist.txt are the known-baseline set —
    they fall back to tOr() English text at runtime and don't block CI.
    Any key NOT in the allowlist will fail CI so new untranslated keys
    can't be silently added.
    """
    issues = []

    # Load English translations for the code scope (source of truth)
    dist_file = i18n_path / 'dist' / OWN_SCOPE / 'en.json'
    if not dist_file.exists():
        return [f'[ERROR] Cannot check orphaned keys: dist/{OWN_SCOPE}/en.json not found']

    with open(dist_file, encoding='utf-8') as f:
        dist_data = json.load(f)

    # Flatten and strip the prefix (same as runtime behavior)
    raw_keys = flatten_nested(dist_data.get('translations', {}))
    available_keys = set()
    for key in raw_keys:
        if key.startswith(KEY_PREFIX):
            available_keys.add(key[len(KEY_PREFIX):])
        else:
            available_keys.add(key)

    # Extract keys from code
    code_keys = extract_keys_from_code()

    # Load the baseline allowlist of known-missing keys
    allowed_orphans = load_orphan_allowlist()

    # Find orphaned keys that are NOT in the allowlist (new violations)
    orphaned_all = set()
    orphaned_new = set()
    for key in code_keys:
        if any(key.startswith(prefix) for prefix in DYNAMIC_KEY_PREFIXES):
            continue
        if key in TEST_KEYS:
            continue
        if key not in available_keys:
            orphaned_all.add(key)
            if key not in allowed_orphans:
                orphaned_new.add(key)

    allowlisted_count = len(orphaned_all) - len(orphaned_new)
    if allowlisted_count:
        print(f"  ({allowlisted_count} known-missing key(s) in allowlist — add to flyto-i18n to clear)")

    if orphaned_new:
        issues.append(
            f"[ORPHAN] {len(orphaned_new)} new key(s) referenced in code but missing from i18n source:"
        )
        for key in sorted(orphaned_new)[:20]:
            issues.append(f"  - {key}")
        if len(orphaned_new) > 20:
            issues.append(f"  ... and {len(orphaned_new) - 20} more")
        issues.append(
            "  Add these keys to flyto-i18n/locales/code/{en,zh-TW,zh-CN}/code.json "
            "and rebuild dist, OR add to scripts/i18n-orphan-allowlist.txt if intentionally deferred."
        )

    return issues


def fix_sync(i18n_path: Path):
    """Auto-fix by syncing dist files to public/i18n/."""
    print("Syncing public/i18n/ from flyto-i18n/dist/...")
    dist_dir = i18n_path / 'dist'

    for scope in SYNCED_SCOPES:
        src_scope = dist_dir / scope
        dst_scope = PUBLIC_I18N / scope

        if not src_scope.exists():
            print(f"  Skip {scope}/: not in dist")
            continue

        # Create dir if needed
        dst_scope.mkdir(parents=True, exist_ok=True)

        # Copy all files from dist
        src_files = set(f.name for f in src_scope.glob('*.json'))
        dst_files = set(f.name for f in dst_scope.glob('*.json'))

        # Delete extra files
        for f in sorted(dst_files - src_files):
            (dst_scope / f).unlink()
            print(f"  Deleted: {scope}/{f}")

        # Copy new/updated files
        updated = 0
        for f in sorted(src_files):
            src_data = (src_scope / f).read_text(encoding='utf-8')
            dst_file = dst_scope / f
            needs_update = True
            if dst_file.exists():
                needs_update = dst_file.read_text(encoding='utf-8') != src_data
            if needs_update:
                dst_file.write_text(src_data, encoding='utf-8')
                updated += 1

        if updated:
            print(f"  Updated {scope}/: {updated} file(s)")
        else:
            print(f"  {scope}/: already in sync")

    # Also sync root-level landing.json etc. if they exist
    for f in dist_dir.glob('*.json'):
        if f.name == 'manifest.json':
            continue
        dst = PUBLIC_I18N / f.name
        src_data = f.read_text(encoding='utf-8')
        if not dst.exists() or dst.read_text(encoding='utf-8') != src_data:
            dst.write_text(src_data, encoding='utf-8')
            print(f"  Updated: {f.name}")


def main():
    parser = argparse.ArgumentParser(
        description='Check i18n sync status for flyto-code'
    )
    parser.add_argument(
        '--fix',
        action='store_true',
        help='Auto-fix by syncing from flyto-i18n/dist'
    )
    parser.add_argument(
        '--i18n-path',
        default='../flyto-i18n',
        help='Path to flyto-i18n repo (default: ../flyto-i18n)'
    )
    args = parser.parse_args()

    i18n_path = Path(args.i18n_path).resolve()
    if not i18n_path.exists():
        print(f"Error: flyto-i18n not found at {i18n_path}")
        print("Use --i18n-path to specify the correct path")
        sys.exit(1)

    print("flyto-code i18n sync check")
    print("=" * 60)

    all_issues = []

    # Check 1: public/i18n/ files in sync
    print("\n[1] Checking public/i18n/ vs flyto-i18n/dist/...")
    sync_issues = check_all_scopes(i18n_path)
    all_issues.extend(sync_issues)
    if sync_issues:
        for issue in sync_issues:
            print(f"  {issue}")
    else:
        print("  OK - all scopes in sync")

    # Check 2: Orphaned key references
    print("\n[2] Scanning code for orphaned key references...")
    orphan_issues = check_orphaned_keys(i18n_path)
    all_issues.extend(orphan_issues)
    if orphan_issues:
        for issue in orphan_issues:
            print(f"  {issue}")
    else:
        print("  OK - no orphaned key references found")

    print("\n" + "=" * 60)

    if all_issues:
        error_count = len([i for i in all_issues if not i.startswith('  ')])
        print(f"Found {error_count} issue(s)")
        if args.fix:
            fix_sync(i18n_path)
            print("\nFiles synced. Re-run without --fix to verify.")
            print("Note: orphaned code references must be fixed manually.")
        else:
            print("\nRun with --fix to auto-sync public/i18n/ files")
            print("Or run: python ../flyto-i18n/scripts/sync-to-projects.py --project code")
        sys.exit(1)
    else:
        print("All checks passed!")
        sys.exit(0)


if __name__ == '__main__':
    main()
