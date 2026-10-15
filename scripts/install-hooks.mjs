// Run by `npm install` (the "prepare" script): points git at .githooks/, whose pre-commit hook
// runs the privacy check on every commit. Does nothing outside a git checkout (CI, HACS).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.git') && !process.env.CI) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
  } catch { /* git missing: nothing to do */ }
}
