// Rotas /api/* atendidas pelo Node quando o Django não está rodando.

import { handleAiAnalysis } from './analyzeHandler.ts';
import { fetchTikTokData } from './tiktokService.ts';
import { verifyClaimsFromText } from './factCheckService.ts';
import {
  PostZenApiError,
  getPostZenConfigStatus,
  listPostZenProfiles,
  createTikTokConnectUrl,
  handleTikTokConnectCallback,
  listConnectedTikTokAccounts,
  fetchTikTokAnalytics,
  fetchTikTokFollowerStats,
  fetchTikTokComments,
} from './postzenService.ts';

function normalizePath(rawPath: string): string {
  if (rawPath.length > 1 && rawPath.endsWith('/')) {
    return rawPath.slice(0, -1);
  }
  return rawPath;
}

export interface ApiDispatchContext {
  origin?: string;
  acceptHeader?: string;
}

export interface ApiDispatchResult {
  status: number;
  data: any;
  redirectTo?: string;
}

function handlePostZenError(err: any): ApiDispatchResult {
  if (err instanceof PostZenApiError) {
    return { status: err.statusCode, data: err.toJSON() };
  }
  return {
    status: 500,
    data: {
      error: true,
      errorCode: 'service_unavailable',
      message: err?.message || 'Erro interno ao consultar a integração PostZen.',
    },
  };
}

