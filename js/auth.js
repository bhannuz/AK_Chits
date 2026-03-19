// ═══════════════════════════════════════════════════════════
// AK Chit Funds — AUTH & ACCESS CONTROL
// Edit only this file when changing login, logout, session, access request approval
// ═══════════════════════════════════════════════════════════

// AUTH SYSTEM
// ══════════════════════════════════════════
const ADMIN_PHONE = '9876543210';
let CURRENT_USER = null;

function saveSession(user){ sessionStorage.setItem('akdf_session', JSON.stringify(user)); }
function loadSession(){ try{ return JSON.parse(sessionStorage.getItem('akdf_session'))||null; }catch(e){ return null; } }
function clearSession(){ sessionStorage.removeItem('akdf_session'); }

async function initAuth(){
    const saved = sessionStorage.getItem('akdf_session');
    if(saved){
        try{
            const u = JSON.parse(saved);
            CURRENT_USER = u;
            applyUserSession(u);
            return;
        }catch(e){}
    }
    document.getElementById('loginScreen').style.display='flex';
}

async function handleLoginSubmit(){
    const phone = document.getElementById('loginPhone').value.trim();
    if(phone.length !== 10){ showToast('❌ Enter valid 10-digit mobile number', false); return; }
    showToast('⏳ Checking access…', true);
    if(phone === ADMIN_PHONE){
        const user = {phone, role:'admin', name:'Admin'};
        CURRENT_USER = user;
        sessionStorage.setItem('akdf_session', JSON.stringify(user));
        applyUserSession(user);
        return;
    }
    const members = await getCollection('members');
    const matched = members.find(m => (m.phone||'').replace(/\D/g,'').slice(-10) === phone);
    if(matched){
        const reqs = await db.collection('accessRequests').where('phone','==',phone).get();
        if(!reqs.empty){
            const req = reqs.docs[0].data();
            if(req.status === 'approved'){
                const user = {phone, role:'member', memberId: matched.id, name: matched.name};
                CURRENT_USER = user;
                sessionStorage.setItem('akdf_session', JSON.stringify(user));
                applyUserSession(user);
                return;
            } else if(req.status === 'denied'){
                showLoginStep('loginStep3');
                return;
            } else {
                document.getElementById('pendingPhone').textContent = `+91 ${phone}`;
                showLoginStep('loginStep2');
                return;
            }
        } else {
            await db.collection('accessRequests').add({
                phone, name: matched.name, memberId: matched.id,
                status: 'pending', requestedAt: new Date().toISOString()
            });
            document.getElementById('pendingPhone').textContent = `+91 ${phone}`;
            showLoginStep('loginStep2');
            showToast('📨 Access request sent to admin', true);
            return;
        }
    } else {
        showToast('❌ Mobile number not registered. Contact admin.', false);
        return;
    }
}

async function checkAccessStatus(){
    const phone = document.getElementById('loginPhone').value.trim() ||
                  (CURRENT_USER && CURRENT_USER.phone) || '';
    if(!phone){ goBackToLogin(); return; }
    const reqs = await db.collection('accessRequests').where('phone','==',phone).get();
    if(!reqs.empty){
        const req = reqs.docs[0].data();
        if(req.status === 'approved'){
            const members = await getCollection('members');
            const matched = members.find(m => (m.phone||'').replace(/\D/g,'').slice(-10) === phone);
            if(matched){
                const user = {phone, role:'member', memberId: matched.id, name: matched.name};
                sessionStorage.setItem('akdf_session', JSON.stringify(user));
                showToast('✅ Access approved! Loading…', true);
                setTimeout(()=>location.reload(), 800);
                return;
            }
        } else if(req.status === 'denied'){
            showLoginStep('loginStep3');
            return;
        }
    }
    showToast('⏳ Still pending approval', true);
}

let _pendingPollTimer = null;

