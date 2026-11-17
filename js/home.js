// ═══════════════════════════════════════════════════════════
// AK Chit Funds — HOME TAB: all groups + member lists (admin)
// Groups are single slim rows. A group opens only when it is selected
// (one at a time); the small search shows matching members across groups.
// Uses _statSeats / _statSeatMonths from backup.js
// ═══════════════════════════════════════════════════════════
window._hmSel = null;          // opened group id
window._hmQ   = '';            // member search text
let _hmCache = null;           // {ms, gs, ps}

function _hmEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _hmShort(n){ return n>=100000 ? (n/100000).toFixed(2).replace(/\.?0+$/,'')+'L' : n>=1000 ? (n/1000).toFixed(1).replace(/\.0$/,'')+'k' : String(Math.round(n)); }
const _HM_TINT = [['rgba(56,189,248,0.18)','#7dd3fc'],['rgba(16,185,129,0.18)','#34d399'],['rgba(245,158,11,0.18)','#fbbf24'],['rgba(99,102,241,0.2)','#a5b4fc'],['rgba(239,68,68,0.16)','#f87171']];

function _hmRing(p, color){
    const r = 15, c = 2*Math.PI*r;
    return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" style="flex-shrink:0;"><circle cx="20" cy="20" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3.5"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(c*p/100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="11" font-weight="700" fill="#e5e7eb">${p}</text></svg>`;
}

// open one member's ledger (same flow as the old search box)
async function hmOpenLedger(mid, name){
    const sv = document.getElementById('summaryView'), ss = document.getElementById('summarySearch');
    if(!sv) return;
    sv.value = mid; if(ss) ss.value = name || '';
    await loadMemberLedger();
    const box = document.getElementById('adminMemberSearch');
    if(box && box.scrollIntoView) box.scrollIntoView({behavior:'smooth', block:'start'});
}
function hmPick(id){ window._hmSel = (window._hmSel === id) ? null : id; renderHomeGroups(); }
function hmQ(v){ window._hmQ = String(v||'').toLowerCase().trim(); renderHomeGroups(); }
function hmSearchOpen(){
    const box = document.getElementById('hmSearchBox'), btn = document.getElementById('hmSearchBtn'), inp = document.getElementById('hmSearchInput');
    if(box) box.style.display = 'flex'; if(btn) btn.style.display = 'none'; if(inp) inp.focus();
}
function hmSearchBlur(){
    if(window._hmQ) return;
    const box = document.getElementById('hmSearchBox'), btn = document.getElementById('hmSearchBtn');
    if(box) box.style.display = 'none'; if(btn) btn.style.display = 'flex';
}

function renderHomeGroups(ms, gs, ps){
    if(ms && gs && ps) _hmCache = { ms, gs, ps };
    const host = document.getElementById('homeGroups'); if(!host || !_hmCache) return;
    if(typeof isAdmin === 'function' && !isAdmin()) return;
    if(typeof _statSeats !== 'function' || typeof _statSeatMonths !== 'function'){ host.innerHTML = ''; return; }
    const { ms:members, gs:groups, ps:pays } = _hmCache;
    const today = new Date().toISOString().split('T')[0];
    const q = window._hmQ;
    const inr = n => (typeof fmtAmt === 'function') ? fmtAmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');

    const data = groups.map(g => {
        const dues  = getGroupDueDates(g) || [];
        const gPays = pays.filter(p => p.groupId === g.id && !p.isJointMirror);
        const lastPay = gPays.slice().sort((a,b) => (a.date||'').localeCompare(b.date||'')).filter(p => parseFloat(p.chit) > 0).pop();
        const chit = (g.amtType !== 'variable' && parseFloat(g.fixedAmt) > 0) ? parseFloat(g.fixedAmt) : (lastPay ? parseFloat(lastPay.chit) : 0);
        const seats = _statSeats(g, members, pays).map(s => Object.assign({}, s, _statSeatMonths(s, dues, chit, today)));
        const monthsDue = dues.filter(d => d <= today).length;
        let got = 0, over = 0;
        seats.forEach(s => s.months.forEach(m => { if(!m.due) return; got += Math.min(m.paid, chit || m.paid); if(m.st === 'o') over += chit; }));
        const exp = seats.length * chit * monthsDue;
        const pct = exp > 0 ? Math.min(100, Math.round(got/exp*100)) : 0;
        const completed = (typeof isGroupCompleted === 'function') && isGroupCompleted(g, pays);
        return { g, dues, chit, seats, monthsDue, got, over, exp, pct, completed };
    }).sort((a,b) => ((a.completed?1:0) - (b.completed?1:0)) || (a.g.name||'').localeCompare(b.g.name||''));

    const totalSeats = data.reduce((a,d) => a + d.seats.length, 0);
    const cnt = document.getElementById('homeGroupsCount');
    if(cnt) cnt.textContent = '· ' + data.length + ' group' + (data.length===1?'':'s') + ' · ' + totalSeats + ' members';

    const dotCss = { p:'background:#34d399;', t:'background:#fbbf24;', o:'background:#f87171;', d:'border:1.5px solid #fbbf24;', f:'border:1px solid rgba(255,255,255,0.28);' };
    let html = '';
    data.forEach(d => {
        const rows = d.seats.filter(s => !q || s.name.toLowerCase().includes(q));
        if(q && !rows.length) return;
        const open = q ? true : window._hmSel === d.g.id;
        const ringCol = d.pct >= 100 ? '#34d399' : d.pct >= 80 ? '#fbbf24' : '#f87171';
        const tag = d.completed ? ['COMPLETED','#a5b4fc','rgba(99,102,241,0.18)'] : (!d.monthsDue ? ['NOT STARTED','#9ca3af','rgba(156,163,175,0.18)'] : ['ACTIVE','#34d399','rgba(16,185,129,0.18)']);
        let list = '';
        if(open) list = rows.map((s,k) => {
            let paidN = 0, ov = 0, pa = 0, dn = 0, due = 0;
            s.months.forEach(m => {
                if(m.st === 'p') paidN++;
                if(!m.due) return;
                if(m.st === 'o') ov++; else if(m.st === 't') pa++; else if(m.st === 'd') dn++;
                if(m.st !== 'p') due += Math.max(0, d.chit - m.paid);
            });
            const ch = ov ? ['#f87171','rgba(239,68,68,0.15)', ov+' overdue'] : pa ? ['#fbbf24','rgba(245,158,11,0.15)','Partial'] : dn ? ['#fbbf24','rgba(245,158,11,0.15)','Due now'] : s.months.some(m => m.due) ? ['#34d399','rgba(16,185,129,0.15)','Up to date'] : ['#cbd5e1','rgba(156,163,175,0.15)','Not started'];
            const ini = s.name.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).map(w => w[0]).slice(0,2).join('').toUpperCase() || '?';
            const tint = _HM_TINT[(s.name.charCodeAt(0) + k) % _HM_TINT.length];
            const dots = s.months.map(m => `<i style="width:7px;height:7px;border-radius:2px;display:block;box-sizing:border-box;${dotCss[m.st]}"></i>`).join('');
            return `<div class="hm-mem" onclick="hmOpenLedger('${s.memberId}','${_hmEsc(s.name).replace(/'/g,'&#39;')}')">
                <div class="hm-av" style="background:${tint[0]};color:${tint[1]};">${_hmEsc(ini)}</div>
                <div style="min-width:0;"><div class="hm-nm">${s.picked?'🏆 ':''}${_hmEsc(s.name)}</div><div style="display:flex;gap:2px;margin-top:4px;">${dots}</div></div>
                <div style="text-align:right;"><span class="hm-chip" style="background:${ch[1]};color:${ch[0]};">${ch[2]}</span><div style="font-size:0.66rem;color:var(--text-dim);margin-top:2px;white-space:nowrap;">${paidN}/${s.months.length}${due?' · due '+_hmShort(due):''}</div></div>
            </div>`;
        }).join('') || '<div style="padding:10px 12px;color:var(--text-dim);font-size:0.78rem;">No members in this group.</div>';
        html += `<div class="hm-grp${window._hmSel===d.g.id&&!q?' on':''}">
            <div class="hm-gh" onclick="hmPick('${d.g.id}')">
                ${_hmRing(d.pct, ringCol)}
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span style="font-size:0.9rem;font-weight:800;">${_hmEsc(d.g.name||d.g.id)}</span><span style="background:${tag[2]};color:${tag[1]};border-radius:6px;padding:0 6px;font-size:0.6rem;font-weight:800;">${tag[0]}</span></div>
                    <div style="font-size:0.7rem;color:var(--text-dim);margin-top:1px;">${d.monthsDue?'Month '+Math.min(d.monthsDue,d.dues.length)+' of '+d.dues.length:'Starts '+(d.dues[0]||'')} · ${d.seats.length} members</div>
                </div>
                <div style="text-align:right;font-size:0.72rem;font-weight:800;white-space:nowrap;color:${d.over?'#f87171':'#34d399'};">${d.over?_hmShort(d.over)+' overdue':(d.monthsDue?'On track':'')}</div>
                <span style="color:var(--text-dim);font-size:0.8rem;">${open?'▲':'▼'}</span>
            </div>
            ${open?`<div style="display:flex;gap:14px;flex-wrap:wrap;padding:0 12px 8px 62px;font-size:0.7rem;color:var(--text-dim);"><span>Collected <b style="color:#34d399;">${_hmShort(d.got)}</b></span><span>Expected <b style="color:var(--text-primary);">${_hmShort(d.exp)}</b></span><span>Rate <b style="color:var(--text-primary);">${d.pct}%</b></span></div><div class="hm-list">${list}</div>`:''}
        </div>`;
    });
    host.innerHTML = html || '<div style="padding:14px;text-align:center;color:var(--text-dim);font-size:0.82rem;">' + (q ? 'No member matches.' : 'No groups yet.') + '</div>';
}
