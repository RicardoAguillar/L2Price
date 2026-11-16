# L2Price — Controle de preços do mercado (Lineage 2 C1 · L2 Reborn Legacy)

## Como iniciar
Dê dois cliques em **`iniciar.bat`** ou rode `npm start`. Depois abra http://localhost:3777.
Precisa só do Node.js (18 ou mais novo). Não há dependências para instalar.

## Telas
| Tela | Para que serve |
|---|---|
| **Painel** | Indicadores, maiores altas e quedas em 7 dias, oportunidades, últimos registros e itens com preço desatualizado |
| **Mercado** | Tabela de todos os itens monitorados: compra, venda, spread, variação, tendência, quanto o NPC paga e sinais. Dá para ordenar, filtrar e favoritar |
| **Atualizar preços** | Planilha para preencher vários preços de uma vez (Enter passa para o próximo campo). Também aceita colar uma lista do Excel |
| **Oportunidades** | Ranking de flip, preços abaixo e acima da média, momentum, revenda ao NPC e itens mais voláteis |
| **Carteira** | Suas compras e vendas para investimento, com custo médio e lucro realizado e não realizado |
| **Catálogo C1** | Os 3.902 itens do C1 com ícones, para escolher o que monitorar |
| **Backup** | Exportar e importar o backup em JSON e exportar CSV para o Excel |

**Atalho:** aperte **N** em qualquer tela para registrar um preço.
**Formatos de preço aceitos:** `350k`, `1,5kk`, `2kkk`, `1.200.000`.

## Termos
- **Compra (WTB):** o preço das lojas de compra, ou seja, o que você paga montando uma loja de compra.
- **Venda (WTS):** o preço das lojas de venda, ou seja, o que você recebe vendendo na sua loja.
- **Spread:** a diferença entre os dois, que é o lucro de um flip.
- **NPC paga:** metade do preço de loja do NPC.

## Dados
- Os seus dados ficam em `data/db.json`, com uma cópia automática em `db.json.bak`.
- O catálogo e os ícones foram extraídos de [l2hub.info](https://l2hub.info/c1/items), filtrado para o C1.
- Para atualizar o catálogo, rode `npm run update-db`.
