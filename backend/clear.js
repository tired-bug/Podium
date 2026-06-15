const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/podium.db');
db.exec("DELETE FROM selfhosted_deployments");
console.log('Cleared');
