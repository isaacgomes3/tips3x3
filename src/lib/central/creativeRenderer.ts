import type { Entry, DayEvolution } from '@/lib/central/types';

/* ---------- palette matching the reference image ---------- */
const C = {
  bgDark: '#080e1a',
  bgMid: '#0c1628',
  bgCard: '#0d1a30',
  borderCyan: '#1a6b7a',
  borderCyanBright: '#28d4d4',
  glowCyan: 'rgba(40, 212, 212, 0.25)',
  green: '#2dd4a8',
  greenDim: 'rgba(45, 212, 168, 0.15)',
  greenBorder: 'rgba(45, 212, 168, 0.4)',
  red: '#ef4444',
  gold: '#facc15',
  goldDark: '#eab308',
  goldDim: 'rgba(250, 204, 21, 0.12)',
  textWhite: '#f0f4f8',
  textLight: '#c9d1d9',
  textMuted: '#6b7f99',
  rowEven: 'rgba(13, 30, 55, 0.7)',
  rowOdd: 'rgba(10, 22, 42, 0.5)',
};

/* ---------- primitives ---------- */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawFinancialBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.5, w * 0.8);
  grad.addColorStop(0, '#0f2340');
  grad.addColorStop(0.5, '#0a1628');
  grad.addColorStop(1, '#060d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // subtle radial glow top-center
  const glow = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.6);
  glow.addColorStop(0, 'rgba(20, 80, 120, 0.25)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h * 0.5);

  // corner glow bottom-right
  const glow2 = ctx.createRadialGradient(w * 0.85, h * 0.9, 0, w * 0.85, h * 0.9, w * 0.3);
  glow2.addColorStop(0, 'rgba(250, 204, 21, 0.06)');
  glow2.addColorStop(1, 'transparent');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  drawGridOverlay(ctx, w, h);
}

function drawGridOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(30, 70, 110, 0.12)';
  ctx.lineWidth = 0.5;
  const step = 60;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawGlowCard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  borderColor: string = C.borderCyan,
  glowColor: string = C.glowCyan
) {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = C.bgCard;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawBrandHeader(ctx: CanvasRenderingContext2D, cx: number, y: number, scale: number = 1) {
  // Gold badge
  const s = 40 * scale;
  const grad = ctx.createLinearGradient(cx - s / 2, y, cx + s / 2, y + s);
  grad.addColorStop(0, '#fde68a');
  grad.addColorStop(0.5, C.gold);
  grad.addColorStop(1, C.goldDark);

  ctx.save();
  ctx.shadowColor = 'rgba(250, 204, 21, 0.4)';
  ctx.shadowBlur = 16;
  roundRect(ctx, cx - s / 2, y, s, s, 10 * scale);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#1a1a2e';
  ctx.font = `bold ${18 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('3x3', cx, y + s * 0.68);

  ctx.fillStyle = C.textWhite;
  ctx.font = `bold ${22 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText('CASH 3x3', cx, y + s + 28 * scale);

  ctx.fillStyle = C.textMuted;
  ctx.font = `${13 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText('Gestao de Banca - Lay Trading', cx, y + s + 50 * scale);
}

function drawDateBadge(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string, scale: number = 1) {
  const metrics = ctx.measureText(text);
  const tw = metrics.width + 48 * scale;
  const th = 36 * scale;

  roundRect(ctx, cx - tw / 2, y, tw, th, th / 2);
  ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = C.gold;
  ctx.font = `bold ${14 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + th * 0.62);
}

/* ---------- KPI icon drawings ---------- */

function drawCoinIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  // stack of coins
  for (let i = 2; i >= 0; i--) {
    const oy = -i * s * 0.18;
    ctx.beginPath();
    ctx.ellipse(cx, cy + oy, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? C.gold : C.goldDark;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawChartIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  const barW = s * 0.2;
  const heights = [0.4, 0.65, 0.55, 0.9];
  heights.forEach((h, i) => {
    const bx = cx - s * 0.45 + i * (barW + s * 0.08);
    const by = cy + s * 0.4 - h * s * 0.8;
    const bh = h * s * 0.8;
    roundRect(ctx, bx, by, barW, bh, 2);
    ctx.fillStyle = i === 3 ? C.green : 'rgba(34, 197, 94, 0.5)';
    ctx.fill();
  });
  // arrow up
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.15, cy - s * 0.1);
  ctx.lineTo(cx + s * 0.4, cy - s * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.25, cy - s * 0.35);
  ctx.lineTo(cx + s * 0.4, cy - s * 0.35);
  ctx.lineTo(cx + s * 0.4, cy - s * 0.2);
  ctx.stroke();
  ctx.restore();
}

function drawTrophyIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  // cup body
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, cy - s * 0.35);
  ctx.lineTo(cx - s * 0.22, cy + s * 0.1);
  ctx.quadraticCurveTo(cx, cy + s * 0.25, cx + s * 0.22, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.3, cy - s * 0.35);
  ctx.closePath();
  ctx.fillStyle = C.gold;
  ctx.fill();
  // base
  roundRect(ctx, cx - s * 0.18, cy + s * 0.2, s * 0.36, s * 0.06, 2);
  ctx.fillStyle = C.goldDark;
  ctx.fill();
  roundRect(ctx, cx - s * 0.25, cy + s * 0.28, s * 0.5, s * 0.07, 3);
  ctx.fillStyle = C.goldDark;
  ctx.fill();
  // handles
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx - s * 0.38, cy - s * 0.15, s * 0.12, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + s * 0.38, cy - s * 0.15, s * 0.12, Math.PI * 0.5, -Math.PI * 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawTargetIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  [0.45, 0.3, 0.15].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, s * r, 0, Math.PI * 2);
    ctx.fillStyle = i === 2 ? C.green : i === 1 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  // check mark
  ctx.strokeStyle = C.textWhite;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.08, cy);
  ctx.lineTo(cx - s * 0.02, cy + s * 0.08);
  ctx.lineTo(cx + s * 0.1, cy - s * 0.06);
  ctx.stroke();
  ctx.restore();
}

