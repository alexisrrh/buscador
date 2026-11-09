import "server-only";
import type {Pool} from 'pg';
import {APIError} from 'better-auth/api';
import {requireActor,type ActorContext} from '@/lib/server/context';
import type {PostgresProfileRepository} from '@/lib/server/db/profile-repository';
import {activeAuthAccount,type TargetAuth} from './target.server';

/** Re-read session/account for each private operation. Never retain this actor across requests. */
export async function requireTargetActor(auth:TargetAuth,pool:Pool,headers:Headers,profiles:PostgresProfileRepository):Promise<ActorContext> {
  const actor=await requireActor(async()=>{
    let session;
    try{session=await auth.api.getSession({headers,query:{disableCookieCache:true,disableRefresh:true}});}
    catch(error){if(error instanceof APIError && error.statusCode===401)return null;throw error;}
    if(!session || !await activeAuthAccount(pool,session.user.id))return null;
    return {user:{id:session.user.id,disabled:false},session:{id:session.session.id,expiresAt:new Date(session.session.expiresAt)}};
  });
  await profiles.ensureOwnProfile(actor);return actor;
}
