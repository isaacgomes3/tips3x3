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
  static final String CHANNEL_FG = "tips3x3-autolay";
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
  private static final long POLL_MS = 10_000L;
  private static final String SENT_PREFIX = "sentat:";
  /** Entrada enviada não repete pelas próximas horas (evita reentrada). */
  private static final long SENT_TTL_MS = 6L * 60L * 60L * 1000L;
  private static final String PREF_NO_FUNDS_UNTIL = "no_funds_until";
  /** true = saldo preso em ops abertas; espera liberar (sem relógio fixo). */
  private static final String PREF_NO_FUNDS_SOFT = "no_funds_soft";
  private static final String PREF_ACTIVE_TRADE = "active_trade_json";
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
  private final AtomicBoolean tickBusy = new AtomicBoolean(false);
  private PowerManager.WakeLock wakeLock;
  private BetBraTradeEngine engine;
  private final Runnable tick =
      new Runnable() {
        @Override
        public void run() {
          if (!RUNNING.get()) return;
          schedulePoll();
          if (!tickBusy.compareAndSet(false, true)) return;
          io.execute(
              () -> {
                try {
                  pollOnce();
                } catch (Exception e) {
                  Log.w(TAG, "poll failed: " + e.getMessage());
                  updateFgText("Auto Lay · erro de rede — a retentar");
                } finally {
                  tickBusy.set(false);
                }
              });
        }
      };

  static boolean isRunning() {
    return RUNNING.get();
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
      boolean qovOn,
      double stakeLay3x3Pct,
      double stakeFixedEr,
      double stakeFixedLc,
      double reservedLucroCerto,
      double profitPctPoints,
      double stakeLolpPct,
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
        .putBoolean("qovOn", qovOn)
        .putFloat("stakeQovPct", (float) (stakeQovPct > 0 ? stakeQovPct : 20))
        .putFloat("stakeLolpPct", (float) (stakeLolpPct > 0 ? stakeLolpPct : 5))
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
    ensureChannels();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent != null ? intent.getAction() : ACTION_START;
    if (ACTION_STOP.equals(action)) {
      stopSelfSafe();
      return START_NOT_STICKY;
    }

    SharedPreferences p = prefs(this);
    if (!p.getBoolean("autoOn", false)) {
      stopSelfSafe();
      return START_NOT_STICKY;
    }

    startAsForeground();
    RUNNING.set(true);
    acquireWakeLock();
    handler.removeCallbacks(tick);
    handler.post(tick);
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    RUNNING.set(false);
    handler.removeCallbacks(tick);
    releaseWakeLock();
    io.shutdownNow();
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void stopSelfSafe() {
    RUNNING.set(false);
    handler.removeCallbacks(tick);
    releaseWakeLock();
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }

  private void schedulePoll() {
    handler.removeCallbacks(tick);
    handler.postDelayed(tick, POLL_MS);
  }

  private void startAsForeground() {
    Notification n = buildFgNotification("Auto Lay ativo · tela pode ficar desligada");
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_FG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
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
        .setContentTitle("Tips3x3 · Auto Lay")
        .setContentText(text)
        .setSmallIcon(R.drawable.ic_stat_tips3x3)
        .setContentIntent(pi)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
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
        new NotificationChannel(CHANNEL_FG, "Auto Lay (background)", NotificationManager.IMPORTANCE_LOW);
    fg.setDescription("Mantém o Auto Lay a operar com a tela desligada");
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
      if (!wakeLock.isHeld()) wakeLock.acquire(60 * 60 * 1000L);
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

  private void pollOnce() throws Exception {
    SharedPreferences p = prefs(this);
    if (!p.getBoolean("autoOn", false)) {
      stopSelfSafe();
      return;
    }

    boolean lay3x3On = p.getBoolean("lay3x3On", true);
    boolean erOn = p.getBoolean("eventosRarosOn", true);
    boolean lcOn = p.getBoolean("lucroCertoOn", true);
    boolean lolpOn = p.getBoolean("layOverLimitPressureOn", true);
    boolean qovOn = p.getBoolean("qovOn", true);
    boolean over35On = p.getBoolean("over35On", true);
    boolean over45On = p.getBoolean("over45On", true);
    if (!lay3x3On && !erOn && !lcOn && !lolpOn && !qovOn && !over35On && !over45On) {
      updateFgText("Auto Lay · nenhuma estratégia ligada");
      return;
    }

    boolean hasSession = engine.hasSession();
    float profitPoints = p.getFloat("profitPctPoints", 0.5f);
    float stake3x3 = p.getFloat("stakeLay3x3Pct", 20f);
    float stakeFixedEr = p.getFloat("stakeFixedEr", DEFAULT_STAKE_FIXED_ER);
    if (!(stakeFixedEr >= 1f)) stakeFixedEr = DEFAULT_STAKE_FIXED_ER;
    float stakeFixedLc = p.getFloat("stakeFixedLc", DEFAULT_STAKE_FIXED_LC);
    if (!(stakeFixedLc >= 1f)) stakeFixedLc = DEFAULT_STAKE_FIXED_LC;
    float stakeLolp = p.getFloat("stakeLolpPct", 5f);
    if (!(stakeLolp > 0f)) stakeLolp = 5f;
    float lolpProfitPoints = p.getFloat("lolpProfitPctPoints", 1f);
    if (!(lolpProfitPoints > 0f)) lolpProfitPoints = 1f;
    float stakeQov = p.getFloat("stakeQovPct", 20f);
    if (!(stakeQov > 0f)) stakeQov = 20f;
    float stakeOver35 = p.getFloat("stakeOver35Pct", 10f);
    if (!(stakeOver35 > 0f)) stakeOver35 = 10f;
    float stakeOver45 = p.getFloat("stakeOver45Pct", 10f);
    if (!(stakeOver45 > 0f)) stakeOver45 = 10f;
    String apiBase = p.getString("apiBase", "https://tips3x3.com");
    if (apiBase.endsWith("/")) apiBase = apiBase.substring(0, apiBase.length() - 1);

    // Anti-abandono: retoma Back do green antes de aceitar novo Lay 3x3.
    if (hasSession) {
      resumeActiveTradeIfNeeded(apiBase);
    }
    boolean greenBusy = hasOpenGreenTrade();

    String url =
        apiBase
            + "/api/live?limit=40&profitPct="
            + String.format(Locale.US, "%.4f", profitPoints)
            + "&lolpProfitPct="
            + String.format(Locale.US, "%.4f", lolpProfitPoints / 100.0);
    JSONObject live = httpGetJson(url);
    JSONArray rows = live != null ? live.optJSONArray("rows") : null;
    if (rows == null) {
      updateFgText("Auto Lay · a monitorar (sem rows)");
      return;
    }

    Set<String> stillReady = new HashSet<>();
    int placed = 0;
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
      String scoreLabel = "";
      JSONObject liveSnap = row.optJSONObject("live");
      if (liveSnap != null) scoreLabel = liveSnap.optString("scoreLabel", "");
      Double minute = null;
      String minuteHint = "";
      if (liveSnap != null && liveSnap.has("minute") && !liveSnap.isNull("minute")) {
        minute = liveSnap.optDouble("minute", 0);
        minuteHint = " @ " + minute.intValue() + "′";
      }

      if (lay3x3On) {
        JSONObject plan = row.optJSONObject("tradePlan");
        if (plan != null && plan.optBoolean("entryReady", false)) {
          String key = eventId + ":lay-3x3";
          stillReady.add(key);
          double layOdds = plan.optDouble("layOdds", analysis.optDouble("layOdds", 0));
          double targetBack = plan.optDouble("targetBackOdds", 0);
          double profitFrac = plan.optDouble("targetProfitPct", profitPoints / 100.0);
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
                markSent(key);
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

            JSONObject exitPlan = qov.optJSONObject("exitPlan");
            double targetBack =
                exitPlan != null ? exitPlan.optDouble("exitOdds", 0) : 0;
            double profitFrac =
                exitPlan != null
                    ? exitPlan.optDouble("targetProfitPct", profitPoints / 100.0)
                    : profitPoints / 100.0;

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

          JSONObject exitPlan = snap.optJSONObject("exitPlan");
          double targetBack =
              exitPlan != null ? exitPlan.optDouble("targetBackOdds", 0) : 0;
          double profitFrac =
              exitPlan != null
                  ? exitPlan.optDouble("targetProfitPct", lolpProfitPoints / 100.0)
                  : lolpProfitPoints / 100.0;

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

          JSONObject exitPlan = snap.optJSONObject("exitPlan");
          double targetBack =
              exitPlan != null ? exitPlan.optDouble("targetBackOdds", 0) : 0;
          double profitFrac =
              exitPlan != null ? exitPlan.optDouble("targetProfitPct", 0.008) : 0.008;

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
    int entries = live.optInt("entries", 0);
    if (!hasSession) {
      updateFgText("Auto Lay · BetBra desconectada · a notificar sinais");
    } else if (noFundsNow) {
      updateFgText(noFundsStatusText());
    } else if (greenBusy) {
      updateFgText("Auto Lay · green em aberto · aguardando Back");
    } else {
      updateFgText(
          placed > 0
              ? "Auto Lay · " + placed + " ordem(ns) neste ciclo"
              : "Auto Lay ativo · " + entries + " entrada(s) · poll 10s");
    }
  }

  private static final class PlaceOutcome {
    final boolean ok;
    final boolean noFunds;

    PlaceOutcome(boolean ok, boolean noFunds) {
      this.ok = ok;
      this.noFunds = noFunds;
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
            "",
            "",
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
          "",
          "",
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
      notifyResult(
          ok,
          ok
              ? (alreadyImpossible ? "Lay lucro certo enviado" : "Lay hold enviado")
              : "Lay hold falhou",
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
      return new PlaceOutcome(ok, !ok && isNoFundsError(err));
    } catch (Exception e) {
      notifyResult(false, "Lay hold falhou", eventName + " · " + e.getMessage());
      return new PlaceOutcome(false, isNoFundsError(e.getMessage()));
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
        || "awaiting_back".equals(phase);
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
        && !"awaiting_back".equals(phase)) {
      return;
    }

    String eventId = t.optString("eventId", "");
    String score = t.optString("score", "3-3");
    String eventName = t.optString("eventName", eventId);
    double layOdds = t.optDouble("layOdds", 0);
    double layStake = t.optDouble("layStake", 0);
    double targetBack = t.optDouble("targetBack", 0);
    double backStake = t.optDouble("backStake", 0);
    double profitFrac = t.optDouble("profitFrac", 0.005);
    String marketId = t.optString("marketId", "");
    String runnerId = t.optString("runnerId", "");

    try {
      if ("awaiting_lay_match".equals(phase) || "lay_sent".equals(phase)) {
        JSONObject details = engine.getLayMatchDetails(eventId, marketId, runnerId);
        if (details == null) {
          updateFgText("Auto Lay · green · a verificar se Lay casou");
          return;
        }
        boolean stillOpen = details.optBoolean("open", false);
        if (stillOpen) {
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
        if (!details.optBoolean("matched", false)) {
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
            "Lay 3x3 casado · entrada confirmada",
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
      JSONObject back =
          engine.placeBack(eventId, score, targetBack, backStake, marketId, runnerId);
      if (back.optBoolean("ok", false)) {
        clearActiveTrade();
        notifyResult(
            true,
            "Lay 3x3 · Back proposto no alvo",
            eventName
                + " · lay x"
                + formatOdd(layOdds)
                + " stake R$ "
                + String.format(Locale.US, "%.2f", layStake)
                + " → back x"
                + String.format(Locale.US, "%.2f", targetBack));
        Log.i(TAG, "resumeActiveTrade Back OK · " + eventId);
      } else {
        updateFgText(
            "Auto Lay · Back no alvo falhou · " + back.optString("error", "erro"));
      }
    } catch (Exception e) {
      Log.w(TAG, "resumeActiveTrade: " + e.getMessage());
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
    if (prefs(this).getBoolean(PREF_NO_FUNDS_SOFT, false)) return true;
    return System.currentTimeMillis() < prefs(this).getLong(PREF_NO_FUNDS_UNTIL, 0L);
  }

  /**
   * Com ops retendo saldo → espera liberar (soft). Banca vazia sem ops → 15 min.
   */
  private void beginNoFundsPause() {
    double locked = 0;
    try {
      locked = engine != null ? engine.fetchUnhedgedLayLiabilityAuto() : 0;
    } catch (Exception ignored) {
      locked = 0;
    }
    boolean fundsInPlay = locked > 0.5 || hasOpenGreenTrade();
    if (fundsInPlay) {
      prefs(this)
          .edit()
          .putBoolean(PREF_NO_FUNDS_SOFT, true)
          .remove(PREF_NO_FUNDS_UNTIL)
          .apply();
      Log.i(TAG, "sem saldo · aguardando ops liberarem (resp ~" + locked + ")");
    } else {
      prefs(this)
          .edit()
          .putBoolean(PREF_NO_FUNDS_SOFT, false)
          .putLong(PREF_NO_FUNDS_UNTIL, System.currentTimeMillis() + NO_FUNDS_COOLDOWN_MS)
          .apply();
      Log.i(TAG, "sem saldo · pausa fixa 15 min (banca vazia)");
    }
  }

  private String noFundsStatusText() {
    if (prefs(this).getBoolean(PREF_NO_FUNDS_SOFT, false)) {
      return "Auto Lay · saldo em ops abertas · aguardando liberar";
    }
    long until = prefs(this).getLong(PREF_NO_FUNDS_UNTIL, 0L);
    long leftMs = Math.max(0, until - System.currentTimeMillis());
    long min = (leftMs + 59_999L) / 60_000L;
    if (min <= 0) return "Auto Lay · sem saldo livre · a retomar";
    return "Auto Lay · sem saldo livre · pausa ~" + min + " min";
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

  /** Notificação ENTRAR (tela off). gold=Eventos raros; senão Lay 3x3 verde. */
  private void notifyEnter(boolean gold, String title, String body) {
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
    URL url = new URL(urlStr);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setConnectTimeout(15_000);
    conn.setReadTimeout(25_000);
    conn.setRequestMethod("GET");
    conn.setRequestProperty("Accept", "application/json");
    int code = conn.getResponseCode();
    InputStream stream =
        code >= 400
            ? (conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream())
            : conn.getInputStream();
    String text = readStream(stream);
    conn.disconnect();
    if (code < 200 || code >= 300) {
      throw new Exception("live HTTP " + code);
    }
    return new JSONObject(text);
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
