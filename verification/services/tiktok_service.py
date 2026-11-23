"""Normalização de links do TikTok e obtenção dos dados.

Contas conectadas vêm do PostZen; para o resto, usa o texto colado pelo usuário ou
perfis de exemplo. Não faz scraping.
"""

from datetime import datetime
import urllib.parse
from typing import Dict, Any, Optional

from .postzen_client import PostZenClient
from .postzen_accounts import list_connected_tiktok_accounts
from .postzen_analytics import fetch_tiktok_analytics


def normalize_tiktok_input(user_input: str) -> Dict[str, Any]:
    """
    Normaliza e extrai dados estruturados a partir de uma URL ou identificador do TikTok.
    Exemplos:
      - https://www.tiktok.com/@saude_vital/video/7389201928371928392
      - https://vm.tiktok.com/ZMxxxxxx/
      - @saude_vital
      - saude_vital
    """
    trimmed = (user_input or '').strip()
    if not trimmed:
        raise ValueError("Entrada vazia. Forneça uma URL de vídeo, perfil ou @usuário do TikTok.")

    # Se for uma URL completa
    if 'tiktok.com' in trimmed:
        url_str = trimmed if trimmed.startswith('http') else f"https://{trimmed}"
        parsed = urllib.parse.urlparse(url_str)
        path_parts = [p for p in parsed.path.split('/') if p]

        # Formato padrão: /@username/video/{video_id}
        user_part = next((p for p in path_parts if p.startswith('@')), None)
        video_idx = -1
        for idx, p in enumerate(path_parts):
            if p == 'video':
                video_idx = idx
                break

        if user_part and video_idx != -1 and len(path_parts) > video_idx + 1:
            clean_username = user_part.replace('@', '')
            video_id = path_parts[video_idx + 1].split('?')[0]
            return {
                'type': 'video',
                'username': clean_username,
                'video_id': video_id,
                'clean_input': f"@{clean_username} (Vídeo {video_id})",
                'url': f"https://www.tiktok.com/@{clean_username}/video/{video_id}"
            }

        if user_part:
            clean_username = user_part.replace('@', '')
            return {
                'type': 'profile',
                'username': clean_username,
                'video_id': None,
                'clean_input': f"@{clean_username}",
                'url': f"https://www.tiktok.com/@{clean_username}"
            }

        # Links encurtados vm.tiktok.com
        return {
            'type': 'video',
            'username': 'criador_tiktok',
            'video_id': None,
            'clean_input': trimmed,
            'url': url_str
        }

    # Se for identificador numérico
    if trimmed.isdigit() and len(trimmed) >= 15:
        return {
            'type': 'video',
            'username': 'criador_tiktok',
            'video_id': trimmed,
            'clean_input': f"Vídeo ID {trimmed}",
            'url': f"https://www.tiktok.com/video/{trimmed}"
        }

    clean_user = trimmed.replace('@', '').strip()
    return {
        'type': 'profile',
        'username': clean_user,
        'video_id': None,
        'clean_input': f"@{clean_user}",
        'url': f"https://www.tiktok.com/@{clean_user}"
    }


