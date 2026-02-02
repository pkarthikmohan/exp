
const fs = require('fs');
const content = fs.readFileSync('client/src/App.jsx', 'utf8');

let stack = [];
const lines = content.split('\n');

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{' || char === '(' || char === '[') {
        stack.push({ char, index: i });
    } else if (char === '}' || char === ')' || char === ']') {
        if (stack.length === 0) {
            console.log(`Error: Unexpected closing ${char} at index ${i}`);
            // Find line number
            const lineNum = content.substring(0, i).split('\n').length;
             console.log(`Line: ${lineNum}`);
             process.exit(1);
        }
        const last = stack.pop();
        if (
            (char === '}' && last.char !== '{') ||
            (char === ')' && last.char !== '(') ||
            (char === ']' && last.char !== '[')
        ) {
             console.log(`Error: Mismatched ${char} at index ${i}, expected closing for ${last.char} at index ${last.index}`);
             const lineNum = content.substring(0, i).split('\n').length;
             const prevLineNum = content.substring(0, last.index).split('\n').length;
             console.log(`Line: ${lineNum}, Match opened at line: ${prevLineNum}`);
             process.exit(1);
        }
    }
}

if (stack.length > 0) {
    const last = stack[0]; // Show the FIRST unclosed one
    console.log(`Error: Unclosed ${last.char} at index ${last.index}`);
     const lineNum = content.substring(0, last.index).split('\n').length;
     console.log(`Line: ${lineNum} (first unclosed)`);
     
     // Show last unclosed
     const realLast = stack[stack.length - 1];
     const lastLine = content.substring(0, realLast.index).split('\n').length;
     console.log(`Line: ${lastLine} (most recent unclosed)`);
} else {
    console.log("Brackets are balanced!");
}
