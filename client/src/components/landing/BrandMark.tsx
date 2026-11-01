// The Suwela lockup: leaf-and-cross emblem beside the wordmark. The emblem is
// a raster cut from the supplied logo artwork (public/brand), the type is live
// text so it stays crisp at any size and inherits colour on dark grounds.
interface BrandMarkProps {
  tone?: 'ink' | 'light';
  size?: 'sm' | 'md';
  showHub?: boolean;
  /** Extra classes on the emblem image — the signed-in sidebar sizes it to its own rail. */
  emblemClassName?: string;
  /**
   * Extra classes on the wordmark half. The dashboard sidebar collapses to an
   * icon rail and fades the type in on hover, so it needs to style that half
   * without forking the lockup.
   */
  wordmarkClassName?: string;
}

export default function BrandMark({
  tone = 'ink', size = 'md', showHub = true, emblemClassName = '', wordmarkClassName = '',
}: BrandMarkProps) {
  const emblem = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const word = size === 'sm' ? 'text-lg' : 'text-[22px]';
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/brand/suwela-emblem.png" alt="" className={`${emblem} object-contain shrink-0 ${emblemClassName}`} />
      <span className={`leading-none ${wordmarkClassName}`}>
        <span className={`block font-bold tracking-tight ${word} ${tone === 'ink' ? 'text-suwela-navy' : 'text-white'}`}>
          Suwela
        </span>
        {showHub && (
          <span className={`block mt-1 font-tech text-[9.5px] uppercase tracking-[0.28em] ${tone === 'ink' ? 'text-suwela-slate' : 'text-white/60'}`}>
            Medical Hub
          </span>
        )}
      </span>
    </span>
  );
}
