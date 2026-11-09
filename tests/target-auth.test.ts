// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {authOrigin,normalizedAuthIdentity,TARGET_AUTH_POLICY} from '@/lib/auth/policy';
import {activeAuthAccount,assertAuthPool,createAuthPool,targetAuthOptions} from '@/lib/auth/target.server';

describe('target authentication policy',()=>{
 const secret='synthetic-test-secret-'.repeat(3);
 it('requires a fixed trusted HTTPS origin or local test origin and an explicit secret',()=>{
  expect(authOrigin('https://example.test',secret)).toBe('https://example.test');expect(authOrigin('http://localhost:3000',secret)).toBe('http://localhost:3000');
  for(const url of ['not a URL','http://example.test','https://example.test/auth','https://user:password@example.test','https://example.test?host=evil'])expect(()=>authOrigin(url,secret)).toThrow('INVALID_TARGET_AUTH_CONFIGURATION');
  expect(()=>authOrigin('https://example.test','short')).toThrow('INVALID_TARGET_AUTH_CONFIGURATION');
 });
 it('normalizes identity without truncation and enforces the adopted lengths',()=>{
  expect(normalizedAuthIdentity(' Example@EXAMPLE.test ',' Synthetic User ')).toEqual({email:'example@example.test',name:'Synthetic User'});
  for(const [email,name] of [['','User'],['a'.repeat(255),'User'],['user@example.test','x'],['user@example.test','x'.repeat(81)]])expect(()=>normalizedAuthIdentity(email,name)).toThrow('INVALID_TARGET_AUTH_IDENTITY');
  expect(TARGET_AUTH_POLICY).toMatchObject({minPasswordLength:12,maxPasswordLength:128,resetSeconds:900});
 });
 it('configures UUID, verification, immediate DB revocation, secure cookies and database rate limits',()=>{
  const options=targetAuthOptions({pool:{} as Pool,baseURL:'https://example.test',secret,mail:{enqueue:vi.fn()},background:vi.fn()});
  expect(options.session?.cookieCache?.enabled).toBe(false);expect(options.advanced?.database?.generateId).toBe('uuid');
  expect(options.emailAndPassword).toMatchObject({minPasswordLength:12,maxPasswordLength:128,resetPasswordTokenExpiresIn:900,revokeSessionsOnPasswordReset:true,requireEmailVerification:true});
  expect(options.advanced).toMatchObject({useSecureCookies:true,cookiePrefix:'buscavacante-target',defaultCookieAttributes:{httpOnly:true,sameSite:'lax'}});
  expect(options.rateLimit).toMatchObject({enabled:true,storage:'database'});expect(options.plugins?.at(-1)?.id).toBe('next-cookies');
 });
 it('rejects unsafe credentials, unexpected schema and malformed identities',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{allowed:true,unsafe:false,schema:'identity'}],rowCount:1});
  const pool={query} as unknown as Pool;await assertAuthPool(pool);
  for(const state of [{allowed:false,unsafe:false,schema:'identity'},{allowed:true,unsafe:true,schema:'identity'},{allowed:true,unsafe:false,schema:'public'}]){
   query.mockResolvedValue({rows:[state],rowCount:1});await expect(assertAuthPool(pool)).rejects.toThrow('UNSAFE_AUTH_DATABASE_ROLE');
  }
  query.mockClear();expect(await activeAuthAccount(pool,'not-a-uuid')).toBe(false);expect(query).not.toHaveBeenCalled();
  query.mockResolvedValue({rows:[],rowCount:0});expect(await activeAuthAccount(pool,'11111111-1111-4111-8111-111111111111')).toBe(false);
 });
 it('never opens a fallback database or silently accepts URL overrides',async()=>{
  for(const raw of ['invalid','https://localhost/auth','postgresql://localhost/test?options=-csearch_path=public'])expect(()=>createAuthPool(raw)).toThrow('INVALID_TARGET_AUTH_DATABASE');
  expect(()=>createAuthPool('postgresql://localhost/test',0)).toThrow('INVALID_TARGET_AUTH_DATABASE');
  const pool=createAuthPool('postgresql://localhost/test');expect(pool.options.application_name).toBe('buscavacante-auth');await pool.end();
 });
});
