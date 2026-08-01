# project-template

プロジェクト管理用のリポジトリ。日々の記録・案件のタスク・Q&A・関連リポジトリを1箇所に集約する。

## ディレクトリ構成

```
.
├── README.md                    # このファイル (構成と運用ルール)
├── CLAUDE.md                    # Claude Code 向けの入口
├── MEMORY.md                    # プロジェクト状態のダイジェスト (自動生成)
├── .claude/
│   └── skills/
│       └── reload-project/      # MEMORY.md を更新するスキル
├── daily/                       # 日報・作業ログ
│   ├── create_daily.sh
│   ├── template/
│   └── <YYYY-MM>/<DD>/
├── job/                         # 案件・タスク管理
│   ├── template/
│   └── <案件名>/task/{list,todo,progress,done}/
├── qa/                          # 質問と回答
│   ├── template.md
│   └── <質問名>.md
└── repos/                       # 関連リポジトリ (submodule)
    ├── README.md
    ├── add_submodule.sh
    └── <submodule>/
```

各ディレクトリの `template/` `template.md` は複製元であり、直接編集しない。
テンプレート自体のルールを変えたいときだけ編集する。

## daily/ — 日報・作業ログ

日付ごとの記録。`daily/<YYYY-MM>/<DD>/` に月・日の2階層で切る。

### 当日分を作成する

```sh
./daily/create_daily.sh              # 当日分
./daily/create_daily.sh 2026-08-01   # 日付を指定
```

`daily/template/` の内容を複製し、`index.md` の見出しに日付を差し込む。
すでに存在する場合は何も変更しない。

### 日ごとのディレクトリ

| パス | 用途 |
| --- | --- |
| `index.md` | その日の日報。目標 / 計画 / 結果 / 明日 |
| `_.md` | 個別計画のテンプレート。複製して使う |
| `outputs/` | その日の成果物 (生成物・調査結果など) |

個別の作業計画は `_.md` を複製して作る。

```sh
cp daily/2026-08/01/_.md daily/2026-08/01/add-submodule.md
```

## job/ — 案件・タスク管理

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
│   ├── template.md            # タスク計画テンプレート
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

`list/template.md` の構成: タイトル / 内容 / 完了条件 / ログ (フェーズごとの計画と実施内容) / 結果。

## qa/ — 質問と回答

`qa/template.md` を複製して1件1ファイルで記録する。

```sh
cp qa/template.md qa/submodule-permission.md
```

構成は 質問内容 / 回答内容。**「## 回答内容」が空のものを未解決として扱う。**

## repos/ — 関連リポジトリ (submodule)

関連リポジトリを submodule として配置し、あわせて Claude 起動時の role ごとの
アクセス権限を管理する。

```sh
./repos/add_submodule.sh <リモートリポジトリのssh経由URL> [--dir_name <ディレクトリ名>] <権限>
```

submodule の追加と `repos/README.md` のアクセス権限テーブルへの追記が同時に行われる。
詳細は [repos/README.md](repos/README.md) を参照。

## MEMORY.md — プロジェクト状態のダイジェスト

現在の状況 (進行中の job、直近の日報、未解決の QA、submodule 一覧) を要約したファイル。
`/reload-project` スキルが全体をスキャンして再生成する**自動生成物なので、手で編集しない**。
上限は 1,500 トークン。使い方は [CLAUDE.md](CLAUDE.md) を参照。

## 空ディレクトリの扱い

git は空ディレクトリを追跡しないため、`outputs/` や `task/todo/` のように
中身が無い状態がありうるディレクトリには `.gitkeep` を置いている。
新しく同種のディレクトリを作る場合も `.gitkeep` を置くこと。
