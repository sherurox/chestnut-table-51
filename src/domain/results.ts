import type { Game, ID } from "./types.js";

export function totalBuyIns(game: Game, playerId: ID): number {
  return game.buyIns.filter((b) => b.player === playerId).reduce((sum, b) => sum + b.amount, 0);
}

export function finalStack(game: Game, playerId: ID): number {
  const cashOut = game.cashOuts.find((c) => c.player === playerId);
  return cashOut ? cashOut.amount : 0;
}

export function gameResult(game: Game, playerId: ID): number {
  return finalStack(game, playerId) - totalBuyIns(game, playerId);
}

export interface ChipCheckResult {
  ok: boolean;
  gap: number;
  hint: string | null;
}

export function chipCheck(game: Game): ChipCheckResult {
  const totalIn = game.buyIns.reduce((sum, b) => sum + b.amount, 0);
  const totalOut = game.cashOuts.reduce((sum, c) => sum + c.amount, 0);
  const allPlayersHaveCashOut = game.players.every(
    (playerId) => game.cashOuts.filter((c) => c.player === playerId).length === 1,
  );

  const gap = totalOut - totalIn;
  const ok = gap === 0 && allPlayersHaveCashOut;

  let hint: string | null = null;
  if (gap !== 0) {
    const absGap = Math.abs(gap);
    const matchingBuyIn = game.buyIns.find((b) => b.amount === absGap);
    if (matchingBuyIn) {
      hint = `Same as one $${absGap} buy-in — missed rebuy?`;
    }
  }

  return { ok, gap, hint };
}
