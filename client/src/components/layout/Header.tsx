import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Bell, User, Stethoscope, Pill, CheckCircle2, FlaskConical, ClipboardList } from 'lucide-react';

// ── Notification type icons ───────────────────────────────────────────────────
const TYPE_ICON: Record<string, React.ReactNode> = {
  new_consultation:       <Stethoscope size={14} />,
  consultation_assigned:  <Pill size={14} />,
  prescription_dispensed: <CheckCircle2 size={14} />,
  lab_request_assigned:   <FlaskConical size={14} />,
  lab_report_ready:       <ClipboardList size={14} />,
};

const NOTIF_ROUTE: Record<string, (role?: string) => string> = {
  new_consultation:       (role) => role === 'patient'  ? '/patient/medical'      : '/doctor/consultations',
  consultation_assigned:  ()     => '/pharmacist/consultations',
  prescription_dispensed: (role) => role === 'doctor'   ? '/doctor/consultations' : '/patient/medical',
  lab_request_assigned:   ()     => '/laboratory/reports',
  lab_report_ready:       (role) => role === 'doctor'   ? '/doctor/lab-requests'  : '/patient/lab-reports',
  access_request:         ()     => '/patient/requests',
  access_accepted:        ()     => '/doctor/requests',
  access_declined:        ()     => '/doctor/requests',
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Header ────────────────────────────────────────────────────────────────────
export default function Header() {
  const { user }       = useAuth();
  const { newPulse }   = useSocket() || {};
  const navigate       = useNavigate();
  const qc             = useQueryClient();

  const [open,     setOpen]     = useState(false);
  const [ringing,  setRinging]  = useState(false);
  const [badgePop, setBadgePop] = useState(false);
  const dropRef   = useRef<HTMLDivElement>(null);
  const prevPulse = useRef(0);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn:  notificationApi.getAll,
    enabled:  !!user,
    refetchInterval: 60_000,
  });

  const count = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (!newPulse || newPulse === prevPulse.current) return;
    prevPulse.current = newPulse;
    setRinging(true); setBadgePop(true);
    setTimeout(() => setRinging(false),  750);
    setTimeout(() => setBadgePop(false), 400);
  }, [newPulse]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markAllMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOneMutation = useMutation({
    mutationFn: (id: number) => notificationApi.markRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleNotifClick = (n: any) => {
    if (!n.is_read) markOneMutation.mutate(n.id);
    const fn = NOTIF_ROUTE[n.type];
    if (fn) { setOpen(false); navigate(fn(user?.role)); }
  };

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <header className="hidden md:flex h-16 bg-white border-b border-gray-100 items-center justify-between px-7 shrink-0">

      {/* ── Left: greeting ── */}
      <div className="flex flex-col justify-center">
        <h1 className="text-[22px] font-semibold text-gray-900 leading-tight tracking-tight">
          Hello, <span className="font-bold">{firstName}</span>!
        </h1>
        <p className="text-[11px] text-gray-400 leading-none mt-0.5 tracking-wide">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Right: actions ── */}
      <div className="flex items-center gap-1.5">

        {/* Search */}
        <button className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <Search size={17} strokeWidth={1.8} />
        </button>

        {/* Bell */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
              open ? 'bg-gray-100' : 'hover:bg-gray-100'
            } ${ringing ? 'bell-ringing' : ''}`}
          >
            <Bell
              size={17}
              strokeWidth={1.8}
              className={count > 0 ? 'text-primary-600' : 'text-gray-400'}
            />

            {/* Badge */}
            {count > 0 && (
              <span className={`
                absolute top-1 right-1 min-w-[16px] h-4 px-1
                bg-red-500 text-white text-[9px] font-bold rounded-full
                flex items-center justify-center ring-2 ring-white leading-none
                ${badgePop ? 'badge-pop' : ''}
              `}>
                {count > 9 ? '9+' : count}
              </span>
            )}

            {/* Green online dot (no unread) */}
            {count === 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-white" />
            )}

            {ringing && (
              <span className="absolute inset-0 rounded-xl bg-primary-400/20 animate-ping pointer-events-none" />
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">Notifications</span>
                  {count > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {count}
                    </span>
                  )}
                </div>
                {count > 0 && (
                  <button
                    onClick={() => markAllMutation.mutate()}
                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell size={28} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No notifications yet</p>
                  </div>
                ) : notifications.map((n) => {
                  const hasRoute = !!NOTIF_ROUTE[n.type];
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`px-4 py-3 transition-colors group
                        ${!n.is_read ? 'bg-primary-50/40 hover:bg-primary-50' : 'hover:bg-gray-50'}
                        ${hasRoute ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          !n.is_read ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {TYPE_ICON[n.type] || <Bell size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate ${!n.is_read ? 'text-primary-800' : 'text-gray-800'}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                        {!n.is_read && (
                          <span className="w-1.5 h-1.5 bg-primary-500 rounded-full shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {notifications.length > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-50 text-center">
                  <p className="text-[11px] text-gray-400">{notifications.length} total notifications</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User avatar (matches screenshot — circle with initial) */}
        <div className="w-9 h-9 rounded-xl border-2 border-gray-100 bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-bold select-none ml-1">
          {user?.name?.charAt(0)?.toUpperCase() || <User size={16} />}
        </div>
      </div>
    </header>
  );
}
