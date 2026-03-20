// ═══════════════════════════════════════════════════════════
// AK Chit Funds — DATA BACKUP / RESTORE + WHATSAPP REMINDERS
// Edit only this file when changing backup, restore, or reminders
// ═══════════════════════════════════════════════════════════

// ══════════════════════════════════════════
// BACKUP / RESTORE
// ══════════════════════════════════════════
async function exportFullBackup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const d={m:await getCollection('members'),g:await getCollection('groups'),p:await getCollection('payments')};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
    a.download=`AK_Chit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('✅ Backup downloaded!');
}

async function exportToExcel(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    showToast('⏳ Generating Excel…',true);
    const members=await getCollection('members');
    const groups=await getCollection('groups');
    const payments=await getCollection('payments');
    const wb=XLSX.utils.book_new();
    const today=new Date().toISOString().split('T')[0];

    const mRows=members.map(m=>({'Name':m.name||'','Phone':m.phone||'','Groups':((m.groupIds||[]).map(gid=>{const g=groups.find(x=>x.id===gid);return g?g.name:gid;})).join(', ')}));
    const wsM=XLSX.utils.json_to_sheet(mRows.length?mRows:[{'Name':'','Phone':'','Groups':''}]);
    wsM['!cols']=[{wch:28},{wch:16},{wch:40}];
    XLSX.utils.book_append_sheet(wb,wsM,'Members');

    const gRows=groups.map(g=>{
        const gPays=payments.filter(p=>p.groupId===g.id);
        const gMs=members.filter(m=>m.groupIds&&m.groupIds.includes(g.id));
        return{'Group Name':g.name||'','Duration (Months)':g.duration||g.gDuration||'','Start Date':g.startDate||g.gStart||'','Due Day':g.dueDay||'','Members':gMs.length,'Total Collected':gPays.reduce((s,p)=>s+(parseFloat(p.paid)||0),0),'Total Balance':gPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0),'Chits Picked':gPays.filter(p=>p.chitPicked==='Yes').length};
    });
    const wsG=XLSX.utils.json_to_sheet(gRows.length?gRows:[{}]);
    wsG['!cols']=[{wch:24},{wch:18},{wch:14},{wch:10},{wch:10},{wch:18},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb,wsG,'Groups');

    const pRows=payments.map(p=>{
        const m=members.find(x=>x.id===p.memberId);
        const g=groups.find(x=>x.id===p.groupId);
        return{'Date':p.date||'','Member':m?m.name:'Unknown','Phone':m?m.phone||'':'','Group':g?g.name:'Unknown','Chit/Month':parseFloat(p.chit)||0,'Months':p.numMonths||1,'Total Paid':parseFloat(p.paid)||0,'Balance':parseFloat(p.balance)||0,'Mode':p.paidBy||'','Chit Picked':p.chitPicked||'No','Chit Picked Value':p.chitPickedBy||''};
    }).sort((a,b)=>a['Date'].localeCompare(b['Date']));
    const wsP=XLSX.utils.json_to_sheet(pRows.length?pRows:[{}]);
    wsP['!cols']=[{wch:12},{wch:24},{wch:14},{wch:20},{wch:12},{wch:8},{wch:12},{wch:12},{wch:14},{wch:12},{wch:18}];
    XLSX.utils.book_append_sheet(wb,wsP,'All Payments');

    const sumRows=[];
    members.forEach(m=>{
        (m.groupIds||[]).forEach(gid=>{
            const g=groups.find(x=>x.id===gid);
            const mp=payments.filter(p=>p.memberId===m.id&&p.groupId===gid);
            const pickedPay=mp.find(p=>p.chitPicked==='Yes');
            sumRows.push({'Member':m.name||'','Phone':m.phone||'','Group':g?g.name:'','Months Paid':mp.reduce((s,p)=>s+(p.numMonths||1),0),'Total Paid':mp.reduce((s,p)=>s+(parseFloat(p.paid)||0),0),'Total Balance':mp.reduce((s,p)=>s+(parseFloat(p.balance)||0),0),'Chit Picked':pickedPay?'Yes':'No','Chit Picked Value':pickedPay?pickedPay.chitPickedBy||'':'','Last Payment':mp.length?mp.sort((a,b)=>b.date.localeCompare(a.date))[0].date:''});
        });
    });
    const wsS=XLSX.utils.json_to_sheet(sumRows.length?sumRows:[{}]);
    wsS['!cols']=[{wch:24},{wch:14},{wch:20},{wch:12},{wch:12},{wch:14},{wch:12},{wch:18},{wch:14}];
    XLSX.utils.book_append_sheet(wb,wsS,'Member Summary');

    XLSX.writeFile(wb,`AKChitFunds_Export_${today}.xlsx`);
    showToast('✅ Excel exported!');
}

function confirmRestore(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const file=document.getElementById('restoreFile').files[0];
    if(!file)return showToast('❌ Select a backup file first',false);
    showConfirm('🔄','Restore All Data?','This will overwrite ALL existing data.',()=>executeRestore());
}

async function executeRestore(){
    const file=document.getElementById('restoreFile').files[0];if(!file)return;
    showToast('⏳ Restoring…',true);
    const reader=new FileReader();
    reader.onload=async(e)=>{
        try{
            const data=JSON.parse(e.target.result);
            const delCol=async(col)=>{const s=await db.collection(col).get();const batch=db.batch();s.docs.forEach(d=>batch.delete(d.ref));if(s.docs.length)await batch.commit();};
            await delCol('members');await delCol('groups');await delCol('payments');
            let count=0;
            if(data.m)for(let x of data.m){const {id,...rest}=x;await db.collection('members').doc(id).set(rest);count++;}
            if(data.g)for(let x of data.g){const {id,...rest}=x;await db.collection('groups').doc(id).set(rest);count++;}
            if(data.p)for(let x of data.p){const {id,...rest}=x;await db.collection('payments').doc(id).set(rest);count++;}
            bustCache('members');bustCache('groups');bustCache('payments');
            showToast(`✅ Restored ${count} records!`);
            updateUI();
        }catch(err){console.error(err);showToast('❌ Invalid backup file',false);}
    };
    reader.readAsText(file);
}

// Stubs so init.js references don't error
function loadEmailConfigToForm(){}
function updateBackupStatusUI(){}
function checkAndShowBackupReminder(){
    // restore contact field if saved
    const saved = localStorage.getItem('akdf_wa_contact');
    const el = document.getElementById('wa_contact');
    if(saved && el) el.value = saved;
}

// ══════════════════════════════════════════
// WHATSAPP REMINDER SYSTEM
// No API · No approval · Works instantly
// ══════════════════════════════════════════

// Build professional WhatsApp message for a member
function buildWhatsAppMessage(memberName, items, contactNumber){
    const date = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

    let msg = `Dear *${memberName}*,\n\n`;
    msg += `Greetings from *AK Chit Funds*! 🙏\n\n`;
    msg += `This is a friendly reminder regarding your pending chit payment${items.length>1?'s':''}.\n\n`;

    items.forEach((it, i) => {
        if(items.length > 1) msg += `*${i+1}. ${it.groupName}*\n`;
        else msg += `*Group: ${it.groupName}*\n`;

        if(it.chitAmt > 0){
            msg += `   Monthly Amount : ₹${it.chitAmt.toLocaleString('en-IN')}\n`;
        }
        msg += `   Months Pending : *${it.monthsPending}*\n`;
        if(it.totalBal > 0){
            msg += `   Outstanding Bal: *₹${it.totalBal.toLocaleString('en-IN')}*\n`;
        }
        if(it.nextDueDate){
            msg += `   Next Due Date  : ${fmtDate(it.nextDueDate)}\n`;
        }
        if(i < items.length - 1) msg += '\n';
    });

    msg += `\nKindly arrange the payment at the earliest to keep your chit account up to date.\n\n`;

    if(contactNumber){
        msg += `For any queries, please contact us at *${contactNumber}*.\n\n`;
    }

    msg += `Thank you for your continued trust in AK Chit Funds! 🏆\n`;
    msg += `_${date}_`;

    return msg;
}

// Build due list from Firestore data
async function buildDueList(){
    const members  = await getCollection('members');
    const groups   = await getCollection('groups');
    const payments = await getCollection('payments');
    const byMember = {};

    members.forEach(m => {
        const phone = (m.phone||'').replace(/\D/g,'').slice(-10);
        if(!phone || phone.length < 10) return;

        let enrollments = m.enrollments;
        if(!enrollments||!enrollments.length)
            enrollments=(m.groupIds||[]).map(gid=>({enrollmentId:'',groupId:gid,label:'',qty:1}));

        enrollments.forEach(enr => {
            const grp = groups.find(g=>g.id===enr.groupId); if(!grp) return;
            const qty = parseInt(enr.qty||1);
            const totalMonths = parseInt(grp.duration||grp.gDuration)||21;
            const allDueDates = getGroupDueDates(grp);

            const enrPays = payments.filter(p => {
                if(p.memberId!==m.id) return false;
                if(enr.enrollmentId&&p.enrollmentId) return p.enrollmentId===enr.enrollmentId;
                return p.groupId===enr.groupId;
            });

            for(let slot=1; slot<=qty; slot++){
                const slotPays = qty>1
                    ? enrPays.filter(p => p.slotNum!=null ? p.slotNum===slot : slot===1)
                    : enrPays;

                const monthsPaid    = slotPays.reduce((s,p)=>s+(p.numMonths||1),0);
                const totalBal      = slotPays.reduce((s,p)=>s+(parseFloat(p.balance)||0),0);
                const monthsPending = Math.max(0, totalMonths - monthsPaid);
                if(monthsPending === 0 && totalBal === 0) continue;

                // Find next unpaid due date
                const paidSlotSet = new Set();
                slotPays.forEach(p=>{
                    if(Array.isArray(p.monthSlots)) p.monthSlots.forEach(s=>paidSlotSet.add(s));
                    else if(p.monthSlot!=null) paidSlotSet.add(p.monthSlot);
                });
                let nextDueDate = '';
                for(let i=0;i<allDueDates.length;i++){
                    if(!paidSlotSet.has(i)){ nextDueDate=allDueDates[i]; break; }
                }

                const lastPay = slotPays.length ? slotPays[slotPays.length-1] : null;
                const chitAmt = lastPay ? (parseFloat(lastPay.chit)||0) : 0;
                const label   = qty>1 ? ` (Chit ${slot})` : (enr.label?` (${enr.label})`:'');

                if(!byMember[m.id]){
                    byMember[m.id] = { name: m.name||'Member', phone, items:[] };
                }
                byMember[m.id].items.push({
                    groupName: grp.name + label,
                    monthsPending,
                    totalBal,
                    chitAmt,
                    nextDueDate,
                });
            }
        });
    });

    return Object.values(byMember);
}

// Generate WhatsApp reminder cards
async function generateWhatsAppReminders(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}

    const contact = document.getElementById('wa_contact').value.trim();
    if(contact) localStorage.setItem('akdf_wa_contact', contact);

    const countEl = document.getElementById('waReminderCount');
    const listEl  = document.getElementById('waReminderList');
    countEl.textContent = '⏳ Loading members...';
    countEl.style.color = 'var(--text-dim)';
    listEl.innerHTML = '';

    const entries = await buildDueList();

    if(!entries.length){
        countEl.textContent = '🎉 No pending dues — all members are up to date!';
        countEl.style.color = '#34d399';
        return;
    }

    countEl.textContent = `${entries.length} member${entries.length!==1?'s':''} have pending dues`;
    countEl.style.color = '#f59e0b';

    // Build cards using DOM API — safe against special chars in names/messages
    entries.forEach(function(entry, i){
        var msg          = buildWhatsAppMessage(entry.name, entry.items, contact);
        var waUrl        = 'https://wa.me/91' + entry.phone + '?text=' + encodeURIComponent(msg);
        var totalPending = entry.items.reduce(function(s,it){return s+it.monthsPending;},0);
        var totalBal     = entry.items.reduce(function(s,it){return s+it.totalBal;},0);
        var groups       = entry.items.map(function(it){return it.groupName;}).join(' · ');
        var initials     = (entry.name||'?').split(' ').map(function(x){return x[0]||'';}).join('').toUpperCase().slice(0,2)||'??';

        // Outer card
        var card = document.createElement('div');
        card.style.cssText = 'background:var(--input-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden;';

        // ── Info row ──
        var infoRow = document.createElement('div');
        infoRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border);';

        var avatar = document.createElement('div');
        avatar.style.cssText = 'width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;display:flex;align-items:center;justify-content:center;font-size:0.88rem;font-weight:900;flex-shrink:0;';
        avatar.textContent = initials;

        var info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        info.innerHTML =
            '<div style="font-weight:800;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>' +
            '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:1px;"></div>' +
            '<div style="font-size:0.68rem;color:#a5b4fc;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>';
        info.children[0].textContent = entry.name;
        info.children[1].textContent = '📱 +91 ' + entry.phone;
        info.children[2].textContent = groups;

        var meta = document.createElement('div');
        meta.style.cssText = 'text-align:right;flex-shrink:0;';
        var pendingDiv = document.createElement('div');
        pendingDiv.style.cssText = 'font-size:0.82rem;font-weight:800;color:#f59e0b;';
        pendingDiv.textContent = totalPending + ' month' + (totalPending!==1?'s':'');
        meta.appendChild(pendingDiv);
        if(totalBal > 0){
            var balDiv = document.createElement('div');
            balDiv.style.cssText = 'font-size:0.7rem;color:#f87171;font-weight:700;';
            balDiv.textContent = '₹' + totalBal.toLocaleString('en-IN') + ' bal';
            meta.appendChild(balDiv);
        }

        infoRow.appendChild(avatar);
        infoRow.appendChild(info);
        infoRow.appendChild(meta);

        // ── Action row ──
        var actionRow = document.createElement('div');
        actionRow.style.cssText = 'display:flex;';

        var previewBtn = document.createElement('button');
        previewBtn.style.cssText = 'flex:1;background:transparent;border:none;border-right:1px solid var(--border);color:var(--text-dim);padding:12px 10px;font-size:0.78rem;font-weight:700;cursor:pointer;';
        previewBtn.textContent = '👁 Preview';
        var prevId = 'waprev_' + i;
        previewBtn.onclick = function(){ toggleWaPreview(prevId); };

        var waLink = document.createElement('a');
        waLink.href = waUrl;
        waLink.target = '_blank';
        waLink.style.cssText = 'flex:2;background:linear-gradient(135deg,#25D366,#128C7E);color:white;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 10px;font-size:0.88rem;font-weight:800;';
        waLink.textContent = '💬 Open in WhatsApp';

        actionRow.appendChild(previewBtn);
        actionRow.appendChild(waLink);

        // ── Preview pane (hidden) ──
        var previewPane = document.createElement('div');
        previewPane.id = prevId;
        previewPane.style.cssText = 'display:none;background:rgba(37,211,102,0.05);border-top:1px solid var(--border);padding:12px 14px;';
        var previewLabel = document.createElement('div');
        previewLabel.style.cssText = 'font-size:0.68rem;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;';
        previewLabel.textContent = 'Message Preview';
        var previewText = document.createElement('pre');
        previewText.style.cssText = 'font-size:0.72rem;color:var(--text-dim);white-space:pre-wrap;margin:0;font-family:inherit;line-height:1.6;';
        previewText.textContent = msg; // textContent is XSS-safe
        previewPane.appendChild(previewLabel);
        previewPane.appendChild(previewText);

        card.appendChild(infoRow);
        card.appendChild(actionRow);
        card.appendChild(previewPane);
        listEl.appendChild(card);
    });

    showToast('✅ ' + entries.length + ' reminders ready — tap WhatsApp to send');
}

function toggleWaPreview(id){
    const el=document.getElementById(id);
    if(el) el.style.display = el.style.display==='none' ? 'block' : 'none';
}
