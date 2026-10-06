"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/session";
import { trackReadingGoalMet } from "@/lib/analytics";
import {
  HEARTBEAT_MS,
  activeSeconds,
  type GoalState,
  type HeartbeatReply,
  type Pace,
} from "@/lib/study";

export type Celebration = { kind: "goal" } | { kind: "milestone"; days: 7 | 30 } | null;

export interface ReadingStudyState {
  minutes: number;
  goalMinutes: number;
  goalMet: boolean;
  streak: HeartbeatReply["streak"] | null;
  pace: Pace | null;
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * R7 heartbeat: every 30 s, while the reader page is visible and the reader interacted within the
 * last 2 minutes, report the active seconds for `slug` (and the current page, for reading speed).
 * Hidden tabs, idle readers and offline sessions send nothing. Returns today's minutes, the goal,
 * the streak, the measured pace and a one-time celebration when the goal is reached.
 */
export function useReadingHeartbeat(slug: string, page: number, enabled = true) {
  const [state, setState] = useState<ReadingStudyState | null>(null);
  const [celebration, setCelebration] = useState<Celebration>(null);
  const lastInteraction = useRef(Date.now());
  const lastBeat = useRef(Date.now());
  const pageRef = useRef(page);
  const stopped = useRef(false);

  useEffect(() => {
    if (pageRef.current !== page) lastInteraction.current = Date.now();
    pageRef.current = page;
  }, [page]);

  // today's minutes + goal before the first beat, and the measured pace for time-left
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all([
      apiFetch<GoalState>("/study/goal/"),
      apiFetch<Pace>(`/study/books/${encodeURIComponent(slug)}/pace/`),
    ]).then(([goal, pace]) => {
      if (cancelled) return;
      if (!goal.ok && (goal.status === 401 || goal.status === 403)) stopped.current = true;
      setState((s) => ({
        minutes: goal.ok ? goal.data.minutes : (s?.minutes ?? 0),
        goalMinutes: goal.ok ? goal.data.goal_minutes : (s?.goalMinutes ?? 20),
        goalMet: goal.ok ? goal.data.goal_met : false,
        streak: goal.ok ? goal.data.streak : null,
        pace: pace.ok ? pace.data : (s?.pace ?? null),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [slug, enabled]);

  const beat = useCallback(
    async (keepalive = false) => {
      if (stopped.current) return;
      const now = Date.now();
      const seconds = activeSeconds(
        now,
        lastInteraction.current,
        lastBeat.current,
        document.visibilityState === "visible" || keepalive,
        navigator.onLine,
      );
      lastBeat.current = now;
      if (seconds <= 0) return;
      const res = await apiFetch<HeartbeatReply>("/study/heartbeat/", {
        method: "POST",
        json: { book: slug, seconds, page: pageRef.current },
        keepalive,
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) stopped.current = true;
        return;
      }
      const r = res.data;
      setState({
        minutes: r.minutes,
        goalMinutes: r.goal_minutes,
        goalMet: r.goal_met,
        streak: r.streak,
        pace: r.pace,
      });
      if (r.just_met) {
        const milestone = r.streak.milestone;
        setCelebration(milestone ? { kind: "milestone", days: milestone } : { kind: "goal" });
        trackReadingGoalMet({ goal_minutes: r.goal_minutes, streak: r.streak.current, milestone: milestone ?? 0 });
      }
    },
    [slug],
  );

  useEffect(() => {
    if (!enabled) return;
    const touch = () => {
      lastInteraction.current = Date.now();
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, touch, { passive: true, capture: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void beat(true);
      else {
        lastBeat.current = Date.now(); // hidden time never counts
        lastInteraction.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, touch, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [beat, enabled]);

  const dismissCelebration = useCallback(() => setCelebration(null), []);
  return { state, celebration, dismissCelebration };
}
