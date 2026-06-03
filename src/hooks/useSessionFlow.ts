import { useState, useCallback, useEffect, useRef } from 'react';
import { authSettings } from '@/lib/auth-settings';
import axiosInstance from '@/api/authInterceptor';

export function useSessionFlow() {
  const [message, setMessage] = useState<string | null>(null);
  const [debounceActive, setDebounceActive] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const lastAuthAttemptRef = useRef<number>(0);

  const updateCountdown = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastAuthAttemptRef.current;
    if (elapsed < authSettings.debounceDelay) {
      setRemainingTime(Math.ceil((authSettings.debounceDelay - elapsed) / 1000));
      setDebounceActive(true);
    } else {
      setRemainingTime(0);
      setDebounceActive(false);
    }
  }, []);

  useEffect(() => {
    let interval: any;
    if (debounceActive) {
      interval = setInterval(updateCountdown, 1000);
    }
    return () => clearInterval(interval);
  }, [debounceActive, updateCountdown]);

  const login = useCallback(async (credentials: any) => {
    const now = Date.now();
    const elapsed = now - lastAuthAttemptRef.current;
    
    if (elapsed < authSettings.debounceDelay && lastAuthAttemptRef.current !== 0) {
      updateCountdown();
      return { status: 'blocked', remaining: remainingTime };
    }

    lastAuthAttemptRef.current = now;
    setDebounceActive(true);
    updateCountdown();

    try {
      // Simulating login API call
      // In a real app, this would be an axios call
      const response = await axiosInstance.post('/login', credentials);
      
      if (response.status === 200) {
        localStorage.setItem('token', response.data.token);
        setMessage(null);
        return { status: 'success', data: response.data };
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        setMessage("Sessão expirada. Por favor, faça login novamente.");
      }
      throw error;
    }
    return { status: 'error' };
  }, [remainingTime, updateCountdown]);

  const trigger401 = useCallback(() => {
    setMessage("Sessão expirada. Por favor, faça login novamente.");
    setDebounceActive(true);
    lastAuthAttemptRef.current = Date.now();
    updateCountdown();
  }, [updateCountdown]);

  return {
    message,
    debounceActive,
    remainingTime,
    login,
    trigger401,
    setMessage
  };
}
