import fs from 'fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
const sql = postgres(env.DATABASE_URL, { max: 1 });

async function fixPricePrecision() {
  try {
    await sql`ALTER TABLE "market_prices" ALTER COLUMN "price" TYPE numeric(18, 4);`;
    const cols = await sql`
      SELECT column_name, data_type, numeric_precision, numeric_scale 
      FROM information_schema.columns 
      WHERE table_name = 'market_prices' 
        AND column_name IN ('price', 'previous_close', 'day_change', 'high', 'low', 'price_type');
    `;
    console.log('Updated column specifications:');
    cols.forEach(c => console.log(`- ${c.column_name}: ${c.data_type}(${c.numeric_precision}, ${c.numeric_scale})`));
    await sql.end();
  } catch (err) {
    console.error(err);
    await sql.end();
  }
}

fixPricePrecision();
