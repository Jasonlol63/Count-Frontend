/**
 * After `npm run build`: drop Vite hash asset churn, stage only changed frontend files.
 * Run from frontend/ via package.json postbuild (repo root = ../..).
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function run(cmd, { allowFail = false } = {}) {
  try {
    execSync(cmd, { cwd: repoRoot, stdio: "inherit", shell: true });
    return true;
  } catch {
    if (!allowFail) throw new Error(`git-sync-after-build failed: ${cmd}`);
    return false;
  }
}

function gitLines(cmd) {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isGitRepo() {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

function stagePaths(files) {
  const unique = [...new Set(files)];
  if (!unique.length) return;
  const quoted = unique.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(" ");
  run(`git add -- ${quoted}`, { allowFail: true });
}

/** Stage only paths that actually differ from HEAD (ignore CRLF-only noise on Windows). */
function stageChangedUnder(relPath) {
  const modified = gitLines(`git diff --name-only --ignore-cr-at-eol -- "${relPath}"`);
  const untracked = gitLines(`git ls-files --others --exclude-standard -- "${relPath}"`);
  stagePaths([...modified, ...untracked]);
}

/** dist/css mirrors public/css — only stage pairs whose public source changed. */
function stageCssMirrorsFromPublic() {
  const publicChanged = gitLines(
    `git diff --name-only --ignore-cr-at-eol -- frontend/public/css`,
  );
  const pairs = [];
  for (const pub of publicChanged) {
    pairs.push(pub);
    pairs.push(pub.replace("/public/css/", "/dist/css/"));
  }
  stagePaths(pairs);
}

if (!isGitRepo()) {
  console.log("[git-sync-after-build] skip — not a git repo");
  process.exit(0);
}

console.log("[git-sync-after-build] restore dist/assets + index.html churn…");
run("git restore frontend/dist/assets frontend/dist/index.html", { allowFail: true });
run("git clean -fd frontend/dist/assets", { allowFail: true });

run("node frontend/scripts/patch-index-sidebar-css.mjs", { allowFail: true });

console.log("[git-sync-after-build] stage changed files only…");
stageChangedUnder("frontend/src");
stageChangedUnder("frontend/public");
stageCssMirrorsFromPublic();
stageChangedUnder("frontend/dist/index.html");

console.log("[git-sync-after-build] done — dist/assets not staged (hash bundles)");
