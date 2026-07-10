import { useQuery } from "@tanstack/react-query";
import type { IntradayPayload } from "../types";

const fetchIntradayTreasury = async (): Promise<IntradayPayload> => {
  const response = await fetch("/api/intraday", {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "Intraday Treasury request failed.");
  }
  return payload;
};

export function useIntradayTreasury() {
  return useQuery({
    queryKey: ["intraday-treasury"],
    queryFn: fetchIntradayTreasury,
    refetchInterval: (query) => {
      if (query.state.data?.available === false) return false;
      return Math.max(5, query.state.data?.source.refreshIntervalSeconds ?? 15) * 1000;
    },
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 5 * 1000,
    placeholderData: (previousData) => previousData
  });
}
