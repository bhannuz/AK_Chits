// ═══════════════════════════════════════════════════════════
// AK Chit Funds — QR PAYMENT GENERATOR
// Admin: generate + publish QR to member via Firestore
// Member: view published QR — scan and pay, no inputs
// ═══════════════════════════════════════════════════════════

var _standaloneQrState = {};
var _qrSelectedMembers = {}; // memberId -> memberName

// ── Toggle section ────────────────────────────────────────────────────────────
// Note: toggleQrSection is also defined inline in index.html for early availability

// ── Generate QR (admin) ───────────────────────────────────────────────────────
function generateStandaloneQr(){
    var upiId  = (document.getElementById('qr_upi').value   ||'').trim();
    var amount = parseFloat(document.getElementById('qr_amt').value) ||0;
    var note   = (document.getElementById('qr_note').value  ||'').trim() || 'ChitPayment';
    var due    = (document.getElementById('qr_due').value   ||'').trim();

    // Selected members count
    var memberCount = Object.keys(_qrSelectedMembers).length;
    var memberNames = Object.values(_qrSelectedMembers);

    if(!upiId){   showToast('❌ Enter UPI ID', false); return; }
    if(!upiId.includes('@')){ showToast('❌ UPI ID must contain @ (e.g. 9876543210@ybl)', false); return; }
    if(!amount){  showToast('❌ Enter amount', false); return; }

    // UPI deep link
    var upiUrl = 'upi://pay'
        + '?pa=' + encodeURIComponent(upiId)
        + '&pn=' + encodeURIComponent('AK Chit Funds')
        + '&am=' + amount.toFixed(2)
        + '&tn=' + encodeURIComponent(note)
        + '&cu=INR';

    // QR image URL
    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/'
        + '?size=240x240'
        + '&data='    + encodeURIComponent(upiUrl)
        + '&bgcolor=ffffff&color=1a1a2e&margin=12&format=png';

    _standaloneQrState = { upiUrl, upiId, amount, note, due, imgSrc: qrSrc };

    // Info summary
    var infoEl = document.getElementById('qr_info');
    if(infoEl){
        infoEl.innerHTML =
            (memberCount > 0 ? '<div style="font-size:0.82rem;font-weight:800;color:white;margin-bottom:4px;">👥 ' + memberCount + ' member(s): ' + memberNames.join(', ') + '</div>' : '') +
            '<div style="color:var(--text-dim);">' + note + (due?' · Due: '+fmtDate(due):'') + '</div>' +
            '<div style="font-size:1rem;font-weight:800;color:#f39c12;margin-top:6px;">₹' + amount.toLocaleString('en-IN') + ' → ' + upiId + '</div>';
    }

    var imgEl  = document.getElementById('qr_img');
    var dispEl = document.getElementById('qr_display');
    imgEl.innerHTML = '<div style="color:var(--text-dim);padding:20px;font-size:0.82rem;">⏳ Generating QR...</div>';
    dispEl.style.display = 'block';

    var publishStatusEl = document.getElementById('qr_publish_status');
    if(publishStatusEl) publishStatusEl.textContent = '';

    var img = new Image();
    img.style.cssText = 'width:240px;height:240px;border-radius:12px;border:3px solid #f39c12;display:block;';
    img.alt = 'UPI QR';
    img.onload = function(){
        imgEl.innerHTML = '';
        imgEl.appendChild(img);
        showToast('✅ QR ready — tap Publish to send to member', true);
    };
    img.onerror = function(){
        imgEl.innerHTML = '<div style="color:#f87171;padding:16px;font-size:0.82rem;">❌ Failed — check internet connection</div>';
    };
    img.src = qrSrc;
}

