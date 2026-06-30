#!/usr/bin/env python3
"""
translate-with-openai.py - Translate i18n files using OpenAI

Usage:
    python scripts/translate-with-openai.py --target zh-TW [--project cloud] [--file ui.json] [--force]

Features:
- Uses GPT-4o for natural, colloquial translations
- Translates only empty values by default (use --force to re-translate all)
- Batch processing to reduce API calls and maintain context
- Preserves technical terms and placeholders like {variable}

Requirements:
    pip install openai
    export OPENAI_API_KEY=sk-xxx
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not installed")
    print("Run: pip install openai")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'

# All project directories
PROJECT_DIRS = ['cloud', 'modules', 'landing', 'shared', 'app', 'code', 'console', 'data', 'engine']

# Batch size for API calls (too large may hit token limits)
BATCH_SIZE = 50

# Target language configurations
LANGUAGE_CONFIG = {
    'zh-TW': {
        'name': '繁體中文',
        'style': '台灣用語，口語自然，避免中國大陸用語',
        'examples': {
            'Submit': '送出',
            'File': '檔案',
            'Video': '影片',
            'Software': '軟體',
            'Information': '資訊',
            'Network': '網路',
            'Memory': '記憶體',
            'Print': '列印',
            'Execute': '執行',
            'Settings': '設定',
            'Default': '預設',
            'Support': '支援',
            'Quality': '品質',
            'Program': '程式',
            'Data': '資料',
            'Server': '伺服器',
            'Client': '用戶端',
            'Placeholder': '提示文字',
            'Overlay': '彈出視窗',
            'Modal': '對話框',
            'Tooltip': '提示',
            'Dropdown': '下拉選單',
            'Toggle': '開關',
            'Checkbox': '勾選框',
            'Tab': '分頁',
            'Panel': '面板',
            'Sidebar': '側邊欄',
            'Header': '標題列',
            'Footer': '頁尾',
            'Badge': '標記',
            'Avatar': '頭像',
            'Icon': '圖示',
            'Button': '按鈕',
            'Input': '輸入框',
            'Label': '標籤',
            'Rollback': '復原',
            'Undo': '復原',
            'Redo': '重做',
            'Retry': '重試',
            'Cancel': '取消',
            'Confirm': '確認',
            'Delete': '刪除',
            'Remove': '移除',
            'Add': '新增',
            'Edit': '編輯',
            'Save': '儲存',
            'Update': '更新',
            'Refresh': '重新整理',
            'Loading': '載入中',
            'Processing': '處理中',
            'Pending': '待處理',
            'Completed': '已完成',
            'Failed': '失敗',
            'Success': '成功',
            'Enabled': '已啟用',
            'Disabled': '已停用',
            'Active': '使用中',
            'Inactive': '未使用',
            'Online': '上線',
            'Offline': '離線',
            'API': 'API',
            'JSON': 'JSON',
            'URL': 'URL',
            'HTTP': 'HTTP',
            'AI': 'AI',
            'ID': 'ID',
        },
        'rules': [
            '當 key 以 Placeholder 結尾時，翻成「...的提示文字」或直接省略 Placeholder',
            '當 key 以 Overlay 結尾時，翻成「...視窗」或「...面板」',
            'Rollback 翻成「復原」而非「回復」（回復是 reply 的意思）',
            'Iteration 在 UI 上下文翻成「第 N 次」或「回合」',
        ]
    },
    'zh-CN': {
        'name': '简体中文',
        'style': '中国大陆用语，简洁口语化',
        'examples': {
            'Submit': '提交',
            'File': '文件',
            'Settings': '设置',
        }
    },
    'ja': {
        'name': '日本語',
        'style': '自然な日本語、敬語は使わない、簡潔に',
        'examples': {
            'Submit': '送信',
            'Save': '保存',
            'Cancel': 'キャンセル',
            'Delete': '削除',
            'Edit': '編集',
            'Settings': '設定',
        }
    },
    'ko': {
        'name': '한국어',
        'style': '자연스러운 한국어, 존댓말 사용, 간결하게',
        'examples': {
            'Submit': '제출',
            'Save': '저장',
            'Cancel': '취소',
            'Delete': '삭제',
        }
    },
    'de': {
        'name': 'Deutsch',
        'style': 'Natürliches Deutsch, informell (Sie-Form), prägnant',
        'examples': {
            'Submit': 'Absenden',
            'Save': 'Speichern',
            'Cancel': 'Abbrechen',
            'Delete': 'Löschen',
            'Settings': 'Einstellungen',
        }
    },
    'fr': {
        'name': 'Français',
        'style': 'Français naturel, vouvoiement, concis',
        'examples': {
            'Submit': 'Envoyer',
            'Save': 'Enregistrer',
            'Cancel': 'Annuler',
            'Delete': 'Supprimer',
            'Settings': 'Paramètres',
        }
    },
    'es': {
        'name': 'Español',
        'style': 'Español natural, tuteo, conciso',
        'examples': {
            'Submit': 'Enviar',
            'Save': 'Guardar',
            'Cancel': 'Cancelar',
            'Delete': 'Eliminar',
            'Settings': 'Configuración',
        }
    },
    'it': {
        'name': 'Italiano',
        'style': 'Italiano naturale, formale (Lei), conciso',
        'examples': {
            'Submit': 'Invia',
            'Save': 'Salva',
            'Cancel': 'Annulla',
            'Delete': 'Elimina',
            'Settings': 'Impostazioni',
        }
    },
    'pt-BR': {
        'name': 'Português (Brasil)',
        'style': 'Português brasileiro natural, informal (você), conciso',
        'examples': {
            'Submit': 'Enviar',
            'Save': 'Salvar',
            'Cancel': 'Cancelar',
            'Delete': 'Excluir',
            'Settings': 'Configurações',
        }
    },
    'pl': {
        'name': 'Polski',
        'style': 'Naturalny polski, formalny (Pan/Pani), zwięzły',
        'examples': {
            'Submit': 'Wyślij',
            'Save': 'Zapisz',
            'Cancel': 'Anuluj',
            'Delete': 'Usuń',
            'Settings': 'Ustawienia',
        }
    },
    'tr': {
        'name': 'Türkçe',
        'style': 'Doğal Türkçe, resmi (siz), kısa ve öz',
        'examples': {
            'Submit': 'Gönder',
            'Save': 'Kaydet',
            'Cancel': 'İptal',
            'Delete': 'Sil',
            'Settings': 'Ayarlar',
        }
    },
    'vi': {
        'name': 'Tiếng Việt',
        'style': 'Tiếng Việt tự nhiên, lịch sự, ngắn gọn',
        'examples': {
            'Submit': 'Gửi',
            'Save': 'Lưu',
            'Cancel': 'Hủy',
            'Delete': 'Xóa',
            'Settings': 'Cài đặt',
        }
    },
    'th': {
        'name': 'ภาษาไทย',
        'style': 'ภาษาไทยที่เป็นธรรมชาติ สุภาพ กระชับ',
        'examples': {
            'Submit': 'ส่ง',
            'Save': 'บันทึก',
            'Cancel': 'ยกเลิก',
            'Delete': 'ลบ',
            'Settings': 'ตั้งค่า',
        }
    },
    'id': {
        'name': 'Bahasa Indonesia',
        'style': 'Bahasa Indonesia alami, formal, ringkas',
        'examples': {
            'Submit': 'Kirim',
            'Save': 'Simpan',
            'Cancel': 'Batal',
            'Delete': 'Hapus',
            'Settings': 'Pengaturan',
        }
    },
    'hi': {
        'name': 'हिन्दी',
        'style': 'प्राकृतिक हिंदी, औपचारिक (आप), संक्षिप्त',
        'examples': {
            'Submit': 'जमा करें',
            'Save': 'सहेजें',
            'Cancel': 'रद्द करें',
            'Delete': 'हटाएं',
            'Settings': 'सेटिंग्स',
        }
    },
}


def get_system_prompt(target_locale: str) -> str:
    """Generate system prompt for translation."""
    config = LANGUAGE_CONFIG.get(target_locale, {
        'name': target_locale,
        'style': 'natural and colloquial',
        'examples': {},
        'rules': []
    })

    examples_text = ""
    if config.get('examples'):
        examples_text = "\n\n## 詞彙對照（必須使用）\n"
        for en, translated in config['examples'].items():
            examples_text += f"- {en} → {translated}\n"

    rules_text = ""
    if config.get('rules'):
        rules_text = "\n\n## 特殊規則\n"
        for rule in config['rules']:
            rules_text += f"- {rule}\n"

    return f"""你是專業的 UI 翻譯專家，負責將軟體介面文字從英文翻譯成{config['name']}。

