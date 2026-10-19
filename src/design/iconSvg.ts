// The brand chip and app icon as plain SVG strings: one source for the in-app chip (ChipBadge,
// AppIconSvg) and for scripts/render-icons.mjs, which rasterises the PWA icons from exactly this art.
// Static markup only (no user input), so it is safe to inject.

const SPOTS = [0, 45, 90, 135, 180, 225, 270, 315];

// The chip, drawn on a 512×512 canvas centred at 256 with radius 196 (inside the 80% maskable safe zone).
// detail=false (small sizes) drops the dotted inlay and spade and sets the "51" larger.
function chipArt(id: string, detail: boolean): string {
  const spots = SPOTS.map(
    (deg) => `<rect x="236" y="62" width="40" height="44" rx="6" fill="#5b2c19" transform="rotate(${deg} 256 256)"/>`,
  ).join("");
  return [
    `<defs>`,
    `<radialGradient id="${id}-wood" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#6e3620"/><stop offset="1" stop-color="#2b150d"/></radialGradient>`,
    `<linearGradient id="${id}-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2a0"/><stop offset="0.5" stop-color="#d6b35e"/><stop offset="1" stop-color="#8f6f2c"/></linearGradient>`,
    `</defs>`,
    `<circle cx="256" cy="256" r="196" fill="url(#${id}-brass)"/>`,
    spots,
    `<circle cx="256" cy="256" r="146" fill="url(#${id}-wood)" stroke="#f6e2a0" stroke-width="6"/>`,
    detail
      ? `<circle cx="256" cy="256" r="126" fill="none" stroke="#d6b35e" stroke-width="2" stroke-dasharray="4 10" opacity="0.8"/>`
      : "",
    `<text x="256" y="${detail ? 300 : 310}" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" font-weight="700" font-size="${detail ? 148 : 176}" fill="url(#${id}-brass)" style="font-variant-numeric: lining-nums">51</text>`,
    detail ? `<text x="256" y="178" text-anchor="middle" font-size="34" fill="#f6e2a0" font-family="system-ui, sans-serif">♠</text>` : "",
  ].join("");
}

// The chip alone, cropped to the chip (for headers, wordmarks, the splash). Below 44px it drops detail.
export function chipSvg(size: number, id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="56 56 400 400" aria-hidden="true">${chipArt(id, size >= 44)}</svg>`;
}

// The app icon: the chip on felt. maskable = full-bleed square (Android masks it, iOS rounds it itself);
// otherwise rounded corners on a transparent background.
export function appIconSvg(size: number, id: string, maskable: boolean): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">`,
    `<defs><radialGradient id="${id}-felt" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#1f5a42"/><stop offset="1" stop-color="#0b1d16"/></radialGradient></defs>`,
    `<rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#${id}-felt)"/>`,
    chipArt(id, true),
    `</svg>`,
  ].join("");
}
