
        // Firebase Configuration - Updated with your config
        const firebaseConfig = {
            apiKey: "AIzaSyADG6dvLWqquXfYIVn5kdN4SIeuDxnxFw0",
            authDomain: "task-management-system-24e8d.firebaseapp.com",
            projectId: "task-management-system-24e8d",
            storageBucket: "task-management-system-24e8d.firebasestorage.app",
            messagingSenderId: "513122653583",
            appId: "1:513122653583:web:f763bec1a49a17eb2aa7fa",
            measurementId: "G-HM6YJ6P40Z"
        };

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // Session management functions
        function saveUserSession(userData, section = 'dashboard') {
            localStorage.setItem('currentUser', JSON.stringify(userData));
            localStorage.setItem('currentSection', section);
        }

        function loadUserSession() {
            const savedUser = localStorage.getItem('currentUser');
            const savedSection = localStorage.getItem('currentSection');

            if (savedUser) {
                currentUser = JSON.parse(savedUser);
                currentSection = savedSection || 'dashboard';
                return true;
            }
            return false;
        }

        function clearUserSession() {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('currentSection');
        }

        // Global variables
        let currentUser = null;
        let currentPage = 1;
        const tasksPerPage = 10;
        let allTasks = [];
        let filteredTasks = [];
        let map = null;
        let driverMarkers = {};
        let currentSection = 'dashboard'; // Track current admin section
        let driverTasks = []; // Store driver tasks
        let currentDriverFilter = 'pending'; // Track current filter

        // Login functionality
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const usersRef = db.collection('users');
                const snapshot = await usersRef
                    .where('username', '==', username)
                    .where('password', '==', password)
                    .get();

                if (!snapshot.empty) {
                    const userData = snapshot.docs[0].data();

                    // ✅ เก็บข้อมูลลง currentUser พร้อมชื่อจริง
                    currentUser = {
                        username: userData.username,
                        role: userData.role,
                        name: userData.name,           // ชื่อจริง
                        fullName: userData.name || '', // fullName เผื่อใช้ในแจ้งเตือน
                        ...userData
                    };

                    // Save user session
                    saveUserSession(currentUser);

                    document.getElementById('loginScreen').classList.add('hidden');

                    if (userData.role === 'admin') {
                        document.getElementById('adminDashboard').classList.remove('hidden');
                        document.getElementById('adminName').textContent = userData.name;
                        loadAdminDashboard();
                        console.log('Admin logged in - location tracking disabled for privacy and security');
                    } else {
                        document.getElementById('driverDashboard').classList.remove('hidden');
                        document.getElementById('driverName').textContent = userData.name;
                        loadDriverDashboard();

                        // Set up real-time listener for driver tasks
                        setupDriverTaskListener();

                        // Only start location tracking for drivers, not admin
                        startLocationTracking();
                        console.log('Driver logged in - location tracking enabled');
                    }
                } else {
                    document.getElementById('loginErrorText').textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
                    document.getElementById('loginError').classList.remove('hidden');
                }
            } catch (error) {
                console.error('Login error:', error);
                document.getElementById('loginErrorText').textContent = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
                document.getElementById('loginError').classList.remove('hidden');
            }
        });


        // Toggle password visibility
        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eyeIcon');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.innerHTML = `
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                `;
            } else {
                passwordInput.type = 'password';
                eyeIcon.innerHTML = `
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                `;
            }
        }

        // ฟังก์ชันดึงตำแหน่งล่าสุดของคนขับ
async function getDriverLocationText(username) {
    try {
        const doc = await db.collection('driver_locations').doc(username).get();
        if (!doc.exists) return "ไม่ทราบตำแหน่ง";

        const data = doc.data();

        // ถ้ามี address ให้ใช้เลย
        if (data.address) {
            return data.address;
        }

        // ถ้าไม่มี address ใช้ lat/lng
        if (data.latitude && data.longitude) {
            return `(${data.latitude}, ${data.longitude})`;
        }

        return "ไม่ทราบตำแหน่ง";
    } catch (error) {
        console.error("Error fetching driver location:", error);
        return "ไม่ทราบตำแหน่ง";
    }
}


// Logout functionality - direct logout without confirmation
async function logout() {
    if (currentUser && currentUser.role === 'driver') {
        try {
            stopLocationTracking();

            // ✅ ดึงตำแหน่งล่าสุดก่อนอัปเดตเป็น offline
            const locationText = await getDriverLocationText(currentUser.username);

            await db.collection('driver_locations').doc(currentUser.username).update({
                status: 'offline',
                lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
            });

            const dateTime = getCurrentDateTime();
            const driverName = currentUser.fullName || currentUser.name || currentUser.username;

            const message = `🚪 คนขับรถออกจากระบบแล้ว\n👨‍💼 คนขับ: ${driverName}\n📍 ตำแหน่งล่าสุด: ${locationText}\n⏰ เวลา: ${dateTime}`;
            await sendLineNotify(message);

            console.log('✅ Logout: Driver status offline and LINE notified');
        } catch (error) {
            console.error('❌ Error during logout:', error);
        }
    }

    clearUserSession();
    currentUser = null;
    currentSection = 'dashboard';
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('driverDashboard').classList.add('hidden');
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').classList.add('hidden');
    showNotification('success', '👋 ออกจากระบบแล้ว', 'คุณได้ออกจากระบบเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ', 3000);
}



        // Toggle mobile menu
        function toggleMobileMenu() {
            const mobileMenu = document.getElementById('mobileMenu');
            mobileMenu.classList.toggle('hidden');
        }

        // Admin navigation
        function showAdminSection(section) {
            // Update current section and save to session
            currentSection = section;
            saveUserSession(currentUser, section);

            // Hide all sections
            document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));

            // Show selected section
            document.getElementById(section + 'Section').classList.remove('hidden');

            // Reset all desktop buttons to inactive state (gray colors)
            document.querySelectorAll('.admin-nav-btn').forEach(btn => {
                // Remove all active classes
                btn.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-blue-700', 'from-emerald-600', 'to-green-600', 'from-orange-600', 'to-amber-600', 'from-purple-600', 'to-indigo-600', 'from-rose-600', 'to-pink-600', 'shadow-lg', 'hover:shadow-xl', 'hover:scale-105', 'transform');
                // Remove old inactive colors
                btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'opacity-60', 'hover:opacity-80');

                // Set gray color for all inactive menus
                btn.classList.add('bg-gradient-to-r', 'from-gray-600', 'to-gray-700', 'opacity-70', 'hover:opacity-100');
            });

            // Reset all mobile buttons to inactive state (gray colors)
            document.querySelectorAll('.admin-nav-btn-mobile').forEach(btn => {
                // Remove all active classes
                btn.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-blue-700', 'from-emerald-600', 'to-green-600', 'from-orange-600', 'to-amber-600', 'from-purple-600', 'to-indigo-600', 'from-rose-600', 'to-pink-600');
                // Remove old inactive colors
                btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'opacity-60', 'hover:opacity-80');

                // Set gray color for all inactive menus
                btn.classList.add('bg-gradient-to-r', 'from-gray-600', 'to-gray-700', 'opacity-70', 'hover:opacity-100');
            });

            // Activate the selected section button with dark colors - Desktop
            const sectionClasses = {
                'dashboard': ['bg-gradient-to-r', 'from-blue-600', 'to-blue-700'],
                'assign': ['bg-gradient-to-r', 'from-emerald-600', 'to-green-600'],
                'tasks': ['bg-gradient-to-r', 'from-orange-600', 'to-amber-600'],
                'reports': ['bg-gradient-to-r', 'from-purple-600', 'to-indigo-600'],
                'tracking': ['bg-gradient-to-r', 'from-rose-600', 'to-pink-600']
            };

            // Activate desktop button (dark colors)
            const activeDesktopBtn = document.querySelector(`.${section}-btn`);
            if (activeDesktopBtn) {
                // Remove inactive gray classes
                activeDesktopBtn.classList.remove('from-gray-600', 'to-gray-700', 'opacity-70', 'hover:opacity-100');
                // Add active dark colors
                activeDesktopBtn.classList.add(...sectionClasses[section], 'shadow-lg', 'hover:shadow-xl', 'hover:scale-105', 'transform', 'opacity-100');
            }

            // Activate mobile button (dark colors)
            const activeMobileBtn = document.querySelector(`.${section}-btn-mobile`);
            if (activeMobileBtn) {
                // Remove inactive gray classes
                activeMobileBtn.classList.remove('from-gray-600', 'to-gray-700', 'opacity-70', 'hover:opacity-100');
                // Add active dark colors
                activeMobileBtn.classList.add(...sectionClasses[section], 'opacity-100');
            }

            // Update page title
            const titles = {
                'dashboard': 'แดชบอร์ด',
                'assign': 'มอบหมายงาน',
                'tasks': 'รายการงาน',
                'reports': 'รายงาน',
                'tracking': 'ติดตามตำแหน่ง'
            };
            document.getElementById('pageTitle').textContent = titles[section] || 'แดชบอร์ด';

            // Load section-specific data
            if (section === 'dashboard') {
                loadAdminDashboard();
            } else if (section === 'tasks') {
                // Load tasks immediately when switching to tasks section
                loadAllTasks();
            } else if (section === 'reports') {
                loadReports();
            } else if (section === 'tracking') {
                loadTracking();
            }
        }

        // Load admin dashboard
        async function loadAdminDashboard() {
            try {
                const tasksSnapshot = await db.collection('tasks').get();
                const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Update stats
                document.getElementById('totalTasks').textContent = tasks.length;
                document.getElementById('pendingTasks').textContent = tasks.filter(t => t.status === 'pending').length;
                document.getElementById('inProgressTasks').textContent = tasks.filter(t => t.status === 'in-progress').length;
                document.getElementById('completedTasks').textContent = tasks.filter(t => t.status === 'completed').length;

                // Load driver status
                loadDriverStatus();

                // Load recent tasks
                const recentTasks = tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
                displayRecentTasks(recentTasks);

            } catch (error) {
                console.error('Error loading dashboard:', error);
            }
        }

        // Load driver status - Always show all 5 drivers
        async function loadDriverStatus() {
            try {
                // Define all drivers
                const allDrivers = [
                    'นายสุวรรณ ละอองชัย',
                    'นายสำรัจ จินดารอง',
                    'นายสุริยา อุ่มรูปงาม',
                    'นายกฤตพล เขียนจัตุรัส',
                    'นายสมประสงค์ ทวีศรี'
                ];

                // Get driver locations from database
                const driversSnapshot = await db.collection('driver_locations').get();
                const driverData = {};

                driversSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    driverData[data.name] = data;
                });

                // Generate HTML for all drivers
                const driverStatusHtml = allDrivers.map(driverName => {
                    const driver = driverData[driverName];
                    const isOnline = driver && driver.status === 'online';
                    const lastUpdate = driver && driver.lastUpdate ?
                        new Date(driver.lastUpdate.toDate()).toLocaleString('th-TH') : 'ไม่ได้เชื่อมต่อ';

                    // Light colors as requested - light green for online, light gray for offline
                    const gradientClass = isOnline
                        ? 'bg-gradient-to-br from-green-200 to-emerald-300'
                        : 'bg-gradient-to-br from-gray-200 to-gray-300';

                    const textColor = isOnline ? 'text-green-800' : 'text-gray-700';
                    const statusTextColor = isOnline ? 'text-green-700' : 'text-gray-600';
                    const iconBgColor = isOnline ? 'bg-green-300/50' : 'bg-gray-300/50';

                    return `
                        <div class="${gradientClass} rounded-2xl shadow-xl p-6 relative overflow-hidden transform hover:scale-105 transition-all duration-300 hover:shadow-2xl">
                            <div class="absolute -top-4 -right-4 w-24 h-24 bg-white/20 rounded-full"></div>
                            <div class="relative z-10">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="p-3 ${iconBgColor} rounded-xl backdrop-blur-sm">
                                        <svg class="w-8 h-8 ${textColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                        </svg>
                                    </div>
                                    <div class="text-right">
                                        <div class="flex items-center justify-end space-x-2 mb-1">
                                            <div class="w-3 h-3 ${isOnline ? 'bg-green-500' : 'bg-gray-400'} rounded-full ${isOnline ? 'animate-pulse' : ''}"></div>
                                            <span class="text-xs font-medium ${statusTextColor}">
                                                ${isOnline ? 'ออนไลน์' : 'ออฟไลน์'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="mb-4">
                                    <h4 class="text-lg font-bold ${textColor} mb-1 truncate">${driverName}</h4>
                                    <div class="flex items-center ${statusTextColor} text-sm">
                                        <svg class="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        <span class="truncate">${lastUpdate}</span>
                                    </div>
                                </div>
                                ${driver && driver.address ? `
                                    <div class="bg-white/30 rounded-lg p-3 backdrop-blur-sm">
                                        <div class="flex items-center ${statusTextColor} text-xs">
                                            <svg class="w-3 h-3 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            </svg>
                                            <span class="truncate">${driver.address}</span>
                                        </div>
                                    </div>
                                ` : `
                                    <div class="bg-white/30 rounded-lg p-3 backdrop-blur-sm">
                                        <div class="flex items-center ${statusTextColor} text-xs">
                                            <svg class="w-3 h-3 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            </svg>
                                            <span class="truncate">ไม่ทราบตำแหน่ง</span>
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
                }).join('');

                document.getElementById('driverStatus').innerHTML = driverStatusHtml;
            } catch (error) {
                console.error('Error loading driver status:', error);
                // Show error but still display all drivers as offline
                const allDrivers = [
                    'นายสุวรรณ ละอองชัย',
                    'นายสำรัจ จินดารอง',
                    'นายสุริยา อุ่มรูปงาม',
                    'นายกฤตพล เขียนจัตุรัส',
                    'นายสมประสงค์ ทวีศรี'
                ];

                const fallbackHtml = allDrivers.map(driverName => `
                    <div class="bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl shadow-xl p-6 relative overflow-hidden">
                        <div class="absolute -top-4 -right-4 w-24 h-24 bg-white/20 rounded-full"></div>
                        <div class="relative z-10">
                            <div class="flex items-center justify-between mb-4">
                                <div class="p-3 bg-gray-300/50 rounded-xl backdrop-blur-sm">
                                    <svg class="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                    </svg>
                                </div>
                                <div class="text-right">
                                    <div class="flex items-center justify-end space-x-2 mb-1">
                                        <div class="w-3 h-3 bg-gray-400 rounded-full"></div>
                                        <span class="text-xs font-medium text-gray-600">ออฟไลน์</span>
                                    </div>
                                </div>
                            </div>
                            <div class="mb-4">
                                <h4 class="text-lg font-bold text-gray-700 mb-1 truncate">${driverName}</h4>
                                <div class="flex items-center text-gray-600 text-sm">
                                    <svg class="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <span class="truncate">ไม่สามารถเชื่อมต่อได้</span>
                                </div>
                            </div>
                            <div class="bg-white/30 rounded-lg p-3 backdrop-blur-sm">
                                <div class="flex items-center text-gray-600 text-xs">
                                    <svg class="w-3 h-3 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                    <span class="truncate">ไม่ทราบตำแหน่ง</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');

                document.getElementById('driverStatus').innerHTML = fallbackHtml;
            }
        }

        // Display recent tasks
        function displayRecentTasks(tasks) {
            const statusConfig = {
                'pending': {
                    color: 'amber',
                    text: 'รอดำเนินการ',
                    icon: '⏳',
                    bgClass: 'bg-amber-50 border-amber-200'
                },
                'in-progress': {
                    color: 'blue',
                    text: 'กำลังดำเนินการ',
                    icon: '🚗',
                    bgClass: 'bg-blue-50 border-blue-200'
                },
                'completed': {
                    color: 'emerald',
                    text: 'เสร็จสิ้น',
                    icon: '✅',
                    bgClass: 'bg-emerald-50 border-emerald-200'
                }
            };

            const recentTasksHtml = tasks.map(task => {
                const config = statusConfig[task.status];
                const taskDate = task.departureDate ? new Date(task.departureDate).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short'
                }) : 'ไม่ระบุ';

                return `
                    <div class="p-4 ${config.bgClass} border rounded-xl hover:shadow-md transition-all duration-200">
                        <div class="flex items-start justify-between mb-3">
                            <div class="flex items-start space-x-3 flex-1 min-w-0">
                                <div class="text-2xl flex-shrink-0">${config.icon}</div>
                                <div class="min-w-0 flex-1">
                                    <h4 class="font-semibold text-gray-800 truncate">${task.taskName}</h4>
                                    <div class="flex items-center space-x-2 mt-1">
                                        <svg class="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                        </svg>
                                        <span class="text-sm text-gray-600 truncate">${task.driverName}</span>
                                    </div>
                                    <div class="flex items-center space-x-2 mt-1">
                                        <svg class="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        </svg>
                                        <span class="text-sm text-gray-600 truncate">${task.location}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex flex-col items-end space-y-2 flex-shrink-0 ml-3">
                                <span class="px-3 py-1 text-xs font-medium bg-${config.color}-100 text-${config.color}-800 rounded-full whitespace-nowrap">
                                    ${config.text}
                                </span>
                                <div class="text-xs text-gray-500 text-right">
                                    <div>${taskDate}</div>
                                    <div>${task.departureTime || 'ไม่ระบุ'}</div>
                                </div>
                            </div>
                        </div>
                        
                        ${task.carBrand && task.carPlate ? `
                            <div class="flex items-center space-x-4 text-xs text-gray-600 bg-white/50 rounded-lg p-2">
                                <div class="flex items-center space-x-1">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                                    </svg>
                                    <span>${task.carBrand}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                    </svg>
                                    <span>${task.carPlate}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            const emptyState = `
                <div class="text-center py-8">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                        </svg>
                    </div>
                    <p class="text-gray-500 font-medium">ไม่มีงานล่าสุด</p>
                    <p class="text-gray-400 text-sm">เริ่มมอบหมายงานให้คนขับรถ</p>
                </div>
            `;

            document.getElementById('recentTasks').innerHTML = recentTasksHtml || emptyState;
        }

        // Assign task form
        document.getElementById('assignTaskForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const driverName = document.getElementById('driverSelect').value;
            const taskName = document.getElementById('taskName').value;

            console.log('Assigning task to driver:', driverName);

            const taskData = {
                driverName: driverName,
                taskName: taskName,
                location: document.getElementById('location').value,
                departureDate: document.getElementById('departureDate').value,
                departureTime: document.getElementById('departureTime').value,
                carBrand: document.getElementById('carBrand').value,
                carPlate: document.getElementById('carPlate').value,
                details: document.getElementById('details').value,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            console.log('Task data to be saved:', taskData);

            try {
                const docRef = await db.collection('tasks').add(taskData);
                console.log('Task created with ID:', docRef.id);

                // Verify the task was saved correctly
                const savedTask = await docRef.get();
                console.log('Saved task data:', savedTask.data());

                // Show beautiful success notification
                showNotification('success',
                    '🎉 มอบหมายงานเรียบร้อยแล้ว',
                    `งาน "${taskName}" ได้ถูกมอบหมายให้ ${driverName} เรียบร้อยแล้ว\n\nคนขับรถจะได้รับการแจ้งเตือนทันที`,
                    4000
                );

                document.getElementById('assignTaskForm').reset();
                loadAdminDashboard();
            } catch (error) {
                console.error('Error assigning task:', error);
                showNotification('error',
                    '❌ เกิดข้อผิดพลาด!',
                    'ไม่สามารถมอบหมายงานได้ กรุณาลองใหม่อีกครั้ง\n\nข้อผิดพลาด: ' + error.message,
                    4000
                );
            }
        });

        // Load all tasks
        async function loadAllTasks() {
            try {
                console.log('Loading all tasks from database...');

                // Check if element exists before trying to set innerHTML
                const tasksTableBody = document.getElementById('tasksTableBody');
                if (!tasksTableBody) {
                    console.error('tasksTableBody element not found');
                    return;
                }

                // Show loading state
                tasksTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-16 text-center">
                            <div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6 animate-spin">
                                <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                            </div>
                            <h3 class="text-xl font-bold text-gray-600 mb-3">กำลังโหลดข้อมูล...</h3>
                            <p class="text-gray-500">กรุณารอสักครู่</p>
                        </td>
                    </tr>
                `;

                // Simple approach - just get all tasks without complex queries
                const tasksSnapshot = await db.collection('tasks').get();
                console.log('Total tasks found in database:', tasksSnapshot.size);

                if (tasksSnapshot.empty) {
                    console.log('No tasks found in database');
                    allTasks = [];
                    filteredTasks = [];
                    displayTasks();
                    return;
                }

                // Convert to array with error handling for each document
                allTasks = [];
                tasksSnapshot.docs.forEach(doc => {
                    try {
                        const data = doc.data();
                        const task = { id: doc.id, ...data };

                        // Validate required fields
                        if (task.taskName && task.driverName && task.location) {
                            allTasks.push(task);
                            console.log('Task loaded successfully:', task.taskName);
                        } else {
                            console.warn('Task missing required fields:', task);
                        }
                    } catch (docError) {
                        console.error('Error processing document:', doc.id, docError);
                    }
                });

                // Sort tasks by creation date (newest first)
                allTasks.sort((a, b) => {
                    try {
                        // Try to sort by createdAt timestamp first
                        if (a.createdAt && b.createdAt) {
                            const dateA = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                            const dateB = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                            return dateB - dateA;
                        }

                        // Fallback to departureDate + departureTime
                        if (a.departureDate && b.departureDate) {
                            const dateA = new Date(a.departureDate + ' ' + (a.departureTime || '00:00'));
                            const dateB = new Date(b.departureDate + ' ' + (b.departureTime || '00:00'));
                            return dateB - dateA;
                        }

                        return 0;
                    } catch (sortError) {
                        console.error('Error sorting tasks:', sortError);
                        return 0;
                    }
                });

                console.log('Successfully loaded', allTasks.length, 'tasks');
                filteredTasks = [...allTasks];
                displayTasks();

            } catch (error) {
                console.error('Error loading tasks:', error);

                // Check if element exists before trying to set innerHTML
                const tasksTableBody = document.getElementById('tasksTableBody');
                if (!tasksTableBody) {
                    console.error('tasksTableBody element not found during error handling');
                    return;
                }

                // Show detailed error message
                let errorMessage = 'ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้';

                if (error.code === 'permission-denied') {
                    errorMessage = 'ไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาเข้าสู่ระบบใหม่';
                } else if (error.code === 'unavailable') {
                    errorMessage = 'เซิร์ฟเวอร์ไม่พร้อมใช้งาน กรุณาลองใหม่ในภายหลัง';
                } else if (error.message) {
                    errorMessage = `เกิดข้อผิดพลาด: ${error.message}`;
                }

                tasksTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-16 text-center">
                            <div class="mx-auto w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mb-6">
                                <div class="text-4xl">⚠️</div>
                            </div>
                            <h3 class="text-2xl font-bold text-red-600 mb-3">เกิดข้อผิดพลาด</h3>
                            <p class="text-gray-500 text-lg">${errorMessage}</p>
                        </td>
                    </tr>
                `;
            }
        }

        // Filter tasks
        function filterTasks() {
            const searchTerm = document.getElementById('searchTasks').value.toLowerCase();
            const driverFilter = document.getElementById('filterDriver').value;
            const statusFilter = document.getElementById('filterStatus').value;

            filteredTasks = allTasks.filter(task => {
                const matchesSearch = task.taskName.toLowerCase().includes(searchTerm) ||
                    task.location.toLowerCase().includes(searchTerm);
                const matchesDriver = !driverFilter || task.driverName === driverFilter;
                const matchesStatus = !statusFilter || task.status === statusFilter;

                return matchesSearch && matchesDriver && matchesStatus;
            });

            currentPage = 1;
            displayTasks();
        }

        // Display tasks in table format
        function displayTasks() {
            // Check if element exists
            const tasksTableBody = document.getElementById('tasksTableBody');
            if (!tasksTableBody) {
                console.error('tasksTableBody element not found in displayTasks');
                return;
            }

            const startIndex = (currentPage - 1) * tasksPerPage;
            const endIndex = startIndex + tasksPerPage;
            const tasksToShow = filteredTasks.slice(startIndex, endIndex);

            const statusColors = {
                'pending': 'yellow',
                'in-progress': 'blue',
                'completed': 'green'
            };
            const statusTexts = {
                'pending': 'รอดำเนินการ',
                'in-progress': 'กำลังดำเนินการ',
                'completed': 'เสร็จสิ้น'
            };

            const tasksHtml = tasksToShow.map(task => `
                <tr class="hover:bg-gray-50 transition-colors duration-200">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${task.taskName}</div>
                        <div class="text-sm text-gray-500">${task.location}</div>
                        ${task.details ? `<div class="text-xs text-gray-400 mt-1 max-w-xs truncate">${task.details}</div>` : ''}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${task.driverName}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${task.departureDate ? new Date(task.departureDate).toLocaleDateString('th-TH') : 'ไม่ระบุ'}<br>
                        <span class="text-gray-500">${task.departureTime || 'ไม่ระบุ'}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${task.carBrand || 'ไม่ระบุ'}<br>
                        <span class="text-gray-500">${task.carPlate || 'ไม่ระบุ'}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-${statusColors[task.status]}-100 text-${statusColors[task.status]}-800">
                            ${statusTexts[task.status]}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="deleteTask('${task.id}', '${task.taskName}')" class="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1 rounded-lg transition-all duration-200 transform hover:scale-105">
                            ลบ
                        </button>
                    </td>
                </tr>
            `).join('');

            const emptyState = `
                <tr>
                    <td colspan="6" class="px-6 py-16 text-center">
                        <div class="mx-auto w-32 h-32 bg-gradient-to-r from-orange-100 to-amber-100 rounded-full flex items-center justify-center mb-6">
                            <div class="text-4xl">📋</div>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-600 mb-3">ไม่พบรายการงาน</h3>
                        <p class="text-gray-500 text-lg">ไม่มีงานที่ตรงกับเงื่อนไขการค้นหา<br>ลองปรับเปลี่ยนตัวกรองหรือเพิ่มงานใหม่</p>
                    </td>
                </tr>
            `;

            tasksTableBody.innerHTML = tasksHtml || emptyState;

            // Update pagination
            updateTasksPagination();
        }

        // Pagination functions
        function previousPage() {
            if (currentPage > 1) {
                currentPage--;
                displayTasks();
            }
        }

        function nextPage() {
            const totalPages = Math.ceil(filteredTasks.length / tasksPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                displayTasks();
            }
        }

        function goToPage(page) {
            const totalPages = Math.ceil(filteredTasks.length / tasksPerPage);
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                displayTasks();
            }
        }

        // Update tasks pagination with page numbers
        function updateTasksPagination() {
            const totalPages = Math.ceil(filteredTasks.length / tasksPerPage);
            const startIndex = (currentPage - 1) * tasksPerPage;
            const endIndex = Math.min(startIndex + tasksPerPage, filteredTasks.length);

            // Update page info
            const pageInfoElement = document.getElementById('pageInfo');
            if (pageInfoElement) {
                pageInfoElement.textContent = `${startIndex + 1}-${endIndex} จาก ${filteredTasks.length}`;
            }

            // Update current page span
            const currentPageElement = document.getElementById('currentPageSpan');
            if (currentPageElement) {
                currentPageElement.textContent = currentPage;
            }

            // Generate page numbers
            const paginationContainer = document.querySelector('.pagination-numbers');
            if (paginationContainer) {
                let paginationHtml = '';

                // Previous button
                paginationHtml += `
                    <button onclick="previousPage()" ${currentPage === 1 ? 'disabled' : ''} 
                            class="relative inline-flex items-center px-4 py-2 rounded-l-xl border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all duration-200 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        ก่อนหน้า
                    </button>
                `;

                // Page numbers
                const maxVisiblePages = 5;
                let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                // Adjust start page if we're near the end
                if (endPage - startPage < maxVisiblePages - 1) {
                    startPage = Math.max(1, endPage - maxVisiblePages + 1);
                }

                // First page and ellipsis
                if (startPage > 1) {
                    paginationHtml += `
                        <button onclick="goToPage(1)" class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-200">
                            1
                        </button>
                    `;
                    if (startPage > 2) {
                        paginationHtml += `
                            <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                ...
                            </span>
                        `;
                    }
                }

                // Page numbers
                for (let i = startPage; i <= endPage; i++) {
                    const isActive = i === currentPage;
                    paginationHtml += `
                        <button onclick="goToPage(${i})" 
                                class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium transition-all duration-200 ${isActive
                            ? 'bg-orange-50 text-orange-600 border-orange-300 font-bold'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }">
                            ${i}
                        </button>
                    `;
                }

                // Last page and ellipsis
                if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                        paginationHtml += `
                            <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                ...
                            </span>
                        `;
                    }
                    paginationHtml += `
                        <button onclick="goToPage(${totalPages})" class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-200">
                            ${totalPages}
                        </button>
                    `;
                }

                // Next button
                paginationHtml += `
                    <button onclick="nextPage()" ${currentPage === totalPages ? 'disabled' : ''} 
                            class="relative inline-flex items-center px-4 py-2 rounded-r-xl border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all duration-200 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}">
                        ถัดไป
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                `;

                paginationContainer.innerHTML = paginationHtml;
            }
        }

        // Global variables for reports
        let reportData = [];
        let filteredReportData = [];
        let currentReportPage = 1;
        const reportsPerPage = 10;

        // Load reports
        async function loadReports() {
            try {
                console.log('Loading reports data...');

                // Show loading state
                const reportTableBody = document.getElementById('reportTableBody');
                if (reportTableBody) {
                    reportTableBody.innerHTML = `
                        <tr>
                            <td colspan="7" class="px-6 py-16 text-center">
                                <div class="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-6 animate-spin">
                                    <div class="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
                                </div>
                                <h3 class="text-xl font-bold text-gray-600 mb-3">กำลังโหลดข้อมูลรายงาน...</h3>
                                <p class="text-gray-500">กรุณารอสักครู่</p>
                            </td>
                        </tr>
                    `;
                }

                const tasksSnapshot = await db.collection('tasks').get();
                reportData = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                console.log('Report data loaded:', reportData.length, 'tasks');

                // Update summary stats
                updateReportStats(reportData);

                // Set default filter to "today" and generate report
                setDateRange('today');

            } catch (error) {
                console.error('Error loading reports:', error);

                const reportTableBody = document.getElementById('reportTableBody');
                if (reportTableBody) {
                    reportTableBody.innerHTML = `
                        <tr>
                            <td colspan="7" class="px-6 py-16 text-center">
                                <div class="mx-auto w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mb-6">
                                    <div class="text-4xl">⚠️</div>
                                </div>
                                <h3 class="text-2xl font-bold text-red-600 mb-3">เกิดข้อผิดพลาด</h3>
                                <p class="text-gray-500 text-lg">ไม่สามารถโหลดข้อมูลรายงานได้</p>
                                <button onclick="loadReports()" class="mt-4 bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition duration-200">
                                    ลองใหม่อีกครั้ง
                                </button>
                            </td>
                        </tr>
                    `;
                }
            }
        }

        // Update report statistics
        function updateReportStats(data) {
            const totalTasks = data.length;
            const completedTasks = data.filter(t => t.status === 'completed').length;
            const pendingTasks = data.filter(t => t.status === 'pending').length;
            const inProgressTasks = data.filter(t => t.status === 'in-progress').length;

            document.getElementById('reportTotalTasks').textContent = totalTasks;
            document.getElementById('reportCompletedTasks').textContent = completedTasks;
            document.getElementById('reportPendingTasks').textContent = pendingTasks;
            document.getElementById('reportInProgressTasks').textContent = inProgressTasks;
        }

        // Set date range for quick filters
        function setDateRange(range, clickedButton = null) {
            const today = new Date();
            const startDateInput = document.getElementById('reportStartDate');
            const endDateInput = document.getElementById('reportEndDate');

            // Reset all date range buttons
            document.querySelectorAll('.date-range-btn').forEach(btn => {
                btn.classList.remove('bg-purple-100', 'text-purple-700');
                btn.classList.add('bg-gray-100', 'text-gray-700');
            });

            let startDate, endDate;

            switch (range) {
                case 'today':
                    startDate = endDate = today.toISOString().split('T')[0];
                    break;
                case '7days':
                    endDate = today.toISOString().split('T')[0];
                    startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    break;
                case '30days':
                    endDate = today.toISOString().split('T')[0];
                    startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    break;
                case 'all':
                    startDate = endDate = '';
                    break;
            }

            // Highlight the active button if provided
            if (clickedButton) {
                clickedButton.classList.remove('bg-gray-100', 'text-gray-700');
                clickedButton.classList.add('bg-purple-100', 'text-purple-700');
            } else {
                // If no button provided, find and highlight the correct button
                const buttonMap = {
                    'today': 'วันนี้',
                    '7days': '7 วัน',
                    '30days': '30 วัน',
                    'all': 'ทั้งหมด'
                };

                document.querySelectorAll('.date-range-btn').forEach(btn => {
                    if (btn.textContent.trim() === buttonMap[range]) {
                        btn.classList.remove('bg-gray-100', 'text-gray-700');
                        btn.classList.add('bg-purple-100', 'text-purple-700');
                    }
                });
            }

            if (startDateInput) startDateInput.value = startDate;
            if (endDateInput) endDateInput.value = endDate;

            // Auto-generate report
            generateReport();
        }

        // Generate report based on filters
        function generateReport() {
            try {
                console.log('Generating report with filters...');

                const driverFilter = document.getElementById('reportDriverFilter').value;
                const statusFilter = document.getElementById('reportStatusFilter').value;
                const startDate = document.getElementById('reportStartDate').value;
                const endDate = document.getElementById('reportEndDate').value;

                console.log('Filters:', { driverFilter, statusFilter, startDate, endDate });

                // Filter data
                filteredReportData = reportData.filter(task => {
                    // Driver filter
                    if (driverFilter && task.driverName !== driverFilter) return false;

                    // Status filter
                    if (statusFilter && task.status !== statusFilter) return false;

                    // Date range filter
                    if (startDate && endDate) {
                        const taskDate = task.departureDate;
                        if (!taskDate) return false;

                        if (taskDate < startDate || taskDate > endDate) return false;
                    } else if (startDate) {
                        const taskDate = task.departureDate;
                        if (!taskDate || taskDate < startDate) return false;
                    } else if (endDate) {
                        const taskDate = task.departureDate;
                        if (!taskDate || taskDate > endDate) return false;
                    }

                    return true;
                });

                console.log('Filtered data:', filteredReportData.length, 'tasks');

                // Reset to first page when generating new report
                currentReportPage = 1;

                // Update stats with filtered data
                updateReportStats(filteredReportData);

                // Display report table
                displayReportTable(filteredReportData);

                // Update result count
                document.getElementById('reportResultCount').textContent = `${filteredReportData.length} รายการ`;

            } catch (error) {
                console.error('Error generating report:', error);
                showNotification('error', '❌ เกิดข้อผิดพลาด!', 'ไม่สามารถสร้างรายงานได้ กรุณาลองใหม่อีกครั้ง');
            }
        }

        // Report pagination functions
        function previousReportPage() {
            if (currentReportPage > 1) {
                currentReportPage--;
                displayReportTable(filteredReportData);
            }
        }

        function nextReportPage() {
            const totalPages = Math.ceil(filteredReportData.length / reportsPerPage);
            if (currentReportPage < totalPages) {
                currentReportPage++;
                displayReportTable(filteredReportData);
            }
        }

        function goToReportPage(page) {
            const totalPages = Math.ceil(filteredReportData.length / reportsPerPage);
            if (page >= 1 && page <= totalPages) {
                currentReportPage = page;
                displayReportTable(filteredReportData);
            }
        }

        // Update reports pagination
        function updateReportsPagination(totalItems) {
            const totalPages = Math.ceil(totalItems / reportsPerPage);
            const startIndex = (currentReportPage - 1) * reportsPerPage;
            const endIndex = Math.min(startIndex + reportsPerPage, totalItems);

            // Update page info
            const reportPageInfoElement = document.getElementById('reportPageInfo');
            if (reportPageInfoElement) {
                reportPageInfoElement.textContent = totalItems > 0 ? `${startIndex + 1}-${endIndex} จาก ${totalItems}` : '0 รายการ';
            }

            // Generate page numbers
            const reportPaginationContainer = document.querySelector('.report-pagination-numbers');
            if (reportPaginationContainer) {
                if (totalPages <= 1) {
                    reportPaginationContainer.innerHTML = '';
                    return;
                }

                let paginationHtml = '';

                // Previous button
                paginationHtml += `
                    <button onclick="previousReportPage()" ${currentReportPage === 1 ? 'disabled' : ''} 
                            class="relative inline-flex items-center px-4 py-2 rounded-l-xl border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all duration-200 ${currentReportPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        ก่อนหน้า
                    </button>
                `;

                // Page numbers
                const maxVisiblePages = 5;
                let startPage = Math.max(1, currentReportPage - Math.floor(maxVisiblePages / 2));
                let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                // Adjust start page if we're near the end
                if (endPage - startPage < maxVisiblePages - 1) {
                    startPage = Math.max(1, endPage - maxVisiblePages + 1);
                }

                // First page and ellipsis
                if (startPage > 1) {
                    paginationHtml += `
                        <button onclick="goToReportPage(1)" class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-200">
                            1
                        </button>
                    `;
                    if (startPage > 2) {
                        paginationHtml += `
                            <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                ...
                            </span>
                        `;
                    }
                }

                // Page numbers
                for (let i = startPage; i <= endPage; i++) {
                    const isActive = i === currentReportPage;
                    paginationHtml += `
                        <button onclick="goToReportPage(${i})" 
                                class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium transition-all duration-200 ${isActive
                            ? 'bg-purple-50 text-purple-600 border-purple-300 font-bold'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }">
                            ${i}
                        </button>
                    `;
                }

                // Last page and ellipsis
                if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                        paginationHtml += `
                            <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                ...
                            </span>
                        `;
                    }
                    paginationHtml += `
                        <button onclick="goToReportPage(${totalPages})" class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-200">
                            ${totalPages}
                        </button>
                    `;
                }

                // Next button
                paginationHtml += `
                    <button onclick="nextReportPage()" ${currentReportPage === totalPages ? 'disabled' : ''} 
                            class="relative inline-flex items-center px-4 py-2 rounded-r-xl border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all duration-200 ${currentReportPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}">
                        ถัดไป
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                `;

                reportPaginationContainer.innerHTML = paginationHtml;
            }
        }

        // Display report table with pagination
        function displayReportTable(data) {
            const reportTableBody = document.getElementById('reportTableBody');
            if (!reportTableBody) return;

            const statusConfig = {
                'pending': { color: 'yellow', text: 'รอดำเนินการ' },
                'in-progress': { color: 'blue', text: 'กำลังดำเนินการ' },
                'completed': { color: 'green', text: 'เสร็จสิ้น' }
            };

            if (data.length === 0) {
                reportTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="px-6 py-16 text-center">
                            <div class="mx-auto w-32 h-32 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mb-6">
                                <div class="text-4xl">📊</div>
                            </div>
                            <h3 class="text-2xl font-bold text-gray-600 mb-3">ไม่พบข้อมูล</h3>
                            <p class="text-gray-500 text-lg">ไม่มีข้อมูลที่ตรงกับเงื่อนไขการค้นหา<br>ลองปรับเปลี่ยนตัวกรองหรือช่วงวันที่</p>
                        </td>
                    </tr>
                `;
                updateReportsPagination(0);
                return;
            }

            // Apply pagination
            const startIndex = (currentReportPage - 1) * reportsPerPage;
            const endIndex = startIndex + reportsPerPage;
            const paginatedData = data.slice(startIndex, endIndex);

            const tableHtml = paginatedData.map(task => {
                const config = statusConfig[task.status] || { color: 'gray', text: 'ไม่ระบุ' };

                // Format dates
                const createdDate = task.createdAt ?
                    (task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt)).toLocaleDateString('th-TH') :
                    'ไม่ระบุ';

                const completedDate = task.completedAt ?
                    (task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt)).toLocaleDateString('th-TH') :
                    (task.status === 'completed' ? 'ไม่ระบุ' : '-');

                return `
                    <tr class="hover:bg-gray-50 transition-colors duration-200">
                        <td class="px-6 py-4">
                            <div class="text-sm font-medium text-gray-900">${task.taskName}</div>
                        </td>
                        <td class="px-6 py-4 text-sm text-gray-900">${task.location}</td>
                        <td class="px-6 py-4 text-sm text-gray-900">${task.driverName}</td>
                        <td class="px-6 py-4 text-sm text-gray-900">
                            ${task.carBrand || 'ไม่ระบุ'}<br>
                            <span class="text-gray-500">${task.carPlate || 'ไม่ระบุ'}</span>
                        </td>
                        <td class="px-6 py-4">
                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-${config.color}-100 text-${config.color}-800">
                                ${config.text}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-sm text-gray-900">${createdDate}</td>
                        <td class="px-6 py-4 text-sm text-gray-900">${completedDate}</td>
                    </tr>
                `;
            }).join('');

            reportTableBody.innerHTML = tableHtml;
            updateReportsPagination(data.length);
        }

        // Clear all report filters
        function clearReportFilters() {
            document.getElementById('reportDriverFilter').value = '';
            document.getElementById('reportStatusFilter').value = '';
            document.getElementById('reportStartDate').value = '';
            document.getElementById('reportEndDate').value = '';

            // Reset date range buttons
            document.querySelectorAll('.date-range-btn').forEach(btn => {
                btn.classList.remove('bg-purple-100', 'text-purple-700');
                btn.classList.add('bg-gray-100', 'text-gray-700');
            });

            // Reset to first page
            currentReportPage = 1;

            // Show all data
            filteredReportData = [...reportData];
            updateReportStats(filteredReportData);
            displayReportTable(filteredReportData);
            document.getElementById('reportResultCount').textContent = `${filteredReportData.length} รายการ`;

            showNotification('info', '🔄 ล้างตัวกรองแล้ว!', 'แสดงข้อมูลทั้งหมดในระบบ', 2000);
        }

        // Export report to Excel
        async function exportReportToExcel() {
            try {
                if (filteredReportData.length === 0) {
                    showNotification('warning', '⚠️ ไม่มีข้อมูล!', 'กรุณาสร้างรายงานก่อนส่งออกไฟล์', 3000);
                    return;
                }

                const statusTexts = {
                    'pending': 'รอดำเนินการ',
                    'in-progress': 'กำลังดำเนินการ',
                    'completed': 'เสร็จสิ้น'
                };

                const excelData = filteredReportData.map(task => {
                    const createdDate = task.createdAt ?
                        (task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt)).toLocaleDateString('th-TH') :
                        'ไม่ระบุ';

                    const completedDate = task.completedAt ?
                        (task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt)).toLocaleDateString('th-TH') :
                        (task.status === 'completed' ? 'ไม่ระบุ' : '-');

                    return {
                        'ชื่องาน': task.taskName,
                        'สถานที่': task.location,
                        'คนขับรถ': task.driverName,
                        'ยี่ห้อรถ': task.carBrand || 'ไม่ระบุ',
                        'ทะเบียนรถ': task.carPlate || 'ไม่ระบุ',
                        'สถานะ': statusTexts[task.status] || 'ไม่ระบุ',
                        'วันที่สร้าง': createdDate,
                        'วันที่เสร็จ': completedDate,
                        'วันที่ออกเดินทาง': task.departureDate || 'ไม่ระบุ',
                        'เวลาออกเดินทาง': task.departureTime || 'ไม่ระบุ',
                        'รายละเอียด': task.details || ''
                    };
                });

                const ws = XLSX.utils.json_to_sheet(excelData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'รายงานงาน');

                // Generate filename with current date and filter info
                const today = new Date().toISOString().split('T')[0];
                const filterInfo = [];

                const driverFilter = document.getElementById('reportDriverFilter').value;
                const statusFilter = document.getElementById('reportStatusFilter').value;

                if (driverFilter) filterInfo.push(driverFilter.split(' ')[1]); // Get last name
                if (statusFilter) filterInfo.push(statusTexts[statusFilter]);

                const filterSuffix = filterInfo.length > 0 ? `_${filterInfo.join('_')}` : '';
                const fileName = `รายงานงาน_${today}${filterSuffix}.xlsx`;

                XLSX.writeFile(wb, fileName);

                showNotification('success', '📄 ส่งออกไฟล์สำเร็จ!', `ไฟล์ ${fileName} ได้ถูกดาวน์โหลดเรียบร้อยแล้ว\n\nจำนวนข้อมูล: ${filteredReportData.length} รายการ`, 4000);

            } catch (error) {
                console.error('Error exporting to Excel:', error);
                showNotification('error', '❌ เกิดข้อผิดพลาด!', 'ไม่สามารถส่งออกไฟล์ได้ กรุณาลองใหม่อีกครั้ง\n\nข้อผิดพลาด: ' + error.message, 4000);
            }
        }

        // Load tracking
        function loadTracking() {
            if (!map) {
                // Initialize map
                map = L.map('map').setView([13.7563, 100.5018], 10); // Bangkok coordinates

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);
            }

            loadDriverLocations();
        }

        // Load driver locations with enhanced UI
        async function loadDriverLocations() {
            try {
                console.log('Loading driver locations...');

                // Show loading state
                document.getElementById('driverLocationList').innerHTML = `
                    <div class="col-span-full text-center py-16">
                        <div class="mx-auto w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6 animate-spin">
                            <div class="w-8 h-8 border-4 border-rose-600 border-t-transparent rounded-full"></div>
                        </div>
                        <h3 class="text-xl font-bold text-gray-600 mb-3">กำลังโหลดตำแหน่งคนขับรถ...</h3>
                        <p class="text-gray-500">กรุณารอสักครู่</p>
                    </div>
                `;

                // Define all drivers
                const allDrivers = [
                    'นายสุวรรณ ละอองชัย',
                    'นายสำรัจ จินดารอง',
                    'นายสุริยา อุ่มรูปงาม',
                    'นายกฤตพล เขียนจัตุรัส',
                    'นายสมประสงค์ ทวีศรี'
                ];

                // Get driver locations from database
                const driversSnapshot = await db.collection('driver_locations').get();
                const driverData = {};

                driversSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    driverData[data.name] = data;
                });

                // Get active tasks for statistics
                const tasksSnapshot = await db.collection('tasks').where('status', '==', 'in-progress').get();
                const activeTasks = tasksSnapshot.size;

                // Clear existing markers
                Object.values(driverMarkers).forEach(marker => map.removeLayer(marker));
                driverMarkers = {};

                let onlineCount = 0;
                let offlineCount = 0;
                const driverCards = [];

                // Process all drivers
                allDrivers.forEach(driverName => {
                    const driver = driverData[driverName];
                    const isOnline = driver && driver.status === 'online';

                    if (isOnline) {
                        onlineCount++;
                    } else {
                        offlineCount++;
                    }

                    // Add marker to map if location available
                    if (driver && driver.latitude && driver.longitude) {
                        const markerColor = isOnline ? 'green' : 'red';
                        const markerIcon = L.divIcon({
                            className: 'custom-div-icon',
                            html: `
                                <div class="relative">
                                    <div class="w-8 h-8 bg-${markerColor}-500 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                                        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                        </svg>
                                    </div>
                                    ${isOnline ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>' : ''}
                                </div>
                            `,
                            iconSize: [32, 32],
                            iconAnchor: [16, 32]
                        });

                        const marker = L.marker([driver.latitude, driver.longitude], { icon: markerIcon })
                            .addTo(map)
                            .bindPopup(`
                                <div class="p-4 min-w-64">
                                    <div class="flex items-center space-x-3 mb-4">
                                        <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 class="font-bold text-gray-800">${driver.name}</h3>
                                            <div class="flex items-center space-x-2">
                                                <div class="w-2 h-2 bg-${isOnline ? 'green' : 'gray'}-500 rounded-full ${isOnline ? 'animate-pulse' : ''}"></div>
                                                <span class="text-sm text-${isOnline ? 'green' : 'gray'}-600 font-medium">
                                                    ${isOnline ? 'ออนไลน์' : 'ออฟไลน์'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="space-y-2 text-sm">
                                        <div class="flex items-center space-x-2">
                                            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            </svg>
                                            <span class="text-gray-700">${driver.address || 'ไม่ทราบตำแหน่ง'}</span>
                                        </div>
                                        <div class="flex items-center space-x-2">
                                            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            <span class="text-gray-700">
                                                ${driver.lastUpdate ? new Date(driver.lastUpdate.toDate()).toLocaleString('th-TH') : 'ไม่ได้เชื่อมต่อ'}
                                            </span>
                                        </div>
                                        <div class="flex items-center space-x-2">
                                            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"></path>
                                            </svg>
                                            <span class="text-gray-700">
                                                ${driver.latitude.toFixed(6)}, ${driver.longitude.toFixed(6)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `);

                        driverMarkers[driver.name] = marker;
                    }

                    // Create driver card
                    const lastUpdate = driver && driver.lastUpdate ?
                        new Date(driver.lastUpdate.toDate()).toLocaleString('th-TH') : 'ไม่ได้เชื่อมต่อ';

                    const cardGradient = isOnline
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500'
                        : 'bg-gradient-to-br from-gray-400 to-gray-500';

                    const textColor = isOnline ? 'text-green-50' : 'text-gray-50';
                    const badgeColor = isOnline ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800';

                    driverCards.push(`
                        <div class="${cardGradient} rounded-xl shadow-lg p-4 text-white relative overflow-hidden transform hover:scale-105 transition-all duration-300 hover:shadow-xl">
                            <div class="absolute -top-2 -right-2 w-12 h-12 bg-white/10 rounded-full"></div>
                            <div class="relative z-10">
                                <!-- Header -->
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center space-x-2">
                                        <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                            </svg>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <h4 class="font-bold text-white text-sm truncate">${driverName}</h4>
                                            <div class="flex items-center space-x-1">
                                                <div class="w-1.5 h-1.5 ${isOnline ? 'bg-green-300' : 'bg-gray-300'} rounded-full ${isOnline ? 'animate-pulse' : ''}"></div>
                                                <span class="text-xs font-medium ${textColor}">
                                                    ${isOnline ? 'ออนไลน์' : 'ออฟไลน์'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <span class="px-2 py-1 ${badgeColor} rounded-full text-xs font-bold whitespace-nowrap">
                                        ${isOnline ? '🟢' : '🔴'}
                                    </span>
                                </div>
                                
                                <!-- Location Info -->
                                <div class="space-y-2">
                                    <div class="bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                                        <div class="flex items-center space-x-1 mb-1">
                                            <svg class="w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            </svg>
                                            <span class="text-white/80 text-xs font-medium">ตำแหน่ง</span>
                                        </div>
                                        <p class="text-white text-xs leading-relaxed truncate">
                                            ${driver && driver.address ? driver.address : 'ไม่ทราบตำแหน่ง'}
                                        </p>
                                    </div>
                                    
                                    <div class="bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                                        <div class="flex items-center space-x-1 mb-1">
                                            <svg class="w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                            </svg>
                                            <span class="text-white/80 text-xs font-medium">อัปเดต</span>
                                        </div>
                                        <p class="text-white text-xs truncate">
                                            ${lastUpdate.split(' ')[1] || lastUpdate}
                                        </p>
                                    </div>
                                </div>
                                
                                <!-- Action Button -->
                                ${driver && driver.latitude && driver.longitude ? `
                                    <button onclick="viewDriverOnMap('${driverName}')" class="w-full mt-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white py-2 px-3 rounded-lg transition-all duration-200 font-medium text-xs">
                                        🎯 ดูในแผนที่
                                    </button>
                                ` : `
                                    <div class="w-full mt-3 bg-white/10 border border-white/20 text-white/60 py-2 px-3 rounded-lg text-center text-xs">
                                        📍 ไม่มีข้อมูล
                                    </div>
                                `}
                            </div>
                        </div>
                    `);
                });

                // Update statistics
                document.getElementById('statsOnlineDrivers').textContent = onlineCount;
                document.getElementById('statsOfflineDrivers').textContent = offlineCount;
                document.getElementById('statsActiveTasks').textContent = activeTasks;
                document.getElementById('statsLastUpdate').textContent = new Date().toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                document.getElementById('onlineDriverCount').textContent = `${onlineCount} คนออนไลน์`;

                // Display driver cards
                document.getElementById('driverLocationList').innerHTML = driverCards.join('');

                console.log('Driver locations loaded successfully');

            } catch (error) {
                console.error('Error loading driver locations:', error);

                document.getElementById('driverLocationList').innerHTML = `
                    <div class="col-span-full text-center py-16">
                        <div class="mx-auto w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mb-6">
                            <div class="text-4xl">⚠️</div>
                        </div>
                        <h3 class="text-2xl font-bold text-red-600 mb-3">เกิดข้อผิดพลาด</h3>
                        <p class="text-gray-500 text-lg mb-4">ไม่สามารถโหลดข้อมูลตำแหน่งได้</p>
                        <button onclick="loadDriverLocations()" class="bg-rose-500 text-white px-6 py-3 rounded-lg hover:bg-rose-600 transition duration-200 font-medium">
                            ลองใหม่อีกครั้ง
                        </button>
                    </div>
                `;
            }
        }

        // Refresh driver locations
        function refreshDriverLocations() {
            loadDriverLocations();
        }

        // Center map to show all drivers
        function centerMapToDrivers() {
            if (Object.keys(driverMarkers).length === 0) {
                return;
            }

            const group = new L.featureGroup(Object.values(driverMarkers));
            map.fitBounds(group.getBounds().pad(0.1));
        }

        // Focus on specific driver
        function focusOnDriver(driverName) {
            const marker = driverMarkers[driverName];
            if (marker) {
                map.setView(marker.getLatLng(), 15);
                marker.openPopup();
                showNotification('success', '📍 พบตำแหน่งแล้ว!', `กำลังแสดงตำแหน่งของ ${driverName}`, 2000);
            } else {
                showNotification('error', '❌ ไม่พบตำแหน่ง!', `ไม่สามารถหาตำแหน่งของ ${driverName} ได้`, 3000);
            }
        }

        // View driver on map (switch to tracking section and focus)
        function viewDriverOnMap(driverName) {
            // Switch to tracking section
            showAdminSection('tracking');

            // Wait a moment for the section to load, then focus on the driver
            setTimeout(() => {
                const marker = driverMarkers[driverName];
                if (marker) {
                    // Scroll to map section smoothly
                    const mapContainer = document.getElementById('map');
                    if (mapContainer) {
                        mapContainer.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }

                    // Focus on driver location
                    setTimeout(() => {
                        map.setView(marker.getLatLng(), 15);
                        marker.openPopup();
                    }, 800);
                } else {
                    // If marker doesn't exist yet, try to load tracking data first
                    loadDriverLocations().then(() => {
                        setTimeout(() => {
                            const marker = driverMarkers[driverName];
                            if (marker) {
                                // Scroll to map section smoothly
                                const mapContainer = document.getElementById('map');
                                if (mapContainer) {
                                    mapContainer.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'center'
                                    });
                                }

                                // Focus on driver location
                                setTimeout(() => {
                                    map.setView(marker.getLatLng(), 15);
                                    marker.openPopup();
                                }, 800);
                            }
                        }, 500);
                    });
                }
            }, 300);
        }



        // Driver dashboard
        async function loadDriverDashboard() {
            try {
                console.log('Loading tasks for driver:', currentUser.name);

                // First try to get tasks without orderBy to see if there are any tasks
                const allTasksSnapshot = await db.collection('tasks').where('driverName', '==', currentUser.name).get();
                console.log('Total tasks found for driver:', allTasksSnapshot.size);

                // Then get tasks ordered by creation date (newest first)
                let tasksSnapshot;
                try {
                    tasksSnapshot = await db.collection('tasks').where('driverName', '==', currentUser.name).orderBy('createdAt', 'desc').get();
                } catch (orderError) {
                    console.log('OrderBy failed, getting tasks without ordering:', orderError);
                    // If orderBy fails, get tasks without ordering and sort manually
                    tasksSnapshot = await db.collection('tasks').where('driverName', '==', currentUser.name).get();
                }

                driverTasks = tasksSnapshot.docs.map(doc => {
                    const data = doc.data();
                    console.log('Task data:', data);
                    return { id: doc.id, ...data };
                });

                // Sort manually if we couldn't use orderBy
                if (driverTasks.length > 0 && !driverTasks[0].createdAt) {
                    console.log('Sorting tasks manually by departureDate');
                    driverTasks.sort((a, b) => {
                        const dateA = new Date(a.departureDate + ' ' + (a.departureTime || '00:00'));
                        const dateB = new Date(b.departureDate + ' ' + (b.departureTime || '00:00'));
                        return dateB - dateA; // Newest first
                    });
                } else if (driverTasks.length > 0) {
                    driverTasks.sort((a, b) => {
                        if (!a.createdAt || !b.createdAt) return 0;
                        return b.createdAt.toDate() - a.createdAt.toDate(); // Newest first
                    });
                }

                console.log('Final driver tasks:', driverTasks);

                // Update stats
                document.getElementById('driverTotalTasks').textContent = driverTasks.length;
                document.getElementById('driverPendingTasks').textContent = driverTasks.filter(t => t.status === 'pending').length;
                document.getElementById('driverInProgressTasks').textContent = driverTasks.filter(t => t.status === 'in-progress').length;
                document.getElementById('driverCompletedTasks').textContent = driverTasks.filter(t => t.status === 'completed').length;

                // Display tasks based on current filter
                filterDriverTasks(currentDriverFilter);

            } catch (error) {
                console.error('Error loading driver dashboard:', error);
                // Show error message to user
                document.getElementById('driverTasksList').innerHTML = `
                    <div class="text-center py-16">
                        <div class="mx-auto w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mb-6">
                            <div class="text-4xl">⚠️</div>
                        </div>
                        <h3 class="text-2xl font-bold text-red-600 mb-3">เกิดข้อผิดพลาด</h3>
                        <p class="text-gray-500 text-lg">ไม่สามารถโหลดข้อมูลงานได้<br>กรุณาลองใหม่อีกครั้ง</p>
                        <button onclick="loadDriverDashboard()" class="mt-4 bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition duration-200">
                            โหลดใหม่
                        </button>
                    </div>
                `;
            }
        }

        // Display driver tasks with timestamps
        function displayDriverTasks(tasks) {
            const statusConfig = {
                'pending': {
                    color: 'amber',
                    text: 'รอดำเนินการ',
                    icon: '⏳',
                    bgClass: 'bg-amber-50 border-amber-200',
                    badgeClass: 'bg-amber-100 text-amber-800'
                },
                'in-progress': {
                    color: 'blue',
                    text: 'กำลังดำเนินการ',
                    icon: '🚗',
                    bgClass: 'bg-blue-50 border-blue-200',
                    badgeClass: 'bg-blue-100 text-blue-800'
                },
                'completed': {
                    color: 'green',
                    text: 'เสร็จสิ้น',
                    icon: '✅',
                    bgClass: 'bg-green-50 border-green-200',
                    badgeClass: 'bg-green-100 text-green-800'
                }
            };

            const tasksHtml = tasks.map(task => {
                const config = statusConfig[task.status];

                // Format timestamps
                const formatTimestamp = (timestamp) => {
                    if (!timestamp) return null;
                    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                    return date.toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                };

                const startedTime = task.startedAt ? formatTimestamp(task.startedAt) : null;
                const completedTime = task.completedAt ? formatTimestamp(task.completedAt) : null;

                return `
                <div class="bg-white rounded-2xl shadow-lg border-2 ${config.bgClass} p-6 mb-4 hover:shadow-xl transition-all duration-300">
                    <!-- Header Section -->
                    <div class="flex items-center justify-between mb-6">
                        <div class="flex items-center space-x-4">
                            <div class="text-3xl">${config.icon}</div>
                            <div>
                                <h3 class="text-xl font-bold text-gray-800">${task.taskName}</h3>
                                <div class="flex items-center space-x-2 mt-1">
                                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                    <span class="text-gray-600 font-medium">${task.location}</span>
                                </div>
                            </div>
                        </div>
                        <span class="px-4 py-2 rounded-full text-sm font-semibold ${config.badgeClass}">
                            ${config.text}
                        </span>
                    </div>

                    <!-- Main Info Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        <!-- Date & Time -->
                        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 9l6-6m0 0l6 6m-6-6v12"></path>
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-black">วันที่ออกเดินทาง</p>
                                    <p class="text-gray-800">${new Date(task.departureDate).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                })}</p>
                                    <p class="text-gray-600 text-sm">${task.departureTime}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Vehicle Info -->
                        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                    <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-black">ข้อมูลรถ</p>
                                    <p class="text-gray-800">${task.carBrand}</p>
                                    <p class="text-gray-600 text-sm">${task.carPlate}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Status Timeline -->
                        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                    <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm font-bold text-black">เวลาดำเนินการ</p>
                                    ${startedTime ? `<p class="text-green-700 text-sm font-medium">เริ่ม: ${startedTime}</p>` : ''}
                                    ${completedTime ? `<p class="text-blue-700 text-sm font-medium">เสร็จ: ${completedTime}</p>` : ''}
                                    ${!startedTime && !completedTime ? `<p class="text-gray-500 text-sm">ยังไม่เริ่มงาน</p>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Details Section -->
                    ${task.details ? `
                        <div class="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
                            <div class="flex items-center space-x-2 mb-3">
                                <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                                <h4 class="font-semibold text-black">รายละเอียดเพิ่มเติม</h4>
                            </div>
                            <p class="text-gray-800 leading-relaxed">${task.details}</p>
                        </div>
                    ` : ''}
                    
                    <!-- Action Buttons -->
                    <div class="flex gap-3">
                        ${task.status === 'pending' ? `
                            <button onclick="updateTaskStatus('${task.id}', 'in-progress')" class="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition duration-300 font-semibold shadow-lg transform hover:scale-105">
                                <span class="flex items-center justify-center">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                    </svg>
                                    เริ่มงาน
                                </span>
                            </button>
                        ` : ''}
                        ${task.status === 'in-progress' ? `
                            <button onclick="updateTaskStatus('${task.id}', 'completed')" class="flex-1 bg-gradient-to-r from-emerald-500 to-green-500 text-white px-6 py-4 rounded-xl hover:from-emerald-600 hover:to-green-600 transition duration-300 font-semibold shadow-lg transform hover:scale-105">
                                <span class="flex items-center justify-center">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    เสร็จสิ้น
                                </span>
                            </button>
                        ` : ''}
                        ${task.status === 'completed' ? `
                            <div class="flex-1 bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 px-6 py-4 rounded-xl border-2 border-emerald-200 font-semibold text-center">
                                <span class="flex items-center justify-center">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    งานเสร็จสิ้นแล้ว
                                </span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            }).join('');

            const emptyState = `
                <div class="text-center py-16">
                    <div class="mx-auto w-32 h-32 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                        <div class="text-4xl">📋</div>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-600 mb-3">ไม่มีงานที่ได้รับมอบหมาย</h3>
                    <p class="text-gray-500 text-lg">คุณยังไม่มีงานใหม่ในขณะนี้<br>กรุณารอการมอบหมายงานจากผู้ดูแลระบบ</p>
                    <div class="mt-6 flex items-center justify-center space-x-2 text-green-600">
                        <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span class="text-sm font-medium">พร้อมรับงานใหม่</span>
                    </div>
                </div>
            `;

            document.getElementById('driverTasksList').innerHTML = tasksHtml || emptyState;
        }

        // Show beautiful popup notification
        function showNotification(type, title, message, duration = 3000) {
            // Remove existing notifications
            const existingNotifications = document.querySelectorAll('.notification-popup');
            existingNotifications.forEach(notification => notification.remove());

            const notification = document.createElement('div');
            notification.className = 'notification-popup fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm opacity-0 transition-all duration-300 ease-out';

            const typeConfig = {
                success: {
                    bgClass: 'bg-gradient-to-r from-emerald-500 to-green-500',
                    icon: `<svg class="w-8 h-8 text-white animate-pulse-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>`,
                    borderClass: 'border-emerald-200'
                },
                error: {
                    bgClass: 'bg-gradient-to-r from-red-500 to-pink-500',
                    icon: `<svg class="w-8 h-8 text-white animate-pulse-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>`,
                    borderClass: 'border-red-200'
                },
                info: {
                    bgClass: 'bg-gradient-to-r from-blue-500 to-indigo-500',
                    icon: `<svg class="w-8 h-8 text-white animate-pulse-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>`,
                    borderClass: 'border-blue-200'
                },
                warning: {
                    bgClass: 'bg-gradient-to-r from-amber-500 to-orange-500',
                    icon: `<svg class="w-8 h-8 text-white animate-pulse-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                    </svg>`,
                    borderClass: 'border-amber-200'
                }
            };

            const config = typeConfig[type] || typeConfig.info;

            notification.innerHTML = `
                <div class="max-w-md w-full ${config.bgClass} shadow-2xl rounded-3xl pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden border-2 ${config.borderClass} transform scale-75 transition-all duration-300 ease-out">
                    <div class="p-6">
                        <div class="flex items-center justify-center mb-4">
                            <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm shadow-lg">
                                ${config.icon}
                            </div>
                        </div>
                        <div class="text-center">
                            <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                            <p class="text-white/90 leading-relaxed text-base">${message}</p>
                        </div>
                        <div class="flex justify-center mt-6">
                            <button onclick="this.closest('.notification-popup').remove()" class="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white py-3 px-6 rounded-xl transition-all duration-200 font-medium shadow-lg transform hover:scale-105">
                                ตกลง
                            </button>
                        </div>
                    </div>
                    <div class="bg-white/10 px-6 py-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2 text-white/80">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span class="text-sm font-medium">${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div class="w-20 h-2 bg-white/20 rounded-full overflow-hidden">
                                <div class="h-full bg-white/60 rounded-full animate-progress" style="animation-duration: ${duration}ms;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(notification);

            // Animate in
            setTimeout(() => {
                notification.classList.remove('opacity-0');
                notification.classList.add('opacity-100');
                const popup = notification.querySelector('div > div');
                popup.classList.remove('scale-75');
                popup.classList.add('scale-100');
            }, 50);

            // Auto remove
            setTimeout(() => {
                notification.classList.remove('opacity-100');
                notification.classList.add('opacity-0');
                const popup = notification.querySelector('div > div');
                popup.classList.remove('scale-100');
                popup.classList.add('scale-75');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }, duration);
        }

        // อัปเดตสถานะงานพร้อมแจ้ง LINE
        async function updateTaskStatus(taskId, newStatus) {
            try {
                const updateData = {
                    status: newStatus,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // เพิ่มเวลาสำหรับการเปลี่ยนสถานะ
                if (newStatus === 'in-progress') {
                    updateData.startedAt = firebase.firestore.FieldValue.serverTimestamp();
                } else if (newStatus === 'completed') {
                    updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
                }

                await db.collection('tasks').doc(taskId).update(updateData);

                // ดึงข้อมูลงานจาก Firestore เพื่อนำมาแจ้ง LINE
                const taskDoc = await db.collection('tasks').doc(taskId).get();
                const task = taskDoc.data();
                const dateTime = getCurrentDateTime();

                // เตรียมข้อความแจ้งเตือน
                let lineMessage = '';
                if (newStatus === 'in-progress') {
                    lineMessage = `🚗 คนขับเริ่มงานแล้ว!\n📌 งาน: ${task.taskName}\n📍 จุดหมาย: ${task.location}\n👨‍💼 คนขับ: ${task.driverName}\n⏰ เวลา: ${dateTime}`;
                } else if (newStatus === 'completed') {
                    lineMessage = `✅ งานเสร็จสิ้น!\n📌 งาน: ${task.taskName}\n📍 จุดหมาย: ${task.location}\n👨‍💼 คนขับ: ${task.driverName}\n⏰ เวลา: ${dateTime}`;
                }

                // ส่งแจ้ง LINE ถ้ามีข้อความ
                if (lineMessage) await sendLineNotify(lineMessage);

                // แจ้งเตือนในระบบ
                const statusMessages = {
                    'in-progress': {
                        title: '🚗 เริ่มงานแล้ว',
                        message: 'คุณได้เริ่มทำงานเรียบร้อยแล้ว'
                    },
                    'completed': {
                        title: '🎉 งานเสร็จสิ้น',
                        message: 'คุณได้ทำงานเสร็จสิ้นเรียบร้อยแล้ว'
                    }
                };

                const message = statusMessages[newStatus] || {
                    title: '✅ อัปเดตสำเร็จ!',
                    message: 'สถานะงานได้รับการอัปเดตเรียบร้อยแล้ว'
                };

                showNotification('success', message.title, message.message);
                loadDriverDashboard();

            } catch (error) {
                console.error('Error updating task status:', error);
                showNotification('error', '❌ เกิดข้อผิดพลาด!', 'ไม่สามารถอัปเดตสถานะงานได้ กรุณาลองใหม่อีกครั้ง');
            }
        }

        // Show beautiful delete confirmation popup
        function showDeleteConfirmation(taskId, taskName, taskLocation, driverName) {
            // Remove existing popups
            const existingPopups = document.querySelectorAll('.delete-confirmation-popup');
            existingPopups.forEach(popup => popup.remove());

            const popup = document.createElement('div');
            popup.className = 'delete-confirmation-popup fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 transition-all duration-300 ease-out';

            popup.innerHTML = `
                <div class="bg-white rounded-3xl shadow-2xl max-w-md w-full transform scale-75 transition-all duration-300 ease-out overflow-hidden">
                    <!-- Header with gradient background -->
                    <div class="bg-gradient-to-r from-red-500 to-pink-500 px-8 py-6 text-white relative overflow-hidden">
                        <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full"></div>
                        <div class="absolute -bottom-10 -left-10 w-24 h-24 bg-white/5 rounded-full"></div>
                        <div class="relative z-10">
                            <div class="flex items-center justify-center mb-4">
                                <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm shadow-lg animate-pulse-soft">
                                    <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </div>
                            </div>
                            <h3 class="text-2xl font-bold text-center mb-2">⚠️ ยืนยันการลบงาน</h3>
                            <p class="text-red-100 text-center text-lg">การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
                        </div>
                    </div>
                    
                    <!-- Content -->
                    <div class="px-8 py-6">
                        <!-- Task Details Card -->
                        <div class="bg-gradient-to-r from-red-50 to-pink-50 rounded-2xl p-6 mb-6 border-2 border-red-100">
                            <div class="text-center mb-4">
                                <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                                    </svg>
                                </div>
                                <h4 class="text-xl font-bold text-gray-800 mb-2">งานที่จะลบ</h4>
                            </div>
                            
                            <div class="space-y-3">
                                <div class="flex items-center space-x-3 bg-white/70 rounded-xl p-3">
                                    <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                                        </svg>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-medium text-gray-600">ชื่องาน</p>
                                        <p class="text-base font-bold text-gray-900 truncate">${taskName}</p>
                                    </div>
                                </div>
                                
                                <div class="flex items-center space-x-3 bg-white/70 rounded-xl p-3">
                                    <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        </svg>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-medium text-gray-600">สถานที่</p>
                                        <p class="text-base font-bold text-gray-900 truncate">${taskLocation}</p>
                                    </div>
                                </div>
                                
                                <div class="flex items-center space-x-3 bg-white/70 rounded-xl p-3">
                                    <div class="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                        </svg>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-medium text-gray-600">คนขับรถ</p>
                                        <p class="text-base font-bold text-gray-900 truncate">${driverName}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Warning Message -->
                        <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-6">
                            <div class="flex items-center space-x-3">
                                <div class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-amber-800 font-semibold text-sm">คำเตือน!</p>
                                    <p class="text-amber-700 text-sm">งานนี้จะถูกลบออกจากระบบอย่างถาวร และไม่สามารถกู้คืนได้</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-4">
                            <button onclick="this.closest('.delete-confirmation-popup').remove()" class="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-4 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 font-semibold shadow-lg transform hover:scale-105">
                                <span class="flex items-center justify-center">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                    ยกเลิก
                                </span>
                            </button>
                            <button onclick="confirmDeleteTask('${taskId}', '${taskName}')" class="flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-4 rounded-xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 font-semibold shadow-lg transform hover:scale-105">
                                <span class="flex items-center justify-center">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                    ลบงาน
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);

            // Animate in
            setTimeout(() => {
                popup.classList.remove('opacity-0');
                popup.classList.add('opacity-100');
                const popupContent = popup.querySelector('div > div');
                popupContent.classList.remove('scale-75');
                popupContent.classList.add('scale-100');
            }, 50);

            // Close on backdrop click
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    popup.classList.remove('opacity-100');
                    popup.classList.add('opacity-0');
                    const popupContent = popup.querySelector('div > div');
                    popupContent.classList.remove('scale-100');
                    popupContent.classList.add('scale-75');
                    setTimeout(() => popup.remove(), 300);
                }
            });
        }

        // Confirm delete task
        async function confirmDeleteTask(taskId, taskName) {
            // Remove popup
            const popup = document.querySelector('.delete-confirmation-popup');
            if (popup) {
                popup.classList.remove('opacity-100');
                popup.classList.add('opacity-0');
                const popupContent = popup.querySelector('div > div');
                popupContent.classList.remove('scale-100');
                popupContent.classList.add('scale-75');
                setTimeout(() => popup.remove(), 300);
            }

            try {
                await db.collection('tasks').doc(taskId).delete();

                showNotification('success',
                    '🗑️ ลบงานเรียบร้อยแล้ว!',
                    `งาน "${taskName}" ได้ถูกลบออกจากระบบเรียบร้อยแล้ว`,
                    3000
                );

                // Reload tasks list
                loadAllTasks();

            } catch (error) {
                console.error('Error deleting task:', error);
                showNotification('error',
                    '❌ เกิดข้อผิดพลาด!',
                    'ไม่สามารถลบงานได้ กรุณาลองใหม่อีกครั้ง\n\nข้อผิดพลาด: ' + error.message,
                    4000
                );
            }
        }

        // Delete task function for admin - Updated to use beautiful popup
        async function deleteTask(taskId, taskName, taskLocation = '', driverName = '') {
            // Find task details if not provided
            if (!taskLocation || !driverName) {
                const task = allTasks.find(t => t.id === taskId);
                if (task) {
                    taskLocation = task.location || 'ไม่ระบุ';
                    driverName = task.driverName || 'ไม่ระบุ';
                }
            }

            showDeleteConfirmation(taskId, taskName, taskLocation, driverName);
        }

        // Filter driver tasks by status
        function filterDriverTasks(status) {
            currentDriverFilter = status;

            // Define inactive colors for each card type
            const inactiveColors = {
                'filterPendingCard': {
                    bg: ['bg-gradient-to-r', 'from-yellow-200', 'to-orange-200'],
                    text: 'text-orange-600',
                    number: 'text-orange-700',
                    icon: ['bg-orange-300']
                },
                'filterInProgressCard': {
                    bg: ['bg-gradient-to-r', 'from-blue-200', 'to-blue-300'],
                    text: 'text-blue-600',
                    number: 'text-blue-700',
                    icon: ['bg-blue-400']
                },
                'filterCompletedCard': {
                    bg: ['bg-gradient-to-r', 'from-green-200', 'to-emerald-200'],
                    text: 'text-green-600',
                    number: 'text-green-700',
                    icon: ['bg-green-400']
                },
                'filterAllCard': {
                    bg: ['bg-gradient-to-r', 'from-purple-200', 'to-indigo-200'],
                    text: 'text-purple-600',
                    number: 'text-purple-700',
                    icon: ['bg-purple-400']
                }
            };

            // Reset all cards to inactive state with their respective light colors
            document.querySelectorAll('.driver-filter-card').forEach(card => {
                const cardId = card.id;
                const colors = inactiveColors[cardId];

                if (colors) {
                    // Remove all active and inactive classes
                    card.classList.remove('active', 'bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'from-yellow-500', 'to-orange-500', 'from-green-500', 'to-emerald-500', 'from-purple-500', 'to-indigo-600', 'text-white');
                    card.classList.remove('bg-white/70', 'backdrop-blur-lg');
                    card.classList.remove('from-yellow-200', 'to-orange-200', 'from-blue-200', 'to-blue-300', 'from-green-200', 'to-emerald-200', 'from-purple-200', 'to-indigo-200');

                    // Apply inactive colors
                    card.classList.add(...colors.bg);

                    // Update text colors
                    const textElements = card.querySelectorAll('p');
                    textElements.forEach(el => {
                        el.classList.remove('text-blue-100', 'text-white', 'text-gray-600', 'text-orange-600', 'text-blue-600', 'text-green-600', 'text-purple-600');
                        el.classList.add(colors.text);
                    });

                    // Update number color
                    const numberEl = card.querySelector('[id*="Tasks"]');
                    if (numberEl) {
                        numberEl.classList.remove('text-white', 'text-gray-900', 'text-orange-700', 'text-blue-700', 'text-green-700', 'text-purple-700');
                        numberEl.classList.add(colors.number);
                    }

                    // Update icon background
                    const iconDiv = card.querySelector('.p-4');
                    if (iconDiv) {
                        iconDiv.classList.remove('bg-white/20', 'bg-gradient-to-r', 'from-yellow-500', 'to-orange-500', 'from-blue-500', 'to-blue-600', 'from-green-500', 'to-emerald-500', 'from-purple-500', 'to-indigo-600');
                        iconDiv.classList.remove('bg-orange-300', 'bg-blue-400', 'bg-green-400', 'bg-purple-400');
                        iconDiv.classList.add(...colors.icon);
                    }
                }
            });

            // Activate selected card with full bright colors
            let activeCardId = '';
            let gradientClasses = [];

            switch (status) {
                case 'all':
                    activeCardId = 'filterAllCard';
                    gradientClasses = ['from-purple-500', 'to-indigo-600'];
                    break;
                case 'pending':
                    activeCardId = 'filterPendingCard';
                    gradientClasses = ['from-yellow-500', 'to-orange-500'];
                    break;
                case 'in-progress':
                    activeCardId = 'filterInProgressCard';
                    gradientClasses = ['from-blue-500', 'to-blue-600'];
                    break;
                case 'completed':
                    activeCardId = 'filterCompletedCard';
                    gradientClasses = ['from-green-500', 'to-emerald-500'];
                    break;
            }

            const activeCard = document.getElementById(activeCardId);
            if (activeCard) {
                // Remove inactive colors
                activeCard.classList.remove('from-yellow-200', 'to-orange-200', 'from-blue-200', 'to-blue-300', 'from-green-200', 'to-emerald-200', 'from-purple-200', 'to-indigo-200');

                // Add active colors
                activeCard.classList.add('active', 'bg-gradient-to-r', ...gradientClasses, 'text-white');

                // Update text colors for active card
                const textElements = activeCard.querySelectorAll('p');
                textElements.forEach(el => {
                    el.classList.remove('text-orange-600', 'text-blue-600', 'text-green-600', 'text-purple-600');
                    el.classList.add('text-blue-100');
                });

                // Update number color for active card
                const numberEl = activeCard.querySelector('[id*="Tasks"]');
                if (numberEl) {
                    numberEl.classList.remove('text-orange-700', 'text-blue-700', 'text-green-700', 'text-purple-700');
                    numberEl.classList.add('text-white');
                }

                // Update icon background for active card
                const iconDiv = activeCard.querySelector('.p-4');
                if (iconDiv) {
                    iconDiv.classList.remove('bg-orange-300', 'bg-blue-400', 'bg-green-400', 'bg-purple-400');
                    iconDiv.classList.add('bg-white/20');
                }
            }

            // Filter tasks
            let filteredTasks;
            if (status === 'all') {
                filteredTasks = driverTasks;
            } else {
                filteredTasks = driverTasks.filter(task => task.status === status);
            }

            // Display filtered tasks
            displayDriverTasks(filteredTasks);
        }



        // Location tracking for drivers only (not admin)
// Location tracking for drivers only (not admin)
function startLocationTracking() {
    // Only track location if user is a driver
    if (currentUser && currentUser.role === 'driver' && navigator.geolocation) {
        console.log('Starting location tracking for driver:', currentUser.name);

        navigator.geolocation.getCurrentPosition(
            () => {
                console.log('Location permission granted, starting continuous tracking');

                const watchId = navigator.geolocation.watchPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;

                        // ✅ จับ snapshot ของผู้ใช้ไว้ในตัวแปรโลคัล (กัน currentUser เปลี่ยนกลางคัน)
                        const user = currentUser; 
                        if (!user || user.role !== 'driver' || !user.username) {
                            console.warn('Skipping location update: user logged out or invalid');
                            return;
                        }
                        const username = user.username;
                        const displayName = user.name || user.fullName || username;

                        try {
                            // Reverse geocoding
                            const response = await fetch(
                                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=th`
                            );
                            const data = await response.json();
                            const address = data.display_name || 'ไม่สามารถระบุที่อยู่ได้';

                            // ✅ ใช้ username/displayName ที่จับไว้ ไม่อ้าง currentUser ตรงๆ
                            await db.collection('driver_locations').doc(username).set({
                                name: displayName,
                                latitude: latitude,
                                longitude: longitude,
                                address: address,
                                lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
                                status: 'online'
                            }, { merge: true });

                            console.log('Location updated:', { latitude, longitude, address });
                        } catch (error) {
                            console.error('Error updating location:', error);
                        }
                    },
                    (error) => {
                        console.error('Geolocation error:', error);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 30000
                    }
                );

                // Store watch ID for cleanup
                window.locationWatchId = watchId;
            },
            (error) => {
                console.error('Initial location request failed:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    } else if (currentUser && currentUser.role === 'admin') {
        console.log('Admin user - location tracking is disabled for security and privacy');
        return;
    } else {
        console.log('Location tracking not available or user not logged in');
    }
}

// Stop location tracking (for cleanup)
function stopLocationTracking() {
    if (window.locationWatchId) {
        navigator.geolocation.clearWatch(window.locationWatchId);
        window.locationWatchId = null;
        console.log('Location tracking stopped');
    }
}



        // Check for existing session on page load
        function checkExistingSession() {
            if (loadUserSession()) {
                document.getElementById('loginScreen').classList.add('hidden');

                if (currentUser.role === 'admin') {
                    document.getElementById('adminDashboard').classList.remove('hidden');
                    document.getElementById('adminName').textContent = currentUser.name;

                    // Set up real-time listener for admin
                    setupAdminTaskListener();

                    // Restore the last viewed section
                    showAdminSection(currentSection);
                    console.log('Admin session restored - location tracking remains disabled');
                } else {
                    document.getElementById('driverDashboard').classList.remove('hidden');
                    document.getElementById('driverName').textContent = currentUser.name;
                    loadDriverDashboard();

                    // Set up real-time listener for driver tasks
                    setupDriverTaskListener();

                    // Only start location tracking for drivers
                    startLocationTracking();
                    console.log('Driver session restored - location tracking enabled');
                }
            }
        }

        // Set up real-time listener for driver tasks
        function setupDriverTaskListener() {
            if (currentUser && currentUser.role === 'driver') {
                console.log('Setting up real-time task listener for:', currentUser.name);

                // Listen for real-time updates to tasks assigned to this driver
                db.collection('tasks')
                    .where('driverName', '==', currentUser.name)
                    .onSnapshot((snapshot) => {
                        console.log('Real-time task update received, changes:', snapshot.docChanges().length);

                        snapshot.docChanges().forEach((change) => {
                            if (change.type === 'added') {
                                console.log('New task added:', change.doc.data());
                                // Removed automatic notification popup
                            } else if (change.type === 'modified') {
                                console.log('Task modified:', change.doc.data());
                            }
                        });

                        // Reload driver dashboard with new data
                        loadDriverDashboard();
                    }, (error) => {
                        console.error('Error in task listener:', error);
                    });
            }
        }

        // Set up real-time listener for admin tasks
        function setupAdminTaskListener() {
            if (currentUser && currentUser.role === 'admin') {
                console.log('Setting up real-time task listener for admin');

                // Listen for real-time updates to all tasks
                db.collection('tasks').onSnapshot((snapshot) => {
                    console.log('Admin real-time task update received, changes:', snapshot.docChanges().length);

                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            console.log('New task added to system:', change.doc.data());
                        } else if (change.type === 'modified') {
                            console.log('Task modified in system:', change.doc.data());
                        } else if (change.type === 'removed') {
                            console.log('Task removed from system:', change.doc.data());
                        }
                    });

                    // Reload admin dashboard and tasks list if currently viewing
                    if (currentSection === 'dashboard') {
                        loadAdminDashboard();
                    } else if (currentSection === 'tasks') {
                        loadAllTasks();
                    }
                }, (error) => {
                    console.error('Error in admin task listener:', error);
                });
            }
        }

        // Set today's date as default and update time
        document.addEventListener('DOMContentLoaded', () => {
            // Check for existing session first
            checkExistingSession();

            const today = new Date().toISOString().split('T')[0];
            const reportStartDate = document.getElementById('reportStartDate');
            const reportEndDate = document.getElementById('reportEndDate');

            if (reportStartDate) reportStartDate.value = today;
            if (reportEndDate) reportEndDate.value = today;

            // Update current date and time
            updateDateTime();
            setInterval(updateDateTime, 1000); // Update every second
        });

        // Update date and time display
        function updateDateTime() {
            const now = new Date();
            const dateOptions = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            };
            const timeOptions = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            };

            // Driver dashboard elements
            const currentDateElement = document.getElementById('currentDate');
            const currentTimeElement = document.getElementById('currentTime');

            // Admin dashboard elements
            const adminCurrentDateElement = document.getElementById('adminCurrentDate');
            const adminCurrentTimeElement = document.getElementById('adminCurrentTime');

            if (currentDateElement) {
                currentDateElement.textContent = now.toLocaleDateString('th-TH', dateOptions);
            }
            if (currentTimeElement) {
                currentTimeElement.textContent = now.toLocaleTimeString('th-TH', timeOptions);
            }
            if (adminCurrentDateElement) {
                adminCurrentDateElement.textContent = now.toLocaleDateString('th-TH', dateOptions);
            }
            if (adminCurrentTimeElement) {
                adminCurrentTimeElement.textContent = now.toLocaleTimeString('th-TH', timeOptions);
            }
        }



        // Enhanced display tasks function for mobile cards
        function displayTasksMobile(tasks) {
            // Check if mobile container exists (it doesn't exist in current design)
            const mobileContainer = document.getElementById('tasksCardContainer');
            if (!mobileContainer) {
                // Mobile container doesn't exist in current design, skip mobile display
                return;
            }

            const statusColors = {
                'pending': { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', badge: 'bg-yellow-100' },
                'in-progress': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100' },
                'completed': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100' }
            };
            const statusTexts = {
                'pending': 'รอดำเนินการ',
                'in-progress': 'กำลังดำเนินการ',
                'completed': 'เสร็จสิ้น'
            };

            const startIndex = (currentPage - 1) * tasksPerPage;
            const endIndex = startIndex + tasksPerPage;
            const tasksToShow = filteredTasks.slice(startIndex, endIndex);

            const mobileCardsHtml = tasksToShow.map(task => {
                const colors = statusColors[task.status];
                return `
                    <div class="bg-white rounded-lg shadow-lg p-4 border-l-4 ${colors.border}">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 truncate">${task.taskName}</h3>
                                <p class="text-sm text-gray-600 truncate">${task.location}</p>
                            </div>
                            <span class="ml-2 px-2 py-1 text-xs font-medium ${colors.badge} ${colors.text} rounded-full whitespace-nowrap">
                                ${statusTexts[task.status]}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p class="text-gray-500">คนขับรถ</p>
                                <p class="font-medium text-gray-900 truncate">${task.driverName}</p>
                            </div>
                            <div>
                                <p class="text-gray-500">วันที่-เวลา</p>
                                <p class="font-medium text-gray-900">${task.departureDate}</p>
                                <p class="text-xs text-gray-600">${task.departureTime}</p>
                            </div>
                            <div>
                                <p class="text-gray-500">ยี่ห้อรถ</p>
                                <p class="font-medium text-gray-900 truncate">${task.carBrand}</p>
                            </div>
                            <div>
                                <p class="text-gray-500">ทะเบียน</p>
                                <p class="font-medium text-gray-900">${task.carPlate}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            mobileContainer.innerHTML = mobileCardsHtml;
        }

        // Update the original displayTasks function to handle both desktop and mobile
        function displayTasks() {
            // Check if element exists before trying to set innerHTML
            const tasksTableBody = document.getElementById('tasksTableBody');
            if (!tasksTableBody) {
                console.error('tasksTableBody element not found in displayTasks');
                return;
            }

            const startIndex = (currentPage - 1) * tasksPerPage;
            const endIndex = startIndex + tasksPerPage;
            const tasksToShow = filteredTasks.slice(startIndex, endIndex);

            const statusColors = {
                'pending': 'yellow',
                'in-progress': 'blue',
                'completed': 'green'
            };
            const statusTexts = {
                'pending': 'รอดำเนินการ',
                'in-progress': 'กำลังดำเนินการ',
                'completed': 'เสร็จสิ้น'
            };

            if (tasksToShow.length === 0) {
                const emptyState = `
                    <tr>
                        <td colspan="6" class="px-6 py-16 text-center">
                            <div class="mx-auto w-32 h-32 bg-gradient-to-r from-orange-100 to-amber-100 rounded-full flex items-center justify-center mb-6">
                                <div class="text-4xl">📋</div>
                            </div>
                            <h3 class="text-2xl font-bold text-gray-600 mb-3">ไม่พบรายการงาน</h3>
                            <p class="text-gray-500 text-lg">ไม่มีงานที่ตรงกับเงื่อนไขการค้นหา<br>ลองปรับเปลี่ยนตัวกรองหรือเพิ่มงานใหม่</p>
                        </td>
                    </tr>
                `;
                tasksTableBody.innerHTML = emptyState;
            } else {
                // Desktop table
                const tasksHtml = tasksToShow.map(task => `
                    <tr class="hover:bg-gray-50 transition-colors duration-200">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="text-sm font-medium text-gray-900">${task.taskName}</div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${task.location}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${task.driverName}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${task.departureDate ? new Date(task.departureDate).toLocaleDateString('th-TH') : 'ไม่ระบุ'}<br>
                            <span class="text-gray-500">${task.departureTime || 'ไม่ระบุ'}</span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${task.carBrand || 'ไม่ระบุ'}<br>
                            <span class="text-gray-500">${task.carPlate || 'ไม่ระบุ'}</span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-${statusColors[task.status]}-100 text-${statusColors[task.status]}-800">
                                ${statusTexts[task.status]}
                            </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div class="flex space-x-2">
                                <button onclick="viewTaskDetails('${task.id}')" class="text-blue-600 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 p-2 rounded-lg transition-all duration-200 transform hover:scale-105" title="ดูรายละเอียด">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                    </svg>
                                </button>
                                <button onclick="deleteTask('${task.id}', '${task.taskName}')" class="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1 rounded-lg transition-all duration-200 transform hover:scale-105">
                                    ลบ
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');

                tasksTableBody.innerHTML = tasksHtml;
            }

            // Mobile cards (only if container exists)
            displayTasksMobile(tasksToShow);

            // Update pagination - check if elements exist
            const pageInfoElement = document.getElementById('pageInfo');
            const currentPageElement = document.getElementById('currentPageSpan');

            if (pageInfoElement) {
                const totalPages = Math.ceil(filteredTasks.length / tasksPerPage);
                pageInfoElement.textContent = `${startIndex + 1}-${Math.min(endIndex, filteredTasks.length)} จาก ${filteredTasks.length}`;
            }

            if (currentPageElement) {
                currentPageElement.textContent = currentPage;
            }
        }

        // Check Firebase connection
        async function checkFirebaseConnection() {
            try {
                console.log('Checking Firebase connection...');

                // Check if element exists
                const tasksTableBody = document.getElementById('tasksTableBody');
                if (!tasksTableBody) {
                    console.error('tasksTableBody element not found in checkFirebaseConnection');
                    return;
                }

                // Show checking state
                tasksTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-16 text-center">
                            <div class="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <div class="text-2xl">🔍</div>
                            </div>
                            <h3 class="text-xl font-bold text-gray-600 mb-3">กำลังตรวจสอบการเชื่อมต่อ...</h3>
                            <p class="text-gray-500">กรุณารอสักครู่</p>
                        </td>
                    </tr>
                `;

                // Test basic Firebase connection
                const testDoc = await db.collection('test').limit(1).get();
                console.log('Firebase connection test successful');

                // Test tasks collection access
                const tasksTest = await db.collection('tasks').limit(1).get();
                console.log('Tasks collection access successful');

                // Show success and retry
                tasksTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-16 text-center">
                            <div class="mx-auto w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mb-6">
                                <div class="text-4xl">✅</div>
                            </div>
                            <h3 class="text-2xl font-bold text-green-600 mb-3">การเชื่อมต่อปกติ</h3>
                            <p class="text-gray-500 text-lg mb-4">สามารถเชื่อมต่อกับฐานข้อมูลได้แล้ว</p>
                            <button onclick="loadAllTasks()" class="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition duration-200 font-medium">
                                📋 โหลดรายการงาน
                            </button>
                        </td>
                    </tr>
                `;

            } catch (error) {
                console.error('Firebase connection test failed:', error);

                // Check if element exists
                const tasksTableBody = document.getElementById('tasksTableBody');
                if (!tasksTableBody) {
                    console.error('tasksTableBody element not found during error handling in checkFirebaseConnection');
                    return;
                }

                let errorDetails = '';
                if (error.code === 'permission-denied') {
                    errorDetails = 'ไม่มีสิทธิ์เข้าถึงฐานข้อมูล - กรุณาเข้าสู่ระบบใหม่';
                } else if (error.code === 'unavailable') {
                    errorDetails = 'ฐานข้อมูลไม่พร้อมใช้งาน - ปัญหาเครือข่าย';
                } else if (error.code === 'unauthenticated') {
                    errorDetails = 'ไม่ได้รับการยืนยันตัวตน - กรุณาเข้าสู่ระบบใหม่';
                } else {
                    errorDetails = `รหัสข้อผิดพลาด: ${error.code || 'unknown'}\nรายละเอียด: ${error.message}`;
                }

                tasksTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-16 text-center">
                            <div class="mx-auto w-32 h-32 bg-red-100 rounded-full flex items-center justify-center mb-6">
                                <div class="text-4xl">❌</div>
                            </div>
                            <h3 class="text-2xl font-bold text-red-600 mb-3">การเชื่อมต่อล้มเหลว</h3>
                            <div class="bg-gray-100 rounded-lg p-4 mb-6 text-left max-w-md mx-auto">
                                <p class="text-sm text-gray-700 font-mono">${errorDetails}</p>
                            </div>
                            <div class="space-y-3">
                                <button onclick="logout()" class="bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition duration-200 font-medium">
                                    🔄 เข้าสู่ระบบใหม่
                                </button>
                                <br>
                                <button onclick="loadAllTasks()" class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition duration-200 text-sm">
                                    ลองโหลดอีกครั้ง
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        }

        // View task details function
        function viewTaskDetails(taskId) {
            const task = allTasks.find(t => t.id === taskId);
            if (!task) {
                showNotification('error', '❌ ไม่พบข้อมูล!', 'ไม่สามารถหาข้อมูลงานที่เลือกได้', 3000);
                return;
            }

            // Remove existing popups
            const existingPopups = document.querySelectorAll('.task-details-popup');
            existingPopups.forEach(popup => popup.remove());

            const popup = document.createElement('div');
            popup.className = 'task-details-popup fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 transition-all duration-300 ease-out';

            // Format dates and times (shorter format)
            const departureDate = task.departureDate ?
                new Date(task.departureDate).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }) : 'ไม่ระบุ';

            const createdDate = task.createdAt ?
                (task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt)).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'ไม่ระบุ';

            const startedTime = task.startedAt ?
                (task.startedAt.toDate ? task.startedAt.toDate() : new Date(task.startedAt)).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : null;

            const completedTime = task.completedAt ?
                (task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt)).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : null;

            // Status configuration
            const statusConfig = {
                'pending': {
                    color: 'amber',
                    text: 'รอดำเนินการ',
                    icon: '⏳',
                    bgGradient: 'from-amber-500 to-orange-500'
                },
                'in-progress': {
                    color: 'blue',
                    text: 'กำลังดำเนินการ',
                    icon: '🚗',
                    bgGradient: 'from-blue-500 to-indigo-500'
                },
                'completed': {
                    color: 'green',
                    text: 'เสร็จสิ้น',
                    icon: '✅',
                    bgGradient: 'from-emerald-500 to-green-500'
                }
            };

            const config = statusConfig[task.status] || statusConfig.pending;

            popup.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full transform scale-75 transition-all duration-300 ease-out overflow-hidden">
                    <!-- Compact Header -->
                    <div class="bg-gradient-to-r ${config.bgGradient} px-6 py-4 text-white relative overflow-hidden">
                        <div class="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rounded-full"></div>
                        <div class="relative z-10 flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                    <div class="text-xl">${config.icon}</div>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold">${task.taskName}</h3>
                                    <span class="px-3 py-1 bg-white/20 backdrop-blur-sm border border-white/30 text-white rounded-full text-sm font-medium">
                                        ${config.text}
                                    </span>
                                </div>
                            </div>
                            <button onclick="this.closest('.task-details-popup').remove()" class="w-8 h-8 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white rounded-full transition-all duration-200 flex items-center justify-center">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Content in 2 columns -->
                    <div class="p-6">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Left Column: Main Info -->
                            <div class="space-y-4">
                                <!-- Location & Driver -->
                                <div class="grid grid-cols-1 gap-4">
                                    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                                        <div class="flex items-center space-x-3">
                                            <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                </svg>
                                            </div>
                                            <div class="flex-1">
                                                <p class="text-xs font-semibold text-blue-600 mb-1">📍 สถานที่ปลายทาง</p>
                                                <p class="text-base font-bold text-gray-800">${task.location}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-100">
                                        <div class="flex items-center space-x-3">
                                            <div class="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                                </svg>
                                            </div>
                                            <div class="flex-1">
                                                <p class="text-xs font-semibold text-purple-600 mb-1">👨‍💼 คนขับรถ</p>
                                                <p class="text-base font-bold text-gray-800">${task.driverName}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Date & Vehicle -->
                                <div class="grid grid-cols-1 gap-4">
                                    <div class="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-100">
                                        <div class="flex items-center space-x-3">
                                            <div class="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 9l6-6m0 0l6 6m-6-6v12"></path>
                                                </svg>
                                            </div>
                                            <div class="flex-1">
                                                <p class="text-xs font-semibold text-emerald-600 mb-1">📅 วันที่และเวลาออกเดินทาง</p>
                                                <p class="text-base font-bold text-gray-800">${departureDate}</p>
                                                <p class="text-sm text-gray-600">${task.departureTime || 'ไม่ระบุเวลา'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-4 border border-orange-100">
                                        <div class="flex items-center space-x-3">
                                            <div class="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                                <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                                                </svg>
                                            </div>
                                            <div class="flex-1">
                                                <p class="text-xs font-semibold text-orange-600 mb-1">🚗 ข้อมูลรถ</p>
                                                <p class="text-base font-bold text-gray-800">${task.carBrand || 'ไม่ระบุ'}</p>
                                                <p class="text-sm text-gray-600">${task.carPlate || 'ไม่ระบุทะเบียน'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Details Section (if exists) -->
                                ${task.details ? `
                                    <div class="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                                        <div class="flex items-start space-x-3">
                                            <div class="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                                </svg>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-xs font-semibold text-indigo-600 mb-2">📝 รายละเอียดเพิ่มเติม</p>
                                                <div class="max-h-32 overflow-y-auto bg-white/50 rounded-lg p-3 border border-indigo-200">
                                                    <p class="text-sm text-gray-800 leading-relaxed break-words whitespace-pre-wrap">${task.details}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                            
                            <!-- Right Column: Timeline -->
                            <div>
                                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
                                    <svg class="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    ไทม์ไลน์การดำเนินงาน
                                </h4>
                                <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                    <div class="space-y-3">
                                        <!-- Created -->
                                        <div class="flex items-center space-x-3">
                                            <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                                                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                                </svg>
                                            </div>
                                            <div class="flex-1">
                                                <p class="font-semibold text-gray-800 text-sm">งานถูกสร้าง</p>
                                                <p class="text-xs text-gray-600">${createdDate}</p>
                                            </div>
                                            <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                                        </div>
                                        
                                        <!-- Started -->
                                        ${startedTime ? `
                                            <div class="flex items-center space-x-3">
                                                <div class="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                                                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                                    </svg>
                                                </div>
                                                <div class="flex-1">
                                                    <p class="font-semibold text-gray-800 text-sm">เริ่มดำเนินงาน</p>
                                                    <p class="text-xs text-gray-600">${startedTime}</p>
                                                </div>
                                                <div class="w-2 h-2 bg-orange-500 rounded-full"></div>
                                            </div>
                                        ` : `
                                            <div class="flex items-center space-x-3 opacity-50">
                                                <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                                    </svg>
                                                </div>
                                                <div class="flex-1">
                                                    <p class="font-semibold text-gray-500 text-sm">รอเริ่มดำเนินงาน</p>
                                                    <p class="text-xs text-gray-400">ยังไม่เริ่มงาน</p>
                                                </div>
                                                <div class="w-2 h-2 bg-gray-300 rounded-full"></div>
                                            </div>
                                        `}
                                        
                                        <!-- Completed -->
                                        ${completedTime ? `
                                            <div class="flex items-center space-x-3">
                                                <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                    </svg>
                                                </div>
                                                <div class="flex-1">
                                                    <p class="font-semibold text-gray-800 text-sm">งานเสร็จสิ้น</p>
                                                    <p class="text-xs text-gray-600">${completedTime}</p>
                                                </div>
                                                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                                            </div>
                                        ` : `
                                            <div class="flex items-center space-x-3 opacity-50">
                                                <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                    </svg>
                                                </div>
                                                <div class="flex-1">
                                                    <p class="font-semibold text-gray-500 text-sm">รอเสร็จสิ้นงาน</p>
                                                    <p class="text-xs text-gray-400">ยังไม่เสร็จสิ้น</p>
                                                </div>
                                                <div class="w-2 h-2 bg-gray-300 rounded-full"></div>
                                            </div>
                                        `}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3 mt-6 pt-4 border-t border-gray-200">
                            <button onclick="this.closest('.task-details-popup').remove()" class="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-3 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 font-semibold shadow-lg transform hover:scale-105">
                                <span class="flex items-center justify-center">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                    ปิด
                                </span>
                            </button>
                            <button onclick="deleteTask('${task.id}', '${task.taskName}', '${task.location}', '${task.driverName}')" class="flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-3 rounded-xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 font-semibold shadow-lg transform hover:scale-105">
                                <span class="flex items-center justify-center">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                    ลบงาน
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);

            // Animate in
            setTimeout(() => {
                popup.classList.remove('opacity-0');
                popup.classList.add('opacity-100');
                const popupContent = popup.querySelector('div > div');
                popupContent.classList.remove('scale-75');
                popupContent.classList.add('scale-100');
            }, 50);

            // Close on backdrop click
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    popup.classList.remove('opacity-100');
                    popup.classList.add('opacity-0');
                    const popupContent = popup.querySelector('div > div');
                    popupContent.classList.remove('scale-100');
                    popupContent.classList.add('scale-75');
                    setTimeout(() => popup.remove(), 300);
                }
            });
        }

        // Add event listeners for search and filter
        document.getElementById('searchTasks').addEventListener('input', filterTasks);
        document.getElementById('filterDriver').addEventListener('change', filterTasks);
        document.getElementById('filterStatus').addEventListener('change', filterTasks);

        // ฟังก์ชันส่ง LINE Notify
        async function sendLineNotify(message) {
            const url = "https://morpromt2f.moph.go.th/api/notify/send";
            const payload = { messages: [{ type: "text", text: message }] };

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "client-key": "5494493242fd5ff380af3b51f7aa7a47fc075171", // 🔑 ใส่ค่า key ของคุณ
                        "secret-key": "4NXFT5AVL6UF3YRDVEFIIV2GKKCQ"
                    },
                    body: JSON.stringify(payload)
                });
                console.log("✅ LINE Notify Sent:", await response.text());
            } catch (err) {
                console.error("❌ LINE Notify Error:", err);
            }
        }

        // ฟังก์ชันดึงวันที่/เวลาแบบไทย
        function getCurrentDateTime() {
            const now = new Date();
            const date = now.toLocaleDateString('th-TH');
            const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            return `${date} ${time}`;
        }

    

(function () { function c() { var b = a.contentDocument || a.contentWindow.document; if (b) { var d = b.createElement('script'); d.innerHTML = "window.__CF$cv$params={r:'97a3f27af401893b',t:'MTc1NzA1NjY0OS4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);"; b.getElementsByTagName('head')[0].appendChild(d) } } if (document.body) { var a = document.createElement('iframe'); a.height = 1; a.width = 1; a.style.position = 'absolute'; a.style.top = 0; a.style.left = 0; a.style.border = 'none'; a.style.visibility = 'hidden'; document.body.appendChild(a); if ('loading' !== document.readyState) c(); else if (window.addEventListener) document.addEventListener('DOMContentLoaded', c); else { var e = document.onreadystatechange || function () { }; document.onreadystatechange = function (b) { e(b); 'loading' !== document.readyState && (document.onreadystatechange = e, c()) } } } })();