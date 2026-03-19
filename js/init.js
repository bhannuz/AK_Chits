// ═══════════════════════════════════════════════════════════
// AK Chit Funds — INIT
// Edit only this file when changing DOMContentLoaded initialisation
// ═══════════════════════════════════════════════════════════

// INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function(){
    document.getElementById('pDate').value=new Date().toISOString().split('T')[0];
    setTimeout(migrateData,800);
    initAuth();
    setInterval(()=>{ if(CURRENT_USER&&CURRENT_USER.role==='admin') pollPendingRequests(); }, 60000);
    // Reload backup UI when backup tab is opened
    const origSwitchTab = switchTab;
    window.switchTabOrig = origSwitchTab;
    window.switchTab = function(t){
        origSwitchTab(t);
        if(t==='backup'){ loadEmailConfigToForm(); updateBackupStatusUI(); }
    };
});
