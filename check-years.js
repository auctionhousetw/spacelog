const db = require('better-sqlite3')('prisma/foreclosure.db', { readonly: true });
const rows = db.prepare(`
  SELECT SUBSTR(tx_date_iso,1,4) as yr, COUNT(*) as n
  FROM lvr_land WHERE tx_date_iso IS NOT NULL
  GROUP BY yr ORDER BY yr
`).all();
let total = 0;
rows.forEach(r => { total += Number(r.n); console.log(r.yr, Number(r.n).toLocaleString()); });
console.log('Total:', total.toLocaleString());
db.close();
