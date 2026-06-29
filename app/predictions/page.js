// app/predictions/page.js
"use client";
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Loader, Sparkles, RefreshCw } from "lucide-react";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
const MODEL = "gemini-2.5-flash-lite";

// ---------- inline helpers (no external imports) ----------
function effectiveStage(i) {
  if (i.stage) return i.stage;
  if (i.status === "resolved") return "resolved";
  if (i.status === "in_progress") return "in_progress";
  return "reported";
}

function isOpen(i) {
  const s = effectiveStage(i);
  return s !== "resolved" && s !== "duplicate";
}

function summarize(issues) {
  const open = issues.filter(isOpen);
  const byCategory = {};
  const byLocation = {};
  open.forEach((i) => {
    if (i.category) byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    const loc = (i.location || "").split(",")[0].trim() || "Unknown";
    byLocation[loc] = (byLocation[loc] || 0) + 1;
  });
  return { open, byCategory, byLocation };
}

// Deterministic fallback — always returns at least one prediction.
function localPredictions(issues) {
  const { open, byCategory, byLocation } = summarize(issues);
  const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const topLoc = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
  const preds = [];

  if (topLoc) {
    preds.push({
      area: topLoc[0],
      risk: topLoc[1] >= 2 ? "High" : "Medium",
      category: topCat ? topCat[0] : "general",
      prediction:
        topLoc[0] +
        " has the highest concentration of open issues (" +
        topLoc[1] +
        "). Civic risk is likely to rise here if not addressed soon.",
      recommendation:
        "Prioritize an inspection team for " + topLoc[0] + " this week.",
      confidence: 70,
    });
  }
  if (topCat) {
    preds.push({
      area: "Citywide",
      risk: topCat[1] >= 3 ? "High" : "Medium",
      category: topCat[0],
      prediction:
        topCat[0].replace("_", " ") +
        " is the most-reported issue type (" +
        topCat[1] +
        " open). Expect continued reports in this category.",
      recommendation:
        "Allocate dedicated resources to " +
        topCat[0].replace("_", " ") +
        " repairs.",
      confidence: 65,
    });
  }
  if (preds.length === 0) {
    preds.push({
      area: "Citywide",
      risk: "Low",
      category: "general",
      prediction:
        "No significant issue clusters detected. Community conditions appear stable.",
      recommendation: "Maintain routine monitoring.",
      confidence: 60,
    });
  }
  return { predictions: preds, openCount: open.length, source: "local" };
}

// Never throws — always returns a usable result.
async function generatePredictions(issues) {
  const { open, byCategory, byLocation } = summarize(issues);
  if (open.length === 0) return localPredictions(issues);

  const recent = open
    .slice(0, 8)
    .map(
      (i) =>
        i.title +
        " (" +
        i.category +
        ", sev " +
        i.severity +
        ", " +
        i.location +
        ")"
    )
    .join(" | ");

  const prompt =
    "You are CivicGuardian AI's predictive risk engine for a municipal authority in India.\n\n" +
    "Current OPEN civic issues: " +
    open.length +
    "\n" +
    "By category: " +
    JSON.stringify(byCategory) +
    "\n" +
    "By area: " +
    JSON.stringify(byLocation) +
    "\n" +
    "Recent issues: " +
    recent +
    "\n\n" +
    "Based ONLY on this data, predict 2-3 future civic risks. Identify which areas/categories are likely to worsen and give a concrete proactive recommendation for authorities. Be specific and actionable.\n\n" +
    "Respond ONLY with this JSON, no markdown:\n" +
    '{\n  "predictions": [\n    {\n      "area": "area name or Citywide",\n      "risk": "High",\n      "category": "issue category",\n      "prediction": "one specific sentence about the predicted risk",\n      "recommendation": "one concrete action for authorities",\n      "confidence": 80\n    }\n  ]\n}';

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    let result;
    try {
      result = await model.generateContent(prompt);
    } catch (firstErr) {
      // 503 high-demand is usually transient — wait 1.5s and retry once
      await new Promise((r) => setTimeout(r, 1500));
      result = await model.generateContent(prompt);
    }
    const clean = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const data = JSON.parse(clean);
    if (!Array.isArray(data.predictions) || data.predictions.length === 0) {
      return localPredictions(issues);
    }
    const predictions = data.predictions.map((p) => ({
      area: p.area || "Citywide",
      risk: ["High", "Medium", "Low"].includes(p.risk) ? p.risk : "Medium",
      category: p.category || "general",
      prediction: p.prediction || "Risk detected based on current reports.",
      recommendation: p.recommendation || "Review and allocate resources.",
      confidence: typeof p.confidence === "number" ? p.confidence : 70,
    }));
    return { predictions, openCount: open.length, source: "gemini" };
  } catch (e) {
    console.error("prediction gemini failed, using local fallback", e);
    return localPredictions(issues);
  }
}

