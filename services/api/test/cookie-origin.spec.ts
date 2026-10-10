import express = require('express');
import request = require('supertest');
import { cookieOriginMiddleware } from '../src/security/cookie-origin.middleware';

describe('Cookie mutation origin enforcement over HTTP', () => {
  const app = express();
  app.use(cookieOriginMiddleware(origin => origin === 'https://family.example'));
  app.all('/mutation', (_req, res) => res.sendStatus(204));

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects missing Origin on %s with refresh cookie', async method => {
    await request(app)[method.toLowerCase()]('/mutation').set('Cookie', 'other=1; refreshToken=secret').expect(403);
  });

  it.each(['null', 'https://attacker.example', 'https://family.example.attacker.example'])('rejects untrusted Origin %s', async origin => {
    await request(app).post('/mutation').set('Cookie', 'refreshToken=secret').set('Origin', origin).expect(403);
  });

  it('allows explicitly trusted cookie mutations', async () => {
    await request(app).post('/mutation').set('Cookie', 'refreshToken=secret').set('Origin', 'https://family.example').expect(204);
  });

  it('preserves native bearer requests and safe reads', async () => {
    await request(app).post('/mutation').set('Authorization', 'Bearer native').expect(204);
    await request(app).get('/mutation').set('Cookie', 'refreshToken=secret').expect(204);
    await request(app).post('/mutation').set('Cookie', 'notrefreshToken=other').expect(204);
  });
});
