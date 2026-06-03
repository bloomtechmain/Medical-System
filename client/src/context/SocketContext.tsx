import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

interface SocketContextValue {
  newPulse: number;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const NOTIF_ICONS: Record<string, string> = {
  new_consultation:       '🩺',
  consultation_assigned:  '💊',
  prescription_dispensed: '✅',
};

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { token }      = useAuth();
  const queryClient    = useQueryClient();
  const socketRef      = useRef<Socket | null>(null);
  // Increments each time a real-time notification arrives — Header watches this to ring the bell
  const [newPulse, setNewPulse] = useState(0);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification', (notif: { message: string; type: string }) => {
      // Refresh notifications list
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Signal bell animation
      setNewPulse(p => p + 1);

      // When a lab report arrives, also refresh vitals so they update automatically
      if (notif.type === 'lab_report_ready') {
        queryClient.invalidateQueries({ queryKey: ['patient-vitals'] });
        queryClient.invalidateQueries({ queryKey: ['patient-lab-reports'] });
      }

      // Toast
      toast(notif.message, {
        icon:  NOTIF_ICONS[notif.type] || '🔔',
        duration: 5000,
        style: { maxWidth: 380 },
      });
    });

    socket.on('connect_error', () => {});
    socketRef.current = socket;

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token, queryClient]);

  return (
    <SocketContext.Provider value={{ newPulse }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextValue | null => useContext(SocketContext);
