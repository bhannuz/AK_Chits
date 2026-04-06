// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER - SIMPLIFIED (EACH PAYMENT AS ROW)
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
        enrollments=(m.groupIds||[]).map(gid=>({enrollmentId:'',groupId:gid,label:'',qty:1}));
    const memberGroups=gs.filter(g=>m.groupIds&&m.groupIds.includes(g.id));
    const isMember = CURRENT_USER && CURRENT_USER.role==='member';
    const today = new Date().toISOString().split('T')[0];

    function buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, sectionId){
        const totalMonths  = parseInt(grp.duration||grp.gDuration)||21;
        const lastPay    = slotPays.length ? slotPays[slotPays.length-1] : null;
        const chitAmount = lastPay ? (parseFloat(lastPay.chit)||0) : 0;

        // Calculate fully paid months
        const _perSlotTotals = {};
        slotPays.forEach(p=>{
            const slots=Array.isArray(p.monthSlots)?p.monthSlots:(p.monthSlot!=null?[p.monthSlot]:[]);
            slots.forEach(s=>{ _perSlotTotals[s]=(_perSlotTotals[s]||0)+(parseFloat(p.paid)||0); });
        });
        const fullyPaidSlotSet = new Set(Object.keys(_perSlotTotals).filter(s=>chitAmount<=0||_perSlotTotals[s]>=chitAmount).map(Number));
        const monthsDone   = fullyPaidSlotSet.size;
        const pct          = Math.min(100,Math.round(monthsDone/totalMonths*100));
        const tPaid        = slotPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const tBal         = slotPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);

        // Build table rows - each payment is its own row
        const mergedRows = slotPays.map((pay) => {
            let slotIndex = -1;
            if(pay.monthSlot != null) {
                slotIndex = pay.monthSlot;
            } else if(Array.isArray(pay.monthSlots) && pay.monthSlots.length > 0) {
                slotIndex = pay.monthSlots[0];
            } else {
                slotIndex = getMonthSlot(allDueDates, pay.date);
            }
            
            if(slotIndex < 0 || slotIndex >= allDueDates.length) return '';
            
            const dueDate = allDueDates[slotIndex];
            const iPaid = parseFloat(pay.paid)||0;
            const iBal = parseFloat(pay.balance)||0;
            const iMode = pay.paidBy||'—';
            const iCp = pay.chitPicked==='Yes';
            const isPaid = iPaid > 0;
            
            const rowBg = isPaid ? 'rgba(16,185,129,0.07)' : '';
            const rowBL = iCp ? 'border-left:3px solid #10b981;' : '';
            
            let statusBadge = isPaid 
                ? `<span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">✅ Paid</span>`
                : `<span style="background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⏳ Pending</span>`;
            
            const editCell = !isMember ? `<button class="btn-edit-sm" onclick="openEditPayment('${pay.id}')" style="font-size:0.62rem;padding:3px 7px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:4px;cursor:pointer;">Edit</button>` : '';
            
            const chitPickedCell = iCp
                ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:1px 6px;font-size:0.62rem;font-weight:800;">🏆 Picked</span>${pay.chitPickedBy?`<div style="font-size:0.6rem;color:var(--text-dim);margin-top:1px;">${pay.chitPickedBy}</div>`:''}`
                : `<span style="color:var(--text-dim);">—</span>`;
            
            const dateColor = isPaid ? '#a5b4fc' : '#c7d2fe';
            
            return `<tr style="background:${rowBg};${rowBL}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${slotIndex+1}</td>
                    <td style="color:${dateColor};font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount>0?fmtAmt(chitAmount):'—'}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${fmtDate(pay.date)}</td>
                    <td style="vertical-align:middle;color:${isPaid?'#34d399':'#fbbf24'};font-weight:700;">${fmtAmt(iPaid)}</td>
                    <td style="vertical-align:middle;color:#f59e0b;">${iBal>0?fmtAmt(iBal):'—'}</td>
                    <td style="vertical-align:middle;">${statusBadge}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${iMode}</td>
                    <td style="vertical-align:middle;">${chitPickedCell}</td>
                    <td style="vertical-align:middle;">${editCell}</td>
                </tr>`;
        }).filter(r => r !== '').join('');

        const overdueCnt = allDueDates.filter((d,i)=>!slotPays.find(p=>{
            if(Array.isArray(p.monthSlots)) return p.monthSlots.includes(i);
            if(p.monthSlot!=null) return p.monthSlot===i;
            return getMonthSlot(allDueDates, p.date)===i;
        })&&d<today).length;

        const chitSlotBadge = totalSlots>1
            ? `<span style="background:rgba(245,158,11,0.25);border:1px solid rgba(245,158,11,0.5);color:#fbbf24;border-radius:5px;padding:2px 9px;font-size:0.75rem;font-weight:800;margin-left:6px;">Chit ${slotNum}</span>`
            : '';
        const labelBadge = enr.label
            ? `<span style="background:rgba(243,156,18,.18);border:1px solid rgba(243,156,18,.35);border-radius:5px;padding:1px 7px;font-size:0.72rem;color:#f39c12;margin-left:6px;">${enr.label}</span>` : '';

        return `<div style="margin-bottom:16px;page-break-inside:avoid;">
            <div style="background:#1c253b;border-radius:12px 12px 0 0;padding:12px 16px;border:1px solid var(--border);border-bottom:none;page-break-inside:avoid;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                    <div>
                        <div style="font-size:1rem;font-weight:900;color:#f39c12;margin-bottom:6px;">
                            Group: ${grp.name}${labelBadge}${chitSlotBadge}
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#a5b4fc;">📅 Started: ${fmtDate(grp.startDate||grp.gStart||'')}</span>
                        </div>
                    </div>
                </div>
                <div style="margin-top:10px;">
                    <div style="background:#252f48;border-radius:5px;height:6px;overflow:hidden;">
                        <div style="height:100%;border-radius:5px;background:linear-gradient(90deg,#f39c12,#f57c00);width:${pct}%;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;flex-wrap:wrap;gap:4px;">
                        <span style="font-size:0.65rem;color:var(--text-dim);">Month ${monthsDone}/${totalMonths} paid${overdueCnt>0?` · <span style="color:#f87171;">${overdueCnt} overdue</span>`:''}</span>
                    </div>
                </div>
            </div>

            <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:0 0 12px 12px;overflow:hidden;page-break-inside:avoid;">
                <div onclick="toggleLedgerTable('${sectionId}',this)" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;user-select:none;border-bottom:1px solid var(--border);page-break-inside:avoid;">
                    <span style="font-size:0.78rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:.5px;">📋 Schedule & Payments (${totalMonths} months)</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:0.78rem;color:#34d399;font-weight:700;">${fmtAmt(tPaid)}</span>
                        ${tBal>0?`<span style="font-size:0.78rem;color:#f59e0b;font-weight:700;">${fmtAmt(tBal)} bal</span>`:''}
                        ${overdueCnt>0?`<span style="font-size:0.72rem;color:#f87171;font-weight:700;">${overdueCnt} overdue</span>`:''}
                        <span style="font-size:0.9rem;color:var(--text-dim);transition:transform .25s;" class="ledger-chevron">&#9654;</span>
                    </div>
                </div>
                <div id="${sectionId}" style="display:block;page-break-inside:avoid;">
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;page-break-inside:avoid;">
                        <table class="table-custom" style="table-layout:auto !important;width:100% !important;">
                            <thead><tr style="page-break-inside:avoid;">
                                <th style="text-align:center;">#</th>
                                <th>Due Date</th>
                                <th>Chit/Mo</th>
                                <th>Pay Date</th>
                                <th>Paid</th>
                                <th>Balance</th>
                                <th>Status</th>
                                <th>Mode</th>
                                <th>Chit Picked</th>
                                <th></th>
                            </tr></thead>
                            <tbody style="page-break-inside:avoid;">
                                ${mergedRows}
                                <tr style="font-weight:800;background:rgba(255,255,255,.04);page-break-inside:avoid;">
                                    <td colspan="4" style="color:var(--text-dim);">Total</td>
                                    <td style="color:#34d399;">${fmtAmt(tPaid)}</td>
                                    <td style="color:#f59e0b;">${tBal>0?fmtAmt(tBal):'—'}</td>
                                    <td colspan="4"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="padding:6px 14px 8px;font-size:0.65rem;color:var(--text-dim);border-top:1px solid var(--border);page-break-inside:avoid;">
                        ✅ Paid &nbsp;|&nbsp; ⚡ Partial &nbsp;|&nbsp; 🔴 Overdue &nbsp;|&nbsp; ⏳ Pending
                    </div>
                </div>
            </div>
        </div>`;
    }

    const groupSections = enrollments.map((enr,idx)=>{
        const grp=gs.find(g=>g.id===enr.groupId); if(!grp) return '';
        const ms_for_group=m.groupIds&&m.groupIds.includes(grp.id)?[m]:[];
        const slotPays=ps.filter(p=>p.memberId===mid&&p.groupId===grp.id);
        const allDueDates=buildDueDateList(grp);
        const id=`ledger_${idx}`;
        return buildSection(grp, enr, slotPays, (enr.slotNum||1), (enr.qty||1), allDueDates, id);
    }).join('');

    const ledgerHtml = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-top:6px;">
            <div style="width:46px;height:46px;border-radius:12px;background:rgba(243,156,18,.15);border:2px solid rgba(243,156,18,.4);color:#f39c12;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900;flex-shrink:0;">${ini(m.name)}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:1rem;font-weight:900;">${m.name}</div>
                <div style="font-size:0.72rem;color:var(--text-dim);margin-top:1px;">${mPays.length} payment${mPays.length!==1?'s':''} · ${memberGroups.length} group${memberGroups.length!==1?'s':''}</div>
            </div>
            <div style="display:flex;gap:6px;">
                ${!isMember?`<button class="btn-edit-sm" onclick="openEditMember('${mid}')">Edit</button>`:''} 
                <button onclick="printMemberStatement('${mid}')" style="background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;padding:8px 14px;font-size:0.8rem;font-weight:800;border:none;border-radius:9px;cursor:pointer;">Print</button>
            </div>
        </div>
        ${groupSections||'<div style="text-align:center;color:var(--text-dim);padding:30px;">No group enrollments found</div>'}
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

