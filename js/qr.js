// ═══════════════════════════════════════════════════════════
// AK Chit Funds — QR GENERATOR + WHATSAPP REMINDERS
// ═══════════════════════════════════════════════════════════

var _standaloneQrState  = {};
var _qrSelectedMembers  = {}; // memberId -> memberName
var _waSelectedMembers  = {}; // memberId -> memberName
// ═══════════════════════════════════════════════════════════
// QR — VERSION SAVING (Firestore — syncs across all devices)
// Stored as array in: settings/qrVersions { list: [...] }
// ═══════════════════════════════════════════════════════════

// Read full list from Firestore
async function _qrFetchVersions(){
    try{
        var doc = await db.collection('settings').doc('qrVersions').get();
        console.log('[QR] fetch exists:', doc.exists, doc.exists ? 'list len:' + (doc.data().list||[]).length : 'no doc');
        if(!doc.exists) return [];
        var list = doc.data().list || [];
        // Sanitize — ensure each item is a plain object
        return list.filter(function(v){ return v && typeof v === 'object' && v.name; });
    } catch(e){
        console.error('[QR] fetch error:', e.code, e.message);
        return [];
    }
}

// Write full list back to Firestore — sanitize members map before writing
async function _qrWriteVersions(list){
    // Strip any non-serializable values from members
    var clean = list.map(function(v){
        var m = {};
        Object.keys(v.members||{}).forEach(function(k){
            var val = v.members[k];
            m[k] = (typeof val === 'string') ? val : String(val||'');
        });
        return Object.assign({}, v, { members: m });
    });
    console.log('[QR] writing', clean.length, 'version(s)');
    await db.collection('settings').doc('qrVersions').set({ list: clean });
}

async function qrSaveVersion(){
    var name = (document.getElementById('qr_version_name').value||'').trim();
    if(!name){ showToast('❌ Enter a version name first', false); return; }

    var ver = {
        name:    name,
        upi:     (document.getElementById('qr_upi').value||'').trim(),
        amt:     document.getElementById('qr_amt').value||'',
        note:    (document.getElementById('qr_note').value||'').trim(),
        due:     document.getElementById('qr_due').value||'',
        members: Object.assign({}, _qrSelectedMembers),
        savedAt: new Date().toISOString()
    };

    try{
        var list = await _qrFetchVersions();
        // Replace if same name exists, otherwise append
        var idx = list.findIndex(function(v){ return v.name === name; });
        if(idx >= 0) list[idx] = ver; else list.push(ver);
        await _qrWriteVersions(list);
        showToast('💾 Saved: ' + name, true);
        qrRenderVersions();
    } catch(e){
        console.error(e);
        showToast('❌ Save failed — check connection', false);
    }
}

function qrLoadVersion(ver){
    document.getElementById('qr_version_name').value = ver.name || '';
    document.getElementById('qr_upi').value          = ver.upi  || '';
    document.getElementById('qr_amt').value          = ver.amt  || '';
    document.getElementById('qr_note').value         = ver.note || '';
    document.getElementById('qr_due').value          = ver.due  || '';

    _qrSelectedMembers = Object.assign({}, ver.members||{});
    var container = document.getElementById('qr_selected_members');
    if(container){
        container.innerHTML = '';
        Object.entries(_qrSelectedMembers).forEach(function(e){ _renderQrChip(e[0], e[1]); });
    }
    document.getElementById('qr_display').style.display = 'none';
    document.getElementById('qr_publish_status').textContent = '';
    showToast('📂 Loaded: ' + ver.name, true);
}

async function qrDeleteVersion(name){
    try{
        var list = await _qrFetchVersions();
        list = list.filter(function(v){ return v.name !== name; });
        await _qrWriteVersions(list);
        showToast('🗑 Deleted: ' + name);
        qrRenderVersions();
    } catch(e){
        console.error(e);
        showToast('❌ Delete failed', false);
    }
}

function qrNewForm(){
    document.getElementById('qr_version_name').value = '';
    document.getElementById('qr_upi').value          = '';
    document.getElementById('qr_amt').value          = '';
    document.getElementById('qr_note').value         = '';
    document.getElementById('qr_due').value          = '';
    _qrSelectedMembers = {};
    var c = document.getElementById('qr_selected_members');
    if(c) c.innerHTML = '';
    document.getElementById('qr_display').style.display = 'none';
    var ps = document.getElementById('qr_publish_status');
    if(ps) ps.textContent = '';
}

