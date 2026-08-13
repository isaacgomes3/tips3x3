package com.tips3x3.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

/** Restaura o monitor nativo após reinício do aparelho ou atualização do APK. */
public class AutoLayBootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (Build.VERSION.SDK_INT >= 33
        && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      return;
    }
    try {
      Intent service = new Intent(context, AutoLayForegroundService.class);
      service.setAction(AutoLayForegroundService.ACTION_START);
      ContextCompat.startForegroundService(context, service);
    } catch (Exception e) {
      Log.w("AutoLayBoot", "Não foi possível restaurar o monitor: " + e.getMessage());
    }
  }
}
