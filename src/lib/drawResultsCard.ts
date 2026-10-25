// The results card image (1080×1350 PNG), drawn with Canvas 2D only. Loaded with a dynamic import, so
// this code and the italic font below are only fetched when a card is drawn. Always the dark design
// (fixed colours, never the CSS tokens), whatever the phone's theme. No emoji on the canvas.
import "@fontsource/playfair-display/latin-600-italic.css";
import type { CardRow, ResultsCardModel } from "./resultsCard.js";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const C = {
  velvetTop: "#2a0f14",
  velvetEdge: "#0b0405",
  brass: "#d6b35e",
  brassHi: "#f0d68b",
  brassLo: "#9c7a34",
  foilHi: "#fff3c4",
  text: "#f4ecda",
  muted: "#c4bba6",
  win: "#6fdc9a",
  loss: "#ff9076",
};

const CINZEL = '"Cinzel", Georgia, serif';
const PLAYFAIR = '"Playfair Display", Georgia, serif';
const INTER = '"Inter", system-ui, sans-serif';
const cinzel = (size: number) => `700 ${size}px ${CINZEL}`;
const playfair = (size: number) => `700 ${size}px ${PLAYFAIR}`;
const italic = (size: number) => `italic 600 ${size}px ${PLAYFAIR}`;
const inter = (weight: 400 | 600 | 700, size: number) => `${weight} ${size}px ${INTER}`;

const FONTS = [cinzel(40), playfair(80), italic(40), inter(400, 30), inter(600, 30), inter(700, 30)];
const FONT_WAIT_MS = 4000;

// Wait for every face the card uses (never forever: offline without a cached font, it draws with the fallback).
async function loadFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const all = Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => [])));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
}

type Ctx = CanvasRenderingContext2D;

const SIDE = 90; // content inset from the card edge
const INNER = CARD_WIDTH - 2 * SIDE;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Letter-spaced text, drawn a character at a time (ctx.letterSpacing isn't everywhere yet).
function spacedWidth(ctx: Ctx, text: string, spacing: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + spacing;
  return Math.max(0, width - spacing);
}

function drawSpaced(ctx: Ctx, text: string, cx: number, y: number, spacing: number) {
  let x = cx - spacedWidth(ctx, text, spacing) / 2;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}

// The largest size ≤ `size` at which `text` fits `maxWidth`: names shrink, they're never cut off.
function fitSize(ctx: Ctx, text: string, font: (size: number) => string, size: number, maxWidth: number, spacing = 0): number {
  let s = size;
  for (let i = 0; i < 40 && s > 8; i++) {
    ctx.font = font(s);
    const width = spacing ? spacedWidth(ctx, text, spacing * (s / size)) : ctx.measureText(text).width;
    if (width <= maxWidth) return s;
    s = Math.max(8, Math.min(s - 1, Math.floor((s * maxWidth) / width)));
  }
  return s;
}

// Greedy word wrap into at most `maxLines`, shrinking until it fits.
function wrap(ctx: Ctx, text: string, font: (size: number) => string, size: number, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let s = size; ; s = Math.floor(s * 0.92)) {
    ctx.font = font(s);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length <= maxLines && widest <= maxWidth) || s <= 14) return { size: s, lines };
  }
}

function moneyColour(value: number): string {
  return value > 0 ? C.win : value < 0 ? C.loss : C.muted;
}

function goldGradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, C.brassLo);
  g.addColorStop(0.3, C.brassHi);
  g.addColorStop(0.5, C.foilHi);
  g.addColorStop(0.7, C.brass);
  g.addColorStop(1, C.brassLo);
  return g;
}

