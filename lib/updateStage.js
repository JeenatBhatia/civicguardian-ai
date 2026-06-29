// lib/updateStage.js
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";
import {
  STAGES,
  canTransition,
  slaHoursFor,
  STAGE_META,
} from "@/lib/issueLifecycle";
import { logActivity } from "@/lib/logActivity";
import { stageOf } from "@/lib/issueLifecycle";
import { notify } from "@/lib/notify";

const TS_FIELD = {
  [STAGES.ASSIGNED]: "assignedAt",
  [STAGES.IN_PROGRESS]: "startedAt",
  [STAGES.RESOLVED]: "resolvedAt",
};

// actor = { by, role }. opts = { enforce, note, extraFields }
export async function updateStage(
  issue,
  toStage,
  actor = { by: "admin", role: "admin" },
  opts = {}
) {
  const fromStage = stageOf(issue);

  if (opts.enforce && !canTransition(fromStage, toStage)) {
    throw new Error(`Illegal transition: ${fromStage} → ${toStage}`);
  }

  const now = Timestamp.now();
  const update = {
    stage: toStage,
    status: toStage, // keep legacy field in sync for pages still reading `status`
    statusHistory: arrayUnion({
      stage: toStage,
      at: now,
      by: actor.by,
      role: actor.role,
    }),
    ...(opts.extraFields || {}),
  };

  const tsField = TS_FIELD[toStage];
  if (tsField && !issue[tsField]) update[tsField] = now;

  if (toStage === STAGES.ASSIGNED && !issue.slaDeadline) {
    const hours = issue.slaHours || slaHoursFor(issue.severity);
    update.slaHours = hours;
    update.slaDeadline = Timestamp.fromMillis(now.toMillis() + hours * 3600000);
  }

  await updateDoc(doc(db, "issues", issue.id), update);

  await logActivity(issue.id, {
    actor: `${actor.role}:${actor.by}`,
    action: "stage_change",
    detail: `${STAGE_META[fromStage]?.label || fromStage} → ${
      STAGE_META[toStage]?.label || toStage
    }${opts.note ? ` · ${opts.note}` : ""}`,
    meta: { from: fromStage, to: toStage },
  });
  // Notify on key transitions
  if (toStage === STAGES.RESOLVED) {
    await notify({
      audience: "department",
      department: issue.department,
      title: "✅ Resolved: " + (issue.title || "Issue"),
      body: "Marked resolved at " + (issue.location || "location") + ".",
      issueId: issue.id,
      type: "resolved",
    });
  } else if (toStage === STAGES.IN_PROGRESS) {
    await notify({
      audience: "department",
      department: issue.department,
      title: "🔧 Work started: " + (issue.title || "Issue"),
      body: "A worker has started on this issue.",
      issueId: issue.id,
      type: "status",
    });
  }

  return update;
}
