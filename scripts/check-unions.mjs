/**
 * Assert that every `Record<Union, …>` literal over a closed string union lists
 * every member of that union.
 *
 * WHY THIS EXISTS. The repo pins TypeScript ~4.5, which cannot parse the `.d.ts`
 * files shipped by current dependencies — zod v4 ends with an unterminated
 * template literal and the bundled `@types/node` fails with TS1005 — so
 * `tsc --noEmit` aborts partway and reports NOTHING for a missing `Record`
 * member. Widening `AgentProvider` from two members to four produced zero
 * diagnostics while three real consumers were broken; they were found by reading
 * the files by hand. This is the mechanical version of that hand-check, and
 * unlike tsc it finishes in milliseconds.
 *
 * Deliberately narrow: ONE invariant, established by parsing the union
 * declaration and the top-level keys of each object literal. It is not a type
 * checker and must not grow into a bad imitation of one — if TypeScript is ever
 * upgraded far enough to parse the dependency tree, delete this and use tsc.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Unions to enforce, and the file each is declared in. */
const UNIONS = [{ name: 'AgentProvider', file: 'src/shared/constants.ts' }];

/** Files whose `Record<Union, …>` literals must be exhaustive. */
const CONSUMERS = ['src/shared/constants.ts', 'src/shared/runtime.ts'];

/**
 * Read a source file with comments blanked out.
 *
 * Necessary, not tidiness: a doc comment explaining why a type is NOT
 * `Record<AgentProvider, string>` is textually identical to the declaration, and
 * matching it produced a failure against prose. Newlines are preserved so
 * reported line numbers stay true.
 */
function readCode(rel) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const read = readCode;

/** Members of `export type Name = 'a' | 'b';`, single- or multi-line. */
function unionMembers(src, name) {
  const m = new RegExp(`export type ${name}\\s*=\\s*([^;]+);`).exec(src);
  if (!m) throw new Error(`could not find "export type ${name}"`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Depth-0 keys of every object literal following `Record<Name, …> = {`. */
function recordLiterals(src, name) {
  const out = [];
  const re = new RegExp(`Record<\\s*${name}\\s*,[\\s\\S]*?>\\s*=\\s*\\{`, 'g');
  for (let m; (m = re.exec(src)); ) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i += 1) {
      const c = src[i];
      if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') depth -= 1;
    }
    const body = src.slice(start, i - 1);
    const keys = [];
    let d = 0;
    for (const line of body.split('\n')) {
      if (d === 0) {
        const key = /^\s*'?([A-Za-z_][\w-]*)'?\s*:/.exec(line);
        if (key) keys.push(key[1]);
      }
      for (const c of line) {
        if (c === '{' || c === '[') d += 1;
        else if (c === '}' || c === ']') d -= 1;
      }
    }
    out.push({ keys, line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

let failures = 0;
let checked = 0;
for (const { name, file } of UNIONS) {
  const members = unionMembers(read(file), name);
  console.log(`${name}: ${members.join(' | ')}`);
  for (const rel of CONSUMERS) {
    for (const lit of recordLiterals(read(rel), name)) {
      checked += 1;
      const missing = members.filter((k) => !lit.keys.includes(k));
      if (missing.length) {
        failures += 1;
        console.error(
          `  FAIL ${rel}:${lit.line} — Record<${name}, …> is missing: ${missing.join(', ')}`,
        );
      } else {
        console.log(`  ok   ${rel}:${lit.line} — all ${members.length} members present`);
      }
    }
  }
}

if (checked === 0) {
  console.error('\nNo Record literals found — the parser or the file list is wrong.');
  process.exit(1);
}
if (failures) {
  console.error(`\n${failures} exhaustiveness failure(s) across ${checked} literal(s).`);
  process.exit(1);
}
console.log(`\nAll ${checked} union records are exhaustive.`);
