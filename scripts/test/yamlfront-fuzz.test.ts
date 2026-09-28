// YamlFrontmatter の書き換えを、乱数で作った文書と操作で網羅的に確かめる。
//
// 文書: ブロック形式・フロー形式の対応表と配列、「- key:」の行に最初の項目がある要素と「-」だけの行の要素、
//       項目・要素の前のコメント行、null・数値・引用符が必要な文字列を混ぜる。
// 操作: 既存の値の置き換え、対応表への項目の追加、配列の末尾への追加、途中の階層ごとの追加、削除、扱えない操作。
// 確認: (1) 書き換え後の値が、同じ操作を JavaScript の値にかけた結果と同じ
//       (2) 対象の外にあるコメントが残る (置き換えた項目の直前のコメントも残る)
//       (3) 扱えない操作は YamlEditError で、文字列が変わらない
// 乱数の種は固定し、失敗したら種と操作を表示する。

import assert from "node:assert/strict";
import { test } from "node:test";
import { stringify } from "../vendor/yaml.mjs";
import { YamlEditError, YamlFrontmatter, type YamlPath } from "../lib/yamlfront.ts";

type Value = null | number | string | Value[] | { [key: string]: Value };

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Generator {
  private readonly next: () => number;
  private counter = 0;

  constructor(seed: number) {
    this.next = random(seed);
  }

  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  key(): string {
    return this.pick(["a", "b", "c", "status", "refs", "x y", "k:v", "日本語"]) + String(this.counter++);
  }

  scalar(allowMultiline = false): Value {
    const kind = this.int(allowMultiline ? 8 : 7);
    if (kind === 0) return null;
    if (kind === 1) return this.int(1000);
    if (kind === 2) return this.pick(["0012", "true", "null", "1.0", "- x", "#tag"]); // 引用しないと別の型になる文字列
    if (kind === 3) return this.pick(["a: b", "x # y", "other: A, B", "{z}", "[q]", "'s'", '"d"']);
    if (kind === 4) return "";
    if (kind === 7) return "一行目\n二行目";
    return this.pick(["ready", "done", "agent/claude", "2026-09-28T01:00:00Z", "日本語"]);
  }

  value(depth: number, allowMultiline = false): Value {
    if (depth <= 0 || this.chance(0.45)) return this.scalar(allowMultiline);
    if (this.chance(0.5)) return Array.from({ length: this.int(4) }, () => this.value(depth - 1, allowMultiline));
    const map: { [key: string]: Value } = {};
    for (let i = this.int(4); i > 0; i--) map[this.key()] = this.value(depth - 1, allowMultiline);
    return map;
  }
}

function isCollection(value: Value): value is Value[] | { [key: string]: Value } {
  return value !== null && typeof value === "object";
}

function empty(value: Value): boolean {
  return Array.isArray(value) ? value.length === 0 : isCollection(value) && Object.keys(value).length === 0;
}

// 文書を書く。コメントは「#c<番号>」で、付いている項目の path を記録する
class Writer {
  readonly comments = new Map<string, string>(); // コメント → 付いている項目の path (JSON)
  private readonly gen: Generator;
  private counter = 0;

  constructor(gen: Generator) {
    this.gen = gen;
  }

  private comment(path: YamlPath, indent: number, lines: string[]): void {
    if (!this.gen.chance(0.4)) return;
    const text = `#c${this.counter++}`;
    this.comments.set(text, JSON.stringify(path));
    lines.push(`${" ".repeat(indent)}${text}`);
  }

  private scalar(value: Value): string {
    return stringify(value, { nullStr: "", lineWidth: 0 }).replace(/\n$/, "");
  }

  private flow(value: Value): string {
    return stringify(value, { nullStr: "null", lineWidth: 0, collectionStyle: "flow" }).replace(/\n$/, "").trim();
  }

  private canFlow(value: Value): boolean {
    return !isCollection(value) ? typeof value !== "string" || !value.includes("\n") : (Array.isArray(value) ? value : Object.values(value)).every((child) => this.canFlow(child));
  }