def get_demo_tiktok_dataset(username_or_topic: str) -> Dict[str, Any]:
    """
    Retorna conjuntos de dados curados para demonstração e pesquisa acadêmica,
    respeitando os cenários clássicos de desinformação no TikTok (Saúde, Finanças, Notícias).
    """
    clean = username_or_topic.lower()

    if 'saude' in clean or 'vital' in clean or 'cura' in clean:
        return {
            'profile': {
                'username': 'saude_vital_brasil',
                'fullName': 'Saúde & Vitalidade Natural',
                'avatarUrl': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=150',
                'isVerified': False,
                'followersCount': 148500,
                'followingCount': 120,
                'likesReceivedCount': 1250000,
                'videosCount': 42,
                'biography': 'Dicas de saúde natural e receitas secretas para curar qualquer mal-estar.',
                'category': 'Saúde & Bem-estar',
                'profileUrl': 'https://www.tiktok.com/@saude_vital_brasil'
            },
            'posts': [
                {
                    'id': 'tt_video_01',
                    'videoId': '7389201928371928301',
                    'type': 'video',
                    'caption': 'Chá da Amazônia reverte diabetes tipo 2 em 48 horas! A indústria farmacêutica quer esconder.',
                    'transcript': 'Basta tomar 200ml dessa erva fervida antes de dormir para que seu pâncreas produza insulina nova em 48 horas e destrua a glicose alta para sempre.',
                    'soundTitle': 'Áudio original - Saúde e Vida',
                    'timestamp': '2026-10-18T14:30:00Z',
                    'formattedDate': '18/10/2026',
                    'viewsCount': 892000,
                    'likesCount': 64200,
                    'commentsCount': 3820,
                    'sharesCount': 18400,
                    'isOutlier': True,
                    'url': 'https://www.tiktok.com/@saude_vital_brasil/video/7389201928371928301',
                    'thumbnailUrl': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400'
                },
                {
                    'id': 'tt_video_02',
                    'videoId': '7389201928371928302',
                    'type': 'video',
                    'caption': 'Receita de suco verde matinal com maçã, couve e gengibre para desinchar.',
                    'transcript': 'Suco com ingredientes comuns para auxiliar na hidratação diária.',
                    'soundTitle': 'Som relaxante acústico',
                    'timestamp': '2026-10-14T09:15:00Z',
                    'formattedDate': '14/10/2026',
                    'viewsCount': 24500,
                    'likesCount': 1850,
                    'commentsCount': 110,
                    'sharesCount': 230,
                    'isOutlier': False,
                    'url': 'https://www.tiktok.com/@saude_vital_brasil/video/7389201928371928302',
                    'thumbnailUrl': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'
                },
                {
                    'id': 'tt_video_03',
                    'videoId': '7389201928371928303',
                    'type': 'video',
                    'caption': 'Água com limão morna em jejum emagrece 10kg em uma semana sem exercício.',
                    'transcript': 'Essa mistura dissolve gordura visceral enquanto você dorme, comprovado em estudo chinês.',
                    'soundTitle': 'Música motivacional de academia',
                    'timestamp': '2026-10-09T18:00:00Z',
                    'formattedDate': '09/10/2026',
                    'viewsCount': 420000,
                    'likesCount': 28900,
                    'commentsCount': 1420,
                    'sharesCount': 9200,
                    'isOutlier': True,
                    'url': 'https://www.tiktok.com/@saude_vital_brasil/video/7389201928371928303',
                    'thumbnailUrl': 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400'
                }
            ]
        }

    # Padrão: perfil geral sob auditoria
    return {
        'profile': {
            'username': clean.replace('@', '') or 'criador_tiktok',
            'fullName': f"Canal TikTok {clean.replace('@', '').capitalize()}",
            'avatarUrl': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            'isVerified': False,
            'followersCount': 50000,
            'followingCount': 200,
            'likesReceivedCount': 450000,
            'videosCount': 18,
            'biography': 'Perfil público investigado através da plataforma Fato ou Farsa.',
            'category': 'Geral',
            'profileUrl': f"https://www.tiktok.com/@{clean.replace('@', '')}"
        },
        'posts': [
            {
                'id': 'tt_generic_01',
                'videoId': '7390001928371928001',
                'type': 'video',
                'caption': 'Conteúdo recente publicado pelo perfil no TikTok para verificação.',
                'transcript': 'Declaração sob análise de evidências e conformidade institucional.',
                'soundTitle': 'Áudio Original',
                'timestamp': '2026-10-20T12:00:00Z',
                'formattedDate': '20/10/2026',
                'viewsCount': 78000,
                'likesCount': 5200,
                'commentsCount': 340,
                'sharesCount': 810,
                'isOutlier': False,
                'url': f"https://www.tiktok.com/@{clean.replace('@', '')}",
                'thumbnailUrl': 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400'
            }
        ]
    }


