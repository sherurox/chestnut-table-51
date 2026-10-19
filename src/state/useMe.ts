import { useCallback, useState } from "react";

const KEY = "ct51.me";

function readMe(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useMe() {
  const [me, setMeState] = useState<string | null>(readMe);

  const setMe = useCallback((playerId: string | null) => {
    try {
      if (playerId) localStorage.setItem(KEY, playerId);
      else localStorage.removeItem(KEY);
    } catch {
      // storage unavailable — selection still applies for this session
    }
    setMeState(playerId);
  }, []);

  return { me, setMe };
}
