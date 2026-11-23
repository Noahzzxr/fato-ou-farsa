// Cliente PostZen (somente leitura) — mesma lógica de verification/services/postzen_*.py.
// A POSTZEN_API_KEY fica só no servidor. Faz retry em 502/503/504, respeita Retry-After no 429
// e guarda respostas em cache por alguns segundos. 0 e null (indisponível) são tratados como coisas diferentes.

import crypto from 'crypto';

export const OFFICIAL_POSTZEN_DASHBOARD_URL = 'https://app.postzen.dev';
export const DEFAULT_POSTZEN_BASE_URL = 'https://api.postzen.dev';

const PLACEHOLDER_PREFIXES = [
  'replace_with',
  'sua_chave',
  'seu_token',
  'your_',
  'example',
];

const PLATFORM_NOTES_PT_BR = [
  'As métricas do TikTok no PostZen podem apresentar atraso de atualização de 24 a 48 horas.',
  'O histórico de métricas e seguidores pode ser limitado aos últimos 60 dias na API do TikTok.',
  'Dados demográficos e de audiência exigem no mínimo 100 seguidores na conta autorizada.',
  'Métricas ausentes são exibidas como indisponíveis (null), nunca substituídas por zero.',
  'Dados do PostZen são contexto de plataforma e não constituem checagem factual nem prova de autenticidade.',
];

export const OAUTH_STATE_TTL_SECONDS = 600; // Documentação PostZen: state expira após 10 minutos

export type PostZenErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'unauthorized'
  | 'connect_requires_read_write_key'
  | 'plan_account_limit'
  | 'no_profile_found'
  | 'missing_entitlement'
  | 'unsupported_connection_type'
  | 'rate_limited'
  | 'not_found'
  | 'bad_request'
  | 'service_unavailable'
  | 'invalid_response';

export class PostZenApiError extends Error {
  code: PostZenErrorCode;
  statusCode: number;
  retryAfter?: number;
  details?: Record<string, any>;

  constructor(
    code: PostZenErrorCode,
    message: string,
    statusCode = 502,
    retryAfter?: number,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'PostZenApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    this.details = details;
  }

  toJSON() {
    const out: Record<string, any> = {
      configured: this.code !== 'missing_api_key',
      readOnly: true,
      error: true,
      errorCode: this.code,
      message: this.message,
      dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
    };
    if (this.retryAfter !== undefined) {
      out.retryAfterSeconds = this.retryAfter;
    }
    if (this.details && Object.keys(this.details).length > 0) {
      out.details = this.details;
    }
    return out;
  }
}

