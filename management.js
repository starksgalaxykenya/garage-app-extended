// =================================================================
// FILE: management.js
// Description: Logic for the secure Garage Management Console (GMC)
// =================================================================

// 1. FIREBASE CONFIGURATION (USE YOUR ACTUAL CONFIG HERE)
const firebaseConfig = {
  apiKey: "AIzaSyBCvFltNyGj3SYR-ADUocWD5EVjljoCEp8",
  authDomain: "garage-manager-1ac7c.firebaseapp.com",
  projectId: "garage-manager-1ac7c",
  storageBucket: "garage-manager-1ac7c.firebasestorage.app",
  messagingSenderId: "226684256206",
  appId: "1:226684256206:web:13d600d6db4c603506759f"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = app.auth();
const db = app.firestore();

// UI Elements
const authSection = document.getElementById('auth-section-management');
const dashboardSection = document.getElementById('management-dashboard');
const loginBtn = document.getElementById('managementLoginBtn');
const logoutBtn = document.getElementById('managementLogoutBtn');
const authMessage = document.getElementById('management-auth-message');
const tabNav = document.getElementById('tab-nav');
const tabContents = document.querySelectorAll('.tab-content');

// Finance UI Elements
const jobForm = document.getElementById('finance-job-form');
const jobIncomeInput = document.getElementById('job-income');
const jobExpenseInput = document.getElementById('job-expense');
const jobProfitDisplay = document.getElementById('job-profit-display');
const generalForm = document.getElementById('finance-general-form');
const dailyTransactionsBody = document.getElementById('daily-transactions-body');
const summaryIncome = document.getElementById('summary-income');
const summaryExpense = document.getElementById('summary-expense');
const summaryProfit = document.getElementById('summary-profit');
const endDayBtn = document.getElementById('end-day-btn');
const reportViewSection = document.getElementById('report-view-section');
const pastReportsList = document.getElementById('past-reports-list');
const viewReportsBtn = document.getElementById('view-reports-btn');

// Supplier UI Elements
const addSupplierForm = document.getElementById('add-supplier-form');
const suppliersTableBody = document.getElementById('suppliers-table-body');
const whatsappSupplierSelect = document.getElementById('whatsapp-supplier-select');
const suppliesListTextarea = document.getElementById('supplies-list');
const orderWhatsappBtn = document.getElementById('order-whatsapp-btn');

// Invoice/Quote UI Elements
const invoiceCreationForm = document.getElementById('invoice-creation-form');
const quoteCreationForm = document.getElementById('quote-creation-form');
const invoicesTableBody = document.getElementById('invoices-table-body');
const quotesTableBody = document.getElementById('quotes-table-body');

// Firestore Collection References
const dailyTransactionsRef = db.collection('dailyTransactions');
const pastReportsRef = db.collection('financialReports');
const suppliersRef = db.collection('suppliers');
const invoicesRef = db.collection('invoices');
const quotesRef = db.collection('quotes');

let currentDailyTransactions = [];
let plChartInstance = null;
let allSuppliers = [];

// =================================================================
// 2. AUTHENTICATION LOGIC (Security Gate)
// =================================================================

function handleManagementLogin() {
    const email = document.getElementById('management-email').value;
    const password = document.getElementById('management-password').value;
    if (!email || !password) {
        authMessage.textContent = "Please enter both email and password.";
        return;
    }
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            console.error("Management Login Error: ", error);
            authMessage.textContent = `Login failed: ${error.message}`;
        });
}

