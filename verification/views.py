"""Views da API usadas pelo frontend React."""

from datetime import datetime
from urllib.parse import urlencode
from django.http import HttpResponseRedirect
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

from .models import (
    TikTokProfile,
    TikTokVideo,
    InvestigationReport,
    ClaimVerification,
    EvidenceSource
)
from .serializers import (
    InvestigationReportSerializer,
    TikTokProfileSerializer,
    TikTokVideoSerializer,
    PostZenAnalyticsQuerySerializer,
    PostZenFollowersQuerySerializer,
    PostZenCommentsQuerySerializer,
    PostZenConnectUrlQuerySerializer,
)
from .services.tiktok_service import (
    fetch_tiktok_content,
    normalize_tiktok_input
)
from .services.statistics_service import (
    calculate_statistical_summary,
    compute_views_to_followers_ratio
)
from .services.fact_check_service import verify_claims_with_gemini
from .services.ai_analysis_service import analyze_content_with_gemini
from .services.postzen_client import PostZenApiError, get_postzen_config_status
from .services.postzen_accounts import (
    create_tiktok_connect_url,
    handle_tiktok_connect_callback,
    list_connected_tiktok_accounts,
    list_postzen_profiles,
)
from .services.postzen_analytics import fetch_tiktok_analytics, fetch_tiktok_follower_stats
from .services.postzen_comments import fetch_tiktok_comments