export function isPlaceholderApiKey(apiKey?: string | null): boolean {
  if (!apiKey) return true;
  const trimmed = String(apiKey).trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function parseRetryAfterSeconds(headerValue?: string | null): number | undefined {
  if (!headerValue) return undefined;
  const raw = String(headerValue).trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    return Math.max(1, parseInt(raw, 10));
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const diff = Math.ceil((parsed - Date.now()) / 1000);
    return Math.max(1, diff);
  }
  return undefined;
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function intOrNull(value: unknown): number | null {
  const num = numOrNull(value);
  if (num === null) return null;
  return Math.round(num);
}

interface CacheEntry {
  expiresAt: number;
  syncedAt: string;
  payload: any;
}

const ttlCache = new Map<string, CacheEntry>();

export function clearPostZenCache() {
  ttlCache.clear();
}

export function getPostZenConfigStatus(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = String(env.POSTZEN_API_KEY || '').trim();
  const baseUrl =
    String(env.POSTZEN_BASE_URL || '').trim().replace(/\/+$/, '') || DEFAULT_POSTZEN_BASE_URL;
  const timeoutSeconds = Number(env.POSTZEN_TIMEOUT_SECONDS || 10) || 10;
  const cacheTtlSeconds = Number(env.POSTZEN_CACHE_TTL_SECONDS || 120) || 120;
  const configured = !isPlaceholderApiKey(apiKey);

  return {
    configured,
    provider: 'PostZen',
    baseUrl,
    apiPrefix: '/v1',
    sdkAvailable: false,
    readOnly: true,
    timeoutSeconds,
    cacheTtlSeconds,
    dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
    message: configured
      ? 'Provedor exclusivo PostZen configurado no backend para contas TikTok autorizadas.'
      : 'Chave POSTZEN_API_KEY não configurada no servidor. Defina no arquivo .env para conectar e consultar contas TikTok via PostZen.',
    oauthConnectEndpoint: '/api/integrations/postzen/connect/url/',
    supportedCapabilities: [
      'Descoberta de perfis PostZen e geração segura de link OAuth TikTok (/v1/connect/tiktok)',
      'Descoberta de contas TikTok conectadas (/v1/accounts)',
      'Métricas de publicações (visualizações, curtidas, comentários, compartilhamentos)',
      'Métricas avançadas e insights para contas TikTok for Business',
      'Histórico de seguidores e comentários autorizados (somente leitura)',
    ],
  };
}

export interface PostZenClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlSeconds?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class PostZenClient {
  private readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PostZenClientOptions = {}) {
    this.apiKey = String(
      options.apiKey !== undefined ? options.apiKey : process.env.POSTZEN_API_KEY || ''
    ).trim();
    const rawBaseUrl = options.baseUrl !== undefined ? options.baseUrl : process.env.POSTZEN_BASE_URL;
    this.baseUrl =
      String(rawBaseUrl || '').trim().replace(/\/+$/, '') || DEFAULT_POSTZEN_BASE_URL;
    this.timeoutMs =
      options.timeoutMs ?? ((Number(process.env.POSTZEN_TIMEOUT_SECONDS || 10) || 10) * 1000);
    this.cacheTtlSeconds =
      options.cacheTtlSeconds ?? (Number(process.env.POSTZEN_CACHE_TTL_SECONDS || 120) || 120);
    this.maxRetries =
      options.maxRetries ?? (Number(process.env.POSTZEN_MAX_RETRIES || 2) || 2);
    this.fetchImpl = options.fetchImpl || fetch;
  }

  get isConfigured(): boolean {
    return !isPlaceholderApiKey(this.apiKey);
  }

  private ensureConfigured() {
    if (!this.isConfigured) {
      throw new PostZenApiError(
        'missing_api_key',
        'A chave POSTZEN_API_KEY não está configurada no servidor. Defina a variável de ambiente no backend e conecte sua conta TikTok no painel oficial do PostZen.',
        503
      );
    }
  }

  private buildCacheKey(path: string, params: Record<string, any>): string {
    const keyHash = crypto.createHash('sha256').update(this.apiKey).digest('hex').slice(0, 12);
    const sorted = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    return `${keyHash}|${this.baseUrl}|${path}|${JSON.stringify(sorted)}`;
  }

  private async mapHttpError(resp: Response): Promise<PostZenApiError> {
    const retryAfter = parseRetryAfterSeconds(resp.headers.get('retry-after'));
    let bodyJson: Record<string, any> = {};
    let rawText = '';

    try {
      const text = await resp.text();
      rawText = text.slice(0, 300);
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        bodyJson = parsed;
      }
    } catch {
      // ignore non-JSON upstream error body
    }

    const upstreamCode = String(bodyJson.code || bodyJson.errorCode || bodyJson.error || '').trim();
    const upstreamMsg = String(
      bodyJson.message ||
        bodyJson.detail ||
        (typeof bodyJson.error === 'string' ? bodyJson.error : '') ||
        rawText
    ).trim();
    const combined = `${upstreamCode} ${upstreamMsg}`.toLowerCase();

    if (resp.status === 401) {
      return new PostZenApiError(
        'invalid_api_key',
        'A chave da API PostZen é inválida, expirou ou foi revogada. Verifique a credencial no painel oficial do PostZen.',
        401
      );
    }

    if (resp.status === 402) {
      const upgradeUrl = String(bodyJson.upgradeUrl || bodyJson.upgrade_url || '').trim();
      const details = upgradeUrl ? { upgradeUrl } : undefined;
      return new PostZenApiError(
        'plan_account_limit',
        'Limite de contas conectadas do plano atual no PostZen atingido. Faça upgrade ou desconecte outra conta no painel do PostZen.',
        402,
        undefined,
        details
      );
    }

    if (resp.status === 403) {
      if (/(read & write|read-write|readwrite|write key|connect)/.test(combined)) {
        return new PostZenApiError(
          'connect_requires_read_write_key',
          `A geração de URL OAuth via /v1/connect/tiktok exige uma POSTZEN_API_KEY com escopo Read & Write, ou conecte a conta diretamente no painel oficial do PostZen (${OFFICIAL_POSTZEN_DASHBOARD_URL}).`,
          403
        );
      }
      if (/(entitlement|plan|upgrade|subscription|addon|add-on|feature)/.test(combined)) {
        return new PostZenApiError(
          'missing_entitlement',
          'O plano ou recurso atual no PostZen não possui permissão para consultar este conjunto de dados.',
          403
        );
      }
      return new PostZenApiError(
        'unauthorized',
        'Acesso negado pela API PostZen para esta conta ou escopo solicitado.',
        403
      );
    }

    if (resp.status === 400) {
      if (/(platformunsupported|unsupported|business)/.test(combined)) {
        return new PostZenApiError(
          'unsupported_connection_type',
          'Este recurso exige uma conta conectada pelo fluxo TikTok for Business no PostZen (conexão anterior não suportada).',
          400
        );
      }
      return new PostZenApiError(
        'bad_request',
        `Parâmetros inválidos na consulta ao PostZen: ${upstreamMsg || 'verifique os filtros informados.'}`,
        400
      );
    }

    if (resp.status === 404) {
      return new PostZenApiError(
        'not_found',
        'Conta ou publicação não encontrada no PostZen.',
        404
      );
    }

    if (resp.status === 429) {
      const waitHint = retryAfter
        ? ` Aguarde cerca de ${retryAfter}s antes de tentar novamente.`
        : ' Aguarde alguns instantes antes de tentar novamente.';
      return new PostZenApiError(
        'rate_limited',
        `Limite de requisições da API PostZen atingido.${waitHint}`,
        429,
        retryAfter
      );
    }

    if (resp.status >= 500) {
      return new PostZenApiError(
        'service_unavailable',
        'O serviço externo PostZen está temporariamente indisponível. Tente sincronizar novamente em breve.',
        503
      );
    }

    return new PostZenApiError(
      'service_unavailable',
      `Erro inesperado ao consultar a API PostZen (HTTP ${resp.status}).`,
      502
    );
  }

  async get(
    path: string,
    params: Record<string, any> = {},
    useCache = true
  ): Promise<{ payload: any; cached: boolean; synchronizedAt: string; endpoint: string }> {
    this.ensureConfigured();

    let normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!normalizedPath.startsWith('/v1/')) {
      normalizedPath = `/v1${normalizedPath}`;
    }

    const cleanParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        cleanParams[k] = String(v);
      }
    }

    const cacheKey = this.buildCacheKey(normalizedPath, cleanParams);
    if (useCache) {
      const cached = ttlCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return {
          payload: cached.payload,
          cached: true,
          synchronizedAt: cached.syncedAt,
          endpoint: normalizedPath,
        };
      }
      if (cached) ttlCache.delete(cacheKey);
    }

    const urlObj = new URL(`${this.baseUrl}${normalizedPath}`);
    for (const [k, v] of Object.entries(cleanParams)) {
      urlObj.searchParams.set(k, v);
    }

    let lastError: PostZenApiError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const resp = await this.fetchImpl(urlObj.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            'User-Agent': 'FatoOuFarsa-PostZen-ReadOnly/1.0',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutHandle);

        if ([502, 503, 504].includes(resp.status) && attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
          continue;
        }

        if (resp.status >= 400) {
          throw await this.mapHttpError(resp);
        }

        let payload: any;
        try {
          payload = await resp.json();
        } catch {
          throw new PostZenApiError(
            'invalid_response',
            'A API PostZen retornou uma resposta inválida (não-JSON).',
            502
          );
        }

        const syncedAt = new Date().toISOString();
        if (useCache && this.cacheTtlSeconds > 0) {
          ttlCache.set(cacheKey, {
            expiresAt: Date.now() + this.cacheTtlSeconds * 1000,
            syncedAt,
            payload,
          });
        }

        return {
          payload,
          cached: false,
          synchronizedAt: syncedAt,
          endpoint: normalizedPath,
        };
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        if (err instanceof PostZenApiError) {
          throw err;
        }
        const isAbort = err?.name === 'AbortError';
        lastError = new PostZenApiError(
          'service_unavailable',
          isAbort
            ? 'Tempo limite esgotado ao aguardar resposta da API PostZen.'
            : 'Falha de rede ao se comunicar com a API PostZen.',
          isAbort ? 504 : 503
        );
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }
    }

    throw (
      lastError ||
      new PostZenApiError('service_unavailable', 'Não foi possível concluir a consulta à API PostZen.', 503)
    );
  }
}

