require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

console.log('配置信息:');
console.log(`数据库主机: ${process.env.DB_HOST}`);
console.log(`数据库用户: ${process.env.DB_USER}`);
console.log(`数据库名: ${process.env.DB_NAME}`);
console.log(`端口: ${process.env.PORT || 5000}`);

// 模拟用户存储（用于演示）
const mockUsers = {
    'test@test.com': {
        id: 1,
        username: 'testuser',
        email: 'test@test.com',
        password_hash: '$2a$10$YIjlrJxnM8XZ7Z7Z7Z7Z7eTZ7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z',
        risk_profile: 'medium',
        balance: 1000000
    }
};

// 每个用户的投资组合（内存模拟持久化）
// 结构：{ [userId]: { balance: number, holdings: Array<{stockId, code, name, shares, avgCost}>, transactions: Array<...> } }
const portfolios = {};

// 数据库连接池
let pool;
let dbHealthy = false;

try {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableTimeout: false
    });
    
    // 测试连接
    pool.getConnection().then(conn => {
        console.log('✅ 数据库连接成功');
        dbHealthy = true;
        conn.release();
    }).catch(err => {
        console.warn('⚠️  数据库初始连接失败:', err.message);
        dbHealthy = false;
    });
} catch (error) {
    console.error('❌ 数据库连接池创建失败:', error);
    console.log('⚠️  将使用本地模拟数据');
    pool = null;
    dbHealthy = false;
}

// 初始化数据库表结构（如果可用）
async function ensureSchema() {
    if (!pool) return;
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              username VARCHAR(255) NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              risk_profile VARCHAR(16) DEFAULT 'medium',
              balance DECIMAL(18,2) DEFAULT 1000000
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS holdings (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              stock_id VARCHAR(64) NOT NULL,
              code VARCHAR(32) NOT NULL,
              name VARCHAR(255) NOT NULL,
              shares INT NOT NULL,
              avg_cost DECIMAL(18,2) NOT NULL,
              UNIQUE KEY uniq_user_code (user_id, code),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              stock_id VARCHAR(64) NOT NULL,
              code VARCHAR(32) NOT NULL,
              name VARCHAR(255) NOT NULL,
              type VARCHAR(8) NOT NULL,
              price DECIMAL(18,2) NOT NULL,
              shares INT NOT NULL,
              total_amount DECIMAL(18,2) NOT NULL,
              timestamp DATETIME NOT NULL,
              INDEX idx_user_time (user_id, timestamp),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('数据库表结构已确认');
    } catch (err) {
        console.warn('数据库表结构初始化失败:', err.message);
    }
}
ensureSchema();

function getLocale(req) {
    const h = req.headers['accept-language'] || '';
    return h.startsWith('zh') ? 'zh' : 'en';
}
const I18N = {
    zh: {
        email_exists: '该邮箱已被注册',
        user_not_found: '用户不存在或密码错误',
        bad_type: '非法的交易类型',
        bad_qty_price: '无效的数量或价格',
        insufficient_balance: '账户余额不足',
        insufficient_holding: '持仓不足，无法卖出',
        server_error: '服务器内部错误'
    },
    en: {
        email_exists: 'Email already registered',
        user_not_found: 'User not found or wrong password',
        bad_type: 'Invalid trade type',
        bad_qty_price: 'Invalid quantity or price',
        insufficient_balance: 'Insufficient balance',
        insufficient_holding: 'Insufficient holdings to sell',
        server_error: 'Internal server error'
    }
};

// --- 中间件：验证 Token ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- API 路由 ---

// 0. 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        database: dbHealthy ? 'CONNECTED' : 'FALLBACK_MODE',
        timestamp: new Date().toISOString()
    });
});

// 实时行情抓取（Yahoo Finance）
function toYahooSymbol(code) {
    if (!code) return null;
    if (code.startsWith('6')) return `${code}.SS`;
    return `${code}.SZ`;
}

