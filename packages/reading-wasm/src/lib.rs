//! Vibrato を Workers から呼ぶための最小のラッパー。
//!
//! 解析のロジックはすべて Vibrato に任せ、ここでは
//! 「辞書のバイト列から Tokenizer を作る」「文を渡して表層形と特徴列を返す」だけをする。
//! 特徴列の解釈（UniDic トリム辞書の読み列を取り出す、未知語の扱い）は TypeScript 側の責務。
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
    /// 128MB で、UniDic トリム辞書は展開すると Wasm メモリ +84MB ある。JS で展開してから
    /// 渡すと JS 側バッファと Wasm 側の辞書が同時に存在して上限を超える。圧縮のまま渡し
    /// （~7MB）、Wasm の中でストリーム展開しながら `Dictionary::read` に流すと、
    /// ピークは「圧縮 ~7MB ＋ 辞書 +84MB ＋ 展開の作業領域」で済む。
    #[wasm_bindgen]
    pub fn from_zstd(compressed: &[u8]) -> Result<Reader, JsError> {
        let decoder = StreamingDecoder::new(compressed).map_err(|e| JsError::new(&e.to_string()))?;
        let dict = Dictionary::read(decoder).map_err(|e| JsError::new(&e.to_string()))?;
        Ok(Reader { tokenizer: Tokenizer::new(dict) })
    }

    /// 1文を解析し、1トークン1行の `表層形\t特徴列` を返す。
    /// JSON にしないのは、依存を増やさずに済み、JS 側の split で足りるため。
    /// 表層形・特徴列にタブや改行は含まれない（UniDic トリム辞書はカンマ区切り）。
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
