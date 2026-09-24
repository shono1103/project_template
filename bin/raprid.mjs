#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateEntries = [
  ".claude",
  "AGENTS.md",
  "CLAUDE.md",
  "MEMORY.md",
  "README.md",
  "docs",
  "job/add-qa.sh",
  "job/add-task.sh",
  "job/list-qa.sh",
  "job/list-task.sh",
  "job/project_init.ts",
  "job/qa-transition.sh",
  "job/task-transition.sh",
  "job/template",
  "job/other",
  "logs/README.md",
  "logs/create_log.ts",
  "logs/template",
  "package.json",
  "repos/README.md",
  "repos/MEMORY.md",
  "repos/add_submodule.sh",
  "repos/setup_worktrees.sh",
  "tsconfig.json",
];

function usage() {
  console.log("使い方: raprid init [--path /path/to/target_dir]");
  console.log("        raprid up [--port 54321]");
}

function existingStat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function projectName(path) {
  return basename(path).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "project";
}

function init(targetPath) {
  const target = resolve(targetPath);
  const stat = existingStat(target);
  if (stat && !stat.isDirectory()) throw new Error(`対象がディレクトリではありません: ${target}`);

  for (const entry of templateEntries) {
    if (!existingStat(resolve(packageRoot, entry))) {
      throw new Error(`配布パッケージのファイルが不足しています: ${entry}`);
    }
  }
  const ignoreSource = [".gitignore", ".npmignore"]
    .map((name) => resolve(packageRoot, name))
    .find((path) => existingStat(path));
  if (!ignoreSource) {
    throw new Error("配布パッケージのファイルが不足しています: .gitignore");
  }

  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `.${basename(target)}.raprid-`));

  try {
    for (const entry of templateEntries) {
      const destination = resolve(staging, entry);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(resolve(packageRoot, entry), destination, { recursive: true });
    }
    writeFileSync(resolve(staging, ".gitignore"), readFileSync(ignoreSource));

    mkdirSync(resolve(staging, ".agents"));
    symlinkSync("../.claude/skills", resolve(staging, ".agents/skills"), "dir");

    const manifestPath = resolve(staging, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.name = projectName(target);
    manifest.private = true;
    delete manifest.bin;
    delete manifest.files;
    delete manifest.dependencies;
    delete manifest.scripts.prepare;
    delete manifest.scripts["build:web"];
    delete manifest.devDependencies.vite;
    delete manifest.devDependencies["@types/koa"];
    delete manifest.devDependencies["@types/react"];
    delete manifest.devDependencies["@types/react-dom"];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const database = spawnSync(process.execPath, [resolve(staging, "job/project_init.ts")], {
      encoding: "utf8",
    });
    if (database.error || database.status !== 0) {
      throw new Error(database.stderr?.trim() || database.error?.message || "SQLite の初期化に失敗しました");
    }

    if (stat) {
      const conflicts = [];
      function inspect(source, destination) {
        for (const entry of readdirSync(source, { withFileTypes: true })) {
          const from = join(source, entry.name);
          const to = join(destination, entry.name);
          const existing = existingStat(to);
          if (!existing) continue;
          if (entry.isDirectory() && existing.isDirectory()) inspect(from, to);
          else conflicts.push(to);
        }
      }
      inspect(staging, target);
      if (conflicts.length) throw new Error(`既存ファイルと競合します: ${conflicts.join(", ")}`);
      cpSync(staging, target, { recursive: true, force: false, errorOnExist: true });
      rmSync(staging, { recursive: true, force: true });
    } else {
      renameSync(staging, target);
    }
    console.log(`プロジェクトを初期化しました: ${target}`);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  usage();
} else if (args[0] === "init" && (args.length === 1 || (args.length === 3 && args[1] === "--path" && args[2]))) {
  try {
    init(args.length === 1 ? process.cwd() : args[2]);
  } catch (error) {
    console.error(`初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else if (args[0] === "up" && (args.length === 1 || (args.length === 3 && args[1] === "--port"))) {
  const portText = args.length === 1 ? "54321" : args[2];
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`ポート番号が不正です: ${portText}`);
    process.exitCode = 1;
  } else {
    try {
      const { startServer } = await import("../web/server.mjs");
      await startServer({ projectDir: process.cwd(), port });
    } catch (error) {
      console.error(`起動に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
} else {
  usage();
  process.exitCode = 1;
}
