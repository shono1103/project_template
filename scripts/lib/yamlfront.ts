// ネストした値を持つ frontmatter (workflowVersion 2 のタスク) を読み書きする。
//
// 書き換えは、元の文字列のうち対象の値の範囲だけを差し替える (yaml の節点が持つ位置を使う)。
// 文書全体を書き直さないので、書き換えていない行・未知の項目・コメント・引用符・数値の書き方 (0012 など)・本文は
// 1 バイトも変わらない。新しく書く値だけを yaml の書式 (null は空欄、配列は「- 値」、2 字下げ) で書く。
// アンカー・エイリアス・明示的なタグは推測で解釈せずに拒否する (frontmatter は素朴なデータだけにする)。
// 旧形式 (1 段の key: 値) は従来どおり lib/frontmatter.ts が扱う。

import { isMap, isScalar, isSeq, parseDocument, stringify, visit } from "../vendor/yaml.mjs";
import { FrontmatterError } from "./frontmatter.ts";

type YamlDocument = ReturnType<typeof parseDocument>;
type YamlNode = { range?: [number, number, number] | null; flow?: boolean };
type YamlPair = { key: YamlNode & { value?: unknown }; value: (YamlNode & { value?: unknown }) | null };
type YamlCollection = YamlNode & { items: unknown[] };
export type YamlPath = (string | number)[];

const parseOptions = { uniqueKeys: true, prettyErrors: false } as const;
const stringifyOptions = { nullStr: "", lineWidth: 0, indent: 2, indentSeq: true } as const;

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

function keyName(pair: YamlPair): string {
  return isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
}

// 値を「key:」の後ろに置く文字列にする。コレクションは次の行から keyColumn + 2 の字下げで書く
function renderValue(value: unknown, keyColumn: number): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") {
    // 「v: 値」として書き出して値の部分を使う (ブロック文字列の中身に字下げが付く)。続きの行は key の位置に合わせる
    const [first, ...rest] = stringify({ v: value }, stringifyOptions).replace(/\n$/, "").replace(/^v:/, "").split("\n");
    return [first, ...rest.map((line) => (line === "" ? line : " ".repeat(keyColumn) + line))].join("\n");
  }
  if (Array.isArray(value) && value.length === 0) return " []";
  if (!Array.isArray(value) && Object.keys(value).length === 0) return " {}";
  const pad = " ".repeat(keyColumn + 2);
  const lines = stringify(value, stringifyOptions).replace(/\n$/, "").split("\n");
  return `\n${lines.map((line) => (line === "" ? line : pad + line)).join("\n")}`;
}

