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
//
// 書式の扱い:
//   * ブロック形式の対応表・配列 (「- 」の行に最初の項目がある形、「-」だけの行の次に要素がある形、「- - 値」の入れ子) は
//     すべての操作に対応する。最上位が {} だけの frontmatter への追加にも対応する (ブロック形式で書き直す)
//   * フロー形式 ({a: 1}・[a]) の中の置換・追加・削除に対応する。新しく書く値は JSON で書く (1 行で、null は null。
//     空欄だと要素が消え、yaml の書き出しでは複数行の文字列が複数行になるため)
//   * フロー形式の中にコメントがあるときの削除は、どのカンマとコメントを消すか決められないので YamlEditError にする
//     (置換・追加はコメントに触れないので対応する)
//   * 配列の要素の最初の項目を消すときは「- 」の後ろだけを消し、次の項目とその上のコメントは動かさない
//     (「-」だけの行が残る。YAML として同じ意味)。最後の項目・要素を消したら、行を消してから {} / [] を書く
//     (親の中の他のコメントは残る)
//   * 書き換えた後は読み直して、対象の外の値が元のまま・対象が期待した値かを確かめる。複数行の文字列が
//     後ろの深い字下げのコメント行を中身として取り込むときは、その値だけ JSON (1 行) で書き直す。
//     それでも合わなければ何も変えずに YamlEditError にする
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

// フロー形式の中に置く値。JSON は YAML のフロー形式として読め、必ず 1 行になる (null も null と書く)
function flowText(value: unknown): string {
  return JSON.stringify(value ?? null);
}

