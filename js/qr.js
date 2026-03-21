// ═══════════════════════════════════════════════════════════
// AK Chit Funds — QR PAYMENT GENERATOR
// Admin: generate + publish QR to member via Firestore
// Member: view published QR — scan and pay, no inputs
// ═══════════════════════════════════════════════════════════

var _standaloneQrState = {};

// ── Toggle section ────────────────────────────────────────────────────────────
// Note: toggleQrSection is also defined inline in index.html for early availability

// ── Generate QR (admin) ───────────────────────────────────────────────────────
function generateStandaloneQr(){
    var upiId  = (document.getElementById('qr_upi').value   ||'').trim();
    var amount = parseFloat(document.getElementById('qr_amt').value) ||0;
    var note   = (document.getElementById('qr_note').value  ||'').trim() || 'ChitPayment';
    var due    = (document.getElementById('qr_due').value   ||'').trim();

    // Member info from search
    var memberName = (document.getElementById('qr_member_search').value||'').trim();
    var memberId   = (document.getElementById('qr_member_id').value||'').trim();

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

    _standaloneQrState = { upiUrl, upiId, amount, memberName, memberId, note, due, imgSrc: qrSrc };

    // Info summary
    var infoEl = document.getElementById('qr_info');
    if(infoEl){
        infoEl.innerHTML =
            (memberName ? '<div style="font-size:0.9rem;font-weight:800;color:white;margin-bottom:4px;">' + memberName + '</div>' : '') +
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

// ── Publish QR to member via Firestore ────────────────────────────────────────
async function publishQrToMember(){
    var s = _standaloneQrState;
    if(!s.imgSrc){ showToast('❌ Generate QR first', false); return; }
    if(!s.memberId){ showToast('❌ Select a member to publish to', false); return; }

    var statusEl = document.getElementById('qr_publish_status');
    if(statusEl){ statusEl.textContent = '⏳ Publishing...'; statusEl.style.color='var(--text-dim)'; }

    try{
        // Save QR record to Firestore — overwrite any previous QR for this member
        await db.collection('memberQrCodes').doc(s.memberId).set({
            memberId:   s.memberId,
            memberName: s.memberName,
            upiId:      s.upiId,
            upiUrl:     s.upiUrl,
            imgSrc:     s.imgSrc,
            amount:     s.amount,
            note:       s.note,
            due:        s.due,
            publishedAt: new Date().toISOString(),
            publishedBy: 'admin'
        });
        if(statusEl){ statusEl.textContent = '✅ Published! Member can now see the QR on login.'; statusEl.style.color='#34d399'; }
        showToast('✅ QR published to ' + (s.memberName||'member') + '!');
    } catch(err){
        console.error(err);
        if(statusEl){ statusEl.textContent = '❌ Failed to publish. Try again.'; statusEl.style.color='#f87171'; }
        showToast('❌ Publish failed', false);
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
