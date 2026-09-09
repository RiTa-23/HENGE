import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ogFields, pageTitle } from "@/lib/og";

const TITLE = pageTitle("プライバシーポリシー");
const DESCRIPTION = "HENGEが扱う情報と、その使い道について。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...ogFields(TITLE, DESCRIPTION),
};

/**
 * プライバシーポリシー。**Google OAuth の同意画面を本番に切り替えるのに要る**
 * （Google Cloud Console がプライバシーポリシーURLを必須にしている）。
 *
 * **実装と食い違ったまま置かない。** ここに書いてあることは、
 * `packages/shared/src/db/auth-schema.ts` と `apps/backend/src/db/schema.ts` の
 * 列、および外部APIの呼び出し先（Workers AI / Yahoo）と一致していること。
 * 保存する項目や送り先を変えたら、このページも同じPRで直す。
 */

/** 見出しと本文の組。書き足すときはここに追加する */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-mincho text-xl tracking-wide text-kinari">{title}</h2>
      <div className="mt-4 space-y-4 leading-loose text-kinari/70">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="font-mincho text-3xl tracking-wide text-kinari">プライバシーポリシー</h1>
        <p className="mt-5 leading-loose text-kinari/70">
          HENGE（以下「本サービス」）が扱う情報と、その使い道について説明します。
        </p>

        <Section title="ログインしなければ、こちらには何も残りません">
          <p>
            本サービスはログインせずに遊べます。どこまで進んだかという記録は、
            お使いのブラウザの中（localStorage）にのみ保存され、本サービスのサーバーには送られません。
            ブラウザのデータを消せば、その記録も消えます。
          </p>
        </Section>

        <Section title="ログインすると保存される情報">
          <p>Googleアカウントでログインしたとき、次の情報を保存します。</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <b className="font-normal text-kinari">氏名、メールアドレス、プロフィール画像のURL</b>
              {" — "}
              Googleアカウントから受け取ります。利用者を識別するために使います
            </li>
            <li>
              <b className="font-normal text-kinari">Googleの認証トークン</b>
              {" — "}
              ログインした状態を保つために使います
            </li>
            <li>
              <b className="font-normal text-kinari">ブラウザの種類（User-Agent）</b>
              {" — "}
              ログイン時のリクエストから記録します。セッションの管理に使います
            </li>
            <li>
              <b className="font-normal text-kinari">作成したテーマ</b>
              {" — "}
              誰が作ったテーマかを保持します
            </li>
            <li>
              <b className="font-normal text-kinari">テーマごとに遊んだ回数</b>
              {" — "}
              一度出したお題を再び出さないための位置として使います
            </li>
            <li>
              <b className="font-normal text-kinari">1日ごとのお題の生成量</b>
              {" — "}
              1人あたりの上限を管理するために使います
            </li>
          </ul>
        </Section>

        <Section title="外部に送る情報">
          <p>
            本サービスの機能のために、次の事業者へ情報を送ります。それ以外の目的では送りません。
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <b className="font-normal text-kinari">Cloudflare, Inc.</b>
              {" — "}
              お題を作るとき、入力されたテーマ名が生成の指示文に含まれます。
              本サービスはCloudflare上で動いており、通信もCloudflareを経由します
            </li>
            <li>
              <b className="font-normal text-kinari">LINEヤフー株式会社</b>
              {" — "}
              生成されたお題の本文を、読み仮名を得るためにテキスト解析APIへ送ります。
              利用者を特定できる情報は含みません
            </li>
            <li>
              <b className="font-normal text-kinari">Google LLC</b>
              {" — "}
              ログインの認証のために利用します
            </li>
          </ul>
        </Section>

        <Section title="保存していないもの">
          <p>
            <b className="font-normal text-kinari">IPアドレスは保存していません。</b>
            ログインの記録に残るのは、ブラウザの種類だけです。
          </p>
          <p>
            パスワードも保持していません。ログインはGoogleアカウントのみで、
            本サービスがパスワードを受け取ることはありません。
          </p>
        </Section>

        <Section title="Cookie">
          <p>
            ログインした状態を保つためのCookieだけを使います。
            広告や、サイトをまたいだ行動の追跡のためのCookieは使いません。
          </p>
        </Section>

        <Section title="アクセス解析">
          <p>
            どのページがどれだけ見られているかを知るために、Cloudflare Web Analytics
            を使っています。ページの表示回数、参照元、おおまかな地域、表示にかかった時間などを記録します。
          </p>
          <p>
            提供元である Cloudflare は、この解析について
            <b className="font-normal text-kinari">
              「利用状況の計測にCookieやlocalStorageといったクライアント側の状態を一切使わない」
            </b>
            および
            <b className="font-normal text-kinari">
              「IPアドレスやUser-Agentなどによって個人を識別（フィンガープリント）しない」
            </b>
            と説明しています。
          </p>
        </Section>

        <Section title="保存期間と削除">
          <ul className="list-disc space-y-2 pl-5">
            <li>ログインの記録（セッション）は、有効期限が切れた時点で無効になります</li>
            <li>アカウントに紐づく情報の削除を希望される場合は、下記の連絡先へお知らせください</li>
            <li>
              作成されたテーマとお題は、アカウントを削除しても残ります。
              作成者との結びつきだけが外れます
            </li>
          </ul>
        </Section>

        <Section title="第三者への提供">
          <p>
            法令に基づく場合を除き、取得した情報を第三者へ提供することはありません。
            上に挙げた事業者は、本サービスを動かすために必要な範囲での利用に限られます。
          </p>
        </Section>

        <Section title="改定">
          <p>内容を変更した場合は、このページを更新します。</p>
        </Section>

        <Section title="連絡先">
          <p>
            本サービスは個人が開発・運営しています。お問い合わせは X（旧Twitter）へお願いします。
          </p>
          <p>
            <a
              href="https://x.com/ritaneco"
              className="text-kin hover:text-kinari"
              target="_blank"
              rel="noreferrer"
            >
              @ritaneco
            </a>
          </p>
        </Section>

        <p className="mt-12 text-sm text-kinari/50">制定日: 2026年9月9日</p>
      </main>
      <SiteFooter />
    </>
  );
}
