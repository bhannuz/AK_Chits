// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER - FIXED SYNTAX & HIERARCHY
// ═══════════════════════════════════════════════════════════

async function loadMemberLedger() {
    const mid = CURRENT_USER && CURRENT_USER.role === 'member'
        ? CURRENT_USER.memberId
        : document.getElementById('summaryView').value;
    
    if (!mid) return;

    const ms = await getCollection('members');
    const gs = await getCollection('groups');
    const ps = await getCollection('payments');
    
    const m = ms.find(x => x.id === mid); 
    if (!m) return;

    const mPays = ps.filter(p => p.memberId === mid);
    const gsList = gs.filter(g => (m.groupIds || []).includes(g.id));
    const today = new Date().toISOString().split('T')[0];

    // Build enrollment list
    let enrollments = m.enrollments || (m.groupIds || []).map(gid => ({ enrollmentId: '', groupId: gid, label: '', qty: 1 }));

    function buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, sectionId) {
        const totalMonths = parseInt(grp.duration || grp.gDuration) || 21;
        
        // CHIT/MO linked to Fixed Monthly Amount
        let chitAmount = parseFloat(grp.fixedMonthlyAmount) 
            || parseFloat(grp.fixedAmount) 
            || parseFloat(grp.monthlyAmount) 
            || parseFloat(grp.amount)
            || parseFloat(grp.chitAmount)
            || 0;

        const _perSlotTotals = {};
        slotPays.forEach(p => {
            const slots = Array.isArray(p.monthSlots) ? p.monthSlots : (p.monthSlot != null ? [p.monthSlot] : []);
            slots.forEach(s => { 
                _perSlotTotals[s] = (_perSlotTotals[s] || 0) + (parseFloat(p.paid || p.amountPaid) || 0); 
            });
        });
        
        const fullyPaidSlotSet = new Set(Object.keys(_perSlotTotals).filter(s => chitAmount <= 0 || _perSlotTotals[s] >= chitAmount).map(Number));
        const monthsDone = fullyPaidSlotSet.size;
        const pct = Math.min(100, Math.round(monthsDone / totalMonths * 100));
        const tPaid = slotPays.reduce((s, p) => s + (parseFloat(p.paid || p.amountPaid) || 0), 0);

        const mergedRows = allDueDates.map((dueDate, slotIndex) => {
            const monthPayments = slotPays.filter(p => {
                if (p.monthSlot != null) return p.monthSlot === slotIndex;
                if (Array.isArray(p.monthSlots)) return p.monthSlots.includes(slotIndex);
                return (p.date ? p.date.substring(0, 7) : '') === dueDate.substring(0, 7);
            });

            if (monthPayments.length === 0) {
                const isOverdue = dueDate < today;
                return `<tr>
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${slotIndex + 1}</td>
                    <td style="color:${isOverdue ? '#f87171' : '#c7d2fe'};font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount > 0 ? fmtAmt(chitAmount) : '—'}</td>
                    <td colspan="3" style="text-align:center;color:var(--text-dim);font-size:0.7rem;">—</td>
                    <td><span class="badge-status ${isOverdue ? 'status-overdue' : 'status-pending'}">${isOverdue ? '🔴 Overdue' : '⏳ Pending'}</span></td>
                    <td colspan="3"></td>
                </tr>`;
            }

            const totalForSlot = monthPayments.reduce((s, p) => s + (parseFloat(p.paid || p.amountPaid) || 0), 0);
            const hasMultiple = monthPayments.length > 1;
            const detailClass = `details-${sectionId}-${slotIndex}`;
            const mainPay = monthPayments[0];

            return `
                <tr style="cursor:${hasMultiple ? 'pointer' : 'default'};" onclick="${hasMultiple ? `togglePaymentDetails(this,'${detailClass}')` : ''}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">
                        ${hasMultiple ? '<span class="arrow-icon">▶</span> ' : ''}${slotIndex + 1}
                    </td>
                    <td style="color:#a5b4fc;font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount > 0 ? fmtAmt(chitAmount) : '—'}</td>
                    <td style="font-size:0.7rem;color:var(--text-dim);">${fmtDate(mainPay.date)}</td>
                    <td style="font-weight:700;color:${totalForSlot >= chitAmount ? '#34d399' : '#fbbf24'}">
                        ${fmtAmt(totalForSlot)} ${hasMultiple ? `<span class="badge-inst">${monthPayments.length} inst.</span>` : ''}
                    </td>
                    <td style="color:#f59e0b;font-weight:700;">${fmtAmt(parseFloat(mainPay.balance) || 0)}</td>
                    <td><span class="badge-status ${totalForSlot >= chitAmount ? 'status-paid' : 'status-partial'}">${totalForSlot >= chitAmount ? '✅ Paid' : '⚡ Partial'}</span></td>
                    <td style="font-size:0.7rem;color:var(--text-dim);">${mainPay.paidBy || mainPay.mode || '—'}</td>
                    <td>${monthPayments.some(p => p.chitPicked === 'Yes') ? '🏆 Picked' : '—'}</td>
                    <td><button class="btn-edit-sm" onclick="event.stopPropagation(); openEditPayment('${mainPay.id}')">Edit</button></td>
                </tr>
                ${hasMultiple ? monthPayments.map((p, idx) => `
                    <tr class="${detailClass}" style="display:none; background:rgba(99,102,241,0.03); border-left:3px solid #6366f1;">
                        <td style="text-align:right; color:#818cf8; font-size:0.6rem; font-weight:800; padding-right:15px;">↳${idx + 1}</td>
                        <td colspan="2" style="font-size:0.65rem; color:var(--text-dim);">Installment Entry</td>
                        <td style="font-size:0.7rem; color:var(--text-dim);">${fmtDate(p.date)}</td>
                        <td style="font-weight:700; color:#fbbf24;">${fmtAmt(parseFloat(p.paid || p.amountPaid) || 0)}</td>
                        <td style="color:#f59e0b;">${fmtAmt(parseFloat(p.balance) || 0)}</td>
                        <td colspan="2" style="font-size:0.65rem; color:var(--text-dim); text-align:center;">${p.paidBy || p.mode || '—'}</td>
                        <td>${p.chitPicked === 'Yes' ? '🏆' : ''}</td>
                        <td><button class="btn-edit-sm" onclick="event.stopPropagation(); openEditPayment('${p.id}')">Edit</button></td>
                    </tr>
                `).join('') : ''}
            `;
        }).join('');

        return `
        <div class="member-card">
            <div style="padding:15px; background:rgba(28,37,59,0.5); border-radius:12px 12px 0 0;">
                <h5 style="color:var(--gold); font-weight:900;">Group: ${grp.name || 'Untitled Group'}</h5>
                <div class="progress-container"><div class="progress-fill" style="width:${pct}%"></div></div>
                <div class="d-flex justify-content-between small text-dim mt-1">
                    <span>Month ${monthsDone}/${totalMonths} paid</span>
                </div>
            </div>
            <div class="history-summary-bar" onclick="toggleLedgerTable('${sectionId}', this)">
                <span class="fw-bold small">📋 SCHEDULE & PAYMENTS</span>
                <div class="d-flex gap-3 align-items-center">
                    <span class="text-success fw-bold">${fmtAmt(tPaid)}</span>
                    <span class="ledger-chevron">▶</span>
                </div>
            </div>
            <div id="${sectionId}" style="display:none;">
                <table class="table-history">
                    <thead><tr><th>#</th><th>DUE</th><th>CHIT/MO</th><th>PAY DATE</th><th>PAID</th><th>BAL</th><th>STATUS</th><th>MODE</th><th>PICKED</th><th></th></tr></thead>
                    <tbody>${mergedRows}</tbody>
                </table>
            </div>
        </div>`;
    }

    const html = enrollments.map((enr, idx) => {
        const grp = gsList.find(g => g.id === enr.groupId);
        if (!grp) return '';
        const allDueDates = buildDueDateList(grp);
        const slotPays = mPays.filter(p => p.groupId === enr.groupId);
        return buildSection(grp, enr, slotPays, 1, 1, allDueDates, `tbl_${idx}`);
    }).join('');

    document.getElementById('ledgerData').innerHTML = html || '<div class="text-center p-5 text-dim">No group enrollments found.</div>';
}

