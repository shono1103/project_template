# MEMORY

> `/reload-project` で自動生成される。手で編集しない。
> 最終更新: 2026-08-24 / 概算 812 トークン (上限 1,500)

## プロジェクト概要

プロジェクト管理リポジトリのセットアップ段階。
**運用の中心は task**。task は必ず調査を伴い、調査を始めるときに task を作る。
調査の過程は `daily/`、調査の完結状態 (結論と参照先) は `job/<案件名>/task/list/` に書く。
テンプレートと運用スクリプトは整備済みで、案件・タスクの実データはまだ無い。

日報は日ごとに人間用の `index.md` 1ファイルと、AI 用の
`agents/<ツール名>/<セッションID>/` (調査記録の md を溜める) に分かれる
([daily/README.md](daily/README.md))。

関連リポジトリは 1リポジトリ = 1ディレクトリで
`repos/<名前>/{repo,README.md,branch-rule.json,workflow.allium,.worktrees/}` の構成
([repos/README.md](repos/README.md))。開発ワークフローは Allium spec で定義してある。

## 進行中の job

なし (`job/` はテンプレートのみ。`cp -R job/template job/<案件名>` で作成する)

## 直近の日報

- 2026-08-24 (`daily/2026-08/24/index.md`) — index.md は未記入 / agents: claude-code 1 セッション

## 未解決の QA

なし

## docs

なし (`docs/{official,unofficial,personal}/` は空、[docs/README.md](docs/README.md) のみ)

## submodule

なし (`./repos/add_submodule.sh <URL> [--dir_name <名前>] <権限>` で追加する)

* submodule の実体は `repos/<名前>/repo/`。ブランチ運用ルールは `branch-rule.json`
  (標準は `repos/common/standard.json` へのシンボリックリンク)
* 作業は `repos/<名前>/.worktrees/<ブランチ>/` の worktree で行う (git 管理外)。
  **`repo/` はデフォルトブランチのまま参照用**として使い checkout を切り替えない。
  常設 worktree は `local/verify` (動作確認) と `local/e2e` (E2Eテスト) の2つで、
  `./repos/setup_worktrees.sh <名前>` が作る
* **task 起因のブランチなら `.worktrees/` への書き込みは確認不要。push は要求時のみ**
* 開発ワークフローは `workflow.allium` (実体は `repos/common/workflow/development-workflow.allium`)。
  工程は 調査 → 定義 → EaC → 実装 → 動作確認 → CI → コミット → レビュー3段 → マージ → 後片付け。
  動作確認・CI・レビューは同じ収束ループ (`ConvergenceCycle` の scope 違い) として定義
  ([repos/common/workflow/README.md](repos/common/workflow/README.md))
* Allium (v3.13.0) と likeC4 の CLI は導入済み。**Superpowers は未導入**
