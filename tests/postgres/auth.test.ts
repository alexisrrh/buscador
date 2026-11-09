import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {getMigrations} from 'better-auth/db/migration';
import {hashPassword} from 'better-auth/crypto';
import {applyMigrations} from '../../db/migrate';
import {assertSyntheticDatabaseUrl} from '../../db/transition/synthetic-import';
import {createAuthPool,createTargetAuth,type AuthMailNotice,type TargetAuth} from '@/lib/auth/target.server';
import {requireTargetActor} from '@/lib/auth/actor.server';
import {createDatabasePool} from '@/lib/server/db/pool';
import {PostgresProfileRepository} from '@/lib/server/db/profile-repository';
import {UnitOfWork} from '@/lib/server/db/unit-of-work';
import {requireActor} from '@/lib/server/context';

const prefix='bv_auth_test_'+randomUUID().replaceAll('-',''),authLogin=prefix+'_auth',appLogin=prefix+'_app';
const baseURL='http://localhost:3217',secret=randomBytes(48).toString('hex'),password='Synthetic-password-12345';
const notices:AuthMailNotice[]=[],tasks:Promise<unknown>[]=[],backgroundErrors:string[]=[];
let admin:Pool,authPool:Pool,appPool:Pool,auth:TargetAuth,profiles:PostgresProfileRepository,ip=1;
beforeAll(async()=>{
 const raw=process.env.TEST_DATABASE_URL;if(!raw)throw new Error('TEST_DATABASE_URL is required');const url=assertSyntheticDatabaseUrl(raw);
 admin=new Pool({connectionString:raw,max:2,connectionTimeoutMillis:5000});
 await admin.query(await readFile(new URL('../../db/bootstrap.sql',import.meta.url),'utf8'));await applyMigrations(admin);
 for(const [login,group] of [[authLogin,'bv_auth'],[appLogin,'bv_app']]){
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD 'synthetic-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`);
  await admin.query(`GRANT ${group} TO ${login}`);
 }
 url.username=authLogin;url.password='synthetic-runtime-only';authPool=createAuthPool(url.toString(),4);
 url.username=appLogin;appPool=createDatabasePool(url.toString(),2);profiles=new PostgresProfileRepository(new UnitOfWork(appPool));
 auth=await createTargetAuth({pool:authPool,baseURL,secret,mail:{enqueue:async notice=>{notices.push(notice);}},background:task=>{tasks.push(task);},onBackgroundFailure:()=>backgroundErrors.push('AUTH_BACKGROUND_FAILED')});
 await auth.$context;
});
afterAll(async()=>{
 while(tasks.length)await Promise.all(tasks.splice(0));
 if(authPool)await authPool.end();if(appPool)await appPool.end();
 if(admin){try{for(const login of [authLogin,appLogin])await admin.query(`DROP ROLE IF EXISTS ${login}`);}finally{await admin.end();}}
});
async function request(path:string,body?:Record<string,unknown>,cookie='',clientIp?:string,origin=baseURL) {
 const headers=new Headers({'origin':origin,'x-forwarded-for':clientIp??`192.0.2.${ip++}`});
 if(cookie)headers.set('cookie',cookie);if(body)headers.set('content-type','application/json');
 return auth.handler(new Request(baseURL+'/api/auth'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}));
}
const cookie=(response:Response)=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function flush(){while(tasks.length)await Promise.all(tasks.splice(0));expect(backgroundErrors).toEqual([]);}
async function signUp(verified=true) {
 const email='synthetic-'+randomUUID()+'@example.test';
 const response=await request('/sign-up/email',{email,password,name:'Synthetic User',disabled:true});expect(response.status).toBe(200);
 const data=await response.json() as {user:{id:string;email:string};token:null};expect(data.token).toBeNull();await flush();
 if(verified){const notice=notices.findLast(n=>n.to===email && n.kind==='VERIFY_EMAIL');expect(notice).toBeTruthy();
  const result=await auth.handler(new Request(notice!.url,{headers:{origin:baseURL}}));expect([200,302]).toContain(result.status);
 }
 return {email,id:data.user.id};
}
async function signIn(email:string,pass=password) {
 const response=await request('/sign-in/email',{email,password:pass});expect(response.status).toBe(200);return cookie(response);
}
async function resetToken(email:string) {
 const response=await request('/request-password-reset',{email,redirectTo:baseURL+'/reset-password'});expect(response.status).toBe(200);await flush();
 const notice=notices.findLast(n=>n.to===email && n.kind==='RESET_PASSWORD');expect(notice).toBeTruthy();return new URL(notice!.url).pathname.split('/').at(-1)!;
}