## 翻譯原則
1. 口語化 - 使用日常對話的自然用語，不要太書面或生硬
2. 精準 - 準確傳達原意，不要增加或省略資訊
3. 簡潔 - UI 文字要短，能省字就省
4. 一致 - 相同概念用相同翻譯
5. 風格 - {config['style']}

## 重要：根據 Key 名稱推斷語意
輸入的 JSON value 可能是空字串，這時請根據 key 名稱推斷意思。
例如：
- key 是 "button.save" → 翻譯成「儲存」
- key 是 "status.loading" → 翻譯成「載入中」
- key 是 "error.networkFailed" → 翻譯成「網路連線失敗」
- key 是 "placeholder.enterEmail" → 翻譯成「請輸入電子郵件」（不要出現「佔位符」）

## 技術要求
- 保留 {{variable}} 和 ${{variable}} 等變數格式，不要翻譯
- 保留技術術語如 JSON, API, URL, HTTP, AI 等
- 保留 emoji 符號
- 不要加引號或其他格式{examples_text}{rules_text}

## 輸出格式
只回傳 JSON 物件，key 保持原樣，value 是翻譯結果。不要加任何說明文字。"""


def translate_batch(
    client: OpenAI,
    texts: Dict[str, str],
    target_locale: str,
    model: str = "gpt-4o"
) -> Dict[str, str]:
    """Translate a batch of texts using OpenAI."""

    system_prompt = get_system_prompt(target_locale)

    user_prompt = f"""請翻譯以下 JSON 的 value 部分（key 保持不變）：

