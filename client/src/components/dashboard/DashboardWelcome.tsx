import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Cross, Capsule, Ring, Dots } from '../landing/Shapes';
import { roleById, type RoleId } from '../landing/roles';

// The masthead every dashboard opens with. Before this, each of the seven
// dashboards drew its own banner — a different gradient per role (purple,
// cyan, blue, teal…), a 2xl heading and an emoji standing in for an icon.
// They shared no vocabulary with the public site a user had just come from.
//
// This is the landing pages' language instead: the navy ground from AuthShell,
// Fraunces for the name, the emblem's own shapes drifting behind it, and the
// role's real lucide icon from roles.ts — the same icon the marketing site
// uses for that audience. One component, so the seven stay in step.

// Which emblem shape drifts behind which role. Pulled from the public pages:
// the leaf is the patient/clinical side, the cross is medical, the capsule is
// pharmacy, the ring is the lab's lens.
const SHAPE: Record<RoleId, typeof Leaf> = {
  patient:    Leaf,
  doctor:     Cross,
  pharmacist: Capsule,
  laboratory: Ring,
  org:        Cross,
  admin:      Ring,
};

interface DashboardWelcomeProps {
  /** Drives the icon and the accent colour, straight from roles.ts. */
  role: RoleId;
  /** Small line above the name — "Welcome back," and friends. */
  eyebrow: string;
  /** The large line. The whole point of the panel. */
  title: ReactNode;
  /** One quiet line under the name: specialisation, organisation, portal. */
  subtitle?: ReactNode;
  /** Pills — blood type, age, active treatments, portal badge. */
  chips?: ReactNode;
  /** Buttons, top-right on desktop and under the name on mobile. */
  actions?: ReactNode;
  /** A stat strip rendered across the foot of the panel. */
  children?: ReactNode;
}

export default function DashboardWelcome({
  role, eyebrow, title, subtitle, chips, actions, children,
}: DashboardWelcomeProps) {
  const meta = roleById(role);
  const Shape = SHAPE[role];
  const Icon = meta.icon;

  return (
    <section
      className="sw-rise relative overflow-hidden rounded-[28px] text-white"
      style={{
        backgroundColor: '#0E2C52',
        // Same 155° sweep as the public auth panel, with the role's own colour
        // landing off the bottom-right corner so the seven read as one family
        // without being the same picture.
        backgroundImage: `linear-gradient(155deg, #123E6E 0%, #0E2C52 46%, ${meta.color} 190%)`,
      }}
    >
      {/* ── Emblem shapes. Decorative only: aria-hidden lives on each svg. ── */}
      <Shape
        from={meta.tint}
        to={meta.color}
        className="sw-float pointer-events-none absolute -right-16 -top-20 w-72 h-72 opacity-[0.17]"
      />
      <Dots
        color="#FFFFFF"
        className="pointer-events-none absolute right-6 bottom-4 w-24 h-24 opacity-[0.07] hidden sm:block"
      />

      <div className="relative p-6 sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="font-tech text-[10.5px] uppercase tracking-[0.3em] text-white/55">
              {eyebrow}
            </p>

            {/* Fraunces, and big. This is the line the page is built around. */}
            <h1 className="font-display text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.05] mt-2 break-words">
              {title}
            </h1>

            {subtitle && (
              <p className="text-white/65 mt-3 text-sm sm:text-base leading-relaxed">
                {subtitle}
              </p>
            )}

            {chips && <div className="flex flex-wrap items-center gap-2 mt-5">{chips}</div>}
          </div>

          {/* The role's real icon, in the emblem's rounded-square chip —
              replacing the emoji each dashboard used to show here. */}
          <span
            className="hidden sm:flex shrink-0 w-[70px] h-[70px] rounded-[24px] items-center justify-center"
            style={{
              backgroundImage: `linear-gradient(135deg, ${meta.tint}, ${meta.color})`,
              boxShadow: `0 18px 34px -16px ${meta.color}`,
            }}
          >
            <Icon className="w-9 h-9" strokeWidth={1.6} />
          </span>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2 mt-6">{actions}</div>}
      </div>

      {children && <div className="relative border-t border-white/10">{children}</div>}
    </section>
  );
}

export interface WelcomeStat {
  label: string;
  value: ReactNode;
  /** Second line under the value — "3 sales", "2 types". */
  sub?: ReactNode;
  /** Makes the cell a link. The pharmacy and lab strips are navigable. */
  to?: string;
}

/**
 * The stat strip across the foot of the panel. Every dashboard had its own
 * take on this — the doctor's used flex with `w-px` dividers, the pharmacy
 * and lab ones a negative-margin 2x2 grid — so they lined up differently and
 * wrapped differently. One grid, hairline dividers, same type scale.
 */
export function WelcomeStats({ items }: { items: WelcomeStat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-white/10">
      {items.map((s, i) => {
        const body = (
          <>
            <p className="font-tech text-[10px] uppercase tracking-[0.18em] text-white/50 truncate">
              {s.label}
            </p>
            <p className="font-display text-2xl sm:text-[1.7rem] leading-none mt-2 truncate">
              {s.value}
            </p>
            {s.sub && <p className="text-xs text-white/50 mt-1.5 truncate">{s.sub}</p>}
          </>
        );
        const cell = 'block px-6 py-5 min-w-0';
        return s.to ? (
          <Link key={i} to={s.to} className={`${cell} hover:bg-white/[0.07] transition-colors`}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cell}>{body}</div>
        );
      })}
    </div>
  );
}

// Shared pill + button styling, exported so the dashboards don't each
// re-invent them (and drift apart again).
export const welcomeChip =
  'inline-flex items-center gap-1.5 bg-white/12 border border-white/20 text-white ' +
  'text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm';

export const welcomeAction =
  'inline-flex items-center gap-2 bg-white/12 hover:bg-white/22 border border-white/20 ' +
  'text-white text-sm font-semibold px-4 py-2.5 rounded-full backdrop-blur-sm ' +
  'transition-colors disabled:opacity-60';
