const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/affiliates.json');

// Funções internas de leitura/escrita
function loadData() {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({ 
            users: {}, 
            invites: {}, 
            sales: [], 
            pendingSales: [],
            withdrawals: [] 
        }));
    }
    return JSON.parse(fs.readFileSync(filePath));
}

function saveData(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Exportamos essas funções para uso externo
function load() {
    return loadData();
}

function save(data) {
    saveData(data);
}

// Registra um novo afiliado
function registerAffiliate(userId, username) {
    const data = loadData();
    if (data.users[userId]) return data.users[userId];
    
    data.users[userId] = {
        username: username,
        totalSales: 0,
        totalCommission: 0,
        availableBalance: 0,
        createdAt: new Date().toISOString(),
        clicks: {},
        links: [],
        withdrawals: []
    };
    saveData(data);
    return data.users[userId];
}

function getAffiliate(userId) {
    const data = loadData();
    return data.users[userId] || null;
}

function getAffiliateByInviteCode(inviteCode) {
    const data = loadData();
    for (const [userId, userData] of Object.entries(data.users)) {
        if (userData.links && userData.links.some(l => l.code === inviteCode)) {
            return userId;
        }
    }
    return null;
}

function addInviteLink(affiliateId, inviteCode, inviteUrl) {
    const data = loadData();
    if (!data.users[affiliateId]) return false;
    
    if (!data.users[affiliateId].links) {
        data.users[affiliateId].links = [];
    }
    
    data.users[affiliateId].links.push({
        code: inviteCode,
        url: inviteUrl,
        createdAt: new Date().toISOString(),
        uses: 0
    });
    
    data.invites[inviteCode] = {
        affiliateId: affiliateId,
        createdAt: new Date().toISOString()
    };
    
    saveData(data);
    return true;
}

function removeInviteLink(affiliateId, inviteCode) {
    const data = loadData();
    if (!data.users[affiliateId]) return false;
    
    const index = data.users[affiliateId].links.findIndex(l => l.code === inviteCode);
    if (index === -1) return false;
    
    data.users[affiliateId].links.splice(index, 1);
    delete data.invites[inviteCode];
    
    saveData(data);
    return true;
}

function getAffiliateLinks(affiliateId) {
    const data = loadData();
    return data.users[affiliateId]?.links || [];
}

function registerEntryByInvite(inviteCode, newUserId, newUsername) {
    const data = loadData();
    const inviteInfo = data.invites[inviteCode];
    if (!inviteInfo) return null;
    
    const affiliateId = inviteInfo.affiliateId;
    if (!data.users[affiliateId]) return null;
    
    const link = data.users[affiliateId].links.find(l => l.code === inviteCode);
    if (link) {
        link.uses += 1;
    }
    
    if (!data.users[affiliateId].clicks) {
        data.users[affiliateId].clicks = {};
    }
    data.users[affiliateId].clicks[newUserId] = {
        username: newUsername,
        enteredAt: new Date().toISOString(),
        enteredVia: inviteCode,
        purchased: false,
        purchaseAmount: 0,
        commission: 0,
        confirmed: false
    };
    saveData(data);
    return affiliateId;
}

function registerPendingSale(buyerId, buyerUsername, robuxAmount, ticketChannelId, staffWhoClosed) {
    const data = loadData();
    let affiliateId = null;
    
    for (const [affId, affData] of Object.entries(data.users)) {
        if (affData.clicks && affData.clicks[buyerId]) {
            affiliateId = affId;
            break;
        }
    }
    
    const price = (robuxAmount / 1000) * 45.90;
    const commission = price * 0.10;
    
    const pendingId = Date.now().toString();
    const pendingSale = {
        id: pendingId,
        buyerId: buyerId,
        buyerUsername: buyerUsername,
        affiliateId: affiliateId,
        robuxAmount: robuxAmount,
        price: price,
        commission: commission,
        ticketChannelId: ticketChannelId,
        staffWhoClosed: staffWhoClosed,
        date: new Date().toISOString(),
        status: 'pending'
    };
    
    data.pendingSales = data.pendingSales || [];
    data.pendingSales.push(pendingSale);
    saveData(data);
    
    return pendingSale;
}

function confirmSale(saleId) {
    const data = loadData();
    const pendingIndex = data.pendingSales.findIndex(s => s.id === saleId);
    if (pendingIndex === -1) return null;
    
    const sale = data.pendingSales[pendingIndex];
    
    if (sale.affiliateId && sale.commission > 0) {
        const affiliate = data.users[sale.affiliateId];
        if (affiliate) {
            affiliate.totalSales += 1;
            affiliate.totalCommission += sale.commission;
            affiliate.availableBalance = (affiliate.availableBalance || 0) + sale.commission;
            
            if (affiliate.clicks && affiliate.clicks[sale.buyerId]) {
                affiliate.clicks[sale.buyerId].purchased = true;
                affiliate.clicks[sale.buyerId].purchaseAmount = sale.robuxAmount;
                affiliate.clicks[sale.buyerId].commission = sale.commission;
                affiliate.clicks[sale.buyerId].confirmedAt = new Date().toISOString();
            }
        }
    }
    
    data.sales.push({
        ...sale,
        status: 'confirmed',
        confirmedAt: new Date().toISOString()
    });
    
    data.pendingSales.splice(pendingIndex, 1);
    saveData(data);
    
    return sale;
}

function rejectSale(saleId) {
    const data = loadData();
    const pendingIndex = data.pendingSales.findIndex(s => s.id === saleId);
    if (pendingIndex === -1) return null;
    
    const sale = data.pendingSales[pendingIndex];
    
    data.sales.push({
        ...sale,
        status: 'rejected',
        rejectedAt: new Date().toISOString()
    });
    
    data.pendingSales.splice(pendingIndex, 1);
    saveData(data);
    
    return sale;
}

function registerWithdrawal(affiliateId, amount, method, pixKey = null, robuxUsername = null) {
    const data = loadData();
    const affiliate = data.users[affiliateId];
    if (!affiliate) return null;
    
    if (affiliate.availableBalance < amount) return null;
    
    const withdrawalId = Date.now().toString();
    const withdrawal = {
        id: withdrawalId,
        affiliateId: affiliateId,
        affiliateUsername: affiliate.username,
        amount: amount,
        method: method,
        pixKey: pixKey,
        robuxUsername: robuxUsername,
        robuxAmount: method === 'robux' ? Math.floor((amount / 30) * 1000) : null,
        date: new Date().toISOString(),
        status: 'pending'
    };
    
    affiliate.availableBalance -= amount;
    
    data.withdrawals = data.withdrawals || [];
    data.withdrawals.push(withdrawal);
    
    if (!affiliate.withdrawals) affiliate.withdrawals = [];
    affiliate.withdrawals.push(withdrawalId);
    
    saveData(data);
    return withdrawal;
}

function confirmWithdrawal(withdrawalId) {
    const data = loadData();
    const withdrawalIndex = data.withdrawals.findIndex(w => w.id === withdrawalId);
    if (withdrawalIndex === -1) return null;
    
    const withdrawal = data.withdrawals[withdrawalIndex];
    withdrawal.status = 'confirmed';
    withdrawal.confirmedAt = new Date().toISOString();
    
    saveData(data);
    return withdrawal;
}

function rejectWithdrawal(withdrawalId) {
    const data = loadData();
    const withdrawalIndex = data.withdrawals.findIndex(w => w.id === withdrawalId);
    if (withdrawalIndex === -1) return null;
    
    const withdrawal = data.withdrawals[withdrawalIndex];
    
    const affiliate = data.users[withdrawal.affiliateId];
    if (affiliate) {
        affiliate.availableBalance += withdrawal.amount;
    }
    
    withdrawal.status = 'rejected';
    withdrawal.rejectedAt = new Date().toISOString();
    
    saveData(data);
    return withdrawal;
}

function listPendingWithdrawals() {
    const data = loadData();
    return (data.withdrawals || []).filter(w => w.status === 'pending');
}

function getAffiliateWithdrawals(affiliateId) {
    const data = loadData();
    return (data.withdrawals || []).filter(w => w.affiliateId === affiliateId);
}

function listPendingSales() {
    const data = loadData();
    return data.pendingSales || [];
}

function listAffiliates() {
    const data = loadData();
    return Object.entries(data.users).map(([id, info]) => ({
        id: id,
        username: info.username,
        totalSales: info.totalSales || 0,
        totalCommission: info.totalCommission || 0,
        availableBalance: info.availableBalance || 0,
        clicksCount: info.clicks ? Object.keys(info.clicks).length : 0,
        linksCount: info.links ? info.links.length : 0
    }));
}

module.exports = {
    load,
    save,
    registerAffiliate,
    getAffiliate,
    getAffiliateByInviteCode,
    addInviteLink,
    removeInviteLink,
    getAffiliateLinks,
    registerEntryByInvite,
    registerPendingSale,
    confirmSale,
    rejectSale,
    registerWithdrawal,
    confirmWithdrawal,
    rejectWithdrawal,
    listPendingWithdrawals,
    getAffiliateWithdrawals,
    listPendingSales,
    listAffiliates
};