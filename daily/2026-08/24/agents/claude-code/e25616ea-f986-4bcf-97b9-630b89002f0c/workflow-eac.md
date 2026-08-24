# 調査

## 目的

`repos/` に Allium / Superpowers / likeC4 を前提とした
デフォルト開発ワークフローを EaC で定義する。

* ブランチ運用ルール (`standard.json`) と紐づける
* ユーザーが挙げた工程のうち「同じループとして定義できる場所」を1つに集約する
* 漏れている工程を洗い出す

## 対象

* `repos/common/workflow/development-workflow.allium` (新規)、`repos/common/workflow/README.md` (新規)
* `repos/common/standard.json`、`repos/template/workflow.allium` (新規リンク)
* `repos/add_submodule.sh`、`repos/README.md`、`repos/template/README.md`
* ルート `README.md`、`CLAUDE.md`

## 経過

### ツールの実在確認

| ツール | 状態 |
| --- | --- |
| Allium | プラグイン導入済み (juxt-plugins/allium 3.13.0)、CLI は `/opt/homebrew/bin/allium` |
| likeC4 | CLI 導入済み (`~/.nvm/.../bin/likec4`) |
| Superpowers | **未導入** (`~/.claude/plugins/installed_plugins.json` に無い) |

Superpowers が無いため、spec 上は担い手 (`Operator`) の振る舞いとして抽象化し、
どのスキルをどの工程に割り当てるかは `open question` に残した。

### 形式の選択

Allium は「エンティティ + 状態遷移 + ルール (when / requires / ensures)」を書く言語で、
`allium analyse` がデータフロー・到達可能性・競合を検査する。
ワークフローは状態機械なので、この形式が最も適合する。likeC4 は C4 モデル (構成) 用なので、
工程図は README の mermaid で表現した。

### 収束ループの集約

ユーザーの工程案のうち、動作確認・CI・コミットレビュー・ブランチレビュー・
リポジトリレビューは、いずれも「検査 → 差分の解消 → 再検査」という同じ構造だった。
仕様の整合 (allium check / weed) も同じ。これを `ConvergenceCycle` 1つにまとめ、
`scope` (specification / behaviour / integration / commit / branch / repository) で
切り替える形にした。

これにより以下が全スコープに一律で効くようになった。

* 差分を解消したら必ず再検査する (`ResolutionTriggersReinspection`)
* 規定周回数で収束しなければ QA に起票する (`UnconvergedCycleEscalates`)
* blocker / defect は必ず閉じ、improvement / note は task 起票して先に進める

`repository` スコープだけは差分の閉じ方が違う (修正コミットではなくドキュメント化) ため、
`RepositoryFindingsAreDocumented` で区別した。

### 検証

| コマンド | 結果 |
| --- | --- |
| `allium check` | error 0 / warning 3 / info 5 |
| `allium analyse` | findings 0 (データフロー・到達性・競合に問題なし) |
| `allium plan` | テスト義務 124 件を導出 |

warning 3件はすべて `externalEntity.missingSourceHint` で、
`BranchRule` (JSON が正) `Worktree` (git が正) `Operator` (人間/AI) が
このワークフローの外で管理されていることを示すもの。意図どおりなので残した。

初期版では Finding の `resolved` / `deferred` に到達するルールが無く、
外部刺激 (`InspectionFoundDifference` / `FindingDeferred`) の提供元も未定義だった。
`surface WorkflowConsole` で担い手との境界を定義し、トリガーの提供元を明示して解消した。

### スクリプトへの反映

`add_submodule.sh` が `workflow.allium` も複製・ステージするようにし、隔離環境で
submodule 追加 → worktree 3件作成 → リンク解決 → 複製先での `allium check` を確認した。

## 分かったこと

* Allium の `transitions` ブロックで工程の遷移 (差し戻しを含む) をそのまま書ける。
  差し戻し経路を書き忘れると `status.noExit` / `unreachableValue` の警告で気づける
* `allium analyse` の findings が「どのルールも emit しないトリガー」を検出するため、
  外部刺激の提供元 (surface) を書かないと閉じない。ワークフローの担い手を
  明示させる圧力として機能する
* 元の工程案には 調査 / QA へのエスカレーション / PR 作成 / 後片付け /
  コミット単体のビルド検証 / spec-実装の乖離検出 (weed) が抜けていた

## 未解決

* Superpowers 導入後のスキル割り当て (spec の `open question` に記載)
* パフォーマンス検証と観測性の追加を必須工程にするか、リポジトリごとの任意にするか

## task への反映

該当なし (`job/` に案件が未作成のため、この作業自体の task は作っていない)。
