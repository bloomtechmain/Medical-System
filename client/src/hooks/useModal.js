import { useState, useCallback } from 'react';

export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState(null);

  const open = useCallback((payload = null) => {
    setData(payload);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  return { isOpen, data, open, close };
};
