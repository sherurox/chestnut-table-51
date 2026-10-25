import { Link, useParams } from "react-router-dom";
import { EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { useData } from "../state/DataContext.js";
import { gameById, playerById, seasonById } from "../lib/selectors.js";
import { finalStack, gameResult, totalBuyIns } from "../domain/results.js";
import { formatDate, formatDollars } from "../lib/format.js";
import { isAdminDevice } from "../storage/localKeys.js";
import { ShareCardButton } from "../components/ShareCard.js";

export function GameDetail() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <Loading />;
  // Deleted games are gone for everyone; the admin's Deleted games bin shows them.
  const found = data && id ? gameById(data, id) : undefined;
  const game = found?.status === "finished" ? found : undefined;
  if (!data || !game) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="Game not found">
          <Link to="/games" className="underline">
            Back to game history
          </Link>
        </EmptyState>
      </div>
    );
  }

  const season = seasonById(data, game.seasonId);
  const nameOf = (pid: string) => playerById(data, pid)?.name ?? pid;

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle
        suit="♣"
        title={formatDate(game.date)}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {season?.name ?? "Unknown season"}
            {game.mode === "incognito" && <span className="ct-tag">♣ Incognito</span>}
            {game.editedAt && <span className="ct-tag ct-tag-brass">Edited</span>}
          </span>
        }
      />

      <div className="ct-panel mb-4 overflow-hidden">
        <ul>
          {game.players.map((pid) => (
            <li key={pid}>
              <Link to={`/players/${pid}`} className="ct-list-row ct-focus">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{nameOf(pid)}</span>
                  <span className="ct-num block text-xs text-ink-muted">
                    {formatDollars(totalBuyIns(game, pid))} in · {formatDollars(finalStack(game, pid))} out
                  </span>
                </span>
                <Money value={gameResult(game, pid)} className="shrink-0 text-lg" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="ct-heading mb-2 text-lg">
        <span className="ct-suit" aria-hidden="true">
          ♠
        </span>
        Every buy-in
      </h2>
      <div className="ct-panel p-3">
        <ul className="space-y-2 text-sm">
          {game.players.map((pid) => (
            <li key={pid} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-medium">{nameOf(pid)}</span>
              <span className="ct-num text-ink-muted">
                {game.buyIns
                  .filter((b) => b.player === pid)
                  .map((b) => formatDollars(b.amount))
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ShareCardButton data={data} game={game} className="mt-4 w-full" />

      {/* Only on a phone that has logged in as admin (non-secret flag, no admin code); the route asks to log in. */}
      {isAdminDevice() && (
        <Link to={`/admin/games/${game.id}/edit`} className="ct-btn ct-btn-secondary ct-focus mt-4 w-full">
          Edit game
        </Link>
      )}
    </div>
  );
}
