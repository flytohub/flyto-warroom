#!/usr/bin/env python3
"""
validate.py - Validate translation files

Usage:
    python scripts/validate.py [--locale LOCALE] [--project PROJECT] [--strict]

Options:
    --locale    Validate specific locale only
    --project   Validate specific project only (cloud, modules, landing, shared)
    --strict    Exit with code 1 on any error
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Any

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'
SCHEMA_DIR = PROJECT_ROOT / 'schema'

# All project directories
PROJECT_DIRS = ['cloud', 'modules', 'landing', 'shared', 'app', 'code', 'console', 'data', 'engine']


def load_schema() -> Dict:
    """Load locale schema."""
    schema_path = SCHEMA_DIR / 'locale.schema.json'
    with open(schema_path) as f:
        return json.load(f)


def get_locales(project: str = None) -> list:
    """Get available locales by scanning project directories."""
    locales = set()
    dirs = [project] if project else PROJECT_DIRS
    for proj in dirs:
        proj_dir = LOCALES_DIR / proj
        if proj_dir.exists():
            for d in proj_dir.iterdir():
                if d.is_dir():
                    locales.add(d.name)
    return sorted(locales)


def load_base_keys() -> set:
    """Load all keys from English base locale across all projects."""
    keys = set()
    for proj in PROJECT_DIRS:
        en_dir = LOCALES_DIR / proj / 'en'
        if not en_dir.exists():
            continue
        for json_file in en_dir.glob('*.json'):
            with open(json_file, encoding='utf-8') as f:
                data = json.load(f)
                if 'translations' in data:
                    keys.update(data['translations'].keys())
    return keys


def validate_file(file_path: Path, base_keys: set) -> List[Dict]:
    """Validate a single translation file."""
    errors = []

    try:
        with open(file_path, encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        errors.append({
            'file': str(file_path),
            'type': 'json_error',
            'message': f'Invalid JSON: {e}'
        })
        return errors

    # Check required fields
    for field in ['locale', 'category', 'version', 'translations']:
        if field not in data:
            errors.append({
                'file': str(file_path),
                'type': 'missing_field',
                'message': f"Missing required field: '{field}'"
            })

    if 'translations' not in data:
        return errors

    translations = data['translations']

    key_pattern = re.compile(r'^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_][a-zA-Z0-9_-]*)+$')
    options_key_pattern = re.compile(r'^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_][a-zA-Z0-9_-]*)*\.options\..+$')

    for key, value in translations.items():
        if not key_pattern.match(key) and not options_key_pattern.match(key):
            errors.append({
                'file': str(file_path),
                'type': 'invalid_key',
                'key': key,
                'message': f"Invalid key format: '{key}'"
            })

        if not isinstance(value, str):
            errors.append({
                'file': str(file_path),
                'type': 'invalid_value',
                'key': key,
                'message': f"Value must be string, got {type(value).__name__}"
            })
            continue

        if len(value) > 800:
            errors.append({
                'file': str(file_path),
                'type': 'value_too_long',
                'key': key,
                'message': f"Value too long ({len(value)} > 800 chars)"
            })

        if '<script' in value.lower() or 'javascript:' in value.lower():
            errors.append({
                'file': str(file_path),
                'type': 'security',
                'key': key,
                'message': "Potential script injection detected"
            })

    # Check if keys exist in base (skip for 'en' and 'cloud.*' keys)
    if data.get('locale') != 'en' and base_keys:
        for key in translations.keys():
            if key.startswith('cloud.') or key.startswith('landing.'):
                continue
            if key not in base_keys:
                errors.append({
                    'file': str(file_path),
                    'type': 'unknown_key',
                    'key': key,
                    'message': f"Key not found in base locale: '{key}'"
                })

    return errors


def validate_locale(locale: str, base_keys: set, projects: list = None) -> List[Dict]:
    """Validate all files for a locale across project directories."""
    all_errors = []
    dirs = projects or PROJECT_DIRS

    for proj in dirs:
        locale_dir = LOCALES_DIR / proj / locale
        if not locale_dir.exists():
            continue
        for json_file in locale_dir.glob('*.json'):
            errors = validate_file(json_file, base_keys)
            all_errors.extend(errors)

    return all_errors


def count_files(locale: str, projects: list = None) -> int:
    """Count translation files for a locale."""
    count = 0
    dirs = projects or PROJECT_DIRS
    for proj in dirs:
        locale_dir = LOCALES_DIR / proj / locale
        if locale_dir.exists():
            count += len(list(locale_dir.glob('*.json')))
    return count


def main():
    parser = argparse.ArgumentParser(description='Validate translation files')
    parser.add_argument('--locale', '-l', help='Validate specific locale')
    parser.add_argument('--project', '-p', help='Validate specific project (cloud, modules, landing, shared)')
    parser.add_argument('--strict', action='store_true', help='Exit with code 1 on error')
    args = parser.parse_args()

    projects = [args.project] if args.project else None
    base_keys = load_base_keys()

    if args.locale:
        locales = [args.locale]
    else:
        locales = get_locales(args.project)

    total_errors = 0
    total_files = 0

    for locale in locales:
        files = count_files(locale, projects)
        total_files += files

        errors = validate_locale(locale, base_keys if locale != 'en' else set(), projects)

        if errors:
            print(f"\n[{locale}] {len(errors)} error(s):")
            for error in errors:
                print(f"  - {error.get('file', '')}: {error['message']}")
            total_errors += len(errors)
        else:
            print(f"[{locale}] OK ({files} files)")

    print(f"\n{'=' * 50}")
    print(f"Total: {total_files} files, {total_errors} errors")
    print(f"Status: {'FAIL' if total_errors > 0 else 'PASS'}")

    if args.strict and total_errors > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
