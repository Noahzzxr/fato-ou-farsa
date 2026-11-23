import React, { useState, useEffect } from 'react';
import {
  ThemeConfig,
  InvestigationReport,
  TikTokProfile,
  TikTokVideo,
  PostZenOAuthCallbackBanner,
} from './types';
import { calculateStatisticalSummary } from './utils/statistics';
import { DEMO_DATASETS } from './data/mockProfiles';
import { requestAiAnalysis, fetchTikTokProfileData } from './services/geminiService';
import { AppNavbar } from './components/layout/AppNavbar';
import { HomeSimpleView } from './components/home/HomeSimpleView';
import { DashboardView } from './components/dashboard/DashboardView';
import { SettingsModal } from './components/settings/SettingsModal';
import { HistoryDrawer } from './components/dashboard/HistoryDrawer';
import { NewAnalysisModal } from './components/dashboard/NewAnalysisModal';
import { DirectFactCheckModal } from './components/factcheck/DirectFactCheckModal';
import { ApiIntegrationsModal } from './components/integrations/ApiIntegrationsModal';
import { TermsPage } from './components/legal/TermsPage';
import { PrivacyPage } from './components/legal/PrivacyPage';

export type AppView = 'home' | 'dashboard' | 'terms' | 'privacy';

const getInitialView = (): AppView => {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.toLowerCase();
    if (path === '/terms' || path.startsWith('/terms/')) return 'terms';
    if (path === '/privacy' || path.startsWith('/privacy/')) return 'privacy';
  }
  return 'home';
};

const THEME_STORAGE_KEY = 'fatooufarsa_theme_config';

const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: 'light',
  reducedMotion: false,
};

