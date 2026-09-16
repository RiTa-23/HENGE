//! Vibrato を Workers から呼ぶための最小のラッパー。
//!
//! 解析のロジックはすべて Vibrato に任せ、ここでは
//! 「辞書のバイト列から Tokenizer を作る」「文を渡して表層形と特徴列を返す」だけをする。
//! 特徴列の解釈（IPADIC の読み列を取り出す、未知語の扱い）は TypeScript 側の責務。
//! Rust 側に置くと辞書を変えるたびに Wasm を焼き直すことになる。

use ruzstd::decoding::StreamingDecoder;
use vibrato::{Dictionary, Tokenizer};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Reader {
    tokenizer: Tokenizer,
}

#[wasm_bindgen]
impl Reader {
    /// 展開済みの辞書バイト列から作る。テストや計測用。
    /// 辞書のバイナリ形式は Vibrato のバージョンに縛られる（MODEL_MAGIC）。
    /// 合わないときは `Err` を返し、JS 側には例外として届く。
    #[wasm_bindgen(constructor)]
    pub fn new(dictionary: &[u8]) -> Result<Reader, JsError> {
        let dict = Dictionary::read(dictionary).map_err(|e| JsError::new(&e.to_string()))?;
        Ok(Reader { tokenizer: Tokenizer::new(dict) })
    }

    /// zstd 圧縮のまま（Vibrato の配布物 `system.dic.zst` そのもの）の辞書から作る。
    ///
    /// **展開済みのバイト列を JS 側でも Wasm 側でも持たない。** Workers のメモリ上限は
    /// 128MB で、IPADIC は展開すると 46MB ある。JS で展開してから渡すと
    /// 「JS の 46MB ＋ Wasm へのコピー 46MB ＋ 読み込んだ辞書 46MB」が同時に存在する
    /// 瞬間ができて上限を超える。圧縮のまま渡し（8MB）、Wasm の中でストリーム展開しながら
    /// `Dictionary::read` に流すと、ピークは「圧縮 8MB ＋ 辞書 46MB ＋ 展開の作業領域」で済む。
    #[wasm_bindgen]
    pub fn from_zstd(compressed: &[u8]) -> Result<Reader, JsError> {
        let decoder = StreamingDecoder::new(compressed).map_err(|e| JsError::new(&e.to_string()))?;
        let dict = Dictionary::read(decoder).map_err(|e| JsError::new(&e.to_string()))?;
        Ok(Reader { tokenizer: Tokenizer::new(dict) })
    }

    /// 1文を解析し、1トークン1行の `表層形\t特徴列` を返す。
    /// JSON にしないのは、依存を増やさずに済み、JS 側の split で足りるため。
    /// 表層形・特徴列にタブや改行は含まれない（IPADIC はカンマ区切り）。
    pub fn tokenize(&self, text: &str) -> String {
        let mut worker = self.tokenizer.new_worker();
        worker.reset_sentence(text);
        worker.tokenize();
        let mut out = String::new();
        for token in worker.token_iter() {
            out.push_str(token.surface());
            out.push('\t');
            out.push_str(token.feature());
            out.push('\n');
        }
        out
    }
}
