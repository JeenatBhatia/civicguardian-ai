// lib/AuthContext.jsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // firebase auth user
  const [profile, setProfile] = useState(null);  // firestore users/{uid}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, 'users', u.uid);
        let snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            role: 'citizen', // default — promote workers/admins manually
            displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'User'),
            email: u.email || '',
            department: null,
            fcmTokens: [],
            createdAt: serverTimestamp(),
          });
          snap = await getDoc(ref);
        }
        setProfile({ uid: u.uid, ...snap.data() });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signUp(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        role: 'citizen',
        displayName: displayName || email.split('@')[0],
        email,
        department: null,
        fcmTokens: [],
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
    return cred.user;
  }

  async function signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async function signInWithGoogle() {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    return cred.user;
  }

  async function logout() {
    await signOut(auth);
  }

  const value = {
    user,
    profile,
    role: profile?.role || null,
    department: profile?.department || null,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}