auth.onAuthStateChanged((user) => {
    if (user) {
        authSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        logoutBtn.style.display = 'block';
        authMessage.textContent = '';
        
        // Load data for all modules on login
        listenForDailyTransactions();
        listenForSuppliers();
        listenForInvoices();
        listenForQuotes();

    } else {
        authSection.style.display = 'flex';
        dashboardSection.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
});

loginBtn.addEventListener('click', handleManagementLogin);
logoutBtn.addEventListener('click', () => auth.signOut());

// =================================================================
// 3. TAB SWITCHING LOGIC
// =================================================================

tabNav.addEventListener('click', (event) => {
    if (event.target.classList.contains('tab-button')) {
        const targetId = event.target.id.replace('tab-', 'content-');
        
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active-tab'));
        tabContents.forEach(content => content.classList.add('hidden'));

        event.target.classList.add('active-tab');
        document.getElementById(targetId).classList.remove('hidden');

        // Special logic for the report section
        if (targetId === 'content-finance') {
            document.getElementById('report-view-section').classList.add('hidden');
        }
    }
});

// =================================================================
// 4. FINANCE & REPORTS LOGIC
// =================================================================

// Helper to calculate job profit in real-time
[jobIncomeInput, jobExpenseInput].forEach(input => {
    input.addEventListener('input', () => {
        const income = parseFloat(jobIncomeInput.value) || 0;
        const expense = parseFloat(jobExpenseInput.value) || 0;
        const profit = income - expense;
        jobProfitDisplay.textContent = `Profit: $${profit.toFixed(2)}`;
        jobProfitDisplay.className = profit >= 0 ? 'font-bold text-lg text-green-600' : 'font-bold text-lg text-red-600';
    });
});

/**
 * Submits a Job transaction to Firestore.
 */
jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const income = parseFloat(jobIncomeInput.value);
    const expense = parseFloat(jobExpenseInput.value);
    const profit = income - expense;

    const transaction = {
        type: 'JOB',
        subtype: document.getElementById('job-type').value,
        plate: document.getElementById('job-plate').value || 'N/A',
        description: document.getElementById('job-type').value + (document.getElementById('job-plate').value ? ` for plate ${document.getElementById('job-plate').value}` : ''),
        income: income,
        expense: expense,
        profit: profit,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        isJob: true,
        date: new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
    };

    try {
        await dailyTransactionsRef.add(transaction);
        jobForm.reset();
        jobProfitDisplay.textContent = 'Profit: $0.00';
    } catch (error) {
        alert('Failed to record job transaction.');
        console.error('Job Transaction Error: ', error);
    }
});

/**
 * Submits a General transaction (Expense/Stock/Other Income) to Firestore.
 */
generalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('general-amount').value);
    const type = document.getElementById('general-type').value;

    const isIncome = type === 'Other Income';
    
    const transaction = {
        type: isIncome ? 'INCOME' : 'EXPENSE',
        subtype: type,
        description: type,
        plate: 'N/A',
        income: isIncome ? amount : 0,
        expense: isIncome ? 0 : amount,
        profit: isIncome ? amount : -amount,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        isJob: false,
        date: new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
    };

    try {
        await dailyTransactionsRef.add(transaction);
        generalForm.reset();
    } catch (error) {
        alert('Failed to record general transaction.');
        console.error('General Transaction Error: ', error);
    }
});


/**
 * Real-time listener for today's transactions.
 */
function listenForDailyTransactions() {
    const today = new Date().toLocaleDateString('en-CA');

    dailyTransactionsRef
        .where('date', '==', today)
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            currentDailyTransactions = [];
            let totalIncome = 0;
            let totalExpense = 0;
            
            dailyTransactionsBody.innerHTML = '';

            snapshot.forEach(doc => {
                const data = doc.data();
                currentDailyTransactions.push({ id: doc.id, ...data });

                totalIncome += data.income;
                totalExpense += data.expense;
                
                const profitText = data.profit.toFixed(2);
                const profitClass = data.profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium';
                
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50';
                tr.innerHTML = `
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${new Date(data.timestamp.toDate()).toLocaleTimeString()}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900">${data.subtype}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${data.plate}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-green-600">$${data.income.toFixed(2)}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-red-600">$${data.expense.toFixed(2)}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm ${profitClass}">$${profitText}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm">
                        <button onclick="deleteTransaction('${doc.id}')" class="text-red-500 hover:text-red-700">Delete</button>
                    </td>
                `;
                dailyTransactionsBody.appendChild(tr);
            });

            // Update Summary Stats
            const netProfit = totalIncome - totalExpense;
            summaryIncome.textContent = `$${totalIncome.toFixed(2)}`;
            summaryExpense.textContent = `$${totalExpense.toFixed(2)}`;
            summaryProfit.textContent = `$${netProfit.toFixed(2)}`;
            summaryProfit.className = netProfit >= 0 ? 'font-bold text-indigo-600' : 'font-bold text-red-600';
            
            endDayBtn.disabled = currentDailyTransactions.length === 0;
        }, error => {
            console.error("Error listening to daily transactions: ", error);
        });
}

