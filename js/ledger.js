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
        enrollments=(m.groupIds||[]).map(gid=>({enrollmentId:'',groupId:gid,label:'',qty:1}));
    const memberGroups=gs.filter(g=>m.groupIds&&m.groupIds.includes(g.id));
    const isMember = CURRENT_USER && CURRENT_USER.role==='member';
    const today = new Date().toISOString().split('T')[0];

    function buildSection(grp, enr, slotPays, slotNum, totalSlots, allDueDates, sectionId){
        const totalMonths  = parseInt(grp.duration||grp.gDuration)||21;
        // Only count months that are FULLY paid (total paid >= chit amount for that slot)
        const chitRef = slotPays.length ? (parseFloat(slotPays[slotPays.length-1].chit)||0) : 0;
        const _allDD  = allDueDates; // reference for slot matching below
        // Build per-slot paid totals to determine fully paid months
        const _slotTotals = {};
        slotPays.forEach(p=>{
            const slots = Array.isArray(p.monthSlots)?p.monthSlots:(p.monthSlot!=null?[p.monthSlot]:[]);
            slots.forEach(s=>{ _slotTotals[s]=(_slotTotals[s]||0)+(parseFloat(p.paid)||0); });
        });
        const fullyPaidSlots = Object.keys(_slotTotals).filter(s=>chitRef<=0||_slotTotals[s]>=chitRef).length;
        const monthsDone   = fullyPaidSlots;
        const left         = Math.max(0,totalMonths-monthsDone);
        const pct          = Math.min(100,Math.round(monthsDone/totalMonths*100));
        const tPaid        = slotPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const tBal         = slotPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);
        const multiMonthCount = slotPays.filter(p=>p.numMonths&&p.numMonths>1).length;
        const chitPickedPay   = slotPays.find(p=>p.chitPicked==='Yes');
        const gStartDisplay   = fmtDate(grp.startDate||grp.gStart||'');
        const gDueDayOrd      = grp.dueDay?`${grp.dueDay}${['st','nd','rd'][((grp.dueDay%100-11)%10)-1]||'th'}`:'--';

        // Get fixed chit amount from last payment or first payment
        const lastPay    = slotPays.length ? slotPays[slotPays.length-1] : null;
        const chitAmount = lastPay ? (parseFloat(lastPay.chit)||0) : 0;

        const chitSlotBadge = totalSlots>1
            ? `<span style="background:rgba(245,158,11,0.25);border:1px solid rgba(245,158,11,0.5);color:#fbbf24;border-radius:5px;padding:2px 9px;font-size:0.75rem;font-weight:800;margin-left:6px;">Chit ${slotNum}</span>`
            : '';
        const labelBadge = enr.label
            ? `<span style="background:rgba(243,156,18,.18);border:1px solid rgba(243,156,18,.35);border-radius:5px;padding:1px 7px;font-size:0.72rem;color:#f39c12;margin-left:6px;">${enr.label}</span>` : '';

        // ── Build paid slot set for schedule ─────────────────────────────────
        const paidSlotSet = new Set(); // any payment (including partial)
        slotPays.forEach(p=>{
            if(Array.isArray(p.monthSlots)) p.monthSlots.forEach(s=>paidSlotSet.add(s));
            else if(p.monthSlot!=null) paidSlotSet.add(p.monthSlot);
            else {
                // fallback: derive from date
                const si = getMonthSlot(allDueDates, p.date);
                if(si>=0) paidSlotSet.add(si);
            }
        });
        // fullyPaidSlotSet — only slots where total paid >= chit amount (used for Next Due Date)
        const _chitRef2 = slotPays.length?(parseFloat(slotPays[slotPays.length-1].chit)||0):0;
        const _perSlotTotals2 = {};
        slotPays.forEach(p=>{
            const slots2=Array.isArray(p.monthSlots)?p.monthSlots:(p.monthSlot!=null?[p.monthSlot]:[]);
            slots2.forEach(s=>{ _perSlotTotals2[s]=(_perSlotTotals2[s]||0)+(parseFloat(p.paid)||0); });
        });
        const fullyPaidSlotSet = new Set(Object.keys(_perSlotTotals2).filter(s=>_chitRef2<=0||_perSlotTotals2[s]>=_chitRef2).map(Number));

        // ── Merged table: rowspan for multi-month payments ───────────────────
        // Build a map: payId -> first slot index (to know where to render merged cell)
        const payFirstSlot = {}; // payId -> first slot index
        const payRowSpan   = {}; // payId -> rowspan count
        allDueDates.forEach((d, i)=>{
            const p = slotPays.find(pay=>{
                if(Array.isArray(pay.monthSlots)) return pay.monthSlots.includes(i);
                if(pay.monthSlot!=null) return pay.monthSlot===i;
                return getMonthSlot(allDueDates, pay.date)===i;
            });
            if(!p) return;
            if(p.numMonths && p.numMonths > 1){
                if(payFirstSlot[p.id] === undefined) payFirstSlot[p.id] = i;
                payRowSpan[p.id] = (payRowSpan[p.id]||0) + 1;
            }
        });

        const mergedRows = allDueDates.map((dueDate, i)=>{
            // Collect ALL payments for this slot (handles multiple installments)
            const slotMatchPays = slotPays.filter(p=>{
                if(Array.isArray(p.monthSlots)) return p.monthSlots.includes(i);
                if(p.monthSlot!=null) return p.monthSlot===i;
                return getMonthSlot(allDueDates, p.date)===i;
            });
            const matchPay = slotMatchPays.length ? slotMatchPays[0] : null;
            const hasInstallments = slotMatchPays.length > 1;

            // Aggregate totals across all installments for this slot
            const totalPaidForSlot = slotMatchPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
            const chitAmt          = matchPay ? (parseFloat(matchPay.chit)||chitAmount||0) : (chitAmount||0);
            const latestBal        = slotMatchPays.length ? (parseFloat(slotMatchPays[slotMatchPays.length-1].balance)||0) : 0;

            const isFullPaid    = paidSlotSet.has(i) && chitAmt>0 && totalPaidForSlot>=chitAmt;
            const isPartialPaid = paidSlotSet.has(i) && chitAmt>0 && totalPaidForSlot>0 && totalPaidForSlot<chitAmt;
            const isAnyPaid     = paidSlotSet.has(i);
            const isOverdue     = !isAnyPaid && dueDate < today;
            const cp            = slotMatchPays.some(p=>p.chitPicked==='Yes');
            const isMulti       = matchPay && matchPay.numMonths && matchPay.numMonths>1;

            // For multi-month: only render payment detail cells on FIRST slot row
            const isFirstOfMulti = isMulti && matchPay && payFirstSlot[matchPay.id]===i;
            const isSubOfMulti   = isMulti && matchPay && payFirstSlot[matchPay.id]!==i;
            const span           = isFirstOfMulti ? payRowSpan[matchPay.id] : 1;

            // Row styling
            const rowBg = isFullPaid    ? 'rgba(16,185,129,0.07)'
                        : isPartialPaid ? 'rgba(245,158,11,0.07)'
                        : cp            ? 'rgba(16,185,129,0.07)'
                        : isMulti       ? 'rgba(99,102,241,0.07)'
                        : isOverdue     ? 'rgba(239,68,68,0.05)'
                        : '';
            const rowBL = cp            ? 'border-left:3px solid #10b981;'
                        : isMulti       ? 'border-left:3px solid #818cf8;'
                        : isPartialPaid ? 'border-left:3px solid #f59e0b;'
                        : '';

            const dateColor = isFullPaid ? '#a5b4fc' : isPartialPaid ? '#fbbf24' : isOverdue ? '#f87171' : '#c7d2fe';
            const dueDateCell = `<td style="color:${dateColor};font-weight:600;">${fmtDate(dueDate)}</td>`;

            if(isSubOfMulti){
                return `<tr style="background:${rowBg};${rowBL}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${i+1}</td>
                    ${dueDateCell}
                    <td style="color:#c4b5fd;">${chitAmt>0?fmtAmt(chitAmt):'—'}</td>
                </tr>`;
            }

            // Status badge based on aggregated totals
            let statusBadge;
            if(isFullPaid || (isAnyPaid && chitAmt===0)){
                statusBadge = `<span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">✅ Paid</span>`;
            } else if(isPartialPaid){
                statusBadge = `<span style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.35);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⚡ Partial</span>`;
            } else if(isOverdue){
                statusBadge = `<span style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">🔴 Overdue</span>`;
            } else {
                statusBadge = `<span style="background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:2px 6px;font-size:0.62rem;font-weight:800;">⏳ Pending</span>`;
            }

            const rs = span > 1 ? ` rowspan="${span}"` : '';
            const multiTag = isFirstOfMulti
                ? `<span style="display:block;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:4px;padding:1px 5px;font-size:0.58rem;font-weight:800;margin-top:2px;">×${matchPay.numMonths} months bulk</span>`
                : '';

            // ── Single payment row (no installments) ──────────────────────────
            if(!hasInstallments){
                const payDateCell    = matchPay ? `<span style="color:var(--text-dim);font-size:0.72rem;">${fmtDate(matchPay.date)}</span>` : `<span style="color:var(--text-dim);">—</span>`;
                const paidCell       = isAnyPaid && matchPay ? `<span style="color:${isPartialPaid?'#fbbf24':'#34d399'};font-weight:700;">${fmtAmt(totalPaidForSlot)}</span>` : `<span style="color:var(--text-dim);">—</span>`;
                const balCell        = latestBal>0 ? `<span style="color:#f59e0b;font-weight:700;">${fmtAmt(latestBal)}</span>` : `<span style="color:var(--text-dim);">—</span>`;
                const modeCell       = matchPay && matchPay.paidBy ? `<span style="color:var(--text-dim);font-size:0.7rem;">${matchPay.paidBy}</span>` : `<span style="color:var(--text-dim);">—</span>`;
                const cpPay          = slotMatchPays.find(p=>p.chitPicked==='Yes');
                const chitPickedCell = cpPay
                    ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:1px 6px;font-size:0.62rem;font-weight:800;">🏆 Picked</span>${cpPay.chitPickedBy?`<div style="font-size:0.6rem;color:var(--text-dim);margin-top:1px;">${cpPay.chitPickedBy}</div>`:''}`
                    : `<span style="color:var(--text-dim);">—</span>`;
                const editCell = !isMember && matchPay ? `<button class="btn-edit-sm" onclick="openEditPayment('${matchPay.id}')" style="font-size:0.62rem;padding:3px 7px;">Edit</button>` : '';
                return `<tr style="background:${rowBg};${rowBL}">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${i+1}</td>
                    ${dueDateCell}
                    <td style="color:#c4b5fd;">${chitAmt>0?fmtAmt(chitAmt):'—'}</td>
                    <td${rs} style="vertical-align:middle;">${payDateCell}${multiTag}</td>
                    <td${rs} style="vertical-align:middle;">${paidCell}</td>
                    <td${rs} style="vertical-align:middle;">${balCell}</td>
                    <td${rs} style="vertical-align:middle;">${statusBadge}</td>
                    <td${rs} style="vertical-align:middle;">${modeCell}</td>
                    <td${rs} style="vertical-align:middle;">${chitPickedCell}</td>
                    <td${rs} style="vertical-align:middle;">${editCell}</td>
                </tr>`;
            }

            // ── Multiple installments for this slot ───────────────────────────
            const instGroupId = `inst_${sectionId}_${i}`;
            const installmentSubRows = slotMatchPays.map((ip, idx)=>{
                const iPaid = parseFloat(ip.paid)||0;
                const iBal  = parseFloat(ip.balance)||0;
                const iMode = ip.paidBy||'—';
                const iEdit = !isMember ? `<button class="btn-edit-sm" onclick="openEditPayment('${ip.id}')" style="font-size:0.58rem;padding:2px 6px;">Edit</button>` : '';
                const iCp   = ip.chitPicked==='Yes';
                return `<tr class="inst-row inst-${instGroupId}" style="display:none;background:rgba(99,102,241,0.06);border-left:3px solid #6366f1;">
                    <td style="text-align:center;color:#818cf8;font-size:0.6rem;padding:4px 6px;font-weight:800;">↳${idx+1}</td>
                    <td style="font-size:0.65rem;color:#a5b4fc;padding:4px 6px;font-weight:700;">Installment ${idx+1}</td>
                    <td style="padding:4px 6px;"></td>
                    <td style="padding:4px 6px;font-size:0.7rem;color:var(--text-dim);">${fmtDate(ip.date)}</td>
                    <td style="padding:4px 6px;font-size:0.78rem;font-weight:800;color:${idx===slotMatchPays.length-1&&isFullPaid?'#34d399':'#fbbf24'};">${fmtAmt(iPaid)}</td>
                    <td style="padding:4px 6px;font-size:0.75rem;color:#f59e0b;">${iBal>0?fmtAmt(iBal):'—'}</td>
                    <td style="padding:4px 6px;font-size:0.65rem;color:var(--text-dim);">${iCp?'🏆':''}</td>
                    <td style="padding:4px 6px;font-size:0.65rem;color:var(--text-dim);">${iMode}</td>
                    <td style="padding:4px 6px;"></td>
                    <td style="padding:4px 6px;">${iEdit}</td>
                </tr>`;
            }).join('');

            const totalPaidCell = `<span style="color:${isFullPaid?'#34d399':'#fbbf24'};font-weight:700;">${fmtAmt(totalPaidForSlot)}</span>`;
            const instBadge     = `<span style="display:inline-block;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;border-radius:4px;padding:1px 5px;font-size:0.58rem;font-weight:800;margin-left:4px;vertical-align:middle;">${slotMatchPays.length} inst.</span>`;
            const finalBalCell  = latestBal>0 ? `<span style="color:#f59e0b;font-weight:700;">${fmtAmt(latestBal)}</span>` : `<span style="color:var(--text-dim);">—</span>`;
            const cpPay2        = slotMatchPays.find(p=>p.chitPicked==='Yes');
            const cpCell2       = cpPay2 ? `<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:1px 6px;font-size:0.62rem;font-weight:800;">🏆 Picked</span>` : `<span style="color:var(--text-dim);">—</span>`;
            const expandArrow   = `<span id="arr_${instGroupId}" style="font-size:0.7rem;color:#818cf8;transition:transform .2s;display:inline-block;">▶</span>`;

            return `<tr style="background:${rowBg};${rowBL};cursor:pointer;" onclick="toggleInstRows('${instGroupId}')">
                    <td style="text-align:center;color:var(--text-dim);font-weight:700;font-size:0.7rem;">${i+1}</td>
                    ${dueDateCell}
                    <td style="color:#c4b5fd;">${chitAmt>0?fmtAmt(chitAmt):'—'}</td>
                    <td style="vertical-align:middle;">${expandArrow}</td>
                    <td style="vertical-align:middle;">${totalPaidCell}${instBadge}</td>
                    <td style="vertical-align:middle;">${finalBalCell}</td>
                    <td style="vertical-align:middle;">${statusBadge}</td>
                    <td style="vertical-align:middle;color:var(--text-dim);font-size:0.65rem;">—</td>
                    <td style="vertical-align:middle;">${cpCell2}</td>
                    <td style="vertical-align:middle;"></td>
                </tr>${installmentSubRows}`;
        }).join('');

        // ── Count summary for schedule ────────────────────────────────────────
        const overdueCnt = allDueDates.filter((d,i)=>!paidSlotSet.has(i)&&d<today).length;
        const pendingCnt = allDueDates.filter((d,i)=>!paidSlotSet.has(i)&&d>=today).length;

        return `<div style="margin-bottom:16px;">
            <!-- Group Header -->
            <div style="background:#1c253b;border-radius:12px 12px 0 0;padding:12px 16px;border:1px solid var(--border);border-bottom:none;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                    <div>
                        <div style="font-size:1rem;font-weight:900;color:#f39c12;margin-bottom:6px;">
                            Group: ${grp.name}${labelBadge}${chitSlotBadge}
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#a5b4fc;">📅 Started: ${gStartDisplay}</span>
                            ${chitPickedPay?`<span style="background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:6px;padding:3px 9px;font-size:0.72rem;color:#34d399;">🏆 Chit Picked</span>`:''}
                        </div>
                    </div>

                </div>
                <!-- Progress bar -->
                <div style="margin-top:10px;">
                    <div style="background:#252f48;border-radius:5px;height:6px;overflow:hidden;">
                        <div style="height:100%;border-radius:5px;background:linear-gradient(90deg,#f39c12,#f57c00);width:${pct}%;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:0.65rem;color:var(--text-dim);">
                        <span>Month ${monthsDone}/${totalMonths} paid</span>
                        <span>${overdueCnt>0?`<span style="color:#f87171;">${overdueCnt} overdue</span> · `:''}${pendingCnt} upcoming</span>
                    </div>
                    ${(()=>{
                        const s=grp.startDate||grp.gStart;
                        if(!s||!totalMonths) return '';
                        const sd=new Date(s+'T00:00:00');
                        sd.setMonth(sd.getMonth()+totalMonths);
                        const pad=n=>String(n).padStart(2,'0');
                        const endStr=`${pad(sd.getDate())}/${pad(sd.getMonth()+1)}/${sd.getFullYear()}`;
                        return `<div style="font-size:0.65rem;color:#f87171;margin-top:4px;">🏁 Chit ends: ${endStr}</div>`;
                    })()}
                </div>
                <!-- Summary money chips -->
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <div style="flex:1;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.85rem;font-weight:800;color:#34d399;">${fmtAmt(tPaid)}</div>
                        <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Total Paid</div>
                    </div>
                    <div style="flex:1;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.85rem;font-weight:800;color:#f59e0b;">${(()=>{const nd=allDueDates.find((d,i)=>!fullyPaidSlotSet.has(i));return nd?fmtDate(nd):'--';})()}</div>
                        <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Next Due Date</div>
                    </div>
                    <div style="flex:1;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:8px;text-align:center;">
                        <div style="font-size:0.85rem;font-weight:800;color:#f87171;">${left} <span style="font-size:0.65rem;font-weight:600;">/ ${totalMonths}</span></div>
                        <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Pending</div>
                    </div>
                </div>
            </div>

            <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:0 0 12px 12px;overflow:hidden;">
                <!-- ── MERGED SCHEDULE + HISTORY ── -->
                <div onclick="toggleLedgerTable('${sectionId}',this)" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;user-select:none;border-bottom:1px solid var(--border);">
                    <span style="font-size:0.78rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:.5px;">📋 Schedule &amp; Payments (${totalMonths} months)</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:0.78rem;color:#34d399;font-weight:700;">${fmtAmt(tPaid)}</span>
                        ${tBal>0?`<span style="font-size:0.78rem;color:#f59e0b;font-weight:700;">${fmtAmt(tBal)} bal</span>`:''}
                        ${overdueCnt>0?`<span style="font-size:0.72rem;color:#f87171;font-weight:700;">${overdueCnt} overdue</span>`:''}
                        <span style="font-size:0.9rem;color:var(--text-dim);transition:transform .25s;" class="ledger-chevron">&#9654;</span>
                    </div>
                </div>
                <div id="${sectionId}" style="display:none;">
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                        <table class="table-custom">
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
                                <tr style="font-weight:800;background:rgba(255,255,255,.04);">
                                    <td colspan="4" style="color:var(--text-dim);">Total</td>
                                    <td style="color:#34d399;">${fmtAmt(tPaid)}</td>
                                    <td style="color:#f59e0b;">${tBal>0?fmtAmt(tBal):'—'}</td>
                                    <td colspan="4"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="padding:6px 14px 8px;font-size:0.65rem;color:var(--text-dim);border-top:1px solid var(--border);">
                        ✅ Paid &nbsp;|&nbsp; ⚡ Partial &nbsp;|&nbsp; 🔴 Overdue &nbsp;|&nbsp; ⏳ Pending
                    </div>
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

        const enrPays=mPays.filter(p=>{
            if(enr.enrollmentId&&p.enrollmentId) return p.enrollmentId===enr.enrollmentId;
            return p.groupId===enr.groupId;
        }).sort((a,b)=>(a.date||'').localeCompare(b.date||''));

        if(qty<=1){
            const id=`ledger_${sectionIdx++}`;
            return buildSection(grp, enr, enrPays, 1, 1, allDueDates, id);
        } else {
            return Array.from({length:qty},(_,i)=>{
                const slotNum=i+1;
                const slotPays=enrPays.filter(p=>{
                    if(p.slotNum!=null) return p.slotNum===slotNum;
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

function toggleInstRows(groupId){
    const rows = document.querySelectorAll('.inst-'+groupId);
    const arrow = document.getElementById('arr_'+groupId);
    const isOpen = rows.length && rows[0].style.display !== 'none';
    rows.forEach(r=>r.style.display=isOpen?'none':'table-row');
    if(arrow) arrow.style.transform = isOpen?'rotate(0deg)':'rotate(90deg)';
}

function toggleLedgerTable(id, header){
    const el=document.getElementById(id);
    if(!el) return;
    const chevron=header.querySelector('.ledger-chevron');
    const isOpen=el.style.display!=='none';
    el.style.display=isOpen?'none':'block';
    if(chevron) chevron.style.transform=isOpen?'rotate(0deg)':'rotate(90deg)';
}
