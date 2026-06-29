// lib/issueLifecycle.js
// Pure helpers for the civic issue lifecycle. No Firebase — safe anywhere.

export const STAGES = {
    REPORTED: "reported",
    ASSIGNED: "assigned",
    IN_PROGRESS: "in_progress",
    PENDING_VERIFICATION: "pending_verification",
    RESOLVED: "resolved",
    DUPLICATE: "duplicate",
    REOPENED: "reopened",
  };
  
  // Legal transitions. Everything else is rejected by the guard.
  export const ALLOWED_TRANSITIONS = {
    reported: ["assigned", "duplicate"],
    assigned: ["in_progress"],
    in_progress: ["pending_verification"],
    pending_verification: ["resolved", "in_progress"],
    resolved: ["reopened"],
    reopened: ["in_progress"],
    duplicate: [],
  };
  
  export function canTransition(from, to) {
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
  }
  
  // SLA window (hours) by severity — used to compute a deadline at assignment.
  export const SLA_HOURS = { 5: 24, 4: 48, 3: 72, 2: 120, 1: 168 };
  export function slaHoursFor(severity) {
    return SLA_HOURS[severity] || 72;
  }
  
  // Map a stage to your 4-step timeline (Reported → Assigned → Repair → Done).
  export function timelineState(stage) {
    const reached = (arr) => arr.includes(stage);
    return {
      reported: true,
      assigned: reached(["assigned", "in_progress", "pending_verification", "resolved"]),
      repair: reached(["in_progress", "pending_verification", "resolved"]),
      done: stage === "resolved",
    };
  }
  
  // Map a stage to the admin tab buckets (New / Active / Done).
  export function adminTab(stage) {
    if (stage === "resolved") return "done";
    if (["assigned", "in_progress", "pending_verification", "reopened"].includes(stage)) return "active";
    return "new"; // reported, duplicate
  }
  
  // Lifecycle badge (kept separate from your severity "Critical" badge).
  export const STAGE_META = {
    reported: { label: "New", color: "bg-blue-100 text-blue-700" },
    assigned: { label: "Assigned", color: "bg-indigo-100 text-indigo-700" },
    in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
    pending_verification: { label: "Verifying", color: "bg-purple-100 text-purple-700" },
    resolved: { label: "Resolved", color: "bg-green-100 text-green-700" },
    duplicate: { label: "Duplicate", color: "bg-gray-100 text-gray-600" },
    reopened: { label: "Reopened", color: "bg-orange-100 text-orange-700" },
  };
  
  // Backfill for old issues created before `stage` existed.
  export function stageOf(issue) {
    if (issue.stage) return issue.stage;
    // Backfill from legacy `status` for issues created before `stage` existed.
    switch (issue.status) {
      case 'resolved': return 'resolved';
      case 'in_progress': return 'in_progress';
      case 'verified': return 'assigned';
      default: return 'reported'; // reported, critical, undefined
    }
  }