"""Rotas /api/* do app verification."""

from django.urls import path
from .views import (
    api_status_view,
    tiktok_profile_view,
    calculate_stats_view,
    verify_claims_view,
    full_analysis_view,
    investigation_history_view,
    postzen_status_view,
    postzen_profiles_view,
    postzen_connect_url_view,
    postzen_connect_callback_view,
    postzen_accounts_view,
    postzen_analytics_view,
    postzen_followers_view,
    postzen_comments_view,
)

urlpatterns = [
    # Status e diagnósticos
    path('status', api_status_view, name='api_status'),
    path('status/', api_status_view, name='api_status_slash'),

    # Consulta de perfis e vídeos do TikTok (via PostZen autorizado ou entrada manual/didática)
    path('tiktok/profile', tiktok_profile_view, name='tiktok_profile'),
    path('tiktok/profile/', tiktok_profile_view, name='tiktok_profile_slash'),
    path('instagram/profile', tiktok_profile_view, name='instagram_profile_compat'),

    # Cálculo estatístico determinístico
    path('calculate-stats', calculate_stats_view, name='calculate_stats'),
    path('calculate-stats/', calculate_stats_view, name='calculate_stats_slash'),

    # Checagem de afirmações
    path('verify-claims', verify_claims_view, name='verify_claims'),
    path('verify-claims/', verify_claims_view, name='verify_claims_slash'),

    # Análise completa (salva no banco)
    path('analyze', full_analysis_view, name='full_analyze'),
    path('analyze/', full_analysis_view, name='full_analyze_slash'),

    # Histórico de auditorias
    path('history', investigation_history_view, name='investigation_history'),
    path('history/', investigation_history_view, name='investigation_history_slash'),

    # Integração PostZen (Provedor Exclusivo TikTok)
    path('integrations/postzen/status', postzen_status_view, name='postzen_status'),
    path('integrations/postzen/status/', postzen_status_view, name='postzen_status_slash'),
    path('integrations/postzen/profiles', postzen_profiles_view, name='postzen_profiles'),
    path('integrations/postzen/profiles/', postzen_profiles_view, name='postzen_profiles_slash'),
    path('integrations/postzen/connect', postzen_connect_url_view, name='postzen_connect'),
    path('integrations/postzen/connect/', postzen_connect_url_view, name='postzen_connect_slash'),
    path('integrations/postzen/connect/url', postzen_connect_url_view, name='postzen_connect_url'),
    path('integrations/postzen/connect/url/', postzen_connect_url_view, name='postzen_connect_url_slash'),
    path('integrations/postzen/connect/callback', postzen_connect_callback_view, name='postzen_connect_callback'),
    path('integrations/postzen/connect/callback/', postzen_connect_callback_view, name='postzen_connect_callback_slash'),
    path('integrations/postzen/accounts', postzen_accounts_view, name='postzen_accounts'),
    path('integrations/postzen/accounts/', postzen_accounts_view, name='postzen_accounts_slash'),
    path('integrations/postzen/analytics', postzen_analytics_view, name='postzen_analytics'),
    path('integrations/postzen/analytics/', postzen_analytics_view, name='postzen_analytics_slash'),
    path('integrations/postzen/followers', postzen_followers_view, name='postzen_followers'),
    path('integrations/postzen/followers/', postzen_followers_view, name='postzen_followers_slash'),
    path('integrations/postzen/comments', postzen_comments_view, name='postzen_comments'),
    path('integrations/postzen/comments/', postzen_comments_view, name='postzen_comments_slash'),
]
