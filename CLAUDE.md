# CLAUDE.md

プロジェクト管理リポジトリ。日報 (`daily/`)、案件とタスク (`job/`)、Q&A (`qa/`)、
関連リポジトリ (`repos/`) を管理する。

## 構成と運用ルール

ディレクトリ構成・命名・タスクの状態遷移などのルールは [README.md](README.md) にまとめてある。
**ファイルやディレクトリを追加・移動する前に必ず README.md を読み、記載された手順とスクリプトを使うこと。**
テンプレート (`daily/template/`、`job/template/`、`qa/list/template.md`) は複製元なので直接編集しない。

よく使う操作:

| やること | 使うもの |
| --- | --- |
| 当日の日報を作る | `./daily/create_daily.sh` |
| 個別の作業計画を作る | その日の `_.md` を複製 |
| 案件を始める | `cp -R job/template job/<案件名>` |
| タスクを作る | `job/<案件名>/task/list/template.md` を複製 |
| タスクの状態を変える | `todo/` `progress/` `done/` 間でシンボリックリンクを `mv` |
| タスクの状況を見る | `/list-task` (案件名を渡すと絞り込み) |
| QA の状況を見る | `/list-qa` |
| QA を作る | `qa/list/template.md` を複製し `qa/unresolved/` にリンクを張る |
| QA を解決にする | `unresolved/` `resolved/` 間でシンボリックリンクを `mv` |
| submodule を追加する | `./repos/add_submodule.sh <URL> [--dir_name <名前>] <権限>` |
| プロジェクト状態を更新する | `/reload-project` |

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
