#!/usr/bin/env node
'use strict';

/*
 * Gorrila Coderz VM Manager (Node.js, single-file edition)
 * Professional Multi-VM Virtualization — QEMU/KVM + Cloud-Init
 *
 * Requirements on PATH: qemu-system-x86_64, qemu-img, wget, cloud-localds, openssl
 * Linux host assumed (uses pgrep/pkill/ss/free/df like the original bash script).
 *
 * Usage:
 *   node vm-manager.js
 *   VM_DIR=/opt/vms node vm-manager.js   # override the config/image directory
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync, spawn } = require('child_process');

/* ------------------------------------------------------------------ *
 *  UI helpers (colors, status lines, screen control)
 * ------------------------------------------------------------------ */

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[1;31m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[1;34m',
  magenta: '\x1b[1;35m',
  cyan: '\x1b[1;36m',
  white: '\x1b[1;37m',
  gray: '\x1b[1;90m',
};

function printStatus(type, message) {
  switch (type) {
    case 'INFO':
      console.log(`${c.blue}[INFO]${c.reset} ${message}`);
      break;
    case 'WARN':
      console.log(`${c.yellow}[WARN]${c.reset} ${message}`);
      break;
    case 'ERROR':
      console.log(`${c.red}[ERROR]${c.reset} ${message}`);
      break;
    case 'SUCCESS':
      console.log(`${c.green}[SUCCESS]${c.reset} ${message}`);
      break;
    default:
      console.log(`[${type}] ${message}`);
  }
}

function inputPrompt(message) {
  return `${c.cyan}[INPUT]${c.reset} ${message}`;
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f');
}

function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

function showCursor() {
  process.stdout.write('\x1b[?25h');
}

/* ------------------------------------------------------------------ *
 *  Input validation, port of validate_input()
 * ------------------------------------------------------------------ */

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
    case 'port': {
      const n = Number(value);
      if (!/^[0-9]+$/.test(value) || n < 23 || n > 65535) {
        printStatus('ERROR', 'Must be a valid port number (23-65535)');
        return false;
      }
      break;
    }
    case 'name':
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        printStatus('ERROR', 'VM name can only contain letters, numbers, hyphens, and underscores');
        return false;
      }
      break;
    case 'username':
      if (!/^[a-z_][a-z0-9_-]*$/.test(value)) {
        printStatus(
          'ERROR',
          'Username must start with a letter or underscore, and contain only letters, numbers, hyphens, and underscores'
        );
        return false;
      }
      break;
    default:
      break;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 *  VM config persistence (JSON per-VM files), port of
 *  load_vm_config / save_vm_config / get_vm_list
 * ------------------------------------------------------------------ */

const VM_DIR = process.env.VM_DIR || path.join(os.homedir(), 'vms');

function ensureVmDir() {
  fs.mkdirSync(VM_DIR, { recursive: true });
}

function configPath(vmName) {
  return path.join(VM_DIR, `${vmName}.json`);
}