async function fetchYahooQuotes(codes) {
    try {
        const symbols = codes.map(toYahooSymbol).filter(Boolean).join(',');
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
        const data = await res.json();
        const results = (data && data.quoteResponse && data.quoteResponse.result) || [];
        const map = {};
        for (const item of results) {
            const symbol = item.symbol || '';
            const code = symbol.replace('.SS','').replace('.SZ','');
            map[code] = {
                code,
                name: item.longName || item.shortName || code,
                price: item.regularMarketPrice,
                change_pct: item.regularMarketChangePercent,
            };
        }
        return map;
    } catch (err) {
        console.warn('Yahoo quotes fetch failed:', err.message);
        return {};
    }
}

async function fetchEastmoneyQuotes(codes) {
    const buildSecId = (code) => {
        if (!code) return null;
        if (code.startsWith('6') || code.startsWith('688')) return `1.${code}`;
        return `0.${code}`;
    };
    const out = {};
    for (const code of codes) {
        const secid = buildSecId(code);
        if (!secid) continue;
        const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f57,f58,f43,f60`;
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://quote.eastmoney.com',
                }
            });
            if (!res.ok) throw new Error(`EM HTTP ${res.status}`);
            const data = await res.json();
            const d = data && data.data ? data.data : null;
            if (!d) continue;
            const now = Number(d.f43);
            const prev = Number(d.f60);
            const pct = (Number.isFinite(now) && Number.isFinite(prev) && prev !== 0)
                ? ((now - prev) / prev) * 100
                : 0;
            out[code] = {
                code: d.f57 || code,
                name: d.f58 || code,
                price: Number.isFinite(now) ? now : 0,
                change_pct: Number(pct.toFixed(2))
            };
        } catch (err) {
            // 忽略单个失败，继续
        }
    }
    return out;
}

// 5. 实时股票列表
app.get('/api/stocks', async (req, res) => {
    try {
        console.log('[Stocks] query received');
        const codesParam = (req.query.codes || '').toString();
        const codes = codesParam
            ? codesParam.split(',').map(s => s.trim()).filter(Boolean)
            : ['600519','300750','601398','688981','000002','600036','002415','601127'];
        let quoteMap = await fetchEastmoneyQuotes(codes);
        if (!quoteMap || Object.keys(quoteMap).length === 0) {
            quoteMap = await fetchYahooQuotes(codes);
        }
        const list = codes.map(code => {
            const q = quoteMap[code];
            return {
                id: code,
                code,
                name: (q && q.name) || code,
                price: (q && typeof q.price === 'number') ? q.price : 0,
                change_pct: (q && typeof q.change_pct === 'number') ? q.change_pct : 0,
            };
        });
        res.json({ stocks: list });
    } catch (error) {
        console.error('[Stocks] 错误:', error.message);
        res.status(500).json({ error: '获取实时行情失败' });
    }
});

// 6. 全市场列表（东方财富）
async function fetchEastmoneyList({ fs, page, pageSize }) {
    const url = `https://push2.eastmoney.com/api/qt/clist/get`;
    const params = new URLSearchParams({
        pn: String(page || 1),
        pz: String(pageSize || 50),
        po: '1',
        np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2',
        invt: '2',
        fs: fs || 'm:0 t:6,m:0 t:13,m:0 t:80,m:1 t:2,m:1 t:23',
        fields: 'f12,f14,f2,f3'
    });
    const res = await fetch(`${url}?${params.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://quote.eastmoney.com'
        }
    });
    if (!res.ok) throw new Error(`EM list HTTP ${res.status}`);
    const data = await res.json();
    const diff = data && data.data && data.data.diff ? data.data.diff : [];
    return diff.map(item => ({
        code: item.f12,
        name: item.f14,
        price: item.f2,
        change_pct: item.f3
    }));
}

// 全量股票缓存（启动时拉取一次，之后复用）
let stocksCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 分钟过期
const CACHE_FILE = path.join(__dirname, 'data', 'stocks-cache.json');
const SEED_FILE = path.join(__dirname, 'data', 'stocks-seed.json');

function loadStocksCacheFromFile() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.stocks) && typeof parsed.lastCacheTime === 'number') {
                stocksCache = parsed.stocks;
                lastCacheTime = parsed.lastCacheTime;
            }
        }
    } catch (_) {}
}

function saveStocksCacheToFile() {
    try {
        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ lastCacheTime, stocks: stocksCache }, null, 2), 'utf-8');
    } catch (_) {}
}

loadStocksCacheFromFile();

function loadSeedStocksIfAvailable() {
    try {
        if (!stocksCache && fs.existsSync(SEED_FILE)) {
            const raw = fs.readFileSync(SEED_FILE, 'utf-8');
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
                stocksCache = arr.map(s => ({
                    id: s.code,
                    code: s.code,
                    name: s.name || s.code,
                    price: typeof s.price === 'number' ? s.price : 0,
                    change_pct: typeof s.change_pct === 'number' ? s.change_pct : 0,
                }));
                lastCacheTime = Date.now();
                console.log(`[Seed] 已加载种子股票 ${stocksCache.length} 条`);
            }
        }
    } catch (err) {
        console.warn('[Seed] 加载失败:', err.message);
    }
}

async function refreshQuotesForCache() {
    if (!stocksCache || stocksCache.length === 0) return;
    try {
        const codes = stocksCache.map(s => s.code);
        const chunkSize = 50;
        const updates = {};
        for (let i = 0; i < codes.length; i += chunkSize) {
            const chunk = codes.slice(i, i + chunkSize);
            const map = await fetchYahooQuotes(chunk);
            Object.assign(updates, map);
        }
        if (Object.keys(updates).length > 0) {
            stocksCache = stocksCache.map(s => {
                const u = updates[s.code];
                return u ? {
                    ...s,
                    name: u.name || s.name,
                    price: typeof u.price === 'number' ? u.price : s.price,
                    change_pct: typeof u.change_pct === 'number' ? u.change_pct : s.change_pct,
                } : s;
            });
            lastCacheTime = Date.now();
            saveStocksCacheToFile();
            console.log(`[Cache] 行情已刷新(Yahoo)，共更新 ${Object.keys(updates).length} 条`);
        }
    } catch (err) {
        console.warn('[Cache] 行情刷新失败:', err.message);
    }
}

async function getAllStocksFromCache() {
    const now = Date.now();
    // 缓存未过期则直接返回
    if (stocksCache && (now - lastCacheTime) < CACHE_DURATION) {
        return stocksCache;
    }
    if (!stocksCache) loadSeedStocksIfAvailable();
    
    console.log('[Cache] 开始拉取全量股票数据（后台），可能耗时...');
    const allStocks = [];
    const maxPerPage = 100;
    let page = 1;
    let hasMore = true;
    const startTime = Date.now();
    
    // 后台异步拉取，不阻塞 API 响应
    (async () => {
        try {
            while (hasMore && (Date.now() - startTime) < 30000) { // 最多耗时 30 秒
                try {
                    const list = await fetchEastmoneyList({ fs: '', page, pageSize: maxPerPage });
                    if (list.length === 0) {
                        hasMore = false;
                        break;
                    }
                    allStocks.push(...list);
                    console.log(`[Cache] 第 ${page} 页拉取 ${list.length} 条，累计 ${allStocks.length} 条`);
                    page++;
                    
                    if (allStocks.length >= 5000) {
                        console.log('[Cache] 已拉取 5000+ 条，停止继续拉取');
                        hasMore = false;
                    }
                } catch (err) {
                    console.warn(`[Cache] 第 ${page} 页拉取失败: ${err.message}`);
                    hasMore = false;
                }
            }
            
            if (allStocks.length > 0) {
                stocksCache = allStocks.map(s => ({
                    id: s.code,
                    code: s.code,
                    name: s.name,
                    price: typeof s.price === 'number' ? s.price : 0,
                    change_pct: typeof s.change_pct === 'number' ? s.change_pct : 0
                }));
                lastCacheTime = now;
                console.log(`[Cache] 缓存已更新，共 ${stocksCache.length} 条股票，耗时 ${Date.now() - startTime}ms`);
                saveStocksCacheToFile();
            } else {
                // 如果在线拉取失败但有种子数据，异步刷新行情
                if (stocksCache && stocksCache.length > 0) {
                    refreshQuotesForCache();
                }
            }
        } catch (err) {
            console.error('[Cache] 后台拉取失败:', err.message);
        }
    })();
    
    // 如果缓存为空，返回空数组（不阻塞）
    return stocksCache || [];
}

app.get('/api/stocks/list', async (req, res) => {
    try {
        let stocks = await getAllStocksFromCache();
        
        // 如果缓存还是空的，尝试快速拉取第一页
        if (stocks.length === 0) {
            console.log('[Stocks List] 缓存为空，快速拉取第一页...');
            try {
                const list = await fetchEastmoneyList({ fs: '', page: 1, pageSize: 100 });
                stocks = list.map(s => ({
                    id: s.code,
                    code: s.code,
                    name: s.name,
                    price: typeof s.price === 'number' ? s.price : 0,
                    change_pct: typeof s.change_pct === 'number' ? s.change_pct : 0
                }));
                stocksCache = stocks;
                lastCacheTime = Date.now();
                saveStocksCacheToFile();
            } catch (err) {
                console.warn('[Stocks List] 快速拉取失败:', err.message);
                stocks = [];
            }
        }
        
        res.json({ total: stocks.length, stocks });
    } catch (error) {
        console.error('[Stocks List] 错误:', error.message);
        res.status(500).json({ error: '获取股票列表失败' });
    }
});

// 在服务器启动后自动预热缓存（后台异步）
setTimeout(() => {
    getAllStocksFromCache().catch(err => {
        console.warn('[Cache] 启动预热失败:', err.message);
    });
    // 启动后若已有缓存或种子，后台刷新行情
    setTimeout(() => {
        refreshQuotesForCache();
    }, 2000);
}, 1000);

// 1. 注册
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    console.log(`[Register] 尝试注册: ${username} (${email})`);
    try {
        const locale = getLocale(req);
        // 检查邮箱是否已存在
        if (mockUsers[email]) {
            return res.status(400).json({ error: I18N[locale].email_exists });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 如果数据库可用，尝试保存到数据库
        if (pool) {
            try {
                await pool.execute(
                    'INSERT INTO users (username, email, password_hash, risk_profile, balance) VALUES (?, ?, ?, ?, ?)',
                    [username, email, hashedPassword, 'medium', 1000000]
                );
                console.log(`[Register] 注册成功（数据库）: ${username}`);
                return res.json({ message: '注册成功' });
            } catch (dbError) {
                console.warn(`[Register] 数据库写入失败: ${dbError.message}`);
                // 降级到模拟数据
            }
        }
        
        // 使用本地模拟数据
        mockUsers[email] = {
            id: Object.keys(mockUsers).length + 1,
            username,
            email,
            password_hash: hashedPassword,
            risk_profile: 'medium',
            balance: 1000000
        };
        console.log(`[Register] 注册成功（本地）: ${username}`);
        res.json({ message: '注册成功' });
    } catch (error) {
        console.error(`[Register] 错误: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 2. 登录
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`[Login] 尝试登录: ${email}`);
    try {
        const locale = getLocale(req);
        let user = null;
        
        // 首先尝试从数据库查询
        if (pool) {
            try {
                const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
                if (users.length > 0) {
                    user = users[0];
                    console.log(`[Login] 从数据库找到用户: ${email}`);
                }
            } catch (dbError) {
                console.warn(`[Login] 数据库查询失败: ${dbError.message}`);
            }
        }
        
        // 如果数据库中没有找到，从模拟数据查询
        if (!user) {
            user = mockUsers[email];
            if (user) {
                console.log(`[Login] 从本地模拟数据找到用户: ${email}`);
            }
        }
        
        if (!user) {
            console.log(`[Login] 用户不存在: ${email}`);
            return res.status(400).json({ error: I18N[locale].user_not_found });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            console.log(`[Login] 密码错误: ${email}`);
            return res.status(400).json({ error: I18N[locale].user_not_found });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);

        // 初始化用户投资组合（如果不存在）
        if (!portfolios[user.id]) {
            portfolios[user.id] = {
                balance: parseFloat(user.balance) || 1000000,
                holdings: [],
                transactions: []
            };
        }
        
        console.log(`[Login] 登录成功: ${email}`);
        res.json({
            token,
            user: {
                username: user.username,
                email: user.email,
                riskProfile: user.risk_profile || 'medium',
                balance: portfolios[user.id].balance
            }
        });
    } catch (error) {
        console.error(`[Login] 错误: ${error.message}`);
        const locale = getLocale(req);
        res.status(500).json({ error: I18N[locale].server_error });
    }
});

