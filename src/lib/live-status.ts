/** Status de fim de jogo (FT / encerrado). */
export function isFinishedStatus(status?: string | null) {
  if (!status) return false;
  return (
    /^(FT|FINISHED|ENDED|COMPLETE|FullTime|FINAL)/i.test(status.trim()) ||
    /final|encerrado|ended|finished|full.?time/i.test(status)
  );
}
