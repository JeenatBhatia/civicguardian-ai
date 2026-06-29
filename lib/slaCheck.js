// lib/slaCheck.js
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, updateDoc, arrayUnion, Timestamp, increment,
} from 'firebase/firestore';
import { STAGES, slaHoursFor, stageOf } from '@/lib/issueLifecycle';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/logActivity';

const ESCALATION_CONTACT = { 1: 'Department Head', 2: 'Municipal Commissioner' };

// Use the real deadline if set; else fall back to createdAt + SLA window.
function effectiveDeadlineMs(issue) {
  if (issue.slaDeadline?.toMillis) return issue.slaDeadline.toMillis();
  const created = issue.createdAt?.toMillis ? issue.createdAt.toMillis() : null;
  if (!created) return null;
  return created + (issue.slaHours || slaHoursFor(issue.severity)) * 3600000;
}

// One autonomous pass. Idempotent — safe to run repeatedly.
export async function runSlaSweep() {
  const now = Date.now();
  const snap = await getDocs(collection(db, 'issues'));
  let escalated = 0, followedUp = 0;

  for (const d of snap.docs) {
    const issue = { id: d.id, ...d.data() };
    const st = stageOf(issue);
    if (st === STAGES.RESOLVED || st === STAGES.DUPLICATE) continue;

    const deadline = effectiveDeadlineMs(issue);
    if (!deadline || now < deadline) continue; // not overdue

    const level = issue.escalationLevel || 0;
    const ref = doc(db, 'issues', issue.id);

    if (level < 2) {
      const newLevel = level + 1;
      const contact = ESCALATION_CONTACT[newLevel] || 'Higher Authority';
      await updateDoc(ref, {
        escalationLevel: newLevel,
        slaBreached: true,
        priorityScore: increment(50),
        statusHistory: arrayUnion({
          stage: st, at: Timestamp.now(), by: 'scheduler', role: 'scheduler',
          note: 'SLA breach escalation L' + newLevel,
        }),
      });
      await notify({
        audience: 'department', department: issue.department,
        title: '⚠️ SLA BREACHED (Level ' + newLevel + '): ' + (issue.title || 'Issue'),
        body: (issue.title || 'An issue') + ' at ' + (issue.location || 'location') +
              ' is overdue. Escalated to ' + contact + '.',
        issueId: issue.id, type: 'emergency',
      });
      await notify({
        audience: 'admin',
        title: '⚠️ Auto-escalation L' + newLevel,
        body: (issue.title || 'Issue') + ' breached its SLA → escalated to ' + contact + '.',
        issueId: issue.id, type: 'emergency',
      });
      await logActivity(issue.id, {
        actor: 'scheduler', action: 'escalated',
        detail: 'SLA breached → escalation level ' + newLevel + ', alerted ' + contact,
        meta: { level: newLevel },
      });
      escalated++;
    } else if (!issue.slaBreached) {
      await updateDoc(ref, { slaBreached: true });
    }

    // Citizen follow-up, at most once every 48h
    const lastFollow = issue.lastFollowUpAt?.toMillis ? issue.lastFollowUpAt.toMillis() : 0;
    if (now - lastFollow > 48 * 3600000) {
      await updateDoc(ref, { lastFollowUpAt: Timestamp.now() });
      await notify({
        audience: 'citizen',
        title: 'Update on your report',
        body: 'Your report "' + (issue.title || 'issue') +
              '" is overdue and has been escalated. We are following up.',
        issueId: issue.id, type: 'status',
      });
      followedUp++;
    }
  }
  return { escalated, followedUp, scanned: snap.size };
}

// Demo helper: force all open issues overdue so the next sweep escalates them.
export async function simulateOverdue() {
  const snap = await getDocs(collection(db, 'issues'));
  const past = Timestamp.fromMillis(Date.now() - 60 * 1000);
  let count = 0;
  for (const d of snap.docs) {
    const st = stageOf({ id: d.id, ...d.data() });
    if (st === STAGES.RESOLVED || st === STAGES.DUPLICATE) continue;
    await updateDoc(doc(db, 'issues', d.id), { slaDeadline: past });
    count++;
  }
  return count;
}