export async function dispatchApiRoute(
  rawPath: string,
  method: string,
  body: any,
  query: Record<string, string>,
  context: ApiDispatchContext = {}
): Promise<ApiDispatchResult> {
  const path = normalizePath(rawPath);

  // GET /api/status
  if (path === '/api/status' && method === 'GET') {
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
    const postzenStatus = getPostZenConfigStatus();
    const hasPostZen = Boolean(postzenStatus.configured);

    return {
      status: 200,
      data: {
        system: 'Fato ou Farsa API',
        version: '3.0.0',
        platform: 'TikTok',
        environment: process.env.NODE_ENV || 'development',
        gemini: {
          configured: hasGeminiKey,
          model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
          searchGroundingSupported: true,
          mode: hasGeminiKey ? 'active' : 'deterministic_fallback',
        },
        tiktok: {
          configured: hasPostZen,
          provider: 'PostZen',
          exclusiveProvider: true,
          mode: hasPostZen ? 'postzen_api' : 'sandbox_curated',
          apiVersion: 'PostZen v1',
          oauthConnectEndpoint: '/api/integrations/postzen/connect/url/',
        },
        factCheckEngine: {
          status: 'online',
          sourcesCount: 8,
          regulatoryAgencies: ['ANVISA', 'CFM', 'SBD', 'CVM', 'Banco Central'],
          factCheckingPartners: ['Agência Lupa', 'Aos Fatos', 'Projeto Comprova', 'G1 Fato ou Fake', 'Estadão Verifica'],
        },
        postzen: postzenStatus,
      },
    };
  }

  // POST /api/tiktok/profile
  if ((path === '/api/tiktok/profile' || path === '/api/instagram/profile') && method === 'POST') {
    const usernameOrUrl = body?.usernameOrUrl || body?.username || query?.usernameOrUrl || query?.username;
    if (!usernameOrUrl && !body?.manualTranscript) {
      return {
        status: 400,
        data: { error: 'O link de vídeo do TikTok, @usuário ou transcrição manual é obrigatório.' },
      };
    }
    const manualTranscript = body?.manualTranscript;
    const result = await fetchTikTokData(usernameOrUrl || '@video_tiktok', manualTranscript);
    return {
      status: 200,
      data: result,
    };
  }

  // POST /api/verify-claims
  if (path === '/api/verify-claims' && method === 'POST') {
    const caption = body?.caption || body?.text || body?.transcript;
    if (!caption) {
      return {
        status: 400,
        data: { error: 'O texto ou legenda para verificação é obrigatório.' },
      };
    }
    const topic = body?.topic || 'Geral';
    const profileName = body?.profileName;
    const result = await verifyClaimsFromText({ caption, topic, profileName });
    return {
      status: 200,
      data: result,
    };
  }

  // POST /api/analyze
  if (path === '/api/analyze' && method === 'POST') {
    const result = await handleAiAnalysis(body);
    return {
      status: 200,
      data: result,
    };
  }

  // /api/integrations/postzen/*
  if (path === '/api/integrations/postzen/status' && method === 'GET') {
    return {
      status: 200,
      data: getPostZenConfigStatus(),
    };
  }

  if (path === '/api/integrations/postzen/profiles' && method === 'GET') {
    const refresh = ['1', 'true', 'yes'].includes(String(query?.refresh || '').toLowerCase());
    try {
      const data = await listPostZenProfiles(undefined, !refresh);
      return { status: 200, data };
    } catch (err) {
      return handlePostZenError(err);
    }
  }

  if (
    (path === '/api/integrations/postzen/connect' || path === '/api/integrations/postzen/connect/url') &&
    method === 'GET'
  ) {
    const fallbackOrigin = String(context.origin || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const requestedRedirectUrl = String(query?.redirectUrl || '').trim();
    const redirectUrl = requestedRedirectUrl || `${fallbackOrigin}/api/integrations/postzen/connect/callback/`;

    try {
      const data = await createTikTokConnectUrl({
        profileId: query?.profileId || undefined,
        accountId: query?.accountId || undefined,
        redirectUrl,
      });
      return { status: 200, data };
    } catch (err) {
      return handlePostZenError(err);
    }
  }

  if (path === '/api/integrations/postzen/connect/callback' && method === 'GET') {
    let result: Record<string, any>;
    try {
      result = await handleTikTokConnectCallback(query || {});
    } catch (err: any) {
      if (err instanceof PostZenApiError) {
        result = {
          success: false,
          statusCode: err.statusCode,
          errorCode: err.code,
          message: err.message,
        };
      } else {
        result = {
          success: false,
          statusCode: 500,
          errorCode: 'service_unavailable',
          message: err?.message || 'Erro ao concluir o callback OAuth do PostZen.',
        };
      }
    }

    const wantsJson =
      String(query?.format || '').toLowerCase() === 'json' ||
      String(context.acceptHeader || '').toLowerCase().includes('application/json');

    if (wantsJson) {
      return {
        status: Number(result.statusCode || 200),
        data: result,
      };
    }

    const params = new URLSearchParams();
    params.set('postzen_connect', result.success ? 'success' : 'error');
    if (result.errorCode) params.set('errorCode', String(result.errorCode));
    if (result.message) params.set('message', String(result.message));
    if (result.username) params.set('username', String(result.username));
    if (result.tiktokAccountsCount !== undefined) {
      params.set('accountsCount', String(result.tiktokAccountsCount));
    }

    return {
      status: 302,
      data: result,
      redirectTo: `/?${params.toString()}`,
    };
  }

  if (path === '/api/integrations/postzen/accounts' && method === 'GET') {
    const refresh = ['1', 'true', 'yes'].includes(String(query?.refresh || '').toLowerCase());
    try {
      const data = await listConnectedTikTokAccounts(undefined, !refresh);
      return { status: 200, data };
    } catch (err) {
      return handlePostZenError(err);
    }
  }

  if (path === '/api/integrations/postzen/analytics' && method === 'GET') {
    const refresh = ['1', 'true', 'yes'].includes(String(query?.refresh || '').toLowerCase());
    const includeInsights = query?.includeInsights !== 'false';
    const page = query?.page ? parseInt(query.page, 10) : 1;
    const limit = query?.limit ? parseInt(query.limit, 10) : 20;

    if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1 || limit > 100) {
      return {
        status: 400,
        data: {
          error: true,
          errorCode: 'bad_request',
          message: 'Parâmetros page/limit inválidos para analytics do PostZen.',
        },
      };
    }

    if (query?.order && query.order !== 'asc' && query.order !== 'desc') {
      return {
        status: 400,
        data: {
          error: true,
          errorCode: 'bad_request',
          message: 'Parâmetro order deve ser "asc" ou "desc".',
        },
      };
    }

    try {
      const data = await fetchTikTokAnalytics({
        accountId: query?.accountId || undefined,
        postId: query?.postId || undefined,
        fromDate: query?.fromDate || undefined,
        toDate: query?.toDate || undefined,
        page,
        limit,
        sortBy: query?.sortBy || undefined,
        order: (query?.order as 'asc' | 'desc' | undefined) || undefined,
        includeInsights,
        refresh,
      });
      return { status: 200, data };
    } catch (err) {
      return handlePostZenError(err);
    }
  }

  if (path === '/api/integrations/postzen/followers' && method === 'GET') {
    const refresh = ['1', 'true', 'yes'].includes(String(query?.refresh || '').toLowerCase());
    try {
      const data = await fetchTikTokFollowerStats({
        accountId: query?.accountId || undefined,
        fromDate: query?.fromDate || undefined,
        toDate: query?.toDate || undefined,
        granularity: query?.granularity || undefined,
        refresh,
      });
      return { status: 200, data };
    } catch (err) {
      return handlePostZenError(err);
    }
  }

  if (path === '/api/integrations/postzen/comments' && method === 'GET') {
    const refresh = ['1', 'true', 'yes'].includes(String(query?.refresh || '').toLowerCase());
    const page = query?.page ? parseInt(query.page, 10) : 1;
    const limit = query?.limit ? parseInt(query.limit, 10) : 20;

    if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1 || limit > 100) {
      return {
        status: 400,
        data: {
          error: true,
          errorCode: 'bad_request',
          message: 'Parâmetros page/limit inválidos para comentários do PostZen.',
        },
      };
    }

    try {
      const data = await fetchTikTokComments({
        accountId: query?.accountId || undefined,
        postId: query?.postId || undefined,
        page,
        limit,
        cursor: query?.cursor || undefined,
        refresh,
      });
      return { status: 200, data };
    } catch (err) {
      return handlePostZenError(err);
    }
  }

  return {
    status: 404,
    data: { error: `Rota API não encontrada: ${method} ${path}` },
  };
}

