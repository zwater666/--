/**
 * 增强的数据同步服务
 * 负责处理数据的持久化、缓存和同步
 */

class DataSyncService {
  constructor() {
    this.syncListeners = [];
    this.cache = new Map();
    this.pendingRequests = new Map();
  }

  /**
   * 注册数据变化监听器
   */
  onDataSync(callback) {
    this.syncListeners.push(callback);
    return () => {
      this.syncListeners = this.syncListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * 触发数据同步事件
   */
  emitSync(type, data) {
    this.syncListeners.forEach(listener => {
      try {
        listener({ type, data, timestamp: Date.now() });
      } catch (e) {
        console.error('DataSync listener error:', e);
      }
    });
  }

  /**
   * 保存账户数据到 localStorage
   */
  saveAccount(accountState, token) {
    try {
      const data = {
        ...accountState,
        savedAt: Date.now(),
      };
      localStorage.setItem('stock_ai_account', JSON.stringify(data));
      this.emitSync('account', data);
      return true;
    } catch (e) {
      console.error('Failed to save account:', e);
      return false;
    }
  }

  /**
   * 从 localStorage 恢复账户数据
   */
  loadAccount() {
    try {
      const stored = localStorage.getItem('stock_ai_account');
      if (stored) {
        const data = JSON.parse(stored);
        // 检查数据是否过期（超过1小时）
        if (Date.now() - data.savedAt < 3600000) {
          return data;
        } else {
          localStorage.removeItem('stock_ai_account');
          return null;
        }
      }
      return null;
    } catch (e) {
      console.error('Failed to load account:', e);
      localStorage.removeItem('stock_ai_account');
      return null;
    }
  }

  /**
   * 缓存数据
   */
  setCache(key, value, expiryMs = 5 * 60 * 1000) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + expiryMs,
    });
  }

  /**
   * 获取缓存数据
   */
  getCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 判断是否有待处理请求（用于防止重复请求）
   */
  hasPendingRequest(key) {
    const pending = this.pendingRequests.get(key);
    return pending && pending > Date.now();
  }

  /**
   * 标记待处理请求
   */
  markPendingRequest(key, durationMs = 3000) {
    this.pendingRequests.set(key, Date.now() + durationMs);
  }

  /**
   * 清除待处理请求标记
   */
  clearPendingRequest(key) {
    this.pendingRequests.delete(key);
  }
}

export default new DataSyncService();
