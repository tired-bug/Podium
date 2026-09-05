import fs from 'fs';
import os from 'os';
import path from 'path';

// Give every test run its own throwaway SQLite file so tests never touch
// real dev/prod data and can be run repeatedly/in parallel across machines.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podium-test-'));
process.env.PODIUM_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
