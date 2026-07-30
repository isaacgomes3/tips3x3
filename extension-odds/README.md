# Tips3x3 Odds · Bet365 + Betnacional

Extensão Chrome (MV3) que lê odds **1X2** nas abas logadas da Bet365 e Betnacional e envia para o painel Tips3x3 (`POST /api/ext/odds`).

## Instalação

1. Chrome → `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → pasta `extension-odds/`
4. Abra **Opções** da extensão → URL `https://tips3x3.com` (ou `http://localhost:3000`)
5. Faça login no painel Tips3x3 (a extensão lê o cookie `tips3x3_session`)

## Uso

1. Mantenha abas abertas e logadas em:
   - Betnacional (lista/futebol)
   - Bet365 (futebol / jogos do dia)
2. No painel: **Comparar**
3. O badge da extensão mostra quantos eventos foram enviados no último push

## Fluxo

```
Bet365 / Betnacional (DOM + hook de rede)
        ↓
  content script
        ↓
  background → Authorization: Bearer <tips3x3_session>
        ↓
  POST /api/ext/odds
        ↓
  buildOddsCompare (prioridade sobre Odds-API.io)
```

## Limitações

- Parsers de DOM quebram quando a casa muda o HTML — use o hook de rede (JSON) quando possível
- Precisa das abas abertas (não é servidor headless)
- Só mercado **Resultado Final / 1X2** no MVP
- Uso com sua própria sessão; respeite os termos das casas

## Debug

- Popup da extensão → status / último erro
- Console da aba da casa → logs `[tips3x3-odds:bet365]` / `[tips3x3-odds:betnacional]`
