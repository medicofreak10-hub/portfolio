// My Halal Portfolio — local server. READ-ONLY: this app never places trades.
import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { config } from './config.js';
import * as store from './lib/store.js';
import routes from './routes.js';
import * as jobs from './jobs.js';

store.load();
const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
app.use('/api', routes);

const dist = path.join(config.root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (req, res) => res.type('text').send('Frontend not built yet. Run "npm run build" then "npm start", or use "npm run dev".'));
}

const server = app.listen(config.port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  My Halal Portfolio running (${config.dataMode === 'demo' ? 'DEMO DATA' : 'live data'})`);
  console.log(`  On this computer:  http://localhost:${config.port}`);
  for (const ip of ips) console.log(`  On your phone (same Wi-Fi): http://${ip}:${config.port}`);
  console.log('');
  if (!config.disableJobs) jobs.start();
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.flush(); server.close(); process.exit(0); });
export default app;