/**
 * Ends the day, saves the report, and clears transactions.
 */
endDayBtn.addEventListener('click', async () => {
    if (currentDailyTransactions.length === 0) return;
    if (!confirm('Are you sure you want to end the day and save the P&L report? This action cannot be undone for today\'s transactions.')) return;

    const date = new Date().toLocaleDateString('en-CA');
    const totalIncome = currentDailyTransactions.reduce((sum, t) => sum + t.income, 0);
    const totalExpense = currentDailyTransactions.reduce((sum, t) => sum + t.expense, 0);
    const netProfit = totalIncome - totalExpense;

    const report = {
        date: date,
        totalIncome: totalIncome,
        totalExpense: totalExpense,
        netProfit: netProfit,
        transactions: currentDailyTransactions.map(t => ({ // Store a snapshot of today's transactions
            description: t.description,
            income: t.income,
            expense: t.expense,
            profit: t.profit,
            timestamp: t.timestamp
        })),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        // 1. Save the Daily Report
        await pastReportsRef.add(report);

        // 2. Delete all daily transactions
        const batch = db.batch();
        currentDailyTransactions.forEach(t => {
            batch.delete(dailyTransactionsRef.doc(t.id));
        });
        await batch.commit();

        alert(`Day ended successfully. Net Profit for ${date}: $${netProfit.toFixed(2)}`);
        // UI is updated by the onSnapshot listener
    } catch (error) {
        alert('Failed to end day and save report.');
        console.error('End Day Error: ', error);
    }
});

/**
 * Deletes a single transaction (only available before End Day).
 */
async function deleteTransaction(id) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        try {
            await dailyTransactionsRef.doc(id).delete();
        } catch (error) {
            alert('Failed to delete transaction.');
            console.error('Delete Transaction Error: ', error);
        }
    }
}
window.deleteTransaction = deleteTransaction; // Expose to global scope

/**
 * Loads and displays past reports and the monthly graph.
 */
viewReportsBtn.addEventListener('click', () => {
    reportViewSection.classList.remove('hidden');
    
    pastReportsList.innerHTML = '<p class="text-gray-500">Loading reports...</p>';
    
    pastReportsRef.orderBy('date', 'desc').get().then(snapshot => {
        if (snapshot.empty) {
            pastReportsList.innerHTML = '<p class="text-gray-500">No past reports saved.</p>';
            return;
        }

        const reportData = [];
        const monthTotals = {};

        pastReportsList.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            reportData.push(data);

            // Calculate Monthly Totals for Graph
            const monthKey = data.date.substring(0, 7); // YYYY-MM
            monthTotals[monthKey] = (monthTotals[monthKey] || 0) + data.netProfit;

            // Render list item
            const listItem = document.createElement('div');
            listItem.className = 'flex justify-between items-center p-2 bg-gray-50 rounded-lg shadow-sm';
            listItem.innerHTML = `
                <span class="font-medium">${data.date}</span>
                <span class="${data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">$${data.netProfit.toFixed(2)}</span>
                <button onclick="generateDailyReportPDF('${doc.id}')" class="text-blue-500 hover:text-blue-700 text-sm">Print/View</button>
            `;
            pastReportsList.appendChild(listItem);
        });
        
        // Render Chart
        renderFinancialChart(monthTotals);

    }).catch(error => {
        console.error("Error fetching reports: ", error);
        pastReportsList.innerHTML = '<p class="text-red-500">Error loading reports.</p>';
    });
});

/**
 * Renders the P&L trend chart using Chart.js.
 */
