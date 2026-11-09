import {Pool} from 'pg';
import {auditTransition} from '../db/transition/sql-contracts.ts';
import {assertSyntheticDatabaseUrl,importSyntheticFixture} from '../db/transition/synthetic-import.ts';

const args=process.argv.slice(2);
if(args.some(arg=>!['--audit','--synthetic'].includes(arg) && !arg.startsWith('--seed=')) || (args.includes('--audit') && args.includes('--synthetic'))) {
  throw new Error('Use --audit (default) or --synthetic, with an optional --seed=synthetic-name.');
}
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL is required. No production URL fallback.');
const url=assertSyntheticDatabaseUrl(process.env.TEST_DATABASE_URL);
const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:5000});
try {
  const client=await pool.connect();let audit;
  try {await client.query('BEGIN READ ONLY');audit=await auditTransition(client);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  if(!audit.compatible){console.log(JSON.stringify(audit,null,2));process.exitCode=1;}
  else if(args.includes('--synthetic')) {
    const seed=args.find(arg=>arg.startsWith('--seed='))?.slice(7)??'transition-06g-v1';
    const first=await importSyntheticFixture(pool,seed),replay=await importSyntheticFixture(pool,seed);
    if(first.digest!==replay.digest || replay.inserted!==0)throw new Error('SYNTHETIC_REPLAY_MISMATCH');
    console.log(JSON.stringify({audit,synthetic:{first,replay}},null,2));
  }else console.log(JSON.stringify(audit,null,2));
} catch(error) {
  const code=error && typeof error==='object' && 'code' in error && /^[A-Z0-9_]{1,80}$/.test(String(error.code))?String(error.code):'TRANSITION_LAB_FAILED';
  console.error(code);process.exitCode=1;
} finally {await pool.end();}
