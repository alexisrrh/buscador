# CV derivados — 06E2

PR #8 integrado por el usuario en develop (72f66d0). La migración 0007 añade derived_resumes y su relación con applications. Se completan las 22 tablas inventariadas del destino; esto no cierra la tarea 06 ni acredita la migración o el producto completo. Supabase sigue en uso y ninguna ruta cambia de proveedor.

## Contrato conservado

UUID, contexto usuario/candidato/borrador/CV base/oferta, formato, ruta generada, versión de generación, hash, tamaño, páginas, snapshot y estados GENERATING/READY/FAILED/ARCHIVED se conservan. La FK de application_drafts_render_identity ya estaba preparada en 06F; ahora applications_derived_identity impide adjuntar el archivo de otro contexto. Los guards del legado se portan a app como SECURITY INVOKER, sin privilegios de servicio ni políticas de Supabase Storage.

RLS forzada y SELECT/INSERT/UPDATE de bv_app aíslan el registro. No se conceden DELETE/TRUNCATE ni acceso a roles de catálogo/ingesta. Solo se crea GENERATING sin metadatos finales; al iniciar y al pasar a READY se exige borrador y CV base aprobados no eliminados del mismo contexto. El repositorio también bloquea candidato/perfil activo. La identidad es inmutable; READY/FAILED son terminales salvo READY→ARCHIVED, que conserva hash, bytes declarados y snapshot. La columna generada storage_path se excluye de comparaciones BEFORE UPDATE, como en el guard del legado.

## Repositorio y almacenamiento

PostgresDerivedResumeRepository usa ActorContext y UnitOfWork existentes. create solo admite PDF, igual que el generador actual; el enum DOCX permanece para compatibilidad/importación, sin afirmar soporte de generación nuevo. GENERATION_VERSION, DerivedResume y ResumeContent se reutilizan. El renderer PDF y buildResumeContent permanecen sin cambios.

complete recibe metadatos y ResumeContent del servicio de generación. ResumeObjectReader descarga fuera de la transacción y con límite de tamaño; se verifican bytes/hash/firma PDF. Después se vuelve a comprobar el contexto aprobado y se marca READY con un update condicionado a GENERATING. Dos finalizadores no pueden sobrescribir el artefacto. Un fallo no cambia otro READY ni sustituye su snapshot. fail guarda un código acotado sin texto diagnóstico privado; corresponde al orquestador llamarlo y reconciliar objetos huérfanos cuando sea necesario.

El snapshot viene del servicio servidor que debe reconstruir/validar evidencia con buildResumeContent y generar bytes con renderResumePdf. Este repositorio no considera confiable por sí mismo un JSON recibido del navegador, ni vuelve a extraer el CV base. La prueba de integración utiliza ambos módulos existentes y persiste sus bytes/metadatos reales. El recorrido completo de archivo base→extracción→evidencia→descarga requiere los adaptadores de tareas 08/10/19 antes de activar el destino. No se llama al bootstrap automático de evidencia del legado.

No se instala ni configura Tigris. La implementación del lector deberá limitar antes de asignar memoria y usar objetos inmutables; escritura, staging, retención, firma de acceso y reconciliación siguen en tarea 08. No se emiten enlaces públicos ni se procesa ningún archivo real del usuario.

## Selección y archivo

attach comprueba propiedad, contexto, READY, candidatura editable y attempt_count=0, bloqueando candidatura/archivo. El guard SQL impide cambiar o retirar el archivo después de un intento o en SUBMITTING/SUBMITTED/WITHDRAWN. No ejecuta intentos ni conectores. archive conserva los metadatos; un archivo archivado ya no puede seleccionarse de nuevo. Si estaba referenciado, la FK y el histórico se conservan; la política de descarga/retención de esos históricos se cerrará en tareas 08/19/21 antes de conectar pantallas.

## Evidencia y siguiente paso

npm run check verifica lint, tipos, pruebas, cobertura y build. npm run test:db utiliza PostgreSQL 17 temporal en Actions: renderer existente, aprobación al iniciar/finalizar, integridad, snapshots inmutables, dos usuarios/roles neutrales, FKs, selección congelada, archivo sin resurrección y finalización concurrente con conexiones independientes. Última evidencia remota y revisión/fusión en el PR; Docker local no respondió en las entregas anteriores.

Siguiente 06G: comparar contratos y preparar importación repetible de fixtures, incluyendo cómo transitar GENERATING→READY→ARCHIVED sin eludir guards al importar históricos. Después Better Auth (07), Tigris (08) y ensayo integral (06H); no hay migración real ni activación implícita por completar las tablas.
