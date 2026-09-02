---
name: run-manual-test
description: test/ 配下の Gherkin 手順書を Claude in Chrome で実行し、シナリオごとに GIF を撮って結果を残す。「手動テストを実行して」「GIF を撮って」「ブラウザで確認して録画して」「<タスク名> のテストを回して証跡を残して」のように、Claude 自身がブラウザを操作して実機確認するときに使う。人が実機を見て結果を選ぶ対話形式は verify-task の担当。手順書そのものを書く・直すことはしない。
---

# run-manual-test

`test/` 配下の手順書を読み、**Claude in Chrome で操作しながらシナリオごとに GIF を撮る。**
証跡が残るので、後から「何が起きたか」を人が見返せる。

手順の実体は `test/<領域>/<機能>/<章>.feature`、タスクとの対応はタスク md の
frontmatter `test:`、GIF と結果は `job/<案件名>/task/assets/<タスク名>/<実行日>/`。
記法は [test/README.md](../../../test/README.md) に従う。

**シナリオ 1 つ = GIF 1 本。** まとめて 1 本にすると、どのシナリオの証跡なのかが
分からなくなり、NG の再現にも使えない。

## 引数

* **タスク名** — 対象のタスク。省略時は `progress` のタスクから選ばせる。
* **シナリオ ID / 章** — `U-1-1` や `U-1` のように指定された場合はそれだけを回す。
  省略時は `@manual` 以外の全シナリオ。

## 手順

### 1. 対象を決める

タスクの実体から `test:` を読み、feature をファイル名順に展開する
(`_` で始まるものは実行対象ではない)。

```sh
sed -n '/^---$/,/^---$/p' job/<案件名>/task/list/<タスク名>.md
ls test/<領域>/<機能>/
```

**`@manual` のシナリオは実行対象から外し、一覧として報告する。**
飛ばしたことを黙っていると「全部通った」と誤解される。
これらは `/verify-task` で人が実施する。

### 2. 前提を揃える

`_background.feature` の `Background:` を確認する。ブランチ・コンテナの起動を
コマンドで確かめ、**ログイン状態だけは人に確認する** (認証は Claude が触らない)。

```sh
git -C repos/<リポジトリ名>/.worktrees/<ブランチ>/ rev-parse --short HEAD
git -C repos/<リポジトリ名>/.worktrees/<ブランチ>/ rev-parse --abbrev-ref HEAD
```

動作確認は `repos/<リポジトリ名>/.worktrees/` の worktree で行う
(`repo/` は参照用なので checkout を切り替えない)。
**どの worktree のどのコミットで見たかを結果に書く。**

起動やコンテナの操作は案件ごとに違うので、**`repos/<リポジトリ名>/README.md` に
書かれた手順に従う。** ここでコマンドを決め打ちしない。

```sh
cat repos/<リポジトリ名>/README.md
```

### 3. 押す操作の許可をまとめて取る

**このスキルの要。** 対象のシナリオを読み、**不可逆な操作を含むものを一覧にして
先に許可を取る。** 該当するのは「送信」「確定」「保存」「公開」「招待」のような、
押すと戻せない、または外部に出るボタン。

```
以下を押します。よろしいですか。

  U-3-1  「招待メールを送信」ボタン (対象ユーザーに実際にメールが飛ぶ)
  U-7-1  「保存」ボタン (表示名を書き換える)
```

* **許可が出た操作だけを押す。** 途中で追加のボタンが必要になったら、そこで聞き直す
* **論理削除・物理削除に当たるボタンは、許可が出ても押さない。** 人に渡す
  (`@manual` が付いているはず)
* **外部に出るもの (メール・通知・API 連携) は、モックか検証環境であることを
  確かめてから押す。** 本番の宛先に飛ぶと取り返せない
* 許可はこのセッションのその回だけのもの。次回に持ち越さない

### 4. ステップを振り分ける

feature のステップは、中身を見て実行手段を決める。

