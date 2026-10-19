# CLAUDE.md — Chestnut Table 51

This file is the single source of truth for this project. Read it fully at the start of every session.
If a request conflicts with this file, stop and ask before proceeding. When a decision here changes,
update this file in the same commit.

---

## 1. What we are building

**Chestnut Table 51** (home-screen label **CT51**) is a free, mobile-first web app that tracks a
daily home poker game played between friends with **play money** (shown as dollars).

- One **admin** (a shared password) runs each game: players, buy-ins, final stacks, saving.
- Everyone else is a **viewer**: no login, read-only, sees the season leaderboard, history and stats.
- Data lives in a single JSON file in this GitHub repo. The app is hosted on GitHub Pages.
- Total cost: $0. No servers, no databases, no paid services.

---

## 2. Non-negotiable rules

1. **Never commit, log, print, or hard-code the raw GitHub token.** Only the encrypted blob
   (`public/admin-key.json`) may be committed. The raw token exists only (a) in the owner's head/password
   manager and (b) in browser memory after admin login. Before every commit, check the diff for
   anything that looks like `github_pat_` or `ghp_`. If found, abort.
2. **Never store derived numbers in `data.json`.** No totals, balances, standings or champions. Everything
   is computed from raw games at read time.
3. **Every write to `data.json` must pass schema validation first.** Never upload a file that fails validation.
4. **The chip check is strict.** A game cannot be finished/saved unless total final stacks equal total
   buy-ins. No override, no "save anyway".
5. **Incognito games never affect season standings.** Not totals, not games-played counts, not tiebreaks.
6. **All domain logic lives in pure, unit-tested functions** (`src/domain/`). UI code never does money math.
7. **Prefer targeted edits over full-file rewrites.** Change only the lines a task needs.
8. **Work phase by phase** (section 12). Don't start the next phase until the current one's
   "done when" checks pass and the owner confirms.

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Routing | React Router with **HashRouter** (GitHub Pages has no SPA fallback) |
| Validation | zod |
| Charts | Recharts |
| PWA | vite-plugin-pwa (installable, offline app shell) |
| Tests | Vitest |
| Crypto | Web Crypto API (browser) and Node's `crypto.webcrypto` (setup script) |
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Storage | `data/data.json` in this repo, read and written via the GitHub REST API |

Node 22+ is required. No backend code, no other external services.

---

## 4. Repository layout

```
/
├─ CLAUDE.md
├─ data/
│  └─ data.json              # THE database (raw facts only)
├─ public/
│  ├─ admin-key.json         # encrypted token blob (safe to commit)
│  └─ icons/                 # PWA icons
├─ scripts/
│  └─ encrypt-token.mjs      # one-time: encrypts the GitHub token with the admin password
├─ src/
│  ├─ config.ts              # owner, repo, branch, data path
│  ├─ domain/                # PURE logic + types + zod schema (no React, no fetch)
│  │  ├─ types.ts
│  │  ├─ schema.ts
│  │  ├─ results.ts          # per-game results, chip check
│  │  ├─ standings.ts        # season standings, ranking, tiebreaks
│  │  ├─ migrations.ts
│  │  └─ *.test.ts
│  ├─ storage/               # the ONLY code that talks to GitHub
│  │  ├─ github.ts           # read/write data.json, list commits
│  │  ├─ auth.ts             # decrypt token, admin session (memory only)
│  │  └─ localGame.ts        # live-game autosave in localStorage
│  ├─ screens/               # one file per screen
│  ├─ components/
│  └─ main.tsx
└─ .github/workflows/deploy.yml
```

`src/config.ts`:
```ts
export const CONFIG = {
  owner: "sherurox",
  repo: "chestnut-table-51",   // must match the GitHub repo name and Vite `base`
  branch: "main",
  dataPath: "data/data.json",
  appName: "Chestnut Table 51",
  shortName: "CT51",
};
```
Vite `base` must be `/chestnut-table-51/` (the repo name) or assets will 404 on Pages.

---

## 5. Domain rules (the game)

### 5.1 Players
- Each player has a stable `id` (never reused) and a display `name` (unique, case-insensitive,
  compared after trimming leading/trailing whitespace).
- `type`: `"regular"` (season player) or `"guest"`.
- `status`: `"active"` or `"archived"`. Archived players are hidden from pickers but keep all history
  and still appear in any standings they earned.
- Players can be renamed (id unchanged), archived, unarchived.
- Promoting a guest sets `type` to `"regular"`. Their past games are not changed.

