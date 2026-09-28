// 工程型タスク (workflowVersion 2) のデータ形式と整合性の検証。
// 採用仕様: jobs/project_template/tasks/task-review-status/02-workflow-design.md (T-011)
//
// タスク全体は open / closed、工程は plan → implement → review → acceptance の 4 つで、
// 各工程が waiting / ready / progress / pending / done の状態・担当・試行回数・入力版・成果物を持つ。
// 過去の試行と担当交代は history に追記する (消さない)。遷移の操作は T-013、CLI への接続は T-014 で扱う。
//
// 構造 (型・必須・列挙・書式) は schema/task-workflow-v2.schema.json と同じ規則で、
// 項目をまたぐ規則 (工程の順序・職務分離・入力版・履歴の参照) はここでだけ検証する。

import { YamlFrontmatter } from "./yamlfront.ts";

export const workflowVersion = 2;
export const phases = ["plan", "implement", "review", "acceptance"] as const;
export const phaseStatuses = ["waiting", "ready", "progress", "pending", "done"] as const;
export const taskStatuses = ["open", "closed"] as const;
export const outcomes = ["completed", "approved", "changes_requested", "legacy_import"] as const;
export const closureReasons = ["accepted", "legacy_done"] as const;
export const historyEvents = ["create", "assign", "claim", "block", "resume", "complete", "decide", "reopen", "revise", "legacy_import"] as const;

export type Phase = (typeof phases)[number];
export type PhaseStatus = (typeof phaseStatuses)[number];
export type Outcome = (typeof outcomes)[number];

export interface ArtifactRef {
  path?: string; // タスクのディレクトリからの相対パス (Markdown など)
  repo?: string; // repos/<名前>
  commit?: string;
}

export interface PhaseRecord {
  status: PhaseStatus;
  attempt: number;
  assignee: string | null;
  completedBy: string | null;
  completedAt: string | null;
  outcome: Outcome | null;
  inputRevision: number | null; // この工程の作業が対象にした requirementRevision
  artifactRefs: ArtifactRef[];
}

export interface HistoryEntry {
  seq: number;
  at: string;
  actor: string;
  event: (typeof historyEvents)[number];
  phase: Phase | null;
  attempt: number | null;
  inputRevision: number | null;
  outcome: Outcome | null;
  from: string | null;
  to: string | null;
  reason: string | null;
  refersTo: number | null; // 前の履歴の seq (差戻しの元のレビューなど)。後ろや自分は指せない
  refs: ArtifactRef[];
  sessionId?: string | null;
}

export interface TaskV2 {
  id: string;
  workflowVersion: 2;
  status: "open" | "closed";
  phase: Phase | null;
  requirementRevision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  closureReason: (typeof closureReasons)[number] | null;
  requestedBy: string | null;
  createdBy: string | null;
  blockedBy: string[];
  relatedTasks: string[];
  workflow: Record<Phase, PhaseRecord>;
  history: HistoryEntry[];
  [key: string]: unknown; // 未知の項目 (test など) は保持する
}

export type TaskFormat = { kind: "legacy" } | { kind: "v2" } | { kind: "unsupported"; version: unknown };

// workflowVersion が無ければ旧形式 (status: todo/pending/progress/done)。2 以外の版は扱わない
export function detectFormat(data: Record<string, unknown>): TaskFormat {
  if (!("workflowVersion" in data) || data.workflowVersion === null || data.workflowVersion === undefined) return { kind: "legacy" };
  if (data.workflowVersion === workflowVersion) return { kind: "v2" };
  return { kind: "unsupported", version: data.workflowVersion };
}

export interface WorkflowIssue {
  code: string;
  path: string; // 対象の項目 (例: workflow.review.completedBy、history[2].refersTo)
  message: string;
}

export const actorPattern = /^(human|agent)\/[a-z0-9][a-z0-9._-]*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const idPattern = /^T-\d{3,}$/;
const taskRefPattern = /^task\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)?T-\d{3,}$/;
const repoPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const commitPattern = /^[0-9a-f]{7,40}$/;
const sessionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isValidDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

// タスクのディレクトリの中を指す相対パス (絶対パス・..・空の要素を拒否)
export function isSafeRelativePath(value: string): boolean {
  if (value === "" || value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value)) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

class Checker {
  readonly issues: WorkflowIssue[] = [];

