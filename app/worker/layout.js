// app/worker/layout.js
'use client';
import RequireRole from '@/components/RequireRole';

export default function WorkerLayout({ children }) {
  return <RequireRole roles={['worker', 'admin']}>{children}</RequireRole>;
}