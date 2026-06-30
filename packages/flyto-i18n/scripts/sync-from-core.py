#!/usr/bin/env python3
"""
sync-from-core.py - Sync i18n keys from flyto-core

This script scans flyto-core modules and extracts all i18n keys,
then updates the English base locale files.

Features:
- Adds new keys from flyto-core
- Updates existing key values
- DELETES keys that no longer exist in flyto-core (cleanup)
- Extracts params_schema simple format (array -> dropdown options)

Usage:
    python scripts/sync-from-core.py [--core-path PATH] [--dry-run]

Options:
    --core-path    Path to flyto-core (default: ../flyto-core)
    --dry-run      Show changes without writing files
"""

import argparse
import ast
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'
MODULES_EN_DIR = LOCALES_DIR / 'modules' / 'en'
SHARED_EN_DIR = LOCALES_DIR / 'shared' / 'en'


# ============================================
# Key Extraction
# ============================================

def extract_keys_from_file(file_path: Path) -> List[Dict[str, str]]:
    """Extract i18n keys from a Python file."""
    keys = []

    try:
        with open(file_path) as f:
            content = f.read()
    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}")
        return keys

    key_patterns = [
        (r"label_key\s*=\s*['\"]([^'\"]+)['\"]", 'label'),
        (r"description_key\s*=\s*['\"]([^'\"]+)['\"]", 'description'),
        (r"'label_key'\s*:\s*['\"]([^'\"]+)['\"]", 'label'),
        (r"'description_key'\s*:\s*['\"]([^'\"]+)['\"]", 'description'),
    ]

    value_patterns = [
        (r"label\s*=\s*['\"]([^'\"]+)['\"]", 'label'),
        (r"description\s*=\s*['\"]([^'\"]+)['\"]", 'description'),
        (r"'label'\s*:\s*['\"]([^'\"]+)['\"]", 'label'),
        (r"'description'\s*:\s*['\"]([^'\"]+)['\"]", 'description'),
    ]

    for key_pattern, field_type in key_patterns:
        for match in re.finditer(key_pattern, content):
            key = match.group(1)

            if '{' in key or '(' in key or '$' in key or '`' in key:
                continue

            value = key.split('.')[-1].replace('_', ' ').title()

            key_pos = match.start()
            start = max(0, key_pos - 500)
            end = min(len(content), match.end() + 500)
            context = content[start:end]

            best_value = None
            best_distance = float('inf')

            for val_pattern, val_type in value_patterns:
                if val_type == field_type:
                    for val_match in re.finditer(val_pattern, context):
                        val_abs_pos = start + val_match.start()
                        distance = abs(val_abs_pos - key_pos)
                        if distance < best_distance:
                            best_distance = distance
                            best_value = val_match.group(1)

            if best_value is not None:
                value = best_value

            keys.append({
                'key': key,
                'value': value,
                'type': field_type,
                'source': str(file_path)
            })

    params_keys = extract_params_schema_keys(content, file_path)
    keys.extend(params_keys)

    return keys


def extract_params_schema_keys(content: str, file_path: Path) -> List[Dict[str, str]]:
    """Extract i18n keys from params_schema definitions."""
    keys = []

    module_id_match = re.search(r"module_id\s*=\s*['\"]([^'\"]+)['\"]", content)
    if not module_id_match:
        return keys

    module_id = module_id_match.group(1)

    params_schema = extract_params_schema_dict(content)
    if not params_schema:
        return keys

    for param_name, param_value in params_schema.items():
        if param_name in SKIP_PARAM_NAMES:
            continue

        param_key = f"modules.{module_id}.params.{param_name}"
        param_label = format_label(param_name)
        keys.append({
            'key': param_key,
            'value': param_label,
            'type': 'param',
            'source': str(file_path)
        })

        if isinstance(param_value, list) and all(isinstance(v, str) for v in param_value):
            if is_enum_like_array(param_value):
                for option_value in param_value:
                    option_key = f"{param_key}.options.{option_value}"
                    option_label = format_label(option_value)
                    keys.append({
                        'key': option_key,
                        'value': option_label,
                        'type': 'param_option',
                        'source': str(file_path)
                    })

        elif isinstance(param_value, dict) and 'enum' in param_value:
            for option_value in param_value['enum']:
                option_key = f"{param_key}.options.{option_value}"
                option_label = format_label(str(option_value))
                keys.append({
                    'key': option_key,
                    'value': option_label,
                    'type': 'param_option',
                    'source': str(file_path)
                })

    return keys


