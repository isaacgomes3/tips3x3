package com.tips3x3.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.webkit.CookieManager;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Mantém Auto Lay vivo com tela desligada: poll /api/live + placeLay/placeBack
 * nativos (WebView congelada não é necessária).
 */
public class AutoLayForegroundService extends Service {
  private static final String TAG = "AutoLayService";
  static final String PREFS = "tips3x3_autolay";
  static final String ACTION_START = "com.tips3x3.app.AUTOLAY_START";
  static final String ACTION_STOP = "com.tips3x3.app.AUTOLAY_STOP";
  static final String ACTION_TEST = "com.tips3x3.app.NOTIFICATION_TEST";
  // Novo ID: canais Android são imutáveis e atualizações preservam o estado do canal antigo.
  static final String CHANNEL_FG = "tips3x3-autolay-visible-v2";
  static final String CHANNEL_SESSION = "tips3x3-betbra-session-v1";
  static final String CHANNEL_SUREBET = "tips3x3-surebet-opportunity-v1";
  /** Resultado de ordem (canal próprio — não misturar com ENTRAR). */
  static final String CHANNEL_RESULT = "tips3x3-order-result-v3";
  /**
   * Canais v3: som de NOTIFICAÇÃO (não alarme/toque). IDs novos porque canais
   * Android são imutáveis após a 1ª criação.
   */
  static final String CHANNEL_ENTER_3X3 = "tips3x3-enter-3x3-v3";
  static final String CHANNEL_ENTER_RAROS = "tips3x3-enter-raros-v3";
  /** Teto duro Lay 3x3 no FGS (paridade com LAY_3X3_MAX_ODDS / janela 20–50). */
  private static final double LAY_3X3_MAX_ODDS = 50.0;
  /** Teto de odd do LOLP (paridade com oddsBand.max da estratégia). */
  private static final double LOLP_MAX_ODDS = 2.4;
  private static final int NOTIF_FG_ID = 33001;
  private static final int NOTIF_SESSION_ID = 33002;
  private static final String PREF_SESSION_WAS_ACTIVE = "betbra_session_was_active";
  private static final String PREF_SESSION_DROP_NOTIFIED = "betbra_session_drop_notified";
  static final String PREF_SESSION_BLOCKED = "betbra_session_blocked";
  private static final long SESSION_CHECK_MS = 60_000L;
  private static final long DEFAULT_POLL_MS = 10_000L;
  private static final long SUREBET_POLL_MS = 5_000L;
  private static final long SUREBET_CATALOG_REFRESH_MS = 5_000L;
  private static final String SENT_PREFIX = "sentat:";
  /** Entrada enviada não repete pelas próximas horas (evita reentrada). */
  private static final long SENT_TTL_MS = 6L * 60L * 60L * 1000L;
  private static final String PREF_NO_FUNDS_UNTIL = "no_funds_until";
  /** true = saldo preso em ops abertas; espera liberar (sem relógio fixo). */
  private static final String PREF_NO_FUNDS_SOFT = "no_funds_soft";
  private static final String PREF_ACTIVE_TRADE = "active_trade_json";
  private JSONArray cachedSurebetRows = new JSONArray();
  private long cachedSurebetAt = 0L;
  private int cachedSurebetEvents;
  private int cachedSurebetPages;
  private volatile JSONArray cachedFirstHalfRows = new JSONArray();
  private volatile long cachedFirstHalfAt;
  private volatile int cachedFirstHalfEvents;
  private volatile int cachedFirstHalfPages;
  private static final String POST_GOAL_STATE_PREFIX = "post_goal_state:";
  private static final long POST_GOAL_STABILIZATION_MS = 30_000L;
  /** O sinal pertence ao gol recente; depois de 3 min nao pode virar entrada tardia. */
  private static final long POST_GOAL_WINDOW_MS = 3L * 60L * 1000L;
  /**
   * Só quando a banca está realmente vazia (sem ops retendo saldo).
   * Se há Lay/hold em curso, a pausa dura até o saldo livre voltar.
   */
  private static final long NO_FUNDS_COOLDOWN_MS = 15L * 60L * 1000L;
  /** Ledger anti-abandono (Lay 3x3 sem Back concluído). */
  private static final long ACTIVE_TRADE_TTL_MS = 4L * 60L * 60L * 1000L;
  /** Abaixo disso não há como montar nem a stake mínima. */
  private static final double MIN_FREE_BALANCE = 2.0;
  /** Stake fixa default Lucro certo (responsabilidade R$). */
  private static final float DEFAULT_STAKE_FIXED_LC = 1001f;
  /** Stake fixa default Eventos raros (responsabilidade R$) — igual ao Lucro certo. */
  private static final float DEFAULT_STAKE_FIXED_ER = 500f;
  private static final int COLOR_GREEN = 0xFFD9FF00;
  private static final int COLOR_GOLD = 0xFFEAB308;

  private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final ExecutorService firstHalfIo = Executors.newSingleThreadExecutor();
  private final AtomicBoolean tickBusy = new AtomicBoolean(false);
  private final AtomicBoolean firstHalfBusy = new AtomicBoolean(false);
  private PowerManager.WakeLock wakeLock;
  private ConnectivityManager connectivityManager;
  private ConnectivityManager.NetworkCallback networkCallback;
  private BetBraTradeEngine engine;
  private long lastSessionCheckAt;
  private int consecutivePollFailures;
  private final Runnable tick =
      new Runnable() {
        @Override
        public void run() {
          if (!RUNNING.get()) return;
          schedulePoll();
          if (!tickBusy.compareAndSet(false, true)) return;
          prefs(AutoLayForegroundService.this)
              .edit()
              .putLong("lastScanStartedAt", System.currentTimeMillis())
              .apply();
          io.execute(
              () -> {
                try {
                  pollOnce();
                  consecutivePollFailures = 0;
                  prefs(AutoLayForegroundService.this)
                      .edit()
                      .putLong("lastScanCompletedAt", System.currentTimeMillis())
                      .putString("lastScanError", "")
                      .apply();
                } catch (Exception e) {
                  consecutivePollFailures++;
                  Log.w(TAG, "poll failed: " + e.getMessage());
                  prefs(AutoLayForegroundService.this)
                      .edit()
                      .putLong("lastScanCompletedAt", System.currentTimeMillis())
                      .putString(
                          "lastScanError",
                          e.getMessage() != null ? e.getMessage() : "falha de busca")
                      .apply();
                  if (BuildConfig.SUREBET_ONLY) {
                    updateFgText("Busca Surebet continua - nova tentativa em 5s");
                  }
                  else if (consecutivePollFailures >= 3) {
                    updateFgText("Auto Lay · conexão instável · reconectando");
                  }
                } finally {
                  tickBusy.set(false);
                  AutoLayWatchdogReceiver.schedule(AutoLayForegroundService.this, 120_000L);
                }
              });
        }
      };

  static boolean isRunning() {
    return RUNNING.get();
  }

  private static String exchangeName() {
    return BuildConfig.BOLSA_ONLY ? "Bolsa de Aposta" : "BetBra";
  }

  static SharedPreferences prefs(Context ctx) {
    return ctx.getApplicationContext().getSharedPreferences(PREFS, MODE_PRIVATE);
  }

  static void persistSettings(
      Context ctx,
      boolean autoOn,
      boolean lay3x3On,
      boolean eventosRarosOn,
      boolean lucroCertoOn,
      boolean layOverLimitPressureOn,
      boolean postGoalCorrectionOn,
      boolean qovOn,
      double stakeLay3x3Pct,
      double stakeFixedEr,
      double stakeFixedLc,
      double reservedLucroCerto,
      double profitPctPoints,
      double stakeLolpPct,
      double stakePostGoalPct,
      double lolpProfitPctPoints,
      double stakeQovPct,
      boolean over35On,
      boolean over45On,
      double stakeOver35Pct,
      double stakeOver45Pct,
      String apiBase) {
    float fixedLc = stakeFixedLc >= 1 ? (float) stakeFixedLc : DEFAULT_STAKE_FIXED_LC;
    float fixedEr = stakeFixedEr >= 1 ? (float) stakeFixedEr : DEFAULT_STAKE_FIXED_ER;
    float reserved =
        reservedLucroCerto >= 0 ? (float) reservedLucroCerto : fixedLc;
    prefs(ctx)
        .edit()
        .putBoolean("autoOn", autoOn)
        .putBoolean("lay3x3On", lay3x3On)
        .putBoolean("eventosRarosOn", eventosRarosOn)
        .putBoolean("lucroCertoOn", lucroCertoOn)
        .putBoolean("layOverLimitPressureOn", layOverLimitPressureOn)
        .putBoolean("postGoalCorrectionOn", postGoalCorrectionOn)
        .putBoolean("qovOn", qovOn)
        .putFloat("stakeQovPct", (float) (stakeQovPct > 0 ? stakeQovPct : 20))
        .putFloat("stakeLolpPct", (float) (stakeLolpPct > 0 ? stakeLolpPct : 5))
        .putFloat("stakePostGoalPct", (float) (stakePostGoalPct > 0 ? stakePostGoalPct : 5))
        .putFloat(
            "lolpProfitPctPoints",
            (float) (lolpProfitPctPoints > 0 ? lolpProfitPctPoints : 1))
        .putBoolean("over35On", over35On)
        .putBoolean("over45On", over45On)
        .putFloat("stakeOver35Pct", (float) (stakeOver35Pct > 0 ? stakeOver35Pct : 10))
        .putFloat("stakeOver45Pct", (float) (stakeOver45Pct > 0 ? stakeOver45Pct : 10))
        .putFloat("stakeLay3x3Pct", (float) stakeLay3x3Pct)
        .putFloat("stakeFixedEr", fixedEr)
        .putFloat("stakeFixedLc", fixedLc)
        .putFloat("reservedLucroCerto", reserved)
        .putFloat("profitPctPoints", (float) profitPctPoints)
        .putString("apiBase", apiBase != null && !apiBase.isEmpty() ? apiBase : "https://tips3x3.com")
        .apply();
    // Motor BetBra lê a reserva daqui (isola LC de 3x3 / Eventos raros).
    BetBraTradeEngine.setReservedLucroCerto(ctx, reserved);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    engine = new BetBraTradeEngine(this);
    // Versões anteriores podiam deixar uma pausa de saldo persistida.
    // A partir da v41, saldo insuficiente só bloqueia o ciclo atual.
    clearNoFundsCooldown();
    ensureChannels();
    registerNetworkCallback();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent != null ? intent.getAction() : ACTION_START;
    if (ACTION_STOP.equals(action)) {
      stopSelfSafe();
      return START_NOT_STICKY;
    }

    startAsForeground();
    RUNNING.set(true);
    acquireWakeLock();
    handler.removeCallbacks(tick);
    handler.post(tick);
    AutoLayWatchdogReceiver.schedule(this, 120_000L);
    if (ACTION_TEST.equals(action)) notifyTest();
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    RUNNING.set(false);
    handler.removeCallbacks(tick);
    releaseWakeLock();
    unregisterNetworkCallback();
    io.shutdownNow();
    firstHalfIo.shutdownNow();
    if (BuildConfig.SUREBET_ONLY || prefs(this).getBoolean("autoOn", false)) {
      AutoLayWatchdogReceiver.schedule(this, 15_000L);
    }
    super.onDestroy();
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    AutoLayWatchdogReceiver.schedule(this, 5_000L);
    super.onTaskRemoved(rootIntent);
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void stopSelfSafe() {
    RUNNING.set(false);
    handler.removeCallbacks(tick);
    releaseWakeLock();
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
    else stopForeground(true);
    stopSelf();
  }

  private void schedulePoll() {
    handler.removeCallbacks(tick);
    handler.postDelayed(tick, BuildConfig.SUREBET_ONLY ? SUREBET_POLL_MS : DEFAULT_POLL_MS);
  }

  private void startAsForeground() {
    boolean autoOn = prefs(this).getBoolean("autoOn", false);
    Notification n =
        buildFgNotification(
            BuildConfig.SUREBET_ONLY
                ? "Busca contínua · Match Odds + Resultado do 1º Tempo"
                : autoOn
                    ? "Auto Lay ativo · tela pode ficar desligada"
                    : "Monitor ativo · Auto Lay desligado");
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_FG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    } else {
      startForeground(NOTIF_FG_ID, n);
    }
  }

