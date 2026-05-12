import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SimplePageLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[#030712] text-white">
      
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-[#030712]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          
          <Link to="/landing" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
              <span className="text-black text-sm font-black tracking-tighter">BF</span>
            </div>
            <span className="text-lg font-black tracking-tight">
              Bias<span className="text-cyan-400">Forge</span>
            </span>
          </Link>

          <Link 
            to="/landing"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Landing
          </Link>

        </div>
      </nav>

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        
        <div className="mb-12">
          <h1 className="text-4xl font-black tracking-tight mb-3 text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="text-slate-400 text-lg max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {/* Children Content */}
        {children}

      </div>
    </div>
  );
}