function extractRawList(payload: any, keys: string[]): Record<string, any>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === 'object');
  }
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      const candidate = payload[key];
      if (Array.isArray(candidate)) {
        return candidate.filter((item) => item && typeof item === 'object');
      }
      if (candidate && typeof candidate === 'object') {
        for (const subKey of keys) {
          if (Array.isArray(candidate[subKey])) {
            return candidate[subKey].filter((item: any) => item && typeof item === 'object');
          }
        }
      }
    }
  }
  return [];
}

function inferConnectionType(raw: Record<string, any>): 'tiktok_business' | 'earlier_connection' {
  const explicit = String(
    raw.connectionType || raw.connection_type || raw.authType || raw.accountType || raw.providerVariant || ''
  )
    .trim()
    .toLowerCase();

  if (/(earlier|legacy|basic|classic)/.test(explicit)) {
    return 'earlier_connection';
  }
  if (raw.isBusiness === true || raw.isTikTokBusiness === true) {
    return 'tiktok_business';
  }
  if (/(business|tiktok_for_business)/.test(explicit)) {
    return 'tiktok_business';
  }
  if (raw.capabilities && typeof raw.capabilities === 'object') {
    if (raw.capabilities.comments || raw.capabilities.accountInsights || raw.capabilities.inbox) {
      return 'tiktok_business';
    }
  }
  const scopes = raw.scopes || raw.permissions;
  if (Array.isArray(scopes)) {
    const joined = scopes.map((s) => String(s).toLowerCase()).join(' ');
    if (/(business|insights|account_insights|comments|inbox)/.test(joined)) {
      return 'tiktok_business';
    }
  }
  return 'earlier_connection';
}

function inferTokenStatus(raw: Record<string, any>): 'active' | 'expired' | 'revoked' {
  const statusStr = String(raw.tokenStatus || raw.connectionStatus || raw.status || '')
    .trim()
    .toLowerCase();

  if (/(revoked|disconnected)/.test(statusStr)) return 'revoked';
  if (/(expired|needs_reconnect|reconnect)/.test(statusStr)) return 'expired';
  if (raw.needsReconnect === true || raw.isExpired === true || raw.isActive === false) return 'expired';
  return 'active';
}

