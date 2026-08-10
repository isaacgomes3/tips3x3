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
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Execução síncrona de Lay/Back BetBra (reutilizada pelo plugin e pelo
 * {@link AutoLayForegroundService} com tela desligada).
 */
final class BetBraTradeEngine {
  private static final String API = "https://mexchange-api.betbra.bet.br/api";
  private static final String WEB_ORIGIN = "https://mexchange.betbra.bet.br";
  private static final String SITE = "https://betbra.bet.br";
  private static final String EXCHANGE_URL =
      "https://betbra.bet.br/b/exchange/sport/soccer";
  static final String PREFS = "tips3x3_betbra";
  private static final String PREF_TOKEN = "session_token";
  private static final String PREF_BALANCE = "last_balance";
  private static final String PREF_BALANCE_AT = "last_balance_at";
  private static final String PREF_BALANCE_VIA = "last_balance_via";
  /** Liability local até a API /offers refletir (evita 2ª entrada sem saldo). */
  private static final String PREF_LOCAL_EXPOSURE = "local_lay_exposure";
  private static final String PREF_LOCAL_EXPOSURE_AT = "local_lay_exposure_at";
  /**
   * Carteira isolada do Lucro certo: este valor não entra em 3x3 / Eventos raros.
   * O Lay de Lucro certo só gasta desta reserva.
   */
  private static final String PREF_RESERVED_LC = "reserved_lucro_certo";
  private static final float DEFAULT_RESERVED_LC = 1001f;
  /**
   * A reserva só cobre a janela até /offers listar a oferta. Se a oferta casa,
   * ela sai das abertas e o saldo já vem descontado da API — manter a reserva
   * depois disso descontaria duas vezes e travaria o saldo livre.
   */
  private static final long LOCAL_EXPOSURE_TTL_MS = 90_000L;
  private static final String GUEST_TOKEN = "577717_e8a11c8e70edcbd95c5e9db17d0f6f4";
  private static final double MIN_STAKE = 1.0;
  private static final long BALANCE_CACHE_MS = 30L * 60L * 1000L;
  /** Janela curta para decisões automáticas (o de 30min só serve de exibição). */
  private static final long FRESH_BALANCE_MS = 2L * 60L * 1000L;
  private static final Pattern SESSION_RE =
      Pattern.compile("(?:^|;\\s*)session[-_]?token=([^;]+)", Pattern.CASE_INSENSITIVE);
  private static final Pattern TOKEN_VAL_RE =
      Pattern.compile("^\\d{3,}_[a-f0-9]{8,}$", Pattern.CASE_INSENSITIVE);

  private final Context app;

  BetBraTradeEngine(Context context) {
    this.app = context.getApplicationContext();
  }

  boolean hasSession() {
    String token = findSessionToken();
    return token != null && !token.isEmpty() && !isGuestToken(token);
  }

  JSONObject placeLay(
      String eventId,
      String score,
      double layOdds,
      String marketId,
      String runnerId,
      double stakePct)
      throws Exception {
    return placeLay(eventId, score, layOdds, marketId, runnerId, stakePct, 0);
  }

