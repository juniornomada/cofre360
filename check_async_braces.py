import re

def check_file(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    stack = []
    
    # regex for async function/arrow
    async_re = re.compile(r'async\s+(?:function|\()|async\s+\w+\s*=>')
    func_re = re.compile(r'(?:function|\()|\w+\s*=>')
    
    for i, line in enumerate(lines):
        line_num = i + 1
        
        # This is very simplified, doesn't handle strings/comments/etc well
        # but might find obvious mistakes
        
        # Check for async start
        if async_re.search(line):
            # Mark the next { as start of an async scope
            pass # difficult with regex
            
        if 'await' in line:
            # Check if current scope is async
            # Again, difficult. Let's just grep for context.
            pass

    # Alternative: find all await and show 10 lines before
    await_indices = [i for i, line in enumerate(lines) if 'await' in line]
    for idx in await_indices:
        print(f"--- await at line {idx+1} ---")
        start = max(0, idx - 15)
        for j in range(start, idx + 1):
            print(f"{j+1}: {lines[j]}")

check_file('src/routes/cards.tsx')
