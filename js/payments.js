// ═══════════════════════════════════════════════════════════
// AK Chit Funds — PAYMENTS (Unified Payment Entry Form)
// ═══════════════════════════════════════════════════════════

// GLOBAL PAYMENT BUFFER FOR UNIFIED FORM
let paymentEntriesBuffer = [];

// MULTI-MONTH HELPERS
// ══════════════════════════════════════════
async function getPaidSlots(memberId, groupId, group, enrollmentId, slotNum){
    const allDueDates=getGroupDueDates(group);
    const ps=await getCollection('payments');
    const mPays=ps.filter(p=>{
        if(p.memberId!==memberId||p.groupId!==groupId) return false;
        if(slotNum){
            const pSlot = p.slotNum ? Number(p.slotNum) : 1;
            const mySlot = Number(slotNum);
            if(pSlot !== mySlot) return false;
        }
        if(enrollmentId && p.enrollmentId && p.enrollmentId!==''){
            return p.enrollmentId === enrollmentId;
        }
        return true;
    });
    const paidSlots=new Set();
    mPays.forEach(p=>{
        if(Array.isArray(p.monthSlots)) p.monthSlots.forEach(s=>paidSlots.add(s));
        else if(p.monthSlot!==undefined&&p.monthSlot!==null) paidSlots.add(p.monthSlot);
        else { const slot=getMonthSlot(allDueDates,p.date); if(slot>=0) paidSlots.add(slot); }
    });
    return {paidSlots, allDueDates};
}

async function isChitAlreadyPicked(ps, memberId, groupId, enrollmentId, slotNum){
    return ps.some(p => {
        if(p.chitPicked !== 'Yes') return false;
        if(p.memberId !== memberId || p.groupId !== groupId) return false;
        const pSlot = p.slotNum ? Number(p.slotNum) : 1;
        const mySlot = Number(slotNum) || 1;
        if(pSlot !== mySlot) return false;
        if(enrollmentId && p.enrollmentId && p.enrollmentId !== ''){
            return p.enrollmentId === enrollmentId;
        }
        return true;
    });
}

// ══════════════════════════════════════════
// UNIFIED PAYMENT FORM FUNCTIONS
// ══════════════════════════════════════════

function resetPaymentForm(){
    document.getElementById('pDate').value=new Date().toISOString().split('T')[0];
    document.getElementById('pMemberSearch').value='';
    document.getElementById('pMember').value='';
    document.getElementById('pMemberList').style.display='none';
    document.getElementById('pGroup').innerHTML='<option value="">-- Select Member First --</option>';
    document.getElementById('pMonth').innerHTML='<option value="">-- Select month --</option>';
    document.getElementById('pPaymentDate').value=new Date().toISOString().split('T')[0];
    document.getElementById('pPaid').value='';
    document.getElementById('pPaidBy').value='';
    document.getElementById('pChit').value='';
    document.getElementById('pChitPicked').value='No';
    document.getElementById('pChitPickedBy').value='';
    document.getElementById('chitPickedNameDiv').style.display='none';
    document.getElementById('monthInfoBadge').style.display='none';
    document.getElementById('pChitDisplay').value='';
    
    paymentEntriesBuffer=[];
    document.getElementById('paymentEntriesSection').style.display='none';
    document.getElementById('paymentEntriesList').innerHTML='';
    document.getElementById('paymentSummaryBox').style.display='none';
    
    loadPaidByOptions().then(()=>populatePaidBySelect('pPaidBy'));
}

function openPaymentModal(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    resetPaymentForm();
    openModal('paymentModal');
}

