// ═══════════════════════════════════════════════════════════
// AK Chit Funds — GROUPS CRUD & TAB
// Edit only this file when changing create / edit / delete groups, groups tab rendering
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTION - Get ordinal text (1st, 2nd, 3rd, 5th, etc.)
// ═══════════════════════════════════════════════════════════
function getOrdinal(n) {
    if(!n) return '—';
    const s = ['th','st','nd','rd'];
    const v = n%100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
}

// GROUP CRUD
// ══════════════════════════════════════════
function toggleGroupAmtType(){
    const isFixed = document.getElementById('gAmtFixed').checked;
    document.getElementById('gFixedAmtRow').style.display = isFixed ? 'block' : 'none';
}

function openAddGroup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    document.getElementById('gName').value='';
    document.getElementById('gDuration').value='';
    document.getElementById('gDueDay').value='';
    document.getElementById('gStart').value='';
    document.getElementById('gFixedAmt').value='';
    document.getElementById('editGroupId').value='';
    document.getElementById('groupModalTitle').textContent='🏦 New Group';
    document.getElementById('deleteGroupArea').style.display='none';
    document.getElementById('gAmtFixed').checked=true;
    toggleGroupAmtType();
    openModal('groupModal');
}

async function openEditGroup(gid){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const gs=await getCollection('groups');const g=gs.find(x=>x.id===gid);if(!g)return;
    document.getElementById('editGroupId').value=g.id;
    document.getElementById('gName').value=g.name||'';
    document.getElementById('gDuration').value=g.duration||g.gDuration||'';
    document.getElementById('gDueDay').value=g.dueDay||'';
    document.getElementById('gStart').value=g.startDate||g.gStart||'';
    document.getElementById('gFixedAmt').value=g.fixedAmt||'';
    const isFixed = g.amtType!=='variable';
    document.getElementById('gAmtFixed').checked=isFixed;
    document.getElementById('gAmtVariable').checked=!isFixed;
    toggleGroupAmtType();
    document.getElementById('groupModalTitle').textContent='✏️ Edit Group';
    document.getElementById('deleteGroupArea').style.display='block';
    openModal('groupModal');
}

async function saveGroup(){
    if(!isAdmin()){showToast('🚫 Access denied',false);return;}
    const name=document.getElementById('gName').value.trim();
    const duration=document.getElementById('gDuration').value;
    const dueDay=parseInt(document.getElementById('gDueDay').value)||null;
    const startDate=document.getElementById('gStart').value;
    const eid=document.getElementById('editGroupId').value;
    if(!name)return showToast('❌ Enter group name',false);
    if(dueDay&&(dueDay<1||dueDay>31))return showToast('❌ Due Day must be 1–31',false);
    const amtType = document.querySelector('input[name="gAmtType"]:checked')?.value||'fixed';
    const fixedAmt = amtType==='fixed'?(parseFloat(document.getElementById('gFixedAmt').value)||0):0;
    const data={name,duration,startDate,amtType};
    if(dueDay) data.dueDay=dueDay;
    if(amtType==='fixed'&&fixedAmt>0) data.fixedAmt=fixedAmt;
    if(eid)await db.collection('groups').doc(eid).update(data);
    else await db.collection('groups').add(data);
    bustCache('groups');
    closeModal('groupModal');showToast(`✅ Group "${name}" saved!`);updateUI();
}

function deleteGroupFromModal(){
    const eid=document.getElementById('editGroupId').value;if(!eid)return;
    const name=document.getElementById('gName').value;
    showConfirm('🗑','Delete Group?',`This will permanently delete "${name}". Member assignments and payments will remain.`,async()=>{
        await db.collection('groups').doc(eid).delete();
        bustCache('groups');
        closeModal('groupModal');showToast('🗑 Group deleted');updateUI();
    });
}

// ══════════════════════════════════════════

// GROUPS TAB
// ══════════════════════════════════════════
let _activeGroupsSubTab = 'groups';

function switchGroupsSubTab(tab){
    _activeGroupsSubTab = tab;
    _applyGroupsSubTabStyles();
    if(tab === 'collections') renderCollectionsTab();
}

function _applyGroupsSubTabStyles(){
    const grpBtn = document.getElementById('grpSubGroups');
    const colBtn = document.getElementById('grpSubCollections');
    const grpArea = document.getElementById('groupListArea');
    const colArea = document.getElementById('collectionsArea');
    if(!grpBtn||!colBtn||!grpArea||!colArea) return;
    if(_activeGroupsSubTab === 'groups'){
        grpBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:rgba(243,156,18,0.18);color:#f39c12;';
        colBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:transparent;color:#888;';
        grpArea.style.display='block';
        colArea.style.display='none';
    } else {
        colBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:rgba(52,211,153,0.15);color:#34d399;';
        grpBtn.style.cssText='flex:1;padding:8px;border:none;border-radius:9px;font-size:0.8rem;font-weight:800;cursor:pointer;background:transparent;color:#888;';
        grpArea.style.display='none';
        colArea.style.display='block';
    }
}

