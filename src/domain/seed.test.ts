import { describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import { champion, seasonStandings } from "./standings.js";
import seedRaw from "../../data/data.json" with { type: "json" };

// Season 1 (s1, closed) is 8 season-mode finished games: g1-g7 have all five regulars
// (Alice p1, Bob p2, Carol p3, Dave p4, Erin p5), buy-in $1000 each (pot $5000). Per-game
// results (cashOut - buyIn), summing each row down to the final total:
//
//           g1    g2    g3    g4    g5    g6    g7   | g1-g7 total
// Alice   +1000  -500     0     0  -500  +500  -500  |      0
// Bob         0 +1000  -500     0  -500  +500  -500  |      0
// Carol    -500     0 +1000  -500     0  -500  +500  |      0
// Dave         0     0     0 +1000     0  -500  +500  |  +1000
// Erin     -500  -500  -500  -500 +1000     0     0  |  -1000
//
// g8 (p1, p2, p4 only, pot $3000): Alice 0, Bob +600, Dave -600.
//
// Final season 1 (8 games for Alice/Bob/Dave, 7 games for Carol/Erin who sat out g8):
//   Bob:   0 + 600 =  600  (8 games) <- champion
//   Dave:  1000 - 600 = 400 (8 games)
//   Alice: 0 + 0 = 0        (8 games)
//   Carol: 0                (7 games)   <- tied with Alice on net, fewer games
//   Erin:  -1000            (7 games)   <- negative net
// Zero-sum: 600 + 400 + 0 + 0 - 1000 = 0.
//
// g9 (incognito) and g10 (deleted) are excluded from all of the above.
const SEASON_1_EXPECTED = [
  { playerId: "p2", name: "Bob", net: 600, gamesPlayed: 8 },
  { playerId: "p4", name: "Dave", net: 400, gamesPlayed: 8 },
  { playerId: "p1", name: "Alice", net: 0, gamesPlayed: 8 },
  { playerId: "p3", name: "Carol", net: 0, gamesPlayed: 7 },
  { playerId: "p5", name: "Erin", net: -1000, gamesPlayed: 7 },
];

// Season 2 (s2, active) is 5 season-mode finished games (g11-g15) among Alice/Bob/Carol/Dave,
// buy-in $1000 each (pot $4000). Per-game results:
//
//           g11   g12   g13   g14   g15  | total
// Alice    +800  -400     0  +200  +400  | 1000
// Bob      +200  +800     0  -200  -400  |  400
// Carol    -400  +200  +500     0  +200  |  500
// Dave     -600  -600  -500     0  -200  | -1900
// Zero-sum: 1000 + 400 + 500 - 1900 = 0.
const SEASON_2_EXPECTED = [
  { playerId: "p1", name: "Alice", net: 1000, gamesPlayed: 5 },
  { playerId: "p3", name: "Carol", net: 500, gamesPlayed: 5 },
  { playerId: "p2", name: "Bob", net: 400, gamesPlayed: 5 },
  { playerId: "p4", name: "Dave", net: -1900, gamesPlayed: 5 },
];

describe("seed data/data.json", () => {
  it("passes schema validation", () => {
    expect(() => migrate(seedRaw)).not.toThrow();
  });

  it("matches the hand-computed season 1 standings, in order", () => {
    const data = migrate(seedRaw);
    const rows = seasonStandings(data, "s1");
    expect(rows).toEqual(SEASON_1_EXPECTED);
  });

  it("matches the hand-computed season 2 standings, in order", () => {
    const data = migrate(seedRaw);
    const rows = seasonStandings(data, "s2");
    expect(rows).toEqual(SEASON_2_EXPECTED);
  });

  it("decides the Alice/Carol season 1 tie by games played, not name", () => {
    const data = migrate(seedRaw);
    const rows = seasonStandings(data, "s1");
    const alice = rows.find((r) => r.playerId === "p1")!;
    const carol = rows.find((r) => r.playerId === "p3")!;
    expect(alice.net).toBe(carol.net);
    expect(alice.gamesPlayed).toBeGreaterThan(carol.gamesPlayed);
    expect(rows.indexOf(alice)).toBeLessThan(rows.indexOf(carol));
  });

  it("crowns the hand-computed season 1 champion", () => {
    const data = migrate(seedRaw);
    expect(champion(data, "s1")).toBe("p2");
  });

  it("has no champion for the still-active season 2", () => {
    const data = migrate(seedRaw);
    // champion() is only meaningful for closed seasons; s2 has games but is active,
    // so the UI never calls champion() on it — this just documents that games existing
    // doesn't itself require a closed status.
    expect(data.seasons.find((s) => s.id === "s2")?.status).toBe("active");
  });

  it("excludes the incognito and soft-deleted season 1 games from standings", () => {
    const data = migrate(seedRaw);
    const incognito = data.games.find((g) => g.id === "g9")!;
    const deleted = data.games.find((g) => g.id === "g10")!;
    expect(incognito.mode).toBe("incognito");
    expect(deleted.status).toBe("deleted");

    // Gary (p6, guest) only ever appears in the incognito game, so he must not appear
    // in season 1 standings at all.
    const rows = seasonStandings(data, "s1");
    expect(rows.some((r) => r.playerId === "p6")).toBe(false);

    // If g9/g10 leaked into the totals, Alice's or Carol's net would shift away from
    // the hand-computed values above.
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.net).toBe(0);
  });

  it("sums season net winnings to zero for both seasons", () => {
    const data = migrate(seedRaw);
    for (const seasonId of ["s1", "s2"]) {
      const total = seasonStandings(data, seasonId).reduce((sum, r) => sum + r.net, 0);
      expect(total).toBe(0);
    }
  });

  it("has exactly one incognito game, one deleted game, and one edited game", () => {
    const data = migrate(seedRaw);
    expect(data.games.filter((g) => g.mode === "incognito").length).toBe(1);
    expect(data.games.filter((g) => g.status === "deleted").length).toBe(1);
    expect(data.games.filter((g) => g.editedAt).length).toBe(1);
  });
});
