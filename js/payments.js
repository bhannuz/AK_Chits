// ═══════════════════════════════════════════════════════════
// AK Chit Funds — PAYMENTS
// Edit only this file when changing record payment, multi-month, edit/delete payments
// ═══════════════════════════════════════════════════════════

// MULTI-MONTH HELPERS
// ══════════════════════════════════════════
async function getPaidSlots(memberId, groupId, group){
    const allDueDates=getGroupDueDates(group);
    const ps=await getCollection('payments');
    const mPays=ps.filter(p=>p.memberId===memberId&&p.groupId===groupId);
    const paidSlots=new Set();
    mPays.forEach(p=>{
        if(Array.isArray(p.monthSlots)) p.monthSlots.forEach(s=>paidSlots.add(s));
        else if(p.monthSlot!==undefined&&p.monthSlot!==null) paidSlots.add(p.monthSlot);
        else { const slot=getMonthSlot(allDueDates,p.date); if(slot>=0) paidSlots.add(slot); }
    });
    return {paidSlots, allDueDates};
}

function getSelectedMonthSlots(){
    return Array.from(document.querySelectorAll('#monthSelectorGrid input[type=checkbox]:checked:not(:disabled)')).map(cb=>parseInt(cb.value));
}

async function onNumMonthsChange(){
    const val=document.getElementById('pNumMonths').value;
    const preview=document.getElementById('multiMonthPreview');
    document.getElementById('totalChitRef').style.display='none';
    if(val==='1'){
        preview.style.display='none';
        document.getElementById('perMonthLabel').textContent='';
    } else {
        document.getElementById('perMonthLabel').textContent='(per month)';
        preview.style.display='block';
        await buildMonthSelectorGrid();
    }
    calcBalance();
}

async function buildMonthSelectorGrid(){
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    const grid=document.getElementById('monthSelectorGrid');
    const summary=document.getElementById('selectedSummary');
    grid.innerHTML='<div style="color:var(--text-dim);font-size:0.92rem;padding:8px;">Select member & group first…</div>';
    summary.style.display='none';
    document.getElementById('perMonthAmtWrap').style.display='none';
    document.getElementById('perMonthCustomToggle').checked=false;
    if(!mid||!gid) return;
    const gs=await getCollection('groups');
    window._gs_cache=gs;
    const grp=gs.find(g=>g.id===gid);
    if(!grp){grid.innerHTML='<div style="color:#f87171;font-size:0.92rem;">Group not found</div>';return;}
    const {paidSlots,allDueDates}=await getPaidSlots(mid,gid,grp);
    if(!allDueDates.length){grid.innerHTML='<div style="color:#f87171;font-size:0.92rem;">No due dates configured for this group</div>';return;}
    const today=new Date().toISOString().split('T')[0];
    grid.innerHTML=allDueDates.map((dd,i)=>{
        const paid=paidSlots.has(i);
        const isPast=dd<=today;
        return`<label class="month-cb-item ${paid?'already-paid':''}">
            <input type="checkbox" value="${i}" ${paid?'disabled checked':''} onchange="updateSelectedSummary();calcBalance();">
            <div>
                <div style="font-size:1.05rem;font-weight:700;">${fmtDate(dd)}</div>
                <div style="font-size:0.98rem;color:${paid?'#34d399':(isPast?'#f87171':'var(--text-dim)')}">${paid?'✅ Paid':(isPast?'⚠ Overdue':'Upcoming')}</div>
            </div>
        </label>`;
    }).join('');
    updateSelectedSummary();
}

function updateSelectedSummary(){
    const newlySelected=Array.from(document.querySelectorAll('#monthSelectorGrid input[type=checkbox]:checked:not(:disabled)')).map(cb=>parseInt(cb.value));
    const summary=document.getElementById('selectedSummary');
    if(newlySelected.length===0){
        summary.style.display='none';
        document.getElementById('perMonthAmtWrap').style.display='none';
    } else {
        summary.style.display='block';
        summary.textContent=`📅 ${newlySelected.length} month${newlySelected.length>1?'s':''} selected for payment`;
        document.getElementById('perMonthAmtWrap').style.display='block';
        buildPerMonthAmtGrid(newlySelected);
    }
    calcBalance();
}

