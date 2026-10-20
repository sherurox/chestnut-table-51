import { SANDBOX_BANNER_TEXT } from "../storage/sandbox.js";

// Dev server with SANDBOX=1 only (CLAUDE.md §8.6): a permanent striped bar on every screen. Inline styles on
// purpose: deliberately off-brand, the same in both themes, and nothing of it ships in production CSS.
export function SandboxBanner() {
  if (!(import.meta.env.DEV && __CT51_SANDBOX__)) return null;
  return (
    <div
      role="status"
      style={{
        background: "repeating-linear-gradient(-45deg, #ffd400 0 14px, #c8102e 14px 28px)",
        padding: "6px 16px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          background: "#111",
          color: "#ffd400",
          borderRadius: 6,
          display: "inline-block",
          fontWeight: 800,
          letterSpacing: "0.04em",
          padding: "2px 10px",
          fontSize: 14,
        }}
      >
        {SANDBOX_BANNER_TEXT}
      </span>
    </div>
  );
}
