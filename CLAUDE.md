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
| 案件固有の前提・決定を書く | `job/<案件名>/MEMORY.md` (上限 1,000 トークン) |
| 案件の知識をアーカイブする | `job/<案件名>/STORAGE.md` (追記のみ) |
| 過去の案件から先例を探す | `/find-precedent` |
| タスクを作る | `job/<案件名>/task/list/template.md` を複製 (調査を始めるとき) |
| タスクの状態を変える | `todo/` `pending/` `progress/` `done/` 間でシンボリックリンクを `mv` |
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

1. 着手前に `/find-precedent` で過去の案件に先例が無いか探す (2件目以降の案件で効く)
2. `job/<案件名>/task/list/template.md` を複製して task を作り、`todo/` に相対シンボリックリンクを張る
3. 着手時に `progress/` へ移す (`task-transition` エージェント)
4. 調査そのものは daily の調査記録に書く (下記「[AI の作業記録](#ai-の作業記録)」)
5. 完結したら task の `## 結果` に結論を、`## 参照先` に調査記録のパスを書く
6. `done/` へ移し、**結論1行と踏んだ罠を `job/<案件名>/STORAGE.md` に追記する**

**調べた過程を task に書かない。** task に残すのは結論と参照先だけで、
過程は daily に置き、task からたどれる状態にする。手順の詳細は [README.md](README.md) を参照。

## タスクの状態

**状態の正はリンクがどのディレクトリ (`todo/` `pending/` `progress/` `done/`) にあるか。**
実体 (`task/list/<タスク名>.md`) の中に状態を書かない。2箇所に持つと必ず食い違う。

**`pending` は「外部要因で着手できない」状態**で、実体の frontmatter `blockedBy` に
待っている相手を必ず書く (`todo` は今すぐ着手できるもの)。

* **`pending` に入れるのに `blockedBy` が空なら、そこで止めて待ち先を確認する。**
  空のまま入れると待ちが解けたかを判定できず、そのタスクは拾われないまま止まる
* **`pending` から出すときは `blockedBy` を空に戻す**
* **`other:` が続くなら QA として起票する合図。** 相手が特定できていない待ちは
  忘れられるので `qa/` に載せて追える形にする

frontmatter は状態も日付も持たない (リンクの位置と git 履歴から分かるため)。
項目の意味は [README.md](README.md) に従う。

状態の変更は `task-transition` エージェントに任せる (リンクの `mv` だけを行う)。

## submodule の作業権限

submodule (`repos/<リポジトリ名>/repo/`) の作業は
`repos/<リポジトリ名>/.worktrees/<ブランチ名>/` に worktree を作って行う。

* **task 起因のブランチなら `.worktrees/` への書き込みは確認不要**。
  worktree の作成・編集・コミットまで進めてよい (task は `job/<案件名>/task/` のもの)。
* **push は要求されたときだけ**行う。
* task に紐づかないブランチで worktree を作る場合は確認を取る。

**`repo/` の checkout は切り替えない。** デフォルトブランチのまま参照用として使い、
作業・動作確認・テストはすべて worktree で行う。

| 場所 | ブランチ | 用途 |
| --- | --- | --- |
| `repo/` | デフォルトブランチ | 参照用 (作業では触らない) |
| `.worktrees/verify/` | `local/verify` | 動作確認 |
| `.worktrees/e2e/` | `local/e2e` | E2E テスト |

無い場合は `./repos/setup_worktrees.sh <リポジトリ名>` で作る。`local/*` は push しない。

ブランチの切り方は `repos/<リポジトリ名>/branch-rule.json`、
**作業の進め方は `repos/<リポジトリ名>/workflow.allium` (Allium spec) に従う**。
工程は 調査 → 定義 → EaC → 実装 → 動作確認 → CI → コミット (最小粒度 + 5W1H) →
レビュー3段 (コミット / ブランチ / リポジトリ) → マージ → 後片付け。
動作確認・CI・レビューは同じ収束ループ (検査 → 解消 → 再検査) として定義してある。

詳細は [repos/README.md](repos/README.md) と
[repos/common/workflow/README.md](repos/common/workflow/README.md) を参照。

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

### 案件ごとのメモリ (`job/<案件名>/`)

メモリは2層ある。**自動生成かどうかで役割が分かれる**。

| 層 | ファイル | 生成 | 内容 |
| --- | --- | --- | --- |
| プロジェクト | `MEMORY.md` | `/reload-project` が自動生成 | 構成からスキャンで導出できる現在の状態 |
| 案件 | `job/<案件名>/MEMORY.md` `STORAGE.md` | 作業中に自分で書く | 導出できない案件固有の知識 |

* **`job/<案件名>/MEMORY.md`** — その案件だけに効く前提と決定 (環境・URL・命名規則・慣習・
  なぜそう決めたか)。上限 1,000 トークン。**task の状態のように構成から導出できるものは書かない。**
* **`job/<案件名>/STORAGE.md`** — 追記型のアーカイブ。上限なし、**消さない・書き換えない**。
  踏んだ罠 / 完了した task の結論 / MEMORY から溢れたもの。
* **圧縮は削除ではなく MEMORY から STORAGE への移動**。情報を捨てるための境界ではない。
* この2ファイルは手書きなので **`/reload-project` は読むだけで上書きしない**。

案件をまたぐ知識をルート層へ昇格させる運用は取らず、**必要になった時点で `/find-precedent` が
過去の案件を探索して引き出す**。そのため `MEMORY.md` の `## 属性` (種別・技術スタック・
ドメイン・キーワード) が検索キーになる。**案件を始めたら属性を必ず埋める。**

## 言語

ドキュメント・コメント・コミットメッセージは日本語で書く。
