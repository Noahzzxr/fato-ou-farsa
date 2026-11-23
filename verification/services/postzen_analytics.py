"""Analytics, account insights e seguidores (PostZen).

Usa GET /v1/analytics, /v1/analytics/account-insights e /v1/accounts/follower-stats.
0 e None (indisponível) são mantidos diferentes.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .postzen_accounts import resolve_tiktok_account
from .postzen_client import (
    OFFICIAL_POSTZEN_DASHBOARD_URL,
    PostZenApiError,
    PostZenClient,
    current_sync_timestamp,
    int_or_none,
    num_or_none,
)


PLATFORM_NOTES_PT_BR = [
    "As métricas do TikTok no PostZen podem apresentar atraso de atualização de 24 a 48 horas.",
    "O histórico de métricas e seguidores pode ser limitado aos últimos 60 dias na API do TikTok.",
    "Dados demográficos e de audiência exigem no mínimo 100 seguidores na conta autorizada.",
    "Métricas ausentes são exibidas como indisponíveis (null), nunca substituídas por zero.",
    "Dados do PostZen são contexto de plataforma e não constituem checagem factual nem prova de autenticidade.",
]


def _pick_metric(source: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        if key in source and source[key] is not None:
            return num_or_none(source[key])
    return None


def _pick_int_metric(source: Dict[str, Any], *keys: str) -> Optional[int]:
    for key in keys:
        if key in source and source[key] is not None:
            return int_or_none(source[key])
    return None


def normalize_post_analytics_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    metrics = raw.get("metrics") if isinstance(raw.get("metrics"), dict) else {}
    combined = {**metrics, **raw}

    # Extração estrita: não converte campos ausentes em 0
    views = _pick_int_metric(combined, "views", "viewCount", "viewsCount", "playCount")
    likes = _pick_int_metric(combined, "likes", "likeCount", "likesCount")
    comments = _pick_int_metric(combined, "comments", "commentCount", "commentsCount")
    shares = _pick_int_metric(combined, "shares", "shareCount", "sharesCount")
    engagement_rate = _pick_metric(combined, "engagementRate", "engagement_rate")

    reach = _pick_int_metric(combined, "reach", "uniqueViews")
    saves = _pick_int_metric(combined, "saves", "saveCount", "favorites", "collectCount")
    avg_watch_time_ms = _pick_metric(combined, "avgWatchTimeMs", "averageWatchTimeMs", "avgWatchTime")
    total_watch_time_ms = _pick_metric(combined, "totalWatchTimeMs", "totalWatchTime")
    completion_rate = _pick_metric(combined, "completionRate", "fullVideoWatchedRate")
    new_followers = _pick_int_metric(combined, "newFollowers", "followersGained")

    insights = raw.get("insights") if isinstance(raw.get("insights"), dict) else None

    return {
        "postId": str(raw.get("postId") or raw.get("id") or raw.get("_id") or ""),
        "accountId": str(raw.get("accountId") or ""),
        "platform": "tiktok",
        "title": str(raw.get("title") or raw.get("caption") or raw.get("content") or "Publicação TikTok"),
        "publishedAt": raw.get("publishedAt") or raw.get("createdAt") or None,
        "permalink": raw.get("permalink") or raw.get("platformPostUrl") or raw.get("url") or None,
        "metrics": {
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "engagementRate": engagement_rate,
            "reach": reach,
            "saves": saves,
            "avgWatchTimeMs": avg_watch_time_ms,
            "totalWatchTimeMs": total_watch_time_ms,
            "completionRate": completion_rate,
            "newFollowers": new_followers,
        },
        "insights": insights,
    }


def _extract_analytics_posts(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("posts", "analytics", "data", "items", "results"):
            val = payload.get(key)
            if isinstance(val, list):
                return [item for item in val if isinstance(item, dict)]
            if isinstance(val, dict):
                nested = val.get("posts") or val.get("items") or val.get("records")
                if isinstance(nested, list):
                    return [item for item in nested if isinstance(item, dict)]
    return []


def _extract_pagination(payload: Any, page: int, limit: int, count: int) -> Dict[str, Any]:
    if isinstance(payload, dict):
        pag = payload.get("pagination") if isinstance(payload.get("pagination"), dict) else payload
        total = int_or_none(pag.get("total"))
        return {
            "page": int_or_none(pag.get("page")) or page,
            "limit": int_or_none(pag.get("limit")) or limit,
            "total": total if total is not None else count,
            "hasMore": bool(pag.get("hasMore", False)),
        }
    return {"page": page, "limit": limit, "total": count, "hasMore": False}


def fetch_tiktok_account_insights(
    account: Dict[str, Any],
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    client: Optional[PostZenClient] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    if account.get("connectionType") != "tiktok_business":
        return {
            "supported": False,
            "reasonCode": "unsupported_connection_type",
            "message": "Insights de conta exigem conexão TikTok for Business no PostZen (conexão anterior não suporta este endpoint).",
            "availability": None,
            "insights": None,
        }

    pz_client = client or PostZenClient()
    params: Dict[str, Any] = {"accountId": account["id"]}
    if from_date:
        params["fromDate"] = from_date
    if to_date:
        params["toDate"] = to_date

    try:
        payload, sync_meta = pz_client.get("/v1/analytics/account-insights", params=params, use_cache=use_cache)
    except PostZenApiError as err:
        if err.code in ("unsupported_connection_type", "missing_entitlement", "unauthorized", "not_found"):
            return {
                "supported": False,
                "reasonCode": err.code,
                "message": err.message,
                "availability": None,
                "insights": None,
            }
        raise

    data_obj = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else (payload if isinstance(payload, dict) else {})
    availability = data_obj.get("availability") if isinstance(data_obj.get("availability"), dict) else None
    follower_count = int_or_none(data_obj.get("followerCount") or data_obj.get("followersCount"))

    threshold_notice = None
    if follower_count is not None and follower_count < 100:
        threshold_notice = "Dados demográficos e de audiência exigem ao menos 100 seguidores na conta conectada."
    elif isinstance(availability, dict) and availability.get("audienceAvailable") is False:
        threshold_notice = availability.get("reason") or "Dados de audiência indisponíveis no momento (verifique o requisito mínimo de 100 seguidores)."

    return {
        "supported": True,
        "reasonCode": None,
        "message": "Insights de conta obtidos com sucesso.",
        "availability": availability,
        "followerThresholdNotice": threshold_notice,
        "insights": data_obj,
        "synchronizedAt": sync_meta.get("synchronizedAt"),
        "cached": bool(sync_meta.get("cached")),
    }


def fetch_tiktok_analytics(
    account_id: Optional[str] = None,
    post_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    sort_by: Optional[str] = None,
    order: Optional[str] = None,
    include_account_insights: bool = True,
    client: Optional[PostZenClient] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    pz_client = client or PostZenClient()
    resolved = resolve_tiktok_account(account_id=account_id, client=pz_client, use_cache=use_cache)

    if not resolved["found"]:
        return {
            "configured": True,
            "readOnly": True,
            "hasConnectedAccount": False,
            "account": None,
            "posts": [],
            "pagination": {"page": page, "limit": limit, "total": 0, "hasMore": False},
            "accountInsights": None,
            "synchronizedAt": resolved["accountsResponse"]["synchronizedAt"],
            "cached": resolved["accountsResponse"]["cached"],
            "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
            "message": f"Nenhuma conta TikTok conectada no PostZen. Conecte sua conta em {OFFICIAL_POSTZEN_DASHBOARD_URL} para visualizar analytics.",
            "platformNotes": PLATFORM_NOTES_PT_BR,
        }

    account = resolved["account"]
    params: Dict[str, Any] = {
        "platform": "tiktok",
        "accountId": account["id"],
        "page": page,
        "limit": limit,
    }
    if post_id:
        params["postId"] = post_id
    if from_date:
        params["fromDate"] = from_date
    if to_date:
        params["toDate"] = to_date
    if sort_by:
        params["sortBy"] = sort_by
    if order:
        params["order"] = order

    payload, sync_meta = pz_client.get("/v1/analytics", params=params, use_cache=use_cache)
    raw_posts = _extract_analytics_posts(payload)
    posts = [normalize_post_analytics_item(item) for item in raw_posts]
    pagination = _extract_pagination(payload, page, limit, len(posts))

    account_insights = None
    if include_account_insights:
        account_insights = fetch_tiktok_account_insights(
            account=account,
            from_date=from_date,
            to_date=to_date,
            client=pz_client,
            use_cache=use_cache,
        )

    overview = payload.get("overview") if isinstance(payload, dict) and isinstance(payload.get("overview"), dict) else None

    return {
        "configured": True,
        "readOnly": True,
        "hasConnectedAccount": True,
        "account": account,
        "overview": overview,
        "posts": posts,
        "pagination": pagination,
        "accountInsights": account_insights,
        "synchronizedAt": sync_meta.get("synchronizedAt") or current_sync_timestamp(),
        "cached": bool(sync_meta.get("cached")),
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
        "message": (
            f"{len(posts)} registro(s) analítico(s) recuperado(s) do PostZen."
            if posts
            else "Nenhuma métrica de publicação disponível no período selecionado."
        ),
        "platformNotes": PLATFORM_NOTES_PT_BR,
    }


def fetch_tiktok_follower_stats(
    account_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    granularity: Optional[str] = None,
    client: Optional[PostZenClient] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    pz_client = client or PostZenClient()
    resolved = resolve_tiktok_account(account_id=account_id, client=pz_client, use_cache=use_cache)

    if not resolved["found"]:
        return {
            "configured": True,
            "readOnly": True,
            "hasConnectedAccount": False,
            "account": None,
            "supported": False,
            "stats": [],
            "summary": None,
            "synchronizedAt": resolved["accountsResponse"]["synchronizedAt"],
            "cached": resolved["accountsResponse"]["cached"],
            "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
            "message": f"Nenhuma conta TikTok conectada no PostZen. Conecte uma conta em {OFFICIAL_POSTZEN_DASHBOARD_URL}.",
            "platformNotes": PLATFORM_NOTES_PT_BR,
        }

    account = resolved["account"]
    params: Dict[str, Any] = {"accountId": account["id"]}
    if from_date:
        params["fromDate"] = from_date
    if to_date:
        params["toDate"] = to_date
    if granularity:
        params["granularity"] = granularity

    try:
        payload, sync_meta = pz_client.get("/v1/accounts/follower-stats", params=params, use_cache=use_cache)
    except PostZenApiError as err:
        if err.code in ("unsupported_connection_type", "missing_entitlement"):
            return {
                "configured": True,
                "readOnly": True,
                "hasConnectedAccount": True,
                "account": account,
                "supported": False,
                "reasonCode": err.code,
                "stats": [],
                "summary": None,
                "synchronizedAt": current_sync_timestamp(),
                "cached": False,
                "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
                "message": err.message,
                "platformNotes": PLATFORM_NOTES_PT_BR,
            }
        raise

    data_obj = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else (payload if isinstance(payload, dict) else {})
    raw_series = []
    for key in ("stats", "series", "timeline", "history", "data"):
        candidate = data_obj.get(key) if isinstance(data_obj, dict) else None
        if isinstance(candidate, list):
            raw_series = [item for item in candidate if isinstance(item, dict)]
            break
    if isinstance(payload, list):
        raw_series = [item for item in payload if isinstance(item, dict)]

    stats_series = [
        {
            "date": item.get("date") or item.get("timestamp") or None,
            "followersCount": _pick_int_metric(item, "followersCount", "followerCount", "followers", "count"),
            "netChange": _pick_int_metric(item, "netChange", "change", "newFollowers", "delta"),
        }
        for item in raw_series
    ]

    summary = {
        "currentFollowers": _pick_int_metric(data_obj, "currentFollowers", "followerCount", "followersCount"),
        "netChange": _pick_int_metric(data_obj, "netChange", "totalChange", "newFollowers"),
        "growthRate": _pick_metric(data_obj, "growthRate", "growthPercentage"),
    }

    return {
        "configured": True,
        "readOnly": True,
        "hasConnectedAccount": True,
        "account": account,
        "supported": True,
        "stats": stats_series,
        "summary": summary,
        "synchronizedAt": sync_meta.get("synchronizedAt") or current_sync_timestamp(),
        "cached": bool(sync_meta.get("cached")),
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
        "message": (
            "Histórico de seguidores obtido com sucesso."
            if stats_series or summary["currentFollowers"] is not None
            else "Nenhum dado histórico de seguidores disponível para o período informado."
        ),
        "platformNotes": PLATFORM_NOTES_PT_BR,
    }
