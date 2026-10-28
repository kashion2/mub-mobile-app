import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  addDoc,
  limit,
} from '@react-native-firebase/firestore';

// Initialize Firestore with offline persistence
const firestore = getFirestore();

// Initialize Auth
const auth = getAuth();

export const COLLECTIONS = {
  USERS: 'users',
  ANNOUNCEMENTS: 'announcements',
  SOS_REQUESTS: 'sos_requests',
  MEMBERS: 'members',
} as const;

export {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  addDoc,
  limit,
  auth,
  firestore,
};

export const getFirestoreInstance = () => firestore;