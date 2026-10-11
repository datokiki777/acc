import { useEffect, useState } from 'react';

import { useAppStore } from '../store/hooks';

// Always shown for at least this long, so a fast load doesn't just flash the logo for an instant
// — but never longer than it has to be otherwise, since dismissal is tied to real readiness.
const MIN_VISIBLE_MS = 500;
const FADE_MS = 250;
// Safety net only: initialize() always resolves into either `initialized` or `error` (its own
// try/catch guarantees that), so this should never actually fire — it exists purely in case
// something outside that promise chain hangs.
const MAX_WAIT_MS = 6000;

export function StartupScreen() {
  const initialized = useAppStore((state) => state.initialized);
  const error = useAppStore((state) => state.error);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [visible, setVisible] = useState(true);

  const ready = initialized || Boolean(error) || timedOut;
  const canLeave = ready && minTimeElapsed;

  // Date.now() is read here (inside the effect, after mount) rather than during render, since
  // render must stay pure — the timer still measures from first mount either way.
  useEffect(() => {
    const timer = window.setTimeout(() => setMinTimeElapsed(true), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!canLeave) return;
    const timer = window.setTimeout(() => setVisible(false), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [canLeave]);

  if (!visible) return null;

  return (
    <div
      aria-label="ACC is loading"
      className={canLeave ? 'startup-screen is-leaving' : 'startup-screen'}
      role="status"
    >
      <img alt="ACC" src={`${import.meta.env.BASE_URL}icons/icon-512x512.png`} />
      <strong>ACC</strong>
      <span>Personal · Work · Balance</span>
      {!canLeave && <div aria-hidden="true" className="loading-spinner startup-spinner" />}
    </div>
  );
}