  /**
   * @param fixedLiability se ≥ 1, usa responsabilidade fixa (ex.: Lucro certo R$ 1001)
   *     em vez de % da banca.
   */
  JSONObject placeLay(
      String eventId,
      String score,
      double layOdds,
      String marketId,
      String runnerId,
      double stakePct,
      double fixedLiability)
      throws Exception {
    JSONObject out = new JSONObject();
    if (eventId == null || eventId.isEmpty()) {
      out.put("ok", false);
      out.put("error", "eventId obrigatório");
      return out;
    }
    if (!(layOdds > 1.01)) {
      out.put("ok", false);
      out.put("error", "layOdds inválida");
      return out;
    }

    String token = findSessionToken();
    if (token == null || token.isEmpty()) {
      out.put("ok", false);
      out.put("error", "Sem sessão BetBra — toque em Conectar BetBra");
      return out;
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
    double available = balance != null ? balance : 0;
    double locked = openExposure + localExposure;
    if (locked > 0.01 && available >= locked) {
      available = Math.round((available - locked) * 100.0) / 100.0;
    } else if (locked > 0.01 && available < locked) {
      available = 0;
    }
    double spendable = Math.floor(available * 0.99 * 100.0) / 100.0;
    if (spendable > available - 0.50) {
      spendable = Math.round((available - 0.50) * 100.0) / 100.0;
    }
    if (spendable < 0) spendable = 0;
    boolean forLucroCerto = fixedLiability >= 1;
    double unhedged = fetchUnhedgedLayLiability(token);
    spendable = applyReservedLucroCerto(spendable, forLucroCerto, unhedged);
    if (spendable < 1) {
      double reserved = isLucroCertoStrategyOn() ? getReservedLucroCerto() : 0;
      out.put("ok", false);
      out.put(
          "error",
          forLucroCerto
              ? String.format(
                  Locale.US,
                  "Carteira Lucro certo insuficiente (livre R$ %.2f · reserva R$ %.2f)",
                  available,
                  reserved)
              : locked > 0.01
                  ? String.format(
                      Locale.US,
                      "Saldo livre insuficiente (R$ %.2f livre · R$ %.2f em ofertas · reserva LC R$ %.2f)",
                      Math.max(0, available - (unhedged > 0.5 ? 0 : reserved)),
                      locked,
                      reserved)
                  : reserved > 0.009 && unhedged <= 0.5
                      ? String.format(
                          Locale.US,
                          "Saldo indisponível (reserva Lucro certo R$ %.2f isolada)",
                          reserved)
                      : "Saldo livre insuficiente");
      return out;
    }

    double liability;
    if (fixedLiability >= 1) {
      liability = Math.round(fixedLiability * 100.0) / 100.0;
      if (liability > spendable + 0.009) {
        out.put("ok", false);
        out.put(
            "error",
            String.format(
                Locale.US,
                "Carteira Lucro certo R$ %.2f < stake fixa R$ %.2f",
                spendable,
                liability));
        return out;
      }
    } else {
      double pct = stakePct > 0 ? stakePct : 99.0;
      if (pct > 100) pct = 100;
      liability = Math.floor(spendable * (pct / 100.0) * 100.0) / 100.0;
      if (liability < 1) liability = 1;
      if (liability > spendable) liability = spendable;
    }

    String mId = marketId != null ? marketId : "";
    String rId = runnerId != null ? runnerId : "";
    String runnerName = resolveCorrectScoreRunnerName(score);
    double odds = layOdds;

    if (mId.isEmpty() || rId.isEmpty()) {
      JSONObject quote = quoteCorrectScore(token, eventId, runnerName);
      if (quote == null) {
        out.put("ok", false);
        out.put("error", "Não achei mercado Correct Score / runner " + runnerName);
        return out;
      }
      mId = quote.optString("marketId", mId);
      rId = quote.optString("runnerId", rId);
      if (odds <= 1.01) odds = quote.optDouble("odds", odds);
    }
    if (odds <= 1.01) {
      out.put("ok", false);
      out.put("error", "Odd Lay inválida");
      return out;
    }

    double stake = Math.floor((liability / (odds - 1.0)) * 100.0) / 100.0;
    if (stake < MIN_STAKE) {
      double minLiability = Math.round(MIN_STAKE * (odds - 1.0) * 100.0) / 100.0;
      if (minLiability > spendable + 0.001) {
        out.put("ok", false);
        out.put(
            "error",
            String.format(
                Locale.US,
                "Saldo livre R$ %.2f não cobre Lay mínimo (resp. R$ %.2f @ %.2f)",
                spendable,
                minLiability,
                odds));
        return out;
      }
      stake = MIN_STAKE;
    }
    double effectiveLiability = Math.round(stake * (odds - 1.0) * 100.0) / 100.0;
    if (effectiveLiability > spendable + 0.001 && spendable >= 1) {
      stake = Math.floor((spendable / (odds - 1.0)) * 100.0) / 100.0;
      if (stake < MIN_STAKE) {
        out.put("ok", false);
        out.put(
            "error",
            String.format(
                Locale.US,
                "Saldo livre R$ %.2f insuficiente para este Lay @ %.2f",
                spendable,
                odds));
        return out;
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
    out.put("stake", stake);
    out.put("odds", odds);
    out.put("liability", effectiveLiability);
    out.put("marketId", mId);
    out.put("runnerId", rId);
    out.put("score", runnerName);
    out.put("eventId", eventId);
    if (res.code < 200 || res.code >= 300) {
      out.put("ok", false);
      out.put("status", res.code);
      out.put("error", formatApiError(res.body, res.code));
      return out;
    }
    // Reserva liability local até /offers atualizar — evita 2ª entrada no mesmo ciclo.
    addLocalExposure(effectiveLiability);
    out.put("ok", true);
    out.put("status", res.code);
    out.put("availableAfter", Math.max(0, spendable - effectiveLiability));
    return out;
  }

  JSONObject placeBack(
      String eventId,
      String score,
      double backOdds,
      double stakeIn,
      String marketId,
      String runnerId)
      throws Exception {
    JSONObject out = new JSONObject();
    if (eventId == null || eventId.isEmpty()) {
      out.put("ok", false);
      out.put("error", "eventId obrigatório");
      return out;
    }
    if (!(backOdds > 1.01)) {
      out.put("ok", false);
      out.put("error", "backOdds inválida");
      return out;
    }
    if (!(stakeIn >= MIN_STAKE)) {
      out.put("ok", false);
      out.put("error", "stake Back inválido (mín. R$ 1)");
      return out;
    }

    String token = findSessionToken();
    if (token == null || token.isEmpty()) {
      out.put("ok", false);
      out.put("error", "Sem sessão BetBra — toque em Conectar BetBra");
      return out;
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
        out.put("ok", false);
        out.put("error", "Não achei mercado Correct Score / runner " + runnerName);
        return out;
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
      return out;
    }
    out.put("ok", true);
    out.put("status", res.code);
    return out;
  }

  static Double targetBackForLiabilityProfit(double layOdds, double targetPct) {
    if (!(layOdds > 1) || !(targetPct > 0)) return null;
    double denom = 1 - targetPct * (layOdds - 1);
    if (denom <= 0.05) return null;
    return Math.round((layOdds / denom) * 100.0) / 100.0;
  }

  static Double greenBackStake(double layStake, double layOdds, double backOdds) {
    if (!(backOdds > 0) || !(layStake > 0) || !(layOdds > 1)) return null;
    return (layStake * layOdds) / backOdds;
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

  private String loadPersistedToken() {
    String t = prefs().getString(PREF_TOKEN, "");
    if (t == null || t.isEmpty() || isGuestToken(t)) return null;
    return t;
  }

  private void savePersistedToken(String token) {
    if (token == null || token.isEmpty() || isGuestToken(token)) return;
    prefs().edit().putString(PREF_TOKEN, token).apply();
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

  private void savePersistedBalance(double balance, String via) {
    if (balance < 0 || balance > 5_000_000) return;
    prefs()
        .edit()
        .putString(PREF_BALANCE, String.valueOf(balance))
        .putLong(PREF_BALANCE_AT, System.currentTimeMillis())
        .putString(PREF_BALANCE_VIA, via != null ? via : "")
        .apply();
  }

  static void setReservedLucroCerto(Context ctx, double amount) {
    float v =
        amount >= 0 ? (float) (Math.round(amount * 100.0) / 100.0) : DEFAULT_RESERVED_LC;
    ctx.getApplicationContext()
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putFloat(PREF_RESERVED_LC, v)
        .apply();
  }

  double getReservedLucroCerto() {
    try {
      float v = prefs().getFloat(PREF_RESERVED_LC, DEFAULT_RESERVED_LC);
      return v >= 0 ? Math.round(v * 100.0) / 100.0 : DEFAULT_RESERVED_LC;
    } catch (Exception e) {
      return DEFAULT_RESERVED_LC;
    }
  }

  /** Auto Lucro certo desligado → não separa banca. */
  boolean isLucroCertoStrategyOn() {
    try {
      return app
          .getSharedPreferences(AutoLayForegroundService.PREFS, Context.MODE_PRIVATE)
          .getBoolean("lucroCertoOn", true);
    } catch (Exception e) {
      return true;
    }
  }

  /** Usa a sessão atual para medir liability Lay sem Back. */
  double fetchUnhedgedLayLiabilityAuto() {
    String token = findSessionToken();
    if (token == null || token.isEmpty()) return 0;
    return fetchUnhedgedLayLiability(token);
  }

  /**
   * Lay matched/aberto sem Back no mesmo placar = LC (ou hold) em curso.
   * Com LC em curso a reserva já está alocada — a sobra do saldo livre
   * fica disponível para 3x3 / Eventos raros.
   */
  double fetchUnhedgedLayLiability(String token) {
    try {
      HttpResult res = httpJson("GET", API + "/offers?offset=0&per-page=200", null, token);
      if (res.code >= 400) return 0;
      JSONArray arr = extractOffersArray(res);
      Map<String, Double> layLiab = new HashMap<>();
      Set<String> hasBack = new HashSet<>();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String status = o.optString("status", o.optString("state", "")).toLowerCase(Locale.ROOT);
        boolean dead =
            status.contains("settled")
                || status.contains("void")
                || status.contains("cancel")
                || status.contains("lapsed")
                || status.contains("failed")
                || status.contains("expired");
        if (dead) continue;
        String side = o.optString("side", o.optString("type", "")).toLowerCase(Locale.ROOT);
        String eid =
            o.optString("event-id", o.optString("eventId", o.optString("event_id", "")));
        String rid =
            o.optString(
                "runner-id",
                o.optString(
                    "runnerId",
                    o.optString(
                        "runner-name",
                        o.optString("runnerName", o.optString("selection-name", "")))));
        String key = eid + "|" + rid;
        if (side.contains("back")) {
          hasBack.add(key);
          continue;
        }
        if (!side.isEmpty() && !side.contains("lay")) continue;
        double odds =
            o.optDouble("odds", o.optDouble("price", o.optDouble("odds-requested", 0)));
        double stake =
            o.optDouble(
                "size-matched",
                o.optDouble(
                    "sizeMatched",
                    o.optDouble(
                        "stake",
                        o.optDouble(
                            "size",
                            o.optDouble(
                                "size-remaining", o.optDouble("sizeRemaining", 0))))));
        double liab =
            o.optDouble(
                "liability",
                o.optDouble("liability-remaining", o.optDouble("potential-liability", 0)));
        if (liab < 0.01 && stake > 0 && odds > 1.01) {
          liab = stake * (odds - 1.0);
        }
        if (liab > 0.01) {
          layLiab.put(key, Math.max(layLiab.containsKey(key) ? layLiab.get(key) : 0, liab));
        }
      }
      double total = 0;
      for (Map.Entry<String, Double> e : layLiab.entrySet()) {
        if (!hasBack.contains(e.getKey())) total += e.getValue();
      }
      return Math.round(total * 100.0) / 100.0;
    } catch (Exception e) {
      return 0;
    }
  }

  /**
   * Isola a carteira Lucro certo só com a estratégia ligada.
   * LC em curso (Lay sem Back): sobra do saldo livre entra em outras ops.
   * Sem LC em curso: outras ops não usam a reserva; LC só gasta dela.
   */
  private double applyReservedLucroCerto(
      double spendable, boolean forLucroCerto, double unhedgedLayLiability) {
    if (!isLucroCertoStrategyOn()) return spendable;
    double reserved = getReservedLucroCerto();
    if (!(reserved > 0.009) || !(spendable >= 0)) return spendable;
    if (forLucroCerto) {
      return Math.min(spendable, reserved);
    }
    // Reserva já consumida pelo Lay LC/hold em curso → não retém o restante.
    if (unhedgedLayLiability > 0.5) {
      return spendable;
    }
    return Math.max(0, Math.round((spendable - reserved) * 100.0) / 100.0);
  }

  private double applyReservedLucroCerto(double spendable, boolean forLucroCerto) {
    return applyReservedLucroCerto(spendable, forLucroCerto, 0);
  }

  /**
   * Saldo livre estimado. {@code forLucroCerto=false} já desconta a carteira
   * reservada (não entra em 3x3 / Eventos raros).
   */
  double freeBalanceEstimate() {
    return freeBalanceEstimate(false);
  }

  double freeBalanceEstimate(boolean forLucroCerto) {
    try {
      String token = findSessionToken();
      if (token == null || token.isEmpty()) return -1;
      ensureApiCookie(token);
      Double balance = fetchBalance(token);
      if (balance != null) {
        savePersistedBalance(balance, "api");
      } else {
        // Saldo velho não autoriza entrada: sem número recente, devolve
        // desconhecido e deixa a própria exchange decidir na ordem.
        balance = loadPersistedBalance(FRESH_BALANCE_MS);
      }
      if (balance == null) return -1;
      // reconcile equivale a descontar o maior entre ofertas abertas e reserva local
      double locked = Math.max(fetchOpenLayExposure(token), loadLocalExposure());
      double available = balance - locked;
      if (available < 0) available = 0;
      double unhedged = fetchUnhedgedLayLiability(token);
      available = applyReservedLucroCerto(available, forLucroCerto, unhedged);
      return Math.round(available * 100.0) / 100.0;
    } catch (Exception e) {
      return -1;
    }
  }

  /**
   * Lay casado no book (paridade com a extensão: Back só depois do match).
   * true = matched; false = ainda unmatched/aberto; null = desconhecido.
   */
  Boolean isLayMatched(String eventId, String marketId, String runnerId) {
    JSONObject d = getLayMatchDetails(eventId, marketId, runnerId);
    if (d == null) return null;
    if (!d.has("matched")) return null;
    return d.optBoolean("matched", false);
  }

  /**
   * Detalhe do Lay no book: matched + stake/odd/liability correspondidos.
   * {@code matched} ausente = desconhecido (ainda não viu a oferta).
   *
   * <p>Regra (igual bolsa-manual {@code classifyOffer}): casado só com
   * size-matched &gt; 0 e remaining ≈ 0. Oferta unmatched NÃO conta como matched
   * só porque o status contém a substring "matched".
   */
  JSONObject getLayMatchDetails(String eventId, String marketId, String runnerId) {
    try {
      // Para liberar um Back, a confirmação precisa apontar para exatamente a
      // mesma seleção do Lay. Sem esses IDs, qualquer Lay do evento poderia
      // ser confundido com a operação ativa.
      if (eventId == null
          || eventId.isEmpty()
          || marketId == null
          || marketId.isEmpty()
          || runnerId == null
          || runnerId.isEmpty()) {
        return null;
      }
      String token = findSessionToken();
      if (token == null || token.isEmpty()) return null;
      ensureApiCookie(token);
      HttpResult res = httpJson("GET", API + "/offers?offset=0&per-page=200", null, token);
      if (res.code >= 400) return null;
      JSONArray arr = extractOffersArray(res);
      String wantEvent = eventId != null ? eventId : "";
      String wantMarket = marketId != null ? marketId : "";
      String wantRunner = runnerId != null ? runnerId : "";
      boolean sawOpenLay = false;
      boolean sawAny = false;
      JSONObject bestMatched = null;
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String side = o.optString("side", o.optString("type", "")).toLowerCase(Locale.ROOT);
        if (!side.isEmpty() && !side.contains("lay")) continue;
        String eid =
            o.optString(
                "event-id",
                o.optString("eventId", o.optString("event_id", "")));
        String mid =
            o.optString(
                "market-id",
                o.optString("marketId", o.optString("market_id", "")));
        String rid =
            o.optString(
                "runner-id",
                o.optString("runnerId", o.optString("runner_id", "")));
        // Identificadores ausentes na resposta também não servem como prova de
        // match: não é seguro associá-los à seleção ativa por aproximação.
        if (!wantEvent.equals(eid) || !wantMarket.equals(mid) || !wantRunner.equals(rid)) {
          continue;
        }

        sawAny = true;
        String kind = classifyOfferKind(o);
        if ("open".equals(kind) || "partial".equals(kind) || "unknown".equals(kind)) {
          sawOpenLay = true;
        } else if ("matched".equals(kind)) {
          JSONObject detail = extractMatchedLay(o);
          if (detail != null) {
            bestMatched = detail;
          }
        }
      }
      JSONObject out = new JSONObject();
      out.put("open", sawOpenLay);
      out.put("seen", sawAny);
      // Com Lay ainda no book (unmatched), NÃO avançar Back.
      if (sawOpenLay) {
        out.put("matched", false);
        return out;
      }
      if (bestMatched != null) {
        out.put("matched", true);
        out.put("stake", bestMatched.optDouble("stake", 0));
        out.put("odds", bestMatched.optDouble("odds", 0));
        out.put("liability", bestMatched.optDouble("liability", 0));
        out.put("offerId", bestMatched.optString("offerId", ""));
        out.put("betId", bestMatched.optString("betId", ""));
        return out;
      }
      // Sem oferta open/matched clara — desconhecido (FGS usa laySeenOpen).
      return out;
    } catch (Exception e) {
      return null;
    }
  }

  /** remaining / size-remaining / remaining-stake. NaN se a API não mandou. */
  static double offerRemaining(JSONObject o) {
    if (o == null) return Double.NaN;
    String[] keys = {
      "size-remaining",
      "sizeRemaining",
      "size_remaining",
      "remaining-stake",
      "remainingStake",
      "remaining",
      "stake-remaining",
      "stakeRemaining"
    };
    for (String k : keys) {
      if (o.has(k) && !o.isNull(k)) {
        double v = o.optDouble(k, Double.NaN);
        if (!Double.isNaN(v)) return v;
      }
    }
    return Double.NaN;
  }

  static double offerSizeMatched(JSONObject o) {
    if (o == null) return 0;
    double v =
        o.optDouble(
            "size-matched",
            o.optDouble(
                "sizeMatched",
                o.optDouble(
                    "matched-size",
                    o.optDouble(
                        "matchedSize",
                        o.optDouble(
                            "matched-stake", o.optDouble("matchedStake", 0))))));
    return v > 0 ? v : 0;
  }

  /**
   * open | partial | matched | cancelled | unknown — paridade bolsa-manual.
   * Nunca usa {@code contains("matched")} em cima de "unmatched".
   */
  static String classifyOfferKind(JSONObject o) {
    if (o == null) return "cancelled";
    String st =
        o.optString("status", o.optString("state", "")).toLowerCase(Locale.ROOT).trim();
    double rem = offerRemaining(o);
    double matchedSize = offerSizeMatched(o);

    if (st.contains("cancel")
        || st.contains("void")
        || st.contains("fail")
        || st.contains("laps")
        || st.contains("dead")
        || st.contains("withdraw")
        || st.contains("closed")
        || st.contains("delet")
        || st.contains("remov")
        || st.contains("expir")
        || st.contains("anulado")) {
      return "cancelled";
    }

    // Ainda há size no book → unmatched / parcial (NÃO é entrada casada).
    if (!Double.isNaN(rem) && rem >= 0.01) {
      return matchedSize >= 0.01 ? "partial" : "open";
    }

    // Remaining ~0 e houve match real.
    if (!Double.isNaN(rem) && rem < 0.01 && matchedSize >= 0.01) {
      return "matched";
    }

    if (st.contains("unmatched") || st.contains("partial")) {
      return st.contains("partial") && matchedSize >= 0.01 ? "partial" : "open";
    }
    if (st.equals("open")
        || st.equals("edited")
        || st.equals("delayed")
        || st.equals("pending")
        || st.equals("active")
        || st.equals("created")
        || st.equals("live")
        || st.equals("waiting")) {
      return "open";
    }

    // Status "matched"/"filled"/"executed" só conta se remaining sumiu.
    boolean statusFilled =
        st.equals("matched")
            || st.equals("filled")
            || st.equals("executed")
            || st.equals("settled")
            || st.equals("complete")
            || st.endsWith("_matched")
            || st.startsWith("matched_");
    if (statusFilled && (Double.isNaN(rem) || rem < 0.01) && matchedSize >= 0.01) {
      return "matched";
    }
    if (statusFilled && (Double.isNaN(rem) || rem < 0.01)) {
      // API diz matched e não há remaining — aceita mesmo sem size-matched.
      return "matched";
    }

    if (st.isEmpty() && !Double.isNaN(rem) && rem >= 0.01) return "open";
    if (st.isEmpty() && matchedSize >= 0.01 && (Double.isNaN(rem) || rem < 0.01)) {
      return "matched";
    }
    // Incerto: preferir open (não dispara Back / card de casada).
    if (matchedSize < 0.01) return "open";
    return "unknown";
  }

  static boolean isOfferStillOpen(JSONObject o) {
    String kind = classifyOfferKind(o);
    return "open".equals(kind) || "partial".equals(kind) || "unknown".equals(kind);
  }

  private static JSONObject extractMatchedLay(JSONObject o) {
    try {
      double stake = offerSizeMatched(o);
      // Sem size-matched real não inventa stake do pedido unmatched.
      if (stake < 0.01) return null;
      double odds =
          o.optDouble(
              "average-odds-matched",
              o.optDouble(
                  "averageOddsMatched",
                  o.optDouble(
                      "odds-matched",
                      o.optDouble(
                          "matched-odds",
                          o.optDouble(
                              "average-odds",
                              o.optDouble(
                                  "price",
                                  o.optDouble("odds", o.optDouble("odds-requested", 0))))))));
      double liability =
          o.optDouble(
              "liability-matched",
              o.optDouble(
                  "matched-liability",
                  o.optDouble("matchedLiability", 0)));
      if (liability < 0.01 && stake > 0 && odds > 1.01) {
        liability = Math.round(stake * (odds - 1.0) * 100.0) / 100.0;
      }
      if (!(odds > 1.01)) return null;
      JSONObject d = new JSONObject();
      d.put("stake", Math.round(stake * 100.0) / 100.0);
      d.put("odds", odds);
      d.put("liability", Math.round(liability * 100.0) / 100.0);
      d.put(
          "offerId",
          o.optString(
              "id",
              o.optString("offer-id", o.optString("offerId", ""))));
      d.put(
          "betId",
          o.optString(
              "bet-id",
              o.optString("betId", o.optString("order-id", ""))));
      return d;
    } catch (Exception e) {
      return null;
    }
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

  /**
   * Se a API já lista as ofertas, zera a reserva local (evita descontar 2x).
   */
  private double reconcileLocalExposure(double openExposureFromApi) {
    double local = loadLocalExposure();
    if (local <= 0.01) return 0;
    if (openExposureFromApi + 0.5 >= local) {
      clearLocalExposure();
      return 0;
    }
    // API ainda atrasada — mantém só a diferença, preservando o início da janela
    double pending = Math.round((local - openExposureFromApi) * 100.0) / 100.0;
    if (pending < 0) pending = 0;
    prefs().edit().putFloat(PREF_LOCAL_EXPOSURE, (float) pending).apply();
    return pending;
  }

  private SharedPreferences prefs() {
    return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static boolean isGuestToken(String token) {
    return token != null && token.equals(GUEST_TOKEN);
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

  private String authCookieHeader(String urlStr, String token) {
    String cookie = CookieManager.getInstance().getCookie(urlStr);
    if (cookie == null || cookie.isEmpty()) {
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

  private Double fetchBalance(String token) {
    try {
      String[] paths =
          new String[] {
            "/account", "/accounts", "/members/self", "/funds", "/balances", "/balance", "/wallet"
          };
      for (String path : paths) {
        HttpResult res = httpJson("GET", API + path, null, token);
        if (res.code < 200 || res.code >= 300) continue;
        Double bal = extractBalance(res.bodyJson);
        if (bal == null) bal = extractBalanceFromRaw(res.body);
        if (bal != null) return bal;
      }
    } catch (Exception ignored) {
    }
    return null;
  }

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
        if (!open) continue;
        if (status.contains("matched")
            && !status.contains("partial")
            && !status.contains("unmatched")) {
          continue;
        }
        String side = o.optString("side", o.optString("type", "")).toLowerCase(Locale.ROOT);
        if (!side.isEmpty() && !side.contains("lay")) continue;
        double stake =
            o.optDouble("size-remaining", o.optDouble("stake", o.optDouble("size", 0)));
        double odds = o.optDouble("odds", o.optDouble("price", o.optDouble("odds-requested", 0)));
        if (stake > 0 && odds > 1.01) {
          exposure += stake * (odds - 1.0);
        }
      }
      return Math.round(exposure * 100.0) / 100.0;
    } catch (Exception e) {
      return 0;
    }
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

  private static JSONArray extractOffersArray(HttpResult res) {
    if (res == null) return new JSONArray();
    if (res.bodyJson != null) {
      JSONArray direct = res.bodyJson.optJSONArray("offers");
      if (direct != null) return direct;
      JSONArray data = res.bodyJson.optJSONArray("data");
      if (data != null && data.length() > 0 && data.optJSONObject(0) != null) return data;
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

  private static Double extractBalance(JSONObject data) {
    return extractBalance(data, 0);
  }

  private static Double extractBalance(Object data, int depth) {
    if (data == null || depth > 8) return null;
    if (data instanceof Number) {
      double n = ((Number) data).doubleValue();
      if (n >= 0 && !Double.isNaN(n) && n <= 5_000_000) {
        return Math.round(n * 100.0) / 100.0;
      }
      return null;
    }
    if (data instanceof JSONObject) {
      JSONObject obj = (JSONObject) data;
      String[] keys =
          new String[] {
            "available-to-bet",
            "availableToBet",
            "available-funds",
            "availableFunds",
            "available-balance",
            "availableBalance",
            "balance",
            "funds",
            "wallet",
            "saldo"
          };
      for (String k : keys) {
        if (obj.has(k)) {
          Double n = extractBalance(obj.opt(k), depth + 1);
          if (n != null) return n;
        }
      }
      String[] nests = new String[] {"account", "wallet", "funds", "data", "result"};
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

  private static String formatApiError(String body, int status) {
    if (body == null || body.isEmpty()) return "HTTP " + status;
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
        return "Saldo insuficiente na Exchange. Cancele ofertas ou use % menor.";
      }
      if (upper.contains("UNAUTHORIZED") || status == 401) {
        return "Sessão BetBra expirada — reconecte";
      }
      if (!detail.isEmpty()) {
        return detail.length() > 200 ? detail.substring(0, 200) : detail;
      }
    } catch (Exception ignored) {
    }
    return body.length() > 200 ? body.substring(0, 200) : body;
  }

  private static class HttpResult {
    int code;
    String body;
    JSONObject bodyJson;
  }
}
