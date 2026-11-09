import { analyzeGaps,analyzeJobOffer,buildCandidateEvidence,structureResumeText } from '@/lib/applications/analysis';
import { EvidenceBasedApplicationGenerator } from '@/lib/applications/generator';
import type { SaveApplicationDraftInput } from '@/lib/server/db/application-repository';
export async function applicationDraftInput(ids:{candidateProfileId:string;searchProfileId:string;jobOfferId:string;resumeId:string}):Promise<SaveApplicationDraftInput> {
  const job=analyzeJobOffer({title:'Frontend Developer',description:'React and TypeScript',location_text:'Spain',work_mode:'REMOTE',
    employment_type:'FULL_TIME',salary_min:null,salary_max:null,salary_currency:null,companies:{name:'Synthetic Company'}});
  const evidence=buildCandidateEvidence({name:'Synthetic Candidate',headline:'Frontend Developer',job_family:'FRONTEND',seniority:'MID'},
    structureResumeText('EXPERIENCE\nFrontend Developer — Synthetic Studio — 2022–2024\nBuilt React interfaces with TypeScript.'),job);
  const gaps=analyzeGaps(job,evidence);const generated=await new EvidenceBasedApplicationGenerator().generate({job,evidence,gaps});
  return {...ids,job,evidence,gaps,generated,matchSummary:{score:80}};
}
