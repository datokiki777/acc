import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

import type { ReactBackupData } from '../types/persistence';
import { historyExpiry, planHistoryRetention } from './cloud-retention';
import { firebaseAuth, firestore } from './firebase';

export interface CloudUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface CloudBackupEntry {
  id: string;
  kind: 'latest' | 'history';
  label: string;
  savedAt: string;
}

function toCloudUser(user: User): CloudUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function onCloudAuthChange(callback: (user: CloudUser | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, (user) => callback(user ? toCloudUser(user) : null));
}

function friendlyAuthError(error: unknown): Error {
  const code = (error as { code?: string } | undefined)?.code ?? '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email — try Create account.',
    'auth/email-already-in-use': 'An account with that email already exists — try Sign in.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts — try again in a moment.',
  };
  return new Error(messages[code] ?? (error instanceof Error ? error.message : 'Sign-in failed'));
}

export async function signInWithEmail(email: string, password: string): Promise<CloudUser> {
  try {
    const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return toCloudUser(result.user);
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

export async function registerWithEmail(email: string, password: string): Promise<CloudUser> {
  try {
    const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    return toCloudUser(result.user);
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

export async function signOutOfCloud(): Promise<void> {
  await signOut(firebaseAuth);
}

function historyDateKey(referenceDate: Date): string {
  return [
    referenceDate.getFullYear(),
    String(referenceDate.getMonth() + 1).padStart(2, '0'),
    String(referenceDate.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateLabel(value: string): string {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

/**
 * Trims the daily history after a save (see planHistoryRetention for the rule) and brings the
 * stored expiry of the copies that stay up to date.
 */
async function applyHistoryRetention(uid: string, referenceDate: Date): Promise<void> {
  const historyRef = collection(firestore, 'acc_users', uid, 'backups_history');
  const snapshot = await getDocs(historyRef);
  const plan = planHistoryRetention(
    snapshot.docs.map((entry) => ({
      id: entry.id,
      expireAtMs: (entry.data().expireAt as Timestamp | undefined)?.toMillis?.(),
    })),
    referenceDate,
  );
  const byId = new Map(snapshot.docs.map((entry) => [entry.id, entry.ref]));
  await Promise.all([
    ...plan.remove.map((id) => deleteDoc(byId.get(id)!)),
    ...plan.refreshExpiry.map(({ id, expireAt }) =>
      setDoc(byId.get(id)!, { expireAt: Timestamp.fromDate(expireAt) }, { merge: true }),
    ),
  ]);
}

export async function saveBackupToCloud(
  uid: string,
  backup: ReactBackupData,
  referenceDate: Date,
): Promise<void> {
  const payload = JSON.stringify(backup);
  const latestRef = doc(firestore, 'acc_users', uid, 'backups', 'latest');
  const historyRef = doc(
    firestore,
    'acc_users',
    uid,
    'backups_history',
    historyDateKey(referenceDate),
  );
  const expireAt = historyExpiry(historyDateKey(referenceDate));
  const record = { payload, exportDate: backup.exportDate, savedAt: serverTimestamp() };
  await Promise.all([
    setDoc(latestRef, record),
    setDoc(historyRef, { ...record, expireAt: Timestamp.fromDate(expireAt) }),
  ]);
  await applyHistoryRetention(uid, referenceDate);
}

export async function listCloudBackups(
  uid: string,
  referenceDate: Date,
): Promise<CloudBackupEntry[]> {
  const latestRef = doc(firestore, 'acc_users', uid, 'backups', 'latest');
  const historyRef = collection(firestore, 'acc_users', uid, 'backups_history');
  const [latestSnapshot, historySnapshot] = await Promise.all([
    getDoc(latestRef),
    getDocs(historyRef),
  ]);

  const todayKey = historyDateKey(referenceDate);
  const entries: CloudBackupEntry[] = [];
  if (latestSnapshot.exists()) {
    const exportDate = (latestSnapshot.data().exportDate as string | undefined) ?? '';
    entries.push({
      id: 'latest',
      kind: 'latest',
      label: `Latest Cloud - ${exportDate ? formatDateLabel(exportDate.slice(0, 10)) : '—'}`,
      savedAt: exportDate,
    });
  }
  const historyDocs = [...historySnapshot.docs]
    .filter((entry) => entry.id !== todayKey)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  historyDocs.forEach((entry) => {
    entries.push({
      id: entry.id,
      kind: 'history',
      label: `History - ${formatDateLabel(entry.id)}`,
      savedAt: entry.id,
    });
  });
  return entries;
}

export async function fetchCloudBackupPayload(uid: string, entryId: string): Promise<string> {
  const path =
    entryId === 'latest'
      ? (['backups', 'latest'] as const)
      : (['backups_history', entryId] as const);
  const snapshot = await getDoc(doc(firestore, 'acc_users', uid, ...path));
  if (!snapshot.exists()) throw new Error('Backup not found in the cloud');
  const payload = snapshot.data().payload as string | undefined;
  if (!payload) throw new Error('Backup not found in the cloud');
  return payload;
}
