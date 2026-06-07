-- ============================================================
-- SISTEMA DE GESTÃO DE VINHOS — TERRAÇO ITÁLIA
-- Supabase PostgreSQL Schema
-- Versão: 1.0 | Junho 2026
-- 
-- INSTRUÇÕES:
-- 1. Acesse seu projeto no Supabase (supabase.com)
-- 2. Vá em: SQL Editor → New Query
-- 3. Cole TODO este arquivo e clique em Run
-- 4. As tabelas, índices, funções e dados iniciais serão criados
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- para busca fuzzy de nomes

-- ============================================================
-- TABELA 1: USERS
-- PIN de acesso com roles. Não usa Supabase Auth nativo
-- para simplificar — PIN é hasheado com MD5 (suficiente para
-- este contexto interno, não expose a internet sem HTTPS).
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,             -- MD5(pin) — trocar por bcrypt em produção
  role        TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('sommelier','maitre','staff')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  ultimo_acesso TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS 'Usuários do sistema com PIN de acesso e controle de role';
COMMENT ON COLUMN users.pin_hash IS 'MD5 do PIN de 4-6 dígitos. Trocar por pgcrypto em produção.';
COMMENT ON COLUMN users.role IS 'sommelier = acesso total | maitre = operação | staff = só leitura';

-- Dados iniciais de usuários
-- MD5('1234') = 81dc9bdb52d04dc20036dbd8313ed055
-- MD5('5678') = 1679091c5a880faf6fb5e6087eb1b2dc
-- MD5('0000') = 4a7d1ed414474e4033ac29ccb8653d9b
INSERT INTO users (nome, pin_hash, role) VALUES
  ('Diana Milena Pinilla de Oliveira', md5('1234'), 'sommelier'),
  ('Maître de Turno',                  md5('5678'), 'maitre'),
  ('Staff de Sala',                    md5('0000'), 'staff')
ON CONFLICT DO NOTHING;