function showLoginStep(stepId){
    ['loginStep1','loginStep2','loginStep3'].forEach(id=>{
        document.getElementById(id).classList.remove('active');
    });
    document.getElementById(stepId).classList.add('active');
    if(stepId === 'loginStep2'){
        if(_pendingPollTimer) clearInterval(_pendingPollTimer);
        _pendingPollTimer = setInterval(silentCheckStatus, 5000);
    } else {
        if(_pendingPollTimer){ clearInterval(_pendingPollTimer); _pendingPollTimer=null; }
    }
}

async function silentCheckStatus(){
    const phone = document.getElementById('loginPhone').value.trim();
    if(!phone) return;
    const reqs = await db.collection('accessRequests').where('phone','==',phone).get().catch(()=>({docs:[]}));
    if(!reqs.docs || reqs.docs.length===0) return;
    const req = reqs.docs[0].data();
    if(req.status === 'approved'){
        if(_pendingPollTimer){ clearInterval(_pendingPollTimer); _pendingPollTimer=null; }
        const members = await getCollection('members');
        const matched = members.find(m => (m.phone||'').replace(/\D/g,'').slice(-10) === phone);
        if(matched){
            const user = {phone, role:'member', memberId: matched.id, name: matched.name};
            sessionStorage.setItem('akdf_session', JSON.stringify(user));
            showToast('✅ Access approved! Loading…', true);
            setTimeout(()=>location.reload(), 1000);
        }
    } else if(req.status === 'denied'){
        if(_pendingPollTimer){ clearInterval(_pendingPollTimer); _pendingPollTimer=null; }
        showLoginStep('loginStep3');
    }
}

function goBackToLogin(){
    document.getElementById('loginPhone').value='';
    showLoginStep('loginStep1');
}

function applyUserSession(user){
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('logoutBtn').style.display='block';
    if(user.role === 'admin'){
        document.getElementById('adminHeader').style.display='flex';
        document.getElementById('memberHeader').style.display='none';
        document.getElementById('headerRoleBadge').textContent='ADMIN';
        document.getElementById('headerRoleBadge').style.display='inline';
        document.getElementById('accessReqBtn').style.display='inline-flex';
        document.getElementById('logoutBtn').style.display='block';
        document.getElementById('adminStatCards').style.display='';
        document.getElementById('adminActionBtns').style.display='flex';
        document.getElementById('adminMemberSearch').style.display='';
        document.getElementById('memberLedgerArea').style.display='none';
        document.getElementById('adminQuickBtns').style.display='flex';
        updateUI();
        pollPendingRequests();
        setTimeout(checkAndShowBackupReminder, 1200);
    } else {
        document.getElementById('adminHeader').style.display='none';
        document.getElementById('memberHeader').style.display='block';
        document.getElementById('logoutBtn').style.display='none';
        document.getElementById('memberHeaderAvatar').textContent = ini(user.name);
        document.getElementById('memberHeaderName').textContent = user.name;
        document.getElementById('memberHeaderPhone').textContent = `📱 +91 ${user.phone}`;
        document.getElementById('adminStatCards').style.display='none';
        document.getElementById('adminActionBtns').style.display='none';
        document.getElementById('adminMemberSearch').style.display='none';
        document.getElementById('adminQuickBtns').style.display='none';
        document.getElementById('navGroups').style.display='none';
        document.getElementById('navBackup').style.display='none';
        document.querySelector('.nav-bar').style.display='none';
        document.getElementById('memberLedgerArea').style.display='block';
        document.getElementById('summaryView').value = user.memberId;
        loadMemberLedger();
    }
}

