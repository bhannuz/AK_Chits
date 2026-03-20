// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER
// Edit only this file when changing loadMemberLedger — member payment display
// ═══════════════════════════════════════════════════════════

async function loadMemberLedger(){
    const mid = CURRENT_USER && CURRENT_USER.role === 'member'
        ? CURRENT_USER.memberId
        : document.getElementById('summaryView').value;
    if(!mid) return;

    const ms=await getCollection('members');
    const gs=await getCollection('groups');
    const ps=await getCollection('payments');
    const m=ms.find(x=>x.id===mid); if(!m) return;
    const mPays=ps.filter(p=>p.memberId===mid);
    const totalPaid=mPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
    const totalBal =mPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);
    let enrollments = m.enrollments;
    if(!enrollments||!enrollments.length)
        enrollments=(m.groupIds||[]).map(gid=>({enrollmentId:'',groupId:gid,label:''}));
    const memberGroups=gs.filter(g=>m.groupIds&&m.groupIds.includes(g.id));
    const isMember = CURRENT_USER && CURRENT_USER.role==='member';

    // ── Build one section per chit slot ─────────────────────────────────────
    // For qty=1: one section per enrollment
    // For qty=2+: one section PER SLOT (Chit 1, Chit 2, ...) each with own progress
    function buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, sectionId){
        const totalMonths=parseInt(grp.duration||grp.gDuration)||21;
        const monthsDone=slotPays.reduce((s,p)=>s+(p.numMonths||1),0);
        const left=Math.max(0,totalMonths-monthsDone);
        const pct=Math.min(100,Math.round(monthsDone/totalMonths*100));
        const tPaid=slotPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const tBal =slotPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);
        const multiMonthCount=slotPays.filter(p=>p.numMonths&&p.numMonths>1).length;
        const chitPickedPay=slotPays.find(p=>p.chitPicked==='Yes');
        const gStartDisplay=fmtDate(grp.startDate||grp.gStart||'');
        const gDueDayOrd=grp.dueDay?`${grp.dueDay}${['st','nd','rd'][((grp.dueDay%100-11)%10)-1]||'th'}`:'--';

        // Title: show chit slot badge when qty > 1
        const chitSlotBadge = totalSlots>1
            ? `<span style="background:rgba(245,158,11,0.25);border:1px solid rgba(245,158,11,0.5);color:#fbbf24;border-radius:5px;padding:2px 9px;font-size:0.75rem;font-weight:800;margin-left:6px;">Chit ${slotNum}</span>`
            : '';
        const labelBadge = enr.label
            ? `<span style="background:rgba(243,156,18,.18);border:1px solid rgba(243,156,18,.35);border-radius:5px;padding:1px 7px;font-size:0.72rem;color:#f39c12;margin-left:6px;">${enr.label}</span>` : '';

        // Payment rows for this slot
        const tableRows = slotPays.map((p,idx)=>{
            const cp=p.chitPicked==='Yes';
            const isMulti=p.numMonths&&p.numMonths>1;
            const months=p.monthSlots||[];
            let monthLabel='--';
            if(isMulti&&months.length>0){
                const f=months[0]>=0&&allDueDates[months[0]]?fmtDate(allDueDates[months[0]]):'--';
                const l=months[months.length-1]>=0&&allDueDates[months[months.length-1]]?fmtDate(allDueDates[months[months.length-1]]):'--';
                monthLabel=`${f} to ${l}`;
            } else {
                const si=p.monthSlot!==undefined?p.monthSlot:getMonthSlot(allDueDates,p.date);
                monthLabel=si>=0&&allDueDates[si]?fmtDate(allDueDates[si]):'--';
            }
            const rowBg=cp?'rgba(16,185,129,0.08)':isMulti?'rgba(99,102,241,0.07)':'';
            const rowBL=cp?'border-left:3px solid #10b981;':isMulti?'border-left:3px solid #818cf8;':'';
            return `<tr style="background:${rowBg};${rowBL}">
                <td style="color:var(--text-dim);font-weight:700;text-align:center;">${idx+1}</td>
                <td style="color:#a5b4fc;font-weight:700;">${monthLabel}${isMulti?`<br><span style="display:inline-flex;align-items:center;gap:3px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:4px;padding:1px 5px;font-size:0.6rem;font-weight:800;">x${p.numMonths} months</span>`:''}</td>
                <td>${fmtDate(p.date)}</td>
                <td style="color:#c4b5fd;">${fmtAmt(p.chit)}${isMulti?`<span style="font-size:0.6rem;color:var(--text-dim);display:block;">/mo x ${p.numMonths}</span>`:''}</td>
                <td style="color:#34d399;font-weight:700;">${fmtAmt(p.paid)}</td>
                <td style="color:#f59e0b;">${fmtAmt(p.balance)}</td>
                <td style="color:var(--text-dim);font-size:0.72rem;">${p.paidBy||'--'}</td>
                <td>${cp?`<span style="display:inline-block;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:2px 7px;font-size:0.65rem;font-weight:800;">Picked</span>${p.chitPickedBy?`<div style="font-size:0.6rem;color:var(--text-dim);margin-top:2px;">by ${p.chitPickedBy}</div>`:''}` :'<span style="color:var(--text-dim);">--</span>'}</td>
                ${!isMember?`<td><button class="btn-edit-sm" onclick="openEditPayment('${p.id}')" style="font-size:0.65rem;padding:3px 8px;">Edit</button></td>`:'<td></td>'}
            </tr>`;
        }).join('');

        return `<div style="margin-bottom:16px;">
            <div style="background:#1c253b;border-radius:12px 12px 0 0;padding:12px 16px;border:1px solid var(--border);border-bottom:none;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                    <div>
                        <div style="font-size:1rem;font-weight:900;color:#f39c12;margin-bottom:6px;">
                            Group: ${grp.name}${labelBadge}${chitSlotBadge}
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#a5b4fc;">Started: ${gStartDisplay}</span>
                            ${grp.dueDay?`<span style="background:rgba(243,156,18,.12);border:1px solid rgba(243,156,18,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#f39c12;">Due: ${gDueDayOrd}</span>`:''}
                            ${chitPickedPay?`<span style="background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#34d399;">Chit Picked</span>`:''}
                            ${multiMonthCount>0?`<span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#a5b4fc;">${multiMonthCount} bulk</span>`:''}
                        </div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:1.1rem;font-weight:900;color:#a5b4fc;">${left}<span style="font-size:0.72rem;color:var(--text-dim);">/${totalMonths}</span></div>
                        <div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;">months pending</div>
                    </div>
                </div>
                <div style="margin-top:10px;">
                    <div style="background:#252f48;border-radius:5px;height:6px;overflow:hidden;">
                        <div style="height:100%;border-radius:5px;background:linear-gradient(90deg,#f39c12,#f57c00);width:${pct}%;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:0.65rem;color:var(--text-dim);">
                        <span>Month ${monthsDone}/${totalMonths}</span><span>${left} months pending</span>
                    </div>
                </div>
            </div>
            <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:0 0 12px 12px;overflow:hidden;">
                <div onclick="toggleLedgerTable('${sectionId}',this)" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;user-select:none;border-bottom:1px solid var(--border);">
                    <span style="font-size:0.78rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Payment History (${slotPays.length} entries)</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:0.78rem;color:#34d399;font-weight:700;">${fmtAmt(tPaid)} paid</span>
                        ${tBal>0?`<span style="font-size:0.78rem;color:#f59e0b;font-weight:700;">${fmtAmt(tBal)} bal</span>`:''}
                        <span style="font-size:0.9rem;color:var(--text-dim);transition:transform .25s;" class="ledger-chevron">&#9654;</span>
                    </div>
                </div>
                <div id="${sectionId}" style="display:none;">
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                        <table class="table-custom">
                            <thead><tr>
                                <th style="text-align:center;">#</th>
                                <th>Month Covered</th>
                                <th>Pay Date</th>
                                <th>Chit/Mo</th>
                                <th>Total Paid</th>
                                <th>Balance</th>
                                <th>Mode</th>
                                <th>Chit Picked</th>
                                <th></th>
                            </tr></thead>
                            <tbody>
                                ${tableRows||`<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:20px;">No payments yet</td></tr>`}
                                ${slotPays.length?`<tr style="font-weight:800;background:rgba(255,255,255,.04);">
                                    <td colspan="4" style="color:var(--text-dim);">Total</td>
                                    <td style="color:#34d399;">${fmtAmt(tPaid)}</td>
                                    <td style="color:#f59e0b;">${fmtAmt(tBal)}</td>
                                    <td colspan="3"></td>
                                </tr>`:''}
                            </tbody>
                        </table>
                    </div>
                    ${multiMonthCount>0?`<div style="padding:8px 14px 10px;font-size:0.68rem;color:#a5b4fc;border-top:1px solid var(--border);">Purple rows = multi-month bulk payments</div>`:''}
                </div>
            </div>
        </div>`;
    }

    // ── Generate sections — one per chit slot ────────────────────────────────
    let sectionIdx = 0;
    const groupSections = enrollments.map((enr)=>{
        const grp=gs.find(g=>g.id===enr.groupId); if(!grp) return '';
        const qty=parseInt(enr.qty||1);
        const allDueDates=getGroupDueDates(grp);

        // Get all payments for this enrollment
        const enrPays=mPays.filter(p=>{
            if(enr.enrollmentId&&p.enrollmentId) return p.enrollmentId===enr.enrollmentId;
            return p.groupId===enr.groupId;
        }).sort((a,b)=>(a.date||'').localeCompare(b.date||''));

        if(qty<=1){
            // Single chit — one section, no slot filtering needed
            const id=`ledger_${sectionIdx++}`;
            return buildSection(grp, enr, enrPays, 1, 1, allDueDates, id);
        } else {
            // Multiple chits — render ONE section per slot
            return Array.from({length:qty},(_,i)=>{
                const slotNum=i+1;
                // Filter payments belonging to this specific slot
                const slotPays=enrPays.filter(p=>{
                    // If payment has slotNum recorded, use it
                    if(p.slotNum!=null) return p.slotNum===slotNum;
                    // Legacy: no slotNum — assign to slot 1
                    return slotNum===1;
                });
                const id=`ledger_${sectionIdx++}`;
                return buildSection(grp, enr, slotPays, slotNum, qty, allDueDates, id);
            }).join('');
        }
    }).join('');

    const ledgerHtml = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-top:6px;">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(243,156,18,.15);border:2px solid rgba(243,156,18,.4);color:#f39c12;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900;flex-shrink:0;">${ini(m.name)}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:1rem;font-weight:900;">${m.name}</div>
                <div style="font-size:0.72rem;color:var(--text-dim);margin-top:1px;">${mPays.length} payment${mPays.length!==1?'s':''} . ${memberGroups.length} group${memberGroups.length!==1?'s':''}</div>
            </div>
            <div style="display:flex;gap:6px;">
                ${!isMember?`<button class="btn-edit-sm" onclick="openEditMember('${mid}')">Edit</button>`:''}
                <button onclick="printMemberStatement('${mid}')" style="background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;padding:8px 14px;font-size:0.8rem;font-weight:800;border:none;border-radius:9px;cursor:pointer;">Print</button>
            </div>
        </div>
        ${groupSections||'<div style="text-align:center;color:var(--text-dim);padding:30px;">No payments yet</div>'}
    `;

    if(isMember){
        document.getElementById('memberLedgerData').innerHTML = ledgerHtml;
        document.getElementById('mhGroups').textContent = memberGroups.length;
        document.getElementById('mhTotalPaid').textContent = fmtAmt(totalPaid);
        document.getElementById('mhBalance').textContent = fmtAmt(totalBal);
    } else {
        document.getElementById('ledgerData').innerHTML = ledgerHtml;
    }
}

function toggleLedgerTable(id, header){
    const el=document.getElementById(id);
    if(!el) return;
    const chevron=header.querySelector('.ledger-chevron');
    const isOpen=el.style.display!=='none';
    el.style.display=isOpen?'none':'block';
    if(chevron) chevron.style.transform=isOpen?'rotate(0deg)':'rotate(90deg)';
}
