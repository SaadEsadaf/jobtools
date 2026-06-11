require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runCampaign, getTopLeads, sendWorldCupCampaign, validateAndScore } = require('../server/services/worldCupCampaign');
const { getDb } = require('../server/db');
const dns = require('dns').promises;

async function main() {
  console.log('=== WORLD CUP 2026 CAMPAIGN ===\n');

  // Step 1: Validate all unvalidated leads
  console.log('Step 1: Validating emails...');
  const { validateLeads } = require('../server/services/worldCupCampaign');
  const validation = await validateLeads();
  console.log(`  ${validation.validated} emails validated`);
  for (const [p, c] of Object.entries(validation.byPriority)) {
    if (c > 0) console.log(`  P${p}: ${c}`);
  }
  console.log(`  Failed (invalid): ${validation.failed}\n`);

  // Step 2: Show the top 9 leads
  console.log('Step 2: Top 9 validated leads for World Cup campaign:');
  const db = getDb();
  const top = db.prepare(`
    SELECT email, name, first_name, COALESCE(intent_score, 0) as score, source, notes 
    FROM leads 
    WHERE email IS NOT NULL AND email != ''
      AND intent_score IS NOT NULL AND intent_score > 0
      AND (notes IS NULL OR notes NOT LIKE '%no_mx%' OR notes NOT LIKE '%invalid%')
    ORDER BY intent_score DESC, id ASC
    LIMIT 9
  `).all();
  
  if (top.length === 0) {
    console.log('  No validated leads with MX records found.');
    console.log('  Check the DB for emails that need MX validation.');
    const all = db.prepare("SELECT email, source, intent_score FROM leads WHERE email IS NOT NULL AND email != '' ORDER BY id DESC LIMIT 20").all();
    console.log('\n  Recent emails in DB:');
    for (const a of all) {
      console.log(`    ${a.email} | ${a.source || '?'} | score: ${a.intent_score || 'unvalidated'}`);
    }
    return;
  }
  
  top.forEach((l, i) => {
    console.log(`  ${i+1}. ${l.email} | ${l.name || l.first_name || '?'} | P${l.score >= 60 ? 1 : l.score >= 45 ? 2 : l.score >= 30 ? 3 : 4} | ${l.source || '?'}`);
  });
  console.log();

  // Step 3: Sync to IPTV Boss
  console.log('Step 3: Syncing to IPTV Boss...');
  const { syncToIptvBoss } = require('../server/services/worldCupCampaign');
  const sync = await syncToIptvBoss(top);
  console.log(`  ${sync.synced} leads synced\n`);

  // Step 4: Send World Cup emails
  console.log('Step 4: Sending World Cup 2026 emails...');
  const sendResult = await sendWorldCupCampaign(top);
  console.log(`  ${sendResult.sent} emails sent\n`);

  console.log('=== CAMPAIGN COMPLETE ===');
  console.log(`Remaining trial codes: ${9 - sendResult.sent}`);
  console.log(`Expire at: midnight today`);
}

main().catch(console.error);
