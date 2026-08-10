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
  public void syncSettings(PluginCall call) {
    boolean autoOn = Boolean.TRUE.equals(call.getBoolean("autoOn", false));
    boolean lay3x3On = Boolean.TRUE.equals(call.getBoolean("lay3x3On", true));
    boolean eventosRarosOn = Boolean.TRUE.equals(call.getBoolean("eventosRarosOn", true));
    boolean lucroCertoOn = Boolean.TRUE.equals(call.getBoolean("lucroCertoOn", true));
    boolean lolpOn = Boolean.TRUE.equals(call.getBoolean("layOverLimitPressureOn", true));
    boolean qovOn = Boolean.TRUE.equals(call.getBoolean("qovOn", true));
    boolean over35On = Boolean.TRUE.equals(call.getBoolean("over35On", true));
    boolean over45On = Boolean.TRUE.equals(call.getBoolean("over45On", true));
    Double stakeLolp = call.getDouble("stakeLolpPct", 5.0);
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
        qovOn,
        stakeLay3x3 != null ? stakeLay3x3 : 20,
        fixedEr,
        fixed,
        reserved,
        profitPoints != null ? profitPoints : 0.5,
        stakeLolp != null && stakeLolp > 0 ? stakeLolp : 5,
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
    AutoLayForegroundService.prefs(getContext()).edit().putBoolean("autoOn", true).apply();
    startService();
    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("running", true);
    call.resolve(out);
  }

  @PluginMethod
  public void stop(PluginCall call) {
    AutoLayForegroundService.prefs(getContext()).edit().putBoolean("autoOn", false).apply();
    stopService();
    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("running", false);
    call.resolve(out);
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    JSObject out = new JSObject();
    out.put(
        "autoOn",
        AutoLayForegroundService.prefs(getContext()).getBoolean("autoOn", false));
    out.put("running", AutoLayForegroundService.isRunning());
    call.resolve(out);
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
