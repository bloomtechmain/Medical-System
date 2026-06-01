import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const ROLE_GREETINGS = {
  admin:      'System Administrator',
  doctor:     'Medical Doctor',
  pharmacist: 'Licensed Pharmacist',
  patient:    'Patient',
};

const TYPE_ICON = {
  new_consultation:       '🩺',
  consultation_assigned:  '💊',
  prescription_dispensed: '✅',
  lab_request_assigned:   '🔬',
  lab_report_ready:       '📋',
};

const NOTIF_ROUTE = {
  new_consultation:       (role) => role === 'patient'    ? '/patient/medical'         : '/doctor/consultations',
  consultation_assigned:  ()     => '/pharmacist/consultations',
  prescription_dispensed: (role) => role === 'doctor'     ? '/doctor/consultations'    : '/patient/medical',
  lab_request_assigned:   ()     => '/laboratory/reports',
  lab_report_ready:       (role) => role === 'doctor'     ? '/doctor/lab-requests'     : '/patient/lab-reports',
};

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Header() {
  const { user, logout }  = useAuth();
  const { newPulse }      = useSocket() || {};
  const navigate          = useNavigate();
  const qc                = useQueryClient();

  const [open,     setOpen]     = useState(false);
  const [ringing,  setRinging]  = useState(false);
  const [badgePop, setBadgePop] = useState(false);
  const ref       = useRef();
  const prevPulse = useRef(0);

  // ── Fetch notifications from DB ──────────────────────────────
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn:  notificationApi.getAll,
    enabled:  !!user,
    // Refetch every 60 s as a fallback in case socket misses something
    refetchInterval: 60_000,
  });

  // count is always derived straight from query data — no extra state needed
  const count = notifications.filter(n => !n.is_read).length;

  // ── Ring bell when socket fires a new notification ───────────
  useEffect(() => {
    if (!newPulse || newPulse === prevPulse.current) return;
    prevPulse.current = newPulse;
    setRinging(true);
    setBadgePop(true);
    setTimeout(() => setRinging(false),  750);
    setTimeout(() => setBadgePop(false), 400);
  }, [newPulse]);

  // ── Close dropdown on outside click ─────────────────────────
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Mutations ────────────────────────────────────────────────
  const markAllMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // ── Notification click: mark read + navigate ─────────────────
  const handleNotifClick = (notif) => {
    if (!notif.is_read) markOneMutation.mutate(notif.id);
    const routeFn = NOTIF_ROUTE[notif.type];
    if (routeFn) { setOpen(false); navigate(routeFn(user?.role)); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      {/* Left: welcome */}
      <div>
        <span className="text-sm text-gray-500">
          Welcome, <span className="font-semibold text-gray-800">{user?.name}</span>
        </span>
        <span className="hidden sm:inline text-xs text-gray-400 ml-2">
          · {ROLE_GREETINGS[user?.role]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* ── Bell button ── */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={`Notifications${count > 0 ? ` — ${count} unread` : ''}`}
            className={`relative p-2 rounded-xl transition-all ${ringing ? 'bell-ringing' : ''}`}
          >
            {count > 0 ? (
              /* ── Active state: filled teal bell ── */
              <div className="relative">
                <div className="w-9 h-9 bg-primary-600 hover:bg-primary-700 rounded-xl flex items-center justify-center transition-colors shadow-sm">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                  </svg>
                </div>
                {/* Count badge */}
                <span className={`
                  absolute -top-1.5 -right-1.5
                  min-w-[20px] h-5 px-1.5
                  bg-red-500 text-white text-[11px] font-bold
                  rounded-full flex items-center justify-center
                  ring-2 ring-white leading-none select-none
                  ${badgePop ? 'badge-pop' : ''}
                `}>
                  {count > 99 ? '99+' : count}
                </span>
              </div>
            ) : (
              /* ── Idle state: outline bell ── */
              <div className="w-9 h-9 hover:bg-gray-100 rounded-xl flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
            )}

            {/* Ripple on new notification */}
            {ringing && (
              <span className="absolute inset-0 rounded-xl bg-primary-400 opacity-25 animate-ping pointer-events-none" />
            )}
          </button>

          {/* ── Dropdown ── */}
          {open && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">Notifications</span>
                  {count > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {count} new
                    </span>
                  )}
                </div>
                {count > 0 && (
                  <button
                    onClick={() => markAllMutation.mutate()}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-3xl mb-2">🔔</p>
                    <p className="text-sm text-gray-400">No notifications yet</p>
                  </div>
                ) : notifications.map((n) => {
                  const hasRoute = !!NOTIF_ROUTE[n.type];
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`px-4 py-3 transition-colors group
                        ${!n.is_read ? 'bg-primary-50/60 hover:bg-primary-50' : 'hover:bg-gray-50'}
                        ${hasRoute ? 'cursor-pointer' : 'cursor-default'}
                      `}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 mt-0.5
                          ${!n.is_read ? 'bg-primary-100' : 'bg-gray-100'}`}>
                          {TYPE_ICON[n.type] || '🔔'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-xs font-semibold truncate ${!n.is_read ? 'text-primary-800' : 'text-gray-800'}`}>
                              {n.title}
                            </p>
                            {hasRoute && (
                              <svg className="w-3 h-3 text-gray-300 group-hover:text-primary-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400">{timeAgo(n.created_at)}</p>
                            {hasRoute && (
                              <span className="text-xs text-primary-500 group-hover:underline">View →</span>
                            )}
                          </div>
                        </div>
                        {!n.is_read && (
                          <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-center">
                  <p className="text-xs text-gray-400">{notifications.length} total</p>
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={handleLogout} className="btn-secondary text-xs py-1.5">
          Sign out
        </button>
      </div>
    </header>
  );
}
