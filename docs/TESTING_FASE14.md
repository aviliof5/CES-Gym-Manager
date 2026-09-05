# Fase 14 — Testing manual cruzado por rol (2026-09-04)

Pase completo contra `test-harness.html` (mock backend, `mock-client.js`), con
clicks reales en un navegador — no solo lectura de código. Objetivo: probar
los 4 roles de punta a punta (alta → aprobación → dashboard → acciones
propias de cada rol) después de que Fase 2–13 quedaron completas, y confirmar
que nada se rompió al modularizar/rebrandear/agregar owner-role.

## Cobertura

**Dueño** (`Fase14 Owner`, gimnasio `Fight Club Test Gym`):
- Alta en 4 pasos (datos personales → gimnasio → equipo → planes) — cada paso
  guarda lo cargado y lo siguiente lo refleja de verdad (el plan creado en el
  paso 4 aparece después en el selector de plan del cliente; el equipo del
  paso 3 aparece en "Máquinas disponibles" y alimenta la rutina con IA).
- Dashboard con métricas en cero honestas (0 clientes, 0 entrenadores, $0,
  0 check-ins) al recién crear el gimnasio — nada inventado.
- Código/link de invitación visible y funcional.
- Aprobación de administrador: sin gate (no requiere clientes interesados,
  a diferencia de entrenador) — confirmado.
- Gate de "10 clientes interesados" para entrenadores: con un candidato en
  0/10, el botón "Aprobar" está deshabilitado y un click no cambia el estado
  (verificado — no solo visualmente gris, sino que el click no tuvo efecto).

**Administrador** (`Admin Uno`):
- Alta → pantalla "Perfil en revisión" (correcta: dice que el *dueño* debe
  aprobar, no un admin) → aprobado por el dueño → login → mismo dashboard
  que el dueño (`Panel de administrador`) **sin la tab "Admins"** — paridad
  total confirmada, sin permisos exclusivos de dueño, tal como pide
  `docs/ROLES_AND_PERMISSIONS.md`.
- Como admin: registró el check-in del cliente y cobró/confirmó su pago en
  efectivo — ambas operaciones de "staff", no exclusivas de dueño, funcionan.

**Entrenador** (`Coach Uno`):
- Alta → selector de gimnasio (aparece junto a los gimnasios semilla del
  mock, ej. "PowerHouse Gym") → "Perfil en revisión".
- Contador "0/10 clientes interesados" visible al dueño, subió a 1/10 al
  marcar interés un cliente y volvió a 0/10 al desmarcarlo (toggle
  bidireccional confirmado).

**Cliente** (`Cliente Uno`):
- Alta en 4 pasos: datos personales (con **foto de rostro obligatoria** —
  confirmado que "Continuar" queda deshabilitado sin foto y se habilita
  al cargarla) → condición física (opcional) → selección de gimnasio →
  selección de plan (mostró el plan real creado por el dueño) →
  ¿entrenador? (sin candidatos aprobados aún, eligió "No, por mi cuenta").
