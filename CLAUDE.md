# CLAUDE.md

プロジェクト管理リポジトリ。日報 (`daily/`)、案件とタスク (`job/`)、Q&A (`qa/`)、
ドキュメント (`docs/`)、関連リポジトリ (`repos/`) を管理する。

**運用の中心は task**。作業は task 単位で管理し、調査の過程は daily に、
調査の完結状態は task に書く (下記「[作業の進め方](#作業の進め方--task-が中心)」)。

## 構成と運用ルール

ディレクトリ構成・命名・タスクの状態遷移などのルールは [README.md](README.md) にまとめてある。
**ファイルやディレクトリを追加・移動する前に必ず README.md を読み、記載された手順とスクリプトを使うこと。**
テンプレート (`daily/template/`、`job/template/`、`qa/list/template.md`) は複製元なので直接編集しない。

よく使う操作:

| やること | 使うもの |
| --- | --- |
| 当日の日報を作る | `./daily/create_daily.sh` |
| AI の記録ディレクトリを作る | `./daily/create_session.sh` (下記「[AI の作業記録](#ai-の作業記録)」) |
| 調査記録を作る | `daily/template/_.md` をセッションディレクトリに複製 ([daily/README.md](daily/README.md)) |
| 案件を始める | `cp -R job/template job/<案件名>` |
| タスクを作る | `job/<案件名>/task/list/template.md` を複製 (調査を始めるとき) |
| タスクの状態を変える | `todo/` `progress/` `done/` 間でシンボリックリンクを `mv` |
| タスクの状況を見る | `/list-task` (案件名を渡すと絞り込み) |
| QA の状況を見る | `/list-qa` |
| QA を作る | `qa/list/template.md` を複製し `qa/unresolved/` にリンクを張る |
| QA を解決にする | `unresolved/` `resolved/` 間でシンボリックリンクを `mv` |
| ドキュメントを置く | `docs/{official,unofficial,personal}/<案件名>/` ([docs/README.md](docs/README.md)) |
| submodule を追加する | `./repos/add_submodule.sh <URL> [--dir_name <名前>] <権限>` |
| submodule で作業する | `repos/<名前>/.worktrees/<ブランチ>/` (下記「[submodule の作業権限](#submodule-の作業権限)」) |
| プロジェクト状態を更新する | `/reload-project` |

## 作業の進め方 — task が中心

**task は必ず調査を伴う。調査を始めるときに task を作る。**

1. `job/<案件名>/task/list/template.md` を複製して task を作り、`todo/` に相対シンボリックリンクを張る
2. 着手時に `progress/` へ移す (`task-transition` エージェント)
3. 調査そのものは daily の調査記録に書く (下記「[AI の作業記録](#ai-の作業記録)」)
4. 完結したら task の `## 結果` に結論を、`## 参照先` に調査記録のパスを書く
5. `done/` へ移す

**調べた過程を task に書かない。** task に残すのは結論と参照先だけで、
過程は daily に置き、task からたどれる状態にする。手順の詳細は [README.md](README.md) を参照。

## submodule の作業権限

submodule (`repos/<リポジトリ名>/repo/`) の作業は
`repos/<リポジトリ名>/.worktrees/<ブランチ名>/` に worktree を作って行う。

* **task 起因のブランチなら `.worktrees/` への書き込みは確認不要**。
  worktree の作成・編集・コミットまで進めてよい (task は `job/<案件名>/task/` のもの)。
* **push は要求されたときだけ**行う。
* task に紐づかないブランチで worktree を作る場合は確認を取る。

常設の worktree は3つ。動作確認とテストは専用の worktree で行い、`repo/` の checkout は切り替えない。

| ディレクトリ | ブランチ | 用途 |
| --- | --- | --- |
| `.worktrees/<デフォルトブランチ>/` | デフォルトブランチ (detached) | 参照用 |
| `.worktrees/verify/` | `local/verify` | 動作確認 |
| `.worktrees/e2e/` | `local/e2e` | E2E テスト |

無い場合は `./repos/setup_worktrees.sh <リポジトリ名>` で作る。`local/*` は push しない。

ブランチの切り方は `repos/<リポジトリ名>/branch-rule.json` に従う。
詳細は [repos/README.md](repos/README.md) を参照。

## AI の作業記録

**AI が行った作業は `daily/<YYYY-MM>/<DD>/agents/<ツール名>/<セッションID>/` に記録する。**
その日の `index.md` は自分 (人間) 専用なので、AI はそこに書かない。
自分の記録と AI の記録を混ぜないための分割であり、この境界は必ず守る。

| 書く主体 | 書く場所 |
| --- | --- |
| 自分 (人間) | `daily/<YYYY-MM>/<DD>/index.md` |
| Claude Code (サブエージェント含む) | `daily/<YYYY-MM>/<DD>/agents/claude-code/<セッションID>/` |

セッションIDは環境変数 `CLAUDE_CODE_SESSION_ID` の値。ディレクトリはスクリプトで作る
(その日の日報が無ければ同時に作られる。既にあれば何も変更しない)。

```sh
./daily/create_session.sh
```

中に置くのは調査記録。`daily/template/_.md` を複製し、1調査1ファイルにする。
ファイル名は英小文字とハイフン。

```sh
cp daily/template/_.md \
   "daily/2026-08/24/agents/claude-code/$CLAUDE_CODE_SESSION_ID/submodule-auth.md"
```

構成は 目的 / 対象 / 経過 / 分かったこと / 未解決 / task への反映。
**経過は生ログでよい**。整理した結論は task 側に書く。

**1セッション = 1ディレクトリ**。同じセッションで作業が増えてもディレクトリは増やさず md を増やす。
書き込み権限を持たないサブエージェント (`task-transition` など) の記録も、
呼び出した側がこのセッションディレクトリにまとめる。

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
