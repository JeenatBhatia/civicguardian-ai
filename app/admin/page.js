'use client';
import AutoSweep from '@/components/AutoSweep';
import { useEffect, useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, orderBy, query,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { MapPin, Zap, Loader } from 'lucide-react';
import { stageOf, adminTab, STAGE_META, STAGES } from '@/lib/issueLifecycle';
import { updateStage } from '@/lib/updateStage';
import ActivityPanel from '@/components/ActivityPanel';
import NotificationBell from '@/components/NotificationBell';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

// Forward lifecycle actions available to an admin from each stage.
function stageActions(stage) {
  switch (stage) {
    case STAGES.REPORTED: return [{ to: STAGES.ASSIGNED, label: '📮 Assign to Department' }];
    case STAGES.ASSIGNED: return [{ to: STAGES.IN_PROGRESS, label: '🔧 Mark In Progress' }];
    case STAGES.IN_PROGRESS: return [{ to: STAGES.RESOLVED, label: '✅ Mark Resolved' }];
    case STAGES.PENDING_VERIFICATION:
      return [{ to: STAGES.RESOLVED, label: '✅ Confirm Resolved' }, { to: STAGES.IN_PROGRESS, label: '↩︎ Send Back' }];
    case STAGES.RESOLVED: return [{ to: STAGES.REOPENED, label: '↩︎ Reopen Issue' }];
    case STAGES.REOPENED: return [{ to: STAGES.IN_PROGRESS, label: '🔧 Resume Work' }];
    default: return [];
  }
}

const categoryEmoji = {
  pothole: '🕳️', streetlight: '💡', drainage: '🌊',
  garbage: '🗑️', water_leak: '💧', other: '⚠️',
};

export default function AdminPage() {
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [tab, setTab] = useState('issues');
  const [brief, setBrief] = useState('');
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'issues'), orderBy('priorityScore', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setIssues(data);
      setLoadingIssues(false);
    });
    return unsub;
  }, []);

  async function advanceStage(toStage, note) {
    if (!selected) return;
    try {
      await updateStage(selected, toStage, { by: 'admin', role: 'admin' }, { note });
      setSelected(prev => (prev ? { ...prev, stage: toStage, status: toStage } : null));
      toast.success('Moved to ' + (STAGE_META[toStage]?.label || toStage));
    } catch (e) {
      console.error(e);
      toast.error('Update failed');
    }
  }

  async function generateWeeklyBrief() {
    setGeneratingBrief(true);
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      const result = await model.generateContent(
        'Generate a professional weekly civic operations report for municipal authorities.\n\n' +
        'Live Data:\n' +
        '- Total issues: ' + stats.total + '\n' +
        '- Active emergencies: ' + stats.emergencies + '\n' +
        '- Resolved: ' + stats.resolved + '\n' +
        '- Pending: ' + stats.pending + '\n' +
        '- Average impact score: ' + stats.avgImpact + '/100\n' +
        '- Issues by category: ' + JSON.stringify(byCategory) + '\n' +
        '- Issues by department: ' + JSON.stringify(byDept) + '\n\n' +
        'Write a professional 3-paragraph report:\n' +
        '1. Executive Summary of current community status\n' +
        '2. Key concerns and critical areas needing attention\n' +
        '3. Recommendations for authorities this week\n\n' +
        'End with: "— CivicGuardian AI System | Autonomous Civic Operations Platform"'
      );
      setBrief(result.response.text());
      toast.success('Weekly brief generated!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate brief');
    }
    setGeneratingBrief(false);
  }

  const stats = {
    total: issues.length,
    critical: issues.filter(i => i.severity >= 4).length,
    pending: issues.filter(i => stageOf(i) === STAGES.REPORTED).length,
    inProgress: issues.filter(i => stageOf(i) === STAGES.IN_PROGRESS).length,
    active: issues.filter(i => adminTab(stageOf(i)) === 'active').length,
    resolved: issues.filter(i => stageOf(i) === STAGES.RESOLVED).length,
    emergencies: issues.filter(i => i.isEmergency).length,
    avgImpact: issues.length
      ? Math.round(issues.reduce((s, i) => s + (i.impactScore || 0), 0) / issues.length)
      : 0,
  };

  let displayed = filterStatus === 'all' ? issues : issues.filter(i => adminTab(stageOf(i)) === filterStatus);
  if (sortBy === 'priority') displayed = [...displayed].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  if (sortBy === 'impact') displayed = [...displayed].sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0));
  if (sortBy === 'severity') displayed = [...displayed].sort((a, b) => (b.severity || 0) - (a.severity || 0));
  if (sortBy === 'newest') displayed = [...displayed].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  const byCategory = {};
  const byDept = {};
  issues.forEach(i => {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    byDept[i.department] = (byDept[i.department] || 0) + 1;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {loadingIssues && (
        <div className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center z-50">
          <Loader className="animate-spin text-blue-600 mb-3" size={32} />
          <p className="text-sm text-gray-500">Loading dashboard…</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 font-bold text-sm">
              {'<'}
            </a>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-xs text-gray-400">CivicGuardian AI — Authority Dashboard</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('issues')}
              className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (tab === 'issues' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}
            >
              Issues
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (tab === 'analytics' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}
            >
              Analytics
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-gray-800 rounded-2xl p-4 text-white shadow-sm">
            <p className="text-xs font-medium opacity-80">Total</p>
            <p className="text-4xl font-bold mt-1">{stats.total}</p>
            <p className="text-xs opacity-60 mt-1">all reports</p>
          </div>
          <div className="bg-red-600 rounded-2xl p-4 text-white shadow-sm">
            <p className="text-xs font-medium opacity-80">Emergencies</p>
            <p className="text-4xl font-bold mt-1">{stats.emergencies}</p>
            <p className="text-xs opacity-60 mt-1">auto-escalated</p>
          </div>
          <div className="bg-orange-500 rounded-2xl p-4 text-white shadow-sm">
            <p className="text-xs font-medium opacity-80">Pending</p>
            <p className="text-4xl font-bold mt-1">{stats.pending}</p>
            <p className="text-xs opacity-60 mt-1">need action</p>
          </div>
          <div className="bg-green-600 rounded-2xl p-4 text-white shadow-sm">
            <p className="text-xs font-medium opacity-80">Resolved</p>
            <p className="text-4xl font-bold mt-1">{stats.resolved}</p>
            <p className="text-xs opacity-60 mt-1">completed</p>
          </div>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">In Progress</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{stats.inProgress}</p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: stats.total ? (stats.inProgress / stats.total) * 100 + '%' : '0%' }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Critical Issues</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{stats.critical}</p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div className="h-1.5 bg-red-500 rounded-full" style={{ width: stats.total ? (stats.critical / stats.total) * 100 + '%' : '0%' }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Avg Impact Score</p>
            <p className="text-3xl font-bold text-orange-600 mt-1">{stats.avgImpact}</p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div className="h-1.5 bg-orange-500 rounded-full" style={{ width: stats.avgImpact + '%' }} />
            </div>
          </div>
        </div>
        <AutoSweep />

        {/* ANALYTICS TAB */}
        {tab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-bold text-gray-800 mb-4">Issues by Category</p>
              <div className="space-y-3">
                {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <div key={cat}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-700">{categoryEmoji[cat]} {cat.replace('_', ' ')}</span>
                      <span className="text-sm font-bold text-gray-900">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 bg-blue-500 rounded-full" style={{ width: issues.length ? (count / issues.length) * 100 + '%' : '0%' }} />
                    </div>
                  </div>
                ))}
                {Object.keys(byCategory).length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-bold text-gray-800 mb-4">Workload by Department</p>
              <div className="space-y-3">
                {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                  <div key={dept}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-700 truncate">{dept}</span>
                      <span className="text-sm font-bold text-gray-900 ml-2">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 bg-purple-500 rounded-full" style={{ width: issues.length ? (count / issues.length) * 100 + '%' : '0%' }} />
                    </div>
                  </div>
                ))}
                {Object.keys(byDept).length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-bold text-gray-800 mb-4">Resolution Rate</p>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-32 h-32 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none" stroke="#22c55e" strokeWidth="3"
                      strokeDasharray={(stats.total ? (stats.resolved / stats.total) * 100 : 0) + ' 100'}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0}%
                    </p>
                    <p className="text-xs text-gray-400">resolved</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="bg-green-50 rounded-xl p-2">
                  <p className="text-lg font-bold text-green-600">{stats.resolved}</p>
                  <p className="text-xs text-green-500">Resolved</p>
                </div>
                <div className="bg-red-50 rounded-xl p-2">
                  <p className="text-lg font-bold text-red-600">{stats.total - stats.resolved}</p>
                  <p className="text-xs text-red-500">Pending</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-bold text-gray-800 mb-4">Severity Breakdown</p>
              <div className="space-y-3">
                {[5, 4, 3, 2, 1].map(sev => {
                  const count = issues.filter(i => i.severity === sev).length;
                  const colors = { 5: 'bg-red-500', 4: 'bg-orange-500', 3: 'bg-yellow-500', 2: 'bg-blue-500', 1: 'bg-green-500' };
                  return (
                    <div key={sev}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-700">Severity {sev}/5</span>
                        <span className="text-sm font-bold text-gray-900">{count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={'h-2 ' + colors[sev] + ' rounded-full'} style={{ width: issues.length ? (count / issues.length) * 100 + '%' : '0%' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly AI Brief — full width */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-800">🤖 AI Weekly Operations Brief</p>
                  <p className="text-xs text-gray-400 mt-0.5">Gemini-generated report for authorities</p>
                </div>
                <button
                  onClick={generateWeeklyBrief}
                  disabled={generatingBrief}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {generatingBrief ? (
                    <><Loader size={12} className="animate-spin" /> Generating...</>
                  ) : '✨ Generate Brief'}
                </button>
              </div>

              {!brief && !generatingBrief && (
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-500">Click Generate to create an AI-powered weekly operations report</p>
                </div>
              )}

              {generatingBrief && (
                <div className="bg-indigo-50 rounded-xl p-6 text-center">
                  <Loader size={28} className="animate-spin text-indigo-500 mx-auto mb-3" />
                  <p className="text-sm text-indigo-600 font-medium">Gemini is analyzing community data...</p>
                </div>
              )}

              {brief && !generatingBrief && (
                <div className="space-y-3">
                  <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{brief}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(brief); toast.success('Copied!'); }}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                    >
                      📋 Copy
                    </button>
                    <button
                      onClick={() => setBrief('')}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                    >
                      🔄 Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ISSUES TAB */}
        {tab === 'issues' && (
          <div className="flex gap-4">

            <div className="flex-1 min-w-0">
              <div className="flex gap-2 mb-4 flex-wrap">
                <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
                  {['all', 'new', 'active', 'done'].map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (filterStatus === s ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
                    >
                      {s === 'all' && 'All (' + issues.length + ')'}
                      {s === 'new' && 'New (' + stats.pending + ')'}
                      {s === 'active' && 'Active (' + stats.active + ')'}
                      {s === 'done' && 'Done (' + stats.resolved + ')'}
                    </button>
                  ))}
                </div>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="bg-white border border-gray-100 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm focus:outline-none"
                >
                  <option value="priority">Sort: Priority</option>
                  <option value="impact">Sort: Impact Score</option>
                  <option value="severity">Sort: Severity</option>
                  <option value="newest">Sort: Newest</option>
                </select>
              </div>

              <div className="space-y-2">
                {displayed.length === 0 && (
                  <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <p className="text-4xl mb-3">📭</p>
                    <p>No issues in this category</p>
                  </div>
                )}

                {displayed.map(issue => (
                  <div
                    key={issue.id}
                    onClick={() => setSelected(issue)}
                    className={'bg-white rounded-2xl p-4 shadow-sm cursor-pointer transition-all border-2 ' + (selected?.id === issue.id ? 'border-blue-500 shadow-md' : 'border-transparent hover:border-gray-200') + (issue.isEmergency ? ' ring-1 ring-red-300' : '')}
                  >
                    <div className="flex items-start gap-3">
                      {issue.imageUrl ? (
                        <img src={issue.imageUrl} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                          {categoryEmoji[issue.category]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {issue.isEmergency && <span className="text-red-600">🚨 </span>}
                            {issue.title}
                          </p>
                          <span className={'text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ' + (STAGE_META[stageOf(issue)]?.color || 'bg-gray-100 text-gray-600')}>
                            {STAGE_META[stageOf(issue)]?.label || stageOf(issue)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                          <MapPin size={10} /> {issue.location}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {categoryEmoji[issue.category]} {issue.category?.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-red-600 font-semibold">Sev {issue.severity}/5</span>
                          {issue.impactScore > 0 && (
                            <span className="text-xs text-orange-600 font-semibold">Impact {issue.impactScore}/100</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right detail panel */}
            {selected && (
              <div className="w-96 shrink-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 sticky top-24 overflow-hidden">
                  {selected.imageUrl && (
                    <img src={selected.imageUrl} className="w-full h-48 object-cover" alt="" />
                  )}
                  <div className="p-5 space-y-4">

                    <div>
                      {selected.isEmergency && (
                        <div className="flex items-center gap-1.5 text-red-600 text-xs font-bold mb-2">
                          <Zap size={12} /> EMERGENCY ESCALATED
                        </div>
                      )}
                      <h2 className="font-bold text-gray-900 text-lg leading-tight">{selected.title}</h2>
                      <p className="text-sm text-gray-500 mt-1">{selected.description}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <MapPin size={10} /> {selected.location}
                      </p>
                    </div>

                    {selected.impactScore > 0 && (
                      <div className="bg-orange-50 rounded-xl p-3 flex items-center gap-3">
                        <div className="text-3xl font-bold text-orange-600">{selected.impactScore}</div>
                        <div>
                          <p className="text-xs text-orange-500 font-semibold">Impact Score /100</p>
                          <p className="text-xs text-orange-400 mt-0.5">AI-calculated priority</p>
                        </div>
                      </div>
                    )}

                    {/* Master AI Decision in detail panel */}
                    {selected.masterDecision && (
                      <div className="rounded-xl p-3 space-y-2" style={{background: 'linear-gradient(135deg, #4f46e5, #7c3aed)'}}>
                        <p className="text-xs font-bold text-white opacity-75">🧠 Master AI Decision</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg p-2" style={{backgroundColor: 'rgba(255,255,255,0.15)'}}>
                            <p className="text-xs text-white" style={{opacity: 0.7}}>Priority</p>
                            <p className="text-sm font-bold text-white">{selected.masterDecision.finalPriority}</p>
                          </div>
                          <div className="rounded-lg p-2" style={{backgroundColor: 'rgba(255,255,255,0.15)'}}>
                            <p className="text-xs text-white" style={{opacity: 0.7}}>Confidence</p>
                            <p className="text-sm font-bold text-white">{selected.masterDecision.confidenceScore}%</p>
                          </div>
                        </div>
                        <div className="rounded-lg p-2" style={{backgroundColor: 'rgba(255,255,255,0.1)'}}>
                          <p className="text-xs text-white" style={{opacity: 0.8}}>{selected.masterDecision.reasoning}</p>
                        </div>
                      </div>
                    )}

                    {selected.resolutionPlan && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-700">🛠️ AI Resolution Plan</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-xl p-2.5">
                            <p className="text-xs text-gray-400">Priority</p>
                            <p className={'text-sm font-bold mt-0.5 ' + (selected.resolutionPlan.priority === 'Critical' ? 'text-red-600' : 'text-orange-600')}>
                              {selected.resolutionPlan.priority}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-2.5">
                            <p className="text-xs text-gray-400">Est. Repair</p>
                            <p className="text-sm font-bold text-blue-600 mt-0.5">{selected.resolutionPlan.estimatedRepairTime}</p>
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-xl p-2.5">
                          <p className="text-xs text-red-600">⚠️ {selected.resolutionPlan.riskIfDelayed}</p>
                        </div>
                      </div>
                    )}

                    {/* Lifecycle actions — advance the issue through real stages */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-gray-700">Lifecycle</p>
                        <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + (STAGE_META[stageOf(selected)]?.color || 'bg-gray-100 text-gray-600')}>
                          {STAGE_META[stageOf(selected)]?.label || stageOf(selected)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {stageActions(stageOf(selected)).map(action => (
                          <button
                            key={action.to}
                            onClick={() => advanceStage(action.to)}
                            className="py-2 px-3 rounded-xl text-xs font-semibold transition-all bg-blue-600 text-white hover:bg-blue-700"
                          >
                            {action.label}
                          </button>
                        ))}
                        {stageActions(stageOf(selected)).length === 0 && (
                          <p className="text-xs text-gray-400">No further actions for this stage.</p>
                        )}
                      </div>
                    </div>

                    {/* Live agent + lifecycle trail */}
                    <ActivityPanel issueId={selected.id} />

                    <a
                      href={'/verify/' + selected.id}
                      className="block w-full text-center bg-purple-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors"
                    >
                      📸 Verify Resolution with AI
                    </a>

                    {selected.complaint && (
                      <div>
                        <p className="text-xs font-bold text-gray-700 mb-2">📄 Complaint Letter</p>
                        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 max-h-40 overflow-y-auto leading-relaxed whitespace-pre-wrap border border-gray-100">
                          {selected.complaint}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setSelected(null)}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}