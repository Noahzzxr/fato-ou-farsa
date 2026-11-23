"""Perfis, conexão OAuth e contas conectadas no PostZen.

Fluxo:
1. GET /v1/profiles (profileId)
2. GET /v1/connect/tiktok (authUrl + state, que expira em 10 minutos)
3. Callback: valida o state e trata os erros documentados do TikTok
4. GET /v1/accounts (atualiza as contas conectadas)
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

from .postzen_client import (
    OFFICIAL_POSTZEN_DASHBOARD_URL,
    PostZenApiError,
    PostZenClient,
    clear_postzen_cache,
    current_sync_timestamp,
)


OAUTH_STATE_TTL_SECONDS = 600  # Documentação PostZen: state expira após 10 minutos

BUSINESS_INDICATOR_TOKENS = (
    "business",
    "tiktok_business",
    "tiktok-business",
    "tiktok_for_business",
    "insights",
    "account_insights",
    "comments",
    "inbox",
)

TIKTOK_OAUTH_CALLBACK_ERRORS = {
    "missing_tiktok_permissions": (
        "missing_tiktok_permissions",
        "Permissões obrigatórias do TikTok não foram concedidas durante a autorização. Marque todos os escopos solicitados e tente novamente.",
    ),
    "tiktok_account_mismatch": (
        "tiktok_account_mismatch",
        "A conta TikTok autenticada não corresponde à conta esperada para esta reconexão.",
    ),
    "tiktok_publish_in_progress": (
        "tiktok_publish_in_progress",
        "Há uma operação em andamento no TikTok que impediu a conclusão da reconexão. Aguarde alguns instantes e tente novamente.",
    ),
    "tiktok_account_already_connected": (
        "tiktok_account_already_connected",
        "Esta conta TikTok já está conectada em outro perfil ou espaço do PostZen.",
    ),
    "access_denied": (
        "access_denied",
        "A autorização no TikTok foi cancelada ou recusada pelo usuário.",
    ),
}


class _OAuthStateStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._states: Dict[str, Dict[str, Any]] = {}

    def _prune(self, now: float) -> None:
        expired = [k for k, v in self._states.items() if now >= v["expiresAt"]]
        for k in expired:
            del self._states[k]

    def register(
        self,
        state: str,
        profile_id: Optional[str] = None,
        account_id: Optional[str] = None,
        redirect_url: Optional[str] = None,
        ttl_seconds: int = OAUTH_STATE_TTL_SECONDS,
    ) -> None:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            self._states[state] = {
                "profileId": profile_id,
                "accountId": account_id,
                "redirectUrl": redirect_url,
                "createdAt": current_sync_timestamp(),
                "expiresAt": now + ttl_seconds,
            }

    def consume(self, state: str) -> Dict[str, Any]:
        cleaned = str(state or "").strip()
        if not cleaned:
            return {"valid": False, "reason": "missing_state"}
        now = time.monotonic()
        with self._lock:
            entry = self._states.get(cleaned)
            if not entry:
                self._prune(now)
                return {"valid": False, "reason": "invalid_state"}
            del self._states[cleaned]
            if now >= entry["expiresAt"]:
                return {"valid": False, "reason": "expired_state"}
            return {"valid": True, "entry": entry}

    def clear(self) -> None:
        with self._lock:
            self._states.clear()


_POSTZEN_OAUTH_STATES = _OAuthStateStore()


def clear_postzen_oauth_states() -> None:
    _POSTZEN_OAUTH_STATES.clear()


def register_postzen_oauth_state_for_test(
    state: str,
    profile_id: Optional[str] = None,
    account_id: Optional[str] = None,
    ttl_seconds: int = OAUTH_STATE_TTL_SECONDS,
) -> None:
    _POSTZEN_OAUTH_STATES.register(
        state=state,
        profile_id=profile_id,
        account_id=account_id,
        ttl_seconds=ttl_seconds,
    )


def _extract_raw_accounts(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("accounts", "data", "items", "results"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
            if isinstance(candidate, dict):
                nested = candidate.get("accounts") or candidate.get("items")
                if isinstance(nested, list):
                    return [item for item in nested if isinstance(item, dict)]
    return []


def _extract_raw_profiles(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("profiles", "data", "items", "results"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
            if isinstance(candidate, dict):
                nested = candidate.get("profiles") or candidate.get("items")
                if isinstance(nested, list):
                    return [item for item in nested if isinstance(item, dict)]
    return []


def normalize_postzen_profile(raw: Dict[str, Any]) -> Dict[str, Any]:
    profile_id = str(raw.get("_id") or raw.get("id") or raw.get("field_id") or raw.get("profileId") or "").strip()
    return {
        "id": profile_id,
        "name": str(raw.get("name") or raw.get("title") or profile_id or "Perfil PostZen").strip(),
        "description": str(raw.get("description") or "").strip(),
        "isDefault": bool(raw.get("isDefault") or raw.get("default")),
        "createdAt": raw.get("createdAt"),
    }


def list_postzen_profiles(
    client: Optional[PostZenClient] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    pz_client = client or PostZenClient()
    raw_payload, sync_meta = pz_client.get("/v1/profiles", use_cache=use_cache)
    raw_profiles = _extract_raw_profiles(raw_payload)
    profiles = [normalize_postzen_profile(p) for p in raw_profiles if p]
    profiles = [p for p in profiles if p["id"]]

    default_profile = next((p for p in profiles if p["isDefault"]), profiles[0] if profiles else None)
    return {
        "configured": True,
        "readOnly": True,
        "profilesCount": len(profiles),
        "profiles": profiles,
        "defaultProfileId": default_profile["id"] if default_profile else None,
        "synchronizedAt": sync_meta.get("synchronizedAt") or current_sync_timestamp(),
        "cached": bool(sync_meta.get("cached")),
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
    }


def _infer_connection_type(raw: Dict[str, Any]) -> str:
    explicit = str(
        raw.get("connectionType")
        or raw.get("connection_type")
        or raw.get("authType")
        or raw.get("accountType")
        or raw.get("providerVariant")
        or ""
    ).strip().lower()

    if any(tok in explicit for tok in ("earlier", "legacy", "basic", "classic")):
        return "earlier_connection"

    if raw.get("isBusiness") is True or raw.get("isTikTokBusiness") is True:
        return "tiktok_business"

    if any(tok in explicit for tok in ("business", "tiktok_for_business")):
        return "tiktok_business"

    capabilities = raw.get("capabilities")
    if isinstance(capabilities, dict):
        if capabilities.get("comments") or capabilities.get("accountInsights") or capabilities.get("inbox"):
            return "tiktok_business"

    scopes = raw.get("scopes") or raw.get("permissions") or []
    if isinstance(scopes, (list, tuple)):
        joined = " ".join(str(s).lower() for s in scopes)
        if any(tok in joined for tok in BUSINESS_INDICATOR_TOKENS):
            return "tiktok_business"

    return "earlier_connection"


def _infer_token_status(raw: Dict[str, Any]) -> str:
    status_str = str(
        raw.get("tokenStatus")
        or raw.get("connectionStatus")
        or raw.get("status")
        or ""
    ).strip().lower()

    if any(word in status_str for word in ("revoked", "disconnected")):
        return "revoked"
    if any(word in status_str for word in ("expired", "needs_reconnect", "needsreauth", "reconnect")):
        return "expired"
    if raw.get("needsReauth") is True or raw.get("needsReconnect") is True or raw.get("isExpired") is True:
        return "expired"
    if raw.get("isActive") is False:
        return "expired"
    if status_str in ("active", "connected", "valid", "ok") or raw.get("isActive") is True:
        return "active"
    return "active"


def normalize_tiktok_account(raw: Dict[str, Any]) -> Dict[str, Any]:
    account_id = str(raw.get("id") or raw.get("_id") or raw.get("field_id") or raw.get("accountId") or "").strip()
    username = str(
        raw.get("username")
        or raw.get("handle")
        or raw.get("screenName")
        or raw.get("displayName")
        or account_id
        or "conta_tiktok"
    ).strip().lstrip("@")
    display_name = str(raw.get("displayName") or raw.get("name") or raw.get("username") or username).strip()
    connection_type = _infer_connection_type(raw)
    token_status = _infer_token_status(raw)
    is_business = connection_type == "tiktok_business"

    capabilities = {
        "basicMetrics": True,
        "businessMetrics": is_business,
        "accountInsights": is_business,
        "comments": is_business,
        "followerStats": True,
        "readOnly": True,
    }

    available_permissions = [
        "Leitura de métricas básicas de publicações (visualizações, curtidas, comentários, compartilhamentos)",
        "Estatísticas de crescimento de seguidores",
    ]
    if is_business:
        available_permissions.extend([
            "Métricas avançadas de publicação (alcance, salvamentos, tempo médio/total de exibição, taxa de conclusão, novos seguidores)",
            "Insights da conta (demografia e atividade quando elegível >= 100 seguidores)",
            "Leitura de comentários da conta conectada (somente leitura)",
        ])

    reconnection_required = token_status in ("expired", "revoked")

    return {
        "id": account_id,
        "platform": "tiktok",
        "username": username,
        "displayName": display_name,
        "profilePicture": str(raw.get("profilePicture") or raw.get("avatarUrl") or raw.get("picture") or ""),
        "connectionType": connection_type,
        "connectionLabel": "TikTok for Business" if is_business else "Conexão TikTok anterior",
        "tokenStatus": token_status,
        "isActive": token_status == "active",
        "reconnectionRequired": reconnection_required,
        "capabilities": capabilities,
        "availablePermissions": available_permissions,
        "guidance": (
            f"A autorização desta conta expirou ou foi revogada. Reconecte-a via OAuth do PostZen ou no painel ({OFFICIAL_POSTZEN_DASHBOARD_URL})."
            if reconnection_required
            else (
                "Conta conectada via TikTok for Business com suporte completo de leitura analítica."
                if is_business
                else "Conexão anterior do TikTok: métricas básicas disponíveis; insights de conta e comentários exigem reconexão via TikTok for Business."
            )
        ),
    }


def list_connected_tiktok_accounts(
    client: Optional[PostZenClient] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    pz_client = client or PostZenClient()
    raw_payload, sync_meta = pz_client.get("/v1/accounts", use_cache=use_cache)
    raw_accounts = _extract_raw_accounts(raw_payload)

    tiktok_accounts = [
        normalize_tiktok_account(acc)
        for acc in raw_accounts
        if str(acc.get("platform") or "").strip().lower() == "tiktok"
    ]

    return {
        "configured": True,
        "readOnly": True,
        "platform": "tiktok",
        "totalAccounts": len(raw_accounts),
        "tiktokAccountsCount": len(tiktok_accounts),
        "accounts": tiktok_accounts,
        "hasConnectedTikTok": len(tiktok_accounts) > 0,
        "synchronizedAt": sync_meta.get("synchronizedAt") or current_sync_timestamp(),
        "cached": bool(sync_meta.get("cached")),
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
        "guidance": (
            f"{len(tiktok_accounts)} conta(s) TikTok autorizada(s) encontrada(s) no PostZen."
            if tiktok_accounts
            else "Nenhuma conta TikTok conectada no PostZen. Utilize 'Conectar conta TikTok via PostZen' para iniciar o fluxo OAuth."
        ),
    }


def create_tiktok_connect_url(
    profile_id: Optional[str] = None,
    account_id: Optional[str] = None,
    redirect_url: Optional[str] = None,
    client: Optional[PostZenClient] = None,
) -> Dict[str, Any]:
    """
    Inicia o fluxo oficial de conexão OAuth do TikTok via PostZen:
    - Obtém o profileId via GET /v1/profiles caso não informado (e sem accountId de reconexão)
    - Chama GET /v1/connect/tiktok para obter { authUrl, state }
    - Registra state por 10 minutos para proteção CSRF no callback
    """
    pz_client = client or PostZenClient()
    resolved_profile_id = str(profile_id or "").strip() or None
    resolved_account_id = str(account_id or "").strip() or None
    resolved_redirect_url = str(redirect_url or "").strip() or None

    if not resolved_profile_id and not resolved_account_id:
        profiles_res = list_postzen_profiles(client=pz_client, use_cache=False)
        resolved_profile_id = profiles_res.get("defaultProfileId")
        if not resolved_profile_id:
            raise PostZenApiError(
                code="no_profile_found",
                message=(
                    "Nenhum perfil PostZen encontrado para vincular a conta TikTok. "
                    f"Crie um perfil no painel oficial do PostZen ({OFFICIAL_POSTZEN_DASHBOARD_URL}) e tente novamente."
                ),
                status_code=400,
            )

    params: Dict[str, Any] = {}
    if resolved_account_id:
        params["accountId"] = resolved_account_id
    if resolved_profile_id:
        params["profileId"] = resolved_profile_id
    if resolved_redirect_url:
        params["redirectUrl"] = resolved_redirect_url

    raw_payload, sync_meta = pz_client.get("/v1/connect/tiktok", params=params, use_cache=False)
    if not isinstance(raw_payload, dict):
        raise PostZenApiError(
            code="invalid_response",
            message="Resposta inesperada ao solicitar URL de conexão OAuth ao PostZen.",
            status_code=502,
        )

    auth_url = str(raw_payload.get("authUrl") or raw_payload.get("url") or "").strip()
    state = str(raw_payload.get("state") or "").strip()

    if not auth_url or not state:
        raise PostZenApiError(
            code="invalid_response",
            message="A API PostZen não retornou authUrl ou state válidos para a autorização do TikTok.",
            status_code=502,
        )

    _POSTZEN_OAUTH_STATES.register(
        state=state,
        profile_id=resolved_profile_id,
        account_id=resolved_account_id,
        redirect_url=resolved_redirect_url,
        ttl_seconds=OAUTH_STATE_TTL_SECONDS,
    )

    return {
        "configured": True,
        "provider": "PostZen",
        "platform": "tiktok",
        "authUrl": auth_url,
        "state": state,
        "expiresInSeconds": OAUTH_STATE_TTL_SECONDS,
        "profileId": resolved_profile_id,
        "accountId": resolved_account_id,
        "redirectUrl": resolved_redirect_url,
        "usage": raw_payload.get("usage"),
        "synchronizedAt": sync_meta.get("synchronizedAt") or current_sync_timestamp(),
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
    }


def handle_tiktok_connect_callback(
    query_params: Dict[str, Any],
    client: Optional[PostZenClient] = None,
) -> Dict[str, Any]:
    """
    Processa o retorno do callback OAuth do PostZen para TikTok:
    - Valida o parâmetro state contra CSRF/expiração (10 minutos)
    - Trata erros documentados do TikTok OAuth
    - Limpa cache e atualiza a lista de contas conectadas via GET /v1/accounts
    """
    state = str(query_params.get("state") or "").strip()
    err_param = str(query_params.get("error") or "").strip()
    missing_scopes = str(query_params.get("missing_scopes") or "").strip()
    affected_scheduled = str(query_params.get("affected_scheduled_videos") or "").strip()

    state_check = _POSTZEN_OAUTH_STATES.consume(state)
    if not state_check.get("valid"):
        reason = state_check.get("reason")
        if reason == "missing_state":
            return {
                "success": False,
                "statusCode": 400,
                "errorCode": "missing_oauth_state",
                "message": "Parâmetro OAuth 'state' ausente no retorno da autorização do TikTok.",
            }
        if reason == "expired_state":
            return {
                "success": False,
                "statusCode": 400,
                "errorCode": "expired_oauth_state",
                "message": "A sessão de autorização OAuth do TikTok expirou (limite de 10 minutos). Inicie uma nova conexão.",
            }
        return {
            "success": False,
            "statusCode": 400,
            "errorCode": "invalid_oauth_state",
            "message": "Token OAuth 'state' inválido ou já utilizado. Por segurança, inicie uma nova tentativa de conexão.",
        }

    if err_param:
        mapped_code, mapped_msg = TIKTOK_OAUTH_CALLBACK_ERRORS.get(
            err_param,
            (err_param, f"A autorização do TikTok retornou erro: {err_param}."),
        )
        if mapped_code == "missing_tiktok_permissions" and missing_scopes:
            mapped_msg = f"{mapped_msg} Escopos ausentes: {missing_scopes}."
        return {
            "success": False,
            "statusCode": 400,
            "errorCode": mapped_code,
            "missingScopes": [s.strip() for s in missing_scopes.split(",") if s.strip()] if missing_scopes else [],
            "message": mapped_msg,
        }

    clear_postzen_cache()
    pz_client = client or PostZenClient()
    accounts_data = list_connected_tiktok_accounts(client=pz_client, use_cache=False)

    return {
        "success": True,
        "statusCode": 200,
        "connected": accounts_data.get("hasConnectedTikTok", False),
        "tiktokAccountsCount": accounts_data.get("tiktokAccountsCount", 0),
        "accounts": accounts_data.get("accounts", []),
        "username": query_params.get("username") or None,
        "accountId": query_params.get("accountId") or state_check.get("entry", {}).get("accountId"),
        "profileId": state_check.get("entry", {}).get("profileId"),
        "affectedScheduledVideos": affected_scheduled or None,
        "synchronizedAt": accounts_data.get("synchronizedAt") or current_sync_timestamp(),
        "message": (
            "Conta TikTok autorizada e sincronizada com sucesso via PostZen."
            if accounts_data.get("hasConnectedTikTok")
            else "Autorização OAuth confirmada no PostZen."
        ),
    }


def resolve_tiktok_account(
    account_id: Optional[str] = None,
    client: Optional[PostZenClient] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    accounts_res = list_connected_tiktok_accounts(client=client, use_cache=use_cache)
    accounts = accounts_res.get("accounts", [])

    if not accounts:
        return {
            "found": False,
            "account": None,
            "accountsResponse": accounts_res,
        }

    if account_id:
        requested = str(account_id).strip()
        match = next(
            (acc for acc in accounts if acc["id"] == requested or acc["username"].lower() == requested.lstrip("@").lower()),
            None,
        )
        if not match:
            raise PostZenApiError(
                code="not_found",
                message=(
                    "A conta solicitada não está conectada no PostZen ou não pertence às contas TikTok autorizadas. "
                    "Apenas contas conectadas e autorizadas podem ser consultadas."
                ),
                status_code=404,
            )
        return {
            "found": True,
            "account": match,
            "accountsResponse": accounts_res,
        }

    active_account = next((acc for acc in accounts if acc.get("isActive")), accounts[0])
    return {
        "found": True,
        "account": active_account,
        "accountsResponse": accounts_res,
    }

