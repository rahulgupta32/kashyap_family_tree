import { Request, Response, NextFunction } from 'express';

/** CORS may allow requests without Origin; cookie mutations must not. */
export function cookieOriginMiddleware(isOriginAllowed: (origin: string) => boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const hasRefreshCookie = /(?:^|;\s*)refreshToken=/.test(req.headers.cookie || '');
    if (mutating && hasRefreshCookie) {
      const origin = req.headers.origin;
      if (!origin || origin === 'null' || !isOriginAllowed(origin)) {
        return res.status(403).json({
          success: false,
          errorCode: 'AUTH_1010',
          message: 'Forbidden: Request origin is untrusted or missing for cookie-authenticated mutation.',
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
        });
      }
    }
    next();
  };
}
