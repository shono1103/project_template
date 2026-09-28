// ネストした値を持つ frontmatter (workflowVersion 2 のタスク) を読み書きする。
//
// 書き換えは、元の文字列のうち対象の値の範囲だけを差し替える (yaml の節点が持つ位置を使う)。
// 文書全体を書き直さないので、書き換えていない行・未知の項目・コメント・引用符・数値の書き方 (0012 など)・本文は
// 1 文字も変わらない。新しく書く値だけを yaml の書式で書く (ブロック形式の中は null を空欄・配列を「- 値」・2 字下げ、
// フロー形式 ({a: 1}・[a]) の中はフロー形式)。
//
// 対応する操作:
//   set(path, value)  既存の値の置き換え、対応表への項目の追加、配列の末尾への追加 (path の最後が配列の長さと同じ番号)
//   delete(path)      対応表の項目・配列の要素の削除 (兄弟の項目・要素は残す)
// 配列の途中を飛ばした番号・スカラーの下への追加のように意味があいまいな操作は、何も変えずに YamlEditError にする。
// アンカー・エイリアス・明示的なタグは推測で解釈せずに拒否する (frontmatter は素朴なデータだけにする)。
// 旧形式 (1 段の key: 値) は従来どおり lib/frontmatter.ts が扱う。

import { isMap, isScalar, isSeq, parseDocument, stringify, visit } from "../vendor/yaml.mjs";
import { FrontmatterError } from "./frontmatter.ts";

type YamlDocument = ReturnType<typeof parseDocument>;
type Range = [number, number, number];
type YamlNode = { range?: Range | null; flow?: boolean; value?: unknown };
type YamlPair = { key: YamlNode; value: YamlNode | null };
type YamlCollection = YamlNode & { items: unknown[] };
export type YamlPath = (string | number)[];

const parseOptions = { uniqueKeys: true, prettyErrors: false } as const;
const blockOptions = { nullStr: "", lineWidth: 0, indent: 2, indentSeq: true } as const;
const flowOptions = { nullStr: "", lineWidth: 0, collectionStyle: "flow" } as const;

// 書き換えの操作が扱えないとき。状態は変えない
export class YamlEditError extends Error {}

