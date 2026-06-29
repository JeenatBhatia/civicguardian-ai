"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function DashboardPage() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIssues() {
      try {
        const snap = await getDocs(
          query(collection(db, "issues"), orderBy("createdAt", "desc"))
        );

        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setIssues(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadIssues();
  }, []);

  const stats = useMemo(() => {
    const total = issues.length;

    const critical = issues.filter(
      (i) => i.status === "critical"
    ).length;

    const resolved = issues.filter(
      (i) => i.status === "resolved"
    ).length;

    const reported = issues.filter(
      (i) => i.status === "reported"
    ).length;

    const roads = issues.filter(
      (i) => i.category === "pothole"
    ).length;

    const garbage = issues.filter(
      (i) => i.category === "garbage"
    ).length;

    const drainage = issues.filter(
      (i) => i.category === "drainage"
    ).length;

    const streetlights = issues.filter(
      (i) => i.category === "streetlight"
    ).length;

    const emergency = issues.filter(
      (i) => i.isEmergency
    ).length;

    let health = 100;

    health -= critical * 8;
    health -= emergency * 5;
    health -= reported * 2;

    if (health < 0) health = 0;

    return {
      total,
      critical,
      resolved,
      reported,
      roads,
      garbage,
      drainage,
      streetlights,
      emergency,
      health,
    };
  }, [issues]);

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        Loading Dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">

      <div className="bg-blue-700 text-white p-6">

        <h1 className="text-3xl font-bold">
          Community Health Dashboard
        </h1>

        <p className="opacity-90 mt-2">
          AI Powered Civic Intelligence
        </p>

      </div>

      <div className="max-w-6xl mx-auto p-6">

        <div className="grid md:grid-cols-4 gap-5">

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500">
              Community Health
            </p>

            <h2 className="text-5xl font-bold text-green-600 mt-2">
              {stats.health}%
            </h2>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500">
              Total Reports
            </p>

            <h2 className="text-5xl font-bold">
              {stats.total}
            </h2>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500">
              Critical Issues
            </p>

            <h2 className="text-5xl font-bold text-red-600">
              {stats.critical}
            </h2>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-gray-500">
              Resolved
            </p>

            <h2 className="text-5xl font-bold text-blue-600">
              {stats.resolved}
            </h2>
          </div>

        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-8">

          <div className="bg-white rounded-xl shadow p-6">

            <h2 className="text-xl font-bold mb-5">
              Issue Categories
            </h2>

            <div className="space-y-3">

              <div className="flex justify-between">
                <span>🛣 Road Issues</span>
                <span>{stats.roads}</span>
              </div>

              <div className="flex justify-between">
                <span>💡 Streetlights</span>
                <span>{stats.streetlights}</span>
              </div>

              <div className="flex justify-between">
                <span>💧 Drainage</span>
                <span>{stats.drainage}</span>
              </div>

              <div className="flex justify-between">
                <span>🗑 Garbage</span>
                <span>{stats.garbage}</span>
              </div>

            </div>

          </div>

          <div className="bg-white rounded-xl shadow p-6">

            <h2 className="text-xl font-bold mb-5">
              AI Status
            </h2>

            <div className="space-y-3">

              <div className="flex justify-between">
                <span>🚨 Emergency Issues</span>
                <span>{stats.emergency}</span>
              </div>

              <div className="flex justify-between">
                <span>📌 Active Reports</span>
                <span>{stats.reported}</span>
              </div>

              <div className="flex justify-between">
                <span>✅ Resolved</span>
                <span>{stats.resolved}</span>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}