export function normalizeTikTokAccount(raw: Record<string, any>) {
  const id = String(raw.id || raw._id || raw.field_id || raw.accountId || '').trim();
  const username = String(raw.username || raw.handle || raw.screenName || raw.displayName || id || 'conta_tiktok')
    .trim()
    .replace(/^@/, '');
  const displayName = String(raw.displayName || raw.name || raw.username || username).trim();
  const connectionType = inferConnectionType(raw);
  const tokenStatus = inferTokenStatus(raw);
  const isBusiness = connectionType === 'tiktok_business';
  const reconnectionRequired = tokenStatus === 'expired' || tokenStatus === 'revoked';

  const availablePermissions = [
    'Leitura de métricas básicas de publicações (visualizações, curtidas, comentários, compartilhamentos)',
    'Estatísticas de crescimento de seguidores',
  ];
  if (isBusiness) {
    availablePermissions.push(
      'Métricas avançadas de publicação (alcance, salvamentos, tempo médio/total de exibição, taxa de conclusão, novos seguidores)',
      'Insights da conta (demografia e atividade quando elegível >= 100 seguidores)',
      'Leitura de comentários da conta conectada (somente leitura)'
    );
  }

  return {
    id,
    platform: 'tiktok' as const,
    username,
    displayName,
    profilePicture: String(raw.profilePicture || raw.avatarUrl || raw.picture || ''),
    connectionType,
    connectionLabel: isBusiness ? 'TikTok for Business' : 'Conexão TikTok anterior',
    tokenStatus,
    isActive: tokenStatus === 'active',
    reconnectionRequired,
    capabilities: {
      basicMetrics: true,
      businessMetrics: isBusiness,
      accountInsights: isBusiness,
      comments: isBusiness,
      followerStats: true,
      readOnly: true,
    },
    availablePermissions,
    guidance: reconnectionRequired
      ? `A autorização desta conta expirou ou foi revogada. Reconecte-a no painel oficial do PostZen (${OFFICIAL_POSTZEN_DASHBOARD_URL}).`
      : isBusiness
        ? 'Conta conectada via TikTok for Business com suporte completo de leitura analítica.'
        : 'Conexão anterior do TikTok: métricas básicas disponíveis; insights de conta e comentários exigem reconexão via TikTok for Business.',
  };
}

interface OAuthStateEntry {
  profileId?: string;
  accountId?: string;
  redirectUrl?: string;
  createdAt: string;
  expiresAtMs: number;
}

const oauthStateStore = new Map<string, OAuthStateEntry>();

function pruneExpiredOAuthStates(now = Date.now()) {
  for (const [k, v] of oauthStateStore.entries()) {
    if (now >= v.expiresAtMs) {
      oauthStateStore.delete(k);
    }
  }
}

export function clearPostZenOAuthStates() {
  oauthStateStore.clear();
}

export function registerPostZenOAuthStateForTest(
  state: string,
  options: { profileId?: string; accountId?: string; ttlSeconds?: number } = {}
) {
  const ttlMs = (options.ttlSeconds ?? OAUTH_STATE_TTL_SECONDS) * 1000;
  oauthStateStore.set(state, {
    profileId: options.profileId,
    accountId: options.accountId,
    createdAt: new Date().toISOString(),
    expiresAtMs: Date.now() + ttlMs,
  });
}

const TIKTOK_OAUTH_CALLBACK_ERRORS: Record<string, { code: string; message: string }> = {
  missing_tiktok_permissions: {
    code: 'missing_tiktok_permissions',
    message:
      'Permissões obrigatórias do TikTok não foram concedidas durante a autorização. Marque todos os escopos solicitados e tente novamente.',
  },
  tiktok_account_mismatch: {
    code: 'tiktok_account_mismatch',
    message: 'A conta TikTok autenticada não corresponde à conta esperada para esta reconexão.',
  },
  tiktok_publish_in_progress: {
    code: 'tiktok_publish_in_progress',
    message:
      'Há uma operação em andamento no TikTok que impediu a conclusão da reconexão. Aguarde alguns instantes e tente novamente.',
  },
  tiktok_account_already_connected: {
    code: 'tiktok_account_already_connected',
    message: 'Esta conta TikTok já está conectada em outro perfil ou espaço do PostZen.',
  },
  access_denied: {
    code: 'access_denied',
    message: 'A autorização no TikTok foi cancelada ou recusada pelo usuário.',
  },
};

export function normalizePostZenProfile(raw: Record<string, any>) {
  const id = String(raw._id || raw.id || raw.field_id || raw.profileId || '').trim();
  return {
    id,
    name: String(raw.name || raw.title || id || 'Perfil PostZen').trim(),
    description: String(raw.description || '').trim(),
    isDefault: Boolean(raw.isDefault || raw.default),
    createdAt: raw.createdAt || null,
  };
}

export async function listPostZenProfiles(
  client: PostZenClient = new PostZenClient(),
  useCache = true
) {
  const { payload, cached, synchronizedAt } = await client.get('/v1/profiles', {}, useCache);
  const rawProfiles = extractRawList(payload, ['profiles', 'data', 'items', 'results']);
  const profiles = rawProfiles.map(normalizePostZenProfile).filter((p) => Boolean(p.id));
  const defaultProfile = profiles.find((p) => p.isDefault) || profiles[0] || null;

  return {
    configured: true,
    readOnly: true,
    profilesCount: profiles.length,
    profiles,
    defaultProfileId: defaultProfile ? defaultProfile.id : null,
    synchronizedAt,
    cached,
    dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
  };
}

