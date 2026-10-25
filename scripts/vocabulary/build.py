#!/usr/bin/env python3
# build.py — UniDic cwj-3.1.1 の lex_3_1.csv から、最適化練習の共通語彙リストを作る
#
#   使い方: python3 scripts/vocabulary/build.py <lex_3_1.csv> [出力先]
#   依存:   pip install -r scripts/vocabulary/requirements.txt（wordfreq。頻度表は同梱）
#   出力:   apps/backend/src/generation/vocabulary.generated.ts（既定）
#
# 手順と根拠は scripts/vocabulary/README.md。数字は 2026-10-24 の実測。
#
#   1. 品詞を絞る: 名詞-普通名詞・動詞（一般・非自立可能）・形容詞（一般・非自立可能）・
#      形状詞-一般・副詞。固有名詞は外す。「出来る」「来る」「無い」「良い」は非自立可能にある
#   2. 見出しに畳む: 語彙素（語彙素＋語彙素読み＋品詞）ごとに1件。活用形を別々に持つと、
#      語数の割に同じ語が繰り返し出る。表記は書字形基本形、読みは仮名形基本形
#   3. 代表の表記は語彙素の標準表記。頻度だけで選ぶと「座る」の語彙素に含まれる「居る」を取る
#   4. 外す: 文語の活用・打てない文字を含む語・zipf 2.0 未満・NG 語・1文字の語（漢字は読みが紛れ、
#      かなは「ど」「ほ」のような語の断片になる）・「っ」で終わる語（「がっ」「ぶっ」）・ひらがなだけの
#      2文字以下の語（「たん」「きん」「うる」。UniDic では擬音語の副詞で、頻度は別の語の断片から付く）
#   5. 表記の持ち主に絞る: その表記で書かれる行（外した品詞・活用形も含む UniDic 全体）のうち、
#      語コストが最も低い行の語彙素だけを残す（その行が助詞・助動詞などの機能語なら外す）。
#      頻度は表記単位なので、別の語の頻度が付いて zipf の線を通ってしまう。「強い=じい」
#      「生活=らいふ」のような珍しい読み、「ます」（升。助動詞の頻度）・「で」（助詞）・
#      「だっ」（「だった」）・「行き」（「行く」の活用形）など
#   6. 手で判定して外す語（excluded.tsv）を除く。語の断片・意味の取りにくい語・お題に向かない語・
#      読み違いで、UniDic の品詞や頻度では拾えないもの
#   7. zipf の高い順に並べる（最適化ごとの語彙は先頭から最大1000語を取る）
import csv, math, re, sys
from collections import defaultdict
from pathlib import Path

import wordfreq

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parents[2]
NG_WORDS_TS = ROOT / "packages/shared/src/generation/ng-words.ts"
EXCLUDED_TSV = Path(__file__).resolve().parent / "excluded.tsv"
DEFAULT_OUT = ROOT / "apps/backend/src/generation/vocabulary.generated.ts"

ZIPF_MIN = 2.0
# lex の列（表層,lid,rid,cost の後に特徴29列）
SURF, COST, POS1, POS2, POS3, CTYPE, LFORM, LEMMA, ORTH_BASE, KANA_BASE = 0, 3, 4, 5, 6, 8, 10, 11, 14, 25

TYPABLE = re.compile(r"^[ぁ-ゖァ-ヺー々一-鿿]+$")
READING = re.compile(r"^[ぁ-ゖー]+$")
KATAKANA_ONLY = re.compile(r"^[ァ-ヺー]+$")
HIRAGANA_ONLY = re.compile(r"^[ぁ-ゖー]+$")
FUNCTION_POS = {"助詞", "助動詞", "感動詞", "接頭辞", "接尾辞", "記号", "補助記号", "空白"}


def category(p1, p2, p3):
    if p1 == "名詞" and p2 == "普通名詞": return "名詞"
    if p1 == "動詞" and p2 in ("一般", "非自立可能"): return "動詞"
    if p1 == "形容詞" and p2 in ("一般", "非自立可能"): return "形容詞"
    if p1 == "形状詞" and p2 == "一般": return "形状詞"
    if p1 == "副詞": return "副詞"
    return None


def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def load_ng_words():
    """packages/shared の NG_WORDS を読む。1行に1語、ダブルクォートで書かれている前提"""
    words = re.findall(r'^\s*"([^"]+)",\s*$', NG_WORDS_TS.read_text(encoding="utf-8"), re.M)
    if not words: sys.exit(f"NG 語を読めなかった: {NG_WORDS_TS}")
    return words


def load_excluded():
    """excluded.tsv を (表記, 読み) の集合で読む。# で始まる行は注釈"""
    pairs = set()
    for line in EXCLUDED_TSV.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"): continue
        orth, reading, _ = line.split("\t")
        pairs.add((orth, reading))
    return pairs