### 5.2 Seasons
- Exactly one season is `"active"` at any time (after the first season is created).
- No limit on number of games in a season.
- Everyone starts every season at **$0 net winnings**. Nothing carries over.
- **Start new season** (admin): closes the current season (`status: "closed"`, `endedOn` set) and creates
  a new active one. Blocked while a live game exists.
- A closed season's champion is computed, never stored: the #1 ranked player in its final standings.

### 5.3 Games
- `mode`: `"season"` or `"incognito"`.
- Each game belongs to the season that was active when it was played (`seasonId`), including incognito
  games (for grouping in history only).
- A game needs at least 2 players.
- Players in the active season who are absent from a game are unaffected by it.
- Players can be added to a game mid-game (late arrivals).
- A player who leaves early is handled normally: the admin enters their final stack. No special feature.
- Every player listed in a finished game must have at least one buy-in.

### 5.4 Buy-ins
- Any positive whole-dollar amount, any number of times, per player, per game.
- Preset buttons come from `settings.presetBuyIns` (default `[1000, 1500, 2000]`) plus a custom amount field.
- A player's first buy-in is their starting stack for that game. There is no separate starting-balance concept.

### 5.5 Guests
When a game includes any player with `type: "guest"`, the admin must choose before the game starts:
- **Add to season:** every guest in the game is promoted to `regular`, and the game is `mode: "season"`.
- **Keep incognito:** the game is forced to `mode: "incognito"`.

### 5.6 Chip check (strict)
`sum(all cashOuts.amount) === sum(all buyIns.amount)` for the game, and every player in the game has
exactly one cash-out (0 is allowed). If not, the game cannot be saved as finished. The check screen must
show:
- the exact gap ("Short by $1,500" / "Over by $500")
- a hint when the absolute gap equals any buy-in amount in that game ("Same as one $1,500 buy-in — missed rebuy?")
- a button that jumps back to the buy-in list to fix it

The game stays safely autosaved on the admin's phone until it passes.

### 5.7 Results and ranking
- **Game result** for a player = their final stack − the sum of their buy-ins in that game.
- **Season net winnings** for a player = the sum of their game results over games where
  `seasonId === season.id`, `mode === "season"`, `status === "finished"`.
- Displayed as signed dollars: `+$1,450`, `−$300`, `$0`. Values can be negative.
- **Ranking:** highest net winnings first. Tiebreak 1: more games played (finished season-mode
  games in that season only). Tiebreak 2: name A→Z.
- **No minimum games** to rank or to be champion.
- Leaderboard rows include every player with ≥1 season game in that season, plus active regulars with
  0 games (shown at $0).
- Because games are zero-sum, the sum of all season net winnings must equal $0. Use this as a test invariant.

### 5.8 Incognito
- A log only. It shows in game history (clearly labeled "Incognito") with each player's result.
- **No incognito leaderboard or standings.**
- Never counted in season totals, games-played counts, tiebreaks or charts.

### 5.9 Editing and deleting (admin)
- The admin can **edit or delete any game in any season**, active or closed.
- Editing a game in a **closed** season shows a confirmation first: "This season is closed. Editing will change
  its final standings and possibly its champion." Same for deleting.
- Editing a finished game reruns the chip check. It cannot be saved unless it passes.
- Editing allows: date, players, buy-ins, cash-outs, and mode (season ↔ incognito).
- Editing an incognito game that contains any `type: "guest"` player to `mode: "season"` must show
  the same guest choice as section 5.5 (promote the guests, or keep the game incognito). A season-mode
  game can never contain a guest-type player (section 6.2). This UI is built in Phase 5; Phase 1 only
  needs the validation rule and its test.
- **Delete is soft:** `status: "deleted"`. Deleted games are excluded from everything and shown in a
  "Deleted games" bin where the admin can restore them. (Git history is the permanent backup.)
- Every edit, delete and restore is its own commit with a descriptive message (section 8.4).
- Games that were edited after finishing show an "Edited" badge (`editedAt` is set).

---

## 6. Data format — `data/data.json`