async function onGroupChange(){
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    
    // Show joint member info
    await showJointMemberInfo(mid, gid);
    
    // Auto-fill chit amount and populate month dropdown
    if(gid){
        const gs=await getCollection('groups');
        const grp=gs.find(g=>g.id===gid);
        let autoChit=0;
        
        if(grp && grp.amtType!=='variable' && grp.fixedAmt){
            autoChit=parseFloat(grp.fixedAmt)||0;
        }
        if(!autoChit && mid){
            const ps2=await getCollection('payments');
            const lastP=ps2.filter(p=>p.memberId===mid&&p.groupId===gid&&p.chit).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
            if(lastP.length) autoChit=parseFloat(lastP[0].chit)||0;
        }
        
        if(autoChit){
            document.getElementById('pChit').value=autoChit;
            document.getElementById('pChitDisplay').value='₹ '+autoChit.toLocaleString('en-IN');
        }
        
        // Populate month dropdown
        await populateMonthDropdown();
    }
    
    // Check if chit already picked
    if(mid&&gid){
        const ps=await getCollection('payments');
        const eid=document.getElementById('pEnrollmentId').value||'';
        const sn=parseInt(document.getElementById('pSlotNum').value||'1');
        const alreadyPicked=await isChitAlreadyPicked(ps,mid,gid,eid,sn);
        const sel=document.getElementById('pChitPicked');
        if(alreadyPicked){
            sel.value='No';
            [...sel.options].forEach(o=>{if(o.value==='Yes')o.disabled=true;});
            sel.title='This slot already picked the chit';
        } else {
            [...sel.options].forEach(o=>o.disabled=false);
            sel.title='';
        }
    }
}

async function populateMonthDropdown(){
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    const monthSel=document.getElementById('pMonth');
    
    if(!mid || !gid){
        monthSel.innerHTML='<option value="">-- Select member & group first --</option>';
        return;
    }
    
    const gs=await getCollection('groups');
    const grp=gs.find(g=>g.id===gid);
    if(!grp){
        monthSel.innerHTML='<option value="">Group not found</option>';
        return;
    }
    
    const eid=document.getElementById('pEnrollmentId').value||'';
    const sn=parseInt(document.getElementById('pSlotNum').value||'1');
    const {paidSlots, allDueDates}=await getPaidSlots(mid,gid,grp,eid,sn);
    
    if(!allDueDates.length){
        monthSel.innerHTML='<option value="">No months configured</option>';
        return;
    }
    
    const today=new Date().toISOString().split('T')[0];
    monthSel.innerHTML='<option value="">-- Select month --</option>'+allDueDates.map((dd,i)=>{
        const isPaid=paidSlots.has(i);
        const remaining=0; // Will be calculated on selection
        const label=fmtDate(dd)+(isPaid ? ' (✅ Paid)' : ' (Remaining)');
        return `<option value="${i}" data-paid="${isPaid}">${label}</option>`;
    }).join('');
}

async function onMonthSelected(){
    const monthSel=document.getElementById('pMonth');
    const badgeEl=document.getElementById('monthInfoBadge');
    const selectedSlot=monthSel.value;
    
    if(selectedSlot===''){
        badgeEl.style.display='none';
        return;
    }
    
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    const eid=document.getElementById('pEnrollmentId').value||'';
    const sn=parseInt(document.getElementById('pSlotNum').value||'1');
    
    const gs=await getCollection('groups');
    const grp=gs.find(g=>g.id===gid);
    if(!grp) return;
    
    const {paidSlots, allDueDates}=await getPaidSlots(mid,gid,grp,eid,sn);
    const dueDate=allDueDates[selectedSlot];
    const isPaid=paidSlots.has(parseInt(selectedSlot));
    
    if(isPaid){
        const totalPaidForMonth=await getMonthPaidTotal(mid, gid, parseInt(selectedSlot), eid, sn);
        const chit=parseFloat(document.getElementById('pChit').value)||0;
        badgeEl.innerHTML=`<strong>✅ Already Paid:</strong> ₹${totalPaidForMonth.toLocaleString('en-IN')} of ₹${chit.toLocaleString('en-IN')} | You can still add more payments`;
    } else {
        const chit=parseFloat(document.getElementById('pChit').value)||0;
        badgeEl.innerHTML=`<strong>📅 Due:</strong> ${fmtDate(dueDate)} | <strong>Amount:</strong> ₹${chit.toLocaleString('en-IN')}`;
    }
    badgeEl.style.display='block';
}

