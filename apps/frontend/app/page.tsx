import { ping } from "@henge/shared";
import { LoginButton } from "@/components/LoginButton";

export default function Home() {
  return (
    <main>
      <h1>HENGE</h1>
      <p>Phase 0: 疎通確認</p>
      <p>shared: {ping("frontend")}</p>
      <p>
        <a href="/api/health">/api/health</a>
      </p>
      <LoginButton />
    </main>
  );
}
