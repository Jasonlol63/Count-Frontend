import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

function readChangedFiles() {
  try {
    const output = execSync("git status --porcelain", {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim());
  } catch {
    return [];
  }
}

function main() {
  const distExists = existsSync(new URL("../dist/css", import.meta.url));
  if (!distExists) return;

  const changedFiles = readChangedFiles();
  const changedDistCss = changedFiles.filter((file) => file.startsWith("frontend/dist/css/"));

  if (changedDistCss.length === 0) return;

  console.warn("\n[css-workflow warning]");
  console.warn("Detected edits under frontend/dist/css.");
  console.warn("Do not edit build artifacts directly.");
  console.warn("Please edit source files under frontend/public/css, then run npm run build.\n");
  changedDistCss.forEach((file) => console.warn(` - ${file}`));
  console.warn("");
}

main();
