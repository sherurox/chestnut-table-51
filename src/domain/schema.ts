import { z } from "zod";
import type { Data } from "./types.js";

const MAX_AMOUNT = 10_000_000;

const idSchema = z.string().min(1);

const settingsSchema = z.object({
  presetBuyIns: z.array(z.number().int().positive()),
});

const playerSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  type: z.enum(["regular", "guest"]),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
});

const seasonSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  status: z.enum(["active", "closed"]),
  startedOn: z.string(),
  endedOn: z.string().optional(),
});

const buyInSchema = z.object({
  player: idSchema,
  amount: z.number().int().min(1).max(MAX_AMOUNT),
  at: z.string(),
});

const cashOutSchema = z.object({
  player: idSchema,
  amount: z.number().int().min(0).max(MAX_AMOUNT),
});

const gameSchema = z.object({
  id: idSchema,
  seasonId: idSchema,
  date: z.string(),
  mode: z.enum(["season", "incognito"]),
  status: z.enum(["finished", "deleted"]),
  players: z.array(idSchema),
  buyIns: z.array(buyInSchema),
  cashOuts: z.array(cashOutSchema),
  createdAt: z.string(),
  editedAt: z.string().optional(),
  deletedAt: z.string().optional(),
});

const liveMarkerSchema = z.object({
  gameId: idSchema,
  startedAt: z.string(),
});

const dataShapeSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
  players: z.array(playerSchema),
  seasons: z.array(seasonSchema),
  games: z.array(gameSchema),
  liveGame: liveMarkerSchema.nullable(),
});

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export const dataSchema = dataShapeSchema.superRefine((data, ctx) => {
  const playerIds = new Set<string>();
  for (const p of data.players) {
    if (playerIds.has(p.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate player id: ${p.id}` });
    }
    playerIds.add(p.id);
  }

  const seenNames = new Set<string>();
  for (const p of data.players) {
    const normalized = normalizeName(p.name);
    if (seenNames.has(normalized)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate player name: ${p.name}` });
    }
    seenNames.add(normalized);
  }

  const seasonIds = new Set<string>();
  for (const s of data.seasons) {
    if (seasonIds.has(s.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate season id: ${s.id}` });
    }
    seasonIds.add(s.id);
  }

  const activeSeasons = data.seasons.filter((s) => s.status === "active");
  if (activeSeasons.length > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "More than one active season" });
  }

  const gameIds = new Set<string>();
  for (const g of data.games) {
    if (gameIds.has(g.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate game id: ${g.id}` });
    }
    gameIds.add(g.id);

    if (!seasonIds.has(g.seasonId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} references unknown season ${g.seasonId}` });
    }

    for (const playerId of g.players) {
      if (!playerIds.has(playerId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} references unknown player ${playerId}` });
      }
    }

    if (g.status !== "finished") continue;

    if (g.players.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} needs at least 2 players` });
    }

    for (const b of g.buyIns) {
      if (!g.players.includes(b.player)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} has a buy-in for player ${b.player} not in the game` });
      }
    }
    for (const c of g.cashOuts) {
      if (!g.players.includes(c.player)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} has a cash-out for player ${c.player} not in the game` });
      }
    }

    for (const playerId of g.players) {
      const buyInCount = g.buyIns.filter((b) => b.player === playerId).length;
      if (buyInCount < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id}: player ${playerId} has no buy-in` });
      }

      const cashOutCount = g.cashOuts.filter((c) => c.player === playerId).length;
      if (cashOutCount !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id}: player ${playerId} must have exactly one cash-out` });
      }
    }

    const totalBuyIns = g.buyIns.reduce((sum, b) => sum + b.amount, 0);
    const totalCashOuts = g.cashOuts.reduce((sum, c) => sum + c.amount, 0);
    if (totalBuyIns !== totalCashOuts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} fails the chip check (buy-ins ${totalBuyIns}, cash-outs ${totalCashOuts})` });
    }

    if (g.mode === "season") {
      const playersById = new Map(data.players.map((p) => [p.id, p]));
      for (const playerId of g.players) {
        const player = playersById.get(playerId);
        if (player?.type === "guest") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Game ${g.id} is season mode but includes guest player ${playerId}` });
        }
      }
    }
  }

  if (data.liveGame) {
    if (!gameIds.has(data.liveGame.gameId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `liveGame references unknown game ${data.liveGame.gameId}` });
    }
  }
});

export function validateData(raw: unknown): Data {
  return dataSchema.parse(raw) as Data;
}
