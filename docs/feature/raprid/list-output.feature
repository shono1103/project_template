Feature: 3. 一覧・詳細・JSON

  @RAP-3-1
  Scenario: 状態で絞り込んだ一覧を表示する
    Given (1) done を含むタスクと unresolved・resolved の QA がある
    When  (2) raprid task list と raprid qa list を実行する
    Then  (3) task は done 以外、QA は unresolved だけが案件ごとの件数付きで表示される
    And   (4) --all で全件、--status todo,done で指定した状態だけが表示される

  @RAP-3-2
  Scenario: 不整合を末尾の要確認にまとめる
    Given (1) 索引のずれた done のタスクと ID が重複したタスクがある
    When  (2) raprid task list を実行する
    Then  (3) 隠れた done の分も含めて「要確認」に対象の ID とパスが表示される
    And   (4) 終了コードは 0 である

  @RAP-3-3
  Scenario: 機械向けに JSON を 1 つだけ出す
    Given (1) タスクと QA がある
    When  (2) task list・task show・qa show・ui snapshot に --json を付けて実行する
    Then  (3) stdout は schemaVersion 1 の JSON 1 つで、revision は index.md の SHA-256 である
    And   (4) 存在しない案件は終了コード 1、--all と --status の併用は終了コード 2 で error を返す

  @RAP-3-4
  Scenario: 端末の幅と種類に合わせて表示する
    Given (1) 日本語と絵文字を含む長いタイトルのタスクがある
    When  (2) 端末で --width 120・79・39 相当と、パイプへの出力を比べる
    Then  (3) 端末では表・2 段・縦配置になり、タイトルは 2 行で省略される
    And   (4) パイプでは省略・折返し・罫線・色がない

  @RAP-3-5
  Scenario: node_modules なしで直接実行する
    Given (1) pnpm install をしていない管理リポジトリがある
    When  (2) node scripts/cli.ts task list を実行する
    Then  (3) 同梱の scripts/vendor/text-width.mjs で幅を計算して表示される