  private void updateFgText(String text) {
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm != null) nm.notify(NOTIF_FG_ID, buildFgNotification(text));
  }

  private Notification buildFgNotification(String text) {
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi =
        PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    return new NotificationCompat.Builder(this, CHANNEL_FG)
        .setContentTitle(
            BuildConfig.SUREBET_ONLY
                ? "Tips3x3 · Surebet " + (BuildConfig.BOLSA_ONLY ? "Bolsa" : "BetBra")
                : "Tips3x3 · Auto Lay")
        .setContentText(text)
        .setSmallIcon(R.drawable.ic_stat_tips3x3)
        .setContentIntent(pi)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .build();
  }

  private static Uri notificationSoundUri() {
    Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
    return u;
  }

  private static AudioAttributes notificationAudioAttrs() {
    return new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
  }

  private void ensureChannels() {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel fg =
        new NotificationChannel(
            CHANNEL_FG,
            BuildConfig.SUREBET_ONLY ? "Busca Surebet ativa" : "Auto Lay ativo",
            NotificationManager.IMPORTANCE_DEFAULT);
    fg.setDescription(
        BuildConfig.SUREBET_ONLY
            ? "Mantém a busca Surebet ativa com a tela desligada"
            : "Mantém o Auto Lay a operar com a tela desligada");
    fg.setSound(null, null);
    fg.enableVibration(false);
    fg.setShowBadge(false);
    fg.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(fg);

    Uri sound = notificationSoundUri();
    AudioAttributes attrs = notificationAudioAttrs();

    NotificationChannel result =
        new NotificationChannel(
            CHANNEL_RESULT, "Ordem Auto Lay", NotificationManager.IMPORTANCE_DEFAULT);
    result.setDescription("Resultado de ordens Lay/Back");
    result.enableVibration(true);
    if (sound != null) result.setSound(sound, attrs);
    nm.createNotificationChannel(result);

    NotificationChannel session =
        new NotificationChannel(
            CHANNEL_SESSION, "Login da Bolsa Exchange", NotificationManager.IMPORTANCE_HIGH);
    session.setDescription("Avisa quando a sessão da conta BetBra cair");
    session.enableVibration(true);
    session.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    if (sound != null) session.setSound(sound, attrs);
    nm.createNotificationChannel(session);

    NotificationChannel surebet =
        new NotificationChannel(
            CHANNEL_SUREBET, "Oportunidades Surebet", NotificationManager.IMPORTANCE_HIGH);
    surebet.setDescription("Match Odds e Resultado do 1º Tempo com arbitragem detectada");
    surebet.enableVibration(true);
    surebet.setVibrationPattern(new long[] {0, 100, 60, 100, 60, 220});
    surebet.enableLights(true);
    surebet.setLightColor(COLOR_GREEN);
    surebet.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    if (sound != null) surebet.setSound(sound, attrs);
    nm.createNotificationChannel(surebet);

    if (BuildConfig.SUREBET_ONLY) return;

    NotificationChannel enter3x3 =
        new NotificationChannel(
            CHANNEL_ENTER_3X3, "ENTRAR · Lay 3x3", NotificationManager.IMPORTANCE_HIGH);
    enter3x3.setDescription("Sinal ENTRAR Lay 3x3 (som de notificação)");
    enter3x3.enableVibration(true);
    enter3x3.setVibrationPattern(new long[] {0, 80, 40, 80, 40, 160});
    enter3x3.enableLights(true);
    enter3x3.setLightColor(COLOR_GREEN);
    enter3x3.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    if (sound != null) enter3x3.setSound(sound, attrs);
    nm.createNotificationChannel(enter3x3);

    NotificationChannel enterRaros =
        new NotificationChannel(
            CHANNEL_ENTER_RAROS, "ENTRAR · Eventos raros / LC", NotificationManager.IMPORTANCE_HIGH);
    enterRaros.setDescription("Sinal ENTRAR Eventos raros / Lucro certo (som de notificação)");
    enterRaros.enableVibration(true);
    enterRaros.setVibrationPattern(new long[] {0, 80, 40, 80, 40, 160});
    enterRaros.enableLights(true);
    enterRaros.setLightColor(COLOR_GOLD);
    enterRaros.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    if (sound != null) enterRaros.setSound(sound, attrs);
    nm.createNotificationChannel(enterRaros);
  }

  private void acquireWakeLock() {
    try {
      PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
      if (pm == null) return;
      if (wakeLock == null) {
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tips3x3:autolay");
        wakeLock.setReferenceCounted(false);
      }
      if (!wakeLock.isHeld()) wakeLock.acquire();
    } catch (Exception e) {
      Log.w(TAG, "wakeLock: " + e.getMessage());
    }
  }

  private void releaseWakeLock() {
    try {
      if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    } catch (Exception ignored) {
    }
  }

  private void registerNetworkCallback() {
    if (Build.VERSION.SDK_INT < 24) return;
    try {
      connectivityManager = getSystemService(ConnectivityManager.class);
      if (connectivityManager == null) return;
      networkCallback =
          new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
              handler.post(() -> restartPollingNow("rede disponivel"));
            }
          };
      connectivityManager.registerDefaultNetworkCallback(networkCallback);
    } catch (Exception e) {
      Log.w(TAG, "network callback: " + e.getMessage());
    }
  }

  private void unregisterNetworkCallback() {
    if (connectivityManager == null || networkCallback == null) return;
    try {
      connectivityManager.unregisterNetworkCallback(networkCallback);
    } catch (Exception ignored) {
    }
    networkCallback = null;
  }

  private void restartPollingNow(String reason) {
    if (!RUNNING.get()) return;
    Log.i(TAG, "poll imediato: " + reason);
    acquireWakeLock();
    handler.removeCallbacks(tick);
    handler.post(tick);
  }

  private void scheduleFirstHalfScan() {
    if (!BuildConfig.SUREBET_ONLY || firstHalfIo.isShutdown()) return;
    if (System.currentTimeMillis() - cachedFirstHalfAt < SUREBET_CATALOG_REFRESH_MS) return;
    if (!firstHalfBusy.compareAndSet(false, true)) return;
    firstHalfIo.execute(
        () -> {
          try {
            BetBraTradeEngine.SurebetScanResult scan =
                engine.listAllFirstHalfSurebetMarkets();
            cachedFirstHalfRows = scan.rows;
            cachedFirstHalfEvents = scan.events;
            cachedFirstHalfPages = scan.pages;
            cachedFirstHalfAt = System.currentTimeMillis();
          } catch (Exception error) {
            Log.w(TAG, "first-half scan: " + error.getMessage());
          } finally {
            firstHalfBusy.set(false);
          }
        });
  }

  private static void appendSurebetRowsDeduplicated(JSONArray target, JSONArray source) {
    if (target == null || source == null) return;
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < target.length(); i++) {
      JSONObject row = target.optJSONObject(i);
      JSONObject analysis = row != null ? row.optJSONObject("analysis") : null;
      if (analysis != null) {
        seen.add(
            analysis.optString("eventId", "")
                + ":"
                + analysis.optString("surebetMarketKind", "match-odds"));
      }
    }
    JSONArray snapshot;
    try {
      snapshot = new JSONArray(source.toString());
    } catch (Exception ignored) {
      return;
    }
    for (int i = 0; i < snapshot.length(); i++) {
      JSONObject row = snapshot.optJSONObject(i);
      JSONObject analysis = row != null ? row.optJSONObject("analysis") : null;
      if (analysis == null) continue;
      String key = analysis.optString("eventId", "")
          + ":" + analysis.optString("surebetMarketKind", "match-odds");
      if (seen.add(key)) target.put(row);
    }
  }

  /** Percorre todas as paginas live com deduplicacao e protecao contra loop. */
  private JSONArray fetchAllLiveRows(
      String apiBase, float profitPoints, float lolpProfitPoints) throws Exception {
    final int pageSize = 60;
    final int maxPages = 100;
    int offset = 0;
    JSONArray all = new JSONArray();
    Set<String> seenEvents = new HashSet<>();
    Set<Integer> seenOffsets = new HashSet<>();
    for (int page = 0; page < maxPages && seenOffsets.add(offset); page++) {
      String url =
          apiBase
              + "/api/live?limit=" + pageSize
              + "&offset=" + offset
              + "&profitPct=" + String.format(Locale.US, "%.4f", profitPoints)
              + "&lolpProfitPct="
              + String.format(Locale.US, "%.4f", lolpProfitPoints / 100.0);
      JSONObject response = httpGetJson(url);
      JSONArray pageRows = response != null ? response.optJSONArray("rows") : null;
      if (pageRows == null || pageRows.length() == 0) break;
      for (int i = 0; i < pageRows.length(); i++) {
        JSONObject row = pageRows.optJSONObject(i);
        JSONObject analysis = row != null ? row.optJSONObject("analysis") : null;
        String eventId = analysis != null ? analysis.optString("eventId", "") : "";
        String key = !eventId.isEmpty() ? eventId : row != null ? row.toString() : "";
        if (!key.isEmpty() && seenEvents.add(key)) all.put(row);
      }
      if (!response.optBoolean("hasMore", false)) break;
      int nextOffset = response.optInt("nextOffset", offset + pageRows.length());
      if (nextOffset <= offset) break;
      offset = nextOffset;
    }
    return all;
  }

  private void pollOnce() throws Exception {
    SharedPreferences p = prefs(this);
    // O monitor continua consultando /api/live; autoOn autoriza apenas ordens.
    boolean autoOn = p.getBoolean("autoOn", false);

    boolean lay3x3On = p.getBoolean("lay3x3On", true);
    boolean erOn = p.getBoolean("eventosRarosOn", true);
    boolean lcOn = p.getBoolean("lucroCertoOn", true);
    boolean lolpOn = p.getBoolean("layOverLimitPressureOn", true);
    boolean postGoalOn = p.getBoolean("postGoalCorrectionOn", false);
    boolean matchOddsSurebetOn = p.getBoolean("matchOddsSurebetOn", false);
    boolean qovOn = p.getBoolean("qovOn", true);
    boolean over35On = p.getBoolean("over35On", true);
    boolean over45On = p.getBoolean("over45On", true);
    if (BuildConfig.SUREBET_ONLY) {
      lay3x3On = false;
      erOn = false;
      lcOn = false;
      lolpOn = false;
      postGoalOn = false;
      qovOn = false;
      over35On = false;
      over45On = false;
      matchOddsSurebetOn = true;
    } else {
      matchOddsSurebetOn = false;
    }
    if (!lay3x3On && !erOn && !lcOn && !lolpOn && !postGoalOn
        && !matchOddsSurebetOn && !qovOn && !over35On && !over45On) {
      updateFgText("Auto Lay · nenhuma estratégia ligada");
      return;
    }

    checkBetBraSessionDrop();
    boolean sessionAvailable =
        !p.getBoolean(PREF_SESSION_BLOCKED, false) && engine.hasSession();
    /** Scanner e alertas ficam ativos; autoOn autoriza somente enviar apostas. */
    boolean hasSession = autoOn && sessionAvailable;
    float profitPoints = p.getFloat("profitPctPoints", 0.5f);
    float stake3x3 = p.getFloat("stakeLay3x3Pct", 20f);
    float stakeFixedEr = p.getFloat("stakeFixedEr", DEFAULT_STAKE_FIXED_ER);
    if (!(stakeFixedEr >= 1f)) stakeFixedEr = DEFAULT_STAKE_FIXED_ER;
    float stakeFixedLc = p.getFloat("stakeFixedLc", DEFAULT_STAKE_FIXED_LC);
    if (!(stakeFixedLc >= 1f)) stakeFixedLc = DEFAULT_STAKE_FIXED_LC;
    float stakeLolp = p.getFloat("stakeLolpPct", 5f);
    if (!(stakeLolp > 0f)) stakeLolp = 5f;
    float stakePostGoal = p.getFloat("stakePostGoalPct", 5f);
    if (!(stakePostGoal > 0f)) stakePostGoal = 5f;
    float matchOddsSurebetExposure = p.getFloat("matchOddsSurebetExposure", 100f);
    if (!(matchOddsSurebetExposure >= 3f)) matchOddsSurebetExposure = 100f;
    // Um único lucro-alvo, configurado exclusivamente no APK, para todos os
    // fluxos que abrem Lay e depois propõem Back.
    float lolpProfitPoints = profitPoints;
    float stakeQov = p.getFloat("stakeQovPct", 20f);
    if (!(stakeQov > 0f)) stakeQov = 20f;
    float stakeOver35 = p.getFloat("stakeOver35Pct", 10f);
    if (!(stakeOver35 > 0f)) stakeOver35 = 10f;
    float stakeOver45 = p.getFloat("stakeOver45Pct", 10f);
    if (!(stakeOver45 > 0f)) stakeOver45 = 10f;
    String apiBase = p.getString("apiBase", "https://tips3x3.com");
    if (apiBase.endsWith("/")) apiBase = apiBase.substring(0, apiBase.length() - 1);

    // Anti-abandono: retoma Back do green antes de aceitar novo Lay 3x3.
    if (hasSession && !BuildConfig.SUREBET_ONLY) {
      resumeActiveTradeIfNeeded(apiBase);
    }
    boolean greenBusy = !BuildConfig.SUREBET_ONLY && hasOpenGreenTrade();

    JSONArray rows;
    if (BuildConfig.SUREBET_ONLY) {
      long now = System.currentTimeMillis();
      if (sessionAvailable && now - cachedSurebetAt >= SUREBET_CATALOG_REFRESH_MS) {
        try {
          BetBraTradeEngine.SurebetScanResult scan = engine.listAllSurebetMarkets();
          cachedSurebetRows = scan.rows;
          cachedSurebetEvents = scan.events;
          cachedSurebetPages = scan.pages;
          cachedSurebetAt = now;
        } catch (Exception directError) {
          Log.w(TAG, "direct surebet scan: " + directError.getMessage());
          if (cachedSurebetRows.length() == 0) throw directError;
        }
      }
      rows = new JSONArray(cachedSurebetRows.toString());
      if (sessionAvailable) scheduleFirstHalfScan();
      appendSurebetRowsDeduplicated(rows, cachedFirstHalfRows);
    } else {
      rows = fetchAllLiveRows(apiBase, profitPoints, lolpProfitPoints);
      if (rows == null) {
        updateFgText("Auto Lay · a monitorar (sem rows)");
        return;
      }
    }

    Set<String> stillReady = new HashSet<>();
    int placed = 0;
    int surebetCandidates = 0;
    // Consultado uma única vez por ciclo, e só quando há candidato a enviar.
    double freeBalance = -1;
    boolean freeBalanceChecked = false;

    // Se o saldo estava preso em ops, libera assim que houver banca livre de novo.
    boolean noFundsNow = inNoFundsPause();
    if (noFundsNow && hasSession) {
      freeBalance = engine.freeBalanceEstimate(false);
      freeBalanceChecked = true;
      if (freeBalance >= MIN_FREE_BALANCE) {
        clearNoFundsCooldown();
        noFundsNow = false;
      }
    }
    boolean stopPlacing = noFundsNow;

    for (int i = 0; i < rows.length(); i++) {
      JSONObject row = rows.optJSONObject(i);
      if (row == null) continue;
      JSONObject analysis = row.optJSONObject("analysis");
      if (analysis == null) continue;
      String eventId = analysis.optString("eventId", "");
      if (eventId.isEmpty()) continue;
      String eventName =
          analysis.optString(
              "eventName",
              analysis.optString("home", "?") + " vs " + analysis.optString("away", "?"));
      String home = analysis.optString("home", "");
      String away = analysis.optString("away", "");
      String surebetPhase = row.optString("surebetPhase", "live");
      boolean surebetPhaseOn = "prelive".equals(surebetPhase)
          ? p.getBoolean("surebetPreliveOn", true)
          : p.getBoolean("surebetLiveOn", true);
      float surebetBankPct = "prelive".equals(surebetPhase)
          ? p.getFloat("surebetPreliveBankPct", 10f)
          : p.getFloat("surebetLiveBankPct", 10f);
      String surebetMarketKind = analysis.optString("surebetMarketKind", "match-odds");
      String scoreLabel = "";
      JSONObject liveSnap = row.optJSONObject("live");
      if (liveSnap != null) scoreLabel = liveSnap.optString("scoreLabel", "");
      int homeScore = liveSnap != null ? liveSnap.optInt("homeScore", -1) : -1;
      int awayScore = liveSnap != null ? liveSnap.optInt("awayScore", -1) : -1;
      int totalGoals = homeScore >= 0 && awayScore >= 0 ? homeScore + awayScore : -1;
      Double minute = null;
      String minuteHint = "";
      if (liveSnap != null && liveSnap.has("minute") && !liveSnap.isNull("minute")) {
        minute = liveSnap.optDouble("minute", 0);
        minuteHint = " @ " + minute.intValue() + "′";
      }

      // No modo live so entra com minuto confirmado e ate 60:00. Pre-live e
      // intervalo continuam obedecendo suas configuracoes independentes.
      boolean liveSurebetWindowOk = !"live".equals(surebetPhase)
          || (minute != null && minute >= 0 && minute <= 60.0);

      // Scanner Surebet independente do Auto: alerta imediatamente; autoOn
      // continua sendo a unica autorizacao para enviar as tres apostas Back.
      if (matchOddsSurebetOn && surebetPhaseOn && liveSurebetWindowOk
          && sessionAvailable) {
        JSONObject matchOdds = analysis.optJSONObject("matchOdds");
        // A trava pertence a esta combinacao de precos, nao ao evento inteiro.
        // Assim o mesmo jogo pode receber qualquer quantidade de novas surebets,
        // sem reenviar o mesmo lote a cada poll de 10 segundos.
        String key = matchOddsSurebetKey(eventId + ":" + surebetMarketKind + ":" + surebetPhase, matchOdds);
        String stateKey = "surebet_match_last:" + eventId + ":" + surebetMarketKind + ":" + surebetPhase;
        String alertStateKey =
            "surebet_alert_last:" + eventId + ":" + surebetMarketKind + ":" + surebetPhase;
        boolean surebetReady = looksLikeMatchOddsSurebet(matchOdds);
        if (!surebetReady) {
          // Ao desaparecer, a mesma combinacao pode voltar depois e sera uma
          // nova oportunidade; nao existe TTL de seis horas neste filtro.
          p.edit().remove(stateKey).remove(alertStateKey).apply();
        }
        if (surebetReady) {
          surebetCandidates++;
          String lastAlert = p.getString(alertStateKey, "");
          if (!key.equals(lastAlert)) {
            notifySurebetOpportunity(
                eventName, surebetMarketKind, surebetPhase, minute, matchOdds);
            p.edit().putString(alertStateKey, key).apply();
          }
        }
        String lastSurebet = p.getString(stateKey, "");
        if (surebetReady && hasSession && !stopPlacing && !greenBusy
            && !key.equals(lastSurebet)) {
          double balance = engine.freeBalanceEstimate(false);
          double surebetExposure = balance > 0 ? balance * Math.max(0, surebetBankPct) / 100.0 : 0;
          JSONObject surebet = engine.placeMatchOddsSurebet(
              eventId, matchOdds, surebetExposure, surebetMarketKind,
              "live".equals(surebetPhase));
          if (surebet.optBoolean("ok", false)) {
            p.edit().putString(stateKey, key).apply();
            placed++;
            double total = surebet.optDouble("totalStake", 0);
            double net = surebet.optDouble("estimatedNetProfit", 0);
            recordSurebetIndication(
                apiBase, eventId, eventName, surebetMarketKind,
                total, net, surebet.optJSONArray("legs"), "surebet-betbra");
            notifyResult(
                true,
                surebetProfitTitle(total, net),
                eventName
                    + " · exposicao R$ "
                    + String.format(Locale.US, "%.2f", total)
                    + " · lucro liquido estimado R$ "
                    + String.format(Locale.US, "%.2f", net)
                    + " · confirmando correspondencia");
            scheduleMatchOddsSurebetGreen(eventId, eventName, surebet);
          } else if (isSessionExpiredError(surebet.optString("error", ""))) {
            handleExpiredSession();
          }
        }
      }

      // Jogos futuros sao exclusivos da Surebet; os demais filtros continuam live-only.
      if (row.optBoolean("surebetOnly", false)) continue;

      if (lay3x3On) {
        JSONObject plan = row.optJSONObject("tradePlan");
        if (plan != null && plan.optBoolean("entryReady", false)) {
          String key = eventId + ":lay-3x3";
          stillReady.add(key);
          double layOdds = plan.optDouble("layOdds", analysis.optDouble("layOdds", 0));
          double profitFrac = profitPoints / 100.0;
          Double configuredBack =
              BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
          double targetBack = configuredBack != null ? configuredBack : 0;
          String marketId = analysis.optString("marketId", "");
          String runnerId = analysis.optString("runnerId", "");
          // Guarda nativa: nunca Lay 3x3 acima do teto (ex.: odd 90 com máx 50).
          boolean oddsInBand =
              layOdds > 1.01 && layOdds <= LAY_3X3_MAX_ODDS + 0.009;
          if (oddsInBand) {
            if (!wasNotified(key)) {
              String body =
                  (scoreLabel.isEmpty() ? "Lay→Back" : "Lay→Back · " + scoreLabel)
                      + minuteHint
                      + " · lay x"
                      + formatOdd(layOdds)
                      + (targetBack > 1.01 ? " → back x" + formatOdd(targetBack) : "")
                      + " · "
                      + String.format(Locale.US, "%.1f", profitFrac * 100).replace('.', ',')
                      + "%";
              notifyEnter(
                  false,
                  "ENTRAR · LAY 3x3 · " + eventName,
                  body);
              markNotified(key);
            }

            if (hasSession
                && !stopPlacing
                && !greenBusy
                && !wasSent(key)) {
              if (!freeBalanceChecked) {
                freeBalance = engine.freeBalanceEstimate(false);
                freeBalanceChecked = true;
              }
              if (freeBalance >= 0 && freeBalance < MIN_FREE_BALANCE) {
                stopPlacing = true;
                noFundsNow = true;
                beginNoFundsPause();
              } else {
                PlaceOutcome out =
                    executeGreen(
                        eventId,
                        eventName,
                        home,
                        away,
                        scoreLabel,
                        minute,
                        layOdds,
                        marketId,
                        runnerId,
                        targetBack,
                        profitFrac,
                        stake3x3,
                        apiBase);
                if (!out.sessionExpired) markSent(key);
                if (out.ok) {
                  placed++;
                  clearNoFundsCooldown();
                  greenBusy = hasOpenGreenTrade();
                }
                if (out.noFunds) {
                  stopPlacing = true;
                  noFundsNow = true;
                  beginNoFundsPause();
                }
              }
            }
          }
        }
      }

      if ((erOn || lcOn) && !stopPlacing) {
        JSONObject er = row.optJSONObject("eventosRaros");
        if (er != null && !er.optBoolean("settled", false)) {
          JSONArray entries = er.optJSONArray("entries");
          if (entries != null) {
            for (int j = 0; j < entries.length(); j++) {
              if (stopPlacing) break;
              JSONObject e = entries.optJSONObject(j);
              if (e == null || !e.optBoolean("entryReady", false)) continue;
              String score = e.optString("label", "");
              if (score.isEmpty()) continue;
              boolean immediate = e.optBoolean("alreadyImpossible", false);
              if (immediate && !lcOn) continue;
              if (!immediate && !erOn) continue;
              String key =
                  eventId
                      + (immediate ? ":lucro-certo:" : ":eventos-raros:")
                      + score;
              stillReady.add(key);
              double layOdds = e.optDouble("layOdds", 0);

              if (!wasNotified(key)) {
                String title =
                    immediate
                        ? "LUCRO CERTO · " + score + " · " + eventName
                        : "ENTRAR · EVENTOS RAROS · " + score + " · " + eventName;
                String body =
                    (scoreLabel.isEmpty() ? "Lay " + score : scoreLabel + " · lay " + score)
                        + minuteHint
                        + (layOdds > 1 ? " · x" + formatOdd(layOdds) : "")
                        + " · fixo R$ "
                        + String.format(
                            Locale.US, "%.0f", immediate ? stakeFixedLc : stakeFixedEr);
                notifyEnter(true, title, body);
                markNotified(key);
              }

              if (hasSession && !stopPlacing && !wasSent(key) && layOdds > 1.01) {
                double fixedStake = immediate ? stakeFixedLc : stakeFixedEr;
                double need = fixedStake;
                double balForEntry;
                if (immediate) {
                  // LC gasta só a carteira reservada.
                  balForEntry = engine.freeBalanceEstimate(true);
                } else {
                  if (!freeBalanceChecked) {
                    freeBalance = engine.freeBalanceEstimate(false);
                    freeBalanceChecked = true;
                  }
                  balForEntry = freeBalance;
                }
                if (balForEntry >= 0 && balForEntry < need) {
                  if (immediate) {
                    // Sem fundos na carteira LC: não pausa green/ER.
                    continue;
                  }
                  stopPlacing = true;
                  noFundsNow = true;
                  beginNoFundsPause();
                  continue;
                }
                PlaceOutcome out =
                    executeHold(
                        eventId,
                        eventName,
                        home,
                        away,
                        scoreLabel,
                        minute,
                        score,
                        layOdds,
                        e.optString("marketId", ""),
                        e.optString("runnerId", ""),
                        0,
                        fixedStake,
                        immediate,
                        apiBase);
                if (!out.sessionExpired) markSent(key);
                if (out.ok) {
                  placed++;
                  clearNoFundsCooldown();
                  freeBalanceChecked = false;
                }
                if (out.noFunds) {
                  stopPlacing = true;
                  noFundsNow = true;
                  beginNoFundsPause();
                }
              }
            }
          }
        }
      }

      if (qovOn && !stopPlacing && !greenBusy) {
        JSONObject qov = row.optJSONObject("qovLayUnderdog");
        if (qov != null
            && qov.optBoolean("entryReady", false)
            && !qov.optBoolean("settled", false)) {
          double layOdds = qov.optDouble("entryOdds", qov.optDouble("layOdds", 0));
          String qovMarketId = qov.optString("marketId", "");
          String qovRunnerId = qov.optString("runnerId", "");
          String dogSide = qov.optString("underdogSide", "");
          // Sem mercado/runner o motor cairia no Correct Score 3-3 — ordem errada.
          if (layOdds > 1.01
              && !qovMarketId.isEmpty()
              && !qovRunnerId.isEmpty()
              && ("home".equals(dogSide) || "away".equals(dogSide))) {
            String selection = "home".equals(dogSide) ? "QOV Casa" : "QOV Fora";
            String key = eventId + ":qov-lay-zebra";
            stillReady.add(key);

            double profitFrac = profitPoints / 100.0;
            Double configuredBack =
                BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
            double targetBack = configuredBack != null ? configuredBack : 0;

            if (!wasNotified(key)) {
              String body =
                  (scoreLabel.isEmpty() ? "Lay→Back" : "Lay→Back · " + scoreLabel)
                      + minuteHint
                      + " · lay x"
                      + formatOdd(layOdds)
                      + (targetBack > 1.01 ? " → back x" + formatOdd(targetBack) : "")
                      + " · "
                      + String.format(Locale.US, "%.1f", profitFrac * 100).replace('.', ',')
                      + "%";
              notifyEnter(
                  false, "ENTRAR · LAY " + selection + " · " + eventName, body);
              markNotified(key);
            }

            if (hasSession && !wasSent(key)) {
              if (!freeBalanceChecked) {
                freeBalance = engine.freeBalanceEstimate(false);
                freeBalanceChecked = true;
              }
              if (freeBalance >= 0 && freeBalance < MIN_FREE_BALANCE) {
                stopPlacing = true;
                noFundsNow = true;
                beginNoFundsPause();
              } else {
                PlaceOutcome out =
                    executeGreen(
                        eventId,
                        eventName,
                        home,
                        away,
                        scoreLabel,
                        minute,
                        layOdds,
                        qovMarketId,
                        qovRunnerId,
                        targetBack,
                        profitFrac,
                        stakeQov,
                        apiBase,
                        selection,
                        "qov-lay-zebra",
                        "Lay " + selection);
                markSent(key);
                if (out.ok) {
                  placed++;
                  clearNoFundsCooldown();
                  greenBusy = hasOpenGreenTrade();
                }
                if (out.noFunds) {
                  stopPlacing = true;
                  noFundsNow = true;
                  beginNoFundsPause();
                }
              }
            }
          }
        }
      }

      // Correção pós-gol: o APK confirma o novo placar em dois polls e espera
      // 30 s. A API escolhe exclusivamente um mercado Over já estabilizado.
      boolean postGoalWindowReady = updatePostGoalState(eventId, totalGoals);
      if (postGoalOn && postGoalWindowReady && !stopPlacing && !greenBusy) {
        JSONObject postGoal = row.optJSONObject("postGoalCorrection");
        JSONObject selected = postGoal != null ? postGoal.optJSONObject("selected") : null;
        if (selected != null && selected.optBoolean("stable", false)) {
          double lineValue = selected.optDouble("line", -1);
          double layOdds = selected.optDouble("layOdds", 0);
          String marketId = selected.optString("marketId", "");
          String runnerId = selected.optString("runnerId", "");
          // Trava final no aparelho: a linha deve manter exatamente dois gols
          // inteiros de margem. Ex.: placar com 1 gol -> somente Over 3.5.
          double requiredLine = totalGoals + 2.5;
          if (Math.abs(lineValue - requiredLine) < 0.001
              && layOdds > 1.01
              && !marketId.isEmpty()
              && !runnerId.isEmpty()) {
            String selection = "Over " + String.format(Locale.US, "%.1f", lineValue);
            String key = eventId + ":correcao-pos-gol:" + totalGoals;
            stillReady.add(key);
            double profitFrac = profitPoints / 100.0;
            Double configuredBack =
                BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
            double targetBack = configuredBack != null ? configuredBack : 0;

            if (!wasNotified(key)) {
              notifyEnter(
                  false,
                  "ENTRAR · CORREÇÃO PÓS-GOL · LAY " + selection + " · " + eventName,
                  (scoreLabel.isEmpty() ? "Gol confirmado" : scoreLabel)
                      + minuteHint
                      + " · lay x"
                      + formatOdd(layOdds)
                      + (targetBack > 1.01 ? " → back x" + formatOdd(targetBack) : "")
                      + " · "
                      + String.format(Locale.US, "%.1f", profitFrac * 100).replace('.', ',')
                      + "%");
              markNotified(key);
            }

            if (hasSession && !wasSent(key)) {
              if (!freeBalanceChecked) {
                freeBalance = engine.freeBalanceEstimate(false);
                freeBalanceChecked = true;
              }
              if (freeBalance >= 0 && freeBalance < MIN_FREE_BALANCE) {
                stopPlacing = true;
                noFundsNow = true;
                beginNoFundsPause();
              } else {
                PlaceOutcome out =
                    executeGreen(
                        eventId,
                        eventName,
                        home,
                        away,
                        scoreLabel,
                        minute,
                        layOdds,
                        marketId,
                        runnerId,
                        targetBack,
                        profitFrac,
                        stakePostGoal,
                        apiBase,
                        selection,
                        "correcao-pos-gol",
                        "Correção pós-gol · Lay " + selection);
                markSent(key);
                if (out.ok) {
                  markPostGoalEntered(eventId, totalGoals);
                  placed++;
                  clearNoFundsCooldown();
                  greenBusy = hasOpenGreenTrade();
                }
                if (out.noFunds) {
                  stopPlacing = true;
                  noFundsNow = true;
                  beginNoFundsPause();
                }
              }
            }
          }
        }
      }

      if (lolpOn && !stopPlacing) {
        JSONArray lolp = row.optJSONArray("layOverLimitPressure");
        for (int j = 0; lolp != null && j < lolp.length(); j++) {
          if (stopPlacing || greenBusy) break;
          JSONObject snap = lolp.optJSONObject(j);
          if (snap == null) continue;
          if (!snap.optBoolean("entryReady", false)
              || snap.optBoolean("settled", false)) continue;

          double lineValue = snap.optDouble("line", -1);
          if (!(lineValue > 0)) continue;
          double layOdds = snap.optDouble("layOdds", 0);
          // Guarda de exposição: fora da faixa a responsabilidade por stake dispara.
          if (!(layOdds > 1.01) || layOdds > LOLP_MAX_ODDS + 0.009) continue;

          String lolpMarketId = snap.optString("marketId", "");
          String lolpRunnerId = snap.optString("runnerId", "");
          // Sem mercado/runner o motor procuraria Correct Score — ordem errada.
          if (lolpMarketId.isEmpty() || lolpRunnerId.isEmpty()) continue;

          String selection = "Over " + String.format(Locale.US, "%.1f", lineValue);
          String key = eventId + ":lay-over-limit-pressure:" + selection;
          stillReady.add(key);

          double profitFrac = profitPoints / 100.0;
          Double configuredBack =
              BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
          double targetBack = configuredBack != null ? configuredBack : 0;

          if (!wasNotified(key)) {
            String body =
                (scoreLabel.isEmpty() ? "Lay→Back" : "Lay→Back · " + scoreLabel)
                    + minuteHint
                    + " · lay x"
                    + formatOdd(layOdds)
                    + (targetBack > 1.01 ? " → back x" + formatOdd(targetBack) : "")
                    + " · "
                    + String.format(Locale.US, "%.1f", profitFrac * 100).replace('.', ',')
                    + "%";
            notifyEnter(
                false, "ENTRAR · LAY " + selection + " PRESSÃO · " + eventName, body);
            markNotified(key);
          }

          if (hasSession && !wasSent(key)) {
            if (!freeBalanceChecked) {
              freeBalance = engine.freeBalanceEstimate(false);
              freeBalanceChecked = true;
            }
            if (freeBalance >= 0 && freeBalance < MIN_FREE_BALANCE) {
              stopPlacing = true;
              noFundsNow = true;
              beginNoFundsPause();
              continue;
            }
            PlaceOutcome out =
                executeGreen(
                    eventId,
                    eventName,
                    home,
                    away,
                    scoreLabel,
                    minute,
                    layOdds,
                    lolpMarketId,
                    lolpRunnerId,
                    targetBack,
                    profitFrac,
                    stakeLolp,
                    apiBase,
                    selection,
                    "lay-over-limit-pressure",
                    "Lay " + selection);
            markSent(key);
            if (out.ok) {
              placed++;
              clearNoFundsCooldown();
              greenBusy = hasOpenGreenTrade();
            }
            if (out.noFunds) {
              stopPlacing = true;
              noFundsNow = true;
              beginNoFundsPause();
            }
          }
        }
      }

      // Lay Over 3.5 / 4.5 — filtros independentes (cada linha com seu próprio
      // mercado, gate e % de banca; um não depende do outro estar pronto).
      if ((over35On || over45On) && !stopPlacing) {
        double[] overLines = {3.5, 4.5};
        boolean[] overOns = {over35On, over45On};
        float[] overStakes = {stakeOver35, stakeOver45};
        String[] overFields = {"overLimite35", "overLimite45"};
        for (int oi = 0; oi < overLines.length; oi++) {
          if (stopPlacing || greenBusy) break;
          if (!overOns[oi]) continue;
          JSONObject snap = row.optJSONObject(overFields[oi]);
          if (snap == null) continue;
          if (!snap.optBoolean("entryReady", false) || snap.optBoolean("settled", false)) continue;

          double layOdds = snap.optDouble("layOdds", 0);
          if (!(layOdds > 1.01) || layOdds > LOLP_MAX_ODDS + 0.009) continue;

          String marketId = snap.optString("marketId", "");
          String runnerId = snap.optString("runnerId", "");
          if (marketId.isEmpty() || runnerId.isEmpty()) continue;

          String selection = "Over " + String.format(Locale.US, "%.1f", overLines[oi]);
          String kind = "over-" + String.format(Locale.US, "%.1f", overLines[oi]);
          String key = eventId + ":" + kind;
          stillReady.add(key);

          double profitFrac = profitPoints / 100.0;
          Double configuredBack =
              BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
          double targetBack = configuredBack != null ? configuredBack : 0;

          if (!wasNotified(key)) {
            String body =
                (scoreLabel.isEmpty() ? "Lay→Back" : "Lay→Back · " + scoreLabel)
                    + minuteHint
                    + " · lay x"
                    + formatOdd(layOdds)
                    + (targetBack > 1.01 ? " → back x" + formatOdd(targetBack) : "")
                    + " · "
                    + String.format(Locale.US, "%.1f", profitFrac * 100).replace('.', ',')
                    + "%";
            notifyEnter(false, "ENTRAR · LAY " + selection + " · " + eventName, body);
            markNotified(key);
          }

          if (hasSession && !wasSent(key)) {
            if (!freeBalanceChecked) {
              freeBalance = engine.freeBalanceEstimate(false);
              freeBalanceChecked = true;
            }
            if (freeBalance >= 0 && freeBalance < MIN_FREE_BALANCE) {
              stopPlacing = true;
              noFundsNow = true;
              beginNoFundsPause();
              continue;
            }
            PlaceOutcome out =
                executeGreen(
                    eventId,
                    eventName,
                    home,
                    away,
                    scoreLabel,
                    minute,
                    layOdds,
                    marketId,
                    runnerId,
                    targetBack,
                    profitFrac,
                    overStakes[oi],
                    apiBase,
                    selection,
                    kind,
                    "Lay " + selection);
            markSent(key);
            if (out.ok) {
              placed++;
              clearNoFundsCooldown();
              greenBusy = hasOpenGreenTrade();
            }
            if (out.noFunds) {
              stopPlacing = true;
              noFundsNow = true;
              beginNoFundsPause();
            }
          }
        }
      }
    }

    pruneSentKeys();
    pruneKeys("notif:", stillReady);
    int entries = 0;
    for (int i = 0; i < rows.length(); i++) {
      JSONObject row = rows.optJSONObject(i);
      if (row != null && row.optBoolean("confirmed", false)) entries++;
    }
    p.edit()
        .putInt("lastScanMarkets", rows.length())
        .putInt(
            "lastScanEvents",
            BuildConfig.SUREBET_ONLY
                ? Math.max(cachedSurebetEvents, cachedFirstHalfEvents)
                : rows.length())
        .putInt(
            "lastScanPages",
            BuildConfig.SUREBET_ONLY ? cachedSurebetPages + cachedFirstHalfPages : 0)
        .putInt("lastScanFirstHalfMarkets", cachedFirstHalfRows.length())
        .putBoolean("firstHalfScanBusy", firstHalfBusy.get())
        .putInt("lastScanCandidates", surebetCandidates)
        .apply();
    if (BuildConfig.SUREBET_ONLY) {
      if (!sessionAvailable) {
        updateFgText("Busca pausada · reconecte a " + exchangeName());
      } else {
        String execution = autoOn ? "auto ativo" : "somente alertas";
        updateFgText(
            "Busca 5s · "
                + cachedSurebetEvents
                + " jogos · "
                + rows.length()
                + " mercados (1T "
                + cachedFirstHalfRows.length()
                + ") · "
                + surebetCandidates
                + " oportunidade(s) · "
                + execution);
      }
      return;
    }
    if (!autoOn) {
      updateFgText("Monitor ativo · Auto Lay desligado · a notificar sinais");
    } else if (!hasSession) {
      updateFgText("Auto Lay · " + exchangeName() + " desconectada · a notificar sinais");
    } else if (noFundsNow) {
      updateFgText(noFundsStatusText());
    } else if (greenBusy) {
      JSONObject busyTrade = loadActiveTrade();
      String busyPhase = busyTrade != null ? busyTrade.optString("phase", "") : "";
      if ("back_sent".equals(busyPhase)) {
        updateFgText("Auto Lay · Back proposto · aguardando casar");
      } else if ("awaiting_back".equals(busyPhase)) {
        updateFgText("Auto Lay · Lay casado · propondo Back");
      } else {
        updateFgText("Auto Lay · Lay proposto · aguardando casar");
      }
    } else {
      updateFgText(
          placed > 0
              ? "Auto Lay · " + placed + " ordem(ns) neste ciclo"
              : "Auto Lay ativo · " + entries + " entrada(s) · poll 10s");
    }
  }

  private void checkBetBraSessionDrop() {
    long now = System.currentTimeMillis();
    if (now - lastSessionCheckAt < SESSION_CHECK_MS) return;
    lastSessionCheckAt = now;
    int state = engine.probeSessionState();
    SharedPreferences p = prefs(this);
    if (state == BetBraTradeEngine.SESSION_ACTIVE) {
      p.edit()
          .putBoolean(PREF_SESSION_WAS_ACTIVE, true)
          .putBoolean(PREF_SESSION_DROP_NOTIFIED, false)
          .putBoolean(PREF_SESSION_BLOCKED, false)
          .apply();
      return;
    }
    if (state != BetBraTradeEngine.SESSION_EXPIRED) return;
    p.edit().putBoolean(PREF_SESSION_BLOCKED, true).apply();
    boolean wasActive = p.getBoolean(PREF_SESSION_WAS_ACTIVE, false);
    boolean notified = p.getBoolean(PREF_SESSION_DROP_NOTIFIED, false);
    if (!wasActive || notified) return;
    notifySessionDropped();
    p.edit().putBoolean(PREF_SESSION_DROP_NOTIFIED, true).apply();
  }

  private void notifySessionDropped() {
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi =
        PendingIntent.getActivity(
            this,
            91,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification n =
        new NotificationCompat.Builder(this, CHANNEL_SESSION)
            .setSmallIcon(R.drawable.ic_stat_tips3x3)
            .setContentTitle(exchangeName() + " desconectada")
            .setContentText("O login da sua conta caiu. Abra o Tips3x3 e toque em Reconectar.")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm != null) nm.notify(NOTIF_SESSION_ID, n);
  }

  private void notifyTest() {
    Notification n =
        new NotificationCompat.Builder(this, CHANNEL_SESSION)
            .setSmallIcon(R.drawable.ic_stat_tips3x3)
            .setContentTitle("Tips3x3 · notificações funcionando")
            .setContentText("O monitor do APK está ativo neste aparelho.")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm != null) nm.notify(NOTIF_SESSION_ID + 1, n);
  }

  private static final class PlaceOutcome {
    final boolean ok;
    final boolean noFunds;
    final boolean sessionExpired;

    PlaceOutcome(boolean ok, boolean noFunds) {
      this(ok, noFunds, false);
    }

    PlaceOutcome(boolean ok, boolean noFunds, boolean sessionExpired) {
      this.ok = ok;
      this.noFunds = noFunds;
      this.sessionExpired = sessionExpired;
    }
  }

  private static boolean isNoFundsError(String err) {
    if (err == null) return false;
    String u = err.toUpperCase(Locale.ROOT);
    return u.contains("INSUFFICIENT")
        || u.contains("SALDO LIVRE")
        || u.contains("SALDO INDISPON")
        || u.contains("STAKE FIXA")
        || u.contains("FUNDOS");
  }

  private static boolean isSessionExpiredError(String err) {
    if (err == null) return false;
    String u = err.toUpperCase(Locale.ROOT);
    return u.contains("SESSÃO BETBRA EXPIRADA")
        || u.contains("SESSAO BETBRA EXPIRADA")
        || u.contains("UNAUTHORIZED")
        || u.contains("HTTP 401")
        || u.contains("HTTP 403");
  }

  private void handleExpiredSession() {
    SharedPreferences p = prefs(this);
    boolean notified = p.getBoolean(PREF_SESSION_DROP_NOTIFIED, false);
    p.edit()
        .putBoolean(PREF_SESSION_BLOCKED, true)
        .putBoolean(PREF_SESSION_DROP_NOTIFIED, true)
        .apply();
    updateFgText("Auto Lay pausado · reconecte a " + exchangeName());
    if (!notified) notifySessionDropped();
  }

  private PlaceOutcome executeGreen(
      String eventId,
      String eventName,
      String home,
      String away,
      String liveScore,
      Double minute,
      double layOdds,
      String marketId,
      String runnerId,
      double targetBackOdds,
      double profitFrac,
      double stakePct,
      String apiBase) {
    return executeGreen(
        eventId,
        eventName,
        home,
        away,
        liveScore,
        minute,
        layOdds,
        marketId,
        runnerId,
        targetBackOdds,
        profitFrac,
        stakePct,
        apiBase,
        "3-3",
        "lay-3x3",
        "Lay 3x3");
  }

  /**
   * Lay + Back alvo. `selection` é o runner (placar 3-3 ou "Over 2.5") e `kind` a
   * estratégia que fica gravada na operação para a indicação sair com o rótulo
   * certo quando o Lay casar.
   */
  private PlaceOutcome executeGreen(
      String eventId,
      String eventName,
      String home,
      String away,
      String liveScore,
      Double minute,
      double layOdds,
      String marketId,
      String runnerId,
      double targetBackOdds,
      double profitFrac,
      double stakePct,
      String apiBase,
      String selection,
      String kind,
      String opLabel) {
    try {
      JSONObject lay =
          engine.placeLay(eventId, selection, layOdds, marketId, runnerId, stakePct);
      if (!lay.optBoolean("ok", false)) {
        String err = lay.optString("error", "erro");
        notifyResult(false, opLabel + " falhou", eventName + " · " + err);
        return new PlaceOutcome(false, isNoFundsError(err));
      }
      double placedLayOdds = lay.optDouble("odds", layOdds);
      double layStake = lay.optDouble("stake", 0);
      double liability = lay.optDouble("liability", 0);
      String mId = lay.optString("marketId", marketId);
      String rId = lay.optString("runnerId", runnerId);
      String layOfferId = lay.optString("offerId", "");
      String layBetId = lay.optString("betId", "");
      // Pedido no book — NÃO registra indicação/UI de entrada até casar (valor exato).
      Double targetBack =
          targetBackOdds > 1.01
              ? targetBackOdds
              : BetBraTradeEngine.targetBackForLiabilityProfit(placedLayOdds, profitFrac);
      if (targetBack == null || !(layStake > 0)) {
        saveActiveTrade(
            eventId,
            eventName,
            selection,
            kind,
            placedLayOdds,
            layStake,
            liability,
            mId,
            rId,
            0,
            0,
            profitFrac,
            "lay_sent",
            false,
            layOfferId,
            layBetId,
            home,
            away,
            minute,
            liveScore,
            apiBase);
        notifyResult(
            true,
            opLabel + " no book · aguarda casar",
            eventName + " · pedido x" + placedLayOdds);
        return new PlaceOutcome(true, false);
      }
      // Back só depois do Lay casar — stake recalculada com size matched.
      Double backStakeRaw =
          BetBraTradeEngine.greenBackStake(layStake, placedLayOdds, targetBack);
      double backStake =
          backStakeRaw != null
              ? Math.max(1, Math.round(backStakeRaw * 100.0) / 100.0)
              : 0;
      saveActiveTrade(
          eventId,
          eventName,
          selection,
          kind,
          placedLayOdds,
          layStake,
          liability,
          mId,
          rId,
          targetBack,
          backStake,
          profitFrac,
          "awaiting_lay_match",
          false,
          layOfferId,
          layBetId,
          home,
          away,
          minute,
          liveScore,
          apiBase);
      notifyResult(
          true,
          opLabel + " no book · aguarda casar → Back",
          eventName
              + " · pedido x"
              + placedLayOdds
              + (targetBack > 1.01
                  ? " → back alvo x" + String.format(Locale.US, "%.2f", targetBack)
                  : ""));
      return new PlaceOutcome(true, false);
    } catch (Exception e) {
      notifyResult(false, opLabel + " falhou", eventName + " · " + e.getMessage());
      return new PlaceOutcome(false, isNoFundsError(e.getMessage()));
    }
  }

  private PlaceOutcome executeHold(
      String eventId,
      String eventName,
      String home,
      String away,
      String liveScore,
      Double minute,
      String score,
      double layOdds,
      String marketId,
      String runnerId,
      double stakePct,
      double fixedLiability,
      boolean alreadyImpossible,
      String apiBase) {
    try {
      JSONObject lay =
          engine.placeLay(
              eventId, score, layOdds, marketId, runnerId, stakePct, fixedLiability);
      boolean ok = lay.optBoolean("ok", false);
      String err = lay.optString("error", "erro");
      boolean sessionExpired = !ok && isSessionExpiredError(err);
      if (sessionExpired) handleExpiredSession();
      if (!sessionExpired) {
        notifyResult(
            ok,
            ok
                ? (alreadyImpossible ? "Lay lucro certo enviado" : "Lay hold enviado")
                : (alreadyImpossible ? "Lucro certo falhou" : "Eventos raros falhou"),
            ok
                ? eventName
                    + " · "
                    + score
                    + " x"
                    + lay.optDouble("odds", layOdds)
                    + (fixedLiability >= 1
                        ? " · resp R$ " + String.format(Locale.US, "%.0f", fixedLiability)
                        : "")
                : eventName + " · " + err);
      }
      if (ok) {
        recordIndication(
            apiBase,
            alreadyImpossible ? "lucro-certo" : "eventos-raros",
            eventId,
            eventName,
            home,
            away,
            score,
            lay.optDouble("odds", layOdds),
            minute,
            liveScore,
            alreadyImpossible,
            0,
            0,
            null,
            "lay-sent",
            lay.optDouble("odds", layOdds),
            lay.optDouble("stake", 0));
        scheduleHoldMatchReport(
            apiBase,
            alreadyImpossible ? "lucro-certo" : "eventos-raros",
            eventId,
            eventName,
            home,
            away,
            score,
            lay.optDouble("odds", layOdds),
            minute,
            liveScore,
            alreadyImpossible,
            marketId,
            runnerId);
      }
      return new PlaceOutcome(ok, !ok && isNoFundsError(err), sessionExpired);
    } catch (Exception e) {
      boolean sessionExpired = isSessionExpiredError(e.getMessage());
      if (sessionExpired) handleExpiredSession();
      if (!sessionExpired) {
        notifyResult(
            false,
            alreadyImpossible ? "Lucro certo falhou" : "Eventos raros falhou",
            eventName + " · " + e.getMessage());
      }
      return new PlaceOutcome(false, isNoFundsError(e.getMessage()), sessionExpired);
    }
  }

  private void saveActiveTrade(
      String eventId,
      String eventName,
      String score,
      String kind,
      double layOdds,
      double layStake,
      double liability,
      String marketId,
      String runnerId,
      double targetBack,
      double backStake,
      double profitFrac,
      String phase,
      boolean matched,
      String offerId,
      String betId,
      String home,
      String away,
      Double minute,
      String liveScore,
      String apiBase) {
    try {
      JSONObject t = new JSONObject();
      t.put("eventId", eventId != null ? eventId : "");
      t.put("eventName", eventName != null ? eventName : "");
      t.put("score", score != null ? score : "3-3");
      t.put("kind", kind != null && !kind.isEmpty() ? kind : "lay-3x3");
      t.put("layOdds", layOdds);
      t.put("layStake", layStake);
      t.put("liability", liability);
      t.put("marketId", marketId != null ? marketId : "");
      t.put("runnerId", runnerId != null ? runnerId : "");
      t.put("targetBack", targetBack);
      t.put("backStake", backStake);
      t.put("profitFrac", profitFrac);
      t.put("phase", phase != null ? phase : "awaiting_back");
      t.put("matched", matched);
      t.put("offerId", offerId != null ? offerId : "");
      t.put("betId", betId != null ? betId : "");
      t.put("home", home != null ? home : "");
      t.put("away", away != null ? away : "");
      if (minute != null) t.put("minute", minute);
      t.put("liveScore", liveScore != null ? liveScore : "");
      t.put("apiBase", apiBase != null ? apiBase : "");
      t.put("indicationRecorded", false);
      t.put("at", System.currentTimeMillis());
      prefs(this).edit().putString(PREF_ACTIVE_TRADE, t.toString()).apply();
    } catch (Exception e) {
      Log.w(TAG, "saveActiveTrade: " + e.getMessage());
    }
  }

  private void saveActiveTradeFrom(JSONObject base, String phase, boolean matched) {
    if (base == null) return;
    try {
      JSONObject t = new JSONObject(base.toString());
      t.put("phase", phase != null ? phase : "awaiting_back");
      t.put("matched", matched);
      t.put("at", System.currentTimeMillis());
      prefs(this).edit().putString(PREF_ACTIVE_TRADE, t.toString()).apply();
    } catch (Exception e) {
      Log.w(TAG, "saveActiveTradeFrom: " + e.getMessage());
    }
  }

  private JSONObject loadActiveTrade() {
    try {
      String raw = prefs(this).getString(PREF_ACTIVE_TRADE, "");
      if (raw == null || raw.isEmpty()) return null;
      JSONObject t = new JSONObject(raw);
      long at = t.optLong("at", 0L);
      if (at > 0 && System.currentTimeMillis() - at > ACTIVE_TRADE_TTL_MS) {
        clearActiveTrade();
        return null;
      }
      String phase = t.optString("phase", "");
      if ("closed".equals(phase) || t.optString("eventId", "").isEmpty()) {
        clearActiveTrade();
        return null;
      }
      return t;
    } catch (Exception e) {
      return null;
    }
  }

  private void clearActiveTrade() {
    prefs(this).edit().remove(PREF_ACTIVE_TRADE).apply();
  }

  private boolean hasOpenGreenTrade() {
    JSONObject t = loadActiveTrade();
    if (t == null) return false;
    String phase = t.optString("phase", "");
    return "lay_sent".equals(phase)
        || "awaiting_lay_match".equals(phase)
        || "awaiting_back".equals(phase)
        || "back_sent".equals(phase);
  }

  /**
   * Fluxo alinhado à extensão: espera Lay casar → propõe Back no alvo (Lay + %).
   * Não exige cotação Back ≥ alvo no book (ordem limite unmatched).
   */
  private void resumeActiveTradeIfNeeded(String apiBase) {
    JSONObject t = loadActiveTrade();
    if (t == null) return;
    String phase = t.optString("phase", "");
    if (!"lay_sent".equals(phase)
        && !"awaiting_lay_match".equals(phase)
        && !"awaiting_back".equals(phase)
        && !"back_sent".equals(phase)) {
      return;
    }

    String eventId = t.optString("eventId", "");
    String score = t.optString("score", "3-3");
    String storedTradeKind = t.optString("kind", "").trim();
    String tradeKind = inferLegacyTradeKind(storedTradeKind, score);
    String tradeLabel = greenTradeLabel(tradeKind, score);
    String eventName = t.optString("eventName", eventId);
    double layOdds = t.optDouble("layOdds", 0);
    double layStake = t.optDouble("layStake", 0);
    double targetBack = t.optDouble("targetBack", 0);
    double backStake = t.optDouble("backStake", 0);
    double profitFrac = t.optDouble("profitFrac", 0.005);
    String marketId = t.optString("marketId", "");
    String runnerId = t.optString("runnerId", "");

    try {
      // SharedPreferences sobrevivem à atualização do APK. Migra operações
      // antigas que ainda não gravavam a estratégia, sem assumir Lay 3x3.
      if (storedTradeKind.isEmpty() && !tradeKind.isEmpty()) {
        t.put("kind", tradeKind);
        prefs(this).edit().putString(PREF_ACTIVE_TRADE, t.toString()).apply();
      }
      if ("awaiting_lay_match".equals(phase) || "lay_sent".equals(phase)) {
        JSONObject details =
            engine.getLayMatchDetails(
                eventId,
                marketId,
                runnerId,
                t.optString("offerId", ""),
                t.optString("betId", ""),
                eventName,
                score,
                layOdds,
                layStake);
        if (details == null) {
          updateFgText("Auto Lay · green · a verificar se Lay casou");
          return;
        }
        boolean matchedConfirmed = details.optBoolean("matched", false);
        boolean stillOpen = details.optBoolean("open", false);
        // /offers pode manter uma linha aberta residual e, ao mesmo tempo,
        // devolver a linha integralmente casada da mesma ordem. A confirmação
        // do casamento sempre prevalece; "open" só bloqueia sem match.
        if (stillOpen && !matchedConfirmed) {
          t.put("laySeenOpen", true);
          saveActiveTradeFrom(t, phase, false);
          updateFgText(
              "Auto Lay · Lay no book · aguarda casar → Back"
                  + (targetBack > 1.01
                      ? " x" + String.format(Locale.US, "%.2f", targetBack)
                      : ""));
          return;
        }
        // Só avança quando a Bolsa confirma explicitamente o match do mesmo
        // eventId + marketId + runnerId. Uma oferta que some do book pode ter
        // sido cancelada, expirada ou não aparecer na página consultada.
        if (!matchedConfirmed) {
          boolean disappearedAfterOpen =
              t.optBoolean("laySeenOpen", false)
                  && !details.optBoolean("open", false)
                  && !details.optBoolean("seen", false);
          long lastSeenAt = t.optLong("at", 0L);
          if (disappearedAfterOpen
              && lastSeenAt > 0
              && System.currentTimeMillis() - lastSeenAt >= 60_000L) {
            clearActiveTrade();
            updateFgText("Auto Lay ativo · oferta encerrada ou mercado finalizado");
            return;
          }
          updateFgText("Auto Lay · green · aguarda confirmação do Lay");
          return;
        }
        // Valores EXATOS correspondidos; nunca usar o valor originalmente pedido.
        double matchedStake = details.optDouble("stake", 0);
        double matchedOdds = details.optDouble("odds", 0);
        double matchedLiab = details.optDouble("liability", 0);
        if (!(matchedStake > 0.009) || !(matchedOdds > 1.01)) {
          updateFgText("Auto Lay · Lay confirmado sem valores casados · aguarda");
          return;
        }
        layStake = matchedStake;
        layOdds = matchedOdds;
        if (!(matchedLiab > 0.009)) {
          matchedLiab = Math.round(layStake * (layOdds - 1.0) * 100.0) / 100.0;
        }
        if (!(targetBack > 1.01) && layOdds > 1.01) {
          Double calc =
              BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
          if (calc != null) targetBack = calc;
        }
        if (layStake > 0 && targetBack > 1.01) {
          Double calc =
              BetBraTradeEngine.greenBackStake(layStake, layOdds, targetBack);
          if (calc != null) {
            backStake = Math.max(1, Math.round(calc * 100.0) / 100.0);
          }
        }
        t.put("layOdds", layOdds);
        t.put("layStake", layStake);
        t.put("liability", matchedLiab);
        t.put("targetBack", targetBack);
        t.put("backStake", backStake);
        t.put("offerId", details.optString("offerId", t.optString("offerId", "")));
        t.put("betId", details.optString("betId", t.optString("betId", "")));
        t.put("matched", true);
        t.put("phase", "awaiting_back");
        if (!t.optBoolean("indicationRecorded", false)) {
          recordIndication(
              t.optString("apiBase", apiBase),
              t.optString("kind", "lay-3x3"),
              eventId,
              eventName,
              t.optString("home", ""),
              t.optString("away", ""),
              score,
              layOdds,
              t.has("minute") && !t.isNull("minute") ? t.optDouble("minute") : null,
              t.optString("liveScore", ""),
              false,
              layStake,
              matchedLiab,
              layStake > 0 ? layStake * (layOdds - 1) * profitFrac : null,
              "lay-matched",
              layOdds,
              layStake);
          t.put("indicationRecorded", true);
        }
        saveActiveTradeFrom(t, "awaiting_back", true);
        notifyResult(
            true,
            tradeLabel + " casado · entrada confirmada",
            eventName
                + " · stake R$ "
                + String.format(Locale.US, "%.2f", layStake)
                + " x"
                + formatOdd(layOdds)
                + " · resp R$ "
                + String.format(Locale.US, "%.2f", matchedLiab));
        phase = "awaiting_back";
      }

      if (!(targetBack > 1.01) && layOdds > 1.01) {
        Double calc =
            BetBraTradeEngine.targetBackForLiabilityProfit(layOdds, profitFrac);
        if (calc != null) targetBack = calc;
      }
      if (layStake > 0 && targetBack > 1.01) {
        Double calc =
            BetBraTradeEngine.greenBackStake(layStake, layOdds, targetBack);
        if (calc != null) backStake = Math.max(1, Math.round(calc * 100.0) / 100.0);
      }
      if (!(targetBack > 1.01) || !(backStake >= 1)) {
        updateFgText("Auto Lay · Lay casado · Back sem alvo ainda");
        return;
      }
      JSONObject existingBack =
          engine.getBackMatchDetails(
              eventId, marketId, runnerId, eventName, score, backStake, targetBack);
      if (existingBack != null && existingBack.optBoolean("matched", false)) {
        double matchedBackStake = existingBack.optDouble("stake", backStake);
        double matchedBackOdds = existingBack.optDouble("odds", targetBack);
        double realizedProfit =
            Math.round(Math.max(0, layStake - matchedBackStake) * 100.0) / 100.0;
        // Registra também o Back encontrado na Bolsa. Isso cobre tanto o Back
        // criado pelo APK quanto um Back manual que encerrou a mesma posição.
        recordIndication(
            t.optString("apiBase", apiBase),
            tradeKind,
            eventId,
            eventName,
            t.optString("home", ""),
            t.optString("away", ""),
            score,
            layOdds,
            t.has("minute") && !t.isNull("minute") ? t.optDouble("minute") : null,
            t.optString("liveScore", ""),
            false,
            layStake,
            t.optDouble("liability", 0),
            realizedProfit,
            "back-sent",
            matchedBackOdds,
            matchedBackStake,
            null);
        recordIndication(
            t.optString("apiBase", apiBase),
            t.optString("kind", "lay-3x3"),
            eventId,
            eventName,
            t.optString("home", ""),
            t.optString("away", ""),
            score,
            layOdds,
            t.has("minute") && !t.isNull("minute") ? t.optDouble("minute") : null,
            t.optString("liveScore", ""),
            false,
            layStake,
            t.optDouble("liability", 0),
            realizedProfit,
            "green",
            matchedBackOdds,
            matchedBackStake,
            realizedProfit);
        clearActiveTrade();
        notifyResult(
            true,
            "Green concluído · Back correspondido",
            eventName
                + " · Back "
                + String.format(Locale.US, "%.2f", existingBack.optDouble("stake", backStake))
                + " x"
                + formatOdd(existingBack.optDouble("odds", targetBack)));
        return;
      }
      if ("back_sent".equals(phase)) {
        if (existingBack != null && existingBack.optBoolean("open", false)) {
          updateFgText(
              "Auto Lay · Back proposto · aguardando casar x"
                  + String.format(Locale.US, "%.2f", targetBack));
          return;
        }
        long backSentAt = t.optLong("backSentAt", t.optLong("at", 0L));
        if (backSentAt > 0 && System.currentTimeMillis() - backSentAt < 60_000L) {
          updateFgText("Auto Lay · Back proposto · confirmando na Bolsa");
          return;
        }
        // A proposta não apareceu no book nem como matched: volta a tentar.
        phase = "awaiting_back";
        saveActiveTradeFrom(t, phase, true);
      }
      updateFgText("Auto Lay · Lay casado · enviando Back");
      JSONObject back =
          engine.placeBack(eventId, score, targetBack, backStake, marketId, runnerId);
      if (back.optBoolean("ok", false)) {
        t.put("phase", "back_sent");
        t.put("matched", true);
        t.put("backSentAt", System.currentTimeMillis());
        t.put("backOfferId", back.optString("offerId", ""));
        t.put("backBetId", back.optString("betId", ""));
        t.remove("lastBackError");
        saveActiveTradeFrom(t, "back_sent", true);
        recordIndication(
            t.optString("apiBase", apiBase),
            t.optString("kind", "lay-3x3"),
            eventId,
            eventName,
            t.optString("home", ""),
            t.optString("away", ""),
            score,
            layOdds,
            t.has("minute") && !t.isNull("minute") ? t.optDouble("minute") : null,
            t.optString("liveScore", ""),
            false,
            layStake,
            t.optDouble("liability", 0),
            Math.round(Math.max(0, layStake - backStake) * 100.0) / 100.0,
            "back-sent",
            back.optDouble("odds", targetBack),
            back.optDouble("stake", backStake),
            null);
        notifyResult(
            true,
            tradeLabel + " · Back proposto no alvo",
            eventName
                + " · lay x"
                + formatOdd(layOdds)
                + " stake R$ "
                + String.format(Locale.US, "%.2f", layStake)
                + " → back x"
                + String.format(Locale.US, "%.2f", targetBack));
        Log.i(TAG, "resumeActiveTrade Back OK · " + eventId);
      } else {
        String backError = back.optString("error", "erro não informado pela Bolsa");
        String previousBackError = t.optString("lastBackError", "");
        t.put("lastBackError", backError);
        saveActiveTradeFrom(t, "awaiting_back", true);
        updateFgText("Auto Lay · " + tradeLabel + " · Back NÃO proposto · " + backError);
        if (!backError.equals(previousBackError)) {
          notifyResult(false, tradeLabel + " · Back falhou", eventName + " · " + backError);
        }
      }
    } catch (Exception e) {
      Log.w(TAG, "resumeActiveTrade: " + e.getMessage());
      String resumeError = e.getMessage() != null ? e.getMessage() : "erro ao retomar operação";
      String previousResumeError = t.optString("lastResumeError", "");
      if (!resumeError.equals(previousResumeError)) {
        try {
          t.put("lastResumeError", resumeError);
          prefs(this).edit().putString(PREF_ACTIVE_TRADE, t.toString()).apply();
        } catch (Exception ignored) {
          // Mantém o serviço vivo mesmo se o estado legado estiver corrompido.
        }
        notifyResult(false, tradeLabel + " · falha ao retomar", eventName + " · " + resumeError);
      }
    }
  }

  private void recordIndication(
      String apiBase,
      String kind,
      String eventId,
      String eventName,
      String home,
      String away,
      String score,
      double layOdds,
      Double minute,
      String liveScore,
      boolean alreadyImpossible,
      double stake,
      double liability,
      Double expectedProfit) {
    recordIndication(
        apiBase,
        kind,
        eventId,
        eventName,
        home,
        away,
        score,
        layOdds,
        minute,
        liveScore,
        alreadyImpossible,
        stake,
        liability,
        expectedProfit,
        null,
        0,
        0);
  }

  private void recordSurebetIndication(
      String apiBase,
      String eventId,
      String eventName,
      String marketKind,
      double totalStake,
      double netProfit,
      JSONArray legs,
      String appProduct) {
    try {
      if (legs == null || legs.length() != 3) return;
      JSONArray reportLegs = new JSONArray();
      for (int i = 0; i < legs.length(); i++) {
        JSONObject leg = legs.optJSONObject(i);
        if (leg == null) return;
        reportLegs.put(new JSONObject()
            .put("selection", leg.optString("name", leg.optString("result", "")))
            .put("venue", "betbra")
            .put("odds", leg.optDouble("odds", 0))
            .put("stake", leg.optDouble("stake", 0)));
      }
      JSONObject body = new JSONObject()
          .put("kind", "surebet")
          .put("eventId", eventId)
          .put("eventName", eventName)
          .put("scoreLabel", "first-half".equals(marketKind)
              ? "Resultado do Primeiro Tempo" : "Match Odds")
          .put("marketName", "first-half".equals(marketKind)
              ? "Resultado do Primeiro Tempo" : "Match Odds")
          .put("layOdds", legs.getJSONObject(0).optDouble("odds", 0))
          .put("stake", totalStake)
          .put("liability", totalStake)
          .put("expectedProfit", netProfit)
          .put("realizedProfit", netProfit)
          .put("appProduct", appProduct)
          .put("surebetLegs", reportLegs)
          .put("source", "apk")
          .put("event", new JSONObject().put("type", "green")
              .put("stake", totalStake).put("profit", netProfit));
      String base = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
      httpPostJson(base + "/api/indications", body.toString(), sessionToken(base));
    } catch (Exception e) {
      Log.w(TAG, "recordSurebetIndication: " + e.getMessage());
    }
  }

  private void recordIndication(
      String apiBase,
      String kind,
      String eventId,
      String eventName,
      String home,
      String away,
      String score,
      double layOdds,
      Double minute,
      String liveScore,
      boolean alreadyImpossible,
      double stake,
      double liability,
      Double expectedProfit,
      String eventType,
      double eventOdds,
      double eventStake) {
    recordIndication(
        apiBase, kind, eventId, eventName, home, away, score, layOdds, minute,
        liveScore, alreadyImpossible, stake, liability, expectedProfit,
        eventType, eventOdds, eventStake, null);
  }

  private void recordIndication(
      String apiBase,
      String kind,
      String eventId,
      String eventName,
      String home,
      String away,
      String score,
      double layOdds,
      Double minute,
      String liveScore,
      boolean alreadyImpossible,
      double stake,
      double liability,
      Double expectedProfit,
      String eventType,
      double eventOdds,
      double eventStake,
      Double eventProfit) {
    try {
      JSONObject body = new JSONObject();
      body.put("kind", kind);
      body.put("eventId", eventId);
      body.put("eventName", eventName);
      body.put("home", home);
      body.put("away", away);
      body.put("scoreLabel", score);
      body.put("layOdds", layOdds);
      if (minute != null) body.put("minute", minute);
      if (liveScore != null && !liveScore.isEmpty()) {
        body.put("liveScoreLabel", liveScore);
      }
      body.put("alreadyImpossible", alreadyImpossible);
      if (stake > 0) body.put("stake", stake);
      if (liability > 0) body.put("liability", liability);
      if (expectedProfit != null) body.put("expectedProfit", expectedProfit);
      if (eventType != null && !eventType.isEmpty()) {
        JSONObject ev = new JSONObject();
        ev.put("type", eventType);
        if (eventOdds > 1.01) ev.put("odds", eventOdds);
        if (eventStake > 0) ev.put("stake", eventStake);
        if (eventProfit != null) ev.put("profit", eventProfit);
        body.put("event", ev);
      }
      body.put("source", "apk");
      String base = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
      httpPostJson(base + "/api/indications", body.toString(), sessionToken(base));
    } catch (Exception e) {
      Log.w(TAG, "recordIndication: " + e.getMessage());
    }
  }

  /** Após Lay hold enviado, confirma casamento na Bolsa e grava lay-matched. */
  private void scheduleHoldMatchReport(
      final String apiBase,
      final String kind,
      final String eventId,
      final String eventName,
      final String home,
      final String away,
      final String score,
      final double layOdds,
      final Double minute,
      final String liveScore,
      final boolean alreadyImpossible,
      final String marketId,
      final String runnerId) {
    new Thread(
            () -> {
              long deadline = System.currentTimeMillis() + 120_000L;
              while (System.currentTimeMillis() < deadline) {
                try {
                  JSONObject details =
                      engine.getLayMatchDetails(eventId, marketId, runnerId);
                  if (details != null && details.optBoolean("matched", false)) {
                    double matchedStake = details.optDouble("stake", 0);
                    double matchedOdds = details.optDouble("odds", layOdds);
                    double matchedLiab = details.optDouble("liability", 0);
                    if (matchedLiab < 0.01 && matchedStake > 0 && matchedOdds > 1.01) {
                      matchedLiab =
                          Math.round(matchedStake * (matchedOdds - 1.0) * 100.0) / 100.0;
                    }
                    recordIndication(
                        apiBase,
                        kind,
                        eventId,
                        eventName,
                        home,
                        away,
                        score,
                        matchedOdds,
                        minute,
                        liveScore,
                        alreadyImpossible,
                        matchedStake,
                        matchedLiab,
                        null,
                        "lay-matched",
                        matchedOdds,
                        matchedStake);
                    return;
                  }
                  if (details != null && details.optBoolean("open", false)) {
                    Thread.sleep(2000L);
                    continue;
                  }
                } catch (Exception e) {
                  Log.w(TAG, "scheduleHoldMatchReport: " + e.getMessage());
                }
                try {
                  Thread.sleep(2000L);
                } catch (InterruptedException ignored) {
                  return;
                }
              }
            },
            "tips3x3-hold-match")
        .start();
  }

  /**
   * Token da sessão do painel, lido do cookie da WebView — é o que identifica
   * o usuário dono da operação no histórico.
   */
  private static String sessionToken(String apiBase) {
    try {
      String cookies = CookieManager.getInstance().getCookie(apiBase);
      if (cookies == null || cookies.isEmpty()) return "";
      for (String part : cookies.split(";")) {
        String c = part.trim();
        if (c.startsWith("tips3x3_session=")) {
          return c.substring("tips3x3_session=".length()).trim();
        }
      }
    } catch (Exception e) {
      Log.w(TAG, "sessionToken: " + e.getMessage());
    }
    return "";
  }

  /**
   * Entrada já enviada continua bloqueada por SENT_TTL_MS mesmo que o sinal
   * suma e volte do feed — sem isso o Auto Lay reentrava no mesmo mercado.
   */
  private boolean wasSent(String key) {
    long at = prefs(this).getLong(SENT_PREFIX + key, 0L);
    if (at <= 0) return false;
    return System.currentTimeMillis() - at < SENT_TTL_MS;
  }

  private void markSent(String key) {
    prefs(this).edit().putLong(SENT_PREFIX + key, System.currentTimeMillis()).apply();
  }

  /** Limpa marcas de envio vencidas (e as booleanas do formato antigo). */
  private void pruneSentKeys() {
    SharedPreferences p = prefs(this);
    SharedPreferences.Editor ed = p.edit();
    boolean changed = false;
    long now = System.currentTimeMillis();
    for (java.util.Map.Entry<String, ?> entry : p.getAll().entrySet()) {
      String k = entry.getKey();
      if (k.startsWith("sent:")) {
        ed.remove(k);
        changed = true;
      } else if (k.startsWith(SENT_PREFIX)) {
        Object v = entry.getValue();
        long at = v instanceof Long ? (Long) v : 0L;
        if (at <= 0 || now - at >= SENT_TTL_MS) {
          ed.remove(k);
          changed = true;
        }
      }
    }
    if (changed) ed.apply();
  }

  private boolean inNoFundsPause() {
    return false;
  }

  /** Saldo insuficiente bloqueia somente este poll; o próximo tenta novamente. */
  private void beginNoFundsPause() {
    clearNoFundsCooldown();
    Log.i(TAG, "sem saldo livre · nova tentativa no próximo poll");
  }

  private String noFundsStatusText() {
    return "Auto Lay · sem saldo livre · nova tentativa em 10s";
  }

  private void clearNoFundsCooldown() {
    prefs(this).edit().remove(PREF_NO_FUNDS_UNTIL).remove(PREF_NO_FUNDS_SOFT).apply();
  }

  private boolean wasNotified(String key) {
    return prefs(this).getBoolean("notif:" + key, false);
  }

  private void markNotified(String key) {
    prefs(this).edit().putBoolean("notif:" + key, true).apply();
  }

  /** Confirma o gol em dois polls iguais e abre a janela somente após 30 s. */
  private boolean updatePostGoalState(String eventId, int totalGoals) {
    if (eventId == null || eventId.isEmpty() || totalGoals < 0) return false;
    SharedPreferences p = prefs(this);
    String key = POST_GOAL_STATE_PREFIX + eventId;
    long now = System.currentTimeMillis();
    try {
      JSONObject state = new JSONObject(p.getString(key, "{}"));
      if (!state.has("confirmedGoals")) {
        state.put("confirmedGoals", totalGoals);
        state.put("pendingGoals", -1);
        state.put("pendingCount", 0);
        state.put("confirmedAt", 0L);
        state.put("enteredGoals", -1);
      } else {
        int confirmed = state.optInt("confirmedGoals", totalGoals);
        if (totalGoals < confirmed) {
          // Correção/VAR: o placar menor vira a nova base, sem disparar entrada.
          state.put("confirmedGoals", totalGoals);
          state.put("pendingGoals", -1);
          state.put("pendingCount", 0);
          state.put("confirmedAt", 0L);
        } else if (totalGoals > confirmed) {
          int pending = state.optInt("pendingGoals", -1);
          int count = pending == totalGoals ? state.optInt("pendingCount", 0) + 1 : 1;
          state.put("pendingGoals", totalGoals);
          state.put("pendingCount", count);
          state.put("confirmedAt", 0L);
          if (count >= 2) {
            state.put("confirmedGoals", totalGoals);
            state.put("pendingGoals", -1);
            state.put("pendingCount", 0);
            state.put("confirmedAt", now);
          }
        }
      }
      state.put("updatedAt", now);
      p.edit().putString(key, state.toString()).apply();
      int confirmed = state.optInt("confirmedGoals", -1);
      long confirmedAt = state.optLong("confirmedAt", 0L);
      int entered = state.optInt("enteredGoals", -1);
      long goalAgeMs = confirmedAt > 0 ? now - confirmedAt : Long.MAX_VALUE;
      return confirmed == totalGoals
          && confirmedAt > 0
          && goalAgeMs >= POST_GOAL_STABILIZATION_MS
          && goalAgeMs <= POST_GOAL_WINDOW_MS
          && entered != totalGoals;
    } catch (Exception e) {
      Log.w(TAG, "post-goal state: " + e.getMessage());
      return false;
    }
  }

  private void markPostGoalEntered(String eventId, int totalGoals) {
    String key = POST_GOAL_STATE_PREFIX + eventId;
    SharedPreferences p = prefs(this);
    try {
      JSONObject state = new JSONObject(p.getString(key, "{}"));
      state.put("enteredGoals", totalGoals);
      state.put("updatedAt", System.currentTimeMillis());
      p.edit().putString(key, state.toString()).apply();
    } catch (Exception ignored) {
    }
  }

  private void pruneKeys(String prefix, Set<String> stillReady) {
    SharedPreferences p = prefs(this);
    SharedPreferences.Editor ed = p.edit();
    boolean changed = false;
    for (String k : p.getAll().keySet()) {
      if (!k.startsWith(prefix)) continue;
      String key = k.substring(prefix.length());
      if (!stillReady.contains(key)) {
        ed.remove(k);
        changed = true;
      }
    }
    if (changed) ed.apply();
  }

  private static String formatOdd(double odds) {
    if (odds >= 20) return String.format(Locale.US, "%.0f", odds);
    return String.format(Locale.US, "%.2f", odds);
  }

  /** Prefiltro barato do feed; o motor consulta novamente a Bolsa antes do POST. */
  private static boolean looksLikeMatchOddsSurebet(JSONObject matchOdds) {
    if (matchOdds == null) return false;
    double divisor = 0;
    String[] keys = new String[] {"home", "draw", "away"};
    for (String key : keys) {
      JSONObject leg = matchOdds.optJSONObject(key);
      if (leg == null) return false;
      double odd = leg.optDouble("backBook", leg.optDouble("back", 0));
      if (!(odd > 1.01)) return false;
      divisor += 1.0 / odd;
    }
    return divisor < 1.0;
  }

  private static String matchOddsSurebetKey(String eventId, JSONObject matchOdds) {
    StringBuilder key = new StringBuilder(eventId).append(":surebet-match-odds");
    String[] legs = new String[] {"home", "draw", "away"};
    for (String legName : legs) {
      JSONObject leg = matchOdds != null ? matchOdds.optJSONObject(legName) : null;
      double odd = leg != null ? leg.optDouble("backBook", leg.optDouble("back", 0)) : 0;
      key.append(':').append(String.format(Locale.US, "%.2f", odd));
    }
    return key.toString();
  }

  /** Confirma as tres pontas na Bolsa e so entao publica o GREEN com lucro real. */
  private void scheduleMatchOddsSurebetGreen(
      String eventId, String eventName, JSONObject placed) {
    if (placed == null) return;
    final String marketId = placed.optString("marketId", "");
    final JSONArray legs = placed.optJSONArray("legs");
    if (marketId.isEmpty() || legs == null || legs.length() != 3) return;
    final String snapshot = legs.toString();
    new Thread(
            () -> {
              // Cinco minutos cobrem casamento imediato, parcial e atraso do /offers.
              for (int attempt = 0; attempt < 60; attempt++) {
                try {
                  JSONArray expected = new JSONArray(snapshot);
                  double totalMatched = 0;
                  double[] payouts = new double[3];
                  boolean allMatched = true;
                  for (int i = 0; i < 3; i++) {
                    JSONObject leg = expected.optJSONObject(i);
                    if (leg == null) {
                      allMatched = false;
                      break;
                    }
                    JSONObject matched =
                        engine.getBackMatchDetails(
                            eventId,
                            marketId,
                            leg.optString("runnerId", ""),
                            eventName,
                            leg.optString("name", ""),
                            leg.optDouble("stake", 0),
                            leg.optDouble("odds", 0));
                    if (matched == null || !matched.optBoolean("matched", false)) {
                      allMatched = false;
                      break;
                    }
                    double stake = matched.optDouble("stake", leg.optDouble("stake", 0));
                    double odds = matched.optDouble("odds", leg.optDouble("odds", 0));
                    totalMatched += stake;
                    payouts[i] = stake * odds;
                  }
                  if (allMatched) {
                    double gross = Double.MAX_VALUE;
                    for (double payout : payouts) gross = Math.min(gross, payout - totalMatched);
                    gross = Math.floor(gross * 100.0) / 100.0;
                    // Comissao estimada de 5% aplicada apenas sobre resultado positivo.
                    double net = gross > 0 ? Math.floor(gross * 0.95 * 100.0) / 100.0 : gross;
                    notifyResult(
                        net > 0,
                        surebetProfitTitle(totalMatched, net),
                        eventName
                            + " · 3 Backs correspondidos"
                            + " · lucro bruto R$ "
                            + String.format(Locale.US, "%.2f", gross)
                            + " · lucro liquido R$ "
                            + String.format(Locale.US, "%.2f", net));
                    return;
                  }
                  Thread.sleep(5_000L);
                } catch (InterruptedException ignored) {
                  return;
                } catch (Exception e) {
                  Log.w(TAG, "surebet match green: " + e.getMessage());
                  try {
                    Thread.sleep(5_000L);
                  } catch (InterruptedException ignored) {
                    return;
                  }
                }
              }
              notifyResult(
                  false,
                  surebetProfitTitle(
                      placed.optDouble("totalStake", 0),
                      placed.optDouble("estimatedNetProfit", 0)),
                  eventName + " · nem todas as tres pontas foram confirmadas em 5 minutos");
            },
            "tips3x3-surebet-green")
        .start();
  }

  private static String surebetProfitTitle(double exposure, double profit) {
    double pct = exposure > 0 ? (profit / exposure) * 100.0 : 0;
    return "Surebet Lucro " + String.format(new Locale("pt", "BR"), "%.2f", pct) + "%";
  }

  /** Infere apenas estados antigos que não possuíam kind persistido. */
  private static String inferLegacyTradeKind(String kind, String selection) {
    if (kind != null && !kind.trim().isEmpty()) return kind.trim();
    String value = selection != null ? selection.trim().toLowerCase(Locale.ROOT) : "";
    if (value.contains("qov") || value.contains("zebra")) return "qov-lay-zebra";
    if (value.equals("1-1") || value.contains("1x1")) return "lay-1x1";
    if (value.equals("3-3") || value.contains("3x3")) return "lay-3x3";
    if (value.contains("over 3.5") || value.contains("over 3,5")) return "over-3.5";
    if (value.contains("over 4.5") || value.contains("over 4,5")) return "over-4.5";
    if (value.startsWith("over ")) return "over-legacy";
    return "legacy-unknown";
  }

  /** Rótulo da operação persistida; não chama estratégia desconhecida de 3x3. */
  private static String greenTradeLabel(String kind, String selection) {
    if ("over-3.5".equals(kind)) return "Lay Over 3.5";
    if ("over-4.5".equals(kind)) return "Lay Over 4.5";
    if ("lay-over-limit-pressure".equals(kind)) {
      return "LOLP " + (selection != null && !selection.isEmpty() ? selection : "Over");
    }
    if ("correcao-pos-gol".equals(kind)) {
      return "Correção pós-gol · Lay "
          + (selection != null && !selection.isEmpty() ? selection : "Over");
    }
    if ("qov-lay-zebra".equals(kind) || "qov".equals(kind)) return "Lay QOV zebra";
    if ("lay-1x1".equals(kind)) return "Lay 1x1";
    if ("lay-3x3".equals(kind)) return "Lay 3x3";
    if ("over-legacy".equals(kind)) {
      return "Lay " + (selection != null && !selection.isEmpty() ? selection : "Over");
    }
    return selection != null && !selection.isEmpty()
        ? "Lay " + selection
        : "Lay (estratégia não identificada)";
  }

  private void notifySurebetOpportunity(
      String eventName,
      String marketKind,
      String phase,
      Double minute,
      JSONObject matchOdds) {
    if (!BuildConfig.SUREBET_ONLY) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null || matchOdds == null) return;
    ensureChannels();
    String marketLabel =
        "first-half".equals(marketKind) ? "RESULTADO DO 1º TEMPO" : "MATCH ODDS";
    double homeOdd = surebetLegOdd(matchOdds, "home");
    double drawOdd = surebetLegOdd(matchOdds, "draw");
    double awayOdd = surebetLegOdd(matchOdds, "away");
    double divisor = 1.0 / homeOdd + 1.0 / drawOdd + 1.0 / awayOdd;
    double grossPct = divisor > 0 ? (1.0 / divisor - 1.0) * 100.0 : 0;
    String phaseLabel = "live".equals(phase)
        ? "Live" + (minute != null ? " " + minute.intValue() + "'" : "")
        : "Pré-live / intervalo";
    String body =
        phaseLabel
            + " · 1 x" + formatOdd(homeOdd)
            + " · X x" + formatOdd(drawOdd)
            + " · 2 x" + formatOdd(awayOdd)
            + " · margem bruta "
            + String.format(new Locale("pt", "BR"), "%.2f", grossPct)
            + "%";
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pi =
        PendingIntent.getActivity(
            this,
            (eventName + marketKind).hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification notification =
        new NotificationCompat.Builder(this, CHANNEL_SUREBET)
            .setContentTitle("SUREBET · " + marketLabel + " · " + eventName)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_stat_tips3x3)
            .setColor(COLOR_GREEN)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(new long[] {0, 100, 60, 100, 60, 220})
            .build();
    nm.notify((eventName + ":" + marketKind + ":" + phase).hashCode(), notification);
    pulseScreenWake();
  }

  private static double surebetLegOdd(JSONObject matchOdds, String legName) {
    JSONObject leg = matchOdds != null ? matchOdds.optJSONObject(legName) : null;
    return leg != null ? leg.optDouble("backBook", leg.optDouble("back", 0)) : 0;
  }

  /** Notificação ENTRAR (tela off). gold=Eventos raros; senão Lay 3x3 verde. */
  private void notifyEnter(boolean gold, String title, String body) {
    if (BuildConfig.SUREBET_ONLY) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    ensureChannels();
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int req = (int) (System.currentTimeMillis() & 0xffff);
    PendingIntent pi =
        PendingIntent.getActivity(
            this,
            req,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent fullScreen =
        PendingIntent.getActivity(
            this,
            req + 1,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    String channel = gold ? CHANNEL_ENTER_RAROS : CHANNEL_ENTER_3X3;
    int color = gold ? COLOR_GOLD : COLOR_GREEN;
    Uri sound = notificationSoundUri();
    NotificationCompat.Builder b =
        new NotificationCompat.Builder(this, channel)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_stat_tips3x3)
            .setColor(color)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(new long[] {0, 80, 40, 80, 40, 160})
            .setOnlyAlertOnce(false)
            .setFullScreenIntent(fullScreen, true);
    if (sound != null) {
      b.setSound(sound);
    } else {
      b.setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE);
    }
    nm.notify((int) ((System.currentTimeMillis() + (gold ? 17 : 31)) & 0xfffffff), b.build());
    // Reforço com stream de NOTIFICAÇÃO (não toque/alarme do telemóvel).
    playEnterNotificationSound();
    pulseScreenWake();
  }

  private void playEnterNotificationSound() {
    try {
      Uri sound = notificationSoundUri();
      if (sound == null) return;
      Ringtone rt = RingtoneManager.getRingtone(getApplicationContext(), sound);
      if (rt == null) return;
      if (Build.VERSION.SDK_INT >= 28) {
        rt.setLooping(false);
        try {
          rt.setAudioAttributes(notificationAudioAttrs());
        } catch (Exception ignored) {
        }
      }
      rt.play();
      handler.postDelayed(
          () -> {
            try {
              if (rt.isPlaying()) rt.stop();
            } catch (Exception ignored) {
            }
          },
          3_000L);
    } catch (Exception e) {
      Log.w(TAG, "notification sound: " + e.getMessage());
    }
  }

  /** Acorda a CPU ao alertar (tela off). */
  private void pulseScreenWake() {
    try {
      PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
      if (pm == null) return;
      PowerManager.WakeLock wl =
          pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tips3x3:enter-alert");
      wl.setReferenceCounted(false);
      wl.acquire(8_000L);
    } catch (Exception e) {
      try {
        acquireWakeLock();
      } catch (Exception ignored) {
      }
    }
  }

  private void notifyResult(boolean ok, String title, String body) {
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    Intent open = new Intent(this, MainActivity.class);
    PendingIntent pi =
        PendingIntent.getActivity(
            this,
            (int) System.currentTimeMillis(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification n =
        new NotificationCompat.Builder(this, CHANNEL_RESULT)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_stat_tips3x3)
            .setColor(ok ? COLOR_GREEN : 0xFFEF4444)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE)
            .build();
    nm.notify((int) (System.currentTimeMillis() & 0xfffffff), n);
  }

  private static JSONObject httpGetJson(String urlStr) throws Exception {
    Exception last = null;
    for (int attempt = 1; attempt <= 3; attempt++) {
      HttpURLConnection conn = null;
      try {
        conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(12_000);
        conn.setReadTimeout(20_000);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("Connection", "close");
        conn.setUseCaches(false);
        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        String response = readStream(stream);
        if (code >= 200 && code < 300) return new JSONObject(response);
        if (code != 408 && code != 425 && code != 429 && code < 500) {
          throw new Exception("live HTTP " + code);
        }
        last = new Exception("live HTTP " + code);
      } catch (java.io.IOException e) {
        last = e;
      } finally {
        if (conn != null) conn.disconnect();
      }
      if (attempt < 3) {
        try {
          Thread.sleep(attempt * 750L);
        } catch (InterruptedException interrupted) {
          Thread.currentThread().interrupt();
          throw interrupted;
        }
      }
    }
    throw last != null ? last : new Exception("falha temporaria no feed live");
  }

  private static void httpPostJson(String urlStr, String body, String token) throws Exception {
    URL url = new URL(urlStr);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setConnectTimeout(12_000);
    conn.setReadTimeout(15_000);
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Accept", "application/json");
    conn.setRequestProperty("Content-Type", "application/json");
    if (token != null && !token.isEmpty()) {
      conn.setRequestProperty("Authorization", "Bearer " + token);
    }
    conn.setDoOutput(true);
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    conn.setFixedLengthStreamingMode(bytes.length);
    try (java.io.OutputStream os = conn.getOutputStream()) {
      os.write(bytes);
    }
    int code = conn.getResponseCode();
    InputStream stream =
        code >= 400
            ? (conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream())
            : conn.getInputStream();
    readStream(stream);
    conn.disconnect();
    if (code < 200 || code >= 300) {
      throw new Exception("indications HTTP " + code);
    }
  }

  private static String readStream(InputStream stream) throws Exception {
    if (stream == null) return "";
    StringBuilder sb = new StringBuilder();
    try (BufferedReader br =
        new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) sb.append(line);
    }
    return sb.toString();
  }
}
