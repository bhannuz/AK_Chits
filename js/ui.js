// ═══════════════════════════════════════════════════════════
// AK Chit Funds — UI & NAVIGATION
// Edit only this file when changing tab switching, toasts, modals, search, updateUI
// ═══════════════════════════════════════════════════════════

function switchTab(t){
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
    document.querySelectorAll('.tab-nav-item-desktop').forEach(i=>i.classList.remove('active'));
    
    document.getElementById(t+'Tab').classList.add('active');
    const mobNavId = 'nav'+t.charAt(0).toUpperCase()+t.slice(1);
    const mobNav = document.getElementById(mobNavId);
    if(mobNav) mobNav.classList.add('active');
    
    const desktopNavId = 'nav'+t.charAt(0).toUpperCase()+t.slice(1)+'Desktop';
    const desktopNav = document.getElementById(desktopNavId);
    if(desktopNav) desktopNav.classList.add('active');
    
    updateUI();
}

async function migrateData(){
    const ms=await getCollection('members');
    for(let m of ms){if(m.groupId&&!m.groupIds){await db.collection('members').doc(m.id).update({groupIds:[m.groupId],groupId:firebase.firestore.FieldValue.delete()});}}
    updateUI();
}

async function updateUI(){
    const m=await getCollection('members');const g=await getCollection('groups');const p=await getCollection('payments');
    ALL_MEMBERS=m;
    
    // Set member-mode class based on user role
    if(CURRENT_USER && CURRENT_USER.role==='member'){
        document.body.classList.add('member-mode');
        const myPays=p.filter(x=>x.memberId===CURRENT_USER.memberId);
        const myGroups=new Set(myPays.map(x=>x.groupId));
        document.getElementById('memberCount').innerText='—';
        document.getElementById('groupCount').innerText=myGroups.size;
        const today=new Date().toISOString().split('T')[0];
        document.getElementById('todayColl').innerText=fmtAmt(myPays.filter(x=>x.date===today).reduce((s,x)=>s+(parseFloat(x.paid)||0),0));
        return;
    } else {
        document.body.classList.remove('member-mode');
    }
    document.getElementById('memberCount').innerText=m.length;
    document.getElementById('groupCount').innerText=g.length;
    const today=new Date().toISOString().split('T')[0];
    document.getElementById('todayColl').innerText=fmtAmt(p.filter(x=>x.date===today).reduce((s,x)=>s+(parseFloat(x.paid)||0),0));
    if(document.getElementById('groupsTab').classList.contains('active'))renderGroupsTab();
}

function filterSearch(inputId,listId,hiddenId){
    const query=document.getElementById(inputId).value.toLowerCase();
    const list=document.getElementById(listId);
    list.innerHTML='';if(!query){list.style.display='none';return;}
    const filtered=ALL_MEMBERS.filter(m=>m.name.toLowerCase().includes(query));
    if(filtered.length>0){
        list.style.display='block';
        filtered.forEach(m=>{
            const div=document.createElement('div');div.className='suggestion-item';div.innerText=m.name;
            div.onclick=()=>{
                document.getElementById(inputId).value=m.name;
                document.getElementById(hiddenId).value=m.id;
                list.style.display='none';
                if(hiddenId==='summaryView') loadMemberLedger();
                if(hiddenId==='pMember') linkGroupForPayment();
                // Auto-add for QR member search
                if(hiddenId==='qr_member_id') qrAddMember();
            };
            list.appendChild(div);});
    }else{list.style.display='none';}
}