  add(code: string, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }

  object(value: unknown, path: string): value is Record<string, unknown> {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return true;
    this.add("WF_TYPE", path, `${path} は key: 値 の形 (オブジェクト) にしてください`);
    return false;
  }

  required(object: Record<string, unknown>, key: string, path: string): boolean {
    if (key in object) return true;
    this.add("WF_FIELD_MISSING", path ? `${path}.${key}` : key, `${path ? `${path}.` : ""}${key} がありません`);
    return false;
  }

  enumValue(value: unknown, allowed: readonly string[], path: string, nullable = false): boolean {
    if (nullable && value === null) return true;
    if (typeof value === "string" && allowed.includes(value)) return true;
    this.add("WF_ENUM", path, `${path} は ${allowed.join(" / ")}${nullable ? " か空" : ""} のいずれかです: ${JSON.stringify(value)}`);
    return false;
  }

  integer(value: unknown, path: string, min: number, nullable = false): boolean {
    if (nullable && value === null) return true;
    if (typeof value === "number" && Number.isInteger(value) && value >= min) return true;
    this.add("WF_TYPE", path, `${path} は ${min} 以上の整数${nullable ? "か空" : ""}にしてください: ${JSON.stringify(value)}`);
    return false;
  }

  actor(value: unknown, path: string, nullable = true): boolean {
    if (nullable && value === null) return true;
    if (typeof value === "string" && actorPattern.test(value)) return true;
    this.add("WF_ACTOR", path, `${path} は human/<識別子> か agent/<識別子>${nullable ? " か空" : ""}にしてください: ${JSON.stringify(value)}`);
    return false;
  }

  date(value: unknown, path: string, nullable = false): boolean {
    if (nullable && value === null) return true;
    if (typeof value === "string" && isValidDate(value)) return true;
    this.add("WF_DATE", path, `${path} は YYYY-MM-DD の日付${nullable ? "か空" : ""}にしてください: ${JSON.stringify(value)}`);
    return false;
  }

  stringList(value: unknown, path: string, pattern?: RegExp): value is string[] {
    if (!Array.isArray(value)) {
      this.add("WF_TYPE", path, `${path} は配列 ([] か「- 値」の並び) にしてください`);
      return false;
    }
    value.forEach((item, index) => {
      if (typeof item !== "string" || item.trim() === "" || /[\r\n]/.test(item)) this.add("WF_TYPE", `${path}[${index}]`, `${path}[${index}] は空でない 1 行の文字列にしてください`);
      else if (pattern && !pattern.test(item)) this.add("WF_REF", `${path}[${index}]`, `${path}[${index}] の参照の形が不正です: ${item}`);
    });
    return true;
  }

  refs(value: unknown, path: string): value is ArtifactRef[] {
    if (!Array.isArray(value)) {
      this.add("WF_TYPE", path, `${path} は配列にしてください`);
      return false;
    }
    value.forEach((item, index) => {
      const at = `${path}[${index}]`;
      if (!this.object(item, at)) return;
      const unknown = Object.keys(item).filter((key) => !["path", "repo", "commit"].includes(key));
      if (unknown.length > 0) this.add("WF_FIELD_UNKNOWN", at, `${at} に使えない項目があります: ${unknown.join(", ")}`);
      if (item.path === undefined && item.commit === undefined) this.add("WF_REF", at, `${at} には path か commit が必要です`);
      if (item.path !== undefined && (typeof item.path !== "string" || !isSafeRelativePath(item.path))) {
        this.add("WF_REF", `${at}.path`, `${at}.path はタスクのディレクトリからの相対パス (.. や絶対パスは不可) にしてください: ${JSON.stringify(item.path)}`);
      }
      if (item.commit !== undefined && (typeof item.commit !== "string" || !commitPattern.test(item.commit))) {
        this.add("WF_REF", `${at}.commit`, `${at}.commit は 7〜40 桁の小文字 16 進数にしてください: ${JSON.stringify(item.commit)}`);
      }
      if (item.commit !== undefined && item.repo === undefined) this.add("WF_REF", `${at}.repo`, `${at} の commit にはどの repo か (repo) が必要です`);
      if (item.repo !== undefined && (typeof item.repo !== "string" || !repoPattern.test(item.repo))) this.add("WF_REF", `${at}.repo`, `${at}.repo の名前が不正です: ${JSON.stringify(item.repo)}`);
    });
    return true;
  }
}

