import { useState, useRef, useCallback } from 'react';
import {
  Image,
  Smartphone,
  Square,
  Film,
  Download,
  RefreshCw,
  ChevronDown,
  Eye,
  Calendar,
} from 'lucide-react';
import type { Entry, DayEvolution } from '@/lib/central/types';
import {
  renderStoryCreative,
  renderPostCreative,
  renderReelCreative,
  renderCalendarCreative,
  downloadCanvas,
} from '@/lib/central/creativeRenderer';

type CreativeType = 'story' | 'post' | 'reel' | 'calendar';
type DatePreset = 'today' | 'yesterday' | 'custom';

function getDateFromPreset(preset: DatePreset, customDate: string): Date {
  if (preset === 'today') return new Date();
  if (preset === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
  return customDate ? new Date(customDate + 'T12:00:00') : new Date();
}

function formatDateLabel(preset: DatePreset, customDate: string): string {
  const d = getDateFromPreset(preset, customDate);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface CreativesPanelProps {
  entries: Entry[];
  evolution: DayEvolution[];
  initialBankroll: number;
  currentBankroll: number;
}

const creativeTypes: { key: CreativeType; label: string; desc: string; size: string; icon: typeof Smartphone }[] = [
  {
    key: 'story',
    label: 'Story',
    desc: 'Evento individual com times, odd e stake',
    size: '1080 x 1920',
    icon: Smartphone,
  },
  {
    key: 'post',
    label: 'Post',
    desc: 'Relatorio do dia com entradas e evolucao',
    size: '1080 x 1080',
    icon: Square,
  },
  {
    key: 'reel',
    label: 'Reel',
    desc: 'Relatorio completo com grafico de evolucao',
    size: '1080 x 1920',
    icon: Film,
  },
  {
    key: 'calendar',
    label: 'Calendario',
    desc: 'Calendario mensal com bancas e crescimento',
    size: '1080 x 1920',
    icon: Calendar,
  },
];

export default function CreativesPanel({
  entries,
  evolution,
  initialBankroll,
  currentBankroll,
}: CreativesPanelProps) {
  const [selectedType, setSelectedType] = useState<CreativeType>('story');
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showEntrySelector, setShowEntrySelector] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customDate, setCustomDate] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedEntry = entries.find((e) => e.id === selectedEntryId);
  const needsEntry = selectedType === 'story';

  const generatePreview = useCallback(() => {
    let canvas: HTMLCanvasElement;
    const reportDate = getDateFromPreset(datePreset, customDate);

    if (selectedType === 'story') {
      if (!selectedEntry) return;
      canvas = renderStoryCreative(selectedEntry);
    } else if (selectedType === 'post') {
      canvas = renderPostCreative(entries, evolution, initialBankroll, currentBankroll, reportDate);
    } else if (selectedType === 'calendar') {
      canvas = renderCalendarCreative(entries, initialBankroll, currentBankroll, reportDate);
    } else {
      canvas = renderReelCreative(entries, evolution, initialBankroll, currentBankroll, reportDate);
    }

    setPreviewCanvas(canvas);
  }, [selectedType, selectedEntry, entries, evolution, initialBankroll, currentBankroll, datePreset, customDate]);

  function handleDownload() {
    if (!previewCanvas) return;
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `projeto3x3_${selectedType}_${timestamp}.png`;
    downloadCanvas(previewCanvas, filename);
  }

  const recentEntries = [...entries].reverse().slice(0, 20);

  return (
    <div className="space-y-6 fade-in">
      <div className="card-glow p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-sky-500/10 p-2 rounded-lg">
            <Image className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
              Criativos para Instagram
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Gere imagens profissionais para Stories, Posts e Reels
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {creativeTypes.map((ct) => {
            const isActive = selectedType === ct.key;
            return (
              <button
                key={ct.key}
                onClick={() => {
                  setSelectedType(ct.key);
                  setPreviewCanvas(null);
                }}
                className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-gold-400/50 bg-gold-400/5'
                    : 'border-dark-600 bg-dark-800 hover:border-dark-500'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <ct.icon
                    className={`w-5 h-5 ${isActive ? 'text-gold-400' : 'text-gray-500'}`}
                  />
                  <span
                    className={`text-sm font-semibold ${isActive ? 'text-gold-400' : 'text-gray-300'}`}
                  >
                    {ct.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{ct.desc}</p>
                <span
                  className={`inline-block mt-2 text-[10px] font-mono px-2 py-0.5 rounded ${
                    isActive
                      ? 'bg-gold-400/10 text-gold-400'
                      : 'bg-dark-700 text-gray-600'
                  }`}
                >
                  {ct.size}
                </span>
                {isActive && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gold-400" />
                )}
              </button>
            );
          })}
        </div>

        {needsEntry && (
          <div className="mb-6">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Selecione o Evento
            </label>
            <div className="relative">
              <button
                onClick={() => setShowEntrySelector(!showEntrySelector)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className={selectedEntry ? 'text-gray-200' : 'text-gray-600'}>
                  {selectedEntry
                    ? `${selectedEntry.home_team} x ${selectedEntry.away_team} — Odd ${selectedEntry.odd.toFixed(2)}`
                    : 'Escolha um evento...'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 transition-transform ${showEntrySelector ? 'rotate-180' : ''}`}
                />
              </button>

              {showEntrySelector && (
                <div className="absolute z-20 mt-1 w-full bg-dark-700 border border-dark-500 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                  {recentEntries.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">Nenhuma entrada encontrada</div>
                  ) : (
                    recentEntries.map((entry) => {
                      const isSelected = entry.id === selectedEntryId;
                      const resultColor =
                        entry.result === 'green'
                          ? 'text-accent-green'
                          : entry.result === 'red'
                          ? 'text-accent-red'
                          : 'text-gold-400';
                      return (
                        <button
                          key={entry.id}
                          onClick={() => {
                            setSelectedEntryId(entry.id);
                            setShowEntrySelector(false);
                            setPreviewCanvas(null);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-dark-600 transition-colors flex items-center justify-between gap-3 ${
                            isSelected ? 'bg-dark-600' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-gray-200 font-medium truncate">
                              {entry.home_team} x {entry.away_team}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Odd {entry.odd.toFixed(2)} — R$ {entry.stake.toFixed(2)} —{' '}
                              {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${resultColor}`}>
                            {entry.result === 'pending'
                              ? 'PEND'
                              : entry.result === 'green'
                              ? 'GREEN'
                              : entry.result === 'red'
                              ? 'RED'
                              : 'CANC'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!needsEntry && (
          <div className="mb-6">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Data do Relatorio
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { key: 'today' as DatePreset, label: 'Hoje' },
                { key: 'yesterday' as DatePreset, label: 'Ontem' },
                { key: 'custom' as DatePreset, label: 'Customizado' },
              ]).map((opt) => {
                const isActive = datePreset === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setDatePreset(opt.key);
                      setPreviewCanvas(null);
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                      isActive
                        ? 'border-gold-400/50 bg-gold-400/10 text-gold-400'
                        : 'border-dark-600 bg-dark-800 text-gray-500 hover:text-gray-300 hover:border-dark-500'
                    }`}
                  >
                    {opt.key === 'custom' && <Calendar className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                );
              })}

              {datePreset === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setPreviewCanvas(null);
                  }}
                  className="input-field py-2 px-3 text-sm w-auto"
                />
              )}

              <span className="text-xs text-gray-600 ml-1">
                {formatDateLabel(datePreset, customDate)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={generatePreview}
            disabled={needsEntry && !selectedEntry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              bg-gold-400/20 text-gold-400 border border-gold-400/30 hover:bg-gold-400/30
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="w-4 h-4" />
            Gerar Previa
          </button>

          {previewCanvas && (
            <>
              <button
                onClick={generatePreview}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                  bg-dark-700 text-gray-400 border border-dark-500 hover:text-gray-300 hover:bg-dark-600"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerar
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                  bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30"
              >
                <Download className="w-4 h-4" />
                Baixar PNG
              </button>
            </>
          )}
        </div>
      </div>

      {previewCanvas && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs text-gray-500 uppercase tracking-wider">Previa do Criativo</h4>
            <span className="text-[10px] font-mono text-gray-600 bg-dark-700 px-2 py-1 rounded">
              {previewCanvas.width} x {previewCanvas.height}px
            </span>
          </div>
          <div
            ref={previewRef}
            className="flex justify-center bg-dark-900/50 rounded-xl p-4 border border-dark-600"
          >
            <img
              src={previewCanvas.toDataURL('image/png')}
              alt="Previa do criativo"
              className="rounded-lg shadow-2xl"
              style={{
                maxHeight: selectedType === 'post' ? '500px' : '600px',
                width: 'auto',
              }}
            />
          </div>
        </div>
      )}

      {!previewCanvas && (
        <div className="card p-8 border-dashed text-center">
          <div className="bg-dark-700 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Image className="w-8 h-8 text-gray-600" />
          </div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Nenhuma previa gerada</h4>
          <p className="text-xs text-gray-600 max-w-sm mx-auto leading-relaxed">
            {needsEntry
              ? 'Selecione um evento e clique em "Gerar Previa" para criar o criativo do Story.'
              : 'Clique em "Gerar Previa" para criar o criativo com os dados atuais.'}
          </p>
        </div>
      )}
    </div>
  );
}
