"use client";

import type { AlertSoundKind } from "@/lib/alert-sound";

let channelsReady = false;
let splashHidden = false;

function hashId(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h << 5) - h + tag.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 2147480000 || 1;
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function getLocalNotifications() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

/** Esconde a splash nativa o quanto antes (evita tela preta/travada). */
export async function hideNativeSplash(): Promise<void> {
  if (!isNativeApp() || splashHidden) return;
  splashHidden = true;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* ignore */
  }
}

/**
 * Cria canais e checa permissão sem bloquear o boot.
 * NÃO chama requestPermissions aqui — no Android 13+ o diálogo na abertura trava a UX.
 */
export async function initNativeAlerts(opts?: {
  requestPermission?: boolean;
}): Promise<boolean> {
  if (!isNativeApp()) return false;
  const requestPermission = opts?.requestPermission === true;

  try {
    const LocalNotifications = await getLocalNotifications();

    let granted = false;
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") {
      granted = true;
    } else if (requestPermission) {
      const perm = await LocalNotifications.requestPermissions();
      granted = perm.display === "granted";
    }

    if (!granted) return false;
    if (channelsReady) return true;

    await LocalNotifications.createChannel({
      id: "tips3x3-enter",
      name: "Entrada ENTRAR",
      description: "Sinal de entrada Lay pronto para operar",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: "default",
    });

    await LocalNotifications.createChannel({
      id: "tips3x3-goal",
      name: "Gols · Favoritos",
      description: "Gol em jogo favorito",
      importance: 4,
      visibility: 1,
      vibration: true,
    });

    await LocalNotifications.createChannel({
      id: "tips3x3-ft",
      name: "Fim de jogo",
      description: "Partida encerrada",
      importance: 3,
      visibility: 1,
    });

    channelsReady = true;
    return true;
  } catch {
    return false;
  }
}

function channelForKind(kind: AlertSoundKind): string {
  switch (kind) {
    case "enter":
      return "tips3x3-enter";
    case "goal":
      return "tips3x3-goal";
    case "ft":
      return "tips3x3-ft";
    default:
      return "tips3x3-enter";
  }
}

export async function nativeNotify(opts: {
  kind: AlertSoundKind;
  title: string;
  body: string;
  tag: string;
}): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    const ok = await initNativeAlerts({ requestPermission: false });
    if (!ok) return false;

    const LocalNotifications = await getLocalNotifications();
    const id = hashId(opts.tag);

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: opts.title,
          body: opts.body,
          channelId: channelForKind(opts.kind),
          schedule: { at: new Date(Date.now() + 120) },
          extra: { tag: opts.tag, kind: opts.kind },
          autoCancel: true,
          smallIcon: "ic_stat_tips3x3",
          iconColor: "#D9FF00",
        },
      ],
    });

    if (opts.kind === "enter" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([80, 40, 80, 40, 160]);
    }

    return true;
  } catch {
    return false;
  }
}

export async function configureNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    document.documentElement.classList.add("capacitor-native");
  } catch {
    /* ignore */
  }

  // Landing (/) é marketing desktop — no APK manda para login/painel.
  try {
    const path = window.location.pathname;
    if (path === "/" || path === "") {
      window.location.replace("/login");
      return;
    }
  } catch {
    /* ignore */
  }

  await hideNativeSplash();

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Não desenhar o WebView por baixo do relógio / ícones do sistema.
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#050505" });
    await StatusBar.show();
  } catch {
    /* ignore */
  }

  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appStateChange", (state: { isActive: boolean }) => {
      if (state.isActive) {
        void hideNativeSplash();
        void initNativeAlerts({ requestPermission: false });
      }
    });
  } catch {
    /* ignore */
  }

  // Só prepara canais se a permissão já existir; não pede diálogo no boot.
  await initNativeAlerts({ requestPermission: false });
}
