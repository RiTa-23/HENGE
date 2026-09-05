// Tailwind v4 は PostCSS プラグイン1つで動く（tailwind.config.js は持たない）。
// トークンの定義は app/globals.css の @theme に置く。
export default { plugins: { "@tailwindcss/postcss": {} } };
