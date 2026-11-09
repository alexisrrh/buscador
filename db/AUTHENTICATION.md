# Better Auth — entrega 07A

Base aislada para Better Auth 1.7.18 y PostgreSQL 17. La tarea 07 sigue abierta: esta entrega no monta `/api/auth`, no cambia formularios ni sustituye Supabase en las rutas actuales. No crea servicios, usuarios ni envíos reales.

## Contrato

- Email normalizado, máximo 254 caracteres; nombre de 2–80; contraseña de 12–128. Alta sin inicio automático y verificación obligatoria de email.
- UUID generados por Better Auth; cookies propias `buscavacante-target`, HttpOnly, SameSite=Lax y Secure con HTTPS. Origen explícito, HTTP permitido solo en loopback de pruebas. Sin JWT ni sesiones heredadas aceptados.
- Sesiones de un día, consulta a DB sin caché de cookie. Cada operación privada obtiene actor nuevo; comprueba cuenta verificada, habilitada y no eliminada. El cierre actual conserva otros dispositivos; cierre global y reset revocan sesiones.
- Recuperación de un uso, vigencia máxima 900 segundos; identificador almacenado mediante hash. Respuestas de registro duplicado y recuperación sin enumerar cuentas. Límites persistidos por dirección: login/registro 5 y recuperación 3 por minuto; el borde de despliegue deberá establecer la IP fiable en 07B.
- `requireTargetActor` reutiliza autorización/perfil existentes, conserva UUID, crea perfil idempotente y rechaza un perfil eliminado sin reactivarlo. El ensayo de cuenta importada usa exclusivamente una identidad sintética y un secreto aleatorio desconocido, seguido de recuperación.

## Separación de credenciales y esquema

`db/bootstrap.sql` provisiona explícitamente el grupo NOLOGIN `bv_auth` y el esquema `identity`, propiedad de `bv_owner`. Ejecutar el bootstrap actualizado antes de aplicar 0008 en un destino existente. El migrador habitual conserva ledger, checksums y rol propietario; las migraciones 0001–0007 son inmutables. El manifiesto de transición añade el checksum de 0008.

La migración 0008 crea cinco tablas de identidad: users, sessions, accounts, verifications y rate_limits. No forman parte de las 22 tablas de dominio inventariadas. RLS forzado permite al backend de identidad resolver cuentas antes de disponer de actor; solo `bv_auth` tiene CRUD. No hay privilegios de DDL, acceso al dominio ni funciones SECURITY DEFINER. El login dedicado de autenticación debe heredar solo `bv_auth`, nunca roles de aplicación/ingesta/catálogo/propietario ni atributos privilegiados. Las credenciales de dominio tampoco acceden a identidad. Los guards comprueban esa separación.

`createAuthPool` exige URL explícita sin parámetros que alteren configuración, search_path=identity y timeouts. `createTargetAuth` verifica rol y esquema antes de servir. No hay conexión, migración automática ni instancia global al importar módulos. Los secretos y pools se inyectan desde servidor; no existe fallback a Supabase ni al administrador.

## Validación y límites

Pruebas unitarias de política/configuración y pruebas PostgreSQL nativas mediante el handler real de Better Auth: esquema contra la versión fijada sin ejecutar DDL automático, permisos, verificación, límites, CSRF/origen, actores/UUID, cierre individual/global, cuenta deshabilitada, perfil eliminado, reset expirado/repetido/concurrente y rate limit entre instancias. `npm run check` y `npm run test:db`; evidencia final del commit en el PR. La base nativa es únicamente loopback/buscavacante_test. Las pruebas en memoria de correo no acreditan entrega por un proveedor real.

07B debe añadir el enlace FK de profiles→identity.users y su ensayo de importación, conectar rutas/acciones/UI preservando la intención pública y los límites de validación, configurar correo de seguridad con cola/duración/reintentos, sanitizar IP del proxy y probar el recorrido completo. Los formularios activos continúan con la validación legada hasta esa entrega. Los puertos `mail.enqueue` y `background` de 07A necesitan implementaciones durables antes de cualquier activación; una promesa en memoria no es garantía de entrega. Verificación/reset deben seguir independientes de preferencias opcionales. Vinculación social y eliminación de cuenta por Better Auth están deshabilitadas hasta su flujo autorizado.

No se cierra la tarea 06 ni se activa TARGET. Después de completar 07 siguen 08 (Tigris) y 06H (ensayo integral); se conservan las discrepancias históricas de importación y los gates funcionales/operativos.

## Dependencias y fuentes

Al instalar Better Auth se detectaron avisos preexistentes en Next.js y dependencias transitivas. Se actualizan Next.js/eslint-config-next a 16.4.5, Vitest/coverage a 4.1.12 y el lockfile con `npm audit fix` sin force. Auditoría de producción: cero avisos; quedan ocho moderados en herramientas de desarrollo (cadena ESLint/minimatch), pendientes de tarea 26. No se fuerza el downgrade incompatible sugerido por npm. La actualización mitiga avisos del paquete; no implica que la aplicación haya sido explotada.

Referencias oficiales: [instalación](https://better-auth.com/docs/installation), [email y contraseña](https://better-auth.com/docs/authentication/email-password), [PostgreSQL](https://better-auth.com/docs/adapters/postgresql), [sesiones](https://better-auth.com/docs/concepts/session-management), [Next.js](https://better-auth.com/docs/integrations/next), [opciones](https://better-auth.com/docs/reference/options), [seguridad](https://better-auth.com/docs/reference/security). La configuración y el esquema se contrastan con el código instalado 1.7.18; la caché de sesión se desactiva para revocación inmediata. Avisos mitigados de Next.js: [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw).
