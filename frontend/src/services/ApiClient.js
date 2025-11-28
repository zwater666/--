/**
 * 增强的 API 客户端
 * 支持重试、超时、错误处理和自动刷新
 */

import CONFIG from '../../config.js';

class ApiClient {
  constructor() {
    this.baseURL = CONFIG.API.BASE_URL;
    this.timeout = CONFIG.API.TIMEOUT;
    this.retryCount = CONFIG.API.RETRY_COUNT;
    this.retryDelay = CONFIG.API.RETRY_DELAY;
    this.isOnline = true;
  }

  /**
   * 执行 HTTP 请求（带重试和超时）
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    let lastError;
    let attempt = 0;

    while (attempt < this.retryCount) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // 401 不重试（认证失败）
          if (response.status === 401) {
            throw new Error(`认证失败: ${response.status}`);
          }
          // 4xx 错误不重试
          if (response.status >= 400 && response.status < 500) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `请求失败: ${response.status}`);
          }
          // 5xx 错误和网络错误重试
          throw new Error(`服务器错误: ${response.status}`);
        }

        this.isOnline = true;
        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error;
        attempt++;

        // 判断是否应该重试
        const shouldRetry =
          attempt < this.retryCount &&
          (error.name === 'AbortError' || // 超时
            error.message.includes('服务器错误') || // 5xx
            error.message.includes('网络') || // 网络错误
            !navigator.onLine); // 离线

        if (shouldRetry) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // 指数退避
          console.warn(
            `[ApiClient] 请求失败 (尝试 ${attempt}/${this.retryCount}), ${delay}ms 后重试:`,
            error.message
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          this.isOnline = false;
          break;
        }
      }
    }

    console.error(`[ApiClient] 请求最终失败 (${url}):`, lastError.message);
    throw lastError;
  }

  /**
   * 登录
   */
  async login(email, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  /**
   * 注册
   */
  async register(username, email, password) {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  /**
   * 获取投资组合数据
   */
  async getPortfolio(token) {
    return this.request('/portfolio', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * 执行交易
   */
  async trade(token, tradeData) {
    return this.request('/trade', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(tradeData),
    });
  }

  /**
   * 获取实时行情
   */
  async getStocks(codes) {
    const codesParam = codes ? `?codes=${codes.join(',')}` : '';
    return this.request(`/stocks${codesParam}`);
  }

  /**
   * 获取全市场股票列表
   */
  async getStocksList(page = 1, pageSize = 100) {
    return this.request(`/stocks/list?page=${page}&pageSize=${pageSize}`);
  }

  /**
   * 健康检查
   */
  async health() {
    try {
      return await this.request('/health');
    } catch (e) {
      return { status: 'OFFLINE', message: e.message };
    }
  }
}

export default new ApiClient();
