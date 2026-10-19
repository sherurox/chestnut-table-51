import { EmptyState, Loading, PageTitle } from "../design/components.js";
import { useData } from "../state/DataContext.js";
import { useMe } from "../state/useMe.js";
import { activePlayersSortedByName } from "../lib/selectors.js";

export function WhoAmI() {
  const { data, loading } = useData();
  const { me, setMe } = useMe();

  if (loading && !data) return <Loading />;
  const players = data ? activePlayersSortedByName(data) : [];

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♥" title="Who are you?" subtitle="Pick your name to highlight your row on the leaderboard. Only this phone remembers it." />
      {players.length === 0 ? (
        <EmptyState suit="♣" title="No players yet" />
      ) : (
        <div className="ct-panel overflow-hidden">
          <ul>
            {players.map((p) => {
              const selected = p.id === me;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMe(p.id)}
                    className={`ct-list-row w-full text-left ${selected ? "ct-row-me" : ""}`}
                  >
                    <span className="flex-1 font-medium break-words">{p.name}</span>
                    {selected && <span className="font-semibold text-brass">✓ You</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {me && (
        <button type="button" onClick={() => setMe(null)} className="ct-btn ct-btn-secondary mt-4 w-full">
          Clear selection
        </button>
      )}
    </div>
  );
}
