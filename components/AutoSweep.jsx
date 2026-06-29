// components/AutoSweep.jsx
'use client';
import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { runSlaSweep, simulateOverdue } from '@/lib/slaCheck';
import { Clock, Loader, Zap } from 'lucide-react';

export default function AutoSweep() {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState(null);
  const ranOnce = useRef(false);

  async function sweep(manual) {
    setRunning(true);
    try {
      const r = await runSlaSweep();
      setLast({ at: new Date(), ...r });
      if (manual) {
        toast.success(r.escalated || r.followedUp
          ? `Escalated ${r.escalated}, followed up ${r.followedUp}`
          : 'No overdue issues');
      } else if (r.escalated || r.followedUp) {
        toast('🤖 Auto-sweep escalated ' + r.escalated, { icon: '⚡' });
      }
    } catch (e) {
      console.error(e);
      if (manual) toast.error('Sweep failed');
    }
    setRunning(false);
  }

  useEffect(() => {
    if (!ranOnce.current) { ranOnce.current = true; sweep(false); }
    const id = setInterval(() => sweep(false), 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSimulate() {
    setRunning(true);
    try {
      const n = await simulateOverdue();
      toast.success(`Marked ${n} issues overdue — running sweep…`);
      await sweep(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed');
    }
    setRunning(false);
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            {running ? <Loader size={15} className="animate-spin text-indigo-600" />
                     : <Clock size={15} className="text-indigo-600" />}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">🤖 Autonomous SLA Monitor</p>
            <p className="text-xs text-gray-400">
              {running ? 'Scanning issues…'
                : last ? `Last run ${last.at.toLocaleTimeString()} · escalated ${last.escalated}, followed up ${last.followedUp}`
                : 'Runs automatically every 60s'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => sweep(true)} disabled={running}
            className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
            Run Sweep Now
          </button>
          <button onClick={handleSimulate} disabled={running}
            className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
            <Zap size={12} /> Simulate Overdue
          </button>
        </div>
      </div>
    </div>
  );
}