export async function listConnectedTikTokAccounts(
  client: PostZenClient = new PostZenClient(),
  useCache = true
) {
  const { payload, cached, synchronizedAt } = await client.get('/v1/accounts', {}, useCache);
  const rawAccounts = extractRawList(payload, ['accounts', 'data', 'items', 'results']);

  const tiktokAccounts = rawAccounts
    .filter((acc) => String(acc.platform || '').trim().toLowerCase() === 'tiktok')
    .map(normalizeTikTokAccount);

  return {
    configured: true,
    readOnly: true,
    platform: 'tiktok',
    totalAccounts: rawAccounts.length,
    tiktokAccountsCount: tiktokAccounts.length,
    accounts: tiktokAccounts,
    hasConnectedTikTok: tiktokAccounts.length > 0,
    synchronizedAt,
    cached,
    dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
    guidance:
      tiktokAccounts.length > 0
        ? `${tiktokAccounts.length} conta(s) TikTok autorizada(s) encontrada(s) no PostZen.`
        : "Nenhuma conta TikTok conectada no PostZen. Utilize 'Conectar conta TikTok via PostZen' para iniciar o fluxo OAuth.",
  };
}

export interface ConnectTikTokOptions {
  profileId?: string;
  accountId?: string;
  redirectUrl?: string;
}

export async function createTikTokConnectUrl(
  options: ConnectTikTokOptions = {},
  client: PostZenClient = new PostZenClient()
) {
  let resolvedProfileId = String(options.profileId || '').trim() || undefined;
  const resolvedAccountId = String(options.accountId || '').trim() || undefined;
  const resolvedRedirectUrl = String(options.redirectUrl || '').trim() || undefined;

  if (!resolvedProfileId && !resolvedAccountId) {
    const profilesRes = await listPostZenProfiles(client, false);
    resolvedProfileId = profilesRes.defaultProfileId || undefined;
    if (!resolvedProfileId) {
      throw new PostZenApiError(
        'no_profile_found',
        `Nenhum perfil PostZen encontrado para vincular a conta TikTok. Crie um perfil no painel oficial do PostZen (${OFFICIAL_POSTZEN_DASHBOARD_URL}) e tente novamente.`,
        400
      );
    }
  }

  const params: Record<string, any> = {};
  if (resolvedAccountId) params.accountId = resolvedAccountId;
  if (resolvedProfileId) params.profileId = resolvedProfileId;
  if (resolvedRedirectUrl) params.redirectUrl = resolvedRedirectUrl;

  const { payload, synchronizedAt } = await client.get('/v1/connect/tiktok', params, false);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PostZenApiError(
      'invalid_response',
      'Resposta inesperada ao solicitar URL de conexão OAuth ao PostZen.',
      502
    );
  }

  const authUrl = String(payload.authUrl || payload.url || '').trim();
  const state = String(payload.state || '').trim();

  if (!authUrl || !state) {
    throw new PostZenApiError(
      'invalid_response',
      'A API PostZen não retornou authUrl ou state válidos para a autorização do TikTok.',
      502
    );
  }

  pruneExpiredOAuthStates();
  oauthStateStore.set(state, {
    profileId: resolvedProfileId,
    accountId: resolvedAccountId,
    redirectUrl: resolvedRedirectUrl,
    createdAt: new Date().toISOString(),
    expiresAtMs: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000,
  });

  return {
    configured: true,
    provider: 'PostZen',
    platform: 'tiktok',
    authUrl,
    state,
    expiresInSeconds: OAUTH_STATE_TTL_SECONDS,
    profileId: resolvedProfileId || null,
    accountId: resolvedAccountId || null,
    redirectUrl: resolvedRedirectUrl || null,
    usage: payload.usage || null,
    synchronizedAt,
    dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
  };
}

export async function handleTikTokConnectCallback(
  queryParams: Record<string, string>,
  client: PostZenClient = new PostZenClient()
) {
  const state = String(queryParams.state || '').trim();
  const errParam = String(queryParams.error || '').trim();
  const missingScopesRaw = String(queryParams.missing_scopes || '').trim();
  const affectedScheduled = String(queryParams.affected_scheduled_videos || '').trim();

  if (!state) {
    return {
      success: false,
      statusCode: 400,
      errorCode: 'missing_oauth_state',
      message: "Parâmetro OAuth 'state' ausente no retorno da autorização do TikTok.",
    };
  }

  const entry = oauthStateStore.get(state);
  if (!entry) {
    pruneExpiredOAuthStates();
    return {
      success: false,
      statusCode: 400,
      errorCode: 'invalid_oauth_state',
      message:
        "Token OAuth 'state' inválido ou já utilizado. Por segurança, inicie uma nova tentativa de conexão.",
    };
  }

  oauthStateStore.delete(state);
  if (Date.now() >= entry.expiresAtMs) {
    return {
      success: false,
      statusCode: 400,
      errorCode: 'expired_oauth_state',
      message:
        'A sessão de autorização OAuth do TikTok expirou (limite de 10 minutos). Inicie uma nova conexão.',
    };
  }

  if (errParam) {
    const mapped = TIKTOK_OAUTH_CALLBACK_ERRORS[errParam] || {
      code: errParam,
      message: `A autorização do TikTok retornou erro: ${errParam}.`,
    };
    const missingScopes = missingScopesRaw
      ? missingScopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const suffix =
      mapped.code === 'missing_tiktok_permissions' && missingScopes.length > 0
        ? ` Escopos ausentes: ${missingScopes.join(', ')}.`
        : '';

    return {
      success: false,
      statusCode: 400,
      errorCode: mapped.code,
      missingScopes,
      message: `${mapped.message}${suffix}`,
    };
  }

  clearPostZenCache();
  const accountsData = await listConnectedTikTokAccounts(client, false);

  return {
    success: true,
    statusCode: 200,
    connected: accountsData.hasConnectedTikTok,
    tiktokAccountsCount: accountsData.tiktokAccountsCount,
    accounts: accountsData.accounts,
    username: queryParams.username || null,
    accountId: queryParams.accountId || entry.accountId || null,
    profileId: entry.profileId || null,
    affectedScheduledVideos: affectedScheduled || null,
    synchronizedAt: accountsData.synchronizedAt,
    message: accountsData.hasConnectedTikTok
      ? 'Conta TikTok autorizada e sincronizada com sucesso via PostZen.'
      : 'Autorização OAuth confirmada no PostZen.',
  };
}

