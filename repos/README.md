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

