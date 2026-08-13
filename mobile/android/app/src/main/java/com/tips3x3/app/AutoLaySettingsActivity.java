package com.tips3x3.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/** Configurações operacionais locais. O site não escreve nestas preferências. */
public class AutoLaySettingsActivity extends AppCompatActivity {
  private static final int NOTIFICATION_PERMISSION = 3302;

  private SharedPreferences prefs;
  private SwitchCompat autoOn;
  private SwitchCompat lay3x3On;
  private SwitchCompat eventosRarosOn;
  private SwitchCompat lucroCertoOn;
  private SwitchCompat lolpOn;
  private SwitchCompat postGoalOn;
  private SwitchCompat matchOddsSurebetOn;
  private SwitchCompat qovOn;
  private SwitchCompat over35On;
  private SwitchCompat over45On;

  private EditText stakeLay3x3;
  private EditText stakeEventosRaros;
  private EditText stakeLucroCerto;
  private EditText reservaLucroCerto;
  private EditText lucroAlvo;
  private EditText stakeLolp;
  private EditText stakePostGoal;
  private EditText matchOddsSurebetExposure;
  private SwitchCompat surebetPreliveOn;
  private SwitchCompat surebetLiveOn;
  private EditText surebetPreliveBankPct;
  private EditText surebetLiveBankPct;
  private EditText stakeQov;
  private EditText stakeOver35;
  private EditText stakeOver45;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    prefs = AutoLayForegroundService.prefs(this);
    if (BuildConfig.SUREBET_ONLY) {
      prefs.edit()
          .putBoolean("lucroCertoOn", false)
          .putFloat("reservedLucroCerto", 0f)
          .apply();
      BetBraTradeEngine.setReservedLucroCerto(this, 0);
    }
    setContentView(buildScreen());
  }

  private View buildScreen() {
    ScrollView scroll = new ScrollView(this);
    scroll.setBackgroundColor(Color.rgb(5, 5, 5));

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(dp(20), dp(26), dp(20), dp(36));
    scroll.addView(root);

    TextView title = text("Configurações do APK", 26, Color.WHITE);
    title.setTypeface(null, android.graphics.Typeface.BOLD);
    root.addView(title);
    TextView subtitle = text(
        "Estas configurações ficam neste aparelho. O site não pode alterá-las.",
        14,
        Color.rgb(160, 178, 166));
    subtitle.setPadding(0, dp(6), 0, dp(18));
    root.addView(subtitle);

    autoOn = toggle(root, "Auto Lay em segundo plano", "autoOn", false);
    if (BuildConfig.SUREBET_ONLY) {
      section(root, "SUREBET");
      surebetPreliveOn = toggle(root, "Pré-live + intervalo", "surebetPreliveOn", true);
      surebetLiveOn = toggle(root, "Live · jogo em andamento", "surebetLiveOn", true);
      section(root, "PERCENTUAL DA BANCA");
      surebetPreliveBankPct = number(root, "Banca Pré-live + intervalo (%)", "surebetPreliveBankPct", 10f);
      surebetLiveBankPct = number(root, "Banca Live (%)", "surebetLiveBankPct", 10f);
      TextView markets = text("Mercados: Match Odds e Resultado do 1º Tempo", 14, Color.rgb(160, 178, 166));
      markets.setPadding(0, dp(14), 0, dp(4));
      root.addView(markets);
      if (BuildConfig.DUAL_EXCHANGE) {
        Button connectBolsa = new Button(this);
        connectBolsa.setText("CONECTAR BOLSA DE APOSTA");
        connectBolsa.setOnClickListener(v -> {
          Intent login = new Intent(this, BetBraLoginActivity.class);
          login.putExtra(BetBraLoginActivity.EXTRA_VENUE, "bolsa");
          startActivity(login);
        });
        LinearLayout.LayoutParams connectLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        connectLp.topMargin = dp(16);
        root.addView(connectBolsa, connectLp);
        TextView dualInfo = text(
            "Compara apenas Match Odds e Resultado do 1º Tempo pré-live nas duas bolsas.",
            13, Color.rgb(160, 178, 166));
        dualInfo.setPadding(0, dp(8), 0, 0);
        root.addView(dualInfo);
      }
    } else {
    section(root, "FILTROS");
    lay3x3On = toggle(root, "Lay 3x3", "lay3x3On", true);
    eventosRarosOn = toggle(root, "Eventos raros", "eventosRarosOn", true);
    lucroCertoOn = toggle(root, "Lucro certo", "lucroCertoOn", true);
    lolpOn = toggle(root, "Lay Over Limit Pressure", "layOverLimitPressureOn", true);
    postGoalOn = toggle(root, "Correção pós-gol · Lay Over", "postGoalCorrectionOn", false);
    qovOn = toggle(root, "QOV zebra", "qovOn", true);
    over35On = toggle(root, "Over 3.5", "over35On", true);
    over45On = toggle(root, "Over 4.5", "over45On", true);

    section(root, "VALORES E PERCENTUAIS");
    stakeLay3x3 = number(root, "Banca do Lay 3x3 (%)", "stakeLay3x3Pct", 20f);
    stakeEventosRaros = number(root, "Entrada Eventos raros (R$)", "stakeFixedEr", 500f);
    stakeLucroCerto = number(root, "Entrada Lucro certo (R$)", "stakeFixedLc", 1001f);
    reservaLucroCerto = number(root, "Reserva Lucro certo (R$)", "reservedLucroCerto", 1001f);
    lucroAlvo = number(root, "Lucro-alvo de todas as entradas Lay→Back (%)", "profitPctPoints", 0.5f);
    stakeLolp = number(root, "Banca LOLP (%)", "stakeLolpPct", 5f);
    stakePostGoal = number(root, "Banca Pós-Gol (%)", "stakePostGoalPct", 5f);
    stakeQov = number(root, "Banca QOV zebra (%)", "stakeQovPct", 20f);
    stakeOver35 = number(root, "Banca Over 3.5 (%)", "stakeOver35Pct", 10f);
    stakeOver45 = number(root, "Banca Over 4.5 (%)", "stakeOver45Pct", 10f);
    }

    Button save = new Button(this);
    save.setText("SALVAR NO APK");
    save.setTextColor(Color.BLACK);
    save.setTextSize(15);
    save.setBackgroundColor(Color.rgb(217, 255, 0));
    LinearLayout.LayoutParams saveLp =
        new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
    saveLp.topMargin = dp(24);
    root.addView(save, saveLp);
    save.setOnClickListener(v -> saveSettings());

    Button test = new Button(this);
    test.setText("TESTAR NOTIFICAÇÕES");
    test.setTextColor(Color.WHITE);
    test.setBackgroundColor(Color.rgb(18, 36, 24));
    LinearLayout.LayoutParams testLp =
        new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
    testLp.topMargin = dp(10);
    root.addView(test, testLp);
    test.setOnClickListener(v -> testNotifications());

    Button close = new Button(this);
    close.setText("VOLTAR");
    close.setTextColor(Color.WHITE);
    close.setBackgroundColor(Color.rgb(22, 26, 24));
    LinearLayout.LayoutParams closeLp =
        new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
    closeLp.topMargin = dp(10);
    root.addView(close, closeLp);
    close.setOnClickListener(v -> finish());

    return scroll;
  }

  private SwitchCompat toggle(LinearLayout root, String label, String key, boolean fallback) {
    SwitchCompat sw = new SwitchCompat(this);
    sw.setText(label);
    sw.setTextColor(Color.WHITE);
    sw.setTextSize(16);
    sw.setChecked(prefs.getBoolean(key, fallback));
    sw.setPadding(dp(12), dp(9), dp(8), dp(9));
    LinearLayout.LayoutParams lp =
        new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
    lp.bottomMargin = dp(7);
    sw.setBackgroundColor(Color.rgb(17, 24, 19));
    root.addView(sw, lp);
    return sw;
  }

  private EditText number(
      LinearLayout root, String label, String key, float fallback) {
    TextView caption = text(label, 13, Color.rgb(154, 177, 163));
    caption.setPadding(dp(2), dp(7), 0, dp(5));
    root.addView(caption);
    EditText input = new EditText(this);
    input.setText(trimFloat(prefs.getFloat(key, fallback)));
    input.setTextColor(Color.WHITE);
    input.setHintTextColor(Color.GRAY);
    input.setSingleLine(true);
    input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    input.setPadding(dp(12), 0, dp(12), 0);
    input.setBackgroundColor(Color.rgb(15, 25, 17));
    root.addView(
        input,
        new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));
    return input;
  }

  private void section(LinearLayout root, String value) {
    TextView section = text(value, 12, Color.rgb(217, 255, 0));
    section.setTypeface(null, android.graphics.Typeface.BOLD);
    section.setPadding(0, dp(22), 0, dp(10));
    root.addView(section);
  }

  private TextView text(String value, float size, int color) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextSize(size);
    view.setTextColor(color);
    return view;
  }

  private void saveSettings() {
    if (BuildConfig.SUREBET_ONLY) {
      prefs.edit()
          .putBoolean("autoOn", autoOn.isChecked())
          .putBoolean("matchOddsSurebetOn", true)
          .putBoolean("surebetPreliveOn", surebetPreliveOn.isChecked())
          .putBoolean("surebetLiveOn", surebetLiveOn.isChecked())
          .putFloat("surebetPreliveBankPct", (float) positive(surebetPreliveBankPct, 10))
          .putFloat("surebetLiveBankPct", (float) positive(surebetLiveBankPct, 10))
          .putBoolean("lay3x3On", false).putBoolean("eventosRarosOn", false)
          .putBoolean("lucroCertoOn", false).putBoolean("layOverLimitPressureOn", false)
          .putBoolean("postGoalCorrectionOn", false).putBoolean("qovOn", false)
          .putBoolean("over35On", false).putBoolean("over45On", false)
          .apply();
      startNativeMonitor();
      Toast.makeText(this, "Configurações Surebet salvas", Toast.LENGTH_SHORT).show();
      return;
    }
    double fixedLc = positive(stakeLucroCerto, 1001);
    double fixedEr = positive(stakeEventosRaros, 500);
    double reserved = nonNegative(reservaLucroCerto, fixedLc);

    AutoLayForegroundService.persistSettings(
        this,
        autoOn.isChecked(),
        lay3x3On.isChecked(),
        eventosRarosOn.isChecked(),
        lucroCertoOn.isChecked(),
        lolpOn.isChecked(),
        postGoalOn.isChecked(),
        qovOn.isChecked(),
        positive(stakeLay3x3, 20),
        fixedEr,
        fixedLc,
        reserved,
        positive(lucroAlvo, 0.5),
        positive(stakeLolp, 5),
        positive(stakePostGoal, 5),
        positive(lucroAlvo, 0.5),
        positive(stakeQov, 20),
        over35On.isChecked(),
        over45On.isChecked(),
        positive(stakeOver35, 10),
        positive(stakeOver45, 10),
        "https://tips3x3.com");

    // Configuracao exclusiva do APK: o valor e o total dividido entre as tres
    // apostas Back, nunca uma stake repetida em cada resultado.
    prefs.edit()
        .putBoolean("matchOddsSurebetOn", false)
        .apply();

    if (Build.VERSION.SDK_INT >= 33
        && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          this,
          new String[] {Manifest.permission.POST_NOTIFICATIONS},
          NOTIFICATION_PERMISSION);
      Toast.makeText(this, "Permita as notificações para ativar o monitor", Toast.LENGTH_LONG).show();
      return;
    }
    startNativeMonitor();
    Toast.makeText(this, "Configurações salvas no APK", Toast.LENGTH_SHORT).show();
  }

  private void startNativeMonitor() {
    Intent service = new Intent(this, AutoLayForegroundService.class);
    service.setAction(AutoLayForegroundService.ACTION_START);
    ContextCompat.startForegroundService(this, service);
  }

  private void testNotifications() {
    if (Build.VERSION.SDK_INT >= 33
        && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          this,
          new String[] {Manifest.permission.POST_NOTIFICATIONS},
          NOTIFICATION_PERMISSION);
      return;
    }
    Intent service = new Intent(this, AutoLayForegroundService.class);
    service.setAction(AutoLayForegroundService.ACTION_TEST);
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
      Toast.makeText(this, "Monitor e notificações ativados", Toast.LENGTH_SHORT).show();
    }
  }

  private double positive(EditText input, double fallback) {
    try {
      double value = Double.parseDouble(input.getText().toString().replace(',', '.'));
      return value > 0 ? value : fallback;
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private double nonNegative(EditText input, double fallback) {
    try {
      double value = Double.parseDouble(input.getText().toString().replace(',', '.'));
      return value >= 0 ? value : fallback;
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private String trimFloat(float value) {
    if (value == Math.rint(value)) return String.valueOf((int) value);
    return String.valueOf(value);
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }
}
