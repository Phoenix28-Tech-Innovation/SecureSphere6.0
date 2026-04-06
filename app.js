
        // ==================== INITIALIZATION ====================
        document.addEventListener('DOMContentLoaded', async function() {
            // Fast hydrate from saved cache if available (instant UI on refresh)
            if (window.__ss_cachedHTML && window.__ss_cachedHTML.fragments) {
                try { applyCachedFragments(window.__ss_cachedHTML.fragments); showToast('Loaded UI from cache', 'info'); } catch(e) { console.warn('Cache hydration error', e); showToast('SecureSphere initializing...', 'info'); }
            } else {
                showToast('SecureSphere initializing...', 'info');
            }
            
            // Check backend availability in background (non-blocking)
            fetch('http://localhost:5000/health', { cache: 'no-store' }).then(res => {
                if (res && res.ok) showToast('Backend connected', 'success');
            }).catch(err => {
                // Don't block UI; show a soft warning.
                showToast('⚠️ Backend not available - using demo mode', 'warning');
                console.log('Running in demo mode - backend not connected at localhost:5000');
            });
            
            // Initialize with real or demo data
            await initializeAllData();
            initializeCharts();
            initializeEventListeners();
            populateAllTabs();
            
            // Start real-time updates every 5 seconds
            setInterval(updateRealtimeStats, 5000);
            
            showToast('SecureSphere fully loaded', 'success');

            // Register service worker to accelerate repeat loads and cache API responses
            if ('serviceWorker' in navigator) {
                try {
                    navigator.serviceWorker.register('/sw.js').then(reg => {
                        console.log('Service worker registered:', reg.scope);
                    }).catch(err => console.warn('Service worker registration failed:', err));
                } catch (e) {
                    console.warn('Service worker registration error', e);
                }
            }
            
            // Prevent unwanted scroll on mobile
            let lastTouchY = 0;
            document.addEventListener('touchmove', function(e) {
                const mobile = window.innerWidth <= 768;
                if (mobile && e.target.closest('.mobile-bottom-nav')) {
                    e.preventDefault();
                }
            }, { passive: false });
        });

        // ==================== REAL-TIME UPDATES ====================
        async function updateRealtimeStats() {
            try {
                const stats = await systemAPI.getStats();
                if (!stats || stats.error) return; // Use fallback if API unavailable
                
                // Update CPU
                document.getElementById('cpuValue').innerHTML = Math.round(stats.cpu.percent) + '%';
                document.getElementById('cpuBar').style.width = stats.cpu.percent + '%';
                
                // Update Memory
                document.getElementById('memoryValue').innerHTML = (stats.memory.used_mb / 1024).toFixed(1) + ' GB';
                document.getElementById('memoryBar').style.width = stats.memory.percent + '%';
                
                // Update Disk
                document.getElementById('diskValue').innerHTML = stats.disk.used_gb.toFixed(0) + ' GB';
                document.getElementById('diskBar').style.width = stats.disk.percent + '%';
                
                // Update Network
                const networkGbps = (stats.network.bytes_recv / 1000000000).toFixed(2);
                document.getElementById('networkValue').innerHTML = networkGbps + ' Gbps';
                document.getElementById('networkBar').style.width = Math.min(networkGbps * 10, 100) + '%';
                
            } catch (error) {
                console.error('Error updating real-time stats:', error);
            }
        }

        // Quick cache hydration helpers (fast UI on refresh)
        function applyCachedFragments(fragments) {
            if (!fragments || typeof fragments !== 'object') return;
            Object.keys(fragments).forEach(id => {
                try {
                    const el = document.getElementById(id);
                    if (el && typeof fragments[id] === 'string') el.innerHTML = fragments[id];
                } catch (e) {
                    console.warn('Failed to apply cached fragment for', id, e);
                }
            });
        }

        function saveCachedFragments() {
            try {
                const keys = [
                    'topProcessesList','recentAlertsList','serverTableBody','recentBackupsBody',
                    'webServicesList','dbServicesList','securityToolsList','securityUpdatesList',
                    'systemUpdatesList','vulnerabilitiesBody','recentThreatsBody'
                ];
                const fragments = {};
                keys.forEach(k => {
                    const el = document.getElementById(k);
                    if (el) fragments[k] = el.innerHTML;
                });
                const payload = { ts: Date.now(), fragments };
                try { localStorage.setItem('ss_cachedHTML_v1', JSON.stringify(payload)); } catch(e) { /* ignore quota errors */ }
            } catch (e) {
                console.warn('saveCachedFragments failed', e);
            }
        }

        // ==================== DATA POPULATION FUNCTIONS ====================
        async function initializeAllData() {
            // Fetch all primary endpoints in parallel for faster startup
            const promises = [
                systemAPI.getStats(),
                systemAPI.getProcesses(5),
                serversAPI.getAll(),
                backupsAPI.getAll(),
                securityAPI.getAlerts(3)
            ];

            const [statsRes, processesRes, serversRes, backupsRes, alertsRes] = await Promise.allSettled(promises);

            const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;
            const processes = processesRes.status === 'fulfilled' ? processesRes.value : null;
            const servers = serversRes.status === 'fulfilled' ? serversRes.value : null;
            const backups = backupsRes.status === 'fulfilled' ? backupsRes.value : null;
            const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value : null;

            // Update display with real data if available
            try {
                if (stats && stats.cpu) {
                    const cpuEl = document.getElementById('cpuValue');
                    if (cpuEl) cpuEl.innerHTML = Math.round(stats.cpu.percent) + '%';
                    const memEl = document.getElementById('memoryValue');
                    if (memEl) memEl.innerHTML = (stats.memory.used_mb / 1024).toFixed(1) + ' GB';
                    const diskEl = document.getElementById('diskValue');
                    if (diskEl) diskEl.innerHTML = stats.disk.used_gb.toFixed(0) + ' GB';
                    const netEl = document.getElementById('networkValue');
                    if (netEl) netEl.innerHTML = (stats.network.bytes_recv / 1000000000).toFixed(2) + ' Gbps';
                }

                // Load real processes
                if (processes && processes.processes) {
                    let processesHTML = '';
                    processes.processes.slice(0, 5).forEach(proc => {
                        processesHTML += `<div class="flex justify-between"><span>${proc.name}</span><span>${proc.cpu_percent.toFixed(1)}%</span></div>`;
                    });
                    const pEl = document.getElementById('topProcessesList'); if (pEl && processesHTML) pEl.innerHTML = processesHTML;
                }

                // Load real servers
                if (servers && servers.length) {
                    let serverHTML = '';
                    servers.forEach(server => {
                        serverHTML += `<tr><td>${server.hostname}</td><td>${server.ip}</td><td><span class="badge-liquid bg-green-200/40">${server.status}</span></td><td>--</td><td>${server.memory}/GB</td><td>${server.uptime || '45'}d</td><td><button class="liquid-btn text-xs px-3 py-1 manage-server" data-server="${server.id}">Manage</button></td></tr>`;
                    });
                    const sEl = document.getElementById('serverTableBody'); if (sEl && serverHTML) sEl.innerHTML = serverHTML;
                }

                // Load real backups
                if (backups && backups.backups) {
                    let backupHTML = '';
                    backups.backups.slice(0, 3).forEach(backup => {
                        backupHTML += `<tr><td>${backup.id}</td><td>${backup.type}</td><td>${backup.size}GB</td><td>${backup.source}</td><td><span class="badge-liquid bg-green-200/40">${backup.status}</span></td><td><button class="liquid-btn text-xs px-2 restore-backup">Restore</button></td></tr>`;
                    });
                    const bEl = document.getElementById('recentBackupsBody'); if (bEl && backupHTML) bEl.innerHTML = backupHTML;
                }

                // Load real alerts
                if (alerts && alerts.length) {
                    let alertsHTML = '';
                    alerts.slice(0, 3).forEach(alert => {
                        const badgeColor = alert.severity === 'critical' ? 'red' : alert.severity === 'high' ? 'orange' : 'yellow';
                        alertsHTML += `<div class="flex items-center gap-2"><span class="badge-liquid bg-${badgeColor}-200/40">${alert.severity.toUpperCase()}</span> <span class="text-sm">${alert.title}</span><span class="text-xs ml-auto">now</span></div>`;
                    });
                    const aEl = document.getElementById('recentAlertsList'); if (aEl && alertsHTML) aEl.innerHTML = alertsHTML;
                }
            } catch (err) {
                console.warn('Error applying API data', err);
            }
            
            // Keep existing mock data as fallback - Top processes for dashboard
            document.getElementById('topProcessesList').innerHTML = `
                <div class="flex justify-between"><span>nginx</span><span>12.5%</span></div>
                <div class="flex justify-between"><span>mysqld</span><span>8.3%</span></div>
                <div class="flex justify-between"><span>php-fpm</span><span>5.7%</span></div>
                <div class="flex justify-between"><span>redis-server</span><span>4.2%</span></div>
                <div class="flex justify-between"><span>sshd</span><span>3.1%</span></div>
            `;

            // Recent alerts
            document.getElementById('recentAlertsList').innerHTML = `
                <div class="flex items-center gap-2"><span class="badge-liquid bg-yellow-200/40">WARN</span> <span class="text-sm">CPU high web-01</span><span class="text-xs ml-auto">5m</span></div>
                <div class="flex items-center gap-2"><span class="badge-liquid bg-green-200/40">INFO</span> <span class="text-sm">Backup OK</span><span class="text-xs ml-auto">15m</span></div>
                <div class="flex items-center gap-2"><span class="badge-liquid bg-red-200/40">ERROR</span> <span class="text-sm">Failed login attempt</span><span class="text-xs ml-auto">25m</span></div>
            `;

            // Server table
            document.getElementById('serverTableBody').innerHTML = `
                <tr><td>web-01</td><td>10.0.1.10</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td>23%</td><td>4.2/8 GB</td><td>45d</td><td><button class="liquid-btn text-xs px-3 py-1 manage-server" data-server="web-01">Manage</button></td></tr>
                <tr><td>web-02</td><td>10.0.1.11</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td>18%</td><td>3.1/8 GB</td><td>45d</td><td><button class="liquid-btn text-xs px-3 py-1 manage-server" data-server="web-02">Manage</button></td></tr>
                <tr><td>db-01</td><td>10.0.2.10</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td>45%</td><td>12.5/16 GB</td><td>45d</td><td><button class="liquid-btn text-xs px-3 py-1 manage-server" data-server="db-01">Manage</button></td></tr>
                <tr><td>db-02</td><td>10.0.2.11</td><td><span class="badge-liquid bg-yellow-200/40">Standby</span></td><td>2%</td><td>1.2/16 GB</td><td>45d</td><td><button class="liquid-btn text-xs px-3 py-1 manage-server" data-server="db-02">Manage</button></td></tr>
                <tr><td>cache-01</td><td>10.0.3.10</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td>12%</td><td>3.8/8 GB</td><td>45d</td><td><button class="liquid-btn text-xs px-3 py-1 manage-server" data-server="cache-01">Manage</button></td></tr>
            `;

            // Web services
            document.getElementById('webServicesList').innerHTML = `
                <div class="flex justify-between"><span>Nginx</span><span class="badge-liquid bg-green-200/40">Running</span></div>
                <div class="flex justify-between"><span>Apache</span><span class="badge-liquid bg-red-200/40">Stopped</span></div>
                <div class="flex justify-between"><span>Node.js</span><span class="badge-liquid bg-green-200/40">Running</span></div>
            `;

            // DB services
            document.getElementById('dbServicesList').innerHTML = `
                <div class="flex justify-between"><span>MySQL</span><span class="badge-liquid bg-green-200/40">Running</span></div>
                <div class="flex justify-between"><span>Redis</span><span class="badge-liquid bg-green-200/40">Running</span></div>
                <div class="flex justify-between"><span>MongoDB</span><span class="badge-liquid bg-green-200/40">Running</span></div>
                <div class="flex justify-between"><span>PostgreSQL</span><span class="badge-liquid bg-green-200/40">Running</span></div>
            `;

            // Security tools
            document.getElementById('securityToolsList').innerHTML = `
                <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span><i class="fas fa-shield-virus text-red-500 mr-2"></i>ClamAV</span><span class="badge-liquid bg-green-200/40">Active</span><button class="liquid-btn text-xs px-2 py-1 configure-tool" data-tool="clamav">Config</button></div>
                <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span><i class="fas fa-ban text-orange-500 mr-2"></i>Fail2ban</span><span class="badge-liquid bg-green-200/40">Active</span><button class="liquid-btn text-xs px-2 py-1 configure-tool" data-tool="fail2ban">Config</button></div>
                <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span><i class="fas fa-eye text-purple-500 mr-2"></i>Wazuh</span><span class="badge-liquid bg-green-200/40">Active</span><button class="liquid-btn text-xs px-2 py-1 configure-tool" data-tool="wazuh">Config</button></div>
                <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span><i class="fas fa-search text-blue-500 mr-2"></i>RKHunter</span><span class="badge-liquid bg-green-200/40">Active</span><button class="liquid-btn text-xs px-2 py-1 configure-tool" data-tool="rkhunter">Config</button></div>
                <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span><i class="fas fa-lock text-indigo-500 mr-2"></i>Lynis</span><span class="badge-liquid bg-green-200/40">Active</span><button class="liquid-btn text-xs px-2 py-1 configure-tool" data-tool="lynis">Config</button></div>
                <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span><i class="fas fa-globe text-cyan-500 mr-2"></i>ModSecurity</span><span class="badge-liquid bg-yellow-200/40">WAF</span><button class="liquid-btn text-xs px-2 py-1 configure-tool" data-tool="modsec">Config</button></div>
            `;

            // Recent threats
            document.getElementById('recentThreatsBody').innerHTML = `
                <tr><td>2m ago</td><td>185.142.53.123</td><td>Brute Force</td><td><span class="badge-liquid bg-red-200/40">Critical</span></td><td><button class="badge-liquid bg-red-200/40 block-threat">Block</button></td></tr>
                <tr><td>15m ago</td><td>45.227.253.1</td><td>Port Scan</td><td><span class="badge-liquid bg-yellow-200/40">Medium</span></td><td><button class="badge-liquid bg-green-200/40 block-threat">Blocked</button></td></tr>
                <tr><td>34m ago</td><td>103.56.78.9</td><td>SQL Injection</td><td><span class="badge-liquid bg-red-200/40">High</span></td><td><button class="badge-liquid bg-green-200/40 block-threat">Blocked</button></td></tr>
            `;

            // Privileged access
            document.getElementById('privilegedAccessList').innerHTML = `
                <div class="flex justify-between"><span>Root sessions</span><span class="font-bold">2 active</span></div>
                <div class="flex justify-between"><span>SSH keys</span><span class="font-bold">14</span></div>
                <div class="flex justify-between"><span>MFA enabled</span><span class="badge-liquid bg-green-200/40">92%</span></div>
                <div class="flex justify-between"><span>Sudo users</span><span class="font-bold">8</span></div>
            `;

            // Network security
            document.getElementById('networkSecurityList').innerHTML = `
                <div class="flex justify-between"><span>Open ports</span><span class="font-bold">23</span></div>
                <div class="flex justify-between"><span>VPN connections</span><span class="font-bold">12</span></div>
                <div class="flex justify-between"><span>IDS alerts</span><span class="text-yellow-600">5</span></div>
                <div class="flex justify-between"><span>TLS certs</span><span class="font-bold">8 valid</span></div>
            `;

            // Audit compliance
            document.getElementById('auditComplianceList').innerHTML = `
                <div class="flex justify-between"><span>Last audit</span><span>2 days ago</span></div>
                <div class="flex justify-between"><span>Failed audits</span><span class="text-red-600">2</span></div>
                <div class="flex justify-between"><span>PCI DSS</span><span class="badge-liquid bg-green-200/40">Compliant</span></div>
                <div class="flex justify-between"><span>GDPR</span><span class="badge-liquid bg-green-200/40">Compliant</span></div>
            `;

            // Database table
            document.getElementById('databaseTableBody').innerHTML = `
                <tr><td>ecommerce_prod</td><td>856 MB</td><td>45</td><td>2h ago</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td><i class="fas fa-lock text-green-500"></i> AES256</td><td><button class="liquid-btn text-xs px-2 py-1 manage-db" data-db="ecommerce">Manage</button></td></tr>
                <tr><td>wordpress_cms</td><td>234 MB</td><td>12</td><td>2h ago</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td><i class="fas fa-lock text-green-500"></i> AES256</td><td><button class="liquid-btn text-xs px-2 py-1 manage-db" data-db="wordpress">Manage</button></td></tr>
                <tr><td>analytics</td><td>1.2 GB</td><td>34</td><td>4h ago</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td><i class="fas fa-lock text-green-500"></i> AES256</td><td><button class="liquid-btn text-xs px-2 py-1 manage-db" data-db="analytics">Manage</button></td></tr>
                <tr><td>logs_db</td><td>4.5 GB</td><td>89</td><td>1h ago</td><td><span class="badge-liquid bg-green-200/40">Online</span></td><td><i class="fas fa-lock text-yellow-500"></i> TLS Only</td><td><button class="liquid-btn text-xs px-2 py-1 manage-db" data-db="logs">Manage</button></td></tr>
            `;

            // Replication status
            document.getElementById('replicationStatusList').innerHTML = `
                <div class="flex justify-between"><span>Master (db-01)</span><span class="badge-liquid bg-green-200/40">Online</span></div>
                <div class="flex justify-between"><span>Replica (db-02)</span><span class="badge-liquid bg-green-200/40">Synced</span></div>
                <div class="flex justify-between"><span>Read Replica (db-03)</span><span class="badge-liquid bg-yellow-200/40">Lag 2s</span></div>
            `;

            // Backup schedule
            document.getElementById('backupScheduleList').innerHTML = `
                <div class="flex justify-between items-center"><span>Daily Full</span><span class="badge-liquid bg-green-200/40">Active</span><span class="text-sm">02:00 UTC</span><button class="liquid-btn text-xs">Edit</button></div>
                <div class="flex justify-between items-center"><span>Weekly Archive</span><span class="badge-liquid bg-green-200/40">Active</span><span class="text-sm">Sunday 03:00</span><button class="liquid-btn text-xs">Edit</button></div>
                <div class="flex justify-between items-center"><span>Monthly</span><span class="badge-liquid bg-green-200/40">Active</span><span class="text-sm">1st 04:00</span><button class="liquid-btn text-xs">Edit</button></div>
            `;

            // Retention policy
            document.getElementById('retentionPolicyList').innerHTML = `
                <div class="flex justify-between"><span>Daily</span><span>7 days</span><progress class="w-20" value="7" max="7"></progress><button class="liquid-btn text-xs">Edit</button></div>
                <div class="flex justify-between"><span>Weekly</span><span>4 weeks</span><progress value="4" max="4"></progress><button class="liquid-btn text-xs">Edit</button></div>
                <div class="flex justify-between"><span>Monthly</span><span>3 months</span><progress value="3" max="3"></progress><button class="liquid-btn text-xs">Edit</button></div>
            `;

            // Recent backups
            document.getElementById('recentBackupsBody').innerHTML = `
                <tr><td>BKP-001</td><td>Full</td><td>4.2 GB</td><td>All Systems</td><td><span class="badge-liquid bg-green-200/40">Success</span></td><td><button class="liquid-btn text-xs px-2 restore-backup">Restore</button></td></tr>
                <tr><td>BKP-002</td><td>Incremental</td><td>856 MB</td><td>Database</td><td><span class="badge-liquid bg-green-200/40">Success</span></td><td><button class="liquid-btn text-xs px-2 restore-backup">Restore</button></td></tr>
                <tr><td>BKP-003</td><td>Incremental</td><td>234 MB</td><td>Web Files</td><td><span class="badge-liquid bg-red-200/40">Failed</span></td><td><button class="liquid-btn text-xs px-2 retry-backup">Retry</button></td></tr>
            `;

            // Logs
            updateLogs();

            // Security updates
            document.getElementById('securityUpdatesList').innerHTML = `
                <div class="flex items-center justify-between p-2 bg-white/20 rounded-[30px]"><div><span class="font-medium">Nginx 1.24.1</span><br><span class="text-xs">CVE-2024-1234</span></div><span class="badge-liquid bg-red-200/40">Critical</span><button class="liquid-btn text-xs px-2">Update</button></div>
                <div class="flex items-center justify-between p-2 bg-white/20 rounded-[30px]"><div><span class="font-medium">MySQL 8.0.36</span><br><span class="text-xs">CVE-2024-5678</span></div><span class="badge-liquid bg-orange-200/40">High</span><button class="liquid-btn text-xs px-2">Update</button></div>
                <div class="flex items-center justify-between p-2 bg-white/20 rounded-[30px]"><div><span class="font-medium">OpenSSL 3.1.5</span><br><span class="text-xs">CVE-2024-9012</span></div><span class="badge-liquid bg-orange-200/40">High</span><button class="liquid-btn text-xs px-2">Update</button></div>
            `;

            // System updates
            document.getElementById('systemUpdatesList').innerHTML = `
                <div class="flex items-center justify-between p-2 bg-white/20 rounded-[30px]"><div><span class="font-medium">Kernel 6.1.76</span><br><span class="text-xs">Stability</span></div><button class="liquid-btn text-xs px-2">Schedule</button></div>
                <div class="flex items-center justify-between p-2 bg-white/20 rounded-[30px]"><div><span class="font-medium">Docker 24.0.7</span><br><span class="text-xs">Feature</span></div><button class="liquid-btn text-xs px-2">Schedule</button></div>
                <div class="flex items-center justify-between p-2 bg-white/20 rounded-[30px]"><div><span class="font-medium">Python 3.11.8</span><br><span class="text-xs">Security</span></div><button class="liquid-btn text-xs px-2">Schedule</button></div>
            `;

            // Notification settings
            document.getElementById('notificationSettings').innerHTML = `
                <div class="flex justify-between items-center"><span>Email Alerts</span><label><input type="checkbox" checked class="toggle"></label></div>
                <div class="flex justify-between items-center"><span>Slack Integration</span><label><input type="checkbox" checked class="toggle"></label></div>
                <div class="flex justify-between items-center"><span>SMS Alerts</span><label><input type="checkbox" class="toggle"></label></div>
            `;

            // Security settings
            document.getElementById('securitySettingsList').innerHTML = `
                <div class="flex justify-between items-center"><span>Two-Factor Auth</span><span class="badge-liquid bg-green-200/40">Enabled</span><button class="liquid-btn text-xs">Configure</button></div>
                <div class="flex justify-between items-center"><span>Password Policy</span><span class="badge-liquid bg-green-200/40">Strong</span><button class="liquid-btn text-xs">Edit</button></div>
                <div class="flex justify-between items-center"><span>Session Timeout</span><span>30 minutes</span><button class="liquid-btn text-xs">Edit</button></div>
            `;

            // System info
            document.getElementById('systemInfoList').innerHTML = `
                <div class="flex justify-between"><span>Version</span><span>6.2.4</span></div>
                <div class="flex justify-between"><span>Last Update</span><span>2 days ago</span></div>
                <div class="flex justify-between"><span>License</span><span>Enterprise</span></div>
                <div class="flex justify-between"><span>Support</span><span class="text-green-600">Active</span></div>
                <div class="flex justify-between"><span>Uptime</span><span>45 days</span></div>
            `;

            // Recent audits
            document.getElementById('recentAuditsBody').innerHTML = `
                <tr><td>2024-03-15</td><td>PCI DSS</td><td><span class="badge-liquid bg-green-200/40">Pass</span></td><td>2 low</td><td><button class="liquid-btn text-xs view-audit">Report</button></td></tr>
                <tr><td>2024-03-10</td><td>Internal</td><td><span class="badge-liquid bg-yellow-200/40">Warning</span></td><td>5 medium</td><td><button class="liquid-btn text-xs view-audit">Remediate</button></td></tr>
                <tr><td>2024-03-01</td><td>Security</td><td><span class="badge-liquid bg-green-200/40">Pass</span></td><td>0</td><td><button class="liquid-btn text-xs view-audit">Report</button></td></tr>
            `;

            // Vulnerabilities
            document.getElementById('vulnerabilitiesBody').innerHTML = `
                <tr><td>CVE-2024-1234</td><td>nginx 1.22</td><td><span class="badge-liquid bg-red-200/40">Critical</span></td><td>9.8</td><td>Open</td><td><button class="liquid-btn text-xs patch-vuln">Patch</button></td></tr>
                <tr><td>CVE-2024-5678</td><td>mysql 8.0</td><td><span class="badge-liquid bg-orange-200/40">High</span></td><td>8.2</td><td>In Progress</td><td><button class="liquid-btn text-xs patch-vuln">Update</button></td></tr>
                <tr><td>CVE-2024-9012</td><td>openssl 3.0</td><td><span class="badge-liquid bg-yellow-200/40">Medium</span></td><td>6.5</td><td>Open</td><td><button class="liquid-btn text-xs patch-vuln">Review</button></td></tr>
            `;

            // Attack vectors
            document.getElementById('attackVectorsList').innerHTML = `
                <div class="mb-2"><div class="flex justify-between"><span>Brute Force</span><span>1,245</span></div><div class="w-full bg-white/30 h-2 rounded-full"><div class="bg-blue-500 h-2 rounded-full" style="width:35%"></div></div></div>
                <div class="mb-2"><div class="flex justify-between"><span>Port Scan</span><span>892</span></div><div class="w-full bg-white/30 h-2 rounded-full"><div class="bg-blue-500 h-2 rounded-full" style="width:25%"></div></div></div>
                <div class="mb-2"><div class="flex justify-between"><span>SQL Injection</span><span>456</span></div><div class="w-full bg-white/30 h-2 rounded-full"><div class="bg-blue-500 h-2 rounded-full" style="width:13%"></div></div></div>
                <div class="mb-2"><div class="flex justify-between"><span>XSS</span><span>321</span></div><div class="w-full bg-white/30 h-2 rounded-full"><div class="bg-blue-500 h-2 rounded-full" style="width:9%"></div></div></div>
            `;

            // Geographic threats
            document.getElementById('geoThreatsList').innerHTML = `
                <div class="flex justify-between"><span>🇨🇳 China</span><span>2,345</span></div>
                <div class="flex justify-between"><span>🇷🇺 Russia</span><span>1,876</span></div>
                <div class="flex justify-between"><span>🇺🇸 USA</span><span>1,243</span></div>
                <div class="flex justify-between"><span>🇧🇷 Brazil</span><span>876</span></div>
                <div class="flex justify-between"><span>🇮🇳 India</span><span>654</span></div>
            `;

            // Security Tools Hub
            document.getElementById('securityToolsHub').innerHTML = `
                <div class="tool-card"><div class="text-center"><i class="fas fa-shield-virus text-4xl text-red-500 mb-3"></i><h4 class="font-semibold">ClamAV</h4><p class="text-xs">Antivirus</p><span class="badge-liquid bg-green-200/40 mt-2">Active</span><div class="grid grid-cols-2 gap-2 mt-3"><button class="liquid-btn text-xs">Start</button><button class="liquid-btn text-xs">Stop</button></div></div></div>
                <div class="tool-card"><div class="text-center"><i class="fas fa-ban text-4xl text-orange-500 mb-3"></i><h4 class="font-semibold">Fail2ban</h4><p class="text-xs">IPS</p><span class="badge-liquid bg-green-200/40 mt-2">Active</span><div class="grid grid-cols-2 gap-2 mt-3"><button class="liquid-btn text-xs">Start</button><button class="liquid-btn text-xs">Stop</button></div></div></div>
                <div class="tool-card"><div class="text-center"><i class="fas fa-eye text-4xl text-purple-500 mb-3"></i><h4 class="font-semibold">Wazuh</h4><p class="text-xs">EDR/SIEM</p><span class="badge-liquid bg-green-200/40 mt-2">Active</span><div class="grid grid-cols-2 gap-2 mt-3"><button class="liquid-btn text-xs">Start</button><button class="liquid-btn text-xs">Stop</button></div></div></div>
                <div class="tool-card"><div class="text-center"><i class="fas fa-search text-4xl text-blue-500 mb-3"></i><h4 class="font-semibold">RKHunter</h4><p class="text-xs">Rootkit Hunter</p><span class="badge-liquid bg-green-200/40 mt-2">Active</span><div class="grid grid-cols-2 gap-2 mt-3"><button class="liquid-btn text-xs">Start</button><button class="liquid-btn text-xs">Stop</button></div></div></div>
                <div class="tool-card"><div class="text-center"><i class="fas fa-lock text-4xl text-indigo-500 mb-3"></i><h4 class="font-semibold">Lynis</h4><p class="text-xs">Auditing</p><span class="badge-liquid bg-green-200/40 mt-2">Active</span><div class="grid grid-cols-2 gap-2 mt-3"><button class="liquid-btn text-xs">Start</button><button class="liquid-btn text-xs">Stop</button></div></div></div>
                <div class="tool-card"><div class="text-center"><i class="fas fa-globe text-4xl text-cyan-500 mb-3"></i><h4 class="font-semibold">ModSecurity</h4><p class="text-xs">WAF</p><span class="badge-liquid bg-yellow-200/40 mt-2">WAF</span><div class="grid grid-cols-2 gap-2 mt-3"><button class="liquid-btn text-xs">Enable</button><button class="liquid-btn text-xs">Config</button></div></div></div>
            `;
            try { saveCachedFragments(); } catch(e) { /* ignore caching issues */ }
        }

        function updateLogs() {
            const container = document.getElementById('logContainer');
            if (!container) return;
            container.innerHTML = `
                <div class="flex gap-2 p-2 hover:bg-white/20 rounded-[30px]"><span class="text-xs text-gray-400">10:23:45</span><span class="badge-liquid bg-green-200/40">INFO</span><span class="flex-1">Backup completed successfully</span><i class="fas fa-copy text-gray-400 cursor-pointer copy-log"></i></div>
                <div class="flex gap-2 p-2 hover:bg-white/20 rounded-[30px]"><span class="text-xs text-gray-400">10:15:22</span><span class="badge-liquid bg-yellow-200/40">WARN</span><span class="flex-1">High CPU usage on web-01 (85%)</span><i class="fas fa-copy text-gray-400 cursor-pointer copy-log"></i></div>
                <div class="flex gap-2 p-2 hover:bg-white/20 rounded-[30px]"><span class="text-xs text-gray-400">09:58:12</span><span class="badge-liquid bg-red-200/40">ERROR</span><span class="flex-1">Failed login attempt from 45.227.253.1</span><i class="fas fa-copy text-gray-400 cursor-pointer copy-log"></i></div>
                <div class="flex gap-2 p-2 hover:bg-white/20 rounded-[30px]"><span class="text-xs text-gray-400">09:45:33</span><span class="badge-liquid bg-blue-200/40">AUDIT</span><span class="flex-1">User 'admin' executed sudo command</span><i class="fas fa-copy text-gray-400 cursor-pointer copy-log"></i></div>
                <div class="flex gap-2 p-2 hover:bg-white/20 rounded-[30px]"><span class="text-xs text-gray-400">09:22:17</span><span class="badge-liquid bg-red-200/40">CRITICAL</span><span class="flex-1">MySQL replication lag detected (45s)</span><i class="fas fa-copy text-gray-400 cursor-pointer copy-log"></i></div>
            `;
        }

        // ==================== CHART INITIALIZATION ====================
        function initializeCharts() {
            // System Chart
            const ctx1 = document.getElementById('systemChart')?.getContext('2d');
            if (ctx1) {
                new Chart(ctx1, {
                    type: 'line',
                    data: { labels: ['00','04','08','12','16','20','Now'], datasets: [{ label: 'CPU', data: [23,45,67,34,78,42,28], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' }] }
                });
            }

            // Network Chart
            const ctx2 = document.getElementById('networkChart')?.getContext('2d');
            if (ctx2) {
                new Chart(ctx2, {
                    type: 'bar',
                    data: { labels: ['00','04','08','12','16','20','Now'], datasets: [{ label: 'Inbound', data: [12,23,56,45,78,34,28], backgroundColor: '#3b82f6' }] }
                });
            }

            // DB Performance Chart
            const ctx3 = document.getElementById('dbPerformanceChart')?.getContext('2d');
            if (ctx3) {
                new Chart(ctx3, {
                    type: 'line',
                    data: { labels: ['00','04','08','12','16','20'], datasets: [{ label: 'Queries/sec', data: [1200,1350,1420,1580,1620,1490], borderColor: '#10b981' }] }
                });
            }

            // Threats Chart
            const ctx4 = document.getElementById('threatsChart')?.getContext('2d');
            if (ctx4) {
                new Chart(ctx4, {
                    type: 'line',
                    data: { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets: [{ label: 'Threats', data: [12,19,15,22,24,18,14], borderColor: '#ef4444' }] }
                });
            }

            // Events Chart
            const ctx5 = document.getElementById('eventsChart')?.getContext('2d');
            if (ctx5) {
                new Chart(ctx5, {
                    type: 'doughnut',
                    data: { labels: ['Malware', 'Brute Force', 'Port Scan', 'DDoS', 'Other'], datasets: [{ data: [30, 45, 25, 15, 10], backgroundColor: ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#a855f7'] }] }
                });
            }

            // Risk Chart
            const ctx6 = document.getElementById('riskChart')?.getContext('2d');
            if (ctx6) {
                new Chart(ctx6, {
                    type: 'line',
                    data: { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], datasets: [{ label: 'Risk Score', data: [65, 59, 52, 48], borderColor: '#f59e0b' }] }
                });
            }
        }

        // ==================== EVENT LISTENERS ====================
        function initializeEventListeners() {
            // Nav toggle
            const verticalNav = document.getElementById('verticalNav');
            const secretToggle = document.getElementById('secretNavToggle');
            const mainContent = document.getElementById('mainContent');

            secretToggle.addEventListener('click', () => {
                verticalNav.classList.toggle('collapsed');
                secretToggle.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
                showToast(verticalNav.classList.contains('collapsed') ? 'Navigation hidden' : 'Navigation visible', 'info');
            });

            // Tab switching with smooth transitions
            const navItems = document.querySelectorAll('.nav-item-liquid, .mobile-nav-item-liquid');
            const tabs = document.querySelectorAll('.tab-content');
            
            navItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    // Haptic feedback on mobile
                    if (navigator.vibrate && window.innerWidth <= 768) {
                        navigator.vibrate(10);
                    }
                    
                    const tabId = item.dataset.tab;
                    
                    // Smooth fade transition
                    tabs.forEach(t => {
                        t.classList.remove('active');
                        t.style.opacity = '0';
                    });
                    
                    // Instant tab switch for quick transitions
                    requestAnimationFrame(() => {
                        document.getElementById(tabId)?.classList.add('active');
                        document.getElementById(tabId).style.opacity = '1';
                    });
                    
                    // Update nav items
                    navItems.forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                    
                    // Scroll to top on mobile
                    if (window.innerWidth <= 768) {
                        setTimeout(() => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }, 100);
                    }
                });
            });

            // Modal triggers
            document.getElementById('showProcessModal')?.addEventListener('click', () => {
                document.getElementById('processList').innerHTML = `
                    <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span>nginx (PID: 1234)</span><span>12.5%</span><input type="checkbox"></div>
                    <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span>mysqld (PID: 2345)</span><span>8.3%</span><input type="checkbox"></div>
                    <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span>php-fpm (PID: 3456)</span><span>5.7%</span><input type="checkbox"></div>
                    <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span>redis-server (PID: 4567)</span><span>4.2%</span><input type="checkbox"></div>
                    <div class="flex justify-between items-center p-2 bg-white/20 rounded-[30px]"><span>sshd (PID: 5678)</span><span>3.1%</span><input type="checkbox"></div>
                `;
                showModal('processModal');
            });

            document.getElementById('showAlertModal')?.addEventListener('click', () => {
                document.getElementById('alertList').innerHTML = `
                    <div class="flex justify-between items-center p-3 border-b border-white/30"><span><span class="badge-liquid bg-yellow-200/40 mr-2">WARN</span>High CPU web-01</span><span class="text-xs">5m</span><button class="text-blue-500"><i class="fas fa-check"></i></button></div>
                    <div class="flex justify-between items-center p-3 border-b border-white/30"><span><span class="badge-liquid bg-green-200/40 mr-2">INFO</span>Backup completed</span><span class="text-xs">15m</span><button class="text-blue-500"><i class="fas fa-check"></i></button></div>
                    <div class="flex justify-between items-center p-3 border-b border-white/30"><span><span class="badge-liquid bg-red-200/40 mr-2">ERROR</span>Failed login attempt</span><span class="text-xs">25m</span><button class="text-blue-500"><i class="fas fa-check"></i></button></div>
                `;
                showModal('alertModal');
            });

            document.getElementById('maintenanceToggle')?.addEventListener('click', () => showModal('maintenanceModal'));
            document.getElementById('profileBtn')?.addEventListener('click', () => showModal('profileModal'));
            document.getElementById('exportBtn')?.addEventListener('click', () => showModal('exportModal'));
            document.getElementById('reportBtn')?.addEventListener('click', () => showModal('reportModal'));
            document.getElementById('configBtn')?.addEventListener('click', () => showModal('configModal'));

            // ===== Notifications: bell -> modal, filters, dismiss, mark-all-read, keyboard & focus-trap =====
            const notificationBell = document.getElementById('notificationBell');
            const notificationsModal = document.getElementById('notificationsModal');
            const notificationsList = document.getElementById('notificationsList');
            const notificationCount = document.getElementById('notificationCount');
            const markAllReadBtn = document.getElementById('markAllReadBtn');
            const notificationFilters = document.querySelectorAll('.notification-filter');

            function updateNotificationCount() {
                if (!notificationsList || !notificationCount) return;
                const unread = notificationsList.querySelectorAll(':scope > div:not(.read)').length;
                notificationCount.textContent = unread;
                notificationCount.style.display = unread > 0 ? 'flex' : 'none';
                if (notificationBell) notificationBell.setAttribute('aria-expanded', (notificationsModal && notificationsModal.style.display === 'flex') ? 'true' : 'false');
            }

            function openNotifications() {
                if (!notificationsModal) return;
                showModal('notificationsModal');
                if (notificationBell) notificationBell.setAttribute('aria-expanded','true');
                setTimeout(() => {
                    const focusable = notificationsModal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                    if (focusable) focusable.focus();
                }, 60);
                enableNotifFocusTrap();
                updateNotificationCount();
            }

            function closeNotifications() {
                if (!notificationsModal) return;
                hideModal('notificationsModal');
                if (notificationBell) {
                    notificationBell.setAttribute('aria-expanded','false');
                    notificationBell.focus();
                }
                disableNotifFocusTrap();
            }

            notificationBell?.addEventListener('click', openNotifications);
            notificationBell?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNotifications(); } });

            markAllReadBtn?.addEventListener('click', () => {
                notificationsList?.querySelectorAll(':scope > div').forEach(n => n.classList.add('read'));
                updateNotificationCount();
                showToast('All notifications marked read', 'success');
            });

            notificationFilters.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const f = btn.dataset.filter;
                    notificationFilters.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    notificationsList?.querySelectorAll(':scope > div').forEach(item => {
                        const t = item.dataset.notifType || item.getAttribute('data-notif-type') || '';
                        item.style.display = (f === 'all' || f === t) ? '' : 'none';
                    });
                });
            });

            // Dismiss and mark-as-read via event delegation inside the notifications list
            notificationsList?.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn && btn.querySelector && btn.querySelector('i.fas.fa-times')) {
                    const notif = btn.closest('[data-notif-type]') || btn.closest('div');
                    if (notif) {
                        notif.style.transition = 'opacity 0.18s, height 0.18s';
                        notif.style.opacity = '0';
                        setTimeout(()=> { notif.remove(); updateNotificationCount(); }, 180);
                    }
                    return;
                }
                const notifRoot = e.target.closest('[data-notif-type]');
                if (notifRoot && !e.target.closest('button')) {
                    notifRoot.classList.add('read');
                    updateNotificationCount();
                }
            });

            // Close when clicking backdrop specifically for notifications modal (so focus restores)
            notificationsModal?.addEventListener('click', (e) => { if (e.target === notificationsModal) closeNotifications(); });

            // Close on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && notificationsModal && notificationsModal.style.display === 'flex') {
                    closeNotifications();
                }
            });

            // Focus trap helpers for accessibility
            let _notifPrevFocus = null;
            function enableNotifFocusTrap() {
                if (!notificationsModal) return;
                _notifPrevFocus = document.activeElement;
                notificationsModal.addEventListener('keydown', _notifKeyHandler);
            }
            function disableNotifFocusTrap() {
                if (!notificationsModal) return;
                notificationsModal.removeEventListener('keydown', _notifKeyHandler);
                _notifPrevFocus = null;
            }
            function _notifKeyHandler(e) {
                if (e.key !== 'Tab') return;
                const focusable = notificationsModal.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length -1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }

            updateNotificationCount();

            // Server manage buttons
            document.querySelectorAll('.manage-server').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const server = e.target.dataset.server || 'server';
                    document.getElementById('serverNameSpan').innerText = server;
                    document.getElementById('serverDetails').innerHTML = `
                        <p>IP: 10.0.1.${Math.floor(Math.random()*50+10)}</p>
                        <p>Status: <span class="badge-liquid bg-green-200/40">Online</span></p>
                        <p>CPU: ${Math.floor(Math.random()*30+15)}%</p>
                        <p>Memory: ${(Math.random()*4+2).toFixed(1)}/8 GB</p>
                        <p>Uptime: 45 days</p>
                    `;
                    showModal('manageServerModal');
                });
            });

            // Firewall rules
            document.querySelectorAll('.firewall-rules-btn, .firewall-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('firewallRulesList').innerHTML = `
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Allow 80/tcp (HTTP)</span><span class="badge-liquid bg-green-200/40">Active</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Allow 443/tcp (HTTPS)</span><span class="badge-liquid bg-green-200/40">Active</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Deny 22 from 0.0.0.0/0</span><span class="badge-liquid bg-red-200/40">Active</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Allow 3306 from 10.0.2.0/24</span><span class="badge-liquid bg-green-200/40">Active</span></div>
                    `;
                    showModal('firewallRulesModal');
                });
            });

            // Blocked IPs
            document.querySelectorAll('.blocked-ips-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('blockedIPsList').innerHTML = `
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>185.142.53.123</span><button class="liquid-btn text-xs">Unblock</button></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>45.227.253.1</span><button class="liquid-btn text-xs">Unblock</button></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>103.56.78.9</span><button class="liquid-btn text-xs">Unblock</button></div>
                    `;
                    showModal('blockedIPsModal');
                });
            });

            // SSH Keys
            document.querySelectorAll('.ssh-keys-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('sshKeysList').innerHTML = `
                        <div class="p-2 bg-white/20 rounded-[30px]"><div class="flex justify-between"><span><i class="fas fa-key mr-2"></i>admin@workstation</span><button class="text-xs text-red-500">Revoke</button></div><div class="text-xs text-gray-500">SHA256:abc123... Added 2024-01-15</div></div>
                        <div class="p-2 bg-white/20 rounded-[30px]"><div class="flex justify-between"><span><i class="fas fa-key mr-2"></i>ci-cd@jenkins</span><button class="text-xs text-red-500">Revoke</button></div><div class="text-xs text-gray-500">SHA256:def456... Added 2024-02-20</div></div>
                    `;
                    showModal('sshKeysModal');
                });
            });

            // Threat Intel
            document.querySelectorAll('.threat-intel-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('threatIntelList').innerHTML = `
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>AlienVault OTX</span><span>12 new IOCs</span><span class="badge-liquid bg-red-200/40">High</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>VirusTotal</span><span>3 malware samples</span><span class="badge-liquid bg-red-200/40">Critical</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>MISP</span><span>5 indicators</span><span class="badge-liquid bg-yellow-200/40">Medium</span></div>
                    `;
                    showModal('threatIntelModal');
                });
            });

            // Configure tool
            document.querySelectorAll('.configure-tool').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tool = e.target.dataset.tool || 'tool';
                    document.getElementById('toolNameSpan').innerText = tool;
                    document.getElementById('toolConfigForm').innerHTML = `
                        <label class="flex items-center gap-2"><input type="checkbox" checked> Enable ${tool}</label>
                        <label>Scan interval: <select><option>Hourly</option><option>Daily</option><option>Weekly</option></select></label>
                        <label>Log level: <select><option>Info</option><option>Debug</option><option>Error</option></select></label>
                    `;
                    showModal('configureToolModal');
                });
            });

            // Database manage
            document.querySelectorAll('.manage-db').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const db = e.target.dataset.db || 'database';
                    document.getElementById('dbNameSpan').innerText = db;
                    document.getElementById('dbDetails').innerHTML = `
                        <p>Size: ${Math.floor(Math.random()*1000+100)} MB</p>
                        <p>Tables: ${Math.floor(Math.random()*50+10)}</p>
                        <p>Connections: ${Math.floor(Math.random()*100+50)}</p>
                        <p>Status: <span class="badge-liquid bg-green-200/40">Online</span></p>
                    `;
                    showModal('manageDBModal');
                });
            });

            // Copy log functionality
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('copy-log')) {
                    showToast('Copied to clipboard', 'info');
                }
            });

            // Close modal handlers
            document.querySelectorAll('[id^="close"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.modal-overlay').forEach(modal => {
                        modal.style.display = 'none';
                    });
                });
            });

            // Confirm maintenance
            document.getElementById('confirmMaintenance')?.addEventListener('click', () => {
                document.getElementById('systemStatus').innerText = 'Maintenance mode';
                document.getElementById('systemStatus').style.color = '#b91c1c';
                hideModal('maintenanceModal');
                showToast('Maintenance mode enabled', 'warning');
            });

            // Kill process
            document.getElementById('killProcessBtn')?.addEventListener('click', () => {
                showToast('Processes killed', 'warning');
                hideModal('processModal');
            });

            // Restart server
            document.getElementById('restartServerBtn')?.addEventListener('click', () => {
                showToast('Restarting server...', 'warning');
                setTimeout(() => hideModal('manageServerModal'), 500);
            });

            // Start/Stop all services
            document.getElementById('startAllServices')?.addEventListener('click', () => {
                showToast('Starting all services...', 'info');
            });
            document.getElementById('stopAllServices')?.addEventListener('click', () => {
                showToast('Stopping all services...', 'warning');
            });
            document.getElementById('restartAllServices')?.addEventListener('click', () => {
                showToast('Restarting all services...', 'info');
            });

            // Security quick actions - Comprehensive handlers
            // Full Scan
            document.querySelectorAll('.scan-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('scanModal');
                });
            });

            // Update Rules
            document.querySelectorAll('.update-rules-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('updateRulesModal');
                });
            });

            // Quarantine
            document.querySelectorAll('.quarantine-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('quarantineModal');
                });
            });

            // Forensics
            document.querySelectorAll('.forensics-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('forensicsModal');
                });
            });

            // EDR Scan
            document.querySelectorAll('.edr-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('edrModal');
                });
            });

            // Firewall
            document.querySelectorAll('.firewall-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('firewallRulesList').innerHTML = `
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Allow 80/tcp (HTTP)</span><span class="badge-liquid bg-green-200/40">Active</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Allow 443/tcp (HTTPS)</span><span class="badge-liquid bg-green-200/40">Active</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Deny 22 from 0.0.0.0/0</span><span class="badge-liquid bg-red-200/40">Active</span></div>
                        <div class="flex justify-between p-2 bg-white/20 rounded-[30px]"><span>Allow 3306 from 10.0.2.0/24</span><span class="badge-liquid bg-green-200/40">Active</span></div>
                    `;
                    showModal('firewallRulesModal');
                });
            });

            // IDS Rules
            document.querySelectorAll('.ids-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('idsModal');
                });
            });

            // Honeypot
            document.querySelectorAll('.honeypot-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('honeypotModal');
                });
            });

            // Malware Scan
            document.querySelectorAll('.malware-scan-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('malwareModal');
                });
            });

            // Vulnerability Scan
            document.querySelectorAll('.vuln-scan-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('vulnModal');
                });
            });

            // View All Threats
            document.querySelectorAll('.view-all-threats-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('recentThreatsBody').innerHTML = `
                        <tr><td>2m ago</td><td>185.142.53.123</td><td>Brute Force</td><td><span class="badge-liquid bg-red-200/40">Critical</span></td><td><button class="badge-liquid bg-red-200/40 block-threat">Block</button></td></tr>
                        <tr><td>15m ago</td><td>45.227.253.1</td><td>Port Scan</td><td><span class="badge-liquid bg-yellow-200/40">Medium</span></td><td><button class="badge-liquid bg-green-200/40 block-threat">Blocked</button></td></tr>
                        <tr><td>34m ago</td><td>103.56.78.9</td><td>SQL Injection</td><td><span class="badge-liquid bg-red-200/40">High</span></td><td><button class="badge-liquid bg-green-200/40 block-threat">Blocked</button></td></tr>
                        <tr><td>1h ago</td><td>212.34.56.78</td><td>CVE Attempt</td><td><span class="badge-liquid bg-red-200/40">Critical</span></td><td><button class="badge-liquid bg-green-200/40 block-threat">Blocked</button></td></tr>
                        <tr><td>2h ago</td><td>98.76.54.32</td><td>Malware Upload</td><td><span class="badge-liquid bg-red-200/40">High</span></td><td><button class="badge-liquid bg-green-200/40 block-threat">Blocked</button></td></tr>
                    `;
                    showModal('threatTableModal');
                });
            });

            // Access Control
            document.querySelectorAll('.access-control-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('accessControlModal');
                });
            });

            // Network Scan
            document.querySelectorAll('.network-scan-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('networkScanModal');
                });
            });

            // Run Audit
            document.querySelectorAll('.run-audit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    showModal('auditModal');
                });
            });

            // Modal close buttons
            document.getElementById('closeScanModal')?.addEventListener('click', () => hideModal('scanModal'));
            document.getElementById('closeForensicsModal')?.addEventListener('click', () => hideModal('forensicsModal'));
            document.getElementById('closeEdrModal')?.addEventListener('click', () => hideModal('edrModal'));
            document.getElementById('closeIdsModal')?.addEventListener('click', () => hideModal('idsModal'));
            document.getElementById('closeHoneypotModal')?.addEventListener('click', () => hideModal('honeypotModal'));
            document.getElementById('closeQuarantineModal')?.addEventListener('click', () => hideModal('quarantineModal'));
            document.getElementById('closeMalwareModal')?.addEventListener('click', () => hideModal('malwareModal'));
            document.getElementById('closeVulnModal')?.addEventListener('click', () => hideModal('vulnModal'));
            document.getElementById('closeUpdateRulesModal')?.addEventListener('click', () => hideModal('updateRulesModal'));
            document.getElementById('closeNetworkScanModal')?.addEventListener('click', () => hideModal('networkScanModal'));
            document.getElementById('closeAccessControlModal')?.addEventListener('click', () => hideModal('accessControlModal'));
            document.getElementById('closeAuditModal')?.addEventListener('click', () => hideModal('auditModal'));

            // Threat Table Modal
            document.getElementById('closeThreatTableModal')?.addEventListener('click', () => hideModal('threatTableModal'));

            // Modal action buttons
            document.getElementById('applyUpdatesBtn')?.addEventListener('click', () => {
                showToast('Security rules updated successfully', 'success');
                hideModal('updateRulesModal');
            });

            document.getElementById('exportForensicsBtn')?.addEventListener('click', () => {
                showToast('Forensics report exported', 'success');
                hideModal('forensicsModal');
            });

            document.getElementById('patchAllBtn')?.addEventListener('click', () => {
                showToast('Vulnerability patches applied', 'success');
                hideModal('vulnModal');
            });

            document.getElementById('downloadAuditBtn')?.addEventListener('click', () => {
                showToast('Audit report downloaded', 'success');
                hideModal('auditModal');
            });

            // ==================== COMPREHENSIVE MODAL BUTTON HANDLERS ====================
            
            // Block/Unblock Threat Buttons
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('block-threat')) {
                    const action = e.target.textContent.trim();
                    if (action === 'Block') {
                        showToast('Threat blocked successfully - IP added to blacklist', 'success');
                        e.target.textContent = 'Blocked';
                        e.target.classList.remove('bg-red-200/40');
                        e.target.classList.add('bg-green-200/40');
                        e.target.disabled = true;
                    }
                }
            });

            // Quarantine Actions
            document.addEventListener('click', (e) => {
                if (e.target.textContent === 'Review' && e.target.closest('#quarantineList')) {
                    showToast('Opening quarantine file analyzer...', 'info');
                }
                if (e.target.textContent === 'Delete' && e.target.closest('#quarantineList')) {
                    showToast('Quarantined file permanently deleted', 'success');
                    e.target.closest('.flex').style.opacity = '0.5';
                    e.target.disabled = true;
                }
            });

            // Threat Intel List interactions
            document.addEventListener('click', (e) => {
                if (e.target.closest('#threatIntelList') && e.target.classList.contains('p-2')) {
                    showToast('Threat intelligence details loading...', 'info');
                }
            });

            // Firewall Rules Actions
            document.addEventListener('click', (e) => {
                if (e.target.textContent === 'Unblock' && e.target.closest('#blockedIPsList')) {
                    showToast('IP address unblocked successfully', 'success');
                    e.target.closest('.flex').style.opacity = '0.5';
                    e.target.innerHTML = '<i class="fas fa-check-circle"></i> Unblocked';
                    e.target.disabled = true;
                }
            });

            // SSH Key Revoke
            document.addEventListener('click', (e) => {
                if (e.target.textContent === 'Revoke' && e.target.closest('#sshKeysList')) {
                    showToast('SSH key revoked - Access removed', 'success');
                    e.target.closest('.p-2').style.opacity = '0.4';
                    e.target.disabled = true;
                }
            });

            // Configure Tool Buttons
            document.getElementById('saveToolConfig')?.addEventListener('click', () => {
                const toolName = document.getElementById('toolNameSpan').textContent;
                showToast(`${toolName} configuration saved successfully`, 'success');
                hideModal('configureToolModal');
            });

            document.getElementById('closeToolConfig')?.addEventListener('click', () => {
                hideModal('configureToolModal');
            });

            // Server Management Actions
            document.getElementById('restartServerBtn')?.addEventListener('click', () => {
                const serverName = document.getElementById('serverNameSpan').textContent;
                showToast(`${serverName} restarting - System will be temporarily unavailable`, 'warning');
                setTimeout(() => showToast(`${serverName} has restarted successfully`, 'success'), 2000);
            });

            document.getElementById('stopServerBtn')?.addEventListener('click', () => {
                const serverName = document.getElementById('serverNameSpan').textContent;
                showToast(`${serverName} stopping...`, 'warning');
                setTimeout(() => showToast(`${serverName} has stopped`, 'info'), 1500);
            });

            document.getElementById('startServerBtn')?.addEventListener('click', () => {
                const serverName = document.getElementById('serverNameSpan').textContent;
                showToast(`${serverName} starting...`, 'info');
                setTimeout(() => showToast(`${serverName} is now online`, 'success'), 2000);
            });

            document.getElementById('closeManageModal')?.addEventListener('click', () => {
                hideModal('manageServerModal');
            });

            // Database Management Actions
            document.getElementById('backupDBBtn')?.addEventListener('click', () => {
                const dbName = document.getElementById('dbNameSpan').textContent;
                showToast(`Creating backup of ${dbName}...`, 'info');
                setTimeout(() => showToast(`Database backup completed successfully - ${Math.floor(Math.random()*500 + 100)}MB`, 'success'), 2000);
            });

            document.getElementById('optimizeDBBtn')?.addEventListener('click', () => {
                const dbName = document.getElementById('dbNameSpan').textContent;
                showToast(`Optimizing ${dbName} database...`, 'info');
                setTimeout(() => showToast(`Database optimization complete - Freed ${Math.floor(Math.random()*200)}MB`, 'success'), 2500);
            });

            document.getElementById('repairDBBtn')?.addEventListener('click', () => {
                const dbName = document.getElementById('dbNameSpan').textContent;
                showToast(`Scanning ${dbName} for corruption...`, 'warning');
                setTimeout(() => showToast(`Database repair completed - All tables verified intact`, 'success'), 3000);
            });

            document.getElementById('closeDBModal')?.addEventListener('click', () => {
                hideModal('manageDBModal');
            });

            // Manage Server button
            document.querySelectorAll('.manage-server').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const server = e.target.dataset.server || 'server';
                    document.getElementById('serverNameSpan').innerText = server;
                    document.getElementById('serverDetails').innerHTML = `
                        <p><i class="fas fa-globe mr-2 text-blue-400"></i>IP: 10.0.1.${Math.floor(Math.random()*50+10)}</p>
                        <p><i class="fas fa-check-circle mr-2 text-green-400"></i>Status: <span class="badge-liquid bg-green-200/40">Online</span></p>
                        <p><i class="fas fa-microchip mr-2 text-purple-400"></i>CPU: ${Math.floor(Math.random()*30+15)}%</p>
                        <p><i class="fas fa-memory mr-2 text-blue-400"></i>Memory: ${(Math.random()*4+2).toFixed(1)}/8 GB</p>
                        <p><i class="fas fa-clock mr-2 text-orange-400"></i>Uptime: 45 days</p>
                    `;
                    showModal('manageServerModal');
                });
            });

            // Manage Database button
            document.querySelectorAll('.manage-db').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const db = e.target.dataset.db || 'database';
                    document.getElementById('dbNameSpan').innerText = db;
                    document.getElementById('dbDetails').innerHTML = `
                        <p><i class="fas fa-chart-line mr-2 text-green-400"></i>Size: ${Math.floor(Math.random()*1000+100)} MB</p>
                        <p><i class="fas fa-table mr-2 text-blue-400"></i>Tables: ${Math.floor(Math.random()*50+10)}</p>
                        <p><i class="fas fa-link mr-2 text-purple-400"></i>Connections: ${Math.floor(Math.random()*100+50)}</p>
                        <p><i class="fas fa-check-circle mr-2 text-green-400"></i>Status: <span class="badge-liquid bg-green-200/40">Online</span></p>
                    `;
                    showModal('manageDBModal');
                });
            });

            // Restore Backup button
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('restore-backup')) {
                    const backupId = e.target.closest('tr') ? e.target.closest('tr').querySelector('td').textContent : 'BKP-001';
                    showToast(`Restoring ${backupId}...`, 'info');
                    setTimeout(() => showToast(`Backup ${backupId} restored successfully`, 'success'), 3000);
                }
            });

            // Retry Backup button
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('retry-backup')) {
                    showToast('Retrying failed backup...', 'info');
                    setTimeout(() => showToast('Backup completed successfully', 'success'), 2000);
                }
            });

            // Patch Vulnerability button
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('patch-vuln')) {
                    const cve = e.target.closest('tr') ? e.target.closest('tr').querySelector('td').textContent : 'CVE-2024-1234';
                    showToast(`Patching ${cve}...`, 'warning');
                    setTimeout(() => showToast(`${cve} patched and verified`, 'success'), 2500);
                }
            });

            // Configure Tool buttons in systems list
            document.querySelectorAll('.configure-tool').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tool = e.target.dataset.tool || 'tool';
                    document.getElementById('toolNameSpan').innerText = tool.charAt(0).toUpperCase() + tool.slice(1);
                    document.getElementById('toolConfigForm').innerHTML = `
                        <label class="flex items-center gap-3 p-3 bg-white/10 rounded-2xl hover:bg-white/20 transition"><input type="checkbox" checked class="w-4 h-4"> Enable ${tool}</label>
                        <label class="block p-3 bg-white/10 rounded-2xl">
                            <span class="text-sm text-white/70 mb-2 block">Scan Interval</span>
                            <select class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"><option>Hourly</option><option>Daily</option><option selected>Weekly</option></select>
                        </label>
                        <label class="block p-3 bg-white/10 rounded-2xl">
                            <span class="text-sm text-white/70 mb-2 block">Log Level</span>
                            <select class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"><option selected>Info</option><option>Debug</option><option>Error</option></select>
                        </label>
                    `;
                    showModal('configureToolModal');
                });
            });

            // Process Modal actions
            document.getElementById('killProcessBtn')?.addEventListener('click', () => {
                showToast('Selected process(es) terminated', 'success');
                hideModal('processModal');
            });

            document.getElementById('closeProcessModal')?.addEventListener('click', () => {
                hideModal('processModal');
            });

            // Alert Modal
            document.getElementById('closeAlertModal')?.addEventListener('click', () => {
                showToast('All alerts acknowledged', 'success');
                hideModal('alertModal');
            });

            // Logout button
            document.getElementById('logoutBtn')?.addEventListener('click', () => {
                showToast('Logging out...', 'warning');
                setTimeout(() => showToast('You have been logged out', 'info'), 1500);
            });

            // Profile Modal Sidebar Navigation
            function initProfileSidebarNav() {
                const sidebarNavBtns = document.querySelectorAll('.sidebar-nav-btn');
                const profileSections = document.querySelectorAll('.profile-section');

                sidebarNavBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const sectionId = btn.dataset.section + 'Section';
                        
                        // Remove active class from all buttons and sections
                        sidebarNavBtns.forEach(b => b.classList.remove('active'));
                        profileSections.forEach(s => s.classList.remove('active'));
                        
                        // Add active class to clicked button
                        btn.classList.add('active');
                        
                        // Show corresponding section
                        const targetSection = document.getElementById(sectionId);
                        if (targetSection) {
                            targetSection.classList.add('active');
                        }
                    });
                });

                // Set initial active state
                const firstBtn = sidebarNavBtns[0];
                if (firstBtn) {
                    firstBtn.classList.add('active');
                }
            }

            // Initialize on modal show
            document.getElementById('profileBtn')?.addEventListener('click', () => {
                showModal('profileModal');
                setTimeout(() => initProfileSidebarNav(), 50);
            });

            document.getElementById('closeProfileModal')?.addEventListener('click', () => {
                hideModal('profileModal');
            });

            // ===== EDIT PROFILE MODAL =====
            document.getElementById('editProfileBtn')?.addEventListener('click', () => {
                hideModal('profileModal');
                showModal('editProfileModal');
            });

            document.getElementById('closeEditProfileModal')?.addEventListener('click', () => {
                hideModal('editProfileModal');
                showModal('profileModal');
            });

            document.getElementById('cancelEditProfile')?.addEventListener('click', () => {
                hideModal('editProfileModal');
                showModal('profileModal');
            });

            document.getElementById('saveEditProfile')?.addEventListener('click', () => {
                const fullName = document.getElementById('editFullName')?.value;
                const email = document.getElementById('editEmail')?.value;
                const jobTitle = document.getElementById('editJobTitle')?.value;
                const department = document.getElementById('editDepartment')?.value;
                const phone = document.getElementById('editPhone')?.value;
                const office = document.getElementById('editOffice')?.value;
                const timezone = document.getElementById('editTimezone')?.value;

                // Validate inputs
                if (!fullName || !email) {
                    showToast('Please fill in all required fields', 'error');
                    return;
                }

                // Update profile modal data
                if (document.getElementById('userFullName')) {
                    document.getElementById('userFullName').textContent = fullName;
                }
                if (document.getElementById('userEmail')) {
                    document.getElementById('userEmail').textContent = email;
                }
                if (document.getElementById('userAvatar')) {
                    const nameParts = fullName.split(' ');
                    const initials = nameParts.map(p => p[0]).join('+');
                    document.getElementById('userAvatar').src = 
                        `https://ui-avatars.com/api/?name=${initials}&background=2563eb&color=fff&size=120`;
                }
                if (document.querySelector('.sidebar-avatar')) {
                    const nameParts = fullName.split(' ');
                    const initials = nameParts.map(p => p[0]).join('+');
                    document.querySelector('.sidebar-avatar').src = 
                        `https://ui-avatars.com/api/?name=${initials}&background=2563eb&color=fff&size=120`;
                }
                if (document.querySelector('.sidebar-name')) {
                    document.querySelector('.sidebar-name').textContent = fullName;
                }
                if (document.querySelector('.sidebar-email')) {
                    document.querySelector('.sidebar-email').textContent = email;
                }

                showToast('Profile updated successfully!', 'success');
                hideModal('editProfileModal');
                showModal('profileModal');
            });

            // ===== CHANGE PASSWORD MODAL =====
            document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
                hideModal('profileModal');
                showModal('changePasswordModal');
                // Reset form
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
                updatePasswordStrength('');
                updatePasswordRequirements('');
            });

            document.getElementById('closeChangePasswordModal')?.addEventListener('click', () => {
                hideModal('changePasswordModal');
                showModal('profileModal');
            });

            document.getElementById('cancelChangePassword')?.addEventListener('click', () => {
                hideModal('changePasswordModal');
                showModal('profileModal');
            });

            // Password visibility toggle
            document.querySelectorAll('.toggle-password-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = btn.dataset.target;
                    const input = document.getElementById(targetId);
                    if (input) {
                        const isPassword = input.type === 'password';
                        input.type = isPassword ? 'text' : 'password';
                        btn.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
                    }
                });
            });

            // Password strength indicator
            document.getElementById('newPassword')?.addEventListener('input', (e) => {
                updatePasswordStrength(e.target.value);
                updatePasswordRequirements(e.target.value);
            });

            function updatePasswordStrength(password) {
                const strengthEl = document.getElementById('passwordStrength');
                if (!strengthEl) return;

                let strength = 0;
                if (password.length >= 12) strength++;
                if (password.length >= 16) strength++;
                if (/[A-Z]/.test(password)) strength++;
                if (/[a-z]/.test(password)) strength++;
                if (/[0-9]/.test(password)) strength++;
                if (/[!@#$%^&*]/.test(password)) strength++;

                strengthEl.classList.remove('weak', 'medium', 'strong');
                if (strength <= 2) {
                    strengthEl.classList.add('weak');
                    strengthEl.querySelector('.strength-text').textContent = 'Strength: Weak';
                } else if (strength <= 4) {
                    strengthEl.classList.add('medium');
                    strengthEl.querySelector('.strength-text').textContent = 'Strength: Medium';
                } else {
                    strengthEl.classList.add('strong');
                    strengthEl.querySelector('.strength-text').textContent = 'Strength: Strong';
                }
            }

            function updatePasswordRequirements(password) {
                const reqs = [
                    { id: 'req-length', test: password.length >= 12 },
                    { id: 'req-upper', test: /[A-Z]/.test(password) },
                    { id: 'req-lower', test: /[a-z]/.test(password) },
                    { id: 'req-number', test: /[0-9]/.test(password) },
                    { id: 'req-symbol', test: /[!@#$%^&*]/.test(password) }
                ];

                reqs.forEach(req => {
                    const el = document.getElementById(req.id);
                    if (el) {
                        el.classList.toggle('met', req.test);
                    }
                });
            }

            document.getElementById('confirmChangePassword')?.addEventListener('click', () => {
                const current = document.getElementById('currentPassword')?.value;
                const newPass = document.getElementById('newPassword')?.value;
                const confirm = document.getElementById('confirmPassword')?.value;

                // Validation
                if (!current || !newPass || !confirm) {
                    showToast('Please fill in all password fields', 'error');
                    return;
                }

                if (newPass.length < 12) {
                    showToast('New password must be at least 12 characters', 'error');
                    return;
                }

                if (!/[A-Z]/.test(newPass) || !/[a-z]/.test(newPass) || !/[0-9]/.test(newPass) || !/[!@#$%^&*]/.test(newPass)) {
                    showToast('Password must contain uppercase, lowercase, number, and symbol', 'error');
                    return;
                }

                if (newPass !== confirm) {
                    showToast('Passwords do not match', 'error');
                    return;
                }

                if (current === newPass) {
                    showToast('New password must be different from current password', 'error');
                    return;
                }

                showToast('Password changed successfully!', 'success');
                hideModal('changePasswordModal');
                showModal('profileModal');
            });

            // Maintenance Modal
            document.getElementById('cancelMaintenance')?.addEventListener('click', () => {
                hideModal('maintenanceModal');
            });

            document.getElementById('confirmMaintenance')?.addEventListener('click', () => {
                showToast('Maintenance mode enabled - System will be unavailable', 'warning');
                hideModal('maintenanceModal');
            });

            // Firewall close
            document.getElementById('closeFirewallModal')?.addEventListener('click', () => {
                hideModal('firewallRulesModal');
            });

            // Blocked IPs close
            document.getElementById('closeBlockedIPsModal')?.addEventListener('click', () => {
                hideModal('blockedIPsModal');
            });

            // SSH Keys close
            document.getElementById('closeSSHKeysModal')?.addEventListener('click', () => {
                hideModal('sshKeysModal');
            });

            // Threat Intel close
            document.getElementById('closeThreatIntelModal')?.addEventListener('click', () => {
                hideModal('threatIntelModal');
            });

            // Export options
            document.getElementById('exportCSV')?.addEventListener('click', () => {
                showToast('Exporting CSV...', 'info');
                hideModal('exportModal');
            });
            document.getElementById('exportJSON')?.addEventListener('click', () => {
                showToast('Exporting JSON...', 'info');
                hideModal('exportModal');
            });
            document.getElementById('exportPDF')?.addEventListener('click', () => {
                showToast('Exporting PDF...', 'info');
                hideModal('exportModal');
            });

            // Refresh button
            document.getElementById('refreshBtn')?.addEventListener('click', () => {
                refreshStats();
                showToast('Stats refreshed', 'info');
            });

            // Log refresh
            document.getElementById('refreshLogsBtn')?.addEventListener('click', () => {
                updateLogs();
                showToast('Logs refreshed', 'info');
            });

            // Clear logs
            document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
                document.getElementById('logContainer').innerHTML = '<div class="text-center text-gray-500 py-10">No logs to display</div>';
                showToast('Logs cleared', 'info');
            });

            // Check updates
            document.getElementById('checkUpdatesBtn')?.addEventListener('click', () => {
                showToast('Checking for updates...', 'info');
                setTimeout(() => showToast('3 new updates found', 'warning'), 1500);
            });

            // Logout
            document.getElementById('logoutBtn')?.addEventListener('click', () => {
                showToast('Logged out successfully', 'info');
                hideModal('profileModal');
            });

            // Save general settings
            document.querySelector('.save-general-btn')?.addEventListener('click', () => {
                showToast('Settings saved', 'success');
            });

            // Save notifications
            document.querySelector('.save-notifications-btn')?.addEventListener('click', () => {
                showToast('Notification settings saved', 'success');
            });

            // Backup actions
            document.querySelector('.run-backup-btn')?.addEventListener('click', () => {
                showToast('Starting backup...', 'info');
            });

            // Overlay click to close modals
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        overlay.style.display = 'none';
                    }
                });
            });

            // ==================== MOBILE NAV FAB MENU HANDLERS ====================
            
            // Floating Action Button (FAB) toggle
            const fabButton = document.getElementById('fabButton');
            const circularMenu = document.getElementById('circularMenu');
            const menuBackdrop = document.querySelector('.circular-menu-backdrop');
            
            if (fabButton && circularMenu) {
                // FAB click to open/close menu
                fabButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (circularMenu.classList.contains('active')) {
                        circularMenu.classList.remove('active');
                        fabButton.classList.remove('sticky');
                        if (navigator.vibrate) navigator.vibrate(5);
                    } else {
                        circularMenu.classList.add('active');
                        fabButton.classList.add('sticky');
                        if (navigator.vibrate) navigator.vibrate([10, 5, 10]);
                    }
                });
                
                // Close menu when clicking backdrop
                if (menuBackdrop) {
                    menuBackdrop.addEventListener('click', () => {
                        circularMenu.classList.remove('active');
                        fabButton.classList.remove('sticky');
                        if (navigator.vibrate) navigator.vibrate(5);
                    });
                }
                
                // Tab switching from circular menu
                const fabMenuItems = document.querySelectorAll('.fab-menu-item');
                fabMenuItems.forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        if (navigator.vibrate && window.innerWidth <= 768) {
                            navigator.vibrate(10);
                        }
                        
                        const tabId = item.dataset.tab;
                        const allNavItems = document.querySelectorAll('.nav-item-liquid, .mobile-nav-item-liquid');
                        const tabs = document.querySelectorAll('.tab-content');
                        
                        // Smooth fade transition
                        tabs.forEach(t => {
                            t.classList.remove('active');
                            t.style.opacity = '0';
                        });
                        
                        // Instant tab switch for quick transitions
                        requestAnimationFrame(() => {
                            document.getElementById(tabId)?.classList.add('active');
                            document.getElementById(tabId).style.opacity = '1';
                        });
                        
                        // Update nav items active state
                        allNavItems.forEach(n => n.classList.remove('active'));
                        
                        // Find and activate the main nav item if it exists
                        const mainNavItem = document.querySelector(`[data-tab="${tabId}"]`);
                        if (mainNavItem) {
                            mainNavItem.classList.add('active');
                        }
                        
                        // Close the circular menu
                        circularMenu.classList.remove('active');
                        fabButton.classList.remove('sticky');
                        
                        // Scroll to top on mobile
                        if (window.innerWidth <= 768) {
                            setTimeout(() => {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }, 100);
                        }
                    });
                });
            }
        }

        // ==================== SETTINGS TAB TOOL EVENT LISTENERS ====================
        
        // Backup & Restore Tools
        document.querySelectorAll('.run-backup-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('backupRestoreModal');
                showToast('Backup interface loaded', 'info');
            });
        });

        document.querySelectorAll('.restore-backup-modal, .schedule-backup-modal, .verify-backup-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.includes('Restore') ? 'Restore' : e.target.textContent.includes('Schedule') ? 'Schedule' : 'Verify';
                showModal('backupRestoreModal');
                showToast(`${action} tool opened`, 'info');
            });
        });

        // System Performance Tools
        document.querySelectorAll('.view-performance-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('performanceModal');
                showToast('Performance monitoring started', 'info');
            });
        });

        document.querySelectorAll('.optimize-system-modal, .resource-limit-modal, .cache-config-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.trim();
                showModal('performanceModal');
                showToast(`${action} tool loaded`, 'info');
            });
        });

        // Network Configuration Tools
        document.querySelectorAll('.network-interfaces-modal, .dns-config-modal, .vpn-config-modal, .proxy-config-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.trim();
                showModal('networkConfigModal');
                showToast(`${action} configuration opened`, 'info');
            });
        });

        // User Management Tools
        document.querySelectorAll('.manage-users-modal, .manage-roles-modal, .permissions-modal, .session-mgmt-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                showModal('userManagementModal');
                showToast('User management interface opened', 'info');
            });
        });

        // API Keys & Tokens Tools
        document.querySelectorAll('.api-keys-modal, .oauth-config-modal, .generate-token-modal, .revoke-token-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.trim();
                showModal('apiKeysModal');
                showToast(`${action} - API management opened`, 'info');
            });
        });

        // Database Maintenance Tools
        document.querySelectorAll('.db-health-modal, .db-optimize-modal, .db-repair-modal, .db-replication-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.trim();
                showModal('dbMaintenanceModal');
                showToast(`${action} - Database tools opened`, 'info');
            });
        });

        // Log Management Tools
        document.querySelectorAll('.view-logs-modal, .log-rotation-modal, .log-export-modal, .log-archival-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.trim();
                showModal('logManagementModal');
                showToast(`${action} - Log management opened`, 'info');
            });
        });

        // Audit & Compliance Tools
        document.querySelectorAll('.audit-trail-modal, .compliance-report-modal, .policy-config-modal, .soc-config-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.trim();
                showModal('auditComplianceModal');
                showToast(`${action} - Compliance tools opened`, 'info');
            });
        });

        // ==================== PROFILE ACTIONS EVENT LISTENERS ====================
        
        // Edit Profile Button
        document.querySelectorAll('.edit-profile-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('editProfileModal');
                showToast('Edit profile form opened', 'info');
            });
        });
        
        // Change Password Button
        document.querySelectorAll('.change-password-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('changePasswordModal');
                showToast('Change password form opened', 'info');
            });
        });
        
        // Sessions Management Button
        document.querySelectorAll('.sessions-mgmt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('sessionsManagementModal');
                showToast('Active sessions loaded', 'info');
            });
        });
        
        // Profile Settings Button
        document.querySelectorAll('.profile-settings-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('profileSettingsModal');
                showToast('Profile settings opened', 'info');
            });
        });
        
        // Save Profile Changes
        document.getElementById('saveEditProfile')?.addEventListener('click', () => {
            const fullName = document.getElementById('editFullName').value;
            showToast(`Profile updated for ${fullName}`, 'success');
            hideModal('editProfileModal');
        });
        
        // Close Profile Modals
        document.getElementById('closeEditProfileModal')?.addEventListener('click', () => hideModal('editProfileModal'));
        document.getElementById('closeSessionsModal')?.addEventListener('click', () => hideModal('sessionsManagementModal'));
        document.getElementById('closeProfileSettingsModal')?.addEventListener('click', () => hideModal('profileSettingsModal'));

        // ==================== NEW MODAL EVENT LISTENERS ====================
        
        // Restart Web Services Button
        document.querySelectorAll('.restart-web-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('restartWebModal');
                showToast('Web services restart dialog opened', 'info');
            });
        });
        
        document.getElementById('closeRestartWebModal')?.addEventListener('click', () => hideModal('restartWebModal'));
        document.getElementById('confirmRestartWeb')?.addEventListener('click', () => {
            showToast('All web services restarting...', 'warning');
            setTimeout(() => {
                showToast('Web services restarted successfully', 'success');
                hideModal('restartWebModal');
            }, 2000);
        });

        // Restart Database Services Button
        document.querySelectorAll('.restart-db-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('restartDBModal');
                showToast('Database services restart dialog opened', 'info');
            });
        });
        
        document.getElementById('closeRestartDBModal')?.addEventListener('click', () => hideModal('restartDBModal'));
        document.getElementById('confirmRestartDB')?.addEventListener('click', () => {
            showToast('All database services restarting...', 'warning');
            setTimeout(() => {
                showToast('Database services restarted successfully', 'success');
                hideModal('restartDBModal');
            }, 2500);
        });

        // Service Status Button
        document.getElementById('serviceStatusBtn')?.addEventListener('click', () => {
            showModal('serviceStatusModal');
            showToast('Checking all service statuses...', 'info');
        });

        // Replication Settings Button
        document.querySelectorAll('.replication-settings-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('replicationSettingsModal');
                showToast('Replication settings opened', 'info');
            });
        });

        document.getElementById('closeReplicationModal')?.addEventListener('click', () => hideModal('replicationSettingsModal'));

        // Backup Settings Button
        document.querySelectorAll('.backup-settings-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('backupSettingsModal');
                showToast('Backup settings opened', 'info');
            });
        });

        document.getElementById('closeBackupSettingsModal')?.addEventListener('click', () => hideModal('backupSettingsModal'));

        // Check Updates Button
        document.getElementById('checkUpdatesBtn')?.addEventListener('click', () => {
            showModal('updatesCheckModal');
            showToast('Checking for system updates...', 'info');
        });

        document.getElementById('closeUpdatesCheckModal')?.addEventListener('click', () => hideModal('updatesCheckModal'));

        // General Settings Save Button
        document.getElementById('save-general-btn')?.addEventListener('click', () => {
            showToast('General settings saved successfully', 'success');
        });

        // Notification Settings Save Button
        document.getElementById('save-notifications-btn')?.addEventListener('click', () => {
            showToast('Notification settings saved successfully', 'success');
        });

        // Backup Modal Buttons (Settings tab)
        document.querySelectorAll('.run-backup-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('backupRestoreModal');
                showToast('Backup & Restore dialog opened', 'info');
            });
        });

        document.querySelectorAll('.view-performance-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('performanceModal');
                showToast('System Performance monitoring opened', 'info');
            });
        });

        // Network Configuration Modal
        document.querySelectorAll('.network-interfaces-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('networkConfigModal');
                showToast('Network Configuration opened', 'info');
            });
        });

        // User Management Modals
        document.querySelectorAll('.manage-users-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('userManagementModal');
                showToast('User Management opened', 'info');
            });
        });

        // API Keys Modal
        document.querySelectorAll('.api-keys-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('apiTokensModal');
                showToast('API Keys & OAuth configuration opened', 'info');
            });
        });

        document.getElementById('closeApiTokensModal')?.addEventListener('click', () => hideModal('apiTokensModal'));

        // Database Health Check Modal
        document.querySelectorAll('.db-health-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('dbMaintenanceModal');
                showToast('Database Health Check opened', 'info');
            });
        });

        // Log Management Modal
        document.querySelectorAll('.view-logs-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('logManagementModal');
                showToast('Log Management opened', 'info');
            });
        });

        // Audit Trail Modal
        document.querySelectorAll('.audit-trail-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('auditTrailModal');
                showToast('Audit Trail loaded', 'info');
            });
        });

        document.getElementById('closeAuditTrailModal')?.addEventListener('click', () => hideModal('auditTrailModal'));

        // Policy Configuration Modal
        document.querySelectorAll('.policy-config-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('auditComplianceModal');
                showToast('Compliance Policies opened', 'info');
            });
        });

        // Compliance Standards Detail Modal
        document.querySelectorAll('.view-pci-btn, .view-gdpr-btn, .view-iso-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const standard = btn.textContent.includes('PCI') ? 'PCI DSS' : btn.textContent.includes('GDPR') ? 'GDPR' : 'ISO 27001';
                document.getElementById('standardNameSpan').textContent = standard;
                showModal('complianceStandardModal');
                showToast(`${standard} compliance details loaded`, 'info');
            });
        });

        document.getElementById('closeComplianceStandardModal')?.addEventListener('click', () => hideModal('complianceStandardModal'));

        // Compliance Report Modal
        document.querySelectorAll('.compliance-report-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('complianceReportModal');
                showToast('Compliance reports loaded', 'info');
            });
        });

        document.getElementById('closeComplianceReportModal')?.addEventListener('click', () => hideModal('complianceReportModal'));

        // Report Generation Modal
        document.getElementById('reportBtn')?.addEventListener('click', () => {
            showModal('reportModal');
            showToast('Report generator opened', 'info');
        });

        document.getElementById('closeReportModal')?.addEventListener('click', () => hideModal('reportModal'));

        // Config Modal
        document.getElementById('configBtn')?.addEventListener('click', () => {
            showModal('configModal');
            showToast('System configuration opened', 'info');
        });

        document.getElementById('closeConfigModal')?.addEventListener('click', () => hideModal('configModal'));

        // Refresh Button (should refresh data)
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            showToast('Refreshing system data...', 'info');
            setTimeout(() => showToast('System data refreshed', 'success'), 1500);
        });

        // Export Logs Button
        document.getElementById('exportLogsBtn')?.addEventListener('click', () => {
            showToast('Exporting logs to file...', 'info');
            setTimeout(() => showToast('Logs exported successfully', 'success'), 1500);
        });

        // Refresh Logs Button
        document.getElementById('refreshLogsBtn')?.addEventListener('click', () => {
            showToast('Refreshing logs...', 'info');
            setTimeout(() => showToast('Logs refreshed', 'success'), 800);
        });

        // Clear Logs Button
        document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
            showToast('Logs cleared from system', 'warning');
        });

        // Vulnerability Action Buttons
        document.querySelectorAll('.run-vuln-scan').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('vulnModal');
                showToast('Starting vulnerability scan...', 'warning');
            });
        });

        document.querySelectorAll('.apply-patches').forEach(btn => {
            btn.addEventListener('click', () => {
                showToast('Applying all available vulnerability patches...', 'warning');
                setTimeout(() => showToast('All patches applied successfully', 'success'), 3000);
            });
        });

        // Compliance Scan Buttons
        document.querySelectorAll('.run-compliance-scan').forEach(btn => {
            btn.addEventListener('click', () => {
                showToast('Running compliance audit scan...', 'warning');
                setTimeout(() => {
                    showModal('auditModal');
                    showToast('Compliance audit completed', 'success');
                }, 2500);
            });
        });

        document.querySelectorAll('.generate-compliance-report').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal('complianceReportModal');
                showToast('Generating compliance reports...', 'info');
            });
        });

        document.querySelectorAll('.export-compliance-data').forEach(btn => {
            btn.addEventListener('click', () => {
                showToast('Exporting compliance data...', 'info');
                setTimeout(() => showToast('Compliance data exported successfully', 'success'), 1500);
            });
        });

        // Database Action Buttons
        document.querySelectorAll('.backup-db-btn, .optimize-db-btn, .repair-db-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.textContent.includes('Backup') ? 'Backup' : e.target.textContent.includes('Optimize') ? 'Optimize' : 'Repair';
                showToast(`Database ${action.toLowerCase()} initiated...`, 'warning');
                setTimeout(() => showToast(`Database ${action.toLowerCase()} completed`, 'success'), 2000);
            });
        });

        document.querySelectorAll('.db-settings-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showToast('Database settings panel opened', 'info');
            });
        });

        // ==================== UTILITY FUNCTIONS ====================
        function showModal(modalId) {
            document.getElementById(modalId).style.display = 'flex';
        }

        function hideModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        function refreshStats() {
            document.getElementById('cpuValue').innerText = (Math.floor(Math.random()*30)+15)+'%';
            document.getElementById('memoryValue').innerText = (Math.random()*3+3).toFixed(1)+' GB';
            document.getElementById('diskValue').innerText = (Math.floor(Math.random()*50)+140)+' GB';
            document.getElementById('networkValue').innerText = (Math.random()*1.5+0.4).toFixed(1)+' Gbps';
            document.getElementById('cpuBar').style.width = document.getElementById('cpuValue').innerText;
            document.getElementById('memoryBar').style.width = (parseFloat(document.getElementById('memoryValue').innerText)/8.2*100)+'%';
        }

        function showToast(msg, type = 'info') {
            const t = document.createElement('div');
            const isMobile = window.innerWidth <= 768;
            
            // Color mapping
            const colorMap = {
                warning: { bg: 'bg-amber-500/80', icon: 'exclamation-triangle' },
                danger: { bg: 'bg-red-500/80', icon: 'times-circle' },
                success: { bg: 'bg-emerald-500/80', icon: 'check-circle' },
                info: { bg: 'bg-blue-500/80', icon: 'info-circle' }
            };
            
            const { bg, icon } = colorMap[type] || colorMap.info;
            
            // Mobile-optimized styling
            if (isMobile) {
                t.className = `fixed ${bg} backdrop-blur-2xl text-white px-4 py-3 rounded-[20px_12px_20px_12px] z-[3000] flex gap-2 items-center border border-white/60 shadow-lg font-medium text-sm left-3 right-3 bottom-24`;
            } else {
                t.className = `fixed ${bg} backdrop-blur-xl text-white px-6 py-4 rounded-[80px_20px_80px_20px] z-[3000] flex gap-3 items-center border border-white/50 shadow-2xl top-5 right-5`;
            }
            
            t.innerHTML = `<i class="fas fa-${icon}" style="font-size: ${isMobile ? '14px' : '16px'}"></i><span>${msg}</span>`;
            
            // Animation timing
            const duration = isMobile ? 0.35 : 0.4;
            const easing = isMobile ? 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' : 'cubic-bezier(0.34, 1.56, 0.64, 1)';
            t.style.animation = `slideInToast ${duration}s ${easing}`;
            
            document.body.appendChild(t);
            
            setTimeout(() => {
                t.style.animation = `slideOutToast ${duration}s ${easing} forwards`;
                setTimeout(() => t.remove(), duration * 1000);
            }, isMobile ? 2800 : 2500);
        }

        function populateAllTabs() {
            // This function is called on load to ensure all tabs have content
            // All content is already populated in initializeAllData()
        }

        // ==================== RESPONSIVE BEHAVIOR ====================
        // Handle viewport changes
        let currentViewport = window.innerWidth <= 768 ? 'mobile' : 'desktop';

        window.addEventListener('resize', debounce(() => {
            const newViewport = window.innerWidth <= 768 ? 'mobile' : 'desktop';
            if (newViewport !== currentViewport) {
                currentViewport = newViewport;
                
                // Hide vertical nav on mobile
                const verticalNav = document.getElementById('verticalNav');
                if (currentViewport === 'mobile') {
                    if (!verticalNav.classList.contains('collapsed')) {
                        verticalNav.classList.add('collapsed');
                    }
                } else {
                    if (verticalNav.classList.contains('collapsed')) {
                        verticalNav.classList.remove('collapsed');
                    }
                }
            }
        }, 250));

        // Debounce utility
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Improve mobile touch handling
        document.addEventListener('touchstart', function(e) {
            if (e.target.closest('.mobile-nav-item-liquid')) {
                e.preventDefault();
                e.target.closest('.mobile-nav-item-liquid').click();
            }
        }, { passive: false });

        // Prevent default iOS behaviors
        document.addEventListener('touchmove', function(e) {
            if (e.target.closest('.modal-overlay') || e.target.closest('.mobile-bottom-nav')) {
                if (!e.target.closest('input') && !e.target.closest('textarea')) {
                    // Allow scrolling on these elements
                }
            }
        }, { passive: true });


        
        
    
    