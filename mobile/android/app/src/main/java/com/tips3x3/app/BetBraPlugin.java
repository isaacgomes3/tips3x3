package com.tips3x3.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sessão BetBra + POST /offers (Lay hold) para Eventos raros no APK.
 */
@CapacitorPlugin(name = "BetBra")
public class BetBraPlugin extends Plugin {
  private static final String API = "https://mexchange-api.betbra.bet.br/api";
  private static final String WEB_ORIGIN = "https://mexchange.betbra.bet.br";
  private static final String SITE = "https://betbra.bet.br";
  private static final String EXCHANGE_URL =
      "https://betbra.bet.br/b/exchange/sport/soccer";
  private static final String PREFS = "tips3x3_betbra";
  private static final String PREF_TOKEN = "session_token";
  private static final String PREF_BALANCE = "last_balance";
  private static final String PREF_BALANCE_AT = "last_balance_at";
  private static final String PREF_BALANCE_VIA = "last_balance_via";
  private static final String PREF_LOCAL_EXPOSURE = "local_lay_exposure";
  private static final String PREF_LOCAL_EXPOSURE_AT = "local_lay_exposure_at";
  /** Reserva só vale até /offers listar a oferta; depois a API já desconta. */
  private static final long LOCAL_EXPOSURE_TTL_MS = 90_000L;
  private static final String GUEST_TOKEN = "577717_e8a11c8e70edcbd95c5e9db17d0f6f4";
  private static final double MIN_STAKE = 1.0;
  private static final long BALANCE_CACHE_MS = 30L * 60L * 1000L;
  private static final Pattern SESSION_RE =
      Pattern.compile("(?:^|;\\s*)session[-_]?token=([^;]+)", Pattern.CASE_INSENSITIVE);
  private static final Pattern TOKEN_VAL_RE =
      Pattern.compile("^\\d{3,}_[a-f0-9]{8,}$", Pattern.CASE_INSENSITIVE);

  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());

  @PluginMethod
  public void openLogin(PluginCall call) {
    // Sempre Exchange — login só no sportsbook não gera session-token da Bolsa.
    String url = call.getString("url", EXCHANGE_URL);
    if (url == null || url.isEmpty() || url.equals(SITE) || url.equals(SITE + "/")) {
      url = EXCHANGE_URL;
    }
    Intent intent = new Intent(getContext(), BetBraLoginActivity.class);
    intent.putExtra(BetBraLoginActivity.EXTRA_URL, url);
    startActivityForResult(call, intent, "loginFinished");
  }

  @ActivityCallback
  private void loginFinished(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result != null && result.getData() != null) {
      String fromActivity =
          result.getData().getStringExtra(BetBraLoginActivity.EXTRA_SESSION_TOKEN);
      if (fromActivity != null && !fromActivity.isEmpty() && !isGuestToken(fromActivity)) {
        savePersistedToken(fromActivity);
        ensureApiCookie(fromActivity);
      }
      if (result.getData().hasExtra(BetBraLoginActivity.EXTRA_BALANCE)) {
        double bal = result.getData().getDoubleExtra(BetBraLoginActivity.EXTRA_BALANCE, -1);
        if (bal >= 0) savePersistedBalance(bal, "login-webview");
      }
    }
    main.postDelayed(
        () -> {
          // Re-lê cookies após flush da WebView
          String cookieTok = findSessionTokenFromCookies();
          if (cookieTok != null && !cookieTok.isEmpty()) {
            savePersistedToken(cookieTok);
            ensureApiCookie(cookieTok);
          }
          JSObject status = sessionStatusObject();
          Double cached = loadPersistedBalance(BALANCE_CACHE_MS);
          if (cached != null) status.put("balance", cached.doubleValue());
          notifyListeners("sessionChanged", status);
          call.resolve(status);
          // Atualiza saldo em background (API 404 → scrape WebView)
          refreshBalanceInBackground();
        },
        400);
  }

  @PluginMethod
  public void getSessionStatus(PluginCall call) {
    call.resolve(sessionStatusObject());
  }

  @PluginMethod
  public void getBalance(PluginCall call) {
    String token = findSessionToken();
    if (token == null || token.isEmpty()) {
      call.reject("Sem sessão BetBra — toque em Conectar BetBra");
      return;
    }
    io.execute(
        () -> {
          try {
            ensureApiCookie(token);
            BalanceProbe probe = fetchBalanceProbe(token);
            if (probe.balance != null) {
              savePersistedBalance(probe.balance, "api:" + probe.path);
              resolveBalanceOk(call, probe.balance, probe.path != null ? probe.path : "api");
              return;
            }
            // REST /account etc. costuma 404 na BetBra — lê da página Exchange
            scrapeBalanceFromExchange(
                (bal, via, err) -> {
                  if (bal != null) {
                    savePersistedBalance(bal, via);
                    resolveBalanceOk(call, bal, via);
                    return;
                  }
                  Double cached = loadPersistedBalance(BALANCE_CACHE_MS);
                  if (cached != null) {
                    resolveBalanceOk(call, cached, "cache");
                    return;
                  }
                  JSObject out = new JSObject();
                  out.put("ok", false);
                  out.put("connected", true);
                  out.put(
                      "error",
                      err != null && !err.isEmpty()
                          ? err
                          : "Não foi possível ler o saldo na Exchange. Reconecte e aguarde a Bolsa carregar.");
                  resolveOnMain(call, out);
                });
          } catch (Exception e) {
            rejectOnMain(call, e.getMessage() != null ? e.getMessage() : "Erro ao ler saldo");
          }
        });
  }

  private void resolveBalanceOk(PluginCall call, double balance, String via) {
    JSObject out = new JSObject();
    out.put("ok", true);
    out.put("connected", true);
    out.put("balance", balance);
    out.put("currency", "BRL");
    out.put("via", via != null ? via : "");
    resolveOnMain(call, out);
  }

  private void refreshBalanceInBackground() {
    io.execute(
        () -> {
          try {
            String token = findSessionToken();
            if (token == null || token.isEmpty()) return;
            ensureApiCookie(token);
            BalanceProbe probe = fetchBalanceProbe(token);
            if (probe.balance != null) {
              savePersistedBalance(probe.balance, "api:" + probe.path);
              return;
            }
            scrapeBalanceFromExchange(
                (bal, via, err) -> {
                  if (bal != null) savePersistedBalance(bal, via);
                });
          } catch (Exception ignored) {
          }
        });
  }

  private interface BalanceScrapeCb {
    void onDone(Double balance, String via, String error);
  }

  /** Carrega Exchange offscreen e lê saldo (DOM / storage / fetch hook). */
  @SuppressLint("SetJavaScriptEnabled")
  private void scrapeBalanceFromExchange(BalanceScrapeCb cb) {
    main.post(
        () -> {
          Activity activity = getActivity();
          if (activity == null || activity.isFinishing()) {
            cb.onDone(null, null, "Activity indisponível para ler saldo");
            return;
          }
          final AtomicBoolean done = new AtomicBoolean(false);
          final WebView wv = new WebView(activity);
          final FrameLayout host = new FrameLayout(activity);
          host.setLayoutParams(new FrameLayout.LayoutParams(1, 1));
          host.addView(wv, new FrameLayout.LayoutParams(1, 1));
          try {
            ViewGroup root = activity.findViewById(android.R.id.content);
            if (root != null) root.addView(host);
          } catch (Exception e) {
            cb.onDone(null, null, "Falha ao anexar WebView de saldo");
            return;
          }

          Runnable cleanup =
              () -> {
                try {
                  wv.stopLoading();
                  wv.destroy();
                } catch (Exception ignored) {
                }
                try {
                  ViewGroup parent = (ViewGroup) host.getParent();
                  if (parent != null) parent.removeView(host);
                } catch (Exception ignored) {
                }
              };

          Runnable finishNull =
              () -> {
                if (!done.compareAndSet(false, true)) return;
                cleanup.run();
                cb.onDone(null, null, "Saldo não apareceu na página da Exchange");
              };

          WebSettings settings = wv.getSettings();
          settings.setJavaScriptEnabled(true);
          settings.setDomStorageEnabled(true);
          settings.setDatabaseEnabled(true);
          CookieManager cm = CookieManager.getInstance();
          cm.setAcceptCookie(true);
          cm.setAcceptThirdPartyCookies(wv, true);

          final int[] attempts = {0};
          Runnable tryRead =
              new Runnable() {
                @Override
                public void run() {
                  if (done.get()) return;
                  attempts[0]++;
                  wv.evaluateJavascript(
                      BetBraBalanceJs.READ_BALANCE,
                      (value) -> {
                        if (done.get()) return;
                        Double bal = parseJsNumber(value);
                        if (bal != null) {
                          if (!done.compareAndSet(false, true)) return;
                          cleanup.run();
                          cb.onDone(bal, "webview", null);
                          return;
                        }
                        if (attempts[0] >= 8) {
                          finishNull.run();
                        } else {
                          main.postDelayed(this, 900);
                        }
                      });
                }
              };

          wv.setWebViewClient(
              new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                  view.evaluateJavascript(BetBraBalanceJs.INSTALL_HOOK, null);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                  view.evaluateJavascript(BetBraBalanceJs.INSTALL_HOOK, null);
                  main.postDelayed(tryRead, 1200);
                }
              });
          wv.setWebChromeClient(new WebChromeClient());
          String token = findSessionToken();
          if (token != null) ensureApiCookie(token);
          wv.loadUrl(EXCHANGE_URL);
          main.postDelayed(finishNull, 14_000);
        });
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

  private void savePersistedBalance(double balance, String via) {
    if (balance < 0 || balance > 5_000_000) return;
    prefs()
        .edit()
        .putString(PREF_BALANCE, String.valueOf(balance))
        .putLong(PREF_BALANCE_AT, System.currentTimeMillis())
        .putString(PREF_BALANCE_VIA, via != null ? via : "")
        .apply();
  }

  private Double loadPersistedBalance(long maxAgeMs) {
    String s = prefs().getString(PREF_BALANCE, "");
    long at = prefs().getLong(PREF_BALANCE_AT, 0L);
    if (s == null || s.isEmpty()) return null;
    if (maxAgeMs > 0 && (System.currentTimeMillis() - at) > maxAgeMs) return null;
    try {
      double n = Double.parseDouble(s);
      if (n >= 0 && n <= 5_000_000) return n;
    } catch (Exception ignored) {
    }
    return null;
  }

  private double loadLocalExposure() {
    try {
      double value = Math.max(0, prefs().getFloat(PREF_LOCAL_EXPOSURE, 0f));
      if (value <= 0.01) return 0;
      long at = prefs().getLong(PREF_LOCAL_EXPOSURE_AT, 0L);
      if (at <= 0 || System.currentTimeMillis() - at > LOCAL_EXPOSURE_TTL_MS) {
        clearLocalExposure();
        return 0;
      }
      return value;
    } catch (Exception e) {
      return 0;
    }
  }

  private void addLocalExposure(double liability) {
    if (!(liability > 0)) return;
    double next = Math.round((loadLocalExposure() + liability) * 100.0) / 100.0;
    prefs()
        .edit()
        .putFloat(PREF_LOCAL_EXPOSURE, (float) next)
        .putLong(PREF_LOCAL_EXPOSURE_AT, System.currentTimeMillis())
        .apply();
  }

  private void clearLocalExposure() {
    prefs().edit().remove(PREF_LOCAL_EXPOSURE).remove(PREF_LOCAL_EXPOSURE_AT).apply();
  }

  private double reconcileLocalExposure(double openExposureFromApi) {
    double local = loadLocalExposure();
    if (local <= 0.01) return 0;
    if (openExposureFromApi + 0.5 >= local) {
      clearLocalExposure();
      return 0;
    }
    double pending = Math.round((local - openExposureFromApi) * 100.0) / 100.0;
    if (pending < 0) pending = 0;
    prefs().edit().putFloat(PREF_LOCAL_EXPOSURE, (float) pending).apply();
    return pending;
  }

  @PluginMethod
  public void listOffers(PluginCall call) {
    io.execute(
        () -> {
          try {
            String token = findSessionToken();
            if (token == null || token.isEmpty()) {
              rejectOnMain(call, "Sem sessão BetBra — toque em Conectar BetBra");
              return;
            }
            ensureApiCookie(token);
            HttpResult res =
                httpJson("GET", API + "/offers?offset=0&per-page=200", null, token);
            if (res.code >= 400) {
              rejectOnMain(call, "HTTP " + res.code + " ao listar ofertas");
              return;
            }
            JSONArray arr = extractOffersArray(res);
            int open = 0;
            double openExposure = 0;
            StringBuilder summary = new StringBuilder();
            com.getcapacitor.JSArray offersOut = new com.getcapacitor.JSArray();
            int listed = 0;
            for (int i = 0; i < arr.length(); i++) {
              JSONObject o = arr.optJSONObject(i);
              if (o == null) continue;
              boolean stillOpen = isOfferStillOpen(o);
              JSObject row = offerToJs(o, stillOpen);
              if (stillOpen) {
                open++;
                double liab = row.getDouble("liability");
                if (liab > 0) openExposure += liab;
                if (summary.length() < 400) {
                  String event = row.getString("eventName");
                  if (event == null) event = "";
                  if (summary.length() > 0) summary.append(" · ");
                  summary
                      .append(event.isEmpty() ? ("#" + open) : event)
                      .append(" ")
                      .append(
                          String.format(
                              Locale.US,
                              "%.2f@%.2f",
                              row.getDouble("stake"),
                              row.getDouble("odds")));
                }
              }
              String status = row.getString("status");
              if (status == null) status = "";
              String statusLow = status.toLowerCase(Locale.ROOT);
              // NÃO usar contains("matched") — "unmatched" também contém "matched".
              String kind = BetBraTradeEngine.classifyOfferKind(o);
              boolean interesting =
                  stillOpen
                      || "matched".equals(kind)
                      || "partial".equals(kind)
                      || statusLow.equals("matched")
                      || statusLow.isEmpty();
              if (interesting && listed < 40) {
                row.put("matched", "matched".equals(kind));
                offersOut.put(row);
                listed++;
              }
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("connected", true);
            out.put("count", arr.length());
            out.put("openCount", open);
            out.put("openExposure", Math.round(openExposure * 100.0) / 100.0);
            out.put("summary", summary.toString());
            out.put("offers", offersOut);
            resolveOnMain(call, out);
          } catch (Exception e) {
            rejectOnMain(call, e.getMessage() != null ? e.getMessage() : "Erro ao listar ofertas");
          }
        });
  }

  @PluginMethod
  public void placeLay(PluginCall call) {
    final String eventId = call.getString("eventId", "");
    final String score = call.getString("score", "");
    final Double layOdds = call.getDouble("layOdds");
    final String marketId = call.getString("marketId", "");
    final String runnerId = call.getString("runnerId", "");
    final String mexchangeUrl = call.getString("mexchangeUrl", "");
    final Double stakePct = call.getDouble("stakePct", 99.0);
    final Double liabilityOverride = call.getDouble("liability");
    long atMs = System.currentTimeMillis();
    Long atLong = call.getLong("at");
    if (atLong != null) {
      atMs = atLong;
    } else {
      Double atDouble = call.getDouble("at");
      if (atDouble != null) atMs = atDouble.longValue();
      else {
        Integer atInt = call.getInt("at");
        if (atInt != null) atMs = atInt.longValue();
      }
    }
    final long at = atMs;

    if (eventId == null || eventId.isEmpty()) {
      call.reject("eventId obrigatório");
      return;
    }
    if (layOdds == null || layOdds <= 1.01) {
      call.reject("layOdds inválida");
      return;
    }
    if (System.currentTimeMillis() - at > 45_000L) {
      call.reject("Sinal expirado (>45s)");
      return;
    }

    io.execute(
        () -> {
          try {
            String token = findSessionToken();
            if (token == null || token.isEmpty()) {
              rejectOnMain(call, "Sem sessão BetBra — toque em Conectar BetBra");
              return;
            }
            ensureApiCookie(token);

            Double balance = fetchBalance(token);
            if (balance != null) {
              savePersistedBalance(balance, "api");
            } else {
              balance = loadPersistedBalance(BALANCE_CACHE_MS);
            }
            double openExposure = fetchOpenLayExposure(token);
            double localExposure = reconcileLocalExposure(openExposure);
            // Saldo raspado da UI costuma ser total (inclui ofertas abertas).
            // Usa o disponível real para não mandar liability > fundos livres.
            double available = balance != null ? balance : 0;
            double locked = openExposure + localExposure;
            if (locked > 0.01 && available >= locked) {
              available = Math.round((available - locked) * 100.0) / 100.0;
            } else if (locked > 0.01 && available < locked) {
              available = 0;
            }
            // Folga mínima: a BetBra rejeita 100% exato (INSUFFICIENT_FUNDS).
            double spendable = Math.floor(available * 0.99 * 100.0) / 100.0;
            if (spendable > available - 0.50) {
              spendable = Math.round((available - 0.50) * 100.0) / 100.0;
            }
            if (spendable < 0) spendable = 0;
            // Carteira Lucro certo (mesma regra do BetBraTradeEngine).
            boolean forLucroCerto =
                liabilityOverride != null && liabilityOverride > 0;
            boolean lcOn =
                getContext()
                    .getSharedPreferences(
                        AutoLayForegroundService.PREFS,
                        android.content.Context.MODE_PRIVATE)
                    .getBoolean("lucroCertoOn", true);
            float reservedLc =
                getContext()
                    .getSharedPreferences(
                        BetBraTradeEngine.PREFS, android.content.Context.MODE_PRIVATE)
                    .getFloat("reserved_lucro_certo", 1001f);
            double unhedgedLc = 0;
            try {
              unhedgedLc = new BetBraTradeEngine(getContext()).fetchUnhedgedLayLiability(token);
            } catch (Exception ignored) {
              unhedgedLc = 0;
            }
            if (lcOn && reservedLc > 0.009f) {
              if (forLucroCerto) {
                spendable = Math.min(spendable, reservedLc);
              } else if (unhedgedLc <= 0.5) {
                // Sem LC em curso: reserva isolada. Com LC em curso: sobra livre.
                spendable = Math.max(0, spendable - reservedLc);
              }
            }

            double liability;
            if (liabilityOverride != null && liabilityOverride > 0) {
              liability = liabilityOverride;
            } else {
              if (spendable < 1) {
                rejectOnMain(
                    call,
                    locked > 0.01
                        ? String.format(
                            Locale.US,
                            "Saldo livre insuficiente (R$ %.2f livre · R$ %.2f em ofertas · reserva LC R$ %.2f).",
                            Math.max(0, available - reservedLc),
                            locked,
                            reservedLc)
                        : String.format(
                            Locale.US,
                            "Saldo indisponível (reserva Lucro certo R$ %.2f isolada)",
                            reservedLc));
                return;
              }
              double pct = stakePct != null && stakePct > 0 ? stakePct : 99.0;
              if (pct > 100) pct = 100;
              liability = Math.floor(spendable * (pct / 100.0) * 100.0) / 100.0;
              if (liability < 1) liability = 1;
            }
            if (liability > spendable && spendable >= 1) {
              liability = spendable;
            }
            if (forLucroCerto && liability > spendable + 0.009) {
              rejectOnMain(
                  call,
                  String.format(
                      Locale.US,
                      "Carteira Lucro certo R$ %.2f < stake fixa R$ %.2f",
                      spendable,
                      liability));
              return;
            }

            String mId = marketId != null ? marketId : "";
            String rId = runnerId != null ? runnerId : "";
            String runnerName = resolveCorrectScoreRunnerName(score);
            double odds = layOdds;

            if (mId.isEmpty() || rId.isEmpty()) {
              JSONObject quote = quoteCorrectScore(token, eventId, runnerName);
              if (quote == null) {
                rejectOnMain(call, "Não achei mercado Correct Score / runner " + runnerName);
                return;
              }
              mId = quote.optString("marketId", mId);
              rId = quote.optString("runnerId", rId);
              if (odds <= 1.01) odds = quote.optDouble("odds", odds);
            }

            if (odds <= 1.01) {
              rejectOnMain(call, "Odd Lay inválida");
              return;
            }

            // Floor: arredondar para cima estoura o saldo livre e a API devolve INSUFFICIENT_FUNDS.
            double stake = Math.floor((liability / (odds - 1.0)) * 100.0) / 100.0;
            boolean bumped = false;
            if (stake < MIN_STAKE) {
              double minLiability = Math.round(MIN_STAKE * (odds - 1.0) * 100.0) / 100.0;
              if (minLiability > spendable + 0.001) {
                rejectOnMain(
                    call,
                    String.format(
                        Locale.US,
                        "Saldo livre R$ %.2f não cobre Lay mínimo (resp. R$ %.2f @ %.2f)",
                        spendable,
                        minLiability,
                        odds));
                return;
              }
              stake = MIN_STAKE;
              bumped = true;
            }
            double effectiveLiability = Math.round(stake * (odds - 1.0) * 100.0) / 100.0;
            if (effectiveLiability > spendable + 0.001 && spendable >= 1) {
              stake = Math.floor((spendable / (odds - 1.0)) * 100.0) / 100.0;
              if (stake < MIN_STAKE) {
                rejectOnMain(
                    call,
                    String.format(
                        Locale.US,
                        "Saldo livre R$ %.2f insuficiente para este Lay @ %.2f",
                        spendable,
                        odds));
                return;
              }
              effectiveLiability = Math.round(stake * (odds - 1.0) * 100.0) / 100.0;
            }

            JSONObject offer = new JSONObject();
            offer.put("runner-id", rId);
            offer.put("event-id", eventId);
            offer.put("market-id", mId);
            offer.put("side", "lay");
            offer.put("odds", odds);
            offer.put("stake", stake);
            offer.put("keep-in-play", false);

            JSONArray offers = new JSONArray();
            offers.put(offer);

            JSONObject body = new JSONObject();
            body.put("odds-type", "DECIMAL");
            body.put("exchange-type", "back-lay");
            body.put("offers", offers);

            HttpResult res = httpJson("POST", API + "/offers", body.toString(), token);
            JSObject out = new JSObject();
            out.put("stake", stake);
            out.put("odds", odds);
            out.put("liability", effectiveLiability);
            out.put("requestedLiability", liability);
            out.put("available", spendable);
            out.put("openExposure", openExposure + localExposure);
            out.put("bumped", bumped);
            out.put("marketId", mId);
            out.put("runnerId", rId);
            out.put("score", runnerName);
            out.put("eventId", eventId);
            if (mexchangeUrl != null) out.put("mexchangeUrl", mexchangeUrl);

            if (res.code < 200 || res.code >= 300) {
              out.put("ok", false);
              out.put("status", res.code);
              out.put("error", formatApiError(res.body, res.code));
              resolveOnMain(call, out);
              return;
            }

            addLocalExposure(effectiveLiability);
            out.put("ok", true);
            out.put("status", res.code);
            out.put("data", res.body);
            out.put("availableAfter", Math.max(0, spendable - effectiveLiability));
            resolveOnMain(call, out);
          } catch (Exception e) {
            rejectOnMain(call, e.getMessage() != null ? e.getMessage() : "Falha ao enviar Lay");
          }
        });
  }

  @PluginMethod
  public void placeBack(PluginCall call) {
    final String eventId = call.getString("eventId", "");
    final String score = call.getString("score", "");
    final Double backOdds = call.getDouble("backOdds");
    final Double stakeIn = call.getDouble("stake");
    final String marketId = call.getString("marketId", "");
    final String runnerId = call.getString("runnerId", "");
    long atMs = System.currentTimeMillis();
    Long atLong = call.getLong("at");
    if (atLong != null) {
      atMs = atLong;
    } else {
      Double atDouble = call.getDouble("at");
      if (atDouble != null) atMs = atDouble.longValue();
      else {
        Integer atInt = call.getInt("at");
        if (atInt != null) atMs = atInt.longValue();
      }
    }
    final long at = atMs;

    if (eventId == null || eventId.isEmpty()) {
      call.reject("eventId obrigatório");
      return;
    }
    if (backOdds == null || backOdds <= 1.01) {
      call.reject("backOdds inválida");
      return;
    }
    if (stakeIn == null || stakeIn < MIN_STAKE) {
      call.reject("stake Back inválido (mín. R$ 1)");
      return;
    }
    if (System.currentTimeMillis() - at > 120_000L) {
      call.reject("Sinal Back expirado");
      return;
    }

    io.execute(
        () -> {
          try {
            String token = findSessionToken();
            if (token == null || token.isEmpty()) {
              rejectOnMain(call, "Sem sessão BetBra — toque em Conectar BetBra");
              return;
            }
            ensureApiCookie(token);

            String mId = marketId != null ? marketId : "";
            String rId = runnerId != null ? runnerId : "";
            String runnerName = resolveCorrectScoreRunnerName(score);
            double odds = backOdds;
            double stake = Math.round(stakeIn * 100.0) / 100.0;
            if (stake < MIN_STAKE) stake = MIN_STAKE;

            if (mId.isEmpty() || rId.isEmpty()) {
              JSONObject quote = quoteCorrectScore(token, eventId, runnerName);
              if (quote == null) {
                rejectOnMain(call, "Não achei mercado Correct Score / runner " + runnerName);
                return;
              }
              mId = quote.optString("marketId", mId);
              rId = quote.optString("runnerId", rId);
            }

            JSONObject offer = new JSONObject();
            offer.put("runner-id", rId);
            offer.put("event-id", eventId);
            offer.put("market-id", mId);
            offer.put("side", "back");
            offer.put("odds", odds);
            offer.put("stake", stake);
            offer.put("keep-in-play", false);

            JSONArray offers = new JSONArray();
            offers.put(offer);

            JSONObject body = new JSONObject();
            body.put("odds-type", "DECIMAL");
            body.put("exchange-type", "back-lay");
            body.put("offers", offers);

            HttpResult res = httpJson("POST", API + "/offers", body.toString(), token);
            JSObject out = new JSObject();
            out.put("stake", stake);
            out.put("odds", odds);
            out.put("marketId", mId);
            out.put("runnerId", rId);
            out.put("score", runnerName);
            out.put("eventId", eventId);

            if (res.code < 200 || res.code >= 300) {
              out.put("ok", false);
              out.put("status", res.code);
              out.put("error", formatApiError(res.body, res.code));
              resolveOnMain(call, out);
              return;
            }

            out.put("ok", true);
            out.put("status", res.code);
            out.put("data", res.body);
            resolveOnMain(call, out);
          } catch (Exception e) {
            rejectOnMain(call, e.getMessage() != null ? e.getMessage() : "Falha ao enviar Back");
          }
        });
  }

  /**
   * Consulta uma oferta pela seleção exata e confirma somente o volume que a
   * bolsa marcou como correspondido. É usado pelo Surebet para recalcular a
   * ponta oposta com a odd real, nunca com a odd apenas proposta.
   */
  @PluginMethod
  public void getOfferMatchDetails(PluginCall call) {
    final String side = call.getString("side", "");
    final String eventId = call.getString("eventId", "");
    final String marketId = call.getString("marketId", "");
    final String runnerId = call.getString("runnerId", "");
    if (!("back".equalsIgnoreCase(side) || "lay".equalsIgnoreCase(side))) {
      call.reject("side deve ser back ou lay");
      return;
    }
    if (eventId.isEmpty() || marketId.isEmpty() || runnerId.isEmpty()) {
      call.reject("eventId, marketId e runnerId obrigatórios");
      return;
    }
    io.execute(
        () -> {
          try {
            JSONObject details =
                new BetBraTradeEngine(getContext())
                    .getOfferMatchDetails(side, eventId, marketId, runnerId);
            JSObject out = new JSObject();
            if (details == null) {
              out.put("known", false);
            } else {
              out.put("known", details.has("matched") || details.optBoolean("seen", false));
              out.put("matched", details.optBoolean("matched", false));
              out.put("open", details.optBoolean("open", false));
              out.put("seen", details.optBoolean("seen", false));
              out.put("stake", details.optDouble("stake", 0));
              out.put("odds", details.optDouble("odds", 0));
              out.put("liability", details.optDouble("liability", 0));
              out.put("offerId", details.optString("offerId", ""));
              out.put("betId", details.optString("betId", ""));
            }
            resolveOnMain(call, out);
          } catch (Exception e) {
            rejectOnMain(call, "Falha ao confirmar oferta");
          }
        });
  }

  private JSObject sessionStatusObject() {
    String token = findSessionToken();
    boolean connected = token != null && !token.isEmpty() && !isGuestToken(token);
    if (connected) {
      try {
        ensureApiCookie(token);
      } catch (Exception ignored) {
      }
    }
    JSObject out = new JSObject();
    out.put("connected", connected);
    out.put("hasToken", connected);
    return out;
  }

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
  }

  private void savePersistedToken(String token) {
    if (token == null || token.isEmpty() || isGuestToken(token)) return;
    prefs().edit().putString(PREF_TOKEN, token).apply();
  }

  private String loadPersistedToken() {
    String t = prefs().getString(PREF_TOKEN, "");
    if (t == null || t.isEmpty() || isGuestToken(t)) return null;
    return t;
  }

  private static boolean isGuestToken(String token) {
    return token != null && token.equals(GUEST_TOKEN);
  }

  private String findSessionToken() {
    String persisted = loadPersistedToken();
    if (persisted != null) return persisted;
    String fromCookies = findSessionTokenFromCookies();
    if (fromCookies != null && !fromCookies.isEmpty()) {
      savePersistedToken(fromCookies);
      return fromCookies;
    }
    return null;
  }

  private String findSessionTokenFromCookies() {
    CookieManager cm = CookieManager.getInstance();
    String[] hosts =
        new String[] {
          SITE + "/",
          "https://www.betbra.bet.br/",
          EXCHANGE_URL,
          WEB_ORIGIN + "/",
          "https://mexchange.betbra.bet.br/",
          API + "/",
          "https://mexchange-api.betbra.bet.br/"
        };
    for (String host : hosts) {
      String raw = cm.getCookie(host);
      String token = extractToken(raw);
      if (token != null && !isGuestToken(token)) return token;
    }
    return null;
  }

  private String extractToken(String cookieHeader) {
    if (cookieHeader == null || cookieHeader.isEmpty()) return null;
    Matcher m = SESSION_RE.matcher(cookieHeader);
    if (m.find()) {
      String v = m.group(1).trim();
      if (!v.isEmpty() && !isGuestToken(v)) return v;
    }
    for (String part : cookieHeader.split(";")) {
      String p = part.trim();
      int eq = p.indexOf('=');
      if (eq <= 0) continue;
      String name = p.substring(0, eq).trim();
      String val = p.substring(eq + 1).trim();
      String low = name.toLowerCase(Locale.ROOT);
      if (!low.contains("session") && !low.contains("token")) continue;
      if (isGuestToken(val)) continue;
      if (TOKEN_VAL_RE.matcher(val).matches()) return val;
      // aceita token de sessão mais longo (não só o padrão conta_hash)
      if (val.length() >= 16 && val.length() <= 400) return val;
    }
    return null;
  }

  private void ensureApiCookie(String token) {
    CookieManager cm = CookieManager.getInstance();
    String cookie = "session-token=" + token + "; Path=/";
    String[] hosts =
        new String[] {
          SITE,
          "https://www.betbra.bet.br",
          WEB_ORIGIN,
          "https://mexchange-api.betbra.bet.br",
          "https://mexchange.betbra.bet.br",
          API
        };
    for (String host : hosts) {
      cm.setCookie(host, cookie);
    }
    cm.flush();
  }

  /** Monta Cookie com session-token real (substitui guest se existir). */
  private String authCookieHeader(String urlStr, String token) {
    String cookie = CookieManager.getInstance().getCookie(urlStr);
    if (cookie == null || cookie.isEmpty()) {
      // Tenta cookie do origin da API
      cookie = CookieManager.getInstance().getCookie("https://mexchange-api.betbra.bet.br/");
    }
    if (cookie == null || cookie.isEmpty()) {
      return "session-token=" + token;
    }
    String replaced =
        cookie.replaceAll("(?i)session-token\\s*=\\s*[^;]*", "session-token=" + token);
    if (!replaced.toLowerCase(Locale.ROOT).contains("session-token=")) {
      replaced = replaced + "; session-token=" + token;
    }
    return replaced;
  }

  private static final class BalanceProbe {
    Double balance;
    String path;
    String error;
  }

  private Double fetchBalance(String token) throws Exception {
    return fetchBalanceProbe(token).balance;
  }

  /** Soma liability aproximada de Lays abertos/parciais (stake × (odds−1)). */
  private double fetchOpenLayExposure(String token) {
    try {
      HttpResult res = httpJson("GET", API + "/offers?offset=0&per-page=200", null, token);
      if (res.code >= 400) return 0;
      JSONArray arr = extractOffersArray(res);
      double exposure = 0;
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String status = o.optString("status", o.optString("state", "")).toLowerCase(Locale.ROOT);
        boolean open =
            status.isEmpty()
                || status.contains("open")
                || status.contains("unmatched")
                || status.contains("partial")
                || status.contains("edited")
                || status.contains("pending")
                || status.contains("delayed");
        // matched total não trava mais saldo “livre” da mesma forma — ignora
        if (!open) continue;
        if (status.contains("matched") && !status.contains("partial") && !status.contains("unmatched")) {
          continue;
        }
        String side = o.optString("side", o.optString("type", "")).toLowerCase(Locale.ROOT);
        if (!side.isEmpty() && !side.contains("lay")) continue;
        double stake =
            o.optDouble(
                "size-remaining",
                o.optDouble("stake", o.optDouble("size", 0)));
        double odds =
            o.optDouble("odds", o.optDouble("price", o.optDouble("odds-requested", 0)));
        if (stake > 0 && odds > 1.01) {
          exposure += stake * (odds - 1.0);
        }
      }
      return Math.round(exposure * 100.0) / 100.0;
    } catch (Exception e) {
      return 0;
    }
  }

  private BalanceProbe fetchBalanceProbe(String token) throws Exception {
    String[] paths =
        new String[] {
          "/account",
          "/accounts",
          "/members",
          "/members/self",
          "/member",
          "/funds",
          "/balances",
          "/balance",
          "/wallet",
          "/wallets",
          "/available-funds",
          "/account/balance",
          "/accounts/balance",
          "/members/balance"
        };
    StringBuilder errors = new StringBuilder();
    for (String path : paths) {
      HttpResult res = httpJson("GET", API + path, null, token);
      if (res.code < 200 || res.code >= 300) {
        if (errors.length() < 180) {
          if (errors.length() > 0) errors.append(" · ");
          errors.append(path).append(":HTTP ").append(res.code);
        }
        continue;
      }
      Double bal = extractBalance(res.bodyJson);
      if (bal == null) bal = extractBalanceFromRaw(res.body);
      if (bal != null) {
        BalanceProbe ok = new BalanceProbe();
        ok.balance = bal;
        ok.path = path;
        return ok;
      }
      if (errors.length() < 180) {
        if (errors.length() > 0) errors.append(" · ");
        errors.append(path).append(":sem campo");
      }
    }
    BalanceProbe fail = new BalanceProbe();
    fail.error =
        errors.length() > 0
            ? "API sem saldo (" + errors + ")"
            : "Saldo não encontrado na API";
    return fail;
  }

  /** Fallback: regex no JSON bruto (chaves kebab / snake / camel). */
  private static Double extractBalanceFromRaw(String body) {
    if (body == null || body.isEmpty()) return null;
    Pattern[] pats =
        new Pattern[] {
          Pattern.compile(
              "\"(?:available-to-bet|available_to_bet|availableToBet|available-funds|availableFunds|available-balance|availableBalance)\"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)",
              Pattern.CASE_INSENSITIVE),
          Pattern.compile(
              "\"(?:balance|funds|wallet|saldo)\"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)",
              Pattern.CASE_INSENSITIVE)
        };
    for (Pattern p : pats) {
      Matcher m = p.matcher(body);
      if (m.find()) {
        try {
          double n = Double.parseDouble(m.group(1));
          if (n >= 0 && n <= 5_000_000) return Math.round(n * 100.0) / 100.0;
        } catch (Exception ignored) {
        }
      }
    }
    return null;
  }

  private JSONObject quoteCorrectScore(String token, String eventId, String runnerName)
      throws Exception {
    HttpResult res =
        httpJson(
            "GET",
            API + "/events/" + eventId + "?odds-type=DECIMAL&price-depth=3",
            null,
            token);
    if (res.code < 200 || res.code >= 300 || res.bodyJson == null) return null;
    JSONObject event = res.bodyJson;
    if (event.has("event") && event.opt("event") instanceof JSONObject) {
      event = event.getJSONObject("event");
    }
    JSONArray markets = event.optJSONArray("markets");
    if (markets == null) return null;
    JSONObject market = null;
    for (int i = 0; i < markets.length(); i++) {
      JSONObject m = markets.optJSONObject(i);
      if (m == null) continue;
      String name = m.optString("name-original", m.optString("name", ""));
      if ("correct score".equalsIgnoreCase(name.trim())) {
        market = m;
        break;
      }
    }
    if (market == null) return null;
    JSONArray runners = market.optJSONArray("runners");
    if (runners == null) return null;
    String want = runnerName.trim().toLowerCase(Locale.ROOT);
    JSONObject runner = null;
    for (int i = 0; i < runners.length(); i++) {
      JSONObject r = runners.optJSONObject(i);
      if (r == null) continue;
      if (want.equals(r.optString("name", "").trim().toLowerCase(Locale.ROOT))) {
        runner = r;
        break;
      }
    }
    if (runner == null) return null;
    double odds = 0;
    JSONArray prices = runner.optJSONArray("prices");
    if (prices != null) {
      double best = Double.POSITIVE_INFINITY;
      for (int i = 0; i < prices.length(); i++) {
        JSONObject p = prices.optJSONObject(i);
        if (p == null) continue;
        if (!"lay".equalsIgnoreCase(p.optString("side", ""))) continue;
        double o = p.optDouble("odds", 0);
        if (o > 1.01 && o < best) best = o;
      }
      if (best != Double.POSITIVE_INFINITY) odds = best;
    }
    if (odds <= 1.01) odds = runner.optDouble("last-matched-odds", 0);

    JSONObject out = new JSONObject();
    out.put("marketId", market.optString("id", ""));
    out.put("runnerId", runner.optString("id", ""));
    out.put("odds", odds);
    return out;
  }

  private static String resolveCorrectScoreRunnerName(String name) {
    String s = name == null ? "" : name.trim();
    String low = s.toLowerCase(Locale.ROOT);
    if (low.matches("^qov\\s*casa$") || low.contains("any other home")) {
      return "ANY OTHER HOME WIN";
    }
    if (low.matches("^qov\\s*fora$") || low.contains("any other away")) {
      return "ANY OTHER AWAY WIN";
    }
    if (low.matches("^qov\\s*empate$") || low.contains("any other draw")) {
      return "ANY OTHER DRAW";
    }
    return s.isEmpty() ? "3-3" : s;
  }

  private static JSObject offerToJs(JSONObject o, boolean stillOpen) {
    JSObject row = new JSObject();
    String id =
        o.optString(
            "id",
            o.optString(
                "offer-id",
                o.optString("offerId", o.optString("bet-id", o.optString("betId", "")))));
    String betId =
        o.optString("bet-id", o.optString("betId", o.optString("matched-bet-id", id)));
    String side = o.optString("side", o.optString("type", "")).toLowerCase(Locale.ROOT);
    if (side.contains("back")) side = "back";
    else if (side.contains("lay")) side = "lay";
    double matchedSize = BetBraTradeEngine.offerSizeMatched(o);
    double remaining = BetBraTradeEngine.offerRemaining(o);
    if (Double.isNaN(remaining)) remaining = 0;
    // Aberta: odd/stake do PEDIDO. Casada: odd/stake correspondidos.
    double odds;
    if (stillOpen) {
      odds = o.optDouble("odds", o.optDouble("price", o.optDouble("odds-requested", 0)));
    } else {
      odds =
          o.optDouble(
              "average-odds-matched",
              o.optDouble(
                  "averageOddsMatched",
                  o.optDouble(
                      "odds-matched",
                      o.optDouble(
                          "odds", o.optDouble("price", o.optDouble("odds-requested", 0))))));
    }
    double stake;
    if (stillOpen) {
      stake =
          remaining > 0.01
              ? remaining
              : o.optDouble("stake", o.optDouble("size", o.optDouble("original-stake", 0)));
    } else if (matchedSize > 0.01) {
      stake = matchedSize;
    } else {
      stake = o.optDouble("stake", o.optDouble("size", 0));
    }
    double liability =
        o.optDouble(
            "liability",
            o.optDouble(
                "liability-remaining",
                o.optDouble("potential-liability", 0)));
    if (liability < 0.01 && side.equals("lay") && odds > 1.01 && stake > 0) {
      liability = Math.round(stake * (odds - 1.0) * 100.0) / 100.0;
    }
    double profit = 0;
    if (side.equals("back") && odds > 1.01 && stake > 0) {
      profit = Math.round(stake * (odds - 1.0) * 100.0) / 100.0;
    }
    String eventName =
        o.optString(
            "event-name",
            o.optString("eventName", o.optString("event_name", "")));
    String marketName =
        o.optString(
            "market-name",
            o.optString("marketName", o.optString("market_name", "Placar Exato")));
    String runnerName =
        o.optString(
            "runner-name",
            o.optString(
                "runnerName",
                o.optString("selection-name", o.optString("selectionName", ""))));
    String status = o.optString("status", o.optString("state", ""));
    String placed =
        o.optString(
            "created-date",
            o.optString(
                "createdDate",
                o.optString(
                    "placed-date",
                    o.optString("placedDate", o.optString("created-at", "")))));
    String eventDate =
        o.optString(
            "event-start",
            o.optString("eventStart", o.optString("start-time", o.optString("startTime", ""))));
    String loginId =
        o.optString("login-id", o.optString("loginId", o.optString("account-id", "")));
    row.put("id", id);
    row.put("betId", betId != null && !betId.isEmpty() ? betId : id);
    row.put("offerId", id);
    row.put("side", side);
    row.put("odds", odds);
    row.put("stake", stake);
    row.put("remaining", remaining);
    row.put("liability", liability);
    row.put("profit", profit);
    row.put("eventId", o.optString("event-id", o.optString("eventId", "")));
    row.put("eventName", eventName);
    row.put("marketName", marketName);
    row.put("runnerName", runnerName);
    row.put("status", status);
    row.put("open", stillOpen);
    row.put("placedAt", placed);
    row.put("eventDate", eventDate);
    row.put("loginId", loginId);
    return row;
  }

  /**
   * Oferta ainda no book (unmatched / parcial). Usa a mesma regra do
   * {@link BetBraTradeEngine#classifyOfferKind} — remaining &gt; 0 manda.
   */
  private static boolean isOfferStillOpen(JSONObject o) {
    return BetBraTradeEngine.isOfferStillOpen(o);
  }

  private static JSONArray extractOffersArray(HttpResult res) {
    if (res == null) return new JSONArray();
    if (res.bodyJson != null) {
      JSONArray direct = res.bodyJson.optJSONArray("offers");
      if (direct != null) return direct;
      JSONArray data = res.bodyJson.optJSONArray("data");
      if (data != null) {
        // GET array puro foi envelopado em { data: [...] }
        if (data.length() > 0 && data.optJSONObject(0) != null) return data;
      }
      JSONObject nested = res.bodyJson.optJSONObject("data");
      if (nested != null) {
        JSONArray nestedOffers = nested.optJSONArray("offers");
        if (nestedOffers != null) return nestedOffers;
      }
    }
    if (res.body != null && res.body.trim().startsWith("[")) {
      try {
        return new JSONArray(res.body);
      } catch (Exception ignored) {
        /* fall through */
      }
    }
    return new JSONArray();
  }

  private HttpResult httpJson(String method, String urlStr, String body, String token)
      throws Exception {
    URL url = new URL(urlStr);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setConnectTimeout(15_000);
    conn.setReadTimeout(20_000);
    conn.setRequestMethod(method);
    conn.setRequestProperty("Accept", "application/json");
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setRequestProperty("Origin", WEB_ORIGIN);
    conn.setRequestProperty("Referer", WEB_ORIGIN + "/");
    // Sempre força o token autenticado — CookieManager pode ter guest/session antigo.
    conn.setRequestProperty("Cookie", authCookieHeader(urlStr, token));
    if (body != null) {
      conn.setDoOutput(true);
      byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(bytes.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(bytes);
      }
    }
    int code = conn.getResponseCode();
    InputStream stream =
        code >= 400
            ? (conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream())
            : conn.getInputStream();
    String text = readStream(stream);
    conn.disconnect();
    HttpResult res = new HttpResult();
    res.code = code;
    res.body = text;
    if (text != null && !text.isEmpty()) {
      try {
        res.bodyJson = new JSONObject(text);
      } catch (Exception e) {
        try {
          // arrays
          JSONArray arr = new JSONArray(text);
          JSONObject wrap = new JSONObject();
          wrap.put("data", arr);
          res.bodyJson = wrap;
        } catch (Exception ignored) {
          res.bodyJson = null;
        }
      }
    }
    return res;
  }

  private static String readStream(InputStream stream) throws Exception {
    if (stream == null) return "";
    StringBuilder sb = new StringBuilder();
    try (BufferedReader br =
        new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) sb.append(line);
    }
    return sb.toString();
  }

  private static Double extractBalance(JSONObject data) {
    return extractBalance(data, 0);
  }

  private static Double extractBalance(Object data, int depth) {
    if (data == null || depth > 8) return null;
    Double direct = asMoney(data);
    if (direct != null && !(data instanceof JSONObject) && !(data instanceof JSONArray)) {
      return direct;
    }
    if (data instanceof JSONObject) {
      JSONObject obj = (JSONObject) data;
      String[] keys =
          new String[] {
            "available-to-bet",
            "available_to_bet",
            "availableToBet",
            "available-funds",
            "available_funds",
            "availableFunds",
            "available-balance",
            "available_balance",
            "availableBalance",
            "available-amount",
            "availableAmount",
            "balance",
            "funds",
            "wallet",
            "amount",
            "available",
            "credit",
            "saldo"
          };
      for (String k : keys) {
        if (obj.has(k)) {
          Double n = asMoney(obj.opt(k));
          if (n != null) return n;
          Double nested = extractBalance(obj.opt(k), depth + 1);
          if (nested != null) return nested;
        }
      }
      // Varre chaves parecidas (case-insensitive)
      java.util.Iterator<String> it = obj.keys();
      while (it.hasNext()) {
        String k = it.next();
        String low = k.toLowerCase(Locale.ROOT);
        boolean interesting =
            low.contains("available")
                || low.contains("balance")
                || low.contains("saldo")
                || low.contains("fund")
                || low.contains("wallet");
        if (!interesting) continue;
        Double n = asMoney(obj.opt(k));
        if (n != null) return n;
        Double nested = extractBalance(obj.opt(k), depth + 1);
        if (nested != null) return nested;
      }
      String[] nests =
          new String[] {
            "account", "accounts", "wallet", "funds", "member", "user", "data", "result"
          };
      for (String nest : nests) {
        if (obj.has(nest)) {
          Double n = extractBalance(obj.opt(nest), depth + 1);
          if (n != null) return n;
        }
      }
    }
    if (data instanceof JSONArray) {
      JSONArray arr = (JSONArray) data;
      int max = Math.min(arr.length(), 20);
      for (int i = 0; i < max; i++) {
        Double n = extractBalance(arr.opt(i), depth + 1);
        if (n != null) return n;
      }
    }
    return null;
  }

  private static Double asMoney(Object v) {
    if (v == null) return null;
    if (v instanceof Number) {
      double n = ((Number) v).doubleValue();
      if (n >= 0 && !Double.isNaN(n) && n <= 5_000_000) {
        return Math.round(n * 100.0) / 100.0;
      }
      return null;
    }
    if (v instanceof String) {
      String s = ((String) v).trim();
      Matcher br = Pattern.compile("R\\$\\s*([\\d.]+),(\\d{2})").matcher(s);
      if (br.find()) {
        try {
          double n = Double.parseDouble(br.group(1).replace(".", "") + "." + br.group(2));
          if (n >= 0 && n <= 5_000_000) return Math.round(n * 100.0) / 100.0;
        } catch (Exception ignored) {
        }
      }
      if (s.matches("^\\d+([.,]\\d+)?$")) {
        double n = Double.parseDouble(s.replace(",", "."));
        if (n >= 0 && n <= 5_000_000) return Math.round(n * 100.0) / 100.0;
      }
    }
    if (v instanceof JSONObject) {
      return extractBalance(v, 5);
    }
    return null;
  }

  private static String formatApiError(String body, int status) {
    if (body == null || body.isEmpty()) return "HTTP " + status;
    String raw = body;
    try {
      JSONObject data = new JSONObject(body);
      String detail = data.optString("detail", "");
      if (detail.isEmpty()) {
        JSONObject props = data.optJSONObject("properties");
        if (props != null) detail = props.optString("messageDetail", "");
      }
      if (detail.isEmpty()) detail = data.optString("message", data.optString("error", ""));
      String upper = detail.toUpperCase(Locale.ROOT);
      if (upper.contains("INSUFFICIENT_FUNDS") || upper.contains("INSUFFICIENT_BUNDS")) {
        JSONObject props = data.optJSONObject("properties");
        double value = props != null ? props.optDouble("value", 0) : 0;
        if (value > 0) {
          return String.format(
              Locale.US,
              "Saldo insuficiente na Exchange (pedido ~R$ %.2f). Cancele ofertas abertas ou use %% menor.",
              value);
        }
        return "Saldo insuficiente na Exchange. Cancele ofertas abertas ou use % menor da banca.";
      }
      if (upper.contains("UNAUTHORIZED") || status == 401) {
        if (!detail.isEmpty() && !detail.equalsIgnoreCase("Unauthorized")) {
          return "Não autorizado: " + shorten(detail, 160);
        }
        return "Sessão BetBra expirada — toque em Reconectar";
      }
      if (!detail.isEmpty()) return shorten(detail, 200);
      StringBuilder parts = new StringBuilder();
      if (data.has("message")) parts.append(data.optString("message"));
      if (data.has("error")) {
        if (parts.length() > 0) parts.append(" · ");
        parts.append(data.optString("error"));
      }
      if (parts.length() > 0) return shorten(parts.toString(), 200);
    } catch (Exception ignored) {
    }
    if (raw.toLowerCase(Locale.ROOT).contains("unable to resolve host")
        || raw.toLowerCase(Locale.ROOT).contains("no address associated")) {
      return "Sem rede/DNS para a API BetBra. Confira Wi‑Fi/4G e tente Reconectar.";
    }
    return shorten(raw, 200);
  }

  private static String shorten(String s, int max) {
    if (s == null) return "";
    String t = s.trim();
    return t.length() > max ? t.substring(0, max) : t;
  }

  private void resolveOnMain(PluginCall call, JSObject data) {
    main.post(() -> call.resolve(data));
  }

  private void rejectOnMain(PluginCall call, String msg) {
    main.post(() -> call.reject(msg));
  }

  private static class HttpResult {
    int code;
    String body;
    JSONObject bodyJson;
  }
}
