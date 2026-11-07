// ═══════════════════════════════════════════════════════════
// AK Chit Funds — DATA BACKUP / RESTORE
// Edit only this file when changing backup or restore logic
// ═══════════════════════════════════════════════════════════

async function exportFullBackup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const d={m:await getCollection('members'),g:await getCollection('groups'),p:await getCollection('payments')};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
    a.download=`AK_Chit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('✅ Backup downloaded!');
}

// ═══════════════════════════════════════════════════════════
// BUGFIX — auto-recalculate stored `balance`/`balPerMonth` on existing payment docs.
// Root cause: each payment's balance was historically computed against only that
// single payment's own amount (chitPerMonth - thisPayment.paid), ignoring any other
// partial payments already made for the same month. When a month was paid across
// two or more installments, this made the stored balance overstate what was really
// owed (e.g. a month split into 11,000 + 12,077 against a 23,077 due amount stored
// balances of 12,077 and 11,000 instead of 0 + 0). Since almost every dashboard/
// export screen simply sums `payment.balance`, this recalculates the true cumulative
// remaining balance per (member, group, enrollment, slot, month) and writes it back,
// fixing all those screens automatically.
//
// Runs automatically and silently once per admin session on login (see auth.js) —
// no button or confirmation needed. It only ever touches the `balance`/`balPerMonth`
// fields (never paid amounts, dates, or chit picks), so it's always safe to re-run,
// and a localStorage flag keeps it from re-running unnecessarily on every login.
async function recalculateAllPaymentBalances(){
    if(!isAdmin()) return;
    try{
        const groups = await getCollection('groups');
        const payments = await getCollection('payments');
        const chitByGroup = {};
        groups.forEach(g=>{
            let amt = parseFloat(g.fixedAmt)||0;
            if(!amt){
                const fieldNames=['fixedMonthlyAmount','monthlyChitAmount','monthlyAmount','fixedAmount','amount','chitAmount'];
                for(const f of fieldNames){ const v=parseFloat(g[f]); if(v){amt=v;break;} }
            }
            chitByGroup[g.id]=amt;
        });

        // Process payments in a stable, deterministic order (by date, then id) so that
        // cumulative "amount paid so far this month" is consistent every time this runs.
        const sorted=[...payments].sort((a,b)=>{
            const d=(a.date||'').localeCompare(b.date||'');
            if(d!==0) return d;
            return (a.id||'').localeCompare(b.id||'');
        });

        const slotCumulative={}; // key -> running amount paid toward that month so far
        const updates=[];

        sorted.forEach(p=>{
            const gid=p.groupId;
            const enrId=p.enrollmentId||'';
            const slotNum=p.slotNum!=null?Number(p.slotNum):1;
            const slots=Array.isArray(p.monthSlots)?p.monthSlots:(p.monthSlot!=null?[p.monthSlot]:[]);
            const numMonths=slots.length||1;
            const paid=parseFloat(p.paid)||0;
            const perSlotPaid=paid/numMonths;
            const chitAmount=chitByGroup[gid]||parseFloat(p.chit)||0;

            let remainingAfterThisPayment=0;
            slots.forEach(s=>{
                const key=p.memberId+'|'+gid+'|'+enrId+'|'+slotNum+'|'+s;
                const before=slotCumulative[key]||0;
                const after=before+perSlotPaid;
                slotCumulative[key]=after;
                remainingAfterThisPayment+=Math.max(0, chitAmount-after);
            });

            const newBalance=Math.round(remainingAfterThisPayment*100)/100;
            const newBalPerMonth=Math.round((newBalance/numMonths)*100)/100;
            const oldBalance=parseFloat(p.balance)||0;
            const oldBalPerMonth=parseFloat(p.balPerMonth)||0;
            if(Math.abs(oldBalance-newBalance)>0.5 || Math.abs(oldBalPerMonth-newBalPerMonth)>0.5){
                updates.push({id:p.id, balance:newBalance, balPerMonth:newBalPerMonth});
            }
        });

        for(const u of updates){
            await db.collection('payments').doc(u.id).update({balance:u.balance, balPerMonth:u.balPerMonth});
        }

        if(updates.length>0){
            bustCache('payments');
            await updateUI();
            const summaryView=document.getElementById('summaryView');
            if(summaryView && summaryView.value) await loadMemberLedger();
        }
        localStorage.setItem('akdf_balances_fixed_v1','1');
    } catch(err){
        console.error('Balance recalculation failed:', err);
        // Silent failure — this is a background fix, don't interrupt the admin's session.
        // It will simply retry on the next login since the localStorage flag isn't set.
    }
}

async function exportToExcel(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    showToast('⏳ Generating Excel…',true);
    const members=await getCollection('members');
    const groups=await getCollection('groups');
    const payments=await getCollection('payments');
    const wb=XLSX.utils.book_new();
    const today=new Date().toISOString().split('T')[0];

    const mRows=members.map(m=>({'Name':m.name||'','Phone':m.phone||'','Groups':((m.groupIds||[]).map(gid=>{const g=groups.find(x=>x.id===gid);return g?g.name:gid;})).join(', ')}));
    const wsM=XLSX.utils.json_to_sheet(mRows.length?mRows:[{'Name':'','Phone':'','Groups':''}]);
    wsM['!cols']=[{wch:28},{wch:16},{wch:40}];
    XLSX.utils.book_append_sheet(wb,wsM,'Members');

    const gRows=groups.map(g=>{
        const gPays=payments.filter(p=>p.groupId===g.id);
        const gMs=members.filter(m=>m.groupIds&&m.groupIds.includes(g.id));
        return{'Group Name':g.name||'','Duration (Months)':g.duration||g.gDuration||'','Start Date':g.startDate||g.gStart||'','Due Day':g.dueDay||'','Members':gMs.length,'Total Collected':gPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0),'Total Balance':gPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0),'Chits Picked':gPays.filter(p=>p.chitPicked==='Yes').length};
    });
    const wsG=XLSX.utils.json_to_sheet(gRows.length?gRows:[{}]);
    wsG['!cols']=[{wch:24},{wch:18},{wch:14},{wch:10},{wch:10},{wch:18},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb,wsG,'Groups');

    const pRows=payments.map(p=>{
        const m=members.find(x=>x.id===p.memberId);
        const g=groups.find(x=>x.id===p.groupId);
        return{'Date':p.date||'','Member':m?m.name:'Unknown','Phone':m?m.phone||'':'','Group':g?g.name:'Unknown','Chit/Month':parseFloat(p.chit)||0,'Months':p.numMonths||1,'Total Paid':parseFloat(p.paid)||0,'Balance':parseFloat(p.balance)||0,'Mode':p.paidBy||'','Chit Picked':p.chitPicked||'No','Chit Picked Value':p.chitPickedBy||''};
    }).sort((a,b)=>a['Date'].localeCompare(b['Date']));
    const wsP=XLSX.utils.json_to_sheet(pRows.length?pRows:[{}]);
    wsP['!cols']=[{wch:12},{wch:24},{wch:14},{wch:20},{wch:12},{wch:8},{wch:12},{wch:12},{wch:14},{wch:12},{wch:18}];
    XLSX.utils.book_append_sheet(wb,wsP,'All Payments');

    const sumRows=[];
    members.forEach(m=>{
        (m.groupIds||[]).forEach(gid=>{
            const g=groups.find(x=>x.id===gid);
            const mp=payments.filter(p=>p.memberId===m.id&&p.groupId===gid);
            const pickedPay=mp.find(p=>p.chitPicked==='Yes');
            sumRows.push({'Member':m.name||'','Phone':m.phone||'','Group':g?g.name:'','Months Paid':mp.reduce((s,p)=>s+(p.numMonths||1),0),'Total Paid':mp.reduce((s,p)=>s+(parseFloat(p.paid)||0),0),'Total Balance':mp.reduce((s,p)=>s+(parseFloat(p.balance)||0),0),'Chit Picked':pickedPay?'Yes':'No','Chit Picked Value':pickedPay?pickedPay.chitPickedBy||'':'','Last Payment':mp.length?mp.sort((a,b)=>b.date.localeCompare(a.date))[0].date:''});
        });
    });
    const wsS=XLSX.utils.json_to_sheet(sumRows.length?sumRows:[{}]);
    wsS['!cols']=[{wch:24},{wch:14},{wch:20},{wch:12},{wch:12},{wch:14},{wch:12},{wch:18},{wch:14}];
    XLSX.utils.book_append_sheet(wb,wsS,'Member Summary');

    XLSX.writeFile(wb,`AKChitFunds_Export_${today}.xlsx`);
    showToast('✅ Excel exported!');
}

function confirmRestore(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const file=document.getElementById('restoreFile').files[0];
    if(!file)return showToast('❌ Select a backup file first',false);
    showConfirm('🔄','Restore All Data?','This will overwrite ALL existing data.',()=>executeRestore());
}

async function executeRestore(){
    const file=document.getElementById('restoreFile').files[0];if(!file)return;
    showToast('⏳ Restoring…',true);
    const reader=new FileReader();
    reader.onload=async(e)=>{
        try{
            const data=JSON.parse(e.target.result);
            const delCol=async(col)=>{const s=await db.collection(col).get();const batch=db.batch();s.docs.forEach(d=>batch.delete(d.ref));if(s.docs.length)await batch.commit();};
            await delCol('members');await delCol('groups');await delCol('payments');
            let count=0;
            if(data.m)for(let x of data.m){const {id,...rest}=x;await db.collection('members').doc(id).set(rest);count++;}
            if(data.g)for(let x of data.g){const {id,...rest}=x;await db.collection('groups').doc(id).set(rest);count++;}
            if(data.p)for(let x of data.p){const {id,...rest}=x;await db.collection('payments').doc(id).set(rest);count++;}
            bustCache('members');bustCache('groups');bustCache('payments');
            showToast('✅ Restored '+count+' records!');
            updateUI();
        }catch(err){console.error(err);showToast('❌ Invalid backup file',false);}
    };
    reader.readAsText(file);
}

// ── Backup Sub-tab Switcher ──────────────────────────────────
// Backup & restore moved to an icon on the Home tab; this tab is Statistics only
function switchBackupSubTab() {
    const statsPanel = document.getElementById('bkStatsPanel');
    if (statsPanel) statsPanel.style.display = '';
    loadStatistics();
}

// ── Statistics Loader ───────────────────────────────────────

// ── Statistics Loader ───────────────────────────────────────
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

function clearStatFilters() {
    const el = document.getElementById('statGroupFilter'); if(el) el.value='';
    loadStatistics();
}

// Called when Group filter changes — repopulate Member dropdown immediately
async function onStatGroupFilterChange() { loadStatistics(); }

// Legacy stubs — kept so any old calls don't error
function onStatFilterTypeChange() {}
function applyStatSubFilter() { loadStatistics(); }
function renderStatFilterChips() {}
function removeStatFilter(key) {}

// ── Statistics: group icons + Month wise / Member wise ──────
function _stEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
window._stSel   = window._stSel   || 'all';
window._stView  = window._stView  || 'month';
window._stOpenM = window._stOpenM || null;
window._stSelMonth  = window._stSelMonth  || '';      // '' = all months, else 'YYYY-MM'
window._stSelMember = window._stSelMember || '';      // '' = all members, else seat key
window._stMode  = window._stMode  || 'all';       // payment-mode filter (PhonePe / Gpay / UPI / Cash …)
const _ST_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _ST_PAL = ['linear-gradient(145deg,#f7b733,#e67e22)','linear-gradient(145deg,#3ddc97,#1e9e6a)','linear-gradient(145deg,#38bdf8,#2563eb)','linear-gradient(145deg,#a78bfa,#6d28d9)','linear-gradient(145deg,#fb923c,#ec4899)'];

// payment mode helpers — 'Phone Pe' / 'PhonePe' / 'phonepe' count as one mode
function _stModeKey(v){ return String(v||'Unknown').toLowerCase().replace(/[^a-z0-9]/g,'') || 'unknown'; }
function _stModeLabel(v){ const s = String(v||'Unknown').trim(); return s || 'Unknown'; }
function statSetMode(k){ window._stMode = k; loadStatistics(); }
function statSetMonth(v){ window._stSelMonth = v; loadStatistics(); }
function statSetMember(v){ window._stSelMember = v; loadStatistics(); }
function _stMonthLabel(k){ const p = String(k).split('-'); return _ST_MON[parseInt(p[1],10)-1] + ' ' + p[0]; }
// month indexes (0-based) a payment was made for
function _stPayIdxs(p, dues){
    const sl = (Array.isArray(p.monthSlots) && p.monthSlots.length) ? p.monthSlots : (p.monthSlot != null ? [p.monthSlot] : [getMonthSlot(dues, p.date)]);
    return sl.filter(i => i != null && i >= 0 && i < dues.length);
}

// every chit "seat" of a group (a member with 2 chits = 2 seats, a joint pair = 1 seat)
function _statSeats(g, ms, ps){
    const gps = ps.filter(p => p.groupId === g.id);
    const seen = new Set(), seats = [];
    ms.filter(m => m.groupIds && m.groupIds.includes(g.id)).forEach(m => {
        const enr = (m.enrollments||[]).find(e => e.groupId === g.id);
        const qty = enr ? parseInt(enr.qty||1) : 1;
        const coId = enr && enr.coMemberId ? enr.coMemberId : '';
        if(coId){ const k=[m.id,coId].sort().join('_'); if(seen.has(k)) return; seen.add(k); }
        const co = coId ? ms.find(x => x.id === coId) : null;
        for(let q=1; q<=qty; q++){
            const mine = gps.filter(p => p.memberId === m.id || (coId && p.memberId === coId));
            const sp = mine.filter(p => {
                if(qty > 1){
                    if(enr && enr.enrollmentId && p.enrollmentId) return p.enrollmentId === enr.enrollmentId && (p.slotNum == null || Number(p.slotNum) === q);
                    return (p.slotNum != null ? Number(p.slotNum) : 1) === q;
                }
                return true;
            });
            seats.push({ memberId:m.id, name:m.name + (co ? ' & ' + co.name : '') + (qty>1 ? ' (C'+q+')' : ''), pays:sp });
        }
    });
    return seats;
}

// state of every month of one seat: p paid · t partial · o overdue · d due today · f future
function _statSeatMonths(seat, dues, chitAmt, today){
    const slotsOf = x => (Array.isArray(x.monthSlots) && x.monthSlots.length) ? x.monthSlots : null;
    const inMonth = (x,i) => slotsOf(x) ? x.monthSlots.includes(i) : (x.monthSlot != null ? x.monthSlot === i : getMonthSlot(dues, x.date) === i);
    const share = x => (parseFloat(x.paid)||0) / (slotsOf(x) ? x.monthSlots.length : 1);
    const pays = seat.pays.filter(p => !p.isJointMirror);
    // which payment mode was used for which month (count of payments + amount)
    const modesByMonth = dues.map(() => ({}));
    pays.forEach(x => {
        const idxs = slotsOf(x) ? x.monthSlots : (x.monthSlot != null ? [x.monthSlot] : [getMonthSlot(dues, x.date)]);
        const key = _stModeKey(x.paidBy);
        idxs.forEach(i => {
            if(i == null || i < 0 || i >= dues.length) return;
            const o = modesByMonth[i][key] = modesByMonth[i][key] || { label:_stModeLabel(x.paidBy), n:0, amt:0 };
            o.n++; o.amt += share(x);
        });
    });
    const months = dues.map((d,i) => {
        const paid = pays.filter(x => inMonth(x,i)).reduce((a,x) => a+share(x), 0);
        const full = chitAmt > 0 ? paid >= chitAmt-0.5 : paid > 0;
        let st;
        if(full) st = 'p'; else if(paid > 0) st = 't';
        else st = d > today ? 'f' : (d < today ? 'o' : 'd');
        return { st, paid, date:d, due: d <= today, modes: modesByMonth[i] };
    });
    return { months, picked: pays.some(p => p.chitPicked === 'Yes'), total: pays.reduce((a,x) => a+(parseFloat(x.paid)||0), 0) };
}

function statPickGroup(id){ window._stSel = id; window._stOpenM = null; loadStatistics(); }
function statSetView(v){ window._stView = v; loadStatistics(); }
function statToggleMonth(k){ window._stOpenM = (window._stOpenM === k) ? '' : k; loadStatistics(); }

async function loadStatistics() {
    if (!isAdmin()) return;
    const members = await getCollection('members');
    const groups  = await getCollection('groups');
    const allPays = await getCollection('payments');
    const today = new Date().toISOString().split('T')[0];
    const inr = n => (typeof fmtAmt === 'function') ? fmtAmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');

    if(window._stSel !== 'all' && !groups.some(g => g.id === window._stSel)) window._stSel = 'all';
    const sel = window._stSel, view = window._stView;

    // ── data per group
    const data = groups.map(g => {
        const dues  = getGroupDueDates(g) || [];
        const gPays = allPays.filter(p => p.groupId === g.id && !p.isJointMirror);
        const lastPay = gPays.slice().sort((a,b) => (a.date||'').localeCompare(b.date||'')).filter(p => parseFloat(p.chit) > 0).pop();
        const chit = (g.amtType !== 'variable' && parseFloat(g.fixedAmt) > 0) ? parseFloat(g.fixedAmt) : (lastPay ? parseFloat(lastPay.chit) : 0);
        const seats = _statSeats(g, members, allPays).map(s => Object.assign({ gid:g.id, gname:g.name||g.id }, s, _statSeatMonths(s, dues, chit, today)));
        const completed = (typeof isGroupCompleted === 'function') && isGroupCompleted(g, allPays);
        return { g, dues, chit, seats, gPays, completed };
    });
    const shown = data.filter(d => sel === 'all' || d.g.id === sel);

    // ── group icons
    let icons = `<button type="button" class="ios-app${sel==='all'?' ios-active':''}" onclick="statPickGroup('all')"><span class="ios-ico" style="background:${_ST_PAL[2]};">📊</span><span class="ios-lbl">All</span></button>`;
    data.forEach((d,i) => {
        icons += `<button type="button" class="ios-app${sel===d.g.id?' ios-active':''}" onclick="statPickGroup('${d.g.id}')"><span class="ios-ico" style="background:${_ST_PAL[i % _ST_PAL.length]};${d.completed?'opacity:.8;':''}">${d.completed?'✅':'📂'}</span><span class="ios-lbl" style="max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_stEsc(d.g.name||d.g.id)}</span></button>`;
    });
    const iconBar = document.getElementById('statIconBar'); if(iconBar) iconBar.innerHTML = icons;

    // ── payment modes present in the selection
    const modeInfo = {};
    shown.forEach(d => d.gPays.forEach(p => {
        const k = _stModeKey(p.paidBy), o = modeInfo[k] = modeInfo[k] || { label:_stModeLabel(p.paidBy), n:0, amt:0 };
        o.n++; o.amt += (parseFloat(p.paid)||0);
    }));
    if(window._stMode !== 'all' && !modeInfo[window._stMode]) window._stMode = 'all';
    const mSel = window._stMode;
    const mKeys = Object.keys(modeInfo).sort((a,b) => modeInfo[b].n - modeInfo[a].n);
    const pill = (active, onclick, txt) => `<button type="button" onclick="${onclick}" style="flex:0 0 auto;border-radius:99px;padding:5px 12px;font-size:0.74rem;font-weight:800;cursor:pointer;white-space:nowrap;${active?'background:rgba(99,102,241,0.85);color:#fff;border:1px solid transparent;':'background:var(--card-bg);color:var(--text-dim);border:1px solid var(--border);'}">${txt}</button>`;
    const chipBar = document.getElementById('statModeChips');
    if(chipBar) chipBar.innerHTML = pill(mSel==='all', "statSetMode('all')", 'All modes') + mKeys.map(k => pill(mSel===k, `statSetMode('${k}')`, _stEsc(modeInfo[k].label) + ' <span style="opacity:.75;">' + modeInfo[k].n + '</span>')).join('');
    const modeLine = (agg) => {           // agg: {key:{label,n,amt}}
        if(mSel !== 'all'){ const o = agg[mSel]; return o ? `<span style="color:#a5b4fc;font-weight:700;">${_stEsc(o.label)}: ${o.n} payment${o.n>1?'s':''} · ${inr(o.amt)}</span>` : `<span style="color:var(--text-dim);">None via ${_stEsc(modeInfo[mSel].label)}</span>`; }
        const ks = Object.keys(agg).sort((a,b) => agg[b].n - agg[a].n);
        return ks.length ? ks.map(k => `<span style="color:#a5b4fc;font-weight:700;">${_stEsc(agg[k].label)} ${agg[k].n}</span>`).join('<span style="color:var(--text-dim);"> · </span>') : '<span style="color:var(--text-dim);">No payments</span>';
    };

    // ── Payment summary: pick a month and / or a member → how they paid, with subtotals
    const seatList = [];
    shown.forEach(d => d.seats.forEach((s,i) => seatList.push({ key:d.g.id+'::'+i, label:s.name + (sel==='all' ? ' · '+(d.g.name||'') : ''), s, d })));
    seatList.sort((a,b) => a.label.localeCompare(b.label));
    if(window._stSelMember && !seatList.some(x => x.key === window._stSelMember)) window._stSelMember = '';
    const monthKeys = new Set();
    shown.forEach(d => {
        d.dues.forEach(x => { if(x <= today) monthKeys.add(x.slice(0,7)); });
        d.seats.forEach(s => s.pays.forEach(p => _stPayIdxs(p, d.dues).forEach(i => monthKeys.add(d.dues[i].slice(0,7)))));
    });
    const monthList = Array.from(monthKeys).sort();
    if(window._stSelMonth && !monthKeys.has(window._stSelMonth)) window._stSelMonth = '';
    const selM = window._stSelMonth, selS = window._stSelMember;
    const mSelEl = document.getElementById('statMonthSel');
    if(mSelEl){ mSelEl.innerHTML = '<option value="">All months</option>' + monthList.map(k => `<option value="${k}">${_stMonthLabel(k)}</option>`).join(''); mSelEl.value = selM; }
    const sSelEl = document.getElementById('statMemberSel');
    if(sSelEl){ sSelEl.innerHTML = '<option value="">All members</option>' + seatList.map(x => `<option value="${x.key}">${_stEsc(x.label)}</option>`).join(''); sSelEl.value = selS; }

    const entries = [];
    seatList.filter(x => !selS || x.key === selS).forEach(x => {
        x.s.pays.filter(p => !p.isJointMirror).forEach(p => {
            const mk = _stModeKey(p.paidBy), ml = _stModeLabel(p.paidBy);
            if(mSel !== 'all' && mk !== mSel) return;
            const idxs = _stPayIdxs(p, x.d.dues);
            if(selM){
                const hit = idxs.filter(i => x.d.dues[i].slice(0,7) === selM);
                if(!hit.length) return;
                entries.push({ name:x.label, date:p.date||'', forTxt:_stMonthLabel(selM), mk, ml, amt:(parseFloat(p.paid)||0) * hit.length / (idxs.length||1) });
            } else {
                const nm = idxs.map(i => _stMonthLabel(x.d.dues[i].slice(0,7)));
                entries.push({ name:x.label, date:p.date||'', forTxt: nm.length ? (nm.length > 2 ? nm[0]+' – '+nm[nm.length-1] : nm.join(', ')) : '—', mk, ml, amt:parseFloat(p.paid)||0 });
            }
        });
    });
    const byMode = {}; const allNames = new Set(); let totN = 0, totAmt = 0;
    entries.forEach(e => {
        const o = byMode[e.mk] = byMode[e.mk] || { label:e.ml, names:new Set(), n:0, amt:0 };
        o.names.add(e.name); o.n++; o.amt += e.amt; allNames.add(e.name); totN++; totAmt += e.amt;
    });
    const modeRows = Object.keys(byMode).sort((a,b) => byMode[b].amt - byMode[a].amt);
    const sumEl = document.getElementById('statSummary');
    if(sumEl){
        const who = selS ? _stEsc((seatList.find(x => x.key === selS)||{}).label || '') : 'All members';
        const th = 'padding:6px 10px;font-size:0.62rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;';
        let html = `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:10px;">
            <div style="padding:10px 14px;font-size:0.7rem;font-weight:800;color:#a5b4fc;text-transform:uppercase;letter-spacing:.5px;">💳 Paid via · ${selM ? _stMonthLabel(selM) : 'All months'} · ${who}${mSel!=='all' ? ' · '+_stEsc(modeInfo[mSel].label)+' only' : ''}</div>`;
        if(!entries.length){
            html += '<div style="padding:14px;text-align:center;color:var(--text-dim);font-size:0.8rem;">No payments for this selection.</div>';
        } else {
            html += `<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="${th}text-align:left;">Mode</th><th style="${th}text-align:right;">${selS?'':'Members'}</th><th style="${th}text-align:right;">Payments</th><th style="${th}text-align:right;">Amount</th></tr></thead><tbody>`;
            modeRows.forEach(k => {
                const o = byMode[k];
                html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:8px 10px;font-size:0.82rem;font-weight:800;vertical-align:top;">${_stEsc(o.label)}${selS?'':`<div style="font-size:0.66rem;font-weight:500;color:var(--text-dim);line-height:1.4;margin-top:2px;">${Array.from(o.names).map(_stEsc).join(', ')}</div>`}</td><td style="padding:8px 10px;text-align:right;font-size:0.82rem;vertical-align:top;">${selS?'':o.names.size}</td><td style="padding:8px 10px;text-align:right;font-size:0.82rem;vertical-align:top;">${o.n}</td><td style="padding:8px 10px;text-align:right;font-size:0.82rem;font-weight:800;color:#34d399;vertical-align:top;">${inr(o.amt)}</td></tr>`;
            });
            html += `<tr style="background:rgba(99,102,241,0.1);"><td style="padding:9px 10px;font-size:0.8rem;font-weight:800;">Subtotal</td><td style="padding:9px 10px;text-align:right;font-size:0.82rem;font-weight:800;">${selS?'':allNames.size}</td><td style="padding:9px 10px;text-align:right;font-size:0.82rem;font-weight:800;">${totN}</td><td style="padding:9px 10px;text-align:right;font-size:0.9rem;font-weight:800;color:#34d399;">${inr(totAmt)}</td></tr></tbody></table>`;
            if(selS){          // a member is chosen: show every payment
                html += `<div style="padding:8px 14px 2px;font-size:0.62rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Payments</div>`;
                entries.slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(e => {
                    html += `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 14px;border-top:1px solid rgba(255,255,255,0.05);font-size:0.78rem;"><span style="min-width:0;"><b>${(typeof fmtDate==='function')?fmtDate(e.date):e.date}</b> <span style="color:var(--text-dim);">· ${_stEsc(e.forTxt)}</span></span><span style="white-space:nowrap;"><span style="color:#a5b4fc;font-weight:700;">${_stEsc(e.ml)}</span> <b>${inr(e.amt)}</b></span></div>`;
                });
                html += '<div style="height:6px;"></div>';
            }
        }
        sumEl.innerHTML = html + '</div>';
    }

    // ── totals for the selection
    let collected = 0, dueTill = 0, overdue = 0, overdueSeats = 0;
    shown.forEach(d => {
        collected += d.gPays.reduce((a,p) => a+(parseFloat(p.paid)||0), 0);
        d.seats.forEach(s => {
            let seatOver = 0;
            s.months.forEach(m => {
                if(!m.due || m.st === 'p') return;
                const left = Math.max(0, d.chit - m.paid);
                dueTill += left;
                if(m.st === 'o') seatOver += left;
            });
            overdue += seatOver; if(seatOver > 0) overdueSeats++;
        });
    });
    const kpi = (lbl, val, col, sub) => `<div style="flex:1;min-width:0;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:9px 11px;"><div style="font-size:0.62rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">${lbl}</div><div style="font-size:1rem;font-weight:800;color:${col};white-space:nowrap;">${val}</div><div style="font-size:0.62rem;color:var(--text-dim);">${sub}</div></div>`;
    const kp = document.getElementById('statKpis');
    if(kp) kp.innerHTML = kpi('Collected', inr(collected), '#34d399', 'all payments') + kpi('Due till now', inr(dueTill), '#fbbf24', 'unpaid so far') + kpi('Overdue', inr(overdue), '#f87171', overdueSeats ? overdueSeats + ' behind' : 'none behind');

    // ── segmented control
    const sm = document.getElementById('statSegMonth'), sb = document.getElementById('statSegMember');
    const on = 'flex:1;padding:8px 0;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:rgba(99,102,241,0.85);color:#fff;';
    const off = 'flex:1;padding:8px 0;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:transparent;color:var(--text-dim);';
    if(sm) sm.style.cssText = view === 'month' ? on : off;
    if(sb) sb.style.cssText = view === 'member' ? on : off;

    const chip = (tone, txt) => { const c = { r:'background:rgba(239,68,68,0.15);color:#f87171;', a:'background:rgba(245,158,11,0.15);color:#fbbf24;', g:'background:rgba(16,185,129,0.15);color:#34d399;', n:'background:rgba(156,163,175,0.15);color:#cbd5e1;' }[tone]; return `<span style="${c}border-radius:8px;padding:2px 8px;font-size:0.68rem;font-weight:800;white-space:nowrap;">${txt}</span>`; };
    let list = '';

    if(view === 'month'){
        // calendar months covered by the selected groups
        const keys = new Set();
        shown.forEach(d => d.dues.forEach(x => keys.add(x.slice(0,7))));
        const sorted = Array.from(keys).sort();
        const todayKey = today.slice(0,7);
        let lastDue = ''; shown.forEach(d => d.dues.forEach(x => { if(x <= today && x.slice(0,7) > lastDue) lastDue = x.slice(0,7); }));
        const nextKey = sorted.find(k => k > lastDue) || '';
        const openKey = (window._stOpenM === null || window._stOpenM === undefined) ? lastDue : window._stOpenM;
        sorted.filter(k => k <= lastDue || k === nextKey).forEach(k => {
            const [yy, mm] = k.split('-'), label = _ST_MON[parseInt(mm,10)-1] + ' ' + yy;
            let tot = 0, paidN = 0, got = 0, exp = 0; const miss = []; const modeAgg = {}, modeNames = {};
            shown.forEach(d => {
                const idx = d.dues.findIndex(x => x.slice(0,7) === k); if(idx < 0 || d.dues[idx] > today) return;
                d.seats.forEach(s => {
                    const m = s.months[idx]; tot++; exp += d.chit; got += Math.min(m.paid, d.chit || m.paid);
                    Object.keys(m.modes).forEach(mk => {
                        const o = modeAgg[mk] = modeAgg[mk] || { label:m.modes[mk].label, n:0, amt:0 };
                        o.n += m.modes[mk].n; o.amt += m.modes[mk].amt;
                        (modeNames[mk] = modeNames[mk] || []).push(_stEsc(s.name) + (sel==='all' ? ' <span style="color:var(--text-dim);">· ' + _stEsc(d.g.name||'') + '</span>' : ''));
                    });
                    if(m.st === 'p') paidN++; else miss.push(_stEsc(s.name) + (sel==='all' ? ' <span style="color:var(--text-dim);">· ' + _stEsc(d.g.name||'') + '</span>' : '') + (m.st==='t' ? ' (partial)' : ''));
                });
            });
            if(!tot){ list += `<div style="border-top:1px solid rgba(255,255,255,0.06);padding:10px 0;display:flex;justify-content:space-between;"><span style="font-size:0.85rem;color:var(--text-dim);">${label}</span><span style="font-size:0.72rem;color:var(--text-dim);">Not due yet</span></div>`; return; }
            const pct = exp > 0 ? Math.min(100, Math.round(got/exp*100)) : 0, isOpen = openKey === k;
            list += `<div onclick="statToggleMonth('${k}')" style="border-top:1px solid rgba(255,255,255,0.06);padding:10px 0;cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span style="font-size:0.88rem;font-weight:800;">${label}${k===lastDue?' <span style="background:rgba(99,102,241,0.2);color:#a5b4fc;border-radius:6px;padding:1px 7px;font-size:0.62rem;font-weight:800;">Now</span>':''}</span>
                    <span style="font-size:0.78rem;font-weight:700;color:${paidN===tot?'#34d399':'var(--text-dim)'};">${paidN} of ${tot} paid</span>
                </div>
                <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:7px;overflow:hidden;margin-top:6px;"><div style="width:${pct}%;height:100%;background:#34d399;"></div></div>
                <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim);margin-top:3px;"><span>${inr(got)} of ${inr(exp)}</span><span>${pct}%</span></div>
                <div style="font-size:0.72rem;margin-top:4px;">${modeLine(modeAgg)}</div>
                ${isOpen ? Object.keys(modeAgg).filter(mk => mSel==='all' || mk===mSel).sort((a,b)=>modeAgg[b].n-modeAgg[a].n).map(mk => `<div style="font-size:0.72rem;margin-top:4px;line-height:1.5;"><b style="color:#a5b4fc;">${_stEsc(modeAgg[mk].label)}</b> <span style="color:var(--text-dim);">(${modeAgg[mk].n} · ${inr(modeAgg[mk].amt)})</span>: ${modeNames[mk].join(', ')}</div>`).join('') : ''}
                ${isOpen && miss.length ? `<div style="font-size:0.74rem;color:#f87171;margin-top:6px;line-height:1.5;">Not paid: ${miss.join(', ')}</div>` : ''}
                ${isOpen && !miss.length ? `<div style="font-size:0.74rem;color:#34d399;margin-top:6px;">Everyone has paid</div>` : ''}
            </div>`;
        });
        if(!list) list = '<div style="padding:18px;text-align:center;color:var(--text-dim);font-size:0.85rem;">Nothing is due yet.</div>';
    } else {
        const rows = [];
        shown.forEach(d => d.seats.forEach(s => {
            let paidN = 0, ov = 0, pa = 0, dn = 0, dueAmt = 0;
            s.months.forEach(m => {
                if(m.st === 'p') paidN++;
                if(!m.due) return;
                if(m.st === 'o') ov++; else if(m.st === 't') pa++; else if(m.st === 'd') dn++;
                if(m.st !== 'p') dueAmt += Math.max(0, d.chit - m.paid);
            });
            const byMode = {};
            s.pays.filter(p => !p.isJointMirror).forEach(p => { const k = _stModeKey(p.paidBy), o = byMode[k] = byMode[k] || { label:_stModeLabel(p.paidBy), n:0, amt:0 }; o.n++; o.amt += (parseFloat(p.paid)||0); });
            rows.push({ s, d, paidN, ov, pa, dn, dueAmt, byMode });
        }));
        rows.sort((a,b) => (b.ov - a.ov) || (b.dueAmt - a.dueAmt) || a.s.name.localeCompare(b.s.name));
        const dotCss = { p:'background:#34d399;', t:'background:#fbbf24;', o:'background:#f87171;', d:'border:1.5px solid #fbbf24;', f:'border:1px solid rgba(255,255,255,0.28);' };
        rows.forEach(r => {
            const c = r.ov ? chip('r', r.ov + ' overdue') : r.pa ? chip('a', 'Partial') : r.dn ? chip('a', 'Due now') : r.s.months.some(m => m.due) ? chip('g', 'Up to date') : chip('n', 'Not started');
            const dots = r.s.months.map(m => `<span style="width:9px;height:9px;border-radius:50%;box-sizing:border-box;display:inline-block;margin-right:3px;${dotCss[m.st]}"></span>`).join('');
            list += `<div style="border-top:1px solid rgba(255,255,255,0.06);padding:10px 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span style="font-size:0.88rem;font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.s.picked?'🏆 ':''}${_stEsc(r.s.name)}${sel==='all'?' <span style="font-size:0.66rem;font-weight:600;color:var(--text-dim);">'+_stEsc(r.d.g.name||'')+'</span>':''}</span>${c}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;">
                    <span style="line-height:1;">${dots}</span>
                    <span style="font-size:0.68rem;color:var(--text-dim);white-space:nowrap;">${r.paidN}/${r.s.months.length} paid${r.dueAmt?' · due '+inr(r.dueAmt):''}</span>
                </div>
                <div style="font-size:0.72rem;margin-top:5px;">${modeLine(r.byMode)}</div>
            </div>`;
        });
        if(!list) list = '<div style="padding:18px;text-align:center;color:var(--text-dim);font-size:0.85rem;">No members yet.</div>';
    }
    const box = document.getElementById('statList'); if(box) box.innerHTML = list;

    // ── payment modes (kept)
    const modeMap = {}, modeCnt = {}; shown.forEach(d => d.gPays.forEach(p => { const m = _stModeLabel(p.paidBy); modeMap[m] = (modeMap[m]||0) + (parseFloat(p.paid)||0); modeCnt[m] = (modeCnt[m]||0) + 1; }));
    const modeColors = ['#6366f1','#10b981','#f39c12','#ef4444','#a5b4fc','#34d399'];
    const modeTotal = Object.values(modeMap).reduce((s,v) => s+v, 0) || 1;
    const pieEl = document.getElementById('statPayModePie');
    if(pieEl){
        pieEl.innerHTML = Object.entries(modeMap).sort((a,b) => b[1]-a[1]).map(([mode,amt],i) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
            <td style="padding:7px 14px;font-size:0.78rem;color:var(--text-dim);">${_stEsc(mode)} <span style="opacity:.7;">· ${modeCnt[mode]} payment${modeCnt[mode]>1?'s':''}</span></td>
            <td style="padding:7px 14px;font-size:0.82rem;font-weight:800;text-align:right;color:${modeColors[i % modeColors.length]};">${inr(amt)}</td>
            <td style="padding:7px 14px;font-size:0.75rem;font-weight:700;text-align:right;color:var(--text-dim);">${Math.round(amt/modeTotal*100)}%</td></tr>`).join('')
            || '<tr><td colspan="3" style="padding:14px;text-align:center;color:var(--text-dim);font-size:0.78rem;">No data</td></tr>';
    }
}

// Stubs so other files don't error
function loadEmailConfigToForm(){}
function updateBackupStatusUI(){}
function checkAndShowBackupReminder(){}
