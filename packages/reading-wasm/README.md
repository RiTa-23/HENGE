# @henge/reading-wasm

読み Worker（`apps/reading`）が使う、Vibrato の薄い Wasm ラッパー。

## 置き場所の決まり

- `src/lib.rs` … Rust。**Vibrato 本体は改変しない。** 辞書のバイト列から `Reader` を作る・文を解析して `表層形\t特徴列` を返す、の2つだけ
- `pkg/` … ビルド成果物（`wasm-bindgen --target web`）。**コミットする。** Rust が無い環境（CI・他の開発者・`bun run dev`）でもそのまま動くようにするため
- 特徴列の解釈（IPADIC の読み列、未知語）は TypeScript 側（`apps/reading`）。Rust 側に置くと辞書を変えるたびに Wasm を焼き直すことになる

## ビルド

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version <Cargo.lock の wasm-bindgen と同じ版>
bun run build:wasm
```

`wasm-bindgen` の CLI は crate の `wasm-bindgen` と**同じバージョン**でないと動かない。`Cargo.lock` を見て合わせる。

## 辞書との対応

辞書のバイナリ形式は Vibrato のバージョンに縛られる（`MODEL_MAGIC`、いまは `VibratoTokenizer 0.5`）。Vibrato を上げたら `apps/reading` の辞書取得スクリプトの Release も同じ版に上げる。

## ライセンス

Vibrato は MIT / Apache-2.0 のデュアルライセンス。**MIT を選ぶ**（`LICENSE-MIT`）。`pkg/` の Wasm は Vibrato のコピーなので、この crate と一緒に配布する。Rust の依存の一覧は #175 で `cargo license` から生成する。
