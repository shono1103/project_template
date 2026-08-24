# repos — 関連リポジトリ (submodule)

関連リポジトリを **1リポジトリ = 1ディレクトリ**で管理する。
ディレクトリ名はリポジトリ名に合わせ、その中に submodule 本体・README・
ブランチ運用ルール・worktree 置き場をまとめる。

## ディレクトリ構成

```
repos/
├── README.md                   # このファイル (全体のルールとアクセス権限テーブル)
├── add_submodule.sh            # submodule を追加する
├── setup_worktrees.sh          # 常設 worktree を作成する
├── common/
│   ├── standard.json           # 標準ブランチ運用ルールの実体
│   └── workflow/               # 開発ワークフローの定義 (Allium spec)
│       ├── README.md
│       └── development-workflow.allium
├── template/                   # 複製元 (直接編集しない)
│   ├── README.md
│   ├── branch-rule.json -> ../common/standard.json
│   └── workflow.allium -> ../common/workflow/development-workflow.allium
└── <リポジトリ名>/
    ├── repo/                   # submodule の実体
    ├── README.md               # このリポジトリ固有の情報
    ├── branch-rule.json        # ブランチ運用ルール (実体 or common/*.json へのリンク)
    ├── workflow.allium         # 開発ワークフロー (実体 or common/workflow/ へのリンク)
    └── .worktrees/             # 常設 worktree の置き場 (git管理外)
```

**submodule はリポジトリ直下ではなく `<リポジトリ名>/repo/`**。
コマンドを打つときのパスに注意する (`git -C repos/<リポジトリ名>/repo status` など)。

## submodule の追加

以下のスクリプトで、

* `repos/<リポジトリ名>/repo` への submodule 追加
* `template/` の複製 (README.md / branch-rule.json / .worktrees/)
* アクセス権限テーブルへの追加

が完了する。

```sh
./repos/add_submodule.sh <リモートリポジトリのssh経由URL> [--dir_name <ディレクトリ名>] <権限>
```

`<権限>` は2桁の数字で、**1桁目が project_group、2桁目が submodule** の順。

| 数字 | 意味 |
| --- | --- |
| 4 | r |
| 2 | w |
| 1 | x |

合計値で指定する (`7` = rwx)。`77` なら project_group・submodule ともに rwx。

追加後は `<リポジトリ名>/README.md` の概要とリモート URL を埋める。

## アクセス権限

このディレクトリの submodule へのアクセス権限。

### role

* project_group: プロジェクト管理リポジトリからの claude 起動時 role
* submodule: submodule 内での claude 起動時 role

### アクセス権限テーブル

`repo_dir` は `repos/<リポジトリ名>/` を指す (submodule 本体はその中の `repo/`)。

| repo_dir | project_group | submodule|
| --- | --- | --- |
| <例> | rwx | rwx |
| | |

## ブランチ運用ルール (branch-rule.json)

リポジトリごとのブランチ運用ルールを `<リポジトリ名>/branch-rule.json` に JSON で定義する。

* 標準ルールをそのまま使う → `common/standard.json` への相対シンボリックリンクにする
  ```sh
  ln -s ../common/standard.json repos/<リポジトリ名>/branch-rule.json
  ```
* 独自ルールが必要 → 実体ファイルにする (`common/standard.json` をコピーして編集)
* ルールが不要 → `branch-rule.json` を置かない (ブランチ運用の管理対象外)

`add_submodule.sh` は標準ルールへのシンボリックリンクを張った状態で作る。

### JSON の構成

`branch_types` の配列で、ブランチ種別ごとに以下を定義する。

| フィールド | 意味 |
| --- | --- |
| `type` | ブランチ種別名 |
| `pattern` | ブランチ名のパターン |
| `branches_from` | 分岐元のパターン配列。`"any"` はどのブランチからでも分岐しうることを表す |
| `merge_target` | マージ先。`"origin"` は分岐元と同じブランチへマージすることを表す。`null` は未定義 |
| `sync_from` | (release/staging) 定期的に取り込みマージする対象 |
| `temporary` | 期間限定ブランチかどうか |
| `default_branch` | デフォルトブランチかどうか (main のみ) |
| `protection` | (main のみ) 保護設定 |
| `naming_rule` | (release/staging) 命名規則の補足 |
| `description` | 運用ルールの説明文 |

`common/standard.json` の内容を実際に GitHub 側 (Repository Rulesets 等) へ適用する仕組みは未整備。
現時点ではこの JSON は運用ルールの正とし、適用は手動で行う。

## 開発ワークフロー (workflow.allium)

