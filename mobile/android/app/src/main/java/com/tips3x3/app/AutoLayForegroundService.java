package com.tips3x3.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;

public class AutoLayForegroundService extends Service {

    private static final String CHANNEL_ID = "autolay-fgs";
    private static final int    NOTIF_ID   = 2001;

    /** Consultado por AutoLayPlugin.getStatus() sem IPC. */
    public static volatile boolean isRunning = false;

    // ── Ciclo de vida ──────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if ("STOP".equals(intent.getAction())) {
            isRunning = false;
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        boolean autoOn         = intent.getBooleanExtra("autoOn",               false);
        boolean lay3x3On       = intent.getBooleanExtra("lay3x3On",             false);
        boolean eventosRarosOn = intent.getBooleanExtra("eventosRarosOn",       false);
        boolean lucroCertoOn   = intent.getBooleanExtra("lucroCertoOn",         false);
        boolean lay1x1On       = intent.getBooleanExtra("lay1x1On",             false);
        boolean lolpOn         = intent.getBooleanExtra("layOverLimitPressureOn", false);
        boolean qovOn          = intent.getBooleanExtra("qovOn",                false);
        boolean over35On       = intent.getBooleanExtra("over35On",             false);
        boolean over45On       = intent.getBooleanExtra("over45On",             false);

        // Monta lista de estratégias ativas
        List<String> ativas = new ArrayList<>();
        if (lay3x3On)       ativas.add("Lay 3x3");
        if (lay1x1On)       ativas.add("Lay 1x1");
        if (eventosRarosOn) ativas.add("Eventos raros");
        if (lucroCertoOn)   ativas.add("Lucro certo");
        if (lolpOn)         ativas.add("Lay pressão");
        if (qovOn)          ativas.add("QOV");
        if (over35On)       ativas.add("Over 3.5");
        if (over45On)       ativas.add("Over 4.5");

        String body;
        if (!autoOn) {
            body = "Auto Lay desligado";
        } else if (ativas.isEmpty()) {
            body = "Auto Lay · nenhuma estratégia ligada";
        } else {
            body = "Auto Lay · " + join(" + ", ativas);
        }

        isRunning = autoOn && !ativas.isEmpty();

        startForeground(NOTIF_ID, buildNotification(body));

        if (!autoOn || ativas.isEmpty()) {
            stopSelf();
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private Notification buildNotification(String body) {
        Intent tap = new Intent(this, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Tips3x3 · Auto Lay")
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_stat_tips3x3)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Auto Lay",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Serviço de Auto Lay em segundo plano");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private static String join(String sep, List<String> list) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(list.get(i));
        }
        return sb.toString();
    }
}