/* ---------- shared report renderer core ---------- */

interface ReportData {
  displayEntries: Entry[];
  greens: number;
  reds: number;
  totalProfit: number;
  hitRate: number;
  currentBankroll: number;
  dateLabel: string;
}

function prepareReportData(
  entries: Entry[],
  currentBankroll: number,
  reportDate?: Date
): ReportData {
  const targetDate = reportDate || new Date();
  const targetDateStr = targetDate.toLocaleDateString('pt-BR');

  const dateEntries = entries.filter(
    (e) => new Date(e.created_at).toLocaleDateString('pt-BR') === targetDateStr
  );

  const displayEntries = dateEntries.length > 0 ? dateEntries : entries.slice(-8);
  const resolved = displayEntries.filter((e) => e.result === 'green' || e.result === 'red');
  const greens = resolved.filter((e) => e.result === 'green').length;
  const reds = resolved.filter((e) => e.result === 'red').length;
  const totalProfit = resolved.reduce((sum, e) => sum + e.profit, 0);
  const hitRate = resolved.length > 0 ? (greens / resolved.length) * 100 : 0;

  const dateLabel = targetDate
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    .toUpperCase();

  return { displayEntries, greens, reds, totalProfit, hitRate, currentBankroll, dateLabel };
}

function drawKpiCards(
  ctx: CanvasRenderingContext2D,
  y: number,
  padX: number,
  totalW: number,
  data: ReportData,
  scale: number = 1
) {
  const gap = 14 * scale;
  const kpiW = (totalW - gap * 3) / 4;
  const kpiH = 72 * scale;
  const iconSize = 28 * scale;

  const kpis = [
    {
      label: 'BANCA',
      value: `R$ ${data.currentBankroll.toFixed(0)}`,
      color: C.textWhite,
      border: C.borderCyan,
      glow: C.glowCyan,
      drawIcon: drawCoinIcon,
    },
    {
      label: 'LUCRO',
      value: `${data.totalProfit >= 0 ? '+' : ''}R$ ${data.totalProfit.toFixed(2)}`,
      color: data.totalProfit >= 0 ? C.green : C.red,
      border: C.greenBorder,
      glow: 'rgba(34, 197, 94, 0.2)',
      drawIcon: drawChartIcon,
    },
    {
      label: 'ACERTOS',
      value: `${data.greens}G / ${data.reds}R`,
      color: C.gold,
      border: C.greenBorder,
      glow: 'rgba(34, 197, 94, 0.2)',
      drawIcon: drawTrophyIcon,
    },
    {
      label: 'HIT RATE',
      value: `${data.hitRate.toFixed(0)}%`,
      color: data.hitRate >= 50 ? C.green : C.red,
      border: C.greenBorder,
      glow: 'rgba(34, 197, 94, 0.2)',
      drawIcon: drawTargetIcon,
    },
  ];

  kpis.forEach((kpi, i) => {
    const kx = padX + i * (kpiW + gap);
    drawGlowCard(ctx, kx, y, kpiW, kpiH, kpi.border, kpi.glow);

    kpi.drawIcon(ctx, kx + 30 * scale, y + kpiH / 2, iconSize);

    ctx.fillStyle = C.textMuted;
    ctx.font = `600 ${10 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(kpi.label, kx + 52 * scale, y + 28 * scale);

    ctx.fillStyle = kpi.color;
    ctx.font = `bold ${18 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(kpi.value, kx + 52 * scale, y + 52 * scale);
  });

  return kpiH;
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  y: number,
  padX: number,
  totalW: number,
  entries: Entry[],
  maxRows: number,
  scale: number = 1
) {
  const rowH = 48 * scale;
  const headerH = 40 * scale;
  const displayRows = Math.min(entries.length, maxRows);
  const tableH = headerH + displayRows * rowH + 12 * scale;

  drawGlowCard(ctx, padX, y, totalW, tableH, C.borderCyan, C.glowCyan);

  // column positions
  const c0 = padX + 20 * scale;
  const c1 = padX + totalW * 0.33;
  const c2 = padX + totalW * 0.50;
  const c3 = padX + totalW * 0.67;
  const c4 = padX + totalW * 0.86;

  // header row
  ctx.fillStyle = C.textMuted;
  ctx.font = `600 ${11 * scale}px system-ui, -apple-system, sans-serif`;

  ctx.textAlign = 'left';
  ctx.fillText('EVENTO', c0, y + headerH * 0.65);
  ctx.textAlign = 'center';
  ctx.fillText('ODD', c1, y + headerH * 0.65);
  ctx.fillText('STAKE', c2, y + headerH * 0.65);
  ctx.fillText('RESULTADO', c3, y + headerH * 0.65);
  ctx.fillText('LUCRO', c4, y + headerH * 0.65);

  // sort arrows (decorative)
  const arrowFont = `${9 * scale}px system-ui`;
  ctx.font = arrowFont;
  ctx.fillStyle = C.textMuted;

  // header divider
  ctx.strokeStyle = 'rgba(26, 107, 122, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX + 12 * scale, y + headerH);
  ctx.lineTo(padX + totalW - 12 * scale, y + headerH);
  ctx.stroke();

  entries.slice(0, displayRows).forEach((entry, i) => {
    const ry = y + headerH + i * rowH;
    const textY = ry + rowH * 0.6;

    // row background with green-tinted left border for green results
    roundRect(ctx, padX + 8 * scale, ry + 2, totalW - 16 * scale, rowH - 4, 8 * scale);
    ctx.fillStyle = i % 2 === 0 ? C.rowEven : C.rowOdd;
    ctx.fill();

    if (entry.result === 'green') {
      ctx.strokeStyle = C.greenBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // green left accent bar for green entries
    if (entry.result === 'green') {
      roundRect(ctx, padX + 8 * scale, ry + 2, 3 * scale, rowH - 4, 2);
      ctx.fillStyle = C.green;
      ctx.fill();
    } else if (entry.result === 'red') {
      roundRect(ctx, padX + 8 * scale, ry + 2, 3 * scale, rowH - 4, 2);
      ctx.fillStyle = C.red;
      ctx.fill();
    }

    // event name
    ctx.fillStyle = C.textLight;
    ctx.font = `600 ${13 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    const matchName = `${entry.home_team} x ${entry.away_team}`;
    const maxChars = Math.floor(26 * scale);
    const truncated = matchName.length > maxChars ? matchName.substring(0, maxChars - 2) + ' ...' : matchName;
    ctx.fillText(truncated, c0 + 6 * scale, textY);

    // odd
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold;
    ctx.font = `bold ${14 * scale}px monospace`;
    ctx.fillText(entry.odd.toFixed(2), c1, textY);

    // stake with money icon
    ctx.fillStyle = C.textLight;
    ctx.font = `${13 * scale}px monospace`;
    ctx.fillText(`${entry.stake.toFixed(0)}`, c2, textY);

    // result badge
    const resultColor = entry.result === 'green' ? C.green : entry.result === 'red' ? C.red : C.gold;
    const resultLabel = entry.result === 'green' ? 'GREEN' : entry.result === 'red' ? 'RED' : entry.result === 'cancelled' ? 'CANC' : 'PEND';

    const badgeW = 62 * scale;
    const badgeH = 22 * scale;
    roundRect(ctx, c3 - badgeW / 2, textY - badgeH * 0.7, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = resultColor === C.green ? C.greenDim : resultColor === C.red ? 'rgba(239, 68, 68, 0.15)' : C.goldDim;
    ctx.fill();
    ctx.strokeStyle = resultColor + '50';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = resultColor;
    ctx.font = `bold ${10 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(resultLabel, c3, textY - badgeH * 0.7 + badgeH * 0.68);

    // profit
    if (entry.result === 'green' || entry.result === 'red') {
      ctx.fillStyle = entry.profit >= 0 ? C.green : C.red;
      ctx.font = `bold ${13 * scale}px monospace`;
      ctx.fillText(`${entry.profit >= 0 ? '+' : ''}R$ ${entry.profit.toFixed(2)}`, c4, textY);
    } else {
      ctx.fillStyle = C.textMuted;
      ctx.font = `${13 * scale}px monospace`;
      ctx.fillText('--', c4, textY);
    }

    // checkmark circle for resolved
    if (entry.result === 'green' || entry.result === 'red') {
      const checkX = padX + totalW - 24 * scale;
      const checkY = textY - 4 * scale;
      ctx.beginPath();
      ctx.arc(checkX, checkY, 8 * scale, 0, Math.PI * 2);
      ctx.fillStyle = entry.result === 'green' ? C.greenDim : 'rgba(239, 68, 68, 0.15)';
      ctx.fill();
      ctx.strokeStyle = entry.result === 'green' ? C.greenBorder : 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.strokeStyle = entry.result === 'green' ? C.green : C.red;
      ctx.lineWidth = 1.5 * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(checkX - 3 * scale, checkY);
      ctx.lineTo(checkX - 0.5 * scale, checkY + 3 * scale);
      ctx.lineTo(checkX + 4 * scale, checkY - 2 * scale);
      ctx.stroke();
    }
  });

  return tableH;
}

function drawFooter(ctx: CanvasRenderingContext2D, W: number, H: number, scale: number = 1) {
  // star accent bottom-right
  const starX = W - 60 * scale;
  const starY = H - 50 * scale;
  const points = 4;
  const outerR = 14 * scale;
  const innerR = 6 * scale;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const px = starX + Math.cos(angle) * r;
    const py = starY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const starGrad = ctx.createRadialGradient(starX, starY, 0, starX, starY, outerR);
  starGrad.addColorStop(0, '#fef3c7');
  starGrad.addColorStop(1, C.gold);
  ctx.fillStyle = starGrad;
  ctx.fill();

  ctx.fillStyle = C.textMuted;
  ctx.font = `${13 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('@projeto3x3', W / 2, H - 25 * scale);
}

/* ---------- STORY creative (single entry) ---------- */

function drawVsSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number = 1) {
  const r = 20 * scale;
  roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r);
  ctx.fillStyle = 'rgba(250, 204, 21, 0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = C.gold;
  ctx.font = `bold ${16 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', cx, cy);
  ctx.textBaseline = 'alphabetic';
}

function getTeamInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words.map((w) => w[0]).join('').substring(0, 3).toUpperCase();
}

function drawTeamBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, name: string, color: string, scale: number = 1) {
  const r = 36 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '15');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = color + '60';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();
  ctx.fillStyle = C.textWhite;
  ctx.font = `bold ${16 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(getTeamInitials(name), cx, cy);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.textLight;
  ctx.font = `600 ${12 * scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(name, cx, cy + r + 20 * scale);
}

export function renderStoryCreative(entry: Entry): HTMLCanvasElement {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  drawFinancialBg(ctx, W, H);
  const pad = 60;

  drawBrandHeader(ctx, W / 2, 100, 2);

  const labelY = 360;
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  drawDateBadge(ctx, W / 2, labelY, 'NOVA ENTRADA', 2);

  const matchY = 500;
  drawGlowCard(ctx, pad, matchY, W - pad * 2, 440, C.borderCyanBright, C.glowCyan);

  const teamCenterY = matchY + 160;
  drawTeamBadge(ctx, W * 0.25, teamCenterY, entry.home_team, '#0ea5e9', 2.2);
  drawVsSymbol(ctx, W / 2, teamCenterY, 2.2);
  drawTeamBadge(ctx, W * 0.75, teamCenterY, entry.away_team, C.gold, 2.2);

  ctx.fillStyle = C.textMuted;
  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  const dateStr = new Date(entry.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  ctx.fillText(dateStr, W / 2, matchY + 380);

  const statsY = 1020;
  drawGlowCard(ctx, pad, statsY, W - pad * 2, 440, C.borderCyan, C.glowCyan);

  const statItems = [
    { label: 'ODD LAY', value: entry.odd.toFixed(2), color: C.gold },
    { label: 'PROBABILIDADE', value: `${(100 / (entry.odd - 1)).toFixed(1)}%`, color: '#0ea5e9' },
    { label: 'STAKE', value: `R$ ${entry.stake.toFixed(2)}`, color: C.textWhite },
    { label: 'LUCRO POTENCIAL', value: `R$ ${(entry.stake / (entry.odd - 1)).toFixed(2)}`, color: C.green },
  ];

  const statStartY = statsY + 60;
  const statGap = 95;

  statItems.forEach((item, i) => {
    const sy = statStartY + i * statGap;
    roundRect(ctx, pad + 30, sy, W - pad * 2 - 60, 80, 12);
    ctx.fillStyle = C.rowEven;
    ctx.fill();
    ctx.strokeStyle = 'rgba(26, 107, 122, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = C.textMuted;
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.label, pad + 60, sy + 36);

    ctx.fillStyle = item.color;
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.value, W - pad - 60, sy + 52);
  });

  const statusY = 1540;
  const isPending = entry.result === 'pending';
  const statusColor = isPending ? C.gold : entry.result === 'green' ? C.green : entry.result === 'red' ? C.red : C.textMuted;
  const statusLabel = isPending ? 'PENDENTE' : entry.result === 'green' ? 'GREEN' : entry.result === 'red' ? 'RED' : 'CANCELADA';

  roundRect(ctx, W / 2 - 160, statusY, 320, 60, 30);
  ctx.fillStyle = statusColor + '20';
  ctx.fill();
  ctx.strokeStyle = statusColor + '50';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = statusColor;
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusLabel, W / 2, statusY + 39);

  drawFooter(ctx, W, H, 2);

  return canvas;
}

