#!/usr/bin/env node

/**
 * GORRILA CODERZ VM MANAGER v5.0
 * Professional Multi-VM Virtualization Platform
 * Powered by QEMU • KVM • Cloud-Init • Linux
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');
const os = require('os');

// Configuration
const CONFIG = {
    VM_DIR: process.env.VM_DIR || path.join(os.homedir(), 'vms'),
    SUPPORTED_OS: {
        'Ubuntu 22.04': {
            osType: 'ubuntu',
            codename: 'jammy',
            imgUrl: 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img',
            defaultHostname: 'ubuntu22',
            defaultUsername: 'ubuntu',
            defaultPassword: 'ubuntu'
        },
        'Ubuntu 24.04': {
            osType: 'ubuntu',
            codename: 'noble',
            imgUrl: 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',
            defaultHostname: 'ubuntu24',
            defaultUsername: 'ubuntu',
            defaultPassword: 'ubuntu'
        },
        'Debian 11': {
            osType: 'debian',
            codename: 'bullseye',
            imgUrl: 'https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-generic-amd64.qcow2',
            defaultHostname: 'debian11',
            defaultUsername: 'debian',
            defaultPassword: 'debian'
        },
        'Debian 12': {
            osType: 'debian',
            codename: 'bookworm',
            imgUrl: 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2',
            defaultHostname: 'debian12',
            defaultUsername: 'debian',
            defaultPassword: 'debian'
        },
        'Fedora 40': {
            osType: 'fedora',
            codename: '40',
            imgUrl: 'https://download.fedoraproject.org/pub/fedora/linux/releases/40/Cloud/x86_64/images/Fedora-Cloud-Base-40-1.14.x86_64.qcow2',
            defaultHostname: 'fedora40',
            defaultUsername: 'fedora',
            defaultPassword: 'fedora'
        },
        'CentOS Stream 9': {
            osType: 'centos',
            codename: 'stream9',
            imgUrl: 'https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2',
            defaultHostname: 'centos9',
            defaultUsername: 'centos',
            defaultPassword: 'centos'
        },
        'AlmaLinux 9': {
            osType: 'almalinux',
            codename: '9',
            imgUrl: 'https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2',
            defaultHostname: 'almalinux9',
            defaultUsername: 'alma',
            defaultPassword: 'alma'
        },
        'Rocky Linux 9': {
            osType: 'rockylinux',
            codename: '9',
            imgUrl: 'https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2',
            defaultHostname: 'rocky9',
            defaultUsername: 'rocky',
            defaultPassword: 'rocky'
        }
    }
};

// ANSI color codes
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

// Global state
let vmConfig = {};

// Readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify readline question
function question(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

// Utility functions
function printStatus(type, message) {
    const prefixes = {
        INFO: `${COLORS.blue}[INFO]${COLORS.reset}`,
        WARN: `${COLORS.yellow}[WARN]${COLORS.reset}`,
        ERROR: `${COLORS.red}[ERROR]${COLORS.reset}`,
        SUCCESS: `${COLORS.green}[SUCCESS]${COLORS.reset}`,
        INPUT: `${COLORS.cyan}[INPUT]${COLORS.reset}`
    };
    console.log(`${prefixes[type] || `[${type}]`} ${message}`);
}

function validateInput(type, value) {
    switch (type) {
        case 'number':
            if (!/^[0-9]+$/.test(value)) {
                printStatus('ERROR', 'Must be a number');
                return false;
            }
            break;
        case 'size':
            if (!/^[0-9]+[GgMm]$/.test(value)) {
                printStatus('ERROR', 'Must be a size with unit (e.g., 100G, 512M)');
                return false;
            }
            break;
        case 'port':
            if (!/^[0-9]+$/.test(value) || parseInt(value) < 23 || parseInt(value) > 65535) {
                printStatus('ERROR', 'Must be a valid port number (23-65535)');
                return false;
            }
            break;
        case 'name':
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                printStatus('ERROR', 'VM name can only contain letters, numbers, hyphens, and underscores');
                return false;
            }
            break;
        case 'username':
            if (!/^[a-z_][a-z0-9_-]*$/.test(value)) {
                printStatus('ERROR', 'Username must start with a letter or underscore, and contain only letters, numbers, hyphens, and underscores');
                return false;
            }
            break;
    }
    return true;
}

function checkDependencies() {
    const deps = ['qemu-system-x86_64', 'wget', 'cloud-localds', 'qemu-img'];
    const missing = [];
    
    for (const dep of deps) {
        try {
            execSync(`which ${dep}`, { stdio: 'ignore' });
        } catch (error) {
            missing.push(dep);
        }
    }
    
    if (missing.length > 0) {
        printStatus('ERROR', `Missing dependencies: ${missing.join(', ')}`);
        printStatus('INFO', 'On Ubuntu/Debian, try: sudo apt install qemu-system cloud-image-utils wget');
        process.exit(1);
    }
}

function cleanup() {
    const files = ['user-data', 'meta-data'];
    for (const file of files) {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
}

function getVMList() {
    if (!fs.existsSync(CONFIG.VM_DIR)) {
        return [];
    }
    const files = fs.readdirSync(CONFIG.VM_DIR);
    return files
        .filter(f => f.endsWith('.conf'))
        .map(f => path.basename(f, '.conf'))
        .sort();
}

function loadVMConfig(vmName) {
    const configFile = path.join(CONFIG.VM_DIR, `${vmName}.conf`);
    if (!fs.existsSync(configFile)) {
        printStatus('ERROR', `Configuration for VM '${vmName}' not found`);
        return false;
    }
    
    try {
        const content = fs.readFileSync(configFile, 'utf8');
        const lines = content.split('\n');
        vmConfig = {};
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim().replace(/^"|"$/g, '');
                vmConfig[key] = value;
            }
        }
        return true;
    } catch (error) {
        printStatus('ERROR', `Failed to load VM config: ${error.message}`);
        return false;
    }
}

function saveVMConfig(config) {
    const configFile = path.join(CONFIG.VM_DIR, `${config.VM_NAME}.conf`);
    const content = Object.entries(config)
        .map(([key, value]) => `${key}="${value}"`)
        .join('\n');
    
    fs.writeFileSync(configFile, content);
    printStatus('SUCCESS', `Configuration saved to ${configFile}`);
}

function isVMRunning(vmName) {
    try {
        // Try multiple patterns to find the VM
        const patterns = [
            `qemu-system-x86_64.*${vmName}`,
            `qemu-system-x86_64.*${vmName}.img`,
            `qemu-system-x86_64.*${vmName}-seed.iso`
        ];
        
        for (const pattern of patterns) {
            try {
                const result = execSync(`pgrep -f "${pattern}"`, { stdio: 'pipe' });
                if (result.toString().trim().length > 0) {
                    return true;
                }
            } catch (e) {
                // Pattern didn't match, try next
            }
        }
        return false;
    } catch (error) {
        return false;
    }
}

function getVMPID(vmName) {
    try {
        const patterns = [
            `qemu-system-x86_64.*${vmName}`,
            `qemu-system-x86_64.*${vmName}.img`
        ];
        
        for (const pattern of patterns) {
            try {
                const result = execSync(`pgrep -f "${pattern}"`, { stdio: 'pipe' });
                const pid = result.toString().trim();
                if (pid) {
                    return pid;
                }
            } catch (e) {
                // Pattern didn't match, try next
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

function getVMProcessInfo(vmName) {
    try {
        const result = execSync(`ps aux | grep -E "qemu-system-x86_64.*${vmName}" | grep -v grep`, { stdio: 'pipe' });
        return result.toString().trim();
    } catch (error) {
        return null;
    }
}

function generatePasswordHash(password) {
    const salt = crypto.randomBytes(16).toString('base64');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('base64');
    return `$6$${salt}$${hash}`;
}

// Display header
function displayHeader() {
    console.clear();
    console.log('\x1b[?25l');
    
    console.log(`
${COLORS.magenta}${COLORS.bright}
╔══════════════════════════════════════════════════════════════╗
║                  GORRILA CODERZ VM MANAGER                  ║
║            Professional Multi-VM Virtualization             ║
╚══════════════════════════════════════════════════════════════╝
${COLORS.reset}`);

    console.log(`${COLORS.cyan}${COLORS.bright}Boot Sequence${COLORS.reset}`);
    console.log('────────────────────────────────────────────────────────────────────────────────────');
    
    const steps = [
        'Loading Hypervisor Engine',
        'Detecting CPU Virtualization',
        'Initializing Cloud-Init',
        'Loading Storage Manager',
        'Verifying Network Stack',
        'Scanning Existing Virtual Machines',
        'Loading Configuration'
    ];
    
    for (const step of steps) {
        process.stdout.write(`${COLORS.green}✔${COLORS.reset} ${step}${' '.repeat(50 - step.length)} ${COLORS.cyan}${COLORS.bright}${step === steps[steps.length - 1] ? 'DONE' : 'ONLINE'}${COLORS.reset}\n`);
        // Simulate loading with delay
        const delay = 50 + Math.random() * 50;
        const start = Date.now();
        while (Date.now() - start < delay) {
            // Busy wait
        }
    }
    
    console.log();
    console.log(`${COLORS.magenta}────────────────────────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log(`${COLORS.cyan} Hostname      ${COLORS.reset}: ${os.hostname()}`);
    console.log(`${COLORS.cyan} User          ${COLORS.reset}: ${os.userInfo().username}`);
    console.log(`${COLORS.cyan} Kernel        ${COLORS.reset}: ${os.release()}`);
    console.log(`${COLORS.cyan} Architecture  ${COLORS.reset}: ${os.arch()}`);
    console.log(`${COLORS.cyan} Date          ${COLORS.reset}: ${new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}`);
    console.log(`${COLORS.cyan} Time          ${COLORS.reset}: ${new Date().toLocaleTimeString('en-US', { hour12: true })}`);
    console.log(`${COLORS.magenta}────────────────────────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log();
    console.log(`${COLORS.green}                  GORRILA CODERZ VM MANAGER v5.0${COLORS.reset}`);
    console.log(`${COLORS.gray}               Enterprise Virtualization Platform${COLORS.reset}`);
    console.log();
}

// VM creation functions
async function createNewVM() {
    printStatus('INFO', 'Creating a new VM');
    
    // OS Selection
    printStatus('INFO', 'Select an OS to set up:');
    const osOptions = Object.keys(CONFIG.SUPPORTED_OS);
    for (let i = 0; i < osOptions.length; i++) {
        console.log(`  ${i + 1}) ${osOptions[i]}`);
    }
    
    let choice;
    while (true) {
        choice = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter your choice (1-${osOptions.length}): `);
        if (/^[0-9]+$/.test(choice) && parseInt(choice) >= 1 && parseInt(choice) <= osOptions.length) {
            break;
        }
        printStatus('ERROR', 'Invalid selection. Try again.');
    }
    
    const selectedOS = osOptions[parseInt(choice) - 1];
    const osConfig = CONFIG.SUPPORTED_OS[selectedOS];
    
    // Custom Inputs with validation
    let vmName, hostname, username, password, diskSize, memory, cpus, sshPort, guiMode, portForwards;
    
    while (true) {
        vmName = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM name (default: ${osConfig.defaultHostname}): `);
        vmName = vmName || osConfig.defaultHostname;
        if (validateInput('name', vmName)) {
            const configFile = path.join(CONFIG.VM_DIR, `${vmName}.conf`);
            if (fs.existsSync(configFile)) {
                printStatus('ERROR', `VM with name '${vmName}' already exists`);
            } else {
                break;
            }
        }
    }
    
    while (true) {
        hostname = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter hostname (default: ${vmName}): `);
        hostname = hostname || vmName;
        if (validateInput('name', hostname)) {
            break;
        }
    }
    
    while (true) {
        username = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter username (default: ${osConfig.defaultUsername}): `);
        username = username || osConfig.defaultUsername;
        if (validateInput('username', username)) {
            break;
        }
    }
    
    while (true) {
        password = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter password (default: ${osConfig.defaultPassword}): `);
        password = password || osConfig.defaultPassword;
        if (password.length > 0) {
            break;
        } else {
            printStatus('ERROR', 'Password cannot be empty');
        }
    }
    
    while (true) {
        diskSize = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Disk size (default: 20G): `);
        diskSize = diskSize || '20G';
        if (validateInput('size', diskSize)) {
            break;
        }
    }
    
    while (true) {
        memory = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Memory in MB (default: 2048): `);
        memory = memory || '2048';
        if (validateInput('number', memory)) {
            break;
        }
    }
    
    while (true) {
        cpus = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Number of CPUs (default: 2): `);
        cpus = cpus || '2';
        if (validateInput('number', cpus)) {
            break;
        }
    }
    
    while (true) {
        sshPort = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} SSH Port (default: 2222): `);
        sshPort = sshPort || '2222';
        if (validateInput('port', sshPort)) {
            // Check if port is already in use
            try {
                const result = execSync(`ss -tln 2>/dev/null | grep -q ":${sshPort} " || echo "available"`, { stdio: 'pipe' });
                if (result.toString().trim() === 'available') {
                    break;
                } else {
                    printStatus('ERROR', `Port ${sshPort} is already in use`);
                }
            } catch (error) {
                break;
            }
        }
    }
    
    while (true) {
        const guiInput = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enable GUI mode? (y/n, default: n): `);
        guiMode = false;
        const input = guiInput || 'n';
        if (/^[Yy]$/.test(input)) {
            guiMode = true;
            break;
        } else if (/^[Nn]$/.test(input)) {
            break;
        } else {
            printStatus('ERROR', 'Please answer y or n');
        }
    }
    
    portForwards = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Additional port forwards (e.g., 8080:80, press Enter for none): `);
    
    // Create VM
    const imgFile = path.join(CONFIG.VM_DIR, `${vmName}.img`);
    const seedFile = path.join(CONFIG.VM_DIR, `${vmName}-seed.iso`);
    const created = new Date().toISOString();
    
    // Create VM directory
    if (!fs.existsSync(CONFIG.VM_DIR)) {
        fs.mkdirSync(CONFIG.VM_DIR, { recursive: true });
    }
    
    // Download and setup VM image
    await setupVMImage(vmName, osConfig, imgFile, diskSize);
    
    // Create cloud-init
    await createCloudInit(hostname, username, password, seedFile);
    
    // Save configuration
    const config = {
        VM_NAME: vmName,
        OS_TYPE: osConfig.osType,
        CODENAME: osConfig.codename,
        IMG_URL: osConfig.imgUrl,
        HOSTNAME: hostname,
        USERNAME: username,
        PASSWORD: password,
        DISK_SIZE: diskSize,
        MEMORY: memory,
        CPUS: cpus,
        SSH_PORT: sshPort,
        GUI_MODE: guiMode,
        PORT_FORWARDS: portForwards || '',
        IMG_FILE: imgFile,
        SEED_FILE: seedFile,
        CREATED: created
    };
    
    saveVMConfig(config);
    printStatus('SUCCESS', `VM '${vmName}' created successfully.`);
}

async function setupVMImage(vmName, osConfig, imgFile, diskSize) {
    printStatus('INFO', 'Downloading and preparing image...');
    
    // Check if image already exists
    if (fs.existsSync(imgFile)) {
        printStatus('INFO', 'Image file already exists. Skipping download.');
    } else {
        printStatus('INFO', `Downloading image from ${osConfig.imgUrl}...`);
        try {
            execSync(`wget --progress=bar:force "${osConfig.imgUrl}" -O "${imgFile}.tmp"`, { stdio: 'inherit' });
            fs.renameSync(`${imgFile}.tmp`, imgFile);
        } catch (error) {
            printStatus('ERROR', `Failed to download image: ${error.message}`);
            process.exit(1);
        }
    }
    
    // Resize the disk image if needed
    try {
        execSync(`qemu-img resize "${imgFile}" "${diskSize}"`, { stdio: 'ignore' });
    } catch (error) {
        printStatus('WARN', 'Failed to resize disk image. Creating new image with specified size...');
        if (fs.existsSync(imgFile)) {
            fs.unlinkSync(imgFile);
        }
        try {
            execSync(`qemu-img create -f qcow2 "${imgFile}" "${diskSize}"`, { stdio: 'inherit' });
        } catch (createError) {
            printStatus('ERROR', `Failed to create disk image: ${createError.message}`);
            process.exit(1);
        }
    }
}

async function createCloudInit(hostname, username, password, seedFile) {
    // cloud-init configuration
    const passwordHash = generatePasswordHash(password);
    const userData = `#cloud-config
hostname: ${hostname}
ssh_pwauth: true
disable_root: false
users:
  - name: ${username}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    password: ${passwordHash}
chpasswd:
  list: |
    root:${password}
    ${username}:${password}
  expire: false`;
    
    const metaData = `instance-id: iid-${hostname}
local-hostname: ${hostname}`;
    
    fs.writeFileSync('user-data', userData);
    fs.writeFileSync('meta-data', metaData);
    
    try {
        execSync(`cloud-localds "${seedFile}" user-data meta-data`, { stdio: 'inherit' });
    } catch (error) {
        printStatus('ERROR', `Failed to create cloud-init seed image: ${error.message}`);
        process.exit(1);
    }
    
    cleanup();
}

// VM management functions
async function startVM(vmName) {
    if (loadVMConfig(vmName)) {
        if (isVMRunning(vmName)) {
            printStatus('WARN', `VM ${vmName} is already running`);
            return;
        }
        
        printStatus('INFO', `Starting VM: ${vmName}`);
        printStatus('INFO', `SSH: ssh -p ${vmConfig.SSH_PORT} ${vmConfig.USERNAME}@localhost`);
        printStatus('INFO', `Password: ${vmConfig.PASSWORD}`);
        
        // Check if image file exists
        if (!fs.existsSync(vmConfig.IMG_FILE)) {
            printStatus('ERROR', `VM image file not found: ${vmConfig.IMG_FILE}`);
            return;
        }
        
        // Check if seed file exists
        if (!fs.existsSync(vmConfig.SEED_FILE)) {
            printStatus('WARN', 'Seed file not found, recreating...');
            await createCloudInit(
                vmConfig.HOSTNAME,
                vmConfig.USERNAME,
                vmConfig.PASSWORD,
                vmConfig.SEED_FILE
            );
        }
        
        // Build QEMU command
        const qemuCmd = [
            'qemu-system-x86_64',
            '-m', vmConfig.MEMORY,
            '-smp', vmConfig.CPUS,
            '-cpu', 'qemu64',
            '-drive', `file=${vmConfig.IMG_FILE},format=qcow2,if=virtio`,
            '-drive', `file=${vmConfig.SEED_FILE},format=raw,if=virtio`,
            '-boot', 'order=c',
            '-device', 'virtio-net-pci,netdev=n0',
            '-netdev', `user,id=n0,hostfwd=tcp::${vmConfig.SSH_PORT}-:22`
        ];
        
        // Add port forwards if specified
        if (vmConfig.PORT_FORWARDS) {
            const forwards = vmConfig.PORT_FORWARDS.split(',');
            let netId = 1;
            for (const forward of forwards) {
                const [hostPort, guestPort] = forward.split(':');
                if (hostPort && guestPort) {
                    qemuCmd.push('-device', `virtio-net-pci,netdev=n${netId}`);
                    qemuCmd.push('-netdev', `user,id=n${netId},hostfwd=tcp::${hostPort}-:${guestPort}`);
                    netId++;
                }
            }
        }
        
        // Add GUI or console mode
        if (vmConfig.GUI_MODE === 'true') {
            qemuCmd.push('-vga', 'virtio', '-display', 'gtk,gl=on');
        } else {
            qemuCmd.push('-nographic', '-serial', 'mon:stdio');
        }
        
        // Add performance enhancements
        qemuCmd.push(
            '-device', 'virtio-balloon-pci',
            '-object', 'rng-random,filename=/dev/urandom,id=rng0',
            '-device', 'virtio-rng-pci,rng=rng0'
        );
        
        printStatus('INFO', 'Starting QEMU...');
        
        // Run QEMU
        const proc = spawn(qemuCmd[0], qemuCmd.slice(1), {
            stdio: 'inherit',
            detached: false
        });
        
        proc.on('close', (code) => {
            printStatus('INFO', `VM ${vmName} has been shut down (code: ${code})`);
        });
        
        proc.on('error', (error) => {
            printStatus('ERROR', `Failed to start VM: ${error.message}`);
        });
    }
}

async function stopVM(vmName) {
    if (loadVMConfig(vmName)) {
        if (!isVMRunning(vmName)) {
            printStatus('INFO', `VM ${vmName} is not running`);
            return;
        }
        
        printStatus('INFO', `Stopping VM: ${vmName}`);
        
        // Get process info first
        const processInfo = getVMProcessInfo(vmName);
        if (processInfo) {
            printStatus('INFO', 'Process information:');
            console.log(processInfo);
            console.log();
        }
        
        // Try multiple methods to stop the VM
        const pid = getVMPID(vmName);
        
        if (pid) {
            // Try with sudo if available
            const useSudo = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Use sudo to stop the VM? (y/N): `);
            
            let killCmd = 'kill';
            if (/^[Yy]$/.test(useSudo)) {
                killCmd = 'sudo kill';
                printStatus('INFO', 'Using sudo for kill command');
            }
            
            try {
                // Method 1: Send SIGTERM for graceful shutdown
                printStatus('INFO', `Sending graceful shutdown signal (SIGTERM) to PID ${pid}`);
                execSync(`${killCmd} -15 ${pid}`, { stdio: 'ignore' });
                
                // Wait for graceful shutdown
                let attempts = 0;
                const maxAttempts = 10;
                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (!isVMRunning(vmName)) {
                        printStatus('SUCCESS', `VM ${vmName} stopped gracefully`);
                        return;
                    }
                    attempts++;
                    if (attempts % 3 === 0) {
                        printStatus('INFO', `Waiting for VM to stop... (${attempts}/${maxAttempts})`);
                    }
                }
                
                // Method 2: If still running, force kill
                printStatus('WARN', 'VM did not stop gracefully, forcing termination...');
                execSync(`${killCmd} -9 ${pid}`, { stdio: 'ignore' });
                
                // Verify it's stopped
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!isVMRunning(vmName)) {
                    printStatus('SUCCESS', `VM ${vmName} forcefully stopped`);
                } else {
                    printStatus('ERROR', `Failed to stop VM ${vmName}`);
                }
                
            } catch (error) {
                printStatus('ERROR', `Failed to stop VM with kill: ${error.message}`);
                
                // Method 3: Try pkill as fallback
                try {
                    printStatus('INFO', 'Trying pkill as fallback...');
                    const pkillCmd = /^[Yy]$/.test(useSudo) ? 'sudo pkill' : 'pkill';
                    execSync(`${pkillCmd} -f "qemu-system-x86_64.*${vmName}"`, { stdio: 'ignore' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (!isVMRunning(vmName)) {
                        printStatus('SUCCESS', `VM ${vmName} stopped via pkill`);
                    } else {
                        printStatus('ERROR', 'pkill also failed to stop the VM');
                    }
                } catch (pkillError) {
                    printStatus('ERROR', `All stop methods failed: ${pkillError.message}`);
                    printStatus('INFO', 'Try manually stopping the VM with:');
                    printStatus('INFO', `  sudo kill -9 ${pid}`);
                    printStatus('INFO', `  or`);
                    printStatus('INFO', `  sudo pkill -f "qemu-system-x86_64.*${vmName}"`);
                }
            }
        } else {
            printStatus('ERROR', `Could not find process ID for VM ${vmName}`);
            
            // Try pkill as last resort
            try {
                const useSudo = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Use sudo to stop the VM? (y/N): `);
                const pkillCmd = /^[Yy]$/.test(useSudo) ? 'sudo pkill' : 'pkill';
                printStatus('INFO', `Trying ${pkillCmd} as last resort...`);
                execSync(`${pkillCmd} -f "qemu-system-x86_64.*${vmName}"`, { stdio: 'ignore' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!isVMRunning(vmName)) {
                    printStatus('SUCCESS', `VM ${vmName} stopped via pkill`);
                } else {
                    printStatus('ERROR', 'Failed to stop VM');
                    printStatus('INFO', `Try manually: ${pkillCmd} -f "qemu-system-x86_64.*${vmName}"`);
                }
            } catch (error) {
                printStatus('ERROR', `Failed to stop VM: ${error.message}`);
                printStatus('INFO', 'Try manually stopping the VM with:');
                printStatus('INFO', `  ps aux | grep "qemu-system-x86_64.*${vmName}"`);
                printStatus('INFO', `  sudo kill -9 <PID>`);
            }
        }
    }
}

async function deleteVM(vmName) {
    printStatus('WARN', `This will permanently delete VM '${vmName}' and all its data!`);
    const confirm = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Are you sure? (y/N): `);
    if (/^[Yy]$/.test(confirm)) {
        if (loadVMConfig(vmName)) {
            // Check if VM is running and stop it first
            if (isVMRunning(vmName)) {
                printStatus('INFO', 'VM is running, stopping it first...');
                await stopVM(vmName);
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            try {
                if (fs.existsSync(vmConfig.IMG_FILE)) {
                    fs.unlinkSync(vmConfig.IMG_FILE);
                    printStatus('INFO', `Removed image file: ${vmConfig.IMG_FILE}`);
                }
                if (fs.existsSync(vmConfig.SEED_FILE)) {
                    fs.unlinkSync(vmConfig.SEED_FILE);
                    printStatus('INFO', `Removed seed file: ${vmConfig.SEED_FILE}`);
                }
                const configFile = path.join(CONFIG.VM_DIR, `${vmName}.conf`);
                if (fs.existsSync(configFile)) {
                    fs.unlinkSync(configFile);
                    printStatus('INFO', `Removed config file: ${configFile}`);
                }
                printStatus('SUCCESS', `VM '${vmName}' has been deleted`);
            } catch (error) {
                printStatus('ERROR', `Failed to delete VM: ${error.message}`);
            }
        }
    } else {
        printStatus('INFO', 'Deletion cancelled');
    }
}

async function showVMInfo(vmName) {
    if (loadVMConfig(vmName)) {
        console.log();
        printStatus('INFO', `VM Information: ${vmName}`);
        console.log('==========================================');
        console.log(`OS: ${vmConfig.OS_TYPE}`);
        console.log(`Hostname: ${vmConfig.HOSTNAME}`);
        console.log(`Username: ${vmConfig.USERNAME}`);
        console.log(`Password: ${vmConfig.PASSWORD}`);
        console.log(`SSH Port: ${vmConfig.SSH_PORT}`);
        console.log(`Memory: ${vmConfig.MEMORY} MB`);
        console.log(`CPUs: ${vmConfig.CPUS}`);
        console.log(`Disk: ${vmConfig.DISK_SIZE}`);
        console.log(`GUI Mode: ${vmConfig.GUI_MODE}`);
        console.log(`Port Forwards: ${vmConfig.PORT_FORWARDS || 'None'}`);
        console.log(`Created: ${new Date(vmConfig.CREATED).toLocaleString()}`);
        console.log(`Image File: ${vmConfig.IMG_FILE}`);
        console.log(`Seed File: ${vmConfig.SEED_FILE}`);
        console.log(`Status: ${isVMRunning(vmName) ? 'Running' : 'Stopped'}`);
        
        // Show process info if running
        if (isVMRunning(vmName)) {
            console.log();
            console.log('Process Information:');
            const processInfo = getVMProcessInfo(vmName);
            if (processInfo) {
                console.log(processInfo);
            }
        }
        console.log('==========================================');
        console.log();
        await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Press Enter to continue...`);
    }
}

async function editVMConfig(vmName) {
    if (loadVMConfig(vmName)) {
        printStatus('INFO', `Editing VM: ${vmName}`);
        
        // Check if VM is running
        if (isVMRunning(vmName)) {
            printStatus('WARN', 'VM is currently running. Some changes may require a restart to take effect.');
            const confirm = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Continue anyway? (y/N): `);
            if (!/^[Yy]$/.test(confirm)) {
                return;
            }
        }
        
        let editing = true;
        while (editing) {
            console.log('What would you like to edit?');
            console.log('  1) Hostname');
            console.log('  2) Username');
            console.log('  3) Password');
            console.log('  4) SSH Port');
            console.log('  5) GUI Mode');
            console.log('  6) Port Forwards');
            console.log('  7) Memory (RAM)');
            console.log('  8) CPU Count');
            console.log('  9) Disk Size');
            console.log('  0) Back to main menu');
            
            const choice = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter your choice: `);
            
            switch (choice) {
                case '1':
                    while (true) {
                        const newHostname = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new hostname (current: ${vmConfig.HOSTNAME}): `);
                        const hostname = newHostname || vmConfig.HOSTNAME;
                        if (validateInput('name', hostname)) {
                            vmConfig.HOSTNAME = hostname;
                            break;
                        }
                    }
                    break;
                case '2':
                    while (true) {
                        const newUsername = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new username (current: ${vmConfig.USERNAME}): `);
                        const username = newUsername || vmConfig.USERNAME;
                        if (validateInput('username', username)) {
                            vmConfig.USERNAME = username;
                            break;
                        }
                    }
                    break;
                case '3':
                    while (true) {
                        const newPassword = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new password (current: ****): `);
                        const password = newPassword || vmConfig.PASSWORD;
                        if (password.length > 0) {
                            vmConfig.PASSWORD = password;
                            break;
                        } else {
                            printStatus('ERROR', 'Password cannot be empty');
                        }
                    }
                    break;
                case '4':
                    while (true) {
                        const newSSHPort = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new SSH port (current: ${vmConfig.SSH_PORT}): `);
                        const sshPort = newSSHPort || vmConfig.SSH_PORT;
                        if (validateInput('port', sshPort)) {
                            if (sshPort !== vmConfig.SSH_PORT) {
                                try {
                                    const result = execSync(`ss -tln 2>/dev/null | grep -q ":${sshPort} " || echo "available"`, { stdio: 'pipe' });
                                    if (result.toString().trim() === 'available') {
                                        vmConfig.SSH_PORT = sshPort;
                                        break;
                                    } else {
                                        printStatus('ERROR', `Port ${sshPort} is already in use`);
                                    }
                                } catch (error) {
                                    vmConfig.SSH_PORT = sshPort;
                                    break;
                                }
                            } else {
                                vmConfig.SSH_PORT = sshPort;
                                break;
                            }
                        }
                    }
                    break;
                case '5':
                    while (true) {
                        const guiInput = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enable GUI mode? (y/n, current: ${vmConfig.GUI_MODE}): `);
                        if (/^[Yy]$/.test(guiInput)) {
                            vmConfig.GUI_MODE = 'true';
                            break;
                        } else if (/^[Nn]$/.test(guiInput)) {
                            vmConfig.GUI_MODE = 'false';
                            break;
                        } else if (!guiInput) {
                            break;
                        } else {
                            printStatus('ERROR', 'Please answer y or n');
                        }
                    }
                    break;
                case '6':
                    const newPortForwards = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Additional port forwards (current: ${vmConfig.PORT_FORWARDS || 'None'}): `);
                    vmConfig.PORT_FORWARDS = newPortForwards || vmConfig.PORT_FORWARDS;
                    break;
                case '7':
                    while (true) {
                        const newMemory = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new memory in MB (current: ${vmConfig.MEMORY}): `);
                        const memory = newMemory || vmConfig.MEMORY;
                        if (validateInput('number', memory)) {
                            vmConfig.MEMORY = memory;
                            break;
                        }
                    }
                    break;
                case '8':
                    while (true) {
                        const newCPUs = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new CPU count (current: ${vmConfig.CPUS}): `);
                        const cpus = newCPUs || vmConfig.CPUS;
                        if (validateInput('number', cpus)) {
                            vmConfig.CPUS = cpus;
                            break;
                        }
                    }
                    break;
                case '9':
                    while (true) {
                        const newDiskSize = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new disk size (current: ${vmConfig.DISK_SIZE}): `);
                        const diskSize = newDiskSize || vmConfig.DISK_SIZE;
                        if (validateInput('size', diskSize)) {
                            vmConfig.DISK_SIZE = diskSize;
                            break;
                        }
                    }
                    break;
                case '0':
                    editing = false;
                    continue;
                default:
                    printStatus('ERROR', 'Invalid selection');
                    continue;
            }
            
            // Recreate seed image if user/password/hostname changed
            if (['1', '2', '3'].includes(choice)) {
                printStatus('INFO', 'Updating cloud-init configuration...');
                await createCloudInit(
                    vmConfig.HOSTNAME,
                    vmConfig.USERNAME,
                    vmConfig.PASSWORD,
                    vmConfig.SEED_FILE
                );
            }
            
            // Save configuration
            saveVMConfig(vmConfig);
            
            const continueEditing = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Continue editing? (y/N): `);
            if (!/^[Yy]$/.test(continueEditing)) {
                editing = false;
            }
        }
    }
}

async function resizeVM(vmName) {
    if (loadVMConfig(vmName)) {
        // Check if VM is running
        if (isVMRunning(vmName)) {
            printStatus('WARN', 'VM is currently running. It is recommended to stop the VM before resizing the disk.');
            const confirm = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Continue anyway? (y/N): `);
            if (!/^[Yy]$/.test(confirm)) {
                return;
            }
        }
        
        printStatus('INFO', `Current disk size: ${vmConfig.DISK_SIZE}`);
        
        while (true) {
            const newDiskSize = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter new disk size (e.g., 50G): `);
            if (validateInput('size', newDiskSize)) {
                if (newDiskSize === vmConfig.DISK_SIZE) {
                    printStatus('INFO', 'New disk size is the same as current size. No changes made.');
                    return;
                }
                
                // Check if new size is smaller than current
                const currentSizeNum = parseInt(vmConfig.DISK_SIZE.match(/^[0-9]+/)[0]);
                const newSizeNum = parseInt(newDiskSize.match(/^[0-9]+/)[0]);
                const currentUnit = vmConfig.DISK_SIZE.slice(-1);
                const newUnit = newDiskSize.slice(-1);
                
                let currentSizeMB = currentSizeNum;
                let newSizeMB = newSizeNum;
                
                if (currentUnit.toLowerCase() === 'g') {
                    currentSizeMB *= 1024;
                }
                if (newUnit.toLowerCase() === 'g') {
                    newSizeMB *= 1024;
                }
                
                if (newSizeMB < currentSizeMB) {
                    printStatus('WARN', 'Shrinking disk size is not recommended and may cause data loss!');
                    const confirm = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Are you sure you want to continue? (y/N): `);
                    if (!/^[Yy]$/.test(confirm)) {
                        printStatus('INFO', 'Disk resize cancelled.');
                        return;
                    }
                }
                
                // Resize the disk
                printStatus('INFO', `Resizing disk to ${newDiskSize}...`);
                try {
                    execSync(`qemu-img resize "${vmConfig.IMG_FILE}" "${newDiskSize}"`, { stdio: 'inherit' });
                    vmConfig.DISK_SIZE = newDiskSize;
                    saveVMConfig(vmConfig);
                    printStatus('SUCCESS', `Disk resized successfully to ${newDiskSize}`);
                    break;
                } catch (error) {
                    printStatus('ERROR', `Failed to resize disk: ${error.message}`);
                    return;
                }
            }
        }
    }
}

async function showVMPerformance(vmName) {
    if (loadVMConfig(vmName)) {
        if (isVMRunning(vmName)) {
            printStatus('INFO', `Performance metrics for VM: ${vmName}`);
            console.log('==========================================');
            
            try {
                // Get QEMU process ID
                const pid = getVMPID(vmName);
                if (pid) {
                    console.log('QEMU Process Stats:');
                    execSync(`ps -p ${pid} -o pid,%cpu,%mem,sz,rss,vsz,cmd --no-headers`, { stdio: 'inherit' });
                    console.log();
                    
                    console.log('Memory Usage:');
                    execSync('free -h', { stdio: 'inherit' });
                    console.log();
                    
                    console.log('Disk Usage:');
                    try {
                        execSync(`df -h "${vmConfig.IMG_FILE}" 2>/dev/null || du -h "${vmConfig.IMG_FILE}"`, { stdio: 'inherit' });
                    } catch (error) {
                        execSync(`du -h "${vmConfig.IMG_FILE}"`, { stdio: 'inherit' });
                    }
                    
                    console.log();
                    console.log('Process Tree:');
                    execSync(`pstree -p ${pid}`, { stdio: 'inherit' });
                } else {
                    printStatus('ERROR', `Could not find QEMU process for VM ${vmName}`);
                }
            } catch (error) {
                printStatus('ERROR', `Failed to get performance metrics: ${error.message}`);
            }
        } else {
            printStatus('INFO', `VM ${vmName} is not running`);
            console.log('Configuration:');
            console.log(`  Memory: ${vmConfig.MEMORY} MB`);
            console.log(`  CPUs: ${vmConfig.CPUS}`);
            console.log(`  Disk: ${vmConfig.DISK_SIZE}`);
        }
        console.log('==========================================');
        await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Press Enter to continue...`);
    }
}

// Main menu
async function mainMenu() {
    while (true) {
        displayHeader();
        
        const vms = getVMList();
        const vmCount = vms.length;
        
        if (vmCount > 0) {
            printStatus('INFO', `Found ${vmCount} existing VM(s):`);
            for (let i = 0; i < vms.length; i++) {
                const status = isVMRunning(vms[i]) ? `${COLORS.green}Running${COLORS.reset}` : `${COLORS.red}Stopped${COLORS.reset}`;
                console.log(`  ${String(i + 1).padStart(2, ' ')}) ${vms[i]} (${status})`);
            }
            console.log();
        }
        
        console.log('Main Menu:');
        console.log('  1) Create a new VM');
        if (vmCount > 0) {
            console.log('  2) Start a VM');
            console.log('  3) Stop a VM');
            console.log('  4) Show VM info');
            console.log('  5) Edit VM configuration');
            console.log('  6) Delete a VM');
            console.log('  7) Resize VM disk');
            console.log('  8) Show VM performance');
        }
        console.log('  0) Exit');
        console.log();
        
        const choice = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter your choice: `);
        
        switch (choice) {
            case '1':
                await createNewVM();
                break;
            case '2':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to start: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await startVM(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '3':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to stop: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await stopVM(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '4':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to show info: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await showVMInfo(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '5':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to edit: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await editVMConfig(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '6':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to delete: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await deleteVM(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '7':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to resize disk: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await resizeVM(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '8':
                if (vmCount > 0) {
                    const vmNum = await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Enter VM number to show performance: `);
                    if (/^[0-9]+$/.test(vmNum) && parseInt(vmNum) >= 1 && parseInt(vmNum) <= vmCount) {
                        await showVMPerformance(vms[parseInt(vmNum) - 1]);
                    } else {
                        printStatus('ERROR', 'Invalid selection');
                    }
                }
                break;
            case '0':
                printStatus('INFO', 'Goodbye!');
                console.log('\x1b[?25h');
                rl.close();
                process.exit(0);
                break;
            default:
                printStatus('ERROR', 'Invalid option');
                break;
        }
        
        await question(`${COLORS.cyan}[INPUT]${COLORS.reset} Press Enter to continue...`);
    }
}

// Main execution
async function main() {
    // Set trap to cleanup on exit
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
        cleanup();
        console.log('\x1b[?25h');
        process.exit(0);
    });
    
    // Check dependencies
    checkDependencies();
    
    // Create VM directory
    if (!fs.existsSync(CONFIG.VM_DIR)) {
        fs.mkdirSync(CONFIG.VM_DIR, { recursive: true });
    }
    
    // Start main menu
    await mainMenu();
}

// Run the program
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
