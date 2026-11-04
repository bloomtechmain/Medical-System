import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock, AlertTriangle, X, Package, Mail } from 'lucide-react';
import { useDashboardPlan } from '../../hooks/useDashboardPlan';
import { billingApi } from '../../services/api';
import { MyBilling } from '../../types';
import Countdown from './Countdown';
import { formatDate } from '../../utils/helpers';
import { formatPrice } from '../../constants/plans';
import { SUPPORT_EMAIL } from '../site/siteConfig';

// Migration 016: wraps every dashboard page.
//   * Package expiring within 7 days → a banner with a live countdown.
//   * Package expired unpaid          → the page is replaced by a "payment
//     due" screen. The Package page stays reachable (that is where the
//     account sees what it owes and can change package), and so do
//     notifications in the header.
// The server refuses the locked dashboard's API calls with 402 regardless;
// this is what turns those refusals into something a person understands.

const DISMISS_KEY = 'suwela:billing-banner-dismissed';

async function digestDismissValue(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v1:${hashHex}`;
}

// Where the Package page is for the account the server says is locked.
const PACKAGE_BASE: Record<string, string> = {
  doctor: '/doctor', pharmacy: '/pharmacist', laboratory: '/laboratory', hospital: '/hospital', clinic: '/clinic',
};

interface ServerBlock { subject?: { kind: string; id: number; audience: string }; expires_at?: string | null }

export default function SubscriptionGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('billing');
  const location = useLocation();
  const { plan, billing, organizationId, refetch, applies } = useDashboardPlan();
  const [, base, section] = location.pathname.split('/');
  const onPackagePage = section === 'package';

  // An API call came back 402: the period just ran out. Refresh the package
  // so the lock screen shows without waiting for the next poll — and keep
  // what the server said, because the locked account is not always the one
  // on screen (a hospital owner's own doctor package can lapse while they
  // are looking at the hospital's dashboard, which runs on their doctor
  // endpoints).
  const [serverBlock, setServerBlock] = useState<ServerBlock | null>(null);
  useEffect(() => {
    const onExpired = (e: Event) => { setServerBlock((e as CustomEvent).detail ?? {}); refetch(); };
    window.addEventListener('suwela:subscription-expired', onExpired);
    return () => window.removeEventListener('suwela:subscription-expired', onExpired);
  }, [refetch]);

  useEffect(() => { if (onPackagePage) setServerBlock(null); }, [onPackagePage]);

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const syncDismissed = async () => {
      const expiresAt = billing?.expires_at;
      if (!expiresAt) {
        if (!cancelled) setDismissed(sessionStorage.getItem(DISMISS_KEY) === '');
        return;
      }
      const digest = await digestDismissValue(expiresAt);
      if (!cancelled) setDismissed(sessionStorage.getItem(DISMISS_KEY) === digest);
    };
    void syncDismissed();
    return () => { cancelled = true; };
  }, [billing?.expires_at]);

  if (serverBlock && !onPackagePage && billing?.status !== 'suspended') {
    const pkgBase = PACKAGE_BASE[serverBlock.subject?.audience ?? ''] ?? `/${base}`;
    return <LockedScreen packageHref={`${pkgBase}/package`} organizationId={serverBlock.subject?.kind === 'organization' ? serverBlock.subject.id : null}
      price="" expiredOn={serverBlock.expires_at ?? null} />;
  }

  if (!applies || !billing) return <>{children}</>;

  if (billing.status === 'suspended' && !onPackagePage) {
    return <LockedScreen packageHref={`/${base}/package`} organizationId={organizationId} planName={plan?.name} price={plan ? formatPrice(plan.price_monthly, plan.currency) : ''} expiredOn={billing.expires_at} />;
  }

  return (
    <>
      {billing.status === 'expiring' && !dismissed && !onPackagePage && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={17} className="text-amber-700" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-bold text-amber-900">
              {t('banner.title', { plan: plan?.name })} <Countdown to={billing.expires_at} />
            </p>
            <p className="text-xs text-amber-800">{t('banner.body', { date: formatDate(billing.expires_at) })}</p>
          </div>
          <Link to={`/${base}/package`} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl px-3.5 py-2">
            {t('banner.cta')}
          </Link>
          <button
            type="button"
            aria-label={t('banner.dismiss')}
            onClick={async () => {
              const expiresAt = billing.expires_at ?? '';
              const marker = expiresAt ? await digestDismissValue(expiresAt) : '';
              sessionStorage.setItem(DISMISS_KEY, marker);
              setDismissed(true);
            }}
            className="text-amber-700 hover:text-amber-900 p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {children}
    </>
  );
}

function LockedScreen({ packageHref, organizationId, planName, price, expiredOn }: {
  packageHref: string; organizationId: number | null; planName?: string; price: string; expiredOn: string | null;
}) {
  const { t } = useTranslation('billing');
  const { data } = useQuery<MyBilling>({
    queryKey: ['my-billing', organizationId ?? 'personal'],
    queryFn: () => billingApi.mine(organizationId),
  });
  // Shown for the account the server locked, which may not be the dashboard on screen.
  planName = planName ?? data?.plan?.name;
  price = price || (data?.plan ? formatPrice(data.plan.price_monthly, data.plan.currency) : '');
  expiredOn = expiredOn ?? data?.billing.expires_at ?? null;

  return (
    <div className="max-w-2xl mx-auto mt-6 md:mt-12">
      <div className="rounded-3xl border border-red-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 py-7 text-white">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
            <Lock size={26} />
          </div>
          <h1 className="text-2xl font-bold">{t('locked.title')}</h1>
          <p className="text-white/90 mt-1 text-sm">{t('locked.subtitle', { plan: planName, date: formatDate(expiredOn) })}</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('locked.package')}</p>
              <p className="text-base font-bold text-gray-900 mt-1">{planName ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('locked.amountDue')}</p>
              <p className="text-base font-bold text-gray-900 mt-1">{price} <span className="text-xs font-medium text-gray-500">{t('perMonth')}</span></p>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-gray-900">{t('card.howToPay')}</p>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{data?.instructions ?? '…'}</p>
          </div>

          <ol className="space-y-2 text-sm text-gray-700">
            {[t('locked.step1'), t('locked.step2'), t('locked.step3')].map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>

          <p className="text-xs text-gray-500">{t('locked.dataSafe')}</p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={packageHref} className="btn-primary">
              <Package size={16} /> {t('locked.viewPackage')}
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn-secondary">
              <Mail size={16} /> {t('locked.contact')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
