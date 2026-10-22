#!/usr/bin/env node
// PreToolUse hook for the test-triager agent (registered in its frontmatter).
// The triager judges the tests, so it must not change them, the expected results,
// the test config, or this hook. Test defects go back to the test-automator.
//
// File tools: allow-list. Inside the project, only the triager's own outputs may be
// written. Bash: block-list of patterns, a best effort, not a sandbox.
// Fails closed: if the input can't be read, the call is blocked.

import path from 'node:path';
import os from 'node:os';

const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

// Inside the project, file tools may write only here.
const ALLOWED = ['reports/test-run.md', 'reports/gaps.md', 'bugs/', 'test-results/'];

// Bash must not write to these (first path segment inside the project).
const PROTECTED = [
  'tests', 'pages', 'test-cases', 'requirements', '.claude', 'benchmark',
  'playwright.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', '.env', '.mcp.json',
];

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `${reason} The test-triager may write only reports/test-run.md, reports/gaps.md, bugs/ and test-results/. ` +
        'If a test needs a fix, describe it under "## Sent back to test-automator" in reports/test-run.md.',
    },
  }));
  process.exit(0);
}

// Project-relative path in lower case (macOS file names ignore case), or null if outside.
function projectRel(p, baseDir) {
  if (!p) return null;
  let clean = p.replace(/^["']|["']$/g, '');
  clean = clean.replace(/^~(?=\/|$)/, os.homedir());
  clean = clean.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, projectDir);
  const rel = path.relative(projectDir.toLowerCase(), path.resolve(baseDir, clean).toLowerCase());
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function isProtected(p, baseDir) {
  const expanded = p.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, projectDir);
  // A path built from some other variable: we can't resolve it, so check its segments by name.
  if (/\$/.test(expanded)) return SEGMENT.test(expanded);
  const rel = projectRel(p, baseDir);
  return rel !== null && PROTECTED.includes(rel.split('/')[0]);
}

const names = PROTECTED.map((n) => n.replace(/\./g, '\\.')).join('|');
// A protected name as a path segment, e.g. tests/api/x.ts, ./pages, /abs/project/tests/.
// Does not match "test-results" or "playwright test".
const SEGMENT = new RegExp(`(^|[\\s"'=/(:;&|])(${names})(/|["'\\s;&|)]|$)`, 'i');

// Commands or code that change files when pointed at a path.
const MUTATING = [
  /\bsed\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*i/,
  /\bperl\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*i/,
  /\bawk\s+-i\b/,
  /(^|[\s;&|(])(rm|rmdir|mv|cp|touch|truncate|mkdir|ln|chmod|unlink|install|rsync|dd|patch|tar|unzip)\s/,
  /\bgit\s+(checkout|restore|apply|stash|reset|rm|mv|clean|am|cherry-pick|revert|merge|rebase|pull|switch)\b/,
  /\b(writeFile|appendFile|createWriteStream|rmSync|unlink|rename|copyFile|cpSync|mkdirSync|truncate|write_text|write_bytes|shutil\.)/,
  /\bopen\([^)]*,\s*["'][wax+]/,
];

// A heredoc fed to cat or tee is only text written to the redirect target, and that
// target is still checked. Drop its body so words in it don't look like commands.
// Heredocs fed to an interpreter (node, python, bash) keep their body: it is code.
function stripTextHeredocs(cmd) {
  return cmd.replace(
    /^([ \t]*(?:cat|tee)\b[^\n]*<<-?[ \t]*(['"]?)(\w+)\2[^\n]*\n)[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/gm,
    '$1',
  );
}

function checkBash(rawCmd, cwd) {
  const cmd = stripTextHeredocs(rawCmd);
  const writes = MUTATING.some((re) => re.test(cmd)) || /(^|[^&\d])>{1,2}(?!&)|\btee\b/.test(cmd);

  // Only -u given to "playwright test" itself, not e.g. "env -u VAR".
  if (/\bplaywright\s+test\b[^;&|\n]*\s(--update-snapshots|-u)(\s|=|$)/.test(cmd)) {
    deny('Blocked: --update-snapshots writes into tests/.');
  }
  if (/\b(npm|pnpm|yarn)\s+(install|i|add|remove|rm|uninstall|update|up|ci|link|pkg)\b/.test(cmd)) {
    deny('Blocked: package installs change package.json or node_modules.');
  }

  // Redirection targets: > file, >> file, &> file (but not 2>&1).
  for (const m of cmd.matchAll(/(?:^|[^<>&\d])\d?&?>{1,2}\|?\s*(?!&)("[^"]+"|'[^']+'|[^\s;&|<>()]+)/g)) {
    if (isProtected(m[1], cwd)) deny(`Blocked: shell redirect into ${m[1]}.`);
  }

  // tee targets: the words after "tee" up to the next pipe or separator.
  for (const m of cmd.matchAll(/\btee\s+([^|;&]+)/g)) {
    for (const arg of m[1].trim().split(/\s+/)) {
      if (!arg.startsWith('-') && isProtected(arg, cwd)) deny(`Blocked: tee into ${arg}.`);
    }
  }

  // Download targets: curl -o / --output, wget -O / --output-document.
  for (const m of cmd.matchAll(/(?:\s-o|\s--output|\s-O|\s--output-document)(?:\s+|=)("[^"]+"|'[^']+'|[^\s;&|]+)/g)) {
    if (/\b(curl|wget)\b/.test(cmd) && isProtected(m[1], cwd)) deny(`Blocked: download into ${m[1]}.`);
  }

  // cd into a protected folder makes later relative writes land there.
  for (const m of cmd.matchAll(/(?:^|[\s;&|(])cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) {
    if (isProtected(m[1], cwd) && writes) deny(`Blocked: cd into ${m[1]} with a write.`);
  }

  // The shell is already inside a protected folder: any write there is relative.
  const cwdRel = projectRel(cwd, projectDir);
  const insideProtected = cwdRel !== null && cwdRel !== '' && PROTECTED.includes(cwdRel.split('/')[0]);

  if ((insideProtected || SEGMENT.test(cmd)) && MUTATING.some((re) => re.test(cmd))) {
    deny('Blocked: this command looks like it changes protected files.');
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    deny('Blocked: the hook could not read the tool input.');
  }
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const cwd = input.cwd || projectDir;

  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const target = ti.file_path || ti.notebook_path;
    if (!target) deny(`Blocked: ${tool} without a file path.`);
    const rel = projectRel(target, projectDir);
    const allowed = rel === null || ALLOWED.some((a) => (a.endsWith('/') ? rel.startsWith(a) : rel === a));
    if (!allowed) deny(`Blocked: ${tool} on ${target}.`);
  } else if (tool === 'Bash') {
    checkBash(ti.command || '', cwd);
  }
  process.exit(0);
});
