const net = require('net');
const { spawn, execSync } = require('child_process');

const LOCAL_PORT = parseInt(process.env.BRIDGE_PORT || '5434', 10);
const WSL_PG_PORT = parseInt(process.env.WSL_PG_PORT || '5433', 10); // 'kashyap' cluster (D: drive storage)

// 1. Ensure WSL loop mount and cluster are ready before accepting connections
try {
  console.log('[Bridge] Executing storage verification (ensure-kashyap-pg.sh)...');
  execSync('wsl -u root -d Ubuntu -- /usr/local/bin/ensure-kashyap-pg.sh', { stdio: 'inherit' });
} catch (err) {
  console.error('[Bridge] FATAL: Storage verification failed. Refusing to start bridge:', err.message);
  process.exit(1);
}

// 2. Keep WSL instance alive so WSL2 does not idle-terminate and unmount D: storage
const keepAliveProc = spawn('wsl', ['-u', 'root', '-d', 'Ubuntu', '--', 'sleep', 'infinity']);
keepAliveProc.on('error', (e) => {
  console.error('[Bridge] FATAL: WSL keepalive process failed:', e.message);
  process.exit(1);
});

// 3. Resolve WSL IP dynamically once at startup — fail fast if unresolvable
let wslIp;
try {
  wslIp = execSync('wsl -d Ubuntu -- hostname -I').toString().trim().split(' ')[0];
  if (!wslIp) {
    throw new Error('Empty IP returned by hostname -I');
  }
  console.log(`[Bridge] Resolved WSL IP: ${wslIp}`);
} catch (err) {
  console.error('[Bridge] FATAL: Could not resolve WSL target IP:', err.message);
  try { keepAliveProc.kill(); } catch (e) {}
  process.exit(1);
}

// 4. Confirm the expected project cluster is ready before accepting client connections
function checkClusterReady(host, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`Timeout connecting to PostgreSQL target at ${host}:${port}`));
    }, timeoutMs);

    const sock = net.connect(port, host, () => {
      clearTimeout(timer);
      sock.end();
      resolve(true);
    });

    sock.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

checkClusterReady(wslIp, WSL_PG_PORT)
  .then(() => {
    console.log(`[Bridge] Confirmed PostgreSQL cluster is ready on ${wslIp}:${WSL_PG_PORT}`);

    const server = net.createServer((clientSocket) => {
      clientSocket.setNoDelay(true);
      clientSocket.setKeepAlive(true, 1000);

      const targetSocket = net.connect(WSL_PG_PORT, wslIp);
      targetSocket.setNoDelay(true);
      targetSocket.setKeepAlive(true, 1000);

      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);

      const cleanup = (source, err) => {
        if (err && err.code !== 'ECONNRESET') {
          console.error(`[Bridge] Error from ${source}:`, err.message);
        }
        try { targetSocket.destroy(); } catch (e) {}
        try { clientSocket.destroy(); } catch (e) {}
      };

      clientSocket.on('error', (e) => cleanup('client', e));
      targetSocket.on('error', (e) => cleanup('target', e));
      clientSocket.on('close', (hadErr) => cleanup('client-close', hadErr ? new Error('had error') : null));
      targetSocket.on('close', (hadErr) => cleanup('target-close', hadErr ? new Error('had error') : null));
    });

    // Strictly preserve localhost-only Windows binding (127.0.0.1)
    server.listen(LOCAL_PORT, '127.0.0.1', () => {
      console.log(`[Bridge] SUCCESS: PostgreSQL TCP bridge listening on 127.0.0.1:${LOCAL_PORT} -> WSL ${wslIp}:${WSL_PG_PORT} (D: drive storage)`);
    });

    const shutdown = () => {
      console.log('\n[Bridge] Shutting down bridge and releasing keepalive...');
      try { keepAliveProc.kill(); } catch (e) {}
      server.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', () => {
      try { keepAliveProc.kill(); } catch (e) {}
    });
  })
  .catch((err) => {
    console.error(`[Bridge] FATAL: Target PostgreSQL cluster on ${wslIp}:${WSL_PG_PORT} is not ready:`, err.message);
    try { keepAliveProc.kill(); } catch (e) {}
    process.exit(1);
  });