### 6.1 Types
```ts
type ID = string; // short random id, e.g. nanoid(8)

interface Data {
  version: 1;
  settings: { presetBuyIns: number[] };
  players: Player[];
  seasons: Season[];
  games: Game[];
  liveGame: LiveMarker | null;
}

interface Player {
  id: ID; name: string;
  type: "regular" | "guest";
  status: "active" | "archived";
  createdAt: string;            // ISO datetime
}

interface Season {
  id: ID; name: string;         // e.g. "Season 1"
  status: "active" | "closed";
  startedOn: string;            // ISO date
  endedOn?: string;             // ISO date, set when closed
}

interface Game {
  id: ID; seasonId: ID;
  date: string;                 // ISO date the game was played
  mode: "season" | "incognito";
  status: "finished" | "deleted";
  players: ID[];                // everyone who played
  buyIns: { player: ID; amount: number; at: string }[];  // amount: positive integer dollars
  cashOuts: { player: ID; amount: number }[];            // amount: integer ≥ 0, one per player
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
}

interface LiveMarker {
  gameId: ID;
  startedAt: string;            // ISO datetime
}
```

Only finished (or deleted) games are written to `data.json`. A game in progress lives on the admin's
phone (section 9); `liveGame` is only a marker that one is running.

### 6.2 Validation (zod, in `schema.ts`)
Reject the file if any of these fail:
- ids unique within each collection (players, seasons, games); player names unique
  (case-insensitive, after trimming whitespace)
- every `seasonId` / player reference exists
- at most one season `"active"`
- every finished game: ≥2 players, every player has exactly one cash-out, every player has at
  least one buy-in, every buy-in/cash-out player is in `players`, chip check passes
- buy-in amounts are integers with `1 ≤ amount ≤ 10,000,000`; cash-out amounts are integers with
  `0 ≤ amount ≤ 10,000,000`
- a `mode: "season"` finished game contains no player with `type: "guest"`
- `version` is a known version (run migrations first)

### 6.3 Initial file
```json
{
  "version": 1,
  "settings": { "presetBuyIns": [1000, 1500, 2000] },
  "players": [],
  "seasons": [],
  "games": [],
  "liveGame": null
}
```
On first admin login with no seasons, prompt to create "Season 1".

### 6.4 Migrations
`migrations.ts` exports `migrate(raw: unknown): Data`, which upgrades any older `version` step by step.
Any future schema change bumps `version` and adds a migration plus tests.

---

## 7. Access model and security

### 7.1 Viewers
No login. Can see everything except admin screens. Cannot write anything.

### 7.2 Admin login (encrypted token)
- The owner creates a **fine-grained GitHub personal access token** scoped to **only this repo** with
  **Contents: Read and write** and nothing else.
- `scripts/encrypt-token.mjs` (run locally once, by the owner) asks for the token and the admin passphrase via
  **hidden terminal input** (never CLI arguments, never env files), then writes `public/admin-key.json`:
  ```json
  {
    "v": 1,
    "kdf": "PBKDF2-SHA256",
    "iterations": 600000,
    "salt": "<base64, 16 random bytes>",
    "iv": "<base64, 12 random bytes>",
    "ciphertext": "<base64, AES-256-GCM>",
    "tokenExpiresOn": "YYYY-MM-DD"
  }
  ```
  The script also asks for the token's expiry date (plain text, not secret) and runs a decrypt round-trip to verify.
- In the app, admin login derives the key from the entered password with the same parameters and decrypts.
  Wrong password → AES-GCM fails → show "Wrong password". No hints.
- The decrypted token is kept **in memory only** (a module-level variable). Never in localStorage,
  sessionStorage, cookies, URLs or logs. Reloading the page logs the admin out (the live game survives; see section 9).
- After login, verify the token with one authenticated API call. On 401, show
  "Admin key is invalid or expired. The owner needs to create a new token."
- **Changing the password or replacing the token** = rerun the script and commit the new `admin-key.json`.
- The passphrase should be 4–5 random words. The script refuses passphrases shorter than 16 characters.

### 7.3 Token expiry warning
Admin screens show "Admin key expires in N days" when N ≤ 14, and a blocking message after expiry.

---

## 8. Storage via the GitHub API (`src/storage/github.ts`)

This module is the only code that touches the network.

### 8.1 Reading (everyone)
`GET https://api.github.com/repos/{owner}/{repo}/contents/{dataPath}?ref={branch}` with header
`Accept: application/vnd.github.raw+json` (returns the raw file). Viewers call it unauthenticated
(about 60 requests/hour per IP); admins call it authenticated.
- Fetch on app open and on manual refresh only. **Never poll.**
- Cache the last good copy in localStorage so the app opens instantly and works offline (read-only).
- On a 403 rate limit, show the cached copy plus "GitHub is busy. Try refreshing in a few minutes."
- Show "Last updated" using the latest commit time for the file. That lookup is best-effort: if it
  fails or is rate-limited, still show the data, with "Last updated: unknown".
- The PWA service worker precaches the built app shell only (JS/CSS/HTML/icons). It must never add
  runtime caching for `api.github.com` or any data endpoint — the localStorage cache above is the
  single source of offline/cached data.

