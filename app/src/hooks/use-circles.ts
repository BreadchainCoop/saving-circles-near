"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/wallet";
import { circles } from "@/lib/near/circles";
import type { CircleView } from "@/lib/near/types";

const PAGE = 12;

const present = (list: (CircleView | null)[]) =>
  list.filter((c): c is CircleView => c !== null);

/** Circles the signed-in account belongs to, newest first. */
export function useMyCircles() {
  const { accountId } = useWallet();
  return useQuery({
    queryKey: ["my-circles", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const ids = await circles.ofMember(accountId!);
      if (!ids.length) return [];
      const list = present(await circles.many(ids));
      return list.sort((a, b) => Number(b.id) - Number(a.id));
    },
  });
}

/**
 * Every circle, newest first, a page at a time. Ids are sequential from 0
 * (`next_id` is the count), so a page is just a range of ids.
 */
export function useAllCircles() {
  return useInfiniteQuery({
    queryKey: ["all-circles"],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const top = pageParam ?? Number(await circles.nextId());
      const from = Math.max(0, top - PAGE);
      const ids = Array.from({ length: top - from }, (_, i) => String(top - 1 - i));
      return { circles: ids.length ? present(await circles.many(ids)) : [], next: from };
    },
    getNextPageParam: (last) => (last.next > 0 ? last.next : undefined),
  });
}

/** A circle is finished once it ended early or its last round has closed. */
export const isFinished = (c: CircleView, nowMs = Date.now()) =>
  c.decommissioned || (c.end_time !== null && Number(BigInt(c.end_time) / BigInt(1_000_000)) <= nowMs);
