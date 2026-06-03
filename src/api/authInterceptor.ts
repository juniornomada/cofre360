import axios from 'axios';

let isRefreshing = false;
let retryQueue: Array<() => void> = [];
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

const axiosInstance = axios.create();

axiosInstance.interceptors.request.use((config) => {
  if (isRefreshing) {
    return new Promise((resolve) => {
      retryQueue.push(() => {
        if (config.headers && authToken) {
          config.headers['Authorization'] = `Bearer ${authToken}`;
        }
        resolve(config);
      });
    });
  }
  
  if (authToken && config.headers) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    
    if (response?.status !== 401) {
      return Promise.reject(error);
    }

    if (!isRefreshing) {
      isRefreshing = true;
      
      try {
        const refreshResponse = await axios.post('/refresh-token');
        const newToken = refreshResponse.data.token;
        setAuthToken(newToken);
        isRefreshing = false;
        
        // Execute all queued requests
        retryQueue.forEach((callback) => callback());
        retryQueue = [];
        
        // Retry the original request
        if (config.headers) {
          config.headers['Authorization'] = `Bearer ${newToken}`;
        }
        return axiosInstance(config);
      } catch (refreshError) {
        isRefreshing = false;
        retryQueue = [];
        return Promise.reject(refreshError);
      }
    }

    // This part might not be reached if request interceptor is working,
    // but it's good for robustness in case multiple requests are sent simultaneously
    return new Promise((resolve) => {
      retryQueue.push(() => {
        if (config.headers && authToken) {
          config.headers['Authorization'] = `Bearer ${authToken}`;
        }
        resolve(axiosInstance(config));
      });
    });
  }
);

export default axiosInstance;
