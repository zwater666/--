/**
 * 应用配置文件 - 统一管理 API 地址、超时等全局设置
 */

// 从环境变量或默认值读取配置
const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return undefined;
};

const API_URL = getEnv('REACT_APP_API_URL') || 
               (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                ? `http://${window.location.hostname}:5000/api` 
                : '/api');

const API_TIMEOUT = parseInt(getEnv('REACT_APP_API_TIMEOUT') || '10000');
const API_RETRY_COUNT = parseInt(getEnv('REACT_APP_API_RETRY') || '3');
const API_RETRY_DELAY = parseInt(getEnv('REACT_APP_API_RETRY_DELAY') || '1000');

const CONFIG = {
  // API 配置
  API: {
    BASE_URL: API_URL,
    TIMEOUT: API_TIMEOUT,
    RETRY_COUNT: API_RETRY_COUNT,
    RETRY_DELAY: API_RETRY_DELAY,
  },
  
  // 数据持久化配置
  STORAGE: {
    USER_KEY: 'stock_ai_user',
    TOKEN_KEY: 'stock_ai_token',
    ACCOUNT_KEY: 'stock_ai_account',
    CACHE_EXPIRY: 5 * 60 * 1000, // 5分钟缓存过期
  },
  
  // 市场数据配置
  MARKET: {
    QUOTE_REFRESH_INTERVAL: 30000, // 30秒更新一次行情
    CACHE_DURATION: 5 * 60 * 1000, // 5分钟缓存
    CHART_ANIMATION_DURATION: 500,
  },
};

export default CONFIG;
