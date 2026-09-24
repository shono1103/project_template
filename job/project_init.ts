#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DEFAULT_DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../project.sqlite");
const SCHEMA_VERSION = 1;
const TABLE_NAMES = ["cases", "work_items", "tasks", "qas", "dependencies"];

const schema = `
CREATE TABLE cases (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  slug TEXT NOT NULL UNIQUE CHECK (length(trim(slug)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

CREATE TABLE work_items (
  id INTEGER PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('task', 'qa')),
  number INTEGER NOT NULL CHECK (number > 0),
  created_at TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

-- case_id が NULL の項目も、種別ごとに独立して採番する。
CREATE UNIQUE INDEX work_items_scope_number
  ON work_items (coalesce(case_id, 0), kind, number);

CREATE INDEX work_items_case_kind ON work_items (case_id, kind);

CREATE TABLE tasks (
  work_item_id INTEGER PRIMARY KEY REFERENCES work_items(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'pending', 'progress', 'done')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  content TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  log TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  CHECK ((status = 'done') = (completed_at IS NOT NULL))
);

CREATE INDEX tasks_status ON tasks (status);

CREATE TABLE qas (
  work_item_id INTEGER PRIMARY KEY REFERENCES work_items(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (status IN ('unresolved', 'resolved')),
  ask_to TEXT NOT NULL DEFAULT 'undecided'
    CHECK (ask_to IN ('customer', 'internal', 'undecided')),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  answer TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE INDEX qas_status_ask_to ON qas (status, ask_to);

-- source が待つ側、target が待たれる側。target の完了・解決で待ちが解ける。
CREATE TABLE dependencies (
  source_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE RESTRICT,
  target_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE RESTRICT,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (source_item_id, target_item_id),
  CHECK (source_item_id <> target_item_id)
);

CREATE INDEX dependencies_target ON dependencies (target_item_id);

CREATE TRIGGER tasks_kind_insert BEFORE INSERT ON tasks
BEGIN
  SELECT RAISE(ABORT, 'tasks には kind=task の work_item が必要です')
    WHERE (SELECT kind FROM work_items WHERE id = NEW.work_item_id) <> 'task';
END;

CREATE TRIGGER qas_kind_insert BEFORE INSERT ON qas
BEGIN
  SELECT RAISE(ABORT, 'qas には kind=qa の work_item が必要です')
    WHERE (SELECT kind FROM work_items WHERE id = NEW.work_item_id) <> 'qa';
END;

CREATE TRIGGER work_items_kind_update BEFORE UPDATE OF kind ON work_items
WHEN OLD.kind <> NEW.kind
BEGIN
  SELECT RAISE(ABORT, '詳細行がある work_item の kind は変更できません')
    WHERE EXISTS (SELECT 1 FROM tasks WHERE work_item_id = OLD.id)
       OR EXISTS (SELECT 1 FROM qas WHERE work_item_id = OLD.id);
END;
`;

function initialize(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  try {
    db.exec("PRAGMA foreign_keys = ON");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

    if (version > SCHEMA_VERSION) {
      throw new Error(`未対応のスキーマバージョンです: ${version}`);
    }

    if (version === SCHEMA_VERSION) {
      const existing = new Set(
        (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as { name: string }[])
          .map((row) => row.name),
      );
      const missing = TABLE_NAMES.filter((name) => !existing.has(name));
      if (missing.length > 0) {
        throw new Error(`既存DBのテーブルが不足しています: ${missing.join(", ")}`);
      }
      console.log(`初期化済み: ${dbPath}`);
      return;
    }

    const existingUserTables = db.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    ).get();
    if (existingUserTables) {
      throw new Error("既存の未管理DBには初期化できません。別のパスを指定してください。");
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(schema);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    console.log(`SQLite DBを作成しました: ${dbPath}`);
  } finally {
    db.close();
  }
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("使い方: pnpm project:init [DBファイルのパス]");
  console.log(`省略時: ${DEFAULT_DB_PATH}`);
} else if (args.length > 1 || args[0]?.startsWith("-")) {
  console.error("使い方: pnpm project:init [DBファイルのパス]");
  process.exitCode = 1;
} else {
  try {
    initialize(resolve(args[0] ?? DEFAULT_DB_PATH));
  } catch (error) {
    console.error(`初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
