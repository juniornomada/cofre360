import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionFlow } from './useSessionFlow';
import axiosInstance, { resetAuthInterceptor } from '@/api/authInterceptor';
import axios from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { authSettings } from '@/lib/auth-settings';

describe('useSessionFlow Integration', () => {
  let mock: AxiosMockAdapter;
  let globalMock: AxiosMockAdapter;

  beforeEach(() => {
    resetAuthInterceptor();
    localStorage.clear();
    mock = new AxiosMockAdapter(axiosInstance);
    globalMock = new AxiosMockAdapter(axios);
    vi.useFakeTimers();
  });

  afterEach(() => {
    mock.restore();
    globalMock.restore();
    vi.useRealTimers();
  });

  it('should handle 401, re-authenticate, and respect 2-minute debounce', async () => {
    const { result } = renderHook(() => useSessionFlow());

    // 1. Chamada inicial que gera 401
    await act(async () => {
      result.current.trigger401();
    });

    expect(result.current.message).toBe("Sessão expirada. Por favor, faça login novamente.");
    expect(result.current.debounceActive).toBe(true);

    // 2. Reautenticação bem-sucedida
    const newToken = 'new-valid-token';
    mock.onPost('/login').reply(200, { token: newToken });

    // Try re-authenticating (first attempt after 401 is allowed to set the "last auth attempt" time)
    // Actually the requirement says re-auth is allowed after 401, but THEN it blocks for 2 mins.
    
    // In our hook, trigger401 sets the lastAuthAttemptRef to now.
    // So the next login call immediately after trigger401 might be blocked if we don't handle it.
    // Let's advance time or adjust logic. 
    // Requirement 3.1: "Tentar reautenticar imediatamente após a revogação (esperar debounceDelay = 2 min)"
    // This implies that AFTER the 401 event, there is a debounce.
    
    // Let's advance time so the login is allowed if needed, 
    // or assume the first login attempt AFTER 401 is the one that sets the debounce.
    
    // Step 2.1: Login success
    await act(async () => {
      // For the test, we want this login to succeed. 
      // If trigger401 already set the debounce, we advance time if we want to bypass it, 
      // or we change the hook to allow the NEXT login if it's the first one after 401.
      // But let's just advance time by authSettings.debounceDelay + 1
      vi.advanceTimersByTime(authSettings.debounceDelay + 1000);
      await result.current.login({ user: 'test' });
    });

    expect(localStorage.getItem('token')).toBe(newToken);
    expect(result.current.message).toBe(null);

    // 3. Testar o comportamento do debounce (bloqueio por 2 min)
    // Trigger another 401 or just try login again immediately
    await act(async () => {
      result.current.trigger401(); // This sets lastAuthAttemptRef to now
    });
    
    expect(result.current.debounceActive).toBe(true);

    // Try login again immediately
    await act(async () => {
      const loginResult = await result.current.login({ user: 'test' });
      expect(loginResult.status).toBe('blocked');
    });

    expect(result.current.remainingTime).toBeGreaterThan(0);
    expect(result.current.remainingTime).toBeLessThanOrEqual(120);
    
    // Countdown check
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remainingTime).toBe(119);

    // 4. Wait 2 minutes and confirm debounce is reset
    await act(async () => {
      vi.advanceTimersByTime(authSettings.debounceDelay);
    });
    
    expect(result.current.debounceActive).toBe(false);
    expect(result.current.remainingTime).toBe(0);
  });
});
