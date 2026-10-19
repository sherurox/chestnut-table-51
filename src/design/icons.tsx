// Small stroke icons in currentColor (emoji render differently on every phone).

const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function IconRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg {...base} className={spinning ? "ct-spin" : undefined} aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg {...base} width={18} height={18} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
