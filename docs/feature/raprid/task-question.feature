Feature: 1. タスクから人への質問

  @RAP-1-1
  Scenario: AIが質問するとQAとpendingタスクが一体で作られる
    Given (1) agentが実行中のタスクを用意する
    When  (2) requestedByとcreatedByを指定してraprid task askを実行する
    Then  (3) unresolvedのQAに質問者と記録者が保存される
    And   (4) 元タスクがpendingになりblockedByからQAの固定IDを参照する

  @RAP-1-2
  Scenario: 人が回答した後にタスクを明示的に再開する
    Given (1) QAを待ってpendingになっているタスクを用意する
    When  (2) answeredByを指定してraprid qa resolveを実行する
    Then  (3) QAに回答者が保存され再開待ちのタスクが表示される
    And   (4) タスクをprogressへ移すまで解決済みQA待ちの不整合が報告される

  @RAP-1-3
  Scenario: actorを指定せずに新規記録を作れない
    Given (1) RAPRID_ACTORが設定されていない
    When  (2) actorオプションなしでtask addまたはqa addを実行する
    Then  (3) 引数誤りで終了し記録を作らない