async function resolveTikTokAccount(
  accountId?: string,
  client: PostZenClient = new PostZenClient(),
  useCache = true
) {
  const accountsResponse = await listConnectedTikTokAccounts(client, useCache);
  const accounts = accountsResponse.accounts;

  if (accounts.length === 0) {
    return { found: false as const, account: null, accountsResponse };
  }

  if (accountId) {
    const requested = accountId.trim();
    const match = accounts.find(
      (acc) => acc.id === requested || acc.username.toLowerCase() === requested.replace(/^@/, '').toLowerCase()
    );
    if (!match) {
      throw new PostZenApiError(
        'not_found',
        'A conta solicitada não está conectada no PostZen ou não pertence às contas TikTok autorizadas. Apenas contas conectadas e autorizadas podem ser consultadas.',
        404
      );
    }
    return { found: true as const, account: match, accountsResponse };
  }

  const active = accounts.find((acc) => acc.isActive) || accounts[0];
  return { found: true as const, account: active, accountsResponse };
}

function pickMetric(combined: Record<string, any>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (key in combined && combined[key] !== undefined && combined[key] !== null) {
      return numOrNull(combined[key]);
    }
  }
  return null;
}

function pickIntMetric(combined: Record<string, any>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (key in combined && combined[key] !== undefined && combined[key] !== null) {
      return intOrNull(combined[key]);
    }
  }
  return null;
}

export function normalizePostAnalyticsItem(raw: Record<string, any>) {
  const metricsObj = raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {};
  const combined = { ...metricsObj, ...raw };

  return {
    postId: String(raw.postId || raw.id || raw._id || ''),
    accountId: String(raw.accountId || ''),
    platform: 'tiktok' as const,
    title: String(raw.title || raw.caption || raw.content || 'Publicação TikTok'),
    publishedAt: raw.publishedAt || raw.createdAt || null,
    permalink: raw.permalink || raw.platformPostUrl || raw.url || null,
    metrics: {
      views: pickIntMetric(combined, 'views', 'viewCount', 'viewsCount', 'playCount'),
      likes: pickIntMetric(combined, 'likes', 'likeCount', 'likesCount'),
      comments: pickIntMetric(combined, 'comments', 'commentCount', 'commentsCount'),
      shares: pickIntMetric(combined, 'shares', 'shareCount', 'sharesCount'),
      engagementRate: pickMetric(combined, 'engagementRate', 'engagement_rate'),
      reach: pickIntMetric(combined, 'reach', 'uniqueViews'),
      saves: pickIntMetric(combined, 'saves', 'saveCount', 'favorites', 'collectCount'),
      avgWatchTimeMs: pickMetric(combined, 'avgWatchTimeMs', 'averageWatchTimeMs', 'avgWatchTime'),
      totalWatchTimeMs: pickMetric(combined, 'totalWatchTimeMs', 'totalWatchTime'),
      completionRate: pickMetric(combined, 'completionRate', 'fullVideoWatchedRate'),
      newFollowers: pickIntMetric(combined, 'newFollowers', 'followersGained'),
    },
    insights: raw.insights && typeof raw.insights === 'object' ? raw.insights : null,
  };
}

export async function fetchTikTokAccountInsights(
  account: ReturnType<typeof normalizeTikTokAccount>,
  fromDate?: string,
  toDate?: string,
  client: PostZenClient = new PostZenClient(),
  useCache = true
) {
  if (account.connectionType !== 'tiktok_business') {
    return {
      supported: false,
      reasonCode: 'unsupported_connection_type',
      message:
        'Insights de conta exigem conexão TikTok for Business no PostZen (conexão anterior não suporta este endpoint).',
      availability: null,
      insights: null,
    };
  }

  const params: Record<string, any> = { accountId: account.id };
  if (fromDate) params.fromDate = fromDate;
  if (toDate) params.toDate = toDate;

  try {
    const { payload, cached, synchronizedAt } = await client.get(
      '/v1/analytics/account-insights',
      params,
      useCache
    );
    const dataObj =
      payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload && typeof payload === 'object'
          ? payload
          : {};

    const availability =
      dataObj.availability && typeof dataObj.availability === 'object' ? dataObj.availability : null;
    const followerCount = intOrNull(dataObj.followerCount ?? dataObj.followersCount);

    let followerThresholdNotice: string | null = null;
    if (followerCount !== null && followerCount < 100) {
      followerThresholdNotice =
        'Dados demográficos e de audiência exigem ao menos 100 seguidores na conta conectada.';
    } else if (availability && availability.audienceAvailable === false) {
      followerThresholdNotice =
        availability.reason ||
        'Dados de audiência indisponíveis no momento (verifique o requisito mínimo de 100 seguidores).';
    }

    return {
      supported: true,
      reasonCode: null,
      message: 'Insights de conta obtidos com sucesso.',
      availability,
      followerThresholdNotice,
      insights: dataObj,
      synchronizedAt,
      cached,
    };
  } catch (err: any) {
    if (
      err instanceof PostZenApiError &&
      ['unsupported_connection_type', 'missing_entitlement', 'unauthorized', 'not_found'].includes(err.code)
    ) {
      return {
        supported: false,
        reasonCode: err.code,
        message: err.message,
        availability: null,
        insights: null,
      };
    }
    throw err;
  }
}