// ブロック形式の「key:」の後ろに置く文字列。コレクションは次の行から keyColumn + 2 の字下げで書く
// flowOnly はブロック形式の中でもフロー形式 (1 行の JSON) で書く (ブロック文字列が後ろのコメント行を取り込むときの代わり)
function afterColon(value: unknown, keyColumn: number, flowOnly = false): string {
  if (flowOnly) return ` ${flowText(value)}`;
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
function itemText(value: unknown, itemColumn: number, flowOnly = false): string {
  if (flowOnly) return flowText(value);
  if (!isCollection(value)) {
    const [first, ...rest] = withoutNewline(stringify([value ?? null], blockOptions)).replace(/^- ?/, "").split("\n");
    return [first, ...rest.map((line) => (line === "" ? line : " ".repeat(itemColumn - 2) + line))].join("\n");
  }
  if (isEmpty(value)) return Array.isArray(value) ? "[]" : "{}";
  const [first, ...rest] = withoutNewline(stringify(value, blockOptions)).split("\n");
  return [first, ...rest.map((line) => (line === "" ? line : " ".repeat(itemColumn) + line))].join("\n");
}

// set・delete の後に期待する値 (元の値の写しに同じ操作をしたもの)
function expectSet(data: Record<string, unknown>, path: YamlPath, value: unknown): unknown {
  const root = structuredClone(data) as Record<string | number, unknown>;
  let holder = root;
  path.slice(0, -1).forEach((key, index) => {
    if (!isCollection(holder[key])) holder[key] = typeof path[index + 1] === "number" ? [] : {};
    holder = holder[key] as Record<string | number, unknown>;
  });
  holder[path[path.length - 1]] = structuredClone(value ?? null);
  return root;
}

function expectDelete(data: Record<string, unknown>, path: YamlPath): unknown {
  const root = structuredClone(data) as Record<string | number, unknown>;
  const holder = path.slice(0, -1).reduce<Record<string | number, unknown>>((node, key) => node[key] as Record<string | number, unknown>, root);
  const last = path[path.length - 1];
  if (Array.isArray(holder)) holder.splice(Number(last), 1);
  else delete holder[last];
  return root;
}

export class YamlFrontmatter {
  private yaml: string;
  private doc: YamlDocument;
  private readonly body: string;
  private readonly eol: string;
  private readonly source: string;
  private readonly original: string;
  private flowOnly = false;

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
    if (this.has(path) && same(this.get(path), value)) return;
    const before = this.data();
    this.verified(() => expectSet(before, path, value), () => {
      if (this.has(path)) return this.replace(path, value);
      // 無い階層の手前まで戻り、その下にまとめて作る
      let depth = path.length - 1;
      while (depth > 0 && !this.has(path.slice(0, depth))) depth--;
      this.add(path.slice(0, depth), path[depth], nested(path.slice(depth + 1), value));
    });
  }

  delete(path: YamlPath): void {
    if (path.length === 0) throw new YamlEditError("削除する項目を指定してください");
    if (!this.has(path)) return;
    const before = this.data();
    this.verified(() => expectDelete(before, path), () => this.cut(path));
  }

  private cut(path: YamlPath): void {
    const parentPath = path.slice(0, -1);
    const parent = this.collection(parentPath)!;
    const last = path[path.length - 1];
    if (isSeq(parent)) {
      const index = Number(last);
      const item = parent.items[index] as YamlNode;
      if (parent.flow) return this.cutFlowItem(parent, index, item.range!);
      // 最後の要素を消したら空の配列にする (null にしない)。要素の行を消してから [] を書くので、親の中の他のコメントは残る
      if (parent.items.length === 1) return this.atomically(() => { this.cutBlockItem(item); this.replace(parentPath, []); });
      return this.cutBlockItem(item);
    }
    const items = parent.items as YamlPair[];
    const index = items.findIndex((pair) => keyName(pair) === String(last));
    const pair = items[index];
    if (parent.flow) return this.cutFlowItem(parent, index, [pair.key.range![0], this.pairEnd(pair), this.pairEnd(pair)]);
    // 最後の項目を消したら空の対応表にする (最上位は空のまま)
    if (items.length === 1 && parentPath.length > 0) return this.atomically(() => { this.cutBlockPair(pair); this.replace(parentPath, {}); });
    this.cutBlockPair(pair, items[index + 1]);
  }

  // ブロック形式の配列の要素を、その行ごと取り除く
  private cutBlockItem(item: YamlNode): void {
    const dash = this.dashOf(item);
    const before = this.yaml.slice(this.lineStart(dash), dash);
    if (/\S/.test(before)) {
      // 「- - 値」の内側の最初の要素: 親の「-」を残し、自分の「- 値」だけを消す (次の要素は次の行にある)
      const keep = this.lineStart(dash) + before.trimEnd().length;
      return this.splice(keep, this.contentEnd(item), "");
    }
    this.splice(this.lineStart(dash), this.endOfLine(this.contentEnd(item)), "");
  }

  // ブロック形式の対応表の項目を、その行ごと取り除く
  private cutBlockPair(pair: YamlPair, next?: YamlPair): void {
    const end = this.pairEnd(pair);
    const start = pair.key.range![0];
    if (this.onDashLine(start)) {
      // 配列の要素の最初の項目 (「- key: 値」) は「-」の後ろの項目 (行末のコメントを含む) だけを消す。
      // 次の項目がすぐ次の行にあれば「- 次の項目」に詰め、間にコメント・空行があれば「-」だけの行を残して動かさない
      const dash = this.lineStart(start) + this.yaml.slice(this.lineStart(start), start).lastIndexOf("-");
      const lineEnd = this.endOfLine(end);
      const tail = /^[ \t]*(?:#.*)?$/.test(this.yaml.slice(end, lineEnd).replace(/\n$/, "")) ? lineEnd : end;
      const following = next?.key.range?.[0];
      if (tail === lineEnd && following !== undefined && /^[ \t]*$/.test(this.yaml.slice(tail, following))) {
        return this.splice(dash + 1, following, " ");
      }
      return this.splice(dash + 1, tail === lineEnd ? this.trimNewline(end, lineEnd) : end, "");
    }
    this.splice(this.lineStart(start), this.endOfLine(end), "");
  }

  // 書き換えた結果を読み直し、期待した値 (対象の外は元のまま) になったときだけ反映する。
  // ならなければフロー形式で書き直して試し、それでも違えば元に戻して YamlEditError にする
  private verified(expected: () => unknown, edit: () => void): void {
    const [yaml, doc] = [this.yaml, this.doc];
    try {
      for (const flowOnly of [false, true]) {
        this.flowOnly = flowOnly;
        this.atomically(edit);
        if (same(this.data(), expected())) return;
        [this.yaml, this.doc] = [yaml, doc];
      }
    } finally {
      this.flowOnly = false;
    }
    throw new YamlEditError("書き換えた結果が期待した値になりません (内部の誤り)");
  }

  // 複数回の書き換えを 1 つの操作にする。途中で失敗したら最初の状態に戻す
  private atomically(edit: () => void): void {
    const [yaml, doc] = [this.yaml, this.doc];
    try {
      edit();
    } catch (error) {
      [this.yaml, this.doc] = [yaml, doc];
      throw error;
    }
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
      const end = this.contentEnd(item);
      if (parent.flow) return this.splice(start, end, flowText(value));
      // 空の要素は「-」の直後から始まるので、「-」と値の間を空ける
      const gap = this.yaml[start - 1] === "-" ? " " : "";
      return this.splice(start, end, gap + itemText(value, this.column(start) + gap.length, this.flowOnly));
    }
    const pair = (parent.items as YamlPair[]).find((candidate) => keyName(candidate) === String(last))!;
    const colon = this.yaml.indexOf(":", pair.key.range![1]);
    const valueRange = pair.value?.range && pair.value.range[1] > colon ? pair.value.range : undefined;
    if (parent.flow) {
      if (valueRange) return this.splice(valueRange[0], valueRange[1], flowText(value));
      return this.splice(colon + 1, colon + 1, ` ${flowText(value)}`);
    }
    // 空の値 (「key:」の後ろが空・コメントだけ) は範囲の幅が 0 なので、コロンの直後に書く (後ろのコメントは残す)
    const valueEnd = valueRange && valueRange[0] < valueRange[1] ? Math.max(colon + 1, this.contentEnd(pair.value!)) : colon + 1;
    this.splice(colon + 1, valueEnd, afterColon(value, this.column(pair.key.range![0]), this.flowOnly));
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
    if (parent === null || (parentPath.length === 0 && parent.items.length === 0)) {
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
    const lastEnd = this.pairEnd(last);
    if (parent.flow) return this.splice(lastEnd, lastEnd, `, ${keyText}: ${flowText(value)}`);
    const column = this.column(items[0].key.range![0]);
    const end = this.afterDeeperComments(this.endOfLine(lastEnd), column);
    const prefix = end > 0 && this.yaml[end - 1] !== "\n" ? "\n" : "";
    this.splice(end, end, `${prefix}${" ".repeat(column)}${keyText}:${afterColon(value, column, this.flowOnly)}\n`);
  }

  private appendTop(key: string, value: unknown): void {
    const contents = this.collection([]);
    if (contents && contents.flow && contents.items.length === 0) {
      // 最上位が {} だけなら、ブロック形式の対応表として書き直す (コメントは {} の前後に残す)
      const [start, end] = contents.range!;
      return this.splice(start, this.trimNewline(start, end), `${withoutNewline(stringify(key, blockOptions))}:${afterColon(value, 0, this.flowOnly)}`);
    }
    const base = this.yaml === "" || this.yaml.endsWith("\n") ? this.yaml : `${this.yaml}\n`;
    this.splice(0, this.yaml.length, `${base}${withoutNewline(stringify(key, blockOptions))}:${afterColon(value, 0, this.flowOnly)}\n`);
  }

  private append(parentPath: YamlPath, parent: YamlCollection, value: unknown): void {
    if (parent.items.length === 0) return this.replace(parentPath, [value]); // [] はブロック形式で書き直す
    const lastItem = parent.items[parent.items.length - 1] as YamlNode;
    if (parent.flow) {
      const end = this.contentEnd(lastItem);
      return this.splice(end, end, `, ${flowText(value)}`);
    }
    const dash = this.dashOf(lastItem);
    const dashColumn = this.column(dash);
    const itemColumn = Math.max(dashColumn + 2, this.column(lastItem.range![0])); // 空の要素は「-」の直後から始まる
    const end = this.afterDeeperComments(this.endOfLine(this.contentEnd(lastItem)), dashColumn);
    const prefix = end > 0 && this.yaml[end - 1] !== "\n" ? "\n" : "";
    this.splice(end, end, `${prefix}${" ".repeat(dashColumn)}-${" ".repeat(Math.max(1, itemColumn - dashColumn - 1))}${itemText(value, itemColumn, this.flowOnly)}\n`);
  }

  // フロー形式の要素・項目を、前後のカンマごと取り除く
  private cutFlowItem(parent: YamlCollection, index: number, range: Range): void {
    if (this.hasComment(parent)) throw new YamlEditError("フロー形式 ({…}・[…]) の中にコメントがあるので、どのカンマとコメントを消すか決められません");
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

  // フロー形式のコレクションの中にコメントがあるか (文字列の値・キーの中の # は数えない)
  private hasComment(node: YamlCollection): boolean {
    const [start, end] = node.range!;
    const text = this.yaml.slice(start, end).split("");
    visit(node as never, {
      Scalar(_, scalar) {
        const range = (scalar as YamlNode).range;
        if (range) for (let i = range[0]; i < range[1]; i++) text[i - start] = " ";
      },
    });
    return /(^|\s)#/.test(text.join(""));
  }

  // ブロック形式の配列の要素の「-」の位置。同じ行の「- 」か、前の行 (空行・コメント行は飛ばす) の「-」だけの行
  private dashOf(item: YamlNode): number {
    const start = item.range![0];
    const begin = this.lineStart(start);
    // 「- - 値」のように 1 行に「-」が続く形 (入れ子の配列) では、要素の直前の「-」が要素のもの
    // 空の要素 (「-」だけ) は範囲が「-」の直後から始まる
    const same = /^(\s*(?:-\s+)*)-\s*$/.exec(this.yaml.slice(begin, start));
    if (same) return begin + same[1].length;
    if (/^\s*$/.test(this.yaml.slice(begin, start))) {
      for (let end = begin - 1; end >= 0; ) {
        const lineBegin = this.lineStart(end);
        const line = this.yaml.slice(lineBegin, end);
        const alone = /^(\s*)-\s*(?:#.*)?$/.exec(line);
        if (alone) return lineBegin + alone[1].length;
        if (!/^\s*(?:#.*)?$/.test(line)) break;
        end = lineBegin - 1;
      }
    }
    throw new YamlEditError("配列の要素の位置 (「-」) を特定できません");
  }

  // offset の前が同じ行の「- 」だけか (配列の要素の最初の項目)
  private onDashLine(offset: number): boolean {
    return /^\s*(?:-\s+)+$/.test(this.yaml.slice(this.lineStart(offset), offset));
  }

  // 値の中身が終わる位置。ブロック形式の範囲は後ろの空行・コメント行 (次の項目の前のもの) まで含むことがあるので、
  // 最後の要素・項目の中身の終わりまで戻る
  private contentEnd(node: YamlNode): number {
    const items = (node as YamlCollection).items;
    if (!node.flow && Array.isArray(items) && items.length > 0) {
      const last = items[items.length - 1];
      return isMap(node) ? this.pairEnd(last as YamlPair) : this.contentEnd(last as YamlNode);
    }
    return this.trimNewline(node.range![0], node.range![1]);
  }

  private pairEnd(pair: YamlPair): number {
    const keyEnd = pair.key.range![1];
    if (!pair.value?.range) return keyEnd;
    return Math.max(keyEnd, this.contentEnd(pair.value));
  }

  // 最後の要素・項目の後ろに続く、足す位置より深い字下げのコメント行 (前の要素の中のもの) の後ろ。
  // その手前に足すと、ブロック文字列の値がコメント行を中身として取り込んでしまう
  private afterDeeperComments(offset: number, column: number): number {
    let result = offset;
    for (let cursor = offset; cursor < this.yaml.length; ) {
      const newline = this.yaml.indexOf("\n", cursor);
      const line = this.yaml.slice(cursor, newline < 0 ? this.yaml.length : newline);
      const next = newline < 0 ? this.yaml.length : newline + 1;
      if (/^\s*$/.test(line)) {
        cursor = next;
        continue;
      }
      const comment = /^(\s*)#/.exec(line);
      if (!comment || comment[1].length <= column) break;
      cursor = next;
      result = next;
    }
    return result;
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
