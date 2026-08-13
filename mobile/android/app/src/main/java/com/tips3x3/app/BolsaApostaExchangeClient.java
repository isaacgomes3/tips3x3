package com.tips3x3.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Cliente isolado da MExchange Bolsa de Aposta, usado apenas no flavor dupla. */
final class BolsaApostaExchangeClient {
  static final String PREFS = "tips3x3_bolsa_aposta";
  static final String PREF_TOKEN = "session_token";
  static final String API = "https://mexchange-api.bolsadeaposta.bet.br/api";
  static final String WEB = "https://mexchange.bolsadeaposta.bet.br";
  private final Context app;

  BolsaApostaExchangeClient(Context context) { app = context.getApplicationContext(); }

  static void saveToken(Context context, String token) {
    if (token == null || token.isEmpty()) return;
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_TOKEN, token).apply();
  }

  boolean hasSession() { return !token().isEmpty(); }

  JSONArray listAllPreliveMarkets() {
    JSONArray out = new JSONArray();
    try {
      long after = System.currentTimeMillis() / 1000L;
      String names = URLEncoder.encode("Match Odds,Half Time,Half Time Result,First Half Result", "UTF-8");
      int offset = 0;
      final int pageSize = 100;
      Set<String> pages = new HashSet<>();
      while (true) {
        JSONObject body = request("GET", API + "/events?offset=" + offset + "&per-page=" + pageSize
            + "&after=" + after + "&sport-ids=15&sort-by=start&sort-direction=asc"
            + "&en-market-names=" + names + "&market-types=one_x_two&odds-type=DECIMAL&price-depth=3", null);
        JSONArray events = body.optJSONArray("events");
        if (events == null || events.length() == 0) break;
        StringBuilder fp = new StringBuilder();
        for (int i = 0; i < events.length(); i++) fp.append(events.optJSONObject(i) != null ? events.optJSONObject(i).optString("id") : "?").append('|');
        if (!pages.add(fp.toString())) break;
        for (int i = 0; i < events.length(); i++) {
          JSONObject event = events.optJSONObject(i);
          if (event == null || event.optBoolean("in-running-flag", false)) continue;
          for (String kind : new String[] {"match-odds", "first-half"}) {
            JSONObject quote = extract(event, kind);
            if (quote == null) continue;
            JSONObject row = new JSONObject();
            row.put("venue", "bolsa");
            row.put("eventId", event.optString("id"));
            row.put("eventName", event.optString("name"));
            row.put("start", event.optString("start"));
            row.put("kind", kind);
            row.put("quote", quote);
            out.put(row);
          }
        }
        int total = body.optInt("total", -1);
        offset += events.length();
        if ((total >= 0 && offset >= total) || (total < 0 && events.length() < pageSize)) break;
      }
    } catch (Exception ignored) {}
    return out;
  }

  JSONObject quote(String eventId, String kind) throws Exception {
    JSONObject body = request("GET", API + "/events/" + eventId + "?odds-type=DECIMAL&price-depth=3", null);
    JSONObject event = body.optJSONObject("event");
    return extract(event != null ? event : body, kind);
  }

  JSONObject place(String eventId, String marketId, JSONArray legs) throws Exception {
    JSONObject result = new JSONObject();
    String token = token();
    if (token.isEmpty()) return result.put("ok", false).put("error", "Bolsa de Aposta desconectada");
    JSONArray offers = new JSONArray();
    for (int i = 0; i < legs.length(); i++) {
      JSONObject leg = legs.getJSONObject(i);
      offers.put(new JSONObject().put("runner-id", leg.getString("runnerId"))
          .put("event-id", eventId).put("market-id", marketId).put("side", "back")
          .put("odds", leg.getDouble("odds")).put("stake", leg.getDouble("stake"))
          .put("keep-in-play", false));
    }
    JSONObject payload = new JSONObject().put("odds-type", "DECIMAL")
        .put("exchange-type", "back-lay").put("offers", offers);
    request("POST", API + "/offers", payload.toString());
    return result.put("ok", true);
  }

  private JSONObject extract(JSONObject event, String kind) throws Exception {
    JSONArray markets = event != null ? event.optJSONArray("markets") : null;
    if (markets == null) return null;
    JSONObject selected = null;
    for (int i = 0; i < markets.length(); i++) {
      JSONObject market = markets.optJSONObject(i);
      String raw = market != null ? market.optString("name-original", market.optString("name", "")) : "";
      String n = Normalizer.normalize(raw, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT).trim();
      boolean first = "first-half".equals(kind);
      boolean ok = first ? n.equals("half time") || n.matches(".*(half time result|first half result|1st half result|resultado.*1.*tempo|intervalo).*")
          : n.equals("match odds") || n.equals("resultado da partida");
      if (ok) { selected = market; break; }
    }
    if (selected == null) return null;
    JSONArray runners = selected.optJSONArray("runners");
    if (runners == null || runners.length() != 3) return null;
    JSONObject quote = new JSONObject().put("marketId", selected.optString("id"));
    int team = 0;
    for (int i = 0; i < runners.length(); i++) {
      JSONObject runner = runners.optJSONObject(i);
      String name = runner.optString("name", "");
      boolean draw = name.matches("(?i).*(draw|empate).*");
      String key = draw ? "draw" : (team++ == 0 ? "home" : "away");
      double odd = 0, amount = 0;
      JSONArray prices = runner.optJSONArray("prices");
      for (int j = 0; prices != null && j < prices.length(); j++) {
        JSONObject price = prices.optJSONObject(j);
        if (price == null || !"back".equalsIgnoreCase(price.optString("side"))) continue;
        double candidate = price.optDouble("odds", 0);
        if (candidate > odd) { odd = candidate; amount = price.optDouble("available-amount", 0); }
      }
      if (!(odd > 1.01) || !(amount > 0)) return null;
      quote.put(key, new JSONObject().put("name", name).put("runnerId", runner.optString("id"))
          .put("marketId", selected.optString("id")).put("backBook", odd).put("backLiquidity", amount));
    }
    return quote.has("home") && quote.has("draw") && quote.has("away") ? quote : null;
  }

  private String token() {
    String saved = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_TOKEN, "");
    if (!saved.isEmpty()) return saved;
    try {
      String cookies = CookieManager.getInstance().getCookie(WEB);
      if (cookies != null) for (String part : cookies.split(";")) {
        String[] pair = part.trim().split("=", 2);
        if (pair.length == 2 && pair[0].matches("(?i)session[-_]?token")) return pair[1];
      }
    } catch (Exception ignored) {}
    return "";
  }

  private JSONObject request(String method, String url, String body) throws Exception {
    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
    try {
      conn.setConnectTimeout(15_000); conn.setReadTimeout(25_000); conn.setRequestMethod(method);
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Origin", WEB); conn.setRequestProperty("Referer", WEB + "/");
      String token = token();
      if (!token.isEmpty()) {
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Cookie", "session-token=" + token);
      }
      if (body != null) {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8); conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json"); conn.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream os = conn.getOutputStream()) { os.write(bytes); }
      }
      int code = conn.getResponseCode();
      InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
      StringBuilder text = new StringBuilder();
      if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
        String line; while ((line = reader.readLine()) != null) text.append(line);
      }
      if (code < 200 || code >= 300) throw new Exception("Bolsa de Aposta HTTP " + code + " " + text);
      return text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
    } finally { conn.disconnect(); }
  }
}
