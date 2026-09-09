/**
 * 共通フッター。**プライバシーポリシーへの導線をここに置く。**
 *
 * ヘッダーのナビには入れない。ナビは「次に何をするか」の並びで、ポリシーは
 * そこに混ぜると邪魔になる。かといってどこからも辿れないのは不自然なので、
 * 慣例どおりフッターに置く。
 *
 * **`SiteHeader` と同じページにだけ置く。** プレイ画面には出さない
 * （打っている最中に画面の下へ視線を誘う要素を作らない）。
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-kin/40">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-8 text-sm tracking-widest text-kinari/50">
        <a href="/privacy" className="hover:text-kinari">
          プライバシーポリシー
        </a>
        <a
          href="https://x.com/ritaneco"
          target="_blank"
          rel="noreferrer"
          className="hover:text-kinari"
        >
          @ritaneco
        </a>
      </div>
    </footer>
  );
}
