# DeepSeek API 配置指南（后端代理模式）

## 📌 概述
本项目已将智能投顾功能从 Gemini API 迁移至 **DeepSeek API**，并采用**后端代理模式**，确保 API Key 的安全性。

### 🔒 安全架构
```
浏览器 → 你的后端服务器 → DeepSeek API
            ↓ (API Key 安全存储)
        root/.env 文件
```

**优势**：
- ✅ API Key 不会暴露在浏览器中
- ✅ 统一的认证和权限控制
- ✅ 可以添加调用次数限制和成本控制
- ✅ 更容易进行日志记录和监控

## 🔑 获取 DeepSeek API Key

### 1. 注册账号
访问 DeepSeek 官网：https://platform.deepseek.com/

### 2. 创建 API Key
1. 登录后进入控制台
2. 导航到 "API Keys" 页面
3. 点击 "Create API Key"
4. 复制生成的 API Key（格式类似：`sk-xxxxxxxxxxxxxxxxxxxxxxxx`）

### 3. 充值（如需要）
- DeepSeek 通常提供免费额度供测试
- 可以根据需要充值以获得更多调用次数

## ⚙️ 配置步骤

### 1. 配置后端环境变量

在**项目根目录**的 `.env` 文件中配置（不是 frontend 目录）：

```bash
# c:\Users\27737\Desktop\---main\.env

# 数据库配置
DB_HOST=db4free.net
DB_USER=zwater666
DB_PASS=zwater666
DB_NAME=zwater666

# 服务器配置
PORT=5000
JWT_SECRET=super_secret_jwt_key_change_this

# DeepSeek API Key（后端使用，安全）
DEEPSEEK_API_KEY=sk-your-actual-deepseek-api-key-here
```

### 2. 前端配置（可选）

`frontend/.env` 文件只需要配置 API URL，**不需要配置 API Key**：

```bash
# frontend/.env
VITE_API_URL=http://localhost:5000/api
```

### 3. 重启后端服务器

**重要**：修改 `.env` 文件后必须重启后端服务器！

```powershell
# 停止当前服务（Ctrl+C）
# 重新启动
node server.js
```

前端无需重启（除非修改了 frontend/.env）。

## 🚀 使用说明

### 启动应用

```powershell
# 1. 启动后端（先启动）
node server.js

# 2. 启动前端（新开一个终端）
cd frontend
npm run dev
```

### API 请求流程

前端调用流程：
```typescript
// 前端代码（frontend/src/AIStockTrader.tsx）
async function callAIAnalysis(prompt: string) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_URL}/ai-analysis`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });
  
  const data = await response.json();
  return data.analysis;
}
```

后端代理（server.js）：
```javascript
app.post('/api/ai-analysis', authenticateToken, async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  // 调用 DeepSeek API
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    // ...
  });
  
  res.json({ analysis: result });
});
```

### 测试 AI 功能
1. 打开应用并进入任意股票详情页
2. 找到 "DeepSeek 智能投顾" 卡片
3. 点击 "生成 AI 研报" 按钮
4. 等待 DeepSeek 分析并返回结果

## 📊 API 使用说明

### 接口信息
- **后端代理接口**：`POST /api/ai-analysis`
- **DeepSeek 模型**：`deepseek-chat`
- **认证方式**：JWT Token（用户必须登录）
- **API 端点**：`https://api.deepseek.com/v1/chat/completions`

### 请求示例

```javascript
// 前端调用
const response = await fetch('http://localhost:5000/api/ai-analysis', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({
    prompt: '分析平潭发展（000592）的投资价值...'
  })
});

const data = await response.json();
console.log(data.analysis); // AI 分析结果
```

### 配置参数
```typescript
{
  model: "deepseek-chat",           // 使用的模型
  temperature: 0.7,                  // 创造性程度 (0-1)
  max_tokens: 1000                   // 最大生成长度
}
```

### 费用说明
- DeepSeek 按 token 数量计费
- 通常比 OpenAI GPT-4 便宜很多
- 每次分析大约消耗 500-1000 tokens

## 🔧 故障排查

### 问题 1：显示 "网络连接繁忙，AI 分析暂时不可用"
**可能原因**：
- API Key 未配置或配置错误
- API Key 余额不足
- 网络连接问题

**解决方法**：
1. 检查**根目录** `.env` 文件中的 `DEEPSEEK_API_KEY` 是否正确
2. 确认 API Key 有足够的余额
3. 确保用户已登录（需要 JWT Token）
4. 查看后端服务器控制台的错误日志
5. 确保修改 `.env` 后已重启后端服务器
3. 查看浏览器控制台的错误信息

### 问题 2：显示 "请先登录后再使用 AI 分析功能"
**原因**：
- 用户未登录或 Token 已过期

**解决方法**：
1. 确保用户已登录系统
2. 检查 localStorage 中是否有有效的 token
3. 重新登录获取新的 Token

### 问题 3：API 调用失败
**检查步骤**：
1. **后端日志**：查看 `node server.js` 的控制台输出
2. **前端日志**：打开浏览器开发者工具（F12）查看 Network 选项卡
3. **环境变量**：确认根目录 `.env` 文件配置正确
4. **服务状态**：确认后端服务正在运行（访问 http://localhost:5000/api/health）

### 问题 4：返回结果不理想
**优化建议**：
- 在 `server.js` 中调整 `temperature` 参数（降低以获得更确定的结果）
- 增加 `max_tokens` 以获得更详细的分析
- 修改 system prompt 以调整 AI 的分析风格

## 🔐 安全优势

相比直接在前端调用 DeepSeek API：

| 特性 | 前端直连 | 后端代理（当前） |
|------|---------|-----------------|
| API Key 安全性 | ❌ 暴露在浏览器中 | ✅ 仅存储在后端 |
| 用户权限控制 | ❌ 无法控制 | ✅ 需要登录认证 |
| 调用次数限制 | ❌ 无法限制 | ✅ 可在后端实现 |
| 成本控制 | ❌ 用户可滥用 | ✅ 后端统一管理 |
| 日志记录 | ❌ 难以追踪 | ✅ 完整的调用日志 |

## 🌐 API 文档参考

- DeepSeek 官方文档：https://platform.deepseek.com/docs
- API 参考：https://platform.deepseek.com/api-docs

## 💡 提示

1. **安全性**：API Key 现在安全地存储在后端，不会暴露给浏览器 ✅
2. **成本控制**：可以在后端添加调用次数限制和成本监控
3. **性能优化**：考虑在后端添加缓存机制，避免重复分析
4. **权限管理**：只有登录用户才能使用 AI 功能

## 📞 支持

如有问题，可以：
1. 查看 DeepSeek 官方文档
2. 检查项目的 GitHub Issues
3. 联系技术支持

---

**最后更新**：2025年12月10日
