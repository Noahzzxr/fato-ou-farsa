# Fato ou Farsa

Site para conferir vídeos do TikTok. A pessoa cola o link do vídeo (ou o @ do perfil, ou só o texto que é falado) e recebe:

- os números do perfil (visualizações, curtidas, comentários) com os vídeos que estão muito fora do padrão;
- a checagem das afirmações do vídeo contra órgãos oficiais (ANVISA, CFM, CVM, Banco Central) e agências de checagem (Agência Lupa, Aos Fatos, Comprova);
- uma das 5 classificações abaixo, com os motivos, outras explicações possíveis e o que fazer a seguir;
- o passo a passo para denunciar no próprio TikTok e a opção de baixar o relatório em PDF.

Classificações possíveis:

1. Sem indícios relevantes identificados
2. Indícios que merecem investigação
3. Possível conteúdo enganoso
4. Evidências consistentes de falsidade ou manipulação
5. Dados insuficientes para concluir

O resultado é um apoio para a decisão de quem está lendo, não uma prova. Números fora do padrão, sozinhos, não provam má-fé (o algoritmo da página "Para Você" explica muitos picos).

## Protótipo

O layout foi desenhado no Figma: [protótipo de alta fidelidade](https://www.figma.com/design/ef3EYTpxwKKMaWZ5XB15yk/TCC?node-id=0-1&t=5HPD54PA8esoQBMd-1).

Identidade visual: o ícone é um olho formado por dois balões de fala (azul `#003876` e verde `#00A86B`) com um check dourado (`#F5B800`). Os arquivos ficam em `public/assets/brand/`.

## Tecnologias

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite, lucide-react, jsPDF
- **Backend:** Python 3.11, Django 5, Django REST Framework
- **Servidor Node:** Express. Repassa `/api/*` para o Django e, se o Django não estiver rodando, atende as mesmas rotas em TypeScript (`server/`)
- **IA:** Google Gemini (`@google/genai` / `google-genai`) com Google Search para buscar fontes. Sem chave ou sem cota, o app usa uma base local de desmentidos já publicados
- **Dados do TikTok:** [PostZen](https://api.postzen.dev), somente leitura, para contas que autorizaram o acesso via OAuth. Não fazemos scraping
- **Banco:** PostgreSQL (script em `database/schema.sql`); SQLite no desenvolvimento do Django

## Como rodar

```bash
npm install
cp .env.example .env        # preencha GEMINI_API_KEY e, se for usar, POSTZEN_API_KEY
npm run dev                 # http://localhost:3000
```

Backend Django (opcional; sem ele, o Node responde as rotas):

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:5001 --noreload
```

Testes:

```bash
npm run test:node                       # testes do Node
python manage.py test verification      # testes do Django
npm run lint                            # checagem de tipos
```

## Banco de dados (PostgreSQL)

O arquivo [`database/schema.sql`](database/schema.sql) cria o banco completo no schema `fatooufarsa`, já com os dados de referência (classificações, vereditos, fontes, base local de checagens e perfis de exemplo).

```bash
createdb fatooufarsa
psql -d fatooufarsa -f database/schema.sql
```

Requer PostgreSQL 13 ou mais novo. O script apaga e recria o schema, então pode ser executado de novo sem erro. As tabelas internas do Django (usuários do admin, sessões) são criadas pelo `python manage.py migrate`.

Resumo das tabelas:

| Grupo | Tabelas |
|---|---|
| Referência | `classificacoes_resultado`, `vereditos`, `categorias_tema`, `fontes`, `canais_denuncia`, `documentos_legais`, `configuracoes` |
| Visitantes | `visitantes`, `preferencias` (tema e "reduzir animações"), `aceites_documentos`, `solicitacoes_lgpd` |
| TikTok | `perfis_tiktok`, `videos_tiktok`, `cenarios_demonstracao` |
| Análises | `analises`, `analise_perfil_snapshot`, `analise_videos`, `analise_video_sinais`, `analise_estatisticas`, `avaliacoes`, `avaliacao_itens`, `avaliacao_aspectos` |
| Checagem | `checagens`, `afirmacoes`, `afirmacao_fontes`, `base_checagens`, `base_checagem_gatilhos`, `base_checagem_fontes` |
| Relatórios | `exportacoes_relatorio` |
| PostZen | `postzen_perfis`, `postzen_contas`, `postzen_conta_permissoes`, `postzen_oauth_states`, `postzen_oauth_retornos`, `postzen_publicacoes`, `postzen_insights_conta`, `postzen_seguidores_historico`, `postzen_comentarios` |
| Infra | `cache_api`, `logs_integracao` |

Views: `vw_historico_analises`, `vw_avaliacao_atual`, `vw_resumo_perfis`, `vw_afirmacoes_por_veredito`.
Funções: `fn_consumir_oauth_state`, `fn_limitar_historico`, `fn_limpar_expirados`.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `GEMINI_API_KEY` | Checagem com IA. Sem ela, o app usa só a base local |
| `GEMINI_MODEL` | Opcional. Modelo do Gemini |
| `POSTZEN_API_KEY` | Leitura das contas TikTok conectadas. Fica só no servidor |
| `POSTZEN_BASE_URL` | Opcional (padrão `https://api.postzen.dev`) |
| `PORT`, `APP_URL` | Porta e URL pública do app |

## Integração com o PostZen

- Conexão: `GET /v1/profiles` → `GET /v1/connect/tiktok` (gera `authUrl` e `state`, válido por 10 min) → callback em `/api/integrations/postzen/connect/callback/` → `GET /v1/accounts`.
- Só leitura: perfis, contas, métricas das publicações, insights, seguidores e comentários. Nada é publicado, respondido ou moderado.
- Contas com a conexão antiga só têm métricas básicas; insights e comentários exigem **TikTok for Business**.
- Limites do TikTok: métricas com 24h a 48h de atraso, histórico de cerca de 60 dias e dados demográficos só com 100+ seguidores.
- O PostZen só fornece contexto (números). Ele não entra no veredito da checagem.

Rotas internas: `/api/integrations/postzen/` + `status/`, `profiles/`, `connect/url/`, `connect/callback/`, `accounts/`, `analytics/`, `followers/`, `comments/`.

## Configurações do usuário

O tema (claro, escuro ou igual ao sistema) e a opção "Reduzir animações" ficam só na tela **Configurações**. A escolha é salva no navegador.

## Aspectos legais

- Nenhuma denúncia é feita automaticamente; o app só mostra o caminho oficial no TikTok.
- Segue a LGPD (Lei 13.709/2018), o Marco Civil da Internet (Lei 12.965/2014) e as Diretrizes da Comunidade do TikTok. Detalhes em `/terms` e `/privacy`.
