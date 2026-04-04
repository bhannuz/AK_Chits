// ═══════════════════════════════════════════════════════════
// AK Chit Funds — GROUPS CRUD & TAB
// Edit only this file when changing create / edit / delete groups, groups tab rendering
// ═══════════════════════════════════════════════════════════

// GROUP CRUD
// ══════════════════════════════════════════
function toggleGroupAmtType(){
    const isFixed = document.getElementById('gAmtFixed').checked;
    document.getElementById('gFixedAmtRow').style.display = isFixed ? 'block' : 'none';
}

function openAddGroup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    document.getElementById('gName').value='';
    document.getElementById('gDuration').value='';
    document.getElementById('gDueDay').value='';
    document.getElementById('gStart').value='';
    document.getElementById('gFixedAmt').value='';
    document.getElementById('editGroupId').value='';
    document.getElementById('groupModalTitle').textContent='🏦 New Group';
    document.getElementById('deleteGroupArea').style.display='none';
    document.getElementById('gAmtFixed').checked=true;
    toggleGroupAmtType();
    openModal('groupModal');
}

async function openEditGroup(gid){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const gs=await getCollection('groups');const g=gs.find(x=>x.id===gid);if(!g)return;
    document.getElementById('editGroupId').value=g.id;
    document.getElementById('gName').value=g.name||'';
    document.getElementById('gDuration').value=g.duration||g.gDuration||'';
    document.getElementById('gDueDay').value=g.dueDay||'';
    document.getElementById('gStart').value=g.startDate||g.gStart||'';
    document.getElementById('gFixedAmt').value=g.fixedAmt||'';
    const isFixed = g.amtType!=='variable';
    document.getElementById('gAmtFixed').checked=isFixed;
    document.getElementById('gAmtVariable').checked=!isFixed;
    toggleGroupAmtType();
    document.getElementById('groupModalTitle').textContent='✏️ Edit Group';
    document.getElementById('deleteGroupArea').style.display='block';
    openModal('groupModal');
}

async function saveGroup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const name=document.getElementById('gName').value.trim();
    const duration=document.getElementById('gDuration').value;
    const dueDay=parseInt(document.getElementById('gDueDay').value)||null;
    const startDate=document.getElementById('gStart').value;
    const eid=document.getElementById('editGroupId').value;
    if(!name)return showToast('❌ Enter group name',false);
    if(dueDay&&(dueDay<1||dueDay>31))return showToast('❌ Due Day must be 1–31',false);
    const amtType = document.querySelector('input[name="gAmtType"]:checked')?.value||'fixed';
    const fixedAmt = amtType==='fixed'?(parseFloat(document.getElementById('gFixedAmt').value)||0):0;
    const data={name,duration,startDate,amtType};
    if(dueDay) data.dueDay=dueDay;
    if(amtType==='fixed'&&fixedAmt>0) data.fixedAmt=fixedAmt;
    if(eid)await db.collection('groups').doc(eid).update(data);
    else await db.collection('groups').add(data);
    bustCache('groups');
    closeModal('groupModal');showToast(`✅ Group "${name}" saved!`);updateUI();
}

function deleteGroupFromModal(){
    const eid=document.getElementById('editGroupId').value;if(!eid)return;
    const name=document.getElementById('gName').value;
    showConfirm('🗑','Delete Group?',`This will permanently delete "${name}". Member assignments and payments will remain.`,async()=>{
        await db.collection('groups').doc(eid).delete();
        bustCache('groups');
        closeModal('groupModal');showToast('🗑 Group deleted');updateUI();
    });
}

// ══════════════════════════════════════════

// GROUPS TAB
// ══════════════════════════════════════════
let _activeGroupsSubTab = 'groups';

function switchGroupsSubTab(tab){
    _activeGroupsSubTab = tab;
    _applyGroupsSubTabStyles();
    if(tab === 'collections') renderCollectionsTab();
}

