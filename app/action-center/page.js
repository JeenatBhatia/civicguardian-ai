"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { generateActionQueue } from "@/lib/gemini";

import {
  Loader,
  AlertTriangle,
  Clock,
  Building2,
  Sparkles,
} from "lucide-react";

const priorityColor = {
  Critical: "bg-red-100 text-red-700 border-red-300",
  High: "bg-orange-100 text-orange-700 border-orange-300",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low: "bg-green-100 text-green-700 border-green-300",
};

export default function ActionCenterPage() {
  const [issues, setIssues] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "issues"),
      orderBy("priorityScore", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setIssues(data);

      try {
        const result = await generateActionQueue(data);
        setTasks(result);
      } catch (e) {
        console.log(e);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">

      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white px-8 py-8">

        <div className="max-w-6xl mx-auto">

          <div className="flex items-center gap-3">

            <Sparkles size={34} />

            <div>

              <h1 className="text-3xl font-bold">
                AI Action Center
              </h1>

              <p className="text-slate-300 mt-1">
                Autonomous Municipal Planning Agent
              </p>

            </div>

          </div>

        </div>

      </div>

      <div className="max-w-6xl mx-auto p-8">

        <div className="grid grid-cols-4 gap-4 mb-8">

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">
              Today's Tasks
            </p>

            <h2 className="text-4xl font-bold mt-2">
              {tasks.length}
            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">
              Critical Issues
            </p>

            <h2 className="text-4xl font-bold text-red-600 mt-2">
              {issues.filter(i => i.severity >= 4).length}
            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">
              Emergencies
            </p>

            <h2 className="text-4xl font-bold text-orange-600 mt-2">
              {issues.filter(i => i.isEmergency).length}
            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">
              Reports
            </p>

            <h2 className="text-4xl font-bold text-blue-600 mt-2">
              {issues.length}
            </h2>

          </div>

        </div>

        {loading && (

          <div className="text-center py-20">

            <Loader
              className="animate-spin mx-auto text-blue-600 mb-5"
              size={40}
            />

            <p className="text-gray-600">
              Gemini AI is preparing today's work plan...
            </p>

          </div>

        )}

        {!loading && tasks.length === 0 && (

          <div className="bg-white rounded-3xl p-16 text-center shadow">

            <AlertTriangle
              className="mx-auto text-yellow-500 mb-4"
              size={50}
            />

            <h2 className="text-2xl font-bold mb-2">

              Nothing to plan today

            </h2>

            <p className="text-gray-500">

              Add some community reports to let AI
              generate today's municipal work queue.

            </p>

          </div>

        )}

        <div className="space-y-5">

          {tasks.map((task, index) => (

            <div
              key={index}
              className="bg-white rounded-3xl shadow p-6"
            >

              <div className="flex justify-between">

                <div>

                  <h2 className="text-xl font-bold">

                    {task.title}

                  </h2>

                  <p className="text-gray-500 mt-2">

                    {task.reason}

                  </p>

                </div>

                <span
                  className={`px-4 py-2 rounded-full border text-sm font-bold ${priorityColor[task.priority]}`}
                >

                  {task.priority}

                </span>

              </div>

              <div className="grid grid-cols-3 gap-6 mt-6">

                <div className="bg-gray-50 rounded-xl p-4">

                  <Building2 className="mb-2" />

                  <p className="text-xs text-gray-500">

                    Department

                  </p>

                  <p className="font-bold">

                    {task.department}

                  </p>

                </div>

                <div className="bg-gray-50 rounded-xl p-4">

                  <Clock className="mb-2" />

                  <p className="text-xs text-gray-500">

                    ETA

                  </p>

                  <p className="font-bold">

                    {task.estimatedTime}

                  </p>

                </div>

                <div className="bg-gray-50 rounded-xl p-4">

                  <AlertTriangle className="mb-2" />

                  <p className="text-xs text-gray-500">

                    Impact

                  </p>

                  <p className="font-bold">

                    {task.impact}

                  </p>

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}