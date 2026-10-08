import app from '../server/src/app.js';

export default function handler(req, res) {
  const forwarded = req.headers['x-forwarded-uri'] || req.headers['x-original-url'] || req.headers['x-invoke-path'];
  if (typeof forwarded === 'string' && forwarded.startsWith('/api') && !String(req.url || '').startsWith('/api/v1')) {
    req.url = forwarded;
  }
  return app(req, res);
}
