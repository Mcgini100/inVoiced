/**
 * One-off import of the prototype's SQLite data into Postgres.
 *
 *   npm run import:legacy -- prisma/dev.db 0771234567
 *
 * Creates the account for that phone number if it does not exist, then copies every
 * transaction it can map. Rows it cannot map safely are listed and skipped, never guessed.
 * Run it once: running it twice imports the rows twice.
 */
import { DatabaseSync } from "node:sqlite";
import { normalisePhone } from "../src/lib/phone";
import { getPrisma } from "../src/server/db";
import { type LegacyRow, mapLegacyRow } from "../src/server/legacy";
import { PrismaRepo } from "../src/server/repo/prisma";

async function main() {
  const [file, phoneArg] = process.argv.slice(2);
  if (!file || !phoneArg) {
    console.error("Usage: npm run import:legacy -- <path-to-dev.db> <phone-number>");
    process.exit(1);
  }
  const phone = normalisePhone(phoneArg);
  const sqlite = new DatabaseSync(file, { readOnly: true });
  const rows = sqlite.prepare('SELECT * FROM "Transaction" ORDER BY "createdAt" ASC').all() as unknown as LegacyRow[];
  const settings = sqlite.prepare('SELECT "streetRateZWG" FROM "UserSettings" LIMIT 1').get() as { streetRateZWG?: number } | undefined;
  sqlite.close();

  const repo = new PrismaRepo(getPrisma());
  const { businessId } = await repo.findOrCreateUser(phone, "My business");
  const business = repo.forBusiness(businessId);

  let imported = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const mapped = mapLegacyRow(row);
    if (!mapped.ok) {
      skipped.push(`${row.id}: ${mapped.reason}`);
      continue;
    }
    await business.createTransaction(mapped.data);
    imported += 1;
  }

  console.log(`Imported ${imported} of ${rows.length} transactions for ${phone}.`);
  if (settings?.streetRateZWG) console.log(`The old rate was ${settings.streetRateZWG}. Set "My rate" in the app if it is still right.`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  await getPrisma().$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
