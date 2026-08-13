package com.tips3x3.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * WebView para login BetBra Exchange. Extrai session-token (cookie/localStorage)
 * e devolve no Intent para o {@link BetBraPlugin}.
 */
public class BetBraLoginActivity extends AppCompatActivity {
  public static final String EXTRA_URL = "url";
  public static final String EXTRA_SESSION_TOKEN = "sessionToken";
  public static final String EXTRA_BALANCE = "balance";
  public static final String EXTRA_VENUE = "venue";
  /** Exchange — é aqui que nasce o cookie session-token da API. */
  private static final String DEFAULT_URL =
      "https://betbra.bet.br/b/exchange/sport/soccer";

  private WebView web;
  private TextView hint;
  private Button done;
  private boolean bolsaVenue;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    bolsaVenue = getIntent() != null && "bolsa".equals(getIntent().getStringExtra(EXTRA_VENUE));

    hint = new TextView(this);
    hint.setText(
        "1) Faça login  ·  2) Confirme que está na Bolsa/Exchange  ·  3) Toque em Pronto");
    hint.setTextColor(Color.parseColor("#D9FF00"));
    hint.setPadding(28, 20, 28, 12);
    hint.setTextSize(13f);

    done = new Button(this);
    done.setText("Pronto — voltar ao Tips3x3");
    done.setOnClickListener(v -> finishWithToken());

