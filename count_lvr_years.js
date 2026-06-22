const Database = require('better-sqlite3');
const db = new Database('./prisma/foreclosure.db', { readonly: true });

const rows = db.prepare(
  "SELECT substr(tx_date_iso,1,4) as yr, COUNT(*) as n FROM lvr_land GROUP BY yr ORDER BY yr"
).all();
rows.forEach(r => console.log(r.yr, Number(r.n).toLocaleString()));

const total = db.prepare('SELECT COUNT(*) as n FROM lvr_land').get();
console.log('Total:', Number(total.n).toLocaleString());
db.close();
