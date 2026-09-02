---
name: list-task
description: job/ 配下のタスクを状態別 (progress / pending / todo / done) に一覧表示する。案件名を指定するとその案件だけに絞り込む。「タスク一覧」「今なにが進行中か」「残っているタスク」「何を待っているか」「<案件名> のタスク」のように、タスクの状況を知りたいときに使う。参照のみで状態は変更しない。
---

# list-task

`job/<案件名>/task/` のタスクを状態別に一覧表示する。**参照のみ。状態は変更しない**
(遷移させたい場合は task-transition エージェントを使う)。

タスクの実体は `task/list/<タスク名>.md` にあり、`todo/` `pending/` `progress/` `done/` には
`../list/<タスク名>.md` を指す相対シンボリックリンクが置かれている。
**状態はリンクがどのディレクトリにあるかで決まる**ので、ファイルの中身では判断しない。

`pending` だけは例外で、**「何を待っているか」は中身の frontmatter `blockedBy` にしか無い。**
リンクの位置は「待っている」ことしか表せないため、そこは読む。

## 引数

* **案件名** — 指定された場合はその案件だけを対象にする。省略時は全案件。
  部分一致で探し、複数該当したら候補を挙げて確認する。
* **`done` / `完了` の指定** — 指定された場合は `done` も全件表示する。
  省略時、`done` は件数のみ (履歴なので既定では畳む)。

## 手順

### 1. 対象の案件を決める

```sh
find job -mindepth 1 -maxdepth 1 -type d -not -name template | sort
```

案件が1つも無い場合は「案件なし」と報告して終える。

### 2. 状態別にタスクを集める

案件ごとに以下を実行する。

```sh
J="job/<案件名>/task"
for s in progress pending todo done; do
  find "$J/$s" -mindepth 1 -maxdepth 1 -not -name '.gitkeep' -exec basename {} .md \; | sort
done
```

表示順は **progress → pending → todo → done** とする。
今動いているものを先頭に置き、**`pending` を `todo` より上に出す**
(待ちが解けていないかの確認は、着手可能なものを選ぶより先にやる価値がある)。

`assets/` はタスクではなく実行結果の置き場なので、状態ディレクトリとして扱わない。

### 3. タイトルと待ち先を取得する

タスク名だけでは内容が分からないため、実体から「## タイトル」の行を読む。

```sh
awk '/^## タイトル/{f=1;next} f&&NF{print;exit}' "job/<案件名>/task/list/<タスク名>.md"
```

空の場合はタイトル欄を空のままにする (推測で埋めない)。
長い場合は40文字程度で切り詰める。

`pending` のタスクは `blockedBy` も読み、**待っている相手をタイトルに添えて出す。**

```sh
awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit}
     f && /^blockedBy:/{b=1;next}
     f && b && /^  *- /{sub(/^  *- /,"");print;next}
     f && b{exit}' \
  "job/<案件名>/task/list/<タスク名>.md"
```

待ち先が1行ずつ出る。**`sub` した後の行を次のルールに掛けないよう `next` を置き、
`b` で範囲を閉じている** (外すと後続キーの項目まで待ち先として拾う)。

タスクの「参照先」(調査記録のパス) と「結果」は一覧には出さない。必要なら実体を読む。

### 4. 整合性を確認する

以下に該当するものがあれば、一覧の後に「要確認」としてまとめて報告する。

ファイルの列挙は `*.md` のグロブではなく `find` で行う。
**該当が 0 件のディレクトリでグロブが展開されずに落ちるシェルがある**ため
(`todo/` が空なのは普通の状態なので、そこで止まると整合性チェックが機能しない)。

```sh
J="job/<案件名>/task"

# (a) リンク切れ / シンボリックリンクでないもの
for s in todo pending progress done; do
  find "$J/$s" -maxdepth 1 -name '*.md' | while read -r l; do
    if [ ! -L "$l" ]; then echo "実体が直接置かれている: $l"
    elif [ ! -e "$l" ]; then echo "リンク切れ: $l -> $(readlink "$l")"
    fi
  done
done

# (b) list にあるが、どの状態ディレクトリにもリンクが無いもの (未登録)
find "$J/list" -maxdepth 1 -name '*.md' ! -name 'template.md' | while read -r f; do
  n="$(basename "$f")"
  found=""
  for s in todo pending progress done; do
    if [ -L "$J/$s/$n" ]; then found=1; fi
  done
  if [ -z "$found" ]; then echo "未登録 (状態ディレクトリにリンクが無い): $f"; fi
done

# (c) pending なのに blockedBy が空 / pending 以外なのに blockedBy が残っている
for s in todo pending progress done; do
  find "$J/$s" -maxdepth 1 -name '*.md' | while read -r l; do
    n="$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit}
              f && /^blockedBy:/{b=1;next}
              f && b && /^  *- /{c++;next}
              f && b{exit} END{print c+0}' "$l")"
    if [ "$s" = pending ] && [ "$n" -eq 0 ]; then echo "pending だが blockedBy が空: $l"
    elif [ "$s" != pending ] && [ "$n" -gt 0 ]; then echo "$s だが blockedBy が残っている: $l"
    fi
  done
done
```

`find` は `-maxdepth 1` でシンボリックリンク自体を返すので、(a) の判定は
`-L` と `-e` の組み合わせで行える (リンク切れは `find` には出るが `-e` が偽になる)。

**(c) は放置すると効かなくなる。** 待ち先の無い `pending` は待ちが解けたか判定できず、
`progress` に残った `blockedBy` は「まだ待っている」と誤読される。

### 5. 出力する

下のフォーマットで報告する。整合性の問題が無ければ「要確認」の節は出さない。

## 出力フォーマット

```
acme-site (job/acme-site/)
  progress (1)
    api-setup          API連携の実装
  pending (1)
    oauth-scope        OAuth スコープの確定       ← qa/oauth-scope
  todo (2)
    db-migration       DBスキーマの移行
    deploy             本番デプロイ手順の整備
  done: 3 件

internal-tool (job/internal-tool/)
  progress: なし
  pending : なし
  todo (1)
    spec-review        仕様レビュー
  done: 0 件

合計: progress 1 / pending 1 / todo 3 / done 3
```

`done` も表示する指定があった場合は、件数の代わりに他の状態と同じ形式で並べる。

要確認があるときは末尾に付ける。

```
要確認:
  リンク切れ: job/acme-site/task/todo/old-task.md -> ../list/old-task.md
  未登録: job/acme-site/task/list/draft.md
  pending だが blockedBy が空: job/acme-site/task/pending/oauth-scope.md
```
