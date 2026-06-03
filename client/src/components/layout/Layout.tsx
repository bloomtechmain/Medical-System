import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';

export default function Layout() {
  return (
    <div className="h-screen bg-slate-50 overflow-hidden">

      {/* ── Desktop sidebar (fixed, hidden on mobile) ── */}
      <Sidebar />

      {/* ── Mobile top header (fixed, hidden on desktop) ── */}
      <MobileHeader />

      {/* ── Main column ──
          • Desktop: offset 70 px for the collapsed sidebar
          • Mobile: no offset (sidebar hidden), but padded top/bottom for
            the fixed mobile header (56 px) and bottom nav (64 px)        */}
      <div className="flex flex-col h-screen overflow-hidden md:ml-[70px]">

        {/* Desktop header row (hidden on mobile) */}
        <Header />

        {/* Scrollable content
            pt-14   = space below fixed mobile header (56 px) on mobile
            pb-20   = space above fixed mobile bottom-nav (80 px) on mobile
            md resets both so desktop layout is unaffected                 */}
        <main className="flex-1 overflow-y-auto p-4 pt-[72px] pb-[88px] md:p-6 md:pt-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav (fixed, hidden on desktop) ── */}
      <MobileBottomNav />
    </div>
  );
}
