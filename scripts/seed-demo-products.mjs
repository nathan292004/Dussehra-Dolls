import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, 'artifacts/api-server/.env'));
const databaseUrl = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) || databaseUrl.port !== '5433') {
  throw new Error('Sample inventory is restricted to the local development database on port 5433.');
}
const require = createRequire(path.join(root, 'lib/db/package.json'));
const { Client } = require('pg');
const products = [
  ['ganesha', 'Ganesha Clay Golu Doll', 'Traditional', 649, 799, 24, true, 'A cheerful seated Ganesha illustration, inspired by painted clay Golu dolls.'],
  ['krishna', 'Flute Krishna Doll', 'Traditional', 899, 1099, 18, true, 'A blue Krishna doll with a flute and peacock feather, for a festive Golu display.'],
  ['lakshmi', 'Lotus Lakshmi Doll', 'Traditional', 999, 1299, 16, true, 'Lakshmi seated on a pink lotus, with a red sari and golden crown.'],
  ['saraswati', 'Saraswati Veena Doll', 'Traditional', 1099, 1399, 12, true, 'A white-and-gold Saraswati doll holding a veena.'],
  ['durga', 'Durga Festival Doll', 'Collector', 1499, 1799, 8, false, 'A festive Durga doll in a red sari, with a trident and lotus.'],
  ['shiva', 'Shiva Meditation Doll', 'Modern', 849, 999, 20, false, 'A serene blue Shiva doll with a crescent moon and trident.'],
  ['hanuman', 'Hanuman Mini Doll', 'Miniature', 449, 549, 30, false, 'A small Hanuman doll with a golden mace and bright saffron clothing.'],
  ['rama', 'Lord Rama Golu Doll', 'Traditional', 799, 999, 15, false, 'A blue Lord Rama doll with a bow, crown and green dhoti.'],
  ['murugan', 'Murugan Vel Doll', 'Collector', 1199, 1499, 10, false, 'Murugan with a golden vel and a peacock-inspired colour palette.'],
  ['balakrishna', 'Little Krishna Butter Doll', 'Children', 499, 649, 25, false, 'A playful little Krishna doll beside a butter pot.'],
  ['vishnu', 'Vishnu Temple Doll', 'Collector', 1599, 1899, 6, false, 'A crowned Vishnu doll in blue and gold, with a conch and chakra.'],
  ['ganesha-mini', 'Mini Ganesha Desk Doll', 'Miniature', 349, 449, 35, false, 'A compact Ganesha doll in warm terracotta colours.'],
];
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  let inserted = 0;
  for (const [slug, name, category, price, originalPrice, stock, featured, description] of products) {
    const serial = `DEMO-GOLU-${slug.toUpperCase()}`;
    const result = await client.query(`
      INSERT INTO products (name, description, category, price, original_price, stock,
        is_featured, is_listed, image_url, tags, serial_number, location)
      SELECT $1,$2,$3,$4,$5,$6,$7,true,$8,$9::jsonb,$10,'Demo shelf'
      WHERE NOT EXISTS (SELECT 1 FROM products WHERE serial_number = $10)
    `, [name, `${description}\n\nSample product for testing. Illustration, prices and stock are placeholders.`,
      category, price, originalPrice, stock, featured,
      `/api/uploads/demo/${slug}.png`,
      JSON.stringify(['Demo', 'Golu', 'God dolls']), serial]);
    inserted += result.rowCount;
    // Migrate the initial browser-only demo URLs without changing edited products.
    await client.query('UPDATE products SET image_url=$1 WHERE serial_number=$2 AND image_url=$3',
      [`/api/uploads/demo/${slug}.png`, serial, `http://localhost:3001/api/uploads/demo/${slug}.png`]);
  }
  await client.query('COMMIT');
  console.log(`Added ${inserted} sample god dolls. Existing inventory was preserved.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
