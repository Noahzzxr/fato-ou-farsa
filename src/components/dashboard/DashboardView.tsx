// Tela de resultado de uma análise (perfil, números, resultado, vídeos e integrações).

import React, { useState } from 'react';
import {
  TikTokProfile,
  TikTokVideo,
  StatisticalSummary,
  AIAnalysisResult,
  InvestigationReport,
} from '../../types';
import { ProfileOverviewCard } from './ProfileOverviewCard';
import { KeyMetricsSection } from './KeyMetricsSection';
import { PublicationAnalysisSection } from './PublicationAnalysisSection';
import { AIAssessmentSection } from './AIAssessmentSection';
import { PostDetailModal } from './PostDetailModal';
import { ReportingGuidanceModal } from './ReportingGuidanceModal';
import { ReportExportModal } from './ReportExportModal';
import { HistoryDrawer } from './HistoryDrawer';
import { NewAnalysisModal } from './NewAnalysisModal';
import { FactCheckModal } from '../factcheck/FactCheckModal';
import { PostZenInsightsPanel } from '../integrations/PostZenInsightsPanel';

interface DashboardViewProps {
  report: InvestigationReport;
  onBackToHome: () => void;
  onSelectDemoScenario: (demoId: string) => void;
  onPerformNewAnalysis: (username: string, manualTranscript?: string) => void;
  onRefreshAi: () => void;
  isLoadingAi: boolean;
  historyReports: InvestigationReport[];
  onSelectHistoryReport: (report: InvestigationReport) => void;
  onClearHistory: () => void;
  selectedDemoId: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  report,
  onBackToHome,
  onSelectDemoScenario,
  onPerformNewAnalysis,
  onRefreshAi,
  isLoadingAi,
  historyReports,
  onSelectHistoryReport,
  onClearHistory,
  selectedDemoId,
}) => {
  const [selectedPost, setSelectedPost] = useState<TikTokVideo | null>(null);
  const [factCheckingPost, setFactCheckingPost] = useState<TikTokVideo | null>(null);
  const [isReportingOpen, setIsReportingOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isNewAnalysisOpen, setIsNewAnalysisOpen] = useState(false);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <ProfileOverviewCard
        profile={report.profile}
        totalPosts={report.posts.length}
        isDemo={report.isDemo}
        selectedDemoId={selectedDemoId}
        onSelectDemo={onSelectDemoScenario}
        onNewAnalysis={() => setIsNewAnalysisOpen(true)}
        onExport={() => setIsExportOpen(true)}
        onOpenReporting={() => setIsReportingOpen(true)}
        investigatedAt={report.aiAnalysis.investigatedAt || report.createdAt}
      />

      <KeyMetricsSection stats={report.statistics} />

      <AIAssessmentSection
        aiResult={report.aiAnalysis}
        isLoading={isLoadingAi}
        onRefreshAi={onRefreshAi}
        onOpenReporting={() => setIsReportingOpen(true)}
      />

      <PublicationAnalysisSection
        posts={report.posts}
        stats={report.statistics}
        onSelectPost={(post) => setSelectedPost(post)}
        onFactCheckPost={(post) => setFactCheckingPost(post)}
      />

      <PostZenInsightsPanel compact={true} defaultExpanded={false} />

      <PostDetailModal
        post={selectedPost}
        stats={report.statistics}
        onClose={() => setSelectedPost(null)}
        onFactCheck={(post) => {
          setSelectedPost(null);
          setFactCheckingPost(post);
        }}
      />

      <ReportingGuidanceModal
        isOpen={isReportingOpen}
        onClose={() => setIsReportingOpen(false)}
        username={report.profile.username}
      />

      <ReportExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        report={report}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        reports={historyReports}
        onSelectReport={onSelectHistoryReport}
        onClearHistory={onClearHistory}
      />

      <NewAnalysisModal
        isOpen={isNewAnalysisOpen}
        onClose={() => setIsNewAnalysisOpen(false)}
        onSubmitAnalysis={onPerformNewAnalysis}
        onSelectDemoScenario={onSelectDemoScenario}
      />

      {factCheckingPost && (
        <FactCheckModal
          isOpen={!!factCheckingPost}
          onClose={() => setFactCheckingPost(null)}
          postText={factCheckingPost.transcript || factCheckingPost.caption}
          postAuthor={report.profile.username}
          postUrl={factCheckingPost.url}
        />
      )}
    </div>
  );
};