const loadThemeConfig = (): ThemeConfig => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return DEFAULT_THEME_CONFIG;
    const parsed = JSON.parse(saved);
    // Mantém só os campos usados (versões antigas salvavam outras chaves)
    return {
      mode: ['light', 'dark', 'auto'].includes(parsed?.mode) ? parsed.mode : DEFAULT_THEME_CONFIG.mode,
      reducedMotion: Boolean(parsed?.reducedMotion),
    };
  } catch {
    return DEFAULT_THEME_CONFIG;
  }
};

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>(getInitialView);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(loadThemeConfig);

  // Modais
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isNewAnalysisOpen, setIsNewAnalysisOpen] = useState(false);
  const [isDirectFactCheckOpen, setIsDirectFactCheckOpen] = useState(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [apiModalTab, setApiModalTab] = useState<'status' | 'postzen'>('status');
  const [postzenOAuthBanner, setPostzenOAuthBanner] = useState<PostZenOAuthCallbackBanner | null>(null);

  const [selectedDemoId, setSelectedDemoId] = useState<string>('saude_vital');

  // Retorno do callback OAuth do PostZen (?postzen_connect=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('postzen_connect');
    if (statusParam === 'success' || statusParam === 'error') {
      const accountsCountRaw = params.get('accountsCount');
      setPostzenOAuthBanner({
        status: statusParam,
        errorCode: params.get('errorCode') || undefined,
        message: params.get('message') || undefined,
        username: params.get('username') || undefined,
        accountsCount: accountsCountRaw ? Number(accountsCountRaw) : undefined,
      });
      setApiModalTab('postzen');
      setIsApiModalOpen(true);

      params.delete('postzen_connect');
      params.delete('errorCode');
      params.delete('message');
      params.delete('username');
      params.delete('accountsCount');
      const remaining = params.toString();
      const cleanUrl = `${window.location.pathname || '/'}${remaining ? `?${remaining}` : ''}`;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, []);

  const [activeReport, setActiveReport] = useState<InvestigationReport>(() => {
    const demo = DEMO_DATASETS['saude_vital'];
    const stats = calculateStatisticalSummary(demo.posts);
    return {
      id: 'report_initial',
      createdAt: new Date().toLocaleString('pt-BR'),
      profile: demo.profile,
      posts: demo.posts,
      statistics: stats,
      aiAnalysis: demo.presetAiResult,
      isDemo: true,
      dataSource: 'sandbox_dataset',
    };
  });

  const [historyReports, setHistoryReports] = useState<InvestigationReport[]>(() => {
    try {
      const saved = localStorage.getItem('fatooufarsa_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Aplica o tema escolhido em Configurações
  useEffect(() => {
    const root = document.documentElement;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeConfig));
    } catch {
      // localStorage indisponível (aba anônima, etc.)
    }

    const isDark =
      themeConfig.mode === 'dark' ||
      (themeConfig.mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    root.classList.toggle('reduce-motion', themeConfig.reducedMotion);

    // No modo "Sistema", acompanha a troca de tema do aparelho
    if (themeConfig.mode !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (ev: MediaQueryListEvent) => {
      root.classList.toggle('dark', ev.matches);
      root.classList.toggle('light', !ev.matches);
    };
    media.addEventListener('change', handleSystemChange);
    return () => media.removeEventListener('change', handleSystemChange);
  }, [themeConfig]);

  const navigateTo = (view: AppView) => {
    setCurrentView(view);
    const targetPath = view === 'terms' ? '/terms' : view === 'privacy' ? '/privacy' : '/';
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== targetPath && (view === 'terms' || view === 'privacy' || targetPath === '/')) {
        window.history.pushState(null, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Botões voltar/avançar do navegador
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/terms' || path.startsWith('/terms/')) {
        setCurrentView('terms');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (path === '/privacy' || path.startsWith('/privacy/')) {
        setCurrentView('privacy');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (currentView === 'terms' || currentView === 'privacy') {
        setCurrentView('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentView]);

  // Guarda até 15 análises, uma por perfil
  const saveToHistory = (report: InvestigationReport) => {
    setHistoryReports((prev) => {
      const filtered = prev.filter((r) => r.profile.username !== report.profile.username);
      const updated = [report, ...filtered].slice(0, 15);
      try {
        localStorage.setItem('fatooufarsa_history', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const handleSelectDemoScenario = (demoId: string) => {
    const demo = DEMO_DATASETS[demoId] || DEMO_DATASETS['saude_vital'];
    setSelectedDemoId(demoId);
    const stats = calculateStatisticalSummary(demo.posts);
    const newReport: InvestigationReport = {
      id: `report_${demoId}_${Date.now()}`,
      createdAt: new Date().toLocaleString('pt-BR'),
      profile: demo.profile,
      posts: demo.posts,
      statistics: stats,
      aiAnalysis: demo.presetAiResult,
      isDemo: true,
      dataSource: 'sandbox_dataset',
    };
    setActiveReport(newReport);
    saveToHistory(newReport);
    setCurrentView('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePerformAnalysis = async (input: string, manualTranscript?: string) => {
    let clean = input.trim();

    // Se for link do TikTok, usa só o @ do perfil
    if (clean.includes('tiktok.com/')) {
      try {
        const url = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0 && parts[0].startsWith('@')) {
          clean = parts[0];
        }
      } catch {
        // link inválido: segue com o texto digitado
      }
    }

    clean = clean.replace('@', '').toLowerCase();

    // Termos que abrem os perfis de exemplo
    if (clean.includes('saude') || clean.includes('vital')) {
      handleSelectDemoScenario('saude_vital');
      return;
    }
    if (clean.includes('invest') || clean.includes('tech') || clean.includes('pix') || clean.includes('trader')) {
      handleSelectDemoScenario('tech_investimentos');
      return;
    }
    if (clean.includes('mariana') || clean.includes('nutri') || clean.includes('dra')) {
      handleSelectDemoScenario('dra_mariana');
      return;
    }
    if (clean.includes('noticia') || clean.includes('urgente') || clean.includes('fato') || clean.includes('plantao')) {
      handleSelectDemoScenario('noticias_urgente');
      return;
    }

    setIsLoadingAi(true);

    try {
      // Dados do perfil/vídeo (PostZen ou texto colado pelo usuário)
      const tiktokData = await fetchTikTokProfileData(
        input,
        manualTranscript
      );

      const targetProfile: TikTokProfile = {
        username: tiktokData.profile.username,
        fullName: tiktokData.profile.fullName,
        avatarUrl: tiktokData.profile.avatarUrl,
        isVerified: tiktokData.profile.isVerified,
        followersCount: tiktokData.profile.followersCount,
        followingCount: tiktokData.profile.followingCount,
        likesReceivedCount: tiktokData.profile.likesReceivedCount,
        videosCount: tiktokData.profile.videosCount,
        biography: tiktokData.profile.biography,
        category: tiktokData.profile.category,
        profileUrl: tiktokData.profile.profileUrl,
        joinedDate: tiktokData.profile.joinedDate,
      };

      const targetPosts: TikTokVideo[] = tiktokData.posts.map((p) => ({
        id: p.id,
        videoId: p.videoId,
        type: p.type,
        caption: p.caption,
        transcript: p.transcript,
        soundTitle: p.soundTitle,
        timestamp: p.timestamp,
        formattedDate: p.formattedDate,
        viewsCount: p.viewsCount,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        sharesCount: p.sharesCount,
        savesCount: p.savesCount,
        durationSeconds: p.durationSeconds,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        isOutlier: p.isOutlier,
        anomalyScore: p.anomalyScore,
        suspicionFlags: p.suspicionFlags,
      }));

      const stats = calculateStatisticalSummary(targetPosts);

      const aiResult = await requestAiAnalysis(targetProfile, targetPosts, stats);

      const newReport: InvestigationReport = {
        id: `report_${targetProfile.username}_${Date.now()}`,
        createdAt: new Date().toLocaleString('pt-BR'),
        profile: targetProfile,
        posts: targetPosts,
        statistics: stats,
        aiAnalysis: aiResult,
        isDemo: !tiktokData.isLiveApi,
        dataSource: tiktokData.source,
        submittedTranscript: manualTranscript,
      };

      setActiveReport(newReport);
      saveToHistory(newReport);
    } catch (err) {
      console.error('Falha ao processar análise do TikTok:', err);
    } finally {
      setIsLoadingAi(false);
      setCurrentView('dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleRefreshAi = async () => {
    setIsLoadingAi(true);
    try {
      const aiResult = await requestAiAnalysis(
        activeReport.profile,
        activeReport.posts,
        activeReport.statistics,
        activeReport.aiAnalysis
      );
      const updated = {
        ...activeReport,
        aiAnalysis: aiResult,
      };
      setActiveReport(updated);
      saveToHistory(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <AppNavbar
        currentView={currentView}
        onNavigateHome={() => navigateTo('home')}
        onOpenNewAnalysis={() => setIsNewAnalysisOpen(true)}
        onOpenDirectFactCheck={() => setIsDirectFactCheckOpen(true)}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={historyReports.length}
        onNavigateTerms={() => navigateTo('terms')}
        onNavigatePrivacy={() => navigateTo('privacy')}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col">
        {currentView === 'terms' ? (
          <TermsPage onNavigateHome={() => navigateTo('home')} />
        ) : currentView === 'privacy' ? (
          <PrivacyPage onNavigateHome={() => navigateTo('home')} />
        ) : currentView === 'home' ? (
          <HomeSimpleView
            onStartAnalysis={handlePerformAnalysis}
            onSelectDemo={handleSelectDemoScenario}
            isLoading={isLoadingAi}
            onOpenDirectFactCheck={() => setIsDirectFactCheckOpen(true)}
            onOpenApiModal={() => {
              setApiModalTab('status');
              setIsApiModalOpen(true);
            }}
          />
        ) : (
          <DashboardView
            report={activeReport}
            onBackToHome={() => navigateTo('home')}
            onSelectDemoScenario={handleSelectDemoScenario}
            onPerformNewAnalysis={handlePerformAnalysis}
            onRefreshAi={handleRefreshAi}
            isLoadingAi={isLoadingAi}
            historyReports={historyReports}
            onSelectHistoryReport={(rep) => {
              setActiveReport(rep);
              setCurrentView('dashboard');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onClearHistory={() => {
              setHistoryReports([]);
              try {
                localStorage.removeItem('fatooufarsa_history');
              } catch (e) {
                console.error(e);
              }
            }}
            selectedDemoId={selectedDemoId}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-5 px-4 sm:px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Fato ou Farsa — checagem de vídeos do TikTok
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px]">O resultado é um apoio: confira sempre as fontes indicadas.</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium">
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('terms');
              }}
              className="text-slate-600 dark:text-slate-400 hover:text-[#003876] dark:hover:text-blue-400 hover:underline transition-colors cursor-pointer"
            >
              Termos de Uso
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('privacy');
              }}
              className="text-slate-600 dark:text-slate-400 hover:text-[#003876] dark:hover:text-blue-400 hover:underline transition-colors cursor-pointer"
            >
              Política de Privacidade
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => {
                setApiModalTab('status');
                setIsApiModalOpen(true);
              }}
              className="text-slate-600 dark:text-slate-400 hover:text-[#003876] dark:hover:text-blue-400 hover:underline transition-colors cursor-pointer"
            >
              Fontes de dados
            </button>
          </div>
        </div>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeConfig={themeConfig}
        onThemeConfigChange={setThemeConfig}
        onClearHistory={() => {
          setHistoryReports([]);
          try {
            localStorage.removeItem('fatooufarsa_history');
          } catch (e) {
            console.error(e);
          }
        }}
        historyCount={historyReports.length}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        reports={historyReports}
        onSelectReport={(rep) => {
          setActiveReport(rep);
          setCurrentView('dashboard');
          setIsHistoryOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onClearHistory={() => {
          setHistoryReports([]);
          try {
            localStorage.removeItem('fatooufarsa_history');
          } catch (e) {
            console.error(e);
          }
        }}
      />

      <NewAnalysisModal
        isOpen={isNewAnalysisOpen}
        onClose={() => setIsNewAnalysisOpen(false)}
        onSubmitAnalysis={handlePerformAnalysis}
        onSelectDemoScenario={handleSelectDemoScenario}
      />

      <DirectFactCheckModal
        isOpen={isDirectFactCheckOpen}
        onClose={() => setIsDirectFactCheckOpen(false)}
      />

      <ApiIntegrationsModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        initialTab={apiModalTab}
        oauthResult={postzenOAuthBanner}
        onDismissOAuthResult={() => setPostzenOAuthBanner(null)}
      />
    </div>
  );
}