  // 対応表の項目を書く (indent は key の位置)
  map(map: { [key: string]: Value }, indent: number, path: YamlPath, lines: string[], firstPrefix?: string): void {
    Object.entries(map).forEach(([key, value], index) => {
      const keyText = this.scalar(key);
      const head = index === 0 && firstPrefix !== undefined ? firstPrefix : " ".repeat(indent);
      if (!(index === 0 && firstPrefix !== undefined)) this.comment([...path, key], indent, lines);
      this.entry(`${head}${keyText}:`, value, indent, [...path, key], lines);
    });
  }

  // 「key:」の後ろに値を書く
  private entry(head: string, value: Value, indent: number, path: YamlPath, lines: string[]): void {
    if (!isCollection(value)) {
      const text = this.scalar(value);
      lines.push(text === "" ? head : `${head} ${text}`);
      return;
    }
    if (empty(value) || (this.canFlow(value) && this.gen.chance(0.3))) {
      lines.push(`${head} ${this.flow(value)}`);
      return;
    }
    lines.push(head);
    if (Array.isArray(value)) this.seq(value, indent + 2, path, lines);
    else this.map(value, indent + 2, path, lines);
  }

  // 配列の要素を書く (indent は「-」の位置)
  seq(items: Value[], indent: number, path: YamlPath, lines: string[]): void {
    items.forEach((item, index) => {
      this.comment([...path, index], indent, lines);
      const dash = " ".repeat(indent);
      if (!isCollection(item)) {
        const text = this.scalar(item);
        lines.push(text === "" ? `${dash}-` : `${dash}- ${text}`);
      } else if (empty(item) || (this.canFlow(item) && this.gen.chance(0.3))) {
        lines.push(`${dash}- ${this.flow(item)}`);
      } else if (Array.isArray(item)) {
        lines.push(`${dash}-`);
        this.seq(item, indent + 2, [...path, index], lines);
      } else if (this.gen.chance(0.5)) {
        this.map(item, indent + 2, [...path, index], lines, `${dash}- `); // 最初の項目を「- 」の行に書く
      } else {
        lines.push(`${dash}-`); // 「-」だけの行の次に書く
        this.map(item, indent + 2, [...path, index], lines);
      }
    });
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function at(root: Value, path: YamlPath): Value | undefined {
  let current: Value | undefined = root;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, Value>)[String(key)];
    if (current === undefined) return undefined;
  }
  return current;
}

function paths(root: Value, prefix: YamlPath = []): YamlPath[] {
  if (!isCollection(root)) return [];
  const entries: [string | number, Value][] = Array.isArray(root) ? root.map((value, index) => [index, value]) : Object.entries(root);
  return entries.flatMap(([key, value]) => [[...prefix, key], ...paths(value, [...prefix, key])]);
}

function startsWith(path: string, prefix: YamlPath): boolean {
  const target = JSON.parse(path) as YamlPath;
  return prefix.every((key, index) => target[index] === key);
}

interface Operation {
  name: string;
  path: YamlPath;
  value?: Value;
  invalid?: boolean;
}

function operation(gen: Generator, model: { [key: string]: Value }): Operation {
  const all = paths(model);
  const maps = [[], ...all.filter((path) => isCollection(at(model, path)!) && !Array.isArray(at(model, path)))] as YamlPath[];
  const seqs = all.filter((path) => Array.isArray(at(model, path)));
  const scalars = all.filter((path) => !isCollection(at(model, path)!) && at(model, path) !== null);
  switch (gen.int(8)) {
    case 0:
    case 1:
      if (all.length > 0) return { name: "置き換え", path: gen.pick(all), value: gen.value(2, true) };
      break;
    case 2:
      return { name: "項目の追加", path: [...gen.pick(maps), gen.key()], value: gen.value(2, true) };
    case 3:
      if (seqs.length > 0) {
        const path = gen.pick(seqs);
        return { name: "末尾への追加", path: [...path, (at(model, path) as Value[]).length], value: gen.value(2, true) };
      }
      break;
    case 4:
      return { name: "階層ごとの追加", path: [...gen.pick(maps), gen.key(), gen.chance(0.5) ? 0 : gen.key()], value: gen.value(1) };
    case 5:
    case 6:
      if (all.length > 0) return { name: "削除", path: gen.pick(all) };
      break;
    case 7:
      if (seqs.length > 0 && gen.chance(0.5)) {
        const path = gen.pick(seqs);
        return { name: "途中を飛ばした番号", path: [...path, (at(model, path) as Value[]).length + 1], value: 1, invalid: true };
      }
      if (scalars.length > 0) return { name: "値の下への追加", path: [...gen.pick(scalars), gen.key()], value: 1, invalid: true };
      break;
  }
  return { name: "項目の追加", path: [gen.key()], value: gen.scalar() };
}

