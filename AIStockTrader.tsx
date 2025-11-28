// --- API Helper ---
const API_URL = 'http://localhost:5000/api'; // 你的本地后端地址

const api = {
  async login(email, password) {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },
  
  async register(username, email, password) {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    return res.json();
  },

  async getPortfolio(token) {
    const res = await fetch(`${API_URL}/portfolio`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },

  async trade(token, tradeData) {
    const res = await fetch(`${API_URL}/trade`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(tradeData)
    });
    return res.json();
  }
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ReferenceLine, BarChart, Bar
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, PieChart, User, 
  Search, Bell, Menu, ArrowRight, BrainCircuit, Shield, 
  FileText, Layers, RefreshCw, ChevronDown, LogOut, Lock, Mail, Eye, EyeOff,
  Wallet, ArrowUpRight, ArrowDownRight, Briefcase, Globe, X, Check, Info, AlertTriangle, ChevronUp, Sparkles, MessageSquare, DollarSign, Plus, Minus, History
} from 'lucide-react';

/**
 * --- Gemini API 配置 ---
 */
const apiKey = ""; // 运行环境会自动注入 API Key

/**
 * 调用 Gemini API 的辅助函数 (包含指数退避重试机制)
 */
async function callGeminiAPI(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  let attempt = 0;
  const delays = [1000, 2000, 4000, 8000, 16000];

  while (attempt < 5) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI 暂时无法生成分析结果，请稍后再试。";
    } catch (error) {
      attempt++;
      if (attempt >= 5) {
        console.error("Gemini API call failed after retries:", error);
        return "网络连接繁忙，AI 分析暂时不可用。";
      }
      await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));
    }
  }
  return "请求超时。";
}

/**
 * --- 类型定义 ---
 */

type RiskLevel = 'low' | 'medium' | 'high';
type TimeRange = '1D' | '1W' | '1M' | '1Y';

interface UserProfile {
  username: string;
  email: string;
  riskProfile: RiskLevel;
  avatarColor: string;
}

// 持仓接口
interface Holding {
  stockId: string;
  code: string;
  name: string;
  shares: number;
  avgCost: number; // 持仓成本价
}

// 交易记录接口
interface Transaction {
  id: string;
  stockId: string;
  code: string;
  name: string;
  type: 'buy' | 'sell';
  price: number;
  shares: number;
  totalAmount: number;
  timestamp: string;
}

// 账户状态接口
interface AccountState {
  balance: number; // 可用资金
  holdings: Holding[]; // 持仓列表
  transactions: Transaction[]; // 交易历史
}

interface Stock {
  id: string;
  code: string; 
  name: string;
  price: number;
  change_pct: number;
  sector: string;
  predicted_return_7d: number;
  profit_signal: 'buy' | 'hold' | 'sell';
  sentiment_score: number;
  sentiment_label: 'positive' | 'neutral' | 'negative';
  volatility: number;
  related_stocks: string[];
}

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'alert' | 'info' | 'success';
}

/**
 * --- 真实市场快照数据 (模拟爬虫抓取结果) ---
 */
const CRAWLED_STOCKS: Stock[] = [
  { 
    id: '1', 
    code: '600519', 
    name: '贵州茅台', 
    price: 1448.88, 
    change_pct: 0.29, 
    sector: '消费', 
    predicted_return_7d: 0.032, 
    profit_signal: 'hold', 
    sentiment_score: 88, 
    sentiment_label: 'positive', 
    volatility: 0.18, 
    related_stocks: ['五粮液 (000858)', '泸州老窖 (000568)'] 
  },
  { 
    id: '2', 
    code: '300750', 
    name: '宁德时代', 
    price: 378.38, 
    change_pct: 1.49, 
    sector: '新能源', 
    predicted_return_7d: 0.095, 
    profit_signal: 'buy', 
    sentiment_score: 94, 
    sentiment_label: 'positive', 
    volatility: 0.42, 
    related_stocks: ['比亚迪 (002594)', '亿纬锂能 (300014)'] 
  },
  { 
    id: '3', 
    code: '601398', 
    name: '工商银行', 
    price: 6.24, 
    change_pct: 0.00, 
    sector: '金融', 
    predicted_return_7d: 0.005, 
    profit_signal: 'hold', 
    sentiment_score: 65, 
    sentiment_label: 'neutral', 
    volatility: 0.04, 
    related_stocks: ['建设银行 (601939)', '农业银行 (601288)'] 
  },
  { 
    id: '4', 
    code: '688981', 
    name: '中芯国际', 
    price: 121.90, 
    change_pct: 1.77, 
    sector: '半导体', 
    predicted_return_7d: 0.110, 
    profit_signal: 'buy', 
    sentiment_score: 82, 
    sentiment_label: 'positive', 
    volatility: 0.58, 
    related_stocks: ['韦尔股份 (603501)', '北方华创 (002371)'] 
  },
  { 
    id: '5', 
    code: '000002', 
    name: '万科A', 
    price: 6.17, 
    change_pct: -0.16, 
    sector: '地产', 
    predicted_return_7d: -0.015, 
    profit_signal: 'sell', 
    sentiment_score: 42, 
    sentiment_label: 'negative', 
    volatility: 0.35, 
    related_stocks: ['保利发展 (600048)', '招商蛇口 (001979)'] 
  },
  { 
    id: '6', 
    code: '600036', 
    name: '招商银行', 
    price: 42.65, 
    change_pct: -0.35, 
    sector: '金融', 
    predicted_return_7d: 0.018, 
    profit_signal: 'buy', 
    sentiment_score: 72, 
    sentiment_label: 'positive', 
    volatility: 0.15, 
    related_stocks: ['平安银行 (000001)', '兴业银行 (601166)'] 
  },
  { 
    id: '7', 
    code: '002415', 
    name: '海康威视', 
    price: 30.52, 
    change_pct: 0.40, 
    sector: '科技', 
    predicted_return_7d: 0.025, 
    profit_signal: 'hold', 
    sentiment_score: 58, 
    sentiment_label: 'neutral', 
    volatility: 0.22, 
    related_stocks: ['大华股份 (002236)', '科大讯飞 (002230)'] 
  },
  { 
    id: '8', 
    code: '601127', 
    name: '赛力斯', 
    price: 140.90, 
    change_pct: -0.87, 
    sector: '汽车', 
    predicted_return_7d: 0.135, 
    profit_signal: 'buy', 
    sentiment_score: 91, 
    sentiment_label: 'positive', 
    volatility: 0.62, 
    related_stocks: ['长安汽车 (000625)', '江淮汽车 (600418)'] 
  },
];

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: '1', title: '股价预警', message: '宁德时代 (300750) 盘中突破 380 元关口，涨幅扩大。', time: '2分钟前', read: false, type: 'alert' },
  { id: '2', title: 'AI 模型更新', message: 'Model A 完成了 T+0 午盘预测，数据已同步。', time: '15分钟前', read: false, type: 'success' },
  { id: '3', title: '持仓日报', message: '昨日您的组合跑赢大盘 1.2%，点击查看详情。', time: '1小时前', read: true, type: 'info' }
];

