import { Suspense } from "react";
import RegisterClient from "./RegisterClient";

export const metadata = { title: "Criar conta · tips3x3" };

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterClient />
    </Suspense>
  );
}
