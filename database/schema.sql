-- =============================================================================
-- Fato ou Farsa — banco de dados PostgreSQL
-- =============================================================================
-- Requer PostgreSQL 13+ (gen_random_uuid() já vem embutido).
--
-- Como rodar:
--   createdb fatooufarsa
--   psql -d fatooufarsa -f database/schema.sql
--
-- O script pode ser executado de novo: ele apaga e recria o schema "fatooufarsa".
-- As tabelas do próprio Django (auth_user, django_session, django_admin_log...)
-- não estão aqui: são criadas pelo "python manage.py migrate".
--
-- Convenções:
--   * nomes em português, snake_case;
--   * datas em TIMESTAMPTZ (o app usa America/Sao_Paulo);
--   * métricas do TikTok aceitam NULL de propósito: NULL = "indisponível",
--     0 = "zero de verdade". O app trata os dois casos de forma diferente.
-- =============================================================================

DROP SCHEMA IF EXISTS fatooufarsa CASCADE;
CREATE SCHEMA fatooufarsa;
SET search_path TO fatooufarsa, public;


-- -----------------------------------------------------------------------------
-- Função genérica para manter a coluna atualizado_em
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. TABELAS DE REFERÊNCIA (domínios usados pelo app)
-- =============================================================================

-- As 5 classificações do "Resultado da análise"
CREATE TABLE classificacoes_resultado (
    codigo        VARCHAR(40)  PRIMARY KEY,
    rotulo        VARCHAR(120) NOT NULL UNIQUE,   -- texto exato usado no app
    rotulo_curto  VARCHAR(60)  NOT NULL,
    descricao     TEXT         NOT NULL,
    gravidade     SMALLINT     NOT NULL CHECK (gravidade BETWEEN 0 AND 4),
    ordem         SMALLINT     NOT NULL
);

-- Vereditos das afirmações. Existem duas escalas no projeto:
--   'rapida'    -> usada pelo servidor Node (Falso, Enganoso, ...)
--   'detalhada' -> usada pelo Django (Confirmada pelas evidências consultadas, ...)
CREATE TABLE vereditos (
    codigo        VARCHAR(40)  PRIMARY KEY,
    rotulo        VARCHAR(120) NOT NULL,
    escala        VARCHAR(20)  NOT NULL CHECK (escala IN ('rapida', 'detalhada')),
    indica_risco  BOOLEAN      NOT NULL DEFAULT FALSE,
    ordem         SMALLINT     NOT NULL,
    UNIQUE (escala, rotulo)
);

-- Categorias de tema das afirmações (Saúde, Finanças, ...)
CREATE TABLE categorias_tema (
    codigo  VARCHAR(30) PRIMARY KEY,
    rotulo  VARCHAR(60) NOT NULL UNIQUE
);

-- Instituições usadas como fonte (órgãos oficiais, agências de checagem...)
CREATE TABLE fontes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome       VARCHAR(200) NOT NULL UNIQUE,
    sigla      VARCHAR(30),
    tipo       VARCHAR(30)  NOT NULL
               CHECK (tipo IN ('orgao_oficial', 'sociedade_cientifica', 'agencia_checagem', 'imprensa', 'outro')),
    site_url   VARCHAR(1000),
    ativo      BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Links mostrados em "Como denunciar"
CREATE TABLE canais_denuncia (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    titulo     VARCHAR(200)  NOT NULL,
    descricao  TEXT,
    url        VARCHAR(1000) NOT NULL,
    ordem      SMALLINT      NOT NULL DEFAULT 0,
    ativo      BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Versões dos Termos de Uso e da Política de Privacidade
CREATE TABLE documentos_legais (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('termos', 'privacidade')),
    versao        VARCHAR(20) NOT NULL,
    caminho       VARCHAR(100) NOT NULL,          -- /terms ou /privacy
    publicado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente       BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE (tipo, versao)
);
-- só uma versão vigente por tipo
CREATE UNIQUE INDEX ux_documentos_legais_vigente ON documentos_legais (tipo) WHERE vigente;

-- Configurações do sistema que não são segredo (chaves de API ficam no .env)
CREATE TABLE configuracoes (
    chave          VARCHAR(80) PRIMARY KEY,
    valor          TEXT        NOT NULL,
    descricao      TEXT,
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_configuracoes_atualizado
    BEFORE UPDATE ON configuracoes FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();


-- =============================================================================
-- 2. VISITANTES E PREFERÊNCIAS
-- =============================================================================
-- O site não tem login. Cada navegador recebe um identificador anônimo, usado
-- para guardar o histórico de análises e as preferências da tela Configurações.

CREATE TABLE visitantes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acesso_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent        VARCHAR(500),
    ip_hash           CHAR(64)                 -- SHA-256 do IP (nunca o IP puro — LGPD)
);

