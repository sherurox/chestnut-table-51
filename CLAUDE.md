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
   anything that looks like `github_pat_` or `ghp_`. If found, abort. `src/secretScan.test.ts` (every
   `npm test`) and `npm run check:bundle` (dist/) also fail on token-shaped strings.
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
| Fonts | `@fontsource/playfair-display` + `@fontsource/inter` + `@fontsource/cinzel` (700 only) (self-hosted, Latin subset; section 11.1) |
| PWA | vite-plugin-pwa (installable, offline app shell) |
| Tests | Vitest |
| Dev https | `@vitejs/plugin-basic-ssl` (dev server only, self-signed cert: Web Crypto/admin login needs https on a phone over the LAN). `DEV_HTTP=1` skips it and serves plain http on `localhost:5180` only, for desktop review. `SANDBOX=1` moves them to 5174 / 5181 (§8.6) |
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
│  ├─ data.json              # THE database (raw facts only)
│  └─ sandbox*.json/.txt     # sandbox mode only, gitignored (§8.6)
├─ public/
│  ├─ admin-key.json         # encrypted token blob (safe to commit)
│  └─ icons/                 # PWA icons
├─ scripts/
│  ├─ encrypt-token.mjs      # one-time: encrypts the GitHub token with the admin password
│  └─ check-bundle.mjs       # post-build: no admin/dev-only code in the viewer bundle
├─ src/
│  ├─ config.ts              # owner, repo, branch, data path
│  ├─ domain/                # PURE logic + types + zod schema (no React, no fetch)
│  │  ├─ types.ts
│  │  ├─ schema.ts
│  │  ├─ results.ts          # per-game results, chip check
│  │  ├─ standings.ts        # season standings, ranking, tiebreaks
│  │  ├─ liveGame.ts         # live game action log, undo, guest choice, end check, finish/marker changes
│  │  ├─ gameEdits.ts        # edit/delete/restore finished games: draft, edit check, changes (§5.9)
│  │  ├─ seasonLimit.ts      # 10-game season limit: count, full, end date (§5.2)
│  │  ├─ chips.ts / chipBox.ts  # chip split + calculator; live-game box replay and per-colour hint (§9)
│  │  ├─ seasonShow.ts      # season podium + player trophies (§12, Season show)
│  │  ├─ migrations.ts
│  │  └─ *.test.ts
│  ├─ devserver/             # sandboxServer.ts: Node-only sandbox middleware for vite.config.ts (§8.6)
│  ├─ storage/               # the ONLY code that touches the network
│  │  ├─ github.ts           # read data.json (viewer + admin), list commits
│  │  ├─ githubWrite.ts      # admin write path (admin chunk only, see §8.2)
│  │  ├─ adminKey.ts         # parse + decrypt admin-key.json (no network)
│  │  ├─ auth.ts             # admin login, session (memory only)
│  │  ├─ localGame.ts        # live-game autosave + "Not synced" queue in localStorage (no network)
│  │  ├─ localKeys.ts        # localStorage keys only; safe for the viewer shell (badge, chunk warm-up)
│  │  ├─ sandbox.ts          # sandbox-mode requests to the dev server (dev only, §8.6)
│  │  └─ sync.ts             # pushes the queue + a pending live marker (admin chunk only)
│  ├─ admin/                 # admin screens: lazy-loaded chunk, never shipped to viewers
│  ├─ screens/               # one file per viewer screen (Wrapped.tsx: lazy chunk, picker + story)
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
- At most one season is `"active"` at a time. After **End season** there may be none until a new one
  starts; while there is none, no game of either mode can start (every game needs a `seasonId`), and the
  Home / Admin game buttons say "Start a new season first" and link to `#/admin/seasons`. Home then shows
  the ended season's champion and final standings.
