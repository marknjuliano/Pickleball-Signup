import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyDxDO7aD88z1dEyb9T1H6TJZivqAh82JYc",
  authDomain: "pickleballsignup-64eda.firebaseapp.com",
  projectId: "pickleballsignup-64eda",
  storageBucket: "pickleballsignup-64eda.firebasestorage.app",
  messagingSenderId: "39124520969",
  appId: "1:39124520969:web:e33a4bd5bb52787eab28d8"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
