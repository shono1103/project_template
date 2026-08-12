# CLAUDE.md

プロジェクト管理リポジトリ。日報 (`daily/`)、案件とタスク (`job/`)、Q&A (`qa/`)、
ドキュメント (`docs/`)、関連リポジトリ (`repos/`) を管理する。

## 構成と運用ルール

ディレクトリ構成・命名・タスクの状態遷移などのルールは [README.md](README.md) にまとめてある。
**ファイルやディレクトリを追加・移動する前に必ず README.md を読み、記載された手順とスクリプトを使うこと。**
テンプレート (`daily/template/`、`job/template/`、`qa/list/template.md`) は複製元なので直接編集しない。

よく使う操作:

| やること | 使うもの |
| --- | --- |
| 当日の日報を作る | `./daily/create_daily.sh` |
| AI の作業記録を残す | その日の `agents/<agent名>/` (下記「[AI の作業記録](#ai-の作業記録)」) |
| 個別の作業計画を作る | その日の `mine/_.md` (agent 用なら `agents/<agent名>/_.md`) を複製 ([daily/README.md](daily/README.md)) |
| 案件を始める | `cp -R job/template job/<案件名>` |
| タスクを作る | `job/<案件名>/task/list/template.md` を複製 |
| タスクの状態を変える | `todo/` `progress/` `done/` 間でシンボリックリンクを `mv` |
| タスクの状況を見る | `/list-task` (案件名を渡すと絞り込み) |
| QA の状況を見る | `/list-qa` |
| QA を作る | `qa/list/template.md` を複製し `qa/unresolved/` にリンクを張る |
| QA を解決にする | `unresolved/` `resolved/` 間でシンボリックリンクを `mv` |
| ドキュメントを置く | `docs/{official,unofficial,personal}/<案件名>/` ([docs/README.md](docs/README.md)) |
| submodule を追加する | `./repos/add_submodule.sh <URL> [--dir_name <名前>] <権限>` |
| プロジェクト状態を更新する | `/reload-project` |

## AI の作業記録

**AI が行った作業は `daily/<YYYY-MM>/<DD>/agents/<agent名>/` に記録する。**
`mine/` は自分 (人間) 専用なので、AI はそこに書かない。
自分の記録と AI の記録を混ぜないための分割であり、この境界は必ず守る。

| 書く主体 | 書く場所 |
| --- | --- |
| 自分 (人間) | `daily/<YYYY-MM>/<DD>/mine/` |
| Claude Code 本体 | `daily/<YYYY-MM>/<DD>/agents/claude/` |
| サブエージェント | `daily/<YYYY-MM>/<DD>/agents/<agent名>/` (`.claude/agents/` の定義名) |

ディレクトリが無ければ、その日の `agents/template/` を agent 名で複製して作る。

```sh
./daily/create_daily.sh                                              # 当日分がまだ無いとき
cp -R daily/2026-08/12/agents/template daily/2026-08/12/agents/claude
```

中の構成は `mine/` と同じ。

* `index.md` — その日のまとめ (目標 / 計画 / 結果 / 明日)
* `_.md` の複製 — 作業1件ごとの計画。ファイル名は英小文字とハイフン
* `outputs/` — 成果物 (調査結果・生成物)

同じ agent を1日に複数回動かしてもディレクトリは増やさず、`_.md` の複製で作業を分ける。
書き込み権限を持たないサブエージェント (`task-transition` など) の記録は、
呼び出した側がそのエージェントのディレクトリにまとめる。

詳細は [daily/README.md](daily/README.md) を参照。

## MEMORY.md の使い方

@MEMORY.md

`MEMORY.md` はプロジェクト状態のダイジェスト。上のインポートによりセッション開始時に読み込まれる。

* **状況把握の起点にする。** 進行中の job・直近の日報・未解決の QA・submodule 一覧がまとまっている。
* **インデックスとして扱う。** 詳細が必要なときは MEMORY.md に書かれたパスから実ファイルを読む。
  MEMORY.md の記述だけで細部を判断しない。
* **手で編集しない。** `/reload-project` スキルがリポジトリ全体をスキャンして再生成する。
  個別の更新を書き足すのではなく、スキルを実行して作り直す。
* **記載が実態と食い違う場合は MEMORY.md ではなく実ファイルが正。** その場で `/reload-project` を実行する。

`/reload-project` を実行するタイミング:

* セッション開始時、MEMORY.md の「最終更新」が当日でないとき
* 日報・タスク・QA・submodule を追加/更新して作業に区切りがついたとき
* MEMORY.md の内容が古い、または実態と食い違うと気づいたとき

サイズ上限は **1,500 トークン** (警告 1,200 トークン)。
毎セッション読み込まれるため、上限を超える場合は古い情報から圧縮する。判定と圧縮のルールは
[.claude/skills/reload-project/SKILL.md](.claude/skills/reload-project/SKILL.md) に従う。

## 言語

ドキュメント・コメント・コミットメッセージは日本語で書く。
