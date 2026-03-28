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
async function renderGroupsTab(){
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
