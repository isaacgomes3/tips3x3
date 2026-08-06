import { Suspense } from "react";
import AdminClient from "@/app/admin/AdminClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Administração · Tips3x3",
};

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-shell">
          <p className="config-hint">Carregando administração…</p>
        </div>
      }
    >
      <AdminClient />
    </Suspense>
  );
}
