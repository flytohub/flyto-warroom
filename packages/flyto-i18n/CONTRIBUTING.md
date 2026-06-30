# Contributing to flyto-i18n

Thank you for your interest in helping translate flyto! This guide will help you get started.

## Quick Start

1. **Fork** this repository
2. **Clone** your fork locally
3. **Create** or edit translation files
4. **Validate** your changes
5. **Submit** a Pull Request

## Translation File Format

Translation files are located in `locales/<locale>/` directory.

### File Structure

```json
{
  "$schema": "../../schema/locale.schema.json",
  "locale": "zh-TW",
  "category": "browser",
  "version": "1.0.0",
  "translations": {
    "modules.browser.click.label": "點擊元素",
    "modules.browser.click.description": "點擊頁面上指定的元素"
  }
}
```

### Key Format

Keys follow this pattern:
```
modules.{category}.{module_name}.{section}.{field}
```

Examples:
- `modules.browser.click.label` - Module label
- `modules.browser.click.description` - Module description
- `modules.browser.click.params.selector.label` - Parameter label
- `modules.browser.click.output.status.description` - Output field description

## Creating a New Locale

1. Create directory: `locales/<locale-code>/`
   - Use standard codes: `zh-TW`, `zh-CN`, `ja`, `ko`, `es`, `fr`, `de`

2. Copy English files as template:
   ```bash
   cp -r locales/en/ locales/zh-TW/
   ```

3. Update each file:
   - Change `"locale": "en"` to your locale
   - Translate all values in `translations`

4. Update `manifest.json` to add your locale

## Validation

Before submitting, always validate your translations:

```bash
# Validate specific locale
python scripts/validate.py --locale zh-TW

# Check coverage
python scripts/coverage.py --locale zh-TW
```

### Validation Rules

- ✅ Valid JSON format
- ✅ All required fields present
- ✅ Key format matches pattern
- ✅ Keys exist in English base
- ✅ Values are strings (not null/number/object)
- ✅ Values are under 500 characters
- ✅ No HTML/JavaScript injection

## Translation Guidelines

### Do's

- ✅ Keep translations concise
- ✅ Use native terminology when appropriate
- ✅ Maintain consistent terminology across files
- ✅ Test translations in context if possible
- ✅ Ask for clarification if meaning is unclear

### Don'ts

- ❌ Use machine translation without review
- ❌ Change key names (only translate values)
- ❌ Include HTML or code in translations
- ❌ Translate placeholder variables like `${variable}`
- ❌ Add extra keys not in the English base

### Terminology Consistency

Common terms should be translated consistently:

| English | Suggested Translation |
|---------|----------------------|
| Module | 模組 (zh-TW) / 模块 (zh-CN) |
| Workflow | 工作流程 |
| Parameter | 參數 / 参数 |
| Execute | 執行 / 执行 |
| Success | 成功 |
| Error | 錯誤 / 错误 |

## Pull Request Process

1. **Title Format**: `[locale] Brief description`
   - Example: `[zh-TW] Add browser module translations`

2. **Description**: Include:
   - What was translated
   - Coverage improvement (if applicable)
   - Any uncertain translations

3. **Checklist**:
   ```markdown
   - [ ] Ran `validate.py` with no errors
   - [ ] Translations are human-reviewed (not pure machine translation)
   - [ ] Consistent terminology used
   - [ ] Updated manifest.json (if new locale)
   ```

4. **Review**: Wait for maintainer review
   - Native speakers preferred for final approval
   - Be responsive to feedback

## Becoming a Maintainer

Active contributors can become locale maintainers:

| Level | Requirement | Permissions |
|-------|-------------|-------------|
| Contributor | First PR merged | Submit PRs |
| Reviewer | 5+ PRs merged | Review others' PRs |
| Maintainer | 20+ PRs + trust | Merge PRs |

## Questions?

- Open an issue with `[Question]` prefix
- Tag maintainers for your locale
- Join discussions in existing issues

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on quality translations
- Credit contributors appropriately

Thank you for helping make flyto accessible to more users!
