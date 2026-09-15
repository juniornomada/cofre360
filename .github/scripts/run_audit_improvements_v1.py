from pathlib import Path

source_path = Path('.github/scripts/apply_audit_improvements_v1.py')
source = source_path.read_text()
source = source.replace(
    "replace_all(home, 'categorySpending.length', 'displayedCategorySpending.length')\nreplace_all(home, 'categorySpending.map', 'displayedCategorySpending.map')",
    "p = Path(home)\ntext = p.read_text()\ntext = text.replace('categorySpending.length', 'displayedCategorySpending.length')\ntext = text.replace('categorySpending.map', 'displayedCategorySpending.map')\np.write_text(text)",
)
exec(compile(source, str(source_path), 'exec'))