async function loadGroupsTab(){
    const gs = await getCollection('groups');
    const ms = await getCollection('members');
    const ps = await getCollection('payments');
    const cs = await getCollection('memberCommitments');

    const groupCards = gs.map((g, idx) => {
        const totalMonths = parseInt(g.duration||g.gDuration||21);
        const bodyId = `groupBody_${idx}`;
        const headerId = `groupHeader_${idx}`;
        
        // Members in this group
        const gMs = ms.filter(m => m.groupIds && m.groupIds.includes(g.id));
        
        // Payments and stats
        let tPaid=0, tBal=0, left=0, picked=0, elapsed=0;
        const start = new Date((g.startDate||g.gStart||new Date().toISOString().split('T')[0])+'T00:00:00');
        const now = new Date();
        elapsed = Math.floor((now-start)/(1000*60*60*24*30)); // approx months
        
        gMs.forEach(m=>{
            const mPays = ps.filter(p => p.memberId===m.id && p.groupId===g.id);
            const mPaid = mPays.reduce((s,p)=>s+(parseFloat(p.paid)||0), 0);
            const mBal = mPays.reduce((s,p)=>s+(parseFloat(p.balance)||0), 0);
            tPaid += mPaid;
            tBal += mBal;
            
            const hasChitPicked = mPays.some(p => p.chitPicked==='Yes');
            if(hasChitPicked) picked++;
        });
        
        left = Math.max(0, totalMonths-elapsed);
        const pct = Math.min(100, Math.round((totalMonths-left)/totalMonths*100));
        
        // Member rows with COMMITMENT COLUMN
        const memberRows = gMs.map((m, mIdx) => {
            const mPays = ps.filter(p => p.memberId===m.id && p.groupId===g.id);
            const mPaid = mPays.reduce((s,p)=>s+(parseFloat(p.paid)||0), 0);
            const mBal = mPays.reduce((s,p)=>s+(parseFloat(p.balance)||0), 0);
            const chitPickedAmt = mPays.filter(p => p.chitPicked==='Yes').reduce((s,p)=>s+(parseFloat(p.chit)||0), 0);
            const monthsDone = mPays.length;
            
            // GET COMMITMENT FOR THIS MEMBER IN THIS GROUP
            const memberComm = cs.find(c => c.memberId===m.id && c.groupId===g.id);
            const commitmentCell = memberComm 
                ? `<td style="text-align:center;color:#bb86fc;font-weight:700;font-size:0.85rem;">${getOrdinal(memberComm.targetMonth)}</td>`
                : `<td style="text-align:center;color:var(--text-dim);">—</td>`;
            
            return `<tr>
                <td style="text-align:center;font-weight:700;color:var(--text-dim);font-size:0.8rem;">${mIdx+1}</td>
                <td style="color:var(--text-main);font-weight:600;">${m.name}</td>
                <td style="color:#34d399;font-weight:700;">${fmtAmt(mPaid)}</td>
                <td style="color:#f59e0b;">${fmtAmt(mBal)}</td>
                <td style="text-align:center;color:var(--text-dim);font-size:0.8rem;">${monthsDone}/${totalMonths}</td>
                <td style="color:var(--text-dim);font-size:0.8rem;">${chitPickedAmt>0?fmtAmt(chitPickedAmt):'—'}</td>
                ${commitmentCell}
                <td style="text-align:center;"><button onclick="openEditMember('${m.id}')" class="btn-edit-sm" style="font-size:0.7rem;">✏️</button></td>
            </tr>`;
        }).join('');

        return `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px;page-break-inside:avoid;">
            <div id="${headerId}" class="group-header" onclick="toggleGroupCard('${bodyId}', this)" style="padding:12px 16px;cursor:pointer;background:var(--card-bg);display:flex;justify-content:space-between;align-items:center;user-select:none;border-bottom:1px solid var(--border);page-break-inside:avoid;">
                <div>
                    <div style="font-size:1.05rem;font-weight:900;color:#f39c12;margin-bottom:6px;">${g.name}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:0.75rem;color:var(--text-dim);">
                        <span>📅 Due Day: ${g.dueDay||5}</span>
                        <span>⏱ Duration: ${totalMonths} months</span>
                    </div>
                </div>
                <div style="text-align:right;display:flex;gap:8px;flex-direction:column;align-items:flex-end;">
                    <button onclick="generateGroupPDF('${g.id}');event.stopPropagation();" class="btn-pdf" style="padding:5px 10px;font-size:1rem;">📄 PDF</button>
                    <button onclick="openEditGroup('${g.id}');event.stopPropagation();" class="btn-edit-sm">✏️ Edit</button>
                    <span class="chevron-icon closed">▼</span>
                </div>
            </div>
            <div class="row g-2 mt-2" style="padding:10px 16px;display:flex;gap:8px;">
                <div class="col-3"><div class="mini-stat" style="border-top:2px solid #34d399;"><div class="mini-stat-lbl">Collected</div><div class="mini-stat-val" style="color:#34d399;font-size:clamp(0.7rem,2.2vw,0.9rem);">${fmtAmt(tPaid)}</div></div></div>
                <div class="col-3"><div class="mini-stat" style="border-top:2px solid #f59e0b;"><div class="mini-stat-lbl">Balance</div><div class="mini-stat-val" style="color:#f59e0b;">${fmtAmt(tBal)}</div></div></div>
                <div class="col-3"><div class="mini-stat" style="border-top:2px solid #a5b4fc;"><div class="mini-stat-lbl">Pending</div><div class="mini-stat-val" style="color:#a5b4fc;">${left}/${totalMonths}</div></div></div>
                <div class="col-3"><div class="mini-stat" style="border-top:2px solid #34d399;"><div class="mini-stat-lbl">Picked</div><div class="mini-stat-val" style="color:#34d399;">${picked}</div></div></div>
            </div>
            <div class="prog-bar-outer" style="margin:10px 16px;margin-top:8px;"><div class="prog-bar-inner" style="width:${pct}%"></div></div>
            <div class="prog-label" style="padding:0 16px;margin-top:3px;margin-bottom:12px;font-size:0.7rem;display:flex;justify-content:space-between;"><span>Month ${elapsed}/${totalMonths}</span><span>${left}/${totalMonths} months pending</span></div>

            <div class="group-body" id="${bodyId}" style="max-height:0px;opacity:0;margin-top:0;overflow:hidden;transition:all 0.3s ease;">
                ${gMs.length?`<div class="table-wrap" style="overflow-x:auto;padding:0 16px;"><table class="table-custom" style="width:100%;margin-bottom:16px;">
                    <thead><tr style="page-break-inside:avoid;">
                        <th style="text-align:center;font-size:0.75rem;">#</th>
                        <th>Member</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Months</th>
                        <th>Chit Amt</th>
                        <th style="text-align:center;color:#bb86fc;">Commitment</th>
                        <th></th>
                    </tr></thead>
                    <tbody>${memberRows}</tbody>
                </table></div>`:'<div style="text-align:center;color:var(--text-dim);font-size:1rem;padding:16px;">No members yet</div>'}
            </div>
        </div>`;
    }).join('');

    document.getElementById('groupListArea').innerHTML = groupCards;
}

