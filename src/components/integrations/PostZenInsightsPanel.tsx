// Painel (somente leitura) das contas TikTok conectadas pelo PostZen.
// Esses números são só informativos; não entram no resultado da checagem.

import React, { useEffect, useState, useCallback } from 'react';
import {
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Users,
  BarChart3,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Info,
  Link2,
  X,
} from 'lucide-react';
import {
  PostZenStatus,
  PostZenProfilesResponse,
  PostZenAccountsResponse,
  PostZenAnalyticsResponse,
  PostZenFollowerStatsResponse,
  PostZenCommentsResponse,
  PostZenAccount,
  PostZenOAuthCallbackBanner,
} from '../../types';
import {
  fetchPostZenStatus,
  fetchPostZenProfiles,
  requestPostZenConnectUrl,
  fetchPostZenAccounts,
  fetchPostZenAnalytics,
  fetchPostZenFollowers,
  fetchPostZenComments,
} from '../../services/geminiService';

interface PostZenInsightsPanelProps {
  compact?: boolean;
  defaultExpanded?: boolean;
  oauthResult?: PostZenOAuthCallbackBanner | null;
  onDismissOAuthResult?: () => void;
}

type SubTab = 'analytics' | 'followers' | 'comments';

export function formatPostZenNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Indisponível';
  }
  return value.toLocaleString('pt-BR');
}

export function formatPostZenPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Indisponível';
  }
  return `${value.toFixed(2)}%`;
}

