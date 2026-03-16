const firebaseConfig = { 
    apiKey: "AIzaSyCqb7gAbpa3UabPU3g_YhNITuPWtWPY4KU", 
    authDomain: "ak-events-2016.firebaseapp.com", 
    projectId: "ak-events-2016", 
    storageBucket: "ak-events-2016.firebasestorage.app", 
    messagingSenderId: "78066764444", 
    appId: "1:78066764444:web:5bb9e0d48c128a8632fb59" 
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let _dbCache = { members: [], groups: [] };

async function updateUI() {
    const [mSnap, gSnap] = await Promise.all([
        db.collection('members').get(),
        db.collection('groups').get()
    ]);
    _dbCache.members = mSnap.docs.map(d => ({id: d.id, ...d.data()}));
    _dbCache.groups = gSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    document.getElementById('mCount').innerText = _dbCache.members.length;
    document.getElementById('gCount').innerText = _dbCache.groups.length;
}

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(t + 'Tab').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
}

function handleLoginSubmit() { document.getElementById('loginScreen').style.display='none'; updateUI(); }