async function getMonthPaidTotal(mid, gid, monthSlot, eid, sn){
    const ps=await getCollection('payments');
    let total=0;
    ps.forEach(p=>{
        if(p.memberId!==mid || p.groupId!==gid) return;
        const pSlot = p.slotNum ? Number(p.slotNum) : 1;
        if(pSlot !== Number(sn)) return;
        if(eid && p.enrollmentId && p.enrollmentId!==''){
            if(p.enrollmentId !== eid) return;
        }
        
        if(Array.isArray(p.monthSlots) && p.monthSlots.includes(monthSlot)){
            total += parseFloat(p.paid)||0;
        } else if(p.monthSlot===monthSlot){
            total += parseFloat(p.paid)||0;
        }
    });
    return total;
}

async function linkGroupForPayment(){
    const mid=document.getElementById('pMember').value;
    const ms=await getCollection('members');
    const m=ms.find(x=>x.id===mid);
    if(!m)return;
    
    const gs=await getCollection('groups');
    let opts='';
    
    if(m.enrollments && m.enrollments.length){
        opts = m.enrollments.map(e=>{
            const g=gs.find(x=>x.id===e.groupId);
            if(!g) return '';
            const qty = parseInt(e.qty||1);
            if(qty > 1){
                return Array.from({length:qty},(_,i)=>{
                    const slotLabel = e.label ? `${e.label} — Chit ${i+1}` : `Chit ${i+1} of ${qty}`;
                    return `<option value="${e.groupId}" data-enrollment-id="${e.enrollmentId}" data-slot="${i+1}">${g.name} (${slotLabel})</option>`;
                }).join('');
            } else {
                const dispLabel = e.label ? ` (${e.label})` : '';
                return `<option value="${e.groupId}" data-enrollment-id="${e.enrollmentId}" data-slot="1">${g.name}${dispLabel}</option>`;
            }
        }).join('');
    } else {
        opts = gs.filter(g=>m.groupIds&&m.groupIds.includes(g.id)).map(g=>`<option value="${g.id}" data-slot="1">${g.name}</option>`).join('');
    }
    
    document.getElementById('pGroup').innerHTML = opts || '<option value="">No groups assigned</option>';
    const sel = document.getElementById('pGroup');
    sel.onchange = async function(){
        const chosen = sel.options[sel.selectedIndex];
        document.getElementById('pEnrollmentId').value = chosen ? (chosen.dataset.enrollmentId||'') : '';
        document.getElementById('pSlotNum').value = chosen ? (chosen.dataset.slot||'1') : '1';
        await onGroupChange();
    };
    const first = sel.options[sel.selectedIndex];
    document.getElementById('pEnrollmentId').value = first ? (first.dataset.enrollmentId||'') : '';
    document.getElementById('pSlotNum').value = first ? (first.dataset.slot||'1') : '1';
    await onGroupChange();
}

async function addPaymentEntry(){
    const month=document.getElementById('pMonth').value;
    const amount=parseFloat(document.getElementById('pPaid').value);
    const paidBy=document.getElementById('pPaidBy').value;
    const paymentDate=document.getElementById('pPaymentDate').value;
    
    if(!month || !amount || !paidBy || !paymentDate){
        showToast('❌ Fill all payment fields',false);
        return;
    }
    
    if(amount <= 0){
        showToast('❌ Amount must be greater than 0',false);
        return;
    }
    
    // Get month label
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    const gs=await getCollection('groups');
    const grp=gs.find(g=>g.id===gid);
    const allDueDates=grp ? getGroupDueDates(grp) : [];
    const monthLabel=allDueDates[month] ? fmtDate(allDueDates[month]) : `Month ${parseInt(month)+1}`;
    
    // Add to buffer
    paymentEntriesBuffer.push({
        monthSlot: parseInt(month),
        monthLabel: monthLabel,
        amount: amount,
        paidBy: paidBy,
        paymentDate: paymentDate
    });
    
    // Clear inputs for next entry
    document.getElementById('pMonth').value='';
    document.getElementById('pPaid').value='';
    document.getElementById('pPaidBy').value='';
    document.getElementById('pPaymentDate').value=new Date().toISOString().split('T')[0];
    document.getElementById('monthInfoBadge').style.display='none';
    
    renderPaymentEntries();
    updatePaymentSummary();
    
    showToast('✅ Entry added!');
}

