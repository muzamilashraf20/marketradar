import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, TrendingUp, DollarSign, RefreshCw, Save, Sparkles, CheckCircle2, XCircle, Clock, Brain, Zap } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const STORAGE_KEY = 'biasforge_propfirm_settings';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function PropFirmMode() {
  // Settings
  const [accountSize, setAccountSize] = useState(50000);
  const [dailyDrawdownPercent, setDailyDrawdownPercent] = useState(5);
  const [totalDrawdownPercent, setTotalDrawdownPercent] = useState(10);
  const [profitTarget, setProfitTarget] = useState(10);
  const [riskPerTrade, setRiskPerTrade] = useState(1);

  // Current State
  const [currentDailyPnl, setCurrentDailyPnl] = useState(0);
  const [currentTotalPnl, setCurrentTotalPnl] = useState(0);

  // AI Guardian State
  const [tradeSymbol, setTradeSymbol] = useState('EUR/USD');
  const [tradeDirection, setTradeDirection] = useState('BUY');
  const [tradeLotSize, setTradeLotSize] = useState(0.5);
  const [tradeStopLoss, setTradeStopLoss] = useState(30);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVerdict, setAiVerdict] = useState(null);
  const [aiError, setAiError] = useState(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setAccountSize(data.accountSize || 50000);
        setDailyDrawdownPercent(data.dailyDrawdownPercent || 5);
        setTotalDrawdownPercent(data.totalDrawdownPercent || 10);
        setProfitTarget(data.profitTarget || 10);
        setRiskPerTrade(data.riskPerTrade || 1);
        setCurrentDailyPnl(data.currentDailyPnl || 0);
        setCurrentTotalPnl(data.currentTotalPnl || 0);
      } catch (e) {
        console.error('Failed to load saved settings:', e);
      }
    }
  }, []);

  const handleSave = () => {
    const data = {
      accountSize,
      dailyDrawdownPercent,
      totalDrawdownPercent,
      profitTarget,
      riskPerTrade,
      currentDailyPnl,
      currentTotalPnl,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    alert('✅ Settings saved successfully!');
  };

  const handleReset = () => {
    setCurrentDailyPnl(0);
    setCurrentTotalPnl(0);
  };

  // Calculations
  const maxDailyLoss = (accountSize * dailyDrawdownPercent) / 100;
  const maxTotalLoss = (accountSize * totalDrawdownPercent) / 100;
  const profitTargetAmount = (accountSize * profitTarget) / 100;

  const dailyLossUsed = Math.abs(Math.min(currentDailyPnl, 0));
  const totalLossUsed = Math.abs(Math.min(currentTotalPnl, 0));

  const dailyLossRemaining = Math.max(0, maxDailyLoss - dailyLossUsed);
  const totalLossRemaining = Math.max(0, maxTotalLoss - totalLossUsed);

  const dailyLossPercent = Math.min(100, (dailyLossUsed / maxDailyLoss) * 100);
  const totalLossPercent = Math.min(100, (totalLossUsed / maxTotalLoss) * 100);

  const recommendedRiskDollar = (accountSize * riskPerTrade) / 100;
  const maxTradesRemaining = dailyLossRemaining > 0 ? Math.floor(dailyLossRemaining / recommendedRiskDollar) : 0;

  // AI Guardian Handler
  const handleAICheck = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiVerdict(null);

    try {
      const response = await fetch(`${API_URL}/api/trade-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: tradeSymbol,
          direction: tradeDirection,
          lotSize: Number(tradeLotSize),
          stopLossPips: Number(tradeStopLoss),
          accountSize: Number(accountSize),
          dailyDrawdownUsed: dailyLossPercent,
          totalDrawdownUsed: totalLossPercent,
          maxDailyDrawdown: Number(dailyDrawdownPercent),
          maxTotalDrawdown: Number(totalDrawdownPercent),
          riskPerTrade: Number(riskPerTrade),
        }),
      });

      const data = await response.json();

      if (data.success && data.verdict) {
        setAiVerdict({ ...data.verdict, meta: data.meta });
      } else {
        setAiError(data.error || 'AI analysis failed');
      }
    } catch (err) {
      console.error('AI check error:', err);
      setAiError('Connection to AI failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Status logic
  let status = 'SAFE';
  let statusBg = 'bg-emerald-500/10';
  let statusBorder = 'border-emerald-500/40';
  let statusText = 'text-emerald-400';

  if (dailyLossPercent >= 90 || totalLossPercent >= 90) {
    status = 'DANGER';
    statusBg = 'bg-red-500/10';
    statusBorder = 'border-red-500/40';
    statusText = 'text-red-400';
  } else if (dailyLossPercent >= 70 || totalLossPercent >= 70) {
    status = 'CAUTION';
    statusBg = 'bg-amber-500/10';
    statusBorder = 'border-amber-500/40';
    statusText = 'text-amber-400';
  }

  // Verdict color helpers
  const getVerdictStyles = (verdict) => {
    if (verdict === 'GREEN') return {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/40',
      text: 'text-emerald-400',
      icon: <CheckCircle2 className="w-8 h-8" />,
      label: 'TAKE THE TRADE'
    };
    if (verdict === 'YELLOW') return {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      icon: <AlertTriangle className="w-8 h-8" />,
      label: 'PROCEED WITH CAUTION'
    };
    return {
      bg: 'bg-red-500/10',
      border: 'border-red-500/40',
      text: 'text-red-400',
      icon: <XCircle className="w-8 h-8" />,
      label: 'DO NOT TAKE'
    };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-2">
              <Shield className="w-4 h-4" />
              PROP FIRM MODE
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Funded Trader Risk Calculator
            </h1>
            <p className="text-slate-400 mt-1">
              Real-time drawdown tracking and AI-powered trade verification.
            </p>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl font-semibold hover:bg-emerald-500/20 transition-all"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>

        {/* 🚀 AI PRE-TRADE GUARDIAN — WORLD'S FIRST */}
        <div className="relative bg-gradient-to-br from-cyan-500/10 via-[#020617] to-emerald-500/10 border border-cyan-500/30 rounded-2xl p-6 overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -z-0" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-0" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded-md">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">World's First</span>
                  </div>
                </div>
                <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  <Brain className="w-6 h-6 text-cyan-400" />
                  AI Pre-Trade Guardian
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Before you click buy/sell — let AI check your trade against news, drawdown & bias.
                </p>
              </div>
            </div>

            {/* Trade Input Form */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Symbol</label>
                <select
                  value={tradeSymbol}
                  onChange={(e) => setTradeSymbol(e.target.value)}
                  className="w-full bg-[#030712] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="GBP/USD">GBP/USD</option>
                  <option value="USD/JPY">USD/JPY</option>
                  <option value="USD/CHF">USD/CHF</option>
                  <option value="AUD/USD">AUD/USD</option>
                  <option value="NZD/USD">NZD/USD</option>
                  <option value="USD/CAD">USD/CAD</option>
                  <option value="XAU/USD">XAU/USD (Gold)</option>
                  <option value="BTC/USD">BTC/USD</option>
                  <option value="ETH/USD">ETH/USD</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Direction</label>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setTradeDirection('BUY')}
                    className={`px-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                      tradeDirection === 'BUY'
                        ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                        : 'bg-[#030712] border border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => setTradeDirection('SELL')}
                    className={`px-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                      tradeDirection === 'SELL'
                        ? 'bg-red-500/20 border border-red-500/50 text-red-300'
                        : 'bg-[#030712] border border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Lot Size</label>
                <input
                  type="number"
                  step="0.01"
                  value={tradeLotSize}
                  onChange={(e) => setTradeLotSize(e.target.value)}
                  className="w-full bg-[#030712] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Stop Loss (pips)</label>
                <input
                  type="number"
                  value={tradeStopLoss}
                  onChange={(e) => setTradeStopLoss(e.target.value)}
                  className="w-full bg-[#030712] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* AI Check Button */}
            <button
              onClick={handleAICheck}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black rounded-xl font-bold text-sm hover:from-cyan-400 hover:to-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
            >
              {aiLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  AI analyzing trade...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Ask AI: Should I Take This Trade?
                </>
              )}
            </button>

            {/* Error */}
            {aiError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-300 text-sm">⚠️ {aiError}</p>
              </div>
            )}

            {/* AI Verdict */}
            {aiVerdict && (
              <div className={`mt-4 ${getVerdictStyles(aiVerdict.verdict).bg} border ${getVerdictStyles(aiVerdict.verdict).border} rounded-2xl p-5`}>
                <div className="flex items-start gap-4 mb-4">
                  <div className={getVerdictStyles(aiVerdict.verdict).text}>
                    {getVerdictStyles(aiVerdict.verdict).icon}
                  </div>
                  <div className="flex-1">
                    <p className={`text-xs uppercase tracking-wider font-bold ${getVerdictStyles(aiVerdict.verdict).text}`}>
                      {getVerdictStyles(aiVerdict.verdict).label}
                    </p>
                    <h3 className="text-xl font-black text-white mt-1">{aiVerdict.headline}</h3>
                    {aiVerdict.confidence != null && (
                      <p className="text-xs text-slate-400 mt-1">AI Confidence: {aiVerdict.confidence}%</p>
                    )}
                  </div>
                </div>

                {/* Reasons */}
                {aiVerdict.reasons && aiVerdict.reasons.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Analysis</p>
                    <ul className="space-y-1.5">
                      {aiVerdict.reasons.map((reason, i) => (
                        <li key={i} className="text-sm text-slate-200 flex items-start gap-2">
                          <span className={`mt-0.5 ${getVerdictStyles(aiVerdict.verdict).text}`}>•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {aiVerdict.warnings && aiVerdict.warnings.length > 0 && (
                  <div className="mb-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Warnings
                    </p>
                    <ul className="space-y-1">
                      {aiVerdict.warnings.map((w, i) => (
                        <li key={i} className="text-sm text-amber-200">⚠️ {w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendation */}
                {aiVerdict.recommendation && (
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wider text-cyan-400 mb-1">💡 Recommendation</p>
                    <p className="text-sm text-cyan-100">{aiVerdict.recommendation}</p>
                  </div>
                )}

                {/* Meta: Risk & Upcoming Events */}
                {aiVerdict.meta && (
                  <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Trade Risk</p>
                      <p className="text-sm text-white font-semibold">
                        ${aiVerdict.meta.estimatedRiskDollars} ({aiVerdict.meta.estimatedRiskPercent}% of account)
                      </p>
                    </div>
                    {aiVerdict.meta.upcomingEvents && aiVerdict.meta.upcomingEvents.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Upcoming News (4h)
                        </p>
                        {aiVerdict.meta.upcomingEvents.slice(0, 2).map((e, i) => (
                          <p key={i} className="text-xs text-slate-300">
                            🔴 {e.event} ({e.country}) — in {e.minutesUntil}m
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className={`${statusBg} border ${statusBorder} rounded-2xl p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl ${statusBg} flex items-center justify-center`}>
                {status === 'SAFE' && <Shield className={`w-6 h-6 ${statusText}`} />}
                {status === 'CAUTION' && <AlertTriangle className={`w-6 h-6 ${statusText}`} />}
                {status === 'DANGER' && <AlertTriangle className={`w-6 h-6 ${statusText}`} />}
              </div>
              <div>
                <p className="text-sm text-slate-400">Account Status</p>
                <p className={`text-2xl font-black ${statusText}`}>{status}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm text-slate-400">Account Size</p>
              <p className="text-2xl font-bold text-white">${accountSize.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Current P&L Section */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Current P&L (Update Manually)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Today's P&L ($)
              </label>
              <input
                type="number"
                value={currentDailyPnl}
                onChange={(e) => setCurrentDailyPnl(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                placeholder="0"
              />
              <p className="text-xs text-slate-500 mt-1">Enter negative for loss, positive for profit</p>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Total P&L ($)
              </label>
              <input
                type="number"
                value={currentTotalPnl}
                onChange={(e) => setCurrentTotalPnl(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                placeholder="0"
              />
              <p className="text-xs text-slate-500 mt-1">Total account P&L since start</p>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-xl text-sm hover:bg-white/10 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Reset P&L to Zero
          </button>
        </div>

        {/* Drawdown Trackers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Drawdown */}
          <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Daily Drawdown</h3>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Loss Used</span>
                <span className="text-white font-semibold">${dailyLossUsed.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    dailyLossPercent >= 90
                      ? 'bg-red-500'
                      : dailyLossPercent >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${dailyLossPercent}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">{dailyLossPercent.toFixed(1)}% of max daily loss</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-400">Max Daily Loss</p>
                <p className="text-white font-semibold">${maxDailyLoss.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-400">Remaining</p>
                <p className="text-emerald-400 font-semibold">${dailyLossRemaining.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Total Drawdown */}
          <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Total Drawdown</h3>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Loss Used</span>
                <span className="text-white font-semibold">${totalLossUsed.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalLossPercent >= 90
                      ? 'bg-red-500'
                      : totalLossPercent >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${totalLossPercent}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">{totalLossPercent.toFixed(1)}% of max total loss</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-400">Max Total Loss</p>
                <p className="text-white font-semibold">${maxTotalLoss.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-400">Remaining</p>
                <p className="text-emerald-400 font-semibold">${totalLossRemaining.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Recommendations */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Recommended Risk Per Trade
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#020617] rounded-xl p-4 border border-emerald-500/20">
              <p className="text-xs text-slate-400 mb-1">Max Risk Per Trade</p>
              <p className="text-2xl font-bold text-white">${recommendedRiskDollar.toFixed(2)}</p>
              <p className="text-xs text-emerald-400 mt-1">{riskPerTrade}% of account</p>
            </div>

            <div className="bg-[#020617] rounded-xl p-4 border border-emerald-500/20">
              <p className="text-xs text-slate-400 mb-1">Max Trades Today</p>
              <p className="text-2xl font-bold text-white">{maxTradesRemaining}</p>
              <p className="text-xs text-slate-400 mt-1">Before hitting daily limit</p>
            </div>

            <div className="bg-[#020617] rounded-xl p-4 border border-emerald-500/20">
              <p className="text-xs text-slate-400 mb-1">Profit Target</p>
              <p className="text-2xl font-bold text-white">${profitTargetAmount.toFixed(2)}</p>
              <p className="text-xs text-cyan-400 mt-1">{profitTarget}% target</p>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Prop Firm Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Account Size ($)
              </label>
              <input
                type="number"
                value={accountSize}
                onChange={(e) => setAccountSize(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Daily Drawdown (%)
              </label>
              <input
                type="number"
                value={dailyDrawdownPercent}
                onChange={(e) => setDailyDrawdownPercent(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Total Drawdown (%)
              </label>
              <input
                type="number"
                value={totalDrawdownPercent}
                onChange={(e) => setTotalDrawdownPercent(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Profit Target (%)
              </label>
              <input
                type="number"
                value={profitTarget}
                onChange={(e) => setProfitTarget(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
                Risk Per Trade (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={riskPerTrade}
                onChange={(e) => setRiskPerTrade(Number(e.target.value))}
                className="w-full bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="mt-6 bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
            <p className="text-sm text-cyan-300">
              💡 <strong>Pro Tip:</strong> Most prop firms enforce 5% daily and 10% total drawdown.
              FTMO = 5%/10%, MyFundedFX = 5%/10%, The5ers = 4%/6%. Adjust settings to match your firm.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}