import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FrontmatterError } from "../lib/frontmatter.ts";
import { detectFormat, initialTaskV2, readTaskFile, validateTaskV2 } from "../lib/workflow.ts";
import { YamlFrontmatter } from "../lib/yamlfront.ts";
import { cli, raprid, read, snapshot, write } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "workflow");
const schemaPath = join(here, "..", "lib", "schema", "task-workflow-v2.schema.json");
const fixture = (name: string) => readFileSync(join(fixtures, name), "utf8");
const validFixtures = readdirSync(fixtures).filter((name) => name.startsWith("v2-") && name.endsWith(".md")).sort();

interface Case {
  name: string;
  base: string;
  set?: [(string | number)[], unknown][];
  delete?: (string | number)[][];
  schema: boolean;
  codes: [string, string][];
}
const cases = (JSON.parse(readFileSync(join(fixtures, "invalid.json"), "utf8")) as { cases: Case[] }).cases;

// JSON Schema の検証器 (ajv は開発時の依存。導入されていなければ schema との照合だけを飛ばす)。
// 導入されているのに schema をコンパイルできないときは失敗にする (照合を黙って飛ばさない)。
// strictRequired は外す: artifactRef の「path か commit の少なくとも一方」を anyOf + required で書いているため
type Ajv = new (options: object) => { compile: (schema: object) => (data: unknown) => boolean };
async function schemaValidator(): Promise<((data: unknown) => boolean) | undefined> {
  let Ajv2020: Ajv;
  try {
    ({ default: Ajv2020 } = (await import("ajv/dist/2020.js")) as unknown as { default: Ajv });
  } catch {
    return undefined;
  }
  return new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(JSON.parse(readFileSync(schemaPath, "utf8")));
}

function mutate(item: Case): string {
  const frontmatter = YamlFrontmatter.parse(fixture(item.base), item.base);
  for (const [path, value] of item.set ?? []) frontmatter.set(path, value);
  for (const path of item.delete ?? []) frontmatter.delete(path);
  return frontmatter.toString();
}

test("旧形式と新形式を見分け、対応していない版は扱わない", () => {
  assert.deepEqual(detectFormat(YamlFrontmatter.parse(fixture("legacy.md")).data()), { kind: "legacy" });
  assert.deepEqual(detectFormat({ workflowVersion: 2 }), { kind: "v2" });
  assert.deepEqual(detectFormat({ workflowVersion: "2" }), { kind: "unsupported", version: "2" });
  assert.deepEqual(detectFormat({ workflowVersion: 3 }), { kind: "unsupported", version: 3 });
  const legacy = readTaskFile(fixture("legacy.md"));
  assert.equal(legacy.format.kind, "legacy");
  assert.deepEqual(legacy.issues, [], "旧形式は新形式の規則で検証しない");
});

test("正しいフィクスチャは validateTaskV2 と JSON Schema の両方で受け付ける", async () => {
  const validate = await schemaValidator();
  assert.ok(validFixtures.length >= 7);
  for (const name of validFixtures) {
    const { format, frontmatter, issues } = readTaskFile(fixture(name), name);
    assert.equal(format.kind, "v2", name);
    assert.deepEqual(issues, [], `${name}\n${JSON.stringify(issues, null, 2)}`);
    if (validate) assert.equal(validate(frontmatter.data()), true, `${name}: JSON Schema`);
  }
});

test("不正な例は code と項目を示して拒否し、構造の規則は JSON Schema とも一致する", async () => {
  const validate = await schemaValidator();
  for (const item of cases) {
    const text = mutate(item);
    const { issues, frontmatter } = readTaskFile(text, item.name);
    const found = issues.map((issue) => `${issue.code} ${issue.path}`);
    for (const [code, path] of item.codes) assert.ok(found.includes(`${code} ${path}`), `${item.name}: ${code} ${path} が無い\n${found.join("\n")}`);
    assert.ok(issues.every((issue) => issue.message.length > 0));
    if (validate) assert.equal(validate(frontmatter.data()), item.schema, `${item.name}: JSON Schema だけで${item.schema ? "受け付ける (項目をまたぐ規則)" : "拒否する (構造の規則)"}`);
  }
});

test("新しいタスクの初期値は計画が ready で後続が waiting になり、書き出して読み直しても同じ", async () => {
  const task = initialTaskV2({ id: "T-020", date: "2026-10-01", requestedBy: "human/saiki", createdBy: "agent/claude" });
  assert.deepEqual(validateTaskV2(task), []);
  assert.deepEqual(
    Object.fromEntries(Object.entries(task.workflow).map(([phase, record]) => [phase, record.status])),
    { plan: "ready", implement: "waiting", review: "waiting", acceptance: "waiting" },
  );
  const frontmatter = YamlFrontmatter.parse("---\n---\n\n# 概要\n");
  for (const [key, value] of Object.entries(task)) frontmatter.set([key], value);
  const text = frontmatter.toString();
  assert.match(text, /^---\nid: T-020\nworkflowVersion: 2\n/);
  assert.match(text, /\ncompletedAt:\n/, "null は空欄で書く");
  assert.match(text, /\n  plan:\n    status: ready\n    attempt: 1\n    assignee:\n/);
  assert.ok(text.endsWith("---\n\n# 概要\n"));
  const again = readTaskFile(text);
  assert.deepEqual(again.issues, []);
  assert.deepEqual(again.frontmatter.data(), JSON.parse(JSON.stringify(task)));
  const validate = await schemaValidator();
  if (validate) assert.equal(validate(task), true);
});

