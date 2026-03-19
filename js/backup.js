// ═══════════════════════════════════════════════════════════
// AK Chit Funds — DATA BACKUP / RESTORE
// Edit only this file when changing JSON backup, Excel export, restore, auto-backup
// ═══════════════════════════════════════════════════════════

// BACKUP / RESTORE
// ══════════════════════════════════════════
async function exportFullBackup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const d={m:await getCollection('members'),g:await getCollection('groups'),p:await getCollection('payments')};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
    a.download=`AK_Chit_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();showToast('✅ Backup downloaded!');
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
            showToast(`✅ Restored ${count} records!`);updateUI();
        }catch(err){console.error(err);showToast('❌ Invalid backup file',false);}
    };
    reader.readAsText(file);
}

// ══════════════════════════════════════════

// AUTO BACKUP — EMAIL (EmailJS)
// ══════════════════════════════════════════
const BACKUP_HISTORY_KEY = 'akdf_backup_history';
const BACKUP_LAST_DATE_KEY = 'akdf_last_backup_date';
const EMAIL_CONFIG_KEY = 'akdf_email_config';

function getEmailConfig(){
    try{ return JSON.parse(localStorage.getItem(EMAIL_CONFIG_KEY))||{}; }catch(e){ return {}; }
}

function saveEmailConfig(){
    const cfg = {
        publicKey: document.getElementById('ejs_pubkey').value.trim(),
        serviceId: document.getElementById('ejs_service').value.trim(),
        templateId: document.getElementById('ejs_template').value.trim(),
        toEmail: document.getElementById('ejs_to_email').value.trim()
    };
    if(!cfg.publicKey||!cfg.serviceId||!cfg.templateId||!cfg.toEmail){
        showToast('❌ Fill all 4 fields', false); return;
    }
    localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(cfg));
    document.getElementById('emailConfigStatus').textContent = '✅ Config saved! EmailJS ready.';
    document.getElementById('emailConfigStatus').style.color = '#34d399';
    showToast('✅ Email config saved!');
    // Init EmailJS with new key
    emailjs.init(cfg.publicKey);
}

function loadEmailConfigToForm(){
    const cfg = getEmailConfig();
    if(cfg.publicKey) document.getElementById('ejs_pubkey').value = cfg.publicKey;
    if(cfg.serviceId) document.getElementById('ejs_service').value = cfg.serviceId;
    if(cfg.templateId) document.getElementById('ejs_template').value = cfg.templateId;
    if(cfg.toEmail) document.getElementById('ejs_to_email').value = cfg.toEmail;
    if(cfg.publicKey){
        document.getElementById('emailConfigStatus').textContent = '✅ Config loaded';
        document.getElementById('emailConfigStatus').style.color = '#34d399';
    }
}

function getBackupHistory(){
    try{ return JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY))||[]; }catch(e){ return []; }
}

function saveBackupHistory(history){
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history.slice(0,7)));
}

function renderBackupHistory(){
    const history = getBackupHistory();
    const el = document.getElementById('backupHistoryList');
    if(!el) return;
    if(!history.length){
        el.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:0.98rem;padding:12px;">No backups sent yet</div>';
        return;
    }
    el.innerHTML = history.map(h => `
        <div class="backup-history-item">
            <div>
                <div style="font-size:1rem;font-weight:700;">${h.date}</div>
                <div style="font-size:0.92rem;color:var(--text-dim);margin-top:2px;">${h.members} members · ${h.groups} groups · ${h.payments} payments</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:1.05rem;font-weight:700;color:${h.status==='sent'?'#34d399':'#f87171'};">${h.status==='sent'?'✅ Sent':'❌ Failed'}</div>
                <div style="font-size:0.98rem;color:var(--text-dim);">${h.time}</div>
            </div>
        </div>`).join('');
}

function updateBackupStatusUI(){
    const lastDate = localStorage.getItem(BACKUP_LAST_DATE_KEY)||'';
    const today = new Date().toISOString().split('T')[0];
    const history = getBackupHistory();
    const badge = document.getElementById('backupStatusBadge');
    const reminderBtn = document.getElementById('backupReminderBtn');
    const lastEl = document.getElementById('lastBackupDate');
    const countEl = document.getElementById('totalBackupCount');

    const sentHistory = history.filter(h=>h.status==='sent');
    if(lastEl) lastEl.textContent = sentHistory.length ? sentHistory[0].date : '—';
    if(countEl) countEl.textContent = sentHistory.length;

    if(lastDate === today){
        if(badge){ badge.textContent='✅ Done today'; badge.style.background='rgba(16,185,129,.15)'; badge.style.color='#34d399'; badge.style.borderColor='rgba(16,185,129,.35)'; }
        if(reminderBtn){ reminderBtn.style.display='none'; }
    } else {
        if(badge){ badge.textContent='⚠️ Not done today'; badge.style.background='rgba(239,68,68,.15)'; badge.style.color='#f87171'; badge.style.borderColor='rgba(239,68,68,.3)'; }
        // Only show reminder badge if email is configured
        const cfg = getEmailConfig();
        if(reminderBtn && cfg.publicKey){ reminderBtn.style.display='inline-flex'; reminderBtn.classList.remove('done'); }
    }
    renderBackupHistory();
}

async function sendEmailBackup(manual=false){
    const cfg = getEmailConfig();
    if(!cfg.publicKey || !cfg.serviceId || !cfg.templateId || !cfg.toEmail){
        if(manual){
            showToast('❌ Configure email settings first', false);
            if(document.getElementById('backupTab')) switchTab('backup');
        }
        return;
    }

    showToast('⏳ Preparing backup email…', true);
    try{
        const members = await getCollection('members');
        const groups = await getCollection('groups');
        const payments = await getCollection('payments');

        const backupData = JSON.stringify({m:members, g:groups, p:payments}, null, 2);
        const today = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
        const dateDisp = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

        // EmailJS has a ~50KB limit per template variable.
        // We send a summary + note to download from app if data is large.
        const isLarge = backupData.length > 40000;
        const dataToSend = isLarge
            ? `[DATA TOO LARGE FOR EMAIL — ${Math.round(backupData.length/1024)}KB]

