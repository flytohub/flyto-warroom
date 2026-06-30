#!/usr/bin/env python3
"""Fix hardcoded English strings in src-next/ flyto business code."""
import json
import re
from pathlib import Path

CODE_ROOT = Path(__file__).parent.parent
I18N_FILE = CODE_ROOT.parent / 'flyto-i18n' / 'locales' / 'code' / 'en' / 'code.json'
ZH_FILE = CODE_ROOT.parent / 'flyto-i18n' / 'locales' / 'code' / 'zh-TW' / 'code.json'

# (file_path, old_string, new_string, i18n_key, en_value, zh_value)
# i18n_key=None means key already exists or is a brand name (skip i18n add)
FIXES = [
    # ── Auth: Firebase Sign In ──
    ('src-next/@auth/services/firebase/components/FirebaseSignInForm.tsx',
     'label="Email"', "label={t('auth.email')}", 'auth.email', 'Email', '電子郵件'),
    ('src-next/@auth/services/firebase/components/FirebaseSignInForm.tsx',
     'label="Password"', "label={t('auth.password')}", 'auth.password', 'Password', '密碼'),
    ('src-next/@auth/services/firebase/components/FirebaseSignInForm.tsx',
     'aria-label="Sign in"', "aria-label={t('auth.signIn')}", 'auth.signIn', 'Sign in', '登入'),

    # ── Auth: Firebase Sign Up ──
    ('src-next/@auth/services/firebase/components/FirebaseSignUpForm.tsx',
     'label="Email"', "label={t('auth.email')}", None, None, None),
    ('src-next/@auth/services/firebase/components/FirebaseSignUpForm.tsx',
     'label="Password"', "label={t('auth.password')}", None, None, None),
    ('src-next/@auth/services/firebase/components/FirebaseSignUpForm.tsx',
     'label="Password (Confirm)"', "label={t('auth.passwordConfirm')}", 'auth.passwordConfirm', 'Password (Confirm)', '密碼（確認）'),
    ('src-next/@auth/services/firebase/components/FirebaseSignUpForm.tsx',
     'aria-label="Register"', "aria-label={t('auth.register')}", 'auth.register', 'Register', '註冊'),

    # ── Auth: JWT Sign In ──
    ('src-next/@auth/services/jwt/components/JwtSignInForm.tsx',
     'label="Email"', "label={t('auth.email')}", None, None, None),
    ('src-next/@auth/services/jwt/components/JwtSignInForm.tsx',
     'label="Password"', "label={t('auth.password')}", None, None, None),
    ('src-next/@auth/services/jwt/components/JwtSignInForm.tsx',
     'label="Remember me"', "label={t('auth.rememberMe')}", 'auth.rememberMe', 'Remember me', '記住我'),
    ('src-next/@auth/services/jwt/components/JwtSignInForm.tsx',
     'aria-label="Sign in"', "aria-label={t('auth.signIn')}", None, None, None),

    # ── Auth: JWT Sign Up ──
    ('src-next/@auth/services/jwt/components/JwtSignUpForm.tsx',
     'label="Display name"', "label={t('auth.displayName')}", 'auth.displayName', 'Display name', '顯示名稱'),
    ('src-next/@auth/services/jwt/components/JwtSignUpForm.tsx',
     'label="Email"', "label={t('auth.email')}", None, None, None),
    ('src-next/@auth/services/jwt/components/JwtSignUpForm.tsx',
     'label="Password"', "label={t('auth.password')}", None, None, None),
    ('src-next/@auth/services/jwt/components/JwtSignUpForm.tsx',
     'label="Password (Confirm)"', "label={t('auth.passwordConfirm')}", None, None, None),
    ('src-next/@auth/services/jwt/components/JwtSignUpForm.tsx',
     'aria-label="Register"', "aria-label={t('auth.register')}", None, None, None),

    # ── Auth: Sign In Page Form ──
    ('src-next/app/(public)/(auth)/components/forms/SignInPageForm.tsx',
     '>Email address</FormLabel>', ">{t('auth.emailAddress')}</FormLabel>", 'auth.emailAddress', 'Email address', '電子郵件地址'),
    ('src-next/app/(public)/(auth)/components/forms/SignInPageForm.tsx',
     '>Password</FormLabel>', ">{t('auth.password')}</FormLabel>", None, None, None),
    ('src-next/app/(public)/(auth)/components/forms/SignInPageForm.tsx',
     'label="Remember me"', "label={t('auth.rememberMe')}", None, None, None),
    ('src-next/app/(public)/(auth)/components/forms/SignInPageForm.tsx',
     'aria-label="Sign in"', "aria-label={t('auth.signIn')}", None, None, None),

    # ── Auth: Page Titles ──
    ('src-next/app/(public)/(auth)/components/ui/AuthPagesMessageSection.tsx',
     '>Welcome to</div>', ">{t('auth.welcomeTo')}</div>", 'auth.welcomeTo', 'Welcome to', '歡迎來到'),
    ('src-next/app/(public)/(auth)/components/ui/SignInPageTitle.tsx',
     ">Don't have an account?</Typography>", ">{t('auth.noAccount')}</Typography>", 'auth.noAccount', "Don't have an account?", '還沒有帳號？'),
    ('src-next/app/(public)/(auth)/components/ui/SignUpPageTitle.tsx',
     '>Already have an account?</Typography>', ">{t('auth.hasAccount')}</Typography>", 'auth.hasAccount', 'Already have an account?', '已經有帳號？'),

    # ── Capability Page ──
    ('src-next/app/(control-panel)/flyto/capability/components/CapabilityPage.tsx',
     '>Capability not found</Typography>', ">{t('common.notFound')}</Typography>", 'common.notFound', 'Not found', '找不到'),

    # ── Changelog ──
    ('src-next/app/(control-panel)/flyto/resources/components/ChangelogPage.tsx',
     'label="Pre-release"', "label={t('changelog.preRelease')}", 'changelog.preRelease', 'Pre-release', '預覽版'),

    # ── Layout: FullScreenToggle ──
    ('src-next/components/theme-layouts/components/FullScreenToggle.tsx',
     'title="Fullscreen toggle"', "title={t('layout.fullscreenToggle')}", 'layout.fullscreenToggle', 'Fullscreen toggle', '全螢幕切換'),

    # ── Layout: NavbarToggleFab ──
    ('src-next/components/theme-layouts/components/navbar/NavbarToggleFab.tsx',
     'title="Show Navigation"', "title={t('layout.showNavigation')}", 'layout.showNavigation', 'Show Navigation', '顯示導覽'),

    # ── QuickPanel ──
    ('src-next/components/theme-layouts/components/quickPanel/QuickPanel.tsx',
     '>Today</ListSubheader>', ">{t('quickPanel.today')}</ListSubheader>", 'quickPanel.today', 'Today', '今天'),
    ('src-next/components/theme-layouts/components/quickPanel/QuickPanel.tsx',
     '>Events</ListSubheader>', ">{t('quickPanel.events')}</ListSubheader>", 'quickPanel.events', 'Events', '事件'),
    ('src-next/components/theme-layouts/components/quickPanel/QuickPanel.tsx',
     '>Notes</ListSubheader>', ">{t('quickPanel.notes')}</ListSubheader>", 'quickPanel.notes', 'Notes', '筆記'),
    ('src-next/components/theme-layouts/components/quickPanel/QuickPanel.tsx',
     '>Quick Settings</ListSubheader>', ">{t('quickPanel.quickSettings')}</ListSubheader>", 'quickPanel.quickSettings', 'Quick Settings', '快速設定'),
]

