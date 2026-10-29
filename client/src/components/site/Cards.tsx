import type { CSSProperties, ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { Tilt } from '../landing/Features';
import { TONES, type Tone } from './tones';

// Card building blocks for the public Suwela pages, in the style of the
// landing page's feature bento: gradient icon chips, a soft colour wash, an
// emblem shape tucked in the corner and the pointer-following tilt.

export function IconChip({ icon: Icon, tone, size = 'md', className = '' }: { icon: LucideIcon; tone: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = TONES[tone];
  const box = size === 'lg' ? 'w-16 h-16 rounded-[20px]' : size === 'md' ? 'w-14 h-14 rounded-[18px]' : 'w-11 h-11 rounded-2xl';
  const glyph = size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-7 h-7' : 'w-5 h-5';
  return (
    <span className={`relative shrink-0 flex items-center justify-center text-white ${box} ${className}`}
          style={{ backgroundColor: t.to, backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})`, boxShadow: `0 14px 28px -12px ${t.to}` }}>
      <Icon className={`${glyph} sw-wiggle`} strokeWidth={1.9} />
    </span>
  );
}

export function SiteCard({ tone, icon, title, children, className = '', style }: {
  tone: Tone;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const t = TONES[tone];
  return (
    <Tilt className={`h-full rounded-[32px] bg-white p-7 flex flex-col ring-1 ring-suwela-line hover:shadow-[0_28px_50px_-28px_rgba(14,44,82,0.45)] ${className}`}
          style={{ backgroundImage: `linear-gradient(180deg, ${t.wash} 0%, #ffffff 55%)`, ...style }}>
      <t.Shape from={t.from} to={t.to}
               className="absolute -right-10 -top-10 w-40 h-40 opacity-15 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-125" />
      {icon && <IconChip icon={icon} tone={tone} />}
      {title && <h3 className="relative font-display text-2xl leading-tight text-suwela-navy mt-6">{title}</h3>}
      {children}
    </Tilt>
  );
}

export function CheckItem({ tone = 'green', children }: { tone?: Tone; children: ReactNode }) {
  const c = TONES[tone].to;
  return (
    <li className="flex items-start gap-2.5 text-sm font-medium text-suwela-ink">
      <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${c}1F`, color: c }}>
        <Check className="w-3.5 h-3.5" strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}
