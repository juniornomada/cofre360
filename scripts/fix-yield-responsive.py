from pathlib import Path

path = Path('src/routes/accounts.tsx')
text = path.read_text()

old = '''                        className={cn(
                          "text-[11px] tabular-nums leading-tight font-medium text-left hover:underline underline-offset-2",
                          performance > 0 ? "text-primary" : performance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}
'''
new = '''                        className={cn(
                          "shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] tabular-nums tracking-tight leading-tight font-medium text-left hover:underline underline-offset-2",
                          performance > 0 ? "text-primary" : performance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}
'''

if old not in text:
    raise SystemExit('yield button class block not found')

text = text.replace(old, new, 1)
path.write_text(text)
