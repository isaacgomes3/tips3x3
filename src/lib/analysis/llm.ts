import type { MomentAnalysis } from "./moment-analysis";

function getLlmConfig() {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const baseUrl =
    process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return { openaiKey, baseUrl, model };
}

export function isLlmConfigured() {
  return Boolean(getLlmConfig().openaiKey);
}

/**
 * Enriquece a análise de regras com um parecer curto via LLM (OpenAI-compatible).
 * Se falhar ou não houver chave, devolve a análise de regras.
 */
export async function enrichMomentWithLlm(
  base: MomentAnalysis,
  context: Record<string, unknown>,
): Promise<MomentAnalysis> {
  const { openaiKey, baseUrl, model } = getLlmConfig();
  if (!openaiKey) return base;

  const system = `Você é analista de exchange de futebol focado em LAY no placar exato 3-3 com saída no BACK (~1% da liability).
Responda APENAS JSON válido com:
{
  "verdict": "ENTER"|"WAIT"|"ABORT",
  "confidence": number 0-100,
  "headline": string curta em pt-BR,
  "thesis": string 1-2 frases,
  "risks": string[],
  "actions": string[]
}
Critérios:
- Só ENTER se padrão pré ok, tese anti-3x3 ok, mercado com fluidez (não lateral) E correção favorável (odd subindo pós-choque).
- Não liberar ENTER só porque a odd está em 20–50.
- Preferir lay baixo (≈20–32): correção de ~1% exige menos movimento na odd e menos liability.
- Lay perto de 50 = mais risco e saída mais lenta — marcar WAIT/risco alto.
- Se odd parada / matched fraco → WAIT.
- Se placar favorece 3-3 (ex 2-2) → ABORT.
- Considere tempo médio de correção ao sugerir urgência da saída.`;

  const user = JSON.stringify(
    {
      baseVerdict: base.verdict,
      baseConfidence: base.confidence,
      pillars: base.pillars,
      context,
    },
    null,
    2,
  );

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.warn("LLM moment analysis failed", res.status, err.slice(0, 200));
      return base;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return base;

    const parsed = JSON.parse(content) as {
      verdict?: MomentAnalysis["verdict"];
      confidence?: number;
      headline?: string;
      thesis?: string;
      risks?: string[];
      actions?: string[];
    };

    const verdict = parsed.verdict ?? base.verdict;
    // Não permitir ENTER se regras já bloquearam por anti-3x3/fluidez crítica
    const anti = base.pillars.find((p) => p.id === "anti33");
    const fluid = base.pillars.find((p) => p.id === "fluidity");
    const safeVerdict =
      verdict === "ENTER" && (!anti?.ok || !fluid?.ok) ? "WAIT" : verdict;

    return {
      ...base,
      verdict: safeVerdict,
      confidence: Math.max(
        0,
        Math.min(100, Number(parsed.confidence ?? base.confidence)),
      ),
      headline: parsed.headline?.trim() || base.headline,
      thesis: parsed.thesis?.trim() || base.thesis,
      risks: parsed.risks?.length ? parsed.risks.slice(0, 6) : base.risks,
      actions: parsed.actions?.length ? parsed.actions.slice(0, 5) : base.actions,
      source: "llm",
      model,
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("LLM moment analysis error", error);
    return base;
  }
}
