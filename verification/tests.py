"""Testes dos models, das estatísticas e dos endpoints da API."""

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from .models import (
    TikTokProfile,
    TikTokVideo,
    InvestigationReport,
    ClaimVerification,
    EvidenceSource
)
from .services.statistics_service import (
    compute_average,
    compute_median,
    compute_views_to_followers_ratio,
    compute_engagement_rate,
    calculate_statistical_summary
)
from .services.tiktok_service import (
    normalize_tiktok_input,
    fetch_tiktok_content,
)
from .services.fact_check_service import extract_claims_heuristic


class StatisticsServiceTestCase(TestCase):
    """Testa os algoritmos matemáticos e determinísticos do módulo de estatísticas."""

    def test_compute_average_and_median(self):
        self.assertEqual(compute_average([10.0, 20.0, 30.0]), 20.0)
        self.assertEqual(compute_average([]), 0.0)
        self.assertEqual(compute_median([10.0, 50.0, 20.0]), 20.0)
        self.assertEqual(compute_median([10.0, 20.0, 30.0, 40.0]), 25.0)

    def test_views_to_followers_ratio(self):
        # (average_views / follower_count) * 100
        # Exemplo 1: 5.000 views com 10.000 seguidores => 50.0%
        ratio1 = compute_views_to_followers_ratio(5000.0, 10000)
        self.assertEqual(ratio1, 50.0)

        # Exemplo 2: Vídeo viral (200.000 views com 50.000 seguidores) => 400.0%
        ratio2 = compute_views_to_followers_ratio(200000.0, 50000)
        self.assertEqual(ratio2, 400.0)

        # Salvaguardas de divisão por zero e ausência de dados
        self.assertIsNone(compute_views_to_followers_ratio(5000.0, 0))
        self.assertIsNone(compute_views_to_followers_ratio(5000.0, None))
        self.assertEqual(compute_views_to_followers_ratio(0.0, 10000), 0.0)

    def test_engagement_rate(self):
        # ((likes + comments + shares) / total_views) * 100
        # (100 + 20 + 10) / 1000 => 13.0%
        rate = compute_engagement_rate(100.0, 20.0, 10.0, 1000.0)
        self.assertEqual(rate, 13.0)
        # Proteção quando total_views = 0
        self.assertIsNone(compute_engagement_rate(10.0, 5.0, 2.0, 0.0))

    def test_calculate_statistical_summary(self):
        sample_posts = [
            {'viewsCount': 10000, 'likesCount': 1000, 'commentsCount': 100, 'sharesCount': 50},
            {'viewsCount': 30000, 'likesCount': 3000, 'commentsCount': 300, 'sharesCount': 150},
        ]
        summary = calculate_statistical_summary(sample_posts, follower_count=50000)
        self.assertEqual(summary['sample_size'], 2)
        self.assertEqual(summary['average_views'], 20000.0)
        self.assertEqual(summary['median_views'], 20000.0)
        self.assertEqual(summary['views_to_followers_ratio'], 40.0)
        self.assertIn('data_limitations', summary)


class TikTokServiceTestCase(TestCase):
    """Testa a validação e normalização de identificadores e links do TikTok."""

    def test_normalize_tiktok_video_url(self):
        res = normalize_tiktok_input("https://www.tiktok.com/@saude_vital/video/7389201928371928392")
        self.assertEqual(res['type'], 'video')
        self.assertEqual(res['username'], 'saude_vital')
        self.assertEqual(res['video_id'], '7389201928371928392')

    def test_normalize_tiktok_profile_url(self):
        res = normalize_tiktok_input("https://www.tiktok.com/@dra_mariana")
        self.assertEqual(res['type'], 'profile')
        self.assertEqual(res['username'], 'dra_mariana')

    def test_normalize_empty_input(self):
        with self.assertRaises(ValueError):
            normalize_tiktok_input("   ")


class FactCheckServiceTestCase(TestCase):
    """Identificação e classificação de desinformação pela base local."""

    def test_medical_claim_classification(self):
        text = "Chá da Amazônia reverte diabetes tipo 2 em 48 horas e cura o pâncreas"
        claims = extract_claims_heuristic(text)
        self.assertTrue(len(claims) >= 1)
        lead = claims[0]
        self.assertEqual(lead['verdict'], 'Contradita pelas evidências consultadas')
        self.assertGreaterEqual(lead['confidence'], 90)
        self.assertTrue(any(s['isOfficial'] for s in lead['sources']))

    def test_financial_claim_classification(self):
        text = "Robô do pix com lucro garantido sem risco e retorno de 100% ao dia"
        claims = extract_claims_heuristic(text)
        self.assertTrue(len(claims) >= 1)
        lead = claims[0]
        self.assertEqual(lead['verdict'], 'Contradita pelas evidências consultadas')


