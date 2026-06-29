// lib/logActivity.js
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function logActivity(issueId, { actor, action, detail, meta = {} }) {
  try {
    await addDoc(collection(db, "issues", issueId, "activity"), {
      actor, action, detail, meta, at: serverTimestamp(),
    });
  } catch (e) {
    console.error("logActivity failed", e);
  }
}

// Seed the trail from a finished agent run, right after the issue doc is created.
export async function seedActivityFromResults(issueId, results) {
  const c = results.classification || {};
  const entries = [
    {
      actor: "vision-agent",
      action: "classified",
      detail: `Detected ${(c.category || "").replace("_", " ")} · severity ${c.severity}/5 → routed to ${c.department}`,
      meta: { category: c.category, severity: c.severity, department: c.department },
    },
  ];

  if (results.isEmergency) {
    entries.push({
      actor: "emergency-agent", action: "escalated",
      detail: "Emergency thresholds met → auto-escalated to top priority", meta: {},
    });
  }
  if (results.duplicate) {
    entries.push({
      actor: "duplicate-agent", action: "dedupe",
      detail: results.duplicate.isDuplicate
        ? `Possible duplicate (${results.duplicate.confidence}) — ${results.duplicate.reason}`
        : "Checked nearby reports — no duplicates found",
      meta: results.duplicate,
    });
  }
  if (results.impact) {
    entries.push({
      actor: "impact-agent", action: "impact",
      detail: `Impact score ${results.impact.totalImpactScore}/100 — ${results.impact.impactSummary}`,
      meta: results.impact,
    });
  }
  if (results.resolution) {
    entries.push({
      actor: "resolution-agent", action: "plan",
      detail: `Plan: ${results.resolution.recommendedAction} (${results.resolution.estimatedRepairTime})`,
      meta: results.resolution,
    });
  }
  if (results.masterDecision) {
    const m = results.masterDecision;
    entries.push({
      actor: "master-agent", action: "decision",
      detail: `Final priority ${m.finalPriority} · ETA ${m.estimatedResolutionDays}d · confidence ${m.confidenceScore}%`,
      meta: { reasoning: m.reasoning },
    });
  }

  for (const e of entries) await logActivity(issueId, e); // sequential → ordered
}