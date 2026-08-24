# 調査

## 目的

`repos/` を 1リポジトリ = 1ディレクトリの構成に組み替える。

* `repos/<リポジトリ名>/` の中に `repo/` (submodule 本体)・`README.md`・
  `branch-rule.json`・`.worktrees/` を置く
* 動作確認用・E2E テスト用のローカルブランチと、それ用の worktree を常設する
* `.worktrees/` への書き込みは task 起因のブランチなら許可、push は要求時のみ

## 対象

* `repos/README.md`、`repos/add_submodule.sh`、`repos/common/standard.json`
* `repos/template/` (新規)、`repos/setup_worktrees.sh` (新規)
* `.gitignore`、`README.md`、`CLAUDE.md`、`.claude/skills/reload-project/SKILL.md`

## 経過

### branch_policy/ の移動

`repos/branch_policy/common/` → `repos/common/` に `git mv`。個別ポリシーは
各リポジトリの `branch-rule.json` に移したため `branch_policy/` は廃止。
`repos/template/branch-rule.json` は `../common/standard.json` への相対シンボリックリンクにした。
`cp -R` はリンクをリンクとして複製するので、複製先でもリンク先が正しく解決される。

### アクセス権限テーブルの列名

`submodule_dir` は `repos/<リポジトリ名>/` を指すようになったため `repo_dir` に変更。
`add_submodule.sh` の grep と awk の両方がこのヘッダ名を見ているので、2箇所を合わせて修正した
(最初は grep だけ直しており、awk 側が残っていた)。

### .worktrees/ を追跡できなかった件

`.worktrees/.gitkeep` を追跡しようとして `git add` が失敗。
`git check-ignore -v` で調べると、除外元はプロジェクトの `.gitignore` ではなく
グローバル設定 `/Users/saiki/.config/git/ignore` の1行目 `.worktrees/` だった。
**ディレクトリ自体が除外されている場合、その中のファイルを否定パターンで再包含できない**
(git の仕様) ため、`.gitkeep` による追跡は不可能。

`.worktrees/` はディレクトリごと git 管理外とし、`add_submodule.sh` / `setup_worktrees.sh` が
`mkdir -p` で作る方式に変更した。

### 常設 worktree

`setup_worktrees.sh` を新規作成し、submodule 追加時に `add_submodule.sh` から呼ぶようにした。

| ディレクトリ | ブランチ | 用途 |
| --- | --- | --- |
| `.worktrees/<デフォルトブランチ>/` | デフォルトブランチ (detached) | 参照用 |
| `.worktrees/verify/` | `local/verify` | 動作確認 |
| `.worktrees/e2e/` | `local/e2e` | E2E テスト |

参照用を detached にしたのは、`repo/` 側が同じブランチを checkout していると
worktree 側で同じブランチを checkout できないため。

`common/standard.json` に `local` ブランチ種別 (`pattern: local/*`、`push: false`) を追加した。

### 動作確認

scratchpad に隔離環境 (bare リポジトリ + 親リポジトリ) を作り、以下を確認した。

* `add_submodule.sh` の通し実行 — ディレクトリ作成 / submodule 追加 / README 埋め込み /
  権限テーブル追記 / worktree 3件作成
* submodule 追加が失敗したときのロールバック (作成したディレクトリが消える)
* `setup_worktrees.sh` の冪等性 (2回目は全てスキップ)
* `--branch feature/login` での追加 (`.worktrees/feature-login/`)
* worktree 内での編集が親リポジトリから無視されること

## 分かったこと

* グローバル gitignore (`~/.config/git/ignore`) に `.worktrees/` が既に入っており、
  worktree を git 管理しない方針は元から取られていた。プロジェクトの `.gitignore` にも
  同じ意図を明記して、この repo 単体でも成立するようにした
* `git worktree add` の相対パスは `git -C <repo>` の位置基準になる。
  スクリプトでは曖昧さを避けて絶対パスを渡すことにした
* worktree を張ったまま submodule を消すと参照が残る。先に `worktree remove` が必要
  (`repos/README.md` の運用に記載)

## 未解決

なし

## task への反映

該当なし (`job/` に案件が未作成のため、この作業自体の task は作っていない)。
