# tips3x3

Painel de **lay no placar exato 3-3** (BetBra Mexchange):

1. Varre os jogos do dia com odd de referência no runner `3-3`
2. Gera **análise pré-live** (equilíbrio 1X2, BTTS, Over 2.5, liquidez, volume)
3. Confirma o **padrão em live** via feed in-play
4. Emite **alerta de entrada** quando pré + live fecham

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### Variáveis

| Variável | Descrição |
|---|---|
| `BETBRA_SESSION_TOKEN` | Cookie `session-token` após login no BetBra (recomendado) |
| `LAY_3X3_MIN_ODDS` / `LAY_3X3_MAX_ODDS` | Janela de odd lay (padrão 20–50) |
| `TARGET_PROFIT_PCT` | Lucro alvo na saída back sobre a liability (padrão 1%) |
| `OPENAI_API_KEY` | Opcional — enriquece a análise de momento com LLM |
| `PRELIVE_MIN_SCORE` | Score mínimo da análise para watchlist |

Sem `BETBRA_SESSION_TOKEN`, o app tenta um token público de leitura do Mexchange (pode expirar).

## APIs internas

- `GET /api/opportunities` — jogos + análise pré-live
- `GET /api/live` — confirmação live + alertas
- `GET /api/events/[id]` — detalhe de um evento
- `GET /api/charts/[runnerId]?marketId=&minutesBefore=60` — histórico de odd + volume matched
- `GET /api/analyze-moment?eventId=` — análise de momento (pré × live × anti-3x3 × fluidez ± LLM)

## Fontes BetBra / Bolsa

- Mexchange: `https://mexchange-api.betbra.bet.br/api`
- Client / in-play: `https://betbra.bet.br/client/api`
- Gráfico odd/volume: `https://data-center-bolsa-statistics-api.layback.trade/api/odds-history` (fallback Matchbook historical)

O painel **não envia ordens** automaticamente — só analisa e alerta.
