const net = require('net');
const { spawn } = require('child_process');

const LOCAL_PORT = 5432;

const server = net.createServer((clientSocket) => {
  clientSocket.setNoDelay(true);
  clientSocket.setKeepAlive(true, 1000);

  // Spawn socat inside WSL bridging stdio directly to PostgreSQL on localhost:5432
  const wslProc = spawn('wsl', ['-u', 'root', '-d', 'Ubuntu', '--', 'socat', 'STDIO', 'TCP:127.0.0.1:5432']);

  clientSocket.pipe(wslProc.stdin);
  wslProc.stdout.pipe(clientSocket);

  const cleanup = () => {
    try { wslProc.kill(); } catch (e) {}
    try { clientSocket.destroy(); } catch (e) {}
  };

  clientSocket.on('error', cleanup);
  wslProc.on('error', cleanup);
  wslProc.on('close', () => clientSocket.end());
  clientSocket.on('close', cleanup);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`[Bridge] PostgreSQL stdio bridge listening on 127.0.0.1:${LOCAL_PORT} -> WSL nc 127.0.0.1:5432`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
