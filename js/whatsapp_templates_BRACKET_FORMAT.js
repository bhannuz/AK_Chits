/**
 * UPDATED: WhatsApp Template Management System - BRACKET FORMAT
 * Changed from {{placeholder}} to [placeholder] format
 * 
 * This matches your existing app's [Name] format
 */

// ============================================
// TEMPLATE MANAGEMENT FUNCTIONS (No changes)
// ============================================

async function loadWhatsAppTemplates() {
    try {
        const snapshot = await db.collection('whatsappTemplates')
            .orderBy('type')
            .orderBy('version', 'desc')
            .get();
        
        window.whatsappTemplates = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('✅ Loaded templates:', window.whatsappTemplates.length);
        return window.whatsappTemplates;
    } catch (error) {
        console.error('❌ Error loading templates:', error);
        return [];
    }
}

async function saveWhatsAppTemplate(templateData) {
    try {
        const { type, name, message, variables } = templateData;
        
        if (!type || !name || !message) {
            alert('❌ Please fill all required fields');
            return;
        }
        
        const existingTemplates = window.whatsappTemplates.filter(t => t.type === type && t.name === name);
        const nextVersion = existingTemplates.length > 0 
            ? Math.max(...existingTemplates.map(t => t.version || 1)) + 1 
            : 1;
        
        const newTemplate = {
            type: type,
            name: name,
            message: message,
            variables: extractVariables(message),
            version: nextVersion,
            isActive: true,
            createdAt: new Date(),
            createdBy: CURRENT_USER?.email || 'admin',
            updatedAt: new Date()
        };
        
        const docRef = await db.collection('whatsappTemplates').add(newTemplate);
        
        console.log('✅ Template saved:', docRef.id);
        await loadWhatsAppTemplates();
        return docRef.id;
    } catch (error) {
        console.error('❌ Error saving template:', error);
        alert('Failed to save template');
    }
}

// ============================================
// EXTRACT VARIABLES - UPDATED FOR BRACKET FORMAT
// ============================================

/**
 * Extract variables from message using BRACKET FORMAT [variable]
 */
function extractVariables(message) {
    const regex = /\[(\w+)\]/g;  // Changed: Look for [word]
    const variables = [];
    let match;
    
    while ((match = regex.exec(message)) !== null) {
        if (!variables.includes(match[1])) {
            variables.push(match[1]);
        }
    }
    
    return variables;
}

// ============================================
// REPLACE TEMPLATE VARIABLES - MAIN FUNCTION
// ============================================

/**
 * Replace placeholders in template with actual values
 * BRACKET FORMAT: [memberName], [amount], [dueDate], etc.
 */
function replaceTemplateVariables(message, data) {
    let processedMessage = message;
    
    const replacements = {
        // Member Information
        memberName: data.memberName || '—',
        Name: data.memberName || '—',  // Alias
        memberPhone: data.memberPhone || '—',
        Phone: data.memberPhone || '—',  // Alias
        memberId: data.memberId || '—',
        
        // Group Information
        groupName: data.groupName || '—',
        groupAmount: data.groupAmount || '—',
        monthlyAmount: formatAmount(data.monthlyAmount) || '—',
        fixedAmount: formatAmount(data.fixedAmount) || '—',
        amount: formatAmount(data.amount) || '—',
        groupId: data.groupId || '—',
        groupDuration: data.groupDuration || '—',
        groupStartDate: formatDate(data.groupStartDate) || '—',
        
        // Payment Information
        paidAmount: formatAmount(data.paidAmount) || '—',
        paid: formatAmount(data.paid) || '—',
        balance: formatAmount(data.balance) || '—',
        remainingBalance: formatAmount(data.remainingBalance) || '—',
        paymentMode: data.paymentMode || '—',
        paymentDate: formatDate(data.paymentDate) || '—',
        lastPaymentDate: formatDate(data.lastPaymentDate) || '—',
        paymentId: data.paymentId || '—',
        
        // Month/Date Information
        dueDate: formatDate(data.dueDate) || '—',
        dueDateShort: data.dueDateShort || '—',
        nextDueDate: formatDate(data.nextDueDate) || '—',
        paymentMonth: data.paymentMonth || '—',
        currentMonth: data.currentMonth || '—',
        monthNumber: data.monthNumber || '—',
        monthSlot: data.monthSlot || '—',
        totalMonths: data.totalMonths || '—',
        monthsRemaining: data.monthsRemaining || '—',
        
        // Chit Information
        chitNumber: data.chitNumber || '—',
        chitPicked: data.chitPicked || '—',
        chitPickedDate: formatDate(data.chitPickedDate) || '—',
        chitPickedBy: data.chitPickedBy || '—',
        slotNumber: data.slotNumber || '—',
        totalSlots: data.totalSlots || '—',
        slot: data.slot || data.chitNumber || '—',
        
        // Status Information
        status: data.status || '—',
        paymentStatus: data.paymentStatus || '—',
        overdue: data.overdue || '—',
        monthsOverdue: data.monthsOverdue || '—',
        installmentsPending: data.installmentsPending || '—',
        installmentsCompleted: data.installmentsCompleted || '—',
        completionPercentage: data.completionPercentage || '—',
        
        // Calculated Fields
        totalPaid: formatAmount(data.totalPaid) || '—',
        totalBalance: formatAmount(data.totalBalance) || '—',
        amountDue: formatAmount(data.amountDue) || '—',
        nextPaymentAmount: formatAmount(data.nextPaymentAmount) || '—',
        monthsDue: data.monthsDue || '—',
        daysUntilDue: data.daysUntilDue || '—',
        daysOverdue: data.daysOverdue || '—',
        
        // Timestamps
        timestamp: formatDate(new Date()) || '—'
    };
    
    // Replace all placeholders using BRACKET FORMAT [key]
    Object.keys(replacements).forEach(key => {
        // ✅ Use \[ and \] for bracket format
        const regex = new RegExp(`\\[${key}\\]`, 'g');
        processedMessage = processedMessage.replace(regex, replacements[key]);
    });
    
    return processedMessage;
}

