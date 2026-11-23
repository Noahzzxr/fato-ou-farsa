// Configurações: único lugar onde o tema (claro/escuro/sistema) pode ser trocado.

import React, { useEffect } from 'react';
import { X, Sun, Moon, Monitor, Trash2 } from 'lucide-react';
import { ThemeConfig } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeConfig: ThemeConfig;
  onThemeConfigChange: (config: ThemeConfig) => void;
  onClearHistory: () => void;
  historyCount: number;
}

const THEME_OPTIONS: { id: ThemeConfig['mode']; label: string; hint: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Claro', hint: 'Fundo branco', icon: Sun },
  { id: 'dark', label: 'Escuro', hint: 'Fundo escuro', icon: Moon },
  { id: 'auto', label: 'Sistema', hint: 'Igual ao aparelho', icon: Monitor },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  themeConfig,
  onThemeConfigChange,
  onClearHistory,
  historyCount,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-slate-950/60 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md max-h-[90vh] flex flex-col rounded-t-lg sm:rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden text-slate-900 dark:text-slate-100"
      >
        <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 px-4 sm:px-5 py-3 sm:py-4 shrink-0">
          <h3 id="settings-title" className="text-sm sm:text-base font-bold font-sans">
            Configurações
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar configurações"
            className="flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5 text-xs overflow-y-auto">
          <fieldset className="space-y-2">
            <legend className="font-semibold text-slate-700 dark:text-slate-300 mb-2 text-sm">
              Aparência
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((t) => {
                const Icon = t.icon;
                const isSelected = themeConfig.mode === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onThemeConfigChange({ ...themeConfig, mode: t.id })}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-3 min-h-[64px] font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#003876] dark:border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-[#003876] dark:text-blue-300 font-semibold'
                        : 'border-slate-250 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs">{t.label}</span>
                    <span className="text-[10px] font-normal opacity-75 leading-tight text-center">{t.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="flex items-center justify-between gap-3 p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 cursor-pointer">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Reduzir animações
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Para quem se incomoda com movimento na tela
              </span>
            </div>
            <input
              type="checkbox"
              checked={themeConfig.reducedMotion}
              onChange={(e) => onThemeConfigChange({ ...themeConfig, reducedMotion: e.target.checked })}
              className="h-5 w-5 sm:h-4 sm:w-4 shrink-0 accent-[#003876] dark:accent-blue-500 rounded cursor-pointer"
            />
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Histórico de análises
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {historyCount} análise{historyCount !== 1 ? 's' : ''} salva{historyCount !== 1 ? 's' : ''} neste navegador
              </span>
            </div>
            {historyCount > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 sm:py-1 min-h-[40px] sm:min-h-0 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Apagar histórico</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-150 dark:border-slate-800 pt-3">
            O <strong>Fato ou Farsa</strong> usa apenas dados públicos, conforme a LGPD. Nenhuma
            senha ou dado privado é coletado.
          </p>
        </div>

        <div className="border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 sm:px-5 py-3 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-lg bg-[#003876] dark:bg-blue-600 hover:bg-[#002D62] text-white px-4 py-2.5 sm:py-1.5 text-xs font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
