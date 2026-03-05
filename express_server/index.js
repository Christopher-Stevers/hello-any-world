import express from 'express';
import { greet } from 'express_utils';
import { getDb } from 'express_db';

const app = express();
const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
  const db = getDb();
  res.send(`${greet('World')} (db: ${db.status})`);
});

app.listen(PORT, () => {
  console.log(`Express server listening on http://localhost:${PORT}`);
});
