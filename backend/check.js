const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/podium.db');
const rows = db.prepare('SELECT name, status, url, logs FROM selfhosted_deployments').all();
rows.forEach(r => {
  console.log(r.name, r.status, r.url);
  JSON.parse(r.logs).forEach(l => console.log(' ', l.time, l.message));
});
