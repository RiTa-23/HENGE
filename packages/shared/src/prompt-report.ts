/**
 * おかしなお題の報告の理由。**値は DB（`prompts.report_reason`）にそのまま入る。**
 *
 * 公開API の Zod 検証・Hono の保存・画面の選択肢がこの一覧を共有する。
 * 値を消すと既存の行が読めなくなるので、足すことはあっても消さない。
 */
export const PROMPT_REPORT_REASONS = ["unnatural", "off_theme", "inappropriate", "other"] as const;

export type PromptReportReason = (typeof PROMPT_REPORT_REASONS)[number];

/** 画面に出す名前（報告パネルと管理画面で同じ文言を使う） */
export const PROMPT_REPORT_REASON_LABELS: Record<PromptReportReason, string> = {
  unnatural: "日本語が不自然",
  off_theme: "テーマと関係ない",
  inappropriate: "不適切な内容",
  other: "その他",
};
