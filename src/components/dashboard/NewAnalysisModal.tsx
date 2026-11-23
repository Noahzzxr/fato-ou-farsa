// Modal para iniciar uma análise: link do vídeo/perfil, @usuário ou texto colado.

import React, { useState } from 'react';
import { X, Search, Video, AlertCircle, ArrowRight, PlayCircle } from 'lucide-react';

interface NewAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitAnalysis: (usernameOrUrl: string, manualTranscript?: string) => void;
  onSelectDemoScenario: (demoId: string) => void;
}

export const NewAnalysisModal: React.FC<NewAnalysisModalProps> = ({
  isOpen,
  onClose,
  onSubmitAnalysis,
  onSelectDemoScenario,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [manualTranscript, setManualTranscript] = useState('');
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = inputValue.trim();
    if (!trimmed && !manualTranscript.trim()) {
      setErrorMessage('Por favor, informe um link de vídeo do TikTok, @usuário ou insira uma transcrição.');
      return;
    }

    onSubmitAnalysis(trimmed || '@video_tiktok', manualTranscript.trim() || undefined);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg flex flex-col rounded-lg border border-blue-800/40 bg-slate-900 shadow-md overflow-hidden text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-950/50 text-blue-400">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-sans">
                Analisar um vídeo do TikTok
              </h2>
              <p className="text-xs text-slate-400">
                Cole o link do vídeo ou o @ do perfil. A gente confere o que é dito e os números.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                Link do vídeo ou @ do perfil
              </label>
              <button
                type="button"
                onClick={() => setShowTranscriptInput(!showTranscriptInput)}
                className="text-[11px] font-medium text-blue-400 hover:underline cursor-pointer"
              >
                {showTranscriptInput ? 'Esconder campo de texto' : '+ Colar o texto do vídeo'}
              </button>
            </div>

            <div className="relative">
              <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Ex: tiktok.com/@usuario/video/... ou @usuario"
                className="w-full rounded-md border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {showTranscriptInput && (
            <div className="p-3 rounded-md bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="text-[11px] font-medium text-slate-300 block">
                O que é falado ou escrito no vídeo:
              </span>
              <textarea
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder="Cole aqui a legenda ou o que a pessoa fala no vídeo..."
                rows={3}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-[11px] text-slate-400 leading-relaxed">
            <strong>Dica:</strong> o TikTok não libera todos os dados de qualquer vídeo. Se o link sozinho
            não trouxer o conteúdo, cole também o texto do vídeo para uma checagem mais precisa.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-semibold text-white shadow-md transition-colors"
            >
              <span>Analisar</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        <div className="border-t border-slate-800 bg-slate-950/60 p-5 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <PlayCircle className="h-3.5 w-3.5 text-amber-400" />
            <span>Ou abra um exemplo pronto (perfis fictícios):</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                onSelectDemoScenario('saude_vital');
                onClose();
              }}
              className="p-2.5 text-left rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 transition-colors"
            >
              <span className="font-semibold text-slate-200 block truncate">Saúde Vital</span>
              <span className="text-[10px] text-slate-400 block truncate">Cura em 48h sem remédios</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectDemoScenario('tech_investimentos');
                onClose();
              }}
              className="p-2.5 text-left rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 transition-colors"
            >
              <span className="font-semibold text-slate-200 block truncate">Tech Investimentos</span>
              <span className="text-[10px] text-slate-400 block truncate">Robô de Pix diário</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectDemoScenario('dra_mariana');
                onClose();
              }}
              className="p-2.5 text-left rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 transition-colors"
            >
              <span className="font-semibold text-slate-200 block truncate">Dra. Mariana</span>
              <span className="text-[10px] text-slate-400 block truncate">Nutrição científica / USP</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectDemoScenario('noticias_urgente');
                onClose();
              }}
              className="p-2.5 text-left rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 transition-colors"
            >
              <span className="font-semibold text-slate-200 block truncate">Plantão Brasil</span>
              <span className="text-[10px] text-slate-400 block truncate">Cortes sensacionalistas</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
