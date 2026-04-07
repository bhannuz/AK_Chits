// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER - WITH DIAGNOSTIC LOGGING
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
        
        // DIAGNOSTIC: Log ALL group fields to find correct field name
        console.log('═══════════════════════════════════════════════════');
        console.log('📊 GROUP DIAGNOSTIC LOG');
        console.log('═══════════════════════════════════════════════════');
        console.log('Group Name:', grp.name);
        console.log('Group ID:', grp.id);
        console.log('Full Group Object:', JSON.stringify(grp, null, 2));
        console.log('═══════════════════════════════════════════════════');
        
        // List ALL field values that might be the fixed amount
        console.log('Checking all potential amount fields:');
        console.log('grp.fixedMonthlyAmount =', grp.fixedMonthlyAmount);
        console.log('grp.monthlyChitAmount =', grp.monthlyChitAmount);
        console.log('grp.fixedAmount =', grp.fixedAmount);
        console.log('grp.monthlyAmount =', grp.monthlyAmount);
        console.log('grp.monthlyPayment =', grp.monthlyPayment);
        console.log('grp.chitValue =', grp.chitValue);
        console.log('grp.amount =', grp.amount);
        console.log('grp.chitAmount =', grp.chitAmount);
        console.log('═══════════════════════════════════════════════════');
        
        // Get chit amount - try ALL possible field names
        let chitAmount = 0;
        const fieldNames = [
            'fixedMonthlyAmount',
            'monthlyChitAmount', 
            'chitValue',
            'paymentAmount',
            'monthlyAmount',
            'fixedAmount',
            'amount',
            'chitAmount',
            'monthlyPayment'
        ];
        
        for(let field of fieldNames) {
            const val = parseFloat(grp[field]);
            if(val && val > 0) {
                console.log(`✅✅✅ FOUND! grp.${field} = ${val}`);
                chitAmount = val;
                break;
            }
        }
        
        // Last resort: get from last payment
        if(!chitAmount || chitAmount === 0) {
            const lastPay = slotPays.length ? slotPays[slotPays.length-1] : null;
            if(lastPay) {
                chitAmount = parseFloat(lastPay.chit)||0;
                console.log(`✅ Found from lastPayment.chit = ${chitAmount}`);
            }
        }
        
        if(!chitAmount || chitAmount === 0) {
            console.warn('⚠️⚠️⚠️ NO CHIT AMOUNT FOUND - Check group fields above ⚠️⚠️⚠️');
        }

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

        // Build table rows - main rows clickable with expandable details
        const mergedRows = allDueDates.map((dueDate, slotIndex) => {
            // Find all payments for this month/slot
            const monthPayments = slotPays.filter(p => {
                if(p.monthSlot != null) return p.monthSlot === slotIndex;
                if(Array.isArray(p.monthSlots)) return p.monthSlots.includes(slotIndex);
                return getMonthSlot(allDueDates, p.date) === slotIndex;
            });
            
            // If no payments for this month, show one pending row (or overdue if past due date)
            if(monthPayments.length === 0) {
                const isOverdue = dueDate < today;
                const statusBadge = isOverdue 
                    ? `<span style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">🔴 Overdue</span>`
                    : `<span style="background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⏳ Pending</span>`;
                
                return `<tr style="">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${slotIndex+1}</td>
                    <td style="color:${isOverdue?'#f87171':'#c7d2fe'};font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount>0?fmtAmt(chitAmount):'—'}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">—</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-weight:700;">—</td>
                    <td style="vertical-align:middle;color:var(--text-dim);">—</td>
                    <td style="vertical-align:middle;">${statusBadge}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">—</td>
                    <td style="vertical-align:middle;"><span style="color:var(--text-dim);">—</span></td>
                    <td style="vertical-align:middle;"></td>
                </tr>`;
            }
            
            // Calculate total for this month
            const totalMonthPayments = monthPayments.reduce((s,p) => s + (parseFloat(p.paid)||0), 0);
            const isPartial = monthPayments.length > 1 && totalMonthPayments < chitAmount && totalMonthPayments > 0;
            const hasMultiple = monthPayments.length > 1;
            
            // Get chit picked info
            const chitPickedPay = monthPayments.find(p => p.chitPicked === 'Yes');
            const chitPickedValue = chitPickedPay ? (chitPickedPay.chitPickedBy || 'Chit Picked') : '—';
            
            // Main row (summary or first payment if single)
            const mainPay = monthPayments[0];
            const mainIPaid = parseFloat(mainPay.paid)||0;
            const mainIBal = parseFloat(mainPay.balance)||0;
            const mainIMode = mainPay.paidBy||'—';
            const mainIsCp = mainPay.chitPicked==='Yes';
            const mainIsPaid = mainIPaid > 0;
            
            const mainRowBg = isPartial ? 'rgba(245,158,11,0.07)' : (mainIsPaid ? 'rgba(16,185,129,0.07)' : '');
            const mainRowBL = mainIsCp ? 'border-left:3px solid #10b981;' : (isPartial ? 'border-left:3px solid #f59e0b;' : '');
            
            let mainStatusBadge;
            if(isPartial) {
                mainStatusBadge = `<span style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.35);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⚡ Partial</span>`;
            } else if(mainIsPaid) {
                mainStatusBadge = `<span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">✅ Paid</span>`;
            } else {
                mainStatusBadge = `<span style="background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⏳ Pending</span>`;
            }
            
            const instBadge = hasMultiple 
                ? `<span style="display:inline-block;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;border-radius:4px;padding:1px 5px;font-size:0.58rem;font-weight:800;margin-left:4px;vertical-align:middle;">${monthPayments.length} inst.</span>` 
                : '';
            
            const chitPickedCell = chitPickedPay 
                ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:1px 6px;font-size:0.62rem;font-weight:800;">🏆 ${chitPickedValue}</span>`
                : `<span style="color:var(--text-dim);">—</span>`;
            
            const mainDateColor = mainIsPaid ? '#a5b4fc' : '#c7d2fe';
            
            // Main row (clickable if multiple payments)
            const mainRowHtml = hasMultiple
                ? `<tr style="background:${mainRowBg};${mainRowBL};cursor:pointer;" onclick="togglePaymentDetails(this,'${sectionId}_${slotIndex}')">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">▶ ${slotIndex+1}</td>
                    <td style="color:${mainDateColor};font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount>0?fmtAmt(chitAmount):'—'}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${fmtDate(mainPay.date)}</td>
                    <td style="vertical-align:middle;color:${mainIsPaid?'#34d399':'#fbbf24'};font-weight:700;">${fmtAmt(totalMonthPayments)}${instBadge}</td>
                    <td style="vertical-align:middle;color:#f59e0b;">${mainIBal>0?fmtAmt(mainIBal):'—'}</td>
                    <td style="vertical-align:middle;">${mainStatusBadge}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">—</td>
                    <td style="vertical-align:middle;">${chitPickedCell}</td>
                    <td style="vertical-align:middle;"></td>
                </tr>`
                : `<tr style="background:${mainRowBg};${mainRowBL}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${slotIndex+1}</td>
                    <td style="color:${mainDateColor};font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount>0?fmtAmt(chitAmount):'—'}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${fmtDate(mainPay.date)}</td>
                    <td style="vertical-align:middle;color:${mainIsPaid?'#34d399':'#fbbf24'};font-weight:700;">${fmtAmt(mainIPaid)}</td>
                    <td style="vertical-align:middle;color:#f59e0b;">${mainIBal>0?fmtAmt(mainIBal):'—'}</td>
                    <td style="vertical-align:middle;">${mainStatusBadge}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${mainIMode}</td>
                    <td style="vertical-align:middle;">${chitPickedCell}</td>
                    <td style="vertical-align:middle;"><button class="btn-edit-sm" onclick="openEditPayment('${mainPay.id}')" style="font-size:0.62rem;padding:3px 7px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:4px;cursor:pointer;">Edit</button></td>
                </tr>`;
            
            // If multiple payments, add detail rows (hidden by default)
            const detailRows = hasMultiple
                ? monthPayments.map((pay, idx) => {
                    const iPaid = parseFloat(pay.paid)||0;
                    const iBal = parseFloat(pay.balance)||0;
                    const iMode = pay.paidBy||'—';
                    const iCp = pay.chitPicked==='Yes';
                    const isPaid = iPaid > 0;
                    const dateColor = isPaid ? '#a5b4fc' : '#c7d2fe';
                    
                    let iStatusBadge = isPaid 
                        ? `<span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">✅ Paid</span>`
                        : `<span style="background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⏳ Pending</span>`;
                    
                    const editBtn = !isMember ? `<button class="btn-edit-sm" onclick="openEditPayment('${pay.id}')" style="font-size:0.62rem;padding:3px 7px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:4px;cursor:pointer;">Edit</button>` : '';
                    
                    return `<tr class="payment-detail-${sectionId}_${slotIndex}" style="display:none;background:rgba(99,102,241,0.04);border-left:3px solid #6366f1;">
                        <td style="text-align:center;color:#818cf8;font-size:0.6rem;padding:4px 6px;font-weight:800;">  ↳${idx+1}</td>
                        <td style="color:${dateColor};font-weight:600;font-size:0.85rem;"></td>
                        <td style="color:#c4b5fd;"></td>
                        <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${fmtDate(pay.date)}</td>
                        <td style="vertical-align:middle;color:${isPaid?'#34d399':'#fbbf24'};font-weight:700;">${fmtAmt(iPaid)}</td>
                        <td style="vertical-align:middle;color:#f59e0b;">${iBal>0?fmtAmt(iBal):'—'}</td>
                        <td style="vertical-align:middle;">${iStatusBadge}</td>
                        <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${iMode}</td>
                        <td style="vertical-align:middle;"><span style="color:var(--text-dim);">—</span></td>
                        <td style="vertical-align:middle;">${editBtn}</td>
                    </tr>`;
                }).join('')
                : '';
            
            return mainRowHtml + detailRows;
        }).join('');

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
        
        // Calculate end date
        const startDate = new Date((grp.startDate || grp.gStart || new Date().toISOString().split('T')[0]) + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + totalMonths);
        const pad = n => String(n).padStart(2, '0');
        const endDateStr = `${pad(endDate.getDate())}/${pad(endDate.getMonth()+1)}/${endDate.getFullYear()}`;

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
                        <span style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#f87171;">🏁 Ends: ${endDateStr}</span>
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
        const totalSlots = enr.qty || 1;
        
        // Create a section for EACH slot
        const slotSections = [];
        for(let slotNum = 1; slotNum <= totalSlots; slotNum++) {
            const slotPays = ps.filter(p => {
                if(p.memberId !== mid || p.groupId !== grp.id) return false;
                if(p.slotNum != null) return p.slotNum === slotNum;
                return true;
            });
            
            const allDueDates = buildDueDateList(grp);
            const id = `ledger_${idx}_${slotNum}`;
            slotSections.push(buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, id));
        }
        
        return slotSections.join('');
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

function togglePaymentDetails(row, detailClass){
    const detailRows = document.querySelectorAll('.' + detailClass);
    const isHidden = detailRows.length === 0 || (detailRows[0] && detailRows[0].style.display === 'none');
    
    detailRows.forEach(r => {
        r.style.display = isHidden ? 'table-row' : 'none';
    });
    
    // Toggle arrow in first cell
    const firstCell = row.querySelector('td:first-child');
    if(firstCell) {
        const currentText = firstCell.textContent.trim();
        const num = currentText.replace('▶', '').replace('▼', '').trim();
        firstCell.textContent = (isHidden ? '▼' : '▶') + ' ' + num;
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
