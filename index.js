const fs = require('fs');
const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active sessions
const activeSessions = new Map();
const permanentSessions = new Map();
const sessionRefreshTracker = new Map();

// WebSocket Server
const wss = new WebSocket.Server({ server });

// ==================== PERMANENT SESSION SYSTEM ====================
function savePermanentSession(sessionId, api, userId, type = 'messaging') {
    try {
        if (!api) return false;
        
        const sessionPath = path.join(__dirname, 'sessions', `permanent_${sessionId}.json`);
        if (!fs.existsSync(path.dirname(sessionPath))) {
            fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
        }
        
        const appState = api.getAppState();
        const sessionData = {
            sessionId,
            appState,
            userId,
            type,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            lastRefresh: Date.now()
        };
        
        fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
        permanentSessions.set(sessionId, sessionData);
        // MINIMAL LOGGING
        return true;
    } catch (error) {
        return false;
    }
}

function loadPermanentSession(sessionId) {
    try {
        if (permanentSessions.has(sessionId)) {
            return permanentSessions.get(sessionId);
        }
        
        const sessionPath = path.join(__dirname, 'sessions', `permanent_${sessionId}.json`);
        if (fs.existsSync(sessionPath)) {
            const fileStats = fs.statSync(sessionPath);
            if (fileStats.size > 100) {
                const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                permanentSessions.set(sessionId, sessionData);
                return sessionData;
            }
        }
    } catch (error) {
        // NO CONSOLE LOGGING
    }
    return null;
}

function getSessionsByUserId(userId) {
    const sessions = [];
    for (const [sessionId, session] of permanentSessions) {
        if (session.userId === userId) {
            sessions.push({
                sessionId,
                type: session.type,
                createdAt: session.createdAt,
                lastUsed: session.lastUsed,
                lastRefresh: session.lastRefresh
            });
        }
    }
    return sessions;
}

// ==================== AUTO REFRESH SYSTEM (48 hours) ====================
function setupSessionAutoRefresh(sessionId, api, userId, groupUID, type) {
    if (sessionRefreshTracker.has(sessionId)) {
        clearTimeout(sessionRefreshTracker.get(sessionId));
    }
    
    const refreshTimer = setTimeout(() => {
        refreshSession(sessionId, api, userId, groupUID, type);
    }, 172800000);
    
    sessionRefreshTracker.set(sessionId, refreshTimer);
}

function refreshSession(sessionId, api, userId, groupUID, type) {
    try {
        const appState = api.getAppState();
        
        const sessionData = {
            sessionId,
            appState,
            userId,
            type,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            lastRefresh: Date.now()
        };
        
        const sessionPath = path.join(__dirname, 'sessions', `permanent_${sessionId}.json`);
        fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
        permanentSessions.set(sessionId, sessionData);
        
        setupSessionAutoRefresh(sessionId, api, userId, groupUID, type);
        
    } catch (error) {
        // NO CONSOLE LOGGING
    }
}

// ==================== SILENT LOGIN SYSTEM ====================
function silentLogin(cookieString, callback) {
    const loginOptions = {
        appState: null,
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        forceLogin: false,
        logLevel: 'silent'
    };

    const loginMethods = [
        (cb) => {
            try {
                const appState = JSON.parse(cookieString);
                loginOptions.appState = appState;
                wiegine.login(loginOptions, (err, api) => {
                    if (err || !api) {
                        cb(null);
                    } else {
                        cb(api);
                    }
                });
            } catch (e) {
                cb(null);
            }
        },
        (cb) => {
            loginOptions.appState = cookieString;
            wiegine.login(loginOptions, (err, api) => {
                if (err || !api) {
                    cb(null);
                } else {
                    cb(api);
                }
            });
        },
        (cb) => {
            try {
                const cookiesArray = cookieString.split(';').map(c => c.trim()).filter(c => c);
                const appState = cookiesArray.map(cookie => {
                    const [key, ...valueParts] = cookie.split('=');
                    const value = valueParts.join('=');
                    return {
                        key: key.trim(),
                        value: value.trim(),
                        domain: '.facebook.com',
                        path: '/',
                        hostOnly: false,
                        creation: new Date().toISOString(),
                        lastAccessed: new Date().toISOString()
                    };
                }).filter(c => c.key && c.value);
                
                if (appState.length > 0) {
                    loginOptions.appState = appState;
                    wiegine.login(loginOptions, (err, api) => {
                        if (err || !api) {
                            cb(null);
                        } else {
                            cb(api);
                        }
                    });
                } else {
                    cb(null);
                }
            } catch (e) {
                cb(null);
            }
        },
        (cb) => {
            wiegine.login(cookieString, loginOptions, (err, api) => {
                if (err || !api) {
                    cb(null);
                } else {
                    cb(api);
                }
            });
        }
    ];

    let currentMethod = 0;
    
    function tryNextMethod() {
        if (currentMethod >= loginMethods.length) {
            callback(null);
            return;
        }
        
        loginMethods[currentMethod]((api) => {
            if (api) {
                callback(api);
            } else {
                currentMethod++;
                setTimeout(tryNextMethod, 1000);
            }
        });
    }
    
    tryNextMethod();
}

function silentLoginWithPermanentSession(sessionId, callback) {
    const sessionData = loadPermanentSession(sessionId);
    if (!sessionData || !sessionData.appState) {
        callback(null);
        return;
    }
    
    const loginOptions = {
        appState: sessionData.appState,
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        forceLogin: false,
        logLevel: 'silent'
    };
    
    wiegine.login(loginOptions, (err, api) => {
        if (err || !api) {
            callback(null);
        } else {
            sessionData.lastUsed = Date.now();
            permanentSessions.set(sessionId, sessionData);
            
            const sessionPath = path.join(__dirname, 'sessions', `permanent_${sessionId}.json`);
            try {
                fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
            } catch (e) {}
            
            callback(api);
        }
    });
}