// ============================================
// GET PREVIEW - BRACKET FORMAT
// ============================================

/**
 * Get preview of template with sample data
 */
function getTemplatePreview(template) {
    const sampleData = {
        memberName: 'John Doe',
        amount: '23077',
        dueDate: '05.May.2026',
        groupName: '3 Lakhs',
        chitNumber: '1',
        paidAmount: '23077',
        balance: '0',
        paymentMode: 'UPI',
        nextDueDate: '05.Jun.2026',
        monthlyAmount: '23077',
        paymentDate: '13.Apr.2026',
        installmentsCompleted: '1/13',
        totalMonths: '13',
        completionPercentage: '7.7%'
    };
    
    return replaceTemplateVariables(template.message, sampleData);
}

// ============================================
// INSERT VARIABLE - BRACKET FORMAT
// ============================================

/**
 * Insert variable into message using BRACKET FORMAT
 */
function insertVariable(variable) {
    const textarea = document.getElementById('templateMessage');
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    
    // ✅ Changed: Use bracket format [variable]
    textarea.value = textBefore + `[${variable}]` + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos + variable.length + 2;  // +2 for [ and ]
    
    updateTemplatePreview();
}

// ============================================
// UPDATE PREVIEW - NO CHANGES NEEDED
// ============================================

/**
 * Update preview when message changes
 */
function updateTemplatePreview() {
    const message = document.getElementById('templateMessage')?.value;
    const sampleData = {
        memberName: 'John Doe',
        amount: '23077',
        dueDate: '05.May.2026',
        groupName: '3 Lakhs',
        balance: '0',
        paidAmount: '23077',
        paymentMode: 'UPI',
        nextDueDate: '05.Jun.2026',
        monthlyAmount: '23077',
        paymentDate: '13.Apr.2026',
        installmentsCompleted: '1/13',
        totalMonths: '13',
        completionPercentage: '7.7%'
    };
    
    const preview = replaceTemplateVariables(message, sampleData);
    document.getElementById('templatePreview').textContent = preview;
}

// ============================================
// SEND TEMPLATE VIA WHATSAPP
// ============================================

/**
 * Send template message via WhatsApp
 */
async function sendTemplateViaWhatsApp(templateId, memberData) {
    try {
        const template = getWhatsAppTemplate(templateId);
        
        if (!template) {
            alert('❌ Template not found');
            return;
        }
        
        // Replace variables using bracket format
        const message = replaceTemplateVariables(template.message, memberData);
        
        // Prepare WhatsApp message
        const phoneNumber = memberData.phoneNumber;
        const encodedMessage = encodeURIComponent(message);
        
        // Open WhatsApp Web
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
        
        // Log message sent
        await logMessageSent(templateId, memberData.memberId, message);
        
        console.log('✅ Message sent to:', phoneNumber);
    } catch (error) {
        console.error('❌ Error sending message:', error);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getWhatsAppTemplate(templateId) {
    return window.whatsappTemplates?.find(t => t.id === templateId);
}

function getTemplatesByType(type) {
    return window.whatsappTemplates?.filter(t => t.type === type && t.isActive) || [];
}

async function logMessageSent(templateId, memberId, message) {
    try {
        await db.collection('messageLogs').add({
            templateId: templateId,
            memberId: memberId,
            message: message,
            sentAt: new Date(),
            sentBy: CURRENT_USER?.email || 'admin',
            platform: 'whatsapp'
        });
        console.log('✅ Message logged');
    } catch (error) {
        console.error('❌ Error logging message:', error);
    }
}

function formatPhoneNumber(phone) {
    if (!phone) return '';
    
    let formatted = phone.toString().trim();
    
    if (formatted.startsWith('0')) {
        formatted = formatted.substring(1);
    }
    
    if (!formatted.startsWith('+')) {
        formatted = '+91' + formatted;
    }
    
    return formatted;
}

function formatDate(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day}.${month}.${year}`;
}

function formatAmount(amount) {
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (typeof loadWhatsAppTemplates === 'function') {
            await loadWhatsAppTemplates();
            console.log('✅ WhatsApp Templates initialized - BRACKET FORMAT');
        }
    } catch (error) {
        console.warn('⚠️ WhatsApp initialization note:', error.message);
    }
});