ブランチ運用ルールにしたがって task 1件を着手から完了まで運ぶ工程を、
**Allium spec** で定義してある。実体は `common/workflow/development-workflow.allium` で、
各リポジトリの `workflow.allium` はそこへの相対シンボリックリンク。

工程は `investigate → define → model → draft → verify → integrate → commit →
review → merge → cleanup`。このうち動作確認・CI・3段のレビュー (コミット / ブランチ /
リポジトリ) は**同じ収束ループ**なので、`ConvergenceCycle` 1つを scope を変えて再利用している。

```sh
allium check   repos/common/workflow/development-workflow.allium
allium analyse repos/common/workflow/development-workflow.allium
```

工程ごとの成果物・スコープごとの検査手段・ツール (Allium / likeC4 / Superpowers) の役割は
[common/workflow/README.md](common/workflow/README.md) を参照。
適用対象のブランチ種別は `standard.json` の `workflow.applies_to` で決まる
(既定は feature / fix / chore)。

## worktree

作業ツリーは **`<リポジトリ名>/.worktrees/<ブランチ名>/`** に作る。
submodule (`repo/`) の中で checkout を切り替えないことで、
**動作確認・テスト・実装を同時に並べられる**状態にする。

`.worktrees/` は端末ごとの作業ツリーなので**ディレクトリごと追跡しない**
([.gitignore](../.gitignore) で除外)。そのため clone 直後には存在しないが、
`setup_worktrees.sh` と `git worktree add` が必要に応じて作る。

### 常設 worktree

submodule を追加すると以下が自動で作られる (`add_submodule.sh` が `setup_worktrees.sh` を呼ぶ)。
既に clone してある場合は手動で実行する。

```sh
./repos/setup_worktrees.sh <リポジトリ名>
```

| 場所 | ブランチ | 用途 |
| --- | --- | --- |
| `repo/` | デフォルトブランチ | **参照用**。「今の main はどうなっているか」を見る。作業では触らない |
| `.worktrees/verify/` | `local/verify` | 動作確認用。ローカルで動かして確かめる |
| `.worktrees/e2e/` | `local/e2e` | E2E テスト用。実行に時間がかかるので専用に分ける |

`local/*` は**ローカル専用ブランチで push しない** (`common/standard.json` の `local` 種別)。

**参照用に worktree は作らない。`repo/` 自体をデフォルトブランチに置いたまま参照用として使う。**
そのため `repo/` の checkout は切り替えず、作業はすべて `.worktrees/` の worktree で行う。
`setup_worktrees.sh` は `repo/` がデフォルトブランチにいなければ切り替える
(未コミットの変更があるときは触らずに警告する)。更新は `git -C repos/<リポジトリ名>/repo pull`。

### 作業用 worktree を追加する

task 起因のブランチはその都度作る。既定に加えて常設したいものは `--branch` で指定できる。

```sh
./repos/setup_worktrees.sh <リポジトリ名> --branch feature/login   # .worktrees/feature-login/
git -C repos/<リポジトリ名>/repo worktree list                      # 一覧
git -C repos/<リポジトリ名>/repo worktree remove ../.worktrees/<名前>  # 片付ける
```

必要に応じて常設を検討するとよいもの:

| 候補 | 用途 |
| --- | --- |
| `local/review` | レビュー用。他人のブランチをここに checkout して読む (自分の作業を退避しなくて済む) |
| `*-release` / `*-staging` | リリース前検証用。`common/standard.json` の release / staging に対応 |
| `fix/*` 用の空き worktree | 緊急のバグ修正を、進行中の作業を中断せずに始めるため |

E2E や動作確認の worktree は**依存関係のインストール (`node_modules` 等) が worktree ごとに必要**。
初回セットアップの手順はリポジトリごとに違うので `<リポジトリ名>/README.md` に書く。

### AI の書き込み権限

* **`.worktrees/` への書き込みは、task 起因のブランチであれば許可**する。
  `job/<案件名>/task/` の task に紐づくブランチなら、worktree の作成・その中での編集・
  コミットまで確認を取らずに進めてよい。
* **push は要求されたときだけ**行う。コミットまでは task の作業として進めてよいが、
  リモートへの反映は明示的に頼まれるまで行わない。
* task に紐づかないブランチ (思いつきの作業・実験) で worktree を作る場合は確認を取る。

ブランチをどう切るかは `<リポジトリ名>/branch-rule.json` に従う。

## 運用

* `template/` は複製元なので直接編集しない。テンプレート自体のルールを変えるときだけ編集する。
* submodule のパスを変える・消すときは `.gitmodules` と `.git/modules/` の整合に注意する。
  worktree を張ったまま submodule を消すと参照が残るので、先に
  `git -C <リポジトリ名>/repo worktree remove` で片付ける。
