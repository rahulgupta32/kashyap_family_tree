const net = require('net');
const { spawn } = require('child_process');

const LOCAL_PORT = 5432;

const server = net.createServer((clientSocket) => {
  console.log('[Bridge] Client connected from Node/Windows application');

  // Spawn nc inside WSL connecting to PostgreSQL on localhost:5432
  const wslProc = spawn('wsl', ['-u', 'root', '-d', 'Ubuntu', '--', 'nc', '127.0.0.1', '5432']);

  clientSocket.pipe(wslProc.stdin);
  wslProc.stdout.pipe(clientSocket);

  clientSocket.on('error', (err) => {
    console.error('[Bridge] Client socket error:', err.message);
    wslProc.kill();
  });

  wslProc.on('error', (err) => {
    console.error('[Bridge] WSL process error:', err.message);
    clientSocket.destroy();
  });

  wslProc.on('close', (code) => {
    clientSocket.end();
  });
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`[Bridge] PostgreSQL stdio bridge listening on 127.0.0.1:${LOCAL_PORT} -> WSL nc 127.0.0.1:5432`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