def fetch_tiktok_content(
    username_or_url: str,
    manual_transcript: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ponto de entrada unificado para obtenção de dados do TikTok exclusivamente via PostZen:
    1. Se POSTZEN_API_KEY estiver configurada e o @usuário pertencer às contas TikTok conectadas no PostZen,
       recupera as publicações e métricas reais da conta autorizada.
    2. Caso contrário (sem raspagem de terceiros), utiliza transcrição manual ou dataset didático transparente.
    """
    normalized = normalize_tiktok_input(username_or_url)
    target_username = normalized.get('username') or 'criador_tiktok'

    pz_client = PostZenClient()
    if pz_client.is_configured:
        try:
            accounts_res = list_connected_tiktok_accounts(client=pz_client, use_cache=True)
            matched_account = next(
                (
                    acc
                    for acc in accounts_res.get('accounts', [])
                    if acc.get('username', '').lower() == target_username.lower()
                    or acc.get('id') == target_username
                ),
                None,
            )
            if matched_account and matched_account.get('isActive'):
                analytics = fetch_tiktok_analytics(
                    account_id=matched_account['id'],
                    include_insights=True,
                    client=pz_client,
                )
                insights_obj = (analytics.get('accountInsights') or {}).get('insights') or {}
                followers_count = insights_obj.get('followerCount') or insights_obj.get('followersCount') or 0

                raw_posts = analytics.get('posts') or []
                mapped_posts = []
                for idx, p in enumerate(raw_posts):
                    metrics = p.get('metrics') or {}
                    mapped_posts.append({
                        'id': p.get('postId') or f"postzen_{idx}",
                        'videoId': p.get('postId') or '',
                        'type': 'video',
                        'caption': p.get('title') or 'Publicação TikTok conectada via PostZen',
                        'transcript': manual_transcript if (manual_transcript and idx == 0) else '',
                        'timestamp': p.get('publishedAt') or '',
                        'formattedDate': str(p.get('publishedAt') or 'Recente')[:10],
                        'viewsCount': metrics.get('views'),
                        'likesCount': metrics.get('likes'),
                        'commentsCount': metrics.get('comments'),
                        'sharesCount': metrics.get('shares'),
                        'isOutlier': False,
                        'anomalyScore': 0.0,
                        'url': p.get('permalink') or f"https://www.tiktok.com/@{matched_account['username']}",
                        'thumbnailUrl': 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400',
                    })

                return {
                    'source': 'postzen_api',
                    'isLiveApi': True,
                    'statusMessage': 'Dados obtidos exclusivamente da conta TikTok autorizada via PostZen API.',
                    'retrievedAt': datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
                    'profile': {
                        'username': matched_account['username'],
                        'fullName': matched_account.get('displayName') or matched_account['username'],
                        'avatarUrl': matched_account.get('profilePicture') or '',
                        'isVerified': False,
                        'followersCount': followers_count,
                        'followingCount': 0,
                        'likesReceivedCount': 0,
                        'videosCount': len(mapped_posts),
                        'biography': f"Conta TikTok conectada via PostZen ({matched_account.get('connectionLabel')}).",
                        'category': 'Conta Autorizada PostZen',
                        'profileUrl': f"https://www.tiktok.com/@{matched_account['username']}",
                    },
                    'posts': mapped_posts,
                    'apiDetails': {
                        'provider': 'PostZen',
                        'endpoint': '/v1/accounts e /v1/analytics',
                        'connectionType': matched_account.get('connectionType'),
                    },
                }
        except Exception as exc:
            print(f"[TikTokService Django/PostZen] Aviso ao consultar conta autorizada: {exc}")

    curated = get_demo_tiktok_dataset(target_username)
    posts = curated.get('posts', [])

    if manual_transcript and posts:
        posts[0]['transcript'] = manual_transcript
        posts[0]['caption'] = f"{posts[0].get('caption', '')} (Transcrição informada pelo usuário)"

    return {
        'source': 'sandbox_dataset' if not manual_transcript else 'manual_input',
        'isLiveApi': False,
        'statusMessage': (
            'Modo de Pesquisa / Simulação Transparente: apenas contas TikTok conectadas via PostZen possuem acesso direto à API. Operando com amostragem didática e checagem factual direta.'
            if not manual_transcript else
            'Fluxo de Entrada Informada: Legenda e transcrição fornecidas manualmente para verificação factual.'
        ),
        'retrievedAt': datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
        'profile': curated['profile'],
        'posts': posts,
        'apiDetails': {
            'provider': 'PostZen (exclusivo) + Entrada Manual',
            'note': 'Em conformidade com a política anti-scraping e uso exclusivo do PostZen'
        }
    }

