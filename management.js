// =================================================================
// FILE: management.js
// Description: Logic for the secure Garage Management Console (GMC)
// =================================================================

// 1. FIREBASE CONFIGURATION (USE YOUR ACTUAL CONFIG HERE)
// IMPORTANT: Use the exact same configuration object you used in your main app.
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
const emailInput = document.getElementById('management-email');
const passwordInput = document.getElementById('management-password');
const authMessage = document.getElementById('management-auth-message');
const tabNav = document.getElementById('tab-nav');
const tabContents = document.querySelectorAll('.tab-content');

// Firestore Collection References
const inventoryRef = db.collection('inventory');

/**
 * Handles the secure login for the Management Console.
 * NOTE: The user has to be registered in Firebase Authentication first.
 */
async function handleManagementLogin() {
    const email = emailInput.value;
    const password = passwordInput.value;

    if (!email || !password) {
        authMessage.textContent = "Please enter both email and password.";
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // authStateChanged listener will handle UI update
    } catch (error) {
        console.error("Management Login Error: ", error);
        authMessage.textContent = `Login failed: ${error.message}`;
    }
}

/**
 * Handles user authentication state changes (login/logout).
 * This is the main security gate.
 */
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is signed in.
        authSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        logoutBtn.style.display = 'block';
        authMessage.textContent = '';
        
        // Load initial data (Inventory in this case)
        listenForInventoryUpdates();

    } else {
        // User is signed out.
        authSection.style.display = 'flex'; // Use flex to center
        dashboardSection.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
});

// Attach Listeners
loginBtn.addEventListener('click', handleManagementLogin);
logoutBtn.addEventListener('click', () => auth.signOut());


// =================================================================
// 2. TAB SWITCHING LOGIC
// =================================================================

tabNav.addEventListener('click', (event) => {
    if (event.target.classList.contains('tab-button')) {
        const targetId = event.target.id.replace('tab-', 'content-');

        // Deactivate all tabs and hide all content
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active-tab'));
        tabContents.forEach(content => content.classList.add('hidden'));

        // Activate clicked tab and show relevant content
        event.target.classList.add('active-tab');
        document.getElementById(targetId).classList.remove('hidden');
    }
});


// =================================================================
// 3. INVENTORY MANAGEMENT (CRUD Example)
// =================================================================

document.getElementById('new-part-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const partName = document.getElementById('part-name').value;
    const partSku = document.getElementById('part-sku').value;
    const partStock = parseInt(document.getElementById('part-stock').value, 10);
    const partCost = parseFloat(document.getElementById('part-cost').value);
    const partPrice = parseFloat(document.getElementById('part-price').value);

    if (!partName || !partSku || isNaN(partStock) || isNaN(partCost) || isNaN(partPrice)) {
        alert("Please fill in all part details correctly.");
        return;
    }

    try {
        await inventoryRef.add({
            name: partName,
            sku: partSku,
            stock: partStock,
            cost: partCost,
            price: partPrice,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        e.target.reset(); // Clear form on success
    } catch (error) {
        console.error("Error adding part: ", error);
        alert("Failed to add part. Check console for details.");
    }
});

/**
 * Fetches and renders the inventory list in real-time.
 */
function listenForInventoryUpdates() {
    inventoryRef.orderBy('name').onSnapshot(snapshot => {
        const tbody = document.getElementById('inventory-table-body');
        tbody.innerHTML = ''; // Clear existing list

        snapshot.forEach(doc => {
            const part = doc.data();
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            
            // Stock level alert styling
            const stockClass = part.stock < 5 ? 'font-bold text-red-600' : 'text-gray-900';
            
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${part.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${part.sku}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${stockClass}">${part.stock}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${part.cost.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${part.price.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="deletePart('${doc.id}')" class="text-red-600 hover:text-red-900 ml-4">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }, error => {
        console.error("Error listening to inventory: ", error);
    });
}

/**
 * Deletes a part from the inventory.
 */
async function deletePart(partId) {
    if (confirm('Are you sure you want to delete this part from inventory?')) {
        try {
            await inventoryRef.doc(partId).delete();
        } catch (error) {
            console.error("Error deleting part: ", error);
            alert("Failed to delete part.");
        }
    }
}

// Expose deletePart to the global scope for onclick in HTML
window.deletePart = deletePart;
