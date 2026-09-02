from pathlib import Path
import re

path = Path("src/components/QuickAddTransactionDialog.tsx")
text = path.read_text()
marker = "Conta Débito/Pix"
if marker not in text:
    raise SystemExit("Conta Débito/Pix section not found")

before, after = text.split(marker, 1)

badge_pattern = re.compile(
    r'\s*\{a\.parent_account_id && \(\s*<span aria-hidden="true"[^>]*>↳</span>\s*\)\}',
    re.S,
)
subtitle_pattern = re.compile(
    r'\s*<span className=\{cn\("w-full truncate text-center text-\[7px\] leading-tight"[^>]*>\s*\{a\.parent_account_id \? `Sub · \$\{a\.parent_name \|\| "Principal"\}` : "Conta principal"\}\s*</span>',
    re.S,
)

after, badge_count = badge_pattern.subn("", after, count=1)
after, subtitle_count = subtitle_pattern.subn("", after, count=1)

if badge_count != 1:
    raise SystemExit(f"Expected 1 Debit/Pix hierarchy badge, removed {badge_count}")
if subtitle_count != 1:
    raise SystemExit(f"Expected 1 Debit/Pix hierarchy subtitle, removed {subtitle_count}")

path.write_text(before + marker + after)
print("Removed Debit/Pix hierarchy badge and subtitle")
