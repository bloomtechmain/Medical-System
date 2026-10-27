import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from './BrandMark';
import { ROLES } from './roles';
import { Leaf, Cross, Capsule, Ring, Dots } from './Shapes';

// Frame for the account pages (sign in, sign up): a branded panel on the left
// on large screens, the page's own form on the right. Only presentation — the
// pages keep all of their logic.
interface AuthShellProps {
  title: ReactNode;
  text: string;
  children: ReactNode;
}

export default function AuthShell({ title, text, children }: AuthShellProps) {
  return (
    <div className="min-h-screen flex bg-suwela-paper">
      <aside className="hidden lg:flex lg:w-[44%] xl:w-[42%] sticky top-0 h-screen relative overflow-hidden flex-col justify-between p-12 text-white"
             style={{ backgroundColor: '#0E2C52', backgroundImage: 'linear-gradient(155deg, #123E6E 0%, #0E2C52 45%, #0B5E6E 100%)' }}>
        <Leaf from="#43CE9F" to="#13A58F" className="absolute -right-20 -top-16 w-96 h-96 opacity-25 sw-float" />
        <Cross from="#5CC6FF" to="#1598E9" className="absolute right-16 bottom-40 w-24 h-24 opacity-60 sw-float" style={{ animationDelay: '1s' }} />
        <Capsule from="#A68BF0" to="#6A4DB6" className="absolute right-8 top-[34%] w-16 h-16 opacity-50 sw-float" style={{ animationDelay: '2s' }} />
        <Ring from="#FFB36B" to="#EF7B2D" className="absolute -left-6 bottom-24 w-24 h-24 opacity-40 sw-float" style={{ animationDelay: '.6s' }} />
        <Dots color="#ffffff" className="absolute right-24 bottom-16 w-24 h-24 opacity-15" />

        <Link to="/" className="relative self-start"><BrandMark tone="light" /></Link>

        <div className="relative">
          <h2 className="font-display text-5xl leading-[1.08]">{title}</h2>
          <p className="mt-4 text-lg text-white/75 max-w-md leading-relaxed">{text}</p>
          <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
            {ROLES.map(r => (
              <div key={r.id} className="group flex flex-col items-center gap-2 rounded-2xl bg-white/[0.07] px-2 py-4 transition-colors hover:bg-white/[0.12]">
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:-translate-y-1"
                      style={{ backgroundColor: r.color, backgroundImage: `linear-gradient(135deg, ${r.tint}, ${r.color})` }}>
                  <r.icon className="w-6 h-6" />
                </span>
                <span className="text-xs font-semibold text-white/85 text-center leading-tight">{r.short}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/45">© {new Date().getFullYear()} Suwela Medical Hub · Built by BloomTech</p>
      </aside>

      <main className="relative flex-1 flex flex-col items-center px-4 sm:px-6 py-8 lg:py-12 overflow-hidden">
        <Leaf from="#43CE9F" to="#13A58F" className="absolute -right-16 -top-16 w-56 h-56 opacity-10" />
        <Cross from="#31B0F7" to="#1598E9" className="absolute -left-10 bottom-10 w-40 h-40 opacity-[0.07]" />
        <Link to="/" className="relative lg:hidden mb-8"><BrandMark /></Link>
        <div className="relative w-full flex-1 flex flex-col items-center justify-center">{children}</div>
      </main>
    </div>
  );
}
