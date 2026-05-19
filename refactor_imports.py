import re

file_path = 'src/components/CalculatorAmountInput.test.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add import
import_line = 'import { getKeypadButtons } from "./__tests__/test-utils";\n'
if import_line not in content:
    content = import_line + content

# Remove local definition of getKeypadButtons
# It has two overloads and one implementation
pattern = r'function getKeypadButtons\(category: [^}]+\}\n\s+\}'
# Let's try a more targeted approach since regex with multi-line overloads is tricky
lines = content.split('\n')
new_lines = []
skip = False
for line in lines:
    if 'function getKeypadButtons(category: \'numeric\'): HTMLElement[];' in line:
        skip = True
    if skip and 'return btn;' in line:
        # The next line is likely the closing brace of the implementation
        continue
    if skip and line.strip() == '}':
        skip = False
        continue
    if not skip:
        new_lines.append(line)

content = '\n'.join(new_lines)

with open(file_path, 'w') as f:
    f.write(content)
