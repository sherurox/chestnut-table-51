import { useCallback, useEffect, useState } from "react";
import { forgetStaleMe, ME_KEY, validMe } from "../lib/me.js";
import { browserStore } from "../storage/localKeys.js";
import { useData } from "./DataContext.js";

function readMe(): string | null {
  try {
    return localStorage.getItem(ME_KEY);
  } catch {
    return null;
  }
}

export function useMe() {
  const { data } = useData();
  const [stored, setMeState] = useState<string | null>(readMe);

  const setMe = useCallback((playerId: string | null) => {
    try {
      if (playerId) localStorage.setItem(ME_KEY, playerId);
      else localStorage.removeItem(ME_KEY);
    } catch {
      // storage unavailable — selection still applies for this session
    }
    setMeState(playerId);
  }, []);

  // A pick pointing at a player that no longer exists is cleared from this phone.
  useEffect(() => {
    if (data && stored !== null && validMe(stored, data) === null) setMeState(forgetStaleMe(data, browserStore()));
  }, [data, stored]);

  return { me: validMe(stored, data), setMe };
}
