/**
 * かな→ローマ字の候補テーブル。
 *
 * フロントの打鍵判定（Phase 6）とバックエンドの打鍵数計算（Phase 3）の両方で使う。
 * 1つのかなに複数のローマ字表記を持たせ、どれで打っても受理できるようにする。
 *
 * IMEが許容する全パターンの完全再現は狙わない。曖昧さを設計時点で排除する。
 */

/** 母音のみ。「ん」の後に `n` 単体を認めるかの判定に使う */
export const VOWEL_KANA = new Set(["あ", "い", "う", "え", "お"]);

/** や行。母音と同じく「ん」の後に `n` 単体を認めない */
export const YA_ROW_KANA = new Set(["や", "ゆ", "よ"]);

/**
 * な行。「ん」の後に `n` 単体を認めない。
 *
 * `n` + `な` が `nna` となり「んな」と区別できなくなるため。
 * IMEによっては `minna` で「みんな」が打てるが、**HENGEでは認めない**。
 * 曖昧さを設計時点で排除する方針に合わせる。
 */
export const NA_ROW_KANA = new Set(["な", "に", "ぬ", "ね", "の"]);

/** 記号は5種のみ。候補は1つずつで揺れがない（Shiftは打鍵数に数えない） */
export const SYMBOLS: Record<string, string[]> = {
  "、": [","],
  "。": ["."],
  ー: ["-"],
  "！": ["!"],
  "？": ["?"],
};

/** 単独のかな */
const SINGLE: Record<string, string[]> = {
  あ: ["a"],
  い: ["i"],
  う: ["u"],
  え: ["e"],
  お: ["o"],
  か: ["ka"],
  き: ["ki"],
  く: ["ku"],
  け: ["ke"],
  こ: ["ko"],
  さ: ["sa"],
  し: ["shi", "si", "ci"],
  す: ["su"],
  せ: ["se"],
  そ: ["so"],
  た: ["ta"],
  ち: ["chi", "ti"],
  つ: ["tsu", "tu"],
  て: ["te"],
  と: ["to"],
  な: ["na"],
  に: ["ni"],
  ぬ: ["nu"],
  ね: ["ne"],
  の: ["no"],
  は: ["ha"],
  ひ: ["hi"],
  ふ: ["fu", "hu"],
  へ: ["he"],
  ほ: ["ho"],
  ま: ["ma"],
  み: ["mi"],
  む: ["mu"],
  め: ["me"],
  も: ["mo"],
  や: ["ya"],
  ゆ: ["yu"],
  よ: ["yo"],
  ら: ["ra"],
  り: ["ri"],
  る: ["ru"],
  れ: ["re"],
  ろ: ["ro"],
  わ: ["wa"],
  を: ["wo"],
  が: ["ga"],
  ぎ: ["gi"],
  ぐ: ["gu"],
  げ: ["ge"],
  ご: ["go"],
  ざ: ["za"],
  じ: ["ji", "zi"],
  ず: ["zu"],
  ぜ: ["ze"],
  ぞ: ["zo"],
  だ: ["da"],
  ぢ: ["di"],
  づ: ["du"],
  で: ["de"],
  ど: ["do"],
  ば: ["ba"],
  び: ["bi"],
  ぶ: ["bu"],
  べ: ["be"],
  ぼ: ["bo"],
  ぱ: ["pa"],
  ぴ: ["pi"],
  ぷ: ["pu"],
  ぺ: ["pe"],
  ぽ: ["po"],
  ゔ: ["vu"],
  ぁ: ["xa", "la"],
  ぃ: ["xi", "li"],
  ぅ: ["xu", "lu"],
  ぇ: ["xe", "le"],
  ぉ: ["xo", "lo"],
  ゃ: ["xya", "lya"],
  ゅ: ["xyu", "lyu"],
  ょ: ["xyo", "lyo"],
  ゎ: ["xwa", "lwa"],
};

/** 拗音の直接入力。3系統ある（sha / sya のような揺れ） */
const YOUON_DIRECT: Record<string, string[]> = {
  きゃ: ["kya"],
  きゅ: ["kyu"],
  きょ: ["kyo"],
  しゃ: ["sha", "sya"],
  しゅ: ["shu", "syu"],
  しょ: ["sho", "syo"],
  ちゃ: ["cha", "tya", "cya"],
  ちゅ: ["chu", "tyu", "cyu"],
  ちょ: ["cho", "tyo", "cyo"],
  にゃ: ["nya"],
  にゅ: ["nyu"],
  にょ: ["nyo"],
  ひゃ: ["hya"],
  ひゅ: ["hyu"],
  ひょ: ["hyo"],
  みゃ: ["mya"],
  みゅ: ["myu"],
  みょ: ["myo"],
  りゃ: ["rya"],
  りゅ: ["ryu"],
  りょ: ["ryo"],
  ぎゃ: ["gya"],
  ぎゅ: ["gyu"],
  ぎょ: ["gyo"],
  じゃ: ["ja", "zya", "jya"],
  じゅ: ["ju", "zyu", "jyu"],
  じょ: ["jo", "zyo", "jyo"],
  ぢゃ: ["dya"],
  ぢゅ: ["dyu"],
  ぢょ: ["dyo"],
  びゃ: ["bya"],
  びゅ: ["byu"],
  びょ: ["byo"],
  ぴゃ: ["pya"],
  ぴゅ: ["pyu"],
  ぴょ: ["pyo"],
};

/** 外来語のかな。お題にカタカナ語が含まれるため、読み仮名にこれらが現れる */
const FOREIGN: Record<string, string[]> = {
  ふぁ: ["fa"],
  ふぃ: ["fi"],
  ふぇ: ["fe"],
  ふぉ: ["fo"],
  てぃ: ["thi"],
  でぃ: ["dhi"],
  うぃ: ["wi"],
  うぇ: ["we"],
};

/**
 * 拗音の分解入力を候補に足す。「きゃ」を `ki` + `ゃ` として打つ人がいるため。
 * 候補文字列を足すだけで対応できる。
 */
function withDecomposed(kana: string, direct: string[]): string[] {
  const head = kana[0];
  const tail = kana[1];
  if (head === undefined || tail === undefined) return direct;
  const heads = SINGLE[head];
  const tails = SINGLE[tail];
  if (heads === undefined || tails === undefined) return direct;

  const decomposed = heads.flatMap((h) => tails.map((t) => h + t));
  return [...direct, ...decomposed.filter((c) => !direct.includes(c))];
}

/**
 * かな（1〜2文字）→ローマ字候補。
 * 「っ」「ん」は前後の文脈で候補が変わるため、ここには入れず build 側で組み立てる。
 */
export const KANA_TABLE: Record<string, string[]> = {
  ...SINGLE,
  ...SYMBOLS,
  ...Object.fromEntries(
    Object.entries({ ...YOUON_DIRECT, ...FOREIGN }).map(([kana, direct]) => [
      kana,
      withDecomposed(kana, direct),
    ]),
  ),
};

/** 「ん」を `nn` / `xn` 以外で打てるか（次が子音始まりのかななら `n` 単体も可） */
export const N_ALWAYS: string[] = ["nn", "xn"];

/** 「っ」を子音の借用なしで打つ場合 */
export const SOKUON_FALLBACK: string[] = ["ltu", "xtu", "ltsu"];
