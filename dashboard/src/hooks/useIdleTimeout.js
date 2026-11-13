import { useEffect, useRef } from 'react';
import { IDLE_TIMEOUT_MS, LAST_ACTIVITY_KEY } from '../constants/kost';

export function useIdleTimeout(isAuthenticated, onTimeout) {
  const lastActivityRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > 1000) {
        lastActivityRef.current = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      }
    };

    const checkIdle = () => {
      const storedLastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
      const lastActive = Math.max(lastActivityRef.current, storedLastActivity);
      if (lastActive && Date.now() - lastActive > IDLE_TIMEOUT_MS) {
        onTimeout('Sesi Anda berakhir karena tidak ada aktivitas selama 5 menit.');
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === LAST_ACTIVITY_KEY && e.newValue) {
        const timestamp = Number(e.newValue);
        if (timestamp) {
          lastActivityRef.current = Math.max(lastActivityRef.current, timestamp);
        }
      }
    };

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        checkIdle();
      }
    };

    const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    const interval = setInterval(checkIdle, 2000);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isAuthenticated, onTimeout]);
}

