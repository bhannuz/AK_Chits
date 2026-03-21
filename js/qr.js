// ═══════════════════════════════════════════════════════════
// AK Chit Funds — QR PAYMENT GENERATOR (Standalone)
// Independent tool in Home tab — no dependency on ledger
// ═══════════════════════════════════════════════════════════

var _standaloneQrState = {};

// ── Generate QR ───────────────────────────────────────────────────────────────
function generateStandaloneQr(){
    var upiId  = (document.getElementById('qr_upi').value   ||'').trim();
    var amount = parseFloat(document.getElementById('qr_amt').value)  ||0;
    var name   = (document.getElementById('qr_name').value  ||'').trim();
    var note   = (document.getElementById('qr_note').value  ||'').trim() || 'ChitPayment';

    if(!upiId){   showToast('❌ Enter UPI ID', false); return; }
    if(!upiId.includes('@')){ showToast('❌ UPI ID must contain @ (e.g. 9876543210@ybl)', false); return; }
    if(!amount){  showToast('❌ Enter amount', false); return; }

    // Build UPI deep link
    var upiUrl = 'upi://pay'
        + '?pa='  + encodeURIComponent(upiId)
        + '&pn='  + encodeURIComponent('AK Chit Funds')
        + '&am='  + amount.toFixed(2)
        + '&tn='  + encodeURIComponent(note)
        + '&cu=INR';

    // QR image from free API — no auth needed
    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/'
        + '?size=240x240'
        + '&data='    + encodeURIComponent(upiUrl)
        + '&bgcolor=ffffff&color=1a1a2e&margin=12&format=png';

    _standaloneQrState = { upiUrl, upiId, amount, name, note, imgSrc: qrSrc };

    // Show info summary
    var infoEl = document.getElementById('qr_info');
    if(infoEl){
        infoEl.innerHTML =
            (name ? '<div style="font-weight:800;color:white;margin-bottom:4px;">' + name + '</div>' : '') +
            '<div style="color:var(--text-dim);">' + note + '</div>' +
            '<div style="font-size:0.95rem;font-weight:800;color:#f39c12;margin-top:6px;">₹' +
            amount.toLocaleString('en-IN') + ' → ' + upiId + '</div>';
    }

    var imgEl  = document.getElementById('qr_img');
    var dispEl = document.getElementById('qr_display');
    imgEl.innerHTML = '<div style="color:var(--text-dim);padding:20px;font-size:0.82rem;">⏳ Generating QR...</div>';
    dispEl.style.display = 'block';

    var img = new Image();
    img.style.cssText = 'width:240px;height:240px;border-radius:12px;border:3px solid #f39c12;display:block;';
    img.alt   = 'UPI QR';
    img.onload = function(){
        imgEl.innerHTML = '';
        imgEl.appendChild(img);
        showToast('✅ QR ready — ₹' + amount.toLocaleString('en-IN'), true);
    };
    img.onerror = function(){
        imgEl.innerHTML = '<div style="color:#f87171;padding:16px;font-size:0.82rem;">❌ Failed to generate — check internet connection</div>';
    };
    img.src = qrSrc;
}

// ── Download QR ───────────────────────────────────────────────────────────────
function downloadStandaloneQr(){
    var s = _standaloneQrState;
    if(!s.imgSrc){ showToast('❌ Generate QR first', false); return; }
    var a = document.createElement('a');
    a.href     = s.imgSrc;
    a.download = 'QR_' + (s.name||'payment').replace(/\s+/g,'_') + '_Rs' + s.amount + '.png';
    a.target   = '_blank';
    a.click();
    showToast('⬇ Downloading QR...');
}

// ── Share QR ──────────────────────────────────────────────────────────────────
async function shareStandaloneQr(){
    var s = _standaloneQrState;
    if(!s.upiUrl){ showToast('❌ Generate QR first', false); return; }

    var text = 'AK Chit Funds — Payment Request\n\n'
        + (s.name   ? 'Member  : ' + s.name   + '\n' : '')
        + 'Note    : ' + s.note   + '\n'
        + 'Amount  : ₹' + s.amount.toLocaleString('en-IN') + '\n\n'
        + 'Pay via UPI : ' + s.upiId   + '\n'
        + 'UPI Link    : ' + s.upiUrl;

    if(navigator.share){
        try{ await navigator.share({ title: 'Chit Payment Request', text: text }); return; }
        catch(e){}
    }
    if(navigator.clipboard){
        navigator.clipboard.writeText(text)
            .then(function(){ showToast('📋 Payment details copied!'); })
            .catch(function(){ showToast('❌ Could not copy', false); });
    } else {
        showToast('❌ Share not supported on this browser', false);
    }
}

// Stubs — old function names kept for safety
function showQrModal(){}
function generateQrCode(){}
function downloadQrCode(){}
function shareQrCode(){}
function generateQrForMember(){}
function downloadQrForMember(){}
function shareQrForMember(){}
function onQrMonthChange(){}
