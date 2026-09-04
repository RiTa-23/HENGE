# HENGE

お題が毎回変わることで「慣れ」が生じない、日本語タイピング練習ツール。Cloudflare Workers上で動く。

## ドキュメントの読み方

**全部読まないこと。** 作業に応じて必要なものだけ開く。

| 作業 | 読む |
|---|---|
| 全体像を掴む（初回のみ） | `docs/01-overview.md`, `docs/02-architecture.md` |
| DBスキーマ・マイグレーション | `docs/03-data-model.md` |
| APIの追加・変更 | `docs/04-api.md` |
| お題生成まわり | `docs/05-generation.md` |
| ローマ字入力・キーボード | `docs/06-typing-engine.md` |
| 画面・スタイル | `docs/07-ui.md` |
| 次に何をやるか | `docs/08-roadmap.md` |

## 開発コマンド

```bash
bun install                      # 依存インストール
bun run dev                      # 両Workerをローカル起動（wrangler dev）
bun test                         # 純粋関数のテスト
bun run test:workers             # D1/KV依存のテスト（vitest-pool-workers）
bun run lint                     # oxlint
bun run format                   # oxfmt
bun run typecheck                # tsc --noEmit
bun run db:generate              # Drizzleでマイグレーション生成
bun run db:migrate:local         # ローカルD1に適用
```

## ディレクトリ構成

```
apps/frontend/   Next.js Worker。画面・Route Handler・認証
apps/backend/    Hono Worker。D1/KV/Workers AIへのアクセス
packages/shared/ 型定義、ローマ字入力エンジン、正規化関数、JST日付関数
docs/            実装ドキュメント
```

## 絶対に守る不変条件

破ると静かに壊れるもの。**変更する前に必ず該当ドキュメントを確認すること。**

1. **認証は Next.js Worker 側にのみ置く。** Hono側にBetter Authを実装しない。**Honoに公開ルートを生やさない**（外部非公開であることが、Next.jsで認証を完結させる前提になっている）
2. **Service Bindings は HTTP方式**（`env.BACKEND.fetch`）。`WorkerEntrypoint`によるRPC方式に変えない。Hono RPCとSmart Placementの両方を失う
3. **日付は必ず `packages/shared` のJST変換関数を経由する。** `new Date().toISOString()` を直接使うと、上限のリセットが朝9時になる
4. **生成は最大2ラウンド × 20件。** `2 × N_request ≤ 50`（Workers無料プランの外部サブリクエスト上限）を破らない。3ラウンド目で静かに失敗する
5. **テーマ行はお題15問と同じバッチで挿入する。** 先に作ると、生成失敗時にお題ゼロのテーマが公開一覧に残る
6. **テーマ削除時はKVも明示的に消す。** D1のCASCADEはD1の中でしか効かない
7. **タイピング判定に `<input>` / `<textarea>` を使わない。** IMEが介入して打鍵を拾えなくなる。`<div tabindex="0">` へのkeydownで実装する
8. **読み仮名の取得は必ず `getReading()` 経由。** Yahoo APIを直接呼ばない（将来の差し替えが確定しているため）
9. **色・書体はTailwindの `@theme` トークンのみ使う。** 生の16進数値や `blue-600` のような汎用色を書かない
10. **匿名ユーザーのデータをサーバーに持たない。** 進捗はクライアントのlocalStorageで管理する
11. **バックグラウンド補充を発火できるのはログインユーザーのみ。** 匿名のプレイではキックしない。発火したらそのユーザーのクォータを1消費する

## MVPのスコープ外

**以下に関するコードを先回りで書かない。** 準備のためのカラム追加やインターフェース定義も不要。

課金（Stripe）、有料/無料プランの区別、対戦機能、ブラウザLLM（Gemini Nano）、マイページ、お気に入り、スコアの保存・履歴、OGP画像の動的生成、Cron Triggers、Cache API、Cloudflare Workflows。

## コーディング規約

- **入力検証はZodで、公開API（Next.js Route Handler）の入口で行う。** Hono側では行わない
- **Worker間の型はHono RPC（`hc`）で共有する。** 手書きの型定義を二重に持たない
- 共通ロジックは `packages/shared` に置き、両Workerから参照する
- D1へのアクセスはHono Workerに閉じる。Next.js側から直接D1を触らない
- テストは、D1/KVに依存しないものは `bun test`、依存するものは Vitest + `@cloudflare/vitest-pool-workers` を使う

## 作業の進め方

- 現在のフェーズと次にやることは `docs/08-roadmap.md` を見る
- 実装の判断に迷ったら、勝手に決めずに該当ドキュメントを確認する。ドキュメントに書かれていない場合は確認を求める
- 仕様を変更したときは、コードとあわせて `docs/` の該当箇所も更新する
