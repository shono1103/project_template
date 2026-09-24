#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const logsRoot = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(logsRoot, "template");

function localDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

const [agentName, date = localDate(), sessionId = randomUUID(), ...extra] = process.argv.slice(2);

if (agentName === "--help" || agentName === "-h") {
  console.log("使い方: pnpm log:create <agent_name> [YYYY-MM-DD] [session_id]");
} else if (
  extra.length > 0 ||
  !agentName ||
  !/^[a-z][a-z0-9-]*$/.test(agentName) ||
  !isValidDate(date) ||
  !/^[A-Za-z0-9_-]+$/.test(sessionId)
) {
  console.error("使い方: pnpm log:create <agent_name> [YYYY-MM-DD] [session_id]");
  process.exitCode = 1;
} else {
  const [year, month, day] = date.split("-");
  const targetDir = resolve(logsRoot, year, month, day, agentName, sessionId);
  if (existsSync(targetDir)) {
    console.log(`既存のセッションログ: ${targetDir}`);
  } else {
    mkdirSync(dirname(targetDir), { recursive: true });
    cpSync(templateDir, targetDir, { recursive: true });
    console.log(`セッションログを作成しました: ${targetDir}`);
  }
}
