import { useState } from 'react';
import { Mail, Send, Loader2, AlertCircle } from 'lucide-react';
import SimplePageLayout from '../components/common/SimplePageLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SUPPORT_EMAIL = 'support@biasforge.co';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // This used to console.log the form and claim "Message Sent!" — the message
  // went nowhere. Success is now only rendered after the API confirms the send.
  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please fill in your name, email and message.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'We could not send your message.');
      }
      setSent(true);
      setForm({ name: '', email: '', message: '' });
    } catch (e) {
      setError(e.message || 'We could not send your message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SimplePageLayout
      title="Contact Us"
      subtitle="Have a question or need help? We typically respond within 24 hours."
    >
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Quick Contact Options */}
        <div className="grid grid-cols-1 gap-6">
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

        </div>

        {/* Contact Form */}
        <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold text-white mb-8">Send us a Message</h2>

          {sent ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-6">✅</div>
              <h3 className="text-2xl font-bold text-white mb-2">Message Sent!</h3>
              <p className="text-slate-400 text-lg">We'll get back to you within 24 hours.</p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-6 text-sm text-cyan-400 hover:underline"
              >
                Send another message
              </button>
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

              {error && (
                <div className="flex items-start gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300 leading-relaxed">
                    {error} You can also email us directly at{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-cyan-400 hover:underline">{SUPPORT_EMAIL}</a>.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {sending ? 'Sending…' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </SimplePageLayout>
  );
}