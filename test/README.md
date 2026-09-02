# test — 手動テストの手順書

Gherkin 記法で書いた手動テストの手順。**現在の仕様に合致しているものだけを置き、
古くなったら `archived/` に逃がす。**

```
test/
├── <領域>/<機能>/     # admin/user-invite/ のように機能ごとに切る
└── archived/          # 仕様が変わって使えなくなったもの (同じ相対パスで置く)
```

手順はタスクより長生きする。タスクが `done` になっても仕様は残り、
次の案件で同じ画面をテストするときにそのまま使える。
だから `job/` の中ではなくここに置く。

**寿命が違う3つを分けるのがこのディレクトリの目的。**

| もの | 寿命 | 置き場 |
| --- | --- | --- |
| 手順 (feature) | 現在の仕様。タスクより長生き | `test/<領域>/<機能>/` |
| タスク | 作業の単位。始まって終わる | `job/<案件名>/task/` |
| 結果 / GIF | その日その版で通した実行時点のスナップショット | `job/<案件名>/task/assets/<タスク名>/<実行日>/` |

**手順をタスクの中に埋めない。** `done` になったタスクの中に沈むと、
次に同じ画面をテストするときに引けなくなる。
逆に**結果と GIF は `test/` の構造にミラーさせない**。仕様の一部ではないので、
feature を `archived/` へ移しても結果は動かさない。

## ディレクトリとファイルの切り方

**`test/<領域>/<機能>/<章番号>-<内容>.feature`。1 ファイル = 1 `Feature:` = 1 章。**

```
test/admin/user-invite/
├── _background.feature             # 前提と共通操作 (実行対象ではない)
├── 00-setup.feature                # Feature: 0. 準備
├── 01-invite-form.feature          # Feature: 1. 招待フォーム
└── 02-permission.feature           # Feature: 2. 権限による表示差
```

* **1 ファイルの中身は最小限にして、章ごとに分ける。** 章単位で「ここだけ再実行する」
  ができ、仕様変更で古くなった章だけを `archived/` に逃がせる
* ファイル名は `<章番号 2 桁>-<内容>.feature`。章番号を持たせると
  `ls` の順序が実行順になり、`@U-2-3` の `2` からファイルが引ける
* **`_` で始まるファイルは実行対象にしない。** 同じディレクトリの全 feature に効く
  `Background:` と共通操作を置く (`daily/` の `_.md` と同じ `_` の使い方)
* その章だけの前提は、そのファイルに `Background:` を書いてよい

## 記法

* `Feature: <番号>. <章題>` — ファイル名の章番号と一致させる
* シナリオには **`@<接頭辞>-<章>-<連番>` タグ**を付ける。接頭辞は領域ごとに1文字
  (`admin/user-invite` なら `U`)
* **各ステップに `(1)` から始まる通し番号**を付ける。
  「U-2-3 の (5) で NG」と指せるようにするため
* 共通操作のステップは `(a)`〜`(f)` のアルファベットで番号を分け、
  各シナリオから「共通操作 (c)〜(f) で招待先を選ぶ」と参照する
* `#` コメントに実装上の根拠を `ファイル:行` で添える
* SQL / curl / JS は `When` `Then` の続き行にインデントして直書きする

```gherkin
Feature: 1. 招待フォーム

  @U-1-1
  Scenario: 権限の無いユーザーには招待ボタンが出ない
    Given (1) psql で users.role を member にする
    When  (2) http://localhost:3000/admin/users を開く
    And   (3) 画面右上のツールバーを見る
    Then  (4) 「招待」ボタンが表示されない
```

### skill 向けのタグ

| タグ | 意味 |
| --- | --- |
| `@manual` | ブラウザから自動化できない。`/run-manual-test` は飛ばし、`/verify-task` に回す |
| `@destructive` | **テスト対象そのもの以外の状態を変える。** 実行前に確認を取る |

`@manual` を付けるのは、論理削除など**押すと戻すのが面倒なボタン**、
外部 IdP 経由のログイン、OS のダイアログを伴う操作。

`@destructive` は「DB を書き換えるか」ではない。**対象の行のステータスを
`Given` で作るのは普通のことなので付けない。** 付けるのは、ログインユーザーの権限、
他の行、論理削除のように**そのシナリオの対象外に影響が及ぶ**とき。
前者の定義にすると `Given` を持つ章がほぼ全部該当してタグの意味が無くなる。
どちらにせよ、その回で流した `UPDATE` は最後に全部戻す
(タグの有無と後片付けは別の話)。

## 背景情報は docs/ 側に置く

feature には**手順だけ**を書く。画面構成図・ステータス値の対応表・データ準備の SQL・
確認できないことは `docs/unofficial/<案件名>/` に置き、
`_background.feature` の先頭コメントからリンクする。

手順と背景を分けるのは、手順が機械に読まれる一方で、背景は人が読むもののため。

## タスクとの紐付け

タスク md の frontmatter `test:` に、この下のパスを書く。

```yaml
test:
  - test/admin/user-invite/                    # ディレクトリなら _ 以外を名前順に全部
  - test/admin/user-list/02-permission.feature
```

**`@ID` とタスクの `## 完了条件` のチェックは 1:1 で対応させる。** 検証はスクリプトで行う。

```sh
./.claude/skills/verify-task/check_scenario_ids.sh job/<案件名>/task/list/<タスク名>.md
```

実行は `/verify-task` (対話で人が確認) か `/run-manual-test` (Chrome で実行して GIF を撮る)。
結果と GIF は `job/<案件名>/task/assets/<タスク名>/<実行日>/` に残り、
タスク md の `## 参照先` からたどれる ([README.md](../README.md) の `job/` の節)。

## 古くなったら archived/ へ

仕様が変わって使えなくなった feature は**消さずに** `archived/` へ `git mv` する。
「当時はこうだった」を後から引けるようにするため。

```sh
mkdir -p test/archived/admin/user-invite
git mv test/admin/user-invite/01-invite-form.feature \
       test/archived/admin/user-invite/
```

**移した feature の先頭コメントに、いつ・なぜ古くなったかを書く。**

```gherkin
# 2026-09-02 に招待フローが SSO 前提に変わったため archived。
# メール招待時代の手順として残す。
```

`archived/` の中は元と同じ相対パスにする (`test/admin/...` → `test/archived/admin/...`)。

## 運用

* 空ディレクトリには `.gitkeep` を置く ([README.md](../README.md) の規約)。
* ファイル名は英小文字とハイフン。
