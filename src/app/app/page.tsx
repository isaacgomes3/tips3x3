import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";

function AppLoading() {
  return (
    <div className="app-frame is-terminal">
      <header className="term-topbar">
        <div className="term-topbar-left">
          <img
            className="term-topbar-logo"
            src="/logo-tips3x3.png"
            alt="Tips3x3"
            width={120}
            height={36}
          />
        </div>
      </header>
      <main className="main-pane is-terminal">
        <div className="banner-info">Carregando terminal…</div>
      </main>
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Dashboard />
    </Suspense>
  );
}
