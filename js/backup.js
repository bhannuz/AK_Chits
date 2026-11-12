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
window._stOpenM = window._stOpenM || null;
window._stSelMonth  = window._stSelMonth  || '';      // '' = all months, else 'YYYY-MM'
window._stMonthInit = window._stMonthInit || false;  // first open selects the current month
window._stSelMember = window._stSelMember || '';      // '' = all members, else seat key
window._stMode  = window._stMode  || 'all';       // payment-mode filter (PhonePe / Gpay / UPI / Cash …)
const _ST_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _ST_PAL = ['linear-gradient(145deg,#f7b733,#e67e22)','linear-gradient(145deg,#3ddc97,#1e9e6a)','linear-gradient(145deg,#38bdf8,#2563eb)','linear-gradient(145deg,#a78bfa,#6d28d9)','linear-gradient(145deg,#fb923c,#ec4899)'];

// payment mode helpers — 'Phone Pe' / 'PhonePe' / 'phonepe' count as one mode
function _stModeKey(v){ return String(v||'Unknown').toLowerCase().replace(/[^a-z0-9]/g,'') || 'unknown'; }
function _stModeLabel(v){ const s = String(v||'Unknown').trim(); return s || 'Unknown'; }
function statSetMode(k){ window._stMode = k; loadStatistics(); }
function statSetMonth(v){ window._stSelMonth = v; loadStatistics(); }
function statPickMonth(k){ window._stSelMonth = (window._stSelMonth === k) ? '' : k; loadStatistics(); }
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

function statPickGroup(id){ window._stSel = id; window._stOpenM = null; window._stSelMember = ''; window._stSelMonth = ''; loadStatistics(); }
window._stOpenMode = window._stOpenMode || {};
function statToggleMode(k){ window._stOpenMode[k] = !window._stOpenMode[k]; loadStatistics(); }