```json
{json.dumps(texts, indent=2, ensure_ascii=False)}
```

只回傳翻譯後的 JSON，不要其他說明。"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        result_text = response.choices[0].message.content
        return json.loads(result_text)

    except Exception as e:
        print(f"  Error during translation: {e}")
        return {}


def _is_untranslated(existing: str, en_value: str) -> bool:
    """Check if a translation is just a copy of the English value."""
    if not existing or not en_value:
        return False
    if existing != en_value:
        return False
    if len(en_value) <= 3 or en_value.isupper():
        return False
    stripped = en_value.strip()
    if all(c in '0123456789.-+/%$€£¥:' for c in stripped):
        return False
    return True


def translate_file(
    client: OpenAI,
    en_file: Path,
    target_file: Path,
    target_locale: str,
    force: bool = False,
    dry_run: bool = False,
    model: str = "gpt-4o",
    untranslated: bool = False,
) -> Tuple[int, int]:
    """Translate a single file. Returns (translated_count, skipped_count)."""
    with open(en_file, encoding='utf-8') as f:
        en_data = json.load(f)

    en_translations = en_data.get('translations', {})

    if target_file.exists():
        with open(target_file, encoding='utf-8') as f:
            target_data = json.load(f)
        target_translations = target_data.get('translations', {})
    else:
        target_data = en_data.copy()
        target_data['locale'] = target_locale
        target_translations = {}

    to_translate = {}
    for key, en_value in en_translations.items():
        existing = target_translations.get(key, "")
        if force or not existing:
            to_translate[key] = en_value
        elif untranslated and _is_untranslated(existing, en_value):
            to_translate[key] = en_value

    if not to_translate:
        return 0, len(en_translations)

    if dry_run:
        print(f"  Would translate {len(to_translate)} keys")
        return len(to_translate), len(en_translations) - len(to_translate)

    translated_count = 0
    keys = list(to_translate.keys())

    for i in range(0, len(keys), BATCH_SIZE):
        batch_keys = keys[i:i + BATCH_SIZE]
        batch_texts = {k: to_translate[k] for k in batch_keys}

        print(f"  Translating batch {i // BATCH_SIZE + 1}/{(len(keys) + BATCH_SIZE - 1) // BATCH_SIZE}...")

        translations = translate_batch(client, batch_texts, target_locale, model)

        for key, translated in translations.items():
            if key in to_translate and translated:
                target_translations[key] = translated
                translated_count += 1

    target_data['translations'] = dict(sorted(target_translations.items()))
    target_data['locale'] = target_locale

    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    skipped = len(en_translations) - translated_count
    return translated_count, skipped


