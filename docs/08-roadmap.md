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
  - **D1マイグレーションはデプロイの前に自動適用する**（`deploy.yml` の `migrate` ジョブ）。サイレント失敗の報告があるため、適用後に `list` で未適用が残っていないか確かめ、残っていればデプロイを止める。手動トリガーの別ワークフローは調査・復旧用に残す
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
- クォータ判定（500ニューロン/日、00:00 UTC 基準）
- Rate Limiting binding

## Phase 6: フロントエンド実装

- ルーティングとSSR/CSRの振り分け
- ローマ字入力エンジン（`bun test`）
- **`<input>`を使わないキー入力実装**
- キーボード4段＋Shift、ハイライトの2つの意味の区別
- 巻物・苦無・撒菱
- 結果画面、進捗ドット15個
- 管理画面（`/admin/themes`、`/admin/users`）

`/practice` 系は Phase 7 へ移した（中身の無いページを先に置いても作り直しになるため）。シェアボタンとOGPは未実装で Phase 8 に持ち越している。

## Phase 7: 「〇〇を含む」モード

- **`/practice` と `/practice/[char]` の新規作成**（Phase 6では作らず、ルーティングごとこちらに寄せた）
- モード切替UI（テーマモードと排他）
- プリセット文字と自由入力（ひらがなのみ）
- 正規化＋重複チェック、`constraint`種別での生成連携
- **プレイのURLに `kind` を通す。** 一意制約が `(kind, normalized_name)` なので、名前だけではプールが決まらない

## 読み仮名の取得を差し替えるとき

`getReading()` の実装（いまは Yahoo! ルビ振りAPI）を**形態素解析ライブラリ**へ移す予定がある。
外部サブリクエストを使わなくなるので、そこに縛られていた値をまとめて見直す。

- `2 × N_request ≤ 50`（不変条件4）の制約が外れる。`N_REQUEST` とラウンド数を見直す
- **単語の1プレイを20問から30問へ戻す**（`PLAY_SIZE_WORD`）。20問にしているのは、
  1回の生成で作れるのが40件しかなく30問だと1回で埋まらないため（`docs/05-generation.md`）
- 単語の在庫目標（`STOCK_TARGET_WORD`）が、1回の補充で埋まるかを再確認する

## Phase 8: 動作確認・実測・デプロイ

- 両Workerのデプロイ、Service Bindingsの本番設定
- **モデル比較の実測**（品質・速度・ニューロン消費。AI Gatewayのダッシュボードを使う）
- 却下率・重複率を実測し、N_requestを調整（**`2 × N_request ≤ 50` を維持すること**）
- Yahoo API利用量の確認
- Google OAuthの公開ステータスを「本番」に切り替える
- Web Analyticsを有効化
- 初期テーマ5〜10個の事前生成とD1投入

## Phase 9: マイページ

- `/me`: ユーザー名（表示名）の編集、本日の残ニューロン、作ったお題の一覧
- `user.display_name` を Better Auth の `additionalFields` で追加。未設定ならログイン後に入力させる（`DisplayNameGate`）
- 表示名はランキングで公開する名前になる

## Phase 10: ランキング

- `rankings`（テーマ×形式ごとに1人1件のベスト、上位100件）
- 結果画面から登録（生の値を送り、サーバーで計算）。詳細ページで短文／単語を切り替えて見る
- スコア計算を `packages/shared` へ移動（結果画面・X投稿・ランキングで同じ関数）

## Phase 11: 長文モード

- 出題の形式に `long` を追加。**1本で1プレイ**（打鍵250〜450、1ラウンド5本、在庫目標3本）
- プレイ画面はキーボードを出さず巻物を縦に大きくする（`LongScroll`。読み・ローマ字の行は横スライド）
- `themes.long_generation_status` を追加（形式ごとの列のまま。`theme_pools` へ寄せるのは形式ごとの属性が2つ以上になったとき）
- テーマだけ。最適化練習には付けない
