'use strict';

// Runs the one-shot application (src/main.ts) as a child process for a
// scenario. Writes the config file to a temp path, passes the API key via the
// environment, and returns the exit code and captured output.

const { spawn } = require('node:child_process');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const APP_ENTRY = path.resolve(__dirname, '..', '..', 'src', 'main.ts');
const TEST_API_KEY = 'evcc_test_key_for_acceptance';

// Starts the app without waiting for it to exit. Returns the child process
// (so a step can observe it or stop it) and a promise for the final result.
async function startApp(evccUrl, settings = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'evcc-accept-'));
  const configPath = path.join(dir, 'config.json');
  const config = { evccUrl, targetSoc: 90, ...settings };
  await writeFile(configPath, JSON.stringify(config));

  const child = spawn(process.execPath, [APP_ENTRY, configPath], {
    env: { ...process.env, EVCC_API_KEY: TEST_API_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const result = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
  return { child, result };
}

async function runApp(evccUrl, settings = {}) {
  const { result } = await startApp(evccUrl, settings);
  return result;
}

module.exports = { runApp, startApp, TEST_API_KEY };
