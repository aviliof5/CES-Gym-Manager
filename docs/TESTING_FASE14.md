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

## Hallazgo (menor, no bloqueante)

**Copiar link de invitación no avisa si falla.** `copyInviteLink()` en
[actions.js:186](../src/actions.js#L186) hace `try { await
navigator.clipboard.writeText(link) } catch { console.error(...); return }`
— si el navegador deniega el permiso de portapapeles (poco común, pero
ocurre en navegadores en modo automatizado/sandbox, algunas configuraciones
corporativas, o contextos no-HTTPS), el usuario no ve ningún error en
pantalla: el botón simplemente no cambia a "¡Copiado!" y no pasa nada. El
código de invitación sigue visible en la tarjeta así que no hay pérdida de
funcionalidad (el usuario puede copiarlo a mano), pero no hay feedback de
que el copiado automático falló. Severidad baja — no toca seguridad ni
datos, es una mejora de UX pendiente si se quiere pulir.

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
reales cargados en el flujo de prueba. Un solo hallazgo menor de UX, sin
impacto en seguridad ni en datos.
