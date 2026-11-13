// Point config + SQLite at a throwaway dir. src/ reads OUTPOST_DATA_DIR at
// require time, so require this first. node --test runs each file in its own
// process, so every test file gets a fresh DB and fresh singletons.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.OUTPOST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'outpost-test-'));
process.on('exit', () => fs.rmSync(process.env.OUTPOST_DATA_DIR, { recursive: true, force: true }));
