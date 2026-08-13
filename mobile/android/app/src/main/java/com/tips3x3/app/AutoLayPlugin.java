package com.tips3x3.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge JS → {@link AutoLayForegroundService} (Auto Lay com tela desligada).
 */
@CapacitorPlugin(name = "AutoLay")
public class AutoLayPlugin extends Plugin {

  @PluginMethod
  public void openSettings(PluginCall call) {
    normalizeSurebetSettings();
    Intent intent = new Intent(getContext(), AutoLaySettingsActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
    JSObject out = new JSObject();
    out.put("ok", true);
    call.resolve(out);
  }

  @PluginMethod
  public void syncSettings(PluginCall call) {
    if (apkOwnsSettings()) {
      resolveReadOnlyStatus(call);
      return;
    }
    boolean autoOn = Boolean.TRUE.equals(call.getBoolean("autoOn", false));
    boolean lay3x3On = Boolean.TRUE.equals(call.getBoolean("lay3x3On", true));
    boolean eventosRarosOn = Boolean.TRUE.equals(call.getBoolean("eventosRarosOn", true));
    boolean lucroCertoOn = Boolean.TRUE.equals(call.getBoolean("lucroCertoOn", true));
    boolean lolpOn = Boolean.TRUE.equals(call.getBoolean("layOverLimitPressureOn", true));
    boolean postGoalOn = Boolean.TRUE.equals(call.getBoolean("postGoalCorrectionOn", false));
    boolean qovOn = Boolean.TRUE.equals(call.getBoolean("qovOn", true));
    boolean over35On = Boolean.TRUE.equals(call.getBoolean("over35On", true));
    boolean over45On = Boolean.TRUE.equals(call.getBoolean("over45On", true));
    Double stakeLolp = call.getDouble("stakeLolpPct", 5.0);
    Double stakePostGoal = call.getDouble("stakePostGoalPct", 5.0);
    Double lolpProfit = call.getDouble("lolpProfitPct", 1.0);
    Double stakeQov = call.getDouble("stakeQovPct", 20.0);
    Double stakeOver35 = call.getDouble("stakeOver35Pct", 10.0);
    Double stakeOver45 = call.getDouble("stakeOver45Pct", 10.0);
    Double stakeLay3x3 = call.getDouble("stakeLay3x3Pct", 20.0);
    Double stakeFixedEr = call.getDouble("stakeFixedEr", 500.0);
    Double stakeFixedLc = call.getDouble("stakeFixedLc", 1001.0);
    Double reservedLc = call.getDouble("reservedLucroCerto", stakeFixedLc);
    Double profitPoints = call.getDouble("profitPctPoints", 0.5);
    String apiBase = call.getString("apiBase", "https://tips3x3.com");

    double fixed = stakeFixedLc != null && stakeFixedLc >= 1 ? stakeFixedLc : 1001;
    double fixedEr = stakeFixedEr != null && stakeFixedEr >= 1 ? stakeFixedEr : 500;
    double reserved =
        reservedLc != null && reservedLc >= 0 ? reservedLc : fixed;

    AutoLayForegroundService.persistSettings(
        getContext(),
        autoOn,
        lay3x3On,
        eventosRarosOn,
        lucroCertoOn,
        lolpOn,
        postGoalOn,
        qovOn,
        stakeLay3x3 != null ? stakeLay3x3 : 20,
        fixedEr,
        fixed,
        reserved,
        profitPoints != null ? profitPoints : 0.5,
        stakeLolp != null && stakeLolp > 0 ? stakeLolp : 5,
        stakePostGoal != null && stakePostGoal > 0 ? stakePostGoal : 5,
        lolpProfit != null && lolpProfit > 0 ? lolpProfit : 1,
        stakeQov != null && stakeQov > 0 ? stakeQov : 20,
        over35On,
        over45On,
        stakeOver35 != null && stakeOver35 > 0 ? stakeOver35 : 10,
        stakeOver45 != null && stakeOver45 > 0 ? stakeOver45 : 10,
        apiBase);

    if (autoOn) {
      startService();
    } else {
      stopService();
    }

    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("running", AutoLayForegroundService.isRunning() || autoOn);
    call.resolve(out);
  }

  @PluginMethod
  public void start(PluginCall call) {
    if (apkOwnsSettings()) {
      resolveReadOnlyStatus(call);
      return;
    }
    AutoLayForegroundService.prefs(getContext()).edit().putBoolean("autoOn", true).apply();
    startService();
    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("running", true);
    call.resolve(out);
  }

  @PluginMethod
  public void stop(PluginCall call) {
    if (apkOwnsSettings()) {
      resolveReadOnlyStatus(call);
      return;
    }
    AutoLayForegroundService.prefs(getContext()).edit().putBoolean("autoOn", false).apply();
    stopService();
    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("running", false);
    call.resolve(out);
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    normalizeSurebetSettings();
    android.content.SharedPreferences settings =
        AutoLayForegroundService.prefs(getContext());
    JSObject out = new JSObject();
    out.put("autoOn", settings.getBoolean("autoOn", false));
    out.put("running", AutoLayForegroundService.isRunning());
    out.put("managedInApk", true);
    out.put("surebetEdition", BuildConfig.SUREBET_ONLY);
    out.put("bolsaOnly", BuildConfig.BOLSA_ONLY);
    out.put("exchangeDisplayName", BuildConfig.BOLSA_ONLY ? "Bolsa de Aposta" : "BetBra");
    out.put("lucroCertoOn", BuildConfig.SUREBET_ONLY ? false : settings.getBoolean("lucroCertoOn", true));
    out.put("stakeFixedLc", settings.getFloat("stakeFixedLc", 1001f));
    out.put("reservedLucroCerto", BuildConfig.SUREBET_ONLY ? 0 : new BetBraTradeEngine(getContext()).getReservedLucroCerto());
    call.resolve(out);
  }

  private boolean apkOwnsSettings() {
    return true;
  }

  private void resolveReadOnlyStatus(PluginCall call) {
    normalizeSurebetSettings();
    boolean autoOn =
        AutoLayForegroundService.prefs(getContext()).getBoolean("autoOn", false);
    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("managedInApk", true);
    out.put("surebetEdition", BuildConfig.SUREBET_ONLY);
    out.put("bolsaOnly", BuildConfig.BOLSA_ONLY);
    out.put("exchangeDisplayName", BuildConfig.BOLSA_ONLY ? "Bolsa de Aposta" : "BetBra");
    out.put("autoOn", autoOn);
    out.put("running", AutoLayForegroundService.isRunning());
    out.put(
        "lucroCertoOn",
        BuildConfig.SUREBET_ONLY ? false : AutoLayForegroundService.prefs(getContext()).getBoolean("lucroCertoOn", true));
    out.put(
        "stakeFixedLc",
        AutoLayForegroundService.prefs(getContext()).getFloat("stakeFixedLc", 1001f));
    out.put("reservedLucroCerto", BuildConfig.SUREBET_ONLY ? 0 : new BetBraTradeEngine(getContext()).getReservedLucroCerto());
    call.resolve(out);
  }

  /** Remove preferencias incompatíveis herdadas do APK Auto Lay comum. */
  private void normalizeSurebetSettings() {
    if (!BuildConfig.SUREBET_ONLY) return;
    AutoLayForegroundService.prefs(getContext())
        .edit()
        .putBoolean("lucroCertoOn", false)
        .putFloat("reservedLucroCerto", 0f)
        .remove("active_trade_json")
        .apply();
    BetBraTradeEngine.setReservedLucroCerto(getContext(), 0);
  }

  /** Operação green ativa (fase Lay/Back) persistida pelo Foreground Service. */
  @PluginMethod
  public void getActiveTrade(PluginCall call) {
    JSObject out = new JSObject();
    try {
      String raw =
          AutoLayForegroundService.prefs(getContext())
              .getString("active_trade_json", "");
      if (raw == null || raw.isEmpty()) {
        out.put("ok", true);
        out.put("active", false);
        call.resolve(out);
        return;
      }
      org.json.JSONObject t = new org.json.JSONObject(raw);
      String phase = t.optString("phase", "");
      if ("closed".equals(phase) || t.optString("eventId", "").isEmpty()) {
        out.put("ok", true);
        out.put("active", false);
        call.resolve(out);
        return;
      }
      boolean matched =
          t.optBoolean("matched", false)
              || "awaiting_back".equals(phase)
              || "back_sent".equals(phase);
      out.put("ok", true);
      // active=true só com Lay casado (entrada confirmada + valores exatos).
      // Antes disso: pending=true para UI mostrar “aguarda casar” sem stake.
      out.put("active", matched);
      out.put("pending", !matched);
      out.put("matched", matched);
      out.put("eventId", t.optString("eventId", ""));
      out.put("eventName", t.optString("eventName", ""));
      out.put("score", t.optString("score", "3-3"));
      out.put("layOdds", matched ? t.optDouble("layOdds", 0) : 0);
      out.put("layStake", matched ? t.optDouble("layStake", 0) : 0);
      out.put("liability", matched ? t.optDouble("liability", 0) : 0);
      out.put("marketId", t.optString("marketId", ""));
      out.put("runnerId", t.optString("runnerId", ""));
      out.put("targetBack", matched ? t.optDouble("targetBack", 0) : 0);
      out.put("backStake", matched ? t.optDouble("backStake", 0) : 0);
      out.put("profitFrac", t.optDouble("profitFrac", 0));
      out.put("phase", phase);
      out.put("at", t.optLong("at", 0L));
      out.put("offerId", matched ? t.optString("offerId", "") : "");
      out.put("betId", matched ? t.optString("betId", "") : "");
      out.put("error", t.optString("lastBackError", ""));
      call.resolve(out);
    } catch (Exception e) {
      out.put("ok", false);
      out.put("active", false);
      out.put("error", e.getMessage() != null ? e.getMessage() : "erro");
      call.resolve(out);
    }
  }

  private void startService() {
    Intent i = new Intent(getContext(), AutoLayForegroundService.class);
    i.setAction(AutoLayForegroundService.ACTION_START);
    if (Build.VERSION.SDK_INT >= 26) {
      getContext().startForegroundService(i);
    } else {
      getContext().startService(i);
    }
  }

  private void stopService() {
    Intent i = new Intent(getContext(), AutoLayForegroundService.class);
    i.setAction(AutoLayForegroundService.ACTION_STOP);
    getContext().startService(i);
  }
}
