/**
 * Shims para pacotes Capacitor (só no mobile). No web build o módulo
 * físico não existe — import dinâmico + try/catch em runtime.
 */
declare module "@capacitor/splash-screen" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const SplashScreen: any;
}

declare module "@capacitor/local-notifications" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const LocalNotifications: any;
}

declare module "@capacitor/status-bar" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Style: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const StatusBar: any;
}

declare module "@capacitor/app" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const App: any;
}