function apply(model: { [key: string]: Value }, op: Operation): void {
  const parent = op.path.length === 1 ? model : (at(model, op.path.slice(0, -1)) as Record<string, Value> | Value[] | undefined);
  const last = op.path[op.path.length - 1];
  if (op.name === "削除") {
    if (Array.isArray(parent)) parent.splice(Number(last), 1);
    else delete (parent as Record<string, Value>)[String(last)];
    return;
  }
  if (op.name === "階層ごとの追加") {
    const holder = op.path.length === 2 ? model : (at(model, op.path.slice(0, -2)) as Record<string, Value>);
    const inner = op.path[op.path.length - 1];
    (holder as Record<string, Value>)[String(op.path[op.path.length - 2])] = typeof inner === "number" ? [op.value!] : { [inner]: op.value! };
    return;
  }
  if (Array.isArray(parent)) parent[Number(last)] = clone(op.value!);
  else (parent as Record<string, Value>)[String(last)] = clone(op.value!);
}

test("乱数で作った文書と操作で、値・対象外のコメント・失敗時の不変を確かめる", () => {
  let checked = 0;
  let refused = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const gen = new Generator(seed);
    const model: { [key: string]: Value } = {};
    for (let i = 1 + gen.int(5); i > 0; i--) model[gen.key()] = gen.value(3);
    const writer = new Writer(gen);
    const lines: string[] = [];
    writer.map(model, 0, [], lines);
    const text = `---\n${lines.join("\n")}\n---\n本文\n`;
    const frontmatter = YamlFrontmatter.parse(text);
    assert.deepEqual(frontmatter.data(), model, `種 ${seed}: 生成した文書を読める\n${text}`);
    const comments = new Map(writer.comments);
    const history: string[] = [];
    for (let step = 0; step < 6; step++) {
      const op = operation(gen, model);
      history.push(`${op.name} ${JSON.stringify(op.path)} ${JSON.stringify(op.value)}`);
      const before = frontmatter.toString();
      const context = () => `種 ${seed} の ${step + 1} 回目\n${history.join("\n")}\n--- 前\n${before}`;
      if (op.invalid) {
        assert.throws(() => frontmatter.set(op.path, op.value), YamlEditError, context());
        assert.equal(frontmatter.toString(), before, `扱えない操作で変わった\n${context()}`);
        refused++;
        continue;
      }
      try {
        if (op.name === "削除") frontmatter.delete(op.path);
        else frontmatter.set(op.path, op.value);
      } catch (error) {
        assert.fail(`対応しているはずの操作が失敗した: ${error instanceof Error ? error.message : String(error)}\n${context()}`);
      }
      apply(model, op);
      const after = frontmatter.toString();
      assert.deepEqual(frontmatter.data(), model, `値が違う\n${context()}\n--- 後\n${after}`);
      assert.ok(after.endsWith("---\n本文\n"), `本文が変わった\n${context()}`);
      // 対象の外のコメントは残る。削除では対象に付いたコメントも消えてよい。置き換えでは対象の直前のコメントは残る
      const target = op.name === "階層ごとの追加" ? op.path.slice(0, -1) : op.path;
      for (const [comment, owner] of [...comments]) {
        const inside = startsWith(owner, target);
        const own = owner === JSON.stringify(target);
        const mayGo = inside && (op.name === "削除" || !own);
        if (mayGo) {
          if (!after.includes(comment)) comments.delete(comment);
          continue;
        }
        assert.ok(after.includes(comment), `対象外のコメント ${comment} (${owner}) が消えた\n${context()}\n--- 後\n${after}`);
      }
      // 配列の要素を消すと後ろの要素の番号がずれる。持ち主を正しく追えないコメントは、以降の確認から外す
      if (op.name === "削除" && typeof op.path[op.path.length - 1] === "number") {
        for (const [comment, owner] of [...comments]) if (startsWith(owner, op.path.slice(0, -1))) comments.delete(comment);
      }
      checked++;
    }
  }
  assert.ok(checked > 1500, `確かめた操作: ${checked}`);
  assert.ok(refused > 50, `扱えない操作: ${refused}`);
});
