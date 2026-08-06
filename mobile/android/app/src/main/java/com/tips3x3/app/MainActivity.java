package com.tips3x3.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AutoLayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