function renderPaymentEntries(){
    const list=document.getElementById('paymentEntriesList');
    const section=document.getElementById('paymentEntriesSection');
    
    if(paymentEntriesBuffer.length===0){
        section.style.display='none';
        list.innerHTML='';
        return;
    }
    
    section.style.display='block';
    list.innerHTML=paymentEntriesBuffer.map((entry, idx)=>`
        <div style="background:rgba(99,102,241,0.12);border:0.5px solid rgba(99,102,241,0.3);border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
            <div style="flex:1;">
                <div style="font-weight:600;color:#a5b4fc;font-size:0.9rem;">${entry.monthLabel}</div>
                <div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px;">₹${entry.amount.toLocaleString('en-IN')} via ${entry.paidBy} on ${entry.paymentDate}</div>
            </div>
            <button type="button" onclick="removePaymentEntry(${idx})" style="background:rgba(239,68,68,0.15);border:0.5px solid rgba(239,68,68,0.3);color:#ef4444;padding:5px 10px;border-radius:6px;font-size:0.78rem;cursor:pointer;flex-shrink:0;font-weight:600;">Remove</button>
        </div>
    `).join('');
}

function removePaymentEntry(idx){
    paymentEntriesBuffer.splice(idx, 1);
    renderPaymentEntries();
    updatePaymentSummary();
}

function updatePaymentSummary(){
    const summary=document.getElementById('paymentSummaryBox');
    const total=paymentEntriesBuffer.reduce((sum, e)=>sum+e.amount, 0);
    
    if(paymentEntriesBuffer.length===0){
        summary.style.display='none';
        return;
    }
    
    summary.style.display='block';
    document.getElementById('summaryTotal').textContent='₹'+total.toLocaleString('en-IN');
    document.getElementById('summaryCount').textContent=paymentEntriesBuffer.length;
}

// ══════════════════════════════════════════
// SAVE ALL PAYMENTS FROM BUFFER
// ══════════════════════════════════════════
async function savePayment(){
    try {
        if(!isAdmin()){showToast('🚫 Access denied',false);return;}
        
        if(paymentEntriesBuffer.length===0){
            showToast('❌ Add at least one payment entry',false);
            return;
        }
        
        const mid=document.getElementById('pMember').value;
        const gid=document.getElementById('pGroup').value;
        const chitPicked=document.getElementById('pChitPicked').value;
        const chitPickedBy=document.getElementById('pChitPickedBy').value.trim();
        const eid=document.getElementById('pEnrollmentId').value||'';
        const sn=parseInt(document.getElementById('pSlotNum').value||'1');
        const chit=parseFloat(document.getElementById('pChit').value)||0;
        
        if(!mid || !gid){
            showToast('❌ Select member & group',false);
            return;
        }
        
        // Check if chit already picked
        if(chitPicked==='Yes'){
            const ps=await getCollection('payments');
            const alreadyPicked=await isChitAlreadyPicked(ps,mid,gid,eid,sn);
            if(alreadyPicked){
                showToast('❌ Chit already picked for this slot',false);
                return;
            }
        }
        
        // Save each entry
        for(const entry of paymentEntriesBuffer){
            const balance=Math.max(0, chit-entry.amount);
            
            await db.collection('payments').add({
                memberId: mid,
                groupId: gid,
                enrollmentId: eid,
                slotNum: sn,
                date: entry.paymentDate,
                chit: chit,
                paid: entry.amount,
                balance: balance,
                paidBy: entry.paidBy,
                chitPicked: chitPicked,
                chitPickedBy: chitPickedBy,
                numMonths: 1,
                monthSlots: [entry.monthSlot],
                monthSlot: entry.monthSlot,
                paidPerMonth: entry.amount,
                balPerMonth: balance,
                paymentNote: getPaymentNoteText()
            });
        }
        
        bustCache('payments');
        showToast('✅ '+paymentEntriesBuffer.length+' payment(s) recorded!');
        
        paymentEntriesBuffer=[];
        closeModal('paymentModal');
        resetPaymentForm();
        
        await updateUI();
        const summaryView = document.getElementById('summaryView');
        if(summaryView) {
            summaryView.value = mid;
            await loadMemberLedger();
        }
        
    } catch(error) {
        console.error('Payment save error:', error);
        showToast('❌ '+error.message, false);
    }
}

