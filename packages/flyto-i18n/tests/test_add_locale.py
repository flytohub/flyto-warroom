import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "add-locale.py"


def load_add_locale_module():
    spec = importlib.util.spec_from_file_location("add_locale", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class AddLocaleTests(unittest.TestCase):
    def setUp(self):
        self.module = load_add_locale_module()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.module.LOCALES_DIR = self.root / "locales"
        self.module.PROJECT_DIRS = ["cloud", "code"]

    def tearDown(self):
        self.tmpdir.cleanup()

    def write_locale_file(self, project: str, locale: str, filename: str, translations: dict) -> None:
        path = self.module.LOCALES_DIR / project / locale / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"locale": locale, "translations": translations}),
            encoding="utf-8",
        )

    def test_count_locale_translations_across_projects(self):
        self.write_locale_file("cloud", "ja", "common.json", {"a": "A", "b": ""})
        self.write_locale_file("code", "ja", "repo.json", {"c": "C"})

        translated, keys = self.module.count_locale_translations("ja")

        self.assertEqual(translated, 2)
        self.assertEqual(keys, 3)

    def test_locale_status_labels_completion_states(self):
        self.assertEqual(self.module.locale_status(0, 0), ("EMPTY", 0))
        self.assertEqual(self.module.locale_status(1, 2), ("WIP", 50.0))
        self.assertEqual(self.module.locale_status(2, 2), ("OK", 100.0))


if __name__ == "__main__":
    unittest.main()