    web = new WebView(this);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setLoadWithOverviewMode(true);
    settings.setUseWideViewPort(true);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setSupportZoom(false);

    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(web, true);

    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            view.evaluateJavascript(BetBraBalanceJs.INSTALL_HOOK, null);
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            view.evaluateJavascript(BetBraBalanceJs.INSTALL_HOOK, null);
            probeTokenQuiet();
          }
        });
    web.setWebChromeClient(new WebChromeClient());

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.parseColor("#050505"));
    root.setLayoutParams(
        new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    LinearLayout.LayoutParams barLp =
        new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    root.addView(hint, barLp);
    root.addView(done, barLp);

    LinearLayout.LayoutParams webLp =
        new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
    root.addView(web, webLp);
    setContentView(root);

    String url = getIntent() != null ? getIntent().getStringExtra(EXTRA_URL) : null;
    if (url == null || url.isEmpty()) {
      url = bolsaVenue ? "https://bolsadeaposta.bet.br/b/exchange" : DEFAULT_URL;
    }
    web.loadUrl(url);
  }

  private void probeTokenQuiet() {
    extractToken(
        (token) -> {
          if (token != null && !token.isEmpty()) {
            runOnUiThread(
                () -> {
                  hint.setText("Sessão Exchange detectada — toque em Pronto");
                  done.setText("Pronto — sessão OK");
                });
          }
        });
  }

  private void finishWithToken() {
    CookieManager.getInstance().flush();
    extractToken(
        (token) -> {
          Intent data = new Intent();
          if (token != null && !token.isEmpty()) {
            data.putExtra(EXTRA_SESSION_TOKEN, token);
            if (bolsaVenue) BolsaApostaExchangeClient.saveToken(this, token);
            else getSharedPreferences(BetBraTradeEngine.PREFS, MODE_PRIVATE).edit()
                .putString("session_token", token).apply();
          }
          // Espelha cookie nos hosts da API antes de fechar
          if (token != null && !token.isEmpty()) {
            CookieManager cm = CookieManager.getInstance();
            String cookie = "session-token=" + token + "; Path=/";
            if (bolsaVenue) {
              cm.setCookie("https://bolsadeaposta.bet.br", cookie);
              cm.setCookie("https://mexchange.bolsadeaposta.bet.br", cookie);
              cm.setCookie("https://mexchange-api.bolsadeaposta.bet.br", cookie);
            } else {
              cm.setCookie("https://betbra.bet.br", cookie);
              cm.setCookie("https://mexchange.betbra.bet.br", cookie);
              cm.setCookie("https://mexchange-api.betbra.bet.br", cookie);
            }
            cm.flush();
            restartSurebetMonitor();
          }
          // Lê saldo da página (API REST /account retorna 404 na BetBra)
          if (web != null) {
            web.evaluateJavascript(
                BetBraBalanceJs.READ_BALANCE,
                (value) -> {
                  Double bal = parseJsNumber(value);
                  if (bal != null) data.putExtra(EXTRA_BALANCE, bal.doubleValue());
                  setResult(RESULT_OK, data);
                  finish();
                });
          } else {
            setResult(RESULT_OK, data);
            finish();
          }
        });
  }

  /** Reconectar deve acordar e reiniciar imediatamente o poll de segundo plano. */
  private void restartSurebetMonitor() {
    if (!BuildConfig.SUREBET_ONLY) return;
    Intent service = new Intent(this, AutoLayForegroundService.class);
    service.setAction(AutoLayForegroundService.ACTION_START);
    if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(service);
    else startService(service);
  }

  private static Double parseJsNumber(String value) {
    if (value == null || value.equals("null") || value.isEmpty()) return null;
    String s = value.trim();
    if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
      s = s.substring(1, s.length() - 1);
    }
    try {
      double n = Double.parseDouble(s);
      if (n >= 0 && n <= 5_000_000 && !Double.isNaN(n)) {
        return Math.round(n * 100.0) / 100.0;
      }
    } catch (Exception ignored) {
    }
    return null;
  }

  private void extractToken(ValueCallback<String> cb) {
    if (web == null) {
      cb.onReceiveValue("");
      return;
    }
    String js =
        "(function(){"
            + "var token='';"
            + "try{"
            + "  var m=String(document.cookie||'').match(/(?:^|;\\s*)session[-_]?token=([^;]+)/i);"
            + "  if(m) token=decodeURIComponent(m[1]);"
            + "}catch(e){}"
            + "try{"
            + "  for(var i=0;i<localStorage.length;i++){"
            + "    var k=localStorage.key(i)||'';"
            + "    if(!/session|token|auth|usuario|user/i.test(k)) continue;"
            + "    var v=localStorage.getItem(k);"
            + "    if(!v||v.length<12||v.length>500) continue;"
            + "    v=String(v).replace(/^\\\"|\\\"$/g,'').replace(/^'|'$/g,'');"
            + "    if(/session/i.test(k) || /^\\d{3,}_[a-f0-9]{8,}$/i.test(v)){"
            + "      if(!token) token=v;"
            + "    }"
            + "  }"
            + "}catch(e){}"
            + "return token||'';"
            + "})();";
    web.evaluateJavascript(
        js,
        (value) -> {
          String token = unwrapJsString(value);
          if (token == null || token.isEmpty()) {
            // fallback CookieManager
            token = cookieManagerToken();
          }
          cb.onReceiveValue(token != null ? token : "");
        });
  }

  private static String unwrapJsString(String value) {
    if (value == null || value.equals("null") || value.equals("\"\"")) return "";
    String s = value.trim();
    if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
      s = s.substring(1, s.length() - 1);
      s = s.replace("\\\"", "\"").replace("\\\\", "\\");
    }
    return s.trim();
  }

  private String cookieManagerToken() {
    CookieManager cm = CookieManager.getInstance();
    String[] hosts =
        new String[] {
          "https://betbra.bet.br/",
          "https://www.betbra.bet.br/",
          "https://mexchange.betbra.bet.br/",
          "https://mexchange-api.betbra.bet.br/",
          "https://betbra.bet.br/b/exchange/sport/soccer"
        };
    for (String host : hosts) {
      String raw = cm.getCookie(host);
      if (raw == null) continue;
      java.util.regex.Matcher m =
          java.util.regex.Pattern.compile(
                  "(?:^|;\\s*)session[-_]?token=([^;]+)",
                  java.util.regex.Pattern.CASE_INSENSITIVE)
              .matcher(raw);
      if (m.find()) return m.group(1).trim();
      for (String part : raw.split(";")) {
        String p = part.trim();
        int eq = p.indexOf('=');
        if (eq <= 0) continue;
        String name = p.substring(0, eq).trim();
        String val = p.substring(eq + 1).trim();
        if (name.toLowerCase(java.util.Locale.ROOT).contains("session") && val.length() > 12) {
          return val;
        }
      }
    }
    return "";
  }

  @Override
  public void onBackPressed() {
    finishWithToken();
  }
}