- Dashboard: plan correcto, "Mi QR" con estado vacío honesto ("Todavía no
  tenés check-ins registrados"), máquinas del gym reales.
- Rutina con IA: generada en base al equipo real del gimnasio (no
  fabricada — el pie de la rutina dice "Basado en el equipo disponible de
  Fight Club Test Gym"), modo entrenamiento funcional (marcar ejercicio
  completado, avanzar).
- Progreso: estado vacío honesto, subida de foto de progreso funcional
  (ejercita el bucket de Storage — mismo camino que arregló la migración
  de Fase 12).
- Tab Entrenar: togglear "Me interesa" en un entrenador candidato
  incrementa/decrementa el contador en tiempo real.
- Pago: "Próximo pago $50 · Aún no hay un cobro generado. Pedí al
  administrador que genere tu código QR para pagar" — el cliente **nunca**
  puede confirmar su propio pago, coherente con `SECURITY_AUDIT.md`.
- Reseñas (como admin, vista compartida): "Promedio — / 5 · 0 reseñas" —
  guion en vez de "0" cuando no hay reseñas, evita mostrar un promedio falso.

**Responsive**: a ancho de escritorio (≥900px) el layout usa sidebar lateral
con tabs; a ancho móvil (375px) cambia a una barra de tabs inferior — el
breakpoint de `styles.css` (Fase 8) funciona en ambas direcciones.

**Consola del navegador**: sin errores nuevos en todo el pase (decenas de
clicks, 4 altas de cuenta, 2 aprobaciones, 1 check-in, 1 cobro, 1 subida de
foto), salvo el hallazgo de abajo.

## Hallazgo (menor, no bloqueante) — ✅ corregido (2026-09-04)

**Copiar link de invitación no avisaba si fallaba.** `copyInviteLink()` en
[actions.js:186](../src/actions.js#L186) hacía `try { await
navigator.clipboard.writeText(link) } catch { console.error(...); return }`
— si el navegador deniega el permiso de portapapeles (poco común, pero
ocurre en navegadores en modo automatizado/sandbox, algunas configuraciones
corporativas, o contextos no-HTTPS), el usuario no veía ningún error en
pantalla: el botón simplemente no cambiaba a "¡Copiado!" y no pasaba nada.

Corregido agregando `state.inviteLinkCopyFailed` ([state.js](../src/state.js))
que se prende 2.5s cuando el `catch` se dispara. El botón "Copiar link" en
[owner.js `inviteCard()`](../src/screens/owner.js) pasa a "No se pudo
copiar" con borde/texto rojo, y aparece una línea debajo: "Tu navegador no
dejó copiar automático — copiá el código de arriba a mano." El código
sigue visible en la tarjeta de todos modos, así que no hay pérdida real de
funcionalidad — esto solo agrega el feedback que faltaba. Verificado en
vivo contra `test-harness.html` (este entorno deniega el portapapeles de
forma consistente, así que reprodujo el fallo real): el botón cambió a
"No se pudo copiar" apenas se disparó el `catch`, confirmado leyendo el DOM
inmediatamente después del click.

## Qué no se probó en este pase

- Completar el gate de entrenador hasta 10/10 con 10 clientes reales
  (impráctico a mano) — la lógica de conteo server-side ya se verificó con
  pruebas de umbral reales en Fase 11 (rechazado en 9, aceptado en 10).
- Flujos de "Rechazar" (admin/entrenador) y "Cancelar cobro".
- El camino de invitación por URL (`?invite=CODE`) que salta el selector de
  gimnasio — ya se había verificado en vivo al construir la Fase 10; acá se
  cubrió el mismo `join_gym()` por la vía del selector manual.

## Conclusión

Los 4 roles funcionan de punta a punta sobre el mock, con paridad
dueño/admin confirmada, los dos gates de aprobación (admin sin gate,
entrenador con gate de 10) comportándose como se diseñó, y ningún estado
inventado en ninguna pantalla — todo lo que se muestra viene de datos
reales cargados en el flujo de prueba. El único hallazgo (menor, de UX, sin
impacto en seguridad ni en datos) ya está corregido.

## Re-verificación tras Fase 15/16 (2026-09-05)

Las Fases 15 (QR real + cámara) y 16 (alta de dueño interna + invitación por
rol) cambiaron justo las pantallas de auth/registro que este documento
cubría — ameritaba repetir el pase, esta vez sobre `main` ya con las 3
migraciones de esas fases mergeadas. Pase corto, enfocado en lo que
realmente cambió (no se repitió lo que Fase 15/16 no tocaron: pagos,
progreso, reseñas, etc. — eso sigue tal cual se documentó arriba):

- **Alta de dueño gateada**: sin `?owner_invite=`, `viewOwnerAuth` muestra
  solo "Iniciar sesión" + el aviso — confirmado en el código ya mergeado a
  `main` (no solo en la rama de feature). Login como la cuenta semilla
  `is_platform_admin` → tab "Plataforma" → generó un token real → habilitó
  "Registrarme" → alta completa de un gimnasio nuevo (`create_gym` con el
  token) → generó los 3 códigos de invitación distintos, tal como en la
  verificación original de la Fase 16.
- **Entrenador por link**: código de invitación de entrenador del gimnasio
  recién creado → `viewTrainerAuth` habilitó "Registrarme" solo con ese
  link resuelto → alta se unió directo al gimnasio (sin selector público)
  → cayó en "Perfil en revisión" → el dueño lo vio en Coaches con
  "0/10 clientes interesados" y "Aprobar" deshabilitado — el gate de la
  Fase 11 sigue intacto, no lo tocó la Fase 16.
- **Cliente por link**: código de invitación de cliente del mismo gimnasio
  → alta con foto de rostro obligatoria (verificado que sigue bloqueando
  sin foto) → se unió directo al gimnasio (mismo comportamiento que ya
  tenía desde antes de la Fase 16, sin cambios) → llegó honestamente a un
  selector de plan vacío (no se había creado ningún plan para este
  gimnasio de prueba — esperado, no es un bug).
- **Consola limpia**: cero errores nuevos en todo el pase (alta de dueño,
  alta de entrenador, aprobación, alta de cliente).

No se repitió la prueba de escaneo de QR por cámara real (el entorno de
prueba la sigue bloqueando, igual que en la Fase 15) ni la rotación de
código de invitación (ya verificada en `MIGRATION_PLAN.md` Fase 16 contra
producción real, verificación más fuerte que repetirla acá contra el mock).
