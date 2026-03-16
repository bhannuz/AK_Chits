function ncpCalculateFull() {
    const totalValue = parseFloat(document.getElementById('ncp_amount').value);
    const members = parseInt(document.getElementById('ncp_members').value);
    const commPerc = parseFloat(document.getElementById('ncp_comm')?.value || 5) / 100;
    
    if(!totalValue || !members) { alert("Please enter Amount and Members"); return; }

    const commission = totalValue * commPerc;
    const installAmount = totalValue / members;
    
    let html = `<table class="table-custom">
        <thead>
            <tr><th>Month</th><th>Chit Value</th><th>Commission</th><th>Dividend</th><th>Net Pay</th></tr>
        </thead><tbody>`;

    for (let i = 1; i <= members; i++) {
        const bidAmount = (i === 1) ? commission : (totalValue * 0.10); 
        const dividendPerPerson = (bidAmount - commission) / members;
        const netPay = installAmount - dividendPerPerson;

        html += `<tr>
            <td>${i}</td>
            <td>₹${totalValue.toLocaleString()}</td>
            <td>₹${commission.toLocaleString()}</td>
            <td>₹${Math.round(dividendPerPerson).toLocaleString()}</td>
            <td style="color:#34d399; font-weight:bold;">₹${Math.round(netPay).toLocaleString()}</td>
        </tr>`;
    }
    
    html += `</tbody></table>`;
    document.getElementById('ncp_result_area').innerHTML = html;
    document.getElementById('btnPrint').style.display = 'block';
}

function ncpPrint() {
    const content = document.getElementById('ncp_result_area').innerHTML;
    const overlay = document.getElementById('printOverlay');
    overlay.innerHTML = `<h1>🏆 AK CHIT FUNDS - Official Schedule</h1><hr>${content}`;
    overlay.style.display = 'block';
    window.print();
}
