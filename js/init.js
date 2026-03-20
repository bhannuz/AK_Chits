// ═══════════════════════════════════════════════════════════
// AK Chit Funds — INIT
// ═══════════════════════════════════════════════════════════

(function(){
    // Set today's date in payment form
    var pDate = document.getElementById('pDate');
    if(pDate) pDate.value = new Date().toISOString().split('T')[0];

    // Patch switchTab to trigger tab-specific hooks
    var origSwitchTab = switchTab;
    window.switchTab = function(t){
        origSwitchTab(t);
        if(t === 'backup'){
            if(typeof loadEmailConfigToForm  === 'function') loadEmailConfigToForm();
            if(typeof updateBackupStatusUI   === 'function') updateBackupStatusUI();
        }
        if(t === 'planner'){
            if(typeof ncpRestoreSession === 'function') ncpRestoreSession();
        }
    };

    // Start the app
    if(typeof migrateData === 'function') setTimeout(migrateData, 800);
    if(typeof initAuth    === 'function') initAuth();

    // Poll for new access requests every 15s
    setInterval(function(){
        if(CURRENT_USER && CURRENT_USER.role === 'admin' && typeof pollPendingRequests === 'function'){
            pollPendingRequests();
        }
    }, 15000);
})();
