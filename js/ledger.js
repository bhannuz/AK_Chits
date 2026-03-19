// ═══════════════════════════════════════════════════════════
// AK Chit Funds — MEMBER LEDGER
// Edit only this file when changing loadMemberLedger — member payment display cards
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

    // ── Helper: next unpaid due date ─────────────────────────────────────
    function nextDueDate(allDueDates, paidSlotSet){
        const today = new Date().toISOString().split('T')[0];
        for(let i=0;i<allDueDates.length;i++){
            if(!paidSlotSet.has(i)) return {idx:i, date:allDueDates[i], overdue: allDueDates[i]<today};
        }
        return null;
    }

    // ── Build one group section per enrollment ───────────────────────────
    const groupSections = enrollments.map((enr,gi)=>{
        const grp=gs.find(g=>g.id===enr.groupId); if(!grp) return '';
        const qty=parseInt(enr.qty||1);
        const allPays=mPays.filter(p=>{
            if(enr.enrollmentId&&p.enrollmentId) return p.enrollmentId===enr.enrollmentId;
            return p.groupId===enr.groupId;
        }).sort((a,b)=>(a.date||'').localeCompare(b.date||''));

        const allDueDates=getGroupDueDates(grp);
        const totalMonths=parseInt(grp.duration||grp.gDuration)||21;
        let elapsed=0;
        if(grp.startDate||grp.gStart){
            const _s=new Date(grp.startDate||grp.gStart),_n=new Date();
            elapsed=Math.max(0,Math.min(totalMonths,(_n.getFullYear()-_s.getFullYear())*12+(_n.getMonth()-_s.getMonth())+1));
        }
        const monthsDone=allPays.reduce((s,p)=>s+(p.numMonths||1),0);
        const left=Math.max(0,totalMonths-monthsDone);
        const pct=Math.min(100,Math.round(monthsDone/totalMonths*100));
        const tPaid=allPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0);
        const tBal =allPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);

        // Build paid slot set for this enrollment
        const paidSlotSet=new Set();
        allPays.forEach(p=>{
            if(Array.isArray(p.monthSlots)) p.monthSlots.forEach(s=>paidSlotSet.add(s));
            else if(p.monthSlot!=null) paidSlotSet.add(p.monthSlot);
        });

        const nextDue = nextDueDate(allDueDates, paidSlotSet);
        const gStartDisplay=fmtDate(grp.startDate||grp.gStart||'');
        const multiMonthCount=allPays.filter(p=>p.numMonths&&p.numMonths>1).length;
        const chitPickedPay=allPays.find(p=>p.chitPicked==='Yes');
        const tableId=`ledgerTable_${gi}`;
        const showSlotCol=qty>1;
        const labelBadge=enr.label
            ?`<span style="background:rgba(243,156,18,.18);border:1px solid rgba(243,156,18,.35);border-radius:5px;padding:2px 8px;font-size:0.75rem;color:#f39c12;margin-left:6px;">${enr.label}</span>`:'';
        const qtyBadge=qty>1
            ?`<span style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);color:#fbbf24;border-radius:5px;padding:2px 8px;font-size:0.75rem;font-weight:800;margin-left:4px;">×${qty} chits</span>`:'';

        // ── CARD rows (mobile-first, replaces table) ──────────────────────
        const cardRows = allPays.map((p,idx)=>{
            const cp=p.chitPicked==='Yes';
            const isMulti=p.numMonths&&p.numMonths>1;
            const months=p.monthSlots||[];
            let monthLabel='—';
            if(isMulti&&months.length>0){
                const f=months[0]>=0&&allDueDates[months[0]]?fmtDate(allDueDates[months[0]]):'—';
                const l=months[months.length-1]>=0&&allDueDates[months[months.length-1]]?fmtDate(allDueDates[months[months.length-1]]):'—';
                monthLabel=`${f} → ${l}`;
            } else {
                const si=p.monthSlot!==undefined?p.monthSlot:getMonthSlot(allDueDates,p.date);
                monthLabel=si>=0&&allDueDates[si]?fmtDate(allDueDates[si]):'—';
            }
            const leftBorder=cp?'border-left:3px solid #10b981;':isMulti?'border-left:3px solid #818cf8;':'border-left:3px solid transparent;';
            const bgColor=cp?'rgba(16,185,129,0.06)':isMulti?'rgba(99,102,241,0.06)':'transparent';
            return `<div style="background:${bgColor};${leftBorder}border-bottom:1px solid rgba(255,255,255,0.06);padding:12px 14px;">
                <!-- Row top: month label + pay date + edit btn -->
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.85rem;font-weight:800;color:#a5b4fc;margin-bottom:2px;">
                            📅 ${monthLabel}
                            ${isMulti?`<span style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:4px;padding:1px 6px;font-size:0.72rem;margin-left:4px;">${p.numMonths} months</span>`:''}
                        </div>
                        <div style="font-size:0.78rem;color:var(--text-dim);">Paid on ${fmtDate(p.date)} ${p.paidBy?'· '+p.paidBy:''}</div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;align-items:center;">
                        ${cp?`<span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);border-radius:5px;padding:3px 8px;font-size:0.72rem;font-weight:800;">✅ Chit Picked</span>`:''}
                        ${!isMember?`<button class="btn-edit-sm" onclick="openEditPayment('${p.id}')" style="padding:5px 10px;font-size:0.78rem;">✏️</button>`:''}
                    </div>
                </div>
                <!-- Row bottom: amount chips -->
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <div style="background:var(--input-bg);border-radius:8px;padding:6px 12px;text-align:center;min-width:80px;">
                        <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;margin-bottom:2px;">Monthly</div>
                        <div style="font-size:0.92rem;font-weight:800;color:#c4b5fd;">${fmtAmt(p.chit)}${isMulti?`<span style="font-size:0.68rem;color:var(--text-dim);display:block;">/mo ×${p.numMonths}</span>`:''}</div>
                    </div>
                    <div style="background:var(--input-bg);border-radius:8px;padding:6px 12px;text-align:center;min-width:80px;">
                        <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;margin-bottom:2px;">Paid</div>
                        <div style="font-size:0.92rem;font-weight:800;color:#34d399;">${fmtAmt(p.paid)}</div>
                    </div>
                    ${(parseFloat(p.balance)||0)>0?`<div style="background:var(--input-bg);border-radius:8px;padding:6px 12px;text-align:center;min-width:80px;">
                        <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;margin-bottom:2px;">Balance</div>
                        <div style="font-size:0.92rem;font-weight:800;color:#f59e0b;">${fmtAmt(p.balance)}</div>
                    </div>`:''}
                    ${cp&&p.chitPickedBy?`<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:6px 12px;">
                        <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;margin-bottom:2px;">Chit Value</div>
                        <div style="font-size:0.88rem;font-weight:800;color:#34d399;">${p.chitPickedBy}</div>
                    </div>`:''}
                </div>
            </div>`;
        }).join('');

        // ── Next payment due banner ───────────────────────────────────────
        const nextDueBanner = nextDue
            ? `<div style="background:${nextDue.overdue?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'};border:1px solid ${nextDue.overdue?'rgba(239,68,68,0.3)':'rgba(99,102,241,0.3)'};border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">
                <div style="font-size:1.4rem;">${nextDue.overdue?'⚠️':'📅'}</div>
                <div>
                    <div style="font-size:0.72rem;font-weight:800;color:${nextDue.overdue?'#f87171':'#a5b4fc'};text-transform:uppercase;letter-spacing:.5px;">${nextDue.overdue?'Payment Overdue':'Next Payment Due'}</div>
                    <div style="font-size:1rem;font-weight:900;color:${nextDue.overdue?'#f87171':'white'};margin-top:2px;">${fmtDate(nextDue.date)}</div>
                    ${grp.dueDay?`<div style="font-size:0.75rem;color:var(--text-dim);margin-top:1px;">Every ${grp.dueDay}${['st','nd','rd'][((grp.dueDay%100-11)%10)-1]||'th'} of the month</div>`:''}
                </div>
            </div>`
            : `<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
                <span style="font-size:1.3rem;">🎉</span>
                <span style="font-size:0.9rem;font-weight:800;color:#34d399;">All months paid! Chit complete.</span>
            </div>`;

        return `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:16px;">

            <!-- ── GROUP HEADER ── -->
            <div style="background:#1c253b;padding:14px 16px;border-bottom:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <div style="font-size:1rem;font-weight:900;color:#f39c12;">📂 ${grp.name}${labelBadge}${qtyBadge}</div>
                    ${!isMember?`<button class="btn-edit-sm" onclick="openEditMember('${m.id}')" style="font-size:0.78rem;padding:5px 10px;flex-shrink:0;">✏️ Edit</button>`:''}
                </div>

                <!-- Started + Due day info -->
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                    <span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:#a5b4fc;font-weight:600;">🗓 Started ${gStartDisplay}</span>
                    ${grp.dueDay?`<span style="background:rgba(243,156,18,.12);border:1px solid rgba(243,156,18,.3);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:#f39c12;font-weight:600;">📅 Due ${grp.dueDay}${['st','nd','rd'][((grp.dueDay%100-11)%10)-1]||'th'} every month</span>`:''}
                    ${chitPickedPay?`<span style="background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:#34d399;font-weight:700;">✅ Chit Picked</span>`:''}
                    ${multiMonthCount>0?`<span style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:#a5b4fc;">📦 ${multiMonthCount} bulk</span>`:''}
                </div>

                <!-- Progress bar with clear label -->
                <div style="margin-bottom:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                        <span style="font-size:0.78rem;color:var(--text-dim);">Progress</span>
                        <span style="font-size:0.88rem;font-weight:800;color:white;">${monthsDone} of ${totalMonths} months paid</span>
                    </div>
                    <div style="background:#252f48;border-radius:6px;height:8px;overflow:hidden;">
                        <div style="height:100%;border-radius:6px;background:linear-gradient(90deg,#f39c12,#f57c00);width:${pct}%;transition:width .5s;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;">
                        <span style="font-size:0.75rem;color:#34d399;font-weight:700;">${monthsDone} paid ✓</span>
                        <span style="font-size:0.75rem;color:${left>0?'#f59e0b':'#34d399'};font-weight:700;">${left>0?left+' months remaining':'All done! 🎉'}</span>
                    </div>
                </div>

                <!-- Money summary chips -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
                    <div style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);border-radius:10px;padding:10px 12px;">
                        <div style="font-size:0.7rem;color:#34d399;text-transform:uppercase;font-weight:700;margin-bottom:3px;">💰 Total Paid</div>
                        <div style="font-size:1.05rem;font-weight:900;color:#34d399;">${fmtAmt(tPaid)}</div>
                    </div>
                    <div style="background:${tBal>0?'rgba(245,158,11,0.1)':'rgba(52,211,153,0.06)'};border:1px solid ${tBal>0?'rgba(245,158,11,0.25)':'rgba(52,211,153,0.2)'};border-radius:10px;padding:10px 12px;">
                        <div style="font-size:0.7rem;color:${tBal>0?'#f59e0b':'#34d399'};text-transform:uppercase;font-weight:700;margin-bottom:3px;">${tBal>0?'⚠️ Balance Due':'✅ Balance'}</div>
                        <div style="font-size:1.05rem;font-weight:900;color:${tBal>0?'#f59e0b':'#34d399'};">${fmtAmt(tBal)}</div>
                    </div>
                </div>
            </div>

            <!-- ── NEXT DUE BANNER ── -->
            <div style="padding:12px 14px 4px;">
                ${nextDueBanner}
            </div>

            <!-- ── PAYMENT HISTORY (collapsible) ── -->
            <div>
                <div onclick="toggleLedgerTable('${tableId}',this)" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;user-select:none;border-top:1px solid var(--border);">
                    <span style="font-size:0.85rem;font-weight:800;color:white;">Payment History</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:0.78rem;color:var(--text-dim);">${allPays.length} entries</span>
                        <span style="font-size:1rem;color:#f39c12;font-weight:700;transition:transform .25s;" class="ledger-chevron">▼</span>
                    </div>
                </div>
                <div id="${tableId}" style="display:none;border-top:1px solid var(--border);">
                    ${allPays.length
                        ? cardRows + `<div style="display:flex;justify-content:space-between;background:rgba(255,255,255,.03);padding:12px 16px;border-top:1px solid var(--border);">
                            <span style="font-size:0.82rem;font-weight:800;color:var(--text-dim);">Total (${allPays.length} entries)</span>
                            <div style="display:flex;gap:12px;">
                                <span style="font-size:0.88rem;font-weight:800;color:#34d399;">${fmtAmt(tPaid)}</span>
                                ${tBal>0?`<span style="font-size:0.88rem;font-weight:800;color:#f59e0b;">bal ${fmtAmt(tBal)}</span>`:''}
                            </div>
                          </div>`
                        : `<div style="text-align:center;color:var(--text-dim);padding:24px;font-size:0.9rem;">No payments recorded yet</div>`
                    }
                    ${multiMonthCount>0?`<div style="padding:8px 14px 10px;font-size:0.75rem;color:#a5b4fc;border-top:1px solid var(--border);background:rgba(99,102,241,0.05);">
                        🟣 Purple background = multi-month bulk payment
                    </div>`:''}
                </div>
            </div>
        </div>`;
    }).join('');

    // ── Top member summary bar ──────────────────────────────────────────
    const ledgerHtml = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-top:6px;">
            <div style="width:48px;height:48px;border-radius:13px;background:linear-gradient(135deg,rgba(243,156,18,.25),rgba(243,156,18,.08));border:2px solid rgba(243,156,18,.4);color:#f39c12;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:900;flex-shrink:0;">${ini(m.name)}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:1.1rem;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name}</div>
                <div style="font-size:0.78rem;color:var(--text-dim);margin-top:1px;">${mPays.length} payment${mPays.length!==1?'s':''} · ${memberGroups.length} group${memberGroups.length!==1?'s':''}</div>
            </div>
            ${!isMember?`<button onclick="printMemberStatement('${mid}')" style="background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;padding:9px 14px;font-size:0.85rem;font-weight:800;border:none;border-radius:10px;cursor:pointer;flex-shrink:0;">🖨️ Print</button>`
            :`<button onclick="printMemberStatement('${mid}')" style="background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;padding:9px 14px;font-size:0.85rem;font-weight:800;border:none;border-radius:10px;cursor:pointer;flex-shrink:0;">🖨️ Print</button>`}
        </div>
        ${groupSections||'<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:0.95rem;">No payments yet</div>'}
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

// Also fix toggleLedgerTable chevron direction
function toggleLedgerTable(id, header){
    const el=document.getElementById(id);
    if(!el)return;
    const chevron=header.querySelector('.ledger-chevron');
    const isOpen=el.style.display!=='none';
    el.style.display=isOpen?'none':'block';
    if(chevron)chevron.style.transform=isOpen?'rotate(0deg)':'rotate(-90deg)';
}