| ステップの中身 | 実行手段 |
| --- | --- |
| `SELECT` / `UPDATE` / `DELETE` を含む | Bash で DB クライアント |
| `curl` を含む | Bash |
| URL・「開く」「押す」「見る」「スクロール」「入力」 | `mcp__claude-in-chrome__*` |
| HTTP のステータスコード (`200 が返る` など) | `read_network_requests` |

DB への接続方法は案件ごとに違う。**`_background.feature` のコメントか
`repos/<リポジトリ名>/README.md` に書かれたコマンドを使い、推測で組み立てない。**

**どちらとも判別できないステップは人に聞く。** 推測で片方に寄せると、
確認したつもりで別のことを確認してしまう。

### 5. GIF を撮る

タブは会話ごとに新しく作り、**ウィンドウサイズを揃える**
(GIF を並べて比較できるようにするため。フッターが見切れないよう縦は 900 以上)。

```
tabs_context_mcp { createIfEmpty: true } → tabs_create_mcp
resize_window { width: 1440, height: 900 }
```

シナリオごとに次を回す。

```
1. Given の SQL を Bash で流す
2. 画面を開く / リロードする
   ← SQL で値を変えたら必ずリロードする (画面が古い値を握っていると弾かれる)
3. gif_creator { action: "start_recording" }
4. computer { action: "screenshot" }          ← 最初のフレーム
5. When のステップを実行する
6. computer { action: "screenshot" }          ← 最後のフレーム
7. gif_creator { action: "stop_recording" }
8. gif_creator { action: "export", filename: "<ID>-<内容>.gif", download: true }
9. mv でファイルを assets に移す
```

* **3 の直後と 7 の直前にスクリーンショットを撮る。** 前後のフレームが無いと
  再生が一瞬で終わって何も分からない
* ファイル名は `<ID>-<内容>.gif` (`U-1-1-invite-button-hidden.gif`)。
  ID を先頭に置くと `ls` がシナリオ順に並ぶ
* 依存の無い操作は `browser_batch` にまとめてよい。ただし
  **押す操作を含むバッチは作らない** (途中で止められなくなる)

`export` はブラウザのダウンロードとして落ちるので、**必ず assets へ移す。**
落ち先は実行時に確認する。

```sh
ls -t ~/Downloads | head -3
D="job/<案件名>/task/assets/<タスク名>/$(date +%F)"
mkdir -p "$D"
mv ~/Downloads/<ID>-<内容>.gif "$D/"
```

### 6. Then を検証する

| `Then` の中身 | 見るもの |
| --- | --- |
| 画面の表示 | `computer` の screenshot / `zoom`、`find` |
| ボタンの活性・非活性 | `read_page { filter: "interactive" }` |
| DB の値 | Bash で DB クライアント |
| HTTP のステータス | `read_network_requests` |
| エラーの発生 | `read_console_messages { onlyErrors: true }` |

**判定できなかったものは「確認不能」にする。OK にしない。**
スクリーンショットで読み取れない、モックが値を返さない、といった理由は
そのまま結果に書く (それ自体が次回の役に立つ)。

### 7. 後片付けをする

その回で流した `UPDATE` を戻す。後片付けのシナリオが手順書にあればそれを使い、
無ければ `Given` から機械的に組み立てる。

**復元先は「手順書に書かれた初期値」ではなく、実行前の実際の値。**
`Given` を流す前に現在値を控えておく。

**戻したことを DB に問い合わせて確認してから報告する。** 戻したつもりで残っていると、
次のテストの前提が崩れる。

作ったタブは閉じる (`tabs_close_mcp`)。人に見せたいものが残っている場合だけ開けておく。

### 8. 結果を書く

`assets/<タスク名>/<実行日>/result.md` を作り、タスク md を直す。
同じ日に2回目を回す場合は `<実行日>-2/` のように連番を足す (上書きしない)。

| 判定 | 完了条件 | result.md |
| --- | --- | --- |
| `Then` がすべて満たされた | `[x]` | OK |
| 満たされなかった | `[ ]` のまま | **NG** + 何が起きたか |
| 判定できなかった / `@manual` で飛ばした | `[-]` | 確認不能 + 理由 |

