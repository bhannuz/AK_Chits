const mergedRows = allDueDates.map((dueDate, slotIndex) => {
    const monthPayments = slotPays.filter(p => {
        if (p.monthSlot != null) return p.monthSlot === slotIndex;
        if (Array.isArray(p.monthSlots)) return p.monthSlots.includes(slotIndex);
        return (p.date ? p.date.substring(0, 7) : '') === dueDate.substring(0, 7);
    });

    const totalForSlot = monthPayments.reduce((s, p) => s + (parseFloat(p.paid || p.amountPaid) || 0), 0);
    const hasMultiple = monthPayments.length > 1;
    const detailClass = `details-${sectionId}-${slotIndex}`;
    const mainPay = monthPayments[0];

    // Placeholder if no payment
    if (monthPayments.length === 0) {
        const isOverdue = dueDate < today;
        return `
            <tr>
                <td style="text-align:center; color:var(--text-dim); font-size:0.75rem;">${slotIndex + 1}</td>
                <td style="color:${isOverdue ? '#f87171' : '#a5b4fc'}; font-weight:600;">${fmtDate(dueDate)}</td>
                <td style="color:#c4b5fd; font-weight:600;">${fmtAmt(chitAmount)}</td>
                <td style="color:var(--text-dim);">—</td>
                <td style="color:var(--text-dim);">—</td>
                <td style="color:var(--text-dim); font-weight:bold;">—</td>
                <td><span class="badge-status status-pending">⏳ Pending</span></td>
                <td style="color:var(--text-dim);">—</td>
                <td style="color:var(--text-dim);">—</td>
            </tr>`;
    }

    // Row with payment data
    const isFullPaid = totalForSlot >= chitAmount;
    const balAmt = parseFloat(mainPay.balance) || 0;

    return `
        <tr style="cursor:${hasMultiple ? 'pointer' : 'default'};" onclick="${hasMultiple ? `togglePaymentDetails(this,'${detailClass}')` : ''}">
            <td style="text-align:center; color:var(--text-dim); font-size:0.75rem;">
                ${hasMultiple ? '<span class="arrow-icon">▶</span>' : ''} ${slotIndex + 1}
            </td>
            <td style="color:#a5b4fc; font-weight:600;">${fmtDate(dueDate)}</td>
            <td style="color:#c4b5fd; font-weight:600;">${fmtAmt(chitAmount)}</td>
            <td style="color:var(--text-dim); font-size:0.75rem;">${fmtDate(mainPay.date)}</td>
            <td>
                <span style="color:#34d399; font-weight:bold;">${fmtAmt(totalForSlot)}</span>
                ${hasMultiple ? `<span class="badge-inst">${monthPayments.length} inst.</span>` : ''}
            </td>
            <td style="color:#f59e0b; font-weight:bold;">${balAmt > 0 ? fmtAmt(balAmt) : '<span style="color:#f39c12">—</span>'}</td>
            <td><span class="badge-status status-paid">✅ Paid</span></td>
            <td style="color:var(--text-dim); font-size:0.75rem;">${mainPay.paidBy || mainPay.mode || '—'}</td>
            <td style="color:var(--text-dim);">—</td>
        </tr>
        ${hasMultiple ? monthPayments.map((p, idx) => `
            <tr class="${detailClass}" style="display:none; background:rgba(99,102,241,0.03); border-left:3px solid #6366f1;">
                <td style="text-align:right; color:#818cf8; font-size:0.65rem; font-weight:bold; padding-right:15px;">↳${idx + 1}</td>
                <td colspan="2" style="font-size:0.7rem; color:var(--text-dim);">Installment Entry</td>
                <td style="font-size:0.75rem; color:var(--text-dim);">${fmtDate(p.date)}</td>
                <td style="font-weight:bold; color:#fbbf24;">${fmtAmt(parseFloat(p.paid || p.amountPaid) || 0)}</td>
                <td style="color:#f59e0b;">${fmtAmt(parseFloat(p.balance) || 0)}</td>
                <td colspan="3"></td>
            </tr>
        `).join('') : ''}
    `;
}).join('');
