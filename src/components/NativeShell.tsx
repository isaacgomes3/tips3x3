"use client";

import { useEffect } from "react";
import { configureNativeShell } from "@/lib/native-alerts";

/** Inicializa status bar, permissões e canais de notificação no app Capacitor. */
export function NativeShell() {
  useEffect(() => {
    void configureNativeShell();
  }, []);

  return null;
}
