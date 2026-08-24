# project-template

プロジェクト管理用のリポジトリ。日々の記録・案件のタスク・Q&A・関連リポジトリを1箇所に集約する。

## ディレクトリ構成

```
.
├── README.md                    # このファイル (構成と運用ルール)
├── CLAUDE.md                    # Claude Code 向けの入口
├── MEMORY.md                    # プロジェクト状態のダイジェスト (自動生成)
├── .claude/
│   ├── agents/
│   │   └── task-transition.md   # タスクの状態遷移を行うエージェント
│   └── skills/
│       ├── reload-project/      # MEMORY.md を再生成する
│       ├── list-task/           # タスクを状態別に一覧表示する
│       └── list-qa/             # QA を状態別に一覧表示する
├── daily/                       # 日報・調査の記録
│   ├── README.md
│   ├── create_daily.sh
│   ├── create_session.sh
│   ├── template/
│   └── <YYYY-MM>/<DD>/
│       ├── index.md             # 自分 (人間) の日報
│       └── agents/              # AI の記録
│           └── <ツール名>/<セッションID>/
├── docs/                        # プロジェクト関連ドキュメント
│   ├── README.md
│   ├── official/                # 公式 (正式に合意・承認されたもの)
│   ├── unofficial/              # 非公式 (共有はするが未確定のもの)
│   └── personal/                # 個人 (自分だけが使うもの)
├── job/                         # 案件・タスク管理
│   ├── template/
│   └── <案件名>/task/{list,todo,progress,done}/
├── qa/                          # 質問と回答
│   ├── list/
│   ├── unresolved/
│   └── resolved/
└── repos/                       # 関連リポジトリ (submodule)
    ├── README.md
    ├── add_submodule.sh
    ├── setup_worktrees.sh       # 常設 worktree を作成する
    ├── common/standard.json     # 標準ブランチ運用ルールの実体
    ├── template/                # リポジトリ1件分の複製元
    └── <リポジトリ名>/
        ├── repo/                # submodule の実体
        ├── README.md
        ├── branch-rule.json     # 実体 or common/*.json へのシンボリックリンク
        └── .worktrees/          # 常設 worktree (git 管理外)
```

各ディレクトリの `template/` `template.md` は複製元であり、直接編集しない。
テンプレート自体のルールを変えたいときだけ編集する。

## daily/ — 日報・調査の記録

日付ごとの記録。`daily/<YYYY-MM>/<DD>/` に月・日の2階層で切り、その下を
**人間用の `index.md` 1ファイル**と、**AI 用の `agents/<ツール名>/<セッションID>/`** に分ける。