const CRAWLED_NEWS = [
  { title: "央行维持流动性合理充裕，LPR利率本月保持不变，市场预期平稳", time: "15分钟前", impact: "neutral" },
  { title: "宁德时代电池装机量再创新高，海外市场份额持续扩大", time: "42分钟前", impact: "positive" },
  { title: "半导体国产替代进程加速，中芯国际产能利用率稳步回升", time: "1小时前", impact: "positive" },
  { title: "房地产市场政策持续优化，万科等多家房企受益于融资端支持", time: "2小时前", impact: "positive" },
  { title: "赛力斯问界新车型交付量破万，智能驾驶获市场高度认可", time: "3小时前", impact: "positive" },
];

const generateChartData = (basePrice: number, volatility: number, range: TimeRange = '1D') => {
  const data = [];
  let currentPrice = basePrice;
  let count = 30;
  let labelFormat = (i: number) => `11-${(30-i).toString().padStart(2, '0')}`;
  
  if (range === '1W') {
    count = 24;
    labelFormat = (i: number) => `W${24-i}`;
    volatility = volatility * 1.5;
  } else if (range === '1M') {
    count = 12;
    labelFormat = (i: number) => `${12-i}月`;
    volatility = volatility * 2.0;
  } else if (range === '1Y') {
    count = 5;
    labelFormat = (i: number) => `${2025-i}`;
    volatility = volatility * 3.0;
  }

  // 修改：从0开始正向循环，unshift 会将最新的数据放在最后被推入的位置
  // i=0 (Newest Date) -> unshift -> [Newest]
  // i=1 (Older Date) -> unshift -> [Older, Newest]
  // ...
  // i=count-1 (Oldest Date) -> unshift -> [Oldest, ..., Newest]
  for (let i = 0; i < count; i++) {
    data.unshift({
      date: labelFormat(i),
      price: Number(currentPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 10000) + 5000 * (range === '1Y' ? 100 : 1),
      ma5: Number((currentPrice * (1 + (Math.random() * 0.05 - 0.025))).toFixed(2)),
      sentiment: Math.random() * 100
    });
    // 逆推前一天的价格
    const change = (Math.random() - 0.45) * volatility * currentPrice; 
    currentPrice -= change;
  }
  return data;
};

const getColor = (val: number) => val > 0 ? 'text-red-500' : val < 0 ? 'text-green-500' : 'text-slate-200';
const getBgColor = (val: number) => val > 0 ? 'bg-red-500' : val < 0 ? 'bg-green-500' : 'bg-slate-500';

/**
 * --- 组件定义 ---
 */

function SimpleMarkdown({ content }: { content: string }) {
  if (!content) return null;
  const parseLine = (text: string) => {
    return text.split(/(\*\*.*?\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <span key={j} className="font-bold text-indigo-300">
            {part.slice(2, -2)}
          </span>
        );
      }
      return part;
    });
  };

  const lines = content.split('\n');
  const renderedLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i].trim());
        i++;
      }
      if (tableRows.length >= 2) {
        const headerCells = tableRows[0].split('|').filter(c => c.trim() !== '');
        const bodyRows = tableRows.slice(2).map(row => 
          row.split('|').filter(c => c.trim() !== '')
        );
        renderedLines.push(
          <div key={`table-${i}`} className="overflow-x-auto my-3 border border-slate-700/50 rounded-lg bg-slate-800/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-800/80 text-indigo-200">
                <tr>
                  {headerCells.map((cell, idx) => (
                    <th key={idx} className="p-2 border-b border-slate-600 font-semibold whitespace-nowrap">
                      {parseLine(cell.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-700/30 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2 text-slate-300 whitespace-pre-wrap">
                        {parseLine(cell ? cell.trim() : '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (trimmed.startsWith('### ')) {
      renderedLines.push(<h4 key={`h4-${i}`} className="text-sm font-bold text-indigo-400 mt-3 mb-1">{parseLine(trimmed.slice(4))}</h4>);
      i++; continue;
    }
    if (trimmed.startsWith('## ')) {
      renderedLines.push(<h3 key={`h3-${i}`} className="text-base font-bold text-white mt-4 mb-2">{parseLine(trimmed.slice(3))}</h3>);
      i++; continue;
    }
    if (trimmed.startsWith('# ')) {
      renderedLines.push(<h2 key={`h2-${i}`} className="text-lg font-bold text-white mt-5 mb-2 border-b border-slate-700 pb-1">{parseLine(trimmed.slice(2))}</h2>);
      i++; continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      renderedLines.push(
        <div key={`ul-${i}`} className="flex items-start gap-2 pl-1 my-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
          <div className="leading-relaxed">{parseLine(trimmed.slice(2))}</div>
        </div>
      );
      i++; continue;
    }
    if (trimmed === '---' || trimmed === '***') {
      renderedLines.push(<hr key={`hr-${i}`} className="my-4 border-slate-700" />);
      i++; continue;
    }
    if (!trimmed) {
      renderedLines.push(<div key={`empty-${i}`} className="h-1" />);
    } else {
      renderedLines.push(<div key={`p-${i}`} className="leading-relaxed">{parseLine(trimmed)}</div>);
    }
    i++;
  }
  return <div className="space-y-2 text-xs text-slate-300">{renderedLines}</div>;
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
        active 
          ? 'bg-blue-600/10 text-blue-400 border-r-2 border-blue-500' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <div className={`${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
        {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      </div>
      <span className="hidden lg:block font-medium text-sm">{label}</span>
    </button>
  );
}

function StockCard({ stock, onClick }: { stock: Stock, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/50 transition-all duration-300 group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
        <TrendingUp className="w-16 h-16 text-blue-500" />
      </div>

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <h3 className="font-bold text-lg text-slate-100">{stock.name}</h3>
          <p className="text-xs text-slate-500 font-mono">{stock.code}</p>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-bold ${getBgColor(stock.change_pct)} bg-opacity-20 ${getColor(stock.change_pct)}`}>
          {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
        </div>
      </div>

      <div className="space-y-3 relative z-10">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">当前价格</span>
          <span className="font-mono text-slate-200">¥{stock.price.toFixed(2)}</span>
        </div>
        
        <div className="h-px bg-slate-800" />
        
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">AI 预测 (7日)</span>
            <span className={`text-sm font-bold ${getColor(stock.predicted_return_7d)}`}>
              {(stock.predicted_return_7d * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">推荐置信度</span>
            <div className="flex items-center gap-1">
               <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                 <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${stock.sentiment_score}%` }}></div>
               </div>
               <span className="text-xs text-blue-400 font-mono">{stock.sentiment_score}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 交易面板组件
function TradingPanel({ 
  stock, 
  currentHolding, 
  balance, 
  onTrade 
}: { 
  stock: Stock, 
  currentHolding?: Holding, 
  balance: number, 
  onTrade: (type: 'buy' | 'sell', shares: number) => void 
}) {
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [shares, setShares] = useState<string>('100'); // 默认一手
  
  const shareNum = parseInt(shares) || 0;
  const totalAmount = shareNum * stock.price;
  const canAfford = balance >= totalAmount;
  const canSell = currentHolding ? currentHolding.shares >= shareNum : false;
  
  const isValid = tradeType === 'buy' ? (canAfford && shareNum > 0) : (canSell && shareNum > 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
          <ArrowUpRight className="w-5 h-5 text-blue-500" />
          交易控制台
        </h3>
        <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
          可用资金: <span className="text-white font-mono">¥{balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Trade Type Toggles */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setTradeType('buy')}
            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              tradeType === 'buy' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" /> 买入
          </button>
          <button
            onClick={() => setTradeType('sell')}
            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              tradeType === 'sell' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Minus className="w-4 h-4" /> 卖出
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">交易数量 (股)</label>
            <div className="relative">
              <input 
                type="number" 
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                step="100"
                min="100"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="absolute right-4 top-2.5 text-xs text-slate-500">一手 = 100股</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-sm py-2 px-3 bg-slate-950/50 rounded-lg border border-slate-800/50">
            <span className="text-slate-400">预估金额</span>
            <span className="font-mono text-white font-bold">¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
          </div>

          {/* Messages */}
          {tradeType === 'buy' && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>最大可买: {Math.floor(balance / stock.price)} 股</span>
              {!canAfford && shareNum > 0 && <span className="text-red-500">资金不足</span>}
            </div>
          )}
          {tradeType === 'sell' && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>当前持仓: {currentHolding?.shares || 0} 股</span>
              {!canSell && shareNum > 0 && <span className="text-red-500">持仓不足</span>}
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={() => onTrade(tradeType, shareNum)}
          disabled={!isValid}
          className={`w-full py-3 rounded-lg font-bold text-white transition-all transform active:scale-95 ${
            isValid 
              ? (tradeType === 'buy' ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/20' : 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/20')
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {tradeType === 'buy' ? '确认买入' : '确认卖出'}
        </button>
      </div>
    </div>
  );
}

function StockDetailView({ 
  stock, 
  data: initialData, 
  isLoading: initialLoading, 
  onBack, 
  accountState, 
  onTrade 
}: { 
  stock: Stock, 
  data: any[], 
  isLoading: boolean, 
  onBack: () => void,
  accountState: AccountState,
  onTrade: (type: 'buy' | 'sell', shares: number) => void
}) {
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('1D');
  const [chartData, setChartData] = useState<any[]>(initialData);
  const [isChartLoading, setIsChartLoading] = useState(false);

  // 找到当前股票的持仓信息
  const currentHolding = accountState.holdings.find(h => h.stockId === stock.id);

  // 初始化或当父组件传入新数据时更新
  useEffect(() => {
    setChartData(initialData);
  }, [initialData]);

  // 处理时间周期切换
  const handleTimeRangeChange = (range: TimeRange) => {
    if (range === timeRange) return;
    setTimeRange(range);
    setIsChartLoading(true);
    setTimeout(() => {
      const newData = generateChartData(stock.price, stock.volatility, range);
      setChartData(newData);
      setIsChartLoading(false);
    }, 400); 
  };

  const generateDeepDive = async () => {
    setIsGenerating(true);
    setAiAnalysis(''); 
    const prompt = `请你扮演一位专业的金融证券分析师（CFA持证人）。请根据以下中国A股的实时数据，为投资者写一份简短的、深度的投资研报片段（中文）：
      【股票基本面】
      - 名称: ${stock.name} (${stock.code})
      - 板块: ${stock.sector}
      - 当前价格: ¥${stock.price}
      - 今日涨跌幅: ${stock.change_pct}%
      【AI 模型信号】
      - 混合模型预测（未来7日收益）: ${(stock.predicted_return_7d * 100).toFixed(2)}%
      - AI 交易建议信号: ${stock.profit_signal.toUpperCase()}
      - NLP 舆情情感评分: ${stock.sentiment_score} / 100
      - 历史波动率因子: ${stock.volatility}
      【关联股票 (GNN图谱)】
      - ${stock.related_stocks.join(', ')}
      请分三点输出：
      1. **行情解读**：结合涨跌幅和板块情况分析。
      2. **AI信号解析**：解释为什么预测模型给出了 ${stock.predicted_return_7d > 0 ? '正向' : '负向'} 预期（结合情感分）。
      3. **操作建议**：给用户的最终建议。
      语气要专业、客观，字数控制在 200 字左右。使用 Markdown 格式。`;
    try {
      const result = await callGeminiAPI(prompt);
      setAiAnalysis(result);
    } catch (e) {
      setAiAnalysis("抱歉，智能分析服务暂时不可用，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const isLoading = initialLoading || isChartLoading;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <button onClick={onBack} className="flex items-center text-slate-400 hover:text-white transition-colors mb-2">
        <ArrowRight className="w-4 h-4 rotate-180 mr-2" />
        返回列表
      </button>

      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-lg font-bold text-slate-300 border border-slate-700">
            {stock.code.substring(0,2)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              {stock.name} 
              <span className="text-sm font-normal text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{stock.code}</span>
            </h1>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-slate-400 text-sm">{stock.sector}板块</span>
              <span className="text-slate-600 text-xs flex items-center">
                <BrainCircuit className="w-3 h-3 mr-1" /> 已关联 {stock.related_stocks.length} 只GNN同业股票
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-baseline gap-2 justify-end">
            <span className={`text-3xl font-mono font-bold ${getColor(stock.change_pct)}`}>{stock.price.toFixed(2)}</span>
            <span className={`text-sm font-mono ${getColor(stock.change_pct)}`}>
              {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
            </span>
          </div>
          <div className="flex gap-2 mt-2">
             <span className="px-3 py-1 rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/30 text-xs font-medium">
               AI 评级: {stock.profit_signal.toUpperCase()}
             </span>
             <span className="px-3 py-1 rounded-full bg-purple-900/30 text-purple-400 border border-purple-500/30 text-xs font-medium">
               情感: {stock.sentiment_score}/100
             </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Chart */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-[400px]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-slate-200">价格走势与 AI 预测区间</h3>
              <div className="flex gap-2">
                {(['1D', '1W', '1M', '1Y'] as TimeRange[]).map(range => (
                  <button
                    key={range}
                    onClick={() => handleTimeRangeChange(range)}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                      timeRange === range 
                        ? 'bg-slate-700 text-white font-medium' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {range === '1D' ? '日K' : range === '1W' ? '周K' : range === '1M' ? '月K' : '年K'}
                  </button>
                ))}
                <div className="w-px h-6 bg-slate-700 mx-1"></div>
                <button className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white transition-colors shadow-lg shadow-blue-900/20">
                  AI 预测
                </button>
              </div>
            </div>
            
            <div className="h-80 w-full relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-10 backdrop-blur-sm transition-all">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : null}
              
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} itemStyle={{ color: '#cbd5e1' }} />
                  <Line type="monotone" dataKey="price" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 6 }} name="收盘价" animationDuration={500} />
                  <Line type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="5 5" name="MA5" animationDuration={500} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column: Trading & AI */}
        <div className="space-y-6">
           {/* Trading Console (NEW) */}
           <TradingPanel 
             stock={stock} 
             currentHolding={currentHolding} 
             balance={accountState.balance} 
             onTrade={onTrade} 
           />

           {/* Gemini AI Analyst Card */}
           <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
               <Sparkles className="w-24 h-24 text-indigo-400" />
             </div>
             
             <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-4 flex items-center gap-2">
               <Sparkles className="w-4 h-4" />
               Gemini 智能投顾
             </h3>

             {!aiAnalysis && !isGenerating && (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm mb-4">点击下方按钮，基于实时行情与舆情生成深度研报。</p>
                  <button 
                    onClick={generateDeepDive}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20 flex items-center gap-2 mx-auto"
                  >
                    <MessageSquare className="w-4 h-4" />
                    生成 AI 研报
                  </button>
                </div>
             )}

             {isGenerating && (
               <div className="py-8 flex flex-col items-center justify-center text-indigo-300">
                 <RefreshCw className="w-8 h-8 animate-spin mb-3" />
                 <span className="text-xs animate-pulse">Gemini 正在分析 {stock.name} 的基本面与技术面...</span>
               </div>
             )}

             {aiAnalysis && (
               <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                 <SimpleMarkdown content={aiAnalysis} />
                 <div className="mt-4 flex justify-end">
                   <button 
                     onClick={generateDeepDive}
                     className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                   >
                     <RefreshCw className="w-3 h-3" /> 重新分析
                   </button>
                 </div>
               </div>
             )}
           </div>

           {/* GNN Relations */}
           <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">GNN 关联图谱影响</h3>
              <div className="space-y-3">
                {stock.related_stocks.map((rel, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 rounded bg-slate-950/50 border border-slate-800/50">
                    <span className="text-sm text-slate-300">{rel}</span>
                    <span className="text-xs text-slate-500">相关度 0.{85 - idx * 5}</span>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

// 1. 仪表盘视图 (Restored)
function DashboardView({ user, setUser, recommendations, handleStockClick }: any) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 爬虫状态横幅 */}
      <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-lg flex items-center justify-between text-xs text-blue-300">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 animate-pulse" />
          <span>数据源: 实时互联网爬虫快照 (Tushare/AkShare Channel)</span>
        </div>
        <span>上次同步: 刚刚</span>
      </div>

      {/* User Risk Profile Switcher */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 rounded-2xl border border-slate-700/50 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              AI 个性化推荐引擎 (Model B)
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              基于 MVECF (均值-方差有效协同过滤) 算法，当前配置：
              <span className="text-white font-medium ml-1">
                {user.riskProfile === 'low' ? '低波动优先' : user.riskProfile === 'medium' ? '夏普比率优先' : '高收益优先'}
              </span>
            </p>
          </div>
          
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(['low', 'medium', 'high'] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => {
                  const updatedUser = { ...user, riskProfile: level };
                  setUser(updatedUser);
                  localStorage.setItem('stock_ai_user', JSON.stringify(updatedUser));
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  user.riskProfile === level 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {level === 'low' ? '保守型' : level === 'medium' ? '稳健型' : '激进型'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {recommendations.map((stock: Stock) => (
          <StockCard 
            key={stock.id} 
            stock={stock} 
            onClick={() => handleStockClick(stock)} 
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Market Overview / Model A Prediction Heatmap */}
        <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              大盘趋势预测 (LSTM)
            </h3>
            <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">更新于: T+0 14:00</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={generateChartData(3030, 0.05).slice(0,15)}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                />
                <Area type="monotone" dataKey="price" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">上证指数 (SSEC)</p>
              <p className="text-xl font-bold text-slate-200 mt-1">3,309.78</p>
              <p className="text-xs text-green-500">-0.12%</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">市场情绪指数</p>
              <p className="text-xl font-bold text-blue-400 mt-1">68.5</p>
              <p className="text-xs text-blue-400/80">偏乐观</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-xs text-slate-500 uppercase">北向资金流向</p>
              <p className="text-xl font-bold text-red-500 mt-1">+23.5亿</p>
              <p className="text-xs text-slate-400">净流入</p>
            </div>
          </div>
        </div>

        {/* News Sentiment Feed (NLP) - Updated with CRAWLED_NEWS */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-purple-400" />
            NLP 舆情监控 (实时)
          </h3>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar max-h-80 lg:max-h-full">
            {CRAWLED_NEWS.map((news, i) => (
              <div key={i} className="group p-3 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    news.impact === 'positive' ? 'border-red-500/30 text-red-400 bg-red-500/10' : 
                    news.impact === 'negative' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                    'border-slate-500/30 text-slate-400 bg-slate-500/10'
                  }`}>
                    {news.impact === 'positive' ? '利好' : news.impact === 'negative' ? '利空' : '中性'}
                  </span>
                  <span className="text-xs text-slate-500">{news.time}</span>
                </div>
                <p className="text-sm text-slate-300 group-hover:text-blue-400 transition-colors line-clamp-2">{news.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. 市场全景视图 (Restored)
function MarketView({ stocks, handleStockClick }: { stocks: Stock[], handleStockClick: (s: Stock) => void }) {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            全市场 AI 扫描
          </h2>
          <div className="text-sm text-slate-500">
            监控标的: {stocks.length} | 上次同步: {new Date().toLocaleTimeString()}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-6 py-4">股票名称/代码</th>
                <th className="px-6 py-4 text-right">最新价</th>
                <th className="px-6 py-4 text-right">涨跌幅</th>
                <th className="px-6 py-4 text-center">AI 预测 (7日)</th>
                <th className="px-6 py-4 text-center">NLP 情感分</th>
                <th className="px-6 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stocks.map((stock) => (
                <tr key={stock.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">
                        {stock.code.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-slate-200">{stock.name}</div>
                        <div className="text-xs text-slate-500">{stock.code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-300">
                    ¥{stock.price.toFixed(2)}
                  </td>
                  <td className={`px-6 py-4 text-right font-mono font-medium ${getColor(stock.change_pct)}`}>
                    {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold bg-opacity-10 ${getColor(stock.predicted_return_7d)} ${getBgColor(stock.predicted_return_7d)}`}>
                      {(stock.predicted_return_7d * 100).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full ${stock.sentiment_score > 60 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${stock.sentiment_score}%` }}></div>
                      </div>
                      <span className="text-xs text-slate-400 w-6">{stock.sentiment_score}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => handleStockClick(stock)}
                      className="text-blue-400 hover:text-white text-sm font-medium transition-colors"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 3. 资产组合视图 (Updated to use real state)
function PortfolioView({ accountState, handleStockClick }: { accountState: AccountState, handleStockClick: (s: Stock) => void }) {
  
  // 计算当前持仓市值
  const portfolioItems = accountState.holdings.map(h => {
    // 获取当前市场价 (在真实应用中应该来自实时数据，这里我们从 CRAWLED_STOCKS 查找)
    // 如果没有找到（比如持仓了但不在今日列表），我们假设价格不变（简化处理）
    const stock = CRAWLED_STOCKS.find(s => s.id === h.stockId);
    const currentPrice = stock ? stock.price : h.avgCost; // Fallback
    const marketValue = currentPrice * h.shares;
    const costBasis = h.avgCost * h.shares;
    const pl = marketValue - costBasis;
    const plPct = costBasis > 0 ? (pl / costBasis) * 100 : 0;
    
    return { ...h, currentPrice, marketValue, pl, plPct, stock };
  });

  const totalMarketValue = portfolioItems.reduce((acc, item) => acc + item.marketValue, 0);
  const totalAssets = accountState.balance + totalMarketValue;
  const totalCost = portfolioItems.reduce((acc, item) => acc + (item.avgCost * item.shares), 0);
  const totalPL = totalMarketValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Portfolio Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl border border-blue-800/30">
          <div className="flex items-center gap-3 mb-2 text-blue-200">
            <Wallet className="w-5 h-5" />
            <span className="font-medium">总资产净值</span>
          </div>
          <div className="text-3xl font-bold text-white font-mono">
            ¥{totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-blue-300/80">
            <span>可用现金: </span>
            <span className="text-white font-mono font-bold">¥{accountState.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-3 mb-2 text-slate-400">
            <Briefcase className="w-5 h-5" />
            <span className="font-medium">持有收益</span>
          </div>
          <div className={`text-3xl font-bold font-mono ${totalPL >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {totalPL >= 0 ? '+' : ''}¥{totalPL.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
          <div className={`mt-4 flex items-center gap-1 text-sm ${totalPL >= 0 ? 'text-red-500/80' : 'text-green-500/80'}`}>
            {totalPL >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            <span className="font-medium">{totalPLPct.toFixed(2)}% 总回报率</span>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-center">
           <div className="text-slate-400 text-sm mb-2">AI 仓位建议</div>
           <div className="space-y-2">
             <div className="flex justify-between text-sm">
               <span className="text-slate-200">现金仓位</span>
               <span className="text-slate-400">{((accountState.balance / totalAssets) * 100).toFixed(1)}%</span>
             </div>
             <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-slate-500 h-full" style={{ width: `${(accountState.balance / totalAssets) * 100}%` }}></div>
             </div>
             <div className="flex justify-between text-sm mt-1">
               <span className="text-slate-200">建议操作</span>
               <span className="text-blue-400">{accountState.balance / totalAssets > 0.5 ? '建议适当加仓' : '仓位合理'}</span>
             </div>
           </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h3 className="font-bold text-lg text-white">持仓明细</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-6 py-4">资产名称</th>
                <th className="px-6 py-4 text-right">持有数量</th>
                <th className="px-6 py-4 text-right">持仓成本</th>
                <th className="px-6 py-4 text-right">现价</th>
                <th className="px-6 py-4 text-right">市值</th>
                <th className="px-6 py-4 text-right">浮动盈亏</th>
                <th className="px-6 py-4 text-center">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {portfolioItems.length > 0 ? portfolioItems.map((item) => (
                <tr key={item.stockId} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-200">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.code}</div>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-300 font-mono">{item.shares}</td>
                  <td className="px-6 py-4 text-right text-slate-400 font-mono">¥{item.avgCost.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-slate-200 font-mono">¥{item.currentPrice.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-white font-bold font-mono">¥{item.marketValue.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right font-mono font-medium ${item.pl >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    <div>{item.pl >= 0 ? '+' : ''}¥{item.pl.toLocaleString()}</div>
                    <div className="text-xs opacity-70">{item.plPct.toFixed(2)}%</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {item.stock && (
                      <button 
                         onClick={() => handleStockClick(item.stock!)}
                         className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    暂无持仓，请前往市场进行交易。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * --- 登录页面组件 ---
 */
function LoginScreen({ onLogin }: { onLogin: (user: UserProfile, token: string) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // 表单状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await api.register(username, email, password);
        if (res.error) throw new Error(res.error);
        const loginRes = await api.login(email, password);
        if (loginRes.error) throw new Error(loginRes.error);
        onLogin(loginRes.user, loginRes.token);
      } else {
        const res = await api.login(email, password);
        if (res.error) throw new Error(res.error);
        onLogin(res.user, res.token);
      }
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* 左侧品牌区域 */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 border-r border-slate-800 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1611974765270-ca1258634369?q=80&w=2664&auto=format&fit=crop')] opacity-10 bg-cover bg-center mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-slate-950/90 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-blue-500 font-bold text-2xl mb-6">
            <BrainCircuit className="w-10 h-10" />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">AI StockMind</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            下一代智能<br/>
            <span className="text-blue-500">量化交易决策</span>系统
          </h2>
          <p className="text-slate-400 text-lg max-w-md">
            融合 LSTM 深度学习与 MVECF 个性化推荐算法，助您在瞬息万变的市场中捕捉每一次盈利机会。
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-6">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 p-4 rounded-xl">
            <TrendingUp className="w-6 h-6 text-emerald-400 mb-2" />
            <h3 className="font-bold text-slate-200">智能预测</h3>
            <p className="text-xs text-slate-400 mt-1">基于海量历史数据与实时舆情，精准预测短期走势。</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 p-4 rounded-xl">
            <Shield className="w-6 h-6 text-blue-400 mb-2" />
            <h3 className="font-bold text-slate-200">风险匹配</h3>
            <p className="text-xs text-slate-400 mt-1">根据您的风险偏好，自动筛选最优夏普比率组合。</p>
          </div>
        </div>
      </div>

      {/* 右侧表单区域 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              {isRegister ? '创建您的交易账户' : '欢迎回来'}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {isRegister ? '加入数万名量化投资者的行列' : '请输入您的凭证以访问仪表盘'}
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              {isRegister && (
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1">
                    用户名
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required={isRegister}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-3 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all sm:text-sm"
                      placeholder="如何称呼您?"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email-address" className="block text-sm font-medium text-slate-300 mb-1">
                  电子邮箱
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-lg border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-3 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all sm:text-sm"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-10 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all sm:text-sm"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500/20"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400">
                  记住我 (7天)
                </label>
              </div>

              {!isRegister && (
                <div className="text-sm">
                  <a href="#" className="font-medium text-blue-400 hover:text-blue-300">
                    忘记密码?
                  </a>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-lg bg-blue-600 py-3 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {isRegister ? '注册新账户' : '登录仪表盘'}
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm">
            <span className="text-slate-400">
              {isRegister ? "已有账户? " : "还没有账户? "}
            </span>
            <button 
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              {isRegister ? "立即登录" : "免费注册"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * --- 主应用组件 ---
 */
export default function AIStockTrader() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 仪表盘状态
  const [activeTab, setActiveTab] = useState<'dashboard' | 'market' | 'portfolio'>('dashboard');
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  // 搜索和通知状态
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // 账户状态 (资金与持仓) - NEW
  const [accountState, setAccountState] = useState<AccountState>({
    balance: 1000000, // 初始 100万
    holdings: [],
    transactions: []
  });

  const searchRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null); 

  // 初始化与持久化
  useEffect(() => {
    const storedUser = localStorage.getItem('stock_ai_user');
    const storedToken = localStorage.getItem('stock_ai_token');

    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
        fetchAccountData(storedToken);
      } catch (e) {
        localStorage.removeItem('stock_ai_user');
        localStorage.removeItem('stock_ai_token');
      }
    }

    setTimeout(() => setIsInitializing(false), 800);
  }, []);

  const fetchAccountData = async (authToken: string) => {
    try {
      const data = await api.getPortfolio(authToken);
      if (!data.error) {
        setAccountState({
          balance: data.balance,
          holdings: data.holdings,
          transactions: data.transactions || []
        });
      }
    } catch (e) {
      console.error('Failed to fetch portfolio', e);
    }
  };

  // 点击外部关闭逻辑
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setShowSearchResults(false);
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = (userData: UserProfile, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('stock_ai_user', JSON.stringify(userData));
    localStorage.setItem('stock_ai_token', authToken);
    fetchAccountData(authToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('stock_ai_user');
    localStorage.removeItem('stock_ai_token');
    setSelectedStock(null);
    setActiveTab('dashboard');
    setShowUserMenu(false);
  };

  // 核心交易逻辑 - NEW
  const executeTrade = async (type: 'buy' | 'sell', shares: number) => {
    if (!selectedStock || !token) return;

    try {
      const result = await api.trade(token, {
        stockCode: selectedStock.code,
        stockName: selectedStock.name,
        type,
        price: selectedStock.price,
        shares
      });

      if (result.error) {
        alert(result.error);
      } else {
        await fetchAccountData(token);
        const notif: Notification = {
          id: Date.now().toString(),
          title: `交易成功`,
          message: `${type === 'buy' ? '买入' : '卖出'} ${selectedStock.name} 成功`,
          time: '刚刚',
          read: false,
          type: 'success'
        };
        setNotifications(prev => [notif, ...prev]);
      }
    } catch (e) {
      alert('交易请求失败，请检查网络');
    }
  };

  // 搜索逻辑
  const filteredStocks = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return CRAWLED_STOCKS.filter(s => 
      s.code.includes(query) || s.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSearchSelect = (stock: Stock) => {
    handleStockClick(stock);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  // 通知逻辑
  const unreadCount = notifications.filter(n => !n.read).length;
  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const clearNotifications = () => {
    setNotifications([]);
    setShowNotifications(false);
  };

  // 模拟 Model B (MVECF) 逻辑
  const recommendations = useMemo(() => {
    if (!user) return [];
    let filtered = [...CRAWLED_STOCKS];
    filtered = filtered.filter(s => s.profit_signal !== 'sell');
    if (user.riskProfile === 'low') {
      filtered = filtered.filter(s => s.volatility < 0.20);
      filtered.sort((a, b) => (b.predicted_return_7d / b.volatility) - (a.predicted_return_7d / a.volatility));
    } else if (user.riskProfile === 'medium') {
      filtered = filtered.filter(s => s.volatility < 0.40);
      filtered.sort((a, b) => b.predicted_return_7d - a.predicted_return_7d);
    } else {
      filtered.sort((a, b) => b.predicted_return_7d - a.predicted_return_7d);
    }
    return filtered.slice(0, 4);
  }, [user]);

  const handleStockClick = (stock: Stock) => {
    setIsLoading(true);
    setSelectedStock(stock);
    setChartData([]); 
    setTimeout(() => {
      setChartData(generateChartData(stock.price, stock.volatility, '1D'));
      setIsLoading(false);
    }, 600);
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-blue-500">
        <BrainCircuit className="w-16 h-16 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-20 lg:w-64 bg-slate-900 border-r border-slate-800 flex flex-col items-center lg:items-start p-4 transition-all duration-300 z-30">
        <div className="flex items-center gap-3 mb-10 text-blue-500 font-bold text-xl px-2">
          <BrainCircuit className="w-8 h-8 flex-shrink-0" />
          <span className="hidden lg:block bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent truncate">StockMind</span>
        </div>

        <nav className="space-y-4 w-full flex-1">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setSelectedStock(null); }}
            icon={<Layers />} 
            label="智能仪表盘" 
          />
          <NavButton 
            active={activeTab === 'market'} 
            onClick={() => { setActiveTab('market'); setSelectedStock(null); }}
            icon={<Activity />} 
            label="市场全景" 
          />
          <NavButton 
            active={activeTab === 'portfolio'} 
            onClick={() => { setActiveTab('portfolio'); setSelectedStock(null); }}
            icon={<PieChart />} 
            label="资产组合" 
          />
        </nav>

        {/* User Profile Section with Clickable Menu (FIXED) */}
        <div className="mt-auto pt-6 border-t border-slate-800 w-full relative" ref={userMenuRef}>
           {showUserMenu && (
             <div className="absolute bottom-full left-0 w-full mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
               <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all shadow-xl"
               >
                  <LogOut className="w-5 h-5" />
                  <span className="hidden lg:inline text-sm font-medium">退出登录</span>
               </button>
             </div>
           )}

          <div 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`flex items-center gap-3 px-2 py-3 rounded-xl border cursor-pointer transition-all ${
              showUserMenu 
                ? 'bg-slate-800 border-slate-700' 
                : 'bg-slate-800/50 border-slate-800/50 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`w-9 h-9 rounded-full bg-gradient-to-tr ${user.avatarColor} flex items-center justify-center text-sm font-bold shadow-lg`}>
              {user.username.substring(0, 1).toUpperCase()}
            </div>
            <div className="hidden lg:block overflow-hidden flex-1">
              <p className="text-sm font-bold text-slate-200 truncate">{user.username}</p>
              <p className="text-xs text-slate-400 truncate flex items-center">
                 <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                    user.riskProfile === 'low' ? 'bg-green-500' : 
                    user.riskProfile === 'medium' ? 'bg-blue-500' : 'bg-red-500'
                 }`}></span>
                 {user.riskProfile === 'low' ? '保守型' : user.riskProfile === 'medium' ? '稳健型' : '激进型'}
              </p>
            </div>
            <div className="hidden lg:block text-slate-500">
              {showUserMenu ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
          <h1 className="text-lg font-semibold text-slate-200">
            {selectedStock ? `${selectedStock.name} (${selectedStock.code})` : 
             activeTab === 'dashboard' ? `欢迎回来, ${user.username}` : 
             activeTab === 'market' ? '全市场扫描 (Model A)' : '我的持仓与收益'}
          </h1>
          
          <div className="flex items-center gap-4">
            {/* Search Bar */}
            <div className="relative hidden md:block" ref={searchRef}>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder="搜索股票代码/名称..." 
                className="bg-slate-800 border border-slate-700 rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 text-slate-200 placeholder-slate-500 transition-all focus:w-80"
              />
              {/* Search Dropdown */}
              {showSearchResults && searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {filteredStocks.length > 0 ? (
                    <ul className="max-h-64 overflow-y-auto custom-scrollbar">
                      {filteredStocks.map(stock => (
                        <li 
                          key={stock.id}
                          onClick={() => handleSearchSelect(stock)}
                          className="px-4 py-3 hover:bg-slate-800 cursor-pointer flex justify-between items-center transition-colors"
                        >
                          <div>
                            <div className="text-sm font-bold text-white">{stock.name}</div>
                            <div className="text-xs text-slate-500">{stock.code}</div>
                          </div>
                          <div className={`text-sm font-mono ${getColor(stock.change_pct)}`}>
                            {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                      未找到相关股票
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 hover:bg-slate-800 rounded-full transition-colors outline-none"
              >
                <Bell className="w-5 h-5 text-slate-400" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse ring-2 ring-slate-900"></span>
                )}
              </button>
              
              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                  <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                    <span className="font-semibold text-sm">通知中心 ({unreadCount})</span>
                    {notifications.length > 0 && (
                      <button onClick={clearNotifications} className="text-xs text-slate-500 hover:text-white transition-colors">
                        清空
                      </button>
                    )}
                  </div>
                  <ul className="max-h-80 overflow-y-auto custom-scrollbar">
                    {notifications.length > 0 ? (
                      notifications.map(n => (
                        <li 
                          key={n.id} 
                          onClick={() => markAsRead(n.id)}
                          className={`p-3 border-b border-slate-800/50 hover:bg-slate-800/50 cursor-pointer transition-colors relative ${n.read ? 'opacity-60' : 'bg-slate-800/20'}`}
                        >
                          {!n.read && <span className="absolute left-0 top-3 w-0.5 h-8 bg-blue-500 rounded-r-full"></span>}
                          <div className="flex items-start gap-3 pl-2">
                            <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                              n.type === 'alert' ? 'bg-red-500' : n.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                            }`} />
                            <div className="flex-1">
                              <h4 className="text-xs font-bold text-slate-200 mb-0.5">{n.title}</h4>
                              <p className="text-xs text-slate-400 leading-relaxed">{n.message}</p>
                              <span className="text-[10px] text-slate-600 mt-1 block">{n.time}</span>
                            </div>
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className="p-8 text-center text-slate-500 text-sm flex flex-col items-center">
                        <Bell className="w-8 h-8 mb-2 opacity-20" />
                        暂无新通知
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
          
          {selectedStock ? (
            <StockDetailView 
              stock={selectedStock} 
              data={chartData} 
              isLoading={isLoading} 
              onBack={() => setSelectedStock(null)}
              accountState={accountState}
              onTrade={executeTrade}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView 
                  user={user} 
                  setUser={setUser} 
                  recommendations={recommendations} 
                  handleStockClick={handleStockClick} 
                />
              )}
              
              {activeTab === 'market' && (
                <MarketView 
                  stocks={CRAWLED_STOCKS} 
                  handleStockClick={handleStockClick} 
                />
              )}

              {activeTab === 'portfolio' && (
                <PortfolioView 
                  accountState={accountState}
                  handleStockClick={handleStockClick} 
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