### 8.2 Writing (admin only)
1. `GET` the contents endpoint (JSON form) to get the current `sha` and content.
2. Apply the change to the freshly fetched data (never to stale data).
3. Run `migrate` + validation. If it fails, abort and show the error.
4. `PUT` the contents endpoint with base64 content, `sha`, `branch`, and the commit message.
5. On 409 / 422 (sha mismatch: someone else saved), go back to step 1 and reapply. Retry up to 3 times,
   then show "Couldn't save — someone else is editing. Try again."

Express every change as a function `(data: Data) => Data` so it can be reapplied on retry.

### 8.3 Edit history
`GET /repos/{owner}/{repo}/commits?path={dataPath}&per_page=50` gives the History screen
(message + time). Each entry links to the commit on GitHub.

### 8.4 Commit messages
All prefixed `Admin:` and human-readable, e.g.:
- `Admin: finished game 2026-10-24 (Season 1, 5 players)`
- `Admin: finished incognito game 2026-10-24 (4 players)`
- `Admin: edited game 2026-10-20 (Season 1)`
- `Admin: deleted game 2026-10-20 (Season 1)` / `Admin: restored game …`
- `Admin: started Season 2 (closed Season 1)`
- `Admin: added player Amit` / `Admin: promoted guest Rohan to regular` / `Admin: archived player …`

### 8.5 Deploys must ignore data commits
`.github/workflows/deploy.yml` builds and deploys to Pages on pushes to `main`, with
`paths-ignore: ["data/**"]`. Data saves must not trigger a rebuild; the app reads data live from the API.

---

## 9. Live game flow (admin)

1. **Start game:** pick players (search + "Same players as last game"), pick mode. If any guest is selected,
   force the guest choice (section 5.5). Date defaults to today.
2. On start: create the game locally, save it to localStorage (`ct51.liveGame`), and write
   `liveGame` marker to `data.json` (one commit: `Admin: started live game`). If the marker write fails
   because the phone is offline, continue anyway and retry later.
3. **If a live marker already exists** when an admin opens Start game: show "A game is already in progress
   (started 9:04 PM)". Options: resume it on this phone if it is local, or "Clear stuck game" (confirm, commit).
4. **During play:** one row per player with preset buy-in buttons, a custom amount, and a per-player
   total. Table total at the top. **Undo last action.** Add a late player. Every change autosaves to
   localStorage immediately. No network needed.
5. **End game:** enter every player's final stack, then the chip check (section 5.6). When it passes:
   write the finished game + clear `liveGame` in **one** commit, then clear localStorage.
6. **Offline:** if the save can't reach GitHub, keep the finished game queued in localStorage with a visible
   "Not synced" badge, and retry on reconnect / app open / tap. Never drop it.
7. After a successful save, offer **Share results**: copy plain text for the group chat, e.g.
   ```
   CT51 · Season 1 · Fri 24 Oct
   Shreyas +$1,100 · Rohan −$100 · Amit −$1,000
   Season leader: Shreyas +$3,450
   ```

---

## 10. Screens

Use HashRouter paths. Mobile-first, one column, bottom navigation for viewer tabs.

**Everyone**
| Route | Screen |
|---|---|
| `#/` | **Leaderboard**: active season standings (rank, name, net, games played, last result). "You" highlight. Last updated + refresh. |
| `#/games` | **Game history**: newest first, season games and incognito games (labeled) with per-player results. Filter by season. "Edited" badges. |
| `#/games/:id` | **Game detail**: every buy-in, final stacks, results. |
| `#/players/:id` | **Player page**: net-winnings-over-time chart for the selected season (season games only), game list, best/worst game. |
| `#/seasons` | **Seasons**: all seasons; closed ones show champion and final standings (tap through). |
| `#/history` | **Edit history**: commit list. |
| `#/me` | **Who are you?**: pick your player; stored in localStorage `ct51.me`; used only for highlighting. |

**Admin** (after login; a lock icon in the header opens login)
| Route | Screen |
|---|---|
| `#/admin` | Admin home: Start/Resume game, Not-synced queue, token expiry notice, logout. |
| `#/admin/live` | Live game. |
| `#/admin/end` | Final stacks + chip check + save. |
| `#/admin/games/:id/edit` | Edit any game (closed-season warning). Delete from here. |
| `#/admin/deleted` | Deleted games bin + restore. |
| `#/admin/players` | Add, rename, archive/unarchive, promote guest. |
| `#/admin/seasons` | Start new season, rename season. |
| `#/admin/settings` | Preset buy-in amounts. |

