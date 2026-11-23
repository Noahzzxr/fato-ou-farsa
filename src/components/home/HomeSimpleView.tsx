// Página inicial.

import React, { useState } from 'react';
import {
  Search,
  BarChart3,
  SearchCheck,
  FileText,
  AlertCircle,
  ArrowRight,
  FileCheck2,
  Video,
  Link2,
  ListChecks,
  ShieldCheck,
  HelpCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
} from 'lucide-react';
import { LogoIcon } from '../brand/Logo';

interface HomeSimpleViewProps {
  onStartAnalysis: (usernameOrUrl: string, manualTranscript?: string) => void;
  onSelectDemo: (demoId: string) => void;
  isLoading: boolean;
  onOpenDirectFactCheck?: () => void;
  onOpenApiModal?: () => void;
  isTikTokConnected?: boolean;
}

const TIKTOK_DEMO_PRESETS = [
  {
    id: 'saude_vital',
    handle: '@saude_vital_brasil',
    category: 'Saúde & Bem-estar',
    tag: 'Cura milagrosa em 48h',
    tagColor: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900',
  },
  {
    id: 'tech_investimentos',
    handle: '@tech_investimentos_oficial',
    category: 'Finanças & Cripto',
    tag: 'Robô do Pix / Lucro fixo',
    tagColor: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',
  },
  {
    id: 'dra_mariana',
    handle: '@dra_mariana_nutricao',
    category: 'Ciência & Nutrição',
    tag: 'Perfil confiável (USP/CRN)',
    tagColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900',
  },
  {
    id: 'noticias_urgente',
    handle: '@noticias_urgente_brasil',
    category: 'Mídia & Jornalismo',
    tag: 'Cortes sensacionalistas',
    tagColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
  },
];

const HOW_IT_WORKS = [
  {
    icon: Link2,
    color: 'text-[#003876] dark:text-blue-400',
    title: '1. Cole o link',
    text: 'Copie o link do vídeo no TikTok (botão "Compartilhar" → "Copiar link") ou digite o @ do perfil. Se preferir, cole só o texto que é dito no vídeo.',
  },
  {
    icon: ListChecks,
    color: 'text-[#F5B800] dark:text-amber-400',
    title: '2. A gente confere',
    text: 'Separamos as afirmações do vídeo e procuramos o que fontes confiáveis dizem sobre elas: órgãos como ANVISA, CVM e Banco Central, e agências de checagem.',
  },
  {
    icon: FileText,
    color: 'text-[#00A86B] dark:text-emerald-400',
    title: '3. Você recebe o resultado',
    text: 'Um resumo claro dizendo se há motivo para desconfiar, por quê, quais fontes foram usadas e, se for o caso, como denunciar o vídeo no TikTok.',
  },
];

const RESULT_LEVELS = [
  {
    icon: ShieldCheck,
    label: 'Sem indícios relevantes',
    text: 'Não encontramos nada que contradiga o que foi dito.',
    style: 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900',
  },
  {
    icon: HelpCircle,
    label: 'Merece atenção',
    text: 'Há pontos estranhos ou fora de contexto. Vale conferir antes de compartilhar.',
    style: 'text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
  },
  {
    icon: AlertTriangle,
    label: 'Possivelmente enganoso',
    text: 'Promessas exageradas ou informações que não batem com as fontes.',
    style: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',
  },
  {
    icon: AlertOctagon,
    label: 'Falso ou manipulado',
    text: 'O conteúdo contraria diretamente fontes oficiais ou dados confiáveis.',
    style: 'text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900',
  },
  {
    icon: Info,
    label: 'Dados insuficientes',
    text: 'Não há informação suficiente para afirmar nada com segurança.',
    style: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  },
];

const FAQ = [
  {
    q: 'Preciso criar conta ou pagar?',
    a: 'Não. É só colar o link ou o texto e clicar em "Analisar conteúdo".',
  },
  {
    q: 'O resultado é uma verdade absoluta?',
    a: 'Não. É um apoio para você tomar sua própria decisão. Sempre abra as fontes indicadas no resultado e confira por conta própria.',
  },
  {
    q: 'Por que às vezes preciso colar o texto do vídeo?',
    a: 'O TikTok só libera os dados completos de contas que autorizaram o acesso. Para os demais vídeos, colar a legenda ou o que é falado garante uma checagem mais precisa.',
  },
  {
    q: 'O que acontece com o que eu envio?',
    a: 'O texto é usado apenas para gerar a checagem. O histórico das suas análises fica salvo só no seu navegador. Detalhes na Política de Privacidade.',
  },
];

