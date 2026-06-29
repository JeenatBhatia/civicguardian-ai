"use client";
import { analytics } from "@/lib/firebase";
import { logEvent } from "firebase/analytics";
import { translateText } from "@/lib/translate";
import { Timestamp } from "firebase/firestore";
import { STAGES, slaHoursFor } from "@/lib/issueLifecycle";
import { seedActivityFromResults } from "@/lib/logActivity";
import { useState } from "react";
import { notify } from '@/lib/notify';
import {
  classifyIssue,
  generateComplaint,
  calculateImpactScore,
  checkDuplicate,
  checkEmergency,
  generateResolutionPlan,
} from "@/lib/gemini";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { uploadImage } from "@/lib/cloudinary";
import toast from "react-hot-toast";
import {
  Camera,
  MapPin,
  Send,
  Loader,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ArrowLeft,
  Check,
  Sparkles,
} from "lucide-react";
import { runAgentPipeline } from "@/lib/agentOrchestrator";

const steps = ["Photo", "Location", "Analysis", "Review"];

export default function ReportPage() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [step, setStep] = useState("upload");
  const [analysis, setAnalysis] = useState(null);
  const [complaint, setComplaint] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState(null);
  const [impactScore, setImpactScore] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [resolutionPlan, setResolutionPlan] = useState(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [analyzingStep, setAnalyzingStep] = useState("");
  const [masterDecision, setMasterDecision] = useState(null);
  const [translating, setTranslating] = useState(false);

  async function getLocation() {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          if (data?.address) {
            const addr = data.address;
            const parts = [
              addr.road || addr.pedestrian || addr.footway,
              addr.suburb || addr.neighbourhood || addr.village,
              addr.city || addr.town || addr.county,
              addr.state,
            ].filter(Boolean);
            setLocation(parts.join(", "));
          } else {
            setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          }
          toast.success("Location captured!");
        } catch (e) {
          setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          toast.success("Coordinates captured.");
        }
      },
      () => toast.error("Could not get location. Please type it manually.")
    );
  }
  async function handleTranslate(lang) {
    if (!complaint) return toast.error("Generate complaint first");
    setTranslating(true);
    try {
      const translated = await translateText(complaint, lang);
      setComplaint(translated);
      toast.success("Translated successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Translation failed — check API key");
    }
    setTranslating(false);
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function analyzeImage() {
    if (!image) return toast.error("Please select a photo first");
    if (!location) return toast.error("Please capture your location first");
    setStep("analyzing");

    try {
      const existingSnap = await getDocs(
        query(collection(db, "issues"), orderBy("createdAt", "desc"), limit(20))
      );
      const existingIssues = existingSnap.docs.map((d) => d.data());

      const results = await runAgentPipeline(
        image,
        location,
        existingIssues,
        (stepMsg) => setAnalyzingStep(stepMsg)
      );

      setAnalysis(results.classification);
      setImpactScore(results.impact);
      setComplaint(results.complaint);
      setIsEmergency(results.isEmergency);
      setDuplicate(results.duplicate);
      setResolutionPlan(results.resolution);
      setMasterDecision(results.masterDecision);

      if (results.isEmergency)
        toast.error("🚨 Emergency detected! Auto-escalating.");
      if (results.duplicate?.isDuplicate)
        toast("🔍 Similar issue found nearby", { icon: "🔍" });

      setStep("review");
    } catch (err) {
      console.error(err);
      toast.error("AI analysis failed.");
      setStep("upload");
    }
  }

  async function submitReport() {
    setStep("submitting");
    try {
      const imageUrl = await uploadImage(image);

      const docRef = await addDoc(collection(db, "issues"), {
        ...analysis,
        imageUrl,
        complaint,
        location,
        coords,
        upvotes: 0,
        status: isEmergency ? "critical" : "reported", // kept — your existing UI reads this
        stage: STAGES.REPORTED,                          // NEW: drives lifecycle + timeline
        statusHistory: [
          { stage: STAGES.REPORTED, at: Timestamp.now(), by: "citizen", role: "citizen" },
        ],
        isEmergency,
        impactScore: impactScore?.totalImpactScore || analysis.severity * 20,
        priorityScore: isEmergency ? 999 : impactScore?.totalImpactScore || analysis.severity * 20,
        resolutionPlan,
        masterDecision,
        isDuplicate: duplicate?.isDuplicate || false,
        // NEW lifecycle fields:
        assignedTo: null,
        assignedAt: null,
        startedAt: null,
        resolvedAt: null,
        slaHours: slaHoursFor(analysis.severity),
        slaDeadline: null,
        slaBreached: false,
        escalationLevel: isEmergency ? 1 : 0,
        afterImageUrl: null,
        verification: null,
        lastFollowUpAt: null,
        createdAt: serverTimestamp(),
      });

      // Seed the persistent agent activity trail now that we have an id
      await seedActivityFromResults(docRef.id, {
        classification: analysis,
        isEmergency,
        duplicate,
        impact: impactScore,
        resolution: resolutionPlan,
        masterDecision,
      });
      // Agent acts: deliver the alert + citizen message it generated
      const md = masterDecision || {};
      await notify({
        audience: 'department',
        department: analysis.department,
        title: isEmergency ? '⚡ EMERGENCY: ' + analysis.title : 'New issue assigned: ' + analysis.title,
        body: md.authorityAlert || ('A ' + analysis.category + ' issue was reported at ' + location + '.'),
        issueId: docRef.id,
        type: isEmergency ? 'emergency' : 'new_issue',
      });
      await notify({
        audience: 'admin',
        title: isEmergency ? '⚡ Emergency reported' : 'New report submitted',
        body: analysis.title + ' · ' + location,
        issueId: docRef.id,
        type: isEmergency ? 'emergency' : 'new_issue',
      });

      setStep("done");
      toast.success("Report submitted!");
      if (analytics) {
        logEvent(analytics, "issue_reported", {
          category: analysis.category,
          severity: analysis.severity,
          is_emergency: isEmergency,
          impact_score: impactScore?.totalImpactScore || 0,
          department: analysis.department,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Submission failed. Try again.");
      setStep("review");
    }
  }

  const impactColor = (score) => {
    if (score >= 80)
      return { bar: "bg-red-500", text: "text-red-600", bg: "bg-red-50" };
    if (score >= 60)
      return {
        bar: "bg-orange-500",
        text: "text-orange-600",
        bg: "bg-orange-50",
      };
    if (score >= 40)
      return {
        bar: "bg-yellow-500",
        text: "text-yellow-600",
        bg: "bg-yellow-50",
      };
    return { bar: "bg-green-500", text: "text-green-600", bg: "bg-green-50" };
  };

  // Which step of the flow are we on (drives the progress stepper)
  const activeStep =
    step === "review" || step === "done"
      ? 3
      : !image
      ? 0
      : !location
      ? 1
      : 2;

  // ── DONE ──
  if (step === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 text-center max-w-sm w-full overflow-hidden">
          <div
            className={`p-8 text-white ${
              isEmergency
                ? "bg-gradient-to-br from-red-500 to-orange-500"
                : "bg-gradient-to-br from-green-500 to-emerald-600"
            }`}
          >
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">{isEmergency ? "🚨" : "✅"}</span>
            </div>
            <h2 className="text-2xl font-bold">
              {isEmergency ? "Emergency Escalated!" : "Report Submitted!"}
            </h2>
            <p className="text-sm text-white/90 mt-1">
              Routed to <strong>{analysis?.department}</strong>
            </p>
          </div>
          <div className="p-6">
            {impactScore && (
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                  impactColor(impactScore.totalImpactScore).bg
                } mb-6`}
              >
                <span
                  className={`font-bold ${
                    impactColor(impactScore.totalImpactScore).text
                  }`}
                >
                  Impact Score: {Math.min(impactScore.totalImpactScore, 100)}/100
                </span>
              </div>
            )}
            <div className="space-y-2">
              <a
                href="/"
                className="block w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-2xl font-semibold text-sm hover:opacity-95 transition-opacity"
              >
                View on Map
              </a>
              <a
                href="/report"
                className="block w-full bg-gray-100 text-gray-700 py-3 rounded-2xl font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                Report Another Issue
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── ANALYZING ──
  if (step === "analyzing") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 text-center max-w-sm w-full overflow-hidden">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-7 text-white">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Loader className="animate-spin" size={32} />
            </div>
            <h2 className="text-lg font-bold">AI Agents Running</h2>
            <p className="text-sm text-blue-100 mt-1 min-h-[20px]">
              {analyzingStep}
            </p>
          </div>

          <div className="p-5 space-y-2 text-left">
            {[
              "🔍 Vision AI — issue detection",
              "⭐ Impact scoring agent",
              "📝 Complaint generator",
              "🚨 Emergency escalation check",
              "🤖 Duplicate detection agent",
              "🛠️ Resolution planner",
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50"
              >
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                </div>
                <span className="text-xs text-gray-600">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── SUBMITTING ──
  if (step === "submitting") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100 text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Loader className="animate-spin text-green-600" size={36} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            Submitting Report
          </h2>
          <p className="text-sm text-gray-400">
            Uploading image and saving to database...
          </p>
        </div>
      </div>
    );
  }

  // ── MAIN FORM ──
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <a
            href="/"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ArrowLeft size={18} />
          </a>
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-white text-lg">📸</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 leading-none">
              Report an Issue
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Powered by Gemini Vision AI
            </p>
          </div>
        </div>
      </div>

      {/* Progress stepper */}
      <div className="max-w-lg mx-auto px-5 pt-5">
        <div className="flex items-center justify-between">
          {steps.map((label, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all " +
                      (done
                        ? "bg-green-500 text-white"
                        : active
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "bg-gray-200 text-gray-400")
                    }
                  >
                    {done ? <Check size={14} /> : i + 1}
                  </div>
                  <span
                    className={
                      "text-[10px] mt-1 font-semibold " +
                      (active
                        ? "text-blue-600"
                        : done
                        ? "text-green-600"
                        : "text-gray-400")
                    }
                  >
                    {label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={
                      "flex-1 h-0.5 mx-1 mb-4 rounded-full " +
                      (done ? "bg-green-400" : "bg-gray-200")
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Step 1 — Photo */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2.5 border-b border-gray-50">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
              1
            </div>
            <p className="text-sm font-semibold text-gray-800">
              Take a photo of the issue
            </p>
            {image && (
              <CheckCircle size={16} className="text-green-500 ml-auto" />
            )}
          </div>
          <label className="cursor-pointer block">
            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  className="w-full h-56 object-cover"
                  alt="preview"
                />
                <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur">
                  Tap to change
                </div>
              </div>
            ) : (
              <div className="w-full h-56 flex flex-col items-center justify-center gap-3 bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Camera size={28} className="text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-600">
                    Tap to upload or take photo
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    JPG, PNG supported
                  </p>
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>
        </div>

        {/* Step 2 — Location */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2.5 border-b border-gray-50">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
              2
            </div>
            <p className="text-sm font-semibold text-gray-800">
              Capture your location
            </p>
            {location && (
              <CheckCircle size={16} className="text-green-500 ml-auto" />
            )}
          </div>
          <div className="p-4 space-y-3">
            <button
              onClick={getLocation}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:opacity-95 transition-opacity"
            >
              <MapPin size={16} />
              {coords
                ? "📍 Location captured — tap to refresh"
                : "Get My Location"}
            </button>
            {location && (
              <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 flex items-start gap-2">
                <MapPin size={14} className="text-green-600 mt-0.5 shrink-0" />
                <p className="text-sm text-green-800 font-medium">{location}</p>
              </div>
            )}
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-gray-50"
              placeholder="Or type location manually..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        {/* Analyze button */}
        {step === "upload" && (
          <button
            onClick={analyzeImage}
            disabled={!image || !location}
            className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all
              ${
                image && location
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:opacity-95"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            {image && location ? <Sparkles size={18} /> : <Send size={18} />}
            {!image
              ? "Add a photo to continue"
              : !location
              ? "Add location to continue"
              : "Analyze with Gemini AI"}
          </button>
        )}

        {/* Step 3 — Review results */}
        {step === "review" && analysis && (
          <>
            {/* Emergency banner */}
            {isEmergency && (
              <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                <AlertTriangle size={24} className="shrink-0" />
                <div>
                  <p className="font-bold">🚨 Emergency Detected</p>
                  <p className="text-sm opacity-90">
                    Auto-escalated to top priority
                  </p>
                </div>
              </div>
            )}

            {/* Duplicate warning */}
            {duplicate?.isDuplicate && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-yellow-800">
                  🔍 Similar Issue Detected Nearby
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  {duplicate.reason}
                </p>
                <p className="text-xs text-yellow-500 mt-0.5">
                  Confidence: {duplicate.confidence}
                </p>
              </div>
            )}

            {/* AI Detection result */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center gap-2.5">
                <div className="w-7 h-7 bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
                  3
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  🔍 AI Detection Result
                </p>
                <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {analysis.confidence} confidence
                </span>
              </div>
              <div className="p-5 space-y-3">
                <h2 className="text-xl font-bold text-gray-900">
                  {analysis.title}
                </h2>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-semibold capitalize">
                    {analysis.category.replace("_", " ")}
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-800 font-semibold">
                    Severity {analysis.severity}/5
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">
                    → {analysis.department}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {analysis.description}
                </p>
              </div>
            </div>

            {/* Impact Score */}
            {impactScore && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                <p className="text-sm font-semibold text-gray-800">
                  ⭐ Impact Score
                </p>
                <div className="flex items-center gap-4">
                  <div
                    className={`text-5xl font-bold px-5 py-3 rounded-2xl ${
                      impactColor(impactScore.totalImpactScore).bg
                    } ${impactColor(impactScore.totalImpactScore).text}`}
                  >
                    {Math.min(impactScore.totalImpactScore, 100)}
                    <span className="text-xl font-normal opacity-60">/100</span>
                  </div>
                  <p className="text-sm text-gray-500 flex-1 leading-relaxed">
                    {impactScore.impactSummary}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "🛡️ Safety Risk", value: impactScore.safetyRisk },
                    {
                      label: "👥 Population",
                      value: impactScore.populationAffected,
                    },
                    {
                      label: "🚗 Traffic",
                      value: impactScore.trafficDisruption,
                    },
                    { label: "⚡ Severity", value: impactScore.severityScore },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <div className="flex items-end gap-1 mt-1">
                        <p className="text-xl font-bold text-gray-800">
                          {Math.min(item.value, 25)}
                        </p>
                        <p className="text-xs text-gray-400 mb-0.5">/25</p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div
                          className="h-1 bg-blue-500 rounded-full"
                          style={{ width: `${Math.min((item.value / 25) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution Plan */}
            {resolutionPlan && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                <p className="text-sm font-semibold text-gray-800">
                  🛠️ AI Resolution Plan
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: "Priority",
                      value: resolutionPlan.priority,
                      color:
                        resolutionPlan.priority === "Critical"
                          ? "text-red-600"
                          : "text-orange-600",
                    },
                    {
                      label: "Est. Repair",
                      value: resolutionPlan.estimatedRepairTime,
                      color: "text-blue-600",
                    },
                    {
                      label: "Department",
                      value: resolutionPlan.department,
                      color: "text-purple-600",
                    },
                    {
                      label: "Resources",
                      value: resolutionPlan.requiredResources,
                      color: "text-gray-700",
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400">{item.label}</p>
                      <p
                        className={`text-sm font-semibold mt-0.5 ${item.color}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs text-red-700">
                    <span className="font-semibold">⚠️ Risk if delayed:</span>{" "}
                    {resolutionPlan.riskIfDelayed}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">
                      ✅ Recommended action:
                    </span>{" "}
                    {resolutionPlan.recommendedAction}
                  </p>
                </div>
              </div>
            )}
            {masterDecision && (
              <div
                className="rounded-2xl p-5 shadow-sm"
                style={{
                  background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wider mb-3 text-white opacity-75">
                  🧠 Master AI Decision
                </p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  >
                    <p className="text-xs text-white" style={{ opacity: 0.7 }}>
                      Final Priority
                    </p>
                    <p className="font-bold text-lg text-white mt-0.5">
                      {masterDecision.finalPriority}
                    </p>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  >
                    <p className="text-xs text-white" style={{ opacity: 0.7 }}>
                      Resolution
                    </p>
                    <p className="font-bold text-lg text-white mt-0.5">
                      {masterDecision.estimatedResolutionDays} days
                    </p>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  >
                    <p className="text-xs text-white" style={{ opacity: 0.7 }}>
                      Confidence
                    </p>
                    <p className="font-bold text-lg text-white mt-0.5">
                      {masterDecision.confidenceScore}%
                    </p>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  >
                    <p className="text-xs text-white" style={{ opacity: 0.7 }}>
                      Auto Escalate
                    </p>
                    <p className="font-bold text-lg text-white mt-0.5">
                      {masterDecision.autoEscalate ? "✅ Yes" : "❌ No"}
                    </p>
                  </div>
                </div>
                <div
                  className="rounded-xl p-3 mb-2"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                >
                  <p
                    className="text-xs text-white mb-1"
                    style={{ opacity: 0.7 }}
                  >
                    Message to Citizen
                  </p>
                  <p className="text-sm text-white">
                    {masterDecision.citizenMessage}
                  </p>
                </div>
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                >
                  <p
                    className="text-xs text-white mb-1"
                    style={{ opacity: 0.7 }}
                  >
                    AI Reasoning
                  </p>
                  <p className="text-sm text-white" style={{ opacity: 0.9 }}>
                    {masterDecision.reasoning}
                  </p>
                </div>
              </div>
            )}

            {/* Complaint Letter */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm font-semibold text-gray-800 mb-2">
                📄 Generated Complaint Letter
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Auto-drafted by Gemini — you can edit before submitting
              </p>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <p className="text-xs text-gray-500 font-medium">
                  🌐 Translate:
                </p>
                {[
                  { code: "hi", label: "🇮🇳 Hindi" },
                  { code: "en", label: "🇬🇧 English" },
                  { code: "pa", label: "🌾 Punjabi" },
                  { code: "ur", label: "🇵🇰 Urdu" },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleTranslate(lang.code)}
                    disabled={translating}
                    className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {translating ? "..." : lang.label}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full text-sm text-gray-600 border border-gray-200 rounded-xl p-3 h-48 resize-none focus:outline-none focus:border-blue-400 bg-gray-50"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
              />
            </div>

            {/* Submit button */}
            <button
              onClick={submitReport}
              className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-md transition-opacity hover:opacity-95
                ${
                  isEmergency
                    ? "bg-gradient-to-r from-red-600 to-orange-500 text-white"
                    : "bg-gradient-to-r from-green-600 to-emerald-600 text-white"
                }`}
            >
              {isEmergency ? "🚨 Submit Emergency Report" : "✅ Submit Report"}
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}