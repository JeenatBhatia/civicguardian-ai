"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Bot, Send, X } from "lucide-react";

// Backfill helper — reads new `stage`, falls back to legacy `status`.
function stageOf(i) {
  if (i.stage) return i.stage;
  if (i.status === "resolved") return "resolved";
  if (i.status === "in_progress") return "in_progress";
  return "reported";
}
function isResolved(i) {
  return stageOf(i) === "resolved";
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `👋 Hi! I'm CivicGuardian AI.

I can answer instantly:

- Total issues
- Potholes
- Water leaks
- Garbage complaints
- Streetlights
- Drainage
- Active issues
- Resolved issues
- Most urgent issue
- Department with most complaints`,
    },
  ]);

  useEffect(() => {
    return onSnapshot(collection(db, "issues"), (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  function reply(text) {
    setMessages((prev) => [...prev, { role: "assistant", text }]);
    setLoading(false);
  }

  // Build a set of distinct location WORDS from all issues (e.g. "fatehabad",
  // "haryana", "lajpatnagar", "delhi"). Then check if any appears in the query.
  function findCity(text) {
    const words = new Set();
    issues.forEach((i) => {
      (i.location || "")
        .toLowerCase()
        .split(/[\s,]+/) // split on spaces and commas
        .filter((w) => w.length >= 3) // ignore tiny tokens
        .forEach((w) => words.add(w));
    });

    for (const w of words) {
      if (text.includes(w)) {
        // Return the nicely-cased version from the first matching issue
        const match = issues.find((i) =>
          (i.location || "").toLowerCase().includes(w)
        );
        return { token: w, label: match ? match.location : w };
      }
    }
    return null;
  }

  async function sendMessage() {
    if (!question.trim()) return;

    const userMessage = question;
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setQuestion("");
    setLoading(true);

    try {
      const text = userMessage
        .toLowerCase()
        .replace(/pothholes|pot holes|pothole/g, "pothole")
        .replace(/priorities/g, "priority")
        .replace(/repaired|repair|fixed/g, "repair");

      // ---- location detection (word-based, not whole-string) ----
      const city = findCity(text);
      const cityLabel = city ? city.label : null;
      const inCity = (i) =>
        !city || (i.location || "").toLowerCase().includes(city.token);
      const scoped = city ? issues.filter(inCity) : issues;
      const suffix = cityLabel ? ` in ${cityLabel}` : "";

      // Pretty list of matching issues, showing live stage
      const listOf = (arr) =>
        arr
          .slice(0, 8)
          .map(
            (i) =>
              `• ${i.title} — Sev ${i.severity}/5, ${stageOf(i).replace(
                "_",
                " "
              )}`
          )
          .join("\n");

      // helper to answer a category question with location awareness
      const answerCategory = (label, catKey) => {
        const matches = scoped.filter((i) => i.category === catKey);
        if (matches.length === 0) {
          reply(`No ${label} complaints found${suffix}.`);
          return;
        }
        reply(
          `${matches.length} ${label} complaint${
            matches.length > 1 ? "s" : ""
          }${suffix}:\n\n${listOf(matches)}`
        );
      };

      // ---------------- TOTAL ----------------
      if (text.includes("total")) {
        reply(`There are ${scoped.length} reported issues${suffix}.`);
        return;
      }

      // ---------------- POTHOLES ----------------
      if (text.includes("pothole")) {
        if (text.includes("repair")) {
          const n = scoped.filter((i) => i.category === "pothole").length;
          reply(
            `${n} pothole${
              n !== 1 ? "s" : ""
            } reported${suffix}. High-severity ones are scheduled for repair first.`
          );
          return;
        }
        answerCategory("pothole", "pothole");
        return;
      }

      // ---------------- WATER ----------------
      if (text.includes("water")) {
        answerCategory("water leak", "water_leak");
        return;
      }

      // ---------------- GARBAGE ----------------
      if (text.includes("garbage") || text.includes("trash")) {
        answerCategory("garbage", "garbage");
        return;
      }

      // ---------------- STREETLIGHT ----------------
      if (text.includes("street") || text.includes("light")) {
        answerCategory("streetlight", "streetlight");
        return;
      }

      // ---------------- DRAINAGE ----------------
      if (text.includes("drain")) {
        answerCategory("drainage", "drainage");
        return;
      }

      // ---------------- ACTIVE ----------------
      if (
        text.includes("active") ||
        text.includes("pending") ||
        text.includes("open")
      ) {
        const active = scoped.filter((i) => !isResolved(i));
        if (active.length === 0) {
          reply(`No active issues${suffix} — all clear!`);
          return;
        }
        reply(
          `${active.length} active issue${
            active.length > 1 ? "s" : ""
          }${suffix}:\n\n${listOf(active)}`
        );
        return;
      }

      // ---------------- RESOLVED ----------------
      if (
        text.includes("resolved") ||
        text.includes("done") ||
        text.includes("fixed")
      ) {
        const done = scoped.filter(isResolved);
        reply(
          `${done.length} resolved issue${
            done.length !== 1 ? "s" : ""
          }${suffix}.`
        );
        return;
      }

      // ---------------- PRIORITY ----------------
      if (text.includes("priority") || text.includes("urgent")) {
        const highest = [...scoped].sort(
          (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)
        )[0];
        if (!highest) {
          reply(`No issues found${suffix}.`);
          return;
        }
        reply(
          `🚨 Highest priority issue${suffix}:\n\n📍 ${highest.title}\n📌 ${
            highest.location
          }\n⚠️ Severity ${highest.severity}/5\n🔧 Status: ${stageOf(
            highest
          ).replace("_", " ")}\n⭐ Priority score ${highest.priorityScore || 0}`
        );
        return;
      }

      // ---------------- DEPARTMENT ----------------
      if (text.includes("department")) {
        const count = {};
        scoped.forEach((i) => {
          if (i.department)
            count[i.department] = (count[i.department] || 0) + 1;
        });
        const entries = Object.entries(count).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
          reply(`No department data${suffix}.`);
          return;
        }
        const [dept, mx] = entries[0];
        reply(`${dept} has the most complaints${suffix}: ${mx}.`);
        return;
      }

      // ---------------- SHOW / LIST ----------------
      if (
        text.includes("show") ||
        text.includes("list") ||
        text.includes("what") ||
        (city && scoped.length > 0)
      ) {
        if (scoped.length === 0) {
          reply(`No issues found${suffix}.`);
          return;
        }
        reply(
          `${scoped.length} issue${
            scoped.length > 1 ? "s" : ""
          }${suffix}:\n\n${listOf(scoped)}`
        );
        return;
      }

      // ---------------- REPAIR (general) ----------------
      if (text.includes("repair")) {
        reply(
          `Repair priority depends on severity:\n\nSeverity 5 → 24 hours\nSeverity 4 → 3 days\nSeverity 3 → 1 week\nSeverity 1–2 → Scheduled maintenance`
        );
        return;
      }

      // ---------------- SUMMARY (fallback) ----------------
      reply(
        `Community Summary${suffix}\n\n📍 Total reports: ${
          scoped.length
        }\n🚨 Emergencies: ${
          scoped.filter((i) => i.isEmergency).length
        }\n🛠 Active: ${
          scoped.filter((i) => !isResolved(i)).length
        }\n✅ Resolved: ${scoped.filter(isResolved).length}`
      );
    } catch (error) {
      console.error(error);
      let message = "🚦 Something went wrong. Please try again.";
      if (error?.message?.includes("429"))
        message = "🚦 Rate limit reached. Please wait a minute and try again.";
      if (error?.message?.includes("503"))
        message = "⚠️ Service is busy right now. Please try again shortly.";
      reply(message);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-xl"
      >
        <Bot size={28} />
      </button>

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[380px] flex-col rounded-3xl border bg-white shadow-2xl">
          <div className="flex items-center justify-between rounded-t-3xl bg-purple-600 p-5 text-white">
            <div>
              <h2 className="font-bold">🤖 CivicGuardian AI</h2>
              <p className="text-xs opacity-80">Autonomous Civic Assistant</p>
            </div>
            <button onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap rounded-2xl p-3 ${
                  m.role === "assistant"
                    ? "bg-gray-100"
                    : "ml-10 bg-purple-600 text-white"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="rounded-xl bg-gray-100 p-3">Thinking...</div>
            )}
          </div>

          <div className="flex gap-2 border-t p-3">
            <input
              className="flex-1 rounded-xl border px-3 py-2"
              placeholder="Ask about your community..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />
            <button
              onClick={sendMessage}
              className="rounded-xl bg-purple-600 px-4 text-white"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
