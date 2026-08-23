# repos


## アクセス権限

このディレクトリのsubmoduleへのアクセス権限。

### role

* project_group: プロジェクト管理リポジトリからのclaude起動時role
* submodule: submodule内でのclaude起動時role

### アクセス権限テーブル

| submodule_dir | project_group | submodule|
| --- | --- | --- |
| <例> | rwx | rwx |
| | |

## submodule追加
以下のスクリプトを以下の使用にしたがって実行することで

* submoduleの追加
* アクセス権限テーブルへの追加

が完了する。

``` sh
./add_submodule.sh <リモートリポジトリのssh経由URL> --dir_name <ディレクトリ名>　77
```
77はproject_group　submoduleの順番
4=r
2=w
1=x
で
7=rwx
とする。

## ブランチ運用ルール (branch_policy/)

submodule ごとのブランチ運用ルールを JSON で定義する。

```
repos/branch_policy/
├── common/
│   └── standard.json      # 標準ポリシーの実体
└── <repo名>.json           # 個別ポリシー (実体 または common/*.json へのシンボリックリンク)
```

* 標準ルールをそのまま使う repo → `<repo名>.json` は `common/standard.json` への相対シンボリックリンク
  ```sh
  ln -s common/standard.json repos/branch_policy/<repo名>.json
  ```
* 独自ルールが必要な repo → `<repo名>.json` は実体ファイル (`common/standard.json` をコピーして編集する)
* ルールが不要な repo → `<repo名>.json` を置かない (branch_policy による管理対象外)

### JSON の構成

`branch_types` の配列で、ブランチ種別ごとに以下を定義する。

| フィールド | 意味 |
| --- | --- |
| `type` | ブランチ種別名 |
| `pattern` | ブランチ名のパターン |
| `branches_from` | 分岐元のパターン配列。`"any"` はどのブランチからでも分岐しうることを表す |
| `merge_target` | マージ先。`"origin"` は分岐元と同じブランチへマージすることを表す。`null` は未定義 |
| `sync_from` | (release/staging) 定期的に取り込みマージする対象 |
| `temporary` | 期間限定ブランチかどうか |
| `default_branch` | デフォルトブランチかどうか (main のみ) |
| `protection` | (main のみ) 保護設定 |
| `naming_rule` | (release/staging) 命名規則の補足 |
| `description` | 運用ルールの説明文 |

`common/standard.json` の内容を実際に GitHub 側 (Repository Rulesets 等) へ適用する仕組みは未整備。
現時点ではこの JSON は運用ルールの正とし、適用は手動で行う。