function togglePaymentDetails(row, detailClass) {
    const detailRows = document.querySelectorAll('.' + detailClass);
    const isHidden = detailRows.length > 0 && detailRows[0].style.display === 'none';
    detailRows.forEach(r => r.style.display = isHidden ? 'table-row' : 'none');
    const arrow = row.querySelector('.arrow-icon');
    if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
}

function toggleLedgerTable(id, el) {
    const table = document.getElementById(id);
    if (table) {
        const isHidden = table.style.display === 'none';
        table.style.display = isHidden ? 'block' : 'none';
        const chevron = el.querySelector('.ledger-chevron');
        if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
}

function getMonthSlot(dueDates, payDate) {
    if (!payDate) return -1;
    const pDate = new Date(payDate + 'T00:00:00');
    for (let i = 0; i < dueDates.length; i++) {
        const dDate = new Date(dueDates[i] + 'T00:00:00');
        const dNext = i < dueDates.length - 1 ? new Date(dueDates[i + 1] + 'T00:00:00') : new Date(dDate.getFullYear(), dDate.getMonth() + 2, 1);
        if (pDate >= dDate && pDate < dNext) return i;
    }
    return -1;
}

function buildDueDateList(grp) {
    const start = grp.startDate || grp.gStart || new Date().toISOString().split('T')[0];
    const dur = parseInt(grp.duration || grp.gDuration || 21);
    const dueDay = parseInt(grp.dueDay || 5);
    const dates = [];
    let d = new Date(start + 'T00:00:00');
    for (let i = 0; i < dur; i++) {
        dates.push(d.toISOString().split('T')[0]);
        d.setMonth(d.getMonth() + 1);
        d.setDate(dueDay);
    }
    return dates;
}
