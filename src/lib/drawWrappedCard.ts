// The Season Wrapped story image (1080×1920 PNG) of the finale slide, drawn with Canvas 2D only. Loaded
// with a dynamic import. Same dark Luxe palette, fonts (with the 4s cap) and text fitting as the results
// card, whose drawing helpers it shares. No emoji on the canvas; names shrink to fit, never cut.
import {
  C,
  cinzel,
  drawCrown,
  drawSpaced,
  fitSize,
  goldGradient,
  inter,
  italic,
  loadFonts,
  moneyColour,
  playfair,
  roundRect,
  type Ctx,
} from "./drawResultsCard.js";
import { formatSignedDollars } from "./format.js";
import type { WrappedSlide } from "./wrapped.js";
import { shortDate } from "./wrappedNav.js";

export type WrappedCardModel = Extract<WrappedSlide, { kind: "finale" }>;

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const W = STORY_WIDTH;
const H = STORY_HEIGHT;
const SIDE = 110;
const INNER = W - 2 * SIDE;
const CX = W / 2;

function drawBackground(ctx: Ctx) {
  const velvet = ctx.createRadialGradient(CX, -120, 60, CX, -120, H * 1.1);
  velvet.addColorStop(0, "#4a1520");
  velvet.addColorStop(0.45, C.velvetTop);
  velvet.addColorStop(1, C.velvetEdge);
  ctx.fillStyle = velvet;
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, colour: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(900, 520, 640, "rgba(214,179,94,0.16)");
  glow(140, 1500, 720, "rgba(29,122,82,0.22)");
  glow(560, 1920, 620, "rgba(122,31,43,0.22)");

  ctx.strokeStyle = "rgba(214,179,94,0.8)";
  ctx.lineWidth = 3;
  roundRect(ctx, 34, 34, W - 68, H - 68, 52);
  ctx.stroke();
  ctx.strokeStyle = "rgba(214,179,94,0.28)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 52, 52, W - 104, H - 104, 38);
  ctx.stroke();
}

function divider(ctx: Ctx, y: number) {
  const line = ctx.createLinearGradient(SIDE, 0, W - SIDE, 0);
  line.addColorStop(0, "rgba(214,179,94,0)");
  line.addColorStop(0.5, "rgba(214,179,94,0.7)");
  line.addColorStop(1, "rgba(214,179,94,0)");
  ctx.fillStyle = line;
  ctx.fillRect(SIDE, y, INNER, 2);
}

// Centred, letter-spaced Cinzel that shrinks to fit.
function eyebrow(ctx: Ctx, text: string, y: number, size: number, spacing: number, colour: string) {
  const s = fitSize(ctx, text, cinzel, size, INNER, spacing);
  ctx.font = cinzel(s);
  ctx.fillStyle = colour;
  drawSpaced(ctx, text, CX, y, spacing * (s / size));
}

function centred(ctx: Ctx, text: string, font: (size: number) => string, size: number, y: number, fill: string | CanvasGradient) {
  const s = fitSize(ctx, text, font, size, INNER);
  ctx.font = font(s);
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.fillText(text, CX, y);
  return s;
}

export function paintWrappedCard(ctx: Ctx, model: WrappedCardModel) {
  drawBackground(ctx);
  ctx.textBaseline = "alphabetic";

  // Header: brand, suits, "Season Wrapped", the season.
  eyebrow(ctx, "CHESTNUT TABLE 51", 250, 48, 13, C.brass);
  ctx.font = inter(400, 28);
  ctx.fillStyle = C.brassLo;
  ctx.textAlign = "center";
  ctx.fillText("♠   ♥   ♦   ♣", CX, 302);
  eyebrow(ctx, "SEASON WRAPPED", 400, 34, 9, C.brassHi);
  centred(ctx, model.seasonName, playfair, 60, 482, C.text);
  divider(ctx, 530);

  // The player: a crown for the champion, the name in gold.
  let y = 640;
  if (model.place === 1) {
    drawCrown(ctx, CX, y - 40, 110);
    y += 100;
  }
  const nameSize = fitSize(ctx, model.name, playfair, 128, INNER);
  y += nameSize * 0.9;
  ctx.font = playfair(nameSize);
  const nameW = ctx.measureText(model.name).width;
  ctx.save();
  ctx.shadowColor = "rgba(240,214,139,0.35)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = goldGradient(ctx, CX - nameW / 2, y - nameSize, CX + nameW / 2, y);
  ctx.textAlign = "center";
  ctx.fillText(model.name, CX, y);
  ctx.restore();

  // Place and net.
  y += 190;
  centred(ctx, model.placeLabel, playfair, 150, y, C.text);
  y += 180;
  centred(ctx, formatSignedDollars(model.net), playfair, 150, y, moneyColour(model.net));

  // Best night: amount in its colour, then the date.
  y += 130;
  divider(ctx, y);
  y += 110;
  eyebrow(ctx, "BEST NIGHT", y, 32, 9, C.brass);
  y += 82;
  const amount = formatSignedDollars(model.bestNight.result);
  const date = `  ·  ${shortDate(model.bestNight.date)}`;
  const size = fitSize(ctx, amount + date, (s) => inter(600, s), 54, INNER);
  ctx.font = inter(700, size);
  const amountW = ctx.measureText(amount).width;
  ctx.font = inter(600, size);
  const dateW = ctx.measureText(date).width;
  const start = CX - (amountW + dateW) / 2;
  ctx.textAlign = "left";
  ctx.font = inter(700, size);
  ctx.fillStyle = moneyColour(model.bestNight.result);
  ctx.fillText(amount, start, y);
  ctx.font = inter(600, size);
  ctx.fillStyle = C.muted;
  ctx.fillText(date, start + amountW, y);

  // The headline badge or title, as a brass pill.
  if (model.highlight) {
    y += 90;
    const pillH = 84;
    const pad = 40;
    const textSize = fitSize(ctx, model.highlight, (s) => inter(600, s), 40, INNER - 2 * pad);
    ctx.font = inter(600, textSize);
    const pillW = ctx.measureText(model.highlight).width + 2 * pad;
    roundRect(ctx, CX - pillW / 2, y, pillW, pillH, pillH / 2);
    ctx.fillStyle = "rgba(214,179,94,0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(214,179,94,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.brassHi;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(model.highlight, CX, y + pillH / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  ctx.font = italic(34);
  ctx.fillStyle = C.muted;
  ctx.textAlign = "center";
  ctx.fillText("♠  Paisa he paisa hoga  ♣", CX, H - 150);
}

// Draws the image (after its fonts load) and returns the PNG.
export async function drawWrappedCard(model: WrappedCardModel): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available");
  paintWrappedCard(ctx, model);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't make the image"))), "image/png"),
  );
}