export function formatWatchTimeMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return 'Indisponível';
  }
  if (ms === 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

export function formatSyncDate(iso?: string | null): string {
  if (!iso) return 'Não sincronizado';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export const PostZenInsightsPanel: React.FC<PostZenInsightsPanelProps> = ({
  compact = false,
  defaultExpanded = true,
  oauthResult = null,
  onDismissOAuthResult,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [status, setStatus] = useState<PostZenStatus | null>(null);
  const [profilesRes, setProfilesRes] = useState<PostZenProfilesResponse | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [accountsRes, setAccountsRes] = useState<PostZenAccountsResponse | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [analyticsRes, setAnalyticsRes] = useState<PostZenAnalyticsResponse | null>(null);
  const [followersRes, setFollowersRes] = useState<PostZenFollowerStatsResponse | null>(null);
  const [commentsRes, setCommentsRes] = useState<PostZenCommentsResponse | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('analytics');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAccount: PostZenAccount | null =
    accountsRes?.accounts.find((a) => a.id === selectedAccountId) ||
    accountsRes?.accounts[0] ||
    null;

  const loadAccountDetails = useCallback(
    async (account: PostZenAccount, refresh = false) => {
      setLoadingData(true);
      setErrorMessage(null);
      try {
        const [analyticsData, followersData] = await Promise.all([
          fetchPostZenAnalytics({ accountId: account.id, limit: compact ? 5 : 10, refresh }),
          fetchPostZenFollowers({ accountId: account.id, refresh }),
        ]);
        setAnalyticsRes(analyticsData);
        setFollowersRes(followersData);

        if (account.connectionType === 'tiktok_business') {
          try {
            const commentsData = await fetchPostZenComments({
              accountId: account.id,
              limit: compact ? 5 : 10,
              refresh,
            });
            setCommentsRes(commentsData);
          } catch (commentErr: any) {
            setCommentsRes({
              configured: true,
              readOnly: true,
              hasConnectedAccount: true,
              supported: false,
              account,
              comments: [],
              pagination: { page: 1, limit: 10, total: 0, hasMore: false, nextCursor: null },
              synchronizedAt: new Date().toISOString(),
              cached: false,
              dashboardUrl: 'https://app.postzen.dev',
              message: commentErr?.message || 'Comentários indisponíveis para esta conta.',
            });
          }
        } else {
          setCommentsRes(null);
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Erro ao consultar dados da conta conectada no PostZen.');
      } finally {
        setLoadingData(false);
      }
    },
    [compact]
  );

  const loadAll = useCallback(
    async (refresh = false) => {
      setLoadingStatus(true);
      setErrorMessage(null);
      try {
        const st = await fetchPostZenStatus();
        setStatus(st);

        if (!st.configured) {
          setProfilesRes(null);
          setAccountsRes(null);
          setAnalyticsRes(null);
          setFollowersRes(null);
          setCommentsRes(null);
          return;
        }

        const [profData, accData] = await Promise.all([
          fetchPostZenProfiles(refresh).catch(() => null),
          fetchPostZenAccounts(refresh),
        ]);
        if (profData) {
          setProfilesRes(profData);
          if (!selectedProfileId && profData.defaultProfileId) {
            setSelectedProfileId(profData.defaultProfileId);
          }
        }
        setAccountsRes(accData);

        if (accData.accounts.length > 0) {
          const target =
            accData.accounts.find((a) => a.id === selectedAccountId) || accData.accounts[0];
          setSelectedAccountId(target.id);
          await loadAccountDetails(target, refresh);
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Não foi possível consultar o provedor PostZen.');
      } finally {
        setLoadingStatus(false);
      }
    },
    [loadAccountDetails, selectedAccountId, selectedProfileId]
  );

  useEffect(() => {
    if (isExpanded) {
      loadAll(Boolean(oauthResult));
    }
  }, [isExpanded, oauthResult]);

  const handleSelectAccount = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const acc = accountsRes?.accounts.find((a) => a.id === accountId);
    if (acc) {
      await loadAccountDetails(acc, false);
    }
  };

  const handleStartOAuthConnect = async (reconnectAccountId?: string) => {
    setIsConnectingOAuth(true);
    setErrorMessage(null);
    try {
      const redirectUrl = `${window.location.origin}/api/integrations/postzen/connect/callback/`;
      const res = await requestPostZenConnectUrl({
        profileId: reconnectAccountId ? undefined : selectedProfileId || profilesRes?.defaultProfileId || undefined,
        accountId: reconnectAccountId,
        redirectUrl,
      });
      if (!res.authUrl) {
        throw new Error('O PostZen não retornou uma URL de autorização válida.');
      }
      window.location.assign(res.authUrl);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Não foi possível iniciar o fluxo OAuth do TikTok via PostZen. Verifique se POSTZEN_API_KEY possui permissão Read & Write.'
      );
      setIsConnectingOAuth(false);
    }
  };

  return (
    <section
      aria-label="Métricas de Conta Autorizada via PostZen"
      className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Dados de Contas TikTok Autorizadas (PostZen)
            </h3>
            <span className="text-xs text-slate-400" aria-hidden="true">·</span>
            <span className="text-xs font-medium text-[#003876] dark:text-blue-400">
              Somente leitura
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Métricas oficiais de desempenho, audiência e comentários de contas TikTok conectadas pelo próprio titular no PostZen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isExpanded && status?.configured && (
            <button
              type="button"
              onClick={() => handleStartOAuthConnect()}
              disabled={isConnectingOAuth || loadingStatus}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#003876] hover:bg-[#00295a] text-white transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{isConnectingOAuth ? 'Redirecionando...' : 'Conectar conta TikTok'}</span>
            </button>
          )}
          {isExpanded && (
            <button
              type="button"
              onClick={() => loadAll(true)}
              disabled={loadingStatus || loadingData}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus || loadingData ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          )}
          {compact && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              {isExpanded ? 'Recolher painel' : 'Visualizar dados PostZen'}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 space-y-5">
          {oauthResult && (
            <div
              role="status"
              className={`p-3.5 rounded-lg border flex items-start justify-between gap-2.5 text-xs ${
                oauthResult.status === 'success'
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                  : 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {oauthResult.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    {oauthResult.status === 'success'
                      ? 'Autorização TikTok via PostZen concluída'
                      : `Falha na autorização TikTok (${oauthResult.errorCode || 'oauth_error'})`}
                  </p>
                  <p className="leading-relaxed">
                    {oauthResult.message ||
                      (oauthResult.status === 'success'
                        ? 'Lista de contas conectadas atualizada.'
                        : 'Não foi possível finalizar o fluxo OAuth.')}
                  </p>
                </div>
              </div>
              {onDismissOAuthResult && (
                <button
                  type="button"
                  onClick={onDismissOAuthResult}
                  aria-label="Fechar aviso"
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-[#003876] dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-100">Separação Metodológica:</strong>{' '}
              O PostZen atua exclusivamente como provedor de conexão e dados de contas autorizadas no TikTok. Alcance, visualizações ou seguidores não comprovam veracidade nem constituem verificação factual.
            </p>
          </div>

          {status?.configured && profilesRes && profilesRes.profiles.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/30 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                Perfil PostZen de destino para novas conexões TikTok:
              </span>
              <select
                aria-label="Perfil PostZen"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {profilesRes.profiles.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.name}
                    {prof.isDefault ? ' (Padrão)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Aviso da integração PostZen</p>
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {loadingStatus && !status && (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Verificando status da integração PostZen...
            </div>
          )}

          {status && !status.configured && (
            <div className="p-5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-4">
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Provedor PostZen aguardando configuração no servidor
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {status.message} Nenhuma conta falsa ou métrica simulada é exibida quando a credencial não está configurada.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Capacidades disponíveis (somente leitura):</p>
                  <ul className="space-y-1 list-disc pl-4">
                    {status.supportedCapabilities.map((cap, idx) => (
                      <li key={idx}>{cap}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Como ativar com segurança:</p>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Defina <code className="font-mono text-[11px] bg-slate-200/70 dark:bg-slate-800 px-1 py-0.5 rounded">POSTZEN_API_KEY</code> no ambiente do servidor e conecte a conta autorizada diretamente no painel oficial do PostZen.
                  </p>
                  <a
                    href={status.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#003876] hover:bg-[#00295a] text-white text-xs font-semibold transition-colors"
                  >
                    <span>Abrir Painel Oficial do PostZen</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {status?.configured && accountsRes && accountsRes.accounts.length === 0 && (
            <div className="p-5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Nenhuma conta TikTok conectada no PostZen
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {accountsRes.guidance}
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleStartOAuthConnect()}
                  disabled={isConnectingOAuth}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#003876] hover:bg-[#00295a] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{isConnectingOAuth ? 'Iniciando OAuth...' : 'Conectar conta TikTok via PostZen'}</span>
                </button>
                <a
                  href={accountsRes.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
                >
                  <span>Painel PostZen</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {selectedAccount && (
            <div className="space-y-5">
              <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span>@{selectedAccount.username}</span>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                      <span className="text-xs font-semibold text-[#003876] dark:text-blue-400">
                        {selectedAccount.connectionLabel}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                      <span
                        className={`text-xs font-semibold ${
                          selectedAccount.isActive
                            ? 'text-[#00A86B] dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {selectedAccount.isActive ? 'Autorização ativa' : 'Reconexão necessária'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedAccount.guidance}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(selectedAccount.reconnectionRequired || selectedAccount.connectionType === 'earlier_connection') && (
                      <button
                        type="button"
                        onClick={() => handleStartOAuthConnect(selectedAccount.id)}
                        disabled={isConnectingOAuth}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[#003876]/30 text-[#003876] dark:text-blue-400 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {selectedAccount.reconnectionRequired
                          ? 'Reconectar OAuth'
                          : 'Migrar para TikTok for Business'}
                      </button>
                    )}

                    {accountsRes && accountsRes.accounts.length > 1 && (
                      <div className="flex items-center gap-2">
                        <label htmlFor="postzen-account-select" className="text-xs text-slate-500">
                          Conta:
                        </label>
                        <select
                          id="postzen-account-select"
                          value={selectedAccount.id}
                          onChange={(e) => handleSelectAccount(e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          {accountsRes.accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              @{acc.username} ({acc.connectionLabel})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#00A86B]" />
                    <span>
                      Permissões: {selectedAccount.availablePermissions.length} escopos somente leitura ativos
                    </span>
                  </span>
                  <span className="font-mono tabular-nums">
                    Última sincronização: {formatSyncDate(analyticsRes?.synchronizedAt || accountsRes?.synchronizedAt)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('analytics')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeSubTab === 'analytics'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Métricas &amp; Publicações</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('followers')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeSubTab === 'followers'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Seguidores</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('comments')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    activeSubTab === 'comments'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Comentários</span>
                </button>
              </div>

              {loadingData && (
                <div className="py-6 text-center text-xs text-slate-500">
                  Consultando métricas atualizadas via PostZen...
                </div>
              )}

              {!loadingData && activeSubTab === 'analytics' && analyticsRes && (
                <div className="space-y-4">
                  {analyticsRes.accountInsights && (
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Insights da Conta (TikTok for Business)
                        </span>
                        <span className="text-slate-500">
                          {analyticsRes.accountInsights.supported ? 'Disponível' : 'Não suportado nesta conexão'}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {analyticsRes.accountInsights.followerThresholdNotice || analyticsRes.accountInsights.message}
                      </p>
                    </div>
                  )}

                  {analyticsRes.posts.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">{analyticsRes.message}</p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400">
                            <th className="py-2.5 px-3 font-semibold">Publicação</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Visualizações</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Curtidas</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Comentários</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Compartilhamentos</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Engajamento</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Alcance</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Salvamentos</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Tempo Médio</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Conclusão</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {analyticsRes.posts.map((post) => (
                            <tr key={post.postId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                              <td className="py-2.5 px-3 max-w-[220px]">
                                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {post.title}
                                </div>
                                <div className="text-[11px] text-slate-500 tabular-nums">
                                  {post.publishedAt ? formatSyncDate(post.publishedAt) : 'Data indisponível'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPostZenNumber(post.metrics.views)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPostZenNumber(post.metrics.likes)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPostZenNumber(post.metrics.comments)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPostZenNumber(post.metrics.shares)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPostZenPercent(post.metrics.engagementRate)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                {formatPostZenNumber(post.metrics.reach)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                {formatPostZenNumber(post.metrics.saves)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                {formatWatchTimeMs(post.metrics.avgWatchTimeMs)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                {formatPostZenPercent(post.metrics.completionRate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    {analyticsRes.platformNotes.slice(0, 3).map((note, idx) => (
                      <p key={idx}>• {note}</p>
                    ))}
                  </div>
                </div>
              )}

              {!loadingData && activeSubTab === 'followers' && followersRes && (
                <div className="space-y-4">
                  {!followersRes.supported ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">{followersRes.message}</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500">Seguidores atuais</div>
                          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                            {formatPostZenNumber(followersRes.summary?.currentFollowers)}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500">Variação líquida</div>
                          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                            {formatPostZenNumber(followersRes.summary?.netChange)}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500">Taxa de crescimento</div>
                          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                            {formatPostZenPercent(followersRes.summary?.growthRate)}
                          </div>
                        </div>
                      </div>

                      {followersRes.stats.length === 0 ? (
                        <p className="text-xs text-slate-500">{followersRes.message}</p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                                <th className="py-2 px-3 font-semibold">Data</th>
                                <th className="py-2 px-3 font-semibold text-right">Seguidores</th>
                                <th className="py-2 px-3 font-semibold text-right">Saldo do período</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {followersRes.stats.map((point, idx) => (
                                <tr key={idx}>
                                  <td className="py-2 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                    {point.date || 'Indisponível'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                                    {formatPostZenNumber(point.followersCount)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                    {formatPostZenNumber(point.netChange)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!loadingData && activeSubTab === 'comments' && (
                <div className="space-y-3">
                  {selectedAccount.connectionType !== 'tiktok_business' ? (
                    <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                      A leitura de comentários exige que a conta esteja conectada pelo fluxo <strong>TikTok for Business</strong> no PostZen.
                    </div>
                  ) : commentsRes && commentsRes.comments.length > 0 ? (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                      {commentsRes.comments.map((comment) => (
                        <div key={comment.id} className="p-3.5 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {comment.authorName}
                              {comment.authorHandle ? ` (@${comment.authorHandle})` : ''}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                              Curtidas: {formatPostZenNumber(comment.likesCount)}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                            {comment.text}
                          </p>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {comment.createdAt ? formatSyncDate(comment.createdAt) : 'Data indisponível'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {commentsRes?.message || 'Nenhum comentário disponível para esta conta no momento.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
