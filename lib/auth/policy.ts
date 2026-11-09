export const TARGET_AUTH_POLICY={minPasswordLength:12,maxPasswordLength:128,maxEmailLength:254,resetSeconds:900,
  verificationSeconds:900,sessionSeconds:86400,cookiePrefix:'buscavacante-target'} as const;
export function authOrigin(baseURL:string,secret:string):string {
  let url:URL;try{url=new URL(baseURL);}catch{throw new Error('INVALID_TARGET_AUTH_CONFIGURATION');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!['http:','https:'].includes(url.protocol) || (url.protocol==='http:' && !local) || url.username || url.password
    || url.pathname!=='/' || url.search || url.hash || secret.length<32 || secret.length>1024 || secret.trim()!==secret)throw new Error('INVALID_TARGET_AUTH_CONFIGURATION');
  return url.origin;
}
export function normalizedAuthIdentity(email:string,name:string) {
  const normalized=email.trim().toLowerCase(),display=name.trim();
  if(!normalized || normalized.length>TARGET_AUTH_POLICY.maxEmailLength || display.length<2 || display.length>80)throw new Error('INVALID_TARGET_AUTH_IDENTITY');
  return {email:normalized,name:display};
}