export interface AnalyticsQueryParams {
  accountId?: string;
  postId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  includeInsights?: boolean;
  refresh?: boolean;
}

export async function fetchTikTokAnalytics(
  query: AnalyticsQueryParams = {},
  client: PostZenClient = new PostZenClient()
) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  const useCache = !query.refresh;
  const includeInsights = query.includeInsights !== false;

  const resolved = await resolveTikTokAccount(query.accountId, client, useCache);
  if (!resolved.found) {
    return {
      configured: true,
      readOnly: true,
      hasConnectedAccount: false,
      account: null,
      overview: null,
      posts: [],
      pagination: { page, limit, total: 0, hasMore: false },
      accountInsights: null,
      synchronizedAt: resolved.accountsResponse.synchronizedAt,
      cached: resolved.accountsResponse.cached,
      dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
      message: `Nenhuma conta TikTok conectada no PostZen. Conecte sua conta em ${OFFICIAL_POSTZEN_DASHBOARD_URL} para visualizar analytics.`,
      platformNotes: PLATFORM_NOTES_PT_BR,
    };
  }

  const account = resolved.account;
  const params: Record<string, any> = {
    platform: 'tiktok',
    accountId: account.id,
    page,
    limit,
  };
  if (query.postId) params.postId = query.postId;
  if (query.fromDate) params.fromDate = query.fromDate;
  if (query.toDate) params.toDate = query.toDate;
  if (query.sortBy) params.sortBy = query.sortBy;
  if (query.order) params.order = query.order;

  const { payload, cached, synchronizedAt } = await client.get('/v1/analytics', params, useCache);
  const rawPosts = extractRawList(payload, ['posts', 'analytics', 'data', 'items', 'results', 'records']);
  const posts = rawPosts.map(normalizePostAnalyticsItem);

  const pagObj =
    payload && typeof payload === 'object' && payload.pagination && typeof payload.pagination === 'object'
      ? payload.pagination
      : payload && typeof payload === 'object'
        ? payload
        : {};
  const total = intOrNull(pagObj.total);

  const accountInsights = includeInsights
    ? await fetchTikTokAccountInsights(account, query.fromDate, query.toDate, client, useCache)
    : null;

  const overview =
    payload && typeof payload === 'object' && payload.overview && typeof payload.overview === 'object'
      ? payload.overview
      : null;

  return {
    configured: true,
    readOnly: true,
    hasConnectedAccount: true,
    account,
    overview,
    posts,
    pagination: {
      page: intOrNull(pagObj.page) || page,
      limit: intOrNull(pagObj.limit) || limit,
      total: total !== null ? total : posts.length,
      hasMore: Boolean(pagObj.hasMore),
    },
    accountInsights,
    synchronizedAt,
    cached,
    dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
    message:
      posts.length > 0
        ? `${posts.length} registro(s) analítico(s) recuperado(s) do PostZen.`
        : 'Nenhuma métrica de publicação disponível no período selecionado.',
    platformNotes: PLATFORM_NOTES_PT_BR,
  };
}

export interface FollowersQueryParams {
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  granularity?: string;
  refresh?: boolean;
}

