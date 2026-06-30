#!/usr/bin/env python3
"""
sync-locales.py - Sync all locales with English base

Usage:
    python scripts/sync-locales.py [--dry-run] [--project PROJECT]

This script:
1. Scans English (base) locale for all keys in each project
2. For each other locale:
   - Adds missing keys (with empty value)
   - Removes keys that don't exist in English
3. Maintains the same file structure as English
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Set

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'

# All project directories
PROJECT_DIRS = ['cloud', 'modules', 'landing', 'shared', 'app', 'code', 'console', 'data']


def get_locales() -> list:
    """Get available locales by scanning project directories."""
    locales = set()
    for proj in PROJECT_DIRS:
        proj_dir = LOCALES_DIR / proj
        if proj_dir.exists():
            for d in proj_dir.iterdir():
                if d.is_dir():
                    locales.add(d.name)
    return sorted(locales)


def load_locale_keys(locale_dir: Path) -> Dict[str, Dict[str, str]]:
    """Load all keys from a locale directory, grouped by file."""
    result = {}

    for json_file in locale_dir.glob('*.json'):
        with open(json_file, encoding='utf-8') as f:
            data = json.load(f)

        if 'translations' in data:
            result[json_file.name] = data['translations']

    return result


def sync_locale_in_project(project: str, locale: str, dry_run: bool = False) -> Dict[str, int]:
    """Sync a locale with English base within a specific project."""
    en_dir = LOCALES_DIR / project / 'en'
    locale_dir = LOCALES_DIR / project / locale
    stats = {'added': 0, 'removed': 0, 'files_updated': 0}

    if not en_dir.exists():
        return stats

    if not locale_dir.exists():
        locale_dir.mkdir(parents=True, exist_ok=True)

    for en_file in sorted(en_dir.glob('*.json')):
        filename = en_file.name
        target_file = locale_dir / filename

        with open(en_file, encoding='utf-8') as f:
            en_data = json.load(f)

        en_translations = en_data.get('translations', {})

        if target_file.exists():
            with open(target_file, encoding='utf-8') as f:
                target_data = json.load(f)
            target_translations = target_data.get('translations', {})
        else:
            target_data = en_data.copy()
            target_data['locale'] = locale
            target_translations = {}

        en_key_set = set(en_translations.keys())
        target_key_set = set(target_translations.keys())

        keys_to_add = en_key_set - target_key_set
        keys_to_remove = target_key_set - en_key_set

        if not keys_to_add and not keys_to_remove:
            continue

        new_translations = {}
        for key in en_translations.keys():
            if key in target_translations:
                new_translations[key] = target_translations[key]
            else:
                new_translations[key] = ""
                stats['added'] += 1

        stats['removed'] += len(keys_to_remove)
        stats['files_updated'] += 1

        target_data['translations'] = dict(sorted(new_translations.items()))
        target_data['locale'] = locale

        change_info = []
        if keys_to_add:
            change_info.append(f"+{len(keys_to_add)}")
        if keys_to_remove:
            change_info.append(f"-{len(keys_to_remove)}")

        if dry_run:
            print(f"    Would update {project}/{filename}: {', '.join(change_info)}")
        else:
            with open(target_file, 'w', encoding='utf-8') as f:
                json.dump(target_data, f, indent=2, ensure_ascii=False)
            print(f"    Updated {project}/{filename}: {', '.join(change_info)}")

    return stats


def main():
    parser = argparse.ArgumentParser(description='Sync all locales with English')
    parser.add_argument('--dry-run', action='store_true', help='Show changes without applying')
    parser.add_argument('--locale', '-l', help='Sync specific locale only')
    parser.add_argument('--project', '-p', help='Sync specific project only (cloud, modules, landing, shared)')
    args = parser.parse_args()

    print("Syncing locales with English base")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    total_stats = {'added': 0, 'removed': 0, 'files_updated': 0}

    if args.locale:
        locales = [args.locale]
    else:
        locales = [l for l in get_locales() if l != 'en']

    projects = [args.project] if args.project else PROJECT_DIRS

    for locale in sorted(locales):
        print(f"[{locale}]")
        locale_updated = False

        for project in projects:
            stats = sync_locale_in_project(project, locale, dry_run=args.dry_run)

            if stats['files_updated'] > 0:
                locale_updated = True

            total_stats['added'] += stats['added']
            total_stats['removed'] += stats['removed']
            total_stats['files_updated'] += stats['files_updated']

        if not locale_updated:
            print("  Already in sync ✓")
        print()

    print("=" * 50)
    print(f"Summary:")
    print(f"  Keys added:   +{total_stats['added']}")
    print(f"  Keys removed: -{total_stats['removed']}")
    print(f"  Files updated: {total_stats['files_updated']}")
    print("=" * 50)

    if args.dry_run:
        print("\nRun without --dry-run to apply changes")


if __name__ == '__main__':
    main()
