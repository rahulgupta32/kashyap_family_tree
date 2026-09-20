'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { gzipSync } = require('node:zlib');
const { MalwareScannerService } = require('../services/api/dist/modules/profile/malware-scanner.service');

async function daemonVersion() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: process.env.CLAMAV_HOST, port: Number(process.env.CLAMAV_PORT || 3310) });
    let value = '';
    socket.setTimeout(10000);
    socket.on('connect', () => socket.write('zVERSION\0'));
    socket.on('data', chunk => { value += chunk.toString(); });
    socket.on('end', () => resolve(value.replace(/\0/g, '').trim()));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('VERSION timeout')); });
    socket.on('error', reject);
  });
}

async function main() {
  assert(process.env.CLAMAV_HOST, 'A real CLAMAV_HOST is required');
  assert.equal(process.env.NODE_ENV, 'production', 'Test scanner fallback must be disabled');
  assert.notEqual(process.env.SIMULATE_SCANNER_FAILURE, 'true');
  const scanner = new MalwareScannerService();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64');
  const unavailable = process.argv.includes('--unavailable');
  const version = unavailable ? null : await daemonVersion();
  const clean = await scanner.scanFile(png, 'fictional-clean.png');
  assert.equal(clean.evidence.scanner, 'ClamAV-Daemon-TCP');
  assert.equal(clean.status, unavailable ? 'SCANNER_FAILED' : 'CLEAN');
  let infected = null;
  if (!unavailable) {
    // Compress the harmless standard antivirus test fixture so the local literal
    // heuristic cannot satisfy this check. The real daemon must inspect it.
    const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    const compressed = gzipSync(eicar);
    assert(!compressed.includes(Buffer.from('EICAR-STANDARD')));
    infected = await scanner.scanFile(compressed, 'antivirus-test.txt.gz');
    assert.equal(infected.evidence.scanner, 'ClamAV-Daemon-TCP');
    assert.equal(infected.status, 'INFECTED');
    assert(infected.threatName);
  }
  fs.mkdirSync('test-results', { recursive: true });
  const evidence = { commit: process.env.GITHUB_SHA || null, daemonVersion: version,
    mode: unavailable ? 'daemon-stopped' : 'live-daemon', clean, infected };
  fs.writeFileSync(`test-results/clamav-${unavailable ? 'unavailable' : 'live'}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ mode: evidence.mode, daemonVersion: version, clean: clean.status, infected: infected?.status }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