// ══════════════════════════════════════════
// JOINT ENROLLMENT DISPLAY
// ══════════════════════════════════════════
async function showJointMemberInfo(mid, gid){
    let banner = document.getElementById('jointMemberBanner');
    if(!banner) return;
    banner.style.display='none';
    banner.innerHTML='';
    if(!mid||!gid) return;
    
    const ms = await getCollection('members');
    const m = ms.find(x=>x.id===mid);
    if(!m||!m.enrollments) return;
    
    const enr = m.enrollments.find(e=>e.groupId===gid);
    if(!enr||!enr.coMemberId) return;
    
    const coM = ms.find(x=>x.id===enr.coMemberId);
    if(!coM) return;
    
    banner.style.display='block';
    banner.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">👥</span>
            <div>
                <div style="font-size:0.88rem;font-weight:800;color:#a5b4fc;">Joint Chit</div>
                <div style="font-size:0.8rem;color:var(--text-dim);">
                    <strong style="color:#c4b5fd;">${m.name}</strong>
                    <span style="margin:0 6px;color:var(--text-dim);">+</span>
                    <strong style="color:#c4b5fd;">${coM.name}</strong>
                    ${coM.phone?'<span style="color:var(--text-dim);"> · '+coM.phone+'</span>':''}
                    share this chit slot
                </div>
            </div>
        </div>`;
}

// ══════════════════════════════════════════
// EDIT / DELETE EXISTING PAYMENT
// ══════════════════════════════════════════
async function openEditPayment(pid){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const ps=await getCollection('payments');
    const p=ps.find(x=>x.id===pid);
    if(!p)return;
    
    document.getElementById('epId').value=pid;
    document.getElementById('epDate').value=p.date||'';
    document.getElementById('epChit').value=p.chit||'';
    document.getElementById('epPaid').value=p.paid||'';
    document.getElementById('epBal').value=p.balance||'';
    document.getElementById('epPaidBy').value=p.paidBy||'';
    document.getElementById('epChitPicked').value=p.chitPicked||'No';
    document.getElementById('epChitPickedBy').value=p.chitPickedBy||'';
    document.getElementById('epPaymentNote').value=p.paymentNote||'';
    onEditNoteChange();
    document.getElementById('epChitPickedNameDiv').style.display=p.chitPicked==='Yes'?'block':'none';

    const infoBox=document.getElementById('epMultiMonthInfo');
    const detailEl=document.getElementById('epMultiMonthDetail');
    if(p.numMonths&&p.numMonths>1){
        infoBox.style.display='block';
        const gs=await getCollection('groups');
        const grp=gs.find(g=>g.id===p.groupId);
        let slotLabels='';
        if(grp&&p.monthSlots){
            const dueDates=getGroupDueDates(grp);
            slotLabels=p.monthSlots.map((s,i)=>dueDates[s]?fmtDate(dueDates[s]):`Month ${s+1}`).join(' → ');
        }
        detailEl.innerHTML=`Covers <strong>${p.numMonths} months</strong>${slotLabels?': '+slotLabels:''}`;
    } else {
        infoBox.style.display='none';
    }

    openModal('editPaymentModal');
}

function epCalcBalance(){
    const chit=parseFloat(document.getElementById('epChit').value)||0;
    const paid=parseFloat(document.getElementById('epPaid').value)||0;
    document.getElementById('epBal').value=Math.max(0,chit-paid);
}

async function saveEditPayment(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const pid=document.getElementById('epId').value;
    if(!pid)return;
    
    const date=document.getElementById('epDate').value;
    const chit=parseFloat(document.getElementById('epChit').value)||0;
    const paid=parseFloat(document.getElementById('epPaid').value)||0;
    const balance=Math.max(0,chit-paid);
    const paidBy=document.getElementById('epPaidBy').value;
    const chitPicked=document.getElementById('epChitPicked').value;
    const chitPickedBy=document.getElementById('epChitPickedBy').value.trim();
    
    if(!date)return showToast('❌ Enter date',false);
    if(!paid)return showToast('❌ Enter amount paid',false);
    
    const paymentNote=getEditPaymentNoteText();
    await db.collection('payments').doc(pid).update({date,chit,paid,balance,paidBy,chitPicked,chitPickedBy,paymentNote});
    bustCache('payments');
    closeModal('editPaymentModal');
    showToast('✅ Payment updated!');
    updateUI();
    
    const mid=document.getElementById('summaryView').value;
    if(mid)loadMemberLedger();
}

async function deletePayment(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const pid=document.getElementById('epId').value;
    if(!pid)return;
    
    showConfirm('🗑','Delete Payment?','This will permanently delete this payment record.',async()=>{
        await db.collection('payments').doc(pid).delete();
        bustCache('payments');
        closeModal('editPaymentModal');
        showToast('🗑 Payment deleted');
        updateUI();
        const mid=document.getElementById('summaryView').value;
        if(mid)loadMemberLedger();
    });
}

// ══════════════════════════════════════════
// Paid By: Editable Combo Dropdown
// ══════════════════════════════════════════
const DEFAULT_PAID_BY = ['UPI','GPay','PhonePe','PPay','Bank Transfer','Cash','Cheque'];
let _paidByOptions = null;
let _managingFor = null;

function getPaidByOptions() {
    if (_paidByOptions) return _paidByOptions;
    try {
        const stored = localStorage.getItem('ak_paidby_options');
        _paidByOptions = stored ? JSON.parse(stored) : [...DEFAULT_PAID_BY];
    } catch(e) { _paidByOptions = [...DEFAULT_PAID_BY]; }
    return _paidByOptions;
}

async function loadPaidByOptions() {
    try {
        const doc = await db.collection('settings').doc('paidByOptions').get();
        if (doc.exists && Array.isArray(doc.data().options)) {
            _paidByOptions = doc.data().options;
        } else {
            _paidByOptions = [...DEFAULT_PAID_BY];
        }
        localStorage.setItem('ak_paidby_options', JSON.stringify(_paidByOptions));
    } catch(e) {
        try {
            const stored = localStorage.getItem('ak_paidby_options');
            _paidByOptions = stored ? JSON.parse(stored) : [...DEFAULT_PAID_BY];
        } catch(e2) { _paidByOptions = [...DEFAULT_PAID_BY]; }
    }
    return _paidByOptions;
}

async function savePaidByToStorage() {
    try {
        await db.collection('settings').doc('paidByOptions').set({ options: _paidByOptions });
        localStorage.setItem('ak_paidby_options', JSON.stringify(_paidByOptions));
    } catch(e) {
        try { localStorage.setItem('ak_paidby_options', JSON.stringify(_paidByOptions)); } catch(e2){}
        showToast('⚠️ Saved locally only',false);
    }
}

function populatePaidBySelect(selectId){
    const sel = document.getElementById(selectId);
    if(!sel || sel.tagName !== 'SELECT') return;
    const opts = getPaidByOptions();
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Select --</option>' + opts.map(o=>`<option value="${o}"${o===cur?' selected':''}>${o}</option>`).join('');
}

function openManagePaidBy(inputId) {
    _managingFor = inputId;
    renderPaidByOptionsList();
    openModal('managePaidByModal');
}

function renderPaidByOptionsList() {
    const opts = getPaidByOptions();
    const el = document.getElementById('paidByOptionsList');
    if (!el) return;
    el.innerHTML = opts.map((o, i) =>
        `<div style="display:flex;align-items:center;gap:8px;background:var(--input-bg);border:0.5px solid var(--border);border-radius:10px;padding:8px 12px;">
            <span style="flex:1;font-size:0.85rem;font-weight:600;color:var(--text-primary);">${o}</span>
            <button onclick="movePaidByOption(${i},-1)" title="Move up" style="background:none;border:none;color:var(--text-dim);font-size:0.85rem;cursor:pointer;padding:2px 5px;" ${i===0?'disabled style="opacity:.3;"':''}>▲</button>
            <button onclick="movePaidByOption(${i},1)" title="Move down" style="background:none;border:none;color:var(--text-dim);font-size:0.85rem;cursor:pointer;padding:2px 5px;" ${i===opts.length-1?'disabled style="opacity:.3;"':''}>▼</button>
            <button onclick="deletePaidByOption(${i})" title="Delete" style="background:rgba(239,68,68,0.15);border:0.5px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:7px;padding:4px 9px;font-size:0.78rem;cursor:pointer;">✕</button>
        </div>`
    ).join('') || '<div style="color:var(--text-dim);font-size:0.8rem;text-align:center;">No options yet</div>';
}

function addPaidByOption() {
    const input = document.getElementById('newPaidByInput');
    const val = (input.value || '').trim();
    if (!val) return;
    const opts = getPaidByOptions();
    if (opts.some(o => o.toLowerCase() === val.toLowerCase())) {
        showToast('⚠️ Option already exists', false); 
        return;
    }
    opts.push(val);
    _paidByOptions = opts;
    input.value = '';
    renderPaidByOptionsList();
}

function deletePaidByOption(i) {
    const opts = getPaidByOptions();
    opts.splice(i, 1);
    _paidByOptions = opts;
    renderPaidByOptionsList();
}

function movePaidByOption(i, dir) {
    const opts = getPaidByOptions();
    const j = i + dir;
    if (j < 0 || j >= opts.length) return;
    [opts[i], opts[j]] = [opts[j], opts[i]];
    _paidByOptions = opts;
    renderPaidByOptionsList();
}

async function savePaidByOptions() {
    await savePaidByToStorage();
    populatePaidBySelect('pPaidBy');
    closeModal('managePaidByModal');
    showToast('✅ Payment modes saved!');
}

// ══════════════════════════════════════════
// Payment Notes
// ══════════════════════════════════════════
function onPaymentNoteChange() {
    const sel = document.getElementById('pPaymentNote');
    const wrap = document.getElementById('pCustomNoteWrap');
    if (!sel) return;
    if(wrap) wrap.style.display = sel.value === 'Custom' ? '' : 'none';
}

function onEditNoteChange() {
    const sel = document.getElementById('epPaymentNote');
    const custom = document.getElementById('epCustomNote');
    if (!sel || !custom) return;
    custom.style.display = sel.value === 'Custom' ? '' : 'none';
}

function getPaymentNoteText() {
    const sel = document.getElementById('pPaymentNote');
    const custom = document.getElementById('pCustomNote');
    if (!sel) return '';
    if (sel.value === 'Custom') {
        return custom?.value || 'Custom Note';
    }
    return sel.value || '';
}

function getEditPaymentNoteText() {
    const sel = document.getElementById('epPaymentNote');
    const custom = document.getElementById('epCustomNote');
    if (!sel) return '';
    if (sel.value === 'Custom') {
        return custom?.value || 'Custom Note';
    }
    return sel.value || '';
}

// ══════════════════════════════════════════
// Toggle Chit Picked Name
// ══════════════════════════════════════════
function toggleChitPickedName(){
    const isPicked = document.getElementById('pChitPicked').value==='Yes';
    document.getElementById('chitPickedNameDiv').style.display = isPicked ? 'block' : 'none';
}
