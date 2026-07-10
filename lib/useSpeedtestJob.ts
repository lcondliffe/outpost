'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api, SpeedtestJob } from './api';

const POLL_INTERVAL_MS = 1000;
// Backend cleans up jobs after 5 minutes; stop polling shortly before that
const MAX_POLL_MS = 4.5 * 60 * 1000;

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

      timerRef.current = setInterval(async () => {
        try {
          const current = await api.getSpeedtestJob(id);
          setJob(current);
          if (current.status !== 'running' || Date.now() - startedAt > MAX_POLL_MS) {
            stopPolling();
            setIsRunning(false);
            onCompleteRef.current?.();
          }
        } catch {
          // Job expired or server unreachable; stop polling
          stopPolling();
          setIsRunning(false);
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setIsRunning(false);
    }
  }, [stopPolling]);

  return { job, isRunning, start };
}
