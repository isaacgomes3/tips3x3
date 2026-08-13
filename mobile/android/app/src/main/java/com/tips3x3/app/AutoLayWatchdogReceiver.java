package com.tips3x3.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * Rede de segurança externa ao processo. Se o Android encerrar o serviço ou o
 * usuário remover a tarefa, um alarme explícito restaura a varredura nativa.
 */
public final class AutoLayWatchdogReceiver extends BroadcastReceiver {
  private static final String TAG = "SurebetWatchdog";
  private static final String ACTION = "com.tips3x3.app.AUTOLAY_WATCHDOG";
  private static final int REQUEST_CODE = 33025;

  static void schedule(Context context, long delayMs) {
    Context app = context.getApplicationContext();
    AlarmManager alarm = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
    if (alarm == null) return;
    Intent intent = new Intent(app, AutoLayWatchdogReceiver.class).setAction(ACTION);
    PendingIntent pending = PendingIntent.getBroadcast(
        app,
        REQUEST_CODE,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    long at = SystemClock.elapsedRealtime() + Math.max(5_000L, delayMs);
    try {
      if (Build.VERSION.SDK_INT >= 31 && !alarm.canScheduleExactAlarms()) {
        alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
      } else if (Build.VERSION.SDK_INT >= 23) {
        alarm.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
      } else {
        alarm.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
      }
    } catch (Exception error) {
      Log.w(TAG, "schedule: " + error.getMessage());
      try {
        alarm.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
      } catch (Exception ignored) {
      }
    }
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    boolean shouldRun = BuildConfig.SUREBET_ONLY
        || AutoLayForegroundService.prefs(context).getBoolean("autoOn", false);
    if (!shouldRun) return;
    try {
      Intent service = new Intent(context, AutoLayForegroundService.class);
      service.setAction(AutoLayForegroundService.ACTION_START);
      ContextCompat.startForegroundService(context, service);
    } catch (Exception error) {
      Log.w(TAG, "restart: " + error.getMessage());
    } finally {
      schedule(context, 120_000L);
    }
  }
}