// ── Add member to selection ───────────────────────────────────────────────────
function qrAddMember(){
    var nameEl = document.getElementById('qr_member_search');
    var idEl   = document.getElementById('qr_member_id');
    var name   = nameEl ? nameEl.value.trim() : '';
    var id     = idEl   ? idEl.value.trim()   : '';
    if(!id || !name){ showToast('❌ Search and select a member first', false); return; }
    if(_qrSelectedMembers[id]){ showToast('ℹ️ Already added', true); return; }

    _qrSelectedMembers[id] = name;

    // Render chip
    var container = document.getElementById('qr_selected_members');
    if(container){
        var chip = document.createElement('div');
        chip.id  = 'qrchip_' + id;
        chip.style.cssText = 'display:flex;align-items:center;gap:6px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);border-radius:20px;padding:4px 10px 4px 12px;font-size:0.78rem;color:#a5b4fc;font-weight:700;';
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

    // Clear search
    if(nameEl) nameEl.value = '';
    if(idEl)   idEl.value   = '';
    document.getElementById('qr_member_list').style.display = 'none';
    showToast('✅ ' + name + ' added');
}

function qrRemoveMember(id){
    delete _qrSelectedMembers[id];
    var chip = document.getElementById('qrchip_' + id);
    if(chip) chip.remove();
}

// ── Publish QR to member via Firestore ────────────────────────────────────────
async function publishQrToMember(){
    var s = _standaloneQrState;
    if(!s.imgSrc){ showToast('❌ Generate QR first', false); return; }

    var memberIds = Object.keys(_qrSelectedMembers);
    if(!memberIds.length){ showToast('❌ Add at least one member', false); return; }

    var statusEl = document.getElementById('qr_publish_status');
    if(statusEl){ statusEl.textContent = '⏳ Publishing to ' + memberIds.length + ' member(s)...'; statusEl.style.color='var(--text-dim)'; }

    var success = 0, failed = 0;
    for(var i=0; i<memberIds.length; i++){
        var mId   = memberIds[i];
        var mName = _qrSelectedMembers[mId];
        try{
            await db.collection('memberQrCodes').doc(mId).set({
                memberId:    mId,
                memberName:  mName,
                upiId:       s.upiId,
                upiUrl:      s.upiUrl,
                imgSrc:      s.imgSrc,
                amount:      s.amount,
                note:        s.note,
                due:         s.due,
                publishedAt: new Date().toISOString(),
                publishedBy: 'admin'
            });
            success++;
        } catch(err){
            console.error('Failed for ' + mName, err);
            failed++;
        }
    }

    if(failed === 0){
        if(statusEl){ statusEl.textContent = '✅ Published to ' + success + ' member(s)!'; statusEl.style.color='#34d399'; }
        showToast('✅ QR published to ' + success + ' member(s)!');
        // Clear selected members after successful publish
        _qrSelectedMembers = {};
        var container = document.getElementById('qr_selected_members');
        if(container) container.innerHTML = '';
    } else {
        if(statusEl){ statusEl.textContent = '⚠️ ' + success + ' published, ' + failed + ' failed.'; statusEl.style.color='#f59e0b'; }
        showToast('⚠️ ' + success + ' published, ' + failed + ' failed', false);
    }
}

// ── Load published QR for member (called on member login) ─────────────────────
async function loadMemberQr(memberId){
    var area = document.getElementById('memberQrArea');
    if(!area) return;
    area.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:16px;font-size:0.82rem;">⏳ Checking for payment requests...</div>';

    try{
        var doc = await db.collection('memberQrCodes').doc(memberId).get();
        if(!doc.exists || !doc.data()){
            area.innerHTML = '';
            return;
        }
        var d = doc.data();

        area.innerHTML =
            '<div style="background:var(--card-bg);border:2px solid rgba(243,156,18,0.4);border-radius:16px;overflow:hidden;">' +

            // Header
            '<div style="background:linear-gradient(135deg,rgba(243,156,18,0.18),rgba(243,156,18,0.06));padding:14px 16px;border-bottom:1px solid var(--border);">' +
            '<div style="font-size:0.72rem;font-weight:800;color:#f39c12;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">💳 Payment Request from Admin</div>' +
            '<div style="font-size:0.68rem;color:var(--text-dim);">Published: ' + (d.publishedAt ? new Date(d.publishedAt).toLocaleString('en-IN') : '—') + '</div>' +
            '</div>' +

            // Details
            '<div style="padding:14px 16px;text-align:center;">' +

            // Info chips
            '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;">' +
            '<div style="background:rgba(243,156,18,0.1);border:1px solid rgba(243,156,18,0.3);border-radius:10px;padding:8px 14px;text-align:center;">' +
            '<div style="font-size:1.2rem;font-weight:900;color:#f39c12;">₹' + (d.amount||0).toLocaleString('en-IN') + '</div>' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Amount to Pay</div>' +
            '</div>' +
            (d.due ? '<div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:8px 14px;text-align:center;">' +
            '<div style="font-size:0.88rem;font-weight:800;color:#a5b4fc;">' + fmtDate(d.due) + '</div>' +
            '<div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;margin-top:2px;">Due Date</div>' +
            '</div>' : '') +
            '</div>' +

            // Note
            (d.note ? '<div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:14px;">📋 ' + d.note + '</div>' : '') +

            // QR image
            '<div style="display:flex;justify-content:center;margin-bottom:10px;">' +
            '<img src="' + d.imgSrc + '" style="width:240px;height:240px;border-radius:12px;border:3px solid #f39c12;" alt="Payment QR">' +
            '</div>' +

            '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:14px;">Scan with PhonePe · GPay · Paytm · any UPI app</div>' +

            // UPI display
            '<div style="background:rgba(0,0,0,0.2);border-radius:10px;padding:8px 12px;font-size:0.78rem;color:var(--text-dim);margin-bottom:4px;">' +
            'UPI: <span style="color:#f39c12;font-weight:700;">' + (d.upiId||'') + '</span>' +
            '</div>' +

            '</div>' +
            '</div>';

    } catch(err){
        console.error('loadMemberQr error:', err);
        area.innerHTML = '';
    }
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadStandaloneQr(){
    var s = _standaloneQrState;
    if(!s.imgSrc){ showToast('❌ Generate QR first', false); return; }
    var a = document.createElement('a');
    a.href     = s.imgSrc;
    a.download = 'QR_' + (s.memberName||'payment').replace(/\s+/g,'_') + '_Rs' + s.amount + '.png';
    a.target   = '_blank';
    a.click();
    showToast('⬇ Downloading QR...');
}

// ── Share ─────────────────────────────────────────────────────────────────────
async function shareStandaloneQr(){
    var s = _standaloneQrState;
    if(!s.upiUrl){ showToast('❌ Generate QR first', false); return; }
    var text = 'AK Chit Funds — Payment Request\n\n'
        + (s.memberName ? 'Member  : ' + s.memberName + '\n' : '')
        + 'Note    : ' + s.note + '\n'
        + (s.due  ? 'Due     : ' + fmtDate(s.due)  + '\n' : '')
        + 'Amount  : ₹' + s.amount.toLocaleString('en-IN') + '\n\n'
        + 'Pay via UPI : ' + s.upiId + '\n'
        + 'UPI Link    : ' + s.upiUrl;
    if(navigator.share){
        try{ await navigator.share({ title: 'Chit Payment Request', text: text }); return; }
        catch(e){}
    }
    if(navigator.clipboard){
        navigator.clipboard.writeText(text)
            .then(function(){ showToast('📋 Payment details copied!'); })
            .catch(function(){ showToast('❌ Could not copy', false); });
    }
}

// Stubs for compatibility
function generateQrCode(){}
function downloadQrCode(){}
function shareQrCode(){}
function generateQrForMember(){}
function downloadQrForMember(){}
function shareQrForMember(){}
function onQrMonthChange(){}
