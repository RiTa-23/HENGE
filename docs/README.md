# HENGE 実装ドキュメント

MVP実装に必要な情報だけをまとめたもの。設計時の議論・却下した代替案・完成版の仕様は含まない。

## 読む順序

| 文書 | 内容 | いつ読むか |
|---|---|---|
| [01-overview.md](01-overview.md) | 何を作るか、MVPのスコープ | 最初に一度 |
| [02-architecture.md](02-architecture.md) | 2 Worker構成、認証の置き場所、技術スタック | 最初に一度 |
| [03-data-model.md](03-data-model.md) | D1スキーマ、KVキー | Phase 2 |
| [04-api.md](04-api.md) | エンドポイント定義、エラーコード | Phase 4以降 |
| [05-generation.md](05-generation.md) | お題生成パイプライン、バリデーション | Phase 3 |
| [06-typing-engine.md](06-typing-engine.md) | ローマ字入力エンジン、IME対策 | Phase 6 |
| [07-ui.md](07-ui.md) | 配色・書体・忍者モチーフ、画面一覧 | Phase 6 |
| [08-roadmap.md](08-roadmap.md) | Phase 0〜8 | 進行中は常に |

## この文書群の編集方針

- **MVPで実装しないことは書かない。** 課金・対戦・ブラウザLLM・マイページ等は対象外
- **判断の経緯は書かない。** 「Aを検討したがBにした」ではなく「Bにする」とだけ書く
- **例外: それを知らないと壊す理由は残す。** 例えば「生成は最大2ラウンド」という制約はWorkersのサブリクエスト上限に由来するため、理由を消すと後で誰かが安全に見える変更で壊す
