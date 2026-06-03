import { useState, useCallback, useRef } from 'react';
import axiosInstance from '@/api/authInterceptor';
import { AxiosRequestConfig } from 'axios';

export function useApiAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const lastCallRef = useRef<Record<string, number>>({});
  
  const apiCall = useCallback(async (config: AxiosRequestConfig) => {
    const now = Date.now();
    const url = config.url || 'default';
    
    // Simple debounce logic: 1 second between calls to the same URL
    if (lastCallRef.current[url] && now - lastCallRef.current[url] < 1000) {
      console.log(`[useApiAuth] Debounced call to ${url}`);
      return Promise.reject(new Error('Debounced'));
    }
    
    lastCallRef.current[url] = now;
    setIsLoading(true);
    
    try {
      const response = await axiosInstance(config);
      return response.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { apiCall, isLoading };
}
