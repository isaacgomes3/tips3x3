import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="sell-login-page">
          <div className="sell-login-card">Carregando…</div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
