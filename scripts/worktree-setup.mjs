// Run once inside a fresh JetBrains Air worktree: `npm run worktree:setup`.
// Git worktrees don't carry ignored files, so this copies .env.local from the
// main checkout and installs node_modules if they're missing.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const here = sh('git rev-parse --show-toplevel');
const commonDir = path.resolve(here, sh('git rev-parse --git-common-dir'));
const mainRoot = path.dirname(commonDir);

if (path.resolve(mainRoot) === path.resolve(here)) {
  console.log('In the main checkout: nothing to copy.');
} else {
  for (const f of ['.env.local']) {
    const src = path.join(mainRoot, f);
    const dst = path.join(here, f);
    if (!existsSync(src)) console.warn(`! ${f} not found in main checkout (${mainRoot}). Skipped.`);
    else if (existsSync(dst)) console.log(`= ${f} already present.`);
    else { copyFileSync(src, dst); console.log(`+ copied ${f} from ${mainRoot}`); }
  }
}

if (!existsSync(path.join(here, 'node_modules'))) {
  console.log('Installing dependencies (npm ci)…');
  execSync('npm ci', { cwd: here, stdio: 'inherit' });
} else {
  console.log('= node_modules present.');
}
console.log('TRACKING… OK ▶ worktree ready');
