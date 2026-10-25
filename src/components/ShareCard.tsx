import { useMemo } from "react";
import type { Data, Game } from "../domain/types.js";
import { resultsCardModel, type ResultsCardModel } from "../lib/resultsCard.js";
import { shareText } from "../lib/share.js";
import { ImageSheet, useShareImage } from "./ShareImage.js";

// The card's PNG, from lib/drawResultsCard.ts (loaded on demand).
async function drawCard(cardKey: string, cancelled: () => boolean): Promise<Blob | null> {
  const model = JSON.parse(cardKey) as ResultsCardModel;
  const { drawResultsCard } = await import("../lib/drawResultsCard.js");
  if (cancelled()) return null;
  return drawResultsCard(model);
}

// "Share card": the results card as a PNG, drawn and shared by useShareImage (components/ShareImage.tsx).
// `data` must already include the game.
export function ShareCardButton({ data, game, className = "" }: { data: Data; game: Game; className?: string }) {
  // Redraw only when the card would look different: a refresh or a save elsewhere gives a new `data`
  // object, but the same content keeps the card that's ready (no "Preparing card…" flash).
  const cardKey = useMemo(() => JSON.stringify(resultsCardModel(data, game)), [data, game]);
  const fileName = `ct51-${game.date}.png`;
  const { state, share, sheetFile, closeSheet } = useShareImage(cardKey, drawCard, fileName);

  return (
    <>
      <button
        type="button"
        className={`ct-btn ct-btn-secondary ct-focus ${className}`}
        disabled={state !== "ready"}
        onClick={share}
      >
        {state === "preparing" ? "Preparing card…" : state === "failed" ? "Card unavailable" : "Share card"}
      </button>
      {sheetFile && (
        <ImageSheet file={sheetFile} alt={shareText(data, game)} label="Results card" width={1080} height={1350} onClose={closeSheet} />
      )}
    </>
  );
}
