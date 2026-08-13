package com.tips3x3.app;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Ponte para o produto web Surebet existente; nenhuma interface paralela é criada. */
@CapacitorPlugin(name = "DualSurebet")
public final class DualSurebetPlugin extends Plugin {
  private final ExecutorService io = Executors.newSingleThreadExecutor();

  @PluginMethod
  public void openLogin(PluginCall call) {
    String venue = call.getString("venue", SeparateSurebetService.BETBRA);
    Intent intent = new Intent(getContext(), BetBraLoginActivity.class);
    if (SeparateSurebetService.BOLSA.equals(venue)) {
      intent.putExtra(BetBraLoginActivity.EXTRA_VENUE, "bolsa");
      intent.putExtra(BetBraLoginActivity.EXTRA_URL, "https://bolsadeaposta.bet.br/b/exchange");
    }
    getActivity().startActivity(intent);
    call.resolve(new JSObject().put("opened", true).put("venue", venue));
  }

  @PluginMethod
  public void status(PluginCall call) {
    SeparateSurebetService service = new SeparateSurebetService(getContext());
    call.resolve(new JSObject()
        .put("betbra", service.connected(SeparateSurebetService.BETBRA))
        .put("bolsa", service.connected(SeparateSurebetService.BOLSA)));
  }

  @PluginMethod
  public void scan(PluginCall call) {
    double fee = call.getDouble("commission", 5d);
    double minRoi = call.getDouble("minRoi", 0d);
    double minLiquidity = call.getDouble("minLiquidity", 1d);
    io.execute(() -> {
      try {
        SeparateSurebetService service = new SeparateSurebetService(getContext());
        JSObject out = new JSObject();
        out.put("betbra", new JSArray(service.scan(SeparateSurebetService.BETBRA, fee, minRoi, minLiquidity).toString()));
        out.put("bolsa", new JSArray(service.scan(SeparateSurebetService.BOLSA, fee, minRoi, minLiquidity).toString()));
        call.resolve(out);
      } catch (Exception error) { call.reject("Falha ao buscar surebets", error); }
    });
  }

  @PluginMethod
  public void prepare(PluginCall call) {
    JSObject input = call.getObject("opportunity");
    if (input == null) { call.reject("Oportunidade obrigatória"); return; }
    double fee = call.getDouble("commission", 5d);
    double budget = call.getDouble("budget", 100d);
    io.execute(() -> {
      try {
        JSONObject prepared = new SeparateSurebetService(getContext()).prepare(
            new JSONObject(input.toString()), fee, budget);
        call.resolve(new JSObject(prepared.toString()));
      } catch (Exception error) { call.reject(error.getMessage(), error); }
    });
  }

  @PluginMethod
  public void executeConfirmed(PluginCall call) {
    JSObject input = call.getObject("prepared");
    Boolean confirmed = call.getBoolean("confirmed", false);
    if (!Boolean.TRUE.equals(confirmed)) { call.reject("Confirmação explícita obrigatória"); return; }
    if (input == null) { call.reject("Entrada preparada obrigatória"); return; }
    io.execute(() -> {
      try {
        JSONObject result = new SeparateSurebetService(getContext()).execute(new JSONObject(input.toString()));
        call.resolve(new JSObject(result.toString()));
      } catch (Exception error) { call.reject(error.getMessage(), error); }
    });
  }
}
