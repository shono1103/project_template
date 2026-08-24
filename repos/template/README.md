# <リポジトリ名>

<!-- このリポジトリが何であるかを1〜2行で -->

| 項目 | 値 |
| --- | --- |
| リモート | `<git@github.com:org/repo.git>` |
| submodule | `repo/` |
| ブランチ運用ルール | `branch-rule.json` |
| 開発ワークフロー | `workflow.allium` |
| アクセス権限 | [repos/README.md](../README.md) のテーブルを参照 |

## このリポジトリ固有の運用

<!-- 標準と違う点・注意点・環境構築の手順など。無ければ「なし」と書く -->

なし

## worktree

作業ツリーは `.worktrees/<ブランチ名>/` に作る。`.worktrees/` は git 管理外。

### 常設

| 場所 | ブランチ | 用途 |
| --- | --- | --- |
| `repo/` | デフォルトブランチ | 参照用 (worktree は作らない。作業では触らない) |
| `.worktrees/verify/` | `local/verify` | 動作確認 |
| `.worktrees/e2e/` | `local/e2e` | E2E テスト |

無い場合は `./repos/setup_worktrees.sh <このディレクトリ名>` で作る。`local/*` は push しない。

### 初回セットアップ

<!-- 依存関係のインストールなど、worktree を作った後に必要な手順。無ければ「なし」 -->

なし

### コマンド

```sh
git -C repo worktree add ../.worktrees/<ブランチ名> <ブランチ名>      # 既存ブランチ
git -C repo worktree add -b <ブランチ名> ../.worktrees/<ブランチ名>   # 新規ブランチ
git -C repo worktree list
git -C repo worktree remove ../.worktrees/<ブランチ名>                # 片付ける
```

ブランチの切り方は `branch-rule.json` に従う。
