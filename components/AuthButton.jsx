// components/AuthButton.jsx
'use client';
import { useAuth } from '@/lib/AuthContext';

export default function AuthButton() {
  const { user, profile, role, logout } = useAuth();

  if (!user) {
    return (
      <a href="/login" className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors">
        Sign in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-xs font-semibold text-gray-800">{profile?.displayName || 'User'}</span>
        <span className="text-[10px] text-gray-400 capitalize">{role}</span>
      </div>
      <button
        onClick={logout}
        className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
      >
        Logout
      </button>
    </div>
  );
}