// ネストした値を持つ frontmatter (workflowVersion 2 のタスク) を読み書きする。
//
// yaml (scripts/vendor/yaml.mjs) の Document をそのまま保ち、指定した値だけを書き換える。
// 書き換えていない行・未知の項目・コメント・引用符・本文は変えない (変更が無ければ元の文字列と同じになる)。
// アンカー・エイリアス・明示的なタグは推測で解釈せずに拒否する (frontmatter は素朴なデータだけにする)。
// 旧形式 (1 段の key: 値) は従来どおり lib/frontmatter.ts が扱う。

import { isMap, isScalar, isSeq, parseDocument, visit } from "../vendor/yaml.mjs";
import { FrontmatterError } from "./frontmatter.ts";

type YamlDocument = ReturnType<typeof parseDocument>;
export type YamlPath = (string | number)[];

const stringifyOptions = { nullStr: "", lineWidth: 0 } as const;

export class YamlFrontmatter {
  private readonly doc: YamlDocument;
  private readonly body: string;
  private readonly eol: string;
  private readonly source: string;
  private changed = false;

  private constructor(doc: YamlDocument, body: string, eol: string, source: string) {
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
    const doc = parseDocument(yamlText, { uniqueKeys: true, prettyErrors: false });
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
    return new YamlFrontmatter(doc, lines.slice(close + 1).join(eol), eol, yamlText);
  }

  // 値を JavaScript の値として読む (日付は文字列のまま)
  data(): Record<string, unknown> {
    const value = this.doc.toJS() as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  has(path: YamlPath): boolean {
    return this.doc.hasIn(path);
  }

  get(path: YamlPath): unknown {
    const node = this.doc.getIn(path, true);
    if (node === undefined) return undefined;
    if (isScalar(node)) return node.value;
    if (isMap(node) || isSeq(node)) return node.toJSON();
    return node;
  }

  // 値を置き換える (途中の階層が無ければ作る)。同じ値なら何もしない
  set(path: YamlPath, value: unknown): void {
    const current = this.get(path);
    if (JSON.stringify(current) === JSON.stringify(value === undefined ? null : value) && this.has(path)) return;
    this.doc.setIn(path, value !== null && typeof value === "object" ? this.doc.createNode(value) : value);
    this.changed = true;
  }

  delete(path: YamlPath): void {
    if (!this.has(path)) return;
    this.doc.deleteIn(path);
    this.changed = true;
  }

  toString(): string {
    const yamlText = this.changed ? this.doc.toString(stringifyOptions) : this.source;
    const text = yamlText.replace(/\n$/, "").split("\n").join(this.eol);
    return ["---", ...(text === "" ? [] : [text]), "---"].join(this.eol) + this.eol + this.body;
  }
}