function renderFinancialChart(monthTotals) {
    if (plChartInstance) {
        plChartInstance.destroy(); // Destroy previous instance
    }
    
    const sortedMonths = Object.keys(monthTotals).sort();
    const profits = sortedMonths.map(month => monthTotals[month]);

    const ctx = document.getElementById('pl-chart').getContext('2d');
    plChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [{
                label: 'Monthly Net Profit ($)',
                data: profits,
                backgroundColor: profits.map(p => p >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                borderColor: profits.map(p => p >= 0 ? 'rgba(52, 211, 153, 1)' : 'rgba(239, 68, 68, 1)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Profit/Loss ($)'
                    }
                }
            }
        }
    });
}


/**
 * Generates and downloads the Daily P&L Report PDF.
 */
async function generateDailyReportPDF(reportId) {
    try {
        const docSnap = await pastReportsRef.doc(reportId).get();
        if (!docSnap.exists) {
            alert("Report not found.");
            return;
        }
        const report = docSnap.data();

        const doc = new window.jspdf.jsPDF();
        
        doc.setFontSize(18);
        doc.text("Daily P&L Report", 14, 22);
        doc.setFontSize(12);
        doc.text(`Date: ${report.date}`, 14, 30);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

        // Summary Table
        doc.autoTable({
            startY: 45,
            head: [['Metric', 'Amount ($)']],
            body: [
                ['Total Income', report.totalIncome.toFixed(2)],
                ['Total Expense', report.totalExpense.toFixed(2)],
                ['NET PROFIT', report.netProfit.toFixed(2)],
            ],
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [50, 50, 100] }
        });

        // Transactions Table
        doc.setFontSize(14);
        doc.text("Detailed Transactions", 14, doc.autoTable.previous.finalY + 10);
        
        const transactionBody = report.transactions.map(t => [
            t.timestamp.toDate().toLocaleTimeString(),
            t.description,
            t.income.toFixed(2),
            t.expense.toFixed(2),
            t.profit.toFixed(2)
        ]);
        
        doc.autoTable({
            startY: doc.autoTable.previous.finalY + 15,
            head: [['Time', 'Description', 'Income ($)', 'Expense ($)', 'Profit ($)']],
            body: transactionBody,
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [100, 100, 150] }
        });

        doc.save(`Report_${report.date}.pdf`);

    } catch (error) {
        console.error("PDF Generation Error: ", error);
        alert("Failed to generate PDF report.");
    }
}
window.generateDailyReportPDF = generateDailyReportPDF; // Expose to global scope


// =================================================================
// 5. SUPPLIERS & CONTACTS LOGIC
// =================================================================

/**
 * Saves a new supplier.
 */
addSupplierForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const supplier = {
        name: document.getElementById('supplier-name').value,
        type: document.getElementById('supplier-type').value,
        contact: document.getElementById('supplier-contact').value,
        location: document.getElementById('supplier-location').value,
        owed: parseFloat(document.getElementById('supplier-owed').value) || 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        await suppliersRef.add(supplier);
        addSupplierForm.reset();
        alert('Supplier saved successfully!');
    } catch (error) {
        alert('Failed to save supplier.');
        console.error('Supplier Save Error: ', error);
    }
});

/**
 * Real-time listener for suppliers list.
 */
