/** Sons curtos via Web Audio (sem arquivo externo). */

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

/** Chamar em gesto do usuário (tap) para liberar áudio no mobile. */
export async function unlockAlertAudio() {
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    unlocked = ctx.state === "running";
    return unlocked;
  } catch {
    return false;
  }
}

export function isAlertAudioUnlocked() {
  return unlocked;
}

function beep(
  ctx: AudioContext,
  opts: { freq: number; start: number; dur: number; gain?: number; type?: OscillatorType },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.freq;
  const g = opts.gain ?? 0.12;
  const t0 = ctx.currentTime + opts.start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

export type AlertSoundKind = "goal" | "ft" | "enter";

export async function playAlertSound(kind: AlertSoundKind) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    unlocked = ctx.state === "running";
    if (!unlocked) return;

    if (kind === "goal") {
      beep(ctx, { freq: 880, start: 0, dur: 0.12, gain: 0.14 });
      beep(ctx, { freq: 1175, start: 0.12, dur: 0.16, gain: 0.14 });
    } else if (kind === "ft") {
      beep(ctx, { freq: 523, start: 0, dur: 0.18, gain: 0.12, type: "triangle" });
      beep(ctx, { freq: 392, start: 0.2, dur: 0.28, gain: 0.12, type: "triangle" });
    } else {
      // ENTRAR — sequência mais urgente
      beep(ctx, { freq: 740, start: 0, dur: 0.1, gain: 0.16 });
      beep(ctx, { freq: 740, start: 0.14, dur: 0.1, gain: 0.16 });
      beep(ctx, { freq: 988, start: 0.3, dur: 0.22, gain: 0.18 });
    }
  } catch {
    // ignore
  }
}
