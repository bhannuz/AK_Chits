// ═══════════════════════════════════════════════════════════
// AK Chit Funds — INIT
// Edit only this file when changing app initialisation
// ═══════════════════════════════════════════════════════════

// INIT
// ══════════════════════════════════════════
// Scripts load at bottom of <body> so DOM is already ready — no DOMContentLoaded needed
(function(){
    document.getElementById('pDate').value=new Date().toISOString().split('T')[0];
    // Patch switchTab to reload backup UI when backup tab opens
    const origSwitchTab = switchTab;
    window.switchTab = function(t){
        origSwitchTab(t);
        if(t==='backup'){ loadEmailConfigToForm(); updateBackupStatusUI(); }
    };
    // Start the app
    setTimeout(migrateData, 800);
    initAuth();
    setInterval(()=>{ if(CURRENT_USER&&CURRENT_USER.role==='admin') pollPendingRequests(); }, 60000);
})();
