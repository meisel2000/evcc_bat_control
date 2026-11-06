'use strict';

// In-process fake of the evcc REST API (0.2.0) used by scenarios. It records
// every request so steps can assert on what the job sent, and it serves a
// mutable battery state so steps can simulate a charging battery.

const http = require('node:http');

class FakeEvcc {
  constructor() {
    this.state = { batteryMode: 'normal', battery: { soc: 50 } };
    this.requests = [];
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.url = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const { port } = this.server.address();
        this.url = `http://127.0.0.1:${port}`;
        resolve(this.url);
      });
    });
  }

  stop() {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  reset(state = {}) {
    this.state = { batteryMode: 'normal', battery: { soc: 50 }, ...state };
    this.requests = [];
  }

  setBatterySoc(soc) {
    this.state.battery = { ...this.state.battery, soc };
  }

  handle(req, res) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      this.requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization ?? null,
        body,
      });
      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(payload === undefined ? '' : JSON.stringify(payload));
      };
      if (req.method === 'GET' && req.url === '/state') {
        return send(200, this.state);
      }
      if (req.method === 'POST' && req.url === '/batterymode/charge') {
        this.state.batteryMode = 'charge';
        return send(200);
      }
      if (req.method === 'POST' && req.url === '/batterymode/normal') {
        this.state.batteryMode = 'normal';
        return send(200);
      }
      if (req.method === 'DELETE' && req.url === '/batterymode') {
        this.state.batteryMode = 'normal';
        return send(200);
      }
      send(404, { error: 'not found' });
    });
  }
}

module.exports = { FakeEvcc };