// ==================== ONE TIME LOGIN MULTI-COOKIE MESSAGER ====================
class OneTimeLoginMultiCookieMessager {
    constructor(sessionId, cookies, groupUID, prefix, delay, messages) {
        this.sessionId = sessionId;
        this.originalCookies = cookies;
        this.groupUID = groupUID;
        this.prefix = prefix;
        this.delay = delay * 1000;
        this.originalMessages = messages;
        
        this.messageQueue = [];
        this.isRunning = false;
        this.messageIndex = 0;
        this.cookieIndex = 0;
        this.activeApis = new Map(); // All cookies logged in ONCE and stored here
        this.messagesSent = 0;
        this.initialized = false;
    }

    async initializeAllCookiesOnce() {
        if (this.initialized) return true;
        
        const totalCookies = this.originalCookies.length;
        let successCount = 0;
        
        // SILENT LOGIN - No console logging
        for (let i = 0; i < totalCookies; i++) {
            const cookie = this.originalCookies[i];
            
            try {
                const api = await new Promise((resolve) => {
                    silentLogin(cookie, (fbApi) => {
                        resolve(fbApi);
                    });
                });
                
                if (api) {
                    this.activeApis.set(i, api);
                    successCount++;
                    
                    // Save each as permanent session
                    const userId = api.getCurrentUserID();
                    savePermanentSession(
                        `${this.sessionId}_cookie${i}`,
                        api,
                        userId,
                        'messaging'
                    );
                }
            } catch (error) {
                // SILENT ERROR - No logging
            }
            
            // Small delay between logins
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        this.initialized = successCount > 0;
        return this.initialized;
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.messageQueue = [...this.originalMessages];
        
        this.processQueue();
    }

    async processQueue() {
        while (this.isRunning && this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            const messageText = this.prefix + message;
            const messageNumber = this.messageIndex + 1;
            
            // Get next cookie index
            this.cookieIndex = (this.cookieIndex + 1) % this.originalCookies.length;
            const cookieNum = this.cookieIndex + 1;
            
            const success = await this.sendWithCookie(this.cookieIndex, messageText);
            
            if (success) {
                this.messageIndex++;
                this.messagesSent++;
                
                const session = activeSessions.get(this.sessionId);
                if (session) {
                    session.messagesSent = this.messagesSent;
                    updateSessionStatus(this.sessionId);
                }
            } else {
                this.messageQueue.unshift(message);
            }
            
            await new Promise(resolve => setTimeout(resolve, this.delay));
        }
        
        if (this.messageQueue.length === 0) {
            // Loop messages
            this.messageQueue = [...this.originalMessages];
            this.messageIndex = 0;
            setTimeout(() => this.processQueue(), 1000);
        }
    }

    async sendWithCookie(cookieIndex, messageText) {
        // Check if we have active API for this cookie
        if (!this.activeApis.has(cookieIndex)) {
            // Try to login if not already logged in
            const cookie = this.originalCookies[cookieIndex];
            
            try {
                const api = await new Promise((resolve) => {
                    silentLogin(cookie, (fbApi) => {
                        resolve(fbApi);
                    });
                });
                
                if (api) {
                    this.activeApis.set(cookieIndex, api);
                } else {
                    return false;
                }
            } catch (error) {
                return false;
            }
        }
        
        const api = this.activeApis.get(cookieIndex);
        
        return new Promise((resolve) => {
            api.sendMessage(messageText, this.groupUID, (err, messageInfo) => {
                if (err) {
                    // If send fails, remove API and try next time
                    this.activeApis.delete(cookieIndex);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    stop() {
        this.isRunning = false;
    }

    getStatus() {
        return {
            sessionId: this.sessionId,
            totalCookies: this.originalCookies.length,
            activeCookies: this.activeApis.size,
            currentCookie: this.cookieIndex + 1,
            isRunning: this.isRunning,
            messagesSent: this.messagesSent,
            queueLength: this.messageQueue.length,
            totalMessages: this.originalMessages.length
        };
    }
}

// ==================== WEB SOCKET FUNCTIONS ====================
function updateSessionStatus(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    const sessionInfo = {
        sessionId: sessionId,
        groupUID: session.groupUID,
        status: session.status,
        messagesSent: session.messagesSent || 0,
        uptime: Date.now() - session.startTime,
        userId: session.userId || 'Unknown',
        type: session.type || 'unknown'
    };

    broadcastToSession(sessionId, {
        type: 'session_update',
        session: sessionInfo
    });
}

function broadcastToSession(sessionId, data) {
    wss.clients.forEach(client => {
        if (client.sessionId === sessionId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'authenticate' && data.sessionId) {
                ws.sessionId = data.sessionId;
                ws.send(JSON.stringify({
                    type: 'auth_success',
                    message: 'Session authenticated'
                }));
                
                const session = activeSessions.get(data.sessionId);
                if (session) {
                    const sessionInfo = {
                        sessionId: data.sessionId,
                        groupUID: session.groupUID,
                        status: session.status,
                        messagesSent: session.messagesSent || 0,
                        uptime: Date.now() - session.startTime,
                        userId: session.userId,
                        type: session.type
                    };
                    
                    ws.send(JSON.stringify({
                        type: 'session_info',
                        session: sessionInfo
                    }));
                }
            }
        } catch (error) {
            // SILENT ERROR
        }
    });
    
    ws.on('close', () => {
        // SILENT DISCONNECT
    });
});

// ==================== API ROUTES ====================

// Start one-time login multi-cookie messaging
app.post('/api/start-one-time-messaging', async (req, res) => {
    try {
        const { cookies, groupUID, prefix, delay, messages } = req.body;
        
        if (!cookies || !groupUID || !messages) {
            return res.json({ success: false, error: 'Missing required fields' });
        }
        
        const sessionId = 'onetime_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const messager = new OneTimeLoginMultiCookieMessager(sessionId, cookies, groupUID, prefix, delay, messages);
        const initialized = await messager.initializeAllCookiesOnce();
        
        if (!initialized) {
            return res.json({ success: false, error: 'Failed to login with cookies' });
        }
        
        messager.start();
        
        const session = {
            messager,
            groupUID,
            prefix,
            delay: delay * 1000,
            messages,
            status: 'active',
            messagesSent: 0,
            startTime: Date.now(),
            userId: 'multi-cookie-user',
            type: 'one_time_messaging',
            cookiesCount: cookies.length
        };
        
        activeSessions.set(sessionId, session);
        
        res.json({
            success: true,
            sessionId,
            userId: 'multi-cookie-user',
            cookiesCount: cookies.length,
            message: `Messaging started with ${cookies.length} cookies (one-time login)`
        });
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Fetch groups with names from cookie
app.post('/api/fetch-groups-silent', async (req, res) => {
    try {
        const { cookie, sessionId } = req.body;
        
        let api = null;
        
        if (sessionId) {
            api = await new Promise((resolve) => {
                silentLoginWithPermanentSession(sessionId, (fbApi) => {
                    resolve(fbApi);
                });
            });
        } else if (cookie) {
            api = await new Promise((resolve) => {
                silentLogin(cookie, (fbApi) => {
                    resolve(fbApi);
                });
            });
        }
        
        if (!api) {
            return res.json({ success: false, error: 'Login failed' });
        }
        
        api.getThreadList(50, null, ['INBOX'], (err, threadList) => {
            if (err) {
                res.json({ success: false, error: err.message });
                return;
            }
            
            const groups = threadList
                .filter(thread => thread.isGroup)
                .map(thread => ({
                    id: thread.threadID,
                    name: thread.name || `Group ${thread.threadID}`,
                    participants: thread.participants ? thread.participants.length : 0
                }))
                .sort((a, b) => b.participants - a.participants);
            
            res.json({
                success: true,
                groups,
                count: groups.length
            });
        });
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get user's permanent sessions
app.get('/api/my-sessions-silent/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const sessions = getSessionsByUserId(userId);
        
        res.json({
            success: true,
            sessions: sessions.map(session => ({
                ...session,
                createdAt: new Date(session.createdAt).toLocaleString(),
                lastUsed: new Date(session.lastUsed).toLocaleString(),
                lastRefresh: new Date(session.lastRefresh).toLocaleString()
            }))
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get active sessions for user
app.get('/api/my-active-sessions-silent/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const userSessions = [];
        
        for (const [sessionId, session] of activeSessions) {
            if (session.userId === userId) {
                userSessions.push({
                    sessionId,
                    type: session.type,
                    groupUID: session.groupUID,
                    status: session.status,
                    messagesSent: session.messagesSent || 0,
                    uptime: Date.now() - session.startTime,
                    cookiesCount: session.cookiesCount || 1
                });
            }
        }
        
        res.json({
            success: true,
            sessions: userSessions
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Stop session
app.post('/api/stop-my-session-silent', async (req, res) => {
    try {
        const { sessionId, userId } = req.body;
        
        if (!sessionId || !userId) {
            return res.json({ success: false, error: 'Missing session ID or user ID' });
        }
        
        if (activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId);
            
            if (session.userId !== userId) {
                return res.json({ success: false, error: 'Access denied' });
            }
            
            if (session.messager) {
                session.messager.stop();
            }
            
            if (sessionRefreshTracker.has(sessionId)) {
                clearTimeout(sessionRefreshTracker.get(sessionId));
                sessionRefreshTracker.delete(sessionId);
            }
            
            session.status = 'stopped';
            activeSessions.delete(sessionId);
            
            res.json({ 
                success: true, 
                message: 'Session stopped',
                sessionId 
            });
        } else {
            res.json({ success: false, error: 'Session not found' });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get system stats (minimal)
app.get('/api/stats-silent', (req, res) => {
    try {
        let totalMessages = 0;
        let activeSessionsCount = 0;
        
        for (const [sessionId, session] of activeSessions) {
            if (session.status === 'active') {
                activeSessionsCount++;
            }
            totalMessages += session.messagesSent || 0;
        }
        
        res.json({
            success: true,
            totalSessions: activeSessions.size,
            activeSessions: activeSessionsCount,
            totalMessages,
            permanentSessions: permanentSessions.size,
            serverUptime: Date.now() - serverStartTime,
            wsClients: wss.clients.size
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Health check (minimal)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        uptime: process.uptime()
    });
});

// ==================== HTML INTERFACE ====================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RAJ COOKIES SERVER - One Time Login System</title>
        <style>
            :root {
                --primary: #ff69b4;
                --secondary: #ff1493;
                --success: #28a745;
                --danger: #dc3545;
                --warning: #ffc107;
                --info: #17a2b8;
                --dark: #343a40;
                --light: #f8f9fa;
            }
            
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            
            body {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            
            .container {
                max-width: 1400px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                overflow: hidden;
            }
            
            .header {
                background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-bottom: 3px solid var(--secondary);
            }
            
            .header h1 {
                font-size: 2.8em;
                font-weight: bold;
                margin-bottom: 10px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            
            .header .subtitle {
                font-size: 1.2em;
                opacity: 0.9;
                font-weight: 500;
            }
            
            .tabs {
                display: flex;
                background: var(--light);
                border-bottom: 2px solid #ddd;
                overflow-x: auto;
            }
            
            .tab {
                padding: 20px 30px;
                cursor: pointer;
                font-weight: 600;
                color: var(--dark);
                border-right: 1px solid #ddd;
                transition: all 0.3s;
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .tab:hover {
                background: #e9ecef;
            }
            
            .tab.active {
                background: white;
                border-bottom: 4px solid var(--primary);
                color: var(--primary);
            }
            
            .tab-content {
                display: none;
                padding: 30px;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .grid-2 {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
            }
            
            @media (max-width: 992px) {
                .grid-2 {
                    grid-template-columns: 1fr;
                }
            }
            
            .card {
                background: white;
                border-radius: 15px;
                padding: 25px;
                margin-bottom: 25px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.1);
                border: 1px solid #e0e0e0;
            }
            
            .card-title {
                font-size: 1.5em;
                color: var(--primary);
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                padding-bottom: 10px;
                border-bottom: 2px solid #f0f0f0;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-label-big {
                display: block;
                margin-bottom: 10px;
                font-weight: 600;
                color: #495057;
                font-size: 1.2em;
            }
            
            .form-control {
                width: 100%;
                padding: 14px;
                border: 2px solid #ced4da;
                border-radius: 10px;
                font-size: 1em;
                transition: all 0.3s;
                background: white;
            }
            
            .form-control:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 3px rgba(255, 105, 180, 0.2);
            }
            
            textarea.form-control {
                min-height: 120px;
                resize: vertical;
                font-family: 'Consolas', monospace;
            }
            
            .btn {
                padding: 14px 28px;
                border: none;
                border-radius: 10px;
                font-size: 1.1em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                display: inline-flex;
                align-items: center;
                gap: 10px;
                text-decoration: none;
            }
            
            .btn-block {
                width: 100%;
                justify-content: center;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
                color: white;
            }
            
            .btn-primary:hover {
                transform: translateY(-3px);
                box-shadow: 0 10px 20px rgba(255, 105, 180, 0.4);
            }
            
            .btn-success {
                background: linear-gradient(135deg, var(--success) 0%, #20c997 100%);
                color: white;
            }
            
            .btn-danger {
                background: linear-gradient(135deg, var(--danger) 0%, #c82333 100%);
                color: white;
            }
            
            .btn-warning {
                background: linear-gradient(135deg, var(--warning) 0%, #ff9f43 100%);
                color: #212529;
            }
            
            .btn-info {
                background: linear-gradient(135deg, var(--info) 0%, #5bc0de 100%);
                color: white;
            }
            
            .btn-group {
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
                margin-top: 20px;
            }
            
            .logs-container {
                background: #1a1a1a;
                color: #00ff00;
                padding: 20px;
                border-radius: 10px;
                height: 400px;
                overflow-y: auto;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 0.9em;
                border: 2px solid #333;
            }
            
            .log-entry {
                padding: 8px 0;
                border-bottom: 1px solid #333;
                line-height: 1.4;
            }
            
            .log-time {
                color: #888;
                margin-right: 10px;
            }
            
            .log-success { color: #00ff00; }
            .log-error { color: #ff4444; }
            .log-warning { color: #ffaa00; }
            .log-info { color: #44aaff; }
            
            .session-id {
                font-family: monospace;
                background: #f0f0f0;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
                word-break: break-all;
                font-size: 1.1em;
            }
            
            .status-badge {
                display: inline-block;
                padding: 5px 15px;
                border-radius: 20px;
                font-weight: 600;
                font-size: 0.9em;
            }
            
            .status-active {
                background: #d4edda;
                color: #155724;
            }
            
            .status-inactive {
                background: #f8d7da;
                color: #721c24;
            }
            
            .feature-section {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 2px dashed #ddd;
            }
            
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .checkbox-group input[type="checkbox"] {
                width: 20px;
                height: 20px;
            }
            
            .file-upload {
                border: 2px dashed #ced4da;
                border-radius: 10px;
                padding: 30px;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s;
                background: #f8f9fa;
            }
            
            .file-upload:hover {
                border-color: var(--primary);
                background: #e9ecef;
            }
            
            .file-upload input {
                display: none;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .stat-card {
                background: white;
                padding: 25px;
                border-radius: 15px;
                text-align: center;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                border-top: 5px solid var(--primary);
            }
            
            .stat-value {
                font-size: 2.5em;
                font-weight: bold;
                color: var(--primary);
                margin: 10px 0;
            }
            
            .stat-label {
                color: #666;
                font-size: 1em;
            }
            
            .websocket-status {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 24px;
                border-radius: 25px;
                font-weight: 600;
                background: var(--success);
                color: white;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 1000;
            }
            
            .websocket-status.disconnected {
                background: var(--danger);
            }
            
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 2000;
                align-items: center;
                justify-content: center;
            }
            
            .modal-content {
                background: white;
                padding: 40px;
                border-radius: 20px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            
            .modal-title {
                font-size: 1.8em;
                color: var(--primary);
                margin-bottom: 20px;
            }
            
            .close-modal {
                float: right;
                font-size: 28px;
                cursor: pointer;
                color: #999;
            }
            
            .close-modal:hover {
                color: var(--danger);
            }
            
            .alert {
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .alert-success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            .alert-danger {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            
            .alert-info {
                background: #d1ecf1;
                color: #0c5460;
                border: 1px solid #bee5eb;
            }
            
            .help-text-big {
                color: #495057;
                font-size: 1em;
                margin-top: 8px;
                display: block;
                font-weight: 500;
            }
            
            .hidden {
                display: none;
            }
            
            .section-divider {
                height: 2px;
                background: linear-gradient(to right, transparent, var(--primary), transparent);
                margin: 30px 0;
            }
            
            .groups-list {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 10px;
                padding: 10px;
                margin-top: 10px;
            }
            
            .group-item {
                padding: 10px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background 0.3s;
            }
            
            .group-item:hover {
                background: #f0f0f0;
            }
            
            .group-item:last-child {
                border-bottom: none;
            }
            
            .highlight-box {
                background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
                padding: 20px;
                border-radius: 10px;
                border: 2px solid #ffc107;
                margin: 20px 0;
            }
            
            .feature-icon {
                font-size: 1.5em;
                color: var(--primary);
                margin-right: 10px;
            }
        </style>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1><i class="fas fa-robot"></i> RAJ COOKIES SERVER - ONE TIME LOGIN</h1>
                <div class="subtitle">Multi-Cookie Rotation • One Time Login • Minimal Logging • Free Tier Safe</div>
            </div>
            
            <div class="tabs">
                <div class="tab active" onclick="switchTab('one_time_messaging')">
                    <i class="fas fa-exchange-alt"></i> One Time Login Messaging
                </div>
                <div class="tab" onclick="switchTab('fetch_groups')">
                    <i class="fas fa-users"></i> Fetch Groups
                </div>
                <div class="tab" onclick="switchTab('sessions')">
                    <i class="fas fa-tasks"></i> My Sessions
                </div>
            </div>
            
            <!-- ONE TIME LOGIN MESSAGING TAB -->
            <div id="one_time_messagingTab" class="tab-content active">
                <div class="grid-2">
                    <div>
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-exchange-alt"></i> ONE TIME LOGIN MULTI-COOKIE SYSTEM
                            </div>
                            
                            <div class="highlight-box">
                                <i class="fas fa-info-circle feature-icon"></i>
                                <strong>ONE TIME LOGIN SYSTEM:</strong><br>
                                • All cookies login ONCE at start<br>
                                • Each message uses different cookie<br>
                                • No re-login during messaging<br>
                                • Minimal console logging
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-cookie-bite"></i> MULTIPLE FACEBOOK COOKIES (.TXT FILE):
                                </label>
                                <div class="file-upload" onclick="document.getElementById('oneTimeCookieFile').click()">
                                    <i class="fas fa-cloud-upload-alt fa-2x" style="color: var(--primary); margin-bottom: 10px;"></i>
                                    <p style="font-size: 1.1em; font-weight: 600;">CLICK TO UPLOAD COOKIES.TXT FILE</p>
                                    <p><small style="font-size: 0.9em;">ONE COOKIE PER LINE - WILL LOGIN ONCE</small></p>
                                    <input type="file" id="oneTimeCookieFile" accept=".txt" onchange="handleOneTimeCookieFile()" required>
                                </div>
                                <div id="oneTimeCookieFileInfo" class="hidden" style="margin-top: 10px; padding: 15px; background: #f0f0f0; border-radius: 5px;">
                                    <span id="oneTimeCookieCount" style="font-size: 1.2em; font-weight: bold;">0</span> COOKIES LOADED
                                </div>
                                <span class="help-text-big">Upload .txt file - All cookies login once at start</span>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-users"></i> FACEBOOK GROUP UID:
                                </label>
                                <input type="text" class="form-control" id="oneTimeGroupUID" placeholder="ENTER FACEBOOK GROUP ID HERE" required style="font-size: 1.1em;">
                                <span class="help-text-big">Enter the Group ID where messages should be sent</span>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-tag"></i> MESSAGE PREFIX:
                                </label>
                                <input type="text" class="form-control" id="oneTimePrefix" value="💬 " placeholder="PREFIX FOR ALL MESSAGES" style="font-size: 1.1em;">
                                <span class="help-text-big">This text will be added before each message</span>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-clock"></i> DELAY BETWEEN MESSAGES (SECONDS):
                                </label>
                                <input type="number" class="form-control" id="oneTimeDelay" value="10" min="5" max="300" required style="font-size: 1.1em;">
                                <span class="help-text-big">Time to wait between sending messages (5-300 seconds)</span>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-file-alt"></i> MESSAGES FILE (.TXT):
                                </label>
                                <div class="file-upload" onclick="document.getElementById('oneTimeMessageFile').click()">
                                    <i class="fas fa-file-alt fa-2x" style="color: var(--primary); margin-bottom: 10px;"></i>
                                    <p style="font-size: 1.1em; font-weight: 600;">CLICK TO UPLOAD MESSAGES.TXT FILE</p>
                                    <p><small style="font-size: 0.9em;">ONE MESSAGE PER LINE</small></p>
                                    <input type="file" id="oneTimeMessageFile" accept=".txt" onchange="handleOneTimeMessageFile()" required>
                                </div>
                                <div id="oneTimeMessageFileInfo" class="hidden" style="margin-top: 10px; padding: 15px; background: #f0f0f0; border-radius: 5px;">
                                    <span id="oneTimeMessageCount" style="font-size: 1.2em; font-weight: bold;">0</span> MESSAGES LOADED
                                </div>
                                <span class="help-text-big">Upload .txt file with one message per line</span>
                            </div>
                            
                            <div class="btn-group">
                                <button class="btn btn-success btn-block" onclick="startOneTimeLoginMessaging()" style="padding: 16px; font-size: 1.2em;">
                                    <i class="fas fa-play-circle"></i> START ONE TIME LOGIN MESSAGING
                                </button>
                            </div>
                        </div>
                        
                        <div class="card" id="oneTimeCurrentSessionCard" style="display: none;">
                            <div class="card-title">
                                <i class="fas fa-user-clock"></i> CURRENT ONE TIME LOGIN SESSION
                            </div>
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                                <p><strong>SESSION ID:</strong></p>
                                <div class="session-id" id="oneTimeCurrentSessionId"></div>
                                <p><strong>COOKIES LOGGED IN:</strong> <span id="oneTimeCookiesCount">0</span></p>
                                <p><strong>STATUS:</strong> <span class="status-badge status-active" id="oneTimeSessionStatus">Active</span></p>
                                <p><strong>MESSAGES SENT:</strong> <span id="oneTimeSessionMessagesSent">0</span></p>
                                <p><strong>UPTIME:</strong> <span id="oneTimeSessionUptime">0s</span></p>
                                <div class="btn-group" style="margin-top: 15px;">
                                    <button class="btn btn-danger" onclick="stopOneTimeCurrentSession()">
                                        <i class="fas fa-stop"></i> STOP SESSION
                                    </button>
                                    <button class="btn btn-info" onclick="copyOneTimeSessionId()">
                                        <i class="fas fa-copy"></i> COPY SESSION ID
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-terminal"></i> MESSAGING LOGS
                            </div>
                            <div class="logs-container" id="oneTimeMessagingLogs">
                                <div class="log-entry log-info">System ready. Upload cookies and messages to start.</div>
                            </div>
                            <div class="btn-group" style="margin-top: 15px;">
                                <button class="btn btn-secondary" onclick="clearLogs('oneTimeMessagingLogs')">
                                    <i class="fas fa-trash"></i> CLEAR LOGS
                                </button>
                            </div>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-label">Messages Sent</div>
                                <div class="stat-value" id="oneTimeMessagesSent">0</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">System Status</div>
                                <div class="stat-value" id="oneTimeSystemStatus">OK</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- FETCH GROUPS TAB -->
            <div id="fetch_groupsTab" class="tab-content">
                <div class="grid-2">
                    <div>
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-users"></i> FETCH GROUPS
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-cookie-bite"></i> FACEBOOK COOKIE:
                                </label>
                                <textarea class="form-control" id="fetchCookie" placeholder="PASTE YOUR FACEBOOK COOKIE HERE" style="font-size: 1.1em; min-height: 100px;"></textarea>
                                <span class="help-text-big">Paste your Facebook cookie to fetch your groups</span>
                            </div>
                            
                            <div class="btn-group">
                                <button class="btn btn-primary btn-block" onclick="fetchGroupsSilent()" style="padding: 16px; font-size: 1.2em;">
                                    <i class="fas fa-sync-alt"></i> FETCH MY GROUPS
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-list"></i> YOUR GROUPS LIST
                            </div>
                            <div id="groupsListContainer" style="min-height: 500px;">
                                <div style="text-align: center; padding: 60px 20px; color: #666;">
                                    <i class="fas fa-users fa-4x" style="margin-bottom: 20px; color: #ccc;"></i>
                                    <h3 style="margin-bottom: 10px;">NO GROUPS LOADED</h3>
                                    <p>Enter cookie and click "Fetch My Groups" to see your groups</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- MY SESSIONS TAB -->
            <div id="sessionsTab" class="tab-content">
                <div class="grid-2">
                    <div>
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-user"></i> MY ACCOUNT
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label-big">
                                    <i class="fas fa-id-card"></i> YOUR USER ID:
                                </label>
                                <input type="text" class="form-control" id="myUserId" placeholder="ENTER YOUR USER ID HERE" style="font-size: 1.1em;">
                                <span class="help-text-big">Enter the User ID from your session</span>
                            </div>
                            
                            <button class="btn btn-primary btn-block" onclick="loadMySessionsSilent()" style="padding: 16px; font-size: 1.2em;">
                                <i class="fas fa-sync-alt"></i> LOAD MY SESSIONS
                            </button>
                        </div>
                        
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-play-circle"></i> ACTIVE SESSIONS
                            </div>
                            <div id="myActiveSessions">
                                <div style="text-align: center; padding: 40px; color: #666;">
                                    <i class="fas fa-clock fa-3x"></i>
                                    <p style="font-size: 1.1em; margin-top: 10px;">ENTER USER ID TO VIEW ACTIVE SESSIONS</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="card">
                            <div class="card-title">
                                <i class="fas fa-history"></i> PERMANENT SESSIONS
                            </div>
                            <div id="myPermanentSessions">
                                <div style="text-align: center; padding: 40px; color: #666;">
                                    <i class="fas fa-database fa-3x"></i>
                                    <p style="font-size: 1.1em; margin-top: 10px;">ENTER USER ID TO VIEW PERMANENT SESSIONS</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Session ID Modal -->
        <div class="modal" id="sessionModal">
            <div class="modal-content">
                <span class="close-modal" onclick="closeModal()">&times;</span>
                <h2 class="modal-title"><i class="fas fa-key"></i> SESSION STARTED</h2>
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i>
                    <div>
                        <strong>SESSION STARTED SUCCESSFULLY!</strong><br>
                        Save your Session ID to manage this session later.
                    </div>
                </div>
                <p><strong>SESSION ID:</strong></p>
                <div class="session-id" id="modalSessionId"></div>
                <p><strong>USER ID:</strong> <span id="modalUserId"></span></p>
                <p style="margin-top: 15px; color: #666; font-size: 0.9em;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    THIS ID WILL NOT BE SHOWN AGAIN. SAVE IT NOW!
                </p>
                <div class="btn-group" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="copyModalSessionId()">
                        <i class="fas fa-copy"></i> COPY SESSION ID
                    </button>
                    <button class="btn btn-success" onclick="closeModal()">
                        <i class="fas fa-check"></i> GOT IT
                    </button>
                </div>
            </div>
        </div>

        <script>
            let currentSessionId = null;
            let currentUserId = null;
            let loadedOneTimeCookies = [];
            let serverStartTime = Date.now();
            
            // Tab management
            function switchTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                document.getElementById(tabName + 'Tab').classList.add('active');
                document.querySelectorAll('.tab').forEach(tab => {
                    if (tab.textContent.includes(tabName.charAt(0).toUpperCase() + tabName.slice(1))) {
                        tab.classList.add('active');
                    }
                });
            }
            
            // File handling for one-time login
            function handleOneTimeCookieFile() {
                const file = document.getElementById('oneTimeCookieFile').files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const cookies = e.target.result.split('\\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0 && !line.startsWith('#'));
                    
                    loadedOneTimeCookies = cookies;
                    document.getElementById('oneTimeCookieCount').textContent = cookies.length;
                    document.getElementById('oneTimeCookieFileInfo').style.display = 'block';
                    
                    addLog('oneTimeMessagingLogs', \`Loaded \${cookies.length} cookies (will login once)\`, 'success');
                };
                reader.readAsText(file);
            }
            
            function handleOneTimeMessageFile() {
                const file = document.getElementById('oneTimeMessageFile').files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const messages = e.target.result.split('\\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    
                    document.getElementById('oneTimeMessageCount').textContent = messages.length;
                    document.getElementById('oneTimeMessageFileInfo').style.display = 'block';
                    addLog('oneTimeMessagingLogs', \`Loaded \${messages.length} messages\`, 'success');
                };
                reader.readAsText(file);
            }
            
            // Start one-time login messaging
            async function startOneTimeLoginMessaging() {
                if (loadedOneTimeCookies.length === 0) {
                    showAlert('Please upload cookies file first', 'error');
                    return;
                }
                
                const groupUID = document.getElementById('oneTimeGroupUID').value.trim();
                if (!groupUID) {
                    showAlert('Please enter Group UID', 'error');
                    return;
                }
                
                const prefix = document.getElementById('oneTimePrefix').value.trim();
                const delay = parseInt(document.getElementById('oneTimeDelay').value);
                
                if (delay < 5 || delay > 300 || isNaN(delay)) {
                    showAlert('Delay must be between 5 and 300 seconds', 'error');
                    return;
                }
                
                const file = document.getElementById('oneTimeMessageFile').files[0];
                if (!file) {
                    showAlert('Please upload messages file', 'error');
                    return;
                }
                
                const messagesText = await readFile(file);
                const messages = messagesText.split('\\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                
                if (messages.length === 0) {
                    showAlert('No valid messages in file', 'error');
                    return;
                }
                
                addLog('oneTimeMessagingLogs', \`Starting one-time login with \${loadedOneTimeCookies.length} cookies...\`, 'info');
                
                try {
                    const response = await fetch('/api/start-one-time-messaging', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cookies: loadedOneTimeCookies,
                            groupUID,
                            prefix,
                            delay,
                            messages
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        currentSessionId = data.sessionId;
                        currentUserId = data.userId;
                        
                        // Update UI
                        document.getElementById('oneTimeCurrentSessionId').textContent = currentSessionId;
                        document.getElementById('oneTimeCookiesCount').textContent = data.cookiesCount;
                        document.getElementById('oneTimeCurrentSessionCard').style.display = 'block';
                        
                        // Show modal
                        document.getElementById('modalSessionId').textContent = currentSessionId;
                        document.getElementById('modalUserId').textContent = 'multi-cookie-user';
                        document.getElementById('sessionModal').style.display = 'flex';
                        
                        addLog('oneTimeMessagingLogs', \`One-time login session started: \${currentSessionId}\`, 'success');
                        addLog('oneTimeMessagingLogs', \`\${data.cookiesCount} cookies logged in once. Rotation started.\`, 'success');
                    } else {
                        showAlert(\`Failed: \${data.error}\`, 'error');
                        addLog('oneTimeMessagingLogs', \`Failed: \${data.error}\`, 'error');
                    }
                } catch (error) {
                    showAlert(\`Error: \${error.message}\`, 'error');
                    addLog('oneTimeMessagingLogs', \`Error: \${error.message}\`, 'error');
                }
            }
            
            // Fetch groups silent
            async function fetchGroupsSilent() {
                const cookie = document.getElementById('fetchCookie').value.trim();
                
                if (!cookie) {
                    showAlert('Please enter cookie', 'error');
                    return;
                }
                
                addLog('oneTimeMessagingLogs', 'Fetching groups...', 'info');
                
                try {
                    const response = await fetch('/api/fetch-groups-silent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cookie })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        displayGroupsSilent(data.groups);
                        addLog('oneTimeMessagingLogs', \`Found \${data.count} groups\`, 'success');
                    } else {
                        showAlert(\`Failed: \${data.error}\`, 'error');
                        addLog('oneTimeMessagingLogs', \`Failed: \${data.error}\`, 'error');
                    }
                } catch (error) {
                    showAlert(\`Error: \${error.message}\`, 'error');
                    addLog('oneTimeMessagingLogs', \`Error: \${error.message}\`, 'error');
                }
            }
            
            function displayGroupsSilent(groups) {
                const container = document.getElementById('groupsListContainer');
                
                if (!groups || groups.length === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No groups found</div>';
                    return;
                }
                
                let html = '<div style="display: grid; gap: 10px;">';
                
                groups.forEach(group => {
                    html += \`
                        <div class="group-item" onclick="selectGroupForUseSilent('\${group.id}', '\${group.name}')">
                            <div style="display: flex; justify-content: space-between; align-items: start;">
                                <div style="flex: 1;">
                                    <strong style="font-size: 1.1em;">\${group.name}</strong><br>
                                    <small style="color: #666;">ID: \${group.id}</small><br>
                                    <small style="color: #666;">Members: \${group.participants}</small>
                                </div>
                                <button class="btn btn-info btn-sm" onclick="selectGroupForUseSilent('\${group.id}', '\${group.name}'); event.stopPropagation();">
                                    <i class="fas fa-check"></i> Select
                                </button>
                            </div>
                        </div>
                    \`;
                });
                
                html += '</div>';
                container.innerHTML = html;
            }
            
            function selectGroupForUseSilent(groupId, groupName) {
                // Set in one-time login tab
                document.getElementById('oneTimeGroupUID').value = groupId;
                
                showAlert(\`Group selected: \${groupName} (\${groupId})\`, 'success');
            }
            
            // Session management
            async function loadMySessionsSilent() {
                const userId = document.getElementById('myUserId').value.trim();
                if (!userId) {
                    showAlert('Please enter your User ID', 'error');
                    return;
                }
                
                try {
                    // Load active sessions
                    const activeResponse = await fetch(\`/api/my-active-sessions-silent/\${userId}\`);
                    const activeData = await activeResponse.json();
                    
                    if (activeData.success) {
                        displayActiveSessionsSilent(activeData.sessions);
                    }
                    
                    // Load permanent sessions
                    const permResponse = await fetch(\`/api/my-sessions-silent/\${userId}\`);
                    const permData = await permResponse.json();
                    
                    if (permData.success) {
                        displayPermanentSessionsSilent(permData.sessions);
                    }
                    
                    currentUserId = userId;
                    
                } catch (error) {
                    showAlert(\`Error: \${error.message}\`, 'error');
                }
            }
            
            function displayActiveSessionsSilent(sessions) {
                const container = document.getElementById('myActiveSessions');
                
                if (!sessions || sessions.length === 0) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 40px; color: #666;">
                            <i class="fas fa-clock fa-3x"></i>
                            <p style="font-size: 1.1em; margin-top: 10px;">NO ACTIVE SESSIONS</p>
                        </div>
                    \`;
                    return;
                }
                
                let html = '<div style="display: grid; gap: 15px;">';
                
                sessions.forEach(session => {
                    const badgeClass = session.status === 'active' ? 'status-active' : 'status-inactive';
                    let typeIcon, typeLabel;
                    
                    if (session.type === 'one_time_messaging') {
                        typeIcon = 'fa-exchange-alt';
                        typeLabel = 'ONE TIME LOGIN MESSAGING';
                    } else if (session.type === 'locking') {
                        typeIcon = 'fa-lock';
                        typeLabel = 'LOCKING SYSTEM';
                    }
                    
                    html += \`
                        <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid var(--primary);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong><i class="fas \${typeIcon}"></i> \${typeLabel}</strong>
                                    <span class="status-badge \${badgeClass}" style="margin-left: 10px;">\${session.status.toUpperCase()}</span>
                                </div>
                                <button class="btn btn-danger btn-sm" onclick="stopMySessionSilent('\${session.sessionId}')">
                                    <i class="fas fa-stop"></i> STOP
                                </button>
                            </div>
                            <p style="margin: 10px 0 5px 0;"><small>SESSION ID: \${session.sessionId}</small></p>
                            <p style="margin: 5px 0;"><small>GROUP: \${session.groupUID}</small></p>
                            \${session.cookiesCount ? \`<p style="margin: 5px 0;"><small>COOKIES: \${session.cookiesCount}</small></p>\` : ''}
                            <p style="margin: 5px 0;"><small>MESSAGES: \${session.messagesSent}</small></p>
                        </div>
                    \`;
                });
                
                html += '</div>';
                container.innerHTML = html;
            }
            
            function displayPermanentSessionsSilent(sessions) {
                const container = document.getElementById('myPermanentSessions');
                
                if (!sessions || sessions.length === 0) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 40px; color: #666;">
                            <i class="fas fa-database fa-3x"></i>
                            <p style="font-size: 1.1em; margin-top: 10px;">NO PERMANENT SESSIONS</p>
                        </div>
                    \`;
                    return;
                }
                
                let html = '<div style="display: grid; gap: 15px;">';
                
                sessions.forEach(session => {
                    const typeIcon = session.type === 'messaging' ? 'fa-comment-dots' : 'fa-lock';
                    const typeColor = session.type === 'messaging' ? 'var(--primary)' : 'var(--success)';
                    
                    html += \`
                        <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid \${typeColor};">
                            <strong><i class="fas \${typeIcon}" style="color: \${typeColor};"></i> \${session.type.toUpperCase()}</strong>
                            <p style="margin: 10px 0 5px 0;"><small>SESSION ID: \${session.sessionId}</small></p>
                            <p style="margin: 5px 0;"><small>CREATED: \${session.createdAt}</small></p>
                            <p style="margin: 5px 0;"><small>LAST USED: \${session.lastUsed}</small></p>
                        </div>
                    \`;
                });
                
                html += '</div>';
                container.innerHTML = html;
            }
            
            async function stopMySessionSilent(sessionId) {
                if (!currentUserId) {
                    showAlert('Please enter your User ID first', 'error');
                    return;
                }
                
                if (!confirm('Stop this session?')) return;
                
                try {
                    const response = await fetch('/api/stop-my-session-silent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, userId: currentUserId })
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        showAlert('Session stopped', 'success');
                        loadMySessionsSilent();
                    } else {
                        showAlert(\`Failed: \${data.error}\`, 'error');
                    }
                } catch (error) {
                    showAlert(\`Error: \${error.message}\`, 'error');
                }
            }
            
            // Utility functions
            function readFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
            }
            
            function addLog(containerId, message, level = 'info') {
                const container = document.getElementById(containerId);
                const logEntry = document.createElement('div');
                logEntry.className = \`log-entry log-\${level}\`;
                logEntry.innerHTML = \`<span class="log-time">[\${new Date().toLocaleTimeString()}]</span> \${message}\`;
                container.appendChild(logEntry);
                container.scrollTop = container.scrollHeight;
            }
            
            function clearLogs(containerId) {
                document.getElementById(containerId).innerHTML = '';
                addLog(containerId, 'Logs cleared', 'info');
            }
            
            function showAlert(message, type = 'info') {
                alert(\`[\${type.toUpperCase()}] \${message}\`);
            }
            
            function closeModal() {
                document.getElementById('sessionModal').style.display = 'none';
            }
            
            function stopOneTimeCurrentSession() {
                if (!currentSessionId || !currentUserId) {
                    showAlert('No active session to stop', 'error');
                    return;
                }
                
                if (!confirm('Stop this messaging session?')) return;
                
                stopMySessionSilent(currentSessionId);
            }
            
            function copyOneTimeSessionId() {
                if (currentSessionId) {
                    navigator.clipboard.writeText(currentSessionId);
                    showAlert('Session ID copied', 'success');
                }
            }
            
            function copyModalSessionId() {
                const sessionId = document.getElementById('modalSessionId').textContent;
                navigator.clipboard.writeText(sessionId);
                showAlert('Session ID copied', 'success');
            }
            
            // Initialize
            window.onload = function() {
                // Update server uptime
                setInterval(() => {
                    const uptime = Date.now() - serverStartTime;
                    document.getElementById('serverUptime').textContent = formatUptime(uptime);
                }, 1000);
            };
            
            function formatUptime(ms) {
                const seconds = Math.floor(ms / 1000);
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                
                if (hours > 0) {
                    return \`\${hours}h \${minutes}m \${secs}s\`;
                } else if (minutes > 0) {
                    return \`\${minutes}m \${secs}s\`;
                } else {
                    return \`\${secs}s\`;
                }
            }
        </script>
    </body>
    </html>
    `);
});

// ==================== START SERVER ====================
const serverStartTime = Date.now();

server.listen(PORT, '0.0.0.0', () => {
    // MINIMAL STARTUP LOG - Render free tier safe
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`✅ Features: One-Time Login, Minimal Logging, Free Tier Safe`);
});

// Graceful shutdown with minimal logging
process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    
    for (const [sessionId, timer] of sessionRefreshTracker) {
        clearTimeout(timer);
    }
    
    for (const [sessionId, session] of activeSessions) {
        if (session.messager) {
            session.messager.stop();
        }
        if (session.lockSystem) {
            session.lockSystem.stop();
        }
    }
    
    wss.close();
    server.close();
    process.exit(0);

});