def ng_matcher(words):
    """packages/shared の containsNgWord と同じ照合。生成後の検査で必ず落ちる語を渡さないため"""
    parts = []
    for w in words:
        if len(w) < 2: continue
        e = re.escape(w)
        parts.append(f"(?<![ァ-ヺー]){e}(?![ァ-ヺー])" if KATAKANA_ONLY.match(w) else e)
    pattern = re.compile("|".join(parts))
    return lambda text: pattern.search(text) is not None


def main():
    if len(sys.argv) < 2: sys.exit(__doc__ or "使い方: build.py <lex_3_1.csv> [出力先]")
    lex, out = Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    freq = wordfreq.get_frequency_dict("ja")
    def zipf(w):
        f = freq.get(w)
        return math.log10(f * 1e9) if f else 0.0

    ng = load_ng_words()
    ng_set, contains_ng = set(ng), ng_matcher(ng)
    excluded = load_excluded()

    lemmas = defaultdict(dict)  # 語彙素 -> {表記: (語コスト, 読み)}
    owner = {}                  # 表層 -> (語コスト, 語彙素, 語彙素読み, 品詞大分類)。品詞・活用形を問わず最も安い行
    with lex.open(encoding="utf-8") as f:
        for r in csv.reader(f):
            if r[KANA_BASE] == "*": continue
            cost = int(r[COST])
            o = owner.get(r[SURF])
            if o is None or cost < o[0]: owner[r[SURF]] = (cost, r[LEMMA], r[LFORM], r[POS1])
            cat = category(r[POS1], r[POS2], r[POS3])
            if cat is None or r[CTYPE].startswith("文語"): continue
            orth = r[ORTH_BASE]
            if orth == "*" or not TYPABLE.match(orth): continue
            key = (r[LEMMA], r[LFORM], cat)
            c = lemmas[key].get(orth)
            if c is None or cost < c[0]: lemmas[key][orth] = (cost, hira(r[KANA_BASE]))

    words = {}
    for (lemma, lform, _), cands in lemmas.items():
        if lemma in cands: orth = lemma
        else: orth = max(cands, key=lambda o: (zipf(o), -cands[o][0]))
        cost, reading = cands[orth]
        z = zipf(orth)
        if z < ZIPF_MIN or not READING.match(reading): continue
        if len(orth) == 1 or orth.endswith("っ"): continue
        if len(orth) <= 2 and HIRAGANA_ONLY.match(orth): continue
        if orth in ng_set or reading in ng_set or contains_ng(orth): continue
        # その表記の最も普通の解析が別の語なら外す（手順5）。頻度は表記単位なので、
        # 「ます」（升）に助動詞の、「だっ」（副詞）に「だった」の頻度が付いて上位に来る
        _, o_lemma, o_lform, o_pos = owner.get(orth, (0, lemma, lform, ""))
        if (o_lemma, o_lform) != (lemma, lform): continue
        # 語彙素の名前は品詞をまたいで重なる（名詞の「と」と助詞の「と」）。持ち主が機能語なら外す。
        # 連体詞・接続詞は外さない（「同じ」「一方」「更に」は普通の語）
        if o_pos in FUNCTION_POS: continue
        # 同じ表記・読みが別の語彙素から重なったら1件にする
        prev = words.get((orth, reading))
        if prev is None or z > prev: words[(orth, reading)] = z

    # 手で外す語（手順6）。手順1〜5の変更で該当しなくなった行は、判定をやり直すべきなので知らせる
    stale = excluded - words.keys()
    if stale: print(f"excluded.tsv のうち {len(stale)} 行は該当する語がない: {sorted(stale)[:10]}", file=sys.stderr)
    for k in excluded: words.pop(k, None)

    rows = sorted(words.items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][1]))
    tsv = "\n".join(f"{t}\t{r}" for (t, r), _ in rows)
    out.write_text(
        "// 生成物。**手で編集しない。** 作り直すときは scripts/vocabulary/README.md の手順で\n"
        "// scripts/vocabulary/build.py を実行する。\n"
        "//\n"
        "// 最適化練習の共通語彙リスト。「表記<TAB>読み（ひらがな）」を1行1語で、よく使われる順\n"
        "// （wordfreq の zipf の高い順）に並べたもの。UniDic cwj-3.1.1 由来（BSD。\n"
        "// apps/reading/assets/LICENSE-BSD.unidic）。頻度は wordfreq 3.1.1。\n"
        f"// {len(rows)}語\n"
        f"export const VOCABULARY_TSV = {quote(tsv)};\n",
        encoding="utf-8",
    )
    print(f"{len(rows)}語を書き出した: {out}")


def quote(s):
    # JSON の文字列リテラルは TypeScript でもそのまま使える
    import json
    return json.dumps(s, ensure_ascii=False)


if __name__ == "__main__":
    main()