SKIP_PARAM_NAMES = {
    'data', 'content', 'text', 'items', 'values', 'array', 'list',
    'documents', 'records', 'rows', 'entries', 'messages', 'args',
    'params', 'options', 'config', 'settings', 'images', 'files',
    'default', 'json_path_exists', 'bmp', 'gif', 'ico', 'png', 'jpg',
    'enum', 'contents', 'description', 'description_key', 'comments',
    'approved_by', 'custom_fields'
}


def is_enum_like_array(values: List[str]) -> bool:
    """Check if array values look like enum options vs example data."""
    if not values or len(values) < 2:
        return False
    if len(values) > 10:
        return False

    for val in values:
        if len(val) <= 1:
            return False
        if val[0].isupper() and val[1:].islower() and len(val) < 10:
            if val.lower() in COMMON_NAMES:
                return False
        if val.startswith('/') or val.startswith('.'):
            return False
        if val.isdigit():
            return False

    return True


COMMON_NAMES = {
    'alice', 'bob', 'charlie', 'david', 'eve', 'frank', 'grace',
    'jane', 'john', 'mary', 'mike', 'tom', 'anna', 'james', 'sarah'
}


def extract_params_schema_dict(content: str) -> Dict[str, Any]:
    """Try to extract params_schema as a Python dict."""
    patterns = [
        r"params_schema\s*=\s*(\{[^}]+\})",
        r"'params_schema'\s*:\s*(\{[^}]+\})",
        r"params_schema\s*=\s*compose\([^)]+\)",
    ]

    for pattern in patterns:
        match = re.search(pattern, content, re.DOTALL)
        if match:
            try:
                dict_str = match.group(1) if match.lastindex else None
                if dict_str:
                    return ast.literal_eval(dict_str)
            except (ValueError, SyntaxError):
                pass

    result = {}
    array_pattern = r"['\"](\w+)['\"]\s*:\s*\[([^\]]+)\]"
    for match in re.finditer(array_pattern, content):
        param_name = match.group(1)
        array_content = match.group(2)
        values = re.findall(r"['\"]([^'\"]+)['\"]", array_content)
        if values:
            result[param_name] = values

    return result


def format_label(key: str) -> str:
    """Convert snake_case or kebab-case to Title Case."""
    return key.replace('_', ' ').replace('-', ' ').title()


# ============================================
# Module Scanning
# ============================================

def scan_core_modules(core_path: Path) -> Dict[str, str]:
    """Scan all modules in flyto-core and extract keys."""
    modules_dir = core_path / 'src' / 'core' / 'modules'

    if not modules_dir.exists():
        print(f"Error: Modules directory not found: {modules_dir}")
        sys.exit(1)

    all_keys = {}

    for py_file in modules_dir.rglob('*.py'):
        if '__pycache__' in str(py_file):
            continue

        keys = extract_keys_from_file(py_file)
        for item in keys:
            all_keys[item['key']] = item['value']

    return all_keys


# ============================================
# File Organization
# ============================================

def group_by_category(keys: Dict[str, str]) -> Dict[str, Dict[str, str]]:
    """Group keys by category for separate files."""
    grouped = defaultdict(dict)

    for key, value in keys.items():
        parts = key.split('.')
        if len(parts) >= 2:
            if parts[0] == 'modules':
                category = parts[1]
            elif parts[0] == 'common':
                category = 'common'
            elif parts[0] == 'schema':
                category = 'other'
            else:
                category = 'other'
        else:
            category = 'other'

        grouped[category][key] = value

    return dict(grouped)


def load_existing_keys() -> Dict[str, Set[str]]:
    """Load existing keys from modules and shared locale files."""
    existing = defaultdict(set)

    # Load from modules/en/
    if MODULES_EN_DIR.exists():
        for json_file in MODULES_EN_DIR.glob('*.json'):
            try:
                with open(json_file) as f:
                    data = json.load(f)
                category = data.get('category', 'other')
                translations = data.get('translations', {})
                existing[category] = set(translations.keys())
            except Exception as e:
                print(f"Warning: Could not read {json_file}: {e}")

    # Load from shared/en/ (for common.json)
    common_file = SHARED_EN_DIR / 'common.json'
    if common_file.exists():
        try:
            with open(common_file) as f:
                data = json.load(f)
            existing['common'] = set(data.get('translations', {}).keys())
        except Exception as e:
            print(f"Warning: Could not read {common_file}: {e}")

    return dict(existing)


