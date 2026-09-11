# CLAUDE.md

プロジェクト管理リポジトリ。日報 (`daily/`)、案件・タスク・Q&A (`job/`)、
ドキュメントと手動テストの手順書 (`docs/`)、関連リポジトリ (`repos/`) を管理する。

Codex の入口は [AGENTS.md](AGENTS.md)。共通ルールは README.md とこのファイルで共有し、
ツールの読み替えは [.claude/skills/runtime.md](.claude/skills/runtime.md) にまとめる。
スキルの実体は `.claude/skills/` に置き、Codex は `.agents/skills` のリンクから読む。

## 構成と運用ルール

ディレクトリ構成・命名・タスクの状態遷移などのルールは [README.md](README.md) にまとめてある。
**ファイルやディレクトリを追加・移動する前に必ず README.md を読み、記載された手順とスクリプトを使うこと。**
テンプレート (`daily/template/`、`job/template/`) は複製元なので直接編集しない。

よく使う操作:

| やること | 使うもの |
| --- | --- |
| 当日の日報を作る | `./daily/create_daily.sh` |
| AI の作業記録を残す | その日の `agents/<agent名>/` (下記「[AI の作業記録](#ai-の作業記録)」) |
| 個別の作業計画を作る | その日の `mine/_.md` (agent 用なら `agents/<agent名>/_.md`) を複製 ([daily/README.md](daily/README.md)) |
| 案件を始める | `cp -R job/template job/<案件名>` |
| タスクを作る | `/add-task` または `./job/add-task.sh` |
| タスクの状態を変える | `/task-transition` または `./job/task-transition.sh` |
| タスクの状況を見る | `/list-task` または `./job/list-task.sh <案件名>` |
| 動作確認をする | `/verify-task` (手順を対話で提示し、結果を選択肢から選ぶ) |
| 手動テストを実行して GIF を撮る | `/run-manual-test` (Claude in Chrome で実行) |
| テストの手順書を置く | `docs/feature/<領域>/<機能>/` ([docs/feature/README.md](docs/feature/README.md)) |
| QA の状況を見る | `/list-qa` または `./job/list-qa.sh <案件名>` |
| QA を作る | `./job/add-qa.sh` |
| QA を解決にする | `./job/qa-transition.sh` |
| ドキュメントを置く | `docs/{official,unofficial,personal}/<案件名>/` ([docs/README.md](docs/README.md)) |
| リリース資料の変更箇所を作る | `/build-release-diff-sheet` (MR の差分を撮って貼る) |
| リリース資料の確認手順を作る | `/build-release-check-sheet` (`docs/feature/` の手順書から起こす) |
| submodule を追加する | `./repos/add_submodule.sh <URL> [--dir_name <名前>] <権限>` |
| プロジェクト状態を更新する | `/reload-project` |

submodule のローカル動作確認は `repos/<名前>/repo/`、作業ブランチは
`repos/<名前>/.worktrees/<ブランチ名>/` にある。作業前に同階層の `MEMORY.md` を読み、
ブランチの作成・切替・統合を伴う場合は `BRANCH.md` と `WORKTREES.md` も確認する。

## 手動テストの手順書

**手順は `docs/feature/<領域>/<機能>/` に Gherkin 記法で置く。タスク md には埋め込まない。**
手順はタスクより長生きするため、`done` になったタスクの中に埋まると再利用できない。

* 1 ファイル = 1 `Feature:` = 1 章。**中身は最小限にして章ごとに分ける**
* `_` で始まるファイルは実行対象にせず、ディレクトリ共通の `Background:` を置く
* 仕様が変わったら消さずに `docs/feature/archived/<同じ相対パス>` へ `git mv` する
* タスクとの対応はタスク md の frontmatter `test:` に書く
* 結果と GIF は `job/<案件名>/assets/<タスク名>/<実行日>/` に残し、タスク md から参照する

実行は `/verify-task` (人が実機を見て結果を選ぶ) か
`/run-manual-test` (Chrome で実行してシナリオごとに GIF を撮る)。
詳細は [docs/feature/README.md](docs/feature/README.md) を参照。

## タスクと QA の状態

**状態の正は実体ファイルの frontmatter にある `status`。**
`todo/` `pending/` `progress/` `done/` (タスク) と `unresolved/` `resolved/` (QA) に置く
シンボリックリンクは、`ls` で状況を見るための索引として扱う。
**`pending` は「外部要因で着手できない」状態**で、`blockedBy` に待っている相手を必ず書く
(`todo` は今すぐ着手できるもの)。
**状態を変えるときは frontmatter とリンクの両方を直す。**
食い違ったときは frontmatter が正で、リンクの張り替え漏れとして扱う。

frontmatter は固定ID (`T-001` / `Q-001`)、日付 (`createdAt` / `updatedAt` / `completedAt` / `resolvedAt`)、
依存関係 (`blockedBy`)、QA なら関連案件 (`job`) と確認先 (`askTo`) を持つ。
項目の意味と書き方は [README.md](README.md) に従う。
QA は `job/<案件名>/qa/` に置き、特定案件に属さないものは `job/other/qa/` に置く。

## AI の作業記録

**AI が行った作業は `daily/<YYYY-MM>/<DD>/agents/<agent名>/` に記録する。**
`mine/` は自分 (人間) 専用なので、AI はそこに書かない。
自分の記録と AI の記録を混ぜないための分割であり、この境界は必ず守る。

| 書く主体 | 書く場所 |
| --- | --- |
| 自分 (人間) | `daily/<YYYY-MM>/<DD>/mine/` |
| Claude Code 本体 | `daily/<YYYY-MM>/<DD>/agents/claude/` |
| Codex 本体 | `daily/<YYYY-MM>/<DD>/agents/codex/` |
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
書き込み権限を持たないサブエージェントの記録は、
呼び出した側がそのエージェントのディレクトリにまとめる。

詳細は [daily/README.md](daily/README.md) を参照。

## MEMORY.md の使い方

@MEMORY.md

`MEMORY.md` はプロジェクトの現在状況のダイジェスト。上のインポートによりセッション開始時に読み込まれる。
案件・領域で作業するときは、そのディレクトリ直下の `MEMORY.md` も読む。

* **状況把握の起点にする。** 進行中の job・直近の日報・未解決の QA・submodule 一覧がまとまっている。
* **インデックスとして扱う。** 詳細が必要なときは MEMORY.md に書かれたパスから実ファイルを読む。
  MEMORY.md の記述だけで細部を判断しない。
* **手で編集しない。** `/reload-project` スキルがリポジトリ全体をスキャンして再生成する。
  個別の更新を書き足すのではなく、スキルを実行して作り直す。
* **記載が実態と食い違う場合は MEMORY.md ではなく実ファイルが正。** 読取依頼では差異を報告し、変更作業の区切りに `/reload-project` を実行する。

`/reload-project` を実行するタイミング:

* セッション開始時、MEMORY.md が古く、更新も依頼されているとき
* 日報・タスク・QA・submodule を追加/更新して作業に区切りがついたとき
* MEMORY.md の内容が古い、または実態と食い違うと気づいたとき

読み込み・一覧・相談だけの依頼では更新せず、実ファイルで裏取りして古い点を報告する。
変更作業では、その区切りに更新する。`@MEMORY.md` の展開が無い環境では明示的に読む。

サイズ上限は **800 トークン** (警告 600 トークン)。トピック MEMORY は各 **500 トークン** (警告 400 トークン)。
毎セッション読み込まれるため、上限を超える場合は古い情報から圧縮する。判定と圧縮のルールは
[.claude/skills/reload-project/SKILL.md](.claude/skills/reload-project/SKILL.md) に従う。

## 言語

ドキュメント・コメント・コミットメッセージは日本語で書く。