export const HomeSimpleView: React.FC<HomeSimpleViewProps> = ({
  onStartAnalysis,
  onSelectDemo,
  isLoading,
  onOpenDirectFactCheck,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showManualTranscript, setShowManualTranscript] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = inputValue.trim();
    if (!trimmed && !manualTranscript.trim()) {
      setErrorMsg('Cole o link do vídeo, digite o @ do perfil ou escreva o que é dito no vídeo.');
      return;
    }

    onStartAnalysis(trimmed || '@conteudo_tiktok', manualTranscript.trim() || undefined);
  };

  return (
    <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12 max-w-3xl mx-auto w-full">
      <div className="text-center space-y-4 mb-8 sm:mb-10 w-full flex flex-col items-center">
        <div className="relative inline-flex items-center justify-center p-2 rounded-lg">
          <LogoIcon
            size={124}
            className="h-28 sm:h-36 md:h-40 w-auto"
            altText="Fato ou Farsa"
          />
        </div>

        <div className="inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 text-[11px] sm:text-xs font-semibold shadow-xs max-w-full text-center">
          <span className="text-[#003876] dark:text-[#38bdf8] font-bold">Fato</span>
          <span className="text-[#F5B800] font-bold">ou</span>
          <span className="text-[#00A86B] dark:text-[#34d399] font-bold">Farsa</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">Checagem de vídeos do TikTok</span>
        </div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          Viu algo no TikTok e ficou na dúvida?
        </h1>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
          Cole o link do vídeo e descubra se o que está sendo dito tem base em fontes confiáveis.
          Mostramos o que foi conferido, onde e o que você pode fazer a seguir.
        </p>
      </div>

      <div className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg p-4 sm:p-7 shadow-sm transition-colors">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <label htmlFor="home-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Video className="h-4 w-4 text-[#003876] dark:text-blue-400" />
              <span>Link do vídeo ou @ do perfil</span>
            </label>
            <button
              type="button"
              onClick={() => setShowManualTranscript(!showManualTranscript)}
              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {showManualTranscript ? 'Esconder campo de texto' : '+ Colar o texto do vídeo'}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="home-input"
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Ex.: https://www.tiktok.com/@perfil/video/123..."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#003876] dark:focus:ring-blue-500 focus:border-transparent transition-all"
                autoFocus
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center gap-2 rounded-md bg-[#003876] hover:bg-[#002D62] dark:bg-blue-600 dark:hover:bg-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <span>{isLoading ? 'Analisando...' : 'Analisar conteúdo'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {showManualTranscript && (
            <div className="mt-3 p-3.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>Legenda, fala do vídeo ou a frase que você quer conferir:</span>
                <span className="text-[10px] text-slate-400">Útil quando o link não traz o texto</span>
              </div>
              <textarea
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder='Ex.: "Esse chá cura diabetes em 48 horas, os médicos não querem que você saiba..."'
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#003876]"
              />
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 pt-1">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 pt-1 leading-relaxed">
            <strong>Importante:</strong> o resultado depende das informações disponíveis. Não encontrar
            provas contra uma afirmação não quer dizer que ela seja verdadeira — nem falsa.
          </p>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-150 dark:border-slate-800/80">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Quer ver como funciona antes? Abra um exemplo:
            </span>
            <span className="text-[10px] text-slate-400">Perfis fictícios</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TIKTOK_DEMO_PRESETS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                onClick={() => onSelectDemo(demo.id)}
                className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-left transition-colors group cursor-pointer"
              >
                <div className="truncate mr-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate group-hover:text-[#003876] dark:group-hover:text-blue-400">
                    {demo.handle}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                    {demo.category}
                  </span>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${demo.tagColor}`}>
                  {demo.tag}
                </span>
              </button>
            ))}
          </div>

          {onOpenDirectFactCheck && (
            <div className="mt-3 pt-3 border-t border-slate-150 dark:border-slate-800 flex justify-center">
              <button
                type="button"
                onClick={onOpenDirectFactCheck}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex flex-wrap items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Quer conferir só uma frase, sem link?</span>
                <span className="underline">Checar uma afirmação &rarr;</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="w-full mt-12" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          Como funciona
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4">
          Em menos de um minuto, sem cadastro.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {HOW_IT_WORKS.map((step) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.title}
                className="rounded-md border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 p-4 text-left"
              >
                <div className={`flex items-center gap-2 mb-1.5 ${step.color}`}>
                  <StepIcon className="h-4 w-4" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{step.title}</h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{step.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="w-full mt-10" aria-labelledby="o-que-analisamos">
        <h2 id="o-que-analisamos" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          O que é analisado
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="rounded-md border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 p-4 text-left">
            <div className="flex items-center gap-2 mb-1.5 text-[#003876] dark:text-blue-400">
              <SearchCheck className="h-4 w-4" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">O que é dito</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Cada afirmação do vídeo (por exemplo, "cura em 48h" ou "lucro garantido") é comparada
              com o que dizem órgãos oficiais e agências de checagem. Os links das fontes ficam visíveis.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 p-4 text-left">
            <div className="flex items-center gap-2 mb-1.5 text-[#F5B800] dark:text-amber-400">
              <BarChart3 className="h-4 w-4" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Os números do perfil</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Visualizações, curtidas, comentários e compartilhamentos. Vídeos com números muito fora do
              padrão do próprio perfil são destacados, pois podem indicar engajamento comprado.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 p-4 text-left">
            <div className="flex items-center gap-2 mb-1.5 text-[#00A86B] dark:text-emerald-400">
              <FileText className="h-4 w-4" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">O que fazer depois</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Você pode baixar um relatório em PDF, guardar no histórico e ver o passo a passo para
              denunciar o vídeo no próprio TikTok, caso seja necessário.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full mt-10" aria-labelledby="como-ler">
        <h2 id="como-ler" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          Como entender o resultado
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4">
          Todo conteúdo analisado recebe uma destas cinco classificações:
        </p>
        <div className="space-y-2">
          {RESULT_LEVELS.map((level) => {
            const LevelIcon = level.icon;
            return (
              <div
                key={level.label}
                className={`flex items-start gap-3 rounded-md border p-3 ${level.style}`}
              >
                <LevelIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <span className="font-bold">{level.label}:</span>{' '}
                  <span className="opacity-90">{level.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="w-full mt-10" aria-labelledby="duvidas">
        <h2 id="duvidas" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          Dúvidas comuns
        </h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-md border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 p-4"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-slate-100">
                <span>{item.q}</span>
                <span className="text-slate-400 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
              </summary>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
};