// ---------- UI maps ----------
const riskColor = {
  High: "border-red-200 bg-red-50",
  Medium: "border-orange-200 bg-orange-50",
  Low: "border-yellow-200 bg-yellow-50",
};

const riskBadge = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-orange-100 text-orange-700",
  Low: "bg-yellow-100 text-yellow-700",
};

const categoryEmoji = {
  pothole: "🕳️",
  streetlight: "💡",
  drainage: "🌊",
  garbage: "🗑️",
  water_leak: "💧",
  general: "📊",
  other: "⚠️",
};

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issueCount, setIssueCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [source, setSource] = useState("gemini");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "issues"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIssueCount(data.length);
      if (data.length === 0) {
        setPredictions([]);
        return;
      }
      const res = await generatePredictions(data);
      setPredictions(res.predictions || []);
      setOpenCount(res.openCount || 0);
      setSource(res.source || "gemini");
    } catch (e) {
      console.error(e);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
                🔮 AI Predictions
              </h1>
              <p className="text-xs text-gray-400">
                Future risk detection powered by Gemini
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 bg-purple-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />{" "}
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="text-center py-16">
            <Loader
              className="animate-spin mx-auto mb-3 text-purple-600"
              size={32}
            />
            <p className="text-gray-600 font-medium">
              Gemini is analyzing patterns...
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Detecting future risk hotspots
            </p>
          </div>
        )}

        {!loading && issueCount === 0 && (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🔮</p>
            <p className="font-medium text-gray-700">
              No data to predict from yet
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Report your first issue and the AI will start forecasting civic
              risks.
            </p>
            <a
              href="/report"
              className="inline-block mt-4 bg-purple-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Report Issue
            </a>
          </div>
        )}

        {!loading && predictions.length > 0 && (
          <>
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-4 text-white">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="opacity-80" />
                <p className="text-xs opacity-75">
                  {source === "gemini"
                    ? "Gemini AI Analysis"
                    : "Pattern Analysis"}
                </p>
              </div>
              <p className="font-semibold">Predictive Risk Report</p>
              <p className="text-xs opacity-75 mt-1">
                Based on {openCount} open issue{openCount !== 1 ? "s" : ""}{" "}
                across {issueCount} total report{issueCount !== 1 ? "s" : ""}
              </p>
            </div>

            {predictions.map((pred, i) => (
              <div
                key={i}
                className={
                  "rounded-2xl p-5 shadow-sm border " +
                  (riskColor[pred.risk] || "bg-white border-gray-100")
                }
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900 text-base">
                      {categoryEmoji[pred.category] || "⚠️"} {pred.area}
                    </p>
                    <span
                      className={
                        "inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium " +
                        (riskBadge[pred.risk] || "bg-gray-100 text-gray-600")
                      }
                    >
                      {pred.risk} risk
                    </span>
                  </div>
                  <span className="text-3xl">🔮</span>
                </div>

                <div className="bg-white bg-opacity-60 rounded-xl p-3 mb-3">
                  <p className="text-sm font-medium text-gray-800">
                    {pred.prediction}
                  </p>
                </div>

                <div className="bg-white bg-opacity-60 rounded-xl p-3 mb-3">
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold">
                      ✅ Recommended action:
                    </span>{" "}
                    {pred.recommendation}
                  </p>
                </div>

                {typeof pred.confidence === "number" && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        AI confidence
                      </span>
                      <span className="text-xs font-bold text-gray-700">
                        {pred.confidence}%
                      </span>
                    </div>
                    <div className="w-full bg-white bg-opacity-60 rounded-full h-1.5">
                      <div
                        className="h-1.5 bg-purple-500 rounded-full"
                        style={{ width: pred.confidence + "%" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs text-blue-700 font-medium">
                ℹ️ About these predictions
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Generated by analyzing patterns in reported issues. Tap Refresh
                to regenerate as new reports come in.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
