---
name: list-qa
description: qa/ 配下の Q&A を状態別 (unresolved / resolved) に一覧表示する。「QA一覧」「未解決の質問」「まだ回答が出ていないもの」「解決済みのQA」のように、質問と回答の状況を知りたいときに使う。参照のみで状態は変更しない。
---

# list-qa

`qa/` の Q&A を状態別に一覧表示する。**参照のみ。状態は変更しない。**

QA の実体は `qa/list/<名前>.md` にあり、`unresolved/` `resolved/` には
`../list/<名前>.md` を指す相対シンボリックリンクが置かれている。
**未解決かどうかはリンクがどのディレクトリにあるかで決まる**ので、
「## 回答内容」が空かどうかでは判断しない。

## 引数

* **`resolved` / `解決済み` の指定** — 指定された場合は `resolved` も全件表示する。
  省略時、`resolved` は件数のみ。
* **キーワード** — 指定された場合は、質問内容またはファイル名に含むものだけに絞り込む。

## 手順

### 1. 状態別に集める

```sh
for s in unresolved resolved; do
  find "qa/$s" -mindepth 1 -maxdepth 1 -not -name '.gitkeep' -exec basename {} .md \; | sort
done
```

表示順は **unresolved → resolved** とする。

### 2. 質問内容を取得する

ファイル名だけでは分からないため、実体から「## 質問内容」の先頭行を読む。

```sh
awk '/^## 質問内容/{f=1;next} f&&NF{print;exit}' "qa/list/<名前>.md"
```

空の場合は空のままにする (推測で埋めない)。長い場合は50文字程度で切り詰める。

`resolved` のものを表示するときは「## 回答内容」の先頭行も同様に読み、
質問と回答を1行ずつ並べる。

### 3. 整合性を確認する

以下に該当するものがあれば、一覧の後に「要確認」としてまとめて報告する。

```sh
# (a) リンク切れ / シンボリックリンクでないもの
for s in unresolved resolved; do
  for l in "qa/$s"/*.md; do
    [ -e "$l" ] || [ -L "$l" ] || continue
    if [ ! -L "$l" ]; then echo "実体が直接置かれている: $l"
    elif [ ! -e "$l" ]; then echo "リンク切れ: $l -> $(readlink "$l")"
    fi
  done
done

# (b) list にあるが、どちらの状態ディレクトリにもリンクが無いもの (未登録)
for f in qa/list/*.md; do
  n="$(basename "$f")"
  [ "$n" = "template.md" ] && continue
  found=""
  for s in unresolved resolved; do
    if [ -L "qa/$s/$n" ]; then found=1; fi
  done
  if [ -z "$found" ]; then echo "未登録 (状態ディレクトリにリンクが無い): $f"; fi
done

# (c) unresolved と resolved の両方にあるもの
comm -12 \
  <(find qa/unresolved -mindepth 1 -not -name '.gitkeep' -exec basename {} \; | sort) \
  <(find qa/resolved   -mindepth 1 -not -name '.gitkeep' -exec basename {} \; | sort)
```

### 4. 出力する

下のフォーマットで報告する。整合性の問題が無ければ「要確認」の節は出さない。

## 出力フォーマット

```
unresolved (2)
  submodule-permission   submoduleの権限は誰が決めるか
  daily-format           調査記録に何を書くか

resolved: 5 件

合計: unresolved 2 / resolved 5
```

`resolved` も表示する指定があった場合は、質問と回答を並べる。

```
resolved (5)
  naming-rule            Q: ディレクトリ名は日英どちらに揃えるか
                         A: 状態ディレクトリは英語に揃える
```

要確認があるときは末尾に付ける。

```
要確認:
  未登録: qa/list/draft.md
  重複 (unresolved と resolved の両方にある): api-spec.md
```
