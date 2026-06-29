"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

const badges = [
  {
    min: 1,
    icon: "🌱",
    label: "Newcomer",
    color: "from-green-400 to-green-500",
  },
  { min: 3, icon: "👀", label: "Observer", color: "from-blue-400 to-blue-500" },
  {
    min: 7,
    icon: "🛡️",
    label: "Guardian",
    color: "from-purple-400 to-purple-500",
  },
  {
    min: 15,
    icon: "⭐",
    label: "Hero",
    color: "from-orange-400 to-orange-500",
  },
  {
    min: 30,
    icon: "🏆",
    label: "Legend",
    color: "from-yellow-400 to-yellow-500",
  },
];

function getBadge(reports) {
  return [...badges].reverse().find((b) => reports >= b.min) || badges[0];
}

const categoryEmoji = {
  pothole: "🕳️",
  streetlight: "💡",
  drainage: "🌊",
  garbage: "🗑️",
  water_leak: "💧",
  other: "⚠️",
};

export default function LeaderboardPage() {
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const stats = {
    totalReports: issues.length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    critical: issues.filter((i) => i.severity >= 4).length,
    emergencies: issues.filter((i) => i.isEmergency).length,
    totalUpvotes: issues.reduce((sum, i) => sum + (i.upvotes || 0), 0),
    avgImpact: issues.length
      ? Math.round(
          issues.reduce((s, i) => s + (i.impactScore || 0), 0) / issues.length
        )
      : 0,
  };

  const badge = getBadge(stats.totalReports);
  const nextBadge = badges.find((b) => b.min > stats.totalReports);
  const topIssues = [...issues]
    .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    .slice(0, 5);
  const resolutionRate =
    stats.totalReports > 0
      ? Math.round((stats.resolved / stats.totalReports) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 font-bold text-sm">
              {'<'}
            </a>
            <div>
              <h1 className="text-xl font-bold text-gray-900">🏆 Impact Board</h1>
              <p className="text-xs text-gray-400">Community contributions and achievements</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Badge card */}
        <div
          className={
            "bg-gradient-to-br " +
            badge.color +
            " rounded-3xl p-6 text-white shadow-sm"
          }
        >
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white bg-opacity-20 rounded-2xl flex items-center justify-center text-5xl">
              {badge.icon}
            </div>
            <div>
              <p className="text-xs font-semibold opacity-75 uppercase tracking-wider">
                Your Rank
              </p>
              <p className="text-3xl font-bold mt-0.5">{badge.label}</p>
              <p className="text-sm opacity-80 mt-1">
                {stats.totalReports} reports submitted
              </p>
            </div>
          </div>

          {nextBadge && (
            <div className="mt-4 pt-4 border-t border-white border-opacity-20">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="opacity-75">
                  Progress to {nextBadge.icon} {nextBadge.label}
                </span>
                <span className="font-semibold">
                  {stats.totalReports}/{nextBadge.min}
                </span>
              </div>
              <div className="w-full bg-white bg-opacity-20 rounded-full h-2">
                <div
                  className="h-2 bg-white rounded-full transition-all"
                  style={{
                    width:
                      Math.min(
                        (stats.totalReports / nextBadge.min) * 100,
                        100
                      ) + "%",
                  }}
                />
              </div>
            </div>
          )}

          {!nextBadge && (
            <div className="mt-4 pt-4 border-t border-white border-opacity-20 text-center">
              <p className="text-sm font-semibold">Maximum rank achieved! 🎉</p>
            </div>
          )}
        </div>

        {/* Badge collection */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-800 mb-4">
            Badge Collection
          </p>
          <div className="grid grid-cols-5 gap-2">
            {badges.map((b) => {
              const unlocked = stats.totalReports >= b.min;
              return (
                <div
                  key={b.label}
                  className={
                    "text-center p-2 rounded-xl " +
                    (unlocked ? "bg-blue-50" : "bg-gray-50 opacity-40")
                  }
                >
                  <p className="text-2xl">{b.icon}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {b.label}
                  </p>
                  <p className="text-xs text-gray-400">{b.min}+ rep</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Community impact */}
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-5 text-white shadow-sm">
          <p className="text-xs font-semibold opacity-75 uppercase tracking-wider mb-3">
            Community Impact
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Issues Reported", value: stats.totalReports },
              { label: "Resolved", value: stats.resolved },
              { label: "Emergencies", value: stats.emergencies },
              { label: "Total Upvotes", value: stats.totalUpvotes },
              { label: "Avg Impact", value: stats.avgImpact + "/100" },
              { label: "Resolution Rate", value: resolutionRate + "%" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-3 text-center"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p
                  className="text-xs text-white mt-0.5"
                  style={{ opacity: 0.75 }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution rate visual */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-800 mb-4">
            Resolution Rate
          </p>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="3"
                  strokeDasharray={resolutionRate + " 100"}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-gray-900">
                  {resolutionRate}%
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Resolved</span>
                <span className="font-bold text-green-600">
                  {stats.resolved}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pending</span>
                <span className="font-bold text-red-600">
                  {stats.totalReports - stats.resolved}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Critical</span>
                <span className="font-bold text-orange-600">
                  {stats.critical}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top confirmed issues */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-800 mb-4">
            Most Confirmed Issues
          </p>
          {topIssues.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No issues yet
            </p>
          )}
          <div className="space-y-3">
            {topIssues.map((issue, i) => (
              <div key={issue.id} className="flex items-center gap-3">
                <div
                  className={
                    "w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold " +
                    (i === 0
                      ? "bg-yellow-100 text-yellow-700"
                      : i === 1
                      ? "bg-gray-100 text-gray-600"
                      : i === 2
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-50 text-gray-400")
                  }
                >
                  {i === 0
                    ? "🥇"
                    : i === 1
                    ? "🥈"
                    : i === 2
                    ? "🥉"
                    : "#" + (i + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {categoryEmoji[issue.category]} {issue.title}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {issue.location}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">
                    👍 {issue.upvotes || 0}
                  </p>
                  <p className="text-xs text-gray-400">votes</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-800 mb-4">
            Issues by Category
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(categoryEmoji).map(([cat, emoji]) => {
              const count = issues.filter((i) => i.category === cat).length;
              return (
                <div
                  key={cat}
                  className={
                    "rounded-xl p-3 text-center " +
                    (count > 0 ? "bg-blue-50" : "bg-gray-50")
                  }
                >
                  <p className="text-2xl">{emoji}</p>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {count}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {cat.replace("_", " ")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
