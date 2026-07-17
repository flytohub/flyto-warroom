#!/usr/bin/env python3
"""
fix-hardcoded-strings.py - Convert hardcoded English strings to i18n t() calls

Reads the known hardcoded string locations and:
1. Replaces them with t('key') or tOr('key', 'fallback') calls
2. Adds the new keys to flyto-i18n locales
3. Ensures t/tOr import is present in each file
"""

import json
import re
import sys
from pathlib import Path

CODE_ROOT = Path(__file__).parent.parent
SRC = CODE_ROOT / 'src'
I18N_ROOT = CODE_ROOT.parent / 'flyto-i18n'
I18N_FILE = I18N_ROOT / 'locales' / 'code' / 'en' / 'code.json'
ZH_FILE = I18N_ROOT / 'locales' / 'code' / 'zh-TW' / 'code.json'

# ── Mapping: (file, line) -> (old_text, i18n_key, en_value, zh_value, replacement_type) ──
# replacement_type: 'attr' = attr="text" -> attr={t('key')}
#                   'jsx'  = >Text</ -> >{t('key')}</
#                   'template' = `text ${var}` -> tOr('key', 'text {var}')

FIXES = [
    # DashboardView.tsx
    ('src/components/compounds/dashboard/DashboardView.tsx', 'label="Secrets"', 'label={t(\'dashboard.chartSecrets\')}', 'dashboard.chartSecrets', 'Secrets', '機密資訊'),
    ('src/components/compounds/dashboard/DashboardView.tsx', 'label="Dead"', 'label={t(\'dashboard.chartDead\')}', 'dashboard.chartDead', 'Dead', '死碼'),
    ('src/components/compounds/dashboard/DashboardView.tsx', 'label="Complex"', 'label={t(\'dashboard.chartComplex\')}', 'dashboard.chartComplex', 'Complex', '複雜度'),
    ('src/components/compounds/dashboard/DashboardView.tsx', 'label="Taint"', 'label={t(\'dashboard.chartTaint\')}', 'dashboard.chartTaint', 'Taint', '汙點'),

    # DomainTable.tsx
    ('src/components/compounds/domains/DomainTable.tsx', 'label="Subscribe"', 'label={t(\'domains.subscribe\')}', 'domains.subscribe', 'Subscribe', '訂閱'),

    # GroupedDomainList.tsx - label and aria-label on same line
    ('src/components/compounds/domains/GroupedDomainList.tsx', 'label="Delete" aria-label="Delete"', 'label={t(\'common.delete\')} aria-label={t(\'common.delete\')}', None, None, None),

    # AiPanel.tsx
    ('src/components/compounds/layout/AiPanel.tsx', 'title="Collapse"', 'title={t(\'common.collapse\')}', 'common.collapse', 'Collapse', '收合'),
    ('src/components/compounds/layout/AiPanel.tsx', 'label="Collapse studio panel" aria-label="Collapse studio panel"', 'label={t(\'layout.collapseStudio\')} aria-label={t(\'layout.collapseStudio\')}', 'layout.collapseStudio', 'Collapse studio panel', '收合工作室面板'),

    # SectionNav.tsx
    ('src/components/compounds/layout/SectionNav.tsx', 'title="Expand"', 'title={t(\'common.expand\')}', 'common.expand', 'Expand', '展開'),
    ('src/components/compounds/layout/SectionNav.tsx', 'title="Collapse"', 'title={t(\'common.collapse\')}', None, None, None),

    # UniversalFindingPanel.tsx
    ('src/components/compounds/security/UniversalFindingPanel.tsx', 'label="Overview"', 'label={t(\'common.overview\')}', 'common.overview', 'Overview', '總覽'),
    ('src/components/compounds/security/UniversalFindingPanel.tsx', 'label="Activity"', 'label={t(\'findings.activity\')}', 'findings.activity', 'Activity', '活動'),
    ('src/components/compounds/security/UniversalFindingPanel.tsx', 'label="Context"', 'label={t(\'findings.context\')}', 'findings.context', 'Context', '上下文'),

    # GeneralTab.tsx
    ('src/components/compounds/settings/GeneralTab.tsx', 'label="Dark Only"', 'label={t(\'settings.darkOnly\')}', 'settings.darkOnly', 'Dark Only', '僅深色模式'),

    # NotificationsTab.tsx
    ('src/components/compounds/settings/NotificationsTab.tsx', 'label="Active"', 'label={t(\'common.active\')}', 'common.active', 'Active', '啟用'),

    # ScanningTab.tsx
    ('src/components/compounds/settings/ScanningTab.tsx', 'label="Recommended"', 'label={t(\'settings.recommended\')}', 'settings.recommended', 'Recommended', '建議'),
    ('src/components/compounds/settings/ScanningTab.tsx', 'label="Always on"', 'label={t(\'settings.alwaysOn\')}', 'settings.alwaysOn', 'Always on', '永遠啟用'),

    # ScoringView.tsx
    ('src/components/compounds/warroom/scoring/ScoringView.tsx', '>Repository</', '>{t(\'common.repository\')}</', 'common.repository', 'Repository', '儲存庫'),
    ('src/components/compounds/warroom/scoring/ScoringView.tsx', '>Detail</', '>{t(\'common.detail\')}</', 'common.detail', 'Detail', '詳細'),

    # Sidebar.tsx
    ('src/components/layouts/Sidebar.tsx', '>AI-Powered Codebase Intelligence</', '>{t(\'app.subtitle\')}</', None, None, None),  # already exists
    ('src/components/layouts/Sidebar.tsx', '>Navigation</', '>{t(\'layout.navigation\')}</', 'layout.navigation', 'Navigation', '導覽'),

    # Topbar.tsx
    ('src/components/layouts/Topbar.tsx', 'alt="Warroom"', 'alt={t(\'app.warroom\')}', 'app.warroom', 'Warroom', '戰情室'),
    ('src/components/layouts/Topbar.tsx', '>Warroom</', '>{t(\'app.warroom\')}</', None, None, None),

    # PulseView.tsx template literals
    ('src/components/compounds/pulse/PulseView.tsx', '`Blast radius ${blast}/100`', 'tOr(\'pulse.blastRadiusScore\', \'Blast radius {blast}/100\').replace(\'{blast}\', String(blast))', 'pulse.blastRadiusScore', 'Blast radius {blast}/100', '爆炸半徑 {blast}/100'),
    ('src/components/compounds/pulse/PulseView.tsx', '`${withAutofix.length} AutoFix ready`', 'tOr(\'pulse.autofixReady\', \'{n} AutoFix ready\').replace(\'{n}\', String(withAutofix.length))', 'pulse.autofixReady', '{n} AutoFix ready', '{n} 個可使用 AutoFix'),

    # RepoDetailView.tsx
    ('src/components/compounds/repo/RepoDetailView.tsx', '`Open ${repo.fullName ?? repoId} on GitHub`', 'tOr(\'repo.openOnGithub\', \'Open {name} on GitHub\').replace(\'{name}\', repo.fullName ?? repoId)', 'repo.openOnGithub', 'Open {name} on GitHub', '在 GitHub 上開啟 {name}'),

    # SecurityOverview.tsx
    ('src/components/compounds/warroom/SecurityOverview.tsx', '`Secrets ${sevStats.secrets}`', 'tOr(\'warroom.secretsCount\', \'Secrets {n}\').replace(\'{n}\', String(sevStats.secrets))', 'warroom.secretsCount', 'Secrets {n}', '機密資訊 {n}'),
]


