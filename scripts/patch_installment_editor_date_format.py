from pathlib import Path

p = Path("src/lib/installment-edit.ts")
s = p.read_text()

needle = '  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));\n  const parts = trimmed.toLowerCase().split(/\\s+/);\n'
replacement = '  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));\n  const br = trimmed.match(/^(\\d{2})-(\\d{2})-(\\d{4})$/);\n  if (br) return new Date(parseInt(br[3], 10), parseInt(br[2], 10) - 1, parseInt(br[1], 10));\n  const parts = trimmed.toLowerCase().split(/\\s+/);\n'
if needle in s:
    s = s.replace(needle, replacement, 1)
elif 'const br = trimmed.match(/^(\\d{2})-(\\d{2})-(\\d{4})$/);' not in s:
    raise SystemExit('parse date anchor not found')

needle = '    return `${yyyy}-${mm}-${dd}`;\n  }\n  const dd = String(target.getDate()).padStart(2, "0");\n'
replacement = '    return `${yyyy}-${mm}-${dd}`;\n  }\n  if (/^\\d{2}-\\d{2}-\\d{4}$/.test(original.trim())) {\n    const yyyy = target.getFullYear();\n    const mm = String(target.getMonth() + 1).padStart(2, "0");\n    const dd = String(target.getDate()).padStart(2, "0");\n    return `${dd}-${mm}-${yyyy}`;\n  }\n  const dd = String(target.getDate()).padStart(2, "0");\n'
if needle in s:
    s = s.replace(needle, replacement, 1)
elif 'if (/^\\d{2}-\\d{2}-\\d{4}$/.test(original.trim())) {' not in s:
    raise SystemExit('format date anchor not found')

p.write_text(s)
print('editor date format patch applied')