def main():
    parser = argparse.ArgumentParser(
        description='Translate i18n files using OpenAI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Translate all files to Traditional Chinese
    python scripts/translate-with-openai.py --target zh-TW

    # Translate specific project
    python scripts/translate-with-openai.py --target zh-TW --project cloud

    # Translate specific file in a project
    python scripts/translate-with-openai.py --target zh-TW --project cloud --file ui.json

    # Force re-translate all
    python scripts/translate-with-openai.py --target zh-TW --force

    # Preview without making changes
    python scripts/translate-with-openai.py --target zh-TW --dry-run
        """
    )
    parser.add_argument('--target', '-t', required=True,
                        help='Target locale (e.g., zh-TW, zh-CN, ja)')
    parser.add_argument('--project', '-p',
                        help='Translate specific project only (cloud, modules, landing, shared)')
    parser.add_argument('--file', '-f',
                        help='Translate specific file only (e.g., ui.json)')
    parser.add_argument('--force', action='store_true',
                        help='Re-translate all keys, including existing translations')
    parser.add_argument('--untranslated', '-u', action='store_true',
                        help='Detect and re-translate values identical to English source')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be translated without making changes')
    parser.add_argument('--model', default='gpt-4o',
                        help='OpenAI model to use (default: gpt-4o)')

    args = parser.parse_args()

    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key and not args.dry_run:
        print("Error: OPENAI_API_KEY environment variable not set")
        print("Run: export OPENAI_API_KEY=sk-xxx")
        sys.exit(1)

    client = OpenAI(api_key=api_key) if api_key else None

    print(f"Translating to: {args.target}")
    print(f"Model: {args.model}")
    mode = 'DRY RUN' if args.dry_run else ('FORCE' if args.force else ('UNTRANSLATED' if args.untranslated else 'NORMAL'))
    print(f"Mode: {mode}")
    print()

    total_translated = 0
    total_skipped = 0

    projects = [args.project] if args.project else PROJECT_DIRS

    for proj in projects:
        en_dir = LOCALES_DIR / proj / 'en'
        if not en_dir.exists():
            continue

        if args.file:
            en_files = [en_dir / args.file]
            if not en_files[0].exists():
                print(f"Error: File not found: {en_files[0]}")
                sys.exit(1)
        else:
            en_files = sorted(en_dir.glob('*.json'))

        if not en_files:
            continue

        print(f"[{proj}]")

        for en_file in en_files:
            target_file = LOCALES_DIR / proj / args.target / en_file.name

            print(f"  [{en_file.name}]")

            translated, skipped = translate_file(
                client=client,
                en_file=en_file,
                target_file=target_file,
                target_locale=args.target,
                force=args.force,
                dry_run=args.dry_run,
                model=args.model,
                untranslated=args.untranslated,
            )

            if translated == 0 and skipped > 0:
                print(f"    Already translated ({skipped} keys)")
            else:
                print(f"    Translated: {translated}, Skipped: {skipped}")

            total_translated += translated
            total_skipped += skipped

        print()

    print("=" * 50)
    print(f"Summary:")
    print(f"  Total translated: {total_translated}")
    print(f"  Total skipped:    {total_skipped}")
    print("=" * 50)

    if args.dry_run:
        print("\nRun without --dry-run to apply translations")


if __name__ == '__main__':
    main()
