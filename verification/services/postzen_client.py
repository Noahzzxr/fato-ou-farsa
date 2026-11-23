"""Cliente HTTP do PostZen (somente leitura).

Bearer token, timeout, retry, tratamento de 429 (Retry-After) e cache em memória.
A chave nunca é devolvida nas respostas nem escrita em log.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional, Tuple

import requests

try:
    from django.conf import settings as django_settings
except Exception:
    django_settings = None

try:
    from postzen import PostZen as PostZenSDK
    HAS_POSTZEN_SDK = True
except Exception:
    PostZenSDK = None
    HAS_POSTZEN_SDK = False


OFFICIAL_POSTZEN_DASHBOARD_URL = "https://app.postzen.dev"
DEFAULT_POSTZEN_BASE_URL = "https://api.postzen.dev"
PLACEHOLDER_KEY_PREFIXES = (
    "replace_with",
    "sua_chave",
    "seu_token",
    "your_",
    "example",
)


def _get_setting(name: str, default: Any = None) -> Any:
    if django_settings is not None:
        try:
            if getattr(django_settings, "configured", True) and hasattr(django_settings, name):
                val = getattr(django_settings, name)
                if val not in (None, ""):
                    return val
        except Exception:
            pass
    env_val = os.environ.get(name)
    if env_val not in (None, ""):
        return env_val
    return default


def is_placeholder_api_key(api_key: Optional[str]) -> bool:
    if not api_key:
        return True
    cleaned = str(api_key).strip()
    if not cleaned:
        return True
    lower = cleaned.lower()
    return any(lower.startswith(prefix) for prefix in PLACEHOLDER_KEY_PREFIXES)


def mask_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    cleaned = str(value).strip()
    if len(cleaned) <= 8:
        return "***"
    return f"{cleaned[:4]}...{cleaned[-4:]}"


def parse_retry_after_seconds(header_value: Optional[str]) -> Optional[int]:
    if not header_value:
        return None
    raw = str(header_value).strip()
    if not raw:
        return None
    if raw.isdigit():
        return max(1, int(raw))
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = int((dt - datetime.now(timezone.utc)).total_seconds())
        return max(1, delta)
    except Exception:
        return None


def num_or_none(value: Any) -> Optional[float]:
    """
    Preserva estritamente a diferença entre 0 explícito e valor ausente/indisponível (None).
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(stripped) if stripped.isdigit() else float(stripped)
        except ValueError:
            return None
    return None


def int_or_none(value: Any) -> Optional[int]:
    val = num_or_none(value)
    if val is None:
        return None
    return int(round(val))