ここに置くのは**調査そのものの記録**。調査が完結したら、その結論は task に書き出す
([job/ — 案件・タスク管理](#job--案件タスク管理))。

```
daily/2026-08/24/
├── index.md                     # 自分 (人間) の日報。AI はここに書かない
└── agents/                      # AI の記録はすべてこの下
    └── claude-code/             # ツール単位
        └── e25616ea-.../        # セッション単位。中に調査記録の md を溜める
```

ツール名は英小文字とハイフン (Claude Code なら `claude-code`)、セッションID はそのツールの
セッション識別子 (Claude Code なら環境変数 `CLAUDE_CODE_SESSION_ID`) をそのまま使う。
**1セッション = 1ディレクトリ**とし、調査が増えたらディレクトリではなく md を増やす。

```sh
./daily/create_daily.sh                          # 当日分の日報を作成
./daily/create_session.sh                        # セッションの記録ディレクトリを作成
./daily/create_session.sh --tool codex sess_01    # 他のツールから使う場合
```

調査記録は `daily/template/_.md` をセッションディレクトリに複製して作る。
構成は 目的 / 対象 / 経過 / 分かったこと / 未解決 / task への反映。
詳細は [daily/README.md](daily/README.md) を参照。

## docs/ — プロジェクト関連ドキュメント

後から参照するドキュメントの保管場所。**公式性のレベルで3つに分ける**。

| ディレクトリ | 置くもの |
| --- | --- |
| `official/` | 顧客・発注元・社内で正式に合意または承認されたもの (要件定義、仕様書、契約、規約) |
| `unofficial/` | 共有はするが正式な承認は無いもの (議事メモ、調査結果、設計の下書き) |
| `personal/` | 自分だけが使うもの (作業メモ、手順の覚書) |

判断に迷ったら **「他人がこれを根拠に判断してよいか」** で切り分ける。
各分類の下は案件ごとに切り、ディレクトリ名は `job/<案件名>/` と揃える。
案件に紐づかないものは `common/` に置く。

```sh
mkdir -p docs/official/acme-site
```

`daily/` が時系列の記録、`docs/` が継続的に参照するドキュメントという違いで使い分ける。
詳細は [docs/README.md](docs/README.md) を参照。

運用ルールの入口を短く保つため、**`docs/README.md` は上限 800 トークン (警告 600)** とする。
超えた場合は個別の事情を削り、分類と判断基準を残す。

```sh
./.claude/skills/reload-project/count_tokens.sh docs/README.md
```

## job/ — 案件・タスク管理

**このリポジトリの運用の中心は task**。作業は task 単位で管理し、その根拠を daily の調査記録に残す。

task は必ず調査を伴う。**調査を始めるときに task を作り**、調べた過程は
`daily/<YYYY-MM>/<DD>/agents/<ツール名>/<セッションID>/<名前>.md` に、
調査の完結状態 (結論と決めたこと) は task に書く。
task の `## 参照先` に調査記録のパスを列挙し、**task から根拠がたどれる状態を保つ**。

案件ごとに `job/template/` を複製する。

```sh
cp -R job/template job/acme-site
```

### タスクの管理方式

タスクの**実体は常に `task/list/` に置く**。`todo/` `progress/` `done/` には
`list/` の実体を指す**相対パスのシンボリックリンク**を置き、リンクを移動させて状態を遷移させる。

```
job/acme-site/task/
├── list/                      # タスクの実体はここだけ
│   ├── template.md            # タスクテンプレート
│   └── api-setup.md
├── todo/
├── progress/
│   └── api-setup.md -> ../list/api-setup.md
└── done/
```

### 操作手順

```sh
# 1. タスクを作成する (実体は list/)
cp job/acme-site/task/list/template.md job/acme-site/task/list/api-setup.md

# 2. todo に登録する (相対パスのシンボリックリンク)
ln -s ../list/api-setup.md job/acme-site/task/todo/api-setup.md

# 3. 着手する: todo -> progress
mv job/acme-site/task/todo/api-setup.md job/acme-site/task/progress/

# 4. 完了する: progress -> done
mv job/acme-site/task/progress/api-setup.md job/acme-site/task/done/
```

リンク先を `../list/<タスク名>.md` という相対パスにしているため、`todo/` `progress/` `done/`
はいずれも `task/` 直下で同じ深さにあり、`mv` で移動してもリンクは壊れない。

この方式により、

* タスクの内容・履歴の参照先が `list/` の1ファイルに定まる (状態を変えても中身は移動しない)
* 状態は `ls task/progress/` のようにディレクトリを見るだけで分かる

### タスクファイルの中身

`list/template.md` の構成: タイトル / 内容 / 完了条件 / 参照先 / 結果。

| 見出し | 書くもの |
| --- | --- |
| `## 内容` | 何をするか。この task で明らかにしたいこと |
| `## 完了条件` | 何が分かれば / 何ができれば完了か |
| `## 参照先` | 根拠になる調査記録・ドキュメント・QA のパス (日付つきの表) |
| `## 結果` | 調査の完結状態。結論と、それに基づいて決めたこと |

**調べた過程は task に書かず daily に置き、`## 参照先` からたどれるようにする。**
task には結論だけを残す。

## qa/ — 質問と回答

質問と回答を1件1ファイルで記録する。タスクと同じ方式で、**実体は `qa/list/` に置き、
`unresolved/` `resolved/` には相対シンボリックリンクを置いて状態を管理する。**

```
qa/
├── list/                      # QA の実体はここだけ
│   ├── template.md            # QA テンプレート
│   └── submodule-permission.md
├── unresolved/
│   └── submodule-permission.md -> ../list/submodule-permission.md
└── resolved/
```

### 操作手順

```sh
# 1. QA を作成する (実体は list/)
cp qa/list/template.md qa/list/submodule-permission.md

# 2. 未解決として登録する (相対パスのシンボリックリンク)
ln -s ../list/submodule-permission.md qa/unresolved/submodule-permission.md

# 3. 解決したら: unresolved -> resolved
mv qa/unresolved/submodule-permission.md qa/resolved/
```

ファイルの構成は 質問内容 / 回答内容。
**未解決かどうかはファイルの中身ではなく `unresolved/` にリンクがあるかで判断する。**

## repos/ — 関連リポジトリ (submodule)

関連リポジトリを **1リポジトリ = 1ディレクトリ**で管理する。ディレクトリ名はリポジトリ名に合わせ、
その中に submodule 本体 (`repo/`)・README・ブランチ運用ルール・worktree 置き場をまとめる。

```sh
./repos/add_submodule.sh <リモートリポジトリのssh経由URL> [--dir_name <ディレクトリ名>] <権限>
```

1回の実行で以下が行われる。

1. `repos/<リポジトリ名>/` の作成 (`repos/template/` の複製)
2. `repos/<リポジトリ名>/repo` への submodule 追加
3. `repos/README.md` のアクセス権限テーブルへの追記
4. 常設 worktree の作成 (参照用 / `local/verify` / `local/e2e`)

**submodule はリポジトリ直下ではなく `<リポジトリ名>/repo/`** なので、コマンドのパスに注意する
(`git -C repos/<リポジトリ名>/repo status`)。

ブランチ運用ルールは `repos/<リポジトリ名>/branch-rule.json` に JSON で定義する。
標準ルールは `repos/common/standard.json` にあり、使い回すリポジトリはそこへの
シンボリックリンクにする。

作業は `repos/<リポジトリ名>/.worktrees/<ブランチ名>/` の worktree で行う
(`repo/` の中で checkout を切り替えない)。`.worktrees/` は git 管理外。
**task 起因のブランチなら `.worktrees/` への書き込みは確認不要、push は要求されたときだけ**行う。

```sh
./repos/setup_worktrees.sh <リポジトリ名>                    # 常設 worktree を作る
./repos/setup_worktrees.sh <リポジトリ名> --branch feature/x  # 追加で作る
```

詳細は [repos/README.md](repos/README.md) を参照。

## MEMORY.md — プロジェクト状態のダイジェスト

現在の状況 (進行中の job、直近の日報、未解決の QA、submodule 一覧) を要約したファイル。
`/reload-project` スキルが全体をスキャンして再生成する**自動生成物なので、手で編集しない**。
上限は 1,500 トークン。使い方は [CLAUDE.md](CLAUDE.md) を参照。

## 空ディレクトリの扱い

git は空ディレクトリを追跡しないため、`task/todo/` や `daily/<YYYY-MM>/<DD>/agents/` のように
中身が無い状態がありうるディレクトリには `.gitkeep` を置いている。
新しく同種のディレクトリを作る場合も `.gitkeep` を置くこと。

例外は `daily/.../agents/<ツール名>/<セッションID>/`。**中に必ず調査記録の md を置く**ため
`.gitkeep` は不要で、空のまま残ったセッションディレクトリは記録が無い = 追跡不要とみなす。