function toggleLedgerTable(id, el){
    const table = document.getElementById(id);
    if(table){
        const isHidden = table.style.display === 'none';
        table.style.display = isHidden ? 'block' : 'none';
        const chevron = el.querySelector('.ledger-chevron');
        if(chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
}

function getMonthSlot(dueDates, payDate){
    if(!payDate) return -1;
    const pDate = new Date(payDate+'T00:00:00');
    for(let i=0; i<dueDates.length; i++){
        const dDate = new Date(dueDates[i]+'T00:00:00');
        const dNext = i<dueDates.length-1 ? new Date(dueDates[i+1]+'T00:00:00') : new Date(dDate.getFullYear(),dDate.getMonth()+2,1);
        if(pDate >= dDate && pDate < dNext) return i;
    }
    return -1;
}

function buildDueDateList(grp){
    const start = grp.startDate||grp.gStart||new Date().toISOString().split('T')[0];
    const dur = parseInt(grp.duration||grp.gDuration||21);
    const dueDay = parseInt(grp.dueDay||5);
    const dates = [];
    let d = new Date(start+'T00:00:00');
    for(let i=0; i<dur; i++){
        dates.push(d.toISOString().split('T')[0]);
        d.setMonth(d.getMonth()+1);
        d.setDate(dueDay);
    }
    return dates;
}
