function ncpCalculateAdvanced() {
    const totalValue = parseFloat(document.getElementById('ncp_amount').value);
    const members = parseInt(document.getElementById('ncp_members').value);
    const duration = parseInt(document.getElementById('ncp_duration').value) || members;
    const commRate = 0.05; // Fixed 5% Commission
    
    if(!totalValue || !members) { alert("Please enter Amount and Members count."); return; }

    let html = `<table class="table-planner">
        <thead>
            <tr>
                <th>Month</th>
                <th>Auction Amt</th>
                <th>Comm (5%)</th>
                <th>Total Dividend</th>
                <th>Div / Head</th>
                <th>Net Installment</th>
            </tr>
        </thead><tbody>`;

    const installBase = totalValue / members;
    const commission = totalValue * commRate;

    for (let i = 1; i <= duration; i++) {
        // Auction Logic based on your Screenshot
        let auctionBid = (i === 1) ? commission : (totalValue * 0.08); // Example Auction logic
        let totalDividend = auctionBid - commission;
        let divPerHead = totalDividend / members;
        let netInstall = installBase - divPerHead;

        html += `<tr>
            <td>${i}</td>
            <td>₹${auctionBid.toLocaleString()}</td>
            <td>₹${commission.toLocaleString()}</td>
            <td>₹${totalDividend.toLocaleString()}</td>
            <td>₹${Math.round(divPerHead).toLocaleString()}</td>
            <td style="color:#34d399; font-weight:bold;">₹${Math.round(netInstall).toLocaleString()}</td>
        </tr>`;
    }
    
    html += `</tbody></table>`;
    document.getElementById('ncp_result_area').innerHTML = html;
    document.getElementById('btnPrint').style.display = 'block';
}
