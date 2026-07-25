'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api, SpeedtestJob } from './api';

const POLL_INTERVAL_MS = 1000;
// Defensive cap on how long we'll poll a single job. The backend only
// reclaims a job a few minutes after it completes (or via a much longer
// backstop if it never completes), so this just guards against polling
// forever; it's set comfortably above the worst-case run (3 attempts x
// 120s timeout + 2 retry delays of 45-75s, ~7-8.5 minutes).
const MAX_POLL_MS = 10 * 60 * 1000;
// Tolerate the job not being registered yet on the very first poll(s)
// before treating a 404 as a genuinely unknown/expired job id.
const NOT_FOUND_GRACE_MS = 3000;
// Tolerate a brief network blip before giving up on a job that IS running.
const MAX_CONSECUTIVE_FAILURES = 3;

// Triggers a manual speedtest and polls the job endpoint for live progress
export function useSpeedtestJob(onComplete?: () => void) {
  const [job, setJob] = useState<SpeedtestJob | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(async () => {
    if (timerRef.current) return;
    setIsRunning(true);
    setJob(null);
    try {
      const { id } = await api.triggerSpeedtest();
      if (!id) throw new Error('No job id returned');
      const startedAt = Date.now();
      let consecutiveFailures = 0;

      timerRef.current = setInterval(async () => {
        try {
          const current = await api.getSpeedtestJob(id);
          consecutiveFailures = 0;
          setJob(current);
          if (current.status !== 'running' || Date.now() - startedAt > MAX_POLL_MS) {
            stopPolling();
            setIsRunning(false);
            onCompleteRef.current?.();
          }
        } catch (err) {
          // A 404 means the job id is unknown to the server (expired or
          // never registered). Give it a brief grace period in case this is
          // the very first poll racing the job's registration, and give
          // other errors (e.g. a transient network blip) a few retries
          // before treating the job as permanently gone.
          const message = err instanceof Error ? err.message : 'Job status unavailable';
          const isNotFound = message.includes('404');
          consecutiveFailures++;

          const stillTolerable = isNotFound
            ? Date.now() - startedAt <= NOT_FOUND_GRACE_MS
            : consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
          if (stillTolerable) return;

          stopPolling();
          setIsRunning(false);
          setJob({
            id,
            status: 'error',
            result: null,
            error: isNotFound ? 'Speedtest job expired or not found' : message,
            startedAt,
          });
          onCompleteRef.current?.();
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setIsRunning(false);
    }
  }, [stopPolling]);

  return { job, isRunning, start };
}