function getVmList() {
  ensureVmDir();
  return fs
    .readdirSync(VM_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

function vmConfigExists(vmName) {
  return fs.existsSync(configPath(vmName));
}

function loadVmConfig(vmName) {
  const p = configPath(vmName);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveVmConfig(vm) {
  ensureVmDir();
  fs.writeFileSync(configPath(vm.vmName), JSON.stringify(vm, null, 2));
}

function deleteVmConfig(vmName) {
  const p = configPath(vmName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/* ------------------------------------------------------------------ *
 *  Supported OS image catalog, port of the OS_OPTIONS bash array
 * ------------------------------------------------------------------ */

const OS_OPTIONS = {
  'Ubuntu 22.04': {
    osType: 'ubuntu',
    codename: 'jammy',
    imgUrl: 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img',
    defaultHostname: 'ubuntu22',
    defaultUsername: 'ubuntu',
    defaultPassword: 'ubuntu',
  },
  'Ubuntu 24.04': {
    osType: 'ubuntu',
    codename: 'noble',
    imgUrl: 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',
    defaultHostname: 'ubuntu24',
    defaultUsername: 'ubuntu',
    defaultPassword: 'ubuntu',
  },
  'Debian 11': {
    osType: 'debian',
    codename: 'bullseye',
    imgUrl: 'https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-generic-amd64.qcow2',
    defaultHostname: 'debian11',
    defaultUsername: 'debian',
    defaultPassword: 'debian',
  },
  'Debian 12': {
    osType: 'debian',
    codename: 'bookworm',
    imgUrl: 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2',
    defaultHostname: 'debian12',
    defaultUsername: 'debian',
    defaultPassword: 'debian',
  },
  'Fedora 40': {
    osType: 'fedora',
    codename: '40',
    imgUrl:
      'https://download.fedoraproject.org/pub/fedora/linux/releases/40/Cloud/x86_64/images/Fedora-Cloud-Base-40-1.14.x86_64.qcow2',
    defaultHostname: 'fedora40',
    defaultUsername: 'fedora',
    defaultPassword: 'fedora',
  },
  'CentOS Stream 9': {
    osType: 'centos',
    codename: 'stream9',
    imgUrl: 'https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2',
    defaultHostname: 'centos9',
    defaultUsername: 'centos',
    defaultPassword: 'centos',
  },
  'AlmaLinux 9': {
    osType: 'almalinux',
    codename: '9',
    imgUrl: 'https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2',
    defaultHostname: 'almalinux9',
    defaultUsername: 'alma',
    defaultPassword: 'alma',
  },
  'Rocky Linux 9': {
    osType: 'rockylinux',
    codename: '9',
    imgUrl: 'https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2',
    defaultHostname: 'rocky9',
    defaultUsername: 'rocky',
    defaultPassword: 'rocky',
  },
};

/* ------------------------------------------------------------------ *
 *  Process / dependency helpers, port of check_dependencies() and
 *  the various shell command invocations
 * ------------------------------------------------------------------ */

const DEPENDENCIES = ['qemu-system-x86_64', 'wget', 'cloud-localds', 'qemu-img'];

function commandExists(cmd) {
  const which = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(which, [cmd], { stdio: 'ignore' });
  return res.status === 0;
}

function checkDependencies() {
  const missing = DEPENDENCIES.filter((d) => !commandExists(d));
  if (missing.length !== 0) {
    printStatus('ERROR', `Missing dependencies: ${missing.join(' ')}`);
    printStatus('INFO', 'On Ubuntu/Debian, try: sudo apt install qemu-system cloud-image-utils wget openssl');
    process.exit(1);
  }
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return res.status === 0;
}

function runQuiet(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'ignore', ...opts });
  return res.status === 0;
}

function runCapture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: res.status === 0, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function runForeground(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code) => resolve(code));
    child.on('error', (err) => {
      printStatus('ERROR', `Failed to launch ${cmd}: ${err.message}`);
      resolve(1);
    });
  });
}

/* ------------------------------------------------------------------ *
 *  Terminal prompts (visible + hidden/password input)
 * ------------------------------------------------------------------ */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Mask password input by muting the readline interface's own echo instead of
// fighting it for control of raw mode (mixing manual raw-mode stdin reads
// with an active readline interface is what caused input to leak to the
// shell after the password prompt). This overrides the interface's internal
// output writer once; askHidden() below just toggles rl.stdoutMuted on and
// off per call, and ask() is unaffected since stdoutMuted defaults to false.
rl.stdoutMuted = false;
// eslint-disable-next-line no-underscore-dangle
rl._writeToOutput = function _writeToOutput(stringToWrite) {
  if (rl.stdoutMuted) {
    // Swallow the raw newline sequence readline emits on Enter so we don't
    // print a stray '*' after the password; everything else becomes '*'.
    if (stringToWrite === '\r\n' || stringToWrite === '\n') {
      rl.output.write(stringToWrite);
    } else {
      rl.output.write('*');
    }
  } else {
    rl.output.write(stringToWrite);
  }
};

function ask(message) {
  return new Promise((resolve) => rl.question(inputPrompt(message), (answer) => resolve(answer.trim())));
}

function askHidden(message) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // No TTY available (piped input, some sandboxed containers) - masking
      // isn't possible, so fall back to a plain (visible) prompt rather than
      // risk crashing on stdin that doesn't support raw mode.
      rl.question(inputPrompt(message), (answer) => resolve(answer.trim()));
      return;
    }
    rl.question(inputPrompt(message), (answer) => {
      rl.stdoutMuted = false;
      resolve(answer.trim());
    });
    rl.stdoutMuted = true;
  });
}

