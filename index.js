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
               