function buildPerMonthAmtGrid(selectedSlots){
    const isCustom=document.getElementById('perMonthCustomToggle').checked;
    const grid=document.getElementById('perMonthAmtGrid');
    if(!isCustom){ grid.style.display='none'; return; }
    grid.style.display='flex';
    const gs_cache=window._gs_cache||[];
    const gid=document.getElementById('pGroup').value;
    const grp=gs_cache.find(g=>g.id===gid);
    const allDueDates=grp?getGroupDueDates(grp):[];
    const chit=parseFloat(document.getElementById('pChit').value)||0;
    const existing={};
    grid.querySelectorAll('.pma-row').forEach(r=>{ existing[r.dataset.slot]=r.querySelector('input').value; });
    grid.innerHTML=selectedSlots.map(slot=>{
        const label=allDueDates[slot]?fmtDate(allDueDates[slot]):`Month ${slot+1}`;
        const val=existing[slot]!==undefined?existing[slot]:(chit||'');
        return `<div class="pma-row" data-slot="${slot}" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:7px 10px;">
            <span style="flex:1;font-size:0.92rem;color:#a5b4fc;font-weight:700;">${label}</span>
            <input type="number" placeholder="₹ amount" value="${val}" style="width:110px;background:var(--input-bg);border:1px solid var(--border);color:white;padding:6px 9px;border-radius:7px;font-size:1rem;" oninput="calcBalance()">
        </div>`;
    }).join('');
}

function togglePerMonthCustom(){
    const isCustom=document.getElementById('perMonthCustomToggle').checked;
    const slots=Array.from(document.querySelectorAll('#monthSelectorGrid input[type=checkbox]:checked:not(:disabled)')).map(cb=>parseInt(cb.value));
    if(isCustom && slots.length>0) buildPerMonthAmtGrid(slots);
    else document.getElementById('perMonthAmtGrid').style.display='none';
    calcBalance();
}

function onChitAmtChange(){
    if(document.getElementById('perMonthCustomToggle')?.checked){
        const chit=parseFloat(document.getElementById('pChit').value)||0;
        document.querySelectorAll('#perMonthAmtGrid .pma-row input').forEach(inp=>{
            if(!inp.value) inp.value=chit||'';
        });
    }
    calcBalance();
}

function getPerMonthAmounts(){
    if(!document.getElementById('perMonthCustomToggle')?.checked) return null;
    const map={};
    document.querySelectorAll('#perMonthAmtGrid .pma-row').forEach(r=>{
        const slot=parseInt(r.dataset.slot);
        const val=parseFloat(r.querySelector('input').value)||0;
        if(!isNaN(slot)) map[slot]=val;
    });
    return map;
}

function calcBalance(){
    const chit=parseFloat(document.getElementById('pChit').value)||0;
    const paid=parseFloat(document.getElementById('pPaid').value)||0;
    const isMulti=document.getElementById('pNumMonths').value==='multi';
    if(isMulti){
        const selectedCBs=Array.from(document.querySelectorAll('#monthSelectorGrid input[type=checkbox]:checked:not(:disabled)'));
        const n=Math.max(1,selectedCBs.length);
        const isCustom=document.getElementById('perMonthCustomToggle')?.checked;
        let totalChit=0;
        if(isCustom){
            const amtMap=getPerMonthAmounts()||{};
            selectedCBs.forEach(cb=>{ totalChit+=(amtMap[parseInt(cb.value)]||chit); });
        } else {
            totalChit=chit*n;
        }
        const bal=Math.max(0,totalChit-paid);
        if(n>1){
            document.getElementById('totalChitRef').style.display='block';
            document.getElementById('totalChitVal').textContent=isCustom
                ? `₹${totalChit.toLocaleString('en-IN')} (${n} months, custom amounts)`
                : `₹${totalChit.toLocaleString('en-IN')} (${n}×₹${chit.toLocaleString('en-IN')})`;
            document.getElementById('totalBalVal').textContent=`₹${bal.toLocaleString('en-IN')}`;
        } else {
            document.getElementById('totalChitRef').style.display='none';
        }
    } else {
        document.getElementById('totalChitRef').style.display='none';
    }
}