function parse(yamlText: string, source: string): YamlDocument {
  const doc = parseDocument(yamlText, parseOptions);
  if (doc.errors.length > 0) {
    const error = doc.errors[0];
    throw new FrontmatterError(`YAML として読めません (${error.code}: ${error.message.split("\n")[0]}): ${source}`);
  }
  if (doc.contents !== null && !isMap(doc.contents)) throw new FrontmatterError(`frontmatter が key: 値 の形ではありません: ${source}`);
  let unsupported: string | undefined;
  visit(doc, {
    Alias() {
      unsupported = "エイリアス (*名前)";
      return visit.BREAK;
    },
    Node(_, node) {
      if ("anchor" in node && node.anchor) {
        unsupported = "アンカー (&名前)";
        return visit.BREAK;
      }
      // 読み取った節点の tag は、元の文字列で明示したとき (!!str、!x など) だけ設定される
      if ("tag" in node && node.tag !== undefined) {
        unsupported = "明示的なタグ (!!型)";
        return visit.BREAK;
      }
      return undefined;
    },
  });
  if (unsupported) throw new FrontmatterError(`対応していない YAML の書式です (${unsupported}): ${source}`);
  return doc;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isCollection(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function isEmpty(value: object): boolean {
  return Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
}

function keyName(pair: YamlPair): string {
  return isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
}

function withoutNewline(text: string): string {
  return text.replace(/\n$/, "");
}

// 途中の階層を作る。番号は 0 だけ (配列の最初の要素) を作れる
function nested(path: YamlPath, value: unknown): unknown {
  return path.reduceRight<unknown>((inner, key) => {
    if (typeof key === "number") {
      if (key !== 0) throw new YamlEditError(`存在しない配列の ${key} 番目は作れません (末尾への追加だけに対応)`);
      return [inner];
    }
    return { [key]: inner };
  }, value);
}

// フロー形式の中に置く値
function flowText(value: unknown): string {
  return withoutNewline(stringify(value ?? null, flowOptions)).trim();
}

// ブロック形式の「key:」の後ろに置く文字列。コレクションは次の行から keyColumn + 2 の字下げで書く
function afterColon(value: unknown, keyColumn: number): string {
  if (value === null || value === undefined) return "";
  if (!isCollection(value)) {
    // 「v: 値」として書き出して値の部分を使う (ブロック文字列の中身に字下げが付く)。続きの行は key の位置に合わせる
    const [first, ...rest] = withoutNewline(stringify({ v: value }, blockOptions)).replace(/^v:/, "").split("\n");
    return [first, ...rest.map((line) => (line === "" ? line : " ".repeat(keyColumn) + line))].join("\n");
  }
  if (isEmpty(value)) return Array.isArray(value) ? " []" : " {}";
  const pad = " ".repeat(keyColumn + 2);
  return `\n${withoutNewline(stringify(value, blockOptions)).split("\n").map((line) => (line === "" ? line : pad + line)).join("\n")}`;
}

// ブロック形式の配列の要素 (「- 」の後ろ)。続きの行は要素の位置 (itemColumn) に合わせる
function itemText(value: unknown, itemColumn: number): string {
  if (!isCollection(value)) {
    const [first, ...rest] = withoutNewline(stringify([value ?? null], blockOptions)).replace(/^- ?/, "").split("\n");
    return [first, ...rest.map((line) => (line === "" ? line : " ".repeat(itemColumn - 2) + line))].join("\n");
  }
  if (isEmpty(value)) return Array.isArray(value) ? "[]" : "{}";
  const [first, ...rest] = withoutNewline(stringify(value, blockOptions)).split("\n");
  return [first, ...rest.map((line) => (line === "" ? line : " ".repeat(itemColumn) + line))].join("\n");
}

export class YamlFrontmatter {
  private yaml: string;
  private doc: YamlDocument;
  private readonly body: string;
  private readonly eol: string;
  private readonly source: string;
  private readonly original: string;

  private constructor(yaml: string, doc: YamlDocument, body: string, eol: string, source: string) {
    this.yaml = yaml;
    this.original = yaml;
    this.doc = doc;
    this.body = body;
    this.eol = eol;
    this.source = source;
  }

  static parse(text: string, source = "frontmatter"): YamlFrontmatter {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    if (lines[0] !== "---") throw new FrontmatterError(`frontmatter がありません: ${source}`);
    const close = lines.indexOf("---", 1);
    if (close < 0) throw new FrontmatterError(`frontmatter が閉じていません: ${source}`);
    const yamlText = lines.slice(1, close).join("\n") + (close > 1 ? "\n" : "");
    return new YamlFrontmatter(yamlText, parse(yamlText, source), lines.slice(close + 1).join(eol), eol, source);
  }

  // 値を JavaScript の値として読む (日付・日時は文字列のまま)
  data(): Record<string, unknown> {
    const value = this.doc.toJS() as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  has(path: YamlPath): boolean {
    return path.length === 0 || this.doc.hasIn(path);
  }

  get(path: YamlPath): unknown {
    const node = (path.length === 0 ? this.doc.contents : this.doc.getIn(path, true)) as unknown;
    if (node === undefined) return undefined;
    if (node === null) return null;
    if (isScalar(node)) return node.value;
    if (isMap(node) || isSeq(node)) return node.toJSON();
    return node;
  }

  // 値を置き換える (途中の階層が無ければ作る)。同じ値なら何もしない。扱えない操作は YamlEditError で、何も変えない
  set(path: YamlPath, value: unknown): void {
    if (path.length === 0) throw new YamlEditError("書き換える項目を指定してください");
    if (this.has(path)) {
      if (!same(this.get(path), value)) this.replace(path, value);
      return;
    }
    // 無い階層の手前まで戻り、その下にまとめて作る
    let depth = path.length - 1;
    while (depth > 0 && !this.has(path.slice(0, depth))) depth--;
    this.add(path.slice(0, depth), path[depth], nested(path.slice(depth + 1), value));
  }

  delete(path: YamlPath): void {
    if (path.length === 0) throw new YamlEditError("削除する項目を指定してください");
    if (!this.has(path)) return;
    const parentPath = path.slice(0, -1);
    const parent = this.collection(parentPath)!;
    const last = path[path.length - 1];
    if (isSeq(parent)) {
      const index = Number(last);
      const item = parent.items[index] as YamlNode;
      if (parent.flow) return this.cutFlowItem(parent, index, item.range!);
      if (parent.items.length === 1) return this.replace(parentPath, []); // 最後の要素を消したら空の配列にする (null にしない)
      return this.splice(this.lineStart(this.dashOf(item)), this.endOfLine(item.range![1]), "");
    }
    const items = parent.items as YamlPair[];
    const index = items.findIndex((pair) => keyName(pair) === String(last));
    const pair = items[index];
    const end = (pair.value ?? pair.key).range![1];
    if (parent.flow) return this.cutFlowItem(parent, index, [pair.key.range![0], end, end]);
    if (items.length === 1 && parentPath.length > 0) return this.replace(parentPath, {}); // 最後の項目を消したら空の対応表にする
    const start = pair.key.range![0];
    if (this.onDashLine(start)) {
      // 配列の要素の最初の項目 (「- key: 値」) は、「- 」を残して次の項目を詰める
      return this.splice(start, items[index + 1].key.range![0], "");
    }
    this.splice(this.lineStart(start), this.endOfLine(end), "");
  }

  toString(): string {
    const yamlText = withoutNewline(this.yaml);
    const lines = yamlText === "" ? [] : yamlText.split("\n");
    return ["---", ...lines, "---"].join(this.eol) + this.eol + this.body;
  }

  // 変更が無いか (無ければ toString は元の文字列と同じ)
  get changed(): boolean {
    return this.yaml !== this.original;
  }

  private collection(path: YamlPath): YamlCollection | null {
    const node = (path.length === 0 ? this.doc.contents : this.doc.getIn(path, true)) as unknown;
    return isMap(node) || isSeq(node) ? (node as unknown as YamlCollection) : null;
  }

  // 既にある値を置き換える
  private replace(path: YamlPath, value: unknown): void {
    const parentPath = path.slice(0, -1);
    const parent = this.collection(parentPath);
    const last = path[path.length - 1];
    if (!parent) throw new YamlEditError(`書き換える場所が見つかりません: ${path.join(".")}`);
    if (isSeq(parent)) {
      const item = parent.items[Number(last)] as YamlNode;
      const start = item.range![0];
      const end = this.trimNewline(start, item.range![1]);
      return this.splice(start, end, parent.flow ? flowText(value) : itemText(value, this.column(start)));
    }
    const pair = (parent.items as YamlPair[]).find((candidate) => keyName(candidate) === String(last))!;
    const colon = this.yaml.indexOf(":", pair.key.range![1]);
    const valueRange = pair.value?.range && pair.value.range[1] > colon ? pair.value.range : undefined;
    if (parent.flow) {
      if (valueRange) return this.splice(valueRange[0], valueRange[1], flowText(value));
      return this.splice(colon + 1, colon + 1, ` ${flowText(value)}`);
    }
    const valueEnd = this.trimNewline(colon + 1, valueRange ? valueRange[1] : colon + 1);
    this.splice(colon + 1, valueEnd, afterColon(value, this.column(pair.key.range![0])));
  }

  // 親の対応表に項目を足す、または親の配列の末尾に要素を足す
  private add(parentPath: YamlPath, key: string | number, value: unknown): void {
    const where = parentPath.join(".") || "(最上位)";
    const parent = this.collection(parentPath);
    if (parent && isSeq(parent)) {
      if (typeof key !== "number" || key !== parent.items.length) {
        throw new YamlEditError(`配列 ${where} には末尾 (${parent.items.length} 番目) にだけ追加できます: ${String(key)}`);
      }
      return this.append(parentPath, parent, value);
    }
    if (typeof key === "number") throw new YamlEditError(`${where} は配列ではないので ${key} 番目は作れません`);
    if (parent === null) {
      if (parentPath.length === 0) return this.appendTop(key, value);
      const current = this.get(parentPath);
      if (current !== null) throw new YamlEditError(`${where} は値 (${JSON.stringify(current)}) なので、その下に項目を作れません`);
      return this.replace(parentPath, { [key]: value }); // 空の値 (key:) の下に作る
    }
    const items = parent.items as YamlPair[];
    if (items.length === 0) {
      if (parentPath.length === 0) return this.appendTop(key, value);
      return this.replace(parentPath, { [key]: value }); // {} を書き直す
    }
    const keyText = withoutNewline(stringify(key, blockOptions));
    const last = items[items.length - 1];
    const lastEnd = this.trimNewline(0, (last.value ?? last.key).range![1]);
    if (parent.flow) return this.splice(lastEnd, lastEnd, `, ${keyText}: ${flowText(value)}`);
    const column = this.column(items[0].key.range![0]);
    const end = this.endOfLine(lastEnd);
    const prefix = end > 0 && this.yaml[end - 1] !== "\n" ? "\n" : "";
    this.splice(end, end, `${prefix}${" ".repeat(column)}${keyText}:${afterColon(value, column)}\n`);
  }

  private appendTop(key: string, value: unknown): void {
    const base = this.yaml === "" || this.yaml.endsWith("\n") ? this.yaml : `${this.yaml}\n`;
    this.splice(0, this.yaml.length, `${base}${withoutNewline(stringify(key, blockOptions))}:${afterColon(value, 0)}\n`);
  }

  private append(parentPath: YamlPath, parent: YamlCollection, value: unknown): void {
    if (parent.items.length === 0) return this.replace(parentPath, [value]); // [] はブロック形式で書き直す
    const lastItem = parent.items[parent.items.length - 1] as YamlNode;
    if (parent.flow) {
      const end = this.trimNewline(0, lastItem.range![1]);
      return this.splice(end, end, `, ${flowText(value)}`);
    }
    const dash = this.dashOf(lastItem);
    const dashColumn = this.column(dash);
    const itemColumn = this.column(lastItem.range![0]);
    const end = this.endOfLine(lastItem.range![1]);
    const prefix = end > 0 && this.yaml[end - 1] !== "\n" ? "\n" : "";
    this.splice(end, end, `${prefix}${" ".repeat(dashColumn)}-${" ".repeat(Math.max(1, itemColumn - dashColumn - 1))}${itemText(value, itemColumn)}\n`);
  }

  // フロー形式の要素・項目を、前後のカンマごと取り除く
  private cutFlowItem(parent: YamlCollection, index: number, range: Range): void {
    let [start, end] = range;
    end = this.trimNewline(start, end);
    if (index < parent.items.length - 1) {
      const next = /^\s*,\s*/.exec(this.yaml.slice(end));
      end += next ? next[0].length : 0;
    } else if (index > 0) {
      const before = /\s*,\s*$/.exec(this.yaml.slice(0, start));
      start -= before ? before[0].length : 0;
    }
    this.splice(start, end, "");
  }

  // ブロック形式の配列の要素の「-」の位置 (同じ行で、要素の前は空白だけ)
  private dashOf(item: YamlNode): number {
    const start = item.range![0];
    const dash = this.yaml.lastIndexOf("-", start - 1);
    if (dash < this.lineStart(start) || !/^\s*$/.test(this.yaml.slice(dash + 1, start))) throw new YamlEditError("配列の要素の位置を特定できません");
    return dash;
  }

  // offset の前が同じ行の「- 」だけか (配列の要素の最初の項目)
  private onDashLine(offset: number): boolean {
    return /^\s*-\s+$/.test(this.yaml.slice(this.lineStart(offset), offset));
  }

  private trimNewline(start: number, end: number): number {
    let result = end;
    while (result > start && this.yaml[result - 1] === "\n") result--;
    return result;
  }

  private lineStart(offset: number): number {
    return this.yaml.lastIndexOf("\n", offset - 1) + 1;
  }

  // offset を含む行の次の行頭。ブロック形式の範囲はすでに改行の直後で終わるので、そのまま使う
  private endOfLine(offset: number): number {
    if (offset > 0 && this.yaml[offset - 1] === "\n") return offset;
    const index = this.yaml.indexOf("\n", offset);
    return index < 0 ? this.yaml.length : index + 1;
  }

  private column(offset: number): number {
    return offset - this.lineStart(offset);
  }

  // 書き換えた結果を読み直してから反映する (読めなければ何も変えない)
  private splice(start: number, end: number, text: string): void {
    const next = this.yaml.slice(0, start) + text + this.yaml.slice(end);
    let doc: YamlDocument;
    try {
      doc = parse(next, this.source);
    } catch (error) {
      throw new YamlEditError(`書き換えた結果を YAML として読めません (内部の誤り): ${error instanceof Error ? error.message : String(error)}`);
    }
    this.yaml = next;
    this.doc = doc;
  }
}
