package com.tips3x3.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final int NOTIFICATION_PERMISSION = 3303;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetBraPlugin.class);
    registerPlugin(AutoLayPlugin.class);
    if (BuildConfig.DUAL_EXCHANGE) registerPlugin(DualSurebetPlugin.class);
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    ensureNotificationPermissionAndMonitor();
  }

  private void ensureNotificationPermissionAndMonitor() {
    if (Build.VERSION.SDK_INT >= 33
        && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          this,
          new String[] {Manifest.permission.POST_NOTIFICATIONS},
          NOTIFICATION_PERMISSION);
      return;
    }
    startNativeMonitor();
  }

  private void startNativeMonitor() {
    Intent service = new Intent(this, AutoLayForegroundService.class);
    service.setAction(AutoLayForegroundService.ACTION_START);
    ContextCompat.startForegroundService(this, service);
  }

  @Override
  public void onRequestPermissionsResult(
      int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == NOTIFICATION_PERMISSION
        && grantResults.length > 0
        && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      startNativeMonitor();
    }
  }
}