// 3. 获取账户详情 (余额 + 持仓 + 交易记录)
app.get('/api/portfolio', authenticateToken, async (req, res) => {
    try {
        const locale = getLocale(req);
        const userId = req.user.id;
        console.log(`[Portfolio] 获取用户${userId}的投资组合`);

        if (pool) {
            try {
                const [users] = await pool.execute('SELECT balance FROM users WHERE id = ?', [userId]);
                const [holdings] = await pool.execute('SELECT stock_id AS stockId, code, name, shares, avg_cost AS avgCost FROM holdings WHERE user_id = ?', [userId]);
                const [transactions] = await pool.execute('SELECT id, stock_id AS stockId, code, name, type, price, shares, total_amount AS totalAmount, timestamp FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100', [userId]);
                const balance = users.length > 0 ? parseFloat(users[0].balance) : 1000000;
                return res.json({ balance, holdings, transactions });
            } catch (dbErr) {
                console.warn(`[Portfolio] 数据库查询失败: ${dbErr.message}`);
            }
        }

        if (!portfolios[userId]) {
            portfolios[userId] = {
                balance: 1000000,
                holdings: [],
                transactions: []
            };
        }
        res.json(portfolios[userId]);
    } catch (error) {
        console.error(`[Portfolio] 错误: ${error.message}`);
        const locale = getLocale(req);
        res.status(500).json({ error: I18N[locale].server_error });
    }
});

