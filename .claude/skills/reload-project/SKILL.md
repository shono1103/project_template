---
name: reload-project
description: プロジェクト状態をリロードして MEMORY.md を最新化する。daily/ job/ qa/ docs/ repos/ をスキャンし、進行中のタスク・直近の日報・未解決のQA・ドキュメント・submodule一覧をダイジェストとして再生成する。MEMORY.md が古い / 実態と食い違うとき、作業に区切りがついたとき、セッション開始時に最終更新が当日でないときに使う。
---

# reload-project

リポジトリ全体をスキャンして `MEMORY.md` を作り直す。差分更新ではなく**毎回全体を再生成する**。

サイズ上限: **1,500 トークン** / 警告: **1,200 トークン**

## 手順

### 1. スキャンする

以下をすべて実行し、結果を集める。ファイルが無い・ディレクトリが空の場合はその項目を「なし」として扱う。

```sh
# リポジトリの状態
git status --short
git log --oneline -10

# 日報: 直近3日分のディレクトリ
find daily -mindepth 2 -maxdepth 2 -type d -not -path 'daily/template*' | sort | tail -3

# 案件の一覧
find job -mindepth 1 -maxdepth 1 -type d -not -name template | sort

# 案件ごとの MEMORY / STORAGE (template は複製元なので除く)
find job -mindepth 2 -maxdepth 2 \( -name MEMORY.md -o -name STORAGE.md \) \
  -not -path 'job/template/*' | sort

# タスクの状態 (todo / pending / progress / done)
# assets/ は実行結果の置き場で状態ディレクトリではないので除く
find job -mindepth 4 -maxdepth 4 -path '*/task/*' \
  -not -path '*/list/*' -not -path '*/assets/*' -not -name '.gitkeep' | sort

# pending の待ち先 (状態ディレクトリからは分からないので実体を読む)
# 空ディレクトリでグロブが落ちるシェルがあるので find で列挙する
find job -path '*/task/pending/*.md' | while read -r l; do
  printf '%s: ' "$l"
  awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit}
       f && /^blockedBy:/{b=1;next}
       f && b && /^  *- /{sub(/^  *- /,"");printf "%s ",$0;next}
       f && b{exit}' "$l"
  echo
done

# QA の状態 (unresolved / resolved)
find qa/unresolved qa/resolved -mindepth 1 -maxdepth 1 -not -name '.gitkeep' | sort

# ドキュメント: 分類ごとの案件ディレクトリ / ファイル
find docs -mindepth 2 -not -name '.gitkeep' -not -name 'README.md' | sort

# submodule
cat .gitmodules 2>/dev/null
sed -n '/repo_dir/,/^$/p' repos/README.md
```

次に中身を読む。

* **日報**: 直近3日分の `index.md` から「結果」「明日」を読む。
  日ごとのディレクトリは人間用の `index.md` と AI 用の `agents/<ツール名>/<セッションID>/` に
  分かれている (詳細は [daily/README.md](../../../daily/README.md))。
  MEMORY.md に載せるのは `index.md` の内容とし、`agents/` はツール名とセッション数だけ添える
  (調査記録の中身は読まない)。
* **ドキュメント**: `docs/{official,unofficial,personal}/` にあるものを分類ごとにまとめる。
  中身は読まず、案件ディレクトリ名と件数だけを拾う。
* **進行中タスク**: `task/progress/` にリンクがあるタスクについて、実体 (`task/list/<名前>.md`)
  の「内容」「完了条件」「結果」を読む。`todo/` は件数と名前のみで足りる。
  「参照先」は調査の根拠なので MEMORY.md には載せず、task のパスからたどらせる。
* **待ちタスク**: `task/pending/` にリンクがあるものが「外部要因で着手できない」タスク。
  **待ち先は実体の frontmatter `blockedBy` にしか無いので、必ず読んで一緒に載せる。**
  状態だけ載せても「何が解ければ動くのか」が分からず、次のセッションで同じ調査が要る。
* **案件の MEMORY**: `job/<案件名>/MEMORY.md` の `## 属性` から種別と技術スタックを拾い、
  案件の性質を1行で表す。`## 前提` `## 決定` の中身はルートに転記しない
  (詳細はそこを読ませるためのパスだけ載せる)。`STORAGE.md` は**読まない**
  (アーカイブなので現在の状態には関係しない)。
