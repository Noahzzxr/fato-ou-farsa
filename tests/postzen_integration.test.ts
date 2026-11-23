// Testes da integração PostZen: contas, analytics, 0 vs null, erros de credencial,
// rate limit (Retry-After), falha do provedor e garantia de somente leitura.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PostZenClient,
  PostZenApiError,
  clearPostZenCache,
  clearPostZenOAuthStates,
  registerPostZenOAuthStateForTest,
  getPostZenConfigStatus,
  listPostZenProfiles,
  createTikTokConnectUrl,
  handleTikTokConnectCallback,
  listConnectedTikTokAccounts,
  fetchTikTokAnalytics,
  fetchTikTokFollowerStats,
  fetchTikTokComments,
  isPlaceholderApiKey,
} from '../server/postzenService.ts';
import { fetchTikTokData } from '../server/tiktokService.ts';
import { dispatchApiRoute } from '../server/apiRouter.ts';

function mockJsonResponse(status: number, body: any, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('1. Credencial ausente ou placeholder é tratada com erro missing_api_key e status seguro', async () => {
  clearPostZenCache();
  assert.equal(isPlaceholderApiKey(''), true);
  assert.equal(isPlaceholderApiKey('replace_with_your_new_key'), true);

  const client = new PostZenClient({ apiKey: 'replace_with_your_new_key' });
  assert.equal(client.isConfigured, false);

  await assert.rejects(
    () => listConnectedTikTokAccounts(client),
    (err: any) => err instanceof PostZenApiError && err.code === 'missing_api_key' && err.statusCode === 503
  );

  const statusObj = getPostZenConfigStatus({ POSTZEN_API_KEY: '' } as NodeJS.ProcessEnv);
  assert.equal(statusObj.configured, false);
  assert.equal(statusObj.readOnly, true);
});

test('2. Autenticação bem-sucedida e descoberta de contas TikTok (Business vs Earlier)', async () => {
  clearPostZenCache();
  let capturedAuthHeader = '';

  const client = new PostZenClient({
    apiKey: 'pz_live_test_token_1234',
    fetchImpl: async (_url, init) => {
      capturedAuthHeader = String((init?.headers as any)?.Authorization || '');
      return mockJsonResponse(200, {
        accounts: [
          {
            _id: 'tt_biz_01',
            platform: 'tiktok',
            username: '@canal_verificado',
            displayName: 'Canal Verificado',
            connectionType: 'tiktok_business',
            isActive: true,
            scopes: ['video.list', 'insights', 'comments'],
          },
          {
            _id: 'tt_old_02',
            platform: 'tiktok',
            username: 'conta_anterior',
            connectionType: 'earlier_connection',
            isActive: true,
          },
          {
            _id: 'ig_99',
            platform: 'instagram',
            username: 'ignorar_ig',
          },
        ],
      });
    },
  });

  const res = await listConnectedTikTokAccounts(client, false);
  assert.equal(capturedAuthHeader, 'Bearer pz_live_test_token_1234');
  assert.equal(res.tiktokAccountsCount, 2);
  assert.equal(res.accounts[0].connectionType, 'tiktok_business');
  assert.equal(res.accounts[0].capabilities.comments, true);
  assert.equal(res.accounts[1].connectionType, 'earlier_connection');
  assert.equal(res.accounts[1].capabilities.comments, false);
  assert.equal(JSON.stringify(res).includes('pz_live_test_token_1234'), false);
});

test('3. Chave de API inválida retorna invalid_api_key (401)', async () => {
  clearPostZenCache();
  const client = new PostZenClient({
    apiKey: 'pz_bad_key',
    fetchImpl: async () => mockJsonResponse(401, { message: 'Invalid Bearer token' }),
  });

  await assert.rejects(
    () => listConnectedTikTokAccounts(client, false),
    (err: any) => err instanceof PostZenApiError && err.code === 'invalid_api_key' && err.statusCode === 401
  );
});

test('4. Analytics preserva estritamente 0 vs null/indisponível e verifica threshold de 100 seguidores', async () => {
  clearPostZenCache();
  const client = new PostZenClient({
    apiKey: 'pz_valid_key_analytics',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('/v1/accounts')) {
        return mockJsonResponse(200, {
          accounts: [
            {
              id: 'tt_biz_01',
              platform: 'tiktok',
              username: 'criador_oficial',
              connectionType: 'tiktok_business',
              isActive: true,
            },
          ],
        });
      }
      if (url.includes('/v1/analytics/account-insights')) {
        return mockJsonResponse(200, {
          followerCount: 42,
          availability: { audienceAvailable: false },
        });
      }
      if (url.includes('/v1/analytics')) {
        return mockJsonResponse(200, {
          posts: [
            {
              postId: 'vid_100',
              title: 'Vídeo com métricas parciais',
              views: 0,
              likes: 120,
              comments: 0,
              // shares, reach, saves, completionRate ausentes
            },
          ],
        });
      }
      return mockJsonResponse(404, {});
    },
  });

  const analytics = await fetchTikTokAnalytics({ accountId: 'tt_biz_01', refresh: true }, client);
  assert.equal(analytics.hasConnectedAccount, true);
  assert.equal(analytics.posts.length, 1);
  assert.equal(analytics.posts[0].metrics.views, 0);
  assert.equal(analytics.posts[0].metrics.comments, 0);
  assert.equal(analytics.posts[0].metrics.likes, 120);
  assert.equal(analytics.posts[0].metrics.shares, null);
  assert.equal(analytics.posts[0].metrics.reach, null);
  assert.equal(analytics.posts[0].metrics.saves, null);
  assert.equal(analytics.posts[0].metrics.completionRate, null);
  assert.ok(analytics.accountInsights?.followerThresholdNotice?.includes('100 seguidores'));
});