// 4. 交易接口 (核心逻辑)
app.post('/api/trade', authenticateToken, async (req, res) => {
    try {
        const { stockId, stockCode, stockName, type, price, shares } = req.body;
        const userId = req.user.id;
        const locale = getLocale(req);

        // 参数验证
        if (!['buy', 'sell'].includes(type)) {
            return res.status(400).json({ error: I18N[locale].bad_type });
        }
        const qty = parseInt(shares, 10);
        const tradePrice = parseFloat(price);
        if (!qty || qty <= 0 || !Number.isFinite(tradePrice) || tradePrice <= 0) {
            return res.status(400).json({ error: I18N[locale].bad_qty_price });
        }

        // 尝试使用数据库
        if (pool && dbHealthy) {
            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                const [[userRow]] = await conn.query('SELECT id, balance FROM users WHERE id = ? FOR UPDATE', [userId]);
                
                if (!userRow) {
                    await conn.rollback();
                    conn.release();
                    return res.status(400).json({ error: '用户不存在' });
                }
                
                const currentBalance = parseFloat(userRow.balance);
                const totalAmount = parseFloat((tradePrice * qty).toFixed(2));

                if (type === 'buy') {
                    if (currentBalance < totalAmount) {
                        await conn.rollback();
                        conn.release();
                        return res.status(400).json({ error: I18N[locale].insufficient_balance });
                    }
                    const [rows] = await conn.query('SELECT * FROM holdings WHERE user_id = ? AND code = ? FOR UPDATE', [userId, stockCode]);
                    if (rows.length > 0) {
                        const h = rows[0];
                        const newShares = h.shares + qty;
                        const newCost = ((parseFloat(h.avg_cost) * h.shares) + totalAmount) / newShares;
                        await conn.query('UPDATE holdings SET shares = ?, avg_cost = ? WHERE id = ?', [newShares, parseFloat(newCost.toFixed(2)), h.id]);
                    } else {
                        await conn.query(
                            'INSERT INTO holdings (user_id, stock_id, code, name, shares, avg_cost) VALUES (?, ?, ?, ?, ?, ?)',
                            [userId, String(stockId || stockCode), stockCode, stockName, qty, tradePrice]
                        );
                    }
                    await conn.query('UPDATE users SET balance = ? WHERE id = ?', [parseFloat((currentBalance - totalAmount).toFixed(2)), userId]);
                } else {
                    const [rows] = await conn.query('SELECT * FROM holdings WHERE user_id = ? AND code = ? FOR UPDATE', [userId, stockCode]);
                    if (rows.length === 0 || rows[0].shares < qty) {
                        await conn.rollback();
                        conn.release();
                        return res.status(400).json({ error: I18N[locale].insufficient_holding });
                    }
                    const h = rows[0];
                    const remaining = h.shares - qty;
                    if (remaining > 0) {
                        await conn.query('UPDATE holdings SET shares = ? WHERE id = ?', [remaining, h.id]);
                    } else {
                        await conn.query('DELETE FROM holdings WHERE id = ?', [h.id]);
                    }
                    await conn.query('UPDATE users SET balance = ? WHERE id = ?', [parseFloat((currentBalance + totalAmount).toFixed(2)), userId]);
                }

                await conn.query(
                    'INSERT INTO transactions (user_id, stock_id, code, name, type, price, shares, total_amount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                    [userId, String(stockId || stockCode), stockCode, stockName, type, tradePrice, qty, totalAmount]
                );

                await conn.commit();
                conn.release();

                const [users] = await pool.execute('SELECT balance FROM users WHERE id = ?', [userId]);
                const [holdings] = await pool.execute('SELECT stock_id AS stockId, code, name, shares, avg_cost AS avgCost FROM holdings WHERE user_id = ?', [userId]);
                const [transactions] = await pool.execute('SELECT id, stock_id AS stockId, code, name, type, price, shares, total_amount AS totalAmount, timestamp FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100', [userId]);
                const balance = users.length > 0 ? parseFloat(users[0].balance) : 1000000;
                return res.json({ success: true, portfolio: { balance, holdings, transactions } });
            } catch (dbErr) {
                try { await conn.rollback(); } catch {}
                conn.release();
                console.warn(`[Trade] 数据库交易失败: ${dbErr.message}`);
                // 降级到本地模拟
                dbHealthy = false;
            }
        }

        // 本地模拟模式（数据库不可用或连接失败）
        console.log(`[Trade] 降级到本地模拟模式 (用户${userId})`);
        
        if (!portfolios[userId]) {
            portfolios[userId] = { balance: 1000000, holdings: [], transactions: [] };
        }
        const portfolio = portfolios[userId];
        const totalAmount = parseFloat((tradePrice * qty).toFixed(2));

        let holding = portfolio.holdings.find(h => h.code === stockCode);
        if (type === 'buy') {
            if (portfolio.balance < totalAmount) {
                return res.status(400).json({ error: I18N[locale].insufficient_balance });
            }
            if (holding) {
                const newShares = holding.shares + qty;
                const newCost = ((holding.avgCost * holding.shares) + totalAmount) / newShares;
                holding.shares = newShares;
                holding.avgCost = parseFloat(newCost.toFixed(2));
            } else {
                portfolio.holdings.push({
                    stockId: String(stockId || stockCode),
                    code: stockCode,
                    name: stockName,
                    shares: qty,
                    avgCost: tradePrice
                });
            }
            portfolio.balance = parseFloat((portfolio.balance - totalAmount).toFixed(2));
        } else {
            if (!holding || holding.shares < qty) {
                return res.status(400).json({ error: I18N[locale].insufficient_holding });
            }
            const remaining = holding.shares - qty;
            holding.shares = remaining;
            if (remaining === 0) {
                portfolio.holdings = portfolio.holdings.filter(h => h.code !== stockCode);
            }
            portfolio.balance = parseFloat((portfolio.balance + totalAmount).toFixed(2));
        }

        const tx = {
            id: Date.now().toString(),
            stockId: String(stockId || stockCode),
            code: stockCode,
            name: stockName,
            type,
            price: tradePrice,
            shares: qty,
            totalAmount,
            timestamp: new Date().toISOString()
        };
        portfolio.transactions.unshift(tx);

        console.log(`[Trade] 用户${userId} ${type}入 ${qty}股 ${stockName}(${stockCode}) -> 余额: ${portfolio.balance}`);

        res.json({ success: true, portfolio });
    } catch (error) {
        console.error(`[Trade] 错误: ${error.message}`);
        const locale = getLocale(req);
        res.status(400).json({ error: I18N[locale].server_error });
    }
});

