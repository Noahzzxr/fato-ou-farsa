"""Leitura de comentários (GET /v1/inbox/comments) para contas TikTok for Business.

Não responde, oculta nem apaga comentários.
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
)


def _extract_raw_comments(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("comments", "data", "items", "results"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
            if isinstance(candidate, dict):
                nested = candidate.get("comments") or candidate.get("items")
                if isinstance(nested, list):
                    return [item for item in nested if isinstance(item, dict)]
    return []


def normalize_comment_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    author = raw.get("author") if isinstance(raw.get("author"), dict) else {}
    return {
        "id": str(raw.get("id") or raw.get("_id") or raw.get("commentId") or ""),
        "postId": str(raw.get("postId") or raw.get("videoId") or ""),
        "authorName": str(
            raw.get("authorName")
            or author.get("name")
            or author.get("displayName")
            or raw.get("username")
            or "Usuário"
        ),
        "authorHandle": str(
            raw.get("authorHandle")
            or author.get("username")
            or author.get("handle")
            or ""
        ),
        "text": str(raw.get("text") or raw.get("content") or raw.get("message") or ""),
        "createdAt": raw.get("createdAt") or raw.get("publishedAt") or raw.get("timestamp") or None,
        "likesCount": int_or_none(raw.get("likesCount") if "likesCount" in raw else raw.get("likeCount")),
        "repliesCount": int_or_none(raw.get("repliesCount") if "repliesCount" in raw else raw.get("replyCount")),
    }


def fetch_tiktok_comments(
    account_id: Optional[str] = None,
    post_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    cursor: Optional[str] = None,
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
            "supported": False,
            "account": None,
            "comments": [],
            "pagination": {"page": page, "limit": limit, "total": 0, "hasMore": False, "nextCursor": None},
            "synchronizedAt": resolved["accountsResponse"]["synchronizedAt"],
            "cached": resolved["accountsResponse"]["cached"],
            "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
            "message": f"Nenhuma conta TikTok conectada no PostZen. Conecte uma conta TikTok for Business em {OFFICIAL_POSTZEN_DASHBOARD_URL}.",
        }

    account = resolved["account"]
    if account.get("connectionType") != "tiktok_business":
        raise PostZenApiError(
            code="unsupported_connection_type",
            message=(
                "A leitura de comentários via PostZen exige uma conta conectada pelo fluxo TikTok for Business. "
                "Contas com conexão anterior não suportam o endpoint de comentários."
            ),
            status_code=400,
        )

    params: Dict[str, Any] = {
        "accountId": account["id"],
        "page": page,
        "limit": limit,
    }
    if post_id:
        params["postId"] = post_id
    if cursor:
        params["cursor"] = cursor

    payload, sync_meta = pz_client.get("/v1/inbox/comments", params=params, use_cache=use_cache)
    raw_comments = _extract_raw_comments(payload)
    comments = [normalize_comment_item(c) for c in raw_comments]

    pag = payload.get("pagination") if isinstance(payload, dict) and isinstance(payload.get("pagination"), dict) else (payload if isinstance(payload, dict) else {})
    total = int_or_none(pag.get("total"))

    return {
        "configured": True,
        "readOnly": True,
        "hasConnectedAccount": True,
        "supported": True,
        "account": account,
        "comments": comments,
        "pagination": {
            "page": int_or_none(pag.get("page")) or page,
            "limit": int_or_none(pag.get("limit")) or limit,
            "total": total if total is not None else len(comments),
            "hasMore": bool(pag.get("hasMore", False)),
            "nextCursor": pag.get("nextCursor") or None,
        },
        "synchronizedAt": sync_meta.get("synchronizedAt") or current_sync_timestamp(),
        "cached": bool(sync_meta.get("cached")),
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
        "message": (
            f"{len(comments)} comentário(s) recuperado(s) em modo somente leitura."
            if comments
            else "Nenhum comentário encontrado para esta conta ou publicação."
        ),
    }
