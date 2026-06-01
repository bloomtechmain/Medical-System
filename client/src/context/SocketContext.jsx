import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const NOTIF_ICONS = {
  new_consultation:       '🩺',
  consultation_assigned:  '💊',
  prescription_dispensed: '✅',
};

export const SocketProvider = ({ children }) => {
  const { token }      = useAuth();
  const queryClient    = useQueryClient();
  const socketRef      = useRef(null);
  // Increments each time a real-time notification arrives — Header watches this to ring the bell
  const [newPulse, setNewPulse] = useState(0);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification', (notif) => {
      // Refresh the notifications list in React Query cache
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Signal bell animation
      setNewPulse(p => p + 1);
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

export const useSocket = () => useContext(SocketContext);
