describe('Production database module without development-only dependencies', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.dontMock('pg-mem'); });

  function withoutMemoryEngine() {
    let DatabaseService: any;
    jest.isolateModules(() => {
      jest.doMock('pg-mem', () => { throw new Error('Development engine excluded from deployed package'); });
      DatabaseService = require('../src/database/database.service').DatabaseService;
    });
    return new DatabaseService();
  }

  it('loads the real runtime module when the optional test engine is unavailable', () => {
    expect(withoutMemoryEngine()).toBeDefined();
  });

  it('rejects production memory mode before loading the absent test dependency', async () => {
    const db = withoutMemoryEngine();
    process.env.NODE_ENV = 'production'; process.env.USE_PG_MEM = 'true';
    await expect(db.onModuleInit()).rejects.toThrow('USE_PG_MEM is strictly prohibited in production');
    expect(db.isReady()).toBe(false);
  });

  it('requests the optional engine only for explicitly enabled non-production tests', async () => {
    const db = withoutMemoryEngine();
    process.env.NODE_ENV = 'test'; process.env.USE_PG_MEM = 'true';
    await expect(db.onModuleInit()).rejects.toThrow('Development engine excluded from deployed package');
    expect(db.isReady()).toBe(false);
  });
});