* **未解決 QA**: `qa/unresolved/` にリンクがあるものが未解決。
  実体 (`qa/list/<名前>.md`) の「質問内容」を読んで要約する。
  ファイルの中身 (「## 回答内容」が空かどうか) では判断しない。

**`job/<案件名>/MEMORY.md` と `STORAGE.md` は作業中に書く手書きのファイルなので、
このスキルは読むだけで絶対に上書きしない。** 自動生成の対象はルートの `MEMORY.md` だけ。
ディレクトリ構成からスキャンで導出できるもの (task の状態など) はルートが持ち、
導出できない知識 (案件固有の前提と決定) は案件側が持つ、という分担になっている。

タスクと QA はどちらも**実体が `list/` にあり、状態ディレクトリには
`../list/<名前>.md` を指す相対シンボリックリンクが置かれている**点に注意する (詳細は README.md)。

| 対象 | 実体 | 状態ディレクトリ |
| --- | --- | --- |
| タスク | `job/<案件名>/task/list/` | `todo/` `pending/` `progress/` `done/` |
| QA | `qa/list/` | `unresolved/` `resolved/` |

### 2. MEMORY.md を生成する

下の「出力フォーマット」に従って `MEMORY.md` を丸ごと書き直す。
セクションの見出しと順序は固定する (差分が読みやすくなるため)。
該当する情報が無いセクションには `なし` と書き、セクション自体は消さない。

書き方のルール:

* 事実だけを書く。推測や評価は書かない。
* 各項目に**実ファイルへのパスを添える**。MEMORY.md は詳細の代わりではなくインデックスである。
* 日付は `YYYY-MM-DD` の絶対表記で書く (「昨日」「先週」と書かない)。
* 完了済み (`done/`) のタスクは件数のみ。名前を並べない。
* **`pending` は件数にまとめず、1件ずつ待ち先つきで書く。** 待ちが解けたかを
  確認するのはセッション開始時にやる価値のある作業なので、名前が見えている必要がある。

### 3. サイズを検証する

```sh
./.claude/skills/reload-project/count_tokens.sh MEMORY.md
```

* 1,200 トークン以下: そのまま確定する。
* 1,200 超〜1,500 以下: 確定してよいが、次回の圧縮候補をユーザーに伝える。
* 1,500 超: 下の「圧縮ルール」を順に適用して書き直し、再度計測する。上限に収まるまで繰り返す。

### 4. 報告する

更新後、以下をユーザーに伝える。

* 概算トークン数 (上限に対する割合)
* 前回から変わった点 (新しい job / 完了したタスク / 新しい未解決 QA など)
* 圧縮した場合はどの情報を落としたか

## 圧縮ルール

上限を超えた場合、以下の順で削る。

1. 案件の「性質」の行を落とす (`job/<案件名>/MEMORY.md` のパスだけ残す)。
   案件固有の情報は案件側に実体があるため、ルートはパスに退避させてよい
2. `docs` を分類ごとの件数のみにする (案件ディレクトリ名を落とす)
3. 日報のサマリを直近3日 → 直近1日に減らす。`agents:` の並記も落とす
4. `todo/` のタスクを名前の羅列のみにする (説明を落とす)
5. 未解決 QA を「件数 + パス」のみにする
6. 進行中タスクの説明を1行に切り詰める
7. それでも超える場合は、進行中タスクを更新日の新しい順に上位5件までとし、
   残りは「他 N 件」とまとめる

`## プロジェクト概要` と各セクションの見出しは削らない。
**`pending` の待ち先も削らない。** 削ると pending が「理由の分からない停止」になり、
実体を全部開き直すしかなくなる (圧縮で節約した分より高くつく)。

## 出力フォーマット

```markdown
# MEMORY

> `/reload-project` で自動生成される。手で編集しない。
> 最終更新: YYYY-MM-DD / 概算 NNN トークン (上限 1,500)

## プロジェクト概要

プロジェクトの目的と現在のフェーズを2〜3行で。

## 進行中の job

### <案件名> (`job/<案件名>/`)

- 性質: <種別> / <技術スタック> — 前提と決定は `job/<案件名>/MEMORY.md`
- progress: <タスク名> (`task/list/<タスク名>.md`) — 内容を1〜2行で
- pending: <タスク名> (← <blockedBy の中身>)
- todo: <タスク名>, <タスク名>
- done: N 件

## 直近の日報

- YYYY-MM-DD (`daily/YYYY-MM/DD/index.md`) — 結果と翌日の予定を1〜2行で / agents: <ツール名> N セッション

## 未解決の QA

- <質問の要約> (`qa/list/<ファイル名>.md`)

## docs

- official: <案件名> N 件 (`docs/official/<案件名>/`)
- unofficial: <案件名> N 件
- personal: N 件

## submodule

- <ディレクトリ名> (`repos/<ディレクトリ名>/`) — project_group: rwx / submodule: rwx
```