// PAYMENT FORM
// ══════════════════════════════════════════
function resetPaymentForm(){
    document.getElementById('pDate').value=new Date().toISOString().split('T')[0];
    document.getElementById('pMemberSearch').value='';
    document.getElementById('pMember').value='';
    document.getElementById('pMemberList').style.display='none';
    document.getElementById('pGroup').innerHTML='<option value="">-- Select Member First --</option>';
    document.getElementById('pNumMonths').value='1';
    if(document.getElementById('perMonthCustomToggle')) document.getElementById('perMonthCustomToggle').checked=false;
    if(document.getElementById('perMonthAmtGrid')) document.getElementById('perMonthAmtGrid').style.display='none';
    if(document.getElementById('perMonthAmtWrap')) document.getElementById('perMonthAmtWrap').style.display='none';
    document.getElementById('pChit').value='';
    document.getElementById('pPaid').value='';
    document.getElementById('pPaidBy').value='';
    document.getElementById('pChitPicked').value='No';
    document.getElementById('pChitPickedBy').value='';
    document.getElementById('chitPickedNameDiv').style.display='none';
    document.getElementById('multiMonthPreview').style.display='none';
    document.getElementById('totalChitRef').style.display='none';
    document.getElementById('perMonthLabel').textContent='';
    document.getElementById('monthSelectorGrid').innerHTML='';
    document.getElementById('selectedSummary').style.display='none';
    const sel=document.getElementById('pChitPicked');
    [...sel.options].forEach(o=>o.disabled=false);
    sel.title='';
}

function openPaymentModal(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    resetPaymentForm();
    openModal('paymentModal');
}

async function linkGroupForPayment(){
    const mid=document.getElementById('pMember').value;
    const ms=await getCollection('members');const m=ms.find(x=>x.id===mid);if(!m)return;
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
    sel.onchange = function(){
        const chosen = sel.options[sel.selectedIndex];
        document.getElementById('pEnrollmentId').value = chosen ? (chosen.dataset.enrollmentId||'') : '';
        document.getElementById('pSlotNum').value = chosen ? (chosen.dataset.slot||'1') : '1';
        onGroupChange();
    };
    const first = sel.options[sel.selectedIndex];
    document.getElementById('pEnrollmentId').value = first ? (first.dataset.enrollmentId||'') : '';
    document.getElementById('pSlotNum').value = first ? (first.dataset.slot||'1') : '1';
    await onGroupChange();
}

async function onGroupChange(){
    document.getElementById('pChit').value='';
    document.getElementById('pPaid').value='';
    document.getElementById('totalChitRef').style.display='none';
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    // Auto-fill chit amount from group fixedAmt if set
    if(gid){
        const gs=await getCollection('groups');
        const grp=gs.find(g=>g.id===gid);
        if(grp && grp.amtType!=='variable' && grp.fixedAmt){
            document.getElementById('pChit').value=parseFloat(grp.fixedAmt)||'';
            calcBalance();
        }
    }
    if(mid&&gid){
        const ps=await getCollection('payments');
        const alreadyPicked=ps.some(p=>p.memberId===mid&&p.groupId===gid&&p.chitPicked==='Yes');
        const sel=document.getElementById('pChitPicked');
        if(alreadyPicked){
            sel.value='No';
            [...sel.options].forEach(o=>{if(o.value==='Yes')o.disabled=true;});
            sel.title='This member already picked the chit in this group';
            document.getElementById('chitPickedNameDiv').style.display='none';
        } else {
            [...sel.options].forEach(o=>o.disabled=false);
            sel.title='';
        }
    }
    if(document.getElementById('pNumMonths').value==='multi') await buildMonthSelectorGrid();
}

