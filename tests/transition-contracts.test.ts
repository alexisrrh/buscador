// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import {declaredColumns,normalizeSqlType,readTransitionContracts,visibleDdl} from '../db/transition/sql-contracts';
import {assertSyntheticDatabaseUrl,canonical,importSyntheticFixture,syntheticFixture,syntheticId} from '../db/transition/synthetic-import';

describe('transition source contracts',()=>{
 it('covers all 22 declared tables and 34 function names without silently dropping legacy columns',async()=>{
  const data=await readTransitionContracts();expect(Object.keys(data.legacy)).toHaveLength(22);expect(data.contracts.functions).toHaveLength(34);
  const changes:string[]=[];
  for(const table of data.contracts.tables)for(const [column,type] of Object.entries(data.legacy[table.name])) {
    if(data.target[table.name][column]!==type)changes.push(table.name+'.'+column+':'+type+'->'+data.target[table.name][column]);
  }
  expect(changes).toEqual([]);
  expect(data.contracts.functions.filter(f=>['PENDING','DISABLED'].includes(f.status)).length).toBeGreaterThan(0);
 });
 it('reads multi-column ALTER and nested types/defaults without treating quoted constraints as columns',()=>{
  const sql=`-- create table public.fake(a int);
    create table public.example(id uuid primary key, amount numeric(14, 2), note text default 'a,b(\'\'c)',
      tags text[] default array['a','b'], constraint okay check(amount>=0));
    alter table public.example add column if not exists extra jsonb default '{}', add column last_name text;
    create function public.fake() returns void language sql as $$ create table public.not_real(x int); $$;`;
  expect(declaredColumns(sql)).toEqual({example:{id:'uuid',amount:'numeric(14,2)',note:'text',tags:'text[]',extra:'jsonb',last_name:'text'}});
  expect(normalizeSqlType('timestamp with time zone')).toBe('timestamptz');
  expect(normalizeSqlType('public.search_profile_status')).toBe('search_profile_status');
 });
 it('rejects malformed static input instead of guessing a contract',()=>{
  for(const sql of ["select 'unterminated",'/* unterminated','select $$unterminated'])expect(()=>visibleDdl(sql)).toThrow();
  expect(()=>declaredColumns('create table public.example(id uuid')).toThrow('UNTERMINATED_DDL_TABLE');
  expect(visibleDdl('/* ignored */ select 1 -- ignored')).toContain('select 1');
 });
});
describe('synthetic import boundaries',()=>{
 it('rejects remote clients before SQL and a wrong server/database version before starting writes',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{name:'buscavacante_test',version:'160000'}]}),release=vi.fn();
  const client={host:'remote.example.test',database:'buscavacante_test',query,release};
  const pool={connect:async()=>client as unknown as PoolClient} as Pick<Pool,'connect'>;
  await expect(importSyntheticFixture(pool,'unit')).rejects.toThrow('SYNTHETIC_DATABASE_ONLY');expect(query).not.toHaveBeenCalled();
  client.host='127.0.0.1';await expect(importSyntheticFixture(pool,'unit')).rejects.toThrow('SYNTHETIC_DATABASE_ONLY');
  expect(query).toHaveBeenCalledTimes(1);expect(release).toHaveBeenLastCalledWith(false);
 });
 it('discards a connection after broken rollback and preserves the original error',async()=>{
  const query=vi.fn().mockImplementation(async(sql:string)=>{
    if(sql==='ROLLBACK')throw new Error('BROKEN_CONNECTION');if(sql.includes('pg_advisory'))throw new Error('SYNTHETIC_TEST_FAILURE');
    return {rows:[{name:'buscavacante_test',version:'170000'}]};
  }),release=vi.fn();
  const client={host:'127.0.0.1',database:'buscavacante_test',query,release};
  await expect(importSyntheticFixture({connect:async()=>client as unknown as PoolClient} as Pick<Pool,'connect'>,'unit')).rejects.toThrow('SYNTHETIC_TEST_FAILURE');
  expect(release).toHaveBeenCalledWith(true);
 });
 it('accepts only the dedicated loopback test database, without URL overrides',()=>{
  expect(assertSyntheticDatabaseUrl('postgresql://user:synthetic@127.0.0.1:5432/buscavacante_test').hostname).toBe('127.0.0.1');
  for(const url of ['postgresql://db.example.test/buscavacante_test','postgresql://localhost/production','postgresql://localhost/buscavacante_test?host=db.example.test','https://localhost/buscavacante_test'])expect(()=>assertSyntheticDatabaseUrl(url)).toThrow('SYNTHETIC_DATABASE_ONLY');
 });
 it('generates stable IDs and all table fixtures, keeping inherited claims unconfirmed',()=>{
  const a=syntheticFixture('unit'),b=syntheticFixture('unit');expect(a).toEqual(b);expect(Object.keys(a.rows)).toHaveLength(22);expect(a.userIds).toHaveLength(2);
  expect(new Set(Object.values(a.rows).flat().map(row=>row.id??row.user_id)).size).toBeGreaterThan(22);
  expect(a.rows.job_preferences.map(row=>row.search_profile_version)).toEqual([1,2,1,2]);
  expect(a.rows.professional_evidence_items.every(row=>row.verification_status==='UNKNOWN' && row.confirmed_at===null)).toBe(true);
  expect(a.rows.derived_resumes.map(row=>row.status)).toContain('ARCHIVED');
  expect(syntheticId('unit','a')).not.toBe(syntheticId('unit','b'));expect(()=>syntheticFixture('../file')).toThrow('INVALID_SYNTHETIC_SEED');
 });
 it('canonicalizes key order and timestamps while preserving ordered JSON arrays and content',()=>{
  expect(canonical({b:1,a:'2000-01-01T00:00:00+00:00'})).toBe(canonical({a:new Date('2000-01-01T00:00:00Z'),b:1}));
  expect(canonical([1,2])).not.toBe(canonical([2,1]));expect(canonical({a:'claim'})).not.toBe(canonical({a:'other'}));
  expect(canonical({row:{answer:null},sql_nulls:['answer']})).not.toBe(canonical({row:{answer:null},sql_nulls:[]}));
 });
});
