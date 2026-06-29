'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import NotificationBell from '@/components/NotificationBell';
import AuthButton from '@/components/AuthButton';
import {
  collection, onSnapshot, orderBy,
  query, doc, updateDoc, increment,
} from 'firebase/firestore';
import {
  MapPin, Plus, ThumbsUp, AlertCircle, Clock, Zap,Loader,
} from 'lucide-react';
import IssueMap from '@/components/IssueMap';
import AIAssistant from '@/components/AIAssistant';
import { stageOf, timelineState, adminTab, STAGE_META } from '@/lib/issueLifecycle';

const categoryEmoji = {
  pothole: '🕳️', streetlight: '💡', drainage: '🌊',
  garbage: '🗑️', water_leak: '💧', other: '⚠️',
};

const categoryColors = {
  pothole: 'from-orange-500 to-red-500',
  streetlight: 'from-yellow-400 to-orange-400',
  drainage: 'from-blue-500 to-cyan-500',
  garbage: 'from-green-500 to-teal-500',
  water_leak: 'from-blue-400 to-indigo-500',
  other: 'from-gray-400 to-gray-500',
};

export default function Home() {
  const [issues, setIssues] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loadingIssues, setLoadingIssues] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'issues'), orderBy('priorityScore', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingIssues(false);
    });
    return unsub;
  }, []);

  async function upvote(id) {
    await updateDoc(doc(db, 'issues', id), {
      upvotes: increment(1),
      priorityScore: increment(2),
    });
  }

  const filtered = issues.filter((issue) => {
    if (issue.isDuplicate) return false; 
    const matchesFilter = filter === 'all' || adminTab(stageOf(issue)) === filter;
    const matchesSearch =
      !search ||
      issue.title?.toLowerCase().includes(search.toLowerCase()) ||
      issue.location?.toLowerCase().includes(search.toLowerCase()) ||
      issue.category?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const emergencies = issues.filter(i => i.isEmergency && stageOf(i) !== 'resolved');
  const resolvedCount = issues.filter(i => stageOf(i) === 'resolved').length;
  const avgImpact = issues.length
    ? Math.round(issues.reduce((s, i) => s + (i.impactScore || 0), 0) / issues.length)
    : 0;
  const healthScore = Math.max(0, 100 - issues.filter(i => stageOf(i) !== 'resolved').length * 5);

  return (
    <div className="min-h-screen bg-gray-50">
      {loadingIssues && (
        <div className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center z-50">
          <Loader className="animate-spin text-blue-600 mb-3" size={32} />
          <p className="text-sm text-gray-500">Loading community issues…</p>
        </div>
      )}

      {/* Emergency Banner */}
      {emergencies.length > 0 && (
        <div className="bg-red-600 text-white px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-pulse">
          <Zap size={12} />
          {emergencies.length} ACTIVE EMERGENCY — IMMEDIATE ATTENTION REQUIRED
          <Zap size={12} />
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🛡️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none">CivicGuardian AI</h1>
              <p className="text-xs text-gray-400">Autonomous Civic Operations Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a href="/health" className="hidden sm:flex items-center gap-1 bg-green-50 text-green-700 px-3 py-2 rounded-xl text-sm font-medium border border-green-100">
              ❤️ Health
            </a>
            <a href="/predictions" className="hidden sm:flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-2 rounded-xl text-sm font-medium border border-purple-100">
              🔮 Predict
            </a>
            <a href="/leaderboard" className="p-2 rounded-xl bg-gray-100 text-gray-600 text-sm">🏆</a>
            <a href="/admin" className="p-2 rounded-xl bg-gray-100 text-gray-600 text-sm">⚙️</a>
            <a href="/worker" className="p-2 rounded-xl bg-gray-100 text-gray-600 text-sm">🔧</a>
            <AuthButton />
            <NotificationBell />
            <a href="/report" className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors">
              <Plus size={16} /> Report
            </a>
          </div>
        </div>

        {/* Search bar — always visible */}
        <div className="max-w-6xl mx-auto mt-3">
          <input
            type="text"
            placeholder="🔍 Search issues by title, location, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Search results mode */}
      {search && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">
              🔍 {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
            </p>
            <button
              onClick={() => setSearch('')}
              className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-full font-medium hover:bg-red-100 transition-colors"
            >
              ✕ Clear
            </button>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <AlertCircle size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-semibold text-gray-500">No results found</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-24">
            {filtered.map((issue) => (
              <div
                key={issue.id}
                className={'bg-white rounded-2xl shadow-sm overflow-hidden border transition-shadow hover:shadow-md ' + (issue.isEmergency ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-100')}
              >
                {issue.isEmergency && (
                  <div className="bg-red-600 text-white text-xs px-4 py-1.5 font-semibold flex items-center gap-1">
                    <Zap size={10} /> EMERGENCY — Escalated to top priority
                  </div>
                )}
                {issue.imageUrl ? (
                  <div className="relative">
                    <img src={issue.imageUrl} alt={issue.title} className="w-full h-44 object-cover" />
                    <div className={'absolute top-3 left-3 bg-gradient-to-r ' + (categoryColors[issue.category] || 'from-gray-400 to-gray-500') + ' text-white text-xs px-2.5 py-1 rounded-full font-semibold'}>
                      {categoryEmoji[issue.category]} {issue.category?.replace('_', ' ')}
                    </div>
                  </div>
                ) : (
                  <div className={'w-full h-20 bg-gradient-to-r ' + (categoryColors[issue.category] || 'from-gray-100 to-gray-200') + ' flex items-center justify-center'}>
                    <span className="text-4xl">{categoryEmoji[issue.category]}</span>
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900 text-sm leading-tight flex-1">{issue.title}</h3>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ' + (STAGE_META[stageOf(issue)]?.color || 'bg-gray-100 text-gray-600')}>
                      {STAGE_META[stageOf(issue)]?.label || stageOf(issue)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <MapPin size={11} className="text-gray-400 shrink-0" />
                    <span className="truncate">{issue.location}</span>
                  </p>
                  <p className="text-xs text-blue-600 font-medium">{'→'} {issue.department}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      Sev {issue.severity}/5
                    </span>
                    <button
                      onClick={() => upvote(issue.id)}
                      className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full font-semibold"
                    >
                      <ThumbsUp size={11} /> {issue.upvotes || 0} confirm
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Normal mode — only show when not searching */}
      {!search && (
        <>
          {/* Stats Grid */}
          <div className="max-w-6xl mx-auto px-4 pt-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-4 text-white shadow-sm">
                <p className="text-xs font-medium opacity-80">Community Health</p>
                <p className="text-4xl font-bold mt-1">{healthScore}%</p>
                <p className="text-xs opacity-70 mt-1">Overall score</p>
              </div>
              <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 text-white shadow-sm">
                <p className="text-xs font-medium opacity-80">Critical Issues</p>
                <p className="text-4xl font-bold mt-1">{issues.filter(i => i.severity >= 4).length}</p>
                <p className="text-xs opacity-70 mt-1">High severity</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-4 text-white shadow-sm">
                <p className="text-xs font-medium opacity-80">Resolved</p>
                <p className="text-4xl font-bold mt-1">{resolvedCount}</p>
                <p className="text-xs opacity-70 mt-1">Issues fixed</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-4 text-white shadow-sm">
                <p className="text-xs font-medium opacity-80">AI Emergencies</p>
                <p className="text-4xl font-bold mt-1">{emergencies.length}</p>
                <p className="text-xs opacity-70 mt-1">Active alerts</p>
              </div>
            </div>
          </div>

          {/* AI Insight Banner */}
          <div className="max-w-6xl mx-auto px-4 pt-4">
            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-75">
                    🤖 Gemini Community Insight
                  </p>
                  <h2 className="font-bold text-lg mt-1">AI Weekly Summary</h2>
                  <p className="text-sm mt-2 leading-relaxed opacity-90">
                    {emergencies.length > 0
                      ? '🚨 ' + emergencies.length + ' emergency issue' + (emergencies.length > 1 ? 's' : '') + ' detected. Immediate deployment recommended to affected areas.'
                      : issues.filter(i => i.severity >= 4).length > 2
                      ? 'Critical civic issues are increasing. Intervention recommended in high severity locations.'
                      : issues.length === 0
                      ? 'No issues reported yet. Community monitoring is active.'
                      : 'Community conditions are stable. Continue monitoring reported issues.'}
                  </p>
                </div>
                <div className="ml-4 text-4xl">🏙️</div>
              </div>
              <div className="mt-4 pt-4 border-t border-white border-opacity-20 flex gap-6 text-sm">
                <div>
                  <p className="opacity-60 text-xs">Highest Risk</p>
                  <p className="font-semibold capitalize">
                    {issues.find(i => i.severity >= 4)?.category?.replace('_', ' ') || 'None'}
                  </p>
                </div>
                <div>
                  <p className="opacity-60 text-xs">Total Reports</p>
                  <p className="font-semibold">{issues.length}</p>
                </div>
                <div>
                  <p className="opacity-60 text-xs">Avg Impact</p>
                  <p className="font-semibold">{avgImpact}/100</p>
                </div>
                <div>
                  <p className="opacity-60 text-xs">Recommendation</p>
                  <p className="font-semibold">{emergencies.length > 0 ? 'Deploy Team' : 'Monitor'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="max-w-6xl mx-auto px-4 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">🔥 AI Hotspot Map</h2>
                <p className="text-xs text-gray-500">Live monitoring of reported civic issues</p>
              </div>
              <div className="flex gap-2">
                <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-red-500">Critical</p>
                  <p className="text-xl font-bold text-red-700">{issues.filter(i => i.severity >= 4).length}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-blue-500">Active</p>
                  <p className="text-xl font-bold text-blue-700">{issues.filter(i => stageOf(i) !== 'resolved').length}</p>
                </div>
              </div>
            </div>
            <IssueMap issues={issues} />
          </div>

          {/* Filter tabs */}
          <div className="max-w-6xl mx-auto px-4 pt-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Live Issues Feed
                <span className="ml-2 text-sm font-normal text-gray-400">({issues.length})</span>
              </h2>
            </div>
            <div className="bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 grid grid-cols-4 gap-1">
              {['all', 'new', 'active', 'done'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={'py-2 px-3 rounded-xl text-xs font-semibold transition-all ' + (filter === s ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50')}
                >
                  {s === 'all' && 'All (' + issues.length + ')'}
                  {s === 'new' && '🔴 New (' + issues.filter(i => adminTab(stageOf(i)) === 'new').length + ')'}
                  {s === 'active' && '🔵 Active (' + issues.filter(i => adminTab(stageOf(i)) === 'active').length + ')'}
                  {s === 'done' && '✅ Fixed (' + resolvedCount + ')'}
                </button>
              ))}
            </div>
          </div>

          {/* Issues Grid */}
          <div className="max-w-6xl mx-auto px-4 py-4 pb-24">
            {filtered.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                <AlertCircle size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-semibold text-gray-500">No issues found</p>
                <p className="text-sm mt-1">Be the first to report one!</p>
                <a href="/report" className="inline-block mt-4 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
                  Report Issue
                </a>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((issue) => (
                <div
                  key={issue.id}
                  className={'bg-white rounded-2xl shadow-sm overflow-hidden border transition-shadow hover:shadow-md ' + (issue.isEmergency ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-100')}
                >
                  {issue.isEmergency && (
                    <div className="bg-red-600 text-white text-xs px-4 py-1.5 font-semibold flex items-center gap-1">
                      <Zap size={10} /> EMERGENCY — Escalated to top priority
                    </div>
                  )}

                  {issue.imageUrl ? (
                    <div className="relative">
                      <img src={issue.imageUrl} alt={issue.title} className="w-full h-44 object-cover" />
                      <div className={'absolute top-3 left-3 bg-gradient-to-r ' + (categoryColors[issue.category] || 'from-gray-400 to-gray-500') + ' text-white text-xs px-2.5 py-1 rounded-full font-semibold'}>
                        {categoryEmoji[issue.category]} {issue.category?.replace('_', ' ')}
                      </div>
                    </div>
                  ) : (
                    <div className={'w-full h-20 bg-gradient-to-r ' + (categoryColors[issue.category] || 'from-gray-100 to-gray-200') + ' flex items-center justify-center'}>
                      <span className="text-4xl">{categoryEmoji[issue.category]}</span>
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-gray-900 text-sm leading-tight flex-1">{issue.title}</h3>
                      <span className={'text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ' + (STAGE_META[stageOf(issue)]?.color || 'bg-gray-100 text-gray-600')}>
                        {STAGE_META[stageOf(issue)]?.label || stageOf(issue)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <MapPin size={11} className="text-gray-400 shrink-0" />
                      <span className="truncate">{issue.location}</span>
                    </p>

                    <p className="text-xs text-blue-600 font-medium">{'→'} {issue.department}</p>

                    {issue.impactScore > 0 && (
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-gray-400">Impact Score</span>
                          <span className={'text-xs font-bold ' + (issue.impactScore >= 80 ? 'text-red-600' : issue.impactScore >= 60 ? 'text-orange-600' : 'text-yellow-600')}>
                            {issue.impactScore}/100
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={'h-1.5 rounded-full ' + (issue.impactScore >= 80 ? 'bg-red-500' : issue.impactScore >= 60 ? 'bg-orange-500' : 'bg-yellow-500')}
                            style={{ width: issue.impactScore + '%' }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-600 mb-2">🤖 AI Resolution Timeline</p>
                      <div className="flex items-center justify-between text-center">
                        {['Reported', 'Assigned', 'Repair', 'Done'].map((step, i) => {
                          const t = timelineState(stageOf(issue));
                          const done = [t.reported, t.assigned, t.repair, t.done][i];
                          return (
                            <div key={step} className="flex items-center flex-1">
                              <div className="flex flex-col items-center">
                                <div className={'w-5 h-5 rounded-full flex items-center justify-center text-xs ' + (done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400')}>
                                  {done ? '✓' : i + 1}
                                </div>
                                <p className="text-[9px] text-gray-400 mt-1">{step}</p>
                              </div>
                              {i < 3 && <div className={'flex-1 h-0.5 mx-1 ' + (done ? 'bg-green-400' : 'bg-gray-200')} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          Sev {issue.severity}/5
                        </span>
                        {issue.isDuplicate && (
                          <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                            🔍 Merged
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => upvote(issue.id)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full font-semibold hover:bg-blue-100 transition-colors"
                      >
                        <ThumbsUp size={11} /> {issue.upvotes || 0} confirm
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* FAB */}
      <a href="/report" className="fixed bottom-6 right-6 z-30 bg-blue-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:bg-blue-700 transition-colors">
        <Plus size={24} />
      </a>

      <AIAssistant />
    </div>
  );
}