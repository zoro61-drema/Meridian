import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const env = { ...process.env };

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function prependPath(path) {
  env.PATH = [path, env.PATH].filter(Boolean).join(delimiter);
}

if (process.platform === "win32") {
  const cargoBin = join(homedir(), ".cargo", "bin");
  if (await pathExists(join(cargoBin, "cargo.exe"))) {
    prependPath(cargoBin);
  }

  const vsCmakePaths = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin",
  ];

  for (const cmakePath of vsCmakePaths) {
    if (await pathExists(join(cmakePath, "cmake.exe"))) {
      prependPath(cmakePath);
      break;
    }
  }
}

const command = process.platform === "win32" ? "cmd.exe" : "tauri";
const commandArgs =
  process.platform === "win32" ? ["/d", "/s", "/c", ["tauri", ...args].join(" ")] : args;

const child = spawn(command, commandArgs, {
  env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