function listenForSuppliers() {
    suppliersRef.orderBy('name').onSnapshot(snapshot => {
        allSuppliers = [];
        suppliersTableBody.innerHTML = '';
        whatsappSupplierSelect.innerHTML = '<option value="">Select Supplier</option>';

        snapshot.forEach(doc => {
            const data = doc.data();
            allSuppliers.push({ id: doc.id, ...data });

            // Render table row
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${data.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${data.type}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${data.contact}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${data.owed > 0 ? 'text-red-600 font-bold' : 'text-green-600'}">$${data.owed.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="editSupplier('${doc.id}')" class="text-indigo-600 hover:text-indigo-900 mr-2">Edit</button>
                    <button onclick="deleteSupplier('${doc.id}')" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            `;
            suppliersTableBody.appendChild(tr);

            // Populate WhatsApp dropdown
            const option = document.createElement('option');
            option.value = data.id;
            option.textContent = data.name;
            whatsappSupplierSelect.appendChild(option);
        });

        orderWhatsappBtn.disabled = allSuppliers.length === 0;
    }, error => {
        console.error("Error listening to suppliers: ", error);
    });
}

/**
 * WhatsApp Order Logic
 */
whatsappSupplierSelect.addEventListener('change', () => {
    orderWhatsappBtn.disabled = whatsappSupplierSelect.value === "";
});

orderWhatsappBtn.addEventListener('click', () => {
    const supplierId = whatsappSupplierSelect.value;
    const suppliesText = suppliesListTextarea.value;
    
    if (!supplierId || !suppliesText) {
        alert("Please select a supplier and enter the list of supplies.");
        return;
    }

    const supplier = allSuppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.contact) {
        alert("Supplier contact not found.");
        return;
    }
    
    const cleanedContact = supplier.contact.replace(/\D/g, ''); // Remove all non-digits
    const message = `*Supply Request for ${supplier.name}*\n\n--- REQUIRED ITEMS ---\n\n${suppliesText}\n\n--- END OF LIST ---\n\n*Garage Manager PRO*`;
    const encodedMessage = encodeURIComponent(message);
    
    // Use the official WhatsApp API link
    const whatsappUrl = `https://wa.me/${cleanedContact}?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
});

// Stubs for actions
function editSupplier(id) { alert(`Editing supplier ${id}...`); }
function deleteSupplier(id) { alert(`Deleting supplier ${id}...`); }
window.editSupplier = editSupplier;
window.deleteSupplier = deleteSupplier;


// =================================================================
// 6. RECEIPT & INVOICE LOGIC
// =================================================================

/**
 * Calculates the total amount for invoices/quotes in real-time.
 */
function calculateTotal(type) {
    const container = document.getElementById(`${type}-items-container`);
    const amountInputs = container.querySelectorAll(`.${type}-item-amount`);
    let total = 0;
    amountInputs.forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    document.getElementById(`${type}-total-display`).textContent = `$${total.toFixed(2)}`;
    return total;
}

/**
 * Attaches listeners to amount inputs for real-time total calculation.
 */
function attachAmountListeners(type) {
    const container = document.getElementById(`${type}-items-container`);
    container.querySelectorAll(`.${type}-item-amount`).forEach(input => {
        input.removeEventListener('input', () => calculateTotal(type)); // Prevent duplicates
        input.addEventListener('input', () => calculateTotal(type));
    });
}

// Initial attachment of listeners
document.addEventListener('DOMContentLoaded', () => {
    attachAmountListeners('invoice');
    attachAmountListeners('quote');
});


/**
 * Submits and commits a new Invoice.
 */
invoiceCreationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const totalAmount = calculateTotal('invoice');

    const items = [];
    document.querySelectorAll('#invoice-items-container .item-row').forEach(row => {
        items.push({
            description: row.querySelector('.item-desc').value,
            amount: parseFloat(row.querySelector('.item-amount').value)
        });
    });

    const invoice = {
        invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
        clientName: document.getElementById('invoice-client-name').value,
        clientPhone: document.getElementById('invoice-client-phone').value,
        carPlate: document.getElementById('invoice-car-plate').value,
        items: items,
        total: totalAmount,
        date: new Date().toLocaleDateString('en-CA'),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await invoicesRef.add(invoice);
        
        // AUTOMATIC FINANCE REFLECTION
        const financeTransaction = {
            type: 'JOB',
            subtype: 'Invoice/Receipt',
            plate: invoice.carPlate,
            description: `Invoice #${invoice.invoiceNo} paid by ${invoice.clientName}`,
            income: totalAmount,
            expense: 0, // Assuming labor and part cost expense is recorded separately in finance or derived from main app job card
            profit: totalAmount,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            isJob: true,
            date: new Date().toLocaleDateString('en-CA')
        };
        await dailyTransactionsRef.add(financeTransaction);
        
        invoiceCreationForm.reset();
        document.getElementById('invoice-items-container').innerHTML = ''; // Clear items
        addInvoiceItemRow(); // Add back one empty row
        alert('Invoice committed and amount reflected in Finance successfully!');
    } catch (error) {
        alert('Failed to generate or commit invoice.');
        console.error('Invoice Creation Error: ', error);
    }
});

/**
 * Real-time listener for invoices list.
 */
function listenForInvoices() {
    invoicesRef.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        invoicesTableBody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            tr.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">${data.invoiceNo}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${data.date}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${data.clientName} / ${data.carPlate}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-green-600 font-bold">$${data.total.toFixed(2)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm">
                    <button onclick="generateInvoicePDF('${doc.id}', '${data.clientPhone}')" class="text-blue-500 hover:text-blue-700 mr-2">PDF/Share</button>
                    <button onclick="deleteInvoice('${doc.id}')" class="text-red-500 hover:text-red-700">Delete</button>
                </td>
            `;
            invoicesTableBody.appendChild(tr);
        });
    }, error => {
        console.error("Error listening to invoices: ", error);
    });
}

/**
 * Generates and shares the Invoice PDF.
 */
async function generateInvoicePDF(invoiceId, clientPhone) {
    try {
        const docSnap = await invoicesRef.doc(invoiceId).get();
        if (!docSnap.exists) {
            alert("Invoice not found.");
            return;
        }
        const invoice = docSnap.data();
        
        // --- PDF GENERATION LOGIC (JSPDF) ---
        const doc = new window.jspdf.jsPDF();
        
        doc.setFontSize(22);
        doc.text("INVOICE / RECEIPT", 14, 25);
        
        doc.setFontSize(10);
        doc.text(`Invoice No: ${invoice.invoiceNo}`, 14, 35);
        doc.text(`Date: ${invoice.date}`, 14, 40);
        
        doc.text(`Client: ${invoice.clientName}`, 14, 50);
        doc.text(`Phone: ${invoice.clientPhone}`, 14, 55);
        doc.text(`Vehicle Plate: ${invoice.carPlate}`, 14, 60);

        // Items Table
        const itemBody = invoice.items.map(item => [item.description, `$${item.amount.toFixed(2)}`]);
        
        doc.autoTable({
            startY: 70,
            head: [['Description', 'Amount ($)']],
            body: itemBody,
            foot: [['Total', `$${invoice.total.toFixed(2)}`]],
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [50, 50, 100] },
            footStyles: { fillColor: [200, 200, 250], textColor: [0, 0, 0], fontSize: 12, fontStyle: 'bold' }
        });
        
        const pdfOutput = doc.output('blob');
        const pdfFileName = `Invoice_${invoice.invoiceNo}.pdf`;
        
        // --- SHARE VIA WHATSAPP (Requires server-side file hosting, simplified here) ---
        if (confirm('PDF is generated. Do you want to share a text summary via WhatsApp?')) {
            const message = `*Garage Manager PRO Invoice* (No. ${invoice.invoiceNo})\n\nDear ${invoice.clientName},\n\nYour invoice is ready. Total amount: *$${invoice.total.toFixed(2)}*.\n\nThank you for your business!`;
            const cleanedContact = clientPhone.replace(/\D/g, '');
            const encodedMessage = encodeURIComponent(message);
            const whatsappUrl = `https://wa.me/${cleanedContact}?text=${encodedMessage}`;
            window.open(whatsappUrl, '_blank');
        }

        // --- DOWNLOAD/PRINT ---
        doc.save(pdfFileName);

    } catch (error) {
        console.error("Invoice PDF/Share Error: ", error);
        alert("Failed to generate or share invoice.");
    }
}
function deleteInvoice(id) { alert(`Deleting invoice ${id}...`); }

window.generateInvoicePDF = generateInvoicePDF;
window.deleteInvoice = deleteInvoice;


// =================================================================
// 7. REPAIR QUOTES LOGIC
// =================================================================

/**
 * Submits and saves a new Quote.
 */
quoteCreationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const totalAmount = calculateTotal('quote');

    const items = [];
    document.querySelectorAll('#quote-items-container .quote-item-row').forEach(row => {
        items.push({
            description: row.querySelector('.quote-item-desc').value,
            amount: parseFloat(row.querySelector('.quote-item-amount').value)
        });
    });

    const quote = {
        quoteNo: `QUO-${Date.now().toString().slice(-6)}`,
        clientName: document.getElementById('quote-client-name').value,
        clientPhone: document.getElementById('quote-client-phone').value,
        carPlate: document.getElementById('quote-car-plate').value,
        carMake: document.getElementById('quote-car-make').value,
        items: items,
        total: totalAmount,
        date: new Date().toLocaleDateString('en-CA'),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await quotesRef.add(quote);
        quoteCreationForm.reset();
        document.getElementById('quote-items-container').innerHTML = '';
        addQuoteItemRow();
        alert('Quote generated and saved successfully!');
    } catch (error) {
        alert('Failed to save quote.');
        console.error('Quote Creation Error: ', error);
    }
});


