from pathlib import Path

p = Path("src/routes/cards.tsx")
text = p.read_text()

start_marker = '''              {activePeriod && (
                    <p className="text-[10px] text-muted-foreground">'''
end_marker = '''              {activePeriod && (
                <div className="mx-5 mb-4 flex flex-col gap-3">'''

start = text.find(start_marker)
if start < 0:
    raise SystemExit("duplicate invoice navigation block start not found")
end = text.find(end_marker, start + len(start_marker))
if end < 0:
    raise SystemExit("invoice content block end marker not found")

text = text[:start] + text[end:]
p.write_text(text)
print("removed duplicate invoice navigation JSX block")
