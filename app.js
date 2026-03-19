// ═══════════════════════════════════════════════════════════
// AK Chit Funds — app.js (Script Loader)
// Loads ALL scripts in strict sequence — CDN libs first, then app files
// ═══════════════════════════════════════════════════════════

(function(){
    var scripts = [
        // ── CDN Libraries (must be first) ──
        'https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore-compat.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        // ── App Files (in dependency order) ──
        'js/firebase.js',
        'js/helpers.js',
        'js/ui.js',
        'js/ledger.js',
        'js/members.js',
        'js/groups.js',
        'js/payments.js',
        'js/backup.js',
        'js/print.js',
        'js/auth.js',
        'js/quickview.js',
        'js/init.js'
    ];

    function loadNext(index){
        if(index >= scripts.length) return;
        var s = document.createElement('script');
        s.src = scripts[index];
        s.onload  = function(){ loadNext(index + 1); };
        s.onerror = function(){
            console.error('Failed to load: ' + scripts[index]);
            loadNext(index + 1);
        };
        document.head.appendChild(s);
    }

    loadNext(0);
})();
