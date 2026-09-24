# logs — agent のセッション記録

agent が行った作業を、日付・agent 名・セッション ID ごとに記録する。
日報や人間用の `mine/` は作らない。

```text
logs/
├── create_log.ts
├── template/                  # 新規セッションの複製元
└── <year>/<month>/<day>/<agent_name>/<session_id>/
    ├── index.md               # セッション全体の目的・作業・結果・次回
    ├── _.md                   # 個別の作業記録の複製元
    └── outputs/               # そのセッション中の一時成果物
```

```sh
pnpm log:create codex
pnpm log:create codex 2026-09-24 550e8400-e29b-41d4-a716-446655440000
```

日付を省略すると実行環境のローカル日付、セッション ID を省略すると UUID を使う。
作成されたパスを控え、同じセッションではそのディレクトリを使い続ける。
同じ引数で再実行した場合は既存ファイルを変更しない。

agent 名は Codex なら `codex`、Claude Code なら `claude`、役割別 agent ならその定義名を使う。
`template/` は複製元なので、通常の記録は `<session_id>/` の下に書く。
継続的に参照する資料は `docs/`、タスクの結論の根拠は `job/<案件名>/assets/` に置く。