test("読み書きは未知の項目・コメント・引用符・本文を保ち、書き換えた行だけを変える", () => {
  for (const name of [...validFixtures, "legacy.md"]) {
    const text = fixture(name);
    assert.equal(YamlFrontmatter.parse(text, name).toString(), text, `${name}: 変更が無ければ元と同じ`);
  }
  const text = fixture("v2-implement-progress.md");
  const frontmatter = YamlFrontmatter.parse(text);
  frontmatter.set(["workflow", "implement", "status"], "pending");
  frontmatter.set(["blockedBy"], ["qa/Q-001", "other: 部長, 課長 # の承認"]);
  const updated = frontmatter.toString();
  const before = text.split("\n");
  const after = updated.split("\n");
  const changed = after.filter((line) => !before.includes(line));
  assert.deepEqual(changed, ["blockedBy:", "  - qa/Q-001", '  - "other: 部長, 課長 # の承認"', "    status: pending"]);
  assert.ok(updated.includes("# 工程ごとの記録\n"), "コメント行を残す");
  assert.ok(updated.includes("test:\n  - docs/feature/raprid/workflow-data-model.feature\n"), "未知の項目を残す");
  assert.ok(updated.endsWith("```yaml\nstatus: todo # 本文のコードブロックは frontmatter ではない\n```\n"), "本文を残す");
  assert.deepEqual(YamlFrontmatter.parse(updated).get(["blockedBy"]), ["qa/Q-001", "other: 部長, 課長 # の承認"]);
  // CRLF の文書は CRLF のまま
  const crlf = text.replace(/\n/g, "\r\n");
  const crlfFrontmatter = YamlFrontmatter.parse(crlf);
  assert.equal(crlfFrontmatter.toString(), crlf);
  crlfFrontmatter.set(["updatedAt"], "2026-10-01");
  assert.ok(!/[^\r]\n/.test(crlfFrontmatter.toString()), "書き換えても改行は CRLF");
});

test("YAML として曖昧な書式 (重複・アンカー・エイリアス・タグ・壊れた書式) は推測せずに拒否する", () => {
  for (const [yaml, message] of [
    ["id: T-001\nid: T-002\n", /DUPLICATE_KEY/],
    ["a: &x 1\nb: *x\n", /アンカー|エイリアス/],
    ["a: !!binary aGVsbG8=\n", /タグ/],
    ["a: !custom 1\n", /タグ/],
    ["a: [1\n", /YAML として読めません/],
    ["- a\n- b\n", /key: 値 の形ではありません/],
  ] as const) {
    assert.throws(() => YamlFrontmatter.parse(`---\n${yaml}---\n`), (error: Error) => error instanceof FrontmatterError && message.test(error.message), yaml);
  }
  assert.throws(() => YamlFrontmatter.parse("id: T-001\n"), /frontmatter がありません/);
  assert.throws(() => YamlFrontmatter.parse("---\nid: T-001\n"), /frontmatter が閉じていません/);
});

test("JSON Schema は正しい 2020-12 の schema で、必須項目の一覧が検証器と揃っている", async (t) => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { required: string[]; $defs: { phase: { required: string[] }; historyEntry: { required: string[] } } };
  const task = initialTaskV2({ id: "T-001", date: "2026-10-01", requestedBy: "human/saiki", createdBy: "agent/claude" });
  assert.deepEqual([...schema.required].sort(), Object.keys(task).sort());
  assert.deepEqual([...schema.$defs.phase.required].sort(), Object.keys(task.workflow.plan).sort());
  assert.deepEqual([...schema.$defs.historyEntry.required].sort(), Object.keys(task.history[0]).sort());
  if (!(await schemaValidator())) t.skip("ajv が導入されていない (pnpm install で導入する)");
});

test("node_modules の無い場所へ複製した scripts/ でも新形式を読んで検証できる", () => {
  const root = mkdtempSync(join(tmpdir(), "raprid-workflow-bare-"));
  try {
    cpSync(dirname(cli), join(root, "scripts"), { recursive: true, filter: (source) => !source.includes("node_modules") });
    const code = `import { readTaskFile } from ${JSON.stringify(join(root, "scripts", "lib", "workflow.ts"))};
import { readFileSync } from "node:fs";
const ok = readTaskFile(readFileSync(${JSON.stringify(join(fixtures, "v2-review-returned.md"))}, "utf8"));
const bad = readTaskFile(readFileSync(${JSON.stringify(join(fixtures, "v2-new.md"))}, "utf8").replace("phase: plan", "phase: review"));
console.log(JSON.stringify({ format: ok.format.kind, ok: ok.issues.length, bad: bad.issues.map((issue) => issue.code) }));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { format: "v2", ok: 0, bad: ["WF_ORDER", "WF_ORDER", "WF_ORDER"] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("従来のタスク操作は新形式のタスクを書き換えずに止まる", () => {
  const root = mkdtempSync(join(tmpdir(), "raprid-workflow-legacy-"));
  try {
    mkdirSync(join(root, "jobs"));
    assert.equal(raprid(root, ["job", "create", "PROJ-1"]).status, 0);
    write(root, "jobs/PROJ-1/tasks/new-style/index.md", fixture("v2-implement-progress.md"));
    const before = snapshot(root, (rel) => rel === "jobs/.locks");
    for (const args of [
      ["task", "move", "PROJ-1", "new-style", "done"],
      ["task", "note", "PROJ-1", "new-style", "memo"],
      ["task", "ask", "PROJ-1", "new-style", "q", "internal", "質問", "--requested-by", "agent/test", "--created-by", "agent/test"],
    ]) {
      const result = raprid(root, args);
      assert.equal(result.status, 1, `${args.join(" ")}\n${result.stdout}`);
    }
    assert.deepEqual(snapshot(root, (rel) => rel === "jobs/.locks"), before, "新形式のタスクは従来の操作で変わらない");
    assert.equal(read(root, "jobs/PROJ-1/tasks/new-style/index.md"), fixture("v2-implement-progress.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
