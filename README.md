# Stock Trader AI

这是一个基于 React + Node.js + MySQL 的智能股票交易模拟系统，集成了 DeepSeek API 进行智能投顾分析，并使用 Akshare 获取实时股票数据。

## 🚀 功能特性

- **实时行情**：通过 Akshare 获取 A 股实时行情数据。
- **模拟交易**：支持买入、卖出操作，实时计算持仓盈亏。
- **智能投顾**：集成 DeepSeek API，提供基于 AI 的市场分析和投资建议。
- **用户系统**：完整的注册、登录、JWT 认证流程。
- **资产管理**：直观展示总资产、持仓分布及交易历史。

## 🛠️ 技术栈

- **前端**：React, Vite, Tailwind CSS, Recharts，Vue
- **后端**：Node.js, Express, MySQL，Fastapi
- **数据服务**：Python (Akshare)
- **AI 服务**：DeepSeek API

## 📋 前置要求

在开始之前，请确保您的开发环境已安装以下工具：

- [Node.js](https://nodejs.org/) (v16+)
- [Python](https://www.python.org/) (v3.8+)
- [MySQL](https://www.mysql.com/) (v8.0+)

## ⚙️ 安装与配置

### 1. 克隆项目

```bash
git clone <repository-url>
cd ---main
```

### 2. 后端设置

安装 Node.js 依赖：

```bash
npm install
```

安装 Python 依赖（用于获取股票数据）：

```bash
pip install -r requirements.txt
```

### 3. 前端设置

进入前端目录并安装依赖：

```bash
cd frontend
npm install
```

## ▶️ 启动项目

### 启动后端服务

在项目根目录下运行：

```bash
node server.js
```

后端服务将在 `http://localhost:5000` 启动。

### 启动前端服务

打开一个新的终端窗口，进入 `frontend` 目录并运行：

```bash
cd frontend
npm run dev
```

前端服务通常将在 `http://localhost:5173` 启动（具体端口请查看终端输出）。

## 📖 使用说明

1.  **注册/登录**：访问前端页面，注册一个新账号并登录。
2.  **查看行情**：在首页查看热门股票的实时行情。
3.  **模拟交易**：点击股票卡片，进行模拟买入或卖出操作。
4.  **AI 分析**：在股票详情页或专门的 AI 分析页面，获取 DeepSeek 提供的投资建议。
5.  **查看资产**：在个人中心查看当前的持仓情况和历史交易记录。

## 📂 目录结构

```
├── frontend/           # React 前端项目
├── server.js           # Node.js 后端入口
├── fetch_stock_akshare.py # Python 股票数据获取脚本
├── requirements.txt    # Python 依赖列表
├── package.json        # 后端 Node.js 依赖
├── .env                # 环境变量配置文件
└── README.md           # 项目说明文档
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！
