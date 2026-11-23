// Tipos compartilhados do frontend.

export type ThemeMode = 'dark' | 'light' | 'auto';

// Preferências do usuário (salvas no localStorage e editadas só em Configurações)
export interface ThemeConfig {
  mode: ThemeMode;
  reducedMotion: boolean;
}

export interface TikTokProfile {
  username: string;
  fullName: string;
  avatarUrl: string;
  isVerified: boolean;
  followersCount: number;
  followingCount: number;
  likesReceivedCount?: number; // Total de curtidas recebidas no perfil
  videosCount: number;
  biography: string;
  category: string;
  profileUrl: string;
  joinedDate?: string;
}

// Compatibilidade de tipo
export type InstagramProfile = TikTokProfile;

export type VideoFormat = 'video' | 'photo_carousel' | 'livestream_clip';
export type PostFormat = VideoFormat;

export interface TikTokVideo {
  id: string;
  videoId?: string;
  shortcode?: string;
  type: VideoFormat;
  caption: string; // Legenda do TikTok
  transcript?: string; // Transcrição de áudio / narração
  soundTitle?: string; // Título do som / áudio original ou comercial
  timestamp: string;
  formattedDate: string;
  viewsCount: number | null; // Reproduções / Plays
  likesCount: number | null; // Curtidas / Diggs
  commentsCount: number | null; // Comentários
  sharesCount: number | null; // Compartilhamentos
  savesCount?: number | null; // Salvamentos / Favoritos
  durationSeconds?: number | null; // Duração do vídeo
  url: string;
  thumbnailUrl: string;
  isOutlier: boolean;
  anomalyScore: number; // 0 a 100
  suspicionFlags: string[];
  evidenceNotes?: string;
}

// Compatibilidade de tipo
export type InstagramPost = TikTokVideo;

export interface StatisticalSummary {
  totalPostsAnalyzed: number;
  postsWithMetricsCount: number;
  postsWithMissingMetricsCount: number;
  avgViews: number | null;
  medianViews: number | null;
  minViews: number | null;
  maxViews: number | null;
  avgLikes: number | null;
  medianLikes: number | null;
  minLikes: number | null;
  maxLikes: number | null;
  avgComments: number | null;
  medianComments: number | null;
  likesToViewsRatio: number | null; // Porcentagem de curtidas por visualização
  commentsToLikesRatio: number | null;
  engagementRate: number | null;
  outlierCount: number;
  outlierRatio: number;
  suspiciousEngagementScore: number; // 0 a 100
  distributionInsight: string;
  sampleSizeWarning: string | null;
}

export type AIClassification =
  | 'Sem indícios relevantes identificados'
  | 'Indícios que merecem investigação'
  | 'Possível conteúdo enganoso'
  | 'Evidências consistentes de falsidade ou manipulação'
  | 'Dados insuficientes para concluir';

export interface AIAspectEvaluation {
  aspect: string;
  evaluation: string;
  status: 'normal' | 'alerta' | 'critico';
}

export interface AIAnalysisResult {
  classification: AIClassification;
  confidenceScore: number;
  confidenceLevel: 'Baixa' | 'Média' | 'Alta';
  evidenceSummary: string;
  supportingObservations: string[];
  alternativeExplanations: string[];
  limitations: string[];
  recommendedNextSteps: string[];
  analyzedAspects: AIAspectEvaluation[];
  investigatedAt: string;
  modelUsed: string;
  requiresOfficialReport: boolean;
}

export interface InvestigationReport {
  id: string;
  createdAt: string;
  profile: TikTokProfile;
  posts: TikTokVideo[];
  statistics: StatisticalSummary;
  aiAnalysis: AIAnalysisResult;
  isDemo: boolean;
  dataSource?: 'postzen_api' | 'sandbox_dataset' | 'manual_input';
  statusMessage?: string;
  submittedUrl?: string;
  submittedTranscript?: string;
}

export interface VerifiedSource {
  name: string;
  title: string;
  url: string;
  quote?: string;
  isOfficialAgency: boolean;
}

export interface ClaimVerificationItem {
  id: string;
  claimText: string;
  category: 'Saúde' | 'Finanças' | 'Notícias' | 'Ciência' | 'Geral';
  verdict:
    | 'Falso'
    | 'Enganoso'
    | 'Sem Evidências Científicas'
    | 'Exagerado'
    | 'Fora de Contexto'
    | 'Verdadeiro / Respaldado';
  confidenceScore: number;
  evidenceSummary: string;
  scientificConsensus?: string;
  officialAlert?: string;
  sources: VerifiedSource[];
}

export interface FactCheckResult {
  textAnalyzed: string;
  topic: string;
  claims: ClaimVerificationItem[];
  overallRiskLevel: 'baixo' | 'moderado' | 'alto' | 'critico';
  engineUsed: string;
  investigatedAt: string;
}

export interface PostZenStatus {
  configured: boolean;
  provider: string;
  baseUrl: string;
  apiPrefix: string;
  sdkAvailable: boolean;
  readOnly: boolean;
  timeoutSeconds: number;
  cacheTtlSeconds: number;
  dashboardUrl: string;
  message: string;
  oauthConnectEndpoint?: string;
  supportedCapabilities: string[];
}