// ============================================
// DeepSeek AI 分析接口（后端代理）
// ============================================
app.post('/api/ai-analysis', authenticateToken, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: '缺少分析提示词' });
        }

        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.REACT_APP_DEEPSEEK_API_KEY;
        
        if (!apiKey) {
            console.error('❌ DeepSeek API Key 未配置');
            return res.status(500).json({ error: 'AI 服务未配置' });
        }

        console.log(`[AI Analysis] 用户 ${req.user.userId} 请求 AI 分析`);

        // 调用 DeepSeek API（带重试机制）
        const delays = [1000, 2000, 4000, 8000, 16000];
        let attempt = 0;
        
        while (attempt < 5) {
            try {
                const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            {
                                role: 'system',
                                content: '你是一位专业的股票分析师，擅长结合基本面和技术面分析给出客观、专业的投资建议。'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 1000
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`DeepSeek API error: ${response.status} - ${JSON.stringify(errorData)}`);
                }

                const data = await response.json();
                const result = data.choices?.[0]?.message?.content || 'AI 暂时无法生成分析结果，请稍后再试。';
                
                console.log(`[AI Analysis] 分析成功，返回 ${result.length} 字符`);
                return res.json({ success: true, analysis: result });

            } catch (error) {
                attempt++;
                console.error(`[AI Analysis] 第 ${attempt} 次尝试失败:`, error.message);
                
                if (attempt >= 5) {
                    return res.status(500).json({ 
                        error: '网络连接繁忙，AI 分析暂时不可用。',
                        details: error.message 
                    });
                }
                
                // 指数退避等待
                await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));
            }
        }

    } catch (error) {
        console.error('[AI Analysis] 错误:', error);
        res.status(500).json({ error: 'AI 分析服务异常' });
    }
});

