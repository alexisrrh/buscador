import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import contracts from './contracts.json' with {type:'json'};

type Row=Record<string,unknown>;
type Fixture={marker:'BUSCAVACANTE_SYNTHETIC_V1';seed:string;rows:Record<string,Row[]>;userIds:string[]};
const epoch='2000-01-01T00:00:00.000Z',approved='2000-01-02T00:00:00.000Z';
export function syntheticId(seed:string,key:string):string {
  const hex=createHash('sha256').update('buscavacante-synthetic-v1:'+seed+':'+key).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function canonical(value:unknown):string {
  const normalize=(v:unknown):unknown=>{
    if(v instanceof Date)return v.toISOString();
    if(typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v)))return new Date(v).toISOString();
    if(Array.isArray(v))return v.map(normalize);
    if(v && typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalize(item)]));
    return v;
  };
  return JSON.stringify(normalize(value));
}
export function assertSyntheticDatabaseUrl(raw:string):URL {
  let url:URL;try{url=new URL(raw);}catch{throw new Error('SYNTHETIC_DATABASE_ONLY');}
  if(!['postgres:','postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || url.pathname!=='/buscavacante_test' || url.search || url.hash)throw new Error('SYNTHETIC_DATABASE_ONLY');
  return url;
}
/** Only internally generated, visibly synthetic data; no arbitrary input file. */
export function syntheticFixture(seed='transition-06g-v1'):Fixture {
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(seed))throw new Error('INVALID_SYNTHETIC_SEED');
  const id=(key:string)=>syntheticId(seed,key),rows:Record<string,Row[]>=Object.fromEntries(contracts.tables.map(t=>[t.name,[]]));
  const add=(table:string,key:string,data:Row)=>rows[table].push({id:id(key),created_at:epoch,...data});
  add('companies','company',{name:`Synthetic Company ${id('company')}`,website_url:'https://example.test'});
  add('job_sources','source',{code:'SYNTHETIC_'+id('source').replaceAll('-','').toUpperCase(),name:'Synthetic source',enabled:true,auto_apply_enabled:false});
  add('company_career_sources','board',{company_id:id('company'),platform:'LEVER',identifier:id('board'),careers_url:'https://example.test/careers',status:'ACTIVE',enabled:true});
  add('job_offers','offer',{company_id:id('company'),title:'Synthetic Frontend Developer',description:'Synthetic TypeScript fixture only',status:'ACTIVE',canonical_url:`https://example.test/jobs/${id('offer')}`,canonical_url_is_reliable:true,first_seen_at:epoch,last_seen_at:approved});
  add('job_offer_sources','offer-source',{job_offer_id:id('offer'),job_source_id:id('source'),company_career_source_id:id('board'),external_job_id:id('offer'),source_url:'https://example.test/jobs',canonical_source_url:`https://example.test/jobs/${id('offer')}`,raw_payload:{synthetic:true},first_seen_at:epoch,last_seen_at:approved});
  for(const actor of ['a','b']){
    const user=id(actor),candidate=id(actor+'-candidate'),search=id(actor+'-search'),resume=id(actor+'-resume'),draft=id(actor+'-draft');
    rows.profiles.push({id:user,first_name:'Synthetic',last_name:actor.toUpperCase(),created_at:epoch,deleted_at:null});
    add('candidate_profiles',actor+'-candidate',{user_id:user,name:'Synthetic Candidate '+actor,deleted_at:null});
    add('search_profiles',actor+'-search',{user_id:user,candidate_profile_id:candidate,name:'Synthetic Search',status:'ACTIVE',frequency_type:'INTERVAL',frequency_value:{minutes:60},timezone:'UTC',version:2,application_mode:'MANUAL',deleted_at:null});
    for(const version of [1,2]){
      add('job_preferences',actor+'-preferences-'+version,{user_id:user,candidate_profile_id:candidate,search_profile_id:search,search_profile_version:version,keywords:['TypeScript'],locations:[],work_modes:[],location_preference_state:'UNKNOWN',work_mode_preference_state:'UNKNOWN',salary_preference_state:'UNKNOWN'});
      add('job_matches',actor+'-match-'+version,{user_id:user,candidate_profile_id:candidate,search_profile_id:search,search_profile_version:version,job_offer_id:id('offer'),scoring_version:'deterministic-v2',score:78,eligibility_status:'REVIEW',score_components:{title:78},hard_gates:{searchActive:'PASS'},reasons:['Synthetic historical score; never recomputed during import'],status:version===1?'SAVED':'NEW'});
    }
    const ownership={user_id:user,candidate_profile_id:candidate};
    add('resumes',actor+'-old-resume',{...ownership,version:1,status:'ARCHIVED',original_filename:'synthetic-old.pdf',mime_type:'application/pdf',file_size_bytes:512,content_sha256:createHash('sha256').update(seed+actor+'old').digest('hex'),archived_at:approved,deleted_at:approved,approved_at:null});
    add('resumes',actor+'-resume',{...ownership,version:2,status:'APPROVED',original_filename:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:512,content_sha256:createHash('sha256').update(seed+actor).digest('hex'),approved_at:approved,archived_at:null,deleted_at:null});
    add('resume_extractions',actor+'-extraction',{...ownership,source_resume_id:resume,extractor_version:'synthetic-v1',extracted_text:'Synthetic text; not user evidence',structured_content:{lines:['Synthetic text']},deleted_at:null});
    add('professional_evidence_profiles',actor+'-subject',{...ownership,subject_type:'PROJECT',display_name:'Synthetic project',deleted_at:null});
    add('professional_evidence_items',actor+'-evidence',{...ownership,profile_id:id(actor+'-subject'),category:'TECHNOLOGY',exact_claim:'Synthetic historical claim',source_type:'APPROVED_RESUME',source_reference:'synthetic:'+resume,verification_status:'UNKNOWN',confirmed_at:null,relevance_tags:['synthetic'],deleted_at:null});
    add('professional_evidence_urls',actor+'-url',{...ownership,profile_id:id(actor+'-subject'),url:'https://example.test/portfolio',url_type:'PORTFOLIO',source_type:'APPROVED_RESUME',source_reference:'synthetic:'+resume,verification_status:'UNKNOWN',confirmed_at:null,deleted_at:null});
    add('application_drafts',actor+'-draft',{...ownership,search_profile_id:search,job_offer_id:id('offer'),source_resume_id:resume,status:'APPROVED',revision:1,job_analysis:{synthetic:true},profile_analysis:{synthetic:true},match_summary:{score:78,synthetic:true},resume_adaptation:{synthetic:true},deleted_at:null});
    rows.application_user_settings.push({user_id:user,auto_apply_enabled:false,created_at:epoch});
    add('user_application_answers',actor+'-user-answer',{user_id:user,question_key:'synthetic-city',question_text:'Synthetic city?',answer_type:'TEXT',answer_value:'Synthetic city',classification:'USER_CONFIRMATION',approved_at:approved});
    add('applications',actor+'-application',{...ownership,search_profile_id:search,job_offer_id:id('offer'),job_offer_source_id:id('offer-source'),application_draft_id:draft,resume_id:resume,apply_mode:'MANUAL',target_url:'https://example.test/apply',status:actor==='a'?'SUBMITTED':'PREPARED',attempt_count:actor==='a'?1:0,submitted_at:actor==='a'?approved:null,derived_resume_id:id(actor+'-derived-ready'),deleted_at:null});
    add('application_answers',actor+'-answer',{user_id:user,application_id:id(actor+'-application'),question_key:'synthetic-city',question_text:'Synthetic city?',answer_type:'TEXT',answer_value:'Synthetic city',source:'USER_APPROVED',confidence:1,requires_confirmation:false,classification:'USER_CONFIRMATION'});
    add('application_events',actor+'-event',{user_id:user,application_id:id(actor+'-application'),event_type:'CREATED',metadata:{synthetic:true}});
    if(actor==='a')add('application_events',actor+'-event-submitted',{user_id:user,application_id:id(actor+'-application'),event_type:'SUBMISSION_SUCCEEDED',metadata:{synthetic:true,historicalOnly:true},created_at:approved});
    for(const state of ['READY','ARCHIVED','FAILED','GENERATING']){
      const complete=['READY','ARCHIVED'].includes(state);
      add('derived_resumes',actor+'-derived-'+state.toLowerCase(),{...ownership,application_draft_id:draft,source_resume_id:resume,job_offer_id:id('offer'),status:state,generation_version:'synthetic-renderer-v1',sha256:complete?createHash('sha256').update(seed+actor+'derived').digest('hex'):null,size_bytes:complete?512:null,pages:complete?1:null,content_snapshot:complete?{name:'Synthetic Candidate',title:'Synthetic',target:'Synthetic',contact:[],sections:[]}:null,failure_code:state==='FAILED'?'SYNTHETIC_FAILURE':null});
    }
  }
  return {marker:'BUSCAVACANTE_SYNTHETIC_V1',seed,rows,userIds:[id('a'),id('b')]};
}
const identifier=(value:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error('INVALID_FIXTURE_IDENTIFIER');return '"'+value+'"';};
/** Administrative test connection is needed to SET ROLE, never used as runtime identity.
 * Every DML statement executes under bv_ingest or bv_app with forced RLS intact. */
export async function importSyntheticFixture(pool:Pick<Pool,'connect'>,seed='transition-06g-v1') {
  const fixture=syntheticFixture(seed),client=await pool.connect();let discard=false,canRollback=false;
  const counts:Record<string,number>={},records:Record<string,unknown[]>={},pendingApplications:Row[]=[];
  let inserted=0,existing=0;
  try {
    if(!['localhost','127.0.0.1','::1','[::1]'].includes(client.host) || client.database!=='buscavacante_test')throw new Error('SYNTHETIC_DATABASE_ONLY');
    const database=await client.query<{name:string;version:string}>("SELECT current_database() AS name,current_setting('server_version_num') AS version");
    const d=database.rows[0];if(d?.name!=='buscavacante_test' || Number(d.version)<170000 || Number(d.version)>=180000)throw new Error('SYNTHETIC_DATABASE_ONLY');
    canRollback=true;await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10s'");await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('buscavacante:synthetic-import',0))");
    const schema=await client.query<{table_name:string;column_name:string;json:boolean;generated:boolean}>(`SELECT c.relname AS table_name,a.attname AS column_name,
      t.typname='jsonb' AS json,a.attgenerated<>'' AS generated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`);
    async function role(table:string,row:Row) {
      const entry=contracts.tables.find(t=>t.name===table);if(!entry)throw new Error('UNMAPPED_FIXTURE_TABLE');
      await client.query(entry.role==='bv_ingest'?'SET LOCAL ROLE bv_ingest':'SET LOCAL ROLE bv_app');
      await client.query("SELECT set_config('app.user_id',$1,true)",[entry.role==='bv_ingest'?'':String(table==='profiles'?row.id:row.user_id)]);
      return entry;
    }
    async function write(table:string,row:Row,update=false) {
      const entry=await role(table,row),columns=Object.keys(row);
      for(const key of columns){const column=schema.rows.find(c=>c.table_name===table && c.column_name===key);if(!column || column.generated)throw new Error('FIXTURE_SCHEMA_MISMATCH');}
      const values=columns.map(key=>schema.rows.find(c=>c.table_name===table && c.column_name===key)!.json?JSON.stringify(row[key]):row[key]);
      const sql=update?`UPDATE public.${identifier(table)} SET ${columns.filter(c=>c!==entry.identity).map(c=>identifier(c)+'=$'+(columns.indexOf(c)+1)).join(',')} WHERE ${identifier(entry.identity)}=$${columns.indexOf(entry.identity)+1}`
        :`INSERT INTO public.${identifier(table)}(${columns.map(identifier).join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`;
      await client.query(sql,values);
    }
    async function read(table:string,row:Row):Promise<Row|null> {
      const entry=await role(table,row);return (await client.query<{row:Row}>(`SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t WHERE ${identifier(entry.identity)}=$1`,[row[entry.identity]])).rows[0]?.row??null;
    }
    function matches(row:Row,actual:Row) {return Object.entries(row).every(([key,value])=>canonical(actual[key])===canonical(value));}
    for(const table of contracts.tables){counts[table.name]=fixture.rows[table.name].length;
      for(const row of fixture.rows[table.name]){
        const actual=await read(table.name,row);
        if(actual){if(!matches(row,actual))throw new Error('SYNTHETIC_FIXTURE_DRIFT:'+table.name);existing++;continue;}
        let stage={...row};
        if(table.name==='resumes')stage={...row,status:'DRAFT',approved_at:null,archived_at:null,deleted_at:null};
        if(table.name==='derived_resumes')stage={...row,status:'GENERATING',sha256:null,size_bytes:null,pages:null,content_snapshot:null,failure_code:null};
        if(table.name==='applications')stage={...row,status:'PREPARED',attempt_count:0,submitted_at:null,derived_resume_id:null};
        await write(table.name,stage);inserted++;
        if(table.name==='resumes'){
          if(row.status==='APPROVED')await write(table.name,{id:row.id,user_id:row.user_id,status:'READY'},true);
          await write(table.name,{id:row.id,user_id:row.user_id,status:row.status,approved_at:row.approved_at,archived_at:row.archived_at,deleted_at:row.deleted_at},true);
        }
        if(table.name==='derived_resumes' && row.status!=='GENERATING'){
          if(row.status!=='FAILED')await write(table.name,{id:row.id,user_id:row.user_id,status:'READY',sha256:row.sha256,size_bytes:row.size_bytes,pages:row.pages,content_snapshot:row.content_snapshot},true);
          if(row.status!=='READY')await write(table.name,{id:row.id,user_id:row.user_id,status:row.status,failure_code:row.failure_code},true);
        }
        if(table.name==='applications')pendingApplications.push(row);
      }
    }
    for(const row of pendingApplications){await write('applications',{id:row.id,user_id:row.user_id,derived_resume_id:row.derived_resume_id},true);
      await write('applications',{id:row.id,user_id:row.user_id,status:row.status,attempt_count:row.attempt_count,submitted_at:row.submitted_at},true);}
    for(const table of contracts.tables){records[table.name]=[];for(const row of fixture.rows[table.name]){
      const actual=await read(table.name,row);if(!actual || !matches(row,actual))throw new Error('SYNTHETIC_RECONCILIATION_FAILED:'+table.name);records[table.name].push(actual);
    }}
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('COMMIT');
    return {marker:fixture.marker,seed,inserted,existing,counts,rows:Object.values(counts).reduce((a,b)=>a+b,0),
      digest:createHash('sha256').update(canonical(records)).digest('hex'),objectsCopied:0,productionReady:false,
      limitations:['Synthetic domain rows only; no auth users, sessions or object bytes imported.','Historical lifecycle updated_at fidelity and archived-parent imports remain gated.']};
  }catch(error){if(canRollback){try{await client.query('ROLLBACK');}catch{discard=true;}}throw error;}finally{client.release(discard);}
}