// A three-point crown with jewels, `w` wide, top edge at `y`.
function drawCrown(ctx: Ctx, cx: number, y: number, w: number) {
  const h = w * 0.72;
  const x = cx - w / 2;
  const p = (fx: number, fy: number): [number, number] => [x + fx * w, y + fy * h];
  ctx.save();
  ctx.fillStyle = goldGradient(ctx, x, y, x + w, y + h);
  ctx.beginPath();
  ctx.moveTo(...p(0.06, 0.78));
  ctx.lineTo(...p(0, 0.2));
  ctx.lineTo(...p(0.28, 0.46));
  ctx.lineTo(...p(0.5, 0.04));
  ctx.lineTo(...p(0.72, 0.46));
  ctx.lineTo(...p(1, 0.2));
  ctx.lineTo(...p(0.94, 0.78));
  ctx.closePath();
  ctx.fill();
  roundRect(ctx, x + 0.06 * w, y + 0.82 * h, 0.88 * w, 0.16 * h, 0.04 * w);
  ctx.fill();
  ctx.fillStyle = C.foilHi;
  for (const [fx, fy] of [[0, 0.2], [0.5, 0.04], [1, 0.2]] as const) {
    ctx.beginPath();
    ctx.arc(...p(fx, fy), w * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(ctx: Ctx) {
  const velvet = ctx.createRadialGradient(CARD_WIDTH / 2, -80, 40, CARD_WIDTH / 2, -80, CARD_HEIGHT * 1.15);
  velvet.addColorStop(0, C.velvetTop);
  velvet.addColorStop(1, C.velvetEdge);
  ctx.fillStyle = velvet;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glow = (x: number, y: number, r: number, colour: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  };
  glow(880, 230, 560, "rgba(214,179,94,0.16)");
  glow(150, 1160, 620, "rgba(29,122,82,0.22)");
  glow(540, 1350, 520, "rgba(122,31,43,0.20)");

  ctx.strokeStyle = "rgba(214,179,94,0.8)";
  ctx.lineWidth = 3;
  roundRect(ctx, 30, 30, CARD_WIDTH - 60, CARD_HEIGHT - 60, 46);
  ctx.stroke();
  ctx.strokeStyle = "rgba(214,179,94,0.28)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 46, 46, CARD_WIDTH - 92, CARD_HEIGHT - 92, 34);
  ctx.stroke();
}

function drawHeader(ctx: Ctx, model: ResultsCardModel): number {
  const cx = CARD_WIDTH / 2;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.brass;
  const titleSize = fitSize(ctx, model.title, cinzel, 44, INNER, 12);
  ctx.font = cinzel(titleSize);
  drawSpaced(ctx, model.title, cx, 132, 12 * (titleSize / 44));

  ctx.fillStyle = C.brassLo;
  ctx.font = inter(400, 26);
  ctx.textAlign = "center";
  ctx.fillText("♠   ♥   ♦   ♣", cx, 178);

  if (model.label.kind === "season") {
    const nameSize = fitSize(ctx, model.label.seasonName, playfair, 46, INNER);
    ctx.font = playfair(nameSize);
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    ctx.fillText(model.label.seasonName, cx, 240);
    const sub = `${model.label.gameText}  ·  ${model.date.toUpperCase()}`;
    const subSize = fitSize(ctx, sub, cinzel, 26, INNER, 5);
    ctx.font = cinzel(subSize);
    ctx.fillStyle = C.muted;
    drawSpaced(ctx, sub, cx, 288, 5 * (subSize / 26));
  } else {
    ctx.font = cinzel(38);
    ctx.fillStyle = C.brassHi;
    drawSpaced(ctx, model.label.text, cx, 240, 10);
    const subSize = fitSize(ctx, model.date.toUpperCase(), cinzel, 26, INNER, 5);
    ctx.font = cinzel(subSize);
    ctx.fillStyle = C.muted;
    drawSpaced(ctx, model.date.toUpperCase(), cx, 288, 5);
  }

  const line = ctx.createLinearGradient(SIDE, 0, CARD_WIDTH - SIDE, 0);
  line.addColorStop(0, "rgba(214,179,94,0)");
  line.addColorStop(0.5, "rgba(214,179,94,0.7)");
  line.addColorStop(1, "rgba(214,179,94,0)");
  ctx.fillStyle = line;
  ctx.fillRect(SIDE, 318, INNER, 2);
  return 320;
}

interface Pill {
  text: string;
  size: number;
  width: number;
}

const PILL_H = 48;
const PILL_GAP = 12;
const PILL_PAD = 22;

// Badge pills flowed into centred lines (at most `maxLines`; the rest become "+N more").
function layoutPills(ctx: Ctx, badges: string[], maxLines: number): Pill[][] {
  const make = (text: string): Pill => {
    const size = fitSize(ctx, text, (s) => inter(600, s), 26, INNER - 2 * PILL_PAD);
    ctx.font = inter(600, size);
    return { text, size, width: ctx.measureText(text).width + 2 * PILL_PAD };
  };
  const lines: Pill[][] = [];
  let width = 0;
  for (let i = 0; i < badges.length; i++) {
    const pill = make(badges[i]!);
    const last = lines[lines.length - 1];
    if (last && width + PILL_GAP + pill.width <= INNER) {
      last.push(pill);
      width += PILL_GAP + pill.width;
      continue;
    }
    if (lines.length === maxLines) {
      // Out of room: the last line ends with "+N more" (dropping pills from it until that fits).
      const rest = lines[lines.length - 1]!;
      let left = badges.length - i;
      let more = make(`+${left} more`);
      while (rest.length > 1 && rest.reduce((w, p) => w + p.width + PILL_GAP, 0) + more.width > INNER) {
        rest.pop();
        left++;
        more = make(`+${left} more`);
      }
      rest.push(more);
      break;
    }
    lines.push([pill]);
    width = pill.width;
  }
  return lines;
}

function drawPills(ctx: Ctx, lines: Pill[][], top: number) {
  lines.forEach((line, i) => {
    const total = line.reduce((w, p) => w + p.width, 0) + PILL_GAP * (line.length - 1);
    let x = (CARD_WIDTH - total) / 2;
    const y = top + i * (PILL_H + PILL_GAP);
    for (const pill of line) {
      roundRect(ctx, x, y, pill.width, PILL_H, PILL_H / 2);
      ctx.fillStyle = "rgba(214,179,94,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(214,179,94,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = inter(600, pill.size);
      ctx.fillStyle = C.brassHi;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pill.text, x + pill.width / 2, y + PILL_H / 2 + 1);
      x += pill.width + PILL_GAP;
    }
  });
  ctx.textBaseline = "alphabetic";
}

// Man of the Match block at scale `s`; returns its height (draws only when `draw`).
function manOfTheMatch(ctx: Ctx, model: ResultsCardModel, top: number, s: number, draw: boolean): number {
  const cx = CARD_WIDTH / 2;
  const motm = model.manOfTheMatch;
  if (!motm) {
    if (draw) {
      ctx.font = cinzel(34);
      ctx.fillStyle = C.brassHi;
      drawSpaced(ctx, "ALL SQUARE TONIGHT", cx, top + 60, 8);
    }
    return 90;
  }
  let y = top;
  const crownW = 92 * s;
  if (draw) drawCrown(ctx, cx, y, crownW);
  y += crownW * 0.72 + 44 * s;

  if (draw) {
    ctx.font = cinzel(Math.round(30 * s));
    ctx.fillStyle = C.brass;
    drawSpaced(ctx, "MAN OF THE MATCH", cx, y, 8 * s);
  }
  y += 22 * s;

  const nameSize = fitSize(ctx, motm.name, playfair, Math.round(104 * s), INNER);
  y += nameSize * 0.95;
  if (draw) {
    ctx.font = playfair(nameSize);
    const w = ctx.measureText(motm.name).width;
    ctx.save();
    ctx.shadowColor = "rgba(240,214,139,0.35)";
    ctx.shadowBlur = 28;
    ctx.fillStyle = goldGradient(ctx, cx - w / 2, y - nameSize, cx + w / 2, y);
    ctx.textAlign = "center";
    ctx.fillText(motm.name, cx, y);
    ctx.restore();
  }

  const resultSize = Math.round(84 * s);
  y += resultSize * 0.95 + 14 * s;
  if (draw) {
    ctx.font = inter(700, resultSize);
    ctx.fillStyle = C.win;
    ctx.textAlign = "center";
    ctx.fillText(motm.resultText, cx, y);
  }

  const quote = wrap(ctx, `“${motm.line}”`, italic, Math.round(40 * s), INNER - 40, 2);
  const lineH = quote.size * 1.3;
  y += 22 * s;
  quote.lines.forEach((text, i) => {
    if (!draw) return;
    ctx.font = italic(quote.size);
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    ctx.fillText(text, cx, y + lineH * (i + 1) - quote.size * 0.25);
  });
  y += lineH * quote.lines.length;
  return y - top;
}

// The other players in a glass panel; more than 7 go into two columns (read down, then across).
function drawPanel(ctx: Ctx, rows: CardRow[], top: number, rowH: number, cols: 1 | 2) {
  const pad = 18;
  const perCol = Math.ceil(rows.length / cols);
  const h = perCol * rowH + 2 * pad;
  const x = SIDE - 10;
  const w = INNER + 20;
  roundRect(ctx, x, top, w, h, 28);
  const fill = ctx.createLinearGradient(0, top, 0, top + h);
  fill.addColorStop(0, "rgba(255,236,214,0.10)");
  fill.addColorStop(1, "rgba(255,236,214,0.04)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,236,214,0.16)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,246,230,0.22)";
  ctx.fillRect(x + 28, top + 1, w - 56, 1.5);

  const colGap = 44;
  const colW = (w - 68 - (cols - 1) * colGap) / cols;
  if (cols === 2) {
    ctx.fillStyle = "rgba(255,236,214,0.10)";
    ctx.fillRect(x + 34 + colW + colGap / 2, top + pad + 8, 1, h - 2 * pad - 16);
  }
  const size = Math.round(Math.min(cols === 2 ? 32 : 38, rowH * 0.46));
  rows.forEach((row, i) => {
    const col = Math.floor(i / perCol);
    const line = i % perCol;
    const left = x + 34 + col * (colW + colGap);
    const mid = top + pad + rowH * line + rowH / 2;
    ctx.textBaseline = "middle";
    ctx.font = inter(700, size);
    const resultW = ctx.measureText(row.resultText).width;
    ctx.fillStyle = moneyColour(row.result);
    ctx.textAlign = "right";
    ctx.fillText(row.resultText, left + colW, mid);
    const nameSize = fitSize(ctx, row.name, (s) => inter(600, s), size, colW - resultW - 20);
    ctx.font = inter(600, nameSize);
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.fillText(row.name, left, mid);
    if (line > 0) {
      ctx.fillStyle = "rgba(255,236,214,0.08)";
      ctx.fillRect(left, top + pad + rowH * line, colW, 1);
    }
  });
  ctx.textBaseline = "alphabetic";
}

const SCALES = [1, 0.9, 0.8, 0.7, 0.62, 0.55];
const MIN_ROW = 54;
const MAX_ROW = 84;

export function paintResultsCard(ctx: Ctx, model: ResultsCardModel) {
  drawBackground(ctx);
  const headerEnd = drawHeader(ctx, model);
  const cx = CARD_WIDTH / 2;

  // Bottom up: footer, the leader/champion line, then the badge pills.
  const footerY = CARD_HEIGHT - 82;
  let bottom = footerY - 52;
  const standingY = model.standingLine ? bottom : null;
  if (model.standingLine) bottom -= 58;
  // Many players: two columns of rows and fewer lines of badges.
  const rows = model.others;
  const cols: 1 | 2 = rows.length > 7 ? 2 : 1;
  const rowCount = Math.ceil(rows.length / cols);
  const pills = layoutPills(ctx, model.badges, cols === 2 ? 2 : 3);
  const pillsH = pills.length ? pills.length * (PILL_H + PILL_GAP) - PILL_GAP : 0;
  const pillsTop = bottom - pillsH;
  const middleBottom = pills.length ? pillsTop - 30 : bottom;

  // The biggest Man of the Match block that still leaves the players' rows at least MIN_ROW tall.
  const gap = 34;
  const pad = 36;
  let scale = SCALES[SCALES.length - 1]!;
  for (const s of SCALES) {
    const room = middleBottom - headerEnd - 30 - manOfTheMatch(ctx, model, 0, s, false) - (rows.length ? gap + pad : 0);
    if (!rows.length || room / rowCount >= MIN_ROW) {
      scale = s;
      break;
    }
  }
  const motmH = manOfTheMatch(ctx, model, 0, scale, false);
  const space = middleBottom - headerEnd - 30;
  const rowH = rows.length ? Math.max(40, Math.min(MAX_ROW, (space - motmH - gap - pad) / rowCount)) : 0;
  const contentH = motmH + (rows.length ? gap + rowCount * rowH + pad : 0);
  const top = headerEnd + 30 + Math.max(0, (space - contentH) / 2);
  manOfTheMatch(ctx, model, top, scale, true);
  if (rows.length) drawPanel(ctx, rows, top + motmH + gap, rowH, cols);
  if (pills.length) drawPills(ctx, pills, pillsTop);

  if (model.standingLine && standingY !== null) {
    const champion = model.standingLine.kind === "champion";
    const text = model.standingLine.text;
    const room = INNER - (champion ? 60 : 0);
    const size = fitSize(ctx, text, (s) => inter(600, s), 34, room);
    ctx.font = inter(600, size);
    const w = ctx.measureText(text).width;
    const start = cx - (w + (champion ? 60 : 0)) / 2;
    if (champion) drawCrown(ctx, start + 22, standingY - size * 0.85, 44);
    ctx.fillStyle = champion ? C.brassHi : C.text;
    ctx.textAlign = "left";
    ctx.fillText(text, start + (champion ? 60 : 0), standingY);
  }

  ctx.font = italic(30);
  ctx.fillStyle = C.muted;
  ctx.textAlign = "center";
  ctx.fillText(`♠  ${model.footer}  ♣`, cx, footerY);
}

// Draws the card (after its fonts load) and returns the PNG.
export async function drawResultsCard(model: ResultsCardModel): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available");
  paintResultsCard(ctx, model);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't make the image"))), "image/png"),
  );
}