function handleLogout(){
    sessionStorage.removeItem('akdf_session');
    CURRENT_USER = null;
    document.body.classList.remove('member-mode');
    document.getElementById('adminHeader').style.display='flex';
    document.getElementById('memberHeader').style.display='none';
    document.getElementById('navGroups').style.display='';
    document.getElementById('navBackup').style.display='';
    document.querySelector('.nav-bar').style.display='';
    document.getElementById('adminStatCards').style.display='';
    document.getElementById('adminActionBtns').style.display='flex';
    document.getElementById('adminMemberSearch').style.display='';
    document.getElementById('memberLedgerArea').style.display='none';
    document.getElementById('adminQuickBtns').style.display='flex';
    document.getElementById('logoutBtn').style.display='none';
    document.getElementById('accessReqBtn').style.display='none';
    document.getElementById('headerRoleBadge').textContent='ADMIN';
    document.getElementById('headerRoleBadge').className='badge text-warning border border-warning px-2';
    document.getElementById('ledgerData').innerHTML='';
    document.getElementById('memberLedgerData').innerHTML='';
    document.getElementById('summarySearch').value='';
    document.getElementById('summaryView').value='';
    showLoginStep('loginStep1');
    document.getElementById('loginPhone').value='';
    document.getElementById('loginScreen').style.display='flex';
}

// ACCESS REQUESTS PANEL
let _reqFilter = 'pending';
async function openAccessRequests(){
    _reqFilter = 'pending';
    await renderAccessRequests();
    openModal('accessModal');
}

async function filterRequests(type){
    _reqFilter = type;
    ['pending','approved','all'].forEach(t=>{
        const btn = document.getElementById(`reqTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
        if(btn) btn.className = t===type ? 'btn-save' : 'btn-cancel';
    });
    await renderAccessRequests();
}

async function renderAccessRequests(){
    const list = document.getElementById('accessRequestsList');
    list.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:16px;">Loading…</div>';
    let q = db.collection('accessRequests');
    const snap = await q.orderBy('requestedAt','desc').get().catch(()=> db.collection('accessRequests').get());
    const all = snap.docs.map(d=>({id:d.id,...d.data()}));
    const filtered = _reqFilter==='all' ? all : all.filter(r=>r.status===_reqFilter);
    if(!filtered.length){
        list.innerHTML=`<div style="text-align:center;color:var(--text-dim);padding:24px;font-size:1.05rem;">No ${_reqFilter==='all'?'':_reqFilter} requests</div>`;
        return;
    }
    list.innerHTML = filtered.map(r=>`
        <div class="req-card">
            <div style="flex:1;min-width:0;">
                <div class="req-name">${r.name||'Unknown'}</div>
                <div class="req-phone">📱 +91 ${r.phone} &nbsp;·&nbsp; ${r.requestedAt?new Date(r.requestedAt).toLocaleDateString('en-IN'):'—'}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                ${r.status==='pending'
                    ? `<button class="btn-approve" onclick="handleApprove('${r.id}','${r.phone}')">✅ Approve</button>
                       <button class="btn-deny" onclick="handleDeny('${r.id}')">✕ Deny</button>`
                    : r.status==='approved'
                        ? `<span class="badge-approved">✅ Approved</span><button class="btn-deny" style="font-size:0.92rem;padding:4px 8px;" onclick="handleDeny('${r.id}')">Revoke</button>`
                        : `<span class="badge-denied">🚫 Denied</span><button class="btn-approve" style="font-size:0.92rem;padding:4px 8px;" onclick="handleApprove('${r.id}','${r.phone}')">Re-approve</button>`
                }
            </div>
        </div>`).join('');
}

async function handleApprove(reqId, phone){
    await db.collection('accessRequests').doc(reqId).update({status:'approved', approvedAt: new Date().toISOString()});
    showToast('✅ Access approved!');
    await renderAccessRequests();
    await pollPendingRequests();
}

async function handleDeny(reqId){
    await db.collection('accessRequests').doc(reqId).update({status:'denied', deniedAt: new Date().toISOString()});
    showToast('🚫 Access denied');
    await renderAccessRequests();
    await pollPendingRequests();
}

async function pollPendingRequests(){
    if(!CURRENT_USER || CURRENT_USER.role!=='admin') return;
    const snap = await db.collection('accessRequests').where('status','==','pending').get().catch(()=>({docs:[]}));
    const count = snap.docs.length;
    const badge = document.getElementById('pendingCount');
    if(count > 0){
        badge.style.display='flex';
        badge.textContent=count;
    } else {
        badge.style.display='none';
    }
}

// ══════════════════════════════════════════