function _applyGroupsSubTabStyles(){
    const grpBtn = document.getElementById('grpSubGroups');
    const colBtn = document.getElementById('grpSubCollections');
    const grpArea = document.getElementById('groupListArea');
    const colArea = document.getElementById('collectionsArea');
    if(!grpBtn||!colBtn||!grpArea||!colArea) return;
    if(_activeGroupsSubTab === 'groups'){
        grpBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:rgba(243,156,18,0.18);color:#f39c12;';
        colBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:transparent;color:#888;';
        grpArea.style.display='block';
        colArea.style.display='none';
    } else {
        colBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:rgba(52,211,153,0.15);color:#34d399;';
        grpBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:transparent;color:#888;';
        grpArea.style.display='none';
        colArea.style.display='block';
    }
}

// ── Payout storage helpers (shared across devices via Firestore) ─────────────
async function _getPayouts(){
    try{
        const doc = await db.collection('settings').doc('collectionPayouts').get();
        return doc.exists ? (doc.data().payouts||{}) : {};
    }catch(e){ return {}; }
}
async function _savePayouts(payouts){
    try{ await db.collection('settings').doc('collectionPayouts').set({payouts}); }catch(e){}
}

// Called when admin edits a payout cell
async function updateCollectionPayout(el){
    const gid = el.dataset.gid;
    const idx = parseInt(el.dataset.idx);
    const val = el.value;
    const payouts = await _getPayouts();
    const key = gid+'_'+idx;
    payouts[key] = parseFloat(val)||0;
    await _savePayouts(payouts);
    // Update balance cell live
    const balEl = document.getElementById('colbal_'+gid+'_'+idx);
    const recEl = document.getElementById('colrec_'+gid+'_'+idx);
    if(balEl && recEl){
        const received = parseFloat(recEl.dataset.received)||0;
        const payout   = parseFloat(val)||0;
        const balance  = received - payout;
        balEl.textContent = balance !== 0 ? (balance > 0 ? '+' : '') + '₹' + Math.abs(balance).toLocaleString('en-IN') : '—';
        balEl.style.color = balance < 0 ? '#f87171' : balance > 0 ? '#34d399' : 'var(--text-dim)';
    }
}

