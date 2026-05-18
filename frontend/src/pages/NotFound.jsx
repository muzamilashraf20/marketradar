import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Home } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-6 text-center">
      {/* Logo */}
      <a href="/landing" className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
          <Activity size={20} className="text-black" strokeWidth={3} />
        </div>
        <span className="text-2xl font-black tracking-tighter text-white">
          Bias<span className="text-cyan-400">Forge</span>
        </span>
      </a>

      {/* 404 */}
      <div className="relative mb-6">
        <h1 className="text-[120px] sm:text-[160px] font-black text-transparent bg-clip-text bg-gradient-to-b from-white/10 to-transparent leading-none select-none">
          404
        </h1>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl sm:text-5xl font-black text-white">Lost?</span>
        </div>
      </div>

      <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">
        This page doesn't exist — like a trade setup that never triggered. 
        Let's get you back to where the action is.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold rounded-xl hover:border-white/20 hover:text-white transition-all"
        >
          <ArrowLeft size={14} />
          Go Back
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all"
        >
          <Home size={14} />
          Dashboard
        </button>
      </div>
    </div>
  )
}