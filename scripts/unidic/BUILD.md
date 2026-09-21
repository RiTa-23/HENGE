# UniDic トリム辞書のビルド手順

`apps/reading` で使う辞書 `unidic.dic.zst` の再現手順。通常は `bun run dict:fetch`
で Release アセットを取ればよく、ここは語彙を変えて作り直すときだけ必要。

## 成果物

| ファイル | 語彙数 | zst | Wasm メモリ（実測delta） | sha256 |
|---|---|---|---|---|
| `unidic-cwj-v7800n-slim2.dic.zst`（推奨） | 539,835 | 6.9MB | +84.1MB | `aae2f56b6f88a2a6a2671a072248220166b708a1a4a8d2ffbff610d6c0d06d9f` |
| `unidic-cwj-vmax2.dic.zst`（語彙最大化代替） | 588,931 | 7.4MB | +105.3MB | `42ff0759d6069b9c20231f3801843cc1d34668702c6af423787d9798316b9889` |

ロード時ピーク = wasm delta + zstバッファ + ~12MB オーバーヘッド。推奨版は ~104MB
（128MB 制限に余裕）。vmax2 は ~125MB で際どい。

## ソースの取得

UniDic cwj-3.1.1（書籍コーパス BCCWJ 由来の短単位辞書、879,222エントリ）:

```bash
curl -LO https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.1/unidic-cwj-3.1.1-full.zip
unzip unidic-cwj-3.1.1-full.zip -d unidic-cwj-3.1.1
```

`-full` 版を使うこと（`model.def`（392MBのbigram素性重み）が入っているのは full だけ）。
個別ファイルは `.../unidic-cwj-3.1.1-full/<file>` からも取れる。

## 1. 語彙フィルタ

```bash
python3 scripts/unidic/filter_lex_v2.py unidic-cwj-3.1.1/lex_3_1.csv lex_v7800n_slim2.csv
# => 539,835行の13列CSV（surf,lid,rid,cost,pos1,*,*,*,*,*,*,読み,*）
```

フィルタ方針（閾値はスクリプト冒頭で変更可）:
- 機能語（助詞・助動詞・代名詞・数詞・接尾辞等14類）は全保持
- 動詞 <7800、形容詞 <7200、普通名詞 <6200（サ変可能 <7800）
- 固有名詞: 一般・地名 <6800、人名 <6800（有名どころまで残す）
- `(表層, 出現形正書法仮名)` で dedup
- **特徴列の最小化**: pos1を1文字化・活用/原形/発音を `*` に。読み生成は
  `features[7]`（=列11）だけ見るので出力は完全に同一（5,000文で実測0.00%差）だが
  wasm メモリが約25MB減る

読み列は **f[24]（出現形正書法仮名）** を使う。f[10] は語彙素読み（基本形、
食べ→タベル）、f[13] は発音形（は→ワ、学生→ガクセー）なのでどちらも不適切。

## 2. コンパイル（vibrato 0.5.2、cargo）

接続は **compact connector（bigram方式）**。dense行列はcwjのID空間では辞書が
膨らみすぎるので使わない。`model.def` から `vibrato::mecab::generate_bigram_info`
（cost_factor=700.0）で bigram.{right,left,cost} を生成し、
`SystemDictionaryBuilder::from_readers_with_bigram_info(..., dual_connector=false)`
で `.dic` をビルドする。参考実装は別セッションの `vibtest/main.rs`。

## 3. 圧縮

```bash
zstd -19 -f unidic.dic -o unidic.dic.zst
```

`--long=27` は付けないこと（ruzstd が128MBウィンドウバッファを wasm ヒープに確保し、
実メモリが ~130-170MB 水増しされる）。

## 計測方法

wasm delta = `initSync` 後の `memory.buffer.byteLength` の増分（bun で計測可能）。
本番推定は delta + ~12MB。正確には workerd の実 isolate で測ること（issue #183）。

## ライセンス

UniDic cwj は GPL / LGPL / **BSD** のトリプルライセンス（licses/COPYING）。
本リポジトリでは **BSD を選択**。`LICENSE-BSD.unidic`・`AUTHORS.unidic`・
`COPYING.unidic` を辞書と一緒に `apps/reading/assets/` に置く。
