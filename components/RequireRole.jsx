// components/RequireRole.jsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Loader } from 'lucide-react';

export default function RequireRole({ roles, children }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (roles && !roles.includes(role)) router.replace('/');
  }, [user, role, loading, roles, router]);

  if (loading || !user || (roles && !roles.includes(role))) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-400">
        <Loader size={28} className="animate-spin mb-3" />
        <p className="text-sm">Checking access…</p>
      </div>
    );
  }
  return children;
}