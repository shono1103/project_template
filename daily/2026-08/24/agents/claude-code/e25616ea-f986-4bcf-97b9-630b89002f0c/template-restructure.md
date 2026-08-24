# 調査

## 目的

テンプレートの構成を task 中心の運用に合わせて組み替える。

* task を運用の中心に置く (task は必ず調査を伴い、調査を始めるときに task を作る)
* 調査の過程は daily、調査の完結状態は task に書き、task から根拠をたどれるようにする
* daily から `mine/` 階層を無くし、人間用は `index.md` 1ファイルにする
* AI の記録は `agents/<ツール名>/<セッションID>/` に md を自由に溜める形式にする

## 対象

* `daily/template/`、`daily/create_daily.sh`、`daily/README.md`
* `job/template/task/list/template.md`
* `README.md`、`CLAUDE.md`、`docs/README.md`
* `.claude/agents/task-transition.md`、`.claude/skills/{reload-project,list-task,list-qa}/SKILL.md`

## 経過

### 旧構成の参照箇所の洗い出し

`grep -rn "mine\|outputs\|agents/"` で、`mine/` `outputs/` `agents/<agent名>/` を
参照している箇所を全ファイルから抽出。README・CLAUDE・daily/README・create_daily.sh・
docs/README・task-transition・reload-project SKILL の7ファイルに分散していた。

### daily/template/ の組み替え

`git mv daily/template/mine/index.md daily/template/index.md` の後、
`daily/template/mine/` と `daily/template/agents/` を削除。
`_.md` は役割を「作業計画」から「調査記録」に変更し、
目的 / 対象 / 経過 / 分かったこと / 未解決 / task への反映 の構成で作り直した。

### セッションIDの取得方法

Claude Code は環境変数 `CLAUDE_CODE_SESSION_ID` にセッションID (UUID) を持つ。
`CLAUDECODE=1` でツールの判定もできるため、`create_session.sh` で両方を自動補完する形にした。

### スクリプト

* `create_daily.sh` — `index.md` + 空の `agents/` を作る形に変更 (旧: template 全体を複製)
* `create_session.sh` — 新規。日報が無ければ `create_daily.sh` を呼び、
  `agents/<ツール名>/<セッションID>/` を作る。冪等。ツール名とセッションIDは
  ディレクトリ名として安全な文字だけを許可する

動作確認: 当日分の作成、2回目実行 (冪等)、`--tool codex sess_01` での明示指定を確認。

## 分かったこと

* 旧 `outputs/` は廃止できる。調査記録の md に直接書き、以後も参照するものだけ `docs/` に移す
  という流れで足りる (`docs/README.md` の記述もそれに合わせた)
* task テンプレートの `## ログ` (フェーズごとの計画と実施内容) は daily 側の `## 経過` と重複する。
  daily = 過程、task = 完結状態という分担にしたため task 側からは削除し、
  代わりに `## 参照先` (日付 / パス / 内容 の表) を置いた
* 空のセッションディレクトリは git が追跡しないが、中に必ず md を置く前提なので
  `.gitkeep` は不要。この例外を `README.md` の「空ディレクトリの扱い」に明記した

## 未解決

なし

## task への反映

該当なし (`job/` に案件が未作成のため、この作業自体の task は作っていない)。