async function loadStatistics() {
    if (!isAdmin()) return;
    const members = await getCollection('members');
    const groups  = await getCollection('groups');
    const allPays = await getCollection('payments');
    const today = new Date().toISOString().split('T')[0];
    const inr = n => (typeof fmtAmt === 'function') ? fmtAmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');

    if(window._stSel !== 'all' && !groups.some(g => g.id === window._stSel)) window._stSel = 'all';
    const sel = window._stSel;

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

    // ── group icons (same as the Groups tab)
    let icons = `<button type="button" class="ios-app${sel==='all'?' ios-active':''}" onclick="statPickGroup('all')"><span class="ios-ico" style="background:${_ST_PAL[2]};">📊</span><span class="ios-lbl">All</span></button>`;
    data.forEach((d,i) => {
        icons += `<button type="button" class="ios-app${sel===d.g.id?' ios-active':''}" onclick="statPickGroup('${d.g.id}')"><span class="ios-ico" style="background:${_ST_PAL[i % _ST_PAL.length]};${d.completed?'opacity:.8;':''}">${d.completed?'✅':'📂'}</span><span class="ios-lbl" style="max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_stEsc(d.g.name||d.g.id)}</span></button>`;
    });
    const iconBar = document.getElementById('statIconBar'); if(iconBar) iconBar.innerHTML = icons;

    // ── filter options: month · member · payment mode
    const modeInfo = {};
    shown.forEach(d => d.gPays.forEach(p => {
        const k = _stModeKey(p.paidBy), o = modeInfo[k] = modeInfo[k] || { label:_stModeLabel(p.paidBy), n:0 };
        o.n++;
    }));
    if(window._stMode !== 'all' && !modeInfo[window._stMode]) window._stMode = 'all';
    const mSel = window._stMode;

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
    // first open: pick the current month (last due date up to today)
    if(!window._stMonthInit){
        window._stMonthInit = true;
        let cur = ''; shown.forEach(d => d.dues.forEach(x => { if(x <= today && x.slice(0,7) > cur) cur = x.slice(0,7); }));
        if(cur) window._stSelMonth = cur;
    }
    const selM = window._stSelMonth, selS = window._stSelMember;

    // ── month strip: one small chip per month, underline = how complete it is
    const allKeys = new Set(); shown.forEach(d => d.dues.forEach(x => allKeys.add(x.slice(0,7))));
    const stripKeys = Array.from(allKeys).sort();
    let stripHtml = '', infoHtml = '';
    const monAgg = k => {                          // seats due in month k across the shown groups
        let tot = 0, paidN = 0, got = 0, exp = 0;
        shown.forEach(d => {
            const idx = d.dues.findIndex(x => x.slice(0,7) === k); if(idx < 0 || d.dues[idx] > today) return;
            d.seats.forEach(s => { const m = s.months[idx]; tot++; exp += d.chit; got += Math.min(m.paid, d.chit || m.paid); if(m.st === 'p') paidN++; });
        });
        return { tot, paidN, got, exp };
    };
    const monCount = {}; stripKeys.forEach(k => { const m = k.slice(5); monCount[m] = (monCount[m]||0) + 1; });
    const needYear = Object.values(monCount).some(c => c > 1);           // same month name twice → show the year too
    stripKeys.forEach(k => {
        const mo = monAgg(k), mon = _ST_MON[parseInt(k.slice(5),10)-1] + (needYear ? ' <span style="font-size:0.56rem;font-weight:600;color:var(--text-dim);">' + k.slice(2,4) + '</span>' : ''), on = (k === selM);
        const fut = mo.tot === 0;
        const col = fut ? 'rgba(255,255,255,0.12)' : (mo.paidN === mo.tot ? '#34d399' : (mo.got > 0 ? '#f59e0b' : '#f87171'));
        stripHtml += `<div ${fut?'':`onclick="statPickMonth('${k}')"`} title="${_stMonthLabel(k)}" style="text-align:center;font-size:0.68rem;font-weight:700;border:${on?'2px solid #6366f1':'1px solid rgba(255,255,255,0.1)'};border-radius:8px;padding:${on?'4px 0 2px':'5px 0 3px'};${fut?'color:var(--text-dim);':'cursor:pointer;'}">${mon}<div style="height:4px;border-radius:2px;margin:3px 6px 0;background:${col};"></div></div>`;
    });
    if(selM){
        const mo = monAgg(selM), pct = mo.exp > 0 ? Math.min(100, Math.round(mo.got/mo.exp*100)) : 0;
        infoHtml = `<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.74rem;"><span style="font-weight:800;">${_stMonthLabel(selM)}</span><span style="color:${mo.tot && mo.paidN===mo.tot?'#34d399':'var(--text-dim)'};font-weight:700;">${mo.paidN} of ${mo.tot} paid</span></div>
            <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:5px;overflow:hidden;margin:4px 0 3px;"><div style="width:${pct}%;height:100%;background:#34d399;"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:0.66rem;color:var(--text-dim);"><span>${inr(mo.got)} of ${inr(mo.exp)}</span><span>${pct}%</span></div>`;
    } else {
        infoHtml = `<div style="font-size:0.74rem;font-weight:800;">All months</div>`;
    }
    const stripEl = document.getElementById('statMonthStrip'); if(stripEl) stripEl.innerHTML = stripHtml;
    const infoEl  = document.getElementById('statMonthInfo');  if(infoEl)  infoEl.innerHTML = infoHtml;

    const memOpts  = '<option value="">All members</option>' + seatList.map(x => `<option value="${x.key}"${x.key===selS?' selected':''}>${_stEsc(x.label)}</option>`).join('');
    const modeOpts = '<option value="all">All modes</option>' + Object.keys(modeInfo).sort((a,b) => modeInfo[b].n - modeInfo[a].n).map(k => `<option value="${k}"${k===mSel?' selected':''}>${_stEsc(modeInfo[k].label)} (${modeInfo[k].n})</option>`).join('');

    // ── result: every payment that matches the three filters
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
        const who  = selS ? _stEsc((seatList.find(x => x.key === selS)||{}).label || '') : 'All members';
        const sub  = [selM ? _stMonthLabel(selM) : 'All months', who, mSel!=='all' ? _stEsc(modeInfo[mSel].label) : 'All modes'].join('  ·  ');
        const thS  = 'padding:5px 10px;font-size:0.6rem;font-weight:800;letter-spacing:.4px;color:var(--text-dim);text-transform:uppercase;white-space:nowrap;';
        const num  = 'font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;';
        let html = `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:10px;">
            <div style="padding:9px 12px 8px;border-bottom:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:7px;">
                    <span style="font-size:0.8rem;font-weight:800;">💳 Paid via · ${selM ? _stMonthLabel(selM) : 'All months'}</span>
                </div>
                <div style="display:flex;gap:6px;">
                    <select class="form-input" onchange="statSetMember(this.value)" style="flex:1;min-width:0;margin:0;height:32px !important;min-height:32px !important;padding:3px 22px 3px 8px !important;font-size:0.72rem !important;border-radius:9px !important;">${memOpts}</select>
                    <select class="form-input" onchange="statSetMode(this.value)" style="flex:1;min-width:0;margin:0;height:32px !important;min-height:32px !important;padding:3px 22px 3px 8px !important;font-size:0.72rem !important;border-radius:9px !important;">${modeOpts}</select>
                </div>
            </div>`;
        if(!entries.length){
            html += '<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:0.8rem;">No payments for this selection.</div>';
        } else {
            html += `<table style="width:100%;border-collapse:collapse;table-layout:auto;">
                <thead><tr style="background:rgba(255,255,255,0.03);">
                    <th style="${thS}text-align:left;">Paid via</th>
                    ${selS?'':`<th style="${thS}${num}">Members</th>`}
                    <th style="${thS}${num}">Pmts</th>
                    <th style="${thS}${num}">Amount</th>
                    <th style="${thS}${num}">Share</th>
                </tr></thead><tbody>`;
            modeRows.forEach((k,i) => {
                const o = byMode[k], pct = totAmt > 0 ? Math.round(o.amt/totAmt*100) : 0, open = !selS && !!window._stOpenMode[k];
                html += `<tr ${selS?'':`onclick="statToggleMode('${k}')"`} style="border-top:1px solid rgba(255,255,255,0.05);${selS?'':'cursor:pointer;'}${i%2?'background:rgba(255,255,255,0.015);':''}">
                    <td style="padding:6px 10px;font-size:0.78rem;font-weight:700;white-space:nowrap;">${selS?'':`<span style="display:inline-block;width:10px;color:var(--text-dim);font-size:0.6rem;">${open?'▾':'▸'}</span>`}${_stEsc(o.label)}</td>
                    ${selS?'':`<td style="padding:6px 10px;font-size:0.78rem;${num}">${o.names.size}</td>`}
                    <td style="padding:6px 10px;font-size:0.78rem;${num}">${o.n}</td>
                    <td style="padding:6px 10px;font-size:0.78rem;font-weight:800;color:#34d399;${num}">${inr(o.amt)}</td>
                    <td style="padding:6px 10px;font-size:0.7rem;color:var(--text-dim);${num}"><span style="display:inline-block;width:34px;height:4px;border-radius:2px;background:rgba(255,255,255,0.1);vertical-align:middle;margin-right:5px;overflow:hidden;"><span style="display:block;width:${pct}%;height:100%;background:#6366f1;"></span></span>${pct}%</td>
                </tr>`;
                if(open) html += `<tr><td colspan="5" style="padding:2px 12px 8px 22px;font-size:0.7rem;color:var(--text-dim);line-height:1.5;">${Array.from(o.names).map(_stEsc).join(', ')}</td></tr>`;
            });
            html += `<tr style="background:rgba(99,102,241,0.12);border-top:1px solid rgba(99,102,241,0.35);">
                    <td style="padding:7px 10px;font-size:0.78rem;font-weight:800;">Total</td>
                    ${selS?'':`<td style="padding:7px 10px;font-size:0.78rem;font-weight:800;${num}">${allNames.size}</td>`}
                    <td style="padding:7px 10px;font-size:0.78rem;font-weight:800;${num}">${totN}</td>
                    <td style="padding:7px 10px;font-size:0.84rem;font-weight:800;color:#34d399;${num}">${inr(totAmt)}</td>
                    <td style="padding:7px 10px;font-size:0.7rem;color:var(--text-dim);${num}">100%</td>
                </tr></tbody></table>`;
            if(selS || selM){          // a month or a member is chosen: the payments behind the numbers
                html += `<div style="padding:7px 12px 3px;font-size:0.6rem;font-weight:800;letter-spacing:.4px;color:var(--text-dim);text-transform:uppercase;border-top:1px solid var(--border);background:rgba(255,255,255,0.03);">Payments (${entries.length})</div>`;
                entries.slice().sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).forEach((e,i) => {
                    const dt = (typeof fmtDate==='function') ? fmtDate(e.date) : e.date;
                    const left = selS ? `<b>${dt}</b> <span style="color:var(--text-dim);">${_stEsc(e.forTxt)}</span>` : `<b>${_stEsc(e.name)}</b> <span style="color:var(--text-dim);">${dt}</span>`;
                    html += `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 12px;border-top:1px solid rgba(255,255,255,0.04);font-size:0.74rem;${i%2?'background:rgba(255,255,255,0.015);':''}"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${left}</span><span style="white-space:nowrap;font-variant-numeric:tabular-nums;"><span style="color:#a5b4fc;">${_stEsc(e.ml)}</span>  <b>${inr(e.amt)}</b></span></div>`;
                });
            }
        }
        sumEl.innerHTML = html + '</div>';
    }
}

// Stubs so other files don't error
function loadEmailConfigToForm(){}
function updateBackupStatusUI(){}
function checkAndShowBackupReminder(){}

// Home tab: open / close the Backup & Restore panel
function toggleBackupSection(){
    const body = document.getElementById('backupSectionBody'), chev = document.getElementById('backupSectionChevron');
    if(!body) return;
    const open = body.style.display !== 'block';
    body.style.display = open ? 'block' : 'none';
    if(chev) chev.style.transform = open ? 'rotate(90deg)' : '';
}
