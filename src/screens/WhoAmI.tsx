import { useData } from "../state/DataContext.js";
import { useMe } from "../state/useMe.js";
import { activePlayersSortedByName } from "../lib/selectors.js";

export function WhoAmI() {
  const { data, loading } = useData();
  const { me, setMe } = useMe();

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data) return <p className="p-4">No data.</p>;

  const players = activePlayersSortedByName(data);

  if (players.length === 0) {
    return <p className="p-4">No players yet.</p>;
  }

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Who are you?</h1>
      <p className="mb-3 text-sm text-felt-950/60 dark:text-white/60">
        Pick your name to highlight your row on the leaderboard.
      </p>
      <ul className="divide-y divide-felt-700/20">
        {players.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setMe(p.id)}
              className="flex min-h-[48px] w-full items-center justify-between py-2 text-left"
            >
              <span>{p.name}</span>
              {p.id === me && <span className="text-chestnut-400">✓</span>}
            </button>
          </li>
        ))}
      </ul>
      {me && (
        <button type="button" onClick={() => setMe(null)} className="mt-3 min-h-[48px] text-sm underline">
          Clear selection
        </button>
      )}
    </div>
  );
}
