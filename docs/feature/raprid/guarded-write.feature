Feature: 4. 競合を検出する更新

  @RAP-4-1
  Scenario: 複数行の回答を保存する
    Given (1) 未解決の QA がある
    When  (2) 見出しとコードブロックを含む回答を qa resolve --answer-file - に標準入力で渡す
    Then  (3) qa show --json の answer が入力と同じで、未知の frontmatter と他の節が残る

  @RAP-4-2
  Scenario: 不正な回答を変更前に拒否する
    Given (1) 未解決の QA がある
    When  (2) 空白だけ・1 MiB 超・UTF-8 でない・閉じていないコードブロックの回答を渡す
    Then  (3) 終了コード 2 で INVALID_ANSWER になり、ファイルは変わらない

  @RAP-4-3
  Scenario: revision が変わっていたら更新しない
    Given (1) show --json で revision を控えた後に、別の操作で index.md が変わっている
    When  (2) --if-match に控えた revision を付けて qa resolve か task move を実行する
    Then  (3) 終了コード 1 で REVISION_CONFLICT になり、何も変わらない

  @RAP-4-4
  Scenario: 未解決の QA を待つ pending を解除しない
    Given (1) 別案件を含む未解決の QA を blockedBy に持つ pending のタスクがある
    When  (2) task move で progress にする
    Then  (3) BLOCKED_BY_QA で拒否され、QA を解決した後は明示的に再開できる

  @RAP-4-5
  Scenario: 複数の待ち理由を 1 件ずつ保存する
    Given (1) 待っている QA と other の理由がある
    When  (2) task move <案件名> <ID> pending --blocked-by qa/Q-001 --blocked-by "other: A, B" を実行する
    Then  (3) blockedBy に 2 件のまま保存され、カンマで分けられず、QA の参照が要確認にならない