describe('Better Auth 1.7.18 core against PostgreSQL 17',()=>{
 it('matches the pinned schema without running automatic DDL as the auth role',async()=>{
  const migration=await getMigrations(auth.options);expect(migration.toBeCreated).toEqual([]);expect(migration.toBeAdded).toEqual([]);expect(migration.schemaProblems).toEqual([]);
  await expect(authPool.query('CREATE TABLE identity.forbidden(id int)')).rejects.toMatchObject({code:'42501'});
  await expect(authPool.query('SELECT id FROM public.profiles')).rejects.toMatchObject({code:'42501'});
  await expect(appPool.query('SELECT id FROM identity.users')).rejects.toMatchObject({code:'42501'});
  await expect(new UnitOfWork(authPool).withActor(await requireActor(async()=>({user:{id:randomUUID(),disabled:false},session:{id:'synthetic',expiresAt:new Date(Date.now()+60000)}})),async()=>true)).rejects.toThrow('UNSAFE_DATABASE_ROLE');
 });
 it('requires email verification, generates UUID and prevents client-controlled account flags',async()=>{
  const user=await signUp(false);expect(user.id).toMatch(/^[a-f0-9-]{36}$/);
  const row=(await authPool.query('SELECT email_verified,disabled FROM identity.users WHERE id=$1',[user.id])).rows[0];expect(row).toEqual({email_verified:false,disabled:false});
  const denied=await request('/sign-in/email',{email:user.email,password});expect(denied.status).toBe(403);expect(cookie(denied)).not.toContain('session_token');
  const mail=notices.findLast(n=>n.to===user.email && n.kind==='VERIFY_EMAIL')!;
  const verified=await auth.handler(new Request(mail.url,{headers:{origin:baseURL}}));expect([200,302]).toContain(verified.status);
  expect(await signIn(user.email)).toContain('buscavacante-target.session_token');
 });
 it('rejects passwords outside 12–128 and email above 254 without creating an identity',async()=>{
  for(const pass of ['x'.repeat(11),'x'.repeat(129)]){
   const email='invalid-'+randomUUID()+'@example.test',response=await request('/sign-up/email',{email,password:pass,name:'Synthetic User'});
   expect(response.status).toBeGreaterThanOrEqual(400);expect((await authPool.query('SELECT id FROM identity.users WHERE email=$1',[email])).rowCount).toBe(0);
  }
  const longEmail='a'.repeat(64)+'@'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.'+'d'.repeat(59)+'.tt';expect(longEmail.length).toBe(255);
  const response=await request('/sign-up/email',{email:longEmail,password,name:'Synthetic User'});expect(response.status).toBeGreaterThanOrEqual(400);
 });
 it('returns non-enumerating registration and recovery responses for existing/unknown email',async()=>{
  const user=await signUp();
  const existing=await request('/sign-up/email',{email:user.email,password,name:'Other Requested Name'});expect(existing.status).toBe(200);
  const body=await existing.json() as {user:{name:string};token:null};expect(body.user.name).toBe('Other Requested Name');expect(body.token).toBeNull();
  const known=await request('/request-password-reset',{email:user.email,redirectTo:baseURL+'/reset-password'});
  const unknown=await request('/request-password-reset',{email:'missing-'+randomUUID()+'@example.test',redirectTo:baseURL+'/reset-password'});
  expect(known.status).toBe(unknown.status);expect(await known.json()).toEqual(await unknown.json());await flush();
 });
 it('rejects unknown origins and external recovery redirects',async()=>{
  const blocked=await request('/sign-up/email',{email:'csrf-'+randomUUID()+'@example.test',password,name:'Synthetic User'},'',undefined,'https://untrusted.example.test');
  expect([400,403]).toContain(blocked.status);
  const user=await signUp(),redirect=await request('/request-password-reset',{email:user.email,redirectTo:'https://untrusted.example.test/reset'});
  expect([400,403]).toContain(redirect.status);
 });
 it('reads a real session into an actor, preserves UUID and rejects Supabase/fake cookies',async()=>{
  const user=await signUp(),sessionCookie=await signIn(user.email);
  const actor=await requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles);expect(actor.userId).toBe(user.id);
  expect((await appPool.query("SELECT current_setting('app.user_id',true) AS context")).rows[0].context??'').toBe('');
  const actor2=await requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles);expect(actor2.userId).toBe(user.id);
  expect((await admin.query('SELECT id FROM public.profiles WHERE id=$1',[user.id])).rowCount).toBe(1);
  for(const bad of ['sb-auth-token=legacy-jwt','buscavacante-target.session_token=forged'])await expect(requireTargetActor(auth,authPool,new Headers({cookie:bad}),profiles)).rejects.toThrow('AUTHENTICATION_REQUIRED');
 });
 it('revokes only the current device on sign-out and all devices on revoke-sessions',async()=>{
  const user=await signUp(),first=await signIn(user.email),second=await signIn(user.email);
  expect((await request('/sign-out',{},first)).status).toBe(200);
  await expect(requireTargetActor(auth,authPool,new Headers({cookie:first}),profiles)).rejects.toThrow('AUTHENTICATION_REQUIRED');
  expect((await requireTargetActor(auth,authPool,new Headers({cookie:second}),profiles)).userId).toBe(user.id);
  expect((await request('/revoke-sessions',{},second)).status).toBe(200);
  await expect(requireTargetActor(auth,authPool,new Headers({cookie:second}),profiles)).rejects.toThrow('AUTHENTICATION_REQUIRED');
 });
 it('denies expired sessions and disabled/deleted/unverified accounts without cookie-cache delay',async()=>{
  for(const condition of ["disabled=true","deleted_at=now()","email_verified=false"]){
   const user=await signUp(),sessionCookie=await signIn(user.email);await authPool.query('UPDATE identity.users SET '+condition+' WHERE id=$1',[user.id]);
   await expect(requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles)).rejects.toThrow('AUTHENTICATION_REQUIRED');
   expect((await request('/sign-in/email',{email:user.email,password})).status).toBeGreaterThanOrEqual(400);
  }
  const user=await signUp(),sessionCookie=await signIn(user.email);await authPool.query("UPDATE identity.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[user.id]);
  await expect(requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles)).rejects.toThrow('AUTHENTICATION_REQUIRED');
 });
 it('does not reactivate an application profile that was deleted independently',async()=>{
  const user=await signUp(),sessionCookie=await signIn(user.email),actor=await requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles);
  await new UnitOfWork(appPool).withActor(actor,tx=>tx.query('UPDATE public.profiles SET deleted_at=now() WHERE id=$1',[user.id]));
  await expect(requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles)).rejects.toThrow('PROFILE_UNAVAILABLE');
 });
 it('sets a 15-minute reset, spends it once and revokes existing sessions atomically',async()=>{
  const user=await signUp(),oldCookie=await signIn(user.email),token=await resetToken(user.email);
  const verification=(await authPool.query('SELECT identifier,expires_at FROM identity.verifications WHERE value=$1',[user.id])).rows[0];
  expect(verification.identifier).not.toContain(token);expect(verification.expires_at.getTime()-Date.now()).toBeLessThanOrEqual(900000);expect(verification.expires_at.getTime()-Date.now()).toBeGreaterThan(850000);
  const replacement='New-synthetic-password-98765';expect((await request('/reset-password',{token,newPassword:replacement})).status).toBe(200);
  expect((await request('/reset-password',{token,newPassword:password})).status).toBeGreaterThanOrEqual(400);
  await expect(requireTargetActor(auth,authPool,new Headers({cookie:oldCookie}),profiles)).rejects.toThrow('AUTHENTICATION_REQUIRED');
  expect((await request('/sign-in/email',{email:user.email,password})).status).toBeGreaterThanOrEqual(400);await signIn(user.email,replacement);
 });
 it('keeps reset usable after an invalid password and rejects an expired reset without changing credentials',async()=>{
  const user=await signUp(),token=await resetToken(user.email);
  expect((await request('/reset-password',{token,newPassword:'short'})).status).toBeGreaterThanOrEqual(400);
  const replacement='Valid-synthetic-reset-1234';expect((await request('/reset-password',{token,newPassword:replacement})).status).toBe(200);
  const expired=await resetToken(user.email);await authPool.query("UPDATE identity.verifications SET expires_at=now()-interval '1 second' WHERE value=$1",[user.id]);
  expect((await request('/reset-password',{token:expired,newPassword:password})).status).toBeGreaterThanOrEqual(400);await signIn(user.email,replacement);
 });
 it('allows exactly one concurrent use of the same reset token',async()=>{
  const user=await signUp(),token=await resetToken(user.email);
  const responses=await Promise.all([request('/reset-password',{token,newPassword:'Concurrent-reset-one-1234'}),request('/reset-password',{token,newPassword:'Concurrent-reset-two-1234'})]);
  expect(responses.filter(r=>r.status===200)).toHaveLength(1);expect(responses.filter(r=>r.status>=400)).toHaveLength(1);
 });
 it('recovers a synthetic imported identity while preserving the existing domain UUID',async()=>{
  const id=randomUUID(),email='imported-'+randomUUID()+'@example.test';
  const actor=await requireActor(async()=>({user:{id,disabled:false},session:{id:'synthetic-source',expiresAt:new Date(Date.now()+60000)}}));await profiles.ensureOwnProfile(actor);
  const passwordHash=await hashPassword(randomBytes(48).toString('base64url'));
  await authPool.query("INSERT INTO identity.users(id,name,email,email_verified) VALUES($1,'Synthetic Imported User',$2,true)",[id,email]);
  await authPool.query("INSERT INTO identity.accounts(user_id,account_id,provider_id,password) VALUES($1,$1,'credential',$2)",[id,passwordHash]);
  const token=await resetToken(email),replacement='Imported-user-password-1234';expect((await request('/reset-password',{token,newPassword:replacement})).status).toBe(200);
  const sessionCookie=await signIn(email,replacement);expect((await requireTargetActor(auth,authPool,new Headers({cookie:sessionCookie}),profiles)).userId).toBe(id);
  await expect(authPool.query("INSERT INTO identity.users(name,email) VALUES('Collision',$1)",[email])).rejects.toMatchObject({code:'23505'});
 });
 it('persists rate limits across instances and denies the sixth failed sign-in from one address',async()=>{
  const user=await signUp(),clientIp='203.0.113.200';
  for(let n=0;n<5;n++)expect((await request('/sign-in/email',{email:user.email,password:'Wrong-synthetic-password'},'',clientIp)).status).toBe(401);
  const other=await createTargetAuth({pool:authPool,baseURL,secret,mail:{enqueue:async()=>{}},background:task=>tasks.push(task)});
  const denied=await other.handler(new Request(baseURL+'/api/auth/sign-in/email',{method:'POST',headers:{origin:baseURL,'x-forwarded-for':clientIp,'content-type':'application/json'},body:JSON.stringify({email:user.email,password})}));
  expect(denied.status).toBe(429);expect((await authPool.query('SELECT id FROM identity.rate_limits')).rowCount).toBeGreaterThan(0);
 });
});
