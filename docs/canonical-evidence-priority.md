# Calidad del CV adaptado — Canonical

## Diagnóstico

CandidateEvidence v1 distinguía experiencia, proyectos, educación e idiomas mediante headings, pero guardaba cada sección como un array plano. No distinguía empleo técnico de no técnico, ni registraba proyectos como bloques con nombre/tecnologías/enlaces. El generador copiaba la experiencia completa y filtraba skills conservando el orden del catálogo; el validador del resumen solo admitía literalmente el headline o familia/seniority. La UI omitía proyectos y formación aunque ya estaban almacenados. El renderer fijaba experiencia antes de proyectos. La extracción solo leía texto, por lo que perdía el destino de los enlaces «Github» y «Linkedin» del PDF. Además, una lista ATS aplanada mezclaba requisitos required y preferred.

## Cambios

- Extracción `text-v2-links`: conserva links HTTP(S) del PDF y genera una caché nueva sin reemplazar la anterior. No visita los enlaces ni consulta repositorios externos.
- EvidenceBlock por proyecto, empleo y formación, con líneas originales, identidad, tecnologías acreditadas y enlaces del bloque. Un rol dentro de PROYECTOS no se convierte en empleo.
- Selección `evidence-priority-v2`, generador `evidence-based-v2`: primero mandatory, después preferred, relevancia de familia y evidencia restante. Proyectos ordenados por coincidencias; orden técnico solo cuando la oferta y la evidencia lo justifican.
- Resumen determinista y factual. Permite reformulación respaldada por proyectos/formación/skills; corrige «fronted» y «produccion» sin introducir años, métricas, usuarios o responsabilidades.
- Experiencia adicional compacta mantiene cargo, empresa, fechas y ubicación. Cuando la segmentación es incierta se conserva el bloque completo.
- UI y contenido del renderer comparten las mismas secciones validadas. Skills agrupadas para dar espacio a proyectos. Los drafts antiguos siguen admitiendo su estructura anterior.
- Anti-invención: comparación canónica de toda la adaptación v2 con la selección reconstruida desde evidencia; el renderer vuelve a extraer el original. Alteraciones de proyectos, fechas, links, summary, skills o secciones se rechazan.
- Regeneración no puede sobrescribir un draft que haya pasado a APPROVED durante el proceso.

## BEFORE / AFTER real

| Aspecto | Antes | Después |
| --- | --- | --- |
| Resumen | «desarrollador fronted orientado a produccion» | Resumen profesional apoyado en formación Full Stack y proyectos web |
| Skills iniciales | CSS, Git, HTML, JavaScript, Python, React | JavaScript, HTML, CSS, Git, React, Node.js, Python |
| Protagonismo | Instalación solar y atención al cliente | Tres proyectos web y formación técnica |
| Empleo técnico | No diferenciado | Ninguno acreditado; no se inventa |
| Experiencia adicional | 23 líneas de cargos y funciones | 9 líneas originales de cargo, empresa, fechas/ubicación |
| Portfolio/GitHub | Sin sección de enlaces verificados | Portfolio, GitHub y LinkedIn del CV visibles |
| Missing skills | TypeScript | TypeScript y SCSS, sin evidencia en el CV |

Resumen guardado:

> Desarrollador web con formación Full Stack y experiencia práctica en proyectos de aplicaciones web. Tecnologías acreditadas: JavaScript, HTML, CSS, Git y React.

Skills, en orden: JavaScript, HTML, CSS, Git, React, Node.js, Python, REST, Tailwind CSS, Bootstrap, Vite, Redux, Supabase, PostgreSQL, SQL, GitHub, Capacitor, Express, Flask, JWT, MySQL, SQLAlchemy.

Proyectos, en orden:

1. `www.nutrismartcoach.com`: nutrición/fitness, análisis nutricional, dietas personalizadas y seguimiento; React, Vite, Tailwind CSS, Capacitor, Node.js, Express, Supabase/PostgreSQL, APIs REST e integración Gemini, según las líneas originales.
2. Consultorio Odontológico LAC: odontograma, pacientes e historiales; React/Vite/Bootstrap, Supabase/PostgreSQL, autenticación y sincronización, según el CV.
3. VHSFlix: SPA, autenticación JWT y APIs TMDB/YouTube; React/Tailwind, Python/Flask/SQLAlchemy, según el CV.

Enlaces verificados en el archivo: `https://portafolio-alexis-chi.vercel.app/`, `https://github.com/alexisrrh`, `https://www.linkedin.com/in/alexisrrh`. Los proyectos tienen sus enlaces demo; no se inventaron repositorios GitHub por proyecto. TypeScript no figura en los campos actuales del perfil ni en las descripciones/tecnologías del CV. No se deduce a partir de React o GitHub. SCSS se distingue de CSS: tampoco se acredita por saber CSS.

Formación conservada: Full Stack Software Developer y Full Stack With AI, 4Geeks Academy España (2026); rutas HTML/CSS/GitHub, JavaScript y React/Redux de Codecademy (2024–2025).

Experiencia adicional:

- Instalador de Paneles Solares — Parques Fotovoltaicos — 02/2025–12/2025, Burdeos, Francia.
- Atención al Cliente — Isadri S.L — 01/2024–01/2025, Leganés, Madrid.
- Atención al Cliente — Carrefour Express — 10/2022–12/2023, Arguelles, Madrid.

## Validación

El mismo draft `c748fdf5-0e8d-40b7-83fd-648150966c35` fue reprocesado mediante la Server Action Regenerar contra Supabase remoto. Sigue READY_FOR_REVIEW, con el mismo source_resume. La página muestra proyectos antes de experiencia adicional y los enlaces verificados. La función de construcción del contenido ATS también validó esa selección sin renderizar un PDF real.

173 unit tests PASS (20 nuevos de priorización/anti-invención); 8 opcionales omitidos en la suite general. Typecheck, lint y build PASS. Sin migración nueva, aprobación, DerivedResume real, envío, commit ni push.

El clasificador es conservador y determinista: conserva líneas cuando no puede compactar con confianza. No obtiene evidencia del contenido actual de websites o repositorios; verifica únicamente CV y datos de perfil disponibles. No hubo despliegue del código a hosting remoto durante esta intervención.
