import type { PromptForm, ThemeKind } from "@henge/shared";

/**
 * テーマモードと最適化モードの**URL上の区別**をここだけに閉じ込める。
 *
 * 一意制約が `(kind, normalized_name)` なので、テーマ名「ざ」と最適化する音「ざ」は
 * **別物として共存できる**（docs/03-data-model.md）。名前だけでは引き当てられないため、
 * プレイのURLは kind を持つ必要がある。各所で `?kind=` を手で組み立てると、
 * 1か所書き忘れた瞬間に「テーマの『ざ』が開く」という静かな取り違えになる。
 */

/** 既定は theme。未知の値も theme に倒す（存在しない kind でD1を引かせない） */
export function parseThemeKind(value: string | undefined): ThemeKind {
  return value === "constraint" ? "constraint" : "theme";
}

/**
 * 既定は短文。未知の値も短文に倒す（kind と同じ理由）。
 *
 * **短文にクエリを付けない**ので、これまでに共有されたURLはそのまま短文で開く。
 */
export function parsePlayForm(value: string | undefined): PromptForm {
  return value === "word" ? "word" : "sentence";
}

/** 画面に出す形式の呼び名 */
export function formLabel(form: PromptForm): string {
  return form === "word" ? "単語" : "短文";
}

/**
 * プレイ画面へのリンク。**テーマ名は必ずURLエンコードする。**
 *
 * `kind=theme` と `form=sentence` のときはクエリを付けない。既定値を明示しても
 * 意味が増えず、共有されたURLが読みにくくなるだけのため。**これまでの共有URLは
 * そのまま短文で開く。**
 *
 * 単語モードはテーマだけなので、`?kind=constraint&form=word` の組み合わせは
 * 画面から作られない（URLを手で書けば作れるが、単語プールが無いので枯渇になる）。
 */
export function playHref(kind: ThemeKind, name: string, form: PromptForm = "sentence"): string {
  const path = `/play/${encodeURIComponent(name)}`;
  const query = [
    ...(kind === "constraint" ? ["kind=constraint"] : []),
    ...(form === "word" ? ["form=word"] : []),
  ];
  return query.length === 0 ? path : `${path}?${query.join("&")}`;
}

/** 一覧・詳細ページへのリンク。テーマは `/themes/[name]`、最適化する音は `/practice/[char]` */
export function detailHref(kind: ThemeKind, name: string): string {
  const segment = encodeURIComponent(name);
  return kind === "constraint" ? `/practice/${segment}` : `/themes/${segment}`;
}

/** そのモードの一覧ページ。プレイ画面の「一覧に戻る」が使う */
export function listHref(kind: ThemeKind): string {
  return kind === "constraint" ? "/practice" : "/themes";
}

/**
 * 画面に出す呼び名。「テーマ」という語は最適化モードでは通じない
 * （利用者が指定したのはテーマ名ではなく、最適化したい音のため）。
 */
export function kindLabel(kind: ThemeKind): string {
  return kind === "constraint" ? "この音" : "このテーマ";
}
