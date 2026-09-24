# raprid

`repo/` は `raprid` CLIとWebアプリのsubmodule。ブランチとworktreeの運用は [BRANCH.md](BRANCH.md) と [WORKTREES.md](WORKTREES.md) に従う。

開発中のローカル版をグローバルにインストールする場合、先にビルド用依存を入れる。

```sh
cd repos/raprid/repo
pnpm install
npm install -g .
```

`raprid` の配布パッケージには、SQLite管理に合わせた `template/` とDB初期化コードを同梱する。親リポジトリのMarkdown方式の `job/` は配布しない。ソースの詳細は [repo/README.md](repo/README.md) を参照。
