const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Import monitoring scheduler
const { startScheduler, stopAllTasks } = require('./src/scheduler');
const db = require('./src/storage/database');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || process.env.OUTPOST_PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server;

app.prepare().then(() => {
  // Start the monitoring scheduler
  console.log('Starting monitoring scheduler...');
  startScheduler();

  server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }).listen(port, hostname, () => {
    console.log(`> Outpost running on http://${hostname}:${port}`);
  });
});

// Handle graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 10000;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);

  // A hung speedtest or keep-alive connection must not block exit forever.
  setTimeout(() => {
    console.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  stopAllTasks();

  const finish = () => {
    try {
      db.close();
    } catch (err) {
      console.error('Error closing database:', err);
    }
    process.exit(0);
  };

  if (server) {
    server.close(finish);
    server.closeIdleConnections();
  } else {
    finish();
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