async function askYesNo(message, defaultAnswer = 'n') {
  while (true) {
    const answer = ((await ask(message)) || defaultAnswer).toLowerCase();
    if (answer === 'y') return true;
    if (answer === 'n') return false;
    printStatus('ERROR', 'Please answer y or n');
  }
}

async function askValidated(type, message, defaultValue, extraCheck) {
  while (true) {
    let value = await ask(message);
    value = value || defaultValue;
    if (!validateInput(type, value)) continue;
    if (extraCheck) {
      const err = extraCheck(value);
      if (err) {
        printStatus('ERROR', err);
        continue;
      }
    }
    return value;
  }
}

/* ------------------------------------------------------------------ *
 *  Boot-sequence banner, port of display_header()
 * ------------------------------------------------------------------ */

const LOGO = String.raw`
 ,----.                        ,--.,--.
   .-./    ,---. ,--.--.,--.--.\`--'|  | ,--,--.
 |  | .---.| .-. ||  .--'|  .--',--.|  |' ,-.  |
 '  '--'  |' '-' '|  |   |  |   |  ||  |\ '-'  |
  \`------'  \`---' \`--'   \`--'   \`--'\`--' \`--\`--'
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${pad2(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(d) {
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${pad2(hours)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
}

async function displayHeader() {
  clearScreen();
  hideCursor();

  console.log(LOGO);
  console.log();
  process.stdout.write(c.magenta);
  console.log('═'.repeat(90));
  process.stdout.write(c.reset);

  process.stdout.write(c.white);
  console.log('                     PROFESSIONAL VIRTUAL MACHINE CONTROL CENTER');
  process.stdout.write(c.gray);
  console.log('                    Powered by QEMU • KVM • Cloud-Init • Linux');
  process.stdout.write(c.reset);
  console.log();

  process.stdout.write(`${c.cyan}Boot Sequence${c.reset}\n`);
  console.log('─'.repeat(88));

  for (let i = 0; i < 50; i++) {
    process.stdout.write(`${c.green}█${c.reset}`);
    await sleep(15);
  }
  process.stdout.write(` ${c.green}100%${c.reset}\n\n`);

  const steps = [
    ['Loading Hypervisor Engine', 'ONLINE'],
    ['Detecting CPU Virtualization', 'SUPPORTED'],
    ['Initializing Cloud-Init', 'READY'],
    ['Loading Storage Manager', 'READY'],
    ['Verifying Network Stack', 'ONLINE'],
    ['Scanning Existing Virtual Machines', 'COMPLETE'],
    ['Loading Configuration', 'DONE'],
  ];

  for (const [label, status] of steps) {
    const dots = '.'.repeat(Math.max(1, 40 - label.length));
    console.log(`${c.green}✔${c.reset} ${label}${dots} ${c.cyan}${status}${c.reset}`);
    await sleep(50);
  }

  console.log();
  console.log(`${c.magenta}${'─'.repeat(88)}${c.reset}`);

  console.log(`${c.cyan} Hostname      ${c.reset} : ${os.hostname()}`);
  console.log(`${c.cyan} User          ${c.reset} : ${os.userInfo().username}`);
  console.log(`${c.cyan} Kernel        ${c.reset} : ${os.release()}`);
  console.log(`${c.cyan} Architecture  ${c.reset} : ${os.arch()}`);
  console.log(`${c.cyan} Date          ${c.reset} : ${formatDate(new Date())}`);
  console.log(`${c.cyan} Time          ${c.reset} : ${formatTime(new Date())}`);

  console.log(`${c.magenta}${'─'.repeat(88)}${c.reset}`);
  console.log();
  console.log(`${c.green}                  GORRILA CODERZ VM MANAGER v5.0${c.reset}`);
  console.log(`${c.gray}               Enterprise Virtualization Platform${c.reset}`);
  console.log();
}

/* ------------------------------------------------------------------ *
 *  Core VM lifecycle operations
 * ------------------------------------------------------------------ */

function isPortInUse(port) {
  const { ok, stdout } = runCapture('ss', ['-tln']);
  if (!ok) return false; // if `ss` isn't available, don't block VM creation on it
  return stdout.split('\n').some((line) => line.includes(`:${port} `));
}

function isVmRunning(vmName) {
  const { ok } = runCapture('pgrep', ['-f', `qemu-system-x86_64.*${vmName}`]);
  return ok;
}

async function createNewVm() {
  printStatus('INFO', 'Creating a new VM');

  printStatus('INFO', 'Select an OS to set up:');
  const osNames = Object.keys(OS_OPTIONS);
  osNames.forEach((name, i) => console.log(`  ${i + 1}) ${name}`));

  let osChoice;
  while (true) {
    const choice = await ask(`Enter your choice (1-${osNames.length}): `);
    const n = Number(choice);
    if (Number.isInteger(n) && n >= 1 && n <= osNames.length) {
      osChoice = OS_OPTIONS[osNames[n - 1]];
      break;
    }
    printStatus('ERROR', 'Invalid selection. Try again.');
  }

  const vmName = await askValidated('name', `Enter VM name (default: ${osChoice.defaultHostname}): `, osChoice.defaultHostname, (v) =>
    vmConfigExists(v) ? `VM with name '${v}' already exists` : null
  );

  const hostname = await askValidated('name', `Enter hostname (default: ${vmName}): `, vmName);
  const username = await askValidated('username', `Enter username (default: ${osChoice.defaultUsername}): `, osChoice.defaultUsername);

  let password;
  while (true) {
    password = (await askHidden(`Enter password (default: ${osChoice.defaultPassword}): `)) || osChoice.defaultPassword;
    if (password) break;
    printStatus('ERROR', 'Password cannot be empty');
  }

  const diskSize = await askValidated('size', 'Disk size (default: 20G): ', '20G');
  const memory = await askValidated('number', 'Memory in MB (default: 2048): ', '2048');
  const cpus = await askValidated('number', 'Number of CPUs (default: 2): ', '2');
  const sshPort = await askValidated('port', 'SSH Port (default: 2222): ', '2222', (v) =>
    isPortInUse(v) ? `Port ${v} is already in use` : null
  );

  const guiMode = await askYesNo('Enable GUI mode? (y/n, default: n): ', 'n');
  const portForwards = await ask('Additional port forwards (e.g., 8080:80, press Enter for none): ');

  const vm = {
    vmName,
    osType: osChoice.osType,
    codename: osChoice.codename,
    imgUrl: osChoice.imgUrl,
    hostname,
    username,
    password,
    diskSize,
    memory,
    cpus,
    sshPort,
    guiMode,
    portForwards,
    imgFile: path.join(VM_DIR, `${vmName}.img`),
    seedFile: path.join(VM_DIR, `${vmName}-seed.iso`),
    created: new Date().toString(),
  };

  await setupVmImage(vm);
  saveVmConfig(vm);
}

async function setupVmImage(vm) {
  printStatus('INFO', 'Downloading and preparing image...');
  ensureVmDir();

  if (fs.existsSync(vm.imgFile)) {
    printStatus('INFO', 'Image file already exists. Skipping download.');
  } else {
    printStatus('INFO', `Downloading image from ${vm.imgUrl}...`);
    const tmp = `${vm.imgFile}.tmp`;
    const ok = run('wget', ['--progress=bar:force', vm.imgUrl, '-O', tmp]);
    if (!ok) {
      printStatus('ERROR', `Failed to download image from ${vm.imgUrl}`);
      process.exit(1);
    }
    fs.renameSync(tmp, vm.imgFile);
  }

  if (!runQuiet('qemu-img', ['resize', vm.imgFile, vm.diskSize])) {
    printStatus('WARN', 'Failed to resize disk image. Creating new image with specified size...');
    fs.rmSync(vm.imgFile, { force: true });
    const tmp = `${vm.imgFile}.tmp`;
    const backed = runQuiet('qemu-img', ['create', '-f', 'qcow2', '-F', 'qcow2', '-b', vm.imgFile, tmp, vm.diskSize]);
    if (!backed) {
      run('qemu-img', ['create', '-f', 'qcow2', vm.imgFile, vm.diskSize]);
    }
    if (fs.existsSync(tmp)) fs.renameSync(tmp, vm.imgFile);
  }

  // cloud-init user-data / meta-data, written to a scratch dir then cleaned up
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-cloudinit-'));
  const userDataPath = path.join(scratchDir, 'user-data');
  const metaDataPath = path.join(scratchDir, 'meta-data');

  const { stdout: hashOut, ok: hashOk } = runCapture('openssl', ['passwd', '-6', vm.password]);
  const passwordHash = hashOk ? hashOut.trim() : '';
  if (!hashOk) {
    printStatus('WARN', 'openssl not available; falling back to plaintext chpasswd only');
  }

  const userData = `#cloud-config