const phaseKeys = ["status", "attempt", "assignee", "completedBy", "completedAt", "outcome", "inputRevision", "artifactRefs"];
const historyKeys = ["seq", "at", "actor", "event", "phase", "attempt", "inputRevision", "outcome", "from", "to", "reason", "refersTo", "refs"];
const topKeys = ["id", "workflowVersion", "status", "phase", "requirementRevision", "createdAt", "updatedAt", "completedAt", "closureReason", "requestedBy", "createdBy", "blockedBy", "relatedTasks", "workflow", "history"];

// 工程が完了したときに取りうる結果。changes_requested は工程を差し戻した履歴にだけ現れる
const doneOutcomes: Record<Phase, readonly Outcome[]> = {
  plan: ["completed", "legacy_import"],
  implement: ["completed", "legacy_import"],
  review: ["approved", "legacy_import"],
  acceptance: ["approved", "legacy_import"],
};

export function validateTaskV2(data: unknown): WorkflowIssue[] {
  const check = new Checker();
  if (!check.object(data, "frontmatter")) return check.issues;
  const format = detectFormat(data);
  if (format.kind !== "v2") {
    check.add("WF_VERSION", "workflowVersion", format.kind === "legacy" ? "workflowVersion がありません (旧形式のタスクです)" : `対応していない workflowVersion です: ${JSON.stringify(format.version)}`);
    return check.issues;
  }
  const present = topKeys.filter((key) => check.required(data, key, ""));
  const has = (key: string) => present.includes(key);

  if (has("id") && (typeof data.id !== "string" || !idPattern.test(data.id))) check.add("WF_TYPE", "id", `id は T-001 の形にしてください: ${JSON.stringify(data.id)}`);
  const statusOk = has("status") && check.enumValue(data.status, taskStatuses, "status");
  const phaseOk = has("phase") && check.enumValue(data.phase, phases, "phase", true);
  const revisionOk = has("requirementRevision") && check.integer(data.requirementRevision, "requirementRevision", 1);
  if (has("createdAt")) check.date(data.createdAt, "createdAt");
  if (has("updatedAt")) check.date(data.updatedAt, "updatedAt");
  if (has("completedAt")) check.date(data.completedAt, "completedAt", true);
  const closureOk = has("closureReason") && check.enumValue(data.closureReason, closureReasons, "closureReason", true);
  if (has("requestedBy")) check.actor(data.requestedBy, "requestedBy");
  if (has("createdBy")) check.actor(data.createdBy, "createdBy");
  const blockedOk = has("blockedBy") && check.stringList(data.blockedBy, "blockedBy");
  if (has("relatedTasks")) check.stringList(data.relatedTasks, "relatedTasks", taskRefPattern);

  // 工程
  const records: Partial<Record<Phase, PhaseRecord>> = {};
  if (has("workflow") && check.object(data.workflow, "workflow")) {
    const workflow = data.workflow;
    const extra = Object.keys(workflow).filter((key) => !(phases as readonly string[]).includes(key));
    if (extra.length > 0) check.add("WF_FIELD_UNKNOWN", "workflow", `workflow に使えない工程があります: ${extra.join(", ")} (工程は ${phases.join(" / ")})`);
    for (const phase of phases) {
      const path = `workflow.${phase}`;
      if (!check.required(workflow, phase, "workflow")) continue;
      const record = workflow[phase];
      if (!check.object(record, path)) continue;
      const ok = phaseKeys.map((key) => check.required(record, key, path)).every(Boolean);
      if (!ok) continue;
      const fine = [
        check.enumValue(record.status, phaseStatuses, `${path}.status`),
        check.integer(record.attempt, `${path}.attempt`, 1),
        check.actor(record.assignee, `${path}.assignee`),
        check.actor(record.completedBy, `${path}.completedBy`),
        check.date(record.completedAt, `${path}.completedAt`, true),
        check.enumValue(record.outcome, outcomes, `${path}.outcome`, true),
        check.integer(record.inputRevision, `${path}.inputRevision`, 1, true),
        check.refs(record.artifactRefs, `${path}.artifactRefs`),
      ].every(Boolean);
      if (fine) records[phase] = record as unknown as PhaseRecord;
    }
  }

  // 履歴
  const history: HistoryEntry[] = [];
  if (has("history")) {
    if (!Array.isArray(data.history)) check.add("WF_TYPE", "history", "history は配列にしてください");
    else {
      data.history.forEach((entry, index) => {
        const path = `history[${index}]`;
        if (!check.object(entry, path)) return;
        if (!historyKeys.map((key) => check.required(entry, key, path)).every(Boolean)) return;
        const fine = [
          check.integer(entry.seq, `${path}.seq`, 1),
          check.date(entry.at, `${path}.at`),
          check.actor(entry.actor, `${path}.actor`, false),
          check.enumValue(entry.event, historyEvents, `${path}.event`),
          check.enumValue(entry.phase, phases, `${path}.phase`, true),
          check.integer(entry.attempt, `${path}.attempt`, 1, true),
          check.integer(entry.inputRevision, `${path}.inputRevision`, 1, true),
          check.enumValue(entry.outcome, outcomes, `${path}.outcome`, true),
          check.integer(entry.refersTo, `${path}.refersTo`, 1, true),
          check.refs(entry.refs, `${path}.refs`),
        ].every(Boolean);
        for (const key of ["from", "to", "reason"]) {
          const value = entry[key];
          if (value !== null && (typeof value !== "string" || /[\r\n]/.test(value))) check.add("WF_TYPE", `${path}.${key}`, `${path}.${key} は 1 行の文字列か空にしてください`);
        }
        if ("sessionId" in entry && entry.sessionId !== null && (typeof entry.sessionId !== "string" || !sessionPattern.test(entry.sessionId))) {
          check.add("WF_TYPE", `${path}.sessionId`, `${path}.sessionId の形が不正です`);
        }
        if (fine) history.push(entry as unknown as HistoryEntry);
      });
    }
  }

  // ここから項目をまたぐ規則。構造が壊れている項目は上で報告済みなので、読めた範囲だけを確かめる
  const allPhases = phases.every((phase) => records[phase] !== undefined);
  const revision = revisionOk ? (data.requirementRevision as number) : undefined;
  if (allPhases && statusOk && phaseOk) {
    const status = data.status as string;
    const current = data.phase as Phase | null;
    if (status === "open") {
      if (current === null) check.add("WF_OPEN_PHASE", "phase", "open のタスクには現在の工程 (phase) が必要です");
      else {
        const index = phases.indexOf(current);
        phases.forEach((phase, position) => {
          const record = records[phase]!;
          const path = `workflow.${phase}.status`;
          if (position < index && record.status !== "done") check.add("WF_ORDER", path, `現在の工程 ${current} より前の ${phase} が done ではありません (${record.status})`);
          if (position === index && !["ready", "progress", "pending"].includes(record.status)) {
            check.add("WF_ORDER", path, `現在の工程 ${current} は ready / progress / pending のいずれかです (${record.status})`);
          }
          if (position > index && record.status !== "waiting") check.add("WF_ORDER", path, `現在の工程 ${current} より後の ${phase} は waiting です (${record.status})`);
        });
        if (blockedOk) {
          const pending = records[current]!.status === "pending";
          const blocked = (data.blockedBy as string[]).length > 0;
          if (pending && !blocked) check.add("WF_BLOCKED", "blockedBy", `工程 ${current} が pending なのに blockedBy が空です`);
          if (!pending && blocked) check.add("WF_BLOCKED", "blockedBy", `工程 ${current} が pending ではないのに blockedBy があります`);
        }
      }
      if (data.completedAt !== null && has("completedAt")) check.add("WF_CLOSED", "completedAt", "open のタスクには completedAt を書きません");
      if (closureOk && data.closureReason !== null) check.add("WF_CLOSED", "closureReason", "open のタスクには closureReason を書きません");
    } else {
      if (current !== null) check.add("WF_CLOSED", "phase", "closed のタスクの phase は空にします");
      if (has("completedAt") && data.completedAt === null) check.add("WF_CLOSED", "completedAt", "closed のタスクには閉じた日 (completedAt) が必要です");
      if (blockedOk && (data.blockedBy as string[]).length > 0) check.add("WF_BLOCKED", "blockedBy", "closed のタスクに blockedBy は書きません");
      if (closureOk && data.closureReason === null) check.add("WF_CLOSED", "closureReason", "closed のタスクには閉じた理由 (accepted / legacy_done) が必要です");
      for (const phase of phases) {
        if (records[phase]!.status !== "done") check.add("WF_CLOSED", `workflow.${phase}.status`, `closed のタスクの工程はすべて done です (${phase}: ${records[phase]!.status})`);
      }
      if (closureOk && data.closureReason === "accepted") {
        const acceptance = records.acceptance!;
        if (acceptance.outcome !== "approved") check.add("WF_CLOSED", "workflow.acceptance.outcome", "accepted で閉じるには受入確認 (acceptance) の結果が approved である必要があります");
      }
      if (closureOk && data.closureReason === "legacy_done") {
        // 旧 done の移行では承認を捏造しない
        for (const phase of phases) {
          if (records[phase]!.outcome !== "legacy_import") check.add("WF_LEGACY", `workflow.${phase}.outcome`, `legacy_done で閉じたタスクの工程の結果は legacy_import です (${phase}: ${records[phase]!.outcome})`);
        }
      }
    }
  }

  // 工程ごとの記録の整合
  for (const phase of phases) {
    const record = records[phase];
    if (!record) continue;
    const path = `workflow.${phase}`;
    if (record.status === "done") {
      // 旧形式から移した工程 (legacy_import) は、誰がいつ完了したか分からないので空のままにできる
      if (record.outcome !== "legacy_import") {
        if (record.completedBy === null) check.add("WF_DONE", `${path}.completedBy`, `done の工程 ${phase} には完了した人 (completedBy) が必要です`);
        if (record.completedAt === null) check.add("WF_DONE", `${path}.completedAt`, `done の工程 ${phase} には完了日 (completedAt) が必要です`);
      }
      if (record.outcome === null || !doneOutcomes[phase].includes(record.outcome)) {
        check.add("WF_OUTCOME", `${path}.outcome`, `done の工程 ${phase} の結果は ${doneOutcomes[phase].join(" / ")} のいずれかです (${record.outcome ?? "空"})`);
      }
      if (record.outcome !== "legacy_import" && record.inputRevision === null) check.add("WF_DONE", `${path}.inputRevision`, `done の工程 ${phase} には対象にした要件の版 (inputRevision) が必要です`);
    } else {
      for (const key of ["completedBy", "completedAt", "outcome"] as const) {
        if (record[key] !== null) check.add("WF_DONE", `${path}.${key}`, `${record.status} の工程 ${phase} には ${key} を書きません (前の結果は history に残す)`);
      }
      if (record.status === "waiting" && record.inputRevision !== null) check.add("WF_DONE", `${path}.inputRevision`, `waiting の工程 ${phase} には inputRevision を書きません`);
    }
    if (revision !== undefined && record.inputRevision !== null && record.inputRevision > revision) {
      check.add("WF_STALE", `${path}.inputRevision`, `${phase} の inputRevision (${record.inputRevision}) が requirementRevision (${revision}) より新しい`);
    }
  }
  // レビューと受入は、今の要件の版に対するものだけを通過とみなす
  if (revision !== undefined) {
    for (const phase of ["review", "acceptance"] as const) {
      const record = records[phase];
      if (record && record.status === "done" && record.outcome === "approved" && record.inputRevision !== revision) {
        check.add("WF_STALE", `workflow.${phase}.inputRevision`, `${phase} の承認は古い要件の版 (${record.inputRevision}) に対するものです (現在 ${revision})`);
      }
    }
  }
  // 職務分離: 実装を完了した人は同じ実装をレビューできない。受入確認は人だけ
  const implement = records.implement;
  const review = records.review;
  if (implement && review && review.status === "done" && review.outcome === "approved" && implement.completedBy !== null && implement.completedBy === review.completedBy) {
    check.add("WF_SEPARATION", "workflow.review.completedBy", `実装を完了した ${implement.completedBy} が同じ実装をレビューしています`);
  }
  const acceptance = records.acceptance;
  if (acceptance) {
    if (acceptance.assignee !== null && !acceptance.assignee.startsWith("human/")) check.add("WF_HUMAN", "workflow.acceptance.assignee", `受入確認の担当は人 (human/…) です: ${acceptance.assignee}`);
    if (acceptance.completedBy !== null && !acceptance.completedBy.startsWith("human/")) check.add("WF_HUMAN", "workflow.acceptance.completedBy", `受入確認を完了できるのは人 (human/…) です: ${acceptance.completedBy}`);
  }

  // 履歴: seq は 1 から増え続け、refersTo は前の履歴だけを指す (循環しない)。日付と試行回数は戻らない
  history.forEach((entry, index) => {
    const path = `history[${index}]`;
    if (entry.seq !== index + 1) check.add("WF_HISTORY_ORDER", `${path}.seq`, `history の seq は 1 から順に並べます (${index + 1} の位置に ${entry.seq})`);
    if (entry.refersTo !== null && entry.refersTo >= entry.seq) check.add("WF_HISTORY_REF", `${path}.refersTo`, `history の refersTo は前の履歴 (seq ${entry.seq} より小さい) だけを指せます: ${entry.refersTo}`);
    if (entry.refersTo !== null && !history.some((other) => other.seq === entry.refersTo)) check.add("WF_HISTORY_REF", `${path}.refersTo`, `history の refersTo が存在しない履歴を指しています: ${entry.refersTo}`);
    if (index > 0 && entry.at < history[index - 1].at) check.add("WF_HISTORY_ORDER", `${path}.at`, `history の日付が前の履歴より古くなっています (${entry.at})`);
    if (entry.phase !== null && entry.attempt !== null) {
      const record = records[entry.phase];
      if (record && entry.attempt > record.attempt) check.add("WF_HISTORY_ATTEMPT", `${path}.attempt`, `history の ${entry.phase} の試行 ${entry.attempt} が現在の試行 ${record.attempt} より大きい`);
      const earlier = history.slice(0, index).filter((other) => other.phase === entry.phase && other.attempt !== null);
      if (earlier.length > 0 && entry.attempt < earlier[earlier.length - 1].attempt!) {
        check.add("WF_HISTORY_ATTEMPT", `${path}.attempt`, `history の ${entry.phase} の試行回数が戻っています (${earlier[earlier.length - 1].attempt} の後に ${entry.attempt})`);
      }
    }
    if (revision !== undefined && entry.inputRevision !== null && entry.inputRevision > revision) {
      check.add("WF_STALE", `${path}.inputRevision`, `history の inputRevision (${entry.inputRevision}) が requirementRevision (${revision}) より新しい`);
    }
  });
  if (has("history") && Array.isArray(data.history) && data.history.length === 0) check.add("WF_HISTORY_ORDER", "history", "history には作成 (create) の記録が 1 件以上必要です");
  if (history.length > 0 && history[0].event !== "create" && history[0].event !== "legacy_import") {
    check.add("WF_HISTORY_ORDER", "history[0].event", `history の最初は create か legacy_import です (${history[0].event})`);
  }
  return check.issues;
}

