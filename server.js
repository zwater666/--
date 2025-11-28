require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 数据库连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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

// 1. 注册
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.json({ message: '注册成功' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. 登录
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(400).json({ error: '用户不存在' });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: '密码错误' });

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
        
        // 返回用户信息（不含密码）
        res.json({
            token,
            user: {
                username: user.username,
                email: user.email,
                riskProfile: user.risk_profile,
                balance: parseFloat(user.balance)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. 获取账户详情 (余额 + 持仓 + 交易记录)
app.get('/api/portfolio', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 获取余额
        const [userRows] = await pool.execute('SELECT balance FROM users WHERE id = ?', [userId]);
        
        // 获取持仓
        const [holdingRows] = await pool.execute('SELECT * FROM holdings WHERE user_id = ?', [userId]);
        
        // 获取最近交易
        const [transRows] = await pool.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);

        // 格式化数据以匹配前端
        const holdings = holdingRows.map(h => ({
            stockId: h.stock_code, // 这里简化处理，用code作为id
            code: h.stock_code,
            name: h.stock_name,
            shares: h.shares,
            avgCost: parseFloat(h.avg_cost)
        }));

        res.json({
            balance: parseFloat(userRows[0].balance),
            holdings,
            transactions: transRows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. 交易接口 (核心逻辑)
app.post('/api/trade', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction(); // 开启事务

        const { stockCode, stockName, type, price, shares } = req.body;
        const userId = req.user.id;
        const totalAmount = parseFloat((price * shares).toFixed(2));

        // 检查用户余额
        const [userRows] = await connection.execute('SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]);
        let currentBalance = parseFloat(userRows[0].balance);

        if (type === 'buy') {
            if (currentBalance < totalAmount) throw new Error('余额不足');
            
            // 扣款
            await connection.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [totalAmount, userId]);
            
            // 更新持仓
            const [existingHolding] = await connection.execute('SELECT * FROM holdings WHERE user_id = ? AND stock_code = ?', [userId, stockCode]);
            
            if (existingHolding.length > 0) {
                const h = existingHolding[0];
                const newShares = h.shares + shares;
                const newCost = ((h.shares * h.avg_cost) + totalAmount) / newShares;
                await connection.execute('UPDATE holdings SET shares = ?, avg_cost = ? WHERE id = ?', [newShares, newCost, h.id]);
            } else {
                await connection.execute('INSERT INTO holdings (user_id, stock_code, stock_name, shares, avg_cost) VALUES (?, ?, ?, ?, ?)', [userId, stockCode, stockName, shares, price]);
            }
        } else if (type === 'sell') {
            const [existingHolding] = await connection.execute('SELECT * FROM holdings WHERE user_id = ? AND stock_code = ? FOR UPDATE', [userId, stockCode]);
            if (existingHolding.length === 0 || existingHolding[0].shares < shares) throw new Error('持仓不足');
            
            const h = existingHolding[0];
            const remainingShares = h.shares - shares;

            // 加钱
            await connection.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [totalAmount, userId]);

            if (remainingShares > 0) {
                await connection.execute('UPDATE holdings SET shares = ? WHERE id = ?', [remainingShares, h.id]);
            } else {
                await connection.execute('DELETE FROM holdings WHERE id = ?', [h.id]);
            }
        }

        // 记录交易
        await connection.execute(
            'INSERT INTO transactions (user_id, stock_code, stock_name, type, price, shares, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, stockCode, stockName, type, price, shares, totalAmount]
        );

        await connection.commit(); // 提交事务
        
        // 返回最新余额
        const [newBalanceRow] = await connection.execute('SELECT balance FROM users WHERE id = ?', [userId]);
        res.json({ success: true, newBalance: parseFloat(newBalanceRow[0].balance) });

    } catch (error) {
        await connection.rollback(); // 出错回滚
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});