/**
 * Real-time listener for quotes list.
 */
function listenForQuotes() {
    quotesRef.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        quotesTableBody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            tr.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">${data.quoteNo}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${data.date}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${data.clientName} / ${data.carPlate}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-indigo-600 font-bold">$${data.total.toFixed(2)} (Est.)</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm">
                    <button onclick="generateQuotePDF('${doc.id}', '${data.clientPhone}')" class="text-blue-500 hover:text-blue-700 mr-2">PDF/Share</button>
                    <button onclick="deleteQuote('${doc.id}')" class="text-red-500 hover:text-red-700">Delete</button>
                </td>
            `;
            quotesTableBody.appendChild(tr);
        });
    }, error => {
        console.error("Error listening to quotes: ", error);
    });
}


/**
 * Generates and shares the Repair Quote PDF.
 */
async function generateQuotePDF(quoteId, clientPhone) {
    try {
        const docSnap = await quotesRef.doc(quoteId).get();
        if (!docSnap.exists) {
            alert("Quote not found.");
            return;
        }
        const quote = docSnap.data();

        // --- PDF GENERATION LOGIC (JSPDF) ---
        const doc = new window.jspdf.jsPDF();
        
        doc.setFontSize(22);
        doc.text("REPAIR QUOTE", 14, 25);
        
        doc.setFontSize(10);
        doc.text(`Quote No: ${quote.quoteNo}`, 14, 35);
        doc.text(`Date: ${quote.date}`, 14, 40);
        
        doc.text(`Client: ${quote.clientName}`, 14, 50);
        doc.text(`Phone: ${quote.clientPhone}`, 14, 55);
        doc.text(`Vehicle: ${quote.carMake}`, 14, 60);
        doc.text(`Vehicle Plate: ${quote.carPlate}`, 14, 65);

        // Items Table
        const itemBody = quote.items.map(item => [item.description, `$${item.amount.toFixed(2)}`]);
        
        doc.autoTable({
            startY: 75,
            head: [['Estimated Item/Service', 'Estimated Cost ($)']],
            body: itemBody,
            foot: [['Estimated Total', `$${quote.total.toFixed(2)}`]],
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [100, 100, 150] },
            footStyles: { fillColor: [200, 200, 250], textColor: [0, 0, 0], fontSize: 12, fontStyle: 'bold' }
        });
        
        doc.setFontSize(9);
        doc.text("NOTE: This is an estimate. Final costs may vary based on unforeseen repairs.", 14, doc.autoTable.previous.finalY + 8);

        // --- SHARE VIA WHATSAPP ---
        if (confirm('PDF is generated. Do you want to share a text summary via WhatsApp?')) {
            const message = `*Garage Manager PRO Repair Quote* (No. ${quote.quoteNo})\n\nDear ${quote.clientName},\n\nYour repair quote for the ${quote.carMake} is *$${quote.total.toFixed(2)}* (Estimated).\n\nPlease reply to confirm the repair.`;
            const cleanedContact = clientPhone.replace(/\D/g, '');
            const encodedMessage = encodeURIComponent(message);
            const whatsappUrl = `https://wa.me/${cleanedContact}?text=${encodedMessage}`;
            window.open(whatsappUrl, '_blank');
        }

        // --- DOWNLOAD/PRINT ---
        doc.save(`Quote_${quote.quoteNo}.pdf`);

    } catch (error) {
        console.error("Quote PDF/Share Error: ", error);
        alert("Failed to generate or share quote.");
    }
}
function deleteQuote(id) { alert(`Deleting quote ${id}...`); }

window.generateQuotePDF = generateQuotePDF;
window.deleteQuote = deleteQuote;