export async function fetchTikTokFollowerStats(
  query: FollowersQueryParams = {},
  client: PostZenClient = new PostZenClient()
) {
  const useCache = !query.refresh;
  const resolved = await resolveTikTokAccount(query.accountId, client, useCache);

  if (!resolved.found) {
    return {
      configured: true,
      readOnly: true,
      hasConnectedAccount: false,
      account: null,
      supported: false,
      stats: [],
      summary: null,
      synchronizedAt: resolved.accountsResponse.synchronizedAt,
      cached: resolved.accountsResponse.cached,
      dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
      message: `Nenhuma conta TikTok conectada no PostZen. Conecte uma conta em ${OFFICIAL_POSTZEN_DASHBOARD_URL}.`,
      platformNotes: PLATFORM_NOTES_PT_BR,
    };
  }

  const account = resolved.account;
  const params: Record<string, any> = { accountId: account.id };
  if (query.fromDate) params.fromDate = query.fromDate;
  if (query.toDate) params.toDate = query.toDate;
  if (query.granularity) params.granularity = query.granularity;

  try {
    const { payload, cached, synchronizedAt } = await client.get(
      '/v1/accounts/follower-stats',
      params,
      useCache
    );
    const dataObj =
      payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload && typeof payload === 'object'
          ? payload
          : {};

    const rawSeries = extractRawList(payload, ['stats', 'series', 'timeline', 'history', 'data']);
    const stats = rawSeries.map((item) => ({
      date: item.date || item.timestamp || null,
      followersCount: pickIntMetric(item, 'followersCount', 'followerCount', 'followers', 'count'),
      netChange: pickIntMetric(item, 'netChange', 'change', 'newFollowers', 'delta'),
    }));

    const summary = {
      currentFollowers: pickIntMetric(dataObj, 'currentFollowers', 'followerCount', 'followersCount'),
      netChange: pickIntMetric(dataObj, 'netChange', 'totalChange', 'newFollowers'),
      growthRate: pickMetric(dataObj, 'growthRate', 'growthPercentage'),
    };

    return {
      configured: true,
      readOnly: true,
      hasConnectedAccount: true,
      account,
      supported: true,
      stats,
      summary,
      synchronizedAt,
      cached,
      dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
      message:
        stats.length > 0 || summary.currentFollowers !== null
          ? 'Histórico de seguidores obtido com sucesso.'
          : 'Nenhum dado histórico de seguidores disponível para o período informado.',
      platformNotes: PLATFORM_NOTES_PT_BR,
    };
  } catch (err: any) {
    if (
      err instanceof PostZenApiError &&
      ['unsupported_connection_type', 'missing_entitlement'].includes(err.code)
    ) {
      return {
        configured: true,
        readOnly: true,
        hasConnectedAccount: true,
        account,
        supported: false,
        reasonCode: err.code,
        stats: [],
        summary: null,
        synchronizedAt: new Date().toISOString(),
        cached: false,
        dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
        message: err.message,
        platformNotes: PLATFORM_NOTES_PT_BR,
      };
    }
    throw err;
  }
}

export interface CommentsQueryParams {
  accountId?: string;
  postId?: string;
  page?: number;
  limit?: number;
  cursor?: string;
  refresh?: boolean;
}

export async function fetchTikTokComments(
  query: CommentsQueryParams = {},
  client: PostZenClient = new PostZenClient()
) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  const useCache = !query.refresh;

  const resolved = await resolveTikTokAccount(query.accountId, client, useCache);
  if (!resolved.found) {
    return {
      configured: true,
      readOnly: true,
      hasConnectedAccount: false,
      supported: false,
      account: null,
      comments: [],
      pagination: { page, limit, total: 0, hasMore: false, nextCursor: null },
      synchronizedAt: resolved.accountsResponse.synchronizedAt,
      cached: resolved.accountsResponse.cached,
      dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
      message: `Nenhuma conta TikTok conectada no PostZen. Conecte uma conta TikTok for Business em ${OFFICIAL_POSTZEN_DASHBOARD_URL}.`,
    };
  }

  const account = resolved.account;
  if (account.connectionType !== 'tiktok_business') {
    throw new PostZenApiError(
      'unsupported_connection_type',
      'A leitura de comentários via PostZen exige uma conta conectada pelo fluxo TikTok for Business. Contas com conexão anterior não suportam o endpoint de comentários.',
      400
    );
  }

  const params: Record<string, any> = {
    accountId: account.id,
    page,
    limit,
  };
  if (query.postId) params.postId = query.postId;
  if (query.cursor) params.cursor = query.cursor;

  const { payload, cached, synchronizedAt } = await client.get('/v1/inbox/comments', params, useCache);
  const rawComments = extractRawList(payload, ['comments', 'data', 'items', 'results']);

  const comments = rawComments.map((raw) => {
    const author = raw.author && typeof raw.author === 'object' ? raw.author : {};
    return {
      id: String(raw.id || raw._id || raw.commentId || ''),
      postId: String(raw.postId || raw.videoId || ''),
      authorName: String(raw.authorName || author.name || author.displayName || raw.username || 'Usuário'),
      authorHandle: String(raw.authorHandle || author.username || author.handle || ''),
      text: String(raw.text || raw.content || raw.message || ''),
      createdAt: raw.createdAt || raw.publishedAt || raw.timestamp || null,
      likesCount: 'likesCount' in raw ? intOrNull(raw.likesCount) : intOrNull(raw.likeCount),
      repliesCount: 'repliesCount' in raw ? intOrNull(raw.repliesCount) : intOrNull(raw.replyCount),
    };
  });

  const pag =
    payload && typeof payload === 'object' && payload.pagination && typeof payload.pagination === 'object'
      ? payload.pagination
      : payload && typeof payload === 'object'
        ? payload
        : {};
  const total = intOrNull(pag.total);

  return {
    configured: true,
    readOnly: true,
    hasConnectedAccount: true,
    supported: true,
    account,
    comments,
    pagination: {
      page: intOrNull(pag.page) || page,
      limit: intOrNull(pag.limit) || limit,
      total: total !== null ? total : comments.length,
      hasMore: Boolean(pag.hasMore),
      nextCursor: pag.nextCursor || null,
    },
    synchronizedAt,
    cached,
    dashboardUrl: OFFICIAL_POSTZEN_DASHBOARD_URL,
    message:
      comments.length > 0
        ? `${comments.length} comentário(s) recuperado(s) em modo somente leitura.`
        : 'Nenhum comentário encontrado para esta conta ou publicação.',
  };
}
