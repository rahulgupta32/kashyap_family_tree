const net = require('net');
const { spawn, execSync } = require('child_process');

const LOCAL_PORT = parseInt(process.env.BRIDGE_PORT || '5434', 10);
const WSL_PG_PORT = parseInt(process.env.WSL_PG_PORT || '5433', 10); // 'kashyap' cluster (D: drive storage)

// Ensure WSL loop mount and cluster are ready before accepting connections
try {
  execSync('wsl -u root -d Ubuntu -- /usr/local/bin/ensure-kashyap-pg.sh', { stdio: 'inherit' });
} catch (err) {
  console.warn('[Bridge] Warning: ensure-kashyap-pg check returned non-zero, continuing...', err.message);
}

// Keep WSL instance alive so WSL2 does not idle-terminate and unmount D: storage
const keepAliveProc = spawn('wsl', ['-u', 'root', '-d', 'Ubuntu', '--', 'sleep', 'infinity']);
keepAliveProc.on('error', (e) => console.error('[Bridge] Keepalive proc error:', e.message));

// Resolve WSL IP dynamically once at startup
let wslIp = '127.0.0.1';
try {
  wslIp = execSync('wsl -d Ubuntu -- hostname -I').toString().trim().split(' ')[0];
  console.log(`[Bridge] Resolved WSL IP: ${wslIp}`);
} catch (err) {
  console.warn('[Bridge] Warning: could not resolve WSL IP, falling back to 127.0.0.1:', err.message);
}

const server = net.createServer((clientSocket) => {
  clientSocket.setNoDelay(true);
  clientSocket.setKeepAlive(true, 1000);

  const targetSocket = net.connect(WSL_PG_PORT, wslIp, () => {
    // Target connected
  });
  targetSocket.setNoDelay(true);
  targetSocket.setKeepAlive(true, 1000);

  clientSocket.pipe(targetSocket);
  targetSocket.pipe(clientSocket);

  const cleanup = (source, err) => {
    if (err) console.error(`[Bridge] Error from ${source}:`, err.message);
    try { targetSocket.destroy(); } catch (e) {}
    try { clientSocket.destroy(); } catch (e) {}
  };

  clientSocket.on('error', (e) => cleanup('client', e));
  targetSocket.on('error', (e) => cleanup('target', e));
  clientSocket.on('close', (hadErr) => cleanup('client-close', hadErr ? new Error('had error') : null));
  targetSocket.on('close', (hadErr) => cleanup('target-close', hadErr ? new Error('had error') : null));
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`[Bridge] PostgreSQL TCP bridge listening on 127.0.0.1:${LOCAL_PORT} -> WSL ${wslIp}:${WSL_PG_PORT} (D: drive storage)`);
});

process.on('SIGINT', () => {
  try { keepAliveProc.kill(); } catch (e) {}
  server.close();
  process.exit(0);
});

process.on('exit', () => {
  try { keepAliveProc.kill(); } catch (e) {}
});