def current_sync_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class PostZenApiError(Exception):
    """Erro estruturado e seguro (sem segredos) para falhas na API PostZen."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 502,
        retry_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "configured": self.code != "missing_api_key",
            "readOnly": True,
            "error": True,
            "errorCode": self.code,
            "message": self.message,
            "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
        }
        if self.retry_after is not None:
            payload["retryAfterSeconds"] = self.retry_after
        if self.details:
            payload["details"] = self.details
        return payload


class _TTLCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._store: Dict[str, Tuple[float, str, Any]] = {}

    def get(self, key: str) -> Optional[Tuple[str, Any]]:
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, synced_at, payload = entry
            if now >= expires_at:
                del self._store[key]
                return None
            return synced_at, payload

    def set(self, key: str, payload: Any, ttl_seconds: int) -> str:
        synced_at = current_sync_timestamp()
        if ttl_seconds <= 0:
            return synced_at
        expires_at = time.monotonic() + ttl_seconds
        with self._lock:
            self._store[key] = (expires_at, synced_at, payload)
        return synced_at

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


_POSTZEN_CACHE = _TTLCache()


def clear_postzen_cache() -> None:
    _POSTZEN_CACHE.clear()


def get_postzen_config_status() -> Dict[str, Any]:
    api_key = str(_get_setting("POSTZEN_API_KEY", "") or "").strip()
    base_url = str(_get_setting("POSTZEN_BASE_URL", DEFAULT_POSTZEN_BASE_URL) or DEFAULT_POSTZEN_BASE_URL).strip().rstrip("/")
    timeout_seconds = float(_get_setting("POSTZEN_TIMEOUT_SECONDS", 10) or 10)
    cache_ttl_seconds = int(_get_setting("POSTZEN_CACHE_TTL_SECONDS", 120) or 120)
    configured = not is_placeholder_api_key(api_key)

    return {
        "configured": configured,
        "provider": "PostZen",
        "baseUrl": base_url,
        "apiPrefix": "/v1",
        "sdkAvailable": HAS_POSTZEN_SDK,
        "readOnly": True,
        "timeoutSeconds": timeout_seconds,
        "cacheTtlSeconds": cache_ttl_seconds,
        "dashboardUrl": OFFICIAL_POSTZEN_DASHBOARD_URL,
        "message": (
            "Provedor exclusivo PostZen configurado no backend para contas TikTok autorizadas."
            if configured
            else "Chave POSTZEN_API_KEY não configurada no servidor. Defina no arquivo .env para conectar e consultar contas TikTok via PostZen."
        ),
        "oauthConnectEndpoint": "/api/integrations/postzen/connect/url/",
        "supportedCapabilities": [
            "Descoberta de perfis PostZen e geração segura de link OAuth TikTok (/v1/connect/tiktok)",
            "Descoberta de contas TikTok conectadas (/v1/accounts)",
            "Métricas de publicações (visualizações, curtidas, comentários, compartilhamentos)",
            "Métricas avançadas e insights para contas TikTok for Business",
            "Histórico de seguidores e comentários autorizados (somente leitura)",
        ],
    }


class PostZenClient:
    """
    Cliente estritamente SOMENTE LEITURA para a API PostZen (/v1/*).
    Não implementa nem permite operações de publicação, agendamento, resposta ou moderação.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        cache_ttl_seconds: Optional[int] = None,
        max_retries: Optional[int] = None,
        session: Optional[requests.Session] = None,
    ) -> None:
        raw_key = api_key if api_key is not None else _get_setting("POSTZEN_API_KEY", "")
        self._api_key = str(raw_key or "").strip()
        raw_base = base_url if base_url is not None else _get_setting("POSTZEN_BASE_URL", DEFAULT_POSTZEN_BASE_URL)
        self.base_url = str(raw_base or DEFAULT_POSTZEN_BASE_URL).strip().rstrip("/")
        self.timeout_seconds = float(
            timeout_seconds if timeout_seconds is not None else _get_setting("POSTZEN_TIMEOUT_SECONDS", 10)
        )
        self.cache_ttl_seconds = int(
            cache_ttl_seconds if cache_ttl_seconds is not None else _get_setting("POSTZEN_CACHE_TTL_SECONDS", 120)
        )
        self.max_retries = int(
            max_retries if max_retries is not None else _get_setting("POSTZEN_MAX_RETRIES", 2)
        )
        self._session = session or requests.Session()
        self._sdk_client = None

        if HAS_POSTZEN_SDK and not is_placeholder_api_key(self._api_key):
            try:
                self._sdk_client = PostZenSDK(api_key=self._api_key, base_url=self.base_url)
            except TypeError:
                try:
                    self._sdk_client = PostZenSDK(api_key=self._api_key)
                except Exception:
                    self._sdk_client = None
            except Exception:
                self._sdk_client = None

    @property
    def is_configured(self) -> bool:
        return not is_placeholder_api_key(self._api_key)

    @property
    def sdk_client(self) -> Any:
        return self._sdk_client

    def _ensure_configured(self) -> None:
        if not self.is_configured:
            raise PostZenApiError(
                code="missing_api_key",
                message=(
                    "A chave POSTZEN_API_KEY não está configurada no servidor. "
                    "Defina a variável de ambiente no backend e conecte sua conta TikTok no painel oficial do PostZen."
                ),
                status_code=503,
            )

    def _cache_key(self, path: str, params: Optional[Dict[str, Any]]) -> str:
        key_hash = hashlib.sha256(self._api_key.encode("utf-8")).hexdigest()[:12]
        sorted_items = sorted((str(k), str(v)) for k, v in (params or {}).items() if v is not None)
        return f"{key_hash}|{self.base_url}|{path}|{sorted_items}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "User-Agent": "FatoOuFarsa-PostZen-ReadOnly/1.0",
        }

    def _map_http_error(self, resp: requests.Response) -> PostZenApiError:
        status_code = resp.status_code
        retry_after = parse_retry_after_seconds(resp.headers.get("Retry-After"))
        body_json: Dict[str, Any] = {}
        raw_text = ""

        try:
            parsed = resp.json()
            if isinstance(parsed, dict):
                body_json = parsed
        except Exception:
            raw_text = (resp.text or "")[:300]

        upstream_code = str(
            body_json.get("code")
            or body_json.get("errorCode")
            or body_json.get("error")
            or ""
        ).strip()
        upstream_msg = str(
            body_json.get("message")
            or body_json.get("detail")
            or (body_json.get("error") if isinstance(body_json.get("error"), str) else "")
            or raw_text
        ).strip()
        lower_combined = f"{upstream_code} {upstream_msg}".lower()

        if status_code == 401:
            return PostZenApiError(
                code="invalid_api_key",
                message="A chave da API PostZen é inválida, expirou ou foi revogada. Verifique a credencial no painel oficial do PostZen.",
                status_code=401,
            )

        if status_code == 402:
            upgrade_url = str(body_json.get("upgradeUrl") or body_json.get("upgrade_url") or "").strip()
            details = {"upgradeUrl": upgrade_url} if upgrade_url else {}
            return PostZenApiError(
                code="plan_account_limit",
                message="Limite de contas conectadas do plano atual no PostZen atingido. Faça upgrade ou desconecte outra conta no painel do PostZen.",
                status_code=402,
                details=details,
            )

        if status_code == 403:
            if any(term in lower_combined for term in ("read & write", "read-write", "readwrite", "connect", "write key")):
                return PostZenApiError(
                    code="connect_requires_read_write_key",
                    message=(
                        "A geração de URL OAuth via /v1/connect/tiktok exige uma POSTZEN_API_KEY com escopo Read & Write, "
                        f"ou conecte a conta diretamente no painel oficial do PostZen ({OFFICIAL_POSTZEN_DASHBOARD_URL})."
                    ),
                    status_code=403,
                )
            if any(term in lower_combined for term in ("entitlement", "plan", "upgrade", "subscription", "addon", "add-on", "feature")):
                return PostZenApiError(
                    code="missing_entitlement",
                    message="O plano ou recurso atual no PostZen não possui permissão para consultar este conjunto de dados.",
                    status_code=403,
                )
            return PostZenApiError(
                code="unauthorized",
                message="Acesso negado pela API PostZen para esta conta ou escopo solicitado.",
                status_code=403,
            )

        if status_code == 400:
            if "platformunsupported" in lower_combined or "unsupported" in lower_combined or "business" in lower_combined:
                return PostZenApiError(
                    code="unsupported_connection_type",
                    message="Este recurso exige uma conta conectada pelo fluxo TikTok for Business no PostZen (conexão anterior não suportada).",
                    status_code=400,
                )
            return PostZenApiError(
                code="bad_request",
                message=f"Parâmetros inválidos na consulta ao PostZen: {upstream_msg or 'verifique os filtros informados.'}",
                status_code=400,
            )

        if status_code == 404:
            return PostZenApiError(
                code="not_found",
                message="Conta ou publicação não encontrada no PostZen.",
                status_code=404,
            )

        if status_code == 429:
            wait_hint = f" Aguarde cerca de {retry_after}s antes de tentar novamente." if retry_after else " Aguarde alguns instantes antes de tentar novamente."
            return PostZenApiError(
                code="rate_limited",
                message=f"Limite de requisições da API PostZen atingido.{wait_hint}",
                status_code=429,
                retry_after=retry_after,
            )

        if status_code >= 500:
            return PostZenApiError(
                code="service_unavailable",
                message="O serviço externo PostZen está temporariamente indisponível. Tente sincronizar novamente em breve.",
                status_code=503,
            )

        return PostZenApiError(
            code="service_unavailable",
            message=f"Erro inesperado ao consultar a API PostZen (HTTP {status_code}).",
            status_code=502,
        )

    def get(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        use_cache: bool = True,
    ) -> Tuple[Any, Dict[str, Any]]:
        """
        Executa requisição GET autenticada em /v1/* com cache TTL e retentativas controladas.
        Retorna (dados_json, metadados_sincronizacao).
        """
        self._ensure_configured()

        normalized_path = path if path.startswith("/") else f"/{path}"
        if not normalized_path.startswith("/v1/"):
            normalized_path = f"/v1{normalized_path}"

        clean_params = {k: v for k, v in (params or {}).items() if v is not None and v != ""}
        cache_key = self._cache_key(normalized_path, clean_params)

        if use_cache:
            cached = _POSTZEN_CACHE.get(cache_key)
            if cached is not None:
                synced_at, cached_payload = cached
                return cached_payload, {
                    "cached": True,
                    "synchronizedAt": synced_at,
                    "endpoint": normalized_path,
                }

        url = f"{self.base_url}{normalized_path}"
        last_error: Optional[PostZenApiError] = None

        for attempt in range(self.max_retries + 1):
            try:
                resp = self._session.get(
                    url,
                    headers=self._headers(),
                    params=clean_params,
                    timeout=self.timeout_seconds,
                )
            except requests.exceptions.Timeout:
                last_error = PostZenApiError(
                    code="service_unavailable",
                    message="Tempo limite esgotado ao aguardar resposta da API PostZen.",
                    status_code=504,
                )
                if attempt < self.max_retries:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                raise last_error
            except requests.exceptions.RequestException:
                last_error = PostZenApiError(
                    code="service_unavailable",
                    message="Falha de rede ao se comunicar com a API PostZen.",
                    status_code=503,
                )
                if attempt < self.max_retries:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                raise last_error

            if resp.status_code in (502, 503, 504) and attempt < self.max_retries:
                time.sleep(0.2 * (attempt + 1))
                continue

            if resp.status_code >= 400:
                raise self._map_http_error(resp)

            try:
                payload = resp.json()
            except ValueError:
                raise PostZenApiError(
                    code="invalid_response",
                    message="A API PostZen retornou uma resposta inválida (não-JSON).",
                    status_code=502,
                )

            synced_at = _POSTZEN_CACHE.set(cache_key, payload, self.cache_ttl_seconds if use_cache else 0)
            return payload, {
                "cached": False,
                "synchronizedAt": synced_at,
                "endpoint": normalized_path,
            }

        if last_error:
            raise last_error
        raise PostZenApiError(
            code="service_unavailable",
            message="Não foi possível concluir a consulta à API PostZen.",
            status_code=503,
        )