タスク md に書くのは次の3つだけ。

* `## 完了条件` のチェックを書き換え、**GIF へのリンクを添える**
* `## 参照先` の表に `../assets/<タスク名>/<実行日>/result.md` を日付つきで足す
* `## 結果` に結論を書く

**実行の過程はタスク md に書かない。** 何をどの順で試したかは
`daily/<YYYY-MM>/<DD>/agents/<ツール名>/<セッションID>/` に置き、
タスクからは `## 参照先` でたどれる状態にする (このリポジトリの原則)。

```sh
S="$(./daily/create_session.sh)"
cp daily/template/_.md "$S/<タスク名>-manual-test.md"
```

最後に 1:1 対応を検証する。

```sh
./.claude/skills/verify-task/check_scenario_ids.sh job/<案件名>/task/list/<タスク名>.md
```

**踏んだ罠は `job/<案件名>/STORAGE.md` に追記する。** 「この画面は SQL の後に
リロードしないと弾かれる」のような知見は、次の実行でも同じ時間を溶かす。

**GIF はコミットするがサイズを見る。** 1 本が数 MB を超えるなら、
録画範囲を `When` の前後だけに絞り直す (リポジトリに残り続けるため)。
**push はしない** (要求されたときだけ行う)。

## 中断する条件

以下に当たったら、その場で止めて状況を報告する。**同じ操作を繰り返さない。**

* 同じ操作が 2〜3 回失敗する / 拡張が応答しない / 画面が読み取れない
* 許可を取っていない操作を押す必要が出た
* `alert` / `confirm` を出しそうな操作に行き当たった
  (**押さない。** 出すと拡張が応答不能になり、人が手で閉じるまで復帰しない)
* 手順書の記述と画面が食い違っていて、どちらが正しいか判断できない
  (**手順書が古い可能性があるので、勝手に読み替えない**)
* 外部に出る操作の宛先が本番かモックか判別できない
* 後片付けで元に戻せないものが出た

## 出力フォーマット

```
job/acme-site/task/assets/user-invite-test/2026-09-03/
├── result.md
├── U-1-1-invite-button-hidden.gif
├── U-1-2-invite-button-only.gif
└── U-3-1-invite-toast.gif

job/acme-site/task/list/user-invite-test.md
  完了条件: [x] 3 / [-] 1 を更新 (GIF へのリンクを添付)
  参照先: 2026-09-03 の実行結果を追記
  結果: 章 1 は通過。U-1-4 のみ確認不能

記録: daily/2026-09/03/agents/claude-code/<セッションID>/user-invite-test-manual-test.md
STORAGE.md: 「SQL の後はリロードが必要」を踏んだ罠に追記

check_scenario_ids.sh: 1:1 で対応している
環境の復元: users id=12 を実行前の値に復元 (DB で確認済み)

飛ばしたシナリオ: U-6-2 (@manual / 「無効」で論理削除が走る)
  → /verify-task で人が実施してください
```

`result.md` は verify-task と同じ書式で、GIF の列を足す。

```markdown
# 実行結果 2026-09-03

対象: [test/admin/user-invite/](../../../../../../test/admin/user-invite/)
実行: /run-manual-test (Claude in Chrome / 1440x900)
環境: api `.worktrees/feature-invite` (768d9fa7) / web `.worktrees/feature-invite` (24a9bc465)
範囲: U-1-1 〜 U-1-4 (章 1)

| ID | 結果 | GIF | 備考 |
| --- | --- | --- | --- |
| U-1-1 | OK | [gif](U-1-1-invite-button-hidden.gif) | |
| U-1-4 | 確認不能 | — | 1440x900 でもツールバー右端が見切れる |

## 環境の復元

| 対象 | 変更内容 | 復元 |
| --- | --- | --- |
| `users` id=12 | `role` member → admin | **実行前の値に復元** (DB で確認) |
```
