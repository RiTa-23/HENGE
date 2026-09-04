# 実装フェーズ

## Phase 0: 基盤構築

**最優先: Next.js + OpenNext + Bun の疎通確認（Hello World）を最初に行う。**

既知の不具合（Next.js 15.4.1のinstrumentation hookエラー、OpenNextビルド時のBunパッケージマネージャー検出問題）が現行バージョンで再現するか実地検証する。再現した場合は、OpenNextの互換表を見てNext.jsのバージョンを固定するか、OpenNextのビルドステップだけnpm/pnpmに切り替える。**ここで詰まると後続が全部止まるため、機能実装より先に潰す。**

- Bunワークスペースでモノレポ作成（`apps/frontend` / `apps/backend` / `packages/shared`）
- `wrangler.jsonc` を2本用意
- D1 / KV / Workers AI のバインディング作成
- Service Bindings疎通確認（Hello World往復）

## Phase 1: CI/CD・ドキュメント基盤

- GitHub Actions + `cloudflare/wrangler-action`
  - PR時: oxlint / oxfmt / tsc / テスト
  - mainマージ時: 両Workerを`wrangler deploy`
  - **D1マイグレーションは自動適用しない**（サイレント失敗の報告があるため、レビューを挟む手動トリガーの別ワークフローにする）
- `CLAUDE.md` の整備

## Phase 2: データ層

- Drizzleスキーマとマイグレーション（4テーブル）
- KVキー設計の実装
- テーマ名・含む文字の正規化＋重複チェック関数
- **CASCADE削除が実際に効くか確認する**

## Phase 3: お題生成パイプライン

- プロンプト設計、バリデーション3種
- モデル切り替え可能な実装、AI Gateway経由の呼び出し
- バッチ生成関数（新規作成・背景補充の両方から呼ぶ）
- `getReading()` 抽象化とYahoo API接続
- D1保存とロックの確保・解放

## Phase 4: お題取得・プリフェッチAPI

- `POST /api/sessions/start`（ページネーション、オフセット更新、補充要否判定）
- `POST /api/themes`（同期生成）
- 枯渇時のフォールバック分岐
- **ページネーションと補充トリガー判定はVitest + vitest-pool-workersでテストする**

## Phase 5: 認証・利用制限

- Better Auth + Googleプロバイダ（**Next.js Worker側のみ**）
- Honoを外部非公開にし、`userId`をService Bindings経由で渡す
- クォータ判定（50回/日、JST基準）
- Rate Limiting binding

## Phase 6: フロントエンド実装

- ルーティングとSSR/CSRの振り分け
- ローマ字入力エンジン（`bun test`）
- **`<input>`を使わないキー入力実装**
- キーボード4段＋Shift、ハイライトの2つの意味の区別
- 巻物・苦無・撒菱
- 結果画面、進捗ドット15個
- 管理画面（`/admin/themes`、`/admin/users`）

## Phase 7: 「〇〇を含む」モード

- モード切替UI（テーマモードと排他）
- プリセット文字と自由入力（ひらがなのみ）
- 正規化＋重複チェック、`constraint`種別での生成連携

## Phase 8: 動作確認・実測・デプロイ

- 両Workerのデプロイ、Service Bindingsの本番設定
- **モデル比較の実測**（品質・速度・ニューロン消費。AI Gatewayのダッシュボードを使う）
- 却下率・重複率を実測し、N_requestを調整（**`2 × N_request ≤ 50` を維持すること**）
- Yahoo API利用量の確認
- Google OAuthの公開ステータスを「本番」に切り替える
- Web Analyticsを有効化
- 初期テーマ5〜10個の事前生成とD1投入
