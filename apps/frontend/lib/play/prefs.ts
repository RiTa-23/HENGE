/**
 * プレイ画面の表示設定（入/切）。
 *
 * **匿名ユーザーのデータをサーバーに持たない**（不変条件10）ので localStorage に置く。
 * ログイン中も同じ。表示の好みは端末ごとに違ってよい（家と職場でキーボードが違う等）。
 *
 * 値は `"1"` / `"0"` で持ち、**それ以外は既定に倒す。** 壊れた値で表示が消えると、
 * 原因が画面から見えない。
 */

/** localStorage が使えない環境（プライベートウィンドウ等）でも落とさない */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  const raw = storage()?.getItem(key);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

function writeFlag(key: string, value: boolean): void {
  try {
    storage()?.setItem(key, value ? "1" : "0");
  } catch {
    // 容量超過・書き込み禁止。次に開いたとき既定に戻るだけで、プレイは続けられる
  }
}

/** 効果音の消音。既定は「鳴る」 */
const MUTED_KEY = "henge:muted";
export const readMuted = () => readFlag(MUTED_KEY, false);
export const writeMuted = (muted: boolean) => writeFlag(MUTED_KEY, muted);

/**
 * 運指ガイド（次に打つキーを押す指）。**既定は出す。** 既定で隠すと、
 * 指が出せること自体が伝わらない
 */
const FINGER_GUIDE_KEY = "henge:finger-guide";
export const readFingerGuide = () => readFlag(FINGER_GUIDE_KEY, true);
export const writeFingerGuide = (shown: boolean) => writeFlag(FINGER_GUIDE_KEY, shown);

/** ローマ字列を大文字で出すか。**既定は小文字**（これまでの表示） */
const ROMAN_UPPER_KEY = "henge:roman-upper";
export const readRomanUpper = () => readFlag(ROMAN_UPPER_KEY, false);
export const writeRomanUpper = (upper: boolean) => writeFlag(ROMAN_UPPER_KEY, upper);