function toggleGroupCard(bodyId, header){
    const body = document.getElementById(bodyId);
    const chevron = header.querySelector('.chevron-icon');
    if(!body) return;
    const isOpen = body.style.maxHeight!=='0px' && !body.classList.contains('collapsed');
    if(isOpen){
        body.style.maxHeight='0px';
        body.style.opacity='0';
        body.style.marginTop='0';
        if(chevron){chevron.classList.remove('open');chevron.classList.add('closed');}
    } else {
        body.style.maxHeight='2000px';
        body.style.opacity='1';
        body.style.marginTop='12px';
        if(chevron){chevron.classList.remove('closed');chevron.classList.add('open');}
    }
}

function toggleLedgerTable(id, header){
    const el = document.getElementById(id);
    if(!el) return;
    const chevron = header.querySelector('.ledger-chevron');
    const isOpen = el.style.display!=='none';
    el.style.display = isOpen ? 'none' : 'block';
    if(chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

// ══════════════════════════════════════════
// CHIT COMMITMENTS - memberCommitments Collection
// ══════════════════════════════════════════

// Load commitments for a group
async function loadCommitmentsForGroup(groupId) {
    const cs = await getCollection('memberCommitments');
    return cs.filter(c => c.groupId === groupId);
}

// Open commitment management modal
async function openChitCommitments(groupId) {
    const gs = await getCollection('groups');
    const grp = gs.find(g => g.id === groupId);
    if(!grp) return;
    
    document.getElementById('commitmentGroupId').value = groupId;
    document.getElementById('commitmentGroupName').textContent = grp.name;
    document.getElementById('commitmentMemberId').value = '';
    document.getElementById('commitmentMonth').value = '';
    document.getElementById('commitmentNotes').value = '';
    
    // Load group members into dropdown
    const ms = await getCollection('members');
    const gms = ms.filter(m => m.groupIds && m.groupIds.includes(groupId));
    
    let memberOptions = '<option value="">-- Select Member --</option>';
    gms.forEach(m => {
        memberOptions += `<option value="${m.id}">${m.name}</option>`;
    });
    document.getElementById('commitmentMemberId').innerHTML = memberOptions;
    
    document.getElementById('commitmentModal').style.display = 'block';
    loadCommitmentsList(groupId);
}

// Load and display commitments list
async function loadCommitmentsList(groupId) {
    const commitments = await loadCommitmentsForGroup(groupId);
    const ms = await getCollection('members');
    const gs = await getCollection('groups');
    const grp = gs.find(g => g.id === groupId);
    const totalMonths = parseInt(grp.duration || grp.gDuration || 13);
    
    if(commitments.length === 0) {
        document.getElementById('commitmentsList').innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:10px;">No commitments yet</p>';
        return;
    }
    
    let html = '<table style="width:100%;border-collapse:collapse;"><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:8px;color:#a5b4fc;font-size:0.85rem;">Member</th><th style="text-align:center;padding:8px;color:#a5b4fc;font-size:0.85rem;">Month</th><th style="text-align:center;padding:8px;color:#a5b4fc;font-size:0.85rem;">Status</th><th style="text-align:center;padding:8px;color:#a5b4fc;font-size:0.85rem;">Date</th><th style="text-align:center;padding:8px;color:#a5b4fc;font-size:0.85rem;">Action</th></tr>';
    
    commitments.forEach(c => {
        const member = ms.find(m => m.id === c.memberId);
        const statusBadge = c.status === 'confirmed' 
            ? '<span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:3px;padding:2px 6px;font-size:0.65rem;font-weight:700;">✅ Confirmed</span>'
            : '<span style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);border-radius:3px;padding:2px 6px;font-size:0.65rem;font-weight:700;">⏳ Pending</span>';
        
        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px;color:var(--text-main);">${member ? member.name : 'Unknown'}</td>
            <td style="text-align:center;padding:8px;color:#a5b4fc;font-weight:700;">${getOrdinal(c.targetMonth)}</td>
            <td style="text-align:center;padding:8px;">${statusBadge}</td>
            <td style="text-align:center;padding:8px;color:var(--text-dim);font-size:0.8rem;">${c.commitmentDate}</td>
            <td style="text-align:center;padding:8px;"><button onclick="deleteCommitment('${c.id}', '${groupId}')" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.7rem;font-weight:700;">Delete</button></td>
        </tr>`;
    });
    
    html += '</table>';
    document.getElementById('commitmentsList').innerHTML = html;
}

// Save new commitment
async function saveCommitment() {
    const groupId = document.getElementById('commitmentGroupId').value;
    const memberId = document.getElementById('commitmentMemberId').value;
    const targetMonth = parseInt(document.getElementById('commitmentMonth').value);
    const notes = document.getElementById('commitmentNotes').value;
    
    if(!memberId || !targetMonth) {
        showToast('⚠️ Please select member and target month', false);
        return;
    }
    
    const commitment = {
        groupId: groupId,
        memberId: memberId,
        targetMonth: targetMonth,
        commitmentDate: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        notes: notes
    };
    
    try {
        const csRef = firebase.firestore().collection('memberCommitments');
        await csRef.add(commitment);
        showToast('✅ Commitment saved successfully!', true);
        
        // Clear form
        document.getElementById('commitmentMemberId').value = '';
        document.getElementById('commitmentMonth').value = '';
        document.getElementById('commitmentNotes').value = '';
        
        // Reload list
        loadCommitmentsList(groupId);
    } catch(err) {
        console.error('Error saving commitment:', err);
        showToast('❌ Error saving commitment', false);
    }
}

// Delete commitment
async function deleteCommitment(commitmentId, groupId) {
    if(!confirm('🗑️ Delete this commitment?')) return;
    
    try {
        await firebase.firestore().collection('memberCommitments').doc(commitmentId).delete();
        showToast('✅ Commitment deleted!', true);
        loadCommitmentsList(groupId);
    } catch(err) {
        console.error('Error deleting commitment:', err);
        showToast('❌ Error deleting commitment', false);
    }
}
