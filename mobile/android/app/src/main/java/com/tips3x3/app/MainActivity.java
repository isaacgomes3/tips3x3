package com.tips3x3.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetBraPlugin.class);
    super.onCreate(savedInstanceState);
    // Evita WebView sob o relógio / status bar (Android 15 edge-to-edge).
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
