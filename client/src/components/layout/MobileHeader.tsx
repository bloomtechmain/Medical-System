import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Stethoscope, Pill, CheckCircle2, FlaskConical, ClipboardList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { notificationApi } from '../../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 4-dot logo
function LogoMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <circle cx="7"  cy="7"  r="4.5" fill="#0d9488" />
      <circle cx="17" cy="7"  r="4.5" fill="#0d9488" opacity="0.7" />
      <circle cx="7"  cy="17" r="4.5" fill="#0d9488" opacity="0.7" />
      <circle cx="17" cy="17" r="4.5" fill="#0d9488" opacity="0.4" />
    </svg>
  );
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  new_consultation:       <Stethoscope size={13} />,
  consultation_assigned:  <Pill size={13} />,
  prescription_dispensed: <CheckCircle2 size={13} />,
  lab_request_assigned:   <FlaskConical size={13} />,
  lab_report_ready:       <ClipboardList size={13} />,
};

const NOTIF_ROUTE: Record<string, (role?: string) => string> = {
  new_consultation:       (role) => role === 'patient' ? '/patient/medical'      : '/doctor/consultations',
  consultation_assigned:  ()     => '/pharmacist/consultations',
  prescription_dispensed: (role) => role === 'doctor'  ? '/doctor/consultations' : '/patient/medical',
  lab_request_assigned:   ()     => '/laboratory/reports',
  lab_report_ready:       (role) => role === 'doctor'  ? '/doctor/lab-requests'  : '/patient/lab-reports',
  access_request:         ()     => '/patient/requests',
  access_accepted:        ()     => '/doctor/requests',
  access_declined:        ()     => '/doctor/requests',
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function MobileHeader() {
  const { user }      = useAuth();
  const { newPulse }  = useSocket() || {};
  const navigate      = useNavigate();
  const qc            = useQueryClient();

  const [open,    setOpen]    = useState(false);
  const [ringing, setRinging] = useState(false);
  const [badgePop,setBadgePop]= useState(false);
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
    setTimeout(() => setRinging(false), 750);
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

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 shadow-sm">

      {/* Left: logo + name */}
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="text-sm font-bold text-gray-900 tracking-tight">Core Health</span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1" ref={dropRef}>

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
              open ? 'bg-gray-100' : 'hover:bg-gray-100'
            } ${ringing ? 'bell-ringing' : ''}`}
          >
            <Bell size={17} strokeWidth={1.8} className={count > 0 ? 'text-primary-600' : 'text-gray-500'} />
            {count > 0 ? (
              <span className={`absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white ${badgePop ? 'badge-pop' : ''}`}>
                {count > 9 ? '9+' : count}
              </span>
            ) : (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full ring-[1.5px] ring-white" />
            )}
            {ringing && <span className="absolute inset-0 rounded-xl bg-primary-400/20 animate-ping pointer-events-none" />}
          </button>

          {/* Notification dropdown — full-width on mobile */}
          {open && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">Notifications</span>
                  {count > 0 && <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>}
                </div>
                {count > 0 && (
                  <button onClick={() => markAllMutation.mutate()} className="text-xs font-semibold text-primary-600">
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bell size={24} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No notifications</p>
                  </div>
                ) : notifications.slice(0, 10).map(n => {
                  const hasRoute = !!NOTIF_ROUTE[n.type];
                  return (
                    <div key={n.id} onClick={() => handleNotifClick(n)}
                      className={`flex items-start gap-3 px-4 py-3 active:bg-gray-50 ${hasRoute ? 'cursor-pointer' : ''} ${!n.is_read ? 'bg-primary-50/40' : ''}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${!n.is_read ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                        {TYPE_ICON[n.type] || <Bell size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${!n.is_read ? 'text-primary-800' : 'text-gray-800'}`}>{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.created_at)} ago</p>
                      </div>
                      {!n.is_read && <span className="w-1.5 h-1.5 bg-primary-500 rounded-full shrink-0 mt-2" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-xs font-bold ml-1 select-none">
          {user?.name?.charAt(0)?.toUpperCase()}
        </div>
      </div>
    </header>
  );
}
