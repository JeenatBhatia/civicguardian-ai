// components/ActivityPanel.jsx
"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

const ICONS = {
  classified: "🔍", dedupe: "🔗", impact: "📊", plan: "🛠️", decision: "🧠",
  escalated: "⚡", assigned: "📮", started: "🔧", notified: "📲",
  verified: "✅", stage_change: "➡️",
};

export default function ActivityPanel({ issueId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!issueId) return;
    const q = query(collection(db, "issues", issueId, "activity"), orderBy("at", "asc"));
    const unsub = onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [issueId]);

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-400">
        No agent activity yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">🤖 Agent Activity</h3>
      <ol className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="flex gap-3 text-sm">
            <span className="mt-0.5 text-base">{ICONS[it.action] || "•"}</span>
            <div className="flex-1">
              <p className="text-gray-800">{it.detail}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {it.actor}{it.at?.toDate ? " · " + it.at.toDate().toLocaleString() : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}