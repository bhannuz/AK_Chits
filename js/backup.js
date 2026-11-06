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
function switchBackupSubTab(tab) {
    const statsBtn   = document.getElementById('bkSubStats');
    const backupBtn  = document.getElementById('bkSubBackup');
    const statsPanel = document.getElementById('bkStatsPanel');
    const backupPanel= document.getElementById('bkBackupPanel');

    if (tab === 'stats') {
        statsPanel.style.display  = '';
        backupPanel.style.display = 'none';
        statsBtn.style.background  = 'rgba(99,102,241,0.85)';
        statsBtn.style.color       = 'white';
        statsBtn.style.border      = 'none';
        backupBtn.style.background = 'var(--card-bg)';
        backupBtn.style.color      = 'var(--text-dim)';
        backupBtn.style.border     = '1px solid var(--border)';
        loadStatistics();
    } else {
        statsPanel.style.display  = 'none';
        backupPanel.style.display = '';
        backupBtn.style.background = 'rgba(99,102,241,0.85)';
        backupBtn.style.color      = 'white';
        backupBtn.style.border     = 'none';
        statsBtn.style.background  = 'var(--card-bg)';
        statsBtn.style.color       = 'var(--text-dim)';
        statsBtn.style.border      = '1px solid var(--border)';
    }
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

// ── Statistics = one scorecard per group ────────────────────
function _stEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
window._statOpen = window._statOpen || {};

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

function _statSeatCalc(seat, dues, chitAmt, today){
    const slotsOf = x => (Array.isArray(x.monthSlots) && x.monthSlots.length) ? x.monthSlots : null;
    const inMonth = (x,i) => slotsOf(x) ? x.monthSlots.includes(i) : (x.monthSlot != null ? x.monthSlot === i : getMonthSlot(dues, x.date) === i);
    const share = x => (parseFloat(x.paid)||0) / (slotsOf(x) ? x.monthSlots.length : 1);
    const pays = seat.pays.filter(p => !p.isJointMirror);
    let overdue=0, partial=0, dueBal=0, paidDue=0, curFull=true, monthsDue=0;
    dues.forEach((d,i) => {
        if(d > today) return;
        monthsDue++;
        const paid = pays.filter(x => inMonth(x,i)).reduce((a,x) => a+share(x), 0);
        const full = chitAmt > 0 ? paid >= chitAmt-0.5 : paid > 0;
        paidDue += chitAmt > 0 ? Math.min(paid, chitAmt) : paid;
        if(!full){
            if(paid > 0) partial++; else if(d < today) overdue++;
            if(chitAmt > 0) dueBal += Math.max(0, chitAmt-paid);
        }
        curFull = full;
    });
    const picked = pays.find(p => p.chitPicked === 'Yes');
    let pickedMonth = '';
    if(picked){ const pi = dues.findIndex((_,i) => inMonth(picked,i)); pickedMonth = pi >= 0 ? 'Month '+(pi+1) : ''; }
    let status, tone;
    if(!monthsDue)          { status='Not started';                tone='n'; }
    else if(overdue > 0)    { status='🔴 '+overdue+' overdue';     tone='r'; }
    else if(partial > 0)    { status='⚡ Partial';                  tone='a'; }
    else if(!curFull)       { status='⏳ Due today';               tone='n'; }
    else                    { status='✅ Up to date';              tone='g'; }
    const total = pays.reduce((a,x) => a+(parseFloat(x.paid)||0), 0);
    return { name:seat.name, dueBal, paidDue, overdue, partial, status, tone, picked:!!picked, pickedMonth, total, monthsDue };
}

function toggleStatCard(id){
    const body = document.getElementById('statBody_'+id), chev = document.getElementById('statChev_'+id);
    if(!body) return;
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    if(chev) chev.style.transform = open ? 'rotate(90deg)' : '';
    window._statOpen[id] = open;
}

async function loadStatistics() {
    if (!isAdmin()) return;
    const members = await getCollection('members');
    const groups  = await getCollection('groups');
    const allPays = await getCollection('payments');
    const today = new Date().toISOString().split('T')[0];

    // group filter
    const grpSel = document.getElementById('statGroupFilter');
    if (grpSel) {
        const cur = grpSel.value;
        grpSel.innerHTML = '<option value="">All groups</option>' + groups.map(g => `<option value="${g.id}">${_stEsc(g.name||g.id)}</option>`).join('');
        grpSel.value = groups.some(g => g.id === cur) ? cur : '';
    }
    const gFilter = grpSel ? grpSel.value : '';
    const shown = groups.filter(g => !gFilter || g.id === gFilter);

    const cards = [];
    let kCollected=0, kOverdue=0, kOverdueSeats=0, kPicked=0, kSeats=0;
    const modeMap = {};

    shown.forEach(g => {
        const dues  = getGroupDueDates(g) || [];
        const N     = dues.length;
        const gPays = allPays.filter(p => p.groupId === g.id && !p.isJointMirror);
        const seats = _statSeats(g, members, allPays);
        // monthly chit amount of the group: fixed amount first, else the latest payment's chit amount
        const lastPay = gPays.slice().sort((a,b) => (a.date||'').localeCompare(b.date||'')).filter(p => parseFloat(p.chit) > 0).pop();
        const chitAmt = (g.amtType !== 'variable' && parseFloat(g.fixedAmt) > 0) ? parseFloat(g.fixedAmt) : (lastPay ? parseFloat(lastPay.chit) : 0);
        const calc  = seats.map(s => _statSeatCalc(s, dues, chitAmt, today));
        const monthsDue = dues.filter(d => d <= today).length;
        const expected  = calc.reduce((a,c) => a + (chitAmt * monthsDue), 0);
        const gotDue    = calc.reduce((a,c) => a + c.paidDue, 0);
        const overdueAmt= calc.reduce((a,c) => a + c.dueBal, 0);
        const pct       = expected > 0 ? Math.min(100, Math.round(gotDue/expected*100)) : 0;
        const collected = gPays.reduce((a,p) => a+(parseFloat(p.paid)||0), 0);
        const pickedN   = calc.filter(c => c.picked).length;
        const behind    = calc.filter(c => c.dueBal > 0).length;
        const completed = (typeof isGroupCompleted === 'function') && isGroupCompleted(g, allPays);
        const badge = completed ? ['COMPLETED','#a5b4fc','rgba(99,102,241,0.18)'] : (!monthsDue ? ['NOT STARTED','#9ca3af','rgba(156,163,175,0.18)'] : ['ACTIVE','#34d399','rgba(16,185,129,0.18)']);
        const monthTxt  = monthsDue ? `Month ${Math.min(monthsDue,N)} of ${N}` : (N ? `Starts ${fmtDate(dues[0])}` : '');

        kCollected += collected; kOverdue += overdueAmt; kOverdueSeats += behind; kPicked += pickedN; kSeats += seats.length;
        gPays.forEach(p => { const m = p.paidBy || 'Unknown'; modeMap[m] = (modeMap[m]||0) + (parseFloat(p.paid)||0); });

        const toneCss = { r:'background:rgba(239,68,68,0.15);color:#f87171;', a:'background:rgba(245,158,11,0.15);color:#fbbf24;', g:'background:rgba(16,185,129,0.15);color:#34d399;', n:'background:rgba(156,163,175,0.15);color:#cbd5e1;' };
        const rows = calc.slice().sort((a,b) => (b.dueBal-a.dueBal) || a.name.localeCompare(b.name)).map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,0.06);">
                <div style="min-width:0;">
                    <div style="font-weight:700;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.picked?'🏆 ':''}${_stEsc(c.name)}</div>
                    <div style="font-size:0.66rem;color:var(--text-dim);">Paid ${fmtAmt(c.total)}${c.pickedMonth?' · picked '+c.pickedMonth:''}</div>
                </div>
                <div style="text-align:right;flex:0 0 auto;">
                    <span style="${toneCss[c.tone]}border-radius:8px;padding:2px 8px;font-size:0.68rem;font-weight:800;white-space:nowrap;">${c.status}</span>
                    ${c.dueBal>0?`<div style="font-size:0.66rem;color:#f87171;margin-top:2px;">Due ${fmtAmt(c.dueBal)}</div>`:''}
                </div>
            </div>`).join('') || '<div style="padding:10px 0;color:var(--text-dim);font-size:0.78rem;">No members in this group.</div>';
        const open = !!window._statOpen[g.id];
        cards.push(`
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;margin-bottom:10px;overflow:hidden;${completed?'opacity:.85;':''}">
            <div onclick="toggleStatCard('${g.id}')" style="padding:12px 14px;cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-weight:800;font-size:0.95rem;color:var(--text-primary);">${_stEsc(g.name||g.id)}</span>
                        <span style="background:${badge[2]};color:${badge[1]};border-radius:6px;padding:1px 7px;font-size:0.62rem;font-weight:800;">${badge[0]}</span>
                    </div>
                    <span id="statChev_${g.id}" style="color:var(--text-dim);transition:transform .2s;${open?'transform:rotate(90deg);':''}">&#9654;</span>
                </div>
                <div style="font-size:0.74rem;color:var(--text-dim);margin:4px 0 8px;">${monthTxt}${chitAmt?' · '+fmtAmt(chitAmt)+' / month':''}</div>
                <div style="background:rgba(255,255,255,0.08);border-radius:6px;height:9px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#10b981,#34d399);"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-top:4px;">
                    <span style="color:#34d399;font-weight:700;">${expected>0?fmtAmt(gotDue)+' of '+fmtAmt(expected)+' due':'Nothing due yet'}</span>
                    <span style="color:var(--text-dim);font-weight:700;">${expected>0?pct+'%':''}</span>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                    <span style="background:rgba(245,158,11,0.15);color:#fbbf24;border-radius:8px;padding:3px 9px;font-size:0.7rem;font-weight:800;">🏆 Picked ${pickedN}/${seats.length}</span>
                    <span style="${behind?toneCss.r:toneCss.g}border-radius:8px;padding:3px 9px;font-size:0.7rem;font-weight:800;">${behind?'🔴 '+behind+' behind · '+fmtAmt(overdueAmt):'✅ All paid up'}</span>
                    <span style="background:rgba(99,102,241,0.15);color:#a5b4fc;border-radius:8px;padding:3px 9px;font-size:0.7rem;font-weight:800;">Collected ${fmtAmt(collected)}</span>
                </div>
            </div>
            <div id="statBody_${g.id}" style="display:${open?'block':'none'};padding:0 14px 8px;">${rows}</div>
        </div>`);
    });

    const set = (id, v) => { const el = document.getElementById(id); if(el) el.innerHTML = v; };
    set('statTotalCollected', fmtAmt(kCollected));
    set('statOverdueAmt', fmtAmt(kOverdue));
    set('statOverdueSub', kOverdueSeats ? kOverdueSeats + ' member' + (kOverdueSeats>1?'s':'') + ' behind' : 'everyone paid up');
    set('statChitsPicked', kPicked + '/' + kSeats);
    const box = document.getElementById('statScorecards');
    if(box) box.innerHTML = cards.join('') || '<div style="padding:18px;text-align:center;color:var(--text-dim);font-size:0.85rem;">No groups yet.</div>';

    // payment modes (kept)
    const modeColors = ['#6366f1','#10b981','#f39c12','#ef4444','#a5b4fc','#34d399'];
    const modeTotal  = Object.values(modeMap).reduce((s,v) => s+v, 0) || 1;
    const pieEl = document.getElementById('statPayModePie');
    if(pieEl){
        pieEl.innerHTML = '';
        Object.entries(modeMap).sort((a,b) => b[1]-a[1]).forEach(([mode,amt],i) => {
            const pct = Math.round(amt/modeTotal*100), color = modeColors[i % modeColors.length];
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
            tr.innerHTML = `
                <td style="padding:7px 14px;font-size:0.78rem;color:var(--text-dim);">${_stEsc(mode)}</td>
                <td style="padding:7px 14px;font-size:0.82rem;font-weight:800;text-align:right;color:${color};">${fmtAmt(amt)}</td>
                <td style="padding:7px 14px;font-size:0.75rem;font-weight:700;text-align:right;color:var(--text-dim);">${pct}%</td>`;
            pieEl.appendChild(tr);
        });
        if(!Object.keys(modeMap).length) pieEl.innerHTML = '<tr><td colspan="3" style="padding:14px;text-align:center;color:var(--text-dim);font-size:0.78rem;">No data</td></tr>';
    }
}

// Stubs so other files don't error
function loadEmailConfigToForm(){}
function updateBackupStatusUI(){}
function checkAndShowBackupReminder(){}
