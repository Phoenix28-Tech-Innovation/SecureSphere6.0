// ==================== API CLIENT ====================
// Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// ==================== FETCH HELPERS ====================
const apiClient = {
    async get(endpoint) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API GET Error:', error);
            return null;
        }
    },
    
    async post(endpoint, data) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API POST Error:', error);
            return null;
        }
    },
    
    async delete(endpoint) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API DELETE Error:', error);
            return null;
        }
    }
};

// ==================== SYSTEM API ====================
const systemAPI = {
    async getStats() {
        return await apiClient.get('/system/stats');
    },
    
    async getProcesses(limit = 10) {
        return await apiClient.get(`/system/processes?limit=${limit}`);
    },
    
    async recordStats() {
        return await apiClient.post('/system/record-stats', {});
    }
};

// ==================== SERVERS API ====================
const serversAPI = {
    async getAll() {
        return await apiClient.get('/servers');
    },
    
    async getServices(serverId) {
        return await apiClient.get(`/servers/${serverId}/services`);
    },
    
    async restart(serverId) {
        return await apiClient.post(`/servers/${serverId}/restart`, {});
    }
};

// ==================== BACKUPS API ====================
const backupsAPI = {
    async getAll() {
        return await apiClient.get('/backups');
    },
    
    async create(source, type = 'full') {
        return await apiClient.post('/backups', { source, type });
    },
    
    async restore(backupId) {
        return await apiClient.post(`/backups/${backupId}/restore`, {});
    },
    
    async delete(backupId) {
        return await apiClient.delete(`/backups/${backupId}`);
    },
    
    async getStats() {
        return await apiClient.get('/backups/stats');
    }
};

// ==================== LOGS API ====================
const logsAPI = {
    async getAll(type = 'all', limit = 100) {
        return await apiClient.get(`/logs?type=${type}&limit=${limit}`);
    },
    
    async create(message, level = 'info', logType = 'application') {
        return await apiClient.post('/logs', { message, level, type: logType });
    },
    
    async clear(type) {
        return await apiClient.post(`/logs/clear?type=${type}`, {});
    },
    
    async export() {
        return await apiClient.get('/logs/export');
    }
};

// ==================== SECURITY API ====================
const securityAPI = {
    async getAlerts(limit = 50) {
        return await apiClient.get(`/security/alerts?limit=${limit}`);
    },
    
    async resolveAlert(alertId) {
        return await apiClient.post(`/security/alerts/${alertId}/resolve`, {});
    },
    
    async getWebServices() {
        return await apiClient.get('/security/services/web');
    },
    
    async getDatabaseServices() {
        return await apiClient.get('/security/services/database');
    },
    
    async restartService(serviceId) {
        return await apiClient.post(`/security/services/${serviceId}/restart`, {});
    },
    
    async getTools() {
        return await apiClient.get('/security/tools');
    }
};

// ==================== COMPLIANCE API ====================
const complianceAPI = {
    async getResults() {
        return await apiClient.get('/compliance/results');
    },
    
    async runScan(framework) {
        return await apiClient.post('/compliance/scan', { framework });
    },
    
    async getDetails(framework) {
        return await apiClient.get(`/compliance/${framework}/details`);
    }
};

// ==================== VULNERABILITIES API ====================
const vulnerabilitiesAPI = {
    async getAll(severity, status, limit = 50) {
        let url = '/vulnerabilities';
        const params = [];
        if (severity) params.push(`severity=${severity}`);
        if (status) params.push(`status=${status}`);
        params.push(`limit=${limit}`);
        if (params.length) url += '?' + params.join('&');
        return await apiClient.get(url);
    },
    
    async runScan(type = 'full') {
        return await apiClient.post('/vulnerabilities/scan', { type });
    },
    
    async getStats() {
        return await apiClient.get('/vulnerabilities/stats');
    },
    
    async patch(cveId) {
        return await apiClient.post(`/vulnerabilities/${cveId}/patch`, {});
    }
};
