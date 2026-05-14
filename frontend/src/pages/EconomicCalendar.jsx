import { useEffect, useState, useMemo } from 'react';
import { Calendar, RefreshCw, AlertTriangle, Clock, Search, Filter } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// For dev CORS issues, we can use a proxy if needed
const PROXY_URL = 'https://api.allorigins.win/get?url=';

export default function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const [dayFilter, setDayFilter] = useState('Today');
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [impactFilter, setImpactFilter] = useState('All');
  const [search, setSearch] = useState('');

  const fetchCalendar = async (isRetry = false) => {
    try {
      setLoading(true);
      setError('');

      let url = CALENDAR_URL;

      // If direct fetch fails due to CORS, use proxy
      if (isRetry) {
        url = PROXY_URL + encodeURIComponent(CALENDAR_URL);
      }

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

      let data;

      if (isRetry) {
        const json = await res.json();
        data = JSON.parse(json.contents);
      } else {
        data = await res.json();
      }

      // Normalize data
      const normalized = data.map((item, index) => ({
        id: `${item.date || ''}-${item.country || ''}-${item.title || ''}-${index}`,
        title: item.title || 'Event',
        currency: item.country || 'N/A',
        date: item.date,
        impact: item.impact || 'Low',
        forecast: item.forecast || '-',
        previous: item.previous || '-',
        actual: item.actual || '-',
      }));

      setEvents(normalized);
      setError('');
    } catch (err) {
      console.error("Calendar fetch error:", err);
      setError('Could not load calendar. Trying alternative method...');

      // Auto retry with proxy once
      if (retryCount === 0) {
        setRetryCount(1);
        setTimeout(() => fetchCalendar(true), 800);
      } else {
        setError('Failed to load economic calendar. Please refresh or try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, []);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        if (dayFilter === 'Today' && !isToday(event.date)) return false;
        return true;
      })
      .filter((event) => {
        if (currencyFilter !== 'All' && event.currency !== currencyFilter) return false;
        return true;
      })
      .filter((event) => {
        if (impactFilter !== 'All' && event.impact.toLowerCase() !== impactFilter.toLowerCase()) return false;
        return true;
      })
      .filter((event) => {
        if (!search.trim()) return true;
        return event.title.toLowerCase().includes(search.toLowerCase());
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, dayFilter, currencyFilter, impactFilter, search]);

  function isToday(dateString) {
    if (!dateString) return false;
    const eventDate = new Date(dateString);
    const today = new Date();
    return (
      eventDate.getFullYear() === today.getFullYear() &&
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getDate() === today.getDate()
    );
  }

  function getCountdown(dateString) {
    if (!dateString) return 'N/A';
    const now = new Date();
    const eventDate = new Date(dateString);
    const diff = eventDate - now;

    if (diff < 0) return 'Released';

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  const highImpactToday = events.filter(
    (event) => isToday(event.date) && (event.impact || '').toLowerCase() === 'high'
  ).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-2">
              <Calendar className="w-4 h-4" />
              LIVE ECONOMIC CALENDAR
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Economic Calendar
            </h1>
            <p className="text-slate-400 mt-1">Track high-impact events and market movers.</p>
          </div>

          <button
            onClick={() => fetchCalendar()}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-cyan-500/30 transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-sm text-slate-400">Total Events</p>
            <p className="text-3xl font-bold text-white mt-1">{events.length}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
            <p className="text-sm text-red-300">High Impact Today</p>
            <p className="text-3xl font-bold text-white mt-1">{highImpactToday}</p>
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5">
            <p className="text-sm text-cyan-300">Showing</p>
            <p className="text-3xl font-bold text-white mt-1">{filteredEvents.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-5">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-full bg-[#030712] border border-white/10 rounded-xl pl-10 py-3 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500">
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
            </select>

            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500">
              <option value="All">All Currencies</option>
              {['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','CNY'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)} className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500">
              <option value="All">All Impact</option>
              <option value="High">High Impact</option>
              <option value="Medium">Medium Impact</option>
              <option value="Low">Low Impact</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-24 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Events List */}
        {!loading && filteredEvents.length > 0 && (
          <div className="space-y-3">
            {filteredEvents.map(event => (
              <div key={event.id} className="bg-[#020617] border border-white/10 rounded-2xl p-5 hover:border-cyan-500/30 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-white">{event.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(event.date).toLocaleString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${event.impact === 'High' ? 'bg-red-500/10 border-red-500/30 text-red-400' : event.impact === 'Medium' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-500/10 border-slate-500/30 text-slate-400'}`}>
                    {event.impact}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">Currency</p>
                    <p className="text-cyan-300 font-medium">{event.currency}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Forecast</p>
                    <p className="text-white">{event.forecast}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Previous</p>
                    <p className="text-white">{event.previous}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Countdown</p>
                    <p className="text-emerald-400 font-medium">{getCountdown(event.date)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredEvents.length === 0 && !error && (
          <div className="text-center py-16">
            <AlertTriangle className="mx-auto w-10 h-10 text-slate-500 mb-4" />
            <p className="text-white font-semibold">No events match your filters</p>
            <p className="text-slate-500 mt-1">Try changing the filters above</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}