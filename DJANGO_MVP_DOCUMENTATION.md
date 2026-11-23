# Backend Django

API em Python 3 + Django 5 + Django REST Framework. Atende o frontend React em `/api/*` e salva as análises no banco.

## Estrutura

```
manage.py
requirements.txt
fato_backend/            configurações do projeto (settings, urls, wsgi, asgi)
verification/            app principal
├── models.py            TikTokProfile, TikTokVideo, InvestigationReport, ClaimVerification, EvidenceSource
├── serializers.py
├── views.py
├── urls.py
├── admin.py
├── tests.py
└── services/
    ├── tiktok_service.py        normalização de links e busca dos dados (PostZen)
    ├── statistics_service.py    médias, medianas, IQR e taxas
    ├── fact_check_service.py    checagem de afirmações (Gemini ou base local)
    ├── ai_analysis_service.py   classificação nas 5 categorias
    ├── postzen_client.py        cliente HTTP (auth, retry, 429, cache)
    ├── postzen_accounts.py      perfis, OAuth e contas conectadas
    ├── postzen_analytics.py     métricas, insights e seguidores
    └── postzen_comments.py      leitura de comentários
```

## Models

**TikTokProfile** — `username` (único), `full_name`, `avatar_url`, `is_verified`, `followers_count`, `following_count`, `likes_received_count`, `videos_count`, `biography`, `category`, `profile_url`.

**TikTokVideo** — FK para o perfil; `video_id`, `caption`, `transcript`, `sound_title`, `views_count`, `likes_count`, `comments_count`, `shares_count` (podem ser `NULL` = indisponível), `posted_at`, `is_outlier`, `anomaly_score`.

**InvestigationReport** — uma análise. `report_id` (`report_YYYYMMDD_HHMMSS`), FK para o perfil, `data_source` (`postzen_api`, `sandbox_dataset`, `manual_input`), `is_demo`, `sample_size`, `average_views`, `median_views`, `std_dev_views`, `views_to_followers_ratio`, `engagement_rate`, `overall_assessment`, `risk_score` (0–100), `engine_used`.

**ClaimVerification** — afirmação checada dentro de uma análise. `claim_text`, `category`, `verdict`, `confidence_score`, `explanation`, `scientific_consensus`. Vereditos:

1. Confirmada pelas evidências consultadas
2. Contradita pelas evidências consultadas
3. Parcialmente correta ou fora de contexto
4. Evidências conflitantes
5. Não verificada
6. Afirmação não verificável

**EvidenceSource** — fonte de uma afirmação: `name`, `title`, `url`, `quote`, `is_official` (órgão público × agência de checagem).

> O modelo completo para PostgreSQL (com histórico de versões do resultado, PostZen, exportações, preferências, logs etc.) está em `database/schema.sql`. Ver o README.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/status` | Situação dos serviços (Gemini, PostZen, base local) |
| POST | `/api/tiktok/profile` | Perfil e vídeos a partir do link/@ (PostZen ou texto colado) |
| POST | `/api/calculate-stats` | Estatísticas de uma lista de vídeos |
| POST | `/api/verify-claims` | Checa as afirmações de um texto |
| POST | `/api/analyze` | Análise completa; salva perfil, vídeos, análise, afirmações e fontes |
| GET | `/api/history` | Últimas 50 análises salvas |
| GET | `/api/integrations/postzen/...` | `status/`, `profiles/`, `connect/url/`, `connect/callback/`, `accounts/`, `analytics/`, `followers/`, `comments/` |
| GET | `/admin/` | Django Admin |

`POST /api/analyze` aceita dois formatos:

1. `{ "profile": {...}, "posts": [...], "statistics": {...} }` — o front já tem os dados e só quer a classificação;
2. `{ "usernameOrUrl": "@saude_vital_brasil", "manualTranscript": "..." }` — o backend busca, calcula, checa e salva.

Exemplo de resposta (formato 1):

```json
{
  "classification": "Indícios que merecem investigação",
  "confidenceScore": 85,
  "confidenceLevel": "Média",
  "evidenceSummary": "1 vídeo com muitas visualizações e poucas curtidas em relação ao resto do perfil.",
  "supportingObservations": ["..."],
  "alternativeExplanations": ["Picos de visualização podem vir da página Para Você."],
  "limitations": ["Só foram usados dados públicos."],
  "recommendedNextSteps": ["Consultar ANVISA, CFM ou CVM antes de tomar qualquer decisão."],
  "analyzedAspects": [{ "aspect": "Integridade Estatística", "evaluation": "Dispersão atípica", "status": "alerta" }],
  "modelUsed": "gemini-2.5-flash",
  "requiresOfficialReport": false
}
```

## Comandos

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py test verification -v 2
python manage.py runserver 127.0.0.1:5001 --noreload
python manage.py createsuperuser          # acesso ao /admin/
```

## Notas sobre a metodologia

- **Views / seguidores** = `(average_views / follower_count) * 100`. Não é a porcentagem de seguidores que assistiu: o TikTok entrega vídeos para quem não segue o perfil.
- **Vídeos fora do padrão** são detectados pelo intervalo interquartil (IQR) das visualizações do próprio perfil.
- **0 × indisponível:** uma métrica `0` é diferente de uma métrica ausente (`NULL`); ausentes não entram nas médias.
- **Sem scraping:** dados de contas só via PostZen, com autorização do dono. Para o resto, o usuário cola o texto.