# Files that need t import added
NEEDS_IMPORT = set()


def add_i18n_keys():
    """Add new keys to en and zh-TW locale files."""
    with open(I18N_FILE, encoding='utf-8') as f:
        en_data = json.load(f)
    with open(ZH_FILE, encoding='utf-8') as f:
        zh_data = json.load(f)

    added = 0
    for entry in FIXES:
        if len(entry) < 6 or entry[3] is None:
            continue
        key, en_val, zh_val = entry[3], entry[4], entry[5]
        i18n_key = f'code.{key}'
        if i18n_key not in en_data['translations']:
            en_data['translations'][i18n_key] = en_val
            zh_data['translations'][i18n_key] = zh_val
            added += 1

    en_data['translations'] = dict(sorted(en_data['translations'].items()))
    zh_data['translations'] = dict(sorted(zh_data['translations'].items()))

    with open(I18N_FILE, 'w', encoding='utf-8') as f:
        json.dump(en_data, f, indent=4, ensure_ascii=False)
        f.write('\n')
    with open(ZH_FILE, 'w', encoding='utf-8') as f:
        json.dump(zh_data, f, indent=4, ensure_ascii=False)
        f.write('\n')

    return added


def apply_fixes():
    """Replace hardcoded strings in source files."""
    modified = set()
    for entry in FIXES:
        filepath_str, old, new = entry[0], entry[1], entry[2]
        filepath = CODE_ROOT / filepath_str

        if not filepath.exists():
            print(f'  SKIP: {filepath_str} not found')
            continue

        content = filepath.read_text(encoding='utf-8')
        if old not in content:
            print(f'  SKIP: "{old[:50]}" not in {filepath_str}')
            continue

        content = content.replace(old, new, 1)
        filepath.write_text(content, encoding='utf-8')
        modified.add(filepath_str)
        NEEDS_IMPORT.add(filepath_str)
        print(f'  OK: {filepath_str}')

    return modified


def ensure_imports():
    """Add t import to files that need it."""
    for filepath_str in NEEDS_IMPORT:
        filepath = CODE_ROOT / filepath_str
        content = filepath.read_text(encoding='utf-8')

        # Check if t is already imported from @lib/i18n
        if "from '@lib/i18n'" in content:
            continue

        # Add import after the last import line
        lines = content.split('\n')
        last_import_idx = 0
        for i, line in enumerate(lines):
            if line.strip().startswith('import '):
                last_import_idx = i

        import_line = "import { t } from '@lib/i18n'"
        lines.insert(last_import_idx + 1, import_line)
        filepath.write_text('\n'.join(lines), encoding='utf-8')
        print(f'  IMPORT: {filepath_str}')


if __name__ == '__main__':
    print('=== Adding i18n keys ===')
    n = add_i18n_keys()
    print(f'  Added {n} keys\n')

    print('=== Replacing hardcoded strings ===')
    modified = apply_fixes()
    print(f'\n  Modified {len(modified)} files\n')

    print('=== Adding imports ===')
    ensure_imports()

    print('\nDone!')
