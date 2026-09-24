# raprid

`repo/` は `raprid` CLIとWebアプリのsubmodule。ブランチとworktreeの運用は [BRANCH.md](BRANCH.md) と [WORKTREES.md](WORKTREES.md) に従う。

開発中のローカル版をグローバルにインストールする場合、先にビルド用依存を入れる。

```sh
cd repos/raprid/repo
pnpm install
npm install -g .
```

`raprid` の配布パッケージには `template/` 内の雛形を同梱する。親テンプレートの構成を変更したときは、作業ブランチのworktreeで `node scripts/sync-template.mjs` を実行し、差分を確認する。ソースの詳細は [repo/README.md](repo/README.md) を参照。
