// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER - CORRECTED HIERARCHY LOGIC
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
    const totalPaid = mPays.reduce((s, p) => s + (parseFloat(p.paid) || 0), 0);
    const totalBal = mPays.reduce((s, p) => s + (parseFloat(p.balance) || 0), 0);
    let enrollments = m.enrollments;
    if (!enrollments || !enrollments.length)
        enrollments = (m.groupIds || []).map(gid => ({ enrollmentId: '', groupId: gid, label: '', qty: 1 }));
    const memberGroups = gs.filter(g => m.groupIds && m.groupIds.includes(g.id));
    const isMember = CURRENT_USER && CURRENT_USER.role === 'member';
    const today = new Date().toISOString().split('T')[0];

    function buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, sectionId) {
        const totalMonths = parseInt(grp.duration || grp.gDuration) || 21;

        // Get chit amount - prioritizing Fixed Monthly Amount fields
        let chitAmount = parseFloat(grp.fixedMonthlyAmount)
            || parseFloat(grp.monthlyChitAmount)
            || parseFloat(grp.fixedAmount)
            || parseFloat(grp.monthlyAmount)
            || parseFloat(grp.amount)
            || parseFloat(grp.chitAmount)
            || 0;

        if (!chitAmount || chitAmount === 0) {
            const lastPay = slotPays.length ? slotPays[slotPays.length - 1] : null;
            if (lastPay) chitAmount = parseFloat(lastPay.chit) || 0;
        }

        // Calculate stats for header
        const _perSlotTotals = {};
        slotPays.forEach(p => {
            const slots = Array.isArray(p.monthSlots) ? p.monthSlots : (p.monthSlot != null ? [p.monthSlot] : []);
            slots.forEach(s => { _perSlotTotals[s] = (_perSlotTotals[s] || 0) + (parseFloat(p.paid) || 0); });
        });
        const fullyPaidSlotSet = new Set(Object.keys(_perSlotTotals).filter(s => chitAmount <= 0 || _perSlotTotals[s] >= chitAmount).map(Number));
        const monthsDone = fullyPaidSlotSet.size;
        const pct = Math.min(100, Math.round(monthsDone / totalMonths * 100));
        const tPaid = slotPays.reduce((s, p) => s + (parseFloat(p.paid) || 0), 0);
        const tBal = slotPays.reduce((s, p) => s + (parseFloat(p.balance) || 0), 0);

        // Build table rows with corrected hierarchy logic
        const mergedRows = allDueDates.map((dueDate, slotIndex) => {
            const monthPayments = slotPays.filter(p => {
                if (p.monthSlot != null) return p.monthSlot === slotIndex;
                if (Array.isArray(p.monthSlots)) return p.monthSlots.includes(slotIndex);
                return getMonthSlot(allDueDates, p.date) === slotIndex;
            });

            if (monthPayments.length === 0) {
                const isOverdue = dueDate < today;
                const statusBadge = isOverdue
                    ? `<span style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">🔴 Overdue</span>`
                    : `<span style="background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⏳ Pending</span>`;

                return `<tr>
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${slotIndex + 1}</td>
                    <td style="color:${isOverdue ? '#f87171' : '#c7d2fe'};font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${chitAmount > 0 ? fmtAmt(chitAmount) : '—'}</td>
                    <td colspan="3" style="text-align:center;color:var(--text-dim);font-size:0.7rem;">—</td>
                    <td>${statusBadge}</td>
                    <td colspan="3"></td>
                </tr>`;
            }

            const totalForSlot = monthPayments.reduce((s, p) => s + (parseFloat(p.paid) || 0), 0);
            const hasMultiple = monthPayments.length > 1;
            const isFullPaid = chitAmount > 0 && totalForSlot >= chitAmount;
            const isPartial = totalForSlot > 0 && totalForSlot < chitAmount;
            const detailClass = `payment-detail-${sectionId}_${slotIndex}`; // Fixed ID reference
            const mainPay = monthPayments[0];
            const chitPickedPay = monthPayments.find(p => p.chitPicked === 'Yes');

            // Status Badge Logic
            let statusBadge = `<span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">✅ Paid</span>`;
            if (isPartial) {
                statusBadge = `<span style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.35);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⚡ Partial</span>`;
            }

            const instBadge = hasMultiple ? `<span style="display:inline-block;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;border-radius:4px;padding:1px 5px;font-size:0.58rem;font-weight:800;margin-left:4px;vertical-align:middle;">${monthPayments.length} inst.</span>` : '';

            // Render Main Row
            const mainRowHtml = `
                <tr style="cursor:${hasMultiple ? 'pointer' : 'default'};" onclick="${hasMultiple ? `togglePaymentDetails(this,'${detailClass}')` : ''}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${hasMultiple ? '▶ ' : ''}${slotIndex + 1}</td>
                    <td style="color:#a5b4fc;font-weight:600;">${fmtDate(dueDate)}</td>
                    <td style="color:#c4b5fd;">${fmtAmt(chitAmount)}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${fmtDate(mainPay.date)}</td>
                    <td style="vertical-align:middle;color:${isFullPaid ? '#34d399' : '#fbbf24'};font-weight:700;">${fmtAmt(totalForSlot)}${instBadge}</td>
                    <td style="vertical-align:middle;color:#f59e0b;">${mainPay.balance > 0 ? fmtAmt(mainPay.balance) : '—'}</td>
                    <td style="vertical-align:middle;">${statusBadge}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${hasMultiple ? 'Multiple' : (mainPay.paidBy || '—')}</td>
                    <td style="vertical-align:middle;">${chitPickedPay ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:1px 6px;font-size:0.62rem;font-weight:800;">🏆 Picked</span>` : '—'}</td>
                    <td style="vertical-align:middle;">${!hasMultiple && !isMember ? `<button class="btn-edit-sm" onclick="event.stopPropagation(); openEditPayment('${mainPay.id}')">Edit</button>` : ''}</td>
                </tr>`;

            // Render Detail Rows for Partial/Hierarchical Payments
            const detailRows = hasMultiple ? monthPayments.map((pay, idx) => `
                <tr class="${detailClass}" style="display:none;background:rgba(99,102,241,0.04);border-left:3px solid #6366f1;">
                    <td style="text-align:center;color:#818cf8;font-size:0.6rem;padding:4px 6px;font-weight:800;">↳${idx + 1}</td>
                    <td colspan="2" style="font-size:0.65rem;color:var(--text-dim);">Installment Entry</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${fmtDate(pay.date)}</td>
                    <td style="vertical-align:middle;color:#fbbf24;font-weight:700;">${fmtAmt(pay.paid)}</td>
                    <td style="vertical-align:middle;color:#f59e0b;">${pay.balance > 0 ? fmtAmt(pay.balance) : '—'}</td>
                    <td style="vertical-align:middle;"><span style="color:var(--text-dim);font-size:0.62rem;">—</span></td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.7rem;">${pay.paidBy || '—'}</td>
                    <td style="vertical-align:middle;">${pay.chitPicked === 'Yes' ? '🏆' : '—'}</td>
                    <td style="vertical-align:middle;">${!isMember ? `<button class="btn-edit-sm" onclick="event.stopPropagation(); openEditPayment('${pay.id}')">Edit</button>` : ''}</td>
                </tr>`).join('') : '';

            return mainRowHtml + detailRows;
        }).join('');

        const overdueCnt = allDueDates.filter((d, i) => !fullyPaidSlotSet.has(i) && d < today).length;

        // Progress and header format preservation
        return `<div style="margin-bottom:16px;page-break-inside:avoid;">
            <div style="background:#1c253b;border-radius:12px 12px 0 0;padding:12px 16px;border:1px solid var(--border);border-bottom:none;page-break-inside:avoid;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                    <div>
                        <div style="font-size:1rem;font-weight:900;color:#f39c12;margin-bottom:6px;">
                            Group: ${grp.name}${labelBadge}${chitSlotBadge}
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#a5b4fc;">📅 Started: ${fmtDate(grp.startDate || grp.gStart || '')}</span>
                        </div>
                    </div>
                </div>
                <div style="margin-top:10px;">
                    <div style="background:#252f48;border-radius:5px;height:6px;overflow:hidden;">
                        <div style="height:100%;border-radius:5px;background:linear-gradient(90deg,#f39c12,#f57c00);width:${pct}%;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;flex-wrap:wrap;gap:4px;">
                        <span style="font-size:0.65rem;color:var(--text-dim);">Month ${monthsDone}/${totalMonths} paid${overdueCnt > 0 ? ` · <span style="color:#f87171;">${overdueCnt} overdue</span>` : ''}</span>
                        <span style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#f87171;">🏁 Ends: ${endDateStr}</span>
                    </div>
                </div>
            </div>

            <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:0 0 12px 12px;overflow:hidden;page-break-inside:avoid;">
                <div onclick="toggleLedgerTable('${sectionId}',this)" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;user-select:none;border-bottom:1px solid var(--border);page-break-inside:avoid;">
                    <span style="font-size:0.78rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:.5px;">📋 Schedule & Payments (${totalMonths} months)</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:0.78rem;color:#34d399;font-weight:700;">${fmtAmt(tPaid)}</span>
                        <span style="font-size:0.9rem;color:var(--text-dim);transition:transform .25s;" class="ledger-chevron">&#9654;</span>
                    </div>
                </div>
                <div id="${sectionId}" style="display:block;page-break-inside:avoid;">
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;page-break-inside:avoid;">
                        <table class="table-custom" style="table-layout:auto !important;width:100% !important;">
                            <thead><tr>
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
                            <tbody>
                                ${mergedRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // --- Rest of your logic (Enrollment mapping, user identification, etc.) stays exactly the same ---
    const groupSections = enrollments.map((enr, idx) => {
        const grp = gs.find(g => g.id === enr.groupId); if (!grp) return '';
        const totalSlots = enr.qty || 1;
        const slotSections = [];
        for (let slotNum = 1; slotNum <= totalSlots; slotNum++) {
            const slotPays = ps.filter(p => {
                if (p.memberId !== mid || p.groupId !== grp.id) return false;
                if (p.slotNum != null) return p.slotNum === slotNum;
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
                <div style="font-size:0.72rem;color:var(--text-dim);margin-top:1px;">${mPays.length} payment${mPays.length !== 1 ? 's' : ''} · ${memberGroups.length} group${memberGroups.length !== 1 ? 's' : ''}</div>
            </div>
            <div style="display:flex;gap:6px;">
                ${!isMember ? `<button class="btn-edit-sm" onclick="openEditMember('${mid}')">Edit</button>` : ''} 
                <button onclick="printMemberStatement('${mid}')" style="background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;padding:8px 14px;font-size:0.8rem;font-weight:800;border:none;border-radius:9px;cursor:pointer;">Print</button>
            </div>
        </div>
        ${groupSections || '<div style="text-align:center;color:var(--text-dim);padding:30px;">No group enrollments found</div>'}
    `;

    if (isMember) {
        document.getElementById('memberLedgerData').innerHTML = ledgerHtml;
        document.getElementById('mhGroups').textContent = memberGroups.length;
        document.getElementById('mhTotalPaid').textContent = fmtAmt(totalPaid);
        document.getElementById('mhBalance').textContent = fmtAmt(totalBal);
    } else {
        document.getElementById('ledgerData').innerHTML = ledgerHtml;
    }
}