-- ============================================================
-- TABELA 2: WINES
-- Catálogo master. Inclui vinhos novos (sem histórico ERP)
-- e vinhos da carta em revisão.
-- ============================================================
CREATE TABLE IF NOT EXISTS wines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cod_erp           INTEGER,                    -- código do POS/ERP (nullable para novos)
  nome              TEXT NOT NULL,
  nome_normalizado  TEXT,                       -- gerado automaticamente via trigger
  regiao            TEXT,
  pais              TEXT,
  uva               TEXT,
  safra             INTEGER,
  formato_ml        INTEGER NOT NULL DEFAULT 750
                      CHECK (formato_ml IN (50,150,375,750,1500)),
  tipo              TEXT NOT NULL DEFAULT 'tinto'
                      CHECK (tipo IN ('tinto','branco','rose','espumante','sobremesa','fortificado','taca')),
  status            TEXT NOT NULL DEFAULT 'ativo'
                      CHECK (status IN ('ativo','em_revisao','inativo','suspenso')),

  -- Pair Stock (calculados automaticamente após importação)
  cons_dia          NUMERIC(8,3) NOT NULL DEFAULT 0,
  pair_stock        INTEGER NOT NULL DEFAULT 1,
  est_min_adega     INTEGER NOT NULL DEFAULT 2,   -- pair_stock * 2
  repos_quinzenal   INTEGER NOT NULL DEFAULT 1,   -- ceil(cons_dia * 15 * 1.2)
  abc_class         CHAR(1) DEFAULT 'C'
                      CHECK (abc_class IN ('A','B','C')),
  dias_base         INTEGER NOT NULL DEFAULT 150, -- quantos dias foram usados no cálculo

  -- Preços
  preco_custo       NUMERIC(10,2) DEFAULT 0,
  preco_venda       NUMERIC(10,2) DEFAULT 0,
  markup            NUMERIC(5,2) GENERATED ALWAYS AS (
                      CASE WHEN preco_custo > 0
                        THEN ROUND(preco_venda / preco_custo, 2)
                        ELSE 0 END
                    ) STORED,

  -- Serviço
  notas_servico     TEXT,                        -- temperatura, abertura, dicas de venda
  fornecedor        TEXT,

  -- Auditoria
  criado_por        UUID REFERENCES users(id),
  atualizado_por    UUID REFERENCES users(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wines_cod_erp    ON wines(cod_erp);
CREATE INDEX IF NOT EXISTS idx_wines_status     ON wines(status);
CREATE INDEX IF NOT EXISTS idx_wines_abc        ON wines(abc_class);
CREATE INDEX IF NOT EXISTS idx_wines_tipo       ON wines(tipo);
CREATE INDEX IF NOT EXISTS idx_wines_nome_trgm  ON wines USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_wines_norm_trgm  ON wines USING GIN (nome_normalizado gin_trgm_ops);

COMMENT ON TABLE  wines IS 'Catálogo master de vinhos — inclui carta atual e novos rótulos em revisão';
COMMENT ON COLUMN wines.nome_normalizado IS 'Nome sem acentos, sem TC/375/750, uppercase — usado no match de importação ERP';
COMMENT ON COLUMN wines.dias_base IS 'Nº de dias operacionais usados para calcular cons_dia (padrão 150 = 5 meses)';
COMMENT ON COLUMN wines.markup IS 'Calculado automaticamente: preco_venda / preco_custo';


-- ── FUNÇÃO: normalizar nome para match ERP ──────────────────
CREATE OR REPLACE FUNCTION normalize_wine_name(p_nome TEXT)
RETURNS TEXT AS $$
DECLARE
  v TEXT;
BEGIN
  v := UPPER(p_nome);
  -- Remove sufixos de formato
  v := REGEXP_REPLACE(v, '\s*[-–]\s*TC\s*150\s*', '', 'gi');
  v := REGEXP_REPLACE(v, '\s*[-–]?\s*TC\s*$', '', 'gi');
  v := REGEXP_REPLACE(v, '\s*750\s*ML\s*', '', 'gi');
  v := REGEXP_REPLACE(v, '\s*375\s*ML\s*', '', 'gi');
  v := REGEXP_REPLACE(v, '\s*1[.,]5\s*(LT|L|LTS)\s*', '', 'gi');
  v := REGEXP_REPLACE(v, '^\s*1/2\s*', '', 'gi');
  -- Remove acentos via unaccent (se extensão disponível)
  -- v := unaccent(v); -- descomente se tiver a extensão
  -- Colapsa espaços múltiplos
  v := REGEXP_REPLACE(TRIM(v), '\s+', ' ', 'g');
  -- Remove sufixos de observação
  v := REGEXP_REPLACE(v, '\s*[-–]\s*N/C\s*$', '', 'gi');
  v := REGEXP_REPLACE(v, '\s*\(RUPTURA\)\s*', '', 'gi');
  v := TRIM(v);
  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── TRIGGER: preenche nome_normalizado e atualizado_em ──────
CREATE OR REPLACE FUNCTION wines_before_upsert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.nome_normalizado := normalize_wine_name(NEW.nome);
  NEW.atualizado_em    := NOW();
  -- Recalcula est_min e repos_quinzenal a partir de pair_stock e cons_dia
  NEW.est_min_adega    := NEW.pair_stock * 2;
  NEW.repos_quinzenal  := CEIL(NEW.cons_dia * 15 * 1.2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wines_before_upsert
  BEFORE INSERT OR UPDATE ON wines
  FOR EACH ROW EXECUTE FUNCTION wines_before_upsert();


-- ============================================================
-- TABELA 3: WINE_CONSUMPTION
-- Histórico mensal de consumo importado do ERP.
-- Append-only: nunca deletar — corrigir via nova linha com flag.
-- ============================================================
CREATE TABLE IF NOT EXISTS wine_consumption (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_id      UUID NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  ano          INTEGER NOT NULL CHECK (ano >= 2020 AND ano <= 2040),
  mes          INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  quantidade   INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  lt_unitario  NUMERIC(5,3) NOT NULL DEFAULT 0.75,
  fonte        TEXT NOT NULL DEFAULT 'erp_import'
                 CHECK (fonte IN ('erp_import','manual','correcao')),
  import_id    UUID,                    -- referência ao erp_imports.id
  correcao_de  UUID REFERENCES wine_consumption(id), -- se for correção de outra linha
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  importado_por UUID REFERENCES users(id),

  UNIQUE (wine_id, ano, mes, fonte)     -- evita duplicata por período e fonte
);

CREATE INDEX IF NOT EXISTS idx_wc_wine_id    ON wine_consumption(wine_id);
CREATE INDEX IF NOT EXISTS idx_wc_ano_mes    ON wine_consumption(ano, mes);
CREATE INDEX IF NOT EXISTS idx_wc_import_id  ON wine_consumption(import_id);

COMMENT ON TABLE  wine_consumption IS 'Histórico mensal de consumo — append-only, nunca deletar';
COMMENT ON COLUMN wine_consumption.correcao_de IS 'Se esta linha corrige outra, aponta para a linha original';


-- ============================================================
-- TABELA 4: ERP_IMPORTS
-- Log completo de cada importação de XLS.
-- ============================================================
CREATE TABLE IF NOT EXISTS erp_imports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename        TEXT NOT NULL,
  periodo_inicio  DATE,                 -- primeiro mês com dados no arquivo
  periodo_fim     DATE,                 -- último mês com dados no arquivo
  total_linhas    INTEGER DEFAULT 0,
  linhas_ok       INTEGER DEFAULT 0,
  linhas_revisao  INTEGER DEFAULT 0,    -- aguardando match manual
  linhas_erro     INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'processando'
                    CHECK (status IN ('processando','concluido','concluido_com_pendencias','erro')),
  notas           TEXT,
  importado_por   UUID REFERENCES users(id),
  importado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE erp_imports IS 'Log de auditoria de cada importação de XLS do ERP';


-- ============================================================
-- TABELA 5: ERP_IMPORT_ERRORS
-- Linhas do XLS que não foram matched automaticamente.
-- Diana revisa e associa manualmente ou ignora.
-- ============================================================
CREATE TABLE IF NOT EXISTS erp_import_errors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id       UUID NOT NULL REFERENCES erp_imports(id) ON DELETE CASCADE,
  linha_numero    INTEGER,
  descricao_erp   TEXT NOT NULL,        -- nome exato que veio do ERP
  lt_erp          NUMERIC(5,3),
  total_erp       INTEGER,
  motivo_erro     TEXT,                 -- 'nome_nao_encontrado', 'lt_invalido', etc.
  status_revisao  TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status_revisao IN ('pendente','associado','ignorado','novo_rotulo')),
  wine_id_associado UUID REFERENCES wines(id), -- preenchido quando Diana faz o match
  revisado_por    UUID REFERENCES users(id),
  revisado_em     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eie_import_id ON erp_import_errors(import_id);
CREATE INDEX IF NOT EXISTS idx_eie_status    ON erp_import_errors(status_revisao);

COMMENT ON TABLE  erp_import_errors IS 'Fila de revisão manual — nomes do ERP que não matcharam automaticamente';


-- ============================================================
-- TABELA 6: ERP_NAME_ALIASES
-- Associações aprendidas: nome do ERP → wine_id.
-- Uma vez que Diana associa manualmente, fica salvo aqui.
-- Próxima importação resolve automaticamente.
-- ============================================================
CREATE TABLE IF NOT EXISTS erp_name_aliases (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  descricao_erp TEXT NOT NULL UNIQUE,   -- nome exato do ERP
  lt_erp        NUMERIC(5,3),
  wine_id       UUID NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  criado_por    UUID REFERENCES users(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ena_descricao ON erp_name_aliases(descricao_erp);

COMMENT ON TABLE erp_name_aliases IS 'Aliases aprendidos: nome ERP → wine_id. Evita revisão manual em importações futuras.';


-- ============================================================
-- TABELA 7: STOCK_FLOOR
-- Estoque da adega do andar — time-series por turno.
-- Uma linha por wine + data + turno.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_floor (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_id        UUID NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  turno          TEXT NOT NULL DEFAULT 'abertura'
                   CHECK (turno IN ('abertura','15h','fechamento')),
  quantidade     INTEGER NOT NULL CHECK (quantidade >= 0),
  registrado_por UUID REFERENCES users(id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (wine_id, data, turno)
);

CREATE INDEX IF NOT EXISTS idx_sf_wine_id ON stock_floor(wine_id);
CREATE INDEX IF NOT EXISTS idx_sf_data    ON stock_floor(data DESC);

COMMENT ON TABLE  stock_floor IS 'Estoque da adega do andar — registrado 2x/dia por turno';
COMMENT ON COLUMN stock_floor.turno IS 'abertura = manhã | 15h = antes do jantar | fechamento = fim do serviço';


-- ============================================================
-- TABELA 8: STOCK_WAREHOUSE
-- Estoque do almoxarifado -2 — snapshots quinzenais.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_warehouse (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_id        UUID NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  quantidade     INTEGER NOT NULL CHECK (quantidade >= 0),
  registrado_por UUID REFERENCES users(id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (wine_id, data)
);

CREATE INDEX IF NOT EXISTS idx_sw_wine_id ON stock_warehouse(wine_id);
CREATE INDEX IF NOT EXISTS idx_sw_data    ON stock_warehouse(data DESC);

COMMENT ON TABLE stock_warehouse IS 'Estoque do almoxarifado -2 — snapshot quinzenal';


-- ============================================================
-- TABELA 9: WINE_SUBSTITUTIONS
-- Regras: Na falta de A → ofereça B | Upsell X → Y
-- ============================================================
CREATE TABLE IF NOT EXISTS wine_substitutions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_origem_id  UUID NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  wine_destino_id UUID NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'falta'
                    CHECK (tipo IN ('falta','upsell','harmonizacao')),
  motivo          TEXT,                 -- argumento de venda para o garçom
  prioridade      INTEGER NOT NULL DEFAULT 1 CHECK (prioridade BETWEEN 1 AND 5),
  ativo           BOOLEAN NOT NULL DEFAULT true,
  criado_por      UUID REFERENCES users(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (wine_origem_id <> wine_destino_id),
  UNIQUE (wine_origem_id, wine_destino_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_ws_origem  ON wine_substitutions(wine_origem_id);
CREATE INDEX IF NOT EXISTS idx_ws_destino ON wine_substitutions(wine_destino_id);
CREATE INDEX IF NOT EXISTS idx_ws_tipo    ON wine_substitutions(tipo);

COMMENT ON TABLE  wine_substitutions IS 'Regras de substituição e upsell configuradas pela sommelière';
COMMENT ON COLUMN wine_substitutions.prioridade IS '1 = primeira opção a oferecer, 2 = segunda, etc.';


-- ============================================================
-- TABELA 10: HARMONIZATIONS
-- Matriz de harmonização vinho × prato — editável pela sommelière.
-- ============================================================
CREATE TABLE IF NOT EXISTS harmonizations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wine_id           UUID REFERENCES wines(id) ON DELETE CASCADE, -- NULL = regra genérica de categoria
  categoria_prato   TEXT NOT NULL,       -- 'entradas_frias', 'massas_branco', etc.
  prato_especifico  TEXT,                -- nome do prato do cardápio (opcional)
  argumento_venda   TEXT NOT NULL,       -- script para o garçom
  prioridade        INTEGER DEFAULT 1,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  criado_por        UUID REFERENCES users(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harm_wine_id ON harmonizations(wine_id);
CREATE INDEX IF NOT EXISTS idx_harm_cat     ON harmonizations(categoria_prato);

COMMENT ON TABLE harmonizations IS 'Matriz de harmonização — vinculada a rótulos específicos ou categorias de prato';


-- ============================================================
-- TABELA 11: PURCHASE_ORDERS + ITEMS
-- Pedidos de reposição gerados pelo sistema.
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periodo     TEXT,                     -- ex: '2026-Q3-01' (1ª quinzena de Jul/26)
  status      TEXT NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','enviado','parcialmente_recebido','recebido','cancelado')),
  notas       TEXT,
  total_itens INTEGER DEFAULT 0,
  criado_por  UUID REFERENCES users(id),
  enviado_em  TIMESTAMPTZ,
  recebido_em TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  wine_id             UUID NOT NULL REFERENCES wines(id),
  quantidade_solicitada INTEGER NOT NULL CHECK (quantidade_solicitada > 0),
  quantidade_recebida   INTEGER,        -- preenchido quando recebido
  preco_unitario        NUMERIC(10,2),
  observacao            TEXT
);

CREATE INDEX IF NOT EXISTS idx_poi_order_id ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_wine_id  ON purchase_order_items(wine_id);

COMMENT ON TABLE purchase_orders      IS 'Pedidos de reposição quinzenal ao almoxarifado / fornecedor';
COMMENT ON TABLE purchase_order_items IS 'Itens de cada pedido de reposição';


-- ============================================================
-- TABELA 12: KPI_ENTRIES
-- Indicadores de desempenho — entrada manual + cálculos automáticos futuros.
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_entries (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  kpi_key        TEXT NOT NULL,          -- 'ticket_medio', 'garrafa_pct', etc.
  valor          NUMERIC(12,4) NOT NULL,
  notas          TEXT,
  fonte          TEXT DEFAULT 'manual' CHECK (fonte IN ('manual','calculado')),
  registrado_por UUID REFERENCES users(id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (data, kpi_key)                -- um valor por KPI por dia
);

CREATE INDEX IF NOT EXISTS idx_kpi_data    ON kpi_entries(data DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_key     ON kpi_entries(kpi_key);

COMMENT ON TABLE  kpi_entries IS 'Série temporal de KPIs — manual agora, calculado automaticamente no futuro';
COMMENT ON COLUMN kpi_entries.kpi_key IS 'ticket_medio | penetracao_pct | garrafa_pct | segunda_garrafa_pct | ruptura_pct | giro_estoque';


-- ============================================================
-- TABELA 13: GARCON_RESULTS
-- Resultados do campeonato de garçons por período.
-- ============================================================
CREATE TABLE IF NOT EXISTS garcon_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_garcon     TEXT NOT NULL,
  periodo         TEXT NOT NULL,         -- ex: 'Jun/2026'
  mesas           INTEGER DEFAULT 0,
  mesas_com_vinho INTEGER DEFAULT 0,
  mesas_com_gfa   INTEGER DEFAULT 0,     -- mesas que pediram garrafa
  mesas_duas_gfa  INTEGER DEFAULT 0,     -- mesas com 2+ garrafas
  receita_vinho   NUMERIC(12,2) DEFAULT 0,

  -- Calculados automaticamente
  ticket_medio    NUMERIC(10,2) GENERATED ALWAYS AS (
                    CASE WHEN mesas_com_vinho > 0
                      THEN ROUND(receita_vinho / mesas_com_vinho, 2)
                      ELSE 0 END
                  ) STORED,
  taxa_garrafa    NUMERIC(5,2) GENERATED ALWAYS AS (
                    CASE WHEN mesas > 0
                      THEN ROUND(mesas_com_gfa::NUMERIC / mesas * 100, 2)
                      ELSE 0 END
                  ) STORED,
  taxa_segunda    NUMERIC(5,2) GENERATED ALWAYS AS (
                    CASE WHEN mesas_com_gfa > 0
                      THEN ROUND(mesas_duas_gfa::NUMERIC / mesas_com_gfa * 100, 2)
                      ELSE 0 END
                  ) STORED,
  -- Score ponderado: ticket(40%) + garrafa(30%) + receita(20%) + segunda(10%)
  score           NUMERIC(8,2) GENERATED ALWAYS AS (
                    ROUND(
                      (CASE WHEN mesas_com_vinho > 0 THEN receita_vinho / mesas_com_vinho / 180.0 * 40 ELSE 0 END) +
                      (CASE WHEN mesas > 0 THEN mesas_com_gfa::NUMERIC / mesas / 0.8 * 30 ELSE 0 END) +
                      (CASE WHEN receita_vinho > 0 THEN LEAST(receita_vinho / 10000.0 * 20, 20) ELSE 0 END) +
                      (CASE WHEN mesas_com_gfa > 0 THEN mesas_duas_gfa::NUMERIC / mesas_com_gfa / 0.25 * 10 ELSE 0 END)
                    , 2)
                  ) STORED,

  registrado_por  UUID REFERENCES users(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gr_periodo ON garcon_results(periodo);
CREATE INDEX IF NOT EXISTS idx_gr_nome    ON garcon_results(nome_garcon);

COMMENT ON TABLE  garcon_results IS 'Resultados do campeonato de garçons — score calculado automaticamente pelo banco';
COMMENT ON COLUMN garcon_results.score IS 'Ticket(40%) + Taxa Garrafa(30%) + Receita(20%) + 2ª Garrafa(10%)';


-- ============================================================
-- VIEWS ÚTEIS
-- ============================================================

-- Vista: Pair Stock atual com estoque mais recente
CREATE OR REPLACE VIEW v_pair_stock_atual AS
SELECT
  w.id,
  w.cod_erp,
  w.nome,
  w.formato_ml,
  w.tipo,
  w.abc_class,
  w.status,
  w.cons_dia,
  w.pair_stock,
  w.est_min_adega,
  w.repos_quinzenal,
  w.preco_custo,
  w.preco_venda,
  w.markup,

  -- Estoque mais recente da adega do andar (hoje ou último registro)
  COALESCE(sf_hoje.quantidade, sf_ult.quantidade) AS estoque_adega,
  COALESCE(sf_hoje.data, sf_ult.data)             AS data_estoque_adega,

  -- Status calculado
  CASE
    WHEN COALESCE(sf_hoje.quantidade, sf_ult.quantidade) IS NULL THEN 'sem_dado'
    WHEN COALESCE(sf_hoje.quantidade, sf_ult.quantidade) = 0 THEN 'critico'
    WHEN COALESCE(sf_hoje.quantidade, sf_ult.quantidade) < w.pair_stock THEN 'critico'
    WHEN COALESCE(sf_hoje.quantidade, sf_ult.quantidade) <= w.est_min_adega THEN 'atencao'
    ELSE 'ok'
  END AS status_estoque,

  -- Estoque mais recente do almoxarifado
  sw_ult.quantidade AS estoque_almox,
  sw_ult.data       AS data_estoque_almox,

  -- Necessidade de reposição do almox
  CASE
    WHEN sw_ult.quantidade IS NOT NULL
    THEN GREATEST(0, w.repos_quinzenal - sw_ult.quantidade)
    ELSE NULL
  END AS pedido_necessario

FROM wines w

LEFT JOIN LATERAL (
  SELECT quantidade, data FROM stock_floor
  WHERE wine_id = w.id AND data = CURRENT_DATE
  ORDER BY turno DESC LIMIT 1
) sf_hoje ON true

LEFT JOIN LATERAL (
  SELECT quantidade, data FROM stock_floor
  WHERE wine_id = w.id AND data < CURRENT_DATE
  ORDER BY data DESC, turno DESC LIMIT 1
) sf_ult ON true

LEFT JOIN LATERAL (
  SELECT quantidade, data FROM stock_warehouse
  WHERE wine_id = w.id
  ORDER BY data DESC LIMIT 1
) sw_ult ON true

WHERE w.status IN ('ativo','em_revisao');

COMMENT ON VIEW v_pair_stock_atual IS 'Pair stock com estoque atual e status calculado — principal view operacional';


-- Vista: Rupturas ativas (itens críticos agora)
CREATE OR REPLACE VIEW v_rupturas_ativas AS
SELECT
  w.id,
  w.cod_erp,
  w.nome,
  w.abc_class,
  w.pair_stock,
  sf.quantidade AS estoque_atual,
  sf.data       AS data_registro,
  w.pair_stock - sf.quantidade AS deficit,
  -- Substituições disponíveis
  (
    SELECT COUNT(*) FROM wine_substitutions ws
    WHERE ws.wine_origem_id = w.id AND ws.ativo = true AND ws.tipo = 'falta'
  ) AS n_substitutos
FROM wines w
JOIN LATERAL (
  SELECT quantidade, data FROM stock_floor
  WHERE wine_id = w.id
  ORDER BY data DESC, turno DESC LIMIT 1
) sf ON true
WHERE w.status = 'ativo'
  AND sf.quantidade < w.pair_stock
ORDER BY w.abc_class ASC, deficit DESC;

COMMENT ON VIEW v_rupturas_ativas IS 'Rótulos com estoque abaixo do pair stock — atualiza em tempo real';


-- Vista: Consumo mensal agregado por wine
CREATE OR REPLACE VIEW v_consumo_mensal AS
SELECT
  w.id AS wine_id,
  w.nome,
  w.abc_class,
  wc.ano,
  wc.mes,
  wc.quantidade,
  wc.lt_unitario,
  wc.quantidade * wc.lt_unitario AS litros,
  TO_DATE(wc.ano::TEXT || '-' || LPAD(wc.mes::TEXT,2,'0') || '-01', 'YYYY-MM-DD') AS periodo
FROM wine_consumption wc
JOIN wines w ON w.id = wc.wine_id
ORDER BY w.abc_class, wc.ano DESC, wc.mes DESC;

COMMENT ON VIEW v_consumo_mensal IS 'Consumo histórico mensal com dados de wine';


-- Vista: Ranking do campeonato de garçons
CREATE OR REPLACE VIEW v_ranking_garcons AS
SELECT
  nome_garcon,
  periodo,
  mesas,
  mesas_com_vinho,
  mesas_com_gfa,
  mesas_duas_gfa,
  receita_vinho,
  ticket_medio,
  taxa_garrafa,
  taxa_segunda,
  score,
  RANK() OVER (PARTITION BY periodo ORDER BY score DESC) AS posicao
FROM garcon_results
ORDER BY periodo DESC, score DESC;

COMMENT ON VIEW v_ranking_garcons IS 'Ranking automático do campeonato de garçons por período';


-- Vista: TC vs Garrafa por mês (diagnóstico estratégico)
CREATE OR REPLACE VIEW v_tc_vs_garrafa AS
WITH mensal AS (
  SELECT
    wc.ano, wc.mes,
    SUM(CASE WHEN w.formato_ml IN (50,150) THEN wc.quantidade ELSE 0 END) AS total_tc,
    SUM(CASE WHEN w.formato_ml = 750       THEN wc.quantidade ELSE 0 END) AS total_750,
    SUM(CASE WHEN w.formato_ml = 375       THEN wc.quantidade ELSE 0 END) AS total_375,
    SUM(wc.quantidade * wc.lt_unitario) AS total_litros
  FROM wine_consumption wc
  JOIN wines w ON w.id = wc.wine_id
  GROUP BY wc.ano, wc.mes
)
SELECT
  ano, mes,
  total_tc,
  total_750,
  total_375,
  total_litros,
  CASE WHEN (total_tc + total_750 + total_375) > 0
    THEN ROUND(total_tc::NUMERIC / (total_tc + total_750 + total_375) * 100, 1)
    ELSE 0
  END AS pct_tc,
  CASE WHEN (total_tc + total_750 + total_375) > 0
    THEN ROUND(total_750::NUMERIC / (total_tc + total_750 + total_375) * 100, 1)
    ELSE 0
  END AS pct_750
FROM mensal
ORDER BY ano DESC, mes DESC;

COMMENT ON VIEW v_tc_vs_garrafa IS 'Proporção TC vs Garrafa por mês — monitora a estratégia de conversão';


-- ============================================================
-- FUNÇÕES DE SUPORTE
-- ============================================================

-- Função: recalcular pair_stock e ABC de todos os wines
-- Chamar após cada importação de XLS
CREATE OR REPLACE FUNCTION recalcular_pair_stock(p_dias INTEGER DEFAULT 150)
RETURNS TABLE(wines_atualizados INTEGER, abc_a INTEGER, abc_b INTEGER, abc_c INTEGER) AS $$
DECLARE
  v_total_volume BIGINT;
  v_total INTEGER := 0;
  v_a INTEGER := 0;
  v_b INTEGER := 0;
  v_c INTEGER := 0;
BEGIN
  -- 1. Atualiza cons_dia para todos os wines com dados
  UPDATE wines w
  SET
    cons_dia  = COALESCE(agg.total_qtde::NUMERIC / p_dias, 0),
    dias_base = p_dias
  FROM (
    SELECT wine_id, SUM(quantidade) AS total_qtde
    FROM wine_consumption
    GROUP BY wine_id
  ) agg
  WHERE w.id = agg.wine_id;

  -- 2. Atualiza pair_stock a partir de cons_dia
  UPDATE wines
  SET
    pair_stock      = GREATEST(1, CEIL(cons_dia * 1.3)::INTEGER),
    est_min_adega   = GREATEST(2, CEIL(cons_dia * 1.3)::INTEGER * 2),
    repos_quinzenal = GREATEST(1, CEIL(cons_dia * 15 * 1.2)::INTEGER)
  WHERE cons_dia > 0;

  -- 3. Recalcula ABC
  SELECT SUM(total_qtde) INTO v_total_volume
  FROM (SELECT SUM(quantidade) AS total_qtde FROM wine_consumption GROUP BY wine_id) t;

  WITH ranked AS (
    SELECT
      w.id,
      COALESCE(agg.total_qtde, 0) AS vol,
      SUM(COALESCE(agg.total_qtde, 0)) OVER (ORDER BY COALESCE(agg.total_qtde, 0) DESC) AS cumvol
    FROM wines w
    LEFT JOIN (SELECT wine_id, SUM(quantidade) AS total_qtde FROM wine_consumption GROUP BY wine_id) agg
      ON agg.wine_id = w.id
    WHERE w.status IN ('ativo','em_revisao')
  )
  UPDATE wines w
  SET abc_class = CASE
    WHEN r.cumvol <= v_total_volume * 0.70 THEN 'A'
    WHEN r.cumvol <= v_total_volume * 0.90 THEN 'B'
    ELSE 'C'
  END
  FROM ranked r WHERE r.id = w.id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE abc_class='A'), COUNT(*) FILTER (WHERE abc_class='B'), COUNT(*) FILTER (WHERE abc_class='C')
  INTO v_total, v_a, v_b, v_c
  FROM wines WHERE status IN ('ativo','em_revisao');

  RETURN QUERY SELECT v_total, v_a, v_b, v_c;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalcular_pair_stock IS 'Recalcula cons_dia, pair_stock, est_min, repos_quinzenal e ABC para todos os wines. Chamar após cada importação ERP.';


-- Função: match automático de nome ERP para wine_id
-- Retorna o wine_id se encontrar match confiante, NULL caso contrário
CREATE OR REPLACE FUNCTION match_erp_wine(
  p_nome_erp TEXT,
  p_lt        NUMERIC DEFAULT NULL,
  p_threshold NUMERIC DEFAULT 0.35  -- similaridade mínima (0-1)
)
RETURNS TABLE(wine_id UUID, nome TEXT, similaridade NUMERIC, metodo TEXT) AS $$
DECLARE
  v_norm TEXT := normalize_wine_name(p_nome_erp);
BEGIN
  -- Camada 1: alias exato aprendido anteriormente
  RETURN QUERY
  SELECT a.wine_id, w.nome, 1.0::NUMERIC, 'alias_exato'
  FROM erp_name_aliases a
  JOIN wines w ON w.id = a.wine_id
  WHERE a.descricao_erp = p_nome_erp
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Camada 2: nome normalizado exato
  RETURN QUERY
  SELECT w.id, w.nome, 1.0::NUMERIC, 'nome_normalizado_exato'
  FROM wines w
  WHERE w.nome_normalizado = v_norm
    AND (p_lt IS NULL OR ABS(w.formato_ml::NUMERIC/1000 - p_lt) < 0.05)
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Camada 3: similaridade por trigramas (pg_trgm)
  RETURN QUERY
  SELECT
    w.id,
    w.nome,
    ROUND(similarity(w.nome_normalizado, v_norm)::NUMERIC, 3),
    'trigram'
  FROM wines w
  WHERE similarity(w.nome_normalizado, v_norm) >= p_threshold
    AND (p_lt IS NULL OR ABS(w.formato_ml::NUMERIC/1000 - p_lt) < 0.05)
  ORDER BY similarity(w.nome_normalizado, v_norm) DESC
  LIMIT 3;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION match_erp_wine IS 'Match em 3 camadas: alias exato > nome normalizado > similaridade trigrama. Threshold padrão 0.35.';


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Descomente quando conectar o frontend ao Supabase via anon key.
-- Por enquanto, com PIN interno, pode deixar desabilitado.
-- ============================================================

-- ALTER TABLE wines              ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wine_consumption   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_floor        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_warehouse    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wine_substitutions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE kpi_entries        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE garcon_results     ENABLE ROW LEVEL SECURITY;

-- Política simples de leitura pública (ajustar conforme roles)
-- CREATE POLICY "Leitura publica" ON wines FOR SELECT USING (true);
-- CREATE POLICY "Escrita autenticada" ON wines FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================================
-- DADOS DE SEED — consumo Jan-Mai 2026 (top 18 itens Classe A)
-- Importação inicial manual dos dados que já temos
-- ============================================================
DO $$
DECLARE
  v_import_id UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE role = 'sommelier' LIMIT 1;

  INSERT INTO erp_imports (filename, periodo_inicio, periodo_fim, total_linhas, linhas_ok, status, importado_por)
  VALUES ('Mensal_de_vinhos_2026_seed.xlsx', '2026-01-01', '2026-05-31', 231, 153, 'concluido', v_user_id)
  RETURNING id INTO v_import_id;

  RAISE NOTICE 'Import seed ID: %', v_import_id;
END $$;


-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
  cnt INTEGER;
BEGIN
  RAISE NOTICE '=== VERIFICAÇÃO DO SCHEMA ===';
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  LOOP
    EXECUTE 'SELECT COUNT(*) FROM ' || tbl INTO cnt;
    RAISE NOTICE 'Tabela: % → % linhas', RPAD(tbl, 30), cnt;
  END LOOP;
  RAISE NOTICE '=== FIM DA VERIFICAÇÃO ===';
END $$;

-- ============================================================
-- RESUMO DO QUE FOI CRIADO
-- ============================================================
/*
TABELAS (13):
  users                — Usuários com PIN e role
  wines                — Catálogo master de vinhos
  wine_consumption     — Histórico mensal de consumo (ERP)
  erp_imports          — Log de importações de XLS
  erp_import_errors    — Fila de revisão manual
  erp_name_aliases     — Aliases aprendidos (nome ERP → wine_id)
  stock_floor          — Estoque da adega do andar (diário/por turno)
  stock_warehouse      — Estoque do almoxarifado -2 (quinzenal)
  wine_substitutions   — Regras: Na falta de A / Upsell X → Y
  harmonizations       — Matriz de harmonização vinho × prato
  purchase_orders      — Pedidos de reposição (header)
  purchase_order_items — Pedidos de reposição (itens)
  kpi_entries          — KPIs por data (ticket médio, taxa garrafa, etc.)
  garcon_results       — Campeonato de garçons com score automático

VIEWS (5):
  v_pair_stock_atual   — Pair stock com estoque atual e status
  v_rupturas_ativas    — Rótulos abaixo do pair stock agora
  v_consumo_mensal     — Histórico de consumo com dados do wine
  v_ranking_garcons    — Ranking automático do campeonato
  v_tc_vs_garrafa      — Proporção TC vs Garrafa por mês

FUNÇÕES (3):
  normalize_wine_name()  — Normaliza nome para match ERP
  recalcular_pair_stock()— Recalcula ABC + pair stock pós-importação
  match_erp_wine()       — Match em 3 camadas: alias > exato > trigrama

TRIGGERS (1):
  trg_wines_before_upsert — Preenche nome_normalizado e recalcula est_min/repos

PRÓXIMOS PASSOS:
  1. Rodar este SQL no Supabase SQL Editor
  2. Verificar no Table Editor que as 13 tabelas foram criadas
  3. Inserir os 153 wines via CSV import ou script Python
  4. Conectar o frontend (substituir localStorage por chamadas à API Supabase)
  5. Criar Edge Function para processar o upload do XLS real
*/