test('5. Tipo de conexão anterior bloqueia comentários com unsupported_connection_type e sinaliza insights', async () => {
  clearPostZenCache();
  const client = new PostZenClient({
    apiKey: 'pz_valid_key_earlier',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('/v1/accounts')) {
        return mockJsonResponse(200, {
          accounts: [
            {
              id: 'tt_old',
              platform: 'tiktok',
              username: 'conta_antiga',
              connectionType: 'earlier_connection',
              isActive: true,
            },
          ],
        });
      }
      return mockJsonResponse(200, { posts: [] });
    },
  });

  const analytics = await fetchTikTokAnalytics({ accountId: 'tt_old', refresh: true }, client);
  assert.equal(analytics.accountInsights?.supported, false);
  assert.equal(analytics.accountInsights?.reasonCode, 'unsupported_connection_type');

  await assert.rejects(
    () => fetchTikTokComments({ accountId: 'tt_old', refresh: true }, client),
    (err: any) => err instanceof PostZenApiError && err.code === 'unsupported_connection_type' && err.statusCode === 400
  );
});

test('6. Falta de entitlement de plano (403) retorna missing_entitlement', async () => {
  clearPostZenCache();
  const client = new PostZenClient({
    apiKey: 'pz_valid_key_entitlement',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('/v1/accounts')) {
        return mockJsonResponse(200, {
          accounts: [
            {
              id: 'tt_biz',
              platform: 'tiktok',
              username: 'conta_biz',
              connectionType: 'tiktok_business',
              isActive: true,
            },
          ],
        });
      }
      return mockJsonResponse(403, { code: 'entitlement_required', message: 'Plan upgrade needed' });
    },
  });

  await assert.rejects(
    () => fetchTikTokComments({ accountId: 'tt_biz', refresh: true }, client),
    (err: any) => err instanceof PostZenApiError && err.code === 'missing_entitlement' && err.statusCode === 403
  );
});

test('7. Rate limiting (429) interpreta cabeçalho Retry-After', async () => {
  clearPostZenCache();
  const client = new PostZenClient({
    apiKey: 'pz_valid_key_ratelimit',
    fetchImpl: async () => mockJsonResponse(429, { message: 'Rate limit exceeded' }, { 'Retry-After': '37' }),
  });

  await assert.rejects(
    () => listConnectedTikTokAccounts(client, false),
    (err: any) => err instanceof PostZenApiError && err.code === 'rate_limited' && err.statusCode === 429 && err.retryAfter === 37
  );
});

test('8. Falha externa (503) retorna service_unavailable após retentativas', async () => {
  clearPostZenCache();
  let calls = 0;
  const client = new PostZenClient({
    apiKey: 'pz_valid_key_503',
    maxRetries: 1,
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(503, { message: 'Upstream down' });
    },
  });

  await assert.rejects(
    () => listConnectedTikTokAccounts(client, false),
    (err: any) => err instanceof PostZenApiError && err.code === 'service_unavailable' && err.statusCode === 503
  );
  assert.equal(calls, 2);
});

