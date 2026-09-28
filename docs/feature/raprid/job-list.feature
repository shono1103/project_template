Feature: 2. 案件一覧

  @RAP-2-1
  Scenario: 案件を名前順に一覧表示する
    Given (1) jobs配下に複数の案件がある
    When  (2) raprid job listを実行する
    Then  (3) 案件名が名前順に表示され合計件数が表示される

  @RAP-2-2
  Scenario: 案件がなくても空の一覧を表示する
    Given (1) jobs配下に案件がない
    When  (2) raprid job listを実行する
    Then  (3) 終了コード0で合計0件が表示される

  @RAP-2-3
  Scenario: job listの余分な引数を拒否する
    Given (1) 管理リポジトリがある
    When  (2) raprid job listに余分な引数を付けて実行する
    Then  (3) 終了コード2で使い方が表示される
