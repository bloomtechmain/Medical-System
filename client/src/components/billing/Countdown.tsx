import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Migration 016: "payment due in 3d 4h 12m" — a live countdown to a package's
// expiry, ticking every 30 seconds (minute precision is all it shows).

export interface TimeLeft { days: number; hours: number; minutes: number; expired: boolean; totalMs: number }

export const timeLeft = (to: string | Date | null | undefined, now = Date.now()): TimeLeft => {
  const ms = to ? new Date(to).getTime() - now : 0;
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, expired: true, totalMs: 0 };
  const minutes = Math.floor(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60, expired: false, totalMs: ms };
};

export function useTimeLeft(to: string | Date | null | undefined): TimeLeft {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!to) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [to]);
  return timeLeft(to, now);
}

/** "3d 4h 12m", "4h 12m" or "12m"; "expired" once passed. */
export default function Countdown({ to, className = '' }: { to: string | Date | null | undefined; className?: string }) {
  const { t } = useTranslation('billing');
  const left = useTimeLeft(to);
  if (left.expired) return <span className={className}>{t('countdown.expired')}</span>;
  const text = left.days > 0
    ? t('countdown.dhm', { d: left.days, h: left.hours, m: left.minutes })
    : left.hours > 0 ? t('countdown.hm', { h: left.hours, m: left.minutes }) : t('countdown.m', { m: Math.max(1, left.minutes) });
  return <span className={`tabular-nums ${className}`}>{text}</span>;
}
