import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axiosInstance, { resetAuthInterceptor } from './authInterceptor';
import axios from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';

describe('authInterceptor', () => {
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

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('debounce blocks immediate retries after 401 and handles token refresh', async () => {
    // 1. 401 on first call to protected endpoint
    mock.onGet('/protected-resource').replyOnce(401);
    
    // 2. Successful refresh reply
    globalMock.onPost('/refresh-token').reply(async () => {
      await delay(100);
      return [200, { token: 'newToken' }];
    });

    // 3. Successful retry after refresh
    mock.onGet('/protected-resource').reply(200, { data: 'ok' });

    const firstCallPromise = axiosInstance.get('/protected-resource');

    // Wait a bit to ensure the first call was made
    await vi.advanceTimersByTimeAsync(10);
    
    // Original call must not be retried until refresh completes
    expect(mock.history.get.length).toBe(1); 
    
    // Finish the refresh
    await vi.advanceTimersByTimeAsync(100);
    
    const response = await firstCallPromise;
    expect(response.data).toEqual({ data: 'ok' });
    
    // Verify that the retry used the new token
    expect(mock.history.get.length).toBe(2);
    expect(mock.history.get[1].headers?.Authorization).toBe('Bearer newToken');
  });

  it('multiple 401s during a single refresh are queued and sent once after token is refreshed', async () => {
    mock.onGet('/protected-resource').replyOnce(401);
    
    globalMock.onPost('/refresh-token').reply(async () => {
      await delay(200);
      return [200, { token: 'newToken' }];
    });
    
    // The retry of the first call and subsequent queued calls
    mock.onGet('/protected-resource').reply(200, { data: 'ok' });

    const call1 = axiosInstance.get('/protected-resource');
    
    await vi.advanceTimersByTimeAsync(10);
    
    // While refresh is happening, make call2
    const call2 = axiosInstance.get('/protected-resource');
    
    await vi.advanceTimersByTimeAsync(10);
    
    // Only 1 call should have been made to /protected-resource so far (the first one that failed)
    expect(mock.history.get.length).toBe(1);
    
    // Complete the refresh
    await vi.advanceTimersByTimeAsync(200);
    
    const [res1, res2] = await Promise.all([call1, call2]);
    
    expect(res1.data).toEqual({ data: 'ok' });
    expect(res2.data).toEqual({ data: 'ok' });
    
    // Total calls should be 3: 
    // 1 (call1 fail) + 1 (call1 retry) + 1 (call2 queued then sent)
    expect(mock.history.get.length).toBe(3);
  });

  it('debounce continues to block further retries if another 401 occurs after refresh', async () => {
    // Initial sequence: Success
    mock.onGet('/protected-resource').reply(200, { data: 'ok' });
    await axiosInstance.get('/protected-resource');
    expect(mock.history.get.length).toBe(1);

    // Now a 401 happens
    mock.onGet('/protected-resource').replyOnce(401);
    
    globalMock.onPost('/refresh-token').reply(async () => {
      await delay(50);
      return [200, { token: 'token2' }];
    });
    
    // Setup the mock for the retry to succeed
    // We use a function to make it easier to track
    const retryHandler = vi.fn().mockReturnValue([200, { data: 'ok2' }]);
    mock.onGet('/protected-resource').reply(retryHandler);

    const callPromise = axiosInstance.get('/protected-resource');
    
    // Wait for the failure and refresh to start
    await vi.advanceTimersByTimeAsync(10);
    
    // Complete refresh
    await vi.advanceTimersByTimeAsync(100);
    
    const res = await callPromise;
    expect(res.data).toEqual({ data: 'ok2' });
    
    // Total history: 
    // 1. Initial success
    // 2. 401 failure
    // 3. Retry success
    expect(mock.history.get.length).toBe(3);
    expect(retryHandler).toHaveBeenCalled();
  });
});
