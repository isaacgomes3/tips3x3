import { useState } from 'react';
import { Send, Save, FileText, CheckCircle, AlertCircle, Loader2, Eye, EyeOff, Zap, Calendar, RefreshCw, MessageSquare, ChevronDown } from 'lucide-react';
import type { Entry } from '@/lib/central/types';

type DatePreset = 'today' | 'yesterday' | 'custom';

interface TelegramSettingsProps {
  botToken: string;
  chatId: string;
  entries: Entry[];
  onSave: (botToken: string, chatId: string) => Promise<void>;
  onTestConnection: () => Promise<void>;
  onSendReport: (reportDate: string) => Promise<void>;
  onResendEntry: (entry: Entry) => Promise<void>;
  onSendCustomMessage: (text: string) => Promise<void>;
}

export default function TelegramSettings({
  botToken,
  chatId,
  entries,
  onSave,
  onTestConnection,
  onSendReport,
  onResendEntry,
  onSendCustomMessage,
}: TelegramSettingsProps) {
  const [token, setToken] = useState(botToken);
  const [chat, setChat] = useState(chatId);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [resending, setResending] = useState(false);
  const [sendingCustom, setSendingCustom] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [reportDatePreset, setReportDatePreset] = useState<DatePreset>('today');
  const [reportCustomDate, setReportCustomDate] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [showEntrySelector, setShowEntrySelector] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  const isConfigured = botToken.length > 0 && chatId.length > 0;
  const hasChanges = token !== botToken || chat !== chatId;

  async function handleSave() {
    if (!token.trim() || !chat.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      await onSave(token.trim(), chat.trim());
      setFeedback({ type: 'success', message: 'Configuracoes salvas com sucesso' });
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao salvar configuracoes' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setFeedback(null);
    try {
      await onTestConnection();
      setFeedback({ type: 'success', message: 'Conexao testada com sucesso! Verifique o Telegram.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao testar conexao';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setTesting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  function getReportDateISO(): string {
    if (reportDatePreset === 'today') {
      return new Date().toISOString().slice(0, 10);
    }
    if (reportDatePreset === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    return reportCustomDate || new Date().toISOString().slice(0, 10);
  }

  function getReportDateLabel(): string {
    const iso = getReportDateISO();
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  async function handleSendReport() {
    setSendingReport(true);
    setFeedback(null);
    try {
      await onSendReport(getReportDateISO());
      setFeedback({ type: 'success', message: `Relatorio de ${getReportDateLabel()} enviado para o Telegram` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar relatorio';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setSendingReport(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  async function handleResendEntry() {
    const entry = entries.find((e) => e.id === selectedEntryId);
    if (!entry) return;
    setResending(true);
    setFeedback(null);
    try {
      await onResendEntry(entry);
      setFeedback({ type: 'success', message: 'Mensagem reenviada com sucesso' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao reenviar mensagem';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setResending(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  async function handleSendCustomMessage() {
    if (!customMessage.trim()) return;
    setSendingCustom(true);
    setFeedback(null);
    try {
      await onSendCustomMessage(customMessage.trim());
      setFeedback({ type: 'success', message: 'Mensagem personalizada enviada' });
      setCustomMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar mensagem';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setSendingCustom(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  const recentEntries = [...entries].reverse().slice(0, 30);
  const selectedEntry = entries.find((e) => e.id === selectedEntryId);

  return (
    <div className="space-y-6 fade-in">
      <div className="card-glow p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-sky-500/10 p-2 rounded-lg">
            <Send className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
              Integracao Telegram
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Receba notificacoes de entradas e relatorios diarios
            </p>
          </div>
          {isConfigured && (
            <div className="ml-auto flex items-center gap-1.5 bg-green-500/10 px-3 py-1 rounded-full">
              <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              <span className="text-xs text-accent-green font-medium">Ativo</span>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Bot Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="input-field w-full font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              Crie um bot com @BotFather no Telegram para obter o token
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Chat ID
            </label>
            <input
              type="text"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder="-1001234567890"
              className="input-field w-full font-mono"
            />
            <p className="text-xs text-gray-600 mt-1.5">
              ID do chat, grupo ou canal onde as mensagens serao enviadas
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving || !token.trim() || !chat.trim() || !hasChanges}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>

            {isConfigured && (
              <button
                onClick={handleTestConnection}
                disabled={testing || hasChanges}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                  bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Testar Conexao
              </button>
            )}
          </div>
        </div>
      </div>

      {isConfigured && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gold-500/10 p-2 rounded-lg">
              <FileText className="w-4 h-4 text-gold-400" />
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider block">
                Relatorio Manual
              </span>
              <p className="text-xs text-gray-600 mt-0.5">
                Envie o relatorio para o Telegram com a data desejada
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Data do Relatorio
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { key: 'today' as DatePreset, label: 'Hoje' },
                { key: 'yesterday' as DatePreset, label: 'Ontem' },
                { key: 'custom' as DatePreset, label: 'Customizado' },
              ]).map((opt) => {
                const isActive = reportDatePreset === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setReportDatePreset(opt.key)}
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

              {reportDatePreset === 'custom' && (
                <input
                  type="date"
                  value={reportCustomDate}
                  onChange={(e) => setReportCustomDate(e.target.value)}
                  className="input-field py-2 px-3 text-sm w-auto"
                />
              )}

              <span className="text-xs text-gray-600 ml-1">
                {getReportDateLabel()}
              </span>
            </div>
          </div>

          <button
            onClick={handleSendReport}
            disabled={sendingReport || (reportDatePreset === 'custom' && !reportCustomDate)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              bg-gold-500/20 text-gold-400 border border-gold-500/30 hover:bg-gold-500/30
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendingReport ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar Relatorio
          </button>
        </div>
      )}

      {isConfigured && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-sky-500/10 p-2 rounded-lg">
              <RefreshCw className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider block">
                Reenviar Notificacao
              </span>
              <p className="text-xs text-gray-600 mt-0.5">
                Reenvie a mensagem de uma entrada (nova entrada, green, red ou cashout)
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
              Selecione a Entrada
            </label>
            <div className="relative">
              <button
                onClick={() => setShowEntrySelector(!showEntrySelector)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className={selectedEntry ? 'text-gray-200' : 'text-gray-600'}>
                  {selectedEntry
                    ? `${selectedEntry.home_team} x ${selectedEntry.away_team} — ${selectedEntry.result === 'pending' ? 'Pendente' : selectedEntry.result === 'green' ? 'GREEN' : selectedEntry.result === 'red' ? 'RED' : 'Cancelada'}${selectedEntry.cashout_odd ? ' (Cashout)' : ''}`
                    : 'Escolha uma entrada...'}
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
                              ? entry.cashout_odd ? 'CASH' : 'GREEN'
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

          <button
            onClick={handleResendEntry}
            disabled={resending || !selectedEntryId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Reenviar Mensagem
          </button>
        </div>
      )}

      {isConfigured && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-500/10 p-2 rounded-lg">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider block">
                Mensagem Personalizada
              </span>
              <p className="text-xs text-gray-600 mt-0.5">
                Envie uma mensagem de texto livre para o Telegram
              </p>
            </div>
          </div>

          <div className="mb-4">
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Digite sua mensagem aqui..."
              rows={4}
              className="input-field w-full resize-none"
            />
            <p className="text-xs text-gray-600 mt-1.5">
              Suporta formatacao Markdown: *negrito*, _italico_, `codigo`
            </p>
          </div>

          <button
            onClick={handleSendCustomMessage}
            disabled={sendingCustom || !customMessage.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendingCustom ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar Mensagem
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
            feedback.type === 'success'
              ? 'bg-green-500/10 text-accent-green border border-green-500/20'
              : 'bg-red-500/10 text-accent-red border border-red-500/20'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {!isConfigured && (
        <div className="card p-5 border-dashed">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Como configurar</h4>
          <ol className="space-y-2 text-xs text-gray-500">
            <li className="flex gap-2">
              <span className="text-gold-400 font-bold shrink-0">1.</span>
              Abra o Telegram e procure por @BotFather
            </li>
            <li className="flex gap-2">
              <span className="text-gold-400 font-bold shrink-0">2.</span>
              Envie /newbot e siga as instrucoes para criar seu bot
            </li>
            <li className="flex gap-2">
              <span className="text-gold-400 font-bold shrink-0">3.</span>
              Copie o token fornecido e cole no campo acima
            </li>
            <li className="flex gap-2">
              <span className="text-gold-400 font-bold shrink-0">4.</span>
              Adicione o bot ao grupo/chat desejado
            </li>
            <li className="flex gap-2">
              <span className="text-gold-400 font-bold shrink-0">5.</span>
              Use @userinfobot ou a API do Telegram para descobrir o Chat ID
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