/* ---------- POST creative (1080x1080) ---------- */

export function renderPostCreative(
  entries: Entry[],
  _evolution: DayEvolution[],
  _initialBankroll: number,
  currentBankroll: number,
  reportDate?: Date
): HTMLCanvasElement {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  drawFinancialBg(ctx, W, H);
  const pad = 44;

  drawBrandHeader(ctx, W / 2, 28, 1.3);

  const data = prepareReportData(entries, currentBankroll, reportDate);

  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  drawDateBadge(ctx, W / 2, 150, `RELATORIO - ${data.dateLabel}`, 1.2);

  const kpiH = drawKpiCards(ctx, 200, pad, W - pad * 2, data, 1);

  const tableY = 200 + kpiH + 20;
  const availH = H - tableY - 55;
  const maxRows = Math.min(data.displayEntries.length, Math.floor((availH - 52) / 48));

  drawTable(ctx, tableY, pad, W - pad * 2, data.displayEntries, maxRows, 1);

  drawFooter(ctx, W, H, 1);

  return canvas;
}

/* ---------- REEL creative (1080x1920) ---------- */

export function renderReelCreative(
  entries: Entry[],
  evolution: DayEvolution[],
  initialBankroll: number,
  currentBankroll: number,
  reportDate?: Date
): HTMLCanvasElement {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  drawFinancialBg(ctx, W, H);
  const pad = 50;

  drawBrandHeader(ctx, W / 2, 70, 1.8);

  const data = prepareReportData(entries, currentBankroll, reportDate);

  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  drawDateBadge(ctx, W / 2, 270, `RELATORIO COMPLETO - ${data.dateLabel}`, 1.5);

  const kpiH = drawKpiCards(ctx, 340, pad, W - pad * 2, data, 1.3);

  const tableY = 340 + kpiH + 28;
  const maxRows = Math.min(data.displayEntries.length, 10);
  const tableH = drawTable(ctx, tableY, pad, W - pad * 2, data.displayEntries, maxRows, 1.2);

  // evolution chart
  const evoY = tableY + tableH + 28;
  const evoH = H - evoY - 80;

  if (evolution.length > 1 && evoH > 140) {
    drawGlowCard(ctx, pad, evoY, W - pad * 2, evoH, C.borderCyan, C.glowCyan);

    ctx.fillStyle = C.textMuted;
    ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('EVOLUCAO DA BANCA', pad + 24, evoY + 30);

    const growth = initialBankroll > 0 ? ((currentBankroll - initialBankroll) / initialBankroll) * 100 : 0;
    ctx.fillStyle = growth >= 0 ? C.green : C.red;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`, W - pad - 24, evoY + 30);

    const chartX = pad + 80;
    const chartW = W - pad * 2 - 100;
    const chartYS = evoY + 52;
    const chartH = evoH - 76;

    const allVals = [initialBankroll, ...evolution.map((d) => d.end)];
    const mn = Math.min(...allVals) * 0.98;
    const mx = Math.max(...allVals) * 1.02;
    const rng = mx - mn || 1;

    const pts: { x: number; y: number }[] = [];
    pts.push({ x: chartX, y: chartYS + chartH - ((initialBankroll - mn) / rng) * chartH });
    evolution.forEach((d, i) => {
      pts.push({ x: chartX + ((i + 1) / evolution.length) * chartW, y: chartYS + chartH - ((d.end - mn) / rng) * chartH });
    });

    // grid lines
    for (let i = 0; i < 4; i++) {
      const gy = chartYS + (i / 3) * chartH;
      ctx.strokeStyle = 'rgba(26, 107, 122, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartX, gy);
      ctx.lineTo(chartX + chartW, gy);
      ctx.stroke();

      const v = mx - (i / 3) * rng;
      ctx.fillStyle = C.textMuted;
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`R$ ${v.toFixed(0)}`, chartX - 10, gy + 4);
    }

    // area fill
    const areaGrad = ctx.createLinearGradient(0, chartYS, 0, chartYS + chartH);
    areaGrad.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
    areaGrad.addColorStop(1, 'rgba(34, 197, 94, 0)');
    ctx.fillStyle = areaGrad;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineTo(pts[pts.length - 1].x, chartYS + chartH);
    ctx.lineTo(pts[0].x, chartYS + chartH);
    ctx.closePath();
    ctx.fill();

    // line
    const lineGrad = ctx.createLinearGradient(chartX, 0, chartX + chartW, 0);
    lineGrad.addColorStop(0, C.borderCyanBright);
    lineGrad.addColorStop(1, C.green);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    // dots
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = C.borderCyanBright;
      ctx.fill();
      ctx.strokeStyle = C.bgCard;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  drawFooter(ctx, W, H, 1.5);

  return canvas;
}

/* ---------- CALENDAR creative (1080x1920) ---------- */

const MONTH_NAMES_CR = [
  'JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];
const WEEKDAYS_CR = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const COMMISSION_RATE_CR = 0.065;

function calcEntryProfitCR(e: Entry): number {
  let profit: number;
  if (e.cashout_odd && e.cashout_odd > 1) {
    profit = e.stake * (1 / (e.odd - 1) - 1 / (e.cashout_odd - 1));
  } else {
    profit = e.result === 'green' ? e.stake / (e.odd - 1) : -e.stake;
  }
  if (profit > 0) {
    profit = profit * (1 - COMMISSION_RATE_CR);
  }
  return profit;
}

interface CalendarDayData {
  percentage: number;
  entries: number;
}

function computeCalendarData(entries: Entry[], year: number, month: number, initialBankroll: number): Map<number, CalendarDayData> {
  const dayMap = new Map<number, CalendarDayData>();
  const resolved = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const grouped = new Map<number, Entry[]>();
  for (const entry of resolved) {
    const day = new Date(entry.created_at).getDate();
    const existing = grouped.get(day) || [];
    existing.push(entry);
    grouped.set(day, existing);
  }

  const allResolvedBefore = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d < new Date(year, month, 1);
  });

  let bankrollAtMonthStart = initialBankroll;
  for (const e of allResolvedBefore) {
    bankrollAtMonthStart += calcEntryProfitCR(e);
  }

  let runningBankroll = bankrollAtMonthStart;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEntries = grouped.get(day);
    if (!dayEntries || dayEntries.length === 0) continue;

    const dayStart = runningBankroll;
    let dayProfit = 0;
    for (const e of dayEntries) {
      dayProfit += calcEntryProfitCR(e);
    }
    runningBankroll += dayProfit;
    const percentage = dayStart > 0 ? (dayProfit / dayStart) * 100 : 0;
    dayMap.set(day, { percentage, entries: dayEntries.length });
  }

  return dayMap;
}

function computeMonthTotalPercentageCR(entries: Entry[], year: number, month: number, initialBankroll: number): number {
  const resolved = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  if (resolved.length === 0) return 0;

  const allResolvedBefore = entries.filter((e) => {
    if (e.result !== 'green' && e.result !== 'red') return false;
    const d = new Date(e.created_at);
    return d < new Date(year, month, 1);
  });

  let bankrollAtMonthStart = initialBankroll;
  for (const e of allResolvedBefore) {
    bankrollAtMonthStart += calcEntryProfitCR(e);
  }

  let totalProfit = 0;
  for (const e of resolved) {
    totalProfit += calcEntryProfitCR(e);
  }

  return bankrollAtMonthStart > 0 ? (totalProfit / bankrollAtMonthStart) * 100 : 0;
}

export function renderCalendarCreative(
  entries: Entry[],
  initialBankroll: number,
  currentBankroll: number,
  reportDate?: Date
): HTMLCanvasElement {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  drawFinancialBg(ctx, W, H);
  const pad = 50;

  drawBrandHeader(ctx, W / 2, 60, 1.8);

  const targetDate = reportDate || new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  const profit = currentBankroll - initialBankroll;
  const isPositive = profit >= 0;
  const growth = initialBankroll > 0 ? (profit / initialBankroll) * 100 : 0;

  // --- Top Cards: Banca Inicial, Banca Atual, Lucro Total, Crescimento ---
  const cardsY = 240;
  const cardGap = 16;
  const cardW = (W - pad * 2 - cardGap) / 2;
  const cardH = 110;

  const topCards = [
    { label: 'BANCA INICIAL', value: `R$ ${initialBankroll.toFixed(2)}`, color: C.textWhite, border: C.borderCyan, glow: C.glowCyan },
    { label: 'BANCA ATUAL', value: `R$ ${currentBankroll.toFixed(2)}`, color: C.gold, border: 'rgba(250, 204, 21, 0.4)', glow: 'rgba(250, 204, 21, 0.2)' },
    { label: 'LUCRO TOTAL', value: `${isPositive ? '+' : ''}R$ ${profit.toFixed(2)}`, color: isPositive ? C.green : C.red, border: isPositive ? C.greenBorder : 'rgba(239, 68, 68, 0.4)', glow: isPositive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' },
    { label: 'CRESCIMENTO', value: `${isPositive ? '+' : ''}${growth.toFixed(1)}%`, color: isPositive ? C.green : C.red, border: isPositive ? C.greenBorder : 'rgba(239, 68, 68, 0.4)', glow: isPositive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' },
  ];

  topCards.forEach((card, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const cx = pad + col * (cardW + cardGap);
    const cy = cardsY + row * (cardH + cardGap);

    drawGlowCard(ctx, cx, cy, cardW, cardH, card.border, card.glow);

    ctx.fillStyle = C.textMuted;
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(card.label, cx + 24, cy + 38);

    ctx.fillStyle = card.color;
    ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(card.value, cx + 24, cy + 80);
  });

  // --- Calendar ---
  const calY = cardsY + (cardH + cardGap) * 2 + 30;
  const calW = W - pad * 2;

  const dayData = computeCalendarData(entries, year, month, initialBankroll);
  const monthPercentage = computeMonthTotalPercentageCR(entries, year, month, initialBankroll);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let i = 0; i < remaining; i++) cells.push(null);
  }

  const rows = cells.length / 7;
  const cellSize = Math.floor((calW - 6 * 8) / 7);
  const cellGap = 8;
  const headerRowH = 50;
  const monthHeaderH = 60;
  const calTotalH = monthHeaderH + headerRowH + rows * (cellSize + cellGap) + 20;

  drawGlowCard(ctx, pad, calY, calW, calTotalH, C.borderCyan, C.glowCyan);

  // Month header
  ctx.fillStyle = C.textWhite;
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${MONTH_NAMES_CR[month]} / ${year}`, pad + 24, calY + 40);

  ctx.fillStyle = monthPercentage >= 0 ? C.green : C.red;
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${monthPercentage >= 0 ? '+' : ''}${monthPercentage.toFixed(2)}%`, pad + calW - 24, calY + 40);

  // Weekday headers
  const gridStartX = pad + 12;
  const gridStartY = calY + monthHeaderH;

  WEEKDAYS_CR.forEach((day, i) => {
    const cx = gridStartX + i * (cellSize + cellGap) + cellSize / 2;
    ctx.fillStyle = C.textMuted;
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day, cx, gridStartY + 30);
  });

  // Calendar cells
  const cellStartY = gridStartY + headerRowH;
  const today = new Date();

  cells.forEach((day, i) => {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const cx = gridStartX + col * (cellSize + cellGap);
    const cy = cellStartY + row * (cellSize + cellGap);

    if (day === null) {
      roundRect(ctx, cx, cy, cellSize, cellSize, 10);
      ctx.fillStyle = 'rgba(13, 26, 48, 0.5)';
      ctx.fill();
      return;
    }

    const data = dayData.get(day);
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

    if (data) {
      const isPos = data.percentage >= 0;
      roundRect(ctx, cx, cy, cellSize, cellSize, 10);
      ctx.fillStyle = isPos ? '#1a6bff' : '#dc2626';
      ctx.fill();

      ctx.save();
      ctx.shadowColor = isPos ? 'rgba(26, 107, 255, 0.4)' : 'rgba(220, 38, 38, 0.4)';
      ctx.shadowBlur = 8;
      ctx.restore();

      // Day number
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(day), cx + 8, cy + 18);

      // Percentage
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${cellSize > 100 ? 22 : 18}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${data.percentage >= 0 ? '' : '-'}${Math.abs(data.percentage).toFixed(2)}%`, cx + cellSize / 2, cy + cellSize / 2 + 4);

      // Sub label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${data.entries} aposta${data.entries > 1 ? 's' : ''}`, cx + cellSize / 2, cy + cellSize - 12);
    } else {
      roundRect(ctx, cx, cy, cellSize, cellSize, 10);
      if (isToday) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20, 35, 60, 0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(26, 107, 122, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.fillStyle = isToday ? C.gold : C.textMuted;
      ctx.font = `${isToday ? 'bold ' : ''}14px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(String(day), cx + 8, cy + 18);
    }
  });

  drawFooter(ctx, W, H, 1.5);

  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