Summary:
Members: ${members.length}
Groups: ${groups.length}
Payments: ${payments.length}

Please use the app's "Download JSON Backup" button to get the full file.`
            : backupData;

        emailjs.init(cfg.publicKey);
        await emailjs.send(cfg.serviceId, cfg.templateId, {
            backup_date: dateDisp,
            member_count: members.length,
            group_count: groups.length,
            payment_count: payments.length,
            backup_data: dataToSend,
            to_email: cfg.toEmail,
            app_name: 'AK Chit Funds'
        });

        // Mark done
        localStorage.setItem(BACKUP_LAST_DATE_KEY, today);
        const history = getBackupHistory();
        history.unshift({ date: dateDisp, time: timeStr, members: members.length, groups: groups.length, payments: payments.length, status: 'sent' });
        saveBackupHistory(history);
        updateBackupStatusUI();

        // Update reminder badge
        const reminderBtn = document.getElementById('backupReminderBtn');
        if(reminderBtn){ reminderBtn.style.display='none'; }

        showToast('✅ Backup email sent to ' + cfg.toEmail);
    } catch(err){
        console.error('EmailJS error:', err);
        // Log failure in history
        const today = new Date().toISOString().split('T')[0];
        const history = getBackupHistory();
        history.unshift({ date: new Date().toLocaleDateString('en-IN'), time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}), members:'?', groups:'?', payments:'?', status:'failed' });
        saveBackupHistory(history);
        renderBackupHistory();
        showToast('❌ Email failed — check config & EmailJS key', false);
    }
}

function checkAndShowBackupReminder(){
    if(!CURRENT_USER || CURRENT_USER.role !== 'admin') return;
    const cfg = getEmailConfig();
    if(!cfg.publicKey) return; // Don't show badge if not configured
    const lastDate = localStorage.getItem(BACKUP_LAST_DATE_KEY)||'';
    const today = new Date().toISOString().split('T')[0];
    const reminderBtn = document.getElementById('backupReminderBtn');
    if(lastDate !== today && reminderBtn){
        reminderBtn.style.display = 'inline-flex';
    }
}

// ══════════════════════════════════════════
