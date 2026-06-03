import { describe, it, expect, vi, beforeEach } from 'vitest';
import axiosInstance from './authInterceptor';
import AxiosMockAdapter from 'axios-mock-adapter';

describe('authInterceptor', () => {
  let mock: AxiosMockAdapter;

  beforeEach(() => {
    mock = new AxiosMockAdapter(axiosInstance);
    vi.useFakeTimers();
  });

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('debounce blocks immediate retries after 401 and handles token refresh', async () => {
    // 1. 401 on first call to protected endpoint
    mock.onGet('/protected-resource').replyOnce(401);
    
    // 2. Successful refresh reply (simulated with a delay)
    // We use axios (the global one) for the refresh call in our interceptor
    const axiosMock = new AxiosMockAdapter(require('axios').default);
    axiosMock.onPost('/refresh-token').reply(async () => {
      await delay(100);
      return [200, { token: 'newToken' }];
    });

    // 3. Successful retry after refresh
    mock.onGet('/protected-resource').reply(200, { data: 'ok' });

    const firstCallPromise = axiosInstance.get('/protected-resource');

    // Wait a bit to ensure the first call was made
    await vi.advanceTimersByTimeAsync(10);
    
    // Original call must not be retried until refresh completes
    expect(mock.history.get.length).toBe(1); // only original request
    
    // Finish the refresh
    await vi.advanceTimersByTimeAsync(100);
    
    const response = await firstCallPromise;
    expect(response.data).toEqual({ data: 'ok' });
    
    // Verify that the retry used the new token
    expect(mock.history.get.length).toBe(2);
    expect(mock.history.get[1].headers?.Authorization).toBe('Bearer newToken');
    
    axiosMock.restore();
  });

  it('multiple 401s during a single refresh are queued and sent once after token is refreshed', async () => {
    mock.onGet('/protected-resource').replyOnce(401);
    
    const axiosMock = new AxiosMockAdapter(require('axios').default);
    axiosMock.onPost('/refresh-token').reply(async () => {
      await delay(200);
      return [200, { token: 'newToken' }];
    });
    
    mock.onGet('/protected-resource').reply(200, { data: 'ok' });

    const call1 = axiosInstance.get('/protected-resource');
    
    // Advance time so call1 fails with 401 and starts refresh
    await vi.advanceTimersByTimeAsync(10);
    
    // While refresh is happening, make call2 which would also fail with 401 if it were sent
    // But it should be queued
    mock.onGet('/protected-resource').replyOnce(401);
    const call2 = axiosInstance.get('/protected-resource');
    
    await vi.advanceTimersByTimeAsync(10);
    
    // Still only 1 call should have been made to /protected-resource so far
    expect(mock.history.get.length).toBe(1);
    
    // Complete the refresh
    await vi.advanceTimersByTimeAsync(200);
    
    const [res1, res2] = await Promise.all([call1, call2]);
    
    expect(res1.data).toEqual({ data: 'ok' });
    expect(res2.data).toEqual({ data: 'ok' });
    
    // Total calls should be 3: 
    // 1 (call1 original) + 1 (call1 retry) + 1 (call2 original was never sent, it was queued and sent as "retry")
    // Wait, let's think about the logic. 
    // Call 1 fails -> refresh starts.
    // Call 2 arrives -> isRefreshing is true -> queued.
    // Refresh finishes -> retryQueue flushes -> Call 2 is executed -> Call 1 retry is executed.
    // So total 3 calls to /protected-resource.
    expect(mock.history.get.length).toBe(3);
    
    axiosMock.restore();
  });

  it('debounce continues to block further retries if another 401 occurs after refresh', async () => {
    // Initial sequence: Success
    mock.onGet('/protected-resource').reply(200, { data: 'ok' });
    await axiosInstance.get('/protected-resource');
    expect(mock.history.get.length).toBe(1);

    // Now a 401 happens
    mock.onGet('/protected-resource').replyOnce(401);
    
    const axiosMock = new AxiosMockAdapter(require('axios').default);
    axiosMock.onPost('/refresh-token').reply(async () => {
      await delay(50);
      return [200, { token: 'token2' }];
    });
    
    // Next call after refresh succeeds
    mock.onGet('/protected-resource').reply(200, { data: 'ok2' });

    const call = axiosInstance.get('/protected-resource');
    await vi.advanceTimersByTimeAsync(100);
    const res = await call;
    
    expect(res.data).toEqual({ data: 'ok2' });
    expect(mock.history.get.length).toBe(3); // 1 success + 1 fail + 1 retry
    
    axiosMock.restore();
  });
});