---

## 11. UI and UX rules

- Mobile-first; designed for a 360–430px wide phone, held one-handed, at night.
- **Dark theme by default**, with a light theme toggle. Card-table green + warm chestnut accent.
- Tap targets ≥ 48px. Buy-in buttons are large.
- Money: whole dollars with separators. Positive green `+$1,100`, negative red `−$300` (true minus sign),
  zero neutral. Never rely on color alone: always show the sign.
- Footer on every screen: "Play money only — no real gambling."
- Confirm dialogs for: end game, delete, restore, editing a closed season, start new season, clear stuck game.
- Empty states for no seasons, no games, no players.
- PWA manifest: `name` "Chestnut Table 51", `short_name` "CT51", standalone display, theme color, icons
  (192px, 512px, maskable). iOS: apple-touch-icon and an "Add to Home Screen" hint for Safari users.
- Accessible: semantic HTML, labels on inputs, visible focus states, sufficient contrast in both themes.

---

## 12. Build phases

Each phase: plan first, get approval, implement, run tests, then stop and report against "done when".

### Phase 1 — Domain logic + tests
Types, zod schema, migrations, `results.ts`, `standings.ts`. No UI.
Dependencies for this phase only: `typescript`, `vitest`, `zod` (dev deps where appropriate). No
`vite`/`react`/Tailwind/etc. yet — those arrive in Phase 2.
The property test (zero-sum invariant) is hand-rolled with a seeded PRNG (fixed default seed,
printed on failure) — no `fast-check` or other new dependency.
**Done when** `npm test` passes, covering at least:
- game results; chip check pass/fail, including gap amount and "matches a buy-in" hint
- multiple rebuys; custom amounts; a cash-out of $0
- season totals exclude incognito, deleted, and other seasons' games
- absent players unaffected; negative totals; tiebreaks (games played, then name)
- guest promoted mid-season: earlier incognito games still excluded, later season games counted
- editing a game in a closed season changes its computed champion
- invariant: sum of season net winnings is $0 (property test over random valid games)
- validation rejects every rule in section 6.2
- archived player with season games still appears in standings; archived player with 0 games does not
- a season with no games has no champion (`champion()` returns `null`)

### Phase 2 — Viewer app, deployed
Scaffold (Vite, Tailwind, router, PWA), `github.ts` read path with cache, all viewer screens, deploy workflow.
Seed `data/data.json` with realistic sample data (clearly fake, removed before real use).
**Done when** the site loads at `https://sherurox.github.io/chestnut-table-51/`, installs to an
iPhone and an Android home screen as "CT51", and shows correct standings for the sample data.

### Phase 3 — Admin login + saving
`scripts/encrypt-token.mjs`, `auth.ts`, the write path with sha retry, commit messages, token expiry
notice, players and settings screens (first real writes).
**Done when** a wrong password fails cleanly, a right one can add a player and the commit appears on
GitHub with the right message, viewers see the change after refresh, and a forced sha conflict
retries successfully. The raw token appears nowhere in the repo or browser storage.

### Phase 4 — Live game
Start game (guest choice, "same players as last game"), live screen, undo, late players, autosave,
end game + strict chip check, single-commit save, offline queue, live marker, share results.
**Done when** a full fake game can be run in airplane mode, survives closing and reopening the app
mid-game, and syncs correctly once back online.

### Phase 5 — Admin tools
Edit and delete any game in any season (closed-season warning, rerun chip check), deleted bin + restore,
start new season, rename season, edit history screen, "Edited" badges.
**Done when** editing/deleting a game in a closed season correctly changes its final standings and
champion, and restore brings a game back exactly.

### Phase 6 — Polish
Theme toggle, icons, iOS install hint, empty states, accessibility pass, loading and error states,
remove sample data and reset `data.json` to the initial file (section 6.3).
**Done when** the owner signs off after a real game night.

---

## 13. Working agreements for Claude Code

- Start each session by reading this file and summarizing which phase we are in.
- Plan before coding any phase or any change touching `domain/` or `storage/`. Wait for approval.
- Small, focused commits with clear messages. Don't mix refactors with features.
- Targeted edits; don't rewrite whole files to change a few lines.
- Run `npm test` and `npm run build` before declaring anything done.
- Never edit `data/data.json` by hand in a real season (Phase 6 onward). Changes go through the app.
- Don't add dependencies beyond section 3 without asking.
- If a rule here seems wrong or incomplete, say so instead of silently working around it.
