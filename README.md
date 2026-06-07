# Terraço Itália — Sistema de Gestão de Vinhos

Painel de gestão operacional de vinhos para o Terraço Itália, São Paulo.
Desenvolvido para a sommelière Diana Milena Pinilla de Oliveira.

---

## Acesso

**URL GitHub Pages:** `https://[seu-usuario].github.io/[nome-do-repo]/`

**PINs de acesso:**
| Perfil | PIN | Acesso |
|--------|-----|--------|
| Sommelier (Diana) | 1234 | Total |
| Maître | 5678 | Operação |
| Staff (garçons) | 0000 | Visualização |

---

## Estrutura do Projeto

```
/
├── index.html          ← App principal
├── css/
│   └── style.css       ← Todos os estilos
├── js/
│   ├── config.js       ← Supabase config + constantes (HARM_DATA, KPIS_DEF)
│   ├── db.js           ← Todas as operações Supabase (load, save, auth)
│   └── app.js          ← Estado, renders, lógica de UI
├── data/
│   ├── supabase_schema_terracoitalia.sql  ← Schema completo do banco
│   ├── 01_wines.csv                       ← Seed: 153 rótulos
│   ├── 02_wine_consumption.csv            ← Seed: consumo Jan–Mai 2026
│   ├── 03_erp_imports.csv
│   ├── 04_erp_name_aliases.csv
│   ├── 05_wine_substitutions.csv
│   ├── 06_harmonizations.csv
│   ├── 07_kpi_entries.csv
│   └── 08_users.csv
└── README.md
```

---

## Banco de Dados (Supabase)

**Projeto:** `fvwlfoksplfwfcbnenwj.supabase.co`

### Setup inicial (uma única vez)

1. Supabase → SQL Editor → New Query
2. Cole e execute `data/supabase_schema_terracoitalia.sql`
3. Importe os CSVs na ordem: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
4. Execute as políticas RLS (bloco no final do schema SQL)

### Módulos

| Módulo | Descrição |
|--------|-----------|
| Dashboard | KPIs, alertas estratégicos, gráficos |
| Controle Diário | Estoque da adega do andar por turno |
| Pair Stock | Tabela completa com sparklines e cálculos |
| Reposição | Almoxarifado, pedido de compra, requisição interna |
| Substituições | Regras Na Falta De / Upselling / Harmonização |
| Harmonização | Matriz vinho × prato com argumentos de venda |
| Importar XLS | Upload do relatório mensal do ERP |
| Gestão de Taças | Diagnóstico TC: Remover/Funil/Revisar/Manter |
| Carta de Vinhos | Catálogo com status (Ativo/Em Revisão/Inativo) |
| KPIs & Metas | 6 indicadores com metas e histórico |
| Campeonato | Ranking de garçons com score automático |

---

## Exportações XLS

- **Controle Diário** — estoque atual, status, pair stock
- **Pedido de Compra** — itens com déficit + referência completa A+B
- **Requisição Interna** — para descida ao almoxarifado, com assinatura

---

## Fórmulas de Pair Stock

```
cons_dia        = total_consumo_5M / 150 dias
pair_stock      = ⌈cons_dia × 1,3⌉
est_min_adega   = pair_stock × 2
repos_quinzenal = ⌈cons_dia × 15 × 1,2⌉
```

**ABC:** A = top 70% volume · B = próximos 20% · C = últimos 10%

---

## Alterando PINs

```sql
-- No Supabase SQL Editor:
UPDATE users SET pin_hash = md5('NOVO_PIN') WHERE role = 'sommelier';
UPDATE users SET pin_hash = md5('NOVO_PIN') WHERE role = 'maitre';
```

---

*Junho 2026 · Terraço Itália · Diana Milena Pinilla de Oliveira*
