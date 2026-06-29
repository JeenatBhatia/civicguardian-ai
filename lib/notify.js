// lib/notify.js
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// audience: 'citizen' | 'department' | 'admin'
// Writes a notification that the in-app bell reads in real time.
export async function notify({ audience, department = null, title, body, issueId = null, type = 'update' }) {
  try {
    await addDoc(collection(db, 'notifications'), {
      audience,
      department,     // set when audience === 'department'
      title,
      body,
      issueId,
      type,           // 'new_issue' | 'emergency' | 'status' | 'resolved' | 'update'
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('notify failed', e);
  }
}