function nested(path: YamlPath, value: unknown): unknown {
  return path.reduceRight<unknown>((inner, key) => ({ [String(key)]: inner }), value);
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
    return this.doc.hasIn(path);
  }

  get(path: YamlPath): unknown {
    const node = this.doc.getIn(path, true);
    if (node === undefined || node === null) return node === null ? null : undefined;
    if (isScalar(node)) return node.value;
    if (isMap(node) || isSeq(node)) return node.toJSON();
    return node;
  }

  // 値を置き換える (途中の階層が無ければ作る)。同じ値なら何もしない
  set(path: YamlPath, value: unknown): void {
    if (path.length === 0) throw new Error("書き換える項目を指定してください");
    if (this.has(path) && same(this.get(path), value)) return;
    let depth = path.length;
    while (depth > 0 && !this.has(path.slice(0, depth))) depth--;
    if (depth === path.length) this.replace(path, value);
    else this.insert(path.slice(0, depth), String(path[depth]), nested(path.slice(depth + 1), value));
  }

  delete(path: YamlPath): void {
    if (!this.has(path)) return;
    const { pair } = this.locate(path);
    const start = this.lineStart(pair.key.range![0]);
    const end = this.endOfLine((pair.value ?? pair.key).range![1]);
    this.splice(start, end, "");
  }

  toString(): string {
    const yamlText = this.yaml.replace(/\n$/, "");
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

  private locate(path: YamlPath): { pair: YamlPair; parent: YamlCollection } {
    const parent = this.collection(path.slice(0, -1));
    const last = path[path.length - 1];
    if (!parent) throw new Error(`書き換える場所が見つかりません: ${path.join(".")}`);
    if (isSeq(parent)) {
      const item = parent.items[Number(last)] as YamlNode & { value?: unknown };
      // 配列の要素は「値だけの組」として扱う (key の位置は要素の先頭)
      return { pair: { key: item, value: item }, parent };
    }
    const pair = (parent.items as YamlPair[]).find((candidate) => keyName(candidate) === String(last));
    if (!pair) throw new Error(`書き換える場所が見つかりません: ${path.join(".")}`);
    return { pair, parent };
  }

  private replace(path: YamlPath, value: unknown): void {
    const { pair, parent } = this.locate(path);
    if (isSeq(parent)) {
      if (value !== null && typeof value === "object") throw new Error(`配列の要素をコレクションで置き換えることには対応していません: ${path.join(".")}`);
      const range = pair.value!.range!;
      this.splice(range[0], range[1], stringify(value, stringifyOptions).replace(/\n$/, ""));
      return;
    }
    if (parent.flow) {
      // フロー形式 ({ a: 1 } / [a]) の中は、そのコレクションだけを書き直す
      this.replaceWhole(path.slice(0, -1), { ...(this.get(path.slice(0, -1)) as object), [String(path[path.length - 1])]: value });
      return;
    }
    const keyStart = pair.key.range![0];
    const colon = this.yaml.indexOf(":", pair.key.range![1]);
    let valueEnd = pair.value?.range ? Math.max(pair.value.range[1], colon + 1) : colon + 1;
    // ブロック形式のコレクション・文字列の範囲は末尾の改行を含むので、改行は残す (次の行とつなげない)
    while (valueEnd > colon + 1 && this.yaml[valueEnd - 1] === "\n") valueEnd--;
    this.splice(colon + 1, valueEnd, renderValue(value, this.column(keyStart)));
  }

  private replaceWhole(path: YamlPath, value: unknown): void {
    if (path.length === 0) throw new Error("frontmatter 全体を置き換えることには対応していません");
    this.replace(path, value);
  }

  private insert(parentPath: YamlPath, key: string, value: unknown): void {
    const parent = this.collection(parentPath);
    const line = (column: number) => `${" ".repeat(column)}${stringify(key, stringifyOptions).replace(/\n$/, "")}:${renderValue(value, column)}`;
    if (parentPath.length === 0 && (parent === null || (parent.items.length === 0 && !parent.flow))) {
      const text = this.yaml === "" || this.yaml.endsWith("\n") ? this.yaml : `${this.yaml}\n`;
      this.yaml = text;
      this.splice(text.length, text.length, `${line(0)}\n`);
      return;
    }
    if (!parent || !isMap(parent) || parent.flow || parent.items.length === 0) {
      // 値が空・スカラー・フロー形式の場所に項目を足すときは、その値を対応表として書き直す
      const current = this.get(parentPath);
      this.replace(parentPath, { ...(current !== null && typeof current === "object" && !Array.isArray(current) ? current : {}), ...(nested([key], value) as object) });
      return;
    }
    const items = parent.items as YamlPair[];
    const column = this.column(items[0].key.range![0]);
    const lastItem = items[items.length - 1];
    const end = this.endOfLine((lastItem.value ?? lastItem.key).range![1]);
    const prefix = end > 0 && this.yaml[end - 1] !== "\n" ? "\n" : "";
    this.splice(end, end, `${prefix}${line(column)}\n`);
  }

  private lineStart(offset: number): number {
    return this.yaml.lastIndexOf("\n", offset - 1) + 1;
  }

  // offset を含む行の次の行頭。ブロック形式の範囲はすでに改行の直後で終わるので、そのまま使う
  private endOfLine(offset: number): number {
    return offset > 0 && this.yaml[offset - 1] === "\n" ? offset : this.nextLine(offset);
  }

  private nextLine(offset: number): number {
    const index = this.yaml.indexOf("\n", offset);
    return index < 0 ? this.yaml.length : index + 1;
  }

  private column(offset: number): number {
    return offset - this.lineStart(offset);
  }

  private splice(start: number, end: number, text: string): void {
    const next = this.yaml.slice(0, start) + text + this.yaml.slice(end);
    try {
      this.doc = parse(next, this.source);
    } catch (error) {
      throw new Error(`書き換えた結果を YAML として読めません (内部の誤り): ${error instanceof Error ? error.message : String(error)}`);
    }
    this.yaml = next;
  }
}
