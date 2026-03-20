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

    listEl.innerHTML = entries.map((entry, i) => {
        const msg    = buildWhatsAppMessage(entry.name, entry.items, contact);
        const waUrl  = `https://wa.me/91${entry.phone}?text=${encodeURIComponent(msg)}`;
        const totalPending = entry.items.reduce((s,it)=>s+it.monthsPending,0);
        const totalBal     = entry.items.reduce((s,it)=>s+it.totalBal,0);
        const groups = entry.items.map(it=>it.groupName).join(' · ');

        return `<div style="background:var(--input-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden;">
            <!-- Member info row -->
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border);">
                <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#f39c12,#f57c00);color:#000;display:flex;align-items:center;justify-content:center;font-size:0.88rem;font-weight:900;flex-shrink:0;">${ini(entry.name)}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.name}</div>
                    <div style="font-size:0.7rem;color:var(--text-dim);margin-top:1px;">📱 +91 ${entry.phone}</div>
                    <div style="font-size:0.68rem;color:#a5b4fc;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${groups}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.82rem;font-weight:800;color:#f59e0b;">${totalPending} month${totalPending!==1?'s':''}</div>
                    ${totalBal>0?`<div style="font-size:0.7rem;color:#f87171;font-weight:700;">₹${totalBal.toLocaleString('en-IN')} bal</div>`:''}
                </div>
            </div>
            <!-- Action row -->
            <div style="display:flex;gap:0;">
                <button onclick="toggleWaPreview('waprev_${i}')" style="flex:1;background:transparent;border:none;border-right:1px solid var(--border);color:var(--text-dim);padding:10px;font-size:0.72rem;font-weight:700;cursor:pointer;">
                    👁 Preview
                </button>
                <a href="${waUrl}" target="_blank" style="flex:2;background:linear-gradient(135deg,#25D366,#128C7E);color:white;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;font-size:0.82rem;font-weight:800;">
                    💬 Open in WhatsApp
                </a>
            </div>
            <!-- Message preview (hidden by default) -->
            <div id="waprev_${i}" style="display:none;background:rgba(37,211,102,0.05);border-top:1px solid var(--border);padding:12px 14px;">
                <div style="font-size:0.68rem;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Message Preview</div>
                <pre style="font-size:0.72rem;color:var(--text-dim);white-space:pre-wrap;margin:0;font-family:inherit;line-height:1.6;">${msg.replace(/</g,'&lt;').replace(/\*/g,'')}</pre>
            </div>
        </div>`;
    }).join('');

    showToast(`✅ ${entries.length} reminders ready — tap WhatsApp to send`);
}

function toggleWaPreview(id){
    const el=document.getElementById(id);
    if(el) el.style.display = el.style.display==='none' ? 'block' : 'none';
}