- **10-game limit** (`MAX_SEASON_GAMES` in `src/config.ts`, logic in `domain/seasonLimit.ts`). The count
  is the season's finished season-mode games; incognito and deleted games never count. Progress shows as
  "Game 8 of 10" in the leaderboard header and the season-stats panel.
  - Starting a season game is blocked once the active season has 10 (in `startGame` and the UI: Home's
    button, Start's season toggle, the guest "add to season" choice). Incognito is still allowed while the
    season is active.
  - **Finishing the game that takes an active season from 9 to 10 closes it in the same commit**
    (`status: "closed"`, `endedOn` = the latest date among its season games, so a backdated game 10 never
    leaves a later game outside the season). It doesn't start the next season. The end screen's confirm
    says "This is game 10 of 10. Saving ends Season 1 and crowns <champion> (<net>)", the champion
    computed with this game in.
  - A queued game (offline, or another phone) is always saved, even into a season that is already full
    or closed: it never closes or reopens anything. A closed season is never reopened.
  - Edits and restores never auto-close: an incognito → season edit is blocked when the season already
    has 10, and a restore is blocked if it would go past 10; either may bring it to exactly 10. Deleting
    never reopens a season.
  - An active season with 10 or more (by an edit or restore) isn't auto-closed: Home's season button reads
    "Season 1 is complete: end it to crown the champion" (incognito still available).
  - After the auto-close there is no active season, so (as above) no game of either mode: Home's single
    button reads "Season 1 is complete: start Season 2" and opens `#/admin/seasons?start=1`, with Start
    new season pre-filled (next name, today) and its confirm already open. Admin home's "Start a new
    season first" button opens the same path whenever no season is active.
- Everyone starts every season at **$0 net winnings**. Nothing carries over.
- **End season** (admin): closes the active season (`status: "closed"`, `endedOn` = today, local date)
  without starting a new one.
- **Start new season** (admin): if a season is active, closes it (`endedOn` = today) and creates the new
  one in **one** commit; otherwise just creates one. Default name "Season N+1" (editable, unique
  case-insensitively), `startedOn` today (editable: not in the future, not before the latest season's
  start), fresh random id.
- Both are blocked while a live marker exists, a game is running on this phone, or this phone has
  unsynced games. Each confirm names the champion who'll be crowned (the current #1) and says it can't be
  undone from the app. **Rename season** works on any season (name only).
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

**Phase 5 decisions (owner-approved):**
- Edit is reached from an "Edit game" button on Game detail, shown only on a phone with admin state
  (`isAdminDevice()`, no admin code in the viewer shell); the route asks for login. Editable: date (must
  stay inside its season: start date to end date, or today while active), players (add active players,
  remove anyone), every buy-in (change, remove, add), every final stack, and mode. The strict chip check
  reruns live with the end screen's panel (`ChipCheckPanel`); Save is disabled until it passes and
  something changed. Any edit that leaves guests in a season game asks the §5.5 choice; promotions happen
  in the edit commit.
- The Save confirm lists every change (date, mode, players added/removed, each buy-in and final stack
  old → new, guests promoted). Delete and restore confirms name the game (date, season, players, winner).
  In a closed season the editor opens behind the warning above (naming the current champion), and every
  confirm names the champion now versus after the change.
- Edit, delete and restore are blocked by the same rule as the season actions (a game on this phone, a
  live marker, or unsynced games); the changes also refuse a live marker in the fresh data.
- Stale guard: an edit applies only if the game on GitHub still equals the one the admin opened.
  Duplicate guard: a retry that finds the edit (or delete/restore) already applied commits nothing.
- Restore removes `deletedAt` and sets `finished`: the game is deep-equal to before deletion. A deleted
  game's URL shows "Game not found" to everyone; the bin (`#/admin/deleted`, linked from Admin home)
  shows its results.
- Celebrations never fire for edits, deletes or restores: Home's new-game signal (rank pulse + confetti)
  compares the latest season game's `createdAt` with a forward-only watermark (`ct51.seenGamesUpTo`),
  not game ids or dates. The old `ct51.lastSeenGame` id is migrated once and removed.

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

`liveGame.gameId` is deliberately **not** checked against `games`: a game in progress lives on the admin's
phone and is only written when finished, so the marker normally points at a game not in the file.

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
- If `public/admin-key.json` is missing or malformed, the admin screen shows "Admin not set up yet. The owner
  needs to run the setup script." Never crash.
- Never `console.log` request objects, headers, or anything containing the token. Error messages shown or
  thrown must never include the token (covered by a test).
- **Changing the password or replacing the token** = rerun the script and commit the new `admin-key.json`.
- The passphrase should be 4–5 random words. The script refuses passphrases shorter than 16 characters.
  The passphrase is trimmed before key derivation, in both the script and the app (phone keyboards add
  trailing spaces). Run the script in PowerShell/Windows Terminal; it refuses non-TTY input and any arguments.

### 7.3 Token expiry warning
Admin screens show "Admin key expires in N days" when N ≤ 14, and a blocking message after expiry.

---

## 8. Storage via the GitHub API (`src/storage/github.ts`)

`src/storage/` is the only code that touches the network. Reads live in `github.ts`; the admin write
path lives in `githubWrite.ts` so it ships only in the lazy-loaded admin chunk (viewers never download
admin code: `#/admin/*` routes use `React.lazy` + `Suspense`).

### 8.1 Reading (everyone)
`GET https://api.github.com/repos/{owner}/{repo}/contents/{dataPath}?ref={branch}` with header
`Accept: application/vnd.github.raw+json` (returns the raw file). Viewers call it unauthenticated
(about 60 requests/hour per IP); admins call it authenticated.
- **When an admin is logged in, always read via the authenticated contents API**, including in
  `npm run dev` (the dev-mode local-file read is for logged-out viewing only). After a successful save,
  update the UI from the data that was just written.
- Fetch on app open and on manual refresh only. **Never poll.**
- Cache the last good copy in localStorage so the app opens instantly and works offline (read-only).
- On a 403 rate limit, show the cached copy plus "GitHub is busy. Try refreshing in a few minutes."
- Show "Last updated" using the latest commit time for the file. That lookup is best-effort: if it
  fails or is rate-limited, still show the data, with "Last updated: unknown".
- The PWA service worker precaches the built app shell only (JS/CSS/HTML/icons). It must never add
  runtime caching for `api.github.com` or any data endpoint — the localStorage cache above is the
  single source of offline/cached data.
- The admin chunk (`AdminRoutes-*.js`) is excluded from the precache (`globIgnores`) so viewers never
  download it. For offline games it is cached at **runtime** instead: one Workbox rule, `CacheFirst`
  (cache `ct51-admin`, max 3 entries, 200s only), matching only that chunk, so it is cached once an admin
  route loads it. On a phone with admin state (`ct51.liveGame`, `ct51.syncQueue` or the non-secret
  `ct51.adminDevice` flag set at login), the app fetches the chunk once on open while online, so the
  current version is cached even right after an app update. Viewers never set these keys.
  `npm run check:bundle` fails if the chunk is precached, the runtime rule is missing, the service worker
  mentions `api.github.com`/data, or the admin chunk imports a chunk that isn't precached.
- **Updates after a deploy** (`src/lib/appUpdate.ts`; the app registers the service worker itself,
  `injectRegister: false`, with explicit `skipWaiting` + `clientsClaim`):
  - A lazy chunk that fails to load (a stale page asking for a chunk the deploy deleted, caught via
    `vite:preloadError` and the `lazy()` catch) triggers **one** reload into the new version: it first asks
    the service worker to update and waits for it to take over, so the reload doesn't get the old
    precached `index.html`. A `sessionStorage` flag allows one automatic reload per tab session (cleared
    once the chunk loads), so it can't loop. No auto-reload offline. Live games and the queue are in
    localStorage, so a reload never loses them.
  - Every route has an `errorElement`: "CT51 was updated — tap to reload" (chunk error), "You're offline
    and this part of the app isn't cached yet." (offline), or a generic message. Never React Router's
    developer page.
  - When a new version takes control: viewer screens reload automatically. **Any `#/admin` screen** shows
    "Update ready — reload when the game ends." instead: a reload mid-game is never automatic, and on other
    admin screens it would log the admin out (memory-only token, e.g. while adding a late player).
  - The app checks for a new version whenever it comes back to the foreground.

### 8.2 Writing (admin only)
1. `GET` the contents endpoint (JSON form) to get the current `sha` and content.
2. Apply the change to the freshly fetched data (never to stale data).
3. Run `migrate` + validation. If it fails, abort and show the error.
4. `PUT` the contents endpoint with base64 content, `sha`, `branch`, and the commit message.
5. On **409** (sha mismatch: someone else saved), go back to step 1 and reapply.
   On **422**, refetch and compare the sha: if it changed, treat it as a conflict and reapply; if it is
   unchanged, it is a real error, so stop and show GitHub's error message.
   Retry conflicts up to 3 times, then show "Couldn't save — someone else is editing. Try again."
   In `npm run dev` only (`import.meta.env.DEV`), `?forceConflict=1` sends a stale sha on the first PUT
   to exercise this path; a test proves it is absent from the production bundle.

Express every change as a function `(data: Data) => Data` so it can be reapplied on retry.

### 8.3 Edit history
`GET /repos/{owner}/{repo}/commits?path={dataPath}&since={HISTORY_SINCE}&per_page=50` gives the History
screen (the message's **first line only**, never its body or trailers like `Co-Authored-By`, + time). Each entry links to the commit on GitHub. `HISTORY_SINCE` (`src/config.ts`) is the
timestamp of the test-data reset commit (2026-10-20), so older test commits stay in git but not on screen.

### 8.4 Commit messages
All prefixed `Admin:` and human-readable, e.g.:
- `Admin: finished game 2026-10-24 (Season 1, 5 players)`
- `Admin: finished incognito game 2026-10-24 (4 players)`
- `Admin: edited game 2026-10-20 (Season 1)`
- `Admin: deleted game 2026-10-20 (Season 1)` / `Admin: restored game …`
- `Admin: edited game 2026-10-19 (Season 1; promoted guest Rohan)` (uses the date after the edit)
- `Admin: started Season 2 (closed Season 1)` / `Admin: started Season 2` (no season was active)
- `Admin: ended Season 1` / `Admin: renamed season Season 1 to Diwali Cup`
- `Admin: added player Amit` / `Admin: promoted guest Rohan to regular` / `Admin: archived player …`
- `Admin: started live game` / `Admin: cleared stuck live game` / `Admin: discarded live game`
- `Admin: finished game 2026-10-24 (Season 1, 5 players; promoted guest Rohan)` (guests promoted in the
  same commit, §9)
- `Admin: finished game 2026-10-26 (Season 1, 5 players); Season 1 complete` (game 10 closed the season,
  §5.2; built from each save attempt's fresh data, so a retry after another phone filled the season first
  drops it)

### 8.5 Deploys must ignore data commits
`.github/workflows/deploy.yml` builds and deploys to Pages on pushes to `main`, with
`paths-ignore: ["data/**"]`. Data saves must not trigger a rebuild; the app reads data live from the API.

### 8.6 Sandbox mode (dev server only)
For developing and reviewing admin flows without touching the real data. Started from PowerShell:
```
$env:SANDBOX='1'; npx vite --host                  # https on 5174, for a phone on the LAN
$env:SANDBOX='1'; $env:DEV_HTTP='1'; npx vite      # http://localhost:5181, desktop review
```
- Data comes from `data/sandbox.json`, seeded once from `data/data.json` (delete it to reseed). Every write
  goes to the dev middleware (`src/devserver/sandboxServer.ts`, `/__sandbox__/*`) instead of the GitHub API,
  through the same change functions, `migrate` + validation and sha/409 retry loop (`saveWith` in
  `githubWrite.ts`); the middleware revalidates with the app's own `migrate` and refuses invalid data.
  Saves are listed in `data/sandbox-history.json` (the History screen in sandbox mode).
- Login uses a throwaway key, `data/sandbox-admin-key.json`, encrypting a dummy token (never a GitHub
  token), with a generated passphrase in `data/sandbox-admin-pass.txt`. The GitHub verify call is skipped
  and the dummy token is never sent anywhere. `public/admin-key.json` is not used. Only the localhost
  review server serves the passphrase at `/__sandbox__/test-passphrase`.
- All `data/sandbox*` files are gitignored. A permanent "SANDBOX — not real data" banner shows on every screen.
- Its own ports (5174 / 5181; the normal dev servers are 5173 / 5180, all `strictPort`) give it separate
  browser storage, so sandbox games never sit in a real queue. A sandbox browser is marked
  (`ct51.sandboxDevice`) and a normal dev server refuses to sync its queue.
- Impossible in production: `__CT51_SANDBOX__` is a compile-time constant that is only true when serving
  with `SANDBOX=1`, and `npm run check:bundle` fails if any sandbox code, endpoint, key, passphrase route or
  the dummy token reaches `dist/`.

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
6. **Login rule:** *starting* a game requires admin login. Only continuing an already-started local game
   after a reload may run without login (buy-ins, undo, final stacks, chip check). Syncing it needs login.
7. **Offline:** if the save can't reach GitHub, keep the finished game queued in localStorage with a visible
   "Not synced" badge, and retry on reconnect / app open / tap. Never drop it.
8. After a successful save, offer **Share results**: copy plain text for the group chat, e.g.
   ```
   CT51 · Season 1 · Fri 24 Oct
   Shreyas +$1,100 · Rohan −$100 · Amit −$1,000
   Season leader: Shreyas +$3,450
   ```
   Incognito games use `CT51 · Incognito · …` and have no season-leader line. If the clipboard is blocked,
   show the text in a selectable box.
   Next to it, **Share card** shares the same game as a results-card image (§12, Results card + sounds);
   the copy text above is unchanged.

**Phase 4 decisions (owner-approved):**
- **Offline Save (answer 1):** without login the admin can enter stacks, pass the strict chip check, and
  Save. Save moves the game from `ct51.liveGame` into the `ct51.syncQueue` ("Not synced"); the commit
  happens once online and logged in. Sync runs on login, opening Admin home, the `online` event, and
  "Sync now". A queued game is removed only after GitHub confirms it.
- **Duplicate guard:** the finish change returns the data unchanged if the game id already exists, and
  the write path skips the PUT when a change returns the same object. A retry after a save whose
  response was lost makes no second commit.
- **New players (answer 2):** the live game only uses existing players. An online admin can leave the
  live screen for `#/admin/players`, add someone, and come back; the game stays on the phone and the
  new player appears in the late-player picker without a reload.
- **Guest promotion (answer 3):** "Add to season" promotes guests in the finish commit, not at start.
  A late guest joining a season game asks the same choice ("promote at save" or make the whole game
  incognito). An abandoned game promotes nobody.
- **Clear stuck game (answer 4):** offered on Start only when the marker doesn't match a game on this
  phone. For the phone's own game, "Discard this game" on the live screen (confirm twice) clears the
  local game and attempts to clear the marker; if that write fails, the next Start shows
  "Clear stuck game".
- A player can be removed from a live game only while they have no buy-ins (picked by mistake).
- The game date is the phone's **local** date at start (never UTC), editable on Start; a game past
  midnight keeps its start date.
- **Chip mode (Table tools step E, owner-approved 2026-10-24).** A per-device setting on More
  (`ct51.chipMode`, default On; Off stores `"off"`). Off hides all of the below and gives the plain dollar
  flow (a snapshot test proves the live and end screens are unchanged). Nothing here touches `data.json`,
  the strict chip check or the save path.
  - **Box tracking is derived, never stored** (`domain/chipBox.ts`): the local game's buy-ins are replayed
    in order, each through `chipSplit(amount, 1, box)` starting from `CHIP_SET`, giving the chips handed out
    and left in the box. Undo, late and removed players need nothing special. A buy-in the box can't make
    is still recorded (never blocked), hands out nothing ("not tracked") and leaves the box as it was.
  - Live screen: a "Box: 60 white · 10 red · …" line, and after each buy-in a card in that player's row,
    "Give Andhar: 10 white · 10 red · …" (or "The box can't make $1,500 from what's left; hand out what you
    can and note it"). It shows only while that buy-in is the last action: the next buy-in, Undo or ✕
    hides it.
  - End screen: each player has "Count chips" (a stepper per colour, ≥48px; the final stack is their
    value) or "Enter total instead" (today's field). Counts live only in the local game
    (`chipCounts` / `stackMode`, optional fields of `ct51.liveGame`) and never reach the finished game. A
    player without a choice who already has a typed stack (e.g. an older local game) stays on the total.
  - Below the chip check, "Chips by colour" compares chips counted with chips handed out ("Black: 2 more
    counted than handed out", "Box couldn't make $1,500 for Andhar"), noting that swapping chips with the
    box for change can cause it. A hint only: the dollar chip check is the only thing that blocks Save.
- **Multiples of $5** (the smallest chip, `chipStepError`), regardless of Chip mode: custom buy-ins on the
  live screen, buy-ins added or changed in Edit game (untouched older amounts stay editable), and preset
  buy-ins in Settings (the admin op and the form; not a schema rule).
- **iOS:** Safari and the installed home-screen app have separate storage, so a game started in one is
  invisible in the other. Start shows "Run games from the CT51 home-screen app, not Safari." on iOS when
  not running standalone.

---

## 10. Screens

Use HashRouter paths. Mobile-first, one column, bottom navigation for viewer tabs.

**Everyone**
| Route | Screen |
|---|---|
| `#/` | **Leaderboard**: active season standings (rank, name, net, games played, last result). "You" highlight. Last updated + refresh. |
| `#/games` | **Game history**: newest first, season games and incognito games (labeled) with per-player results. Filter by season. "Edited" badges. |
| `#/games/:id` | **Game detail**: final stacks, results, and an "Every buy-in" panel listing each player's buy-ins in order (e.g. `$1,000 · $1,500`). "Share card" (the results card image, everyone). |
| `#/players/:id` | **Player page**: net-winnings-over-time chart for the selected season (season games only), game list, best/worst game; "<Season> Wrapped" links (closed seasons played) and the **Trophy cabinet** above the badge list (§12 Season show, Season Wrapped). |
| `#/seasons` | **Seasons**: all seasons; closed ones show champion and final standings (tap through). |
| `#/seasons/:id` | **Season page**: champion card (closed), **podium** ("Final podium" / "Podium so far"), standings, **The race** (2+ season games: replay of the standings game by game, §12 Season show), awards. Closed seasons: a "Season Wrapped" button below the podium (your story when `ct51.me` has one, else the picker). |
| `#/seasons/:id/wrapped` | **Season Wrapped picker** (lazy chunk): players with a Wrapped, standings order, initials discs. |
| `#/seasons/:id/wrapped/:playerId` | **Season Wrapped story** (lazy chunk): full screen over the app, slide by slide (§12 Season Wrapped). |
| `#/history` | **Edit history**: commit list. |
| `#/me` | **Who are you?**: pick your player; stored in localStorage `ct51.me`; used only for highlighting. |
| `#/more` | **More**: Poker Guide, Hall of Fame, Chip calculator, Theme, Animations, Sounds, Chip mode, Admin. |

**Admin** (after login; a lock icon in the header opens login)
| Route | Screen |
|---|---|
| `#/admin` | Admin home: Start/Resume game, Not-synced queue, token expiry notice, logout. |
| `#/admin/start` | Start game: players, mode, date, guest choice, stuck-game notice. |
| `#/admin/live` | Live game. Works without login if the game is on this phone (§9.6). |
| `#/admin/end` | Final stacks + chip check + save. Works without login (Save queues it). |
| `#/admin/games/:id/edit` | Edit any game (closed-season warning). Delete from here. |
| `#/admin/deleted` | Deleted games bin + restore. |
| `#/admin/players` | Add, rename, archive/unarchive, promote guest. |
| `#/admin/seasons` | End season, start new season, rename any season (§5.2). Linked from Admin home. |
| `#/admin/settings` | Preset buy-in amounts. |

---

## 11. UI and UX rules

- Mobile-first; designed for a 360–430px wide phone, held one-handed, at night.
- **Dark theme by default**, with a light theme toggle. Velvet oxblood + brass ("high-roller luxe", §11.1),
  felt green as an accent only.
- Tap targets ≥ 48px. Buy-in buttons are large.
- Money: whole dollars with separators. Positive green `+$1,100`, negative red `−$300` (true minus sign),
  zero neutral. Never rely on color alone: always show the sign.
- Footer on every screen: "Paisa he paisa hoga, hehehe 💸". The More screen shows the tagline
  "💰 या तो लाखों में या सलाखों में💰" under the wordmark (Devanagari and emoji use system fonts; no
  extra font files).
- Confirm dialogs for: end game, delete, restore, editing a closed season, end season, start new season, clear stuck game.
- Empty states for no seasons, no games, no players.
- PWA manifest: `name` "Chestnut Table 51", `short_name` "CT51", standalone display, theme color, icons
  (192px, 512px, maskable). iOS: apple-touch-icon.
- Install hint on Home (`InstallHint`, logic in `lib/installHint.ts`): iOS Safari (not other iOS browsers),
  when not installed, shows a small dismissible card "Install CT51: tap Share, then Add to Home Screen";
  Android Chrome shows an "Install app" button once the browser fires `beforeinstallprompt` (caught early in
  `lib/installPrompt.ts`). Hidden when installed (standalone) and once dismissed (`ct51.installHintDismissed`).
- Accessible: semantic HTML, labels on inputs, visible focus states, sufficient contrast in both themes.
- **Sounds** (`lib/sound.ts`, Web Audio generated in code, no audio files): a per-device setting on More,
  next to Animations (`ct51.sound`, default On; Off stores `"off"`), separate from Animations: reduced
  motion never mutes them. One shared AudioContext, created and resumed on the first tap anywhere
  (`installSoundUnlock` in `main.tsx` listens for `pointerdown`, `touchend` and `click`, capture + passive:
  iOS doesn't count a touch `pointerdown` as a user gesture), master gain 0.25 into a limiter; every call is in
  try/catch and never blocks input; nothing touches `window` at import; `navigator.audioSession` is left
  alone. Off creates no context and plays nothing. Three sounds: **chip** (a ≤80ms clink, from
  `chipFeedback()`, so on every chip tap; overlapping taps layer), **saved** (a rising 3-note brass sting,
  ~600ms, in EndGame's `save()` right after `moveToQueue`, so offline saves too) and **win** (a soft ta-da
  when Home's new-game confetti would fire, also with Animations off; only if a tap already unlocked the
  context this session; also once when a Season Wrapped story's finale first shows, §12). The live screen's clink is allowed there because it is sound, not motion.

### 11.1 Design system ("private club card room")
All tokens and component styles live in `src/design/design.css`; brand components in
`src/design/components.tsx`; motion helpers in `src/design/motion.ts`. Screens use these classes and
components instead of one-off colours. `#/style` is a dev-only style guide (dropped from production builds).

**Tokens** (CSS custom properties, `--ct-*`). Dark is the default (`<html data-theme="dark">`);
`[data-theme="light"]` overrides every token. The choice is stored in localStorage `ct51.theme`.
| Token | Dark | Light | Use |
|---|---|---|---|
| `--ct-bg` | `#0b0405` velvet edge | `#f7efdd` ivory | page background and overscroll (`.ct-app` draws the velvet over it) |
| `--ct-felt` / `--ct-felt-hi` | `#1c0a0d` / `#2a1116` | `#fffaf0` / `#ffffff` | solid surfaces: live action bar, chart tooltip (panels are glass) |
| `--ct-line` | `#563634` | `#d9caa8` | hairlines, dividers (warm since Look v2) |
| `--ct-wood-dark` / `--ct-wood` / `--ct-wood-light` | mahogany → chestnut | same, slightly deeper | wood accents (the header is glass since Look v2) |
| `--ct-brass` / `-hi` / `-lo` | `#d6b35e` / `#f0d68b` / `#9c7a34` | `#b8923e` / `#e3c473` / `#7d5f1f` | accents, primary buttons, borders |
| `--ct-brass-text` | `#d6b35e` | `#7d5f1f` | brass used as **text** (AA in both themes; never use `--ct-brass` for text) |
| `--ct-ink-on-brass` | `#2a1a08` | `#2a1a08` | text on brass fills |
| `--ct-text` / `--ct-text-muted` | `#f4ecda` / `#c4bba6` | `#1f2a22` / `#5a5240` | body / secondary text |
| `--ct-win` / `--ct-loss` | `#6fdc9a` / `#ff9076` | `#17703f` / `#b0381f` | money signs (with the sign, never colour alone) |
| `--ct-focus` | `#f0d68b` | `#7d5f1f` | 3px focus outline |
| `--ct-velvet-top` / `--ct-velvet-edge` | `#2a0f14` / `#0b0405` | `#fdf8ee` / `#f7efdd` | Luxe page background (`.ct-velvet`, radial from the top) |
| `--ct-felt-accent` / `--ct-oxblood` | `#1d7a52` / `#7a1f2b` | `#17703f` / `#7a1f2b` | felt green as an accent only; oxblood accents (light) |
| `--ct-orb-green` / `-brass` / `-chestnut` | `#1d7a52` 34% / `#b8862f` 26% / `#7a3b1d` 40% | same colours at 8% / 12% / 7% | drifting orbs (`.ct-orbs`) |
| `--ct-glass` / `-sheen` / `-line` / `-highlight` | translucent velvet, warm-white sheen/hairline/edge | translucent white, gold hairline | panel glass look, no blur (`.ct-glass-panel`) |
| `--ct-glass-chrome` / `--ct-glass-solid` | `rgba(26,9,12,.82)` / `#1a090c` | `rgba(255,250,240,.84)` / `#fffaf0` | real glass tint (`.ct-glass`) / its no-backdrop-filter fallback |
| `--ct-foil` / `--ct-foil-hi` | `#d6b35e` / `#fff3c4` | `#5a4212` / `#846420` | gold foil text and its sweep (`.ct-foil`; AA in both themes) |

- **Typography:** Playfair Display 600/700 for display (`.ct-display`, headings, wordmark; always
  `lining-nums`), Inter 400–700 for everything else. Numbers use `.ct-num` (tabular, lining figures).
  Cinzel 700 (all caps, letter-spaced) for small eyebrow labels only (`.ct-eyebrow`: stat labels, "Awards
  so far", "Champion", fun-panel headings). The live screen's "Table total" stays Inter. Ranks use Playfair.
  Fonts are self-hosted via `@fontsource` (`src/design/fonts.ts`, Latin subset only) and precached;
  never load Google Fonts. Inputs are ≥16px so iOS doesn't zoom.
- **Luxe v2 ("high-roller luxe" + liquid glass, Look & feel v2):** the CSS lives in the Luxe section of
  `design.css` and is shown on `#/style`.
  - Velvet: an oxblood radial gradient replaces the green felt page background.
  - Orbs (`.ct-orbs::before/::after`): radial gradients (never `filter: blur`), `pointer-events: none`,
    behind the content (`isolation: isolate`), animating `transform` only, 28s / 34s.
  - Real glass (`.ct-glass`, `backdrop-filter` + `-webkit-`) only on the bottom nav, the header and the
    season-stats sheet. Its tint stays readable with no blur behind it (view-transition snapshots), and an
    `@supports not` fallback gives a solid fill. Panels get the glass *look* (`.ct-panel`, `.ct-panel-brass`, and
    `.ct-glass-panel` on `#/style`: translucent fill, hairline, inner top highlight) and are never blurred.
  - Foil (`.ct-foil`): a ~5s gold sweep, only on the header wordmark and the #1 name on the active
    season's leaderboard (`StandingsList` with `morph`, once that player has 1+ game; ties are already
    broken, so one row); static when motion is off, plain brass without `background-clip: text`.
  - Springs: `--ct-spring` (bouncy, nav bubble) and `--ct-spring-soft` (never overshoots, sheet), `linear()`
    with a `cubic-bezier` fallback.
  - Contrast is checked against the strongest orb at its peak, in both themes (worst cases on `#/style`).
  - Shell (`AppShell.tsx`): `.ct-app` is the velvet with `isolation: isolate`; its `::before` / `::after`
    are the orbs, `position: fixed` behind the content (not on the splash, which also uses `.ct-app`).
    `.ct-rail` (header), `.ct-nav` and `.ct-sheet` are the real glass. On `INSTANT_PATHS` (and with motion
    off) `.ct-app` gets `data-route-instant` (not `data-instant`, which the sheet uses): the orbs pause
    where they are and the foil rests.
  - Bottom nav: a floating glass pill (radius 24px) with a brass bubble (radius 20px) under the active
    tab (`NavBubble`, `--i` = tab index). It springs from tab to tab only; arriving from a screen without a
    tab, on instant paths or with motion off it jumps. It's hidden on screens without a tab. When it
    slides, the new tab's label turns dark 120ms late (as the bubble arrives under it) and the old one lets
    go at once; when it jumps, labels change instantly. The four NavLinks, labels, suits and
    `viewTransition` are unchanged.
- **Spacing and sizing:** 16px side gutter (`px-4`) on every screen; panels radius 16px, buttons and
  inputs radius 12px; buttons and inputs ≥48px tall; list/leaderboard rows ≥56px; the bottom nav pill is 60px
  (`--ct-nav-h`), 16px from the sides and `--ct-nav-gap` (`max(12px, safe-area inset)`) from the bottom;
  `--ct-nav-footprint` (pill + gap) is what `.ct-footer` and `.ct-above-nav` (the live action bar, 8px
  above the pill) clear. The action bar is solid (never glass) and its fill continues down behind the pill
  to the screen edge, so the page never shows through the gap. Button labels wrap and never truncate.

**Components**
- **Brand chip lockups:** `ChipBadge` is the app-icon chip (brass rim, mahogany spots, "51"), same art
  as `src/design/iconSvg.ts`. `Wordmark` `sm`/`md` = "Chestnut Table" + chip on one line (header, page
  titles); `lg` = chip stacked above the name (More screen) so it never breaks at 360px.
- **Chip buttons** (`.ct-chip`, `data-tone` `red`/`blue`/`black`/`green`, plus `outline` for "Custom"):
  the live screen's preset buy-in buttons, 56–80px round, four per row, tones cycling by preset index.
- **Rank badges** (`RankBadge`, `.ct-rank`): gold/silver/bronze plaques (bevelled tiles, radius 8px) for
  ranks 1–3 with Playfair Display lining digits (not Cinzel), a plain number below; the Poker Guide's
  `.ct-rank-brass` is a brass plaque.
  Leaderboard and season standings share `StandingsList`; the "You" row gets a brass left edge
  (`.ct-row-me`). Closed-season champions get a `Crown`.
- **Cards and surfaces:** `.ct-panel` (glass card with hairline; `.ct-panel-brass` for emphasis),
  `.ct-rail` (glass header), `.ct-list-row`, `.ct-tag` (Incognito, Edited, Guest), `.ct-pill` (brass
  status pill: "Game on", "Not synced"). Buttons: `.ct-btn` + `-primary` (brass) / `-secondary` /
  `-danger`. Headings: `PageTitle` / `SuitHeading` with a suit accent. `Money` renders signed dollars.
  `Loading` and `EmptyState` are used on every screen.

**Motion rules**
- What animates: the ~1.2s intro splash (once per tab session, tap to skip, never when launching into a
  live game); a 180ms screen fade/slide; staggered entrance on leaderboard rows, game cards and seasons
  (`.ct-rise`); count-up on leaderboard and player-page totals (`Money animate`); rows sliding on rank
  change (`useFlip`); the chip tap "pop" ring + 12ms vibrate on Android (`chipFeedback`); the header
  wordmark (a "Season stats" button on every screen) flips its chip and slides up the season-stats sheet
  (`SeasonStatsPanel.tsx`, content from `lib/statsPanel.ts`) with count-ups. Look v2 adds the drifting
  orbs (28s / 34s), the ~5s foil sweep on the header wordmark and the #1 leaderboard name, and the nav bubble's spring (380ms).
  Season show adds the race replay on the season page: rows slide to their new rank (`top`, 600ms
  `--ct-spring`) and bars grow or shrink (`left`/`width`, `--ct-spring-soft`) via `.ct-race-anim`, plus
  autoplay (one game per 1.1s). Motion off: no `.ct-race-anim`, no Play button (step buttons only), and
  `.ct-race-anim .ct-race-row/.ct-race-bar` are in both motion-off blocks. The podium's steps rise once
  per mount (`.ct-podium-rise`, 700ms `--ct-spring`, #1 then #2 then #3, 140ms apart), only added when
  animations are allowed and listed in both motion-off blocks. Season Wrapped: each slide pops in
  (`.ct-wrapped-pop`, 480ms `--ct-spring`, only when animations are allowed, in both motion-off blocks)
  and its big amounts count up (`Money animate`).
- Animation is visual only: values, order and handlers are already final, and nothing ever delays input.
  Chip feedback runs after the buy-in is recorded.
- **`#/admin/live` and `#/admin/end` never animate** (`INSTANT_PATHS` / `isInstant` in `motion.ts`): no screen
  transition, entrance, count-up or FLIP. The only motion there is the chip tap pop. The season-stats sheet
  still opens there, instantly (no chip flip, slide or count-up). The orbs hold still and the foil rests
  (`data-route-instant`); leaving for a tab, the nav bubble jumps.
- `prefers-reduced-motion: reduce` turns all of it off: no splash (nothing drawn), no transitions,
  entrances, count-ups, FLIP, chip pop, spinner, orb drift, foil sweep or bubble slide; values show final immediately. Any new animation must
  be added to the reduced-motion block in `design.css` or check `useReducedMotion()`.

**360px check:** before declaring any UI change done, view every screen it touches at 360px wide in
**both** dark and light themes: no horizontal scroll, no truncated names, amounts or button labels,
tap targets ≥48px, text contrast AA.

**Icons:** the PWA icons (`public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`,
`apple-touch-icon.png`) are rendered from `src/design/iconSvg.ts` with local headless Chrome. After
changing the icon art, run from the repo root
`node --experimental-strip-types scripts/render-icons.mjs` (set `CHROME_PATH` if Chrome/Edge isn't in a
standard location) and commit the PNGs. No image library or npm dependency.

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

**Reset (2026-10-20):** all test data was wiped in the commit "Reset: wipe test data, start real Season 1":
`data.json` is back to the section 6.3 initial file (preset buy-ins kept), and the real Season 1 is
created through the app. Git history was not rewritten; the History screen hides the older test commits
via `HISTORY_SINCE` (section 8.3). Phones with stale `ct51.me` / `ct51.lastSeenGame` keys from the test
data are cleaned up on load (`ct51.lastSeenGame` is now migrated to the `ct51.seenGamesUpTo` watermark, §5.9). The test fixtures (`src/domain/__fixtures__/seed.json`) and the dev-only
`#/style` sample data stay; `npm run check:bundle` proves neither reaches production.

### Table tools (mini-phase, owner-approved 2026-10-24)
Five steps, in order. Each step is built, reviewed, phone-tested and pushed before the next starts.
Rules for every step: **no `data.json` format changes** (no new fields, no version bump); the chip set and
the season game limit live in `src/config.ts`.
- **A. Poker Guide** (`#/guide`, linked from More). Texas Hold'em, static content (no data, domain or save
  path). Three tabs: Hands, Ties, Basics (no label may wrap at 360px); the tab is remembered per device
  in `ct51.guideTab`. Hands: all 10 hand ranks best to worst, each with rank number, name, a 5-card example, one-line description and
  an "If tied:" line; kickers dimmed. Cards are drawn by the app (`PlayingCard`, CSS, no image files,
  accessible label like "Queen of spades"). Content lives in `src/lib/pokerGuide.ts` with tests (10 ranks in
  order, every example is a valid 5-card hand of its type, kickers marked correctly).
- **B. Hall of Fame** (page linked from More): titles, situational titles, badges, awards and the full
  phrase list (collapsed by default), each with what it means, how it's earned, and current holders. New
  badges and phrases in Hindi, English and Marathi: short famous lines, never song lyrics.
  Landed: `#/hall` (below Poker Guide in More), built by `lib/hallOfFame.ts` only from `domain/fun.ts` and
  `lib/funLabels.ts` (every name, icon, how-to-earn, tier and situation rule lives in `funLabels.ts`).
  Badge rules (all-time, finished season-mode games only; incognito and deleted games never count):
  - The original six (First blood, Hat trick, Double up, Phoenix, Ten club, Half century) keep their rules;
    `badges()` still returns them first-earned only.
  - Per-game (`gameBadges`): Man of the Match ×5 (the night's top result, above $0, 5 times; ties count
    for all tied), Lucky seven / Double digits (7th / 10th winning night), Triple threat (cash out ≥ 3×
    total buy-in), Whale (win ≥ $2,000), Lone wolf (the only player up, 3+ players), Giant slayer (win
    while the season leader going in, #1 from that season's earlier games, played and finished down; no
    leader before a season's first game), Bounce back (win the night right after the player's own
    previous season game, across seasons, where they lost at least half a typical buy-in of that game's
    season: 2 × result ≤ −`typicalBuyIn`), Second wind (2+ buy-ins and finish up), Even Steven (result
    exactly $0), Felted (cash out $0).
  - Season close (`seasonCloseBadges`, closed seasons only, players with 1+ game in it, positions in
    standings order so the podium is always 3 places): Season champion (#1), Podium (top 3), Wooden spoon
    (last; needs 2+ players with games), Wire to wire (#1 after every game, 5+ games), Perfect attendance
    (every game of a season with `MAX_SEASON_GAMES`+ games). Dated at the season's `endedOn`, linked to
    the season.
  - Counts: every badge records where it was first earned and how many times (`allBadges`, newest first).
    Repeatable badges show "×N" with the first date. One-time and milestone badges are earned once and
    never show a count: First blood, Ten club, Half century, Man of the Match ×5, Lucky seven, Double
    digits. Hat trick counts once per winning run that reaches 3.
  - Player page: earned badges first (newest first), then unearned ones, dimmed, with how to earn them.
  - Title bands (owner-approved 2026-10-25, were ±⅕ / ±½), average per game ÷ typical buy-in: Legend
    ≥ +⅓, The Bond ≥ +⅒, Biscuit strictly between ±⅒, Easy tiger ≤ −⅒ and > −⅓, The ATM ≤ −⅓
    (`tier()` in `domain/fun.ts`, whole-number comparison). Situations still override the tier.
- **C. Chip calculator** (standalone, linked from More). Chip set: white $5 ×100, red $10 ×50, green $20
  ×50, blue $50 ×50, black $100 ×50 (box total $9,500). Preferred $1,000 split: 10 white, 10 red, 10 green,
  5 blue, 4 black. Buy-ins must be multiples of $5.
  Landed (8ef90f4, e4d0dab): `CHIP_SET` / `PREFERRED_SPLITS` in `src/config.ts`; `domain/chips.ts` has
  `chipSplit` (the preferred split when it fits, otherwise the exact split closest to the nearest preferred
  one scaled to the amount) and `chipTotal`. `#/chips` (below Hall of Fame in More) has "Hand out"
  (players 2–12, presets or a custom amount, per-player chips and what's left in the box, remembered in
  `ct51.chipCalc`) and "Count a stack". Standalone: it never reads or writes game data.
- **D. Season limit:** 10 season games per season (incognito games don't count). Saving game 10 also
  closes the season (`status: "closed"`, `endedOn`) in the same commit; it does not start the next one.
  Landed: the rules are in §5.2 (count, auto-close, queued games, edits/restores) and §8.4 (message).
- **E. Live game chips:** a chip distribution suggestion per buy-in, bank tracking, and per-color counting
  at game end ("enter total instead" stays as a fallback). A per-color mismatch is a hint, never a blocker;
  the strict chip check (§5.6) on dollar totals is unchanged.
  Landed: the rules are in §9 (Chip mode, multiples of $5).

### Results card + sounds (mini-phase, owner-approved 2026-10-25)
Three chunks on the `results-card` branch. Add, don't change: the §9.8 copy text stays as it is.
- **A. Card data:** `badgesInGame(data, gameId)` (`domain/fun.ts`: every per-game badge hit in that game,
  repeats included with their running count), `WINNER_LINES` / `winnerLine(gameId)` (`domain/quotes.ts`,
  separate from QUOTES, picked by an FNV-1a hash of the id) and `resultsCardModel(data, game)`
  (`lib/resultsCard.ts`). Card: "CHESTNUT TABLE 51", `shareDate`; season games show the season name and
  "GAME n OF 10" (n = position in `seasonGamesInOrder`; "GAME 11" with no "OF" past `MAX_SEASON_GAMES`);
  incognito shows "INCOGNITO" only (no number, leader or badges). Man of the Match = the night's top result
  above $0 (ties joined with " & ") with its result and winner line, none if nobody finished up; the
  others sorted like `shareText`; badges as "Name: Badge" via `badgeTitle` (×N on repeats). The leader
  line is as of that game; a closed season's last game (auto-closed or ended by hand) shows
  "<Season> champion: Name +$X" instead.
- **B. Card image + sharing:** `lib/drawResultsCard.ts` (Canvas 2D, 1080×1350 PNG, a lazy precached chunk;
  it alone imports the Playfair 600 italic face) always draws the dark design with fixed colours: velvet
  `#2a0f14` → `#0b0405` with brass/green glows, a brass hairline border, Cinzel title, a drawn crown, the
  Man of the Match in Playfair with a static gold gradient, the result in green, the line in italic,
  the others in a glass panel (two columns past 7), badge pills (3 lines, 2 with two columns; the rest
  "+N more"), the leader/champion line and "Paisa he paisa hoga". It awaits `document.fonts.load` (4s cap),
  shrinks long names to fit (never cut), no emoji. `ShareCardButton` (`components/ShareCard.tsx`) draws in
  the background as soon as it mounts, one card at a time in mount order (`lib/serialQueue.ts`), showing
  "Preparing card…" (disabled) until its own card is ready; the tap calls `navigator.share({ files })`
  straight away when `canShare` allows (no await before it, for iOS; a cancel is silent), otherwise (or on
  any other error) a sheet with the image (alt = `shareText`), "Press and hold the image to save or share
  it" and Download; its object URL is revoked on close/unmount. On Game detail (every finished game,
  viewers too) and next to each "Share results" in Admin home's Saved list. `#/style` previews four cards.
  The draw is keyed on the card's content (`JSON.stringify` of the model), so a refresh or another save
  that doesn't change this game's card never redraws it.
- **C. Sounds:** the rules are in §11 (Sounds).

### Season show (mini-phase, owner-approved 2026-10-25)
Four chunks on the `season-show` branch: data, season race replay, 3D podium, trophy cabinet. Add, don't
change: existing screens, celebrations, tests and build checks stay as they are. No new dependencies.
- **A. Data:** `seasonRace(data, seasonId)` (`lib/seasonShow.ts`): one frame per game of
  `seasonGamesInOrder`, each `seasonStandings` over the games up to it (players with 1+ game only, so late
  joiners appear from their first game), with `gameNumber`, `gameId`, `date` (`shareDate`), rows (net,
  rank, places gained or `"new"`) and a caption: "<Name> takes the lead" when #1 changed (never on game
  1), or "<Name> takes the lead, +$X tonight" when the new leader is also a (joint) winner of that night;
  else "<Name> wins the night +$X" / "A & B win the night +$X" (`nightSummary` winners, ties joined with
  " & "); else "All square". `seasonPodium(data, seasonId)` (`domain/seasonShow.ts`): the top 3 of the standings among
  players with 1+ game, with initials (first letters of the first and last words) and `final` when the
  season is closed; null if nobody has played. `playerTrophies(data, playerId)`: closed seasons only,
  newest first, exactly one trophy per Champion/Podium/Wooden spoon badge `seasonCloseBadges` gives
  (gold/silver/bronze for places 1–3, plus a spoon for last place with 2+ players), so in a 2- or
  3-player season last place holds a medal and the spoon (medal first). A test checks the one-to-one
  match for every player and season.
- **B. The race** (`components/SeasonRace.tsx`, on the season page between the standings and Awards,
  2+ season games): one row per player (rank, name that wraps, signed amount) with a bar diverging from a
  centre zero line, green right / loss colour left, brass for the leader; the largest |net| in any frame
  is half the track. Rows keep a stable DOM order and are placed by `top` from measured row heights, so
  wrapped names never overlap. Controls (≥48px): ‹ previous, Play/Pause, › next; the caption panel
  ("After game n of N · date" + caption) is `aria-live="polite"`; a screen-reader list gives "rank, name,
  amount" per row (the bars are `aria-hidden`). Opens on the last frame; Play starts from game 1 (also
  when on the last frame) and stops at the last. Timers clear on pause, unmount and motion off; keyed by
  season. Preview on `#/style` (12 players with late joiners and long names, and 2 players).
- **C. Podium** (`components/SeasonPodium.tsx`, on the season page right below the champion card and
  above the standings, whenever `seasonPodium` isn't null; "Final podium" when closed, else "Podium so
  far"): CSS 3D steps (each tilted back with `perspective` + `rotateX`, a lighter top face and a front
  face) in the order 2 · 1 · 3, gold tallest, then silver, then bronze, Playfair numerals in dark ink on the
  faces. Metals are fixed colours in both themes, with a hairline drop-shadow edge. Above each step: a
  felt-green initials disc with a metal ring, the name (wraps anywhere, never cut) and the signed net; a
  `Crown` over #1 only when closed. Fewer places show only those steps, centred. The DOM is in place order
  (flex `order` draws 2 · 1 · 3) with "1st place, name, amount" for screen readers. Preview on `#/style`.
- **D. Trophy cabinet** (`components/TrophyCabinet.tsx`, on the player page right above the badge list,
  existing sections unchanged): a dark wooden panel (fixed light text, money and focus colours on the
  wood, AA in both themes) with brass-edged shelves, three trophies a shelf, wrapping onto more shelves.
  One trophy per `playerTrophies` entry, newest first: a gold cup (Champion), a silver or bronze medal
  (2nd / 3rd), a wooden spoon, all inline SVG (no emoji), with the season name and signed net under it.
  Each trophy links to its season (≥48px) and reads "Champion, Season 1, +$X" to screen readers.
  Empty: "No trophies yet. They're handed out when a season closes." Preview on `#/style`.

### Season Wrapped (mini-phase, owner-approved 2026-10-25)
Three chunks on the `wrapped` branch: data, the story, share + finale sound. Add, don't change: existing
screens (except one entry button on SeasonDetail and PlayerPage), `domain/` exports, tests and build checks
stay as they are. No new dependencies.
- **A. Data** (`lib/wrapped.ts`): `wrappedModel(data, seasonId, playerId)` is null unless the season is
  closed and the player has 1+ season game in it; otherwise slides in this order, each left out when it has
  nothing true to say. Every number comes from an existing helper, never re-derived.
  intro ("<Name>, your <Season> wrapped.", games, players with 1+ game, `startedOn`–`endedOn`); finish
  (place "2nd of 4" among players with 1+ game, net, `playerTrophies` for this season, so spoon + medal can
  show together); bestNight (`playerSeasonStats().bestNight`, "Your least bad night" when below $0, its
  `badgesInGame` for this player); top (`seasonRace` frames led, "You led after 4 of 10 games", or "Highest
  you climbed: #2 after game 6"); toughNight (`worstNight` + `totalRebuys`, only when it was a loss); nemesis
  (`nemesis()`, only when not null); badges (per-game hits in this season's games + this season's
  `seasonCloseBadges`, run on the data with `seasons: [that season]` because its tally merges every closed
  season into the first one's id; and the title from `playerMoods`: situation over tier, Fresh blood counts, so in
  practice it always shows); finale (place, net, best night, highlight).
  **Inside Wrapped every ×N counts within this season only** (best night: up to that night; badges slide:
  the whole season); the results card keeps its all-time running count. Finale highlight: the first badge
  of `TOP_BADGE_ORDER` (Season champion, Wire to wire, Perfect attendance, Podium, then per-game badges;
  Wooden spoon, Felted and Even Steven never headline), else the title. `wrappedPlayers(data, seasonId)`:
  standings order, closed seasons only; `wrappedSeasons(data, playerId)`: newest first. These two live in
  `lib/wrappedEntry.ts` (re-exported by `wrapped.ts`) so the entry bundle doesn't carry the model.
- **B. The story** (`screens/Wrapped.tsx`, one lazy chunk with the admin chunk's one-time reload;
  slides in `components/WrappedSlides.tsx`; pure controls in `lib/wrappedNav.ts`). Picker at
  `#/seasons/:id/wrapped`, story at `#/seasons/:id/wrapped/:playerId`; bad links say "Wrapped not found".
  The story is portalled to `<body>` (the page area's screen-fade transform would shift a fixed child):
  `.ct-wrapped`, fixed inset 0, z 70, safe-area padding, `#root` inert and page scroll locked while open,
  `data-theme="dark"` so it is always the dark palette, and `SandboxBanner` on top in sandbox mode.
  Progress segments, a ✕ (48px: back if opened in-app, else the season page), Previous (left third) and
  Next (right two-thirds) tap zones as labelled buttons under the content (content ignores taps except
  its own buttons/links), ArrowLeft/ArrowRight/Escape, no auto-advance, no wrap past either end. The
  slide is in an `aria-live="polite"` region with "Slide n of N". Backgrounds by kind
  (`SLIDE_BACKGROUND`: velvet, brass, felt, midnight, oxblood; neighbours never match, tested). Playfair
  for big statements (`.ct-wrapped-big`; names and titles `.ct-wrapped-name`, smaller so one long word
  fits 360px), Cinzel eyebrows, Inter body; badges as pills (8, then "+N more"); trophies reuse the
  cabinet's `TrophyArt`. Entry: SeasonDetail and PlayerPage (§10). Every slide kind is previewed on
  `#/style` (long names, six-figure amounts).
- **C. Share + finale sound.** The share mechanics live in `components/ShareImage.tsx`: `useShareImage(key,
  draw, fileName)` (draw before the tap in one serial queue for every image, `canShare`/`share` with no await,
  a cancel is silent, any other error opens the sheet) and `ImageSheet` (image with alt text, Download, object
  URL revoked on close/unmount). `ShareCardButton` is a thin wrapper on them, unchanged in behaviour.
  `lib/drawWrappedCard.ts` (dynamic import, sharing the results card's exported palette, `loadFonts` with
  its 4s cap and `fitSize`) draws the finale as a 1080×1920 PNG: "CHESTNUT TABLE 51", "SEASON WRAPPED", the
  season, a crown for #1, the name in gold, place, net, best night (amount + date), the highlight pill and
  "Paisa he paisa hoga"; always dark, no emoji, everything shrinks to fit (tested with a recording
  canvas). The finale slide's "Share my Wrapped" (`components/ShareWrapped.tsx`) draws it as soon as the
  finale appears; its fallback sheet sits in `.ct-wrapped-sheet-layer` (z 80, above the story, dark) with
  the image at 58dvh, and Escape closes the sheet only. The finale plays `playSound("win")` once per story,
  the first time it shows. `#/style` previews the image for a 2-player season.

---

## 13. Working agreements for Claude Code

- Start each session by reading this file and summarizing which phase we are in.
- Plan before coding any phase or any change touching `domain/` or `storage/`. Wait for approval.
- Small, focused commits with clear messages. Don't mix refactors with features.
- Targeted edits; don't rewrite whole files to change a few lines.
- Run `npm test`, `npm run build` and `npm run check:bundle` before declaring anything done.
- Commit only when `npm test && npm run build` both pass, chained with `&&` (never `;`), e.g.
  `npm test && npm run build && npm run check:bundle && git commit …`.
- Run the gate exactly as `npm test && npm run build && npm run check:bundle`, with no pipes
  (`| tail`, `| head`, `| Select-Object` …): a pipe reports the last command's exit code and hides a failure.
- Never edit `data/data.json` by hand. This applies from the reset on 2026-10-20 (section 12, Phase 6)
  onward: the real season is live and every change goes through the app.
  **One owner-approved exception (2026-10-20):** `scripts/import-season1.mjs` imported the real Season 1
  games played Oct 15–19 before the app was in use (commit "Import: Season 1 games (Oct 15–19)"). It
  builds the data with the domain functions (`newId`, `addPlayer`, `createFirstSeason`, the live-game
  flow with the strict chip check), runs `migrate` + validation, asserts the expected season totals, and
  refuses to run unless `data.json` is the empty §6.3 file. It is a record, not a pattern: never rerun it
  or write another import without the owner's approval.
- Don't add dependencies beyond section 3 without asking.
- If a rule here seems wrong or incomplete, say so instead of silently working around it.