test('9. Datasets vazios (sem conta conectada e zero comentários/seguidores) retornam estado limpo', async () => {
  clearPostZenCache();
  const emptyClient = new PostZenClient({
    apiKey: 'pz_valid_key_empty',
    fetchImpl: async () => mockJsonResponse(200, { accounts: [] }),
  });

  const accountsRes = await listConnectedTikTokAccounts(emptyClient, false);
  assert.equal(accountsRes.accounts.length, 0);
  assert.equal(accountsRes.hasConnectedTikTok, false);

  const analyticsRes = await fetchTikTokAnalytics({ refresh: true }, emptyClient);
  assert.equal(analyticsRes.hasConnectedAccount, false);
  assert.deepEqual(analyticsRes.posts, []);

  const followersRes = await fetchTikTokFollowerStats({ refresh: true }, emptyClient);
  assert.equal(followersRes.hasConnectedAccount, false);
  assert.deepEqual(followersRes.stats, []);

  // Conta conectada mas com 0 comentários
  const noCommentsClient = new PostZenClient({
    apiKey: 'pz_valid_key_nocomments',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('/v1/accounts')) {
        return mockJsonResponse(200, {
          accounts: [
            {
              id: 'tt_biz',
              platform: 'tiktok',
              username: 'sem_comentarios',
              connectionType: 'tiktok_business',
              isActive: true,
            },
          ],
        });
      }
      return mockJsonResponse(200, { comments: [] });
    },
  });

  const commentsRes = await fetchTikTokComments({ accountId: 'tt_biz', refresh: true }, noCommentsClient);
  assert.equal(commentsRes.supported, true);
  assert.deepEqual(commentsRes.comments, []);
});

test('10. Roteador API expõe apenas GET para PostZen (nunca publicação/escrita)', async () => {
  const prevKey = process.env.POSTZEN_API_KEY;
  process.env.POSTZEN_API_KEY = '';

  try {
    const statusRoute = await dispatchApiRoute('/api/integrations/postzen/status/', 'GET', {}, {});
    assert.equal(statusRoute.status, 200);
    assert.equal(statusRoute.data.readOnly, true);
    assert.equal(statusRoute.data.configured, false);

    const postDisallowed = await dispatchApiRoute('/api/integrations/postzen/accounts/', 'POST', {}, {});
    assert.equal(postDisallowed.status, 404);
  } finally {
    if (prevKey !== undefined) {
      process.env.POSTZEN_API_KEY = prevKey;
    } else {
      delete process.env.POSTZEN_API_KEY;
    }
  }
});

test('11. Fluxo OAuth PostZen descobre perfis (/v1/profiles) e gera authUrl + state (/v1/connect/tiktok)', async () => {
  clearPostZenCache();
  clearPostZenOAuthStates();
  const capturedUrls: string[] = [];

  const client = new PostZenClient({
    apiKey: 'pz_rw_oauth_test',
    fetchImpl: async (input) => {
      const url = String(input);
      capturedUrls.push(url);
      if (url.includes('/v1/profiles')) {
        return mockJsonResponse(200, {
          profiles: [
            { _id: 'prof_main', name: 'Perfil Fato ou Farsa', isDefault: true },
            { _id: 'prof_sec', name: 'Perfil Secundário', isDefault: false },
          ],
        });
      }
      if (url.includes('/v1/connect/tiktok')) {
        return mockJsonResponse(200, {
          authUrl: 'https://www.tiktok.com/v2/auth/authorize/?state=oauth_st_01',
          state: 'oauth_st_01',
        });
      }
      return mockJsonResponse(404, {});
    },
  });

  const profiles = await listPostZenProfiles(client, false);
  assert.equal(profiles.profilesCount, 2);
  assert.equal(profiles.defaultProfileId, 'prof_main');

  const connect = await createTikTokConnectUrl(
    { redirectUrl: 'https://fatooufarsa.ai.studio/api/integrations/postzen/connect/callback/' },
    client
  );
  assert.equal(connect.state, 'oauth_st_01');
  assert.equal(connect.profileId, 'prof_main');
  assert.equal(connect.expiresInSeconds, 600);
  assert.ok(connect.authUrl.startsWith('https://www.tiktok.com/'));
  assert.ok(capturedUrls.some((u) => u.includes('/v1/connect/tiktok') && u.includes('profileId=prof_main')));
});

