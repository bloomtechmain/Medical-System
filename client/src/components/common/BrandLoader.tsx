// Shown while a lazily-loaded route chunk is fetched (App's Suspense fallback).
// Purely presentational — no data, no side effects.
export default function BrandLoader() {
  return (
    <div className="sw-paper flex flex-col items-center justify-center h-screen gap-5" role="status" aria-live="polite">
      <img src="/brand/suwela-emblem.png" alt="" className="w-16 h-16 object-contain sw-breathe" />
      <div className="text-center">
        <p className="font-bold text-xl tracking-tight text-suwela-navy">Suwela</p>
        <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-suwela-slate mt-1">Medical Hub</p>
      </div>
      <div className="relative w-28 h-[3px] rounded-full bg-suwela-line overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-suwela-blue to-suwela-mint sw-sweep" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
