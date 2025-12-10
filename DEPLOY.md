# 部署指南

本指南将帮助你将 AI Stock Trader 项目部署到云服务器（如阿里云、腾讯云、AWS 等）。

## 1. 环境准备

在服务器上安装以下软件：

- **Node.js** (推荐 v18 或更高版本)
- **MySQL** (推荐 v8.0)
- **Git**
- **PM2** (用于进程管理): `npm install -g pm2`

## 2. 获取代码

```bash
git clone <your-repo-url>
cd ---main
```

## 3. 安装依赖

### 后端依赖
```bash
npm install
```

### 前端依赖
```bash
cd frontend
npm install
cd ..
```

## 4. 构建前端

在部署之前，需要将 React 前端编译为静态文件：

```bash
cd frontend
npm run build
cd ..
```

构建完成后，你应该能在 `frontend/dist` 目录看到生成的文件。
`server.js` 已配置为自动服务此目录下的静态文件。

## 5. 配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的生产环境配置：

```bash
# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=stock_trader

# DeepSeek API Key
REACT_APP_DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx

# JWT 密钥
JWT_SECRET=your_secure_secret
```

## 6. 初始化数据库

如果这是首次部署，你需要创建数据库表。
项目启动时会自动尝试创建表结构，但你需要先手动创建数据库：

```sql
CREATE DATABASE stock_trader;
```

## 7. 启动服务

### 使用 PM2 启动（推荐）

```bash
pm2 start server.js --name "stock-trader"
```

查看日志：
```bash
pm2 logs stock-trader
```

### 手动启动（测试用）

```bash
node server.js
```

## 8. 访问应用

服务启动后，访问 `http://<your-server-ip>:5000` 即可看到应用。

如果你配置了 Nginx 反向代理，可以通过域名访问（例如 80 端口转发到 5000）。

## 常见问题

### 1. 前端 API 请求失败
确保 `.env` 中的配置正确。在生产环境中，前端会自动请求 `/api` (相对路径)，这会被 `server.js` 处理。

### 2. 数据库连接失败
检查 MySQL 服务是否运行，以及 `.env` 中的用户名密码是否正确。

### 3. 页面白屏
检查 `frontend/dist` 是否生成成功。
检查浏览器控制台是否有报错。

## 9. 如何访问

### 场景 A：云服务器部署

如果部署在阿里云/腾讯云/AWS 等云服务器上：

1.  **获取公网 IP**：在云厂商控制台查看服务器的公网 IP 地址（例如 `1.2.3.4`）。
2.  **开放端口**：在云厂商的"安全组"或"防火墙"设置中，允许 **TCP 5000** 端口的入站流量。
3.  **访问地址**：
    ```
    http://1.2.3.4:5000
    ```

### 场景 B：局域网访问（同一 WiFi 下）

如果你只是想让办公室或家里的其他电脑访问你这台电脑：

1.  **获取局域网 IP**：
    *   Windows: 打开终端输入 `ipconfig`，找到 IPv4 地址（例如 `192.168.1.5`）。
    *   Mac/Linux: 输入 `ifconfig`。
2.  **检查防火墙**：确保 Windows 防火墙允许 Node.js 接收连接。
3.  **访问地址**：
    ```
    http://192.168.1.5:5000
    ```