hostname: ${vm.hostname}
ssh_pwauth: true
disable_root: false
users:
  - name: ${vm.username}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    password: ${passwordHash}
chpasswd:
  list: |
    root:${vm.password}
    ${vm.username}:${vm.password}
  expire: false
`;
  const metaData = `instance-id: iid-${vm.vmName}\nlocal-hostname: ${vm.hostname}\n`;

  fs.writeFileSync(userDataPath, userData);
  fs.writeFileSync(metaDataPath, metaData);

  const seedOk = run('cloud-localds', [vm.seedFile, userDataPath, metaDataPath]);
  fs.rmSync(scratchDir, { recursive: true, force: true });

  if (!seedOk) {
    printStatus('ERROR', 'Failed to create cloud-init seed image');
    process.exit(1);
  }

  printStatus('SUCCESS', `VM '${vm.vmName}' created successfully.`);
}

function buildQemuArgs(vm) {
  const args = [
    '-m', String(vm.memory),
    '-smp', String(vm.cpus),
    '-cpu', 'qemu64',
    '-drive', `file=${vm.imgFile},format=qcow2,if=virtio`,
    '-drive', `file=${vm.seedFile},format=raw,if=virtio`,
    '-boot', 'order=c',
    '-device', 'virtio-net-pci,netdev=n0',
    '-netdev', `user,id=n0,hostfwd=tcp::${vm.sshPort}-:22`,
  ];

  if (vm.portForwards) {
    vm.portForwards.split(',').forEach((forward, idx) => {
      const [hostPort, guestPort] = forward.split(':').map((s) => s.trim());
      if (!hostPort || !guestPort) return;
      const netId = `n${idx + 1}`;
      args.push('-device', `virtio-net-pci,netdev=${netId}`);
      args.push('-netdev', `user,id=${netId},hostfwd=tcp::${hostPort}-:${guestPort}`);
    });
  }

  if (vm.guiMode === true || vm.guiMode === 'true') {
    args.push('-vga', 'virtio', '-display', 'gtk,gl=on');
  } else {
    args.push('-nographic', '-serial', 'mon:stdio');
  }

  args.push(
    '-device', 'virtio-balloon-pci',
    '-object', 'rng-random,filename=/dev/urandom,id=rng0',
    '-device', 'virtio-rng-pci,rng=rng0'
  );

  return args;
}

async function startVm(vmName) {
  const vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  printStatus('INFO', `Starting VM: ${vmName}`);
  printStatus('INFO', `SSH: ssh -p ${vm.sshPort} ${vm.username}@localhost`);
  printStatus('INFO', `Password: ${vm.password}`);

  if (!fs.existsSync(vm.imgFile)) {
    return printStatus('ERROR', `VM image file not found: ${vm.imgFile}`);
  }
  if (!fs.existsSync(vm.seedFile)) {
    printStatus('WARN', 'Seed file not found, recreating...');
    await setupVmImage(vm);
  }

  const args = buildQemuArgs(vm);
  printStatus('INFO', 'Starting QEMU...');
  await runForeground('qemu-system-x86_64', args);
  printStatus('INFO', `VM ${vmName} has been shut down`);
}

async function stopVm(vmName) {
  const vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  if (!isVmRunning(vmName)) {
    return printStatus('INFO', `VM ${vmName} is not running`);
  }

  printStatus('INFO', `Stopping VM: ${vmName}`);
  runQuiet('pkill', ['-f', `qemu-system-x86_64.*${vm.imgFile}`]);
  await new Promise((r) => setTimeout(r, 2000));
  if (isVmRunning(vmName)) {
    printStatus('WARN', 'VM did not stop gracefully, forcing termination...');
    runQuiet('pkill', ['-9', '-f', `qemu-system-x86_64.*${vm.imgFile}`]);
  }
  printStatus('SUCCESS', `VM ${vmName} stopped`);
}

async function deleteVm(vmName) {
  printStatus('WARN', `This will permanently delete VM '${vmName}' and all its data!`);
  const confirmed = await askYesNo('Are you sure? (y/N): ', 'n');
  if (!confirmed) return printStatus('INFO', 'Deletion cancelled');

  const vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  fs.rmSync(vm.imgFile, { force: true });
  fs.rmSync(vm.seedFile, { force: true });
  deleteVmConfig(vmName);
  printStatus('SUCCESS', `VM '${vmName}' has been deleted`);
}

async function showVmInfo(vmName) {
  const vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  console.log();
  printStatus('INFO', `VM Information: ${vmName}`);
  console.log('==========================================');
  console.log(`OS: ${vm.osType}`);
  console.log(`Hostname: ${vm.hostname}`);
  console.log(`Username: ${vm.username}`);
  console.log(`Password: ${vm.password}`);
  console.log(`SSH Port: ${vm.sshPort}`);
  console.log(`Memory: ${vm.memory} MB`);
  console.log(`CPUs: ${vm.cpus}`);
  console.log(`Disk: ${vm.diskSize}`);
  console.log(`GUI Mode: ${vm.guiMode}`);
  console.log(`Port Forwards: ${vm.portForwards || 'None'}`);
  console.log(`Created: ${vm.created}`);
  console.log(`Image File: ${vm.imgFile}`);
  console.log(`Seed File: ${vm.seedFile}`);
  console.log('==========================================');
  console.log();
  await ask('Press Enter to continue...');
}

async function editVmConfig(vmName) {
  let vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  printStatus('INFO', `Editing VM: ${vmName}`);

  while (true) {
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

    const choice = await ask('Enter your choice: ');
    let identityChanged = false;

    switch (choice) {
      case '1':
        vm.hostname = await askValidated('name', `Enter new hostname (current: ${vm.hostname}): `, vm.hostname);
        identityChanged = true;
        break;
      case '2':
        vm.username = await askValidated('username', `Enter new username (current: ${vm.username}): `, vm.username);
        identityChanged = true;
        break;
      case '3': {
        while (true) {
          const newPassword = (await askHidden(`Enter new password (current: ****): `)) || vm.password;
          if (newPassword) {
            vm.password = newPassword;
            break;
          }
          printStatus('ERROR', 'Password cannot be empty');
        }
        identityChanged = true;
        break;
      }
      case '4':
        vm.sshPort = await askValidated('port', `Enter new SSH port (current: ${vm.sshPort}): `, vm.sshPort, (v) =>
          v !== vm.sshPort && isPortInUse(v) ? `Port ${v} is already in use` : null
        );
        break;
      case '5': {
        const raw = await ask(`Enable GUI mode? (y/n, current: ${vm.guiMode}): `);
        if (/^[Yy]$/.test(raw)) vm.guiMode = true;
        else if (/^[Nn]$/.test(raw)) vm.guiMode = false;
        // empty input keeps current value
        break;
      }
      case '6': {
        const raw = await ask(`Additional port forwards (current: ${vm.portForwards || 'None'}): `);
        vm.portForwards = raw || vm.portForwards;
        break;
      }
      case '7':
        vm.memory = await askValidated('number', `Enter new memory in MB (current: ${vm.memory}): `, vm.memory);
        break;
      case '8':
        vm.cpus = await askValidated('number', `Enter new CPU count (current: ${vm.cpus}): `, vm.cpus);
        break;
      case '9':
        vm.diskSize = await askValidated('size', `Enter new disk size (current: ${vm.diskSize}): `, vm.diskSize);
        break;
      case '0':
        return;
      default:
        printStatus('ERROR', 'Invalid selection');
        continue;
    }

    if (identityChanged) {
      printStatus('INFO', 'Updating cloud-init configuration...');
      await setupVmImage(vm);
    }

    saveVmConfig(vm);

    const keepGoing = await askYesNo('Continue editing? (y/N): ', 'n');
    if (!keepGoing) break;
  }
}

function mbValue(size) {
  const n = Number(size.slice(0, -1));
  const unit = size.slice(-1).toLowerCase();
  return unit === 'g' ? n * 1024 : n;
}

async function resizeVmDisk(vmName) {
  const vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  printStatus('INFO', `Current disk size: ${vm.diskSize}`);

  while (true) {
    const newSize = await ask('Enter new disk size (e.g., 50G): ');
    if (!validateInput('size', newSize)) continue;

    if (newSize === vm.diskSize) {
      printStatus('INFO', 'New disk size is the same as current size. No changes made.');
      return;
    }

    if (mbValue(newSize) < mbValue(vm.diskSize)) {
      printStatus('WARN', 'Shrinking disk size is not recommended and may cause data loss!');
      const confirmShrink = await askYesNo('Are you sure you want to continue? (y/N): ', 'n');
      if (!confirmShrink) {
        printStatus('INFO', 'Disk resize cancelled.');
        return;
      }
    }

    printStatus('INFO', `Resizing disk to ${newSize}...`);
    if (run('qemu-img', ['resize', vm.imgFile, newSize])) {
      vm.diskSize = newSize;
      saveVmConfig(vm);
      printStatus('SUCCESS', `Disk resized successfully to ${newSize}`);
    } else {
      printStatus('ERROR', 'Failed to resize disk');
    }
    return;
  }
}

async function showVmPerformance(vmName) {
  const vm = loadVmConfig(vmName);
  if (!vm) return printStatus('ERROR', `Configuration for VM '${vmName}' not found`);

  if (isVmRunning(vmName)) {
    printStatus('INFO', `Performance metrics for VM: ${vmName}`);
    console.log('==========================================');

    const { stdout: pidOut, ok } = runCapture('pgrep', ['-f', `qemu-system-x86_64.*${vm.imgFile}`]);
    const pid = ok ? pidOut.trim().split('\n')[0] : '';

    if (pid) {
      console.log('QEMU Process Stats:');
      run('ps', ['-p', pid, '-o', 'pid,%cpu,%mem,sz,rss,vsz,cmd', '--no-headers']);
      console.log();
      console.log('Memory Usage:');
      run('free', ['-h']);
      console.log();
      console.log('Disk Usage:');
      if (!run('df', ['-h', vm.imgFile])) {
        run('du', ['-h', vm.imgFile]);
      }
    } else {
      printStatus('ERROR', `Could not find QEMU process for VM ${vmName}`);
    }
  } else {
    printStatus('INFO', `VM ${vmName} is not running`);
    console.log('Configuration:');
    console.log(`  Memory: ${vm.memory} MB`);
    console.log(`  CPUs: ${vm.cpus}`);
    console.log(`  Disk: ${vm.diskSize}`);
  }
  console.log('==========================================');
  await ask('Press Enter to continue...');
}

/* ------------------------------------------------------------------ *
 *  Main menu, port of main_menu()
 * ------------------------------------------------------------------ */

async function mainMenu() {
  while (true) {
    await displayHeader();

    const vms = getVmList();
    const vmCount = vms.length;

    if (vmCount > 0) {
      printStatus('INFO', `Found ${vmCount} existing VM(s):`);
      vms.forEach((name, i) => {
        const status = isVmRunning(name) ? 'Running' : 'Stopped';
        console.log(`  ${String(i + 1).padStart(2)}) ${name} (${status})`);
      });
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

    const choice = await ask('Enter your choice: ');

    const pickVm = async (promptText) => {
      const num = await ask(promptText);
      const n = Number(num);
      if (Number.isInteger(n) && n >= 1 && n <= vmCount) return vms[n - 1];
      printStatus('ERROR', 'Invalid selection');
      return null;
    };

    switch (choice) {
      case '1':
        await createNewVm();
        break;
      case '2':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to start: ');
          if (name) await startVm(name);
        }
        break;
      case '3':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to stop: ');
          if (name) await stopVm(name);
        }
        break;
      case '4':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to show info: ');
          if (name) await showVmInfo(name);
        }
        break;
      case '5':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to edit: ');
          if (name) await editVmConfig(name);
        }
        break;
      case '6':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to delete: ');
          if (name) await deleteVm(name);
        }
        break;
      case '7':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to resize disk: ');
          if (name) await resizeVmDisk(name);
        }
        break;
      case '8':
        if (vmCount > 0) {
          const name = await pickVm('Enter VM number to show performance: ');
          if (name) await showVmPerformance(name);
        }
        break;
      case '0':
        printStatus('INFO', 'Goodbye!');
        rl.close();
        showCursor();
        process.exit(0);
        break; // eslint-disable-line no-unreachable
      default:
        printStatus('ERROR', 'Invalid option');
    }

    await ask('Press Enter to continue...');
  }
}

async function main() {
  checkDependencies();
  ensureVmDir();

  process.on('exit', () => showCursor());
  process.on('SIGINT', () => {
    showCursor();
    process.exit(130);
  });

  await mainMenu();
}

main().catch((err) => {
  showCursor();
  printStatus('ERROR', err.message || String(err));
  process.exit(1);
});
