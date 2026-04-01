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
    const grpBtn = document.getElementById('grpSubGroups');
    const colBtn = document.getElementById('grpSubCollections');
    const grpArea = document.getElementById('groupListArea');
    const colArea = document.getElementById('collectionsArea');
    if(tab === 'groups'){
        grpBtn.style.background='rgba(243,156,18,0.18)'; grpBtn.style.color='#f39c12';
        colBtn.style.background='transparent'; colBtn.style.color='var(--text-dim)';
        grpArea.style.display='block'; colArea.style.display='none';
    } else {
        colBtn.style.background='rgba(52,211,153,0.15)'; colBtn.style.color='#34d399';
        grpBtn.style.background='transparent'; grpBtn.style.color='var(--text-dim)';
        grpArea.style.display='none'; colArea.style.display='block';
        renderCollectionsTab();
    }
}

async function renderCollectionsTab(){
    const colArea = document.getElementById('collectionsArea');
    if(!colArea) return;
    colArea.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:0.85rem;">Loading...</div>';
    const gs = await getCollection('groups');
    const ps = await getCollection('payments');
    if(!gs.length){ colArea.innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px;">No groups yet.</div>'; return; }

    const todayStr = new Date().toISOString().split('T')[0];
    const html = gs.map((g,gi)=>{
        const allDD = getGroupDueDates(g);
        if(!allDD.length) return '';
        const gPays = ps.filter(p=>p.groupId===g.id);
        const totalMonths = parseInt(g.duration||g.gDuration)||21;
        const fixedAmt = g.amtType!=='variable'&&g.fixedAmt ? parseFloat(g.fixedAmt)||0 : 0;

        // Total received & balance across all months
        const totalReceived = gPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const elapsed = allDD.filter(d=>d<=todayStr).length;

        // Build month rows
        const rows = allDD.map((dueDate, idx)=>{
            const slotPays = gPays.filter(p=>{
                if(Array.isArray(p.monthSlots)) return p.monthSlots.includes(idx);
                if(p.monthSlot!=null) return p.monthSlot===idx;
                return false;
            });
            const received = slotPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
            const isPast   = dueDate < todayStr;
            const isToday  = dueDate === todayStr;
            const isFuture = dueDate > todayStr;
            const balance  = fixedAmt>0 ? Math.max(0, fixedAmt - received) : 0;
            const status   = received===0&&isFuture ? 'upcoming'
                           : received===0&&(isPast||isToday) ? 'overdue'
                           : fixedAmt>0&&balance>0 ? 'partial'
                           : received>0 ? 'full' : 'upcoming';
            const statusBadge = status==='full'    ? '<span style="background:rgba(16,185,129,0.15);color:#34d399;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">✅ Full</span>'
                              : status==='partial' ? '<span style="background:rgba(245,158,11,0.12);color:#f59e0b;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">⚡ Partial</span>'
                              : status==='overdue' ? '<span style="background:rgba(239,68,68,0.12);color:#f87171;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">🔴 Overdue</span>'
                              : '<span style="background:rgba(255,255,255,0.05);color:#555f7a;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:99px;">⏳ Upcoming</span>';
            const rowBg = status==='full'?'rgba(16,185,129,0.04)':status==='partial'?'rgba(245,158,11,0.04)':status==='overdue'?'rgba(239,68,68,0.04)':'';
            const dateColor = isPast||isToday ? '#c7d2fe' : '#555f7a';
            return `<tr style="background:${rowBg};border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="text-align:center;color:var(--text-dim);font-size:0.68rem;padding:7px 4px;font-weight:700;">${idx+1}</td>
                <td style="font-size:0.75rem;color:${dateColor};padding:7px 8px;white-space:nowrap;">${fmtDate(dueDate)}</td>
                <td style="font-size:0.78rem;font-weight:700;color:${received>0?'#34d399':'var(--text-dim)'};padding:7px 8px;">${received>0?fmtAmt(received):'—'}</td>
                <td style="font-size:0.78rem;font-weight:700;color:${balance>0?'#f87171':'var(--text-dim)'};padding:7px 8px;">${fixedAmt>0?(balance>0?fmtAmt(balance):'—'):'—'}</td>
                <td style="text-align:center;padding:7px 6px;">${statusBadge}</td>
            </tr>`;
        }).join('');

        const totalBalance = fixedAmt>0 ? Math.max(0, fixedAmt*elapsed - totalReceived) : 0;

        return `<div style="background:#1c253b;border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:14px;">
            <div style="padding:12px 16px;border-bottom:1px solid var(--border);">
                <div style="font-size:0.95rem;font-weight:800;color:#f39c12;margin-bottom:6px;">📂 ${g.name}</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                    <div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:9px;padding:8px;text-align:center;">
                        <div style="font-size:0.88rem;font-weight:800;color:#34d399;">${fmtAmt(totalReceived)}</div>
                        <div style="font-size:0.58rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Total Received</div>
                    </div>
                    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:9px;padding:8px;text-align:center;">
                        <div style="font-size:0.88rem;font-weight:800;color:#f87171;">${fixedAmt>0?fmtAmt(totalBalance):'—'}</div>
                        <div style="font-size:0.58rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Total Balance</div>
                    </div>
                    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:9px;padding:8px;text-align:center;">
                        <div style="font-size:0.88rem;font-weight:800;color:#f59e0b;">${elapsed}/${totalMonths}</div>
                        <div style="font-size:0.58rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Months Elapsed</div>
                    </div>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;min-width:320px;">
                    <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                        <th style="text-align:center;font-size:0.6rem;color:var(--text-dim);padding:6px 4px;font-weight:500;">#</th>
                        <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:500;">Due Date</th>
                        <th style="font-size:0.6rem;color:#34d399;padding:6px 8px;font-weight:500;">Received</th>
                        <th style="font-size:0.6rem;color:#f87171;padding:6px 8px;font-weight:500;">Balance</th>
                        <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:500;text-align:center;">Status</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');

    colArea.innerHTML = html || '<div style="text-align:center;color:var(--text-dim);padding:40px;">No data.</div>';
}

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

                <!-- ── Monthly Collection Summary ── -->
                <div style="border-bottom:1px solid var(--border);">
                    <div onclick="toggleMonthlyCollection('mc_${gIdx}',this)" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;user-select:none;background:rgba(52,211,153,0.05);">
                        <div>
                            <span style="font-size:0.75rem;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:.5px;">📅 Monthly Collection</span>
                            <span style="font-size:0.65rem;color:var(--text-dim);margin-left:8px;">${tPaid>0?fmtAmt(tPaid)+' collected':''}</span>
                        </div>
                        <span style="font-size:0.8rem;color:#34d399;transition:transform .25s;transform:rotate(90deg);" class="mc-chevron">&#9654;</span>
                    </div>
                    <div id="mc_${gIdx}" style="display:block;overflow-x:auto;padding:0 16px 12px;">
                        ${(()=>{
                            const allDD = getGroupDueDates(g);
                            if(!allDD.length) return '<div style="color:var(--text-dim);font-size:0.78rem;padding:8px;">No due dates configured.</div>';
                            const todayStr = new Date().toISOString().split('T')[0];
                            const totalSlotCount = gMs.reduce((s,m)=>{const e=(m.enrollments||[]).find(x=>x.groupId===g.id);return s+(e?parseInt(e.qty||1):1);},0);
                            const fixedAmt = g.amtType!=='variable'&&g.fixedAmt ? parseFloat(g.fixedAmt)||0 : 0;
                            const rows = allDD.map((dueDate, idx)=>{
                                // Match payments to this month slot across ALL members of this group
                                // Priority: monthSlots array > monthSlot field > date-based fallback
                                const slotPays = gPays.filter(p=>{
                                    if(Array.isArray(p.monthSlots)&&p.monthSlots.length) return p.monthSlots.includes(idx);
                                    if(p.monthSlot!=null) return p.monthSlot===idx;
                                    // fallback: derive slot from payment date
                                    return getMonthSlot(allDD, p.date)===idx;
                                });

                                // Collected = sum of all payments toward this month from all members
                                const collected = slotPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);

                                // Expected = fixedAmt × total chit slots in this group
                                const expected = fixedAmt>0 ? fixedAmt*totalSlotCount : 0;
                                const isPast = dueDate < todayStr;
                                const isFuture = dueDate > todayStr;
                                const isToday = dueDate === todayStr;
                                const pending = expected>0 ? Math.max(0, expected-collected) : 0;

                                // Who paid vs who hasn't for this month
                                const paidMemberIds = new Set(slotPays.map(p=>p.memberId));
                                const paidMembers = [...paidMemberIds].map(mid=>{
                                    const mem=gMs.find(m=>m.id===mid);
                                    const mp=slotPays.filter(p=>p.memberId===mid);
                                    const amt=mp.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
                                    return mem ? \`\${mem.name} (\${fmtAmt(amt)})\` : '?';
                                });
                                const unpaidMembers = (isPast||isToday) ? gMs.filter(m=>!paidMemberIds.has(m.id)).map(m=>m.name) : [];
                                const paidCount = paidMemberIds.size;
                                const unpaidCount = gMs.length - paidCount;

                                const statusLabel = collected===0&&isFuture ? '⏳ Upcoming'
                                    : collected===0&&isPast ? '🔴 No payment'
                                    : pending>0 ? \`⚡ \${unpaidCount} pending\`
                                    : '✅ Complete';
                                const statusColor = collected===0&&isPast ? '#f87171' : pending>0 ? '#f59e0b' : collected>0 ? '#34d399' : 'var(--text-dim)';
                                const rowBg = collected===0&&isPast ? 'rgba(239,68,68,0.05)' : pending>0&&isPast ? 'rgba(245,158,11,0.05)' : collected>0&&pending===0 ? 'rgba(16,185,129,0.04)' : '';

                                const paidList = paidMembers.length
                                    ? \`<div style="font-size:0.62rem;color:#34d399;margin-top:2px;line-height:1.5;">✅ \${paidMembers.join(' · ')}</div>\`
                                    : \`<span style="font-size:0.62rem;color:var(--text-dim);">No payments yet</span>\`;
                                const unpaidList = unpaidMembers.length
                                    ? \`<div style="font-size:0.62rem;color:#f87171;margin-top:2px;line-height:1.5;">⏳ \${unpaidMembers.join(' · ')}</div>\`
                                    : '';

                                return \`<tr style="background:\${rowBg};border-bottom:1px solid rgba(255,255,255,0.05);">
                                    <td style="text-align:center;color:var(--text-dim);font-size:0.68rem;padding:6px 4px;font-weight:700;">\${idx+1}</td>
                                    <td style="font-size:0.72rem;color:\${isPast?'#c7d2fe':isToday?'#f39c12':'var(--text-dim)'};white-space:nowrap;padding:6px 8px;font-weight:\${isToday?'800':'400'};">\${fmtDate(dueDate)}\${isToday?' 📌':''}</td>
                                    <td style="font-size:0.82rem;font-weight:800;color:\${collected>0?'#34d399':'var(--text-dim)'};padding:6px 8px;">\${collected>0?fmtAmt(collected):'—'}</td>
                                    \${expected>0?
                                        \`<td style="font-size:0.72rem;color:var(--text-dim);padding:6px 8px;">\${fmtAmt(expected)}</td>
                                         <td style="font-size:0.78rem;font-weight:700;color:\${pending>0?'#f87171':'#34d399'};padding:6px 8px;">\${pending>0?fmtAmt(pending):'—'}</td>\`
                                        :'<td></td><td></td>'}
                                    <td style="font-size:0.68rem;padding:6px 8px;min-width:140px;">\${paidList}\${unpaidList}</td>
                                    <td style="font-size:0.68rem;font-weight:700;color:\${statusColor};padding:6px 8px;white-space:nowrap;">\${statusLabel}</td>
                                </tr>\`;
                            }).join('');
                            return \`<table style="width:100%;border-collapse:collapse;">
                                <thead><tr style="border-bottom:2px solid var(--border);background:rgba(255,255,255,0.02);">
                                    <th style="text-align:center;font-size:0.6rem;color:var(--text-dim);padding:6px 4px;font-weight:700;">Mo.</th>
                                    <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:700;">Due Date</th>
                                    <th style="font-size:0.6rem;color:#34d399;padding:6px 8px;font-weight:700;">Collected</th>
                                    \${fixedAmt>0?'<th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:700;">Expected</th><th style="font-size:0.6rem;color:#f87171;padding:6px 8px;font-weight:700;">Pending</th>':'<th></th><th></th>'}
                                    <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:700;">Paid by / Yet to pay</th>
                                    <th style="font-size:0.6rem;color:var(--text-dim);padding:6px 8px;font-weight:700;">Status</th>
                                </tr></thead>
                                <tbody>\${rows}</tbody>
                            </table>\`;
                        })()}
                    </div>
                </div>

                ${gMs.length?`<div class="table-wrap"><table class="table-custom">
                    <thead><tr><th>#</th><th>Member</th><th>Paid</th><th>Balance</th><th>Months</th><th>Chit Picked Amt</th><th></th></tr></thead>
                    <tbody>${memberRows}</tbody>
                </table></div>`:'<div style="text-align:center;color:var(--text-dim);font-size:1rem;padding:10px;">No members yet</div>'}
            </div>
        </div>`;
    }).join('');
}

function toggleMonthlyCollection(id, header){
    const el = document.getElementById(id);
    if(!el) return;
    const chevron = header.querySelector('.mc-chevron');
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : 'block';
    if(chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
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