-- Tela Configurações: tema (claro/escuro/sistema) e "Reduzir animações"
CREATE TABLE preferencias (
    visitante_id        UUID        PRIMARY KEY REFERENCES visitantes (id) ON DELETE CASCADE,
    tema                VARCHAR(10) NOT NULL DEFAULT 'light' CHECK (tema IN ('light', 'dark', 'auto')),
    reduzir_animacoes   BOOLEAN     NOT NULL DEFAULT FALSE,
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_preferencias_atualizado
    BEFORE UPDATE ON preferencias FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- Registro de aceite dos Termos / Política de Privacidade
CREATE TABLE aceites_documentos (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visitante_id  UUID   NOT NULL REFERENCES visitantes (id) ON DELETE CASCADE,
    documento_id  BIGINT NOT NULL REFERENCES documentos_legais (id),
    aceito_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (visitante_id, documento_id)
);

-- Pedidos do titular de dados (LGPD art. 18: acesso, correção, exclusão...)
CREATE TABLE solicitacoes_lgpd (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visitante_id   UUID REFERENCES visitantes (id) ON DELETE SET NULL,
    email_contato  VARCHAR(254) NOT NULL,
    tipo           VARCHAR(20)  NOT NULL
                   CHECK (tipo IN ('acesso', 'correcao', 'exclusao', 'portabilidade', 'revogacao', 'outro')),
    mensagem       TEXT,
    status         VARCHAR(20)  NOT NULL DEFAULT 'aberta'
                   CHECK (status IN ('aberta', 'em_andamento', 'concluida', 'recusada')),
    resposta       TEXT,
    criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    concluido_em   TIMESTAMPTZ,
    CHECK (concluido_em IS NULL OR concluido_em >= criado_em)
);


-- =============================================================================
-- 3. DADOS DO TIKTOK (perfis e vídeos)
-- =============================================================================

CREATE TABLE perfis_tiktok (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username             VARCHAR(150) NOT NULL,          -- sem o @
    nome_exibicao        VARCHAR(255) NOT NULL DEFAULT '',
    avatar_url           VARCHAR(1000),
    verificado           BOOLEAN      NOT NULL DEFAULT FALSE,
    seguidores           BIGINT       CHECK (seguidores >= 0),
    seguindo             BIGINT       CHECK (seguindo >= 0),
    curtidas_recebidas   BIGINT       CHECK (curtidas_recebidas >= 0),
    total_videos         INTEGER      CHECK (total_videos >= 0),
    biografia            TEXT         NOT NULL DEFAULT '',
    categoria            VARCHAR(100) NOT NULL DEFAULT 'Geral',
    perfil_url           VARCHAR(1000),
    data_entrada         VARCHAR(20),                     -- o TikTok às vezes só informa o ano
    ficticio             BOOLEAN      NOT NULL DEFAULT FALSE,  -- perfis dos exemplos
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (username <> '' AND username NOT LIKE '@%')
);
CREATE UNIQUE INDEX ux_perfis_tiktok_username ON perfis_tiktok (lower(username));
CREATE TRIGGER trg_perfis_tiktok_atualizado
    BEFORE UPDATE ON perfis_tiktok FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TABLE videos_tiktok (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    perfil_id           BIGINT       NOT NULL REFERENCES perfis_tiktok (id) ON DELETE CASCADE,
    video_id_externo    VARCHAR(100) NOT NULL,            -- ID do TikTok
    shortcode           VARCHAR(100),
    formato             VARCHAR(20)  NOT NULL DEFAULT 'video'
                        CHECK (formato IN ('video', 'photo_carousel', 'livestream_clip')),
    legenda             TEXT         NOT NULL DEFAULT '',
    transcricao         TEXT,
    titulo_som          VARCHAR(255),
    publicado_em        TIMESTAMPTZ,
    data_formatada      VARCHAR(50),
    duracao_segundos    INTEGER      CHECK (duracao_segundos >= 0),
    url                 VARCHAR(1000),
    thumbnail_url       VARCHAR(1000),
    criado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (perfil_id, video_id_externo)
);
CREATE INDEX ix_videos_tiktok_publicado ON videos_tiktok (perfil_id, publicado_em DESC);
CREATE TRIGGER trg_videos_tiktok_atualizado
    BEFORE UPDATE ON videos_tiktok FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();


-- =============================================================================
-- 4. EXEMPLOS DA PÁGINA INICIAL
-- =============================================================================

CREATE TABLE cenarios_demonstracao (
    id                 VARCHAR(50)  PRIMARY KEY,          -- 'saude_vital', 'tech_investimentos'...
    perfil_id          BIGINT       NOT NULL REFERENCES perfis_tiktok (id) ON DELETE CASCADE,
    categoria_exibida  VARCHAR(100) NOT NULL,
    etiqueta           VARCHAR(100) NOT NULL,             -- ex.: "Cura milagrosa em 48h"
    avaliacao_padrao   JSONB,                             -- resultado pronto do exemplo (presetAiResult)
    ordem              SMALLINT     NOT NULL DEFAULT 0,
    ativo              BOOLEAN      NOT NULL DEFAULT TRUE
);


-- =============================================================================
-- 5. INTEGRAÇÃO POSTZEN (contas TikTok autorizadas, somente leitura)
-- =============================================================================

CREATE TABLE postzen_perfis (
    id                 VARCHAR(100) PRIMARY KEY,          -- profileId do PostZen
    nome               VARCHAR(200) NOT NULL,
    descricao          TEXT         NOT NULL DEFAULT '',
    padrao             BOOLEAN      NOT NULL DEFAULT FALSE,
    criado_no_postzen  TIMESTAMPTZ,
    sincronizado_em    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE postzen_contas (
    id                     VARCHAR(100) PRIMARY KEY,      -- accountId do PostZen
    postzen_perfil_id      VARCHAR(100) REFERENCES postzen_perfis (id) ON DELETE SET NULL,
    perfil_tiktok_id       BIGINT       REFERENCES perfis_tiktok (id) ON DELETE SET NULL,
    plataforma             VARCHAR(20)  NOT NULL DEFAULT 'tiktok' CHECK (plataforma = 'tiktok'),
    username               VARCHAR(150) NOT NULL,
    nome_exibicao          VARCHAR(255) NOT NULL DEFAULT '',
    foto_url               VARCHAR(1000),
    tipo_conexao           VARCHAR(30)  NOT NULL
                           CHECK (tipo_conexao IN ('tiktok_business', 'earlier_connection')),
    rotulo_conexao         VARCHAR(100),
    status_token           VARCHAR(10)  NOT NULL DEFAULT 'active'
                           CHECK (status_token IN ('active', 'expired', 'revoked')),
    ativa                  BOOLEAN      NOT NULL DEFAULT TRUE,
    requer_reconexao       BOOLEAN      NOT NULL DEFAULT FALSE,
    -- o que a conta permite ler (PostZenAccountCapabilities)
    pode_metricas_basicas  BOOLEAN      NOT NULL DEFAULT TRUE,
    pode_metricas_business BOOLEAN      NOT NULL DEFAULT FALSE,
    pode_insights_conta    BOOLEAN      NOT NULL DEFAULT FALSE,
    pode_comentarios       BOOLEAN      NOT NULL DEFAULT FALSE,
    pode_seguidores        BOOLEAN      NOT NULL DEFAULT FALSE,
    somente_leitura        BOOLEAN      NOT NULL DEFAULT TRUE,
    orientacao             TEXT,
    conectada_em           TIMESTAMPTZ,
    sincronizado_em        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_postzen_contas_username ON postzen_contas (lower(username));

CREATE TABLE postzen_conta_permissoes (
    conta_id   VARCHAR(100) NOT NULL REFERENCES postzen_contas (id) ON DELETE CASCADE,
    permissao  VARCHAR(100) NOT NULL,
    PRIMARY KEY (conta_id, permissao)
);

-- "state" do OAuth (hoje fica em memória e se perde ao reiniciar o servidor).
-- Expira em 10 minutos e só pode ser usado uma vez.
CREATE TABLE postzen_oauth_states (
    state              VARCHAR(200) PRIMARY KEY,
    postzen_perfil_id  VARCHAR(100),
    conta_id           VARCHAR(100),                      -- preenchido em reconexão
    redirect_url       VARCHAR(1000),
    visitante_id       UUID REFERENCES visitantes (id) ON DELETE SET NULL,
    criado_em          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_em          TIMESTAMPTZ  NOT NULL DEFAULT now() + INTERVAL '10 minutes',
    consumido_em       TIMESTAMPTZ,
    CHECK (expira_em > criado_em)
);
CREATE INDEX ix_postzen_oauth_states_expira ON postzen_oauth_states (expira_em) WHERE consumido_em IS NULL;

-- Resultado de cada retorno do OAuth (/api/integrations/postzen/connect/callback/)
CREATE TABLE postzen_oauth_retornos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    state               VARCHAR(200),
    sucesso             BOOLEAN     NOT NULL,
    codigo_erro         VARCHAR(60),       -- access_denied, missing_tiktok_permissions, expired_state...
    mensagem            TEXT,
    username            VARCHAR(150),
    qtd_contas_tiktok   INTEGER     CHECK (qtd_contas_tiktok >= 0),
    recebido_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Métricas por publicação (GET /v1/analytics)
CREATE TABLE postzen_publicacoes (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conta_id                    VARCHAR(100) NOT NULL REFERENCES postzen_contas (id) ON DELETE CASCADE,
    post_id_externo             VARCHAR(100) NOT NULL,
    video_id                    BIGINT       REFERENCES videos_tiktok (id) ON DELETE SET NULL,
    titulo                      TEXT         NOT NULL DEFAULT '',
    publicado_em                TIMESTAMPTZ,
    permalink                   VARCHAR(1000),
    visualizacoes               BIGINT        CHECK (visualizacoes >= 0),
    curtidas                    BIGINT        CHECK (curtidas >= 0),
    comentarios                 BIGINT        CHECK (comentarios >= 0),
    compartilhamentos           BIGINT        CHECK (compartilhamentos >= 0),
    taxa_engajamento            NUMERIC(9,4),
    alcance                     BIGINT        CHECK (alcance >= 0),
    salvamentos                 BIGINT        CHECK (salvamentos >= 0),
    tempo_medio_assistido_ms    BIGINT        CHECK (tempo_medio_assistido_ms >= 0),
    tempo_total_assistido_ms    BIGINT        CHECK (tempo_total_assistido_ms >= 0),
    taxa_conclusao              NUMERIC(7,4),
    novos_seguidores            BIGINT,
    insights                    JSONB,
    sincronizado_em             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (conta_id, post_id_externo)
);

-- Insights da conta (GET /v1/analytics/account-insights)
CREATE TABLE postzen_insights_conta (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conta_id                  VARCHAR(100) NOT NULL REFERENCES postzen_contas (id) ON DELETE CASCADE,
    suportado                 BOOLEAN      NOT NULL,
    codigo_motivo             VARCHAR(60),         -- ex.: platformUnsupported
    mensagem                  TEXT,
    aviso_minimo_seguidores   TEXT,                -- dados demográficos exigem 100+ seguidores
    disponibilidade           JSONB,
    insights                  JSONB,
    periodo_inicio            DATE,
    periodo_fim               DATE,
    sincronizado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (periodo_fim IS NULL OR periodo_inicio IS NULL OR periodo_fim >= periodo_inicio)
);
CREATE INDEX ix_postzen_insights_conta ON postzen_insights_conta (conta_id, sincronizado_em DESC);

-- Evolução de seguidores (GET /v1/accounts/follower-stats)
CREATE TABLE postzen_seguidores_historico (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conta_id          VARCHAR(100) NOT NULL REFERENCES postzen_contas (id) ON DELETE CASCADE,
    data              DATE         NOT NULL,
    granularidade     VARCHAR(10)  NOT NULL DEFAULT 'day' CHECK (granularidade IN ('day', 'week', 'month')),
    seguidores        BIGINT       CHECK (seguidores >= 0),
    variacao_liquida  BIGINT,
    sincronizado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (conta_id, data, granularidade)
);

-- Comentários (GET /v1/inbox/comments) — só leitura, só contas TikTok for Business
CREATE TABLE postzen_comentarios (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comentario_id_ext   VARCHAR(100) NOT NULL,
    conta_id            VARCHAR(100) NOT NULL REFERENCES postzen_contas (id) ON DELETE CASCADE,
    post_id_externo     VARCHAR(100) NOT NULL,
    autor_nome          VARCHAR(255) NOT NULL DEFAULT '',
    autor_handle        VARCHAR(150) NOT NULL DEFAULT '',
    texto               TEXT         NOT NULL DEFAULT '',
    criado_no_tiktok    TIMESTAMPTZ,
    curtidas            BIGINT       CHECK (curtidas >= 0),
    respostas           BIGINT       CHECK (respostas >= 0),
    sincronizado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (conta_id, comentario_id_ext)
);
CREATE INDEX ix_postzen_comentarios_post ON postzen_comentarios (conta_id, post_id_externo);


-- =============================================================================
-- 6. ANÁLISES (o "relatório" de um perfil/vídeo)
-- =============================================================================

CREATE TABLE analises (
    id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                 VARCHAR(100) NOT NULL UNIQUE,     -- id usado no front (report_xxx)
    visitante_id           UUID         REFERENCES visitantes (id) ON DELETE SET NULL,
    perfil_id              BIGINT       REFERENCES perfis_tiktok (id) ON DELETE SET NULL,
    cenario_demo_id        VARCHAR(50)  REFERENCES cenarios_demonstracao (id) ON DELETE SET NULL,
    postzen_conta_id       VARCHAR(100) REFERENCES postzen_contas (id) ON DELETE SET NULL,
    entrada_original       VARCHAR(500) NOT NULL DEFAULT '',  -- o que o usuário digitou
    url_enviada            VARCHAR(1000),
    transcricao_enviada    TEXT,                              -- texto colado manualmente
    origem_dados           VARCHAR(20)  NOT NULL
                           CHECK (origem_dados IN ('postzen_api', 'sandbox_dataset', 'manual_input')),
    eh_demo                BOOLEAN      NOT NULL DEFAULT FALSE,
    mensagem_status        TEXT,
    dados_coletados_em     TIMESTAMPTZ,
    criado_em              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    excluido_em            TIMESTAMPTZ,                       -- "Apagar histórico" (exclusão lógica)
    CHECK (cenario_demo_id IS NULL OR eh_demo)                -- exemplo é sempre demo
);
CREATE INDEX ix_analises_visitante ON analises (visitante_id, criado_em DESC) WHERE excluido_em IS NULL;
CREATE INDEX ix_analises_perfil    ON analises (perfil_id, criado_em DESC);
CREATE INDEX ix_analises_criado    ON analises (criado_em DESC);

-- Fotografia dos números do perfil no momento da análise
CREATE TABLE analise_perfil_snapshot (
    analise_id          UUID   PRIMARY KEY REFERENCES analises (id) ON DELETE CASCADE,
    seguidores          BIGINT CHECK (seguidores >= 0),
    seguindo            BIGINT CHECK (seguindo >= 0),
    curtidas_recebidas  BIGINT CHECK (curtidas_recebidas >= 0),
    total_videos        INTEGER CHECK (total_videos >= 0),
    verificado          BOOLEAN,
    biografia           TEXT
);

-- Vídeos que entraram na análise, com as métricas daquele momento
CREATE TABLE analise_videos (
    analise_id          UUID     NOT NULL REFERENCES analises (id) ON DELETE CASCADE,
    video_id            BIGINT   NOT NULL REFERENCES videos_tiktok (id) ON DELETE CASCADE,
    ordem               SMALLINT NOT NULL DEFAULT 0,
    visualizacoes       BIGINT   CHECK (visualizacoes >= 0),
    curtidas            BIGINT   CHECK (curtidas >= 0),
    comentarios         BIGINT   CHECK (comentarios >= 0),
    compartilhamentos   BIGINT   CHECK (compartilhamentos >= 0),
    salvamentos         BIGINT   CHECK (salvamentos >= 0),
    fora_do_padrao      BOOLEAN  NOT NULL DEFAULT FALSE,      -- outlier pelo IQR
    pontuacao_anomalia  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (pontuacao_anomalia BETWEEN 0 AND 100),
    notas_evidencia     TEXT,
    PRIMARY KEY (analise_id, video_id)
);
CREATE INDEX ix_analise_videos_video ON analise_videos (video_id);

-- Sinais de suspeita marcados em cada vídeo (suspicionFlags)
CREATE TABLE analise_video_sinais (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise_id  UUID   NOT NULL,
    video_id    BIGINT NOT NULL,
    sinal       VARCHAR(255) NOT NULL,
    FOREIGN KEY (analise_id, video_id) REFERENCES analise_videos (analise_id, video_id) ON DELETE CASCADE,
    UNIQUE (analise_id, video_id, sinal)
);

-- Estatísticas calculadas (StatisticalSummary + campos extras do Django)
CREATE TABLE analise_estatisticas (
    analise_id                     UUID    PRIMARY KEY REFERENCES analises (id) ON DELETE CASCADE,
    total_videos                   INTEGER NOT NULL DEFAULT 0 CHECK (total_videos >= 0),
    videos_com_metricas            INTEGER NOT NULL DEFAULT 0 CHECK (videos_com_metricas >= 0),
    videos_sem_metricas            INTEGER NOT NULL DEFAULT 0 CHECK (videos_sem_metricas >= 0),
    media_visualizacoes            NUMERIC(18,2),
    mediana_visualizacoes          NUMERIC(18,2),
    min_visualizacoes              BIGINT,
    max_visualizacoes              BIGINT,
    desvio_padrao_visualizacoes    NUMERIC(18,2),
    media_curtidas                 NUMERIC(18,2),
    mediana_curtidas               NUMERIC(18,2),
    min_curtidas                   BIGINT,
    max_curtidas                   BIGINT,
    media_comentarios              NUMERIC(18,2),
    mediana_comentarios            NUMERIC(18,2),
    media_compartilhamentos        NUMERIC(18,2),
    taxa_curtidas_visualizacoes    NUMERIC(9,4),   -- em %
    taxa_comentarios_curtidas      NUMERIC(9,4),   -- em %
    taxa_engajamento               NUMERIC(9,4),   -- em %
    taxa_visualizacoes_seguidores  NUMERIC(12,4),  -- (média de views / seguidores) * 100
    qtd_fora_do_padrao             INTEGER NOT NULL DEFAULT 0 CHECK (qtd_fora_do_padrao >= 0),
    proporcao_fora_do_padrao       NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (proporcao_fora_do_padrao BETWEEN 0 AND 1),
    pontuacao_engajamento_suspeito SMALLINT NOT NULL DEFAULT 0 CHECK (pontuacao_engajamento_suspeito BETWEEN 0 AND 100),
    intervalo_datas                VARCHAR(150),
    frequencia_postagem            JSONB NOT NULL DEFAULT '{}'::jsonb,
    limitacoes                     JSONB NOT NULL DEFAULT '[]'::jsonb,
    observacao_distribuicao        TEXT,
    aviso_amostra                  TEXT,
    CHECK (videos_com_metricas + videos_sem_metricas <= total_videos)
);

-- "Resultado da análise". Cada clique em "Analisar de novo" gera uma nova versão.
CREATE TABLE avaliacoes (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise_id           UUID        NOT NULL REFERENCES analises (id) ON DELETE CASCADE,
    versao               SMALLINT    NOT NULL DEFAULT 1 CHECK (versao >= 1),
    classificacao        VARCHAR(40) NOT NULL REFERENCES classificacoes_resultado (codigo),
    pontuacao_confianca  SMALLINT    NOT NULL CHECK (pontuacao_confianca BETWEEN 0 AND 100),
    nivel_confianca      VARCHAR(5)  NOT NULL CHECK (nivel_confianca IN ('Baixa', 'Média', 'Alta')),
    resumo_evidencias    TEXT        NOT NULL DEFAULT '',
    conclusao_geral      TEXT,
    pontuacao_risco      SMALLINT    CHECK (pontuacao_risco BETWEEN 0 AND 100),
    requer_denuncia      BOOLEAN     NOT NULL DEFAULT FALSE,   -- requiresOfficialReport
    modelo_usado         VARCHAR(150) NOT NULL,                 -- ex.: gemini-3.8-flash / Regras locais
    usou_ia              BOOLEAN     NOT NULL DEFAULT TRUE,
    observacao_tecnica   TEXT,                                  -- ex.: cota do Gemini excedida
    avaliado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (analise_id, versao)
);

-- Listas do resultado: motivos, outras explicações, limitações e próximos passos
CREATE TABLE avaliacao_itens (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    avaliacao_id  BIGINT      NOT NULL REFERENCES avaliacoes (id) ON DELETE CASCADE,
    tipo          VARCHAR(25) NOT NULL
                  CHECK (tipo IN ('observacao', 'explicacao_alternativa', 'limitacao', 'proximo_passo')),
    ordem         SMALLINT    NOT NULL DEFAULT 0,
    texto         TEXT        NOT NULL,
    UNIQUE (avaliacao_id, tipo, ordem)
);

-- Aspectos avaliados (analyzedAspects)
CREATE TABLE avaliacao_aspectos (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    avaliacao_id  BIGINT       NOT NULL REFERENCES avaliacoes (id) ON DELETE CASCADE,
    ordem         SMALLINT     NOT NULL DEFAULT 0,
    aspecto       VARCHAR(150) NOT NULL,
    avaliacao     TEXT         NOT NULL,
    status        VARCHAR(10)  NOT NULL CHECK (status IN ('normal', 'alerta', 'critico'))
);
CREATE INDEX ix_avaliacao_aspectos ON avaliacao_aspectos (avaliacao_id, ordem);


-- =============================================================================
-- 7. BASE LOCAL DE CHECAGENS (usada quando o Gemini não está disponível)
-- =============================================================================

CREATE TABLE base_checagens (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    texto_afirmacao      TEXT        NOT NULL,
    categoria            VARCHAR(30) NOT NULL REFERENCES categorias_tema (codigo),
    veredito             VARCHAR(40) NOT NULL REFERENCES vereditos (codigo),
    pontuacao_confianca  SMALLINT    NOT NULL CHECK (pontuacao_confianca BETWEEN 0 AND 100),
    resumo_evidencias    TEXT        NOT NULL,
    consenso_cientifico  TEXT,
    alerta_oficial       TEXT,
    ativo                BOOLEAN     NOT NULL DEFAULT TRUE,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_base_checagens_atualizado
    BEFORE UPDATE ON base_checagens FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- Palavras/expressões que disparam cada item da base
CREATE TABLE base_checagem_gatilhos (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    base_checagem_id  BIGINT       NOT NULL REFERENCES base_checagens (id) ON DELETE CASCADE,
    termo             VARCHAR(150) NOT NULL
);
CREATE UNIQUE INDEX ux_base_checagem_gatilhos ON base_checagem_gatilhos (base_checagem_id, lower(termo));
CREATE INDEX ix_base_checagem_gatilhos_termo ON base_checagem_gatilhos (lower(termo));

CREATE TABLE base_checagem_fontes (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    base_checagem_id  BIGINT        NOT NULL REFERENCES base_checagens (id) ON DELETE CASCADE,
    fonte_id          BIGINT        NOT NULL REFERENCES fontes (id),
    nome_exibido      VARCHAR(200),                 -- quando o texto difere do nome da fonte
    titulo            VARCHAR(500)  NOT NULL,
    url               VARCHAR(1000) NOT NULL,
    citacao           TEXT,
    ordem             SMALLINT      NOT NULL DEFAULT 0
);


-- =============================================================================
-- 8. CHECAGEM DE AFIRMAÇÕES
-- =============================================================================
-- Uma checagem pode vir de:
--   'frase_avulsa' -> botão "Checar uma frase" (sem link)
--   'video'        -> botão de checar um vídeo da tabela
--   'analise'      -> etapa automática do POST /api/analyze (Django)

CREATE TABLE checagens (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origem              VARCHAR(15)  NOT NULL CHECK (origem IN ('frase_avulsa', 'video', 'analise')),
    analise_id          UUID         REFERENCES analises (id) ON DELETE CASCADE,
    video_id            BIGINT       REFERENCES videos_tiktok (id) ON DELETE SET NULL,
    visitante_id        UUID         REFERENCES visitantes (id) ON DELETE SET NULL,
    texto_analisado     TEXT         NOT NULL CHECK (length(trim(texto_analisado)) > 0),
    tema                VARCHAR(30)  NOT NULL DEFAULT 'Geral',
    nome_perfil         VARCHAR(150),
    url_publicacao      VARCHAR(1000),
    nivel_risco         VARCHAR(10)  NOT NULL CHECK (nivel_risco IN ('baixo', 'moderado', 'alto', 'critico')),
    mecanismo_usado     VARCHAR(200) NOT NULL,          -- engineUsed
    usou_ia             BOOLEAN      NOT NULL DEFAULT FALSE,
    usou_google_search  BOOLEAN      NOT NULL DEFAULT FALSE,
    checado_em          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (origem <> 'analise' OR analise_id IS NOT NULL),
    CHECK (origem <> 'video'   OR video_id IS NOT NULL OR url_publicacao IS NOT NULL)
);
CREATE INDEX ix_checagens_analise   ON checagens (analise_id);
CREATE INDEX ix_checagens_visitante ON checagens (visitante_id, checado_em DESC);
CREATE INDEX ix_checagens_risco     ON checagens (nivel_risco, checado_em DESC);

CREATE TABLE afirmacoes (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    checagem_id          BIGINT      NOT NULL REFERENCES checagens (id) ON DELETE CASCADE,
    ordem                SMALLINT    NOT NULL DEFAULT 0,
    texto                TEXT        NOT NULL,
    categoria            VARCHAR(30) NOT NULL DEFAULT 'geral' REFERENCES categorias_tema (codigo),
    veredito             VARCHAR(40) NOT NULL REFERENCES vereditos (codigo),
    pontuacao_confianca  SMALLINT    NOT NULL DEFAULT 0 CHECK (pontuacao_confianca BETWEEN 0 AND 100),
    explicacao           TEXT        NOT NULL DEFAULT '',
    consenso_cientifico  TEXT,
    alerta_oficial       TEXT,
    base_checagem_id     BIGINT      REFERENCES base_checagens (id) ON DELETE SET NULL,  -- se veio da base local
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (checagem_id, ordem)
);
CREATE INDEX ix_afirmacoes_veredito ON afirmacoes (veredito);

-- Fontes citadas em cada afirmação (guarda nome/título/url como foram exibidos)
CREATE TABLE afirmacao_fontes (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    afirmacao_id  BIGINT        NOT NULL REFERENCES afirmacoes (id) ON DELETE CASCADE,
    fonte_id      BIGINT        REFERENCES fontes (id) ON DELETE SET NULL,
    nome          VARCHAR(255)  NOT NULL,
    titulo        VARCHAR(500)  NOT NULL DEFAULT '',
    url           VARCHAR(1000) NOT NULL,
    citacao       TEXT,
    eh_oficial    BOOLEAN       NOT NULL DEFAULT FALSE,
    ordem         SMALLINT      NOT NULL DEFAULT 0
);
CREATE INDEX ix_afirmacao_fontes ON afirmacao_fontes (afirmacao_id, ordem);


-- =============================================================================
-- 9. EXPORTAÇÕES DO RELATÓRIO (PDF, JSON, texto)
-- =============================================================================

CREATE TABLE exportacoes_relatorio (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analise_id              UUID        NOT NULL REFERENCES analises (id) ON DELETE CASCADE,
    avaliacao_id            BIGINT      REFERENCES avaliacoes (id) ON DELETE SET NULL,
    visitante_id            UUID        REFERENCES visitantes (id) ON DELETE SET NULL,
    formato                 VARCHAR(10) NOT NULL CHECK (formato IN ('pdf', 'json', 'texto')),
    protocolo               VARCHAR(60),                 -- ex.: FOF-2026-AB12CD34 (PDF)
    hash_sha256             CHAR(64)    CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
    incluiu_lista_videos    BOOLEAN     NOT NULL DEFAULT FALSE,
    incluiu_hash            BOOLEAN     NOT NULL DEFAULT FALSE,
    nome_arquivo            VARCHAR(255),
    gerado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT incluiu_hash OR hash_sha256 IS NOT NULL)
);
CREATE INDEX ix_exportacoes_analise ON exportacoes_relatorio (analise_id);
CREATE UNIQUE INDEX ux_exportacoes_protocolo ON exportacoes_relatorio (protocolo) WHERE protocolo IS NOT NULL;


-- =============================================================================
-- 10. INFRAESTRUTURA: cache de APIs e log de integrações
-- =============================================================================

-- Cache das respostas do PostZen (hoje em memória, TTL padrão de 120 s)
CREATE TABLE cache_api (
    chave      VARCHAR(500) PRIMARY KEY,
    servico    VARCHAR(20)  NOT NULL CHECK (servico IN ('postzen', 'gemini', 'outro')),
    payload    JSONB        NOT NULL,
    criado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_em  TIMESTAMPTZ  NOT NULL,
    CHECK (expira_em > criado_em)
);
CREATE INDEX ix_cache_api_expira ON cache_api (expira_em);

-- Chamadas a serviços externos (útil para acompanhar cota 429, falhas e tempo de resposta)
CREATE TABLE logs_integracao (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    servico               VARCHAR(20)  NOT NULL CHECK (servico IN ('gemini', 'google_search', 'postzen')),
    operacao              VARCHAR(200) NOT NULL,          -- ex.: GET /v1/analytics, generateContent
    status_http           SMALLINT,
    sucesso               BOOLEAN      NOT NULL,
    codigo_erro           VARCHAR(60),                    -- rate_limited, invalid_api_key, timeout...
    mensagem              TEXT,
    retry_after_segundos  INTEGER      CHECK (retry_after_segundos >= 0),
    tentativas            SMALLINT     NOT NULL DEFAULT 1 CHECK (tentativas >= 1),
    duracao_ms            INTEGER      CHECK (duracao_ms >= 0),
    analise_id            UUID         REFERENCES analises (id) ON DELETE SET NULL,
    checagem_id           BIGINT       REFERENCES checagens (id) ON DELETE SET NULL,
    criado_em             TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_logs_integracao ON logs_integracao (servico, criado_em DESC);
CREATE INDEX ix_logs_integracao_erros ON logs_integracao (criado_em DESC) WHERE NOT sucesso;


-- =============================================================================
-- 11. VIEWS
-- =============================================================================

-- Avaliação mais recente de cada análise
CREATE VIEW vw_avaliacao_atual AS
SELECT DISTINCT ON (a.analise_id) a.*
FROM avaliacoes a
ORDER BY a.analise_id, a.versao DESC;

-- Lista do "Histórico" (gaveta lateral)
CREATE VIEW vw_historico_analises AS
SELECT
    an.id,
    an.codigo,
    an.visitante_id,
    an.criado_em,
    an.origem_dados,
    an.eh_demo,
    p.username,
    p.nome_exibicao,
    av.classificacao,
    cr.rotulo           AS classificacao_rotulo,
    av.nivel_confianca,
    av.pontuacao_confianca
FROM analises an
LEFT JOIN perfis_tiktok p             ON p.id = an.perfil_id
LEFT JOIN vw_avaliacao_atual av       ON av.analise_id = an.id
LEFT JOIN classificacoes_resultado cr ON cr.codigo = av.classificacao
WHERE an.excluido_em IS NULL;

-- Resumo por perfil (quantas vezes foi analisado e o último resultado)
CREATE VIEW vw_resumo_perfis AS
SELECT
    p.id,
    p.username,
    p.nome_exibicao,
    p.seguidores,
    COUNT(an.id)                   AS total_analises,
    MAX(an.criado_em)              AS ultima_analise_em,
    (SELECT h.classificacao_rotulo
       FROM vw_historico_analises h
      WHERE h.username = p.username
      ORDER BY h.criado_em DESC
      LIMIT 1)                     AS ultimo_resultado
FROM perfis_tiktok p
LEFT JOIN analises an ON an.perfil_id = p.id AND an.excluido_em IS NULL
GROUP BY p.id;

-- Quantidade de afirmações por veredito e tema
CREATE VIEW vw_afirmacoes_por_veredito AS
SELECT
    v.escala,
    v.rotulo  AS veredito,
    c.rotulo  AS categoria,
    COUNT(*)  AS total
FROM afirmacoes af
JOIN vereditos v       ON v.codigo = af.veredito
JOIN categorias_tema c ON c.codigo = af.categoria
GROUP BY v.escala, v.rotulo, c.rotulo;


-- =============================================================================
-- 12. FUNÇÕES DE MANUTENÇÃO
-- =============================================================================

-- Remove cache vencido e states de OAuth expirados/consumidos. Rodar via cron.
CREATE OR REPLACE FUNCTION fn_limpar_expirados()
RETURNS TABLE (cache_removido INTEGER, states_removidos INTEGER) AS $$
DECLARE
    v_cache  INTEGER;
    v_states INTEGER;
BEGIN
    DELETE FROM cache_api WHERE expira_em < now();
    GET DIAGNOSTICS v_cache = ROW_COUNT;

    DELETE FROM postzen_oauth_states
     WHERE expira_em < now() - INTERVAL '1 day'
        OR consumido_em < now() - INTERVAL '1 day';
    GET DIAGNOSTICS v_states = ROW_COUNT;

    RETURN QUERY SELECT v_cache, v_states;
END;
$$ LANGUAGE plpgsql;

-- Consome um state do OAuth: devolve TRUE só se existir, não tiver expirado e
-- ainda não tiver sido usado (mesma regra de _OAuthStateStore.consume).
CREATE OR REPLACE FUNCTION fn_consumir_oauth_state(p_state VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    UPDATE postzen_oauth_states
       SET consumido_em = now()
     WHERE state = p_state
       AND consumido_em IS NULL
       AND expira_em > now()
    RETURNING TRUE INTO v_ok;
    RETURN COALESCE(v_ok, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Mantém só as N análises mais recentes de um visitante (o front guarda 15)
CREATE OR REPLACE FUNCTION fn_limitar_historico(p_visitante UUID, p_limite INTEGER DEFAULT 15)
RETURNS INTEGER AS $$
DECLARE
    v_qtd INTEGER;
BEGIN
    UPDATE analises
       SET excluido_em = now()
     WHERE id IN (
         SELECT id FROM analises
          WHERE visitante_id = p_visitante AND excluido_em IS NULL
          ORDER BY criado_em DESC
         OFFSET p_limite
     );
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
    RETURN v_qtd;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 13. DADOS INICIAIS
-- =============================================================================

INSERT INTO classificacoes_resultado (codigo, rotulo, rotulo_curto, descricao, gravidade, ordem) VALUES
('sem_indicios',      'Sem indícios relevantes identificados',               'Sem indícios relevantes', 'Não encontramos nada que contradiga o que foi dito.', 0, 1),
('merece_atencao',    'Indícios que merecem investigação',                   'Merece atenção',          'Há pontos estranhos ou fora de contexto. Vale conferir antes de compartilhar.', 1, 2),
('possivel_enganoso', 'Possível conteúdo enganoso',                          'Possivelmente enganoso',  'Promessas exageradas ou informações que não batem com as fontes.', 2, 3),
('falso_manipulado',  'Evidências consistentes de falsidade ou manipulação', 'Falso ou manipulado',     'O conteúdo contraria diretamente fontes oficiais ou dados confiáveis.', 3, 4),
('insuficiente',      'Dados insuficientes para concluir',                   'Dados insuficientes',     'Não há informação suficiente para afirmar nada com segurança.', 0, 5);

INSERT INTO vereditos (codigo, rotulo, escala, indica_risco, ordem) VALUES
('falso',               'Falso',                                    'rapida',    TRUE,  1),
('enganoso',            'Enganoso',                                 'rapida',    TRUE,  2),
('sem_evidencias',      'Sem Evidências Científicas',               'rapida',    TRUE,  3),
('exagerado',           'Exagerado',                                'rapida',    TRUE,  4),
('fora_contexto',       'Fora de Contexto',                         'rapida',    TRUE,  5),
('verdadeiro',          'Verdadeiro / Respaldado',                  'rapida',    FALSE, 6),
('confirmada',          'Confirmada pelas evidências consultadas',  'detalhada', FALSE, 1),
('contradita',          'Contradita pelas evidências consultadas',  'detalhada', TRUE,  2),
('parcial',             'Parcialmente correta ou fora de contexto', 'detalhada', TRUE,  3),
('conflitante',         'Evidências conflitantes',                  'detalhada', FALSE, 4),
('nao_verificada',      'Não verificada',                           'detalhada', FALSE, 5),
('nao_verificavel',     'Afirmação não verificável',                'detalhada', FALSE, 6);

INSERT INTO categorias_tema (codigo, rotulo) VALUES
('saude',    'Saúde'),
('financas', 'Finanças'),
('noticias', 'Notícias'),
('ciencia',  'Ciência'),
('geral',    'Geral');

INSERT INTO fontes (nome, sigla, tipo, site_url) VALUES
('Agência Nacional de Vigilância Sanitária',  'ANVISA', 'orgao_oficial',        'https://www.gov.br/anvisa/pt-br'),
('Comissão de Valores Mobiliários',           'CVM',    'orgao_oficial',        'https://www.gov.br/cvm/pt-br'),
('Banco Central do Brasil',                   'BCB',    'orgao_oficial',        'https://www.bcb.gov.br'),
('Conselho Federal de Medicina',              'CFM',    'orgao_oficial',        'https://portal.cfm.org.br'),
('Sociedade Brasileira de Diabetes',          'SBD',    'sociedade_cientifica', 'https://diabetes.org.br'),
('Sociedade Brasileira de Cardiologia',       'SBC',    'sociedade_cientifica', 'https://www.portal.cardiol.br'),
('Agência Lupa',                              NULL,     'agencia_checagem',     'https://piaui.folha.uol.com.br/lupa/'),
('Aos Fatos',                                 NULL,     'agencia_checagem',     'https://www.aosfatos.org'),
('Projeto Comprova',                          NULL,     'agencia_checagem',     'https://projetocomprova.com.br'),
('G1 Fato ou Fake',                           NULL,     'agencia_checagem',     'https://g1.globo.com/fato-ou-fake/'),
('Estadão Verifica',                          NULL,     'agencia_checagem',     'https://www.estadao.com.br/estadao-verifica/');

INSERT INTO canais_denuncia (titulo, descricao, url, ordem) VALUES
('Diretrizes da Comunidade do TikTok — Integridade e autenticidade',
 'Regras do TikTok sobre desinformação, golpes e conteúdo enganoso.',
 'https://www.tiktok.com/community-guidelines/pt-br/integrity-authenticity', 1),
('Central de Segurança do TikTok',
 'Como denunciar vídeos, contas e comentários pelo app.',
 'https://www.tiktok.com/safety/pt-br/', 2);

INSERT INTO documentos_legais (tipo, versao, caminho) VALUES
('termos',      '1.0', '/terms'),
('privacidade', '1.0', '/privacy');

INSERT INTO configuracoes (chave, valor, descricao) VALUES
('gemini_modelo',             'gemini-3.8-flash', 'Modelo padrão do Gemini (pode ser trocado pela variável GEMINI_MODEL)'),
('postzen_base_url',          'https://api.postzen.dev', 'URL base da API do PostZen'),
('postzen_cache_ttl_segundos','120', 'Tempo de cache das respostas do PostZen'),
('postzen_timeout_segundos',  '10',  'Timeout das chamadas ao PostZen'),
('postzen_max_tentativas',    '2',   'Tentativas extras em erro 502/503/504'),
('oauth_state_ttl_segundos',  '600', 'Validade do state do OAuth (10 minutos)'),
('historico_max_analises',    '15',  'Quantidade de análises mantidas no histórico de cada visitante'),
('tema_padrao',               'light', 'Tema usado quando o visitante ainda não escolheu um');

-- Base local de checagens (mesmo conteúdo de server/factCheckService.ts)
WITH b AS (
    INSERT INTO base_checagens (texto_afirmacao, categoria, veredito, pontuacao_confianca, resumo_evidencias, consenso_cientifico, alerta_oficial)
    VALUES (
        'Erva natural ou chá é capaz de reverter o diabetes tipo 2 ou destruir a glicose em 48 horas',
        'saude', 'falso', 98,
        'Não existe comprovação clínica nem substância botânica isolada capaz de curar ou reverter o diabetes tipo 2 em 48 horas. A Sociedade Brasileira de Diabetes (SBD) e a ANVISA alertam que abandonar a medicação prescrita pode causar cetoacidose e óbito.',
        'O diabetes tipo 2 é uma condição metabólica crônica manejável com dieta balanceada, atividade física regular e farmacoterapia orientada por médico.',
        'Alerta Sanitário ANVISA: Produtos comercializados nas redes sociais como "cura do diabetes" não possuem registro sanitário e configuram crime contra a saúde pública.'
    ) RETURNING id
), g AS (
    INSERT INTO base_checagem_gatilhos (base_checagem_id, termo)
    SELECT b.id, t FROM b, unnest(ARRAY['diabetes', 'glicose', 'erva da amazônia', 'insulina', '48 horas', 'reverter em 7 dias']) AS t
)
INSERT INTO base_checagem_fontes (base_checagem_id, fonte_id, nome_exibido, titulo, url, citacao, ordem)
SELECT b.id, f.id, x.nome_exibido, x.titulo, x.url, x.citacao, x.ordem
FROM b
CROSS JOIN (VALUES
    ('SBD',    NULL::VARCHAR, 'Posicionamento Oficial sobre tratamentos milagrosos para Diabetes', 'https://diabetes.org.br', 'Nenhum chá, planta ou suplemento substitui o tratamento médico ou reverte o diabetes de forma imediata.', 1),
    ('ANVISA', NULL,          'Resolução Proibitiva de Suplementos Irregulares', 'https://www.gov.br/anvisa/pt-br', 'É terminantemente vedada a atribuição de propriedades terapêuticas ou de cura a alimentos e suplementos.', 2),
    ('Agência Lupa', 'Agência Lupa / G1 Fato ou Fake', 'É golpe: Vídeo forja reportagem para vender erva falsa contra glicose alta', 'https://piaui.folha.uol.com.br/lupa/', 'Publicações utilizam vídeos manipulados de telejornais para induzir consumidores ao erro.', 3)
) AS x (ref, nome_exibido, titulo, url, citacao, ordem)
JOIN fontes f ON f.sigla = x.ref OR f.nome = x.ref;

WITH b AS (
    INSERT INTO base_checagens (texto_afirmacao, categoria, veredito, pontuacao_confianca, resumo_evidencias, consenso_cientifico, alerta_oficial)
    VALUES (
        'Chá caseiro limpa 90% das artérias obstruídas dispensando intervenção cirúrgica',
        'saude', 'falso', 97,
        'A aterosclerose é o acúmulo calcificado e fibroso de placas lipídicas nas paredes arteriais. Chás e infusões não têm o poder de dissolver placas ateromatosas. Descontinuar a avaliação cardiológica eleva severamente o risco de infarto agudo do miocárdio e AVC.',
        'Diretrizes da Sociedade Brasileira de Cardiologia (SBC) preconizam o controle do LDL, uso de estatinas e, em lesões críticas, angioplastia ou cirurgia de revascularização.',
        'Sociedade Brasileira de Cardiologia: O abandono de terapêutica comprovada por promessas de fitoterapia caseira é causa direta de desfechos cardiovasculares fatais.'
    ) RETURNING id
), g AS (
    INSERT INTO base_checagem_gatilhos (base_checagem_id, termo)
    SELECT b.id, t FROM b, unnest(ARRAY['artéria', 'chá da vovó', 'cirurgia cardíaca', 'desentupir artéria', 'infarto']) AS t
)
INSERT INTO base_checagem_fontes (base_checagem_id, fonte_id, titulo, url, citacao, ordem)
SELECT b.id, f.id, x.titulo, x.url, x.citacao, x.ordem
FROM b
CROSS JOIN (VALUES
    ('SBC',       'Diretriz Brasileira de Prevenção Cardiovascular', 'https://www.portal.cardiol.br', 'A obstrução coronariana não é passível de desobstrução por via de chás ou infusões gastrointestinais.', 1),
    ('Aos Fatos', 'Chá não desentope artérias nem substitui cateterismo ou cirurgia cardíaca', 'https://www.aosfatos.org', 'Cardiologistas consultados reiteram a absoluta ineficácia e perigo do conteúdo disseminado nas redes.', 2)
) AS x (ref, titulo, url, citacao, ordem)
JOIN fontes f ON f.sigla = x.ref OR f.nome = x.ref;

WITH b AS (
    INSERT INTO base_checagens (texto_afirmacao, categoria, veredito, pontuacao_confianca, resumo_evidencias, consenso_cientifico, alerta_oficial)
    VALUES (
        'Software ou algoritmo secreto com lucro diário de 100% garantido e sem risco',
        'financas', 'falso', 99,
        'A Comissão de Valores Mobiliários (CVM) e o Banco Central do Brasil determinam que promessas de retorno garantido com taxas exorbitantes constituem fraude financeira ou esquema ponzi/pirâmide. No mercado financeiro legítimo, maiores retornos estão indissociavelmente atrelados a maiores riscos.',
        'Teoria Moderna do Portfólio e regulamentação da CVM: Rentabilidade pré-fixada acima de 1% ao dia sem risco é matematicamente insustentável no sistema financeiro internacional.',
        'Alerta ao Mercado CVM: Entidades e pessoas não autorizadas que captam recursos prometendo lucros fixos diários operam de forma clandestina sujeita a responsabilização penal.'
    ) RETURNING id
), g AS (
    INSERT INTO base_checagem_gatilhos (base_checagem_id, termo)
    SELECT b.id, t FROM b, unnest(ARRAY['100% ao dia', 'lucro garantido', 'robô do pix', 'multiplicar dinheiro', 'código secreto']) AS t
)
INSERT INTO base_checagem_fontes (base_checagem_id, fonte_id, titulo, url, citacao, ordem)
SELECT b.id, f.id, x.titulo, x.url, x.citacao, x.ordem
FROM b
CROSS JOIN (VALUES
    ('CVM', 'Alertas sobre Golpes Financeiros e Pirâmides nas Redes', 'https://www.gov.br/cvm/pt-br', 'Promessas de rentabilidade elevada sem risco são o indício primário de esquemas fraudulentos.', 1),
    ('BCB', 'Segurança com PIX e Cuidados com Golpes Virtuais', 'https://www.bcb.gov.br', 'Não existe funcionalidade no PIX ou algoritmo que multiplique valores transferidos.', 2)
) AS x (ref, titulo, url, citacao, ordem)
JOIN fontes f ON f.sigla = x.ref OR f.nome = x.ref;

WITH b AS (
    INSERT INTO base_checagens (texto_afirmacao, categoria, veredito, pontuacao_confianca, resumo_evidencias)
    VALUES (
        'Narrativa conspiratória afirmando que descobertas científicas revolucionárias foram censuradas',
        'geral', 'enganoso', 89,
        'O apelo à conspiração ("querem derrubar este vídeo", "antes que seja censurado") é um mecanismo psicológico documentado para contornar o pensamento crítico do espectador e acelerar o compartilhamento impulsivo sem checagem prévia.'
    ) RETURNING id
), g AS (
    INSERT INTO base_checagem_gatilhos (base_checagem_id, termo)
    SELECT b.id, t FROM b, unnest(ARRAY['querem censurar', 'a indústria quer derrubar', 'médicos alemães', 'segredo revelado']) AS t
)
INSERT INTO base_checagem_fontes (base_checagem_id, fonte_id, titulo, url, citacao, ordem)
SELECT b.id, f.id,
       'Como golpistas usam gatilhos de urgência e teoria da conspiração para engajar nas redes',
       'https://projetocomprova.com.br',
       'A retórica de vitimização e censura é um artifício padrão da desinformação para criar falsa urgência.',
       1
FROM b JOIN fontes f ON f.nome = 'Projeto Comprova';

-- Perfis fictícios dos exemplos da página inicial (src/data/mockProfiles.ts)
INSERT INTO perfis_tiktok (username, nome_exibicao, verificado, seguidores, categoria, perfil_url, ficticio) VALUES
('saude_vital_brasil',         'Instituto Saúde & Longevidade Natural',   FALSE, 142000, 'Saúde & Bem-estar',     'https://www.tiktok.com/@saude_vital_brasil',         TRUE),
('tech_investimentos_oficial', 'Tech Trader Brasil | IA Financeira',      FALSE,  89000, 'Serviços Financeiros',  'https://www.tiktok.com/@tech_investimentos_oficial', TRUE),
('dra_mariana_nutricao',       'Dra. Mariana Silveira | Nutrição Clínica', TRUE, 215000, 'Ciência & Educação',    'https://www.tiktok.com/@dra_mariana_nutricao',       TRUE),
('noticias_urgente_brasil',    'Plantão de Notícias Brasil 24h',          FALSE, 310000, 'Mídia & Notícias',      'https://www.tiktok.com/@noticias_urgente_brasil',    TRUE);

INSERT INTO cenarios_demonstracao (id, perfil_id, categoria_exibida, etiqueta, ordem)
SELECT x.id, p.id, x.categoria, x.etiqueta, x.ordem
FROM (VALUES
    ('saude_vital',        'saude_vital_brasil',         'Saúde & Bem-estar',  'Cura milagrosa em 48h',       1),
    ('tech_investimentos', 'tech_investimentos_oficial', 'Finanças & Cripto',  'Robô do Pix / Lucro fixo',    2),
    ('dra_mariana',        'dra_mariana_nutricao',       'Ciência & Nutrição', 'Perfil confiável (USP/CRN)',  3),
    ('noticias_urgente',   'noticias_urgente_brasil',    'Mídia & Jornalismo', 'Cortes sensacionalistas',     4)
) AS x (id, username, categoria, etiqueta, ordem)
JOIN perfis_tiktok p ON p.username = x.username;