export interface PostZenProfile {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string | null;
}

export interface PostZenProfilesResponse {
  configured: boolean;
  readOnly: boolean;
  profilesCount: number;
  profiles: PostZenProfile[];
  defaultProfileId: string | null;
  synchronizedAt: string;
  cached: boolean;
  dashboardUrl: string;
}

export interface PostZenConnectUrlResponse {
  configured: boolean;
  provider: string;
  platform: 'tiktok';
  authUrl: string;
  state: string;
  expiresInSeconds: number;
  profileId: string | null;
  accountId: string | null;
  redirectUrl: string | null;
  usage?: {
    accountsConnected?: number;
    accountsIncluded?: number;
    planId?: string;
    upgradeUrl?: string;
  } | null;
  synchronizedAt: string;
  dashboardUrl: string;
}

export interface PostZenOAuthCallbackBanner {
  status: 'success' | 'error';
  errorCode?: string;
  message?: string;
  username?: string;
  accountsCount?: number;
}

export interface PostZenAccountCapabilities {
  basicMetrics: boolean;
  businessMetrics: boolean;
  accountInsights: boolean;
  comments: boolean;
  followerStats: boolean;
  readOnly: boolean;
}

export interface PostZenAccount {
  id: string;
  platform: 'tiktok';
  username: string;
  displayName: string;
  profilePicture: string;
  connectionType: 'tiktok_business' | 'earlier_connection';
  connectionLabel: string;
  tokenStatus: 'active' | 'expired' | 'revoked';
  isActive: boolean;
  reconnectionRequired: boolean;
  capabilities: PostZenAccountCapabilities;
  availablePermissions: string[];
  guidance: string;
}

export interface PostZenAccountsResponse {
  configured: boolean;
  readOnly: boolean;
  platform: string;
  totalAccounts: number;
  tiktokAccountsCount: number;
  accounts: PostZenAccount[];
  hasConnectedTikTok: boolean;
  synchronizedAt: string;
  cached: boolean;
  dashboardUrl: string;
  guidance: string;
}

export interface PostZenPostMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagementRate: number | null;
  reach: number | null;
  saves: number | null;
  avgWatchTimeMs: number | null;
  totalWatchTimeMs: number | null;
  completionRate: number | null;
  newFollowers: number | null;
}

export interface PostZenPostAnalyticsItem {
  postId: string;
  accountId: string;
  platform: 'tiktok';
  title: string;
  publishedAt: string | null;
  permalink: string | null;
  metrics: PostZenPostMetrics;
  insights: Record<string, any> | null;
}

export interface PostZenAccountInsightsSummary {
  supported: boolean;
  reasonCode: string | null;
  message: string;
  availability: Record<string, any> | null;
  followerThresholdNotice?: string | null;
  insights: Record<string, any> | null;
  synchronizedAt?: string;
  cached?: boolean;
}

export interface PostZenAnalyticsResponse {
  configured: boolean;
  readOnly: boolean;
  hasConnectedAccount: boolean;
  account: PostZenAccount | null;
  overview: Record<string, any> | null;
  posts: PostZenPostAnalyticsItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  accountInsights: PostZenAccountInsightsSummary | null;
  synchronizedAt: string;
  cached: boolean;
  dashboardUrl: string;
  message: string;
  platformNotes: string[];
}

export interface PostZenFollowerPoint {
  date: string | null;
  followersCount: number | null;
  netChange: number | null;
}

export interface PostZenFollowerStatsResponse {
  configured: boolean;
  readOnly: boolean;
  hasConnectedAccount: boolean;
  account: PostZenAccount | null;
  supported: boolean;
  reasonCode?: string;
  stats: PostZenFollowerPoint[];
  summary: {
    currentFollowers: number | null;
    netChange: number | null;
    growthRate: number | null;
  } | null;
  synchronizedAt: string;
  cached: boolean;
  dashboardUrl: string;
  message: string;
  platformNotes: string[];
}

export interface PostZenCommentItem {
  id: string;
  postId: string;
  authorName: string;
  authorHandle: string;
  text: string;
  createdAt: string | null;
  likesCount: number | null;
  repliesCount: number | null;
}

export interface PostZenCommentsResponse {
  configured: boolean;
  readOnly: boolean;
  hasConnectedAccount: boolean;
  supported: boolean;
  account: PostZenAccount | null;
  comments: PostZenCommentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  synchronizedAt: string;
  cached: boolean;
  dashboardUrl: string;
  message: string;
}

export interface SystemStatus {
  system: string;
  version: string;
  platform: 'TikTok';
  environment: string;
  gemini: {
    configured: boolean;
    model: string;
    searchGroundingSupported: boolean;
    mode: 'active' | 'deterministic_fallback';
  };
  tiktok: {
    configured: boolean;
    provider: string;
    exclusiveProvider: boolean;
    mode: 'postzen_api' | 'sandbox_curated';
    apiVersion: string;
    oauthConnectEndpoint?: string;
  };
  factCheckEngine: {
    status: string;
    sourcesCount: number;
    regulatoryAgencies: string[];
    factCheckingPartners: string[];
  };
  postzen?: PostZenStatus;
}
