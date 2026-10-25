import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Data, Game } from "../domain/types.js";
import { resultsCardModel, type ResultsCardModel } from "../lib/resultsCard.js";
import { createSerialQueue } from "../lib/serialQueue.js";
import { shareText } from "../lib/share.js";

// Every card on screen is drawn one at a time, in mount order (Admin home can show several).
const enqueue = createSerialQueue();

// "Share card": the results card as a PNG (lib/drawResultsCard.ts, loaded on demand). It is drawn in the
// background as soon as the button appears, because iOS only shares from inside the tap with nothing
// awaited before navigator.share. No file sharing (or any error but a cancel): a sheet with the image to
// press and hold, plus a Download link. `data` must already include the game.
export function ShareCardButton({ data, game, className = "" }: { data: Data; game: Game; className?: string }) {
  const file = useRef<File | null>(null);
  const [state, setState] = useState<"preparing" | "ready" | "failed">("preparing");
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Redraw only when the card would look different: a refresh or a save elsewhere gives a new `data`
  // object, but the same content keeps the card that's ready (no "Preparing card…" flash).
  const cardKey = useMemo(() => JSON.stringify(resultsCardModel(data, game)), [data, game]);
  const fileName = `ct51-${game.date}.png`;

  useEffect(() => {
    let cancelled = false;
    file.current = null;
    setState("preparing");
    const model = JSON.parse(cardKey) as ResultsCardModel;
    enqueue(async () => {
      if (cancelled) return;
      const { drawResultsCard } = await import("../lib/drawResultsCard.js");
      if (cancelled) return;
      const blob = await drawResultsCard(model);
      if (cancelled) return;
      file.current = new File([blob], fileName, { type: "image/png" });
      setState("ready");
    }).catch(() => {
      if (!cancelled) setState("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [cardKey, fileName]);

  // Straight inside the tap: no await before share().
  function share() {
    const ready = file.current;
    if (!ready) return;
    try {
      if (navigator.canShare?.({ files: [ready] })) {
        navigator.share({ files: [ready] }).catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name !== "AbortError") setSheetOpen(true);
        });
        return;
      }
    } catch {
      // fall through to the sheet
    }
    setSheetOpen(true);
  }

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
      {sheetOpen && file.current && (
        <CardSheet file={file.current} alt={shareText(data, game)} onClose={closeSheet} />
      )}
    </>
  );
}

function CardSheet({ file, alt, onClose }: { file: File; alt: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  // One object URL while the sheet is open, revoked when it closes (or the screen goes away).
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="ct-sheet-backdrop" data-instant="" onClick={onClose} aria-hidden="true" />
      <div className="ct-sheet px-4" data-instant="" role="dialog" aria-modal="true" aria-label="Results card">
        <span className="ct-sheet-handle" aria-hidden="true" />
        <p className="pt-3 pb-2 text-center text-sm text-ink-muted">Press and hold the image to save or share it</p>
        {url && <img src={url} alt={alt} width={1080} height={1350} className="mx-auto block h-auto w-full max-w-[400px] rounded-xl" />}
        <div className="mt-3 flex flex-col gap-2">
          {url && (
            <a href={url} download={file.name} className="ct-btn ct-btn-primary ct-focus">
              Download
            </a>
          )}
          <button ref={close} type="button" className="ct-btn ct-btn-secondary ct-focus" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
