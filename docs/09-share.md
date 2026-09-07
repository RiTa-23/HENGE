# シェア（X投稿）とOGP

結果画面からX（Twitter）に結果を投稿できるようにする。あわせて、共有されたURLからOGPカードが出るようにする。

**スコアは保存しない。** スコアの保存・履歴はMVPのスコープ外（docs/01-overview.md）。投稿テキストは結果画面のメモリ上の値からクライアントで組み立てるため、サーバーAPIもDBも関与しない。

## 投稿テキスト

結果画面に表示されている値をそのまま使う。**表示と投稿で数値の整形がずれると「画面と違う」になるため、整形ルールは結果画面と同じ関数を使う。**

```text
HENGEで「忍びの心得」を打った。
スコア 12340／打鍵/秒 4.3／正確率 98%
#HENGE
<URL>
```

- テーマモード: `HENGEで「<テーマ名>」を打った。`
- 最適化モード: `HENGEで「<最適化の文字>」の最適化練習を打った。`（テーマ名が1〜4文字のかなのため、文として成立させる）
- スコア: `etypingScore()` の値。打鍵/秒は小数1桁、正確率は切り捨て整数（結果画面の表記と同じ。`lib/play/score.ts`）
- ハッシュタグは `#HENGE` の1つ。付ける理由は投稿の集計・検索のためで、それ以上は280字を圧迫する
- URL は intent の `url` パラメータに渡す（Xがt.coに短縮して末尾に表示する。23字換算）
- 文字数はテーマ名が最長（30文字）でも全体で100字程度に収まり、280字制約は余裕で満たす

**組み立ては純粋関数に切り出す**（`lib/share/tweet.ts` の `buildShareText()`）。UIコンポーネントに埋め込むとテストできず、整形ルールが結果画面とずれる。`bun test` で「テーマ名・スコア・打鍵/秒・正確率が含まれること」「整形が結果画面と同じであること」を固定する。

## 投稿の導線

結果画面に「Xでつぶやく」ボタンを置く。押すと `https://x.com/intent/tweet?text=...&url=...` を新規タブで開く。

- **X APIを使わない。** 投稿は intent URL で足りる。認証・レート制限・キーの管理がすべて不要になる
- `text` / `url` は `encodeURIComponent` する。改行は `%0A`
- **共有するURLはプレイ画面ではなく詳細ページ**（`detailHref(kind, name)`。テーマなら `/themes/[name]`、最適化なら `/practice/[char]`）。詳細ページは検索エンジン・SNSからの着地ページとして設計済み（docs/07-ui.md）で、OGPが付く。プレイ画面はnoindexであり、着地先として整っていない
- URLの組み立ては `lib/ui/kind.ts` の `detailHref` を使う。**手で `/play/...` を組み立てない**（`kind` を落として別のプールを開く事故の防止。同ファイルの責務）
- `Result` には `kind` が渡っていないため、`PlayScreen`（`kind` を知っている）から共有URLを渡す

**スコア入りのURLは作らない。** `?score=` を付けてもサーバーは検証できず偽装できるうえ、それをOGPに反映するには画像の動的生成が要る。両方スコープ外なので、スコアはテキストだけに乗せる。

## OGP

共有されたURL（詳細ページ）でカードが出るようにする。**OGP画像の動的生成はMVPのスコープ外**（docs/01-overview.md）のため、**静的OG画像1枚を全ページ共通で使う**。

| 項目 | 値 |
|---|---|
| `twitter:card` | `summary_large_image` |
| `og:image` | `/og.png`（1200×630。全ページ共通の静的アセット） |
| `og:title` | 既存の `generateMetadata` のタイトルを流用する |
| `og:description` | 既存の description を流用する |
| `og:type` | `website` |

`metadataBase` は `BETTER_AUTH_URL` を基準にする。これはBetter AuthのbaseURLだが、本番ではデプロイURL（Google OAuthのコールバックに登録する公開URL）と同一のため、サイトの基準URLとしてそのまま使える。レイアウトで1回定義すれば全ページに継承される。**openGraph / twitter は浅くマージされるため、独自に定義するページは `lib/og.ts` の `ogFields()` でそろえて書く。**

対象ページ:

| ページ | og:title | 備考 |
|---|---|---|
| `/` | トップのキャッチコピー | インデックス対象 |
| `/themes` / `/practice` | 既存のタイトル | |
| `/themes/[name]` | `「忍びの心得」のタイピング練習 \| HENGE` | **シェアの着地ページ。ここが確実にカードになること** |
| `/practice/[char]` | `「ざ」のタイピング最適化練習 \| HENGE` | 同上 |
| `/play/[theme]` | 基本OGのみ | noindexのまま。シェア対象ではない |

実装はApp Routerのmetadata APIにOGPフィールドを足すだけ。SSR/SSGのHTMLにメタタグが載るため、OpenNextでも追加の仕組みは不要。

**OG画像は `scripts/generate-og.html` の源から生成する。** サイトの4色（docs/07-ui.md）と、ロゴと同じ筆の下線を使う。再生成の手順:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 \
  --virtual-time-budget=10000 \
  --screenshot="$(pwd)/apps/frontend/public/og.png" \
  "file://$(pwd)/scripts/generate-og.html"
```

`--virtual-time-budget` はWebフォント（Google Fonts CDN）の読み込み待ち。源のHTMLを書き換えたらこのコマンドで og.png を作り直す。

## やらないこと

- **スコアの保存・履歴**（スコープ外）。投稿後に結果を参照する術は無い
- **OGP画像の動的生成**（スコープ外）。スコアやテーマ名を焼き込んだ画像は作らない
- **X API**（intent で足りる）
- **Web Share API**（まずはX intentのみ。汎用シェアは必要になってから）
- 他SNS（Facebook等）のシェア導線。必要になってから同じ `shareUrl` で足せる