def apply_fixes():
    """Apply all string replacements to source files."""
    files_modified = set()

    for entry in FIXES:
        filepath_str, old_text, new_text = entry[0], entry[1], entry[2]
        filepath = CODE_ROOT / filepath_str.replace('/', '\\') if sys.platform == 'win32' else CODE_ROOT / filepath_str

        if not filepath.exists():
            # Try with forward slashes
            filepath = CODE_ROOT / filepath_str
            if not filepath.exists():
                print(f'  SKIP: {filepath_str} not found')
                continue

        content = filepath.read_text(encoding='utf-8')
        if old_text not in content:
            print(f'  SKIP: "{old_text[:40]}..." not found in {filepath_str}')
            continue

        # Only replace first occurrence to avoid over-replacing
        content = content.replace(old_text, new_text, 1)
        filepath.write_text(content, encoding='utf-8')
        files_modified.add(filepath_str)
        print(f'  FIXED: {filepath_str} — "{old_text[:40]}..."')

    return files_modified


def add_i18n_keys():
    """Add new i18n keys to locale files."""
    # Load existing
    with open(I18N_FILE, encoding='utf-8') as f:
        en_data = json.load(f)
    with open(ZH_FILE, encoding='utf-8') as f:
        zh_data = json.load(f)

    en_trans = en_data['translations']
    zh_trans = zh_data['translations']

    added = 0
    for entry in FIXES:
        if len(entry) < 6 or entry[3] is None:
            continue
        key, en_val, zh_val = entry[3], entry[4], entry[5]
        i18n_key = f'code.{key}'

        if i18n_key not in en_trans:
            en_trans[i18n_key] = en_val
            zh_trans[i18n_key] = zh_val
            added += 1
            print(f'  KEY: {i18n_key} = "{en_val}" / "{zh_val}"')

    if added > 0:
        en_data['translations'] = dict(sorted(en_trans.items()))
        zh_data['translations'] = dict(sorted(zh_trans.items()))

        with open(I18N_FILE, 'w', encoding='utf-8') as f:
            json.dump(en_data, f, indent=4, ensure_ascii=False)
            f.write('\n')
        with open(ZH_FILE, 'w', encoding='utf-8') as f:
            json.dump(zh_data, f, indent=4, ensure_ascii=False)
            f.write('\n')

    return added


