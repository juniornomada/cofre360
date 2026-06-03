import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiAuth } from './useApiAuth';
import axiosInstance, { resetAuthInterceptor } from '@/api/authInterceptor';
import axios from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';

describe('useApiAuth when receiving multiple 401s in sequence', () => {
  let mock: AxiosMockAdapter;
  let globalMock: AxiosMockAdapter;

  beforeEach(() => {
    resetAuthInterceptor();
    mock = new AxiosMockAdapter(axiosInstance);
    globalMock = new AxiosMockAdapter(axios);
    vi.useFakeTimers();
  });

  afterEach(() => {
    mock.restore();
    globalMock.restore();
    vi.useRealTimers();
  });

  it('should renew token after first failure and retry correctly while hook debounce blocks others', async () => {
    // 1. Mock 401 on first call
    mock.onGet('/data').replyOnce(401);
    
    // 2. Mock refresh success
    globalMock.onPost('/refresh-token').reply(async () => {
      await new Promise(r => setTimeout(r, 100));
      return [200, { token: 'new-token' }];
    });
    
    // 3. Mock retry success
    mock.onGet('/data').reply(200, { success: true });

    const { result } = renderHook(() => useApiAuth());

    const successHandler = vi.fn();
    const errorHandler = vi.fn();

    // Trigger 4 calls in sequence
    // Our useApiAuth hook has a 1s debounce for the same URL.
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        result.current.apiCall({ url: '/data', method: 'GET' })
          .then(successHandler)
          .catch(errorHandler);
      }
    });

    // 1st call: allowed by hook debounce -> fails with 401 -> starts refresh.
    // 2nd, 3rd, 4th calls: blocked by hook debounce (since they happened within 1s).
    
    // Wait for the 1st call's 401 to be processed
    await vi.advanceTimersByTimeAsync(10);
    
    // Total handler calls so far: 3 errors (from hook debounce)
    expect(errorHandler).toHaveBeenCalledTimes(3);
    expect(successHandler).toHaveBeenCalledTimes(0);

    // Finish the refresh
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    
    // Now the 1st call's retry should have finished
    expect(successHandler).toHaveBeenCalledTimes(1);
    
    // Total handler calls: 3 errors + 1 success = 4
    expect(errorHandler).toHaveBeenCalledTimes(3);
    expect(successHandler).toHaveBeenCalledTimes(1);
  });
});