// 生产环境部署：服务静态文件
// 检查 frontend/dist 是否存在，如果存在则提供静态文件服务
const distPath = path.join(__dirname, 'frontend/dist');
if (fs.existsSync(distPath)) {
    console.log('📦 Serving static files from:', distPath);
    app.use(express.static(distPath));
    
    // 所有未匹配的请求返回 index.html (支持前端路由)
    app.get(/.*/, (req, res) => {
        // 忽略 API 请求，避免 API 404 时返回 HTML
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`\n📍 API 地址:`);
    console.log(`   - Health Check: http://localhost:${PORT}/api/health`);
    console.log(`   - 登录: POST http://localhost:${PORT}/api/login`);
    console.log(`   - 注册: POST http://localhost:${PORT}/api/register`);
    console.log(`   - 获取投资组合: GET http://localhost:${PORT}/api/portfolio`);
    console.log(`   - 交易: POST http://localhost:${PORT}/api/trade`);
    console.log(`   - AI 分析: POST http://localhost:${PORT}/api/ai-analysis`);
    console.log(`   - 实时行情: GET http://localhost:${PORT}/api/stocks?codes=600519,300750`);
    console.log(`   - 全市场列表: GET http://localhost:${PORT}/api/stocks/list?page=1&pageSize=1000\n`);
});