test('12. Callback OAuth valida state (ausente, inválido, replay, expirado >10m) e atualiza contas após sucesso', async () => {
  clearPostZenCache();
  clearPostZenOAuthStates();

  // Sem state
  const missingRes = await handleTikTokConnectCallback({});
  assert.equal(missingRes.success, false);
  assert.equal(missingRes.errorCode, 'missing_oauth_state');
  assert.equal(missingRes.statusCode, 400);

  // State expirado
  registerPostZenOAuthStateForTest('st_expired', { ttlSeconds: -5 });
  const expiredRes = await handleTikTokConnectCallback({ state: 'st_expired' });
  assert.equal(expiredRes.success, false);
  assert.equal(expiredRes.errorCode, 'expired_oauth_state');

  // Fluxo válido + bloqueio de replay
  registerPostZenOAuthStateForTest('st_valid_oauth', { profileId: 'prof_main', ttlSeconds: 600 });
  const client = new PostZenClient({
    apiKey: 'pz_rw_callback_ok',
    fetchImpl: async () =>
      mockJsonResponse(200, {
        accounts: [
          {
            id: 'tt_connected_1',
            platform: 'tiktok',
            username: 'criador_autorizado',
            connectionType: 'tiktok_business',
            isActive: true,
          },
        ],
      }),
  });

  const okRes = await handleTikTokConnectCallback(
    { state: 'st_valid_oauth', username: 'criador_autorizado' },
    client
  );
  assert.equal(okRes.success, true);
  assert.equal(okRes.connected, true);
  assert.equal(okRes.tiktokAccountsCount, 1);

  const replayRes = await handleTikTokConnectCallback({ state: 'st_valid_oauth' }, client);
  assert.equal(replayRes.success, false);
  assert.equal(replayRes.errorCode, 'invalid_oauth_state');
});

test('13. Callback OAuth mapeia erros documentados do TikTok (missing_tiktok_permissions, mismatch, access_denied)', async () => {
  clearPostZenCache();
  clearPostZenOAuthStates();

  registerPostZenOAuthStateForTest('st_err_1', { ttlSeconds: 600 });
  const permErr = await handleTikTokConnectCallback({
    state: 'st_err_1',
    error: 'missing_tiktok_permissions',
    missing_scopes: 'user.info.stats,video.list',
  });
  assert.equal(permErr.success, false);
  assert.equal(permErr.errorCode, 'missing_tiktok_permissions');
  assert.deepEqual(permErr.missingScopes, ['user.info.stats', 'video.list']);
  assert.ok(permErr.message.includes('video.list'));

  registerPostZenOAuthStateForTest('st_err_2', { ttlSeconds: 600 });
  const mismatchErr = await handleTikTokConnectCallback({
    state: 'st_err_2',
    error: 'tiktok_account_mismatch',
  });
  assert.equal(mismatchErr.errorCode, 'tiktok_account_mismatch');

  registerPostZenOAuthStateForTest('st_err_3', { ttlSeconds: 600 });
  const deniedErr = await handleTikTokConnectCallback({
    state: 'st_err_3',
    error: 'access_denied',
  });
  assert.equal(deniedErr.errorCode, 'access_denied');
});

test('14. Erros HTTP 402 (limite de contas) e 403 (chave somente leitura no connect) são mapeados estruturalmente', async () => {
  clearPostZenCache();
  clearPostZenOAuthStates();

  const client402 = new PostZenClient({
    apiKey: 'pz_plan_limit',
    fetchImpl: async () =>
      mockJsonResponse(402, {
        message: 'Plan account limit exceeded',
        upgradeUrl: 'https://app.postzen.dev/pricing',
      }),
  });
  await assert.rejects(
    () => createTikTokConnectUrl({ profileId: 'prof_1' }, client402),
    (err: any) =>
      err instanceof PostZenApiError &&
      err.code === 'plan_account_limit' &&
      err.statusCode === 402 &&
      err.details?.upgradeUrl === 'https://app.postzen.dev/pricing'
  );

  const client403 = new PostZenClient({
    apiKey: 'pz_read_only_key',
    fetchImpl: async () =>
      mockJsonResponse(403, {
        message: 'A Read & Write key is required to connect social accounts',
      }),
  });
  await assert.rejects(
    () => createTikTokConnectUrl({ profileId: 'prof_1' }, client403),
    (err: any) =>
      err instanceof PostZenApiError &&
      err.code === 'connect_requires_read_write_key' &&
      err.statusCode === 403
  );
});

