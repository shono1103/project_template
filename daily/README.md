# daily — 日報・作業ログ

日付ごとの記録。`daily/<YYYY-MM>/<DD>/` に月・日の2階層で切り、その下を
**自分用 (`mine/`) と AI agent 用 (`agents/<agent名>/`)** に分ける。

## ディレクトリ構成

```
daily/
├── README.md
├── create_daily.sh              # 当日分を作成する
├── template/                    # 複製元 (直接編集しない)
│   ├── mine/
│   │   ├── index.md
│   │   ├── _.md
│   │   └── outputs/
│   └── agents/
│       └── template/            # agent 1体分の複製元
│           ├── index.md
│           ├── _.md
│           └── outputs/
└── <YYYY-MM>/<DD>/              # 例: 2026-08/10/
    ├── mine/                    # 自分の記録
    │   ├── index.md
    │   ├── _.md
    │   └── outputs/
    └── agents/
        ├── template/
        └── <agent名>/           # agent ごとに1ディレクトリ
            ├── index.md
            ├── _.md
            └── outputs/
```

## mine/ と agents/ の分け方

| ディレクトリ | 書く主体 | 置くもの |
| --- | --- | --- |
| `mine/` | 自分 | 自分の目標・計画・作業ログ・成果物 |
| `agents/<agent名>/` | その agent | agent に渡した計画と、agent が出した作業ログ・成果物 |

自分の記録と agent の記録を混ぜないための分割なので、
**1 agent = 1 ディレクトリ**とし、そこに書くのはその agent の作業だけにする。

ディレクトリ名は agent 名に合わせる (`.claude/agents/` に定義があるものはその名前、
`task-transition` など)。同じ agent を1日に複数回動かした場合もディレクトリは増やさず、
その中で `_.md` を複製して作業ごとに計画を分ける。

## ファイルの役割

`mine/` と `agents/<agent名>/` は中身の構成が同じ。

| パス | 用途 |
| --- | --- |
| `index.md` | その単位での1日のまとめ。目標 / 計画 / 結果 / 明日 |
| `_.md` | 個別の作業計画テンプレート。複製して使う |
| `outputs/` | 成果物 (生成物・調査結果など) |

`index.md` が1日1ファイル、`_.md` の複製が作業1件につき1ファイル。

## 手順

### 当日分を作成する

```sh
./daily/create_daily.sh              # 当日分
./daily/create_daily.sh 2026-08-10   # 日付を指定
```

`daily/template/` の内容を複製する。すでに存在する場合は何も変更しない。

### agent のディレクトリを追加する

その日の `agents/template/` を agent 名で複製する。

```sh
cp -R daily/2026-08/10/agents/template daily/2026-08/10/agents/task-transition
```

### 個別の作業計画を作る

該当ディレクトリの `_.md` を複製する。ファイル名は作業内容が分かる英小文字とハイフン。

```sh
cp daily/2026-08/10/mine/_.md daily/2026-08/10/mine/add-submodule.md
cp daily/2026-08/10/agents/task-transition/_.md \
   daily/2026-08/10/agents/task-transition/api-setup.md
```

## docs/ との使い分け

`daily/` は時系列の記録、`docs/` は継続的に参照するドキュメント。
調査結果はまず `outputs/` に出し、以後も参照するものだけ `docs/` に移す。
詳細は [docs/README.md](../docs/README.md) を参照。

## 運用

* `template/` は複製元なので直接編集しない。テンプレート自体のルールを変えるときだけ編集する。
* 空ディレクトリには `.gitkeep` を置く ([README.md](../README.md) の規約)。
