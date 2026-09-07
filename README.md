# HENGE

お題が毎回変わることで「慣れ」が生じない、日本語タイピング練習ツール。

## アプリの概要

### コアループ

1. テーマ（例:「忍びの心得」）を選ぶ、または作る
2. そのテーマのお題15問が出題される
3. 打ち終わると結果（スコア・打鍵速度・正確率・打鍵数・時間）が出る
4. もう一度遊ぶと、**前回とは違う15問**が出る

同じお題を繰り返さないため、暗記による有利不利が発生しない。1問の長さはローマ字10〜40打鍵で、時間制限は設けない。画面にキーボードを表示し、次に打つキーをハイライトする。

### 2つのモード

| | テーマで打つ | 最適化練習 |
|---|---|---|
| 出題される文章 | 指定したテーマに沿った文章 | 指定した音（例:「ざ」）を必ず含む文章 |
| 用途 | 題材を選んで練習する | 指定した連接の運指を固める |

最適化とは標準運指で同じ指が続く連接を、別々の指が続くよう崩した運指に組み替える＝上級者向けの技術で、崩した運指を毎回違う文脈で反復する。

### 3つの特徴

- **待ち時間ゼロ**: プレイ中に裏で次回分を生成しておく。他ユーザーが生成済みのテーマは即座に遊べる
- **好きなテーマで練習できる**: お題は運営が用意せず、ユーザー指定のテーマからAIが生成する
- **匿名でも遊べる**: プレイの進捗はブラウザのlocalStorageに持つ。ログインすると生成（テーマ作成・補充）が使える

## 技術構成

Cloudflare Workers 上で動く。**Workerは2本に分かれている**。

```text
ブラウザ
   |  公開API（HTTP）
   v
Next.js Worker（OpenNext）… 画面のSSR、セッション検証、認可
   |  Service Bindings（HTTP方式）
   v
Hono Worker … 外部非公開。D1 / KV / Workers AI へのアクセスを担う
```

| レイヤー | 選定 |
|---|---|
| フロントエンド | Next.js（App Router）＋ `@opennextjs/cloudflare` |
| バックエンド | Hono |
| Worker間通信 | Service Bindings（HTTP方式）＋ Hono RPC（`hc`） |
| データ | D1（Drizzle ORM）＋ KV |
| お題生成 | Workers AI（AI Gateway経由）＋ Yahoo! JLPルビ振りAPI（読み仮名の取得） |
| 認証 | Better Auth（Googleプロバイダのみ。Next.js Worker側のみに置く） |
| 入力検証 | Zod（公開APIの入口で行う） |
| スタイル | Tailwind CSS v4（`@theme` トークンで4色・3書体に制限） |
| テスト | `bun test`（純粋関数）＋ Vitest + `@cloudflare/vitest-pool-workers`（D1/KV依存） |
| lint/format | oxlint ＋ oxfmt |
| パッケージ管理 | Bun（ワークスペース） |

### ディレクトリ構成

```text
apps/
  frontend/   Next.js Worker。画面・Route Handler・認証
  backend/    Hono Worker。D1/KV/Workers AIへのアクセス
packages/
  shared/     型定義、ローマ字入力エンジン、正規化関数、JST日付関数
docs/         実装ドキュメント
```

### お題生成の流れ

1. ユーザーがテーマ（または含む文字）を指定する
2. Workers AIがお題の候補文をバッチで生成する
3. Yahoo! JLPルビ振りAPIで読み仮名を取り、ローマ字候補テーブルで打鍵数を計算する
4. 検証（打てる文字種・漢字の有無・打鍵数10〜40・「含む」文字）を通ったものだけをD1に保存する

生成は1プレイ15問を揃えることを目標に、リトライは最大2ラウンド。上限はWorkers無料プランの外部サブリクエスト制約による。

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

シークレットは `.dev.vars` で管理する。テンプレートは各Workerの `.dev.vars.example`（リポジトリにはコミットしない）。ローカルのD1はリポジトリ直下の `.wrangler/state` で両Workerが共有する。

## ドキュメント

- [docs/README.md](docs/README.md) — 実装ドキュメントの目次（アーキテクチャ・API・データモデル・UI仕様など）
- [AGENTS.md](AGENTS.md) — AIコーディングツール向けの指示書（不変条件・作業手順書）