@api_view(['GET'])
@permission_classes([AllowAny])
def api_status_view(request):
    """
    Retorna o status operacional do sistema, tecnologias ativas e conformidade da API.
    """
    has_gemini = bool(settings.GEMINI_API_KEY and not settings.GEMINI_API_KEY.startswith('SUA_CHAVE'))
    postzen_status = get_postzen_config_status()
    has_postzen = bool(postzen_status.get('configured'))

    return Response({
        'system': 'Fato ou Farsa API (Django)',
        'version': '4.0.0',
        'framework': 'Django 5 + Django REST Framework',
        'platform': 'TikTok',
        'database': 'SQLite3 (Django ORM)',
        'gemini': {
            'configured': has_gemini,
            'model': settings.GEMINI_MODEL,
            'searchGroundingSupported': True,
            'mode': 'active' if has_gemini else 'deterministic_fallback'
        },
        'tiktok': {
            'configured': has_postzen,
            'provider': 'PostZen',
            'exclusiveProvider': True,
            'mode': 'postzen_api' if has_postzen else 'sandbox_curated',
            'apiVersion': 'PostZen v1',
            'oauthConnectEndpoint': '/api/integrations/postzen/connect/url/',
            'termsCompliance': 'Sem scraping; dados do TikTok apenas via PostZen'
        },
        'factCheckEngine': {
            'status': 'online',
            'categories': [
                'Confirmada pelas evidências consultadas',
                'Contradita pelas evidências consultadas',
                'Parcialmente correta ou fora de contexto',
                'Evidências conflitantes',
                'Não verificada',
                'Afirmação não verificável'
            ],
            'sourcesCount': 8,
            'regulatoryAgencies': ['ANVISA', 'CFM', 'SBD', 'CVM', 'Banco Central'],
            'factCheckingPartners': ['Agência Lupa', 'Aos Fatos', 'Projeto Comprova', 'G1 Fato ou Fake']
        },
        'postzen': postzen_status,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def tiktok_profile_view(request):
    """
    Obtém informações de perfil e lista de vídeos do TikTok via PostZen (para contas conectadas)
    ou fallback estruturado/entrada manual.
    """
    username_or_url = (
        request.data.get('usernameOrUrl') or
        request.data.get('username') or
        request.query_params.get('usernameOrUrl')
    )
    manual_transcript = request.data.get('manualTranscript')

    if not username_or_url and not manual_transcript:
        return Response(
            {'error': 'O link de vídeo do TikTok, @usuário ou transcrição manual é obrigatório.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        data = fetch_tiktok_content(
            username_or_url=username_or_url or '@video_tiktok',
            manual_transcript=manual_transcript,
        )
        return Response(data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def calculate_stats_view(request):
    """
    Calcula métricas quantitativas, médias, medianas e taxas a partir de posts fornecidos.
    """
    posts = request.data.get('posts', [])
    follower_count = request.data.get('followerCount')

    stats_result = calculate_statistical_summary(posts, follower_count)
    return Response(stats_result)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_claims_view(request):
    """
    Checa afirmações factuais a partir de um texto, legenda ou transcrição.
    """
    caption = request.data.get('caption') or request.data.get('text') or request.data.get('transcript')
    if not caption:
        return Response({'error': 'O texto ou legenda para verificação é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)

    topic = request.data.get('topic', 'Geral')
    profile_name = request.data.get('profileName', '')

    result = verify_claims_with_gemini(caption, topic, profile_name)
    return Response(result)


@api_view(['POST'])
@permission_classes([AllowAny])
def full_analysis_view(request):
    """
    Executa a auditoria completa de um perfil/vídeo do TikTok e persiste no Django ORM:
    1. Obtenção dos dados do TikTok ou entrada manual
    2. Cálculo de métricas determinísticas
    3. Checagem das afirmações (Gemini ou base local)
    4. Persistência de Profile, Vídeos, Dossiê e Fontes no banco de dados SQLite
    5. Retorno do relatório estruturado
    """
    # Caso 1: Requisição do frontend para análise de IA com dados já carregados ({ profile, posts, statistics })
    if 'profile' in request.data and 'posts' in request.data:
        profile_data = request.data.get('profile') or {}
        posts_data = request.data.get('posts') or []
        stats_data = request.data.get('statistics') or {}
        ai_res = analyze_content_with_gemini(profile_data, posts_data, stats_data)
        return Response(ai_res, status=status.HTTP_200_OK)

    username_or_url = request.data.get('usernameOrUrl') or request.data.get('username')
    manual_transcript = request.data.get('manualTranscript')

    if not username_or_url and not manual_transcript:
        return Response({'error': 'Parâmetro usernameOrUrl ou manualTranscript é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # 1. Obtenção de dados do TikTok via PostZen (contas autorizadas) ou fallback
        tiktok_res = fetch_tiktok_content(
            username_or_url=username_or_url or '@video_tiktok',
            manual_transcript=manual_transcript,
        )

        raw_profile = tiktok_res['profile']
        raw_posts = tiktok_res['posts']

        # 2. Cálculos estatísticos
        stats = calculate_statistical_summary(raw_posts, raw_profile.get('followersCount'))

        # 3. Análise pelo agente de IA
        lead_post = raw_posts[0] if raw_posts else {}
        text_for_ai = manual_transcript or lead_post.get('transcript') or lead_post.get('caption') or raw_profile.get('biography') or ''
        
        fact_check = verify_claims_with_gemini(
            caption_or_transcript=text_for_ai,
            topic=raw_profile.get('category', 'Geral'),
            profile_name=raw_profile.get('username', '')
        )

        # 4. Persistência no Django ORM
        # a) Perfil
        profile_obj, _ = TikTokProfile.objects.update_or_create(
            username=raw_profile.get('username', 'criador_tiktok'),
            defaults={
                'full_name': raw_profile.get('fullName', ''),
                'avatar_url': raw_profile.get('avatar_url', ''),
                'is_verified': raw_profile.get('isVerified', False),
                'followers_count': raw_profile.get('followersCount', 0),
                'following_count': raw_profile.get('followingCount', 0),
                'likes_received_count': raw_profile.get('likesReceivedCount', 0),
                'videos_count': raw_profile.get('videosCount', len(raw_posts)),
                'biography': raw_profile.get('biography', ''),
                'category': raw_profile.get('category', 'Geral'),
                'profile_url': raw_profile.get('profileUrl', ''),
            }
        )

        # b) Vídeos
        for p in raw_posts:
            v_id = p.get('id') or p.get('videoId') or f"vid_{datetime.now().timestamp()}"
            TikTokVideo.objects.update_or_create(
                video_id=v_id,
                profile=profile_obj,
                defaults={
                    'caption': p.get('caption', ''),
                    'transcript': p.get('transcript', ''),
                    'sound_title': p.get('soundTitle', ''),
                    'url': p.get('url', ''),
                    'thumbnail_url': p.get('thumbnailUrl', ''),
                    'views_count': p.get('viewsCount'),
                    'likes_count': p.get('likesCount'),
                    'comments_count': p.get('commentsCount'),
                    'shares_count': p.get('sharesCount'),
                    'formatted_date': p.get('formattedDate', ''),
                    'is_outlier': p.get('isOutlier', False),
                    'anomaly_score': p.get('anomalyScore', 0.0)
                }
            )

        # c) Dossiê de Investigação
        report_id = f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        overall_assessment = (
            'Risco Elevado: Foram identificadas afirmações sem comprovação científica ou em desacordo com órgãos reguladores.'
            if fact_check['overall_risk_level'] in ['alto', 'critico'] else
            'Análise Factual Concluída: Verifique as fontes institucionais associadas a cada alegação.'
        )
        risk_score = 85 if fact_check['overall_risk_level'] in ['alto', 'critico'] else 35

        report_obj = InvestigationReport.objects.create(
            report_id=report_id,
            profile=profile_obj,
            data_source=tiktok_res.get('source', 'sandbox_dataset'),
            is_demo=not tiktok_res.get('isLiveApi', False),
            status_message=tiktok_res.get('statusMessage', ''),
            input_query=username_or_url or '',
            manual_transcript=manual_transcript or '',
            sample_size=stats['sample_size'],
            date_range=stats['date_range'],
            average_views=stats['average_views'],
            median_views=stats['median_views'],
            std_dev_views=stats['std_dev_views'],
            average_likes=stats['average_likes'],
            average_comments=stats['average_comments'],
            average_shares=stats['average_shares'],
            views_to_followers_ratio=stats['views_to_followers_ratio'],
            engagement_rate=stats['engagement_rate'],
            frequency_json=stats['posting_frequency'],
            limitations_json=stats['data_limitations'],
            overall_assessment=overall_assessment,
            risk_score=risk_score,
            engine_used=fact_check['engine_used']
        )

        # d) Alegações e Evidências
        for claim_data in fact_check.get('claims', []):
            claim_obj = ClaimVerification.objects.create(
                report=report_obj,
                claim_text=claim_data.get('claim', ''),
                category=claim_data.get('category', 'Geral'),
                verdict=claim_data.get('verdict', 'Não verificada'),
                confidence_score=claim_data.get('confidence', 50),
                explanation=claim_data.get('explanation', ''),
                scientific_consensus=claim_data.get('scientific_consensus', '')
            )
            for src_data in claim_data.get('sources', []):
                EvidenceSource.objects.create(
                    claim=claim_obj,
                    name=src_data.get('name', 'Fonte Institucional'),
                    title=src_data.get('title', 'Documento de Referência'),
                    url=src_data.get('url', 'https://www.gov.br'),
                    quote=src_data.get('quote', ''),
                    is_official=src_data.get('isOfficial', True)
                )

        # Retorna serializado diretamente via DRF
        serializer = InvestigationReportSerializer(report_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({'error': f"Erro ao processar auditoria no Django: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def investigation_history_view(request):
    """
    Retorna o histórico persistido de investigações no banco de dados SQLite via Django ORM.
    """
    reports = InvestigationReport.objects.select_related('profile').prefetch_related('claims__sources').all()[:50]
    serializer = InvestigationReportSerializer(reports, many=True)
    return Response(serializer.data)


def _postzen_error_response(err: PostZenApiError) -> Response:
    headers = {}
    if err.retry_after is not None:
        headers['Retry-After'] = str(err.retry_after)
    return Response(err.to_dict(), status=err.status_code, headers=headers)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_status_view(request):
    """
    Retorna o estado da configuração PostZen (somente leitura, sem segredos).
    """
    return Response(get_postzen_config_status(), status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_accounts_view(request):
    """
    Lista contas TikTok autorizadas conectadas na conta PostZen.
    """
    refresh = str(request.query_params.get('refresh', '')).lower() in ('1', 'true', 'yes')
    try:
        data = list_connected_tiktok_accounts(use_cache=not refresh)
        return Response(data, status=status.HTTP_200_OK)
    except PostZenApiError as err:
        return _postzen_error_response(err)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_analytics_view(request):
    """
    Recupera métricas de publicações e insights de conta TikTok conectada via PostZen.
    """
    query_serializer = PostZenAnalyticsQuerySerializer(data=request.query_params)
    if not query_serializer.is_valid():
        return Response(
            {
                'error': True,
                'errorCode': 'bad_request',
                'message': 'Parâmetros de consulta inválidos para analytics do PostZen.',
                'details': query_serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    params = query_serializer.validated_data
    try:
        data = fetch_tiktok_analytics(
            account_id=params.get('accountId') or None,
            post_id=params.get('postId') or None,
            from_date=params.get('fromDate') or None,
            to_date=params.get('toDate') or None,
            page=params.get('page', 1),
            limit=params.get('limit', 20),
            sort_by=params.get('sortBy') or None,
            order=params.get('order') or None,
            include_account_insights=params.get('includeInsights', True),
            use_cache=not params.get('refresh', False),
        )
        return Response(data, status=status.HTTP_200_OK)
    except PostZenApiError as err:
        return _postzen_error_response(err)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_followers_view(request):
    """
    Recupera estatísticas e crescimento de seguidores de conta TikTok conectada via PostZen.
    """
    query_serializer = PostZenFollowersQuerySerializer(data=request.query_params)
    if not query_serializer.is_valid():
        return Response(
            {
                'error': True,
                'errorCode': 'bad_request',
                'message': 'Parâmetros de consulta inválidos para seguidores do PostZen.',
                'details': query_serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    params = query_serializer.validated_data
    try:
        data = fetch_tiktok_follower_stats(
            account_id=params.get('accountId') or None,
            from_date=params.get('fromDate') or None,
            to_date=params.get('toDate') or None,
            granularity=params.get('granularity') or None,
            use_cache=not params.get('refresh', False),
        )
        return Response(data, status=status.HTTP_200_OK)
    except PostZenApiError as err:
        return _postzen_error_response(err)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_comments_view(request):
    """
    Recupera comentários (somente leitura) de conta elegível TikTok for Business via PostZen.
    """
    query_serializer = PostZenCommentsQuerySerializer(data=request.query_params)
    if not query_serializer.is_valid():
        return Response(
            {
                'error': True,
                'errorCode': 'bad_request',
                'message': 'Parâmetros de consulta inválidos para comentários do PostZen.',
                'details': query_serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    params = query_serializer.validated_data
    try:
        data = fetch_tiktok_comments(
            account_id=params.get('accountId') or None,
            post_id=params.get('postId') or None,
            page=params.get('page', 1),
            limit=params.get('limit', 20),
            cursor=params.get('cursor') or None,
            use_cache=not params.get('refresh', False),
        )
        return Response(data, status=status.HTTP_200_OK)
    except PostZenApiError as err:
        return _postzen_error_response(err)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_profiles_view(request):
    """
    Lista perfis disponíveis no PostZen (GET /v1/profiles) para iniciar conexões OAuth do TikTok.
    """
    refresh = str(request.query_params.get('refresh', '')).lower() in ('1', 'true', 'yes')
    try:
        data = list_postzen_profiles(use_cache=not refresh)
        return Response(data, status=status.HTTP_200_OK)
    except PostZenApiError as err:
        return _postzen_error_response(err)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_connect_url_view(request):
    """
    Inicia o fluxo oficial OAuth TikTok via PostZen (GET /v1/connect/tiktok).
    Retorna authUrl e state com validade de 10 minutos.
    """
    query_serializer = PostZenConnectUrlQuerySerializer(data=request.query_params)
    if not query_serializer.is_valid():
        return Response(
            {
                'error': True,
                'errorCode': 'bad_request',
                'message': 'Parâmetros inválidos para iniciar a conexão TikTok via PostZen.',
                'details': query_serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    params = query_serializer.validated_data
    redirect_url = (params.get('redirectUrl') or '').strip()
    if not redirect_url:
        redirect_url = request.build_absolute_uri('/api/integrations/postzen/connect/callback/')

    try:
        data = create_tiktok_connect_url(
            profile_id=params.get('profileId') or None,
            account_id=params.get('accountId') or None,
            redirect_url=redirect_url,
        )
        return Response(data, status=status.HTTP_200_OK)
    except PostZenApiError as err:
        return _postzen_error_response(err)


@api_view(['GET'])
@permission_classes([AllowAny])
def postzen_connect_callback_view(request):
    """
    Recebe o callback OAuth do PostZen após autorização no TikTok, valida o state (expiração de 10 min)
    e atualiza a lista de contas conectadas via GET /v1/accounts.
    """
    try:
        result = handle_tiktok_connect_callback(dict(request.query_params.items()))
    except PostZenApiError as err:
        result = {
            'success': False,
            'statusCode': err.status_code,
            'errorCode': err.code,
            'message': err.message,
        }

    wants_json = (
        str(request.query_params.get('format', '')).lower() == 'json'
        or 'application/json' in str(request.headers.get('Accept', '')).lower()
    )
    if wants_json:
        return Response(result, status=result.get('statusCode', 200))

    qs_params = {
        'postzen_connect': 'success' if result.get('success') else 'error',
    }
    if result.get('errorCode'):
        qs_params['errorCode'] = str(result['errorCode'])
    if result.get('message'):
        qs_params['message'] = str(result['message'])
    if result.get('username'):
        qs_params['username'] = str(result['username'])
    if result.get('tiktokAccountsCount') is not None:
        qs_params['accountsCount'] = str(result['tiktokAccountsCount'])

    return HttpResponseRedirect(f"/?{urlencode(qs_params)}")


