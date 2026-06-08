import re

with open('src/routes/cards.tsx', 'r') as f:
    lines = f.readlines()

in_async = []
for i, line in enumerate(lines):
    line_num = i + 1
    # Very simple heuristic: check for async keyword in function definitions
    if 'async' in line and ('function' in line or '=>' in line):
        # This is a very rough estimate of scope
        in_async.append((line_num, line.strip()))
    
    if 'await' in line:
        # Check if we are inside an async function
        # This is hard with just regex, but let's see if we can find the nearest async
        found = False
        for j in range(i, -1, -1):
            if 'async' in lines[j] and ('function' in lines[j] or '=>' in lines[j]):
                # Assume we are in this one
                found = True
                break
            if '}' in lines[j] and j < i - 1:
                # If we see a closing brace, maybe we exited the function?
                # This is weak but might help
                pass
        if not found:
            print(f"Potential issue at line {line_num}: {line.strip()}")

