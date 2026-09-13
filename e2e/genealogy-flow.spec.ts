import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

test.describe('End-to-End Genealogy, Tree & Duplicate Governance Flow (Milestone 3)', () => {
  const adminPhone = '9800000001';

  async function loginAsAdmin(page: any): Promise<{ token: string; branchId: string }> {
    await page.goto('/login');
    await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
      data: { phoneNumber: adminPhone },
    });
    await page.fill('input[type="tel"]', adminPhone);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible({ timeout: 10000 });
    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${adminPhone}`);
    expect(otpRes.ok()).toBeTruthy();
    const { otp } = await otpRes.json();
    await page.fill('input[type="text"]', otp);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();
    await expect(page.locator('text=Super Admin')).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('kashyap_admin_access_token'));
    expect(token).toBeTruthy();

    const branchesRes = await page.request.get(`${API_BASE}/genealogy/branches`);
    expect(branchesRes.ok()).toBeTruthy();
    const branches = await branchesRes.json();
    const branchId = branches[0]?.id || 'b-kaski';

    return { token: token as string, branchId };
  }

  test('1. Person Creation with Duplicate Pre-Evaluation, Warning Appearance, Override, and Database Persistence', async ({ page }) => {
    const { token, branchId } = await loginAsAdmin(page);

    // 1. Seed existing anchor person to guarantee live duplicate candidate detection
    const rand = Math.floor(100000 + Math.random() * 900000);
    const anchorNameNe = `देवराज${rand}`;
    const anchorNameEn = `Devraj${rand}`;

    const seedRes = await page.request.post(`${API_BASE}/genealogy/people`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        names: [
          { language: 'ne', firstName: anchorNameNe, lastName: 'अधिकारी', fullName: `${anchorNameNe} अधिकारी`, isPrimary: true },
          { language: 'en', firstName: anchorNameEn, lastName: 'Adhikari', fullName: `${anchorNameEn} Adhikari`, isPrimary: false },
        ],
        gender: 'MALE',
        livingStatus: 'LIVING',
        generation: 3,
        branchId,
        allowDuplicateOverride: true,
        justificationReason: 'Deterministic E2E seed anchor for duplicate detection',
      },
    });
    if (!seedRes.ok()) {
      console.error('seedRes failed:', seedRes.status(), await seedRes.text());
    }
    expect(seedRes.ok()).toBeTruthy();
    const seededPerson = await seedRes.json();
    expect(seededPerson.id).toBeDefined();

    // 2. Navigate to People Management
    await page.click('a[href="/people"]');
    await expect(page).toHaveURL(/\/people/);
    await expect(page.locator('h2:has-text("वंशावली सूची")')).toBeVisible();

    // 3. Open Add Person Modal
    await page.click('button:has-text("नयाँ व्यक्ति थप्नुहोस् (Add Person)")');
    await expect(page.locator('h3:has-text("नयाँ व्यक्ति दर्ता (Register New Person)")')).toBeVisible();

    // 4. Fill form with matching name to deterministically trigger duplicate warning
    await page.fill('input[placeholder*="राम प्रसाद"]', anchorNameNe);
    await page.fill('input[placeholder*="Ram Prasad"]', anchorNameEn);
    await page.fill('textarea[placeholder*="स्थानीय शाखा"]', 'पुष्टि गरिएको नयाँ व्यक्ति - शाखा दर्ता');

    // Wait for live duplicate evaluation and assert warning box unconditionally appears
    const warningBox = page.locator('text=सम्भावित दोहोरिएको रेकर्ड भेटियो');
    await expect(warningBox).toBeVisible({ timeout: 10000 });

    // Assert override checkbox is rendered
    const overrideCheckbox = page.locator('input[type="checkbox"]');
    await expect(overrideCheckbox).toBeVisible();

    // Explicitly toggle allowDuplicateOverride checkbox
    await overrideCheckbox.check();
    expect(await overrideCheckbox.isChecked()).toBe(true);

    // 5. Submit form
    await page.click('button:has-text("सुरक्षित गर्नुहोस् (Save Person)")');

    // 6. Assert modal closes
    await expect(page.locator('h3:has-text("नयाँ व्यक्ति दर्ता (Register New Person)")')).not.toBeVisible({ timeout: 10000 });

    // 7. Verify persisted record via API
    const verifyRes = await page.request.get(`${API_BASE}/genealogy/search?query=${encodeURIComponent(anchorNameNe)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const searchData = await verifyRes.json();
    expect(searchData.total).toBeGreaterThanOrEqual(2); // Both anchor and newly created person exist
  });

  test('2. Interactive Family Tree Canvas Navigation, Ancestor Hierarchy & Relative Centering', async ({ page }) => {
    const { token, branchId } = await loginAsAdmin(page);

    // 1. Seed 3-generation lineage with distinct Sanskrit names to prevent substring collisions
    const seedSuffix = Math.floor(100000 + Math.random() * 900000);
    const gfName = `पितामह${seedSuffix}`;
    const fName = `जनक${seedSuffix}`;
    const sName = `नन्दन${seedSuffix}`;

    const gfRes = await page.request.post(`${API_BASE}/genealogy/people`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        names: [{ language: 'ne', firstName: gfName, lastName: 'अधिकारी', fullName: `${gfName} अधिकारी`, isPrimary: true }],
        gender: 'MALE',
        livingStatus: 'DECEASED',
        generation: 1,
        branchId,
        allowDuplicateOverride: true,
        justificationReason: 'Deterministic E2E Grandfather creation',
      },
    });
    if (!gfRes.ok()) {
      console.error('gfRes failed:', gfRes.status(), await gfRes.text());
    }
    expect(gfRes.ok()).toBeTruthy();
    const gf = await gfRes.json();

    const fRes = await page.request.post(`${API_BASE}/genealogy/people`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        names: [{ language: 'ne', firstName: fName, lastName: 'अधिकारी', fullName: `${fName} अधिकारी`, isPrimary: true }],
        gender: 'MALE',
        livingStatus: 'LIVING',
        generation: 2,
        branchId,
        allowDuplicateOverride: true,
        parentPersonIds: [{ personId: gf.id, parentType: 'FATHER' }],
        justificationReason: 'Deterministic E2E Father creation with parent link',
      },
    });
    if (!fRes.ok()) {
      console.error('fRes failed:', fRes.status(), await fRes.text());
    }
    expect(fRes.ok()).toBeTruthy();
    const f = await fRes.json();

    const sRes = await page.request.post(`${API_BASE}/genealogy/people`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        names: [{ language: 'ne', firstName: sName, lastName: 'अधिकारी', fullName: `${sName} अधिकारी`, isPrimary: true }],
        gender: 'MALE',
        livingStatus: 'LIVING',
        generation: 3,
        branchId,
        allowDuplicateOverride: true,
        parentPersonIds: [{ personId: f.id, parentType: 'FATHER' }],
        justificationReason: 'Deterministic E2E Son creation with parent link',
      },
    });
    if (!sRes.ok()) {
      console.error('sRes failed:', sRes.status(), await sRes.text());
    }
    expect(sRes.ok()).toBeTruthy();
    const s = await sRes.json();

    // 2. Navigate to Tree
    await page.click('a[href="/tree"]');
    await expect(page).toHaveURL(/\/tree/);
    await expect(page.locator('h2:has-text("अन्तरक्रियात्मक वंशावली रुख")')).toBeVisible();

    // 3. Search for Father and select as focus root
    const searchInput = page.locator('input[placeholder*="केन्द्र व्यक्ति"]');
    await searchInput.fill(fName);
    await page.waitForTimeout(500);

    const fOption = page.locator(`.divide-y > div:has-text("${fName}")`).first();
    await expect(fOption).toBeVisible({ timeout: 10000 });
    await fOption.click();
    await page.waitForTimeout(600);

    // 4. Assert Father is focus root and Grandfather is rendered in Ancestor hierarchy
    await expect(page.locator(`p:has-text("${fName}")`).first()).toBeVisible();
    await expect(page.locator(`p:has-text("${gfName}")`).first()).toBeVisible();

    // 5. Click Grandfather ancestor node on tree canvas to open drawer
    await page.locator(`p:has-text("${gfName}")`).first().click();
    await expect(page.locator('text=व्यक्ति सारांश (Summary)')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`h3:has-text("${gfName}")`)).toBeVisible();

    // 6. Click "यहाँबाट रुख विस्तार गर्नुहोस् (Center Here)" to recenter tree on Grandfather
    await page.click('button:has-text("यहाँबाट रुख विस्तार गर्नुहोस् (Center Here)")');
    await page.waitForTimeout(600);

    // Assert tree is now centered on Grandfather and Father is in descendants
    await expect(page.locator(`h3:has-text("${gfName}")`)).toBeVisible();
    await expect(page.locator(`p:has-text("${fName}")`).first()).toBeVisible();
  });

  test('3. Duplicate Queue Review, Side-by-Side Comparison Matrix, Governed Merge & Canonical Lookup', async ({ page }) => {
    const { token, branchId } = await loginAsAdmin(page);

    // 1. Seed two duplicate candidates and candidate queue entry
    const dupSuffix = Math.floor(100000 + Math.random() * 900000);
    const p1Res = await page.request.post(`${API_BASE}/genealogy/people`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        names: [{ language: 'ne', firstName: `कमल${dupSuffix}`, lastName: 'अधिकारी', fullName: `कमल${dupSuffix} अधिकारी`, isPrimary: true }],
        gender: 'MALE',
        livingStatus: 'LIVING',
        generation: 4,
        branchId,
        birthPlace: 'काठमाडौं',
        allowDuplicateOverride: true,
        justificationReason: 'Deterministic duplicate seed candidate 1',
      },
    });
    expect(p1Res.ok()).toBeTruthy();
    const p1 = await p1Res.json();

    const p2Res = await page.request.post(`${API_BASE}/genealogy/people`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        names: [{ language: 'ne', firstName: `कमल${dupSuffix}`, lastName: 'अधिकारी', fullName: `कमल${dupSuffix} अधिकारी`, isPrimary: true }],
        gender: 'MALE',
        livingStatus: 'LIVING',
        generation: 4,
        branchId,
        birthPlace: 'काठमाडौं',
        allowDuplicateOverride: true,
        justificationReason: 'Deterministic duplicate seed candidate 2',
      },
    });
    expect(p2Res.ok()).toBeTruthy();
    const p2 = await p2Res.json();

    // Allow background candidate scan to complete
    await page.waitForTimeout(1000);

    // 2. Navigate to Duplicates
    await page.click('a[href="/duplicates"]');
    await expect(page).toHaveURL(/\/duplicates/);
    await expect(page.locator('h2:has-text("दोहोरिएको रेकर्ड व्यवस्थापन")')).toBeVisible();

    // 3. Search/find the duplicate candidate in table
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('DETECTED');
    await page.waitForTimeout(500);

    // 4. Assert comparison matrix modal opens when clicking Compare
    const compareBtn = page.locator('button:has-text("तुलना र एकीकरण (Compare & Merge)")').first();
    await expect(compareBtn).toBeVisible({ timeout: 10000 });
    await compareBtn.click();

    // Assert side-by-side comparison modal is open
    await expect(page.locator('text=दोहोरिएको रेकर्ड तुलना तथा एकीकरण')).toBeVisible({ timeout: 10000 });

    // 5. Fill justification reason and perform governed merge
    const justificationInput = page.locator('textarea[placeholder*="दुवै रेकर्ड एउटै व्यक्ति"]');
    await justificationInput.fill('प्रमाणित एउटै व्यक्ति - ऐतिहासिक अभिलेख एकीकरण स्वचालन परीक्षण');

    const mergeBtn = page.locator('button:has-text("एकीकरण पुष्टि गर्नुहोस् (Execute Merge)")');
    await expect(mergeBtn).toBeVisible();
    await mergeBtn.click();

    // 6. Assert modal closes after merge
    await expect(page.locator('text=दोहोरिएको रेकर्ड तुलना तथा एकीकरण')).not.toBeVisible({ timeout: 10000 });

    // 7. Verify canonical redirection / merge pointer via API
    const [lookup1, lookup2] = await Promise.all([
      page.request.get(`${API_BASE}/genealogy/people/${p1.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      page.request.get(`${API_BASE}/genealogy/people/${p2.id}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    expect(lookup1.ok()).toBeTruthy();
    expect(lookup2.ok()).toBeTruthy();
    const d1 = await lookup1.json();
    const d2 = await lookup2.json();

    const isMergeRedirectCorrect =
      (d1.id === d2.canonicalPersonId && !d1.canonicalPersonId) ||
      (d2.id === d1.canonicalPersonId && !d2.canonicalPersonId);
    expect(isMergeRedirectCorrect).toBe(true);
  });

  test('4. Privacy-Filtered Export Functionality (JSON & CSV Content Inspection)', async ({ page }) => {
    await loginAsAdmin(page);

    // 1. Navigate to People
    await page.click('a[href="/people"]');
    await expect(page).toHaveURL(/\/people/);

    // 2. Test JSON Export download and inspect payload structure
    const jsonDownloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export JSON")');
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toContain('.json');

    const jsonStream = await jsonDownload.createReadStream();
    const jsonChunks: Buffer[] = [];
    for await (const chunk of jsonStream) {
      jsonChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const jsonContent = JSON.parse(Buffer.concat(jsonChunks).toString('utf8'));
    expect(jsonContent.totalRecords).toBeGreaterThan(0);
    expect(Array.isArray(jsonContent.persons)).toBe(true);
    expect(Array.isArray(jsonContent.parentLinks)).toBe(true);
    expect(Array.isArray(jsonContent.spouseLinks)).toBe(true);

    // 3. Test CSV Export download and inspect CSV headers and rows
    const csvDownloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export CSV")');
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toContain('.csv');

    const csvStream = await csvDownload.createReadStream();
    const csvChunks: Buffer[] = [];
    for await (const chunk of csvStream) {
      csvChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const csvContent = Buffer.concat(csvChunks).toString('utf8');
    expect(csvContent).toContain('id,primaryNameNepali,primaryNameEnglish');
    expect(csvContent.split('\n').length).toBeGreaterThan(1);
  });
});