async function savePayment(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const mid=document.getElementById('pMember').value;
    const gid=document.getElementById('pGroup').value;
    const date=document.getElementById('pDate').value;
    const chitPerMonth=parseFloat(document.getElementById('pChit').value)||0;
    const paid=parseFloat(document.getElementById('pPaid').value)||0;
    const paidBy=document.getElementById('pPaidBy').value;
    const chitPicked=document.getElementById('pChitPicked').value;
    const chitPickedBy=document.getElementById('pChitPickedBy').value.trim();
    const isMulti=document.getElementById('pNumMonths').value==='multi';

    if(!mid)return showToast('❌ Select a member',false);
    if(!gid)return showToast('❌ Select a group',false);
    if(!date)return showToast('❌ Enter date',false);
    if(!paid)return showToast('❌ Enter amount paid',false);

    if(chitPicked==='Yes'){
        const ps=await getCollection('payments');
        const alreadyPicked=ps.some(p=>p.memberId===mid&&p.groupId===gid&&p.chitPicked==='Yes');
        if(alreadyPicked)return showToast('❌ This member already picked the chit',false);
    }

    if(isMulti){
        const monthSlots=getSelectedMonthSlots();
        if(monthSlots.length===0)return showToast('❌ Select at least one month',false);
        const numMonths=monthSlots.length;
        const perMonthMap=getPerMonthAmounts();
        let totalChit=0;
        let perMonthBreakdown=null;
        if(perMonthMap && Object.keys(perMonthMap).length>0){
            perMonthBreakdown=monthSlots.map(s=>({slot:s, amt:perMonthMap[s]||chitPerMonth}));
            totalChit=perMonthBreakdown.reduce((s,r)=>s+r.amt,0);
        } else {
            totalChit=chitPerMonth*numMonths;
        }
        const balance=Math.max(0,totalChit-paid);
        const enrollmentId1 = document.getElementById('pEnrollmentId').value||'';
        const slotNum1 = parseInt(document.getElementById('pSlotNum').value||'1');
        await db.collection('payments').add({
            memberId:mid, groupId:gid, enrollmentId:enrollmentId1, slotNum:slotNum1, date,
            chit:chitPerMonth, paid, balance, paidBy, chitPicked, chitPickedBy,
            numMonths, monthSlots, monthSlot:monthSlots[0],
            paidPerMonth:paid/numMonths, balPerMonth:balance/numMonths,
            ...(perMonthBreakdown?{perMonthBreakdown}:{})
        });
        bustCache('payments');
        showToast(`✅ ${numMonths}-month payment saved!`);
    } else {
        const gs=await getCollection('groups');
        const grp=gs.find(g=>g.id===gid);
        const dueDates=grp?getGroupDueDates(grp):[];
        const slotIdx=getMonthSlot(dueDates,date);
        const balance=Math.max(0,chitPerMonth-paid);
        const enrollmentId2 = document.getElementById('pEnrollmentId').value||'';
        const slotNum2 = parseInt(document.getElementById('pSlotNum').value||'1');
        await db.collection('payments').add({
            memberId:mid, groupId:gid, enrollmentId:enrollmentId2, slotNum:slotNum2, date,
            chit:chitPerMonth, paid, balance, paidBy, chitPicked, chitPickedBy,
            numMonths:1, monthSlot:slotIdx>=0?slotIdx:null,
            monthSlots:slotIdx>=0?[slotIdx]:[]
        });
        bustCache('payments');
        showToast('✅ Payment saved!');
    }

    closeModal('paymentModal');
    updateUI();
    if(document.getElementById('summaryView').value===mid) loadMemberLedger();
}

// ══════════════════════════════════════════

// EDIT / DELETE EXISTING PAYMENT
// ══════════════════════════════════════════
async function openEditPayment(pid){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const ps=await getCollection('payments');
    const p=ps.find(x=>x.id===pid);if(!p)return;
    document.getElementById('epId').value=pid;
    document.getElementById('epDate').value=p.date||'';
    document.getElementById('epChit').value=p.chit||'';
    document.getElementById('epPaid').value=p.paid||'';
    document.getElementById('epBal').value=p.balance||'';
    document.getElementById('epPaidBy').value=p.paidBy||'';
    document.getElementById('epChitPicked').value=p.chitPicked||'No';
    document.getElementById('epChitPickedBy').value=p.chitPickedBy||'';
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
function epTogglePickedName(){
    document.getElementById('epChitPickedNameDiv').style.display=document.getElementById('epChitPicked').value==='Yes'?'block':'none';
}

async function saveEditPayment(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const pid=document.getElementById('epId').value;if(!pid)return;
    const date=document.getElementById('epDate').value;
    const chit=parseFloat(document.getElementById('epChit').value)||0;
    const paid=parseFloat(document.getElementById('epPaid').value)||0;
    const balance=Math.max(0,chit-paid);
    const paidBy=document.getElementById('epPaidBy').value;
    const chitPicked=document.getElementById('epChitPicked').value;
    const chitPickedBy=document.getElementById('epChitPickedBy').value.trim();
    if(!date)return showToast('❌ Enter date',false);
    if(!paid)return showToast('❌ Enter amount paid',false);
    await db.collection('payments').doc(pid).update({date,chit,paid,balance,paidBy,chitPicked,chitPickedBy});
    bustCache('payments');
    closeModal('editPaymentModal');showToast('✅ Payment updated!');updateUI();
    const mid=document.getElementById('summaryView').value;
    if(mid)loadMemberLedger();
}

async function deletePayment(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const pid=document.getElementById('epId').value;if(!pid)return;
    showConfirm('🗑','Delete Payment?','This will permanently delete this payment record.',async()=>{
        await db.collection('payments').doc(pid).delete();
        bustCache('payments');
        closeModal('editPaymentModal');showToast('🗑 Payment deleted');updateUI();
        const mid=document.getElementById('summaryView').value;
        if(mid)loadMemberLedger();
    });
}

// ══════════════════════════════════════════
