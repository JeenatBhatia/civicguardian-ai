// app/worker/page.js
'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { MapPin, Camera, Loader, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { stageOf, STAGES, STAGE_META } from '@/lib/issueLifecycle';
import { updateStage } from '@/lib/updateStage';
import { logActivity } from '@/lib/logActivity';
import { verifyFix } from '@/lib/verifyFix';
import { uploadImage } from '@/lib/cloudinary';
import NotificationBell from '@/components/NotificationBell';

const categoryEmoji = {
  pothole: '🕳️', streetlight: '💡', drainage: '🌊',
  garbage: '🗑️', water_leak: '💧', other: '⚠️',
};

export default function WorkerPage() {
  const { profile, role, department, logout } = useAuth();
  const [issues, setIssues] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [busyMsg, setBusyMsg] = useState('');
  const [result, setResult] = useState(null); // { issueId, ...verification }

  useEffect(() => {
    const q = query(collection(db, 'issues'), orderBy('priorityScore', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Admins see all departments; workers see only their own. Hide resolved/duplicate.
  const myQueue = issues.filter((i) => {
    const st = stageOf(i);
    if (st === STAGES.RESOLVED || st === STAGES.DUPLICATE) return false;
    if (role === 'admin') return true;
    return i.department === department;
  });

  async function startWork(issue) {
    setBusyId(issue.id);
    setBusyMsg('Starting…');
    try {
      // If still unassigned (reported), move it to assigned first, then in_progress.
      let current = issue;
      if (stageOf(current) === STAGES.REPORTED) {
        await updateStage(current, STAGES.ASSIGNED, { by: profile.uid, role: 'worker' }, {
          extraFields: { assignedTo: profile.uid },
        });
        current = { ...current, stage: STAGES.ASSIGNED };
      }
      await updateStage(current, STAGES.IN_PROGRESS, { by: profile.uid, role: 'worker' });
      toast.success('Work started');
    } catch (e) {
      console.error(e);
      toast.error('Could not start');
    }
    setBusyId(null);
    setBusyMsg('');
  }

  async function uploadFix(issue, file) {
    if (!file) return;
    setBusyId(issue.id);
    setResult(null);
    try {
      setBusyMsg('Uploading photo…');
      const afterImageUrl = await uploadImage(file);

      // Move to pending_verification + attach the proof photo
      await updateStage(issue, STAGES.PENDING_VERIFICATION, { by: profile.uid, role: 'worker' }, {
        extraFields: { afterImageUrl },
      });

      setBusyMsg('🤖 Gemini comparing before & after…');
      const v = await verifyFix({
        beforeUrl: issue.imageUrl,
        afterFile: file,
        category: issue.category,
        description: issue.description,
      });

      const passed = v.verdict === 'resolved' && v.sameLocation && v.confidence >= 0.7;

      if (passed) {
        await updateStage(
          { ...issue, stage: STAGES.PENDING_VERIFICATION },
          STAGES.RESOLVED,
          { by: profile.uid, role: 'worker' },
          { note: `vision verified ${(v.confidence * 100).toFixed(0)}%`, extraFields: { verification: v } }
        );
        await logActivity(issue.id, {
          actor: 'vision-agent',
          action: 'verified',
          detail: `Fix confirmed (confidence ${(v.confidence * 100).toFixed(0)}%) → resolved. ${v.reasoning}`,
          meta: v,
        });
        toast.success('✅ Fix verified — issue resolved!');
      } else {
        // Bounce back to in_progress — do NOT close
        await updateStage(
          { ...issue, stage: STAGES.PENDING_VERIFICATION },
          STAGES.IN_PROGRESS,
          { by: profile.uid, role: 'worker' },
          { note: `vision rejected: ${v.verdict}`, extraFields: { verification: v } }
        );
        await logActivity(issue.id, {
          actor: 'vision-agent',
          action: 'verified',
          detail: `Fix NOT confirmed (${v.verdict}). ${v.reasoning}`,
          meta: v,
        });
        toast.error('Not verified — see AI feedback');
      }
      setResult({ issueId: issue.id, ...v, passed });
    } catch (e) {
      console.error(e);
      toast.error('Verification failed');
    }
    setBusyId(null);
    setBusyMsg('');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 font-bold text-sm">{'<'}</a>
            <div>
              <h1 className="text-xl font-bold text-gray-900">🔧 Field Worker</h1>
              <p className="text-xs text-gray-400">
                {role === 'admin' ? 'All departments' : (department || 'No department set')} · {profile?.displayName}
              </p>
            </div>
          </div>
          <button onClick={logout} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200">
            Logout
          </button>
          <NotificationBell />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">My Work Queue</p>
          <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-semibold">{myQueue.length} open</span>
        </div>

        {myQueue.length === 0 && (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-gray-500">All clear</p>
            <p className="text-sm mt-1">No open issues for your department.</p>
          </div>
        )}

        {myQueue.map((issue) => {
          const st = stageOf(issue);
          const isBusy = busyId === issue.id;
          return (
            <div key={issue.id} className={'bg-white rounded-2xl shadow-sm border overflow-hidden ' + (issue.isEmergency ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-100')}>
              {issue.isEmergency && (
                <div className="bg-red-600 text-white text-xs px-4 py-1.5 font-semibold">⚡ EMERGENCY — top priority</div>
              )}
              <div className="p-4">
                <div className="flex gap-3">
                  {issue.imageUrl ? (
                    <img src={issue.imageUrl} className="w-20 h-20 rounded-xl object-cover shrink-0" alt="" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-3xl shrink-0">{categoryEmoji[issue.category]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-gray-900 text-sm leading-tight">{issue.title}</h3>
                      <span className={'text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ' + (STAGE_META[st]?.color || 'bg-gray-100 text-gray-600')}>
                        {STAGE_META[st]?.label || st}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin size={11} /> {issue.location}</p>
                    <p className="text-xs text-gray-500 mt-1">{issue.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-red-600 font-semibold">Sev {issue.severity}/5</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-blue-600 font-medium">{issue.department}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4">
                  {isBusy ? (
                    <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-xl px-4 py-3">
                      <Loader size={16} className="animate-spin" /> {busyMsg}
                    </div>
                  ) : st === STAGES.REPORTED || st === STAGES.ASSIGNED || st === STAGES.REOPENED ? (
                    <button
                      onClick={() => startWork(issue)}
                      className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Clock size={16} /> Start Work
                    </button>
                  ) : (
                    <label className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                      <Camera size={16} /> Upload Fix Photo (AI verifies)
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => uploadFix(issue, e.target.files[0])}
                      />
                    </label>
                  )}
                </div>

                {/* Verification result */}
                {result?.issueId === issue.id && (
                  <div className={'mt-3 rounded-xl p-3 border ' + (result.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
                    <p className={'text-xs font-bold ' + (result.passed ? 'text-green-700' : 'text-red-700')}>
                      {result.passed ? '✅ Verified by Gemini Vision' : '❌ Not verified'} · {(result.confidence * 100).toFixed(0)}% confidence
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{result.reasoning}</p>
                    {result.remainingProblems?.length > 0 && (
                      <p className="text-xs text-red-600 mt-1">Still visible: {result.remainingProblems.join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}