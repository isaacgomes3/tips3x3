package com.tips3x3.app;

import android.content.Context;
import android.webkit.CookieManager;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/** Detecta e executa surebets completas dentro de uma unica exchange. */
final class SeparateSurebetService {
  static final String BETBRA = "betbra";
  static final String BOLSA = "bolsa";
  private final BetBraTradeEngine betbra;
  private final BolsaApostaExchangeClient bolsa;
  private final Context app;

  SeparateSurebetService(Context context) {
    app = context.getApplicationContext();
    betbra = new BetBraTradeEngine(context);
    bolsa = new BolsaApostaExchangeClient(context);
  }

  boolean connected(String venue) { return BETBRA.equals(venue) ? betbra.hasSession() : bolsa.hasSession(); }

  JSONArray scan(String venue, double commissionPercent, double minRoi, double minLiquidity) {
    JSONArray source = BETBRA.equals(venue) ? betbra.listAllPreliveSurebetMarkets() : bolsa.listAllPreliveMarkets();
    JSONArray result = new JSONArray();
    for (int i = 0; i < source.length(); i++) {
      try {
        JSONObject raw = source.getJSONObject(i);
        JSONObject analysis = BETBRA.equals(venue) ? raw.getJSONObject("analysis") : raw;
        JSONObject quote = BETBRA.equals(venue) ? analysis.getJSONObject("matchOdds") : analysis.getJSONObject("quote");
        JSONObject opportunity = calculate(venue, analysis.optString("eventId"), analysis.optString("eventName"),
            BETBRA.equals(venue) ? analysis.optString("surebetMarketKind", "match-odds") : analysis.optString("kind", "match-odds"),
            quote, commissionPercent, 100d, minLiquidity);
        if (opportunity != null && opportunity.optDouble("roi") >= minRoi) result.put(opportunity);
      } catch (Exception ignored) {}
    }
    return result;
  }

  JSONObject prepare(JSONObject candidate, double commissionPercent, double budget) throws Exception {
    String venue = candidate.getString("venue");
    JSONObject fresh = BETBRA.equals(venue)
        ? betbra.getSurebetMarketQuote(candidate.getString("eventId"), candidate.getString("kind"))
        : bolsa.quote(candidate.getString("eventId"), candidate.getString("kind"));
    JSONObject prepared = calculate(venue, candidate.getString("eventId"), candidate.optString("eventName"),
        candidate.getString("kind"), fresh, commissionPercent, budget, 0d);
    if (prepared == null) throw new Exception("A oportunidade deixou de ser surebet após atualizar as odds");
    return prepared;
  }

  JSONObject execute(JSONObject prepared) throws Exception {
    String venue = prepared.getString("venue");
    JSONObject result = BETBRA.equals(venue)
        ? betbra.placeSurebetLegs(prepared.getString("eventId"), prepared.getString("marketId"), prepared.getJSONArray("legs"))
        : bolsa.place(prepared.getString("eventId"), prepared.getString("marketId"), prepared.getJSONArray("legs"));
    if (result.optBoolean("ok", false)) report(prepared);
    return result;
  }

  private void report(JSONObject prepared) {
    HttpURLConnection conn = null;
    try {
      JSONArray sourceLegs = prepared.getJSONArray("legs");
      JSONArray legs = new JSONArray();
      String venue = prepared.getString("venue");
      for (int i = 0; i < sourceLegs.length(); i++) {
        JSONObject leg = sourceLegs.getJSONObject(i);
        legs.put(new JSONObject().put("selection", leg.optString("name", leg.optString("result")))
            .put("venue", venue).put("odds", leg.getDouble("odds")).put("stake", leg.getDouble("stake")));
      }
      String market = "first-half".equals(prepared.optString("kind"))
          ? "Resultado do Primeiro Tempo" : "Match Odds";
      JSONObject body = new JSONObject().put("kind", "surebet")
          .put("eventId", prepared.getString("eventId"))
          .put("eventName", prepared.optString("eventName"))
          .put("scoreLabel", market).put("marketName", market)
          .put("layOdds", sourceLegs.getJSONObject(0).getDouble("odds"))
          .put("stake", prepared.getDouble("totalStake"))
          .put("liability", prepared.getDouble("totalStake"))
          .put("expectedProfit", prepared.getDouble("netProfit"))
          .put("realizedProfit", prepared.getDouble("netProfit"))
          .put("appProduct", BOLSA.equals(venue) ? "surebet-bolsa" : "surebet-betbra")
          .put("surebetLegs", legs).put("source", "apk")
          .put("event", new JSONObject().put("type", "green")
              .put("stake", prepared.getDouble("totalStake"))
              .put("profit", prepared.getDouble("netProfit")));
      byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
      conn = (HttpURLConnection) new URL("https://tips3x3.com/api/indications").openConnection();
      conn.setConnectTimeout(12_000); conn.setReadTimeout(15_000); conn.setRequestMethod("POST");
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Content-Type", "application/json");
      String cookies = CookieManager.getInstance().getCookie("https://tips3x3.com");
      if (cookies != null && !cookies.isEmpty()) conn.setRequestProperty("Cookie", cookies);
      conn.setDoOutput(true); conn.setFixedLengthStreamingMode(bytes.length);
      try (OutputStream os = conn.getOutputStream()) { os.write(bytes); }
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) throw new Exception("indications HTTP " + code);
    } catch (Exception ignored) {
      // A ordem nunca deve ser repetida por falha exclusiva do relatório.
    } finally { if (conn != null) conn.disconnect(); }
  }

  private JSONObject calculate(String venue, String eventId, String eventName, String kind,
      JSONObject quote, double commissionPercent, double budget, double minLiquidity) throws Exception {
    if (quote == null || budget < 3d) return null;
    String[] keys = {"home", "draw", "away"};
    double fee = Math.max(0d, Math.min(100d, commissionPercent)) / 100d;
    double inverse = 0d;
    double[] effective = new double[3];
    JSONObject[] selections = new JSONObject[3];
    for (int i = 0; i < 3; i++) {
      selections[i] = quote.optJSONObject(keys[i]);
      if (selections[i] == null) return null;
      double odds = selections[i].optDouble("backBook", 0d);
      double liquidity = selections[i].optDouble("backLiquidity", 0d);
      if (odds <= 1.01d || liquidity < Math.max(1d, minLiquidity)) return null;
      effective[i] = 1d + (odds - 1d) * (1d - fee);
      inverse += 1d / effective[i];
    }
    if (inverse >= 1d) return null;
    double payout = budget / inverse;
    JSONArray legs = new JSONArray();
    double used = 0d;
    for (int i = 0; i < 3; i++) {
      double stake = Math.floor((payout / effective[i]) * 100d) / 100d;
      stake = Math.min(stake, Math.floor(selections[i].optDouble("backLiquidity") * 100d) / 100d);
      if (stake < 1d) return null;
      used += stake;
      legs.put(new JSONObject().put("result", keys[i]).put("name", selections[i].optString("name", keys[i]))
          .put("runnerId", selections[i].getString("runnerId")).put("odds", selections[i].getDouble("backBook"))
          .put("stake", stake).put("liquidity", selections[i].getDouble("backLiquidity")));
    }
    double worstNet = Double.MAX_VALUE;
    for (int i = 0; i < 3; i++) {
      JSONObject leg = legs.getJSONObject(i);
      double grossWin = leg.getDouble("stake") * (leg.getDouble("odds") - 1d);
      double netReturn = leg.getDouble("stake") + grossWin * (1d - fee);
      worstNet = Math.min(worstNet, netReturn - used);
    }
    if (worstNet <= 0d) return null;
    return new JSONObject().put("venue", venue).put("eventId", eventId).put("eventName", eventName)
        .put("kind", kind).put("marketId", quote.getString("marketId")).put("legs", legs)
        .put("totalStake", Math.round(used * 100d) / 100d).put("netProfit", Math.floor(worstNet * 100d) / 100d)
        .put("roi", Math.floor((worstNet / used) * 10000d) / 100d).put("commission", commissionPercent);
  }
}
