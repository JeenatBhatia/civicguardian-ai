"use client";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { generateCommunityBrief } from "@/lib/gemini";
import { Loader } from "lucide-react";
import { useEffect, useState, useRef } from "react";

function HealthBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-bold text-gray-800">{value}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function healthColor(score) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function healthBg(score) {
  if (score >= 80) return "from-green-500 to-green-600";
  if (score >= 60) return "from-yellow-500 to-orange-500";
  if (score >= 40) return "from-orange-500 to-red-500";
  return "from-red-500 to-red-700";
}

export default function HealthPage() {
  const [issues, setIssues] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const hasFetched = useRef(false);

  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIssues(data);
      setLoading(false);

      // Only call Gemini once, not on every Firestore update
      if (data.length > 0 && !hasFetched.current) {
        hasFetched.current = true;
        setAiLoading(true);
        try {
          const brief = await Promise.race([
            generateCommunityBrief(data),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 15000)
            ),
          ]);
          setHealth(brief);
        } catch (e) {
          if (e.message !== "timeout") console.error(e);
          setHealth({
            roadQuality: Math.max(
              0,
              100 - data.filter((i) => i.category === "pothole").length * 15
            ),
            cleanliness: Math.max(
              0,
              100 - data.filter((i) => i.category === "garbage").length * 15
            ),
            safety: Math.max(
              0,
              100 - data.filter((i) => i.isEmergency).length * 20
            ),
            drainage: Math.max(
              0,
              100 - data.filter((i) => i.category === "drainage").length * 15
            ),
            overallHealth: Math.max(
              0,
              100 - data.filter((i) => i.status !== "resolved").length * 5
            ),
            weeklyBrief:
              "Community monitoring is active. " +
              data.length +
              " issues reported, " +
              data.filter((i) => i.status === "resolved").length +
              " resolved.",
            topConcern: data[0]?.category || "None",
          });
        }
        setAiLoading(false);
      }
    });
    return unsub;
  }, []);
  const activeEmergencies = issues.filter(
    (i) => i.isEmergency && i.status !== "resolved"
  ).length;
  const resolvedThisWeek = issues.filter((i) => {
    if (!i.createdAt) return false;
    return (
      i.status === "resolved" &&
      i.createdAt.toMillis?.() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
  }).length;

  const categoryEmoji = {
    pothole: "🕳️",
    streetlight: "💡",
    drainage: "🌊",
    garbage: "🗑️",
    water_leak: "💧",
    other: "⚠️",
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 font-bold text-sm"
            >
              {"<"}
            </a>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                ❤️ Community Health
              </h1>
              <p className="text-xs text-gray-400">
                AI-generated · updates in real time
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* No data state */}
        {!loading && issues.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-4">🏙️</p>
            <p className="font-medium text-gray-600">No issues reported yet</p>
            <p className="text-sm mt-1">
              Report your first issue to generate a community health score
            </p>
            <a
              href="/report"
              className="inline-block mt-4 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium"
            >
              Report Issue
            </a>
          </div>
        )}

        {/* Quick stats — always show if issues exist */}
        {issues.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-red-50 rounded-2xl p-4 text-center border border-red-100">
              <p className="text-3xl font-bold text-red-600">
                {activeEmergencies}
              </p>
              <p className="text-xs text-red-500 mt-1">Active Emergencies</p>
            </div>
            <div className="bg-green-50 rounded-2xl p-4 text-center border border-green-100">
              <p className="text-3xl font-bold text-green-600">
                {resolvedThisWeek}
              </p>
              <p className="text-xs text-green-500 mt-1">Resolved This Week</p>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 text-center border border-blue-100">
              <p className="text-3xl font-bold text-blue-600">
                {issues.length}
              </p>
              <p className="text-xs text-blue-500 mt-1">Total Reports</p>
            </div>
            <div className="bg-purple-50 rounded-2xl p-4 text-center border border-purple-100">
              <p className="text-3xl font-bold text-purple-600">
                {issues.length > 0
                  ? Math.round(
                      issues.reduce((s, i) => s + (i.impactScore || 0), 0) /
                        issues.length
                    )
                  : 0}
              </p>
              <p className="text-xs text-purple-500 mt-1">Avg Impact Score</p>
            </div>
          </div>
        )}

        {/* AI loading */}
        {aiLoading && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <Loader
              className="animate-spin mx-auto mb-3 text-blue-600"
              size={28}
            />
            <p className="text-gray-600 font-medium">
              Gemini is analyzing community health...
            </p>
          </div>
        )}

        {/* AI Health score */}
        {health && !aiLoading && (
          <>
            <div
              className={`bg-gradient-to-br ${healthBg(
                health.overallHealth
              )} rounded-3xl p-6 text-white text-center shadow-sm`}
            >
              <p className="text-sm opacity-80 mb-1">
                Overall Community Health
              </p>
              <p className="text-8xl font-bold">{health.overallHealth}</p>
              <p className="opacity-70 text-sm mt-1">out of 100</p>
              {health.topConcern && (
                <div className="mt-3 bg-white bg-opacity-20 rounded-xl px-4 py-2">
                  <p className="text-xs opacity-80">Top concern</p>
                  <p className="font-semibold capitalize">
                    {health.topConcern.replace("_", " ")}
                  </p>
                </div>
              )}
            </div>

            {/* AI Brief */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-blue-600 font-medium mb-2">
                🤖 Gemini AI Weekly Brief
              </p>
              <p className="text-sm text-gray-700 leading-relaxed italic">
                "{health.weeklyBrief}"
              </p>
            </div>

            {/* Health bars */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
              <p className="text-sm font-semibold text-gray-800">
                Category Scores
              </p>
              <HealthBar
                label="🛣️ Road Quality"
                value={health.roadQuality}
                color="bg-blue-500"
              />
              <HealthBar
                label="🗑️ Cleanliness"
                value={health.cleanliness}
                color="bg-green-500"
              />
              <HealthBar
                label="🛡️ Safety"
                value={health.safety}
                color="bg-purple-500"
              />
              <HealthBar
                label="🌊 Drainage"
                value={health.drainage}
                color="bg-cyan-500"
              />
            </div>
          </>
        )}

        {/* Issue breakdown */}
        {issues.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <p className="text-sm font-semibold text-gray-800 mb-3">
              Issue Breakdown
            </p>
            {[
              "pothole",
              "streetlight",
              "drainage",
              "garbage",
              "water_leak",
              "other",
            ].map((cat) => {
              const count = issues.filter((i) => i.category === cat).length;
              const total = issues.length;
              if (count === 0) return null;
              return (
                <div key={cat} className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">
                      {categoryEmoji[cat]} {cat.replace("_", " ")}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {count}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 bg-blue-400 rounded-full"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
