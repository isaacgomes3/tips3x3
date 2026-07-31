# App Android (APK) — Tips3x3

Shell nativo com [Capacitor](https://capacitorjs.com/) que carrega **https://tips3x3.com/login** (sem landing) e entrega **notificações locais**, vibração, status bar escura e **Auto Lay Eventos raros** (plugin BetBra).

## Pré-requisitos

1. **Node.js 20+**
2. **Android Studio** (SDK 34+, build-tools, platform-tools)
3. Variável `ANDROID_HOME` ou `ANDROID_SDK_ROOT` apontando para o SDK
4. **Java 17** (usado pelo Gradle do Capacitor 7)

## Estrutura

```
mobile/
  capacitor.config.ts   # appId, URL do servidor, plugins
  www/                  # splash local (antes do remote load)
  android/              # projeto Gradle + plugin BetBra
src/lib/native-alerts.ts      # bridge web ↔ notificações nativas
src/lib/betbra/native-lay.ts  # Auto Lay hold no APK
```

O código web (`native-alerts`, `native-lay`, `useLiveAlerts`) roda **no servidor** — após alterações, faça deploy do Next.js na VPS antes de testar o APK em produção.

## Primeira configuração

```powershell
# Raiz do repo
npm install

cd mobile
npm install
npx cap add android
npx cap sync android
```

## Apontar para ambiente local (opcional)

Útil para testar alertas sem deploy:

```powershell
$env:CAPACITOR_SERVER_URL = "http://192.168.0.10:3000"
cd mobile
npx cap sync android
```

Use o IP da máquina na mesma rede Wi‑Fi do celular (não `localhost`).

## Abrir no Android Studio

```powershell
npm run mobile:open
```

Ou: `cd mobile && npx cap open android`

## Gerar APK debug (instalação direta)

```powershell
npm run mobile:apk
```

Saída:

```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Instale no celular (USB debugging ou envie o arquivo):

```powershell
adb install -r mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

## Auto Lay no app (BetBra)

O APK executa ordens na Exchange sem depender da extensão Chrome:

- **Lay 3x3** (padrão ligado): Lay entrada + Back saída (green) com lucro alvo **0,5%**
- **Eventos raros** (padrão desligado): Lay hold, sem green

1. Em **Perfil**, toque em **Conectar BetBra** e faça login na WebView.
2. Confira status **conectada**.
3. Em **Alertas/Perfil**, ligue as estratégias desejadas (só 3x3 por defeito).
4. Ajuste **lucro alvo %** (padrão 0,5% — só 3x3) e **% banca** hold (padrão 99% — Eventos raros).
5. Ligue **Auto Lay** (topbar).

Arquivos nativos: `BetBraPlugin.java` (`placeLay` / `placeBack`), `BetBraLoginActivity.java`.

Com sessão BetBra, Lay 3x3 e Eventos raros **não** publicam na fila da extensão (evita ordem dupla). QOV ainda pode ir para `/api/ext/signal`.

## Permissões no celular

Na primeira abertura o app pede:

- **Notificações** — obrigatório para alertas ENTRAR
- Toque em **Ativar alertas ENTRAR** no painel se o som ainda não estiver liberado

## Canais de notificação

| Canal            | Uso                          |
|------------------|------------------------------|
| `tips3x3-enter`  | Sinal ENTRAR (prioridade alta) |
| `tips3x3-goal`   | Gol em favorito              |
| `tips3x3-ft`     | Fim de jogo                  |

## Ícone da notificação

Android exige ícone monocromático em `mobile/android/app/src/main/res/drawable/ic_stat_tips3x3.png` (branco sobre transparente). Se faltar, o sistema usa o ícone do launcher.

## APK release (Play Store / assinado)

1. Crie um keystore:

```powershell
keytool -genkey -v -keystore tips3x3-release.keystore -alias tips3x3 -keyalg RSA -keysize 2048 -validity 10000
```

2. Configure `mobile/android/app/build.gradle` com `signingConfigs` (não commitar senhas — use variáveis de ambiente).

3. `cd mobile/android && gradlew.bat assembleRelease`

## Se o app “trava” ao abrir

Causas comuns (já mitigadas no shell):

1. **Splash Android 12+** sem `postSplashScreenTheme` — tela preta infinita
2. **Diálogo de notificação no boot** — pedimos permissão só ao tocar em **Ativar alertas ENTRAR**
3. **Sem internet / WebView lenta** — após ~12s a tela local mostra “Tentar de novo”
4. **`colors.xml` ausente** — recursos quebrados no tema

Gere um APK novo após essas correções (`npm run mobile:apk`).

## Limitações atuais

- **Tela desligada / app em background profundo:** mesmo com notificações permitidas e “Alertas ativos”, **não há push remoto**. O painel precisa estar vivo (poll ~10s) para detectar o sinal e só então agenda `LocalNotifications`. Com a tela off o WebView congela → nenhum alerta novo. Solução futura: Push FCM server-side.
- **App fechado / morto:** notificações e Auto Lay dependem do painel aberto / em segundo plano. Push FCM em background é evolução futura.
- **Green Back (Lay 3x3):** Lay + ordem Back alvo no APK. Match do Back depende da liquidez/mercado.
- **Sessão BetBra:** se o cookie expirar, reconecte em Config. Sinais com mais de ~45s são ignorados.
- **Código web:** bridge em produção na VPS — deploy necessário para o APK pegar `native-lay` atualizado.

## Comandos úteis

| Comando              | Descrição                    |
|----------------------|------------------------------|
| `npm run mobile:sync`| sync plugins + android       |
| `npm run mobile:open`| abre Android Studio          |
| `npm run mobile:apk` | APK debug                    |