// 新しいタスクの初期値。計画が ready、後続は waiting、全体は open
export function initialTaskV2(fields: { id: string; date: string; requestedBy: string; createdBy: string }): TaskV2 {
  const phase = (status: PhaseStatus): PhaseRecord => ({ status, attempt: 1, assignee: null, completedBy: null, completedAt: null, outcome: null, inputRevision: null, artifactRefs: [] });
  return {
    id: fields.id,
    workflowVersion: 2,
    status: "open",
    phase: "plan",
    requirementRevision: 1,
    createdAt: fields.date,
    updatedAt: fields.date,
    completedAt: null,
    closureReason: null,
    requestedBy: fields.requestedBy,
    createdBy: fields.createdBy,
    blockedBy: [],
    relatedTasks: [],
    workflow: { plan: phase("ready"), implement: phase("waiting"), review: phase("waiting"), acceptance: phase("waiting") },
    history: [
      { seq: 1, at: fields.date, actor: fields.createdBy, event: "create", phase: "plan", attempt: 1, inputRevision: 1, outcome: null, from: null, to: "ready", reason: null, refersTo: null, refs: [] },
    ],
  };
}

// index.md を読み、形式を見分けて検証する。旧形式は検証せずに legacy として返す
export function readTaskFile(text: string, source = "index.md"): { format: TaskFormat; frontmatter: YamlFrontmatter; issues: WorkflowIssue[] } {
  const frontmatter = YamlFrontmatter.parse(text, source);
  const data = frontmatter.data();
  const format = detectFormat(data);
  const issues = format.kind === "legacy" ? [] : validateTaskV2(data);
  return { format, frontmatter, issues };
}
