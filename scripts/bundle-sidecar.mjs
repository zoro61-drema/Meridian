import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sidecarDir = resolve(repoRoot, "src-sidecar");
const source = resolve(sidecarDir, "dist", "bundle.cjs");
const target = resolve(repoRoot, "src-tauri", "target", "debug", "bundle.cjs");

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const executable = process.platform === "win32" ? "cmd.exe" : command;
    const executableArgs =
      process.platform === "win32"
        ? ["/d", "/s", "/c", [command, ...args].join(" ")]
        : args;
    const child = spawn(executable, executableArgs, {
      ...options,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} exited with signal ${signal}`
            : `${command} ${args.join(" ")} exited with code ${code}`,
        ),
      );
    });
  });
}

await run("pnpm", ["bundle"], { cwd: sidecarDir });
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
