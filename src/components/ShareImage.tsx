import { useCallback, useEffect, useRef, useState } from "react";
import { createSerialQueue } from "../lib/serialQueue.js";

// Sharing a drawn PNG (the results card, the Wrapped story image). The image is drawn in the background
// as soon as its button appears, because iOS only shares from inside the tap with nothing awaited before
// navigator.share. No file sharing (or any error but a cancel): a sheet with the image to press and hold,
// plus a Download link.

// Every image on screen is drawn one at a time, in mount order (Admin home can show several cards).
const enqueue = createSerialQueue();

export type ShareImageState = "preparing" | "ready" | "failed";

// `key` is the image's content: a new key redraws, the same key keeps the image that's ready. `draw` gets
// the key and a cancelled() check (true once the key changed or the button went away) and may return null
// when cancelled.
export function useShareImage(
  key: string,
  draw: (key: string, cancelled: () => boolean) => Promise<Blob | null>,
  fileName: string,
): { state: ShareImageState; share: () => void; sheetFile: File | null; closeSheet: () => void } {
  const file = useRef<File | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const [state, setState] = useState<ShareImageState>("preparing");
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    file.current = null;
    setState("preparing");
    enqueue(async () => {
      if (cancelled) return;
      const blob = await drawRef.current(key, () => cancelled);
      if (cancelled || !blob) return;
      file.current = new File([blob], fileName, { type: "image/png" });
      setState("ready");
    }).catch(() => {
      if (!cancelled) setState("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [key, fileName]);

  // Straight inside the tap: no await before share().
  const share = useCallback(() => {
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
  }, []);

  return { state, share, sheetFile: sheetOpen ? file.current : null, closeSheet };
}

export function ImageSheet({
  file,
  alt,
  label,
  width,
  height,
  onClose,
}: {
  file: File;
  alt: string;
  label: string;
  width: number;
  height: number;
  onClose: () => void;
}) {
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
      <div className="ct-sheet px-4" data-instant="" role="dialog" aria-modal="true" aria-label={label}>
        <span className="ct-sheet-handle" aria-hidden="true" />
        <p className="pt-3 pb-2 text-center text-sm text-ink-muted">Press and hold the image to save or share it</p>
        {url && <img src={url} alt={alt} width={width} height={height} className="mx-auto block h-auto w-full max-w-[400px] rounded-xl" />}
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
