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

function sendWhatsAppReminder(mId, gId) {
    const m = _dbCache.members.find(x => x.id === mId);
    const g = _dbCache.groups.find(x => x.id === gId);
    const upiId = document.getElementById('ncp_upi_id')?.value || "8121723153@ybl";
    const upiLink = `upi://pay?pa=${upiId}&pn=AK%20Chit%20Funds&cu=INR`;
    const phone = '91' + m.phone.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(`*PAYMENT REMINDER* 🏆\nDear *${m.name}*, reminder for *${g.name}*.\n\n📲 *Pay via UPI:*\n${upiLink}`);
    window.open(`https://wa.me/${phone}?text=${msg}`, 'wa_chat');
}

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(t + 'Tab').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1)).classList.add('active');
}

function handleLoginSubmit() { document.getElementById('loginScreen').style.display='none'; updateUI(); }
