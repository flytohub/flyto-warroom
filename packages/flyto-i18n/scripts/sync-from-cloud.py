#!/usr/bin/env python3
"""
sync-from-cloud.py - Sync i18n keys from flyto-cloud Vue files

This script scans Vue/JS files for $t('key') calls and generates
corresponding locale JSON files with empty values for translation.

Usage:
    python scripts/sync-from-cloud.py [--cloud-path PATH] [--dry-run]

Options:
    --cloud-path    Path to flyto-cloud (default: ../flyto-cloud)
    --dry-run       Show changes without writing files
"""

import argparse
import json
import re
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, Set, Tuple

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'
CLOUD_DIR = LOCALES_DIR / 'cloud'

# Frontend source path relative to flyto-cloud
FRONTEND_SRC = 'src/ui/web/frontend/src'

# Regex patterns to extract translation keys
T_CALL_PATTERNS = [
    r'\$t\([\'"]([^\'"]+)[\'"]',
    r'(?<![.\w])t\([\'"]([^\'"]+)[\'"]',
]

# File extensions to scan
SCAN_EXTENSIONS = ['.vue', '.js', '.ts']


def find_source_files(cloud_path: Path) -> list:
    """Find all Vue and JS files in the frontend source."""
    frontend_path = cloud_path / FRONTEND_SRC
    if not frontend_path.exists():
        print(f"Error: Frontend path not found: {frontend_path}")
        return []

    files = []
    for ext in SCAN_EXTENSIONS:
        files.extend(frontend_path.rglob(f"*{ext}"))

    return sorted(files)


def extract_keys_from_file(file_path: Path) -> Set[str]:
    """Extract all translation keys from a single file."""
    keys = set()

    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"  Warning: Could not read {file_path}: {e}")
        return keys

    for pattern in T_CALL_PATTERNS:
        matches = re.findall(pattern, content)
        for key in matches:
            if '{' in key or '(' in key or '$' in key or '`' in key:
                continue
            if key.endswith('.'):
                continue
            keys.add(key)

    return keys


def extract_all_keys(cloud_path: Path) -> Dict[str, Set[str]]:
    """Extract all translation keys grouped by category."""
    files = find_source_files(cloud_path)
    print(f"Scanning {len(files)} files...")

    all_keys = set()
    file_count = 0

    for file_path in files:
        keys = extract_keys_from_file(file_path)
        if keys:
            all_keys.update(keys)
            file_count += 1

    print(f"Found {len(all_keys)} unique keys in {file_count} files")

    # Group keys by category (first segment of the key)
    categories = defaultdict(set)
    for key in all_keys:
        parts = key.split('.')
        if len(parts) >= 1:
            category = parts[0]
            categories[category].add(key)

    return dict(categories)


def load_existing_translations(locale: str, category: str) -> Dict[str, str]:
    """Load existing translations for a category."""
    file_path = CLOUD_DIR / locale / f"{category}.json"

    if not file_path.exists():
        return {}

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('translations', {})
    except Exception as e:
        print(f"  Warning: Could not load {file_path}: {e}")
        return {}


def generate_locale_file(
    category: str,
    keys: Set[str],
    locale: str,
    dry_run: bool = False
) -> Tuple[int, int, int]:
    """Generate a locale JSON file for a category."""
    locale_dir = CLOUD_DIR / locale

    existing = load_existing_translations(locale, category)

    translations = {}
    new_count = 0
    preserved_count = 0

    for key in sorted(keys):
        if key in existing and existing[key]:
            translations[key] = existing[key]
            preserved_count += 1
        else:
            translations[key] = ""
            new_count += 1

    removed_keys = set(existing.keys()) - keys
    removed_count = len(removed_keys)

    output = {
        "$schema": "../../../schema/locale.schema.json",
        "locale": locale,
        "category": f"cloud.{category}",
        "version": "1.0.0",
        "translations": translations
    }

    file_path = locale_dir / f"{category}.json"

    change_info = []
    if new_count:
        change_info.append(f"+{new_count} new")
    if removed_count:
        change_info.append(f"-{removed_count} removed")
    change_str = f" ({', '.join(change_info)})" if change_info else ""

    if dry_run:
        print(f"    Would write {file_path.name}: {len(keys)} keys{change_str}")
    else:
        locale_dir.mkdir(parents=True, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f"    Wrote {file_path.name}: {len(keys)} keys{change_str}")

    return len(keys), new_count, removed_count


def sync_from_cloud(cloud_path: str, dry_run: bool = False):
    """Main sync function."""
    cloud_path = Path(cloud_path).resolve()

    if not cloud_path.exists():
        print(f"Error: flyto-cloud not found at {cloud_path}")
        sys.exit(1)

    print(f"Syncing from flyto-cloud at: {cloud_path}")
    print(f"Target: {CLOUD_DIR}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print("-" * 60)

    categories = extract_all_keys(cloud_path)

    if not categories:
        print("No translation keys found!")
        return

    print(f"\nFound {len(categories)} categories:")
    for cat in sorted(categories.keys()):
        print(f"  {cat}: {len(categories[cat])} keys")

    print("\n" + "-" * 60)

    locales = ['en', 'zh-TW']
    total_stats = {
        'categories': len(categories),
        'keys': 0,
        'new': 0,
        'removed': 0
    }

    for locale in locales:
        print(f"\n[{locale}]")

        for category in sorted(categories.keys()):
            keys = categories[category]
            key_count, new_count, removed_count = generate_locale_file(
                category, keys, locale, dry_run
            )

            if locale == 'en':
                total_stats['keys'] += key_count
                total_stats['new'] += new_count
                total_stats['removed'] += removed_count

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Categories: {total_stats['categories']}")
    print(f"  Total keys: {total_stats['keys']}")
    print(f"  New keys: +{total_stats['new']}")
    print(f"  Removed keys: -{total_stats['removed']}")
    print("=" * 60)

    if dry_run:
        print("\nRun without --dry-run to apply changes")
    else:
        print("\nNext steps:")
        print("  1. Fill in empty translations (or use AI translate)")
        print("  2. Run: python scripts/build-dist.py")
        print("  3. Commit and push to GitHub")


def main():
    parser = argparse.ArgumentParser(
        description='Sync translation keys from flyto-cloud Vue files'
    )
    parser.add_argument(
        '--cloud-path',
        default='../flyto-cloud',
        help='Path to flyto-cloud repo (default: ../flyto-cloud)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing files'
    )

    args = parser.parse_args()
    sync_from_cloud(args.cloud_path, args.dry_run)


if __name__ == '__main__':
    main()
