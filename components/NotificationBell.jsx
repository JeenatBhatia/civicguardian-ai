// components/NotificationBell.jsx
'use client';
import { useEffect, useState, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { Bell } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const typeEmoji = {
  emergency: '⚡',
  new_issue: '📮',
  resolved: '✅',
  status: '🔧',
  update: '🔔',
};

export default function NotificationBell() {
  const { user, role, department } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Live feed of the latest notifications
  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('notifications listener error', err)
    );
    return unsub;
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  // Which notifications this user should see, based on role
  const visible = items.filter((n) => {
    if (role === 'admin') return true; // admins see everything
    if (role === 'worker') return n.audience === 'department' && n.department === department;
    return n.audience === 'citizen'; // plain citizens
  });

  const unread = visible.filter((n) => !n.read).length;

  async function markAllRead() {
    const toMark = visible.filter((n) => !n.read);
    await Promise.all(
      toMark.map((n) =>
        updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {})
      )
    );
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-lg border border-gray-100 z-50">
          <div className="px-4 py-3 border-b border-gray-50 sticky top-0 bg-white">
            <p className="text-sm font-bold text-gray-800">Notifications</p>
          </div>

          {visible.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No notifications yet
            </div>
          )}

          {visible.map((n) => (
            <div
              key={n.id}
              className={
                'px-4 py-3 border-b border-gray-50 ' +
                (!n.read ? 'bg-blue-50' : '')
              }
            >
              <div className="flex gap-2">
                <span className="text-base">{typeEmoji[n.type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {n.createdAt?.toDate
                      ? n.createdAt.toDate().toLocaleString()
                      : 'just now'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}