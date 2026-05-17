import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, TrendingUp, DollarSign, RefreshCw, Save } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const STORAGE_KEY = 'biasforge_propfirm_settings';

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

  // Status logic
  let status = 'SAFE';
  let statusColor = 'emerald';
  let statusBg = 'bg-emerald-500/10';
  let statusBorder = 'border-emerald-500/40';
  let statusText = 'text-emerald-400';

  if (dailyLossPercent >= 90 || totalLossPercent >= 90) {
    status = 'DANGER';
    statusColor = 'red';
    statusBg = 'bg-red-500/10';
    statusBorder = 'border-red-500/40';
    statusText = 'text-red-400';
  } else if (dailyLossPercent >= 70 || totalLossPercent >= 70) {
    status = 'CAUTION';
    statusColor = 'amber';
    statusBg = 'bg-amber-500/10';
    statusBorder = 'border-amber-500/40';
    statusText = 'text-amber-400';
  }

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
              Real-time drawdown tracking and risk management for prop firm traders.
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