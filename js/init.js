// ═══════════════════════════════════════════════════════════
// AK Chit Funds — INIT
// Edit only this file when changing app initialisation
// ═══════════════════════════════════════════════════════════

// app.js loads scripts dynamically so DOM is fully ready by the time this runs
(function(){
    // Set today's date in payment form
    var pDate = document.getElementById('pDate');
    if(pDate) pDate.value = new Date().toISOString().split('T')[0];

    // Patch switchTab to reload backup UI when backup tab opens
    var origSwitchTab = switchTab;
    window.switchTab = function(t){
        origSwitchTab(t);
        if(t==='backup'){
            if(typeof loadEmailConfigToForm === 'function') loadEmailConfigToForm();
            if(typeof updateBackupStatusUI === 'function') updateBackupStatusUI();
        }
        if(t==='planner'){
            if(typeof ncpRestoreSession === 'function') ncpRestoreSession();
        }
    };
    // Start the app
    if(typeof migrateData === 'function') setTimeout(migrateData, 800);
    if(typeof initAuth === 'function') initAuth();
    setInterval(function(){
        if(CURRENT_USER && CURRENT_USER.role==='admin' && typeof pollPendingRequests==='function')
            pollPendingRequests();
    }, 15000); // poll every 15s for fast new-request alerts
})();
