"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { prepareApplication } from "@/app/actions/applications";
const stages = ["Analizando requisitos…", "Adaptando tu CV…", "Preparando respuestas…", "Validando candidatura…"];
export function ApplicationPrepButton({ matchId }: { matchId: string }) { return <form action={prepareApplication}><input type="hidden" name="job_match_id" value={matchId} /><ProgressButton /></form>; }
function ProgressButton() { const { pending } = useFormStatus(); const [stage, setStage] = useState(0); useEffect(() => { if (!pending) return; const timer = setInterval(() => setStage(value => Math.min(value + 1, stages.length - 1)), 700); return () => clearInterval(timer); }, [pending]); return <>{pending && <div className="agent-overlay" role="status"><div><span className="agent-orb" /><h2>Preparando candidatura</h2><p>{stages[stage]}</p><div className="progress-line"><span style={{ width: `${((stage + 1) / stages.length) * 100}%` }} /></div></div></div>}<button type="submit" disabled={pending} aria-live="polite">{pending ? stages[stage] : "Postularme"}</button></>; }
