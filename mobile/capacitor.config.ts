import type { CapacitorConfig } from "@capacitor/cli";

/**
 * O app carrega o painel em produção (Next.js na VPS).
 * Para dev local: CAPACITOR_SERVER_URL=http://192.168.x.x:3000 npx cap sync android
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://tips3x3.com";

const config: CapacitorConfig = {
  appId: "com.tips3x3.app",
  appName: "Tips3x3",
  webDir: "www",
  server: {
    url: serverUrl,
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#050505",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: "#050505",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_tips3x3",
      iconColor: "#D9FF00",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#050505",
    },
  },
};

export default config;
