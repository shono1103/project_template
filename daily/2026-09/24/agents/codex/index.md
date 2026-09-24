# 日報

## 目標

SQLite 管理へ移行する準備として、作業ブランチとルートの pnpm プロジェクトを用意する。

## 計画

- `feature/sqlite-project-init` を作成する。
- 5 テーブルの SQLite 初期化スクリプトを TypeScript で実装する。
- 型と初期化動作を確認する。

## 結果

- `feature/sqlite-project-init` を作成した。
- pnpm、TypeScript、Node.js 組み込み SQLite を使う初期化スクリプトを追加した。
- `job/project.sqlite` を作成し、再実行、整合性、タスク・QA・依存関係の登録を確認した。
- 既存の Markdown 管理は変更していない。

## 明日

- 既存データの移行方法と、DB を正本にする時期を決める。
