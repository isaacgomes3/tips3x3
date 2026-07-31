# App Android (APK) — Tips3x3

Shell nativo com [Capacitor](https://capacitorjs.com/) que carrega o painel em **https://tips3x3.com** e entrega **notificações locais**, vibração e status bar escura para alertas ENTRAR / gol / fim de jogo.

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
  android/              # projeto Gradle (gerado pelo Capacitor)
src/lib/native-alerts.ts   # bridge web ↔ notificações nativas
```

O código web (`native-alerts`, `useLiveAlerts`) roda **no servidor** — após alterações, faça deploy do Next.js na VPS antes de testar o APK em produção.

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

- **App fechado / morto:** notificações dependem do polling do painel aberto ou em segundo plano. Push FCM em background é evolução futura.
- **Entrada Lay 3x3 / Bolsa:** o APK **não executa apostas**. Ele só alerta (toast + notificação). A ordem automática exige Chrome no PC com a extensão **Bolsa Manual** logada no mesmo usuário. No WebView Android não existe extensão Chrome; o toggle “Sinal → PC” só publica em `/api/ext/signal` para o desktop claimar (TTL 90s).
- **Código web:** `native-alerts` / `bolsa-bridge` rodam no Next.js em produção — faça deploy da VPS para o APK pegar o bridge atualizado.

## Comandos úteis

| Comando              | Descrição                    |
|----------------------|------------------------------|
| `npm run mobile:sync`| sync plugins + android       |
| `npm run mobile:open`| abre Android Studio          |
| `npm run mobile:apk` | APK debug                    |
