import { test, expect, request as requestFactory, APIResponse, Page } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { API, login, headers } from './helpers/auth';

async function checked(response: APIResponse) {
  expect(response.ok(), `${response.url()} returned ${response.status()}`).toBeTruthy();
  return response.json();
}

// No route interception: every read below crosses Chromium -> NestJS -> PostgreSQL.
test('live claim reads enforce ownership and branch authority without private cache or denied-response leakage', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}`;
  const api = await requestFactory.newContext({ extraHTTPHeaders: { Origin: origin } });
  const reviewerContext = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  async function member() {
    const phoneNumber = `984${randomInt(1000000, 9999999)}`;
    const challenge = await checked(await api.post(`${API}/auth/otp/request`, { data: { phoneNumber } }));
    const { otp } = await checked(await api.get(`${API}/auth/test-otp`, { params: { phoneNumber } }));
    return checked(await api.post(`${API}/auth/native/verify`, {
      headers: { Origin: '', Cookie: '' }, data: { otpSessionId: challenge.otpSessionId, code: otp,
        deviceInfo: { deviceId: randomUUID(), platform: 'android', appVersion: 'fictional-browser-acceptance' } },
    }));
  }
  async function read(client: Page, path: string, token?: string) {
    return client.evaluate(async ({ url, token }) => {
      const response = await fetch(url, { credentials: 'omit', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.text() };
    }, { url: `${API}${path}`, token });
  }
  try {
    await login(page);
    const branches = await checked(await api.get(`${API}/genealogy/branches`));
    const ownBranch = branches.find((b: any) => b.code === 'KASKI');
    const foreignBranch = branches.find((b: any) => b.code === 'LAMJUNG');
    expect(ownBranch).toBeTruthy(); expect(foreignBranch).toBeTruthy();
    const owners = [await member(), await member()];
    const markers = [`Private fictional Kaski ${randomUUID()}`, `Private fictional Lamjung ${randomUUID()}`];
    const claims: any[] = [];
    for (const [index, branch] of [ownBranch, foreignBranch].entries()) {
      const name = `Fictional claim privacy ${randomUUID()}`;
      const person = await checked(await api.post(`${API}/genealogy/people`, { headers: await headers(page), data: {
        names: [{ language: 'en', firstName: name, lastName: 'Adhikari', fullName: `${name} Adhikari`, isPrimary: true }],
        gender: 'MALE', livingStatus: 'LIVING', generation: 3, branchId: branch.id,
        justificationReason: 'Isolated fictional branch privacy acceptance', allowDuplicateOverride: true,
      } }));
      claims.push(await checked(await api.post(`${API}/claims`, { headers: { Authorization: `Bearer ${owners[index].accessToken}` }, data: {
        creationKey: randomUUID(), targetPersonId: person.id, relationshipDescription: markers[index], statementOfTruth: true,
      } })));
    }
    const own = await read(page, `/claims/${claims[0].id}`, owners[0].accessToken);
    expect(own.status).toBe(200); expect(own.cache).toContain('private'); expect(own.cache).toContain('no-store');
    expect(JSON.parse(own.body)).toMatchObject({ id: claims[0].id, relationshipDescription: markers[0] });
    const anonymous = await read(page, `/claims/${claims[0].id}`);
    const unrelated = await read(page, `/claims/${claims[0].id}`, owners[1].accessToken);
    expect(anonymous.status).toBe(401); expect(unrelated.status).toBe(403);
    for (const denied of [anonymous, unrelated]) {
      for (const marker of markers) expect(denied.body).not.toContain(marker);
    }
    const reviewer = await reviewerContext.newPage();
    await login(reviewer, '9800000002');
    await reviewer.goto('/claims');
    const token = (await headers(reviewer)).Authorization.replace('Bearer ', '');
    const allowed = await read(reviewer, `/claims/${claims[0].id}`, token);
    expect(allowed.status).toBe(200); expect(allowed.cache).toContain('private'); expect(allowed.cache).toContain('no-store');
    expect(JSON.parse(allowed.body).relationshipDescription).toBe(markers[0]);
    const denied = await read(reviewer, `/claims/${claims[1].id}`, token);
    expect(denied.status).toBe(403); expect(denied.body).not.toContain(markers[1]);
    const list = await read(reviewer, '/claims', token);
    expect(list.status).toBe(200); expect(list.cache).toContain('no-store');
    expect(JSON.parse(list.body).map((c: any) => c.id)).toContain(claims[0].id);
    expect(list.body).not.toContain(claims[1].id); expect(list.body).not.toContain(markers[1]);
    const foreign = await read(reviewer, `/claims?branchId=${foreignBranch.id}`, token);
    expect(foreign.status).toBe(403); expect(foreign.body).not.toContain(markers[1]);
    await expect(reviewer.getByRole('cell', { name: markers[0], exact: true })).toBeVisible();
    await expect(reviewer.getByText(markers[1], { exact: true })).toHaveCount(0);
  } finally {
    await reviewerContext.close(); await api.dispose();
  }
});
