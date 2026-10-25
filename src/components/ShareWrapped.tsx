import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { formatSignedDollars } from "../lib/format.js";
import type { WrappedCardModel } from "../lib/drawWrappedCard.js";
import { shortDate } from "../lib/wrappedNav.js";
import { ImageSheet, useShareImage } from "./ShareImage.js";

// The Wrapped story image (lib/drawWrappedCard.ts, loaded on demand).
async function drawStory(key: string, cancelled: () => boolean): Promise<Blob | null> {
  const model = JSON.parse(key) as WrappedCardModel;
  const { drawWrappedCard } = await import("../lib/drawWrappedCard.js");
  if (cancelled()) return null;
  return drawWrappedCard(model);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function wrappedAlt(model: WrappedCardModel): string {
  const best = `Best night ${formatSignedDollars(model.bestNight.result)} on ${shortDate(model.bestNight.date)}.`;
  return `${model.name}'s ${model.seasonName} Wrapped: ${model.placeLabel}, ${formatSignedDollars(model.net)}. ${best}${model.highlight ? ` ${model.highlight}.` : ""}`;
}

// "Share my Wrapped" on the finale slide: drawn as soon as the finale appears (useShareImage). The fallback
// sheet sits in its own layer above the story; `onSheet` tells the story so Escape closes the sheet only.
export function ShareWrappedButton({ model, onSheet }: { model: WrappedCardModel; onSheet: (open: boolean) => void }) {
  const key = useMemo(() => JSON.stringify(model), [model]);
  const fileName = `ct51-wrapped-${slug(model.seasonName)}-${slug(model.name) || "player"}.png`;
  const { state, share, sheetFile, closeSheet } = useShareImage(key, drawStory, fileName);
  const open = sheetFile !== null;

  useEffect(() => {
    onSheet(open);
  }, [open, onSheet]);
  useEffect(() => () => onSheet(false), [onSheet]);

  return (
    <>
      <button type="button" className="ct-btn ct-btn-primary ct-focus w-full max-w-[320px]" disabled={state !== "ready"} onClick={share}>
        {state === "preparing" ? "Preparing image…" : state === "failed" ? "Image unavailable" : "Share my Wrapped"}
      </button>
      {sheetFile &&
        createPortal(
          <div className="ct-wrapped-sheet-layer" data-theme="dark">
            <ImageSheet
              file={sheetFile}
              alt={wrappedAlt(model)}
              label="Season Wrapped image"
              width={1080}
              height={1920}
              imageClassName="mx-auto block h-[58dvh] w-auto max-w-full rounded-xl"
              onClose={closeSheet}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
