# SQLite 初期化の準備
## 内容

ルートを pnpm プロジェクトにし、案件・タスク・QA・依存関係を格納する SQLite DB の初期化スクリプトを作る。

## 完了条件

- [x] feature ブランチで作業する。
- [x] `pnpm install` と `pnpm typecheck` が通る。
- [x] `pnpm project:init` で5テーブルを作れる。
- [x] 再実行しても既存 DB を消さない。
- [x] タスク・QA・依存関係と種別制約を確認する。

## ログ

### フェーズ

#### 計画

Node.js 24 の `node:sqlite` を使い、外部の SQLite パッケージを追加しない。

#### 実施内容

`package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`job/project_init.ts` を追加し、README に使い方を記載した。
`job/project.sqlite` を初期化した。検証用の行はトランザクションでロールバックした。
既存の `.agents/skills` の削除は作業前からある変更として保持した。

## 結果

型検査、再実行、`PRAGMA integrity_check`、サンプルデータと制約の検証が成功した。
