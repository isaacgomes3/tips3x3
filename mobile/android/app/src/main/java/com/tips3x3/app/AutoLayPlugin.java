package com.tips3x3.app;

import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AutoLay")
public class AutoLayPlugin extends Plugin {

    @PluginMethod
    public void syncSettings(PluginCall call) {
        boolean autoOn             = Boolean.TRUE.equals(call.getBoolean("autoOn", false));
        boolean lay3x3On           = Boolean.TRUE.equals(call.getBoolean("lay3x3On", false));
        boolean eventosRarosOn     = Boolean.TRUE.equals(call.getBoolean("eventosRarosOn", false));
        boolean lucroCertoOn       = Boolean.TRUE.equals(call.getBoolean("lucroCertoOn", false));
        boolean lay1x1On           = Boolean.TRUE.equals(call.getBoolean("lay1x1On", false));
        boolean lolpOn             = Boolean.TRUE.equals(call.getBoolean("layOverLimitPressureOn", false));
        boolean qovOn              = Boolean.TRUE.equals(call.getBoolean("qovOn", false));
        boolean over35On           = Boolean.TRUE.equals(call.getBoolean("over35On", false));
        boolean over45On           = Boolean.TRUE.equals(call.getBoolean("over45On", false));
        String  apiBase            = call.getString("apiBase", "https://tips3x3.com");

        Intent intent = new Intent(getContext(), AutoLayForegroundService.class);
        intent.putExtra("autoOn",               autoOn);
        intent.putExtra("lay3x3On",             lay3x3On);
        intent.putExtra("eventosRarosOn",       eventosRarosOn);
        intent.putExtra("lucroCertoOn",         lucroCertoOn);
        intent.putExtra("lay1x1On",             lay1x1On);
        intent.putExtra("layOverLimitPressureOn", lolpOn);
        intent.putExtra("qovOn",                qovOn);
        intent.putExtra("over35On",             over35On);
        intent.putExtra("over45On",             over45On);
        intent.putExtra("apiBase",              apiBase);

        if (autoOn) {
            intent.setAction("START");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
        } else {
            intent.setAction("STOP");
            getContext().startService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("ok",      true);
        ret.put("autoOn",  autoOn);
        ret.put("running", autoOn && AutoLayForegroundService.isRunning);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), AutoLayForegroundService.class);
        intent.setAction("STOP");
        getContext().startService(intent);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean running = AutoLayForegroundService.isRunning;
        JSObject ret = new JSObject();
        ret.put("ok",      true);
        ret.put("running", running);
        ret.put("autoOn",  running);
        call.resolve(ret);
    }

    @PluginMethod
    public void getActiveTrade(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok",     true);
        ret.put("active", false);
        call.resolve(ret);
    }
}
