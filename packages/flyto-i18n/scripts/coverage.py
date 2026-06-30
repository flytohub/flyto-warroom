#!/usr/bin/env python3
"""
coverage.py - Generate translation coverage report

Usage:
    python scripts/coverage.py [--locale LOCALE] [--project PROJECT] [--json]

Options:
    --locale    Show coverage for specific locale
    --project   Show coverage for specific project (cloud, modules, landing, shared)
    --json      Output as JSON
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List

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


def load_locale_keys(locale: str, projects: list = None) -> Dict[str, set]:
    """Load all keys for a locale, grouped by category."""
    keys_by_category = {}
    dirs = projects or PROJECT_DIRS

    for proj in dirs:
        locale_dir = LOCALES_DIR / proj / locale
        if not locale_dir.exists():
            continue

        for json_file in locale_dir.glob('*.json'):
            try:
                with open(json_file) as f:
                    data = json.load(f)
                    category = data.get('category', 'unknown')
                    translations = data.get('translations', {})
                    keys_by_category[category] = set(translations.keys())
            except Exception as e:
                print(f"Warning: Could not load {json_file}: {e}")

    return keys_by_category


def calculate_coverage(base_keys: Dict[str, set], locale_keys: Dict[str, set]) -> Dict:
    """Calculate coverage statistics."""
    total_base = sum(len(keys) for keys in base_keys.values())
    total_translated = 0
    missing = []

    by_category = {}
    for category, base in base_keys.items():
        translated = locale_keys.get(category, set())
        category_coverage = len(translated) / len(base) * 100 if base else 0
        category_missing = base - translated

        by_category[category] = {
            'total': len(base),
            'translated': len(translated),
            'coverage': round(category_coverage, 1),
            'missing_count': len(category_missing)
        }

        total_translated += len(translated)
        missing.extend(category_missing)

    overall = total_translated / total_base * 100 if total_base else 0

    return {
        'total_keys': total_base,
        'translated_keys': total_translated,
        'coverage': round(overall, 1),
        'by_category': by_category,
        'missing_keys': sorted(missing)[:50]
    }


def print_coverage_report(locale: str, stats: Dict):
    """Print human-readable coverage report."""
    print(f"\n{'=' * 60}")
    print(f"Translation Coverage Report: {locale}")
    print(f"{'=' * 60}")
    print(f"\nOverall: {stats['translated_keys']}/{stats['total_keys']} ({stats['coverage']}%)")

    print(f"\nBy Category:")
    print(f"{'-' * 60}")
    print(f"{'Category':<20} {'Translated':<15} {'Coverage':<15}")
    print(f"{'-' * 60}")

    for category, data in sorted(stats['by_category'].items()):
        bar_len = int(data['coverage'] / 5)
        bar = '█' * bar_len + '░' * (20 - bar_len)
        print(f"{category:<20} {data['translated']}/{data['total']:<10} {bar} {data['coverage']}%")

    if stats['missing_keys']:
        print(f"\nMissing Keys (first 50):")
        for key in stats['missing_keys'][:20]:
            print(f"  - {key}")
        if len(stats['missing_keys']) > 20:
            print(f"  ... and {len(stats['missing_keys']) - 20} more")


def main():
    parser = argparse.ArgumentParser(description='Generate coverage report')
    parser.add_argument('--locale', '-l', help='Specific locale to check')
    parser.add_argument('--project', '-p', help='Specific project (cloud, modules, landing, shared)')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    args = parser.parse_args()

    projects = [args.project] if args.project else None

    # Load base (English) keys
    base_keys = load_locale_keys('en', projects)
    if not base_keys:
        print("Error: No English base locale found.")
        sys.exit(1)

    # Get locales to check
    if args.locale:
        locales = [args.locale]
    else:
        locales = [l for l in get_locales() if l != 'en']

    all_stats = {}

    for locale in locales:
        locale_keys = load_locale_keys(locale, projects)
        stats = calculate_coverage(base_keys, locale_keys)
        all_stats[locale] = stats

        if not args.json:
            print_coverage_report(locale, stats)

    if args.json:
        print(json.dumps(all_stats, indent=2))

    # Summary
    if not args.json and len(locales) > 1:
        print(f"\n{'=' * 60}")
        print("Summary")
        print(f"{'=' * 60}")
        for locale, stats in sorted(all_stats.items(), key=lambda x: -x[1]['coverage']):
            print(f"  {locale}: {stats['coverage']}%")


if __name__ == '__main__':
    main()