async function qrRenderVersions(){
    var bar  = document.getElementById('qr_versions_bar');
    var list = document.getElementById('qr_versions_list');
    if(!bar || !list) return;

    // Show loading immediately
    bar.style.display = 'block';
    list.innerHTML = '<div style="font-size:0.72rem;color:var(--text-dim);padding:4px 0;">⏳ Loading saved versions...</div>';

    var vers = await _qrFetchVersions();

    if(!vers || !vers.length){
        bar.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    bar.style.display = 'block';
    list.innerHTML = '';

    vers.forEach(function(ver){
        if(!ver || !ver.name) return;
        var memberCount = Object.keys(ver.members||{}).length;

        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;';

        var btn = document.createElement('button');
        btn.style.cssText = 'background:rgba(243,156,18,0.12);border:1px solid rgba(243,156,18,0.35);color:#f39c12;border-radius:16px;padding:6px 12px;font-size:0.75rem;font-weight:700;cursor:pointer;text-align:left;max-width:85%;';
        btn.innerHTML = '📂 ' + ver.name
            + (ver.amt  ? ' <span style="color:var(--text-dim);">₹'+parseFloat(ver.amt).toLocaleString('en-IN')+'</span>' : '')
            + (memberCount ? ' <span style="color:#a5b4fc;"> · '+memberCount+' members</span>' : '');
        btn.onclick = (function(v){ return function(){ qrLoadVersion(v); }; })(ver);

        var del = document.createElement('button');
        del.textContent = '✕';
        del.style.cssText = 'background:none;border:none;color:#f87171;cursor:pointer;font-size:0.85rem;padding:2px 4px;line-height:1;flex-shrink:0;';
        del.onclick = (function(n){ return function(){ if(confirm('Delete version "'+n+'"?')) qrDeleteVersion(n); }; })(ver.name);

        wrap.appendChild(btn);
        wrap.appendChild(del);
        list.appendChild(wrap);
    });
}

// ═══════════════════════════════════════════════════════════
// QR — GENERATE / PUBLISH
// ═══════════════════════════════════════════════════════════

function generateStandaloneQr(){
    var upiId  = (document.getElementById('qr_upi').value  ||'').trim();
    var amount = parseFloat(document.getElementById('qr_amt').value) ||0;
    var note   = (document.getElementById('qr_note').value ||'').trim() || 'ChitPayment';
    var due    = (document.getElementById('qr_due').value  ||'').trim();
    var memberNames = Object.values(_qrSelectedMembers);

    if(!upiId)              { showToast('❌ Enter UPI ID', false); return; }
    if(!upiId.includes('@')){ showToast('❌ UPI ID must contain @ (e.g. 9876543210@ybl)', false); return; }
    if(!amount)             { showToast('❌ Enter amount', false); return; }

    var upiUrl = 'upi://pay?pa=' + encodeURIComponent(upiId)
        + '&pn=' + encodeURIComponent('AK Chit Funds')
        + '&am=' + amount.toFixed(2)
        + '&tn=' + encodeURIComponent(note)
        + '&cu=INR';

    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240'
        + '&data=' + encodeURIComponent(upiUrl)
        + '&bgcolor=ffffff&color=1a1a2e&margin=12&format=png';

    _standaloneQrState = { upiUrl, upiId, amount, note, due, imgSrc: qrSrc };

    var infoEl = document.getElementById('qr_info');
    if(infoEl){
        infoEl.innerHTML =
            (memberNames.length ? '<div style="font-size:0.82rem;font-weight:800;color:white;margin-bottom:4px;">👥 ' + memberNames.length + ' member(s): ' + memberNames.join(', ') + '</div>' : '') +
            '<div style="color:var(--text-dim);">' + note + (due ? ' · Due: ' + fmtDate(due) : '') + '</div>' +
            '<div style="font-size:1rem;font-weight:800;color:#f39c12;margin-top:6px;">₹' + amount.toLocaleString('en-IN') + ' → ' + upiId + '</div>';
    }

    var imgEl  = document.getElementById('qr_img');
    var dispEl = document.getElementById('qr_display');
    imgEl.innerHTML = '<div style="color:var(--text-dim);padding:20px;font-size:0.82rem;">⏳ Generating QR...</div>';
    dispEl.style.display = 'block';
    document.getElementById('qr_publish_status').textContent = '';

    var img = new Image();
    img.style.cssText = 'width:240px;height:240px;border-radius:12px;border:3px solid #f39c12;display:block;';
    img.alt = 'UPI QR';
    img.onload = function(){ imgEl.innerHTML = ''; imgEl.appendChild(img); showToast('✅ QR ready — tap Publish to send to member', true); };
    img.onerror = function(){ imgEl.innerHTML = '<div style="color:#f87171;padding:16px;font-size:0.82rem;">❌ Failed — check internet</div>'; };
    img.src = qrSrc;
}

function _renderQrChip(id, name){
    var container = document.getElementById('qr_selected_members');
    if(!container) return;
    var chip = document.createElement('div');
    chip.id  = 'qrchip_' + id;
    chip.style.cssText = 'display:flex;align-items:center;gap:5px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);border-radius:20px;padding:4px 10px 4px 12px;font-size:0.78rem;color:#a5b4fc;font-weight:700;';
    var nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    var removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.style.cssText = 'background:none;border:none;color:#f87171;cursor:pointer;font-size:0.9rem;padding:0 0 0 4px;line-height:1;';
    removeBtn.onclick = (function(mid){ return function(){ qrRemoveMember(mid); }; })(id);
    chip.appendChild(nameSpan);
    chip.appendChild(removeBtn);
    container.appendChild(chip);
}

function qrAddMember(){
    var nameEl = document.getElementById('qr_member_search');
    var idEl   = document.getElementById('qr_member_id');
    var name   = nameEl ? nameEl.value.trim() : '';
    var id     = idEl   ? idEl.value.trim()   : '';
    if(!id || !name){ showToast('❌ Type a name and select from dropdown', false); return; }
    if(_qrSelectedMembers[id]){
        if(nameEl) nameEl.value = ''; if(idEl) idEl.value = '';
        return;
    }
    _qrSelectedMembers[id] = name;
    _renderQrChip(id, name);
    if(nameEl) nameEl.value = ''; if(idEl) idEl.value = '';
    var list = document.getElementById('qr_member_list');
    if(list) list.style.display = 'none';
    showToast('✅ ' + name + ' added');
}

function qrRemoveMember(id){
    delete _qrSelectedMembers[id];
    var chip = document.getElementById('qrchip_' + id);
    if(chip) chip.remove();
}

async function publishQrToMember(){
    var s = _standaloneQrState;
    if(!s.imgSrc){ showToast('❌ Generate QR first', false); return; }
    var memberIds = Object.keys(_qrSelectedMembers);
    if(!memberIds.length){ showToast('❌ Add at least one member', false); return; }

    var statusEl = document.getElementById('qr_publish_status');
    if(statusEl){ statusEl.textContent = '⏳ Publishing to ' + memberIds.length + ' member(s)...'; statusEl.style.color = 'var(--text-dim)'; }

    var success = 0, failed = 0;
    for(var i = 0; i < memberIds.length; i++){
        var mId = memberIds[i], mName = _qrSelectedMembers[mId];
        try{
            await db.collection('memberQrCodes').doc(mId).set({
                memberId: mId, memberName: mName,
                upiId: s.upiId, upiUrl: s.upiUrl, imgSrc: s.imgSrc,
                amount: s.amount, note: s.note, due: s.due,
                publishedAt: new Date().toISOString(), publishedBy: 'admin'
            });
            success++;
        } catch(e){ console.error(e); failed++; }
    }
    if(failed === 0){
        if(statusEl){ statusEl.textContent = '✅ Published to ' + success + ' member(s)!'; statusEl.style.color = '#34d399'; }
        showToast('✅ QR published to ' + success + ' member(s)!');
        _qrSelectedMembers = {};
        var c = document.getElementById('qr_selected_members'); if(c) c.innerHTML = '';
    } else {
        if(statusEl){ statusEl.textContent = '⚠️ ' + success + ' published, ' + failed + ' failed.'; statusEl.style.color = '#f59e0b'; }
    }
}

// ── Load published QR for member login ────────────────────────────────────────
async function loadMemberQr(memberId){
    var area = document.getElementById('memberQrArea');
    if(!area) return;
    area.innerHTML = '';
    try{
        var doc = await db.collection('memberQrCodes').doc(memberId).get();
        if(!doc.exists) return;
        var d = doc.data();
        area.innerHTML =
            '<div style="background:var(--card-bg);border:2px solid rgba(243,156,18,0.4);border-radius:16px;overflow:hidden;margin-bottom:4px;">' +
            '<div style="background:linear-gradient(135deg,rgba(243,156,18,0.18),rgba(243,156,18,0.06));padding:12px 16px;border-bottom:1px solid var(--border);">' +
            '<div style="font-size:0.72rem;font-weight:800;color:#f39c12;text-transform:uppercase;letter-spacing:.5px;">💳 Payment Request from Admin</div>' +
            '<div style="font-size:0.68rem;color:var(--text-dim);margin-top:2px;">Published: ' + (d.publishedAt ? new Date(d.publishedAt).toLocaleString('en-IN') : '—') + '</div>' +
            '</div>' +
            '<div style="padding:14px 16px;text-align:center;">' +
            '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;">' +
            '<div style="background:rgba(243,156,18,0.1);border:1px solid rgba(243,156,18,0.3);border-radius:10px;padding:8px 14px;">' +
            '<div style="font-size:1.2rem;font-weight:900;color:#f39c12;">₹' + (d.amount||0).toLocaleString('en-IN') + '</div>' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Amount to Pay</div></div>' +
            (d.due ? '<div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:8px 14px;">' +
            '<div style="font-size:0.88rem;font-weight:800;color:#a5b4fc;">' + fmtDate(d.due) + '</div>' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Due Date</div></div>' : '') +
            '</div>' +
            (d.note ? '<div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:14px;">📋 ' + d.note + '</div>' : '') +
            '<img src="' + d.imgSrc + '" style="width:240px;height:240px;border-radius:12px;border:3px solid #f39c12;display:block;margin:0 auto 10px;">' +
            '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:10px;">Scan with PhonePe · GPay · Paytm · any UPI app</div>' +
            '<div style="background:rgba(0,0,0,0.2);border-radius:10px;padding:8px 12px;font-size:0.78rem;color:var(--text-dim);">' +
            'UPI: <span style="color:#f39c12;font-weight:700;">' + (d.upiId||'') + '</span></div>' +
            '</div></div>';
    } catch(e){ console.error('loadMemberQr:', e); area.innerHTML = ''; }
}

function downloadStandaloneQr(){
    var s = _standaloneQrState;
    if(!s.imgSrc){ showToast('❌ Generate QR first', false); return; }
    var a = document.createElement('a');
    a.href = s.imgSrc;
    a.download = 'QR_Rs' + s.amount + '_' + (s.note||'payment').replace(/[^a-z0-9]/gi,'_').substring(0,20) + '.png';
    a.target = '_blank'; a.click();
    showToast('⬇ Downloading QR...');
}

async function shareStandaloneQr(){
    var s = _standaloneQrState;
    if(!s.upiUrl){ showToast('❌ Generate QR first', false); return; }
    var text = 'AK Chit Funds — Payment Request\n\nNote: ' + s.note + (s.due?'\nDue: '+fmtDate(s.due):'') + '\nAmount: ₹' + s.amount.toLocaleString('en-IN') + '\nPay via UPI: ' + s.upiId;
    if(navigator.share){ try{ await navigator.share({ title: 'Chit Payment', text: text }); return; } catch(e){} }
    if(navigator.clipboard){ navigator.clipboard.writeText(text).then(function(){ showToast('📋 Copied!'); }); }
}

// ═══════════════════════════════════════════════════════════
// WHATSAPP REMINDERS
// ═══════════════════════════════════════════════════════════

var _waSelectedMembers = {}; // memberId -> {name, phone}

function toggleWaSection(){
    var body    = document.getElementById('waSectionBody');
    var chevron = document.getElementById('waSectionChevron');
    if(!body) return;
    var open = body.style.display !== 'none';
    body.style.display      = open ? 'none'          : 'block';
    chevron.style.transform = open ? 'rotate(0deg)'  : 'rotate(90deg)';
    if(!open) waRenderMemberGrid();
}

// Render all members as a selectable grid
async function waRenderMemberGrid(){
    var grid = document.getElementById('waMemberGrid');
    if(!grid) return;

    if(!ALL_MEMBERS || !ALL_MEMBERS.length){
        grid.innerHTML = '<div style="color:var(--text-dim);font-size:0.78rem;padding:8px;">No members loaded</div>';
        return;
    }

    grid.innerHTML = '';
    ALL_MEMBERS.forEach(function(m){
        var checked = !!_waSelectedMembers[m.id];
        var card = document.createElement('div');
        card.id = 'wacard_' + m.id;
        card.onclick = (function(member){ return function(){ waToggleMember(member); }; })(m);
        card.style.cssText = 'display:flex;align-items:center;gap:8px;background:' + (checked?'rgba(37,211,102,0.1)':'rgba(255,255,255,0.03)') + ';border:1px solid ' + (checked?'rgba(37,211,102,0.4)':'var(--border)') + ';border-radius:10px;padding:8px 10px;cursor:pointer;';
        card.innerHTML =
            '<div style="width:32px;height:32px;border-radius:8px;background:rgba(243,156,18,0.15);color:#f39c12;font-weight:900;font-size:0.78rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (m.name||'?').charAt(0).toUpperCase() + '</div>' +
            '<div style="flex:1;min-width:0;"><div style="font-size:0.78rem;font-weight:700;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (m.name||'—') + '</div>' +
            '<div style="font-size:0.65rem;color:var(--text-dim);">' + (m.phone||'No phone') + '</div></div>' +
            '<div style="font-size:0.9rem;">' + (checked ? '✅' : '⬜') + '</div>';
        grid.appendChild(card);
    });
}

function waToggleMember(m){
    if(_waSelectedMembers[m.id]){
        delete _waSelectedMembers[m.id];
    } else {
        _waSelectedMembers[m.id] = { name: m.name, phone: m.phone };
    }
    // Re-render just this card
    var card = document.getElementById('wacard_' + m.id);
    if(card){
        var checked = !!_waSelectedMembers[m.id];
        card.style.background = checked ? 'rgba(37,211,102,0.1)' : 'rgba(255,255,255,0.03)';
        card.style.border     = '1px solid ' + (checked ? 'rgba(37,211,102,0.4)' : 'var(--border)');
        card.querySelector('div:last-child').textContent = checked ? '✅' : '⬜';
    }
    var count = Object.keys(_waSelectedMembers).length;
    var countEl = document.getElementById('waSelectedCount');
    if(countEl) countEl.textContent = count ? count + ' selected' : '';
}

function waSelectAll(){
    if(!ALL_MEMBERS) return;
    ALL_MEMBERS.forEach(function(m){ _waSelectedMembers[m.id] = { name: m.name, phone: m.phone }; });
    waRenderMemberGrid();
    var countEl = document.getElementById('waSelectedCount');
    if(countEl) countEl.textContent = ALL_MEMBERS.length + ' selected';
}

function waClearAll(){
    _waSelectedMembers = {};
    waRenderMemberGrid();
    var countEl = document.getElementById('waSelectedCount');
    if(countEl) countEl.textContent = '';
    var listEl = document.getElementById('waReminderList');
    if(listEl) listEl.innerHTML = '';
    var countLabel = document.getElementById('waReminderCount');
    if(countLabel) countLabel.textContent = '';
}

async function generateWaReminders(){
    var contact  = (document.getElementById('wa_contact').value||'').trim();
    var template = (document.getElementById('wa_template').value||'').trim();
    var selected = Object.values(_waSelectedMembers);

    if(!selected.length){ showToast('❌ Select at least one member', false); return; }

    var ps = await getCollection('payments');
    var gs = await getCollection('groups');

    var listEl = document.getElementById('waReminderList');
    var countEl = document.getElementById('waReminderCount');
    listEl.innerHTML = '';

    var cards = [];
    selected.forEach(function(ms){
        var member = ALL_MEMBERS.find(function(m){ return m.id === Object.keys(_waSelectedMembers).find(function(k){ return _waSelectedMembers[k] === ms; }); });
        if(!member) return;

        // Calculate pending months across all groups
        var mPays     = ps.filter(function(p){ return p.memberId === member.id; });
        var totalPaid = mPays.reduce(function(s,p){ return s+(parseFloat(p.paid)||0); }, 0);
        var totalBal  = mPays.reduce(function(s,p){ return s+(parseFloat(p.balance)||0); }, 0);
        var mGroups   = gs.filter(function(g){ return member.groupIds && member.groupIds.includes(g.id); });

        // Build pending summary
        var pendingLines = mGroups.map(function(g){
            var gPays   = mPays.filter(function(p){ return p.groupId === g.id; });
            var covered = gPays.reduce(function(s,p){ return s+(p.numMonths||1); }, 0);
            var total   = parseInt(g.duration||g.gDuration)||21;
            var pending = Math.max(0, total - covered);
            var monthly = g.amount && g.members ? Math.round(parseFloat(g.amount)/parseInt(g.members)) : 0;
            var nextDue = '';
            if(g.dueDay){
                var d = new Date(); d.setDate(parseInt(g.dueDay));
                if(d < new Date()) d.setMonth(d.getMonth()+1);
                nextDue = d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
            }
            return { name: g.name, pending, monthly, nextDue };
        }).filter(function(x){ return x.pending > 0; });

        if(!pendingLines.length) return; // skip fully paid members

        // Build message
        var groupLines = pendingLines.map(function(g){
            return '  • ' + g.name + ': ₹' + (g.monthly||0).toLocaleString('en-IN') + '/mo, ' + g.pending + ' months pending' + (g.nextDue ? ', due ' + g.nextDue : '');
        }).join('\n');

        var message;
        if(template){
            message = template
                .replace(/\[Name\]/g, member.name)
                .replace(/\[Balance\]/g, '₹' + totalBal.toLocaleString('en-IN'))
                .replace(/\[Groups\]/g, groupLines)
                .replace(/\[Contact\]/g, contact||'Admin');
        } else {
            message =
                'Dear ' + member.name + ',\n\n' +
                'Greetings from *AK Chit Funds* 🙏\n\n' +
                'This is a friendly reminder for your pending chit payment(s):\n\n' +
                groupLines + '\n\n' +
                'Kindly pay at the earliest to avoid any inconvenience.\n' +
                (contact ? 'For queries, contact: ' + contact + '\n' : '') +
                '\nThank you 🏆\n*AK Chit Funds*';
        }

        cards.push({ member, message, phone: member.phone||'' });
    });

    if(!cards.length){
        countEl.textContent = '✅ All selected members are fully paid — no reminders needed!';
        countEl.style.color = '#34d399';
        return;
    }

    countEl.textContent = cards.length + ' reminder(s) ready';
    countEl.style.color = 'var(--text-dim)';

    cards.forEach(function(c){
        var phone = (c.phone||'').replace(/\D/g,'');
        if(phone.length === 10) phone = '91' + phone;

        var waUrl = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(c.message);

        var card = document.createElement('div');
        card.style.cssText = 'background:rgba(37,211,102,0.05);border:1px solid rgba(37,211,102,0.2);border-radius:12px;overflow:hidden;';
        card.innerHTML =
            // Header
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(37,211,102,0.15);">' +
            '<div>' +
            '<div style="font-weight:800;font-size:0.88rem;color:white;">' + c.member.name + '</div>' +
            '<div style="font-size:0.68rem;color:var(--text-dim);">📞 ' + (c.phone||'No phone') + '</div>' +
            '</div>' +
            (phone ?
                '<a href="' + waUrl + '" target="_blank" style="display:flex;align-items:center;gap:5px;background:#25D366;color:white;border:none;border-radius:8px;padding:7px 12px;font-size:0.75rem;font-weight:800;cursor:pointer;text-decoration:none;">💬 Send</a>'
                : '<span style="font-size:0.68rem;color:#f87171;">No phone number</span>') +
            '</div>' +
            // Message preview
            '<div style="padding:10px 14px;">' +
            '<div style="font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;margin-bottom:5px;">Message Preview</div>' +
            '<div style="font-size:0.72rem;color:var(--text-dim);white-space:pre-wrap;line-height:1.65;background:rgba(0,0,0,0.2);border-radius:8px;padding:8px;max-height:120px;overflow-y:auto;">' + c.message + '</div>' +
            '</div>';
        listEl.appendChild(card);
    });
}

// Stubs
function generateQrCode(){}
function downloadQrCode(){}
function shareQrCode(){}
function generateQrForMember(){}
function downloadQrForMember(){}
function shareQrForMember(){}
function onQrMonthChange(){}
