/** Status de intervalo / fim do 1º tempo — NÃO é fim de jogo. */
export function isHalfTimeStatus(status?: string | null) {
  if (!status) return false;
  const s = status.trim();
  if (!s) return false;
  if (/^(ht|int|intervalo|half[\s-]?time)$/i.test(s)) return true;
  if (/\b(ht|intervalo|half[\s-]?time)\b/i.test(s)) return true;
  // "Final/Fim do 1º tempo" NÃO pode casar com isFinishedStatus(/final/)
  if (/fim\s+do\s+1[ºo°]?\s*tempo/i.test(s)) return true;
  if (/final\s+do\s+1[ºo°]?\s*tempo/i.test(s)) return true;
  if (/1[ºo°]?\s*tempo\s*(encerrado|finalizado)/i.test(s)) return true;
  return false;
}

/** Status de fim de jogo (FT / encerrado). */
export function isFinishedStatus(status?: string | null) {
  if (!status) return false;
  if (isHalfTimeStatus(status)) return false;
  return (
    /^(FT|FINISHED|ENDED|COMPLETE|FullTime|FINAL)/i.test(status.trim()) ||
    /final|encerrado|ended|finished|full.?time/i.test(status)
  );
}
