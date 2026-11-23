// Modal "Fontes de dados": status dos serviços (PostZen, Gemini) e conexão de contas.

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Server,
  Key,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  BookOpen,
  Database,
  Terminal,
  Code,
  Layers,
  FileText,
  Link2,
} from 'lucide-react';
import { fetchSystemStatus } from '../../services/geminiService';
import { SystemStatus, PostZenOAuthCallbackBanner } from '../../types';
import { PostZenInsightsPanel } from './PostZenInsightsPanel';

interface ApiIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'status' | 'postzen' | 'tutorial' | 'tiktok_rules' | 'django_mvp';
  oauthResult?: PostZenOAuthCallbackBanner | null;
  onDismissOAuthResult?: () => void;
}

export function ApiIntegrationsModal({
  isOpen,
  onClose,
  initialTab = 'status',
  oauthResult = null,
  onDismissOAuthResult,
}: ApiIntegrationsModalProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'postzen' | 'tutorial' | 'tiktok_rules' | 'django_mvp'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      loadStatus();
    }
  }, [isOpen, initialTab]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchSystemStatus();
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyEnvSnippet = () => {
    const snippet = `GEMINI_API_KEY="sua_chave_gemini"
POSTZEN_API_KEY="sua_chave_postzen"
# Opcional (padrão: https://api.postzen.dev)
# POSTZEN_BASE_URL="https://api.postzen.dev"
PORT=3000`;
    navigator.clipboard.writeText(snippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 overflow-y-auto"
    >
      <div className="relative w-full max-w-3xl my-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 id="api-modal-title" className="text-xl font-bold text-slate-900 dark:text-white">
                Fontes de dados e serviços conectados
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                De onde vêm os números do TikTok e onde as afirmações são conferidas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900/30 overflow-x-auto">
          <button
            onClick={() => setActiveTab('django_mvp')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'django_mvp'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Backend (Django)
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'status'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Situação dos serviços
          </button>
          <button
            onClick={() => setActiveTab('postzen')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'postzen'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            PostZen (TikTok Autorizado)
          </button>
          <button
            onClick={() => setActiveTab('tutorial')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'tutorial'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Como Configurar PostZen
          </button>
          <button
            onClick={() => setActiveTab('tiktok_rules')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'tiktok_rules'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Limites do TikTok
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'status' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      PostZen TikTok API
                    </span>
                    <Server className="w-4 h-4 text-[#003876] dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                      {status?.postzen?.configured ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>Conectado</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span>Aguardando POSTZEN_API_KEY</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {status?.postzen?.configured
                        ? 'Conexão OAuth e leitura de dados TikTok via PostZen v1'
                        : 'Configure POSTZEN_API_KEY no backend (.env); nenhuma chave direta do TikTok é necessária'}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{status?.postzen?.baseUrl || 'https://api.postzen.dev'}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('postzen')}
                      className="text-blue-600 dark:text-blue-400 font-sans font-semibold hover:underline cursor-pointer"
                    >
                      Abrir painel
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      Busca de fontes
                    </span>
                    <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Funcionando</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Procura na web o que fontes confiáveis dizem sobre cada afirmação (Google)
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 font-mono">
                    Se ficar indisponível, usamos a base local de checagens
                  </div>
                </div>

                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      Bases de checagem
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>{status?.factCheckEngine?.sourcesCount || 8} fontes</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      ANVISA, CFM, CVM, Agência Lupa, Aos Fatos e Comprova
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 font-mono">
                    Órgãos oficiais e agências de checagem
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Conectar contas TikTok (PostZen)
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {status?.postzen?.configured ? 'Credencial POSTZEN_API_KEY ativa' : 'Aguardando POSTZEN_API_KEY'}
                    </span>
                  </div>
                  <button
                    onClick={loadStatus}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="Atualizar status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  A integração com o TikTok é feita pelo <strong>PostZen</strong>, então não é preciso cadastrar um app no TikTok for Developers. A autenticação OAuth (<code className="font-mono text-[11px]">GET /v1/profiles</code> &rarr; <code className="font-mono text-[11px]">GET /v1/connect/tiktok</code>) e consulta de métricas ocorre no backend com <code className="font-mono text-[11px]">POSTZEN_API_KEY</code>.
                </p>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('postzen')}
                    className="px-3.5 py-2 bg-[#003876] hover:bg-[#00295a] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Conectar conta TikTok</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tutorial')}
                    className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Como configurar o .env
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'postzen' && (
            <PostZenInsightsPanel
              compact={false}
              defaultExpanded={true}
              oauthResult={oauthResult}
              onDismissOAuthResult={onDismissOAuthResult}
            />
          )}

          {activeTab === 'tutorial' && (
            <div className="space-y-5 text-xs text-slate-700 dark:text-slate-300">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">1</span>
                  Gerar a POSTZEN_API_KEY no painel do PostZen
                </h3>
                <p className="text-slate-600 dark:text-slate-400 pl-8 leading-relaxed">
                  Acesse{' '}
                  <a
                    href="https://app.postzen.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-0.5"
                  >
                    app.postzen.dev <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}e gere sua chave de API. Para iniciar conexões OAuth TikTok diretamente pelo app via <code className="font-mono text-[11px]">/v1/connect/tiktok</code>, utilize uma chave Read &amp; Write; para apenas leitura de contas já conectadas, uma chave de leitura é suficiente.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">2</span>
                  Preencher o .env do servidor
                </h3>
                <div className="pl-8 space-y-2">
                  <p className="text-slate-600 dark:text-slate-400">
                    Copie o modelo abaixo para o seu arquivo <code className="font-mono">.env</code> (nunca exponha chaves no frontend). A variável <code className="font-mono">POSTZEN_BASE_URL</code> é opcional e assume <code className="font-mono">https://api.postzen.dev</code> por padrão:
                  </p>
                  <div className="relative">
                    <pre className="p-3.5 rounded-md bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto border border-slate-800">
{`GEMINI_API_KEY="AIzaSy..."
POSTZEN_API_KEY="sua_chave_postzen"
# Opcional (padrão: https://api.postzen.dev)
# POSTZEN_BASE_URL="https://api.postzen.dev"
PORT=3000`}
                    </pre>
                    <button
                      onClick={copyEnvSnippet}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="text-[10px]">{copiedEnv ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">3</span>
                  Conectar a conta pelo OAuth
                </h3>
                <p className="text-slate-600 dark:text-slate-400 pl-8 leading-relaxed">
                  Na aba <strong>PostZen (TikTok Autorizado)</strong>, clique em <strong>Conectar conta TikTok</strong>. O backend obtém o <code className="font-mono text-[11px]">profileId</code> em <code className="font-mono text-[11px]">GET /v1/profiles</code>, solicita <code className="font-mono text-[11px]">authUrl</code> e <code className="font-mono text-[11px]">state</code> (validade de 10 minutos) em <code className="font-mono text-[11px]">GET /v1/connect/tiktok</code>, redireciona ao TikTok e valida o callback antes de atualizar <code className="font-mono text-[11px]">GET /v1/accounts</code>.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">4</span>
                  Sem conta conectada
                </h3>
                <p className="text-slate-600 dark:text-slate-400 pl-8 leading-relaxed">
                  Para vídeos de contas que não estão conectadas, basta colar a legenda ou a transcrição. A checagem das afirmações funciona do mesmo jeito (Gemini + Google Search).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tiktok_rules' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Como os dados do TikTok são obtidos</span>
                </div>
                <p className="text-xs leading-relaxed text-blue-800/90 dark:text-blue-300/90">
                  Não fazemos scraping de perfis. Só lemos dados de contas que autorizaram o acesso pelo PostZen.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                    1. Dados vêm só do PostZen
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    Conexões anteriores permitem leitura de métricas básicas de publicações; conexões atualizadas via <strong>TikTok for Business</strong> no fluxo OAuth do PostZen habilitam métricas avançadas, insights da conta (exigindo no mínimo 100 seguidores para dados demográficos) e leitura de comentários. O histórico típico do TikTok cobre 60 dias com atraso de 24h a 48h.
                  </p>
                </div>

                <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                    2. Métricas e checagem são coisas separadas
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    O PostZen só entrega as métricas da conta conectada. Quem avalia as afirmações é o Gemini com Google Search, e o backend Django salva o resultado no banco. O app não publica, agenda nem modera nada no TikTok.
                  </p>
                </div>

                <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                    3. Sem scraping
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    Para vídeos de outras contas, o usuário cola a legenda ou a transcrição.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'django_mvp' && (
            <div className="space-y-6">
              <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-600 text-white mt-0.5 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Backend em Python / Django 5
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
                      Django REST Framework
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    API REST com Django REST Framework. As análises ficam salvas no banco (PostgreSQL em produção, SQLite em desenvolvimento) e podem ser consultadas pelo Django Admin.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Principais tabelas
                  </div>
                  <div className="space-y-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">TikTokProfile</span>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Perfis analisados: seguidores, curtidas, selo de verificado e bio.</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">TikTokVideo</span>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Vídeos com visualizações, curtidas, comentários, compartilhamentos e marcação de fora do padrão.</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">InvestigationReport</span>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Cada análise feita: médias, mediana, desvio padrão, taxa de engajamento e conclusão.</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">ClaimVerification &amp; EvidenceSource</span>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Afirmações checadas, veredito e as fontes usadas (ANVISA, CFM, CVM...).</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Code className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Endpoints
                  </div>
                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <span className="text-blue-600 dark:text-blue-400 font-bold">GET /api/status</span>
                      <span className="text-[10px] text-slate-400 font-sans">Status</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">POST /api/analyze</span>
                      <span className="text-[10px] text-slate-400 font-sans">Análise completa</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">POST /api/verify-claims</span>
                      <span className="text-[10px] text-slate-400 font-sans">Checar afirmações</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">POST /api/calculate-stats</span>
                      <span className="text-[10px] text-slate-400 font-sans">Estatísticas</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <span className="text-blue-600 dark:text-blue-400 font-bold">GET /api/history</span>
                      <span className="text-[10px] text-slate-400 font-sans">Histórico</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <span className="text-purple-600 dark:text-purple-400 font-bold">GET /admin/</span>
                      <span className="text-[10px] text-slate-400 font-sans">Django Admin</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    Comandos úteis
                  </div>
                  <span className="text-[10px] text-slate-400">Python 3 + Django 5</span>
                </div>
                <div className="space-y-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400"># Subir o Django:</span>
                      <div className="text-emerald-400 select-all">python manage.py runserver 127.0.0.1:5001 --noreload</div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400"># Rodar os testes:</span>
                      <div className="text-emerald-400 select-all">python manage.py test verification -v 2</div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400"># Criar usuário do Django Admin:</span>
                      <div className="text-emerald-400 select-all">python manage.py createsuperuser</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    Mais detalhes em <strong className="font-mono text-emerald-700 dark:text-emerald-300">DJANGO_MVP_DOCUMENTATION.md</strong> e o script do banco em <strong className="font-mono text-emerald-700 dark:text-emerald-300">database/schema.sql</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <span className="text-[11px] text-slate-500 font-mono">
            Fato ou Farsa • Fontes de dados
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