def ensure_imports(files_modified: set):
    """Ensure t/tOr is imported in modified files."""
    for filepath_str in files_modified:
        filepath = CODE_ROOT / filepath_str
        content = filepath.read_text(encoding='utf-8')

        # Check if t is already imported
        has_t_import = bool(re.search(r"import\s+\{[^}]*\bt\b[^}]*\}\s+from\s+['\"]@lib/i18n['\"]", content))
        has_tOr_import = bool(re.search(r"import\s+\{[^}]*\btOr\b[^}]*\}\s+from\s+['\"]@lib/i18n['\"]", content))

        needs_t = 't(' in content and not has_t_import
        needs_tOr = 'tOr(' in content and not has_tOr_import

        if needs_t or needs_tOr:
            # Check if there's already an i18n import we can extend
            existing = re.search(r"(import\s+\{)([^}]*?)(\}\s+from\s+['\"]@lib/i18n['\"])", content)
            if existing:
                imports = existing.group(2).strip().rstrip(',')
                import_list = [s.strip() for s in imports.split(',')]
                if needs_t and 't' not in import_list:
                    import_list.append('t')
                if needs_tOr and 'tOr' not in import_list:
                    import_list.append('tOr')
                new_import = f"{existing.group(1)} {', '.join(import_list)} {existing.group(3)}"
                content = content[:existing.start()] + new_import + content[existing.end():]
            else:
                # Add new import after the last import line
                funcs = []
                if needs_t:
                    funcs.append('t')
                if needs_tOr:
                    funcs.append('tOr')
                import_line = f"import {{ {', '.join(funcs)} }} from '@lib/i18n'\n"

                # Find last import
                last_import = 0
                for m in re.finditer(r'^import\s.+$', content, re.MULTILINE):
                    last_import = m.end()
                if last_import:
                    content = content[:last_import] + '\n' + import_line + content[last_import:]
                else:
                    content = import_line + content

            filepath.write_text(content, encoding='utf-8')
            print(f'  IMPORT: added t/tOr import to {filepath_str}')


def main():
    print('=== Step 1: Add i18n keys ===')
    added = add_i18n_keys()
    print(f'  Added {added} new keys\n')

    print('=== Step 2: Replace hardcoded strings ===')
    files_modified = apply_fixes()
    print(f'  Modified {len(files_modified)} files\n')

    print('=== Step 3: Ensure imports ===')
    ensure_imports(files_modified)
    print()

    print('=== Done! ===')
    print('Next steps:')
    print('  1. cd ../flyto-i18n && python scripts/sync-locales.py')
    print('  2. python scripts/build-dist.py')
    print('  3. Run detect-hardcoded-strings.py again to verify')


if __name__ == '__main__':
    main()