class VerificationAPITestCase(APITestCase):
    """Testa os endpoints RESTful desenvolvidos com Django REST Framework."""

    def test_status_endpoint(self):
        url = reverse('api_status')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['platform'], 'TikTok')
        self.assertIn('Django', response.data['framework'])
        self.assertIn('SQLite3 (Django ORM)', response.data['database'])
        self.assertEqual(response.data['tiktok']['provider'], 'PostZen')
        self.assertTrue(response.data['tiktok']['exclusiveProvider'])
        self.assertEqual(response.data['tiktok']['oauthConnectEndpoint'], '/api/integrations/postzen/connect/url/')

    def test_calculate_stats_endpoint(self):
        url = reverse('calculate_stats')
        payload = {
            'followerCount': 100000,
            'posts': [
                {'viewsCount': 40000, 'likesCount': 2000},
                {'viewsCount': 60000, 'likesCount': 4000}
            ]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['average_views'], 50000.0)
        self.assertEqual(response.data['views_to_followers_ratio'], 50.0)

    def test_verify_claims_endpoint(self):
        url = reverse('verify_claims')
        payload = {'caption': 'Erva da Amazônia cura diabetes tipo 2'}
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data['claims']) >= 1)

    def test_full_analysis_and_orm_persistence(self):
        url = reverse('full_analyze')
        payload = {
            'usernameOrUrl': '@saude_vital_brasil',
            'manualTranscript': 'Chá que reverte diabetes em 48 horas'
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('id', response.data)
        self.assertIn('profile', response.data)
        self.assertIn('statistics', response.data)
        self.assertIn('aiAnalysis', response.data)

        # Verifica se o relatório foi persistido no banco de dados SQLite via Django ORM
        report_id = response.data['id']
        self.assertTrue(InvestigationReport.objects.filter(report_id=report_id).exists())
        self.assertTrue(TikTokProfile.objects.filter(username='saude_vital_brasil').exists())

    def test_frontend_direct_analysis_payload(self):
        url = reverse('full_analyze')
        payload = {
            'profile': {
                'username': 'criador_teste',
                'fullName': 'Criador Teste',
                'followersCount': 50000,
                'category': 'Saúde'
            },
            'posts': [
                {
                    'id': 'v1',
                    'type': 'video',
                    'caption': 'Dicas de saúde e rotina',
                    'viewsCount': 20000,
                    'likesCount': 1500
                }
            ],
            'statistics': {
                'totalPostsAnalyzed': 1,
                'avgViews': 20000,
                'medianViews': 20000,
                'likesToViewsRatio': 7.5,
                'outlierCount': 0,
                'suspiciousEngagementScore': 15
            }
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('classification', response.data)
        self.assertIn('confidenceScore', response.data)
        self.assertIn('analyzedAspects', response.data)
        self.assertEqual(response.data['classification'], 'Sem indícios relevantes identificados')


class PostZenIntegrationTestCase(APITestCase):
    """
    Testes unitários e de endpoint para a integração PostZen (somente leitura)
    com mocking de HTTP externo, sem necessidade de credenciais reais.
    """

    def setUp(self):
        from .services.postzen_client import clear_postzen_cache
        from .services.postzen_accounts import clear_postzen_oauth_states
        clear_postzen_cache()
        clear_postzen_oauth_states()

    def _mock_response(self, status_code=200, json_data=None, headers=None, text_data=""):
        from unittest.mock import MagicMock
        resp = MagicMock()
        resp.status_code = status_code
        resp.headers = headers or {}
        resp.text = text_data
        if json_data is not None:
            resp.json.return_value = json_data
        else:
            resp.json.side_effect = ValueError("No JSON")
        return resp

    def test_01_missing_api_key_handled_gracefully(self):
        from django.test import override_settings
        with override_settings(POSTZEN_API_KEY=''):
            res_status = self.client.get(reverse('postzen_status'))
            self.assertEqual(res_status.status_code, 200)
            self.assertFalse(res_status.data['configured'])
            self.assertTrue(res_status.data['readOnly'])

            res_accounts = self.client.get(reverse('postzen_accounts'))
            self.assertEqual(res_accounts.status_code, 503)
            self.assertEqual(res_accounts.data['errorCode'], 'missing_api_key')

    def test_02_successful_auth_and_connected_tiktok_accounts(self):
        from unittest.mock import patch
        from django.test import override_settings

        upstream_accounts = {
            'accounts': [
                {
                    '_id': 'acc_tt_biz_1',
                    'platform': 'tiktok',
                    'username': 'canal_oficial',
                    'displayName': 'Canal Oficial',
                    'connectionType': 'tiktok_business',
                    'isActive': True,
                    'scopes': ['video.list', 'insights', 'comments'],
                },
                {
                    '_id': 'acc_ig_ignored',
                    'platform': 'instagram',
                    'username': 'insta_user',
                }
            ]
        }

        with override_settings(POSTZEN_API_KEY='pz_test_secret_value'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(200, upstream_accounts)
                res = self.client.get(reverse('postzen_accounts'))
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.data['tiktokAccountsCount'], 1)
                self.assertEqual(res.data['accounts'][0]['id'], 'acc_tt_biz_1')
                self.assertEqual(res.data['accounts'][0]['connectionType'], 'tiktok_business')
                self.assertTrue(res.data['accounts'][0]['capabilities']['comments'])
                # Nunca vazar a chave na resposta
                self.assertNotIn('pz_test_secret_value', str(res.data))

    def test_03_invalid_api_key_returns_401(self):
        from unittest.mock import patch
        from django.test import override_settings

        with override_settings(POSTZEN_API_KEY='pz_invalid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(401, {'message': 'Invalid API key'})
                res = self.client.get(reverse('postzen_accounts'))
                self.assertEqual(res.status_code, 401)
                self.assertEqual(res.data['errorCode'], 'invalid_api_key')

    def test_04_analytics_retrieval_preserves_zero_vs_null(self):
        from unittest.mock import patch
        from django.test import override_settings

        accounts_payload = {
            'accounts': [
                {
                    'id': 'acc_tt_1',
                    'platform': 'tiktok',
                    'username': 'criador_verificado',
                    'connectionType': 'tiktok_business',
                    'isActive': True,
                }
            ]
        }
        analytics_payload = {
            'posts': [
                {
                    'postId': 'post_1',
                    'title': 'Vídeo Teste Zero vs Nulo',
                    'views': 0,
                    'likes': 25,
                    'comments': 0,
                    # shares, reach, saves ausentes -> devem permanecer None
                }
            ]
        }
        insights_payload = {
            'followerCount': 80,
            'availability': {'audienceAvailable': False}
        }

        with override_settings(POSTZEN_API_KEY='pz_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.side_effect = [
                    self._mock_response(200, accounts_payload),
                    self._mock_response(200, analytics_payload),
                    self._mock_response(200, insights_payload),
                ]
                res = self.client.get(reverse('postzen_analytics'))
                self.assertEqual(res.status_code, 200)
                metrics = res.data['posts'][0]['metrics']
                self.assertEqual(metrics['views'], 0)
                self.assertEqual(metrics['comments'], 0)
                self.assertEqual(metrics['likes'], 25)
                self.assertIsNone(metrics['shares'])
                self.assertIsNone(metrics['reach'])
                self.assertIsNone(metrics['saves'])
                self.assertIn('100 seguidores', res.data['accountInsights']['followerThresholdNotice'])

    def test_05_unsupported_connection_type_for_comments_and_insights(self):
        from unittest.mock import patch
        from django.test import override_settings

        earlier_accounts = {
            'accounts': [
                {
                    'id': 'acc_earlier',
                    'platform': 'tiktok',
                    'username': 'conta_antiga',
                    'connectionType': 'earlier_connection',
                    'isActive': True,
                }
            ]
        }

        with override_settings(POSTZEN_API_KEY='pz_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(200, earlier_accounts)
                res_comments = self.client.get(reverse('postzen_comments'))
                self.assertEqual(res_comments.status_code, 400)
                self.assertEqual(res_comments.data['errorCode'], 'unsupported_connection_type')

    def test_06_missing_entitlement_returns_403(self):
        from unittest.mock import patch
        from django.test import override_settings

        accounts_payload = {
            'accounts': [
                {
                    'id': 'acc_tt_biz',
                    'platform': 'tiktok',
                    'username': 'conta_biz',
                    'connectionType': 'tiktok_business',
                    'isActive': True,
                }
            ]
        }

        with override_settings(POSTZEN_API_KEY='pz_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.side_effect = [
                    self._mock_response(200, accounts_payload),
                    self._mock_response(403, {'code': 'entitlement_required', 'message': 'Upgrade plan for inbox'}),
                ]
                res = self.client.get(reverse('postzen_comments'))
                self.assertEqual(res.status_code, 403)
                self.assertEqual(res.data['errorCode'], 'missing_entitlement')

    def test_07_rate_limiting_parses_retry_after(self):
        from unittest.mock import patch
        from django.test import override_settings

        with override_settings(POSTZEN_API_KEY='pz_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(
                    429,
                    {'message': 'Too many requests'},
                    headers={'Retry-After': '45'}
                )
                res = self.client.get(reverse('postzen_accounts'))
                self.assertEqual(res.status_code, 429)
                self.assertEqual(res.data['errorCode'], 'rate_limited')
                self.assertEqual(res.data['retryAfterSeconds'], 45)

    def test_08_upstream_api_failure_returns_503(self):
        from unittest.mock import patch
        from django.test import override_settings

        with override_settings(POSTZEN_API_KEY='pz_valid_key', POSTZEN_MAX_RETRIES=0):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(503, {'message': 'Service unavailable'})
                res = self.client.get(reverse('postzen_accounts'))
                self.assertEqual(res.status_code, 503)
                self.assertEqual(res.data['errorCode'], 'service_unavailable')

    def test_09_empty_datasets_handled_cleanly(self):
        from unittest.mock import patch
        from django.test import override_settings

        with override_settings(POSTZEN_API_KEY='pz_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(200, {'accounts': []})
                res_acc = self.client.get(reverse('postzen_accounts'))
                self.assertEqual(res_acc.status_code, 200)
                self.assertEqual(res_acc.data['accounts'], [])
                self.assertFalse(res_acc.data['hasConnectedTikTok'])

                res_analytics = self.client.get(reverse('postzen_analytics'))
                self.assertEqual(res_analytics.status_code, 200)
                self.assertEqual(res_analytics.data['posts'], [])
                self.assertFalse(res_analytics.data['hasConnectedAccount'])

    def test_10_oauth_profiles_and_connect_url_flow(self):
        from unittest.mock import patch
        from django.test import override_settings

        profiles_payload = {
            'profiles': [
                {'_id': 'prof_1', 'name': 'Pesquisa Principal', 'isDefault': True},
            ]
        }
        connect_payload = {
            'authUrl': 'https://www.tiktok.com/v2/auth/authorize/?client_key=postzen_managed&state=st_abc123',
            'state': 'st_abc123',
        }

        with override_settings(POSTZEN_API_KEY='pz_rw_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.side_effect = [
                    self._mock_response(200, profiles_payload),
                    self._mock_response(200, profiles_payload),
                    self._mock_response(200, connect_payload),
                ]
                res_profiles = self.client.get(reverse('postzen_profiles'))
                self.assertEqual(res_profiles.status_code, 200)
                self.assertEqual(res_profiles.data['defaultProfileId'], 'prof_1')

                res_connect = self.client.get(reverse('postzen_connect_url'))
                self.assertEqual(res_connect.status_code, 200)
                self.assertEqual(res_connect.data['state'], 'st_abc123')
                self.assertEqual(res_connect.data['expiresInSeconds'], 600)
                self.assertTrue(res_connect.data['authUrl'].startswith('https://'))

    def test_11_oauth_callback_valid_reused_expired_and_errors(self):
        from unittest.mock import patch
        from django.test import override_settings
        from .services.postzen_accounts import register_postzen_oauth_state_for_test

        register_postzen_oauth_state_for_test('st_valid_1', profile_id='prof_1', ttl_seconds=600)
        accounts_payload = {
            'accounts': [
                {
                    'id': 'acc_tt_new',
                    'platform': 'tiktok',
                    'username': 'conta_recem_conectada',
                    'connectionType': 'tiktok_business',
                    'isActive': True,
                }
            ]
        }

        with override_settings(POSTZEN_API_KEY='pz_rw_valid_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(200, accounts_payload)
                res_ok = self.client.get(
                    reverse('postzen_connect_callback'),
                    {'state': 'st_valid_1', 'username': 'conta_recem_conectada', 'format': 'json'},
                )
                self.assertEqual(res_ok.status_code, 200)
                self.assertTrue(res_ok.data['success'])
                self.assertEqual(res_ok.data['tiktokAccountsCount'], 1)

            # Reutilização de state já consumido deve ser bloqueada (CSRF)
            res_replay = self.client.get(
                reverse('postzen_connect_callback'),
                {'state': 'st_valid_1', 'format': 'json'},
            )
            self.assertEqual(res_replay.status_code, 400)
            self.assertEqual(res_replay.data['errorCode'], 'invalid_oauth_state')

            # Erro missing_tiktok_permissions com missing_scopes
            register_postzen_oauth_state_for_test('st_perm_err', profile_id='prof_1', ttl_seconds=600)
            res_perm = self.client.get(
                reverse('postzen_connect_callback'),
                {
                    'state': 'st_perm_err',
                    'error': 'missing_tiktok_permissions',
                    'missing_scopes': 'video.list,user.info.stats',
                    'format': 'json',
                },
            )
            self.assertEqual(res_perm.status_code, 400)
            self.assertEqual(res_perm.data['errorCode'], 'missing_tiktok_permissions')
            self.assertEqual(res_perm.data['missingScopes'], ['video.list', 'user.info.stats'])

    def test_12_connect_plan_limit_402_and_read_only_key_403(self):
        from unittest.mock import patch
        from django.test import override_settings

        with override_settings(POSTZEN_API_KEY='pz_ro_key'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.return_value = self._mock_response(
                    402,
                    {'message': 'Account limit reached', 'upgradeUrl': 'https://app.postzen.dev/billing'},
                )
                res_402 = self.client.get(reverse('postzen_connect_url'), {'profileId': 'prof_1'})
                self.assertEqual(res_402.status_code, 402)
                self.assertEqual(res_402.data['errorCode'], 'plan_account_limit')

                mock_get.return_value = self._mock_response(
                    403,
                    {'message': 'Connecting accounts requires a Read & Write API key'},
                )
                res_403 = self.client.get(reverse('postzen_connect_url'), {'profileId': 'prof_1'})
                self.assertEqual(res_403.status_code, 403)
                self.assertEqual(res_403.data['errorCode'], 'connect_requires_read_write_key')

    def test_13_exclusive_tiktok_content_lookup_uses_postzen_or_fallback(self):
        from unittest.mock import patch
        from django.test import override_settings

        accounts_payload = {
            'accounts': [
                {
                    'id': 'acc_tt_1',
                    'platform': 'tiktok',
                    'username': 'canal_auditado',
                    'displayName': 'Canal Auditado',
                    'connectionType': 'tiktok_business',
                    'isActive': True,
                }
            ]
        }
        analytics_payload = {
            'posts': [
                {
                    'postId': 'pz_vid_99',
                    'title': 'Vídeo real via PostZen',
                    'publishedAt': '2026-11-15T12:00:00Z',
                    'views': 1500,
                    'likes': 210,
                    'comments': 14,
                    'shares': 5,
                }
            ]
        }
        insights_payload = {'followerCount': 8500}

        with override_settings(POSTZEN_API_KEY='pz_live_test'):
            with patch('verification.services.postzen_client.requests.Session.get') as mock_get:
                mock_get.side_effect = [
                    self._mock_response(200, accounts_payload),
                    self._mock_response(200, accounts_payload),
                    self._mock_response(200, analytics_payload),
                    self._mock_response(200, insights_payload),
                ]
                res_live = fetch_tiktok_content('@canal_auditado')
                self.assertEqual(res_live['source'], 'postzen_api')
                self.assertTrue(res_live['isLiveApi'])
                self.assertEqual(res_live['posts'][0]['id'], 'pz_vid_99')

        with override_settings(POSTZEN_API_KEY=''):
            res_fallback = fetch_tiktok_content('@saude_vital_brasil')
            self.assertEqual(res_fallback['source'], 'sandbox_dataset')
            self.assertFalse(res_fallback['isLiveApi'])

    def test_14_postzen_base_url_optional_default(self):
        from django.test import override_settings
        from .services.postzen_client import PostZenClient, get_postzen_config_status

        with override_settings(POSTZEN_API_KEY='pz_test', POSTZEN_BASE_URL=''):
            status_data = get_postzen_config_status()
            self.assertEqual(status_data['baseUrl'], 'https://api.postzen.dev')
            client = PostZenClient()
            self.assertEqual(client.base_url, 'https://api.postzen.dev')




