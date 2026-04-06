// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER (FIXED HIERARCHICAL TOGGLE)
// ═══════════════════════════════════════════════════════════

async function loadMemberLedger() {
    const mid = CURRENT_USER && CURRENT_USER.role === 'member'
        ? CURRENT_USER.memberId
        : document.getElementById('summaryView').value;
    if (!mid) return;

    const ms = await getCollection('members');
    const gs = await getCollection('groups');
    const ps = await getCollection('payments');
    const m = ms.find(x => x.id === mid); if (!m) return;
    const mPays = ps.filter(p => p.memberId === mid);
    
    let enrollments = m.enrollments || (m.groupIds || []).map(gid => ({ enrollmentId: '', groupId: gid, label: '', qty: 1 }));
    const isMember = CURRENT_USER && CURRENT_USER.role === 'member';
    const today = new Date().toISOString().split('T')[0];

    function buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, sectionId) {
        const chitAmount = slotPays.length ? (parseFloat(slotPays[slotPays.length - 1].chit) || 0) : 0;
        const totalMonths = parseInt(grp.duration || grp.gDuration) || 21;

        const mergedRows = allDueDates.map((dueDate, slotIndex) => {
            const monthPayments = slotPays.filter(p => {
                if (p.monthSlot != null) return p.monthSlot === slotIndex;
                return (p.date ? p.date.substring(0, 7) : '') === dueDate.substring(0, 7);
            });

            if (monthPayments.length === 0) {
                return `<tr>
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;">${slotIndex + 1}</td>
                    <td style="color:#c7d2fe;">${fmtDate(dueDate)}</td>
                    <td colspan="8" style="text-align:center;color:var(--text-dim);">⏳ Pending</td>
                </tr>`;
            }

            const totalPaid = monthPayments.reduce((s, p) => s + (parseFloat(p.paid) || 0), 0);
            const hasMultiple = monthPayments.length > 1;
            const mainPay = monthPayments[0];
            const detailClass = `details-${sectionId}-${slotIndex}`;
            
            // Main Row
            const mainRow = `
                <tr style="cursor:${hasMultiple ? 'pointer' : 'default'};" 
                    onclick="${hasMultiple ? `togglePaymentDetails(this,'${detailClass}')` : ''}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;">
                        ${hasMultiple ? '<span class="arrow-icon" style="display:inline-block; transition:0.2s;">▶</span>' : ''} ${slotIndex + 1}
                    </td>
                    <td style="color:#a5b4fc;font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${fmtAmt(chitAmount)}</td>
                    <td style="font-size:0.7rem;">${fmtDate(mainPay.date)}</td>
                    <td style="font-weight:700;color:${totalPaid >= chitAmount ? '#34d399' : '#fbbf24'}">
                        ${fmtAmt(totalPaid)} ${hasMultiple ? `<span class="badge bg-primary" style="font-size:0.55rem;">${monthPayments.length} inst.</span>` : ''}
                    </td>
                    <td style="color:#f59e0b;">${fmtAmt(mainPay.balance)}</td>
                    <td><span class="badge ${totalPaid >= chitAmount ? 'bg-success' : 'bg-warning'}">${totalPaid >= chitAmount ? 'Paid' : 'Partial'}</span></td>
                    <td>${mainPay.paidBy || '—'}</td>
                    <td>${mainPay.chitPicked === 'Yes' ? '🏆' : '—'}</td>
                    <td><button class="btn-edit-sm" onclick="event.stopPropagation(); openEditPayment('${mainPay.id}')">Edit</button></td>
                </tr>`;

            // Detail Rows
            const detailRows = hasMultiple ? monthPayments.map((p, idx) => `
                <tr class="${detailClass}" style="display:none; background:rgba(99,102,241,0.03); border-left:3px solid #6366f1;">
                    <td style="text-align:right; color:#818cf8; font-size:0.6rem;">↳${idx + 1}</td>
                    <td colspan="2" style="font-size:0.65rem; color:var(--text-dim);">Installment Entry</td>
                    <td style="font-size:0.7rem;">${fmtDate(p.date)}</td>
                    <td style="color:#fbbf24;">${fmtAmt(p.paid)}</td>
                    <td style="color:#f59e0b;">${fmtAmt(p.balance)}</td>
                    <td colspan="2"></td>
                    <td>${p.chitPicked === 'Yes' ? '🏆' : ''}</td>
                    <td><button class="btn-edit-sm" onclick="event.stopPropagation(); openEditPayment('${p.id}')">Edit</button></td>
                </tr>`).join('') : '';

            return mainRow + detailRows;
        }).join('');

        return `
        <div class="member-card">
            <div class="history-summary-bar" onclick="toggleLedgerTable('${sectionId}', this)">
                <span class="fw-bold small">📋 Group: ${grp.name} (${totalMonths} months)</span>
                <span class="ledger-chevron">▶</span>
            </div>
            <div id="${sectionId}" style="display:none;">
                <table class="table-history">
                    <thead><tr><th>#</th><th>DUE</th><th>CHIT</th><th>PAY DATE</th><th>PAID</th><th>BAL</th><th>STATUS</th><th>MODE</th><th>PICKED</th><th></th></tr></thead>
                    <tbody>${mergedRows}</tbody>
                </table>
            </div>
        </div>`;
    }

    const html = enrollments.map((enr, idx) => {
        const grp = gs.find(g => g.id === enr.groupId);
        if (!grp) return '';
        const allDueDates = buildDueDateList(grp);
        const slotPays = mPays.filter(p => p.groupId === enr.groupId);
        return buildSection(grp, enr, slotPays, 1, 1, allDueDates, `tbl_${idx}`);
    }).join('');

    document.getElementById('ledgerData').innerHTML = html;
}

// TOGGLE HANDLERS
function togglePaymentDetails(row, detailClass) {
    const details = document.querySelectorAll('.' + detailClass);
    const arrow = row.querySelector('.arrow-icon');
    const isHidden = details[0].style.display === 'none';
    details.forEach(d => d.style.display = isHidden ? 'table-row' : 'none');
    if (arrow) arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

function toggleLedgerTable(id, el) {
    const table = document.getElementById(id);
    const chevron = el.querySelector('.ledger-chevron');
    const isHidden = table.style.display === 'none';
    table.style.display = isHidden ? 'block' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}