function toggleCollectionCard(gid){
    const body = document.getElementById('colbody_'+gid);
    const chevron = document.getElementById('colchev_'+gid);
    if(!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if(chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

async function renderCollectionsTab(){
    const colArea = document.getElementById('collectionsArea');
    if(!colArea) return;
    colArea.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:0.85rem;">Loading...</div>';
    const gs = await getCollection('groups');
    const ps = await getCollection('payments');
    const payouts = await _getPayouts();
    if(!gs.length){ colArea.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;">No groups yet.</div>'; return; }

    const todayStr = new Date().toISOString().split('T')[0];
    const html = gs.map((g,gi)=>{
        const allDD = getGroupDueDates(g);
        if(!allDD.length) return '';
        const gPays = ps.filter(p=>p.groupId===g.id);
        const totalMonths = parseInt(g.duration||g.gDuration)||21;
        const fixedAmt = g.amtType!=='variable'&&g.fixedAmt ? parseFloat(g.fixedAmt)||0 : 0;
        const totalReceived = gPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const elapsed = allDD.filter(d=>d<=todayStr).length;
        const totalPayout = allDD.reduce((s,_,idx)=>s+(payouts[g.id+'_'+idx]||0),0);
        const totalBalance = totalReceived - totalPayout;
        
        // Get total unique members in this group
        const uniqueMembers = new Set(gPays.map(p=>p.memberId)).size;
        const totalMembers = uniqueMembers > 0 ? uniqueMembers : 0;

        const rows = allDD.map((dueDate, idx)=>{
            const slotPays = gPays.filter(p=>{
                if(Array.isArray(p.monthSlots)) return p.monthSlots.includes(idx);
                if(p.monthSlot!=null) return p.monthSlot===idx;
                return false;
            });
            const membersPaidThisMonth = new Set(slotPays.map(p=>p.memberId)).size;
            const received  = slotPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
            const payout    = payouts[g.id+'_'+idx]||0;
            const balance   = received - payout;
            const isPast    = dueDate < todayStr;
            const isToday   = dueDate === todayStr;
            const isFuture  = dueDate > todayStr;
            const status    = received===0&&isFuture ? 'upcoming'
                            : received===0&&(isPast||isToday) ? 'overdue'
                            : balance<0 ? 'deficit'
                            : payout>0&&balance===0 ? 'full'
                            : received>0&&payout===0 ? 'received'
                            : received>0 ? 'partial' : 'upcoming';
            const statusBadge = status==='full'     ? '<span style="background:rgba(16,185,129,0.15);color:#34d399;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">✅ Settled</span>'
                              : status==='deficit'  ? '<span style="background:rgba(239,68,68,0.12);color:#f87171;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">⬇ Deficit</span>'
                              : status==='received' ? '<span style="background:rgba(52,211,153,0.12);color:#34d399;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">💰 Received</span>'
                              : status==='partial'  ? '<span style="background:rgba(245,158,11,0.12);color:#f59e0b;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">⚡ Partial</span>'
                              : status==='overdue'  ? '<span style="background:rgba(239,68,68,0.12);color:#f87171;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">🔴 Overdue</span>'
                              : '<span style="background:rgba(255,255,255,0.05);color:#555f7a;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">⏳ Upcoming</span>';
            const rowBg     = status==='full'?'rgba(16,185,129,0.04)':status==='deficit'||status==='overdue'?'rgba(239,68,68,0.04)':status==='received'||status==='partial'?'rgba(245,158,11,0.03)':'';
            const dateColor = isPast||isToday ? '#c7d2fe' : '#555f7a';
            const balColor  = balance<0?'#f87171':balance>0?'#34d399':'var(--text-dim)';
            const balDisp   = balance!==0 ? (balance>0?'+':'')+fmtAmt(balance) : '—';
            const membersPaidBadge = totalMembers > 0 
                ? `<span style="background:rgba(167,139,250,0.15);color:#a78bfa;font-size:0.65rem;font-weight:800;padding:2px 8px;border-radius:5px;">${membersPaidThisMonth}/${totalMembers}</span>`
                : '—';
            return '<tr style="background:'+rowBg+';border-bottom:1px solid rgba(255,255,255,0.04);">'
                +'<td style="text-align:center;color:var(--text-dim);font-size:0.68rem;padding:7px 4px;font-weight:700;">'+(idx+1)+'</td>'
                +'<td style="font-size:0.75rem;color:'+dateColor+';padding:7px 8px;white-space:nowrap;">'+fmtDate(dueDate)+'</td>'
                +'<td id="colrec_'+g.id+'_'+idx+'" data-received="'+received+'" style="font-size:0.78rem;font-weight:700;color:'+(received>0?'#34d399':'var(--text-dim)')+';padding:7px 8px;">'+(received>0?fmtAmt(received):'—')+'</td>'
                +'<td style="text-align:center;padding:7px 6px;">'+membersPaidBadge+'</td>'
                +'<td style="padding:5px 6px;">'
                    +'<input type="number" value="'+(payout||'')+'" placeholder="Rs payout" '
                    +'data-gid="'+g.id+'" data-idx="'+idx+'" '
                    +'onchange="updateCollectionPayout(this)" '
                    +'style="width:90px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:7px;padding:4px 7px;font-size:0.75rem;font-weight:700;outline:none;">'
                +'</td>'
                +'<td id="colbal_'+g.id+'_'+idx+'" style="font-size:0.78rem;font-weight:700;color:'+balColor+';padding:7px 8px;">'+balDisp+'</td>'
                +'<td style="text-align:center;padding:7px 6px;">'+statusBadge+'</td>'
                +'</tr>';
        }).join('');

        const balColor = totalBalance<0?'#f87171':totalBalance>0?'#34d399':'var(--text-dim)';

        const gid = g.id;
        return `<div style="background:#1c253b;border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:10px;">
            <div onclick="toggleCollectionCard('${gid}')" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;user-select:none;">
                <div>
                    <div style="font-size:0.95rem;font-weight:800;color:#f39c12;">&#128194; ${g.name}</div>
                    <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap;">
                        <span style="font-size:0.68rem;color:#34d399;">Rcvd: ${fmtAmt(totalReceived)}</span>
                        <span style="font-size:0.68rem;color:#a5b4fc;">Paid out: ${fmtAmt(totalPayout)}</span>
                        <span style="font-size:0.68rem;color:${balColor};">Bal: ${totalBalance!==0?(totalBalance>0?'+':'')+fmtAmt(Math.abs(totalBalance)):'—'}</span>
                        <span style="font-size:0.68rem;color:var(--text-dim);">${elapsed}/${totalMonths} mo</span>
                    </div>
                </div>
                <span id="colchev_${gid}" style="font-size:0.85rem;color:var(--text-dim);transition:transform .2s;transform:rotate(0deg);">&#9654;</span>
            </div>
            <div id="colbody_${gid}" style="display:none;border-top:1px solid var(--border);">
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;min-width:380px;">
                        <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                            <th style="text-align:center;font-size:0.6rem;color:var(--text-dim);padding:6px 4px;font-weight:500;">#</th>
                            <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:500;">Due Date</th>
                            <th style="font-size:0.6rem;color:#34d399;padding:6px 8px;font-weight:500;">Received</th>
                            <th style="font-size:0.6rem;color:#a78bfa;padding:6px 8px;font-weight:500;text-align:center;">Members Paid</th>
                            <th style="font-size:0.6rem;color:#a5b4fc;padding:6px 8px;font-weight:500;">Chit Payout &#9999;</th>
                            <th style="font-size:0.6rem;color:#f59e0b;padding:6px 8px;font-weight:500;">Balance</th>
                            <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:500;text-align:center;">Status</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }).join('');

    colArea.innerHTML = html || '<div style="text-align:center;color:var(--text-dim);padding:40px;">No data.</div>';
}

async function renderGroupsTab(){
    _applyGroupsSubTabStyles();
    const gs=await getCollection('groups');const ms=await getCollection('members');const ps=await getCollection('payments');
    if(!gs.length){document.getElementById('groupListArea').innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;">No groups yet.</div>';return;}
    document.getElementById('groupListArea').innerHTML=gs.map((g,gIdx)=>{
        const gMs=ms.filter(m=>(m.enrollments||[]).some(e=>e.groupId===g.id)||(m.groupIds||[]).includes(g.id));
        const gPays=ps.filter(p=>p.groupId===g.id);
        const tPaid=gPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const tBal=gPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);
        const picked=gPays.filter(p=>p.chitPicked==='Yes').length;
        const totalMonths=parseInt(g.duration||g.gDuration)||21;
        let elapsed=0;
        if(g.startDate||g.gStart){const _s=new Date(g.startDate||g.gStart),_n=new Date();elapsed=Math.max(0,Math.min(totalMonths,(_n.getFullYear()-_s.getFullYear())*12+(_n.getMonth()-_s.getMonth())+1));}
        const left=Math.max(0,totalMonths-elapsed);const pct=Math.min(100,Math.round(elapsed/totalMonths*100));

        const expandedSlots=[];
        gMs.forEach(m=>{
            const enr=(m.enrollments||[]).find(e=>e.groupId===g.id);
            const qty=enr?parseInt(enr.qty||1):1;
            for(let q=0;q<qty;q++) expandedSlots.push({m,slotNum:q+1,totalSlots:qty});
        });
        const totalSlots=expandedSlots.length;
        const memberRows=expandedSlots.map(({m,slotNum,totalSlots},i)=>{
            const enr=(m.enrollments||[]).find(e=>e.groupId===g.id);
            const memberQty=enr?parseInt(enr.qty||1):1; // per-member chit count
            const allMp=ps.filter(p=>p.memberId===m.id&&p.groupId===g.id);
            const mp=memberQty>1
                ?allMp.filter(p=>{
                    if(enr&&enr.enrollmentId&&p.enrollmentId) return p.enrollmentId===enr.enrollmentId&&(p.slotNum==null||p.slotNum===slotNum);
                    if(p.slotNum!=null) return p.slotNum===slotNum;
                    return slotNum===1;
                })
                :allMp;
            const paid=mp.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
            const rawBal=mp.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);
            // For fixed-amount groups: compute outstanding balance = (overdue unpaid months * fixedAmt) + any recorded balance
            const fixedAmt=g.amtType!=='variable'&&g.fixedAmt?parseFloat(g.fixedAmt):0;
            const allDD=getGroupDueDates(g);
            const paidSlotNums=new Set();
            mp.forEach(p=>{
                if(Array.isArray(p.monthSlots))p.monthSlots.forEach(s=>paidSlotNums.add(s));
                else if(p.monthSlot!=null)paidSlotNums.add(p.monthSlot);
            });
            const todayStr=new Date().toISOString().split('T')[0];
            const unpaidOverdueMonths=fixedAmt>0?allDD.filter((d,idx)=>!paidSlotNums.has(idx)&&d<todayStr).length:0;
            const bal=fixedAmt>0?(rawBal+(unpaidOverdueMonths*fixedAmt)):rawBal;
            const pickedPay=mp.find(p=>p.chitPicked==='Yes');
            const pickedAmt=pickedPay?(parseFloat(pickedPay.chit)||0)*(parseInt(pickedPay.numMonths)||1):0;
            const pickedBy=pickedPay&&pickedPay.chitPickedBy?pickedPay.chitPickedBy:'';
            // Count unique paid slots (not sum of numMonths) to avoid double-counting installments
            const _paidSlots=new Set();
            mp.forEach(p=>{
                if(Array.isArray(p.monthSlots))p.monthSlots.forEach(s=>_paidSlots.add(s));
                else if(p.monthSlot!=null)_paidSlots.add(p.monthSlot);
                else _paidSlots.add('pay_'+p.id);
            });
            const monthsCovered=_paidSlots.size;
            const multiChitBadge=totalSlots>1?`<span style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);color:#fbbf24;border-radius:5px;padding:1px 6px;font-size:0.98rem;font-weight:800;margin-left:4px;">×${totalSlots} chits</span>`:'';
            const slotLabel=totalSlots>1?`<span style="font-size:0.98rem;color:#f59e0b;"> (Chit ${slotNum})</span>`:'';
            return [
                `<tr${pickedPay?' class="chit-picked"':''}>`,
                `<td>${i+1}</td>`,
                `<td><strong>${m.name}</strong>${multiChitBadge}${slotLabel}<br><span style="font-size:0.92rem;color:var(--text-dim);">${m.phone||''}</span></td>`,
                `<td style="color:#34d399;">${fmtAmt(paid)}</td>`,
                `<td style="color:#f59e0b;">${fmtAmt(bal)}</td>`,
                `<td style="color:#a5b4fc;font-size:1.05rem;">${monthsCovered}/${totalMonths}</td>`,
                `<td>${pickedPay
                    ?`<div><span class="chit-yes-badge">✅ Picked</span><div style="color:#34d399;font-weight:800;font-size:0.92rem;margin-top:3px;">${fmtAmt(pickedAmt)}</div>${pickedBy?`<div style="font-size:0.98rem;color:var(--text-dim);">by ${pickedBy}</div>`:''}</div>`
                    :'<span class="chit-no">—</span>'}</td>`,
                `<td><button class="btn-edit-sm" onclick="openEditMember('${m.id}')">✏️</button></td>`,
                `</tr>`
            ].join('');
        }).join('');

        const gStartDisp=fmtDate(g.startDate||g.gStart||'');
        const gDueDayDisp=g.dueDay?`${g.dueDay}${['st','nd','rd'][((g.dueDay%100-11)%10)-1]||'th'} of month`:'—';
        const bodyId=`grpBody_${gIdx}`;
        return`<div class="group-card">
            <div class="group-card-header" onclick="toggleGroupCard('${bodyId}',this)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div style="font-size:1rem;font-weight:800;color:#f39c12;">📂 ${g.name}</div>
                        <div style="font-size:0.98rem;color:var(--text-dim);">${(()=>{const slots=gMs.reduce((s,m)=>{const e=(m.enrollments||[]).find(x=>x.groupId===g.id);return s+(e?parseInt(e.qty||1):1);},0);const uniq=gMs.length;return slots===uniq?slots+' members':slots+' chit slots ('+uniq+' members)';})()}  · ${gPays.length} payment entries</div>
                        <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;">
                            <span style="font-size:0.92rem;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:2px 7px;color:#a5b4fc;">🗓 Started: ${gStartDisp}</span>
                            ${g.dueDay?`<span style="font-size:0.92rem;background:rgba(243,156,18,.12);border:1px solid rgba(243,156,18,.3);border-radius:6px;padding:2px 7px;color:#f39c12;">📅 Due: ${gDueDayDisp}</span>`:''}
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button onclick="generateGroupPDF('${g.id}');event.stopPropagation();" class="btn-pdf" style="padding:5px 10px;font-size:1rem;">📄 PDF</button>
                        <button onclick="openEditGroup('${g.id}');event.stopPropagation();" class="btn-edit-sm">✏️ Edit</button>
                        <span class="chevron-icon closed">▼</span>
                    </div>
                </div>
                <div class="row g-2 mt-2">
                    <div class="col-3"><div class="mini-stat" style="border-top:2px solid #34d399;"><div class="mini-stat-lbl">Collected</div><div class="mini-stat-val" style="color:#34d399;font-size:clamp(0.7rem,2.2vw,0.9rem);">${fmtAmt(tPaid)}</div></div></div>
                    <div class="col-3"><div class="mini-stat" style="border-top:2px solid #f59e0b;"><div class="mini-stat-lbl">Balance</div><div class="mini-stat-val" style="color:#f59e0b;">${fmtAmt(tBal)}</div></div></div>
                    <div class="col-3"><div class="mini-stat" style="border-top:2px solid #a5b4fc;"><div class="mini-stat-lbl">Pending</div><div class="mini-stat-val" style="color:#a5b4fc;">${left}/${totalMonths}</div></div></div>
                    <div class="col-3"><div class="mini-stat" style="border-top:2px solid #34d399;"><div class="mini-stat-lbl">Picked</div><div class="mini-stat-val" style="color:#34d399;">${picked}</div></div></div>
                </div>
                <div class="prog-bar-outer mt-2"><div class="prog-bar-inner" style="width:${pct}%"></div></div>
                <div class="prog-label" style="margin-top:3px;"><span>Month ${elapsed}/${totalMonths}</span><span>${left}/${totalMonths} months pending</span></div>
            </div>
            <div class="group-body" id="${bodyId}" style="max-height:0px;opacity:0;margin-top:0;">

                ${gMs.length?`<div class="table-wrap"><table class="table-custom">
                    <thead><tr><th>#</th><th>Member</th><th>Paid</th><th>Balance</th><th>Months</th><th>Chit Picked Amt</th><th></th></tr></thead>
                    <tbody>${memberRows}</tbody>
                </table></div>`:'<div style="text-align:center;color:var(--text-dim);font-size:1rem;padding:10px;">No members yet</div>'}
            </div>
        </div>`;
    }).join('');
}


function toggleGroupCard(bodyId, header){
    const body=document.getElementById(bodyId);
    const chevron=header.querySelector('.chevron-icon');
    if(!body) return;
    const isOpen=body.style.maxHeight!=='0px'&&!body.classList.contains('collapsed');
    if(isOpen){
        body.style.maxHeight='0px';body.style.opacity='0';body.style.marginTop='0';
        if(chevron){chevron.classList.remove('open');chevron.classList.add('closed');}
    } else {
        body.style.maxHeight='2000px';body.style.opacity='1';body.style.marginTop='12px';
        if(chevron){chevron.classList.remove('closed');chevron.classList.add('open');}
    }
}

function toggleLedgerTable(id, header){
    const el=document.getElementById(id);
    if(!el)return;
    const chevron=header.querySelector('.ledger-chevron');
    const isOpen=el.style.display!=='none';
    el.style.display=isOpen?'none':'block';
    if(chevron)chevron.style.transform=isOpen?'rotate(0deg)':'rotate(90deg)';
}

// ══════════════════════════════════════════
