// ═══════════════════════════════════════════════════════════
// AK Chit Funds — FIREBASE CONFIG
// Edit only this file when changing Firebase project credentials / Firestore setup
// ═══════════════════════════════════════════════════════════

// ══════════════════════════════════════════
// FIREBASE
// ══════════════════════════════════════════
const firebaseConfig={apiKey:"AIzaSyCqb7gAbpa3UabPU3g_YhNITuPWtWPY4KU",authDomain:"ak-events-2016.firebaseapp.com",projectId:"ak-events-2016",storageBucket:"ak-events-2016.firebasestorage.app",messagingSenderId:"78066764444",appId:"1:78066764444:web:5bb9e0d48c128a8632fb59"};
firebase.initializeApp(firebaseConfig);
const db=firebase.firestore();
let ALL_MEMBERS=[];
