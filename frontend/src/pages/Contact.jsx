import { useState } from 'react';
import { Mail, MessageSquare, Send } from 'lucide-react';
import SimplePageLayout from '../components/common/SimplePageLayout';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    if (!form.name || !form.email || !form.message) {
      alert("Please fill all fields");
      return;
    }
    
    console.log("Form submitted:", form);
    setSent(true);
    
    setTimeout(() => {
      setForm({ name: '', email: '', message: '' });
      setSent(false);
    }, 2000);
  };

  return (
    <SimplePageLayout
      title="Contact Us"
      subtitle="Have a question or need help? We typically respond within 24 hours."
    >
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Quick Contact Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <a 
            href="mailto:support@biasforge.co"
            className="group flex items-center gap-4 p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-cyan-500/50 hover:bg-white/10 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors flex items-center justify-center">
              <Mail className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <div className="text-white font-semibold">Email Support</div>
              <div className="text-slate-400 text-sm mt-1">support@biasforge.co</div>
            </div>
          </a>

          <a 
            href="https://discord.gg/biasforge"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-4 p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-purple-500/50 hover:bg-white/10 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <div className="text-white font-semibold">Discord Community</div>
              <div className="text-slate-400 text-sm mt-1">Join for live support</div>
            </div>
          </a>
        </div>

        {/* Contact Form */}
        <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold text-white mb-8">Send us a Message</h2>

          {sent ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-6">✅</div>
              <h3 className="text-2xl font-bold text-white mb-2">Message Sent!</h3>
              <p className="text-slate-400 text-lg">We'll get back to you within 24 hours.</p>
            </div>
          ) : (
            <form className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2 font-medium">
                  Your Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter your name"
                  className="w-full p-4 bg-[#020617] border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2 font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full p-4 bg-[#020617] border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2 font-medium">
                  Message
                </label>
                <textarea
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Tell us how we can help..."
                  className="w-full p-4 bg-[#020617] border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all resize-vertical"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]"
              >
                <Send className="w-5 h-5" />
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </SimplePageLayout>
  );
}