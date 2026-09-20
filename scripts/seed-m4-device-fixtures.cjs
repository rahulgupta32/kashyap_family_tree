'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Client } = require('../services/api/node_modules/pg');

const base = process.env.API_BASE || 'http://127.0.0.1:3010';
async function api(path, token, data) {
  const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) });
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
async function login(phoneNumber) {
  await api('/auth/test-clear-cooldown', null, { phoneNumber });
  const challenge = await api('/auth/otp/request', null, { phoneNumber });
  const { otp } = await api(`/auth/test-otp?phoneNumber=${encodeURIComponent(phoneNumber)}`);
  return api('/auth/native/verify', null, { otpSessionId: challenge.otpSessionId, code: otp,
    deviceInfo: { deviceId: randomUUID(), platform: 'android', appVersion: 'device-fixture' } });
}

async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  const expected = process.env.DB_NAME;
  assert(/^kashyap_(test|iso)_[a-z0-9_]+$/.test(expected || ''), 'Explicit disposable test DB required');
  const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: expected });
  await db.connect();
  try {
    assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, expected);
    const admin = await login('+9779800000001');
    const branch = (await api('/genealogy/branches')).find(b => b.code === 'KASKI');
    assert(branch);
    const tag = `Device${Date.now().toString().slice(-6)}`;
    async function person(label, generation, year) {
      return api('/genealogy/people', admin.accessToken, {
        names: [{ language: 'ne', firstName: label, lastName: 'अधिकारी', fullName: `${label} अधिकारी`, isPrimary: true },
          { language: 'en', firstName: `${tag} ${label}`, lastName: 'Adhikari', fullName: `${tag} ${label} Adhikari`, isPrimary: true }],
        gender: 'MALE', livingStatus: 'LIVING', generation, branchId: branch.id, birthYearBs: year,
        justificationReason: 'Fictional Android acceptance fixture in a disposable CI database.', allowDuplicateOverride: true,
      });
    }
    await person('पहिलो', 1, 2000);
    const parent = await person('पितामह', 2, 2010);
    const root = await person('जनक', 3, 2040);
    const child = await person('नन्दन', 4, 2060);
    await api(`/genealogy/people/${root.id}/parents`, admin.accessToken, { parentId: parent.id, parentType: 'BIOLOGICAL' });
    await api(`/genealogy/people/${child.id}/parents`, admin.accessToken, { parentId: root.id, parentType: 'BIOLOGICAL' });
    const event = await api('/calendar/events', admin.accessToken, {
      title: `Fictional Android gathering ${tag}`, eventType: 'GENERAL_EVENT', audienceScope: 'COMMUNITY', solarDate: '2083-08-15',
    });
    const phone = '+9779847100099';
    const member = await login(phone);
    await api('/auth/roles/assign', admin.accessToken, { userId: member.user.id, role: 'VERIFIED_MEMBER', branchId: branch.id });
    await api('/auth/test-clear-cooldown', null, { phoneNumber: phone });
    const rows = await db.query('SELECT id, parent_id, child_id, confidence FROM parent_links WHERE child_id = ANY($1::uuid[])', [[root.id, child.id]]);
    assert.equal(rows.rows.length, 2);
    assert(rows.rows.every(r => r.confidence === 'VERIFIED'));
    const defs = { API_BASE_URL: 'http://10.0.2.2:3010', M4_PHONE: phone, M4_SEARCH: tag,
      M4_ROOT: root.id, M4_PARENT: parent.id, M4_CHILD: child.id, M4_EVENT: event.id };
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/m4-device-defines.json', JSON.stringify(defs, null, 2));
    fs.writeFileSync('test-results/m4-device-fixtures.json', JSON.stringify({ database: expected, ...defs, verifiedLinks: rows.rows }, null, 2));
    console.log(`Seeded fictional device fixtures in ${expected}: root=${root.id}, parent=${parent.id}, child=${child.id}, event=${event.id}`);
  } finally { await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