test('15. Aplicação opera sem TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET ou TIKTOK_ACCESS_TOKEN (PostZen exclusivo)', async () => {
  const prevKeys = {
    TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
    TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN,
    POSTZEN_API_KEY: process.env.POSTZEN_API_KEY,
  };

  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_SECRET;
  delete process.env.TIKTOK_ACCESS_TOKEN;
  process.env.POSTZEN_API_KEY = '';

  try {
    const statusRes = await dispatchApiRoute('/api/status', 'GET', {}, {});
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.tiktok.provider, 'PostZen');
    assert.equal(statusRes.data.tiktok.exclusiveProvider, true);
    assert.equal(statusRes.data.tiktok.mode, 'sandbox_curated');

    const verifyRes = await dispatchApiRoute(
      '/api/verify-claims',
      'POST',
      { caption: 'Chá da Amazônia cura diabetes em 48 horas', topic: 'Saúde' },
      {}
    );
    assert.equal(verifyRes.status, 200);
    assert.ok(Array.isArray(verifyRes.data.claims));
    assert.ok(verifyRes.data.claims.length >= 1);

    const callbackRedirect = await dispatchApiRoute(
      '/api/integrations/postzen/connect/callback/',
      'GET',
      {},
      {}
    );
    assert.equal(callbackRedirect.status, 302);
    assert.ok(callbackRedirect.redirectTo?.includes('postzen_connect=error'));
    assert.ok(callbackRedirect.redirectTo?.includes('missing_oauth_state'));
  } finally {
    for (const [k, v] of Object.entries(prevKeys)) {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    }
  }
});

test('16. fetchTikTokData utiliza PostZen exclusivamente para contas conectadas e fallback transparente caso contrário', async () => {
  clearPostZenCache();
  const prevKey = process.env.POSTZEN_API_KEY;
  process.env.POSTZEN_API_KEY = '';

  try {
    const manualRes = await fetchTikTokData('@perfil_desconhecido', 'Alegação enviada manualmente para checagem.');
    assert.equal(manualRes.source, 'manual_input');
    assert.equal(manualRes.isLiveApi, false);

    const sandboxRes = await fetchTikTokData('@saude_vital_brasil');
    assert.equal(sandboxRes.source, 'sandbox_dataset');
    assert.equal(sandboxRes.isLiveApi, false);
  } finally {
    if (prevKey !== undefined) process.env.POSTZEN_API_KEY = prevKey;
    else delete process.env.POSTZEN_API_KEY;
  }
});

test('17. POSTZEN_BASE_URL é opcional e usa https://api.postzen.dev como padrão quando ausente ou vazia', () => {
  const prevBaseUrl = process.env.POSTZEN_BASE_URL;
  delete process.env.POSTZEN_BASE_URL;

  try {
    const statusMissing = getPostZenConfigStatus({ POSTZEN_API_KEY: 'pz_test' } as NodeJS.ProcessEnv);
    assert.equal(statusMissing.baseUrl, 'https://api.postzen.dev');

    const statusEmpty = getPostZenConfigStatus({
      POSTZEN_API_KEY: 'pz_test',
      POSTZEN_BASE_URL: '   ',
    } as NodeJS.ProcessEnv);
    assert.equal(statusEmpty.baseUrl, 'https://api.postzen.dev');

    const clientMissing = new PostZenClient({ apiKey: 'pz_test' });
    assert.equal(clientMissing.baseUrl, 'https://api.postzen.dev');

    process.env.POSTZEN_BASE_URL = '';
    const clientEmpty = new PostZenClient({ apiKey: 'pz_test' });
    assert.equal(clientEmpty.baseUrl, 'https://api.postzen.dev');
  } finally {
    if (prevBaseUrl !== undefined) process.env.POSTZEN_BASE_URL = prevBaseUrl;
    else delete process.env.POSTZEN_BASE_URL;
  }
});