def write_locale_files(
    grouped_keys: Dict[str, Dict[str, str]],
    existing_keys: Dict[str, Set[str]],
    dry_run: bool = False,
    no_delete: bool = False
) -> Dict[str, Dict]:
    """Write grouped keys to locale files. Returns stats."""
    MODULES_EN_DIR.mkdir(parents=True, exist_ok=True)
    SHARED_EN_DIR.mkdir(parents=True, exist_ok=True)

    stats = {
        'added': 0,
        'updated': 0,
        'deleted': 0,
        'preserved': 0,
        'categories': {}
    }

    all_categories = set(grouped_keys.keys()) | set(existing_keys.keys())

    for category in all_categories:
        new_translations = grouped_keys.get(category, {})
        old_keys = existing_keys.get(category, set())
        new_keys = set(new_translations.keys())

        added = new_keys - old_keys
        deleted = old_keys - new_keys if not no_delete else set()
        preserved = old_keys - new_keys if no_delete else set()

        cat_stats = {
            'added': len(added),
            'deleted': len(deleted),
            'preserved': len(preserved),
            'total': len(new_translations)
        }
        stats['categories'][category] = cat_stats
        stats['added'] += len(added)
        stats['deleted'] += len(deleted)
        stats['preserved'] += len(preserved)

        # Determine target directory and filename
        if category == 'common':
            target_dir = SHARED_EN_DIR
            filename = 'common.json'
        else:
            target_dir = MODULES_EN_DIR
            filename = f"{category}.json"

        file_path = target_dir / filename

        if not new_translations and not no_delete:
            if file_path.exists():
                if dry_run:
                    print(f"Would DELETE {file_path} (all keys removed)")
                else:
                    file_path.unlink()
                    print(f"DELETED {file_path} (all keys removed)")
            continue

        if not new_translations:
            continue

        data = {
            "$schema": "../../../schema/locale.schema.json",
            "locale": "en",
            "category": category,
            "version": "1.0.0",
            "translations": dict(sorted(new_translations.items()))
        }

        change_info = []
        if added:
            change_info.append(f"+{len(added)} added")
        if deleted:
            change_info.append(f"-{len(deleted)} deleted")
        change_str = f" ({', '.join(change_info)})" if change_info else ""

        if dry_run:
            print(f"Would write {file_path}: {len(new_translations)} keys{change_str}")
            if added:
                for key in sorted(added)[:5]:
                    print(f"  + ADD: {key}")
                if len(added) > 5:
                    print(f"  ... and {len(added) - 5} more")
            if deleted:
                for key in sorted(deleted)[:5]:
                    print(f"  - DELETE: {key}")
                if len(deleted) > 5:
                    print(f"  ... and {len(deleted) - 5} more")
        else:
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Wrote {file_path}: {len(new_translations)} keys{change_str}")

    return stats


# ============================================
# Main
# ============================================

def main():
    parser = argparse.ArgumentParser(description='Sync keys from flyto-core')
    parser.add_argument('--core-path', default='../flyto-core',
                        help='Path to flyto-core')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show changes without writing')
    parser.add_argument('--no-delete', action='store_true',
                        help='Do not delete keys that are not in core (preserve cloud UI keys)')
    args = parser.parse_args()

    core_path = Path(args.core_path).resolve()
    if not core_path.exists():
        print(f"Error: flyto-core not found at {core_path}")
        sys.exit(1)

    print(f"Scanning flyto-core at: {core_path}")
    print()

    existing_keys = load_existing_keys()
    existing_count = sum(len(keys) for keys in existing_keys.values())
    print(f"Existing keys in flyto-i18n: {existing_count}")

    all_keys = scan_core_modules(core_path)
    print(f"Found {len(all_keys)} i18n keys in flyto-core")

    grouped = group_by_category(all_keys)
    print(f"Categories: {list(grouped.keys())}")
    print()

    stats = write_locale_files(
        grouped, existing_keys,
        dry_run=args.dry_run,
        no_delete=getattr(args, 'no_delete', False)
    )

    print()
    print("=" * 50)
    summary_parts = [f"+{stats['added']} added"]
    if stats['deleted'] > 0:
        summary_parts.append(f"-{stats['deleted']} deleted")
    if stats.get('preserved', 0) > 0:
        summary_parts.append(f"~{stats['preserved']} preserved")
    print(f"Summary: {', '.join(summary_parts)}")
    print("=" * 50)
    print("\nSync complete!")


if __name__ == '__main__':
    main()
