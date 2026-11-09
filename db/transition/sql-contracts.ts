import { readFile,readdir } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type { PoolClient } from 'pg';
import contracts from './contracts.json' with { type:'json' };

/** Static DDL reader for this repository's unquoted public table declarations.
 * It is deliberately not an SQL executor or a general PostgreSQL parser. */
export function visibleDdl(sql:string):string {
  let out='',i=0,quote='';
  while(i<sql.length) {
    const c=sql[i];
    if(quote) {out+=c;i++;if(c===quote){if(sql[i]===quote){out+=sql[i++];}else quote='';}continue;}
    if(c==="'" || c==='"'){quote=c;out+=c;i++;continue;}
    if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i);i=end<0?sql.length:end;out+=' ';continue;}
    if(sql.startsWith('/*',i)){const end=sql.indexOf('*/',i+2);if(end<0)throw new Error('UNTERMINATED_DDL_COMMENT');out+=' ';i=end+2;continue;}
    const dollar=sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/)?.[0];
    if(dollar){const end=sql.indexOf(dollar,i+dollar.length);if(end<0)throw new Error('UNTERMINATED_DDL_BODY');out+=' ';i=end+dollar.length;continue;}
    out+=c;i++;
  }
  if(quote)throw new Error('UNTERMINATED_DDL_QUOTE');return out;
}
function segments(text:string):string[] {
  const parts:string[]=[];let start=0,depth=0,quote='';
  for(let i=0;i<text.length;i++){
    const c=text[i];if(quote){if(c===quote){if(text[i+1]===quote)i++;else quote='';}continue;}
    if(c==="'" || c==='"'){quote=c;continue;}if(c==='(' || c==='[')depth++;if(c===')' || c===']')depth--;
    if(c===',' && depth===0){parts.push(text.slice(start,i));start=i+1;}
  }
  parts.push(text.slice(start));return parts;
}
export function normalizeSqlType(type:string):string {
  return type.toLowerCase().replace(/\bpublic\./g,'').replace(/\s+/g,' ').replace(/\s*([(),\[\]])\s*/g,'$1').trim()
    .replace(/^int4$/,'integer').replace(/^int8$/,'bigint').replace(/^int2$/,'smallint').replace(/^bool$/,'boolean').replace(/^timestamp with time zone$/,'timestamptz');
}
export function declaredColumns(source:string):Record<string,Record<string,string>> {
  const sql=visibleDdl(source),tables:Record<string,Record<string,string>>={};
  const column=(part:string)=>{
    const found=part.trim().match(/^(\w+)\s+(.+)$/s);if(!found || /^(constraint|foreign|primary|unique|check|exclude)$/i.test(found[1]))return null;
    const type=found[2].split(/\s+(?:not\s+null|null|default|primary|references|unique|check|generated|constraint)\b/i)[0];
    return [found[1].toLowerCase(),normalizeSqlType(type)] as const;
  };
  for(const match of sql.matchAll(/create\s+table\s+public\.(\w+)\s*\(/gi)){
    const start=match.index!+match[0].length;let depth=1,quote='',end=start;
    for(;end<sql.length;end++){const c=sql[end];if(quote){if(c===quote){if(sql[end+1]===quote)end++;else quote='';}continue;}if(c==="'"||c==='"')quote=c;else if(c==='(')depth++;else if(c===')' && --depth===0)break;}
    if(depth!==0)throw new Error('UNTERMINATED_DDL_TABLE');
    tables[match[1].toLowerCase()]=Object.fromEntries(segments(sql.slice(start,end)).map(column).filter((v):v is readonly[string,string]=>v!==null));
  }
  for(const match of sql.matchAll(/alter\s+table\s+public\.(\w+)\s+([^;]+);/gi)){
    const target=tables[match[1].toLowerCase()];if(!target)continue;
    for(const part of segments(match[2])){const added=part.trim().match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?(.+)$/is);if(added){const entry=column(added[1]);if(entry)target[entry[0]]=entry[1];}}
  }
  return tables;
}
export async function readTransitionContracts(root=new URL('../../',import.meta.url)) {
  const inventory=JSON.parse(await readFile(new URL(contracts.inventory,root),'utf8')) as {migrations:string[];declared_public_tables:string[];declared_public_functions:string[]};
  const legacySql=(await Promise.all(inventory.migrations.map(path=>readFile(new URL(path,root),'utf8')))).join('\n');
  const legacy=declaredColumns(legacySql);
  const targetFiles=(await readdir(new URL('db/migrations/',root))).filter(f=>f.endsWith('.sql')).sort();
  const target=declaredColumns((await Promise.all(targetFiles.map(file=>readFile(new URL('db/migrations/'+file,root),'utf8')))).join('\n'));
  const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  const legacyFiles=(await readdir(new URL('supabase/migrations/',root))).filter(f=>f.endsWith('.sql')).map(f=>'supabase/migrations/'+f);
  const legacyFunctions=[...new Set([...visibleDdl(legacySql).matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)].map(m=>m[1]))];
  if(!same(legacyFiles,inventory.migrations) || !same(legacyFunctions,inventory.declared_public_functions))throw new Error('TRANSITION_SOURCE_DRIFT');
  if(!same(contracts.source_files.map(f=>f.path),inventory.migrations) || !same(contracts.target_files.map(f=>f.path),targetFiles.map(f=>'db/migrations/'+f)))throw new Error('TRANSITION_MIGRATION_DRIFT');
  for(const file of [...contracts.source_files,...contracts.target_files]){
    const sql=(await readFile(new URL(file.path,root),'utf8')).replace(/\r\n/g,'\n');
    if(createHash('sha256').update(sql).digest('hex')!==file.sha256)throw new Error('TRANSITION_SQL_CHECKSUM_DRIFT');
  }
  if(!same(Object.keys(legacy),inventory.declared_public_tables) || !same(contracts.tables.map(t=>t.name),inventory.declared_public_tables)
    || !same(Object.keys(target),inventory.declared_public_tables) || !same(contracts.functions.map(f=>f.legacy),inventory.declared_public_functions))throw new Error('TRANSITION_INVENTORY_DRIFT');
  for(const f of contracts.functions.filter(f=>f.status==='REPLACED'))await readFile(new URL(f.target,root),'utf8');
  return {inventory,legacy,target,contracts};
}
export async function auditTransition(client:Pick<PoolClient,'query'>) {
  const baseline=await readTransitionContracts();
  const columns=await client.query<{table_name:string;column_name:string;type:string;generated:boolean;rls:boolean;forced:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,
    format_type(a.atttypid,a.atttypmod) AS type,a.attgenerated<>'' AS generated,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
  const errors:string[]=[];
  const tables=baseline.contracts.tables.map(table=>{
    const actual=columns.rows.filter(c=>c.table_name===table.name),legacy=baseline.legacy[table.name],target=baseline.target[table.name];
    const allowed=(contracts.target_additions as Record<string,string[]>)[table.name]??[];
    for(const [name,type] of Object.entries(legacy))if(target[name]!==type)errors.push(`${table.name}.${name}:legacy_type_or_column`);
    for(const name of Object.keys(target))if(!(name in legacy) && !allowed.includes(name))errors.push(`${table.name}.${name}:unmapped_addition`);
    for(const [name,type] of Object.entries(target))if(normalizeSqlType(actual.find(c=>c.column_name===name)?.type??'')!==type)errors.push(`${table.name}.${name}:live_type_or_column`);
    for(const c of actual)if(!(c.column_name in target))errors.push(`${table.name}.${c.column_name}:unexpected_live_column`);
    if(!actual.length || actual.some(c=>!c.rls || !c.forced))errors.push(`${table.name}:rls_not_forced`);
    return {name:table.name,legacyColumns:Object.keys(legacy).length,targetColumns:actual.length,generated:actual.filter(c=>c.generated).map(c=>c.column_name),added:Object.keys(target).filter(k=>!(k in legacy))};
  });
  for(const fn of contracts.functions.filter(f=>f.status==='PORTED')){
    const [schema,name]=fn.target.split('.');const result=await client.query<{prosecdef:boolean}>('SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',[schema,name]);
    if(!result.rows.length || result.rows.some(r=>r.prosecdef))errors.push(`${fn.legacy}:target_function_missing_or_definer`);
  }
  return {scope:'STATIC_LEGACY_VS_LIVE_TARGET',compatible:errors.length===0,errors,tables,functions:contracts.functions,discrepancies:contracts.discrepancies,
    sourceFiles:contracts.source_files,targetFiles:contracts.target_files,
    productionReady:false,reason:'Identity, objects, confirmation, historical imports and acceptance gates remain pending.'};
}
