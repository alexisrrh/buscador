import "server-only";
import {Pool} from 'pg';
import {betterAuth,type BetterAuthOptions} from 'better-auth';
import {APIError,createAuthMiddleware} from 'better-auth/api';
import {nextCookies} from 'better-auth/next-js';
import {authOrigin,normalizedAuthIdentity,TARGET_AUTH_POLICY as policy} from './policy';

export type AuthMailNotice={kind:'VERIFY_EMAIL'|'RESET_PASSWORD';to:string;url:string};
export type TargetAuthInput={pool:Pool;baseURL:string;secret:string;mail:{enqueue(notice:AuthMailNotice):Promise<void>};
  background(task:Promise<unknown>):void;onBackgroundFailure?:()=>void};

/** Dedicated credentials, no fallback and no connection at module import time. */
export function createAuthPool(connectionString:string,max=5):Pool {
  let url:URL;try{url=new URL(connectionString);}catch{throw new Error('INVALID_TARGET_AUTH_DATABASE');}
  if(!['postgres:','postgresql:'].includes(url.protocol) || !Number.isInteger(max) || max<1 || max>20 || url.search || url.hash)throw new Error('INVALID_TARGET_AUTH_DATABASE');
  const pool=new Pool({connectionString,max,options:'-c search_path=identity -c statement_timeout=5000 -c lock_timeout=2000',application_name:'buscavacante-auth',connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
  pool.on('error',()=>console.error('AUTH_DATABASE_IDLE_CONNECTION_ERROR'));return pool;
}
export async function assertAuthPool(pool:Pick<Pool,'query'>):Promise<void> {
  const result=await pool.query<{allowed:boolean;unsafe:boolean;schema:string}>(`SELECT pg_has_role(current_user,'bv_auth','MEMBER') AS allowed,
    rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR pg_has_role(current_user,'bv_owner','MEMBER')
      OR pg_has_role(current_user,'bv_app','MEMBER') OR pg_has_role(current_user,'bv_ingest','MEMBER') OR pg_has_role(current_user,'bv_catalog','MEMBER') AS unsafe,
    current_schema() AS schema FROM pg_roles WHERE rolname=current_user`);
  if(result.rows.length!==1 || !result.rows[0].allowed || result.rows[0].unsafe || result.rows[0].schema!=='identity')throw new Error('UNSAFE_AUTH_DATABASE_ROLE');
}
export async function activeAuthAccount(pool:Pick<Pool,'query'>,id:string):Promise<boolean> {
  if(!/^[a-f0-9-]{36}$/i.test(id))return false;
  const result=await pool.query(`SELECT id FROM identity.users WHERE id=$1 AND NOT disabled AND deleted_at IS NULL AND email_verified`,[id]);
  return result.rowCount===1;
}
export function targetAuthOptions(input:TargetAuthInput):BetterAuthOptions {
  const origin=authOrigin(input.baseURL,input.secret);
  return {
    appName:'BuscaVacante',baseURL:origin,basePath:'/api/auth',secret:input.secret,database:input.pool,
    trustedOrigins:[origin],telemetry:{enabled:false},logger:{disabled:true},
    // Better Auth otherwise skips origin checks automatically under NODE_ENV=test.
    advanced:{disableOriginCheck:false,database:{generateId:'uuid'},cookiePrefix:policy.cookiePrefix,useSecureCookies:origin.startsWith('https:'),
      defaultCookieAttributes:{httpOnly:true,sameSite:'lax',path:'/'},backgroundTasks:{handler:task=>input.background(task.catch(()=>input.onBackgroundFailure?.()))}},
    user:{modelName:'users',fields:{emailVerified:'email_verified',createdAt:'created_at',updatedAt:'updated_at'},
      additionalFields:{disabled:{type:'boolean',defaultValue:false,input:false,returned:false},deletedAt:{type:'date',fieldName:'deleted_at',required:false,input:false,returned:false}}},
    session:{modelName:'sessions',fields:{userId:'user_id',expiresAt:'expires_at',createdAt:'created_at',updatedAt:'updated_at',ipAddress:'ip_address',userAgent:'user_agent'},
      expiresIn:policy.sessionSeconds,updateAge:3600,freshAge:3600,cookieCache:{enabled:false}},
    account:{modelName:'accounts',fields:{userId:'user_id',accountId:'account_id',providerId:'provider_id',accessToken:'access_token',refreshToken:'refresh_token',idToken:'id_token',
      accessTokenExpiresAt:'access_token_expires_at',refreshTokenExpiresAt:'refresh_token_expires_at',createdAt:'created_at',updatedAt:'updated_at'},accountLinking:{enabled:false}},
    verification:{modelName:'verifications',fields:{expiresAt:'expires_at',createdAt:'created_at',updatedAt:'updated_at'},storeIdentifier:'hashed',storeInDatabase:true},
    rateLimit:{enabled:true,storage:'database',modelName:'rate_limits',fields:{lastRequest:'last_request'},window:60,max:100,
      customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:60,max:5},'/request-password-reset':{window:60,max:3}}},
    emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:policy.minPasswordLength,maxPasswordLength:policy.maxPasswordLength,
      resetPasswordTokenExpiresIn:policy.resetSeconds,revokeSessionsOnPasswordReset:true,
      sendResetPassword:async({user,url})=>input.mail.enqueue({kind:'RESET_PASSWORD',to:user.email,url})},
    emailVerification:{sendOnSignUp:true,autoSignInAfterVerification:false,expiresIn:policy.verificationSeconds,
      sendVerificationEmail:async({user,url})=>input.mail.enqueue({kind:'VERIFY_EMAIL',to:user.email,url})},
    hooks:{before:createAuthMiddleware(async ctx=>{
      const publicPaths=['/sign-up/email','/sign-in/email','/request-password-reset','/reset-password','/verify-email','/send-verification-email','/sign-out','/ok'];
      if(publicPaths.includes(ctx.path) || ctx.path.startsWith('/reset-password/'))return;
      const token=await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name,ctx.context.secret);
      if(!token)return;
      const active=await input.pool.query(`SELECT s.id FROM identity.sessions s JOIN identity.users u ON u.id=s.user_id
        WHERE s.token=$1 AND s.expires_at>now() AND u.email_verified AND NOT u.disabled AND u.deleted_at IS NULL`,[token]);
      if(active.rowCount!==1)throw new APIError('UNAUTHORIZED',{code:'INVALID_SESSION',message:'Invalid session'});
    })},
    databaseHooks:{user:{create:{before:async user=>{
      try{return {data:{...user,...normalizedAuthIdentity(user.email,user.name)}};}catch{throw new APIError('BAD_REQUEST',{code:'INVALID_USER',message:'Invalid account data'});}
    }},update:{before:async user=>{
      if(user.email!==undefined && (user.email.length>policy.maxEmailLength || user.email.trim().toLowerCase()!==user.email))throw new APIError('BAD_REQUEST',{code:'INVALID_USER',message:'Invalid account data'});
      if(user.name!==undefined && (user.name.trim().length<2 || user.name.trim().length>80))throw new APIError('BAD_REQUEST',{code:'INVALID_USER',message:'Invalid account data'});
    }}},session:{create:{before:async(session,ctx)=>{
      // Use the transaction-bound adapter, not another pooled connection inside a hook.
      const user=await ctx?.context.internalAdapter.findUserById(session.userId);
      const flags=user as unknown as {disabled?:boolean;deletedAt?:Date|null}|null;
      if(!user?.emailVerified || flags?.disabled!==false || flags.deletedAt)throw new APIError('UNAUTHORIZED',{code:'INVALID_EMAIL_OR_PASSWORD',message:'Invalid email or password'});
    }}}},
    disabledPaths:['/delete-user','/link-social','/link-account'],plugins:[nextCookies()],
  };
}
export async function createTargetAuth(input:TargetAuthInput) {
  const options=targetAuthOptions(input);await assertAuthPool(input.pool);return betterAuth(options);
}
export type TargetAuth=Awaited<ReturnType<typeof createTargetAuth>>;
