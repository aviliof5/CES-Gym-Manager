/* Bolá — mock de BolaAPI para probar app.js sin un Supabase real.
   SOLO para desarrollo/verificación (ver test-harness.html) — nunca se
   carga desde index.html. Reproduce las reglas de negocio de las
   migraciones (quién puede hacer qué) para que las pruebas contra esto
   digan algo real sobre el control de flujo de app.js, aunque no verifiquen
   el SQL/RLS en sí — eso se revisó a mano en supabase/migrations. */

'use strict';

(function () {
  const wait = (ms) => new Promise(r => setTimeout(r, ms == null ? 30 : ms));
  const uid = (() => { let n = 0; return (prefix) => `${prefix}-${++n}`; })();

  const db = {
    gyms: [],
    profiles: [],       // {id, role, gym_id, name, email, phone, password}
    trainers: [],        // {user_id, gym_id, specialty, price, status}
    gymAdmins: [],        // {user_id, gym_id, status} — mismo patrón que trainers, sin specialty/price
    clientProfiles: [],  // {user_id, gym_id, plan_id, trainer_user_id, face_photo_key, weight, height, age, level, goal, membership_status, membership_expires_at, last_payment_at}
    equipment: [],
    plans: [],
    progress: [],         // {id, client_user_id, storage_key, taken_at}
    routines: [],          // {id, client_user_id, source, goal, author_user_id}
    routineExercises: [],  // {id, routine_id, position, text}
    payments: [],           // {id, client_user_id, gym_id, amount, status, created_by, confirmed_by, confirmed_at}
    reviews: [],
    checkinEvents: [],       // {id, gym_id, client_user_id, checked_in_by, created_at}
    trainerInterest: [],      // {candidate_user_id, client_user_id, gym_id}
    storage: new Map(),      // path -> File
    // Fase 16 — invitaciones. gymInvites reemplaza gyms.invite_code como
    // fuente de verdad (un código por rol, no uno compartido); ownerInvites
    // son los tokens de un solo uso que generan alta de dueño.
    gymInvites: [],          // {gym_id, role: 'admin'|'trainer'|'client', code}
    ownerInvites: [],        // {token, note, created_by, created_at, used_at, used_by_user_id}
    // Etapas 2-4 del rediseño (ver supabase/migrations/20260905000300) —
    // mismas tablas, mismas reglas, del lado del mock.
    exercises: [],            // {id, gym_id|null, name, muscle_group, equipment_name, media_key, description}
    programTemplates: [],      // {id, name, level, goal, days_per_week, duration_label} — catálogo global (Programas del xlsx)
    programTemplateItems: [],  // {id, program_id, day_label, day_position, position, exercise_id, exercise_name, sets, reps, rest_seconds}
    classes: [],              // {id, gym_id, name, description, trainer_user_id, duration_minutes, capacity}
    classSessions: [],        // {id, class_id, gym_id, starts_at}
    classBookings: [],        // {id, session_id, client_user_id, gym_id, status}
    notifications: [],        // {id, gym_id, client_user_id, title, body, type, related_id, created_at, read_at}
    staffNotifications: [],   // {id, gym_id, recipient_user_id, title, body, type, related_id, created_at, read_at} — cliente -> staff (pago confirmado por QR)
    achievements: [],         // {id, code, name, description, icon, target, metric}
    clientAchievements: [],   // {client_user_id, achievement_id, progress, earned_at}
    bodyMeasurements: [],     // {id, client_user_id, taken_at, weight_kg, body_fat_pct, waist_cm, chest_cm, arm_cm, thigh_cm}
    workoutSessions: [],      // {id, client_user_id, gym_id, source, started_at, finished_at}
    exerciseLogs: [],         // {id, workout_session_id, client_user_id, exercise_name, set_number, reps, weight_kg}
    trainerReviews: [],       // {id, trainer_user_id, client_user_id, rating, text}
    conversations: [],        // {id, gym_id, trainer_user_id, client_user_id}
    messages: [],             // {id, conversation_id, sender_user_id, body, created_at, read_at}
    // Fight Club Training Engine (ver supabase/migrations/20260917000000_training_engine_profile.sql)
    trainingProfiles: [],           // {user_id, gym_id, sex, primary_goal, secondary_goal, training_time_bucket, machine_comfort, days_per_week, session_minutes, preferred_style, priority_muscles, somatotype, evaluated_at, updated_at}
    clientExercisePreferences: [],  // {id, client_user_id, exercise_id, exercise_name, preference}
    clientLimitations: [],          // {id, client_user_id, joint, painful_movement, note}
  };

  let session = null; // {id, role}

  // Espejo mínimo de payments.subscribeToClient() del lado real (Postgres
  // Realtime) — acá no hay red, así que alcanza con un pub/sub en memoria:
  // clientUserId -> Set de callbacks a avisar cuando alguien toca uno de
  // sus pagos (createCashCharge/confirm/cancel, ver más abajo).
  const paymentListeners = new Map();
  function emitPaymentChange(clientUserId) {
    const set = paymentListeners.get(clientUserId);
    if (set) set.forEach(fn => { try { fn(); } catch (_) { /* un listener roto no debe tumbar al resto */ } });
  }

  // Espejo del realtimeApi genérico del lado real (ver supabase-client.js,
  // "Realtime genérico") — todo lo que no sea payments.subscribeToClient
  // (notificaciones, estado del socio, clases/reservas, check-ins, chat)
  // pasa por acá. La "key" es simplemente `${tabla}:${filtro}` — como el
  // mock no tiene una tabla real que filtrar, alcanza con que el call site
  // que emite arme la MISMA key que el que se suscribió (mismo criterio en
  // ambos, ver rtKey()).
  const rtListeners = new Map();
  function rtKey(table, filter) { return `${table}:${filter}`; }
  function rtEmit(table, filter) {
    const set = rtListeners.get(rtKey(table, filter));
    if (set) set.forEach(fn => { try { fn(); } catch (_) { /* ídem */ } });
  }
  function rtSubscribe(table, filter, onChange) {
    const key = rtKey(table, filter);
    if (!rtListeners.has(key)) rtListeners.set(key, new Set());
    rtListeners.get(key).add(onChange);
    return () => {
      const set = rtListeners.get(key);
      if (set) set.delete(onChange);
    };
  }
  // classes/class_sessions/class_bookings casi siempre cambian juntas (una
  // reserva nueva, un evento nuevo) — más simple avisar las tres claves del
  // gimnasio de una que llevar la cuenta exacta de cuál tabla tocó cada mutación.
  function emitGymCalendarChange(gymId) {
    ['classes', 'class_sessions', 'class_bookings'].forEach(t => rtEmit(t, `gym_id=eq.${gymId}`));
  }

  // Espejo de sync_my_membership_status()/sync_gym_memberships_status()
  // del lado real (20260914000000_daily_plan_same_day_expiry.sql) — nada
  // pasa 'al_dia' -> 'vencido' solo con el paso del tiempo (no hay cron acá
  // tampoco), así que se sincroniza recién al leer: cada vez que alguien
  // pide su propia ficha o el staff pide la lista del gimnasio. Nunca toca
  // 'pendiente' ni 'suspendido' — esos no son por fecha.
  function syncExpiredStatus(clientProfile) {
    const today = new Date().toISOString().slice(0, 10);
    if (clientProfile && clientProfile.membership_status === 'al_dia'
      && clientProfile.membership_expires_at && clientProfile.membership_expires_at < today) {
      clientProfile.membership_status = 'vencido';
    }
    return clientProfile;
  }

  // Igual que normalizeEmail() en supabase-client.js — el mock recibe lo
  // mismo que mandaría la app real (ver emailField() en app.js).
  function normalizeEmail(raw) {
    const v = (raw || '').trim();
    return v.includes('@') ? v : `${v}@gmail.com`;
  }

  function requireAuth() {
    if (!session) throw new Error('No autenticado.');
    return session;
  }

  function profileOf(userId) {
    return db.profiles.find(p => p.id === userId);
  }

  /* ---------------- semilla: espejo de supabase/seed.sql ---------------- */

  (function seed() {
    const gymId = 'gym-1';
    db.gyms.push({ id: gymId, name: 'PowerHouse Gym', address: 'Av. Central 123', hours: '6:00 - 22:00', invite_code: 'demo1234', currency: 'USD', created_at: new Date().toISOString() });
    // Fase 16 — un código de invitación por rol, ya no uno solo compartido.
    db.gymInvites.push({ gym_id: gymId, role: 'client', code: 'demo1234' }); // igual al invite_code legado de siempre
    db.gymInvites.push({ gym_id: gymId, role: 'admin', code: 'demoadmn' });
    db.gymInvites.push({ gym_id: gymId, role: 'trainer', code: 'demotrnr' });

    const mkUser = (id, role, name, email, phone, extra) => {
      db.profiles.push({ id, role, gym_id: gymId, name, email, phone, password: extra.password });
      if (role === 'trainer') db.trainers.push({ user_id: id, gym_id: gymId, specialty: extra.specialty, price: extra.price, status: 'approved' });
      if (role === 'admin') db.gymAdmins.push({ user_id: id, gym_id: gymId, status: 'approved' });
      if (role === 'client') db.clientProfiles.push({
        user_id: id, gym_id: gymId, plan_id: extra.planId, trainer_user_id: extra.trainerUserId || null,
        face_photo_key: null, weight: null, height: null, age: null, level: 'principiante', goal: extra.goal || 'perder_peso',
        membership_status: extra.status, membership_expires_at: extra.expires, last_payment_at: extra.lastPayment,
        created_at: extra.joined || new Date().toISOString(),
      });
    };

    // El fundador del gym de muestra es el dueño (mismo criterio que se usó
    // para migrar la cuenta real en producción, ver supabase/migrations/
    // 20260903000002_owner_role_fix_wrong_promotion.sql).
    mkUser('admin-1', 'owner', 'Avilio Fernández', 'admin@bola.app', '555-0100', { password: 'admin123' });
    // Rol dedicado de administrador de plataforma (ver
    // supabase/migrations/20260905000500_platform_admin_role.sql) — cuenta
    // propia, sin gym_id, para poder probar el panel de plataforma
    // (src/screens/platform.js) contra el mock sin tocar Supabase real.
    // Reemplaza el enfoque anterior (Fase 16) de marcar is_platform_admin=true
    // sobre la cuenta de dueño de arriba.
    db.profiles.push({ id: 'platform-1', role: 'platform_admin', gym_id: null, name: 'Admin de plataforma', email: 'plataforma@bola.app', phone: null, password: 'plataforma123' });
    mkUser('trainer-1', 'trainer', 'Marco Díaz', 'marco@bola.app', '555-0201', { password: 'coach123', specialty: 'Fuerza e hipertrofia', price: 20 });
    mkUser('trainer-2', 'trainer', 'Laura Gómez', 'laura@bola.app', '555-0202', { password: 'coach123', specialty: 'Pérdida de peso y cardio', price: 15 });
    mkUser('trainer-3', 'trainer', 'Diego Ruiz', 'diego@bola.app', '555-0203', { password: 'coach123', specialty: 'Funcional y movilidad', price: 10 });

    db.plans.push({ id: 'plan-basico', gym_id: gymId, name: 'Plan Básico', price: 25, duration: 'mensual' });
    db.plans.push({ id: 'plan-premium', gym_id: gymId, name: 'Plan Premium', price: 60, duration: 'mensual' });

    ['Caminadora', 'Bicicleta estática', 'Rack de sentadillas', 'Banco de press', 'Mancuernas', 'Máquina de poleas', 'Remo']
      .forEach(name => db.equipment.push({ id: uid('eq'), gym_id: gymId, name }));

    const today = new Date();
    const plus = d => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
    const minus = d => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);

    mkUser('client-1', 'client', 'Carla Méndez', 'carla@bola.app', '555-0301', { password: 'cliente123', planId: 'plan-premium', trainerUserId: 'trainer-1', goal: 'ganar_musculo', status: 'al_dia', expires: plus(20), lastPayment: '2026-07-05', joined: minus(60) });
    mkUser('client-2', 'client', 'Jorge Salinas', 'jorge@bola.app', '555-0302', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-2', status: 'pendiente', expires: plus(20), lastPayment: '2026-06-10', joined: minus(45) });
    mkUser('client-3', 'client', 'Ana Torres', 'ana@bola.app', '555-0303', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-2', status: 'vencido', expires: minus(5), lastPayment: '2026-05-02', joined: minus(200) });
    mkUser('client-4', 'client', 'Luis Rivas', 'luis@bola.app', '555-0304', { password: 'cliente123', planId: 'plan-premium', trainerUserId: 'trainer-1', status: 'al_dia', expires: plus(20), lastPayment: '2026-01-15', joined: minus(10) });
    mkUser('client-5', 'client', 'Sofía Paredes', 'sofia@bola.app', '555-0305', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-3', status: 'al_dia', expires: plus(20), lastPayment: '2026-07-18', joined: minus(5) });

    db.progress.push({ id: uid('pg'), client_user_id: 'client-1', storage_key: null, taken_at: minus(2) });
    db.progress.push({ id: uid('pg'), client_user_id: 'client-1', storage_key: null, taken_at: minus(1) });

    const routineId = uid('rt');
    db.routines.push({ id: routineId, client_user_id: 'client-1', source: 'trainer', goal: null, author_user_id: 'trainer-1' });
    [
      { text: 'Sentadilla en rack - 4x8', sets: 4, reps: '8', weight_kg: 60, rest_seconds: 90 },
      { text: 'Press banca - 4x8', sets: 4, reps: '8', weight_kg: 40, rest_seconds: 90 },
      { text: 'Remo - 10 min', sets: null, reps: null, weight_kg: null, rest_seconds: 60 },
    ].forEach((ex, i) =>
      db.routineExercises.push({ id: uid('rex'), routine_id: routineId, position: i, exercise_id: null, ...ex }));

    db.payments.push({ id: uid('pay'), client_user_id: 'client-1', gym_id: gymId, amount: 80, status: 'confirmed', confirmed_by: 'admin-1', confirmed_at: '2026-07-05' });
    db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: 'client-1', rating: 5, text: 'Excelente atención y máquinas nuevas.', created_at: '2026-07-10' });
    db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: 'client-2', rating: 4, text: 'Falta más espacio en horario pico.', created_at: '2026-07-08' });

    // ---- Etapas 2-4: biblioteca de ejercicios (global, gym_id null — 90
    // ejercicios reales de Fight_Club_Gym_Base_Datos_Entrenamiento.xlsx, ver
    // supabase/migrations/20260908000200_exercise_library_real_content.sql) ----
    [
      ["Sentadilla con barra", "Piernas", "Barra", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Baja con control manteniendo el tronco estable y sube empujando el suelo.", 3, "8-12", 90],
      ["Sentadilla goblet", "Piernas", "Mancuerna", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Sentadilla frontal", "Piernas", "Barra", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Sentadilla hack", "Piernas", "Máquina hack", "Intermedio", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Prensa de piernas", "Piernas", "Prensa", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Peso muerto rumano", "Piernas", "Barra", "Intermedio", "Hipertrofia", "Compuesto", "Lleva la cadera hacia atrás con rodillas ligeramente flexionadas y vuelve extendiendo la cadera.", 3, "8-12", 90],
      ["Peso muerto con mancuernas", "Piernas", "Mancuernas", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Hip thrust con barra", "Glúteos", "Barra", "Intermedio", "Hipertrofia", "Compuesto", "Extiende la cadera hasta quedar alineado, evitando hiperextender la zona lumbar.", 3, "8-12", 90],
      ["Puente de glúteos", "Glúteos", "Peso corporal", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Zancadas caminando", "Piernas", "Mancuernas", "Intermedio", "Hipertrofia", "Unilateral", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Zancada atrás", "Piernas", "Mancuernas", "Principiante", "Hipertrofia", "Unilateral", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Split squat búlgaro", "Piernas", "Mancuernas", "Intermedio", "Hipertrofia", "Unilateral", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Step-up", "Piernas", "Banco + mancuernas", "Principiante", "Hipertrofia", "Unilateral", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Extensión de piernas", "Cuádriceps", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Curl femoral tumbado", "Isquiotibiales", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Curl femoral sentado", "Isquiotibiales", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Elevación de talones de pie", "Pantorrillas", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Elevación de talones sentado", "Pantorrillas", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Abducción de cadera", "Glúteos", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Aducción de cadera", "Piernas", "Máquina", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press de banca con barra", "Pecho", "Barra + banco", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Desciende la barra de forma controlada hacia el pecho y empuja sin perder estabilidad escapular.", 3, "8-12", 90],
      ["Press inclinado con barra", "Pecho", "Barra + banco", "Intermedio", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press de banca con mancuernas", "Pecho", "Mancuernas + banco", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press inclinado con mancuernas", "Pecho", "Mancuernas + banco", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press en máquina", "Pecho", "Máquina", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Fondos en paralelas", "Pecho/Tríceps", "Paralelas", "Avanzado", "Fuerza/Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Aperturas con mancuernas", "Pecho", "Mancuernas + banco", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Cruce de poleas", "Pecho", "Poleas", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Flexiones", "Pecho", "Peso corporal", "Principiante", "Fuerza/Resistencia", "Compuesto", "Desciende manteniendo cuerpo alineado y empuja el suelo hasta extender los brazos.", 3, "8-12", 90],
      ["Press militar con barra", "Hombros", "Barra", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press de hombros con mancuernas", "Hombros", "Mancuernas", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press de hombros en máquina", "Hombros", "Máquina", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Elevaciones laterales", "Hombros", "Mancuernas", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Elevaciones laterales en polea", "Hombros", "Polea", "Intermedio", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Pájaros con mancuernas", "Hombros", "Mancuernas", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Face pull", "Hombros/Espalda", "Polea + cuerda", "Principiante", "Hipertrofia/Salud de hombro", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Encogimientos con mancuernas", "Trapecios", "Mancuernas", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Dominadas", "Espalda", "Barra fija", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Tira del cuerpo hacia la barra manteniendo el control durante todo el recorrido.", 3, "8-12", 90],
      ["Dominadas asistidas", "Espalda", "Máquina asistida", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Jalón al pecho", "Espalda", "Polea", "Principiante", "Hipertrofia", "Compuesto", "Lleva la barra hacia la parte alta del pecho manteniendo el torso estable.", 3, "8-12", 90],
      ["Remo con barra", "Espalda", "Barra", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Remo con mancuerna", "Espalda", "Mancuerna", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Remo sentado en polea", "Espalda", "Polea", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Remo en máquina", "Espalda", "Máquina", "Principiante", "Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Pullover en polea", "Espalda", "Polea", "Intermedio", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Curl de bíceps con barra", "Bíceps", "Barra", "Principiante", "Hipertrofia", "Aislamiento", "Flexiona los codos sin balancear el tronco y baja de forma controlada.", 3, "8-12", 90],
      ["Curl alterno con mancuernas", "Bíceps", "Mancuernas", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Curl martillo", "Bíceps", "Mancuernas", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Curl predicador", "Bíceps", "Banco predicador", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Curl en polea", "Bíceps", "Polea", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press cerrado", "Tríceps", "Barra + banco", "Intermedio", "Fuerza/Hipertrofia", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Press francés", "Tríceps", "Barra EZ + banco", "Intermedio", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Extensión de tríceps en polea", "Tríceps", "Polea + cuerda", "Principiante", "Hipertrofia", "Aislamiento", "Extiende los codos manteniendo los brazos cerca del cuerpo.", 3, "8-12", 90],
      ["Extensión de tríceps sobre cabeza", "Tríceps", "Mancuerna", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Patada de tríceps", "Tríceps", "Mancuerna", "Principiante", "Hipertrofia", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Plancha", "Core", "Peso corporal", "Principiante", "Core/Resistencia", "Isométrico", "Mantén el cuerpo alineado, abdomen activo y respiración controlada.", 3, "8-12", 90],
      ["Plancha lateral", "Core", "Peso corporal", "Principiante", "Core/Resistencia", "Isométrico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Crunch", "Core", "Peso corporal", "Principiante", "Core", "Aislamiento", "Flexiona el tronco con control sin tirar del cuello.", 3, "8-12", 90],
      ["Crunch en polea", "Core", "Polea", "Intermedio", "Hipertrofia/Core", "Aislamiento", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Elevación de rodillas", "Core", "Barra fija", "Principiante", "Core", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Elevación de piernas", "Core", "Barra fija", "Intermedio", "Core", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Dead bug", "Core", "Peso corporal", "Principiante", "Core/Control motor", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Bird dog", "Core", "Peso corporal", "Principiante", "Core/Control motor", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Mountain climbers", "Core/Cardio", "Peso corporal", "Principiante", "Acondicionamiento", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Burpees", "Full body", "Peso corporal", "Intermedio", "Acondicionamiento", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Jumping jacks", "Full body", "Peso corporal", "Principiante", "Calentamiento/Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Cuerda de saltar", "Cardio", "Cuerda", "Principiante", "Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Sprint en cinta", "Cardio", "Cinta", "Intermedio", "Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Caminata inclinada", "Cardio", "Cinta", "Principiante", "Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Bicicleta estática", "Cardio", "Bicicleta", "Principiante", "Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Remo ergómetro", "Cardio", "Remo", "Intermedio", "Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Battle ropes", "Full body", "Cuerdas", "Intermedio", "Acondicionamiento", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Kettlebell swing", "Full body", "Kettlebell", "Intermedio", "Potencia/Condición", "Balístico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Farmer walk", "Full body", "Mancuernas", "Principiante", "Fuerza/Condición", "Locomoción", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Turkish get-up", "Full body", "Kettlebell", "Avanzado", "Fuerza/Control", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Clean con kettlebell", "Full body", "Kettlebell", "Avanzado", "Potencia", "Explosivo", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Box jump", "Piernas", "Cajón", "Intermedio", "Potencia", "Explosivo", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Lanzamiento de balón medicinal", "Full body", "Balón medicinal", "Intermedio", "Potencia", "Explosivo", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Golpes al saco", "Boxeo", "Saco de boxeo", "Principiante", "Boxeo/Cardio", "Dinámico", "Golpea con técnica, rotación de cadera y control de la distancia.", 3, "8-12", 90],
      ["Sombra de boxeo", "Boxeo", "Peso corporal", "Principiante", "Boxeo/Cardio", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Combinación jab-cross", "Boxeo", "Saco/Guantes", "Principiante", "Boxeo/Técnica", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Hook al saco", "Boxeo", "Saco/Guantes", "Intermedio", "Boxeo/Técnica", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Uppercut al saco", "Boxeo", "Saco/Guantes", "Intermedio", "Boxeo/Técnica", "Dinámico", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Burpee + golpe", "Boxeo/Condición", "Peso corporal + saco", "Intermedio", "Acondicionamiento", "Compuesto", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Movilidad de tobillo", "Movilidad", "Peso corporal", "Principiante", "Movilidad", "Movilidad", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Rotación torácica", "Movilidad", "Peso corporal", "Principiante", "Movilidad", "Movilidad", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Estiramiento flexor de cadera", "Movilidad", "Peso corporal", "Principiante", "Movilidad", "Movilidad", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Estiramiento de isquiotibiales", "Movilidad", "Peso corporal", "Principiante", "Movilidad", "Movilidad", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Estiramiento de pectoral", "Movilidad", "Pared", "Principiante", "Movilidad", "Movilidad", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
      ["Estiramiento de dorsal", "Movilidad", "Banco", "Principiante", "Movilidad", "Movilidad", "Ejecuta el movimiento con control, rango cómodo y técnica estable.", 3, "8-12", 90],
    ].forEach(([name, muscle_group, equipment_name, level, goal, kind, description, suggested_sets, suggested_reps, suggested_rest_seconds]) =>
      db.exercises.push({ id: uid('ex'), gym_id: null, name, muscle_group, equipment_name, media_key: null, description, level, goal, kind, suggested_sets, suggested_reps, suggested_rest_seconds }));

  // Contenido real por ejercicio (para qué sirve, qué músculo trabaja,
  // buenas prácticas, errores comunes) + el patrón de movimiento de la
  // ilustración esquemática — mismo contenido que
  // 20260915000000_exercise_technique_content.sql del lado real, generado
  // de la misma fuente para que ambos lados digan exactamente lo mismo.
  // Fusionado por nombre en vez de tocar el array de arriba para no reescribir
  // 90 filas ya cargadas a mano.
  const EXERCISE_EXTRA = {
  "Sentadilla con barra": { muscle_worked: "Cuádriceps, glúteos e isquiotibiales, con el core estabilizando el tronco.", purpose: "El ejercicio base para ganar fuerza y volumen en toda la pierna — el que más carga tolera con el tiempo.", best_practices: ["Pecho arriba, mirada al frente, peso repartido en todo el pie.","Bajá hasta que el muslo quede paralelo al piso o más, sin perder la curva lumbar."], common_mistakes: ["Las rodillas colapsan hacia adentro al subir.","Levantar los talones o irse sobre la punta de los pies."], diagram_pattern: "squat" },
  "Sentadilla goblet": { muscle_worked: "Cuádriceps y glúteos, con menos carga en la zona lumbar que la sentadilla con barra.", purpose: "La mejor entrada a la sentadilla — la mancuerna al pecho ayuda a mantener el torso vertical sin pensarlo.", best_practices: ["Codos por dentro de las rodillas al final del descenso.","Empujá el piso con los talones para subir."], common_mistakes: ["Dejar caer el peso lejos del cuerpo, perdiendo el equilibrio.","Redondear la espalda baja al llegar abajo."], diagram_pattern: "squat" },
  "Sentadilla frontal": { muscle_worked: "Cuádriceps principalmente, con el core y la espalda alta trabajando para sostener la barra.", purpose: "Más exigente para el cuádriceps y el torso que la sentadilla tradicional, con menos carga en la zona lumbar.", best_practices: ["Codos altos, apuntando al frente, para que la barra no se caiga.","Bajá recto, sin llevar la cadera muy atrás."], common_mistakes: ["Dejar caer los codos, lo que hace resbalar la barra.","Usar más peso del que la movilidad de muñeca permite."], diagram_pattern: "squat" },
  "Sentadilla hack": { muscle_worked: "Cuádriceps de forma muy dirigida — la máquina fija el recorrido y saca a la espalda baja de la ecuación.", purpose: "Sumar volumen a la pierna con una técnica más segura para quien todavía no domina la sentadilla libre.", best_practices: ["Espalda y cabeza apoyadas en el respaldo durante todo el recorrido.","Pies un poco adelantados a la cadera para no forzar la rodilla."], common_mistakes: ["Bajar tan hondo que la cadera se despega del respaldo.","Frenar de golpe abajo en vez de controlar el descenso."], diagram_pattern: "squat" },
  "Prensa de piernas": { muscle_worked: "Cuádriceps, glúteos e isquiotibiales, según dónde se apoyen los pies en la plataforma.", purpose: "Mover mucho peso en las piernas sin exigirle equilibrio ni estabilidad al tronco.", best_practices: ["Pies a la altura de los hombros, apoyados enteros en la plataforma.","No bajes tanto que la zona lumbar se despegue del asiento."], common_mistakes: ["Bloquear las rodillas del todo arriba (le saca la tensión al músculo y castiga la articulación).","Apoyar solo la punta de los pies."], diagram_pattern: "squat" },
  "Peso muerto rumano": { muscle_worked: "Isquiotibiales y glúteos — el ejercicio de bisagra de cadera por excelencia.", purpose: "Fortalecer toda la cadena posterior de la pierna, clave para correr, saltar y proteger la zona lumbar.", best_practices: ["Llevá la cadera hacia atrás, no hacia abajo — las rodillas casi no se doblan.","La barra roza los muslos y las canillas durante todo el recorrido."], common_mistakes: ["Redondear la espalda baja en vez de mantenerla recta.","Confundirlo con una sentadilla y flexionar mucho la rodilla."], diagram_pattern: "hinge" },
  "Peso muerto con mancuernas": { muscle_worked: "Isquiotibiales, glúteos y espalda baja como estabilizadora.", purpose: "Misma bisagra de cadera que el peso muerto rumano, con mancuernas para quien recién arranca con el patrón.", best_practices: ["Bajá las mancuernas pegadas a las piernas.","Terminá el movimiento apretando el glúteo, no arqueando la espalda."], common_mistakes: ["Alejar las mancuernas del cuerpo, sobrecargando la espalda baja.","Bajar demasiado sin la movilidad de isquios para sostener la técnica."], diagram_pattern: "hinge" },
  "Hip thrust con barra": { muscle_worked: "Glúteo mayor de forma muy directa — el ejercicio que más lo aísla de toda la lista.", purpose: "Ganar fuerza y forma en el glúteo sin cargarle nada extra a la zona lumbar.", best_practices: ["Apoyá la parte alta de la espalda en el banco, no la media.","Arriba, el cuerpo queda en línea recta de hombro a rodilla — sin hiperextender la espalda."], common_mistakes: ["Empujar con la espalda baja en vez de con el glúteo.","No completar el recorrido arriba, quedándose a mitad de camino."], diagram_pattern: "hinge" },
  "Puente de glúteos": { muscle_worked: "Glúteo mayor, con los isquiotibiales ayudando.", purpose: "La versión sin banco del hip thrust — para activar el glúteo antes de entrenar piernas o para principiantes.", best_practices: ["Talones cerca de los glúteos antes de empezar.","Subí apretando el glúteo, sin empujar con la espalda."], common_mistakes: ["Apoyar los pies muy lejos del cuerpo, perdiendo tensión en el glúteo.","Arquear demasiado la espalda baja arriba."], diagram_pattern: "hinge" },
  "Zancadas caminando": { muscle_worked: "Cuádriceps y glúteos de cada pierna por separado, más el equilibrio y el core.", purpose: "Fuerza de pierna unilateral — corrige desbalances entre un lado del cuerpo y el otro.", best_practices: ["El torso se mantiene derecho durante todo el paso.","La rodilla de adelante baja hasta quedar cerca de 90°, sin pasar mucho la punta del pie."], common_mistakes: ["Dar un paso demasiado corto, que fuerza la rodilla de adelante hacia el frente.","Perder el equilibrio por ir muy rápido."], diagram_pattern: "lunge" },
  "Zancada atrás": { muscle_worked: "Cuádriceps y glúteos, con menos exigencia de equilibrio que la zancada caminando.", purpose: "La variante más amigable para la rodilla de las zancadas — buena entrada al trabajo unilateral de pierna.", best_practices: ["El pie de atrás solo toca de punta, apoyando el peso en la pierna de adelante.","Bajá recto, no hacia adelante."], common_mistakes: ["Cargar peso en el pie de atrás en vez de en el de adelante.","Dar un paso atrás demasiado corto."], diagram_pattern: "lunge" },
  "Split squat búlgaro": { muscle_worked: "Cuádriceps y glúteo de la pierna de adelante, con gran exigencia de equilibrio.", purpose: "La zancada más exigente — el pie trasero elevado obliga a toda la fuerza a salir de una sola pierna.", best_practices: ["Apoyá solo la punta del pie de atrás en el banco.","El pie de adelante va lo bastante lejos como para que la rodilla no pase mucho la punta al bajar."], common_mistakes: ["Poner el pie de adelante muy cerca del banco, cargando de más la rodilla.","Dejar que la cadera rote hacia un costado."], diagram_pattern: "lunge" },
  "Step-up": { muscle_worked: "Cuádriceps y glúteos de la pierna que sube, con equilibrio de todo el cuerpo.", purpose: "Fuerza de pierna unilateral usando un cajón o banco — traduce directo a subir escaleras y correr.", best_practices: ["Subí empujando con el talón de la pierna de arriba, no con el impulso de la de abajo.","Parate del todo arriba antes de bajar con control."], common_mistakes: ["Impulsarse con la pierna de abajo en vez de trabajar con la de arriba.","Usar un banco tan alto que fuerza la cadera."], diagram_pattern: "lunge" },
  "Extensión de piernas": { muscle_worked: "Cuádriceps de forma aislada — ningún otro músculo ayuda.", purpose: "Aislar el cuádriceps para sumar volumen extra después de los ejercicios compuestos de pierna.", best_practices: ["Espalda apoyada en el respaldo durante todo el recorrido.","Subí hasta extender del todo la rodilla, sin rebotar."], common_mistakes: ["Usar tanto peso que hay que impulsarse con la espalda.","Bajar de golpe en vez de controlar la vuelta."], diagram_pattern: "leg_machine" },
  "Curl femoral tumbado": { muscle_worked: "Isquiotibiales — el complemento directo de la extensión de piernas.", purpose: "Aislar los isquiotibiales, muy descuidados frente al cuádriceps en la mayoría de las rutinas.", best_practices: ["Cadera pegada al banco durante todo el movimiento.","Llevá el talón hacia el glúteo con control, sin tirón."], common_mistakes: ["Levantar la cadera del banco para \"ayudar\" con el peso.","Soltar el peso de golpe en la bajada."], diagram_pattern: "leg_machine" },
  "Curl femoral sentado": { muscle_worked: "Isquiotibiales, en una posición más cómoda para la zona lumbar que la versión tumbada.", purpose: "Misma idea que el curl femoral tumbado, mejor opción para quien no está cómodo boca abajo.", best_practices: ["Ajustá el respaldo para que la rodilla quede alineada con el eje de la máquina.","Doblá la rodilla del todo antes de volver."], common_mistakes: ["Dejar el respaldo mal ajustado, forzando la rodilla en un ángulo raro.","Usar impulso en vez de fuerza controlada."], diagram_pattern: "leg_machine" },
  "Elevación de talones de pie": { muscle_worked: "Gastrocnemio (pantorrilla), con la rodilla extendida.", purpose: "Fuerza y volumen de pantorrilla — el músculo que más cuesta hacer crecer si no se entrena directo.", best_practices: ["Subí hasta la punta de los dedos del todo, pausá arriba.","Bajá hasta sentir un buen estiramiento en la pantorrilla."], common_mistakes: ["Hacer el recorrido muy corto, a media subida.","Rebotar en vez de controlar cada repetición."], diagram_pattern: "leg_machine" },
  "Elevación de talones sentado": { muscle_worked: "Sóleo (pantorrilla profunda), con la rodilla flexionada.", purpose: "Complementa la elevación de pie — con la rodilla doblada se enfatiza un músculo distinto de la pantorrilla.", best_practices: ["Rodillas dobladas a 90° durante todo el ejercicio.","Subí y bajá el talón en rango completo."], common_mistakes: ["Usar un rango tan corto que casi no hay movimiento.","Cargar tanto peso que el talón no baja del todo."], diagram_pattern: "leg_machine" },
  "Abducción de cadera": { muscle_worked: "Glúteo medio — estabiliza la cadera al caminar y correr, y da forma lateral al glúteo.", purpose: "Fortalecer un músculo que casi no trabaja en los ejercicios grandes de pierna, pero que sostiene la cadera.", best_practices: ["Espalda apoyada, movimiento controlado hacia afuera.","Volvé sin dejar que el peso tire de golpe hacia adentro."], common_mistakes: ["Inclinar el torso para ayudarse con el peso del cuerpo.","Usar tanto peso que el rango se acorta mucho."], diagram_pattern: "leg_machine" },
  "Aducción de cadera": { muscle_worked: "Aductores (cara interna del muslo).", purpose: "Complementa a la abducción — fortalece el lado interno de la cadera, clave para deportes con cambios de dirección.", best_practices: ["Movimiento controlado, sin tirones, en todo el rango.","No fuerces más allá de donde la cadera se siente cómoda."], common_mistakes: ["Empezar con las piernas ya muy abiertas, forzando la cadera.","Ir demasiado rápido y perder el control del recorrido."], diagram_pattern: "leg_machine" },
  "Press de banca con barra": { muscle_worked: "Pecho, hombro delantero y tríceps.", purpose: "El ejercicio de referencia para fuerza y volumen de pecho.", best_practices: ["Omóplatos juntos y hacia abajo, pecho un poco arriba.","La barra baja hasta rozar el pecho, en línea con la parte media."], common_mistakes: ["Rebotar la barra en el pecho en vez de controlar el descenso.","Despegar los pies del piso, perdiendo estabilidad."], diagram_pattern: "horizontal_press" },
  "Press inclinado con barra": { muscle_worked: "Pecho superior (clavicular), hombro delantero y tríceps.", purpose: "Le da más trabajo a la parte alta del pecho que el press plano.", best_practices: ["Banco entre 30° y 45° — más inclinado pasa a ser trabajo de hombro.","La barra baja hacia la parte alta del pecho, no hacia el cuello."], common_mistakes: ["Inclinar demasiado el banco, quitándole trabajo al pecho.","Arquear mucho la espalda para compensar el ángulo."], diagram_pattern: "incline_press" },
  "Press de banca con mancuernas": { muscle_worked: "Pecho, hombro delantero y tríceps, con más recorrido que la barra.", purpose: "Mismo trabajo que el press con barra, con más rango de movimiento y cada brazo trabajando por separado.", best_practices: ["Bajá las mancuernas hasta sentir un buen estiramiento en el pecho.","Empezá y terminá con las mancuernas alineadas sobre los hombros."], common_mistakes: ["Chocar las mancuernas arriba en cada repetición, perdiendo tensión.","Bajar tan hondo que el hombro se resiente."], diagram_pattern: "horizontal_press" },
  "Press inclinado con mancuernas": { muscle_worked: "Pecho superior, hombro delantero y tríceps.", purpose: "Pecho superior con el rango extra que dan las mancuernas frente a la barra.", best_practices: ["Mismo ángulo de banco que la versión con barra, 30°-45°.","Controlá la bajada — no dejes que el peso \"caiga\"."], common_mistakes: ["Dejar que los codos se abran demasiado, cargando el hombro.","Usar un ángulo de banco muy alto."], diagram_pattern: "incline_press" },
  "Press en máquina": { muscle_worked: "Pecho, con menos exigencia de estabilización que la barra o las mancuernas.", purpose: "Trabajar pecho con una técnica más simple de aprender — buena entrada al press para principiantes.", best_practices: ["Ajustá el asiento para que las agarraderas queden a la altura del pecho.","Empujá hasta extender los brazos sin bloquear del todo el codo."], common_mistakes: ["Dejar el asiento mal ajustado, forzando el hombro.","Usar impulso con el torso en vez de empujar con los brazos."], diagram_pattern: "horizontal_press" },
  "Fondos en paralelas": { muscle_worked: "Pecho inferior y tríceps, con el hombro delantero como ayuda.", purpose: "Un ejercicio de empuje muy exigente con el propio peso del cuerpo.", best_practices: ["Inclinate un poco hacia adelante para cargarle más trabajo al pecho.","Bajá hasta sentir un buen estiramiento, sin forzar el hombro."], common_mistakes: ["Bajar demasiado hondo si el hombro no tiene la movilidad para eso.","Dejar que los hombros se suban hacia las orejas."], diagram_pattern: "horizontal_press" },
  "Aperturas con mancuernas": { muscle_worked: "Pecho, de forma aislada — sin ayuda del tríceps.", purpose: "Estirar y contraer el pecho en un arco amplio, algo que el press no logra igual.", best_practices: ["Codos con una flexión leve y fija durante todo el movimiento.","Bajá solo hasta donde el hombro se sienta cómodo."], common_mistakes: ["Doblar y estirar el codo durante el movimiento (eso lo convierte en un press).","Bajar demasiado, forzando el hombro hacia adelante."], diagram_pattern: "chest_fly" },
  "Cruce de poleas": { muscle_worked: "Pecho, con tensión constante gracias a la polea (a diferencia de las mancuernas).", purpose: "Misma idea que las aperturas, con tensión que no baja en ningún punto del recorrido.", best_practices: ["Inclinate un poco adelante y cruzá las manos frente a la cadera.","Mantené los codos con una leve flexión fija."], common_mistakes: ["Usar tanto peso que el movimiento termina siendo con los hombros.","Pararse muy lejos de las poleas, perdiendo el ángulo de cruce."], diagram_pattern: "chest_fly" },
  "Flexiones": { muscle_worked: "Pecho, hombro delantero, tríceps y core como estabilizador.", purpose: "El empuje más básico con el propio peso del cuerpo — no necesita ningún equipo.", best_practices: ["Cuerpo en línea recta de la cabeza a los talones, sin que la cadera caiga.","Bajá hasta que el pecho casi toque el piso."], common_mistakes: ["Dejar caer la cadera a mitad de camino.","Hacer solo medio recorrido en vez de bajar del todo."], diagram_pattern: "horizontal_press" },
  "Press militar con barra": { muscle_worked: "Hombros (los tres deltoides) y tríceps, con el core estabilizando.", purpose: "El ejercicio de referencia para fuerza de hombro — empujar peso por encima de la cabeza.", best_practices: ["Apretá el glúteo y el abdomen para no arquear la espalda al empujar.","La barra sube en línea recta, pasando cerca de la cara."], common_mistakes: ["Arquear mucho la espalda baja para ayudarse a empujar.","Empujar la barra hacia adelante en vez de hacia arriba."], diagram_pattern: "vertical_press" },
  "Press de hombros con mancuernas": { muscle_worked: "Hombros y tríceps, con cada brazo trabajando de forma independiente.", purpose: "Misma idea que el press militar, con más libertad de movimiento para el hombro.", best_practices: ["Las mancuernas empiezan a la altura de la oreja.","Subí hasta casi extender el codo, sin bloquearlo de golpe."], common_mistakes: ["Bajar las mancuernas de más, forzando el hombro.","Usar impulso de las piernas en vez de fuerza del hombro."], diagram_pattern: "vertical_press" },
  "Press de hombros en máquina": { muscle_worked: "Hombros y tríceps, con la máquina guiando el recorrido.", purpose: "Trabajar el hombro con una técnica simple, sin exigir estabilización extra.", best_practices: ["Espalda bien apoyada en el respaldo durante todo el ejercicio.","Empujá en línea recta hasta casi extender el brazo."], common_mistakes: ["Despegar la espalda del respaldo al empujar.","Ajustar mal el asiento, forzando el hombro en un ángulo incómodo."], diagram_pattern: "vertical_press" },
  "Elevaciones laterales": { muscle_worked: "Deltoide lateral — el que le da ancho al hombro.", purpose: "El ejercicio más directo para el deltoide lateral, algo que el press casi no toca.", best_practices: ["Subí los brazos hasta la altura del hombro, no más arriba.","Codos con una leve flexión fija durante todo el recorrido."], common_mistakes: ["Usar impulso del cuerpo para \"ayudar\" a subir el peso.","Subir por encima de la altura del hombro, metiendo el trapecio."], diagram_pattern: "lateral_raise" },
  "Elevaciones laterales en polea": { muscle_worked: "Deltoide lateral, con tensión constante gracias a la polea.", purpose: "Misma idea que las elevaciones con mancuerna, con tensión que no se pierde en ningún punto.", best_practices: ["Parate de costado a la polea, con el cable cruzando el cuerpo.","Subí con control, sin tirones."], common_mistakes: ["Inclinar el torso lejos de la polea para ganar impulso.","Usar tanto peso que el hombro se sube hacia la oreja."], diagram_pattern: "lateral_raise" },
  "Pájaros con mancuernas": { muscle_worked: "Deltoide posterior — la parte trasera del hombro, casi siempre la más débil.", purpose: "Equilibrar el hombro: la mayoría entrena mucho press y poco la parte de atrás.", best_practices: ["Inclinate hacia adelante desde la cadera, espalda recta.","Subí los brazos hacia los costados, apretando entre los omóplatos."], common_mistakes: ["Usar tanto peso que el movimiento termina siendo con la espalda.","Pararse casi derecho, perdiendo el ángulo hacia adelante."], diagram_pattern: "lateral_raise" },
  "Face pull": { muscle_worked: "Deltoide posterior y músculos que rotan el hombro hacia afuera — clave para la salud del hombro.", purpose: "Uno de los mejores ejercicios preventivos: equilibra tanto press que la mayoría hace de más.", best_practices: ["Tirá la cuerda hacia la cara, separando las manos al final.","Codos altos, a la altura del hombro, durante todo el recorrido."], common_mistakes: ["Tirar hacia abajo en vez de hacia la cara.","Usar tanto peso que los codos bajan."], diagram_pattern: "lateral_raise" },
  "Encogimientos con mancuernas": { muscle_worked: "Trapecio superior — la parte que va del cuello al hombro.", purpose: "Fuerza y volumen de trapecio, útil para todo lo que implique cargar peso (farmer walk, peso muerto).", best_practices: ["Subí los hombros derecho hacia arriba, sin rodarlos.","Pausá arriba un segundo antes de bajar con control."], common_mistakes: ["Rotar los hombros en círculo en vez de subir y bajar recto.","Usar impulso del cuerpo para mover el peso."], diagram_pattern: "lateral_raise" },
  "Dominadas": { muscle_worked: "Dorsal ancho, bíceps y espalda media.", purpose: "El ejercicio de tracción vertical más exigente — mueve todo el peso del cuerpo.", best_practices: ["Empezá desde los brazos completamente extendidos.","Subí hasta que la barbilla pase la barra, llevando los codos hacia abajo y atrás."], common_mistakes: ["Hacer solo medio recorrido, sin extender los brazos abajo.","Balancear el cuerpo para ganar impulso."], diagram_pattern: "pull_vertical" },
  "Dominadas asistidas": { muscle_worked: "Dorsal ancho, bíceps y espalda media, igual que la dominada libre.", purpose: "El camino para llegar a la dominada libre — la máquina compensa el peso que todavía falta.", best_practices: ["Usá la menor asistencia posible que te permita completar el rango.","Misma técnica que la dominada libre: recorrido completo, sin balanceo."], common_mistakes: ["Apoyarse en tanta asistencia que ya no hay progreso real.","Rebotar en la posición de abajo."], diagram_pattern: "pull_vertical" },
  "Jalón al pecho": { muscle_worked: "Dorsal ancho y bíceps — la versión sentada y con menos carga corporal de la dominada.", purpose: "Fuerza de espalda ancha para quien todavía no puede hacer una dominada completa.", best_practices: ["Llevá la barra hacia la parte alta del pecho, sacando pecho.","Volvé arriba con control, sin dejar que el peso tire de los brazos."], common_mistakes: ["Tirar la barra hacia atrás de la nuca, forzando el hombro.","Usar el impulso del torso echándose hacia atrás."], diagram_pattern: "pull_vertical" },
  "Remo con barra": { muscle_worked: "Espalda media, dorsal y bíceps.", purpose: "El ejercicio de tracción horizontal de referencia para dar espesor a la espalda.", best_practices: ["Torso inclinado hacia adelante, espalda recta, no redondeada.","Llevá la barra hacia el abdomen, apretando los omóplatos."], common_mistakes: ["Redondear la espalda baja para levantar más peso.","Usar impulso del cuerpo (remo de cadera) en vez de tirar con la espalda."], diagram_pattern: "pull_horizontal" },
  "Remo con mancuerna": { muscle_worked: "Espalda media, dorsal y bíceps, un lado a la vez.", purpose: "Misma idea que el remo con barra, trabajando cada lado por separado — bueno para corregir asimetrías.", best_practices: ["Apoyá la mano y la rodilla del mismo lado en el banco para fijar la espalda.","Llevá el codo hacia atrás y arriba, cerca del cuerpo."], common_mistakes: ["Rotar el torso para ayudarse a levantar el peso.","Tirar con el brazo estirado en vez de llevar el codo atrás."], diagram_pattern: "pull_horizontal" },
  "Remo sentado en polea": { muscle_worked: "Espalda media, dorsal y bíceps, con tensión constante de la polea.", purpose: "Trabajar toda la espalda media sentado, sin exigirle nada a la zona lumbar.", best_practices: ["Espalda derecha durante todo el recorrido, sin balancearte hacia atrás.","Llevá el agarre al abdomen, apretando los omóplatos al final."], common_mistakes: ["Balancear el torso adelante y atrás para ganar impulso.","Encorvar los hombros hacia adelante al soltar el peso."], diagram_pattern: "pull_horizontal" },
  "Remo en máquina": { muscle_worked: "Espalda media y dorsal, con el pecho apoyado para quitarle trabajo a la zona lumbar.", purpose: "La forma más segura de entrenar remo — el apoyo en el pecho elimina cualquier compensación con la espalda baja.", best_practices: ["Pecho bien apoyado durante todo el movimiento.","Llevá los codos atrás, apretando entre los omóplatos."], common_mistakes: ["Despegar el pecho del apoyo para sumar impulso.","Usar un rango tan corto que casi no hay contracción."], diagram_pattern: "pull_horizontal" },
  "Pullover en polea": { muscle_worked: "Dorsal ancho y, en menor medida, pecho.", purpose: "Un movimiento de brazo estirado que estira bien el dorsal, distinto a cualquier otro ejercicio de espalda.", best_practices: ["Codos con flexión leve y fija durante todo el recorrido.","Llevá los brazos desde arriba de la cabeza hasta los muslos, sin doblar los codos."], common_mistakes: ["Doblar los codos a mitad de camino (se vuelve un ejercicio de tríceps).","Usar el torso para ayudarse a bajar el peso."], diagram_pattern: "pull_horizontal" },
  "Curl de bíceps con barra": { muscle_worked: "Bíceps braquial.", purpose: "El ejercicio de referencia para fuerza y volumen de bíceps.", best_practices: ["Codos pegados al cuerpo, fijos, durante todo el recorrido.","Subí sin balancear el torso hacia atrás."], common_mistakes: ["Balancear el cuerpo para levantar más peso del que el bíceps puede solo.","Mover los codos hacia adelante al subir."], diagram_pattern: "curl_arm" },
  "Curl alterno con mancuernas": { muscle_worked: "Bíceps braquial, un brazo a la vez.", purpose: "Trabajar cada brazo por separado, útil para corregir cuál está más débil.", best_practices: ["Girá la muñeca hacia afuera (supinación) a medida que subís.","Bajá del todo antes de empezar la otra repetición."], common_mistakes: ["Balancear el hombro del brazo que está trabajando.","No completar el giro de muñeca."], diagram_pattern: "curl_arm" },
  "Curl martillo": { muscle_worked: "Braquial y antebrazo, además del bíceps — el agarre neutro cambia el énfasis.", purpose: "Suma grosor al brazo en una zona que el curl tradicional no toca tanto.", best_practices: ["Mantené la muñeca neutra (como sosteniendo un martillo) todo el recorrido.","Codos fijos, pegados al cuerpo."], common_mistakes: ["Rotar la muñeca durante el movimiento (eso ya es otro ejercicio).","Usar impulso del hombro para subir el peso."], diagram_pattern: "curl_arm" },
  "Curl predicador": { muscle_worked: "Bíceps braquial, con el brazo fijo en el banco — imposible hacer trampa con el cuerpo.", purpose: "Aislar el bíceps del todo, sin que el hombro o la espalda puedan ayudar.", best_practices: ["Apoyá el brazo entero en el banco, desde la axila hasta el codo.","Subí sin despegar el brazo del apoyo."], common_mistakes: ["Despegar el codo del banco para levantar más peso.","No extender el brazo del todo abajo."], diagram_pattern: "curl_arm" },
  "Curl en polea": { muscle_worked: "Bíceps braquial, con tensión constante de la polea.", purpose: "Misma idea que el curl con barra, sin que el peso se sienta más liviano arriba.", best_practices: ["Codos fijos, pegados al cuerpo, mirando hacia la polea.","Controlá la vuelta — no dejes que el peso tire del brazo."], common_mistakes: ["Alejarse mucho de la polea, cambiando el ángulo del ejercicio.","Balancear el torso para ayudarse a subir el peso."], diagram_pattern: "curl_arm" },
  "Press cerrado": { muscle_worked: "Tríceps, con el pecho y el hombro delantero como ayuda.", purpose: "Un press de banca con las manos juntas — le carga la mayoría del trabajo al tríceps.", best_practices: ["Manos a la altura de los hombros, no más juntas.","Codos pegados al cuerpo durante todo el recorrido."], common_mistakes: ["Poner las manos demasiado juntas, forzando la muñeca.","Dejar que los codos se abran como en un press normal."], diagram_pattern: "horizontal_press" },
  "Press francés": { muscle_worked: "Tríceps, cabeza larga — la que más volumen le da al brazo.", purpose: "Estira y trabaja el tríceps en un ángulo que el press cerrado no logra.", best_practices: ["Codos apuntando al techo, fijos, durante todo el recorrido.","Bajá la barra hacia la frente con control."], common_mistakes: ["Dejar que los codos se abran hacia los costados.","Usar tanto peso que hay que ayudarse con el hombro."], diagram_pattern: "triceps" },
  "Extensión de tríceps en polea": { muscle_worked: "Tríceps, con tensión constante de la polea.", purpose: "Aislar el tríceps con una técnica simple — buen cierre para el día de empuje.", best_practices: ["Codos pegados al cuerpo, fijos, sin moverse del lugar.","Extendé del todo abajo, apretando el tríceps."], common_mistakes: ["Despegar los codos del cuerpo, metiendo el hombro.","No extender el brazo del todo al final."], diagram_pattern: "triceps" },
  "Extensión de tríceps sobre cabeza": { muscle_worked: "Tríceps, cabeza larga, con un buen estiramiento por encima de la cabeza.", purpose: "Otro ángulo para la cabeza larga del tríceps, la parte que más le cuesta crecer a la mayoría.", best_practices: ["Codos apuntando al techo, cerca de la cabeza, sin abrirse.","Bajá la mancuerna detrás de la cabeza con control."], common_mistakes: ["Dejar que los codos se abran hacia los costados.","Arquear la espalda para compensar el peso."], diagram_pattern: "triceps" },
  "Patada de tríceps": { muscle_worked: "Tríceps, de forma muy aislada, al final del recorrido.", purpose: "Un ejercicio de acabado — poco peso, mucho enfoque en apretar el tríceps al extender.", best_practices: ["Codo fijo, pegado al cuerpo, a la altura de las costillas.","Extendé el antebrazo hacia atrás sin mover el codo."], common_mistakes: ["Mover el codo en vez de solo el antebrazo.","Usar impulso del cuerpo para levantar el peso."], diagram_pattern: "triceps" },
  "Plancha": { muscle_worked: "Recto abdominal, oblicuos y core profundo, trabajando de forma isométrica.", purpose: "El ejercicio base de estabilidad del core — enseña a mantener el tronco firme bajo tensión.", best_practices: ["Cuerpo en línea recta de la cabeza a los talones.","Apretá el abdomen y el glúteo durante todo el tiempo que dure."], common_mistakes: ["Dejar caer la cadera hacia el piso.","Levantar demasiado la cadera, perdiendo la línea recta."], diagram_pattern: "plank" },
  "Plancha lateral": { muscle_worked: "Oblicuos, principalmente del lado de apoyo.", purpose: "Complementa la plancha frontal trabajando el costado del core, clave para la estabilidad al girar.", best_practices: ["Cadera levantada, cuerpo en línea recta de la cabeza a los pies.","Apoyo en el antebrazo, con el codo justo debajo del hombro."], common_mistakes: ["Dejar caer la cadera hacia el piso.","Rotar el torso hacia adelante en vez de mantenerlo de costado."], diagram_pattern: "plank" },
  "Crunch": { muscle_worked: "Recto abdominal — el \"six pack\".", purpose: "El movimiento más directo para el abdomen: flexionar el tronco contra resistencia.", best_practices: ["El movimiento sale del abdomen, no del cuello.","Subí solo los omóplatos del piso, sin sentarte del todo."], common_mistakes: ["Tirar del cuello con las manos.","Usar impulso en vez de apretar el abdomen."], diagram_pattern: "crunch" },
  "Crunch en polea": { muscle_worked: "Recto abdominal, con resistencia extra de la polea.", purpose: "Sumarle carga al crunch una vez que el peso del cuerpo ya no alcanza para seguir progresando.", best_practices: ["El movimiento sale de la cadera hacia el pecho, no de los brazos.","Mantené las caderas fijas — solo se dobla el torso."], common_mistakes: ["Tirar con los brazos en vez de flexionar con el abdomen.","Mover la cadera hacia atrás en vez de solo doblar el torso."], diagram_pattern: "crunch" },
  "Elevación de rodillas": { muscle_worked: "Recto abdominal inferior y flexores de cadera.", purpose: "Trabajar la parte baja del abdomen, la que menos toca el crunch tradicional.", best_practices: ["Subí las rodillas hacia el pecho con control, sin balancear el cuerpo.","Bajá las piernas sin dejar que el cuerpo se balancee."], common_mistakes: ["Usar el impulso del balanceo en vez de la fuerza del abdomen.","Arquear la espalda baja al bajar las piernas."], diagram_pattern: "crunch" },
  "Elevación de piernas": { muscle_worked: "Recto abdominal inferior y flexores de cadera — más exigente que con las rodillas dobladas.", purpose: "Versión más difícil de la elevación de rodillas, con las piernas extendidas.", best_practices: ["Piernas lo más rectas posible, subiendo con control.","Bajá solo hasta donde puedas mantener la zona lumbar pegada al cuerpo."], common_mistakes: ["Balancear el cuerpo para ganar impulso.","Dejar que la espalda baja se arquee al bajar las piernas."], diagram_pattern: "crunch" },
  "Dead bug": { muscle_worked: "Core profundo, con foco en mantener la zona lumbar estable mientras brazos y piernas se mueven.", purpose: "Enseña a estabilizar el tronco mientras el resto del cuerpo se mueve — clave para levantar peso sin lastimarse.", best_practices: ["La zona lumbar se queda pegada al piso durante todo el ejercicio.","Movés brazo y pierna opuestos a la vez, despacio."], common_mistakes: ["Dejar que la espalda baja se despegue del piso.","Ir tan rápido que se pierde el control del movimiento."], diagram_pattern: "plank" },
  "Bird dog": { muscle_worked: "Core profundo y espalda baja, trabajando el equilibrio en cuatro apoyos.", purpose: "Misma idea que el dead bug, en cuatro apoyos — muy usado para prevenir dolor lumbar.", best_practices: ["Extendé brazo y pierna opuestos sin rotar la cadera.","La espalda se mantiene plana, sin arquearse ni hundirse."], common_mistakes: ["Rotar la cadera hacia el costado que se extiende.","Levantar el brazo o la pierna más alto de lo que el equilibrio permite."], diagram_pattern: "plank" },
  "Mountain climbers": { muscle_worked: "Core, con las piernas y los hombros trabajando de forma dinámica.", purpose: "Sumar ritmo cardíaco a un ejercicio de core — combina fuerza y cardio en uno.", best_practices: ["Cadera baja y estable, como en una plancha, durante todo el ejercicio.","Llevá la rodilla hacia el pecho sin que la cadera suba y baje."], common_mistakes: ["Levantar demasiado la cadera, perdiendo la posición de plancha.","Ir tan rápido que se pierde el control de cada paso."], diagram_pattern: "cardio_dynamic" },
  "Burpees": { muscle_worked: "Todo el cuerpo — piernas, pecho, hombros y core en una sola secuencia.", purpose: "El ejercicio de acondicionamiento más completo con el propio peso del cuerpo.", best_practices: ["Mantené la técnica de la flexión y el salto aunque estés cansado.","Aterrizá suave, doblando las rodillas."], common_mistakes: ["Dejar caer la cadera en la posición de plancha por el cansancio.","Aterrizar con las piernas rígidas."], diagram_pattern: "cardio_dynamic" },
  "Jumping jacks": { muscle_worked: "Todo el cuerpo, de forma liviana — ideal para elevar el pulso antes de entrenar.", purpose: "Calentamiento clásico para subir la temperatura corporal y activar el sistema cardiovascular.", best_practices: ["Aterrizá suave, con las rodillas ligeramente flexionadas.","Mantené un ritmo constante durante toda la serie."], common_mistakes: ["Aterrizar con las piernas rígidas.","Encoger los hombros en vez de abrir bien los brazos."], diagram_pattern: "cardio_dynamic" },
  "Cuerda de saltar": { muscle_worked: "Pantorrillas y todo el sistema cardiovascular.", purpose: "Cardio de bajo impacto por salto y muy eficiente para acondicionamiento y coordinación.", best_practices: ["Saltos cortos, apenas despegando del piso.","Mové la cuerda con la muñeca, no con todo el brazo."], common_mistakes: ["Saltar demasiado alto, gastando energía de más.","Mover el brazo entero en vez de la muñeca."], diagram_pattern: "cardio_dynamic" },
  "Sprint en cinta": { muscle_worked: "Piernas y sistema cardiovascular al máximo esfuerzo.", purpose: "Trabajo de alta intensidad para mejorar velocidad y capacidad cardiovascular.", best_practices: ["Subí la velocidad de forma progresiva, no de golpe.","Corré en el centro de la cinta, con pasos cortos y rápidos."], common_mistakes: ["Agarrarse de las barandas al correr rápido.","Empezar a máxima velocidad sin entrar en calor antes."], diagram_pattern: "cardio_machine" },
  "Caminata inclinada": { muscle_worked: "Glúteos, isquiotibiales y sistema cardiovascular, con bajo impacto en las articulaciones.", purpose: "Cardio constante y de bajo impacto — muy usado para quemar calorías sin desgastar las rodillas.", best_practices: ["Caminá erguido, sin apoyarte en las barandas.","Elegí una inclinación y velocidad que puedas sostener sin perder la postura."], common_mistakes: ["Sostenerse de las barandas, restándole trabajo a las piernas.","Inclinar demasiado el cuerpo hacia adelante."], diagram_pattern: "cardio_machine" },
  "Bicicleta estática": { muscle_worked: "Cuádriceps, isquiotibiales y sistema cardiovascular, sin impacto en las articulaciones.", purpose: "Cardio de bajo impacto, ideal para quien está recuperándose de una lesión de rodilla o tobillo.", best_practices: ["Ajustá el asiento para que la rodilla quede casi extendida en el punto más bajo del pedaleo.","Mantené un ritmo de pedaleo constante."], common_mistakes: ["Dejar el asiento muy bajo, forzando la rodilla.","Apoyar todo el peso en el manubrio en vez de en el asiento."], diagram_pattern: "cardio_machine" },
  "Remo ergómetro": { muscle_worked: "Espalda, piernas y core — de los pocos cardios que trabajan casi todo el cuerpo a la vez.", purpose: "Cardio de cuerpo completo, de bajo impacto, muy eficiente para quemar calorías.", best_practices: ["El impulso arranca con las piernas, después el torso, después los brazos.","Volvé en el mismo orden invertido: brazos, torso, piernas."], common_mistakes: ["Tirar solo con los brazos, sin usar las piernas.","Redondear la espalda baja durante el remo."], diagram_pattern: "cardio_machine" },
  "Battle ropes": { muscle_worked: "Hombros, brazos y core, con el corazón trabajando a alta intensidad.", purpose: "Acondicionamiento de cuerpo completo con muy bajo impacto en las articulaciones de la pierna.", best_practices: ["Rodillas ligeramente flexionadas, core firme durante toda la serie.","El movimiento sale del hombro, con ondas parejas en las dos sogas."], common_mistakes: ["Pararse demasiado erguido, perdiendo estabilidad.","Mover solo los antebrazos en vez de todo el brazo."], diagram_pattern: "cardio_dynamic" },
  "Kettlebell swing": { muscle_worked: "Glúteos e isquiotibiales, con el core estabilizando — no es un ejercicio de brazos.", purpose: "Potencia de cadera: enseña a generar fuerza explosiva desde el glúteo, útil para saltar y correr.", best_practices: ["La fuerza sale de la cadera hacia atrás y adelante, no de los brazos.","El kettlebell sube por la inercia de la cadera, los brazos solo lo acompañan."], common_mistakes: ["Hacer sentadilla en vez de bisagra de cadera.","Levantar el peso con los brazos y el hombro."], diagram_pattern: "hinge" },
  "Farmer walk": { muscle_worked: "Antebrazos, trapecio y todo el core, que trabaja para mantener el cuerpo derecho.", purpose: "Fuerza de agarre y estabilidad de todo el cuerpo — se traduce directo a la vida diaria.", best_practices: ["Hombros hacia atrás y abajo, torso derecho durante toda la caminata.","Pasos cortos y controlados, sin balancear el peso."], common_mistakes: ["Encorvar los hombros hacia adelante por el peso.","Caminar demasiado rápido y perder el control del peso."], diagram_pattern: "carry" },
  "Turkish get-up": { muscle_worked: "Todo el cuerpo — hombro, core y piernas trabajando juntos en una secuencia larga.", purpose: "El ejercicio más completo de control corporal: pasar de acostado a parado sosteniendo peso arriba.", best_practices: ["El brazo con el peso se mantiene extendido y vertical durante toda la secuencia.","Movete despacio, un paso de la secuencia a la vez."], common_mistakes: ["Apurar la secuencia y saltarse pasos.","Dejar que el brazo del peso se incline de la vertical."], diagram_pattern: "explosive" },
  "Clean con kettlebell": { muscle_worked: "Glúteos, espalda y hombros, en un movimiento explosivo de cadera.", purpose: "Llevar el kettlebell del piso al hombro con potencia, usando la cadera como motor.", best_practices: ["La potencia sale de la cadera, no de tirar con el brazo.","Dejá que el kettlebell \"gire\" alrededor de la muñeca en vez de forzarlo con el brazo."], common_mistakes: ["Tirar del peso con el brazo en vez de con la cadera.","Golpearse el antebrazo por no dejar que la muñeca gire."], diagram_pattern: "explosive" },
  "Box jump": { muscle_worked: "Cuádriceps y glúteos, en un movimiento explosivo de salto.", purpose: "Desarrollar potencia de pierna — la capacidad de generar fuerza rápido, no solo fuerza máxima.", best_practices: ["Aterrizá suave, con las rodillas flexionadas, en el centro del cajón.","Elegí una altura de cajón que puedas saltar con buena técnica."], common_mistakes: ["Elegir un cajón demasiado alto y aterrizar mal.","Bajar saltando en vez de bajar caminando (mayor riesgo de lesión)."], diagram_pattern: "squat" },
  "Lanzamiento de balón medicinal": { muscle_worked: "Todo el cuerpo, con foco en el core y los hombros liberando potencia de golpe.", purpose: "Trabajar la potencia explosiva del tren superior, algo que el press tradicional no entrena igual.", best_practices: ["La fuerza arranca desde las piernas y sube hasta los brazos.","Soltá el balón con todo el cuerpo, no solo con los brazos."], common_mistakes: ["Lanzar solo con los brazos, sin usar las piernas ni el core.","Pararse demasiado cerca de la pared o del compañero."], diagram_pattern: "explosive" },
  "Golpes al saco": { muscle_worked: "Hombros, core y piernas, con todo el cuerpo generando la potencia del golpe.", purpose: "Técnica de boxeo y acondicionamiento — el golpe sale de la cadera y las piernas, no solo del brazo.", best_practices: ["Girá la cadera y el pie de atrás con cada golpe.","Volvé siempre la mano a la posición de guardia."], common_mistakes: ["Golpear solo con el brazo, sin rotar la cadera.","Bajar la guardia después de cada golpe."], diagram_pattern: "boxing" },
  "Sombra de boxeo": { muscle_worked: "Todo el cuerpo, con foco en piernas y hombros, sin el impacto de golpear algo.", purpose: "Practicar técnica y ritmo sin saco ni compañero — calienta y afina la forma antes de golpear en serio.", best_practices: ["Movete en tus pies todo el tiempo, sin quedarte parado.","Mantené la guardia arriba entre combinación y combinación."], common_mistakes: ["Quedarse quieto en vez de moverse como en una pelea real.","Bajar los brazos por cansancio."], diagram_pattern: "boxing" },
  "Combinación jab-cross": { muscle_worked: "Hombros y core, con la cadera y las piernas aportando la potencia de cada golpe.", purpose: "La combinación básica de boxeo — el jab mide distancia, el cross pone la potencia.", best_practices: ["El jab sale rápido y vuelve rápido a la guardia.","El cross gira la cadera y el talón trasero."], common_mistakes: ["Dejar la mano del jab afuera después de golpear.","No rotar la cadera en el cross, perdiendo potencia."], diagram_pattern: "boxing" },
  "Hook al saco": { muscle_worked: "Core y hombros, con rotación de cadera generando la potencia del golpe.", purpose: "Golpe circular que suma otro ángulo de ataque a la combinación de boxeo.", best_practices: ["El codo se mantiene a la altura del hombro durante el golpe.","La potencia sale de rotar la cadera, no solo el brazo."], common_mistakes: ["Golpear con el brazo estirado en vez de con el codo flexionado.","No rotar la cadera, perdiendo potencia en el golpe."], diagram_pattern: "boxing" },
  "Uppercut al saco": { muscle_worked: "Piernas, core y hombros, con el golpe saliendo desde abajo.", purpose: "Golpe vertical de corta distancia, muy usado en el cuerpo a cuerpo.", best_practices: ["Flexioná un poco la rodilla antes de subir el golpe.","El golpe sube derecho, cerca del cuerpo."], common_mistakes: ["Bajar demasiado la guardia para tomar impulso.","Golpear en arco amplio en vez de subir cerca del cuerpo."], diagram_pattern: "boxing" },
  "Burpee + golpe": { muscle_worked: "Todo el cuerpo — combina la exigencia del burpee con la técnica del golpe.", purpose: "Acondicionamiento de alta intensidad que mezcla fuerza, cardio y técnica de boxeo.", best_practices: ["Completá bien el burpee antes de tirar el golpe.","Golpeá con técnica aunque llegues cansado."], common_mistakes: ["Apurar el burpee para llegar antes al golpe.","Perder la guardia por el cansancio."], diagram_pattern: "cardio_dynamic" },
  "Movilidad de tobillo": { muscle_worked: "Articulación del tobillo — mejora el rango para sentadillas y zancadas más profundas.", purpose: "Ganar rango de movimiento en un tobillo rígido, causa frecuente de mala técnica en sentadilla.", best_practices: ["Llevá la rodilla hacia adelante sobre el pie sin despegar el talón.","Hacelo despacio, sintiendo el estiramiento en la parte de atrás del tobillo."], common_mistakes: ["Despegar el talón del piso para ganar más rango.","Hacerlo con rebotes en vez de con control."], diagram_pattern: "mobility" },
  "Rotación torácica": { muscle_worked: "Columna torácica (espalda alta) — mejora la rotación para press, golpes y deportes de raqueta.", purpose: "Soltar una zona de la espalda que se pone rígida por estar mucho tiempo sentado.", best_practices: ["La cadera se queda quieta — el giro sale solo de la espalda alta.","Acompañá el giro con la mirada, sin forzar el cuello."], common_mistakes: ["Girar la cadera junto con el torso, perdiendo el estiramiento.","Forzar el rango en vez de ir ganándolo de a poco."], diagram_pattern: "mobility" },
  "Estiramiento flexor de cadera": { muscle_worked: "Flexores de cadera — se acortan por estar mucho tiempo sentado y limitan la zancada.", purpose: "Devolverle rango a la cadera para sentadillas, zancadas y peso muerto más cómodos.", best_practices: ["Apretá el glúteo del lado de atrás para profundizar el estiramiento.","Mantené el torso derecho, sin inclinarte hacia adelante."], common_mistakes: ["Arquear la espalda baja en vez de usar el glúteo para profundizar.","Forzar el estiramiento hasta sentir dolor en vez de tensión suave."], diagram_pattern: "mobility" },
  "Estiramiento de isquiotibiales": { muscle_worked: "Isquiotibiales — más rango acá ayuda directo al peso muerto y a la sentadilla profunda.", purpose: "Soltar la parte de atrás del muslo, frecuentemente tensa en quien entrena piernas seguido.", best_practices: ["Espalda recta, inclinándote desde la cadera, no desde la espalda.","Sostené la posición sin rebotar, dejando que el músculo se suelte solo."], common_mistakes: ["Redondear la espalda para \"llegar más lejos\".","Rebotar en vez de mantener el estiramiento quieto."], diagram_pattern: "mobility" },
  "Estiramiento de pectoral": { muscle_worked: "Pecho y hombro delantero — se acortan con tanto press y poco trabajo de espalda.", purpose: "Devolverle movilidad al hombro para que no se cierre hacia adelante con el tiempo.", best_practices: ["Brazo apoyado en la pared a la altura del hombro, codo con leve flexión.","Girá el cuerpo despacio hasta sentir el estiramiento, sin forzar."], common_mistakes: ["Poner el brazo demasiado alto o bajo, perdiendo el ángulo correcto.","Forzar el giro hasta sentir dolor en el hombro."], diagram_pattern: "mobility" },
  "Estiramiento de dorsal": { muscle_worked: "Dorsal ancho — se pone tenso después de mucho trabajo de tracción (dominadas, remo).", purpose: "Soltar la espalda ancha para recuperar rango de hombro por encima de la cabeza.", best_practices: ["Sentate en los talones y dejá caer el pecho hacia el piso con los brazos extendidos.","Respirá hondo y dejá que el peso del cuerpo haga el estiramiento."], common_mistakes: ["Forzar con los brazos en vez de dejar caer el peso del cuerpo.","Levantar la cadera de los talones."], diagram_pattern: "mobility" },
  };
  db.exercises.filter(e => e.gym_id === null).forEach(e => Object.assign(e, EXERCISE_EXTRA[e.name] || {}));

    // ---- Programas y rutinas de plantilla (global, gym_id null — 10
    // programas + 97 asignaciones de Fight_Club_Gym_Base_Datos_Entrenamiento.xlsx,
    // ver supabase/migrations/20260908000300_program_templates.sql) ----
    const programIdBySheet = {};
    [
      ["P01", "Inicio 3 días", "Principiante", "Hipertrofia general", 3, "45-60 min"],
      ["P02", "Full Body 3 días", "Principiante", "Fuerza general", 3, "45-60 min"],
      ["P03", "Full Body Intermedio", "Intermedio", "Hipertrofia", 3, "60 min"],
      ["P04", "Upper / Lower 4 días", "Intermedio", "Hipertrofia", 4, "60-75 min"],
      ["P05", "Push Pull Legs", "Intermedio", "Hipertrofia", 6, "60-75 min"],
      ["P06", "Fuerza 5x5", "Intermedio", "Fuerza", 3, "60 min"],
      ["P07", "Pérdida de grasa + fuerza", "Principiante", "Pérdida de grasa", 4, "45-60 min"],
      ["P08", "Boxeo + acondicionamiento", "Principiante", "Boxeo/Condición", 3, "45-60 min"],
      ["P09", "Boxeo + fuerza", "Intermedio", "Boxeo/Fuerza", 4, "60-75 min"],
      ["P10", "Core y acondicionamiento", "Principiante", "Core/Resistencia", 3, "30-45 min"],
    ].forEach(([sheetId, name, level, goal, days_per_week, duration_label]) => {
      const id = uid('prog');
      programIdBySheet[sheetId] = id;
      db.programTemplates.push({ id, name, level, goal, days_per_week, duration_label });
    });
    [
      ["P01", "Día 1", 1, 1, "Sentadilla goblet", "Sentadilla goblet", 3, "10-12", 90],
      ["P01", "Día 1", 1, 2, "Press de banca con mancuernas", "Press de banca con mancuernas", 3, "8-12", 90],
      ["P01", "Día 1", 1, 3, "Jalón al pecho", "Jalón al pecho", 3, "10-12", 90],
      ["P01", "Día 1", 1, 4, "Peso muerto rumano", "Peso muerto rumano", 2, "10-12", 90],
      ["P01", "Día 1", 1, 5, "Plancha", "Plancha", 3, "30-45 s", 60],
      ["P01", "Día 2", 2, 1, "Prensa de piernas", "Prensa de piernas", 3, "10-12", 90],
      ["P01", "Día 2", 2, 2, "Press de hombros con mancuernas", "Press de hombros con mancuernas", 3, "8-12", 90],
      ["P01", "Día 2", 2, 3, "Remo sentado en polea", "Remo sentado en polea", 3, "10-12", 90],
      ["P01", "Día 2", 2, 4, "Hip thrust con barra", "Hip thrust con barra", 3, "10-12", 90],
      ["P01", "Día 2", 2, 5, "Crunch", "Crunch", 3, "12-15", 60],
      ["P01", "Día 3", 3, 1, "Zancada atrás", "Zancada atrás", 3, "8-10/lado", 90],
      ["P01", "Día 3", 3, 2, null, "Press de máquina", 3, "10-12", 90],
      ["P01", "Día 3", 3, 3, "Dominadas asistidas", "Dominadas asistidas", 3, "8-12", 90],
      ["P01", "Día 3", 3, 4, "Curl femoral sentado", "Curl femoral sentado", 3, "10-15", 75],
      ["P01", "Día 3", 3, 5, "Plancha lateral", "Plancha lateral", 3, "30 s/lado", 60],
      ["P02", "Día 1", 1, 1, "Sentadilla goblet", "Sentadilla goblet", 3, "8-12", 120],
      ["P02", "Día 1", 1, 2, "Press de banca con mancuernas", "Press de banca con mancuernas", 3, "8-12", 120],
      ["P02", "Día 1", 1, 3, "Remo con mancuerna", "Remo con mancuerna", 3, "8-12", 120],
      ["P02", "Día 1", 1, 4, "Hip thrust con barra", "Hip thrust con barra", 3, "10-12", 90],
      ["P02", "Día 1", 1, 5, "Plancha", "Plancha", 3, "30-45 s", 60],
      ["P02", "Día 2", 2, 1, "Prensa de piernas", "Prensa de piernas", 3, "8-12", 120],
      ["P02", "Día 2", 2, 2, "Press de hombros con mancuernas", "Press de hombros con mancuernas", 3, "8-12", 120],
      ["P02", "Día 2", 2, 3, "Jalón al pecho", "Jalón al pecho", 3, "8-12", 120],
      ["P02", "Día 2", 2, 4, "Peso muerto rumano", "Peso muerto rumano", 3, "8-12", 120],
      ["P02", "Día 2", 2, 5, "Crunch", "Crunch", 3, "12-15", 60],
      ["P02", "Día 3", 3, 1, "Zancadas caminando", "Zancadas caminando", 3, "8-10/lado", 90],
      ["P02", "Día 3", 3, 2, "Press en máquina", "Press en máquina", 3, "8-12", 90],
      ["P02", "Día 3", 3, 3, "Remo sentado en polea", "Remo sentado en polea", 3, "8-12", 90],
      ["P02", "Día 3", 3, 4, "Curl femoral tumbado", "Curl femoral tumbado", 3, "10-15", 75],
      ["P02", "Día 3", 3, 5, "Plancha lateral", "Plancha lateral", 3, "30-45 s/lado", 60],
      ["P03", "Día 1", 1, 1, "Sentadilla con barra", "Sentadilla con barra", 4, "6-10", 150],
      ["P03", "Día 1", 1, 2, "Press de banca con barra", "Press de banca con barra", 4, "6-10", 150],
      ["P03", "Día 1", 1, 3, "Remo con barra", "Remo con barra", 4, "6-10", 150],
      ["P03", "Día 1", 1, 4, "Elevaciones laterales", "Elevaciones laterales", 3, "12-15", 60],
      ["P03", "Día 1", 1, 5, "Curl de bíceps con barra", "Curl de bíceps con barra", 3, "10-12", 75],
      ["P03", "Día 2", 2, 1, "Peso muerto rumano", "Peso muerto rumano", 4, "6-10", 150],
      ["P03", "Día 2", 2, 2, "Press inclinado con mancuernas", "Press inclinado con mancuernas", 4, "8-12", 120],
      ["P03", "Día 2", 2, 3, "Jalón al pecho", "Jalón al pecho", 4, "8-12", 120],
      ["P03", "Día 2", 2, 4, "Hip thrust con barra", "Hip thrust con barra", 3, "8-12", 120],
      ["P03", "Día 2", 2, 5, "Extensión de tríceps en polea", "Extensión de tríceps en polea", 3, "10-15", 75],
      ["P03", "Día 3", 3, 1, "Prensa de piernas", "Prensa de piernas", 4, "8-12", 120],
      ["P03", "Día 3", 3, 2, "Press de hombros con mancuernas", "Press de hombros con mancuernas", 4, "8-12", 120],
      ["P03", "Día 3", 3, 3, "Remo en máquina", "Remo en máquina", 4, "8-12", 120],
      ["P03", "Día 3", 3, 4, "Curl femoral sentado", "Curl femoral sentado", 3, "10-15", 75],
      ["P03", "Día 3", 3, 5, "Crunch en polea", "Crunch en polea", 3, "10-15", 60],
      ["P04", "Día 1 Upper", 1, 1, "Press de banca con barra", "Press de banca con barra", 4, "6-10", 150],
      ["P04", "Día 1 Upper", 1, 2, "Remo con barra", "Remo con barra", 4, "6-10", 150],
      ["P04", "Día 1 Upper", 1, 3, "Press de hombros con mancuernas", "Press de hombros con mancuernas", 3, "8-12", 120],
      ["P04", "Día 1 Upper", 1, 4, "Jalón al pecho", "Jalón al pecho", 3, "8-12", 120],
      ["P04", "Día 1 Upper", 1, 5, "Curl de bíceps con barra", "Curl de bíceps con barra", 3, "10-12", 75],
      ["P04", "Día 1 Upper", 1, 6, "Extensión de tríceps en polea", "Extensión de tríceps en polea", 3, "10-15", 75],
      ["P04", "Día 2 Lower", 2, 1, "Sentadilla con barra", "Sentadilla con barra", 4, "6-10", 150],
      ["P04", "Día 2 Lower", 2, 2, "Peso muerto rumano", "Peso muerto rumano", 4, "8-10", 150],
      ["P04", "Día 2 Lower", 2, 3, "Prensa de piernas", "Prensa de piernas", 3, "10-12", 120],
      ["P04", "Día 2 Lower", 2, 4, "Curl femoral tumbado", "Curl femoral tumbado", 3, "10-15", 75],
      ["P04", "Día 2 Lower", 2, 5, "Elevación de talones de pie", "Elevación de talones de pie", 4, "10-15", 60],
      ["P04", "Día 3 Upper", 3, 1, "Press inclinado con mancuernas", "Press inclinado con mancuernas", 4, "8-12", 120],
      ["P04", "Día 3 Upper", 3, 2, "Remo sentado en polea", "Remo sentado en polea", 4, "8-12", 120],
      ["P04", "Día 3 Upper", 3, 3, "Press de hombros en máquina", "Press de hombros en máquina", 3, "8-12", 120],
      ["P04", "Día 3 Upper", 3, 4, "Dominadas asistidas", "Dominadas asistidas", 3, "8-12", 120],
      ["P04", "Día 3 Upper", 3, 5, "Curl martillo", "Curl martillo", 3, "10-12", 75],
      ["P04", "Día 3 Upper", 3, 6, "Press francés", "Press francés", 3, "10-12", 75],
      ["P04", "Día 4 Lower", 4, 1, "Sentadilla hack", "Sentadilla hack", 4, "8-12", 120],
      ["P04", "Día 4 Lower", 4, 2, "Hip thrust con barra", "Hip thrust con barra", 4, "8-12", 120],
      ["P04", "Día 4 Lower", 4, 3, "Zancada atrás", "Zancada atrás", 3, "10/lado", 90],
      ["P04", "Día 4 Lower", 4, 4, "Curl femoral sentado", "Curl femoral sentado", 3, "10-15", 75],
      ["P04", "Día 4 Lower", 4, 5, "Elevación de talones sentado", "Elevación de talones sentado", 4, "12-15", 60],
      ["P05", "Push", 1, 1, "Press de banca con barra", "Press de banca con barra", 4, "6-10", 150],
      ["P05", "Push", 1, 2, "Press inclinado con mancuernas", "Press inclinado con mancuernas", 3, "8-12", 120],
      ["P05", "Push", 1, 3, "Press de hombros con mancuernas", "Press de hombros con mancuernas", 3, "8-12", 120],
      ["P05", "Push", 1, 4, "Elevaciones laterales", "Elevaciones laterales", 4, "12-15", 60],
      ["P05", "Push", 1, 5, "Extensión de tríceps en polea", "Extensión de tríceps en polea", 3, "10-15", 75],
      ["P05", "Pull", 2, 1, "Dominadas", "Dominadas", 4, "6-10", 150],
      ["P05", "Pull", 2, 2, "Remo con barra", "Remo con barra", 4, "6-10", 150],
      ["P05", "Pull", 2, 3, "Remo sentado en polea", "Remo sentado en polea", 3, "8-12", 120],
      ["P05", "Pull", 2, 4, "Face pull", "Face pull", 3, "12-15", 60],
      ["P05", "Pull", 2, 5, "Curl martillo", "Curl martillo", 3, "10-12", 75],
      ["P05", "Legs", 3, 1, "Sentadilla con barra", "Sentadilla con barra", 4, "6-10", 150],
      ["P05", "Legs", 3, 2, "Peso muerto rumano", "Peso muerto rumano", 4, "8-10", 150],
      ["P05", "Legs", 3, 3, "Prensa de piernas", "Prensa de piernas", 3, "10-12", 120],
      ["P05", "Legs", 3, 4, "Curl femoral tumbado", "Curl femoral tumbado", 3, "10-15", 75],
      ["P05", "Legs", 3, 5, "Elevación de talones de pie", "Elevación de talones de pie", 4, "10-15", 60],
      ["P05", "Push 2", 4, 1, "Press de banca con barra", "Press de banca con barra", 4, "6-10", 150],
      ["P05", "Push 2", 4, 2, "Press inclinado con mancuernas", "Press inclinado con mancuernas", 3, "8-12", 120],
      ["P05", "Push 2", 4, 3, "Press de hombros con mancuernas", "Press de hombros con mancuernas", 3, "8-12", 120],
      ["P05", "Push 2", 4, 4, "Elevaciones laterales", "Elevaciones laterales", 4, "12-15", 60],
      ["P05", "Push 2", 4, 5, "Extensión de tríceps en polea", "Extensión de tríceps en polea", 3, "10-15", 75],
      ["P05", "Pull 2", 5, 1, "Dominadas", "Dominadas", 4, "6-10", 150],
      ["P05", "Pull 2", 5, 2, "Remo con barra", "Remo con barra", 4, "6-10", 150],
      ["P05", "Pull 2", 5, 3, "Remo sentado en polea", "Remo sentado en polea", 3, "8-12", 120],
      ["P05", "Pull 2", 5, 4, "Face pull", "Face pull", 3, "12-15", 60],
      ["P05", "Pull 2", 5, 5, "Curl martillo", "Curl martillo", 3, "10-12", 75],
      ["P05", "Legs 2", 6, 1, "Sentadilla con barra", "Sentadilla con barra", 4, "6-10", 150],
      ["P05", "Legs 2", 6, 2, "Peso muerto rumano", "Peso muerto rumano", 4, "8-10", 150],
      ["P05", "Legs 2", 6, 3, "Prensa de piernas", "Prensa de piernas", 3, "10-12", 120],
      ["P05", "Legs 2", 6, 4, "Curl femoral tumbado", "Curl femoral tumbado", 3, "10-15", 75],
      ["P05", "Legs 2", 6, 5, "Elevación de talones de pie", "Elevación de talones de pie", 4, "10-15", 60],
    ].forEach(([sheetId, day_label, day_position, position, exerciseLookupName, exercise_name, sets, reps, rest_seconds]) => {
      const ex = exerciseLookupName && db.exercises.find(e => e.gym_id === null && e.name === exerciseLookupName);
      db.programTemplateItems.push({
        id: uid('pti'), program_id: programIdBySheet[sheetId], day_label, day_position, position,
        exercise_id: ex ? ex.id : null, exercise_name, sets, reps, rest_seconds,
      });
    });

    // ---- Logros (catálogo global — 1003 logros reales: constancia,
    // fuerza por ejercicio, cardio/boxeo/movilidad, medidas corporales,
    // clases reservadas. Ver supabase/migrations/20260909000000_achievements_library.sql) ----
    [
  ["workouts_1", "1 entrenamiento", "Completaste 1 sesión de entrenamiento.", "dumbbell", "constancia", 1, null, 1, "workouts"],
  ["workouts_3", "3 entrenamientos", "Completaste 3 sesiones de entrenamiento.", "dumbbell", "constancia", 2, null, 3, "workouts"],
  ["workouts_5", "5 entrenamientos", "Completaste 5 sesiones de entrenamiento.", "dumbbell", "constancia", 3, null, 5, "workouts"],
  ["workouts_10", "10 entrenamientos", "Completaste 10 sesiones de entrenamiento.", "dumbbell", "constancia", 4, null, 10, "workouts"],
  ["workouts_15", "15 entrenamientos", "Completaste 15 sesiones de entrenamiento.", "dumbbell", "constancia", 5, null, 15, "workouts"],
  ["workouts_20", "20 entrenamientos", "Completaste 20 sesiones de entrenamiento.", "dumbbell", "constancia", 6, null, 20, "workouts"],
  ["workouts_25", "25 entrenamientos", "Completaste 25 sesiones de entrenamiento.", "dumbbell", "constancia", 7, null, 25, "workouts"],
  ["workouts_30", "30 entrenamientos", "Completaste 30 sesiones de entrenamiento.", "dumbbell", "constancia", 8, null, 30, "workouts"],
  ["workouts_40", "40 entrenamientos", "Completaste 40 sesiones de entrenamiento.", "dumbbell", "constancia", 9, null, 40, "workouts"],
  ["workouts_50", "50 entrenamientos", "Completaste 50 sesiones de entrenamiento.", "dumbbell", "constancia", 10, null, 50, "workouts"],
  ["workouts_75", "75 entrenamientos", "Completaste 75 sesiones de entrenamiento.", "dumbbell", "constancia", 11, null, 75, "workouts"],
  ["workouts_100", "100 entrenamientos", "Completaste 100 sesiones de entrenamiento.", "dumbbell", "constancia", 12, null, 100, "workouts"],
  ["workouts_125", "125 entrenamientos", "Completaste 125 sesiones de entrenamiento.", "dumbbell", "constancia", 13, null, 125, "workouts"],
  ["workouts_150", "150 entrenamientos", "Completaste 150 sesiones de entrenamiento.", "dumbbell", "constancia", 14, null, 150, "workouts"],
  ["workouts_200", "200 entrenamientos", "Completaste 200 sesiones de entrenamiento.", "dumbbell", "constancia", 15, null, 200, "workouts"],
  ["workouts_250", "250 entrenamientos", "Completaste 250 sesiones de entrenamiento.", "dumbbell", "constancia", 16, null, 250, "workouts"],
  ["workouts_300", "300 entrenamientos", "Completaste 300 sesiones de entrenamiento.", "dumbbell", "constancia", 17, null, 300, "workouts"],
  ["workouts_400", "400 entrenamientos", "Completaste 400 sesiones de entrenamiento.", "dumbbell", "constancia", 18, null, 400, "workouts"],
  ["workouts_500", "500 entrenamientos", "Completaste 500 sesiones de entrenamiento.", "dumbbell", "constancia", 19, null, 500, "workouts"],
  ["workouts_750", "750 entrenamientos", "Completaste 750 sesiones de entrenamiento.", "dumbbell", "constancia", 20, null, 750, "workouts"],
  ["workouts_1000", "1000 entrenamientos", "Completaste 1000 sesiones de entrenamiento.", "dumbbell", "constancia", 21, null, 1000, "workouts"],
  ["streak_2", "2 días seguidos", "Hiciste check-in 2 días consecutivos.", "flame", "constancia", 1, null, 2, "streak_days"],
  ["streak_3", "3 días seguidos", "Hiciste check-in 3 días consecutivos.", "flame", "constancia", 2, null, 3, "streak_days"],
  ["streak_5", "5 días seguidos", "Hiciste check-in 5 días consecutivos.", "flame", "constancia", 3, null, 5, "streak_days"],
  ["streak_7", "7 días seguidos", "Hiciste check-in 7 días consecutivos.", "flame", "constancia", 4, null, 7, "streak_days"],
  ["streak_10", "10 días seguidos", "Hiciste check-in 10 días consecutivos.", "flame", "constancia", 5, null, 10, "streak_days"],
  ["streak_14", "14 días seguidos", "Hiciste check-in 14 días consecutivos.", "flame", "constancia", 6, null, 14, "streak_days"],
  ["streak_21", "21 días seguidos", "Hiciste check-in 21 días consecutivos.", "flame", "constancia", 7, null, 21, "streak_days"],
  ["streak_30", "30 días seguidos", "Hiciste check-in 30 días consecutivos.", "flame", "constancia", 8, null, 30, "streak_days"],
  ["streak_45", "45 días seguidos", "Hiciste check-in 45 días consecutivos.", "flame", "constancia", 9, null, 45, "streak_days"],
  ["streak_60", "60 días seguidos", "Hiciste check-in 60 días consecutivos.", "flame", "constancia", 10, null, 60, "streak_days"],
  ["streak_90", "90 días seguidos", "Hiciste check-in 90 días consecutivos.", "flame", "constancia", 11, null, 90, "streak_days"],
  ["streak_120", "120 días seguidos", "Hiciste check-in 120 días consecutivos.", "flame", "constancia", 12, null, 120, "streak_days"],
  ["streak_180", "180 días seguidos", "Hiciste check-in 180 días consecutivos.", "flame", "constancia", 13, null, 180, "streak_days"],
  ["streak_270", "270 días seguidos", "Hiciste check-in 270 días consecutivos.", "flame", "constancia", 14, null, 270, "streak_days"],
  ["streak_365", "365 días seguidos", "Hiciste check-in 365 días consecutivos.", "flame", "constancia", 15, null, 365, "streak_days"],
  ["checkins_1", "1 check-in", "Hiciste check-in en el gym 1 vez.", "idcard", "constancia", 1, null, 1, "checkins"],
  ["checkins_5", "5 check-ins", "Hiciste check-in en el gym 5 veces.", "idcard", "constancia", 2, null, 5, "checkins"],
  ["checkins_10", "10 check-ins", "Hiciste check-in en el gym 10 veces.", "idcard", "constancia", 3, null, 10, "checkins"],
  ["checkins_25", "25 check-ins", "Hiciste check-in en el gym 25 veces.", "idcard", "constancia", 4, null, 25, "checkins"],
  ["checkins_50", "50 check-ins", "Hiciste check-in en el gym 50 veces.", "idcard", "constancia", 5, null, 50, "checkins"],
  ["checkins_100", "100 check-ins", "Hiciste check-in en el gym 100 veces.", "idcard", "constancia", 6, null, 100, "checkins"],
  ["checkins_150", "150 check-ins", "Hiciste check-in en el gym 150 veces.", "idcard", "constancia", 7, null, 150, "checkins"],
  ["checkins_200", "200 check-ins", "Hiciste check-in en el gym 200 veces.", "idcard", "constancia", 8, null, 200, "checkins"],
  ["checkins_300", "300 check-ins", "Hiciste check-in en el gym 300 veces.", "idcard", "constancia", 9, null, 300, "checkins"],
  ["checkins_500", "500 check-ins", "Hiciste check-in en el gym 500 veces.", "idcard", "constancia", 10, null, 500, "checkins"],
  ["variety_5", "5 ejercicios distintos", "Probaste 5 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 1, null, 5, "exercise_variety"],
  ["variety_10", "10 ejercicios distintos", "Probaste 10 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 2, null, 10, "exercise_variety"],
  ["variety_20", "20 ejercicios distintos", "Probaste 20 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 3, null, 20, "exercise_variety"],
  ["variety_30", "30 ejercicios distintos", "Probaste 30 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 4, null, 30, "exercise_variety"],
  ["variety_50", "50 ejercicios distintos", "Probaste 50 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 5, null, 50, "exercise_variety"],
  ["variety_70", "70 ejercicios distintos", "Probaste 70 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 6, null, 70, "exercise_variety"],
  ["variety_90", "90 ejercicios distintos", "Probaste 90 ejercicios diferentes en tus entrenamientos.", "star", "constancia", 7, null, 90, "exercise_variety"],
  ["bookings_1", "1 clase reservada", "Reservaste 1 clase del gimnasio.", "calendar", "clases", 1, null, 1, "class_bookings"],
  ["bookings_3", "3 clases reservadas", "Reservaste 3 clases del gimnasio.", "calendar", "clases", 2, null, 3, "class_bookings"],
  ["bookings_5", "5 clases reservadas", "Reservaste 5 clases del gimnasio.", "calendar", "clases", 3, null, 5, "class_bookings"],
  ["bookings_10", "10 clases reservadas", "Reservaste 10 clases del gimnasio.", "calendar", "clases", 4, null, 10, "class_bookings"],
  ["bookings_15", "15 clases reservadas", "Reservaste 15 clases del gimnasio.", "calendar", "clases", 5, null, 15, "class_bookings"],
  ["bookings_20", "20 clases reservadas", "Reservaste 20 clases del gimnasio.", "calendar", "clases", 6, null, 20, "class_bookings"],
  ["bookings_30", "30 clases reservadas", "Reservaste 30 clases del gimnasio.", "calendar", "clases", 7, null, 30, "class_bookings"],
  ["bookings_50", "50 clases reservadas", "Reservaste 50 clases del gimnasio.", "calendar", "clases", 8, null, 50, "class_bookings"],
  ["bookings_75", "75 clases reservadas", "Reservaste 75 clases del gimnasio.", "calendar", "clases", 9, null, 75, "class_bookings"],
  ["bookings_100", "100 clases reservadas", "Reservaste 100 clases del gimnasio.", "calendar", "clases", 10, null, 100, "class_bookings"],
  ["prs_1", "1 récord personal", "Registraste peso en 1 ejercicio distinto.", "medal", "fuerza", 1, null, 1, "personal_records"],
  ["prs_3", "3 récords personales", "Registraste peso en 3 ejercicios distintos.", "medal", "fuerza", 2, null, 3, "personal_records"],
  ["prs_5", "5 récords personales", "Registraste peso en 5 ejercicios distintos.", "medal", "fuerza", 3, null, 5, "personal_records"],
  ["prs_10", "10 récords personales", "Registraste peso en 10 ejercicios distintos.", "medal", "fuerza", 4, null, 10, "personal_records"],
  ["prs_15", "15 récords personales", "Registraste peso en 15 ejercicios distintos.", "medal", "fuerza", 5, null, 15, "personal_records"],
  ["prs_20", "20 récords personales", "Registraste peso en 20 ejercicios distintos.", "medal", "fuerza", 6, null, 20, "personal_records"],
  ["prs_25", "25 récords personales", "Registraste peso en 25 ejercicios distintos.", "medal", "fuerza", 7, null, 25, "personal_records"],
  ["prs_30", "30 récords personales", "Registraste peso en 30 ejercicios distintos.", "medal", "fuerza", 8, null, 30, "personal_records"],
  ["prs_40", "40 récords personales", "Registraste peso en 40 ejercicios distintos.", "medal", "fuerza", 9, null, 40, "personal_records"],
  ["prs_50", "50 récords personales", "Registraste peso en 50 ejercicios distintos.", "medal", "fuerza", 10, null, 50, "personal_records"],
  ["volume_500", "500 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 500 kg.", "trophy", "fuerza", 1, null, 500, "total_volume_kg"],
  ["volume_1000", "1000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 1000 kg.", "trophy", "fuerza", 2, null, 1000, "total_volume_kg"],
  ["volume_2500", "2500 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 2500 kg.", "trophy", "fuerza", 3, null, 2500, "total_volume_kg"],
  ["volume_5000", "5000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 5000 kg.", "trophy", "fuerza", 4, null, 5000, "total_volume_kg"],
  ["volume_10000", "10.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 10.000 kg.", "trophy", "fuerza", 5, null, 10000, "total_volume_kg"],
  ["volume_20000", "20.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 20.000 kg.", "trophy", "fuerza", 6, null, 20000, "total_volume_kg"],
  ["volume_35000", "35.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 35.000 kg.", "trophy", "fuerza", 7, null, 35000, "total_volume_kg"],
  ["volume_50000", "50.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 50.000 kg.", "trophy", "fuerza", 8, null, 50000, "total_volume_kg"],
  ["volume_75000", "75.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 75.000 kg.", "trophy", "fuerza", 9, null, 75000, "total_volume_kg"],
  ["volume_100000", "100.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 100.000 kg.", "trophy", "fuerza", 10, null, 100000, "total_volume_kg"],
  ["volume_150000", "150.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 150.000 kg.", "trophy", "fuerza", 11, null, 150000, "total_volume_kg"],
  ["volume_250000", "250.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 250.000 kg.", "trophy", "fuerza", 12, null, 250000, "total_volume_kg"],
  ["volume_400000", "400.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 400.000 kg.", "trophy", "fuerza", 13, null, 400000, "total_volume_kg"],
  ["volume_600000", "600.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 600.000 kg.", "trophy", "fuerza", 14, null, 600000, "total_volume_kg"],
  ["volume_1000000", "1.000.000 kg movidos", "Volumen total levantado (peso × repeticiones) acumulado: 1.000.000 kg.", "trophy", "fuerza", 15, null, 1000000, "total_volume_kg"],
  ["pr_sentadilla_con_barra_20", "Sentadilla con barra · 20 kg", "Levantaste 20 kg en sentadilla con barra.", "dumbbell", "fuerza", 1, "Sentadilla con barra", 20, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_30", "Sentadilla con barra · 30 kg", "Levantaste 30 kg en sentadilla con barra.", "dumbbell", "fuerza", 2, "Sentadilla con barra", 30, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_40", "Sentadilla con barra · 40 kg", "Levantaste 40 kg en sentadilla con barra.", "dumbbell", "fuerza", 3, "Sentadilla con barra", 40, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_50", "Sentadilla con barra · 50 kg", "Levantaste 50 kg en sentadilla con barra.", "dumbbell", "fuerza", 4, "Sentadilla con barra", 50, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_60", "Sentadilla con barra · 60 kg", "Levantaste 60 kg en sentadilla con barra.", "dumbbell", "fuerza", 5, "Sentadilla con barra", 60, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_80", "Sentadilla con barra · 80 kg", "Levantaste 80 kg en sentadilla con barra.", "dumbbell", "fuerza", 6, "Sentadilla con barra", 80, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_100", "Sentadilla con barra · 100 kg", "Levantaste 100 kg en sentadilla con barra.", "dumbbell", "fuerza", 7, "Sentadilla con barra", 100, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_120", "Sentadilla con barra · 120 kg", "Levantaste 120 kg en sentadilla con barra.", "dumbbell", "fuerza", 8, "Sentadilla con barra", 120, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_140", "Sentadilla con barra · 140 kg", "Levantaste 140 kg en sentadilla con barra.", "dumbbell", "fuerza", 9, "Sentadilla con barra", 140, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_160", "Sentadilla con barra · 160 kg", "Levantaste 160 kg en sentadilla con barra.", "dumbbell", "fuerza", 10, "Sentadilla con barra", 160, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_180", "Sentadilla con barra · 180 kg", "Levantaste 180 kg en sentadilla con barra.", "dumbbell", "fuerza", 11, "Sentadilla con barra", 180, "exercise_max_weight"],
  ["pr_sentadilla_con_barra_200", "Sentadilla con barra · 200 kg", "Levantaste 200 kg en sentadilla con barra.", "dumbbell", "fuerza", 12, "Sentadilla con barra", 200, "exercise_max_weight"],
  ["pr_sentadilla_goblet_5", "Sentadilla goblet · 5 kg", "Levantaste 5 kg en sentadilla goblet.", "dumbbell", "fuerza", 1, "Sentadilla goblet", 5, "exercise_max_weight"],
  ["pr_sentadilla_goblet_7", "Sentadilla goblet · 7 kg", "Levantaste 7 kg en sentadilla goblet.", "dumbbell", "fuerza", 2, "Sentadilla goblet", 7, "exercise_max_weight"],
  ["pr_sentadilla_goblet_10", "Sentadilla goblet · 10 kg", "Levantaste 10 kg en sentadilla goblet.", "dumbbell", "fuerza", 3, "Sentadilla goblet", 10, "exercise_max_weight"],
  ["pr_sentadilla_goblet_12", "Sentadilla goblet · 12 kg", "Levantaste 12 kg en sentadilla goblet.", "dumbbell", "fuerza", 4, "Sentadilla goblet", 12, "exercise_max_weight"],
  ["pr_sentadilla_goblet_15", "Sentadilla goblet · 15 kg", "Levantaste 15 kg en sentadilla goblet.", "dumbbell", "fuerza", 5, "Sentadilla goblet", 15, "exercise_max_weight"],
  ["pr_sentadilla_goblet_20", "Sentadilla goblet · 20 kg", "Levantaste 20 kg en sentadilla goblet.", "dumbbell", "fuerza", 6, "Sentadilla goblet", 20, "exercise_max_weight"],
  ["pr_sentadilla_goblet_25", "Sentadilla goblet · 25 kg", "Levantaste 25 kg en sentadilla goblet.", "dumbbell", "fuerza", 7, "Sentadilla goblet", 25, "exercise_max_weight"],
  ["pr_sentadilla_goblet_30", "Sentadilla goblet · 30 kg", "Levantaste 30 kg en sentadilla goblet.", "dumbbell", "fuerza", 8, "Sentadilla goblet", 30, "exercise_max_weight"],
  ["pr_sentadilla_goblet_35", "Sentadilla goblet · 35 kg", "Levantaste 35 kg en sentadilla goblet.", "dumbbell", "fuerza", 9, "Sentadilla goblet", 35, "exercise_max_weight"],
  ["pr_sentadilla_goblet_40", "Sentadilla goblet · 40 kg", "Levantaste 40 kg en sentadilla goblet.", "dumbbell", "fuerza", 10, "Sentadilla goblet", 40, "exercise_max_weight"],
  ["pr_sentadilla_goblet_45", "Sentadilla goblet · 45 kg", "Levantaste 45 kg en sentadilla goblet.", "dumbbell", "fuerza", 11, "Sentadilla goblet", 45, "exercise_max_weight"],
  ["pr_sentadilla_goblet_50", "Sentadilla goblet · 50 kg", "Levantaste 50 kg en sentadilla goblet.", "dumbbell", "fuerza", 12, "Sentadilla goblet", 50, "exercise_max_weight"],
  ["pr_sentadilla_frontal_20", "Sentadilla frontal · 20 kg", "Levantaste 20 kg en sentadilla frontal.", "dumbbell", "fuerza", 1, "Sentadilla frontal", 20, "exercise_max_weight"],
  ["pr_sentadilla_frontal_30", "Sentadilla frontal · 30 kg", "Levantaste 30 kg en sentadilla frontal.", "dumbbell", "fuerza", 2, "Sentadilla frontal", 30, "exercise_max_weight"],
  ["pr_sentadilla_frontal_40", "Sentadilla frontal · 40 kg", "Levantaste 40 kg en sentadilla frontal.", "dumbbell", "fuerza", 3, "Sentadilla frontal", 40, "exercise_max_weight"],
  ["pr_sentadilla_frontal_50", "Sentadilla frontal · 50 kg", "Levantaste 50 kg en sentadilla frontal.", "dumbbell", "fuerza", 4, "Sentadilla frontal", 50, "exercise_max_weight"],
  ["pr_sentadilla_frontal_60", "Sentadilla frontal · 60 kg", "Levantaste 60 kg en sentadilla frontal.", "dumbbell", "fuerza", 5, "Sentadilla frontal", 60, "exercise_max_weight"],
  ["pr_sentadilla_frontal_80", "Sentadilla frontal · 80 kg", "Levantaste 80 kg en sentadilla frontal.", "dumbbell", "fuerza", 6, "Sentadilla frontal", 80, "exercise_max_weight"],
  ["pr_sentadilla_frontal_100", "Sentadilla frontal · 100 kg", "Levantaste 100 kg en sentadilla frontal.", "dumbbell", "fuerza", 7, "Sentadilla frontal", 100, "exercise_max_weight"],
  ["pr_sentadilla_frontal_120", "Sentadilla frontal · 120 kg", "Levantaste 120 kg en sentadilla frontal.", "dumbbell", "fuerza", 8, "Sentadilla frontal", 120, "exercise_max_weight"],
  ["pr_sentadilla_frontal_140", "Sentadilla frontal · 140 kg", "Levantaste 140 kg en sentadilla frontal.", "dumbbell", "fuerza", 9, "Sentadilla frontal", 140, "exercise_max_weight"],
  ["pr_sentadilla_frontal_160", "Sentadilla frontal · 160 kg", "Levantaste 160 kg en sentadilla frontal.", "dumbbell", "fuerza", 10, "Sentadilla frontal", 160, "exercise_max_weight"],
  ["pr_sentadilla_frontal_180", "Sentadilla frontal · 180 kg", "Levantaste 180 kg en sentadilla frontal.", "dumbbell", "fuerza", 11, "Sentadilla frontal", 180, "exercise_max_weight"],
  ["pr_sentadilla_frontal_200", "Sentadilla frontal · 200 kg", "Levantaste 200 kg en sentadilla frontal.", "dumbbell", "fuerza", 12, "Sentadilla frontal", 200, "exercise_max_weight"],
  ["pr_sentadilla_hack_10", "Sentadilla hack · 10 kg", "Levantaste 10 kg en sentadilla hack.", "dumbbell", "fuerza", 1, "Sentadilla hack", 10, "exercise_max_weight"],
  ["pr_sentadilla_hack_15", "Sentadilla hack · 15 kg", "Levantaste 15 kg en sentadilla hack.", "dumbbell", "fuerza", 2, "Sentadilla hack", 15, "exercise_max_weight"],
  ["pr_sentadilla_hack_20", "Sentadilla hack · 20 kg", "Levantaste 20 kg en sentadilla hack.", "dumbbell", "fuerza", 3, "Sentadilla hack", 20, "exercise_max_weight"],
  ["pr_sentadilla_hack_25", "Sentadilla hack · 25 kg", "Levantaste 25 kg en sentadilla hack.", "dumbbell", "fuerza", 4, "Sentadilla hack", 25, "exercise_max_weight"],
  ["pr_sentadilla_hack_30", "Sentadilla hack · 30 kg", "Levantaste 30 kg en sentadilla hack.", "dumbbell", "fuerza", 5, "Sentadilla hack", 30, "exercise_max_weight"],
  ["pr_sentadilla_hack_40", "Sentadilla hack · 40 kg", "Levantaste 40 kg en sentadilla hack.", "dumbbell", "fuerza", 6, "Sentadilla hack", 40, "exercise_max_weight"],
  ["pr_sentadilla_hack_50", "Sentadilla hack · 50 kg", "Levantaste 50 kg en sentadilla hack.", "dumbbell", "fuerza", 7, "Sentadilla hack", 50, "exercise_max_weight"],
  ["pr_sentadilla_hack_60", "Sentadilla hack · 60 kg", "Levantaste 60 kg en sentadilla hack.", "dumbbell", "fuerza", 8, "Sentadilla hack", 60, "exercise_max_weight"],
  ["pr_sentadilla_hack_70", "Sentadilla hack · 70 kg", "Levantaste 70 kg en sentadilla hack.", "dumbbell", "fuerza", 9, "Sentadilla hack", 70, "exercise_max_weight"],
  ["pr_sentadilla_hack_80", "Sentadilla hack · 80 kg", "Levantaste 80 kg en sentadilla hack.", "dumbbell", "fuerza", 10, "Sentadilla hack", 80, "exercise_max_weight"],
  ["pr_sentadilla_hack_90", "Sentadilla hack · 90 kg", "Levantaste 90 kg en sentadilla hack.", "dumbbell", "fuerza", 11, "Sentadilla hack", 90, "exercise_max_weight"],
  ["pr_sentadilla_hack_100", "Sentadilla hack · 100 kg", "Levantaste 100 kg en sentadilla hack.", "dumbbell", "fuerza", 12, "Sentadilla hack", 100, "exercise_max_weight"],
  ["pr_prensa_de_piernas_10", "Prensa de piernas · 10 kg", "Levantaste 10 kg en prensa de piernas.", "dumbbell", "fuerza", 1, "Prensa de piernas", 10, "exercise_max_weight"],
  ["pr_prensa_de_piernas_15", "Prensa de piernas · 15 kg", "Levantaste 15 kg en prensa de piernas.", "dumbbell", "fuerza", 2, "Prensa de piernas", 15, "exercise_max_weight"],
  ["pr_prensa_de_piernas_20", "Prensa de piernas · 20 kg", "Levantaste 20 kg en prensa de piernas.", "dumbbell", "fuerza", 3, "Prensa de piernas", 20, "exercise_max_weight"],
  ["pr_prensa_de_piernas_25", "Prensa de piernas · 25 kg", "Levantaste 25 kg en prensa de piernas.", "dumbbell", "fuerza", 4, "Prensa de piernas", 25, "exercise_max_weight"],
  ["pr_prensa_de_piernas_30", "Prensa de piernas · 30 kg", "Levantaste 30 kg en prensa de piernas.", "dumbbell", "fuerza", 5, "Prensa de piernas", 30, "exercise_max_weight"],
  ["pr_prensa_de_piernas_40", "Prensa de piernas · 40 kg", "Levantaste 40 kg en prensa de piernas.", "dumbbell", "fuerza", 6, "Prensa de piernas", 40, "exercise_max_weight"],
  ["pr_prensa_de_piernas_50", "Prensa de piernas · 50 kg", "Levantaste 50 kg en prensa de piernas.", "dumbbell", "fuerza", 7, "Prensa de piernas", 50, "exercise_max_weight"],
  ["pr_prensa_de_piernas_60", "Prensa de piernas · 60 kg", "Levantaste 60 kg en prensa de piernas.", "dumbbell", "fuerza", 8, "Prensa de piernas", 60, "exercise_max_weight"],
  ["pr_prensa_de_piernas_70", "Prensa de piernas · 70 kg", "Levantaste 70 kg en prensa de piernas.", "dumbbell", "fuerza", 9, "Prensa de piernas", 70, "exercise_max_weight"],
  ["pr_prensa_de_piernas_80", "Prensa de piernas · 80 kg", "Levantaste 80 kg en prensa de piernas.", "dumbbell", "fuerza", 10, "Prensa de piernas", 80, "exercise_max_weight"],
  ["pr_prensa_de_piernas_90", "Prensa de piernas · 90 kg", "Levantaste 90 kg en prensa de piernas.", "dumbbell", "fuerza", 11, "Prensa de piernas", 90, "exercise_max_weight"],
  ["pr_prensa_de_piernas_100", "Prensa de piernas · 100 kg", "Levantaste 100 kg en prensa de piernas.", "dumbbell", "fuerza", 12, "Prensa de piernas", 100, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_20", "Peso muerto rumano · 20 kg", "Levantaste 20 kg en peso muerto rumano.", "dumbbell", "fuerza", 1, "Peso muerto rumano", 20, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_30", "Peso muerto rumano · 30 kg", "Levantaste 30 kg en peso muerto rumano.", "dumbbell", "fuerza", 2, "Peso muerto rumano", 30, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_40", "Peso muerto rumano · 40 kg", "Levantaste 40 kg en peso muerto rumano.", "dumbbell", "fuerza", 3, "Peso muerto rumano", 40, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_50", "Peso muerto rumano · 50 kg", "Levantaste 50 kg en peso muerto rumano.", "dumbbell", "fuerza", 4, "Peso muerto rumano", 50, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_60", "Peso muerto rumano · 60 kg", "Levantaste 60 kg en peso muerto rumano.", "dumbbell", "fuerza", 5, "Peso muerto rumano", 60, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_80", "Peso muerto rumano · 80 kg", "Levantaste 80 kg en peso muerto rumano.", "dumbbell", "fuerza", 6, "Peso muerto rumano", 80, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_100", "Peso muerto rumano · 100 kg", "Levantaste 100 kg en peso muerto rumano.", "dumbbell", "fuerza", 7, "Peso muerto rumano", 100, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_120", "Peso muerto rumano · 120 kg", "Levantaste 120 kg en peso muerto rumano.", "dumbbell", "fuerza", 8, "Peso muerto rumano", 120, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_140", "Peso muerto rumano · 140 kg", "Levantaste 140 kg en peso muerto rumano.", "dumbbell", "fuerza", 9, "Peso muerto rumano", 140, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_160", "Peso muerto rumano · 160 kg", "Levantaste 160 kg en peso muerto rumano.", "dumbbell", "fuerza", 10, "Peso muerto rumano", 160, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_180", "Peso muerto rumano · 180 kg", "Levantaste 180 kg en peso muerto rumano.", "dumbbell", "fuerza", 11, "Peso muerto rumano", 180, "exercise_max_weight"],
  ["pr_peso_muerto_rumano_200", "Peso muerto rumano · 200 kg", "Levantaste 200 kg en peso muerto rumano.", "dumbbell", "fuerza", 12, "Peso muerto rumano", 200, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_5", "Peso muerto con mancuernas · 5 kg", "Levantaste 5 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 1, "Peso muerto con mancuernas", 5, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_7", "Peso muerto con mancuernas · 7 kg", "Levantaste 7 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 2, "Peso muerto con mancuernas", 7, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_10", "Peso muerto con mancuernas · 10 kg", "Levantaste 10 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 3, "Peso muerto con mancuernas", 10, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_12", "Peso muerto con mancuernas · 12 kg", "Levantaste 12 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 4, "Peso muerto con mancuernas", 12, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_15", "Peso muerto con mancuernas · 15 kg", "Levantaste 15 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 5, "Peso muerto con mancuernas", 15, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_20", "Peso muerto con mancuernas · 20 kg", "Levantaste 20 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 6, "Peso muerto con mancuernas", 20, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_25", "Peso muerto con mancuernas · 25 kg", "Levantaste 25 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 7, "Peso muerto con mancuernas", 25, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_30", "Peso muerto con mancuernas · 30 kg", "Levantaste 30 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 8, "Peso muerto con mancuernas", 30, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_35", "Peso muerto con mancuernas · 35 kg", "Levantaste 35 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 9, "Peso muerto con mancuernas", 35, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_40", "Peso muerto con mancuernas · 40 kg", "Levantaste 40 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 10, "Peso muerto con mancuernas", 40, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_45", "Peso muerto con mancuernas · 45 kg", "Levantaste 45 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 11, "Peso muerto con mancuernas", 45, "exercise_max_weight"],
  ["pr_peso_muerto_con_mancuernas_50", "Peso muerto con mancuernas · 50 kg", "Levantaste 50 kg en peso muerto con mancuernas.", "dumbbell", "fuerza", 12, "Peso muerto con mancuernas", 50, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_20", "Hip thrust con barra · 20 kg", "Levantaste 20 kg en hip thrust con barra.", "dumbbell", "fuerza", 1, "Hip thrust con barra", 20, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_30", "Hip thrust con barra · 30 kg", "Levantaste 30 kg en hip thrust con barra.", "dumbbell", "fuerza", 2, "Hip thrust con barra", 30, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_40", "Hip thrust con barra · 40 kg", "Levantaste 40 kg en hip thrust con barra.", "dumbbell", "fuerza", 3, "Hip thrust con barra", 40, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_50", "Hip thrust con barra · 50 kg", "Levantaste 50 kg en hip thrust con barra.", "dumbbell", "fuerza", 4, "Hip thrust con barra", 50, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_60", "Hip thrust con barra · 60 kg", "Levantaste 60 kg en hip thrust con barra.", "dumbbell", "fuerza", 5, "Hip thrust con barra", 60, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_80", "Hip thrust con barra · 80 kg", "Levantaste 80 kg en hip thrust con barra.", "dumbbell", "fuerza", 6, "Hip thrust con barra", 80, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_100", "Hip thrust con barra · 100 kg", "Levantaste 100 kg en hip thrust con barra.", "dumbbell", "fuerza", 7, "Hip thrust con barra", 100, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_120", "Hip thrust con barra · 120 kg", "Levantaste 120 kg en hip thrust con barra.", "dumbbell", "fuerza", 8, "Hip thrust con barra", 120, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_140", "Hip thrust con barra · 140 kg", "Levantaste 140 kg en hip thrust con barra.", "dumbbell", "fuerza", 9, "Hip thrust con barra", 140, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_160", "Hip thrust con barra · 160 kg", "Levantaste 160 kg en hip thrust con barra.", "dumbbell", "fuerza", 10, "Hip thrust con barra", 160, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_180", "Hip thrust con barra · 180 kg", "Levantaste 180 kg en hip thrust con barra.", "dumbbell", "fuerza", 11, "Hip thrust con barra", 180, "exercise_max_weight"],
  ["pr_hip_thrust_con_barra_200", "Hip thrust con barra · 200 kg", "Levantaste 200 kg en hip thrust con barra.", "dumbbell", "fuerza", 12, "Hip thrust con barra", 200, "exercise_max_weight"],
  ["sessions_puente_de_gluteos_5", "Puente de glúteos · 5 veces", "Hiciste puente de glúteos en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Puente de glúteos", 5, "exercise_sessions"],
  ["sessions_puente_de_gluteos_10", "Puente de glúteos · 10 veces", "Hiciste puente de glúteos en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Puente de glúteos", 10, "exercise_sessions"],
  ["sessions_puente_de_gluteos_25", "Puente de glúteos · 25 veces", "Hiciste puente de glúteos en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Puente de glúteos", 25, "exercise_sessions"],
  ["sessions_puente_de_gluteos_50", "Puente de glúteos · 50 veces", "Hiciste puente de glúteos en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Puente de glúteos", 50, "exercise_sessions"],
  ["sessions_puente_de_gluteos_100", "Puente de glúteos · 100 veces", "Hiciste puente de glúteos en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Puente de glúteos", 100, "exercise_sessions"],
  ["pr_zancadas_caminando_5", "Zancadas caminando · 5 kg", "Levantaste 5 kg en zancadas caminando.", "dumbbell", "fuerza", 1, "Zancadas caminando", 5, "exercise_max_weight"],
  ["pr_zancadas_caminando_7", "Zancadas caminando · 7 kg", "Levantaste 7 kg en zancadas caminando.", "dumbbell", "fuerza", 2, "Zancadas caminando", 7, "exercise_max_weight"],
  ["pr_zancadas_caminando_10", "Zancadas caminando · 10 kg", "Levantaste 10 kg en zancadas caminando.", "dumbbell", "fuerza", 3, "Zancadas caminando", 10, "exercise_max_weight"],
  ["pr_zancadas_caminando_12", "Zancadas caminando · 12 kg", "Levantaste 12 kg en zancadas caminando.", "dumbbell", "fuerza", 4, "Zancadas caminando", 12, "exercise_max_weight"],
  ["pr_zancadas_caminando_15", "Zancadas caminando · 15 kg", "Levantaste 15 kg en zancadas caminando.", "dumbbell", "fuerza", 5, "Zancadas caminando", 15, "exercise_max_weight"],
  ["pr_zancadas_caminando_20", "Zancadas caminando · 20 kg", "Levantaste 20 kg en zancadas caminando.", "dumbbell", "fuerza", 6, "Zancadas caminando", 20, "exercise_max_weight"],
  ["pr_zancadas_caminando_25", "Zancadas caminando · 25 kg", "Levantaste 25 kg en zancadas caminando.", "dumbbell", "fuerza", 7, "Zancadas caminando", 25, "exercise_max_weight"],
  ["pr_zancadas_caminando_30", "Zancadas caminando · 30 kg", "Levantaste 30 kg en zancadas caminando.", "dumbbell", "fuerza", 8, "Zancadas caminando", 30, "exercise_max_weight"],
  ["pr_zancadas_caminando_35", "Zancadas caminando · 35 kg", "Levantaste 35 kg en zancadas caminando.", "dumbbell", "fuerza", 9, "Zancadas caminando", 35, "exercise_max_weight"],
  ["pr_zancadas_caminando_40", "Zancadas caminando · 40 kg", "Levantaste 40 kg en zancadas caminando.", "dumbbell", "fuerza", 10, "Zancadas caminando", 40, "exercise_max_weight"],
  ["pr_zancadas_caminando_45", "Zancadas caminando · 45 kg", "Levantaste 45 kg en zancadas caminando.", "dumbbell", "fuerza", 11, "Zancadas caminando", 45, "exercise_max_weight"],
  ["pr_zancadas_caminando_50", "Zancadas caminando · 50 kg", "Levantaste 50 kg en zancadas caminando.", "dumbbell", "fuerza", 12, "Zancadas caminando", 50, "exercise_max_weight"],
  ["pr_zancada_atras_5", "Zancada atrás · 5 kg", "Levantaste 5 kg en zancada atrás.", "dumbbell", "fuerza", 1, "Zancada atrás", 5, "exercise_max_weight"],
  ["pr_zancada_atras_7", "Zancada atrás · 7 kg", "Levantaste 7 kg en zancada atrás.", "dumbbell", "fuerza", 2, "Zancada atrás", 7, "exercise_max_weight"],
  ["pr_zancada_atras_10", "Zancada atrás · 10 kg", "Levantaste 10 kg en zancada atrás.", "dumbbell", "fuerza", 3, "Zancada atrás", 10, "exercise_max_weight"],
  ["pr_zancada_atras_12", "Zancada atrás · 12 kg", "Levantaste 12 kg en zancada atrás.", "dumbbell", "fuerza", 4, "Zancada atrás", 12, "exercise_max_weight"],
  ["pr_zancada_atras_15", "Zancada atrás · 15 kg", "Levantaste 15 kg en zancada atrás.", "dumbbell", "fuerza", 5, "Zancada atrás", 15, "exercise_max_weight"],
  ["pr_zancada_atras_20", "Zancada atrás · 20 kg", "Levantaste 20 kg en zancada atrás.", "dumbbell", "fuerza", 6, "Zancada atrás", 20, "exercise_max_weight"],
  ["pr_zancada_atras_25", "Zancada atrás · 25 kg", "Levantaste 25 kg en zancada atrás.", "dumbbell", "fuerza", 7, "Zancada atrás", 25, "exercise_max_weight"],
  ["pr_zancada_atras_30", "Zancada atrás · 30 kg", "Levantaste 30 kg en zancada atrás.", "dumbbell", "fuerza", 8, "Zancada atrás", 30, "exercise_max_weight"],
  ["pr_zancada_atras_35", "Zancada atrás · 35 kg", "Levantaste 35 kg en zancada atrás.", "dumbbell", "fuerza", 9, "Zancada atrás", 35, "exercise_max_weight"],
  ["pr_zancada_atras_40", "Zancada atrás · 40 kg", "Levantaste 40 kg en zancada atrás.", "dumbbell", "fuerza", 10, "Zancada atrás", 40, "exercise_max_weight"],
  ["pr_zancada_atras_45", "Zancada atrás · 45 kg", "Levantaste 45 kg en zancada atrás.", "dumbbell", "fuerza", 11, "Zancada atrás", 45, "exercise_max_weight"],
  ["pr_zancada_atras_50", "Zancada atrás · 50 kg", "Levantaste 50 kg en zancada atrás.", "dumbbell", "fuerza", 12, "Zancada atrás", 50, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_5", "Split squat búlgaro · 5 kg", "Levantaste 5 kg en split squat búlgaro.", "dumbbell", "fuerza", 1, "Split squat búlgaro", 5, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_7", "Split squat búlgaro · 7 kg", "Levantaste 7 kg en split squat búlgaro.", "dumbbell", "fuerza", 2, "Split squat búlgaro", 7, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_10", "Split squat búlgaro · 10 kg", "Levantaste 10 kg en split squat búlgaro.", "dumbbell", "fuerza", 3, "Split squat búlgaro", 10, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_12", "Split squat búlgaro · 12 kg", "Levantaste 12 kg en split squat búlgaro.", "dumbbell", "fuerza", 4, "Split squat búlgaro", 12, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_15", "Split squat búlgaro · 15 kg", "Levantaste 15 kg en split squat búlgaro.", "dumbbell", "fuerza", 5, "Split squat búlgaro", 15, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_20", "Split squat búlgaro · 20 kg", "Levantaste 20 kg en split squat búlgaro.", "dumbbell", "fuerza", 6, "Split squat búlgaro", 20, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_25", "Split squat búlgaro · 25 kg", "Levantaste 25 kg en split squat búlgaro.", "dumbbell", "fuerza", 7, "Split squat búlgaro", 25, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_30", "Split squat búlgaro · 30 kg", "Levantaste 30 kg en split squat búlgaro.", "dumbbell", "fuerza", 8, "Split squat búlgaro", 30, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_35", "Split squat búlgaro · 35 kg", "Levantaste 35 kg en split squat búlgaro.", "dumbbell", "fuerza", 9, "Split squat búlgaro", 35, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_40", "Split squat búlgaro · 40 kg", "Levantaste 40 kg en split squat búlgaro.", "dumbbell", "fuerza", 10, "Split squat búlgaro", 40, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_45", "Split squat búlgaro · 45 kg", "Levantaste 45 kg en split squat búlgaro.", "dumbbell", "fuerza", 11, "Split squat búlgaro", 45, "exercise_max_weight"],
  ["pr_split_squat_bulgaro_50", "Split squat búlgaro · 50 kg", "Levantaste 50 kg en split squat búlgaro.", "dumbbell", "fuerza", 12, "Split squat búlgaro", 50, "exercise_max_weight"],
  ["pr_step_up_5", "Step-up · 5 kg", "Levantaste 5 kg en step-up.", "dumbbell", "fuerza", 1, "Step-up", 5, "exercise_max_weight"],
  ["pr_step_up_7", "Step-up · 7 kg", "Levantaste 7 kg en step-up.", "dumbbell", "fuerza", 2, "Step-up", 7, "exercise_max_weight"],
  ["pr_step_up_10", "Step-up · 10 kg", "Levantaste 10 kg en step-up.", "dumbbell", "fuerza", 3, "Step-up", 10, "exercise_max_weight"],
  ["pr_step_up_12", "Step-up · 12 kg", "Levantaste 12 kg en step-up.", "dumbbell", "fuerza", 4, "Step-up", 12, "exercise_max_weight"],
  ["pr_step_up_15", "Step-up · 15 kg", "Levantaste 15 kg en step-up.", "dumbbell", "fuerza", 5, "Step-up", 15, "exercise_max_weight"],
  ["pr_step_up_20", "Step-up · 20 kg", "Levantaste 20 kg en step-up.", "dumbbell", "fuerza", 6, "Step-up", 20, "exercise_max_weight"],
  ["pr_step_up_25", "Step-up · 25 kg", "Levantaste 25 kg en step-up.", "dumbbell", "fuerza", 7, "Step-up", 25, "exercise_max_weight"],
  ["pr_step_up_30", "Step-up · 30 kg", "Levantaste 30 kg en step-up.", "dumbbell", "fuerza", 8, "Step-up", 30, "exercise_max_weight"],
  ["pr_step_up_35", "Step-up · 35 kg", "Levantaste 35 kg en step-up.", "dumbbell", "fuerza", 9, "Step-up", 35, "exercise_max_weight"],
  ["pr_step_up_40", "Step-up · 40 kg", "Levantaste 40 kg en step-up.", "dumbbell", "fuerza", 10, "Step-up", 40, "exercise_max_weight"],
  ["pr_step_up_45", "Step-up · 45 kg", "Levantaste 45 kg en step-up.", "dumbbell", "fuerza", 11, "Step-up", 45, "exercise_max_weight"],
  ["pr_step_up_50", "Step-up · 50 kg", "Levantaste 50 kg en step-up.", "dumbbell", "fuerza", 12, "Step-up", 50, "exercise_max_weight"],
  ["pr_extension_de_piernas_10", "Extensión de piernas · 10 kg", "Levantaste 10 kg en extensión de piernas.", "dumbbell", "fuerza", 1, "Extensión de piernas", 10, "exercise_max_weight"],
  ["pr_extension_de_piernas_15", "Extensión de piernas · 15 kg", "Levantaste 15 kg en extensión de piernas.", "dumbbell", "fuerza", 2, "Extensión de piernas", 15, "exercise_max_weight"],
  ["pr_extension_de_piernas_20", "Extensión de piernas · 20 kg", "Levantaste 20 kg en extensión de piernas.", "dumbbell", "fuerza", 3, "Extensión de piernas", 20, "exercise_max_weight"],
  ["pr_extension_de_piernas_25", "Extensión de piernas · 25 kg", "Levantaste 25 kg en extensión de piernas.", "dumbbell", "fuerza", 4, "Extensión de piernas", 25, "exercise_max_weight"],
  ["pr_extension_de_piernas_30", "Extensión de piernas · 30 kg", "Levantaste 30 kg en extensión de piernas.", "dumbbell", "fuerza", 5, "Extensión de piernas", 30, "exercise_max_weight"],
  ["pr_extension_de_piernas_40", "Extensión de piernas · 40 kg", "Levantaste 40 kg en extensión de piernas.", "dumbbell", "fuerza", 6, "Extensión de piernas", 40, "exercise_max_weight"],
  ["pr_extension_de_piernas_50", "Extensión de piernas · 50 kg", "Levantaste 50 kg en extensión de piernas.", "dumbbell", "fuerza", 7, "Extensión de piernas", 50, "exercise_max_weight"],
  ["pr_extension_de_piernas_60", "Extensión de piernas · 60 kg", "Levantaste 60 kg en extensión de piernas.", "dumbbell", "fuerza", 8, "Extensión de piernas", 60, "exercise_max_weight"],
  ["pr_extension_de_piernas_70", "Extensión de piernas · 70 kg", "Levantaste 70 kg en extensión de piernas.", "dumbbell", "fuerza", 9, "Extensión de piernas", 70, "exercise_max_weight"],
  ["pr_extension_de_piernas_80", "Extensión de piernas · 80 kg", "Levantaste 80 kg en extensión de piernas.", "dumbbell", "fuerza", 10, "Extensión de piernas", 80, "exercise_max_weight"],
  ["pr_extension_de_piernas_90", "Extensión de piernas · 90 kg", "Levantaste 90 kg en extensión de piernas.", "dumbbell", "fuerza", 11, "Extensión de piernas", 90, "exercise_max_weight"],
  ["pr_extension_de_piernas_100", "Extensión de piernas · 100 kg", "Levantaste 100 kg en extensión de piernas.", "dumbbell", "fuerza", 12, "Extensión de piernas", 100, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_10", "Curl femoral tumbado · 10 kg", "Levantaste 10 kg en curl femoral tumbado.", "dumbbell", "fuerza", 1, "Curl femoral tumbado", 10, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_15", "Curl femoral tumbado · 15 kg", "Levantaste 15 kg en curl femoral tumbado.", "dumbbell", "fuerza", 2, "Curl femoral tumbado", 15, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_20", "Curl femoral tumbado · 20 kg", "Levantaste 20 kg en curl femoral tumbado.", "dumbbell", "fuerza", 3, "Curl femoral tumbado", 20, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_25", "Curl femoral tumbado · 25 kg", "Levantaste 25 kg en curl femoral tumbado.", "dumbbell", "fuerza", 4, "Curl femoral tumbado", 25, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_30", "Curl femoral tumbado · 30 kg", "Levantaste 30 kg en curl femoral tumbado.", "dumbbell", "fuerza", 5, "Curl femoral tumbado", 30, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_40", "Curl femoral tumbado · 40 kg", "Levantaste 40 kg en curl femoral tumbado.", "dumbbell", "fuerza", 6, "Curl femoral tumbado", 40, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_50", "Curl femoral tumbado · 50 kg", "Levantaste 50 kg en curl femoral tumbado.", "dumbbell", "fuerza", 7, "Curl femoral tumbado", 50, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_60", "Curl femoral tumbado · 60 kg", "Levantaste 60 kg en curl femoral tumbado.", "dumbbell", "fuerza", 8, "Curl femoral tumbado", 60, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_70", "Curl femoral tumbado · 70 kg", "Levantaste 70 kg en curl femoral tumbado.", "dumbbell", "fuerza", 9, "Curl femoral tumbado", 70, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_80", "Curl femoral tumbado · 80 kg", "Levantaste 80 kg en curl femoral tumbado.", "dumbbell", "fuerza", 10, "Curl femoral tumbado", 80, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_90", "Curl femoral tumbado · 90 kg", "Levantaste 90 kg en curl femoral tumbado.", "dumbbell", "fuerza", 11, "Curl femoral tumbado", 90, "exercise_max_weight"],
  ["pr_curl_femoral_tumbado_100", "Curl femoral tumbado · 100 kg", "Levantaste 100 kg en curl femoral tumbado.", "dumbbell", "fuerza", 12, "Curl femoral tumbado", 100, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_10", "Curl femoral sentado · 10 kg", "Levantaste 10 kg en curl femoral sentado.", "dumbbell", "fuerza", 1, "Curl femoral sentado", 10, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_15", "Curl femoral sentado · 15 kg", "Levantaste 15 kg en curl femoral sentado.", "dumbbell", "fuerza", 2, "Curl femoral sentado", 15, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_20", "Curl femoral sentado · 20 kg", "Levantaste 20 kg en curl femoral sentado.", "dumbbell", "fuerza", 3, "Curl femoral sentado", 20, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_25", "Curl femoral sentado · 25 kg", "Levantaste 25 kg en curl femoral sentado.", "dumbbell", "fuerza", 4, "Curl femoral sentado", 25, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_30", "Curl femoral sentado · 30 kg", "Levantaste 30 kg en curl femoral sentado.", "dumbbell", "fuerza", 5, "Curl femoral sentado", 30, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_40", "Curl femoral sentado · 40 kg", "Levantaste 40 kg en curl femoral sentado.", "dumbbell", "fuerza", 6, "Curl femoral sentado", 40, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_50", "Curl femoral sentado · 50 kg", "Levantaste 50 kg en curl femoral sentado.", "dumbbell", "fuerza", 7, "Curl femoral sentado", 50, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_60", "Curl femoral sentado · 60 kg", "Levantaste 60 kg en curl femoral sentado.", "dumbbell", "fuerza", 8, "Curl femoral sentado", 60, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_70", "Curl femoral sentado · 70 kg", "Levantaste 70 kg en curl femoral sentado.", "dumbbell", "fuerza", 9, "Curl femoral sentado", 70, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_80", "Curl femoral sentado · 80 kg", "Levantaste 80 kg en curl femoral sentado.", "dumbbell", "fuerza", 10, "Curl femoral sentado", 80, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_90", "Curl femoral sentado · 90 kg", "Levantaste 90 kg en curl femoral sentado.", "dumbbell", "fuerza", 11, "Curl femoral sentado", 90, "exercise_max_weight"],
  ["pr_curl_femoral_sentado_100", "Curl femoral sentado · 100 kg", "Levantaste 100 kg en curl femoral sentado.", "dumbbell", "fuerza", 12, "Curl femoral sentado", 100, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_10", "Elevación de talones de pie · 10 kg", "Levantaste 10 kg en elevación de talones de pie.", "dumbbell", "fuerza", 1, "Elevación de talones de pie", 10, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_15", "Elevación de talones de pie · 15 kg", "Levantaste 15 kg en elevación de talones de pie.", "dumbbell", "fuerza", 2, "Elevación de talones de pie", 15, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_20", "Elevación de talones de pie · 20 kg", "Levantaste 20 kg en elevación de talones de pie.", "dumbbell", "fuerza", 3, "Elevación de talones de pie", 20, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_25", "Elevación de talones de pie · 25 kg", "Levantaste 25 kg en elevación de talones de pie.", "dumbbell", "fuerza", 4, "Elevación de talones de pie", 25, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_30", "Elevación de talones de pie · 30 kg", "Levantaste 30 kg en elevación de talones de pie.", "dumbbell", "fuerza", 5, "Elevación de talones de pie", 30, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_40", "Elevación de talones de pie · 40 kg", "Levantaste 40 kg en elevación de talones de pie.", "dumbbell", "fuerza", 6, "Elevación de talones de pie", 40, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_50", "Elevación de talones de pie · 50 kg", "Levantaste 50 kg en elevación de talones de pie.", "dumbbell", "fuerza", 7, "Elevación de talones de pie", 50, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_60", "Elevación de talones de pie · 60 kg", "Levantaste 60 kg en elevación de talones de pie.", "dumbbell", "fuerza", 8, "Elevación de talones de pie", 60, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_70", "Elevación de talones de pie · 70 kg", "Levantaste 70 kg en elevación de talones de pie.", "dumbbell", "fuerza", 9, "Elevación de talones de pie", 70, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_80", "Elevación de talones de pie · 80 kg", "Levantaste 80 kg en elevación de talones de pie.", "dumbbell", "fuerza", 10, "Elevación de talones de pie", 80, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_90", "Elevación de talones de pie · 90 kg", "Levantaste 90 kg en elevación de talones de pie.", "dumbbell", "fuerza", 11, "Elevación de talones de pie", 90, "exercise_max_weight"],
  ["pr_elevacion_de_talones_de_pie_100", "Elevación de talones de pie · 100 kg", "Levantaste 100 kg en elevación de talones de pie.", "dumbbell", "fuerza", 12, "Elevación de talones de pie", 100, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_10", "Elevación de talones sentado · 10 kg", "Levantaste 10 kg en elevación de talones sentado.", "dumbbell", "fuerza", 1, "Elevación de talones sentado", 10, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_15", "Elevación de talones sentado · 15 kg", "Levantaste 15 kg en elevación de talones sentado.", "dumbbell", "fuerza", 2, "Elevación de talones sentado", 15, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_20", "Elevación de talones sentado · 20 kg", "Levantaste 20 kg en elevación de talones sentado.", "dumbbell", "fuerza", 3, "Elevación de talones sentado", 20, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_25", "Elevación de talones sentado · 25 kg", "Levantaste 25 kg en elevación de talones sentado.", "dumbbell", "fuerza", 4, "Elevación de talones sentado", 25, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_30", "Elevación de talones sentado · 30 kg", "Levantaste 30 kg en elevación de talones sentado.", "dumbbell", "fuerza", 5, "Elevación de talones sentado", 30, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_40", "Elevación de talones sentado · 40 kg", "Levantaste 40 kg en elevación de talones sentado.", "dumbbell", "fuerza", 6, "Elevación de talones sentado", 40, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_50", "Elevación de talones sentado · 50 kg", "Levantaste 50 kg en elevación de talones sentado.", "dumbbell", "fuerza", 7, "Elevación de talones sentado", 50, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_60", "Elevación de talones sentado · 60 kg", "Levantaste 60 kg en elevación de talones sentado.", "dumbbell", "fuerza", 8, "Elevación de talones sentado", 60, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_70", "Elevación de talones sentado · 70 kg", "Levantaste 70 kg en elevación de talones sentado.", "dumbbell", "fuerza", 9, "Elevación de talones sentado", 70, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_80", "Elevación de talones sentado · 80 kg", "Levantaste 80 kg en elevación de talones sentado.", "dumbbell", "fuerza", 10, "Elevación de talones sentado", 80, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_90", "Elevación de talones sentado · 90 kg", "Levantaste 90 kg en elevación de talones sentado.", "dumbbell", "fuerza", 11, "Elevación de talones sentado", 90, "exercise_max_weight"],
  ["pr_elevacion_de_talones_sentado_100", "Elevación de talones sentado · 100 kg", "Levantaste 100 kg en elevación de talones sentado.", "dumbbell", "fuerza", 12, "Elevación de talones sentado", 100, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_10", "Abducción de cadera · 10 kg", "Levantaste 10 kg en abducción de cadera.", "dumbbell", "fuerza", 1, "Abducción de cadera", 10, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_15", "Abducción de cadera · 15 kg", "Levantaste 15 kg en abducción de cadera.", "dumbbell", "fuerza", 2, "Abducción de cadera", 15, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_20", "Abducción de cadera · 20 kg", "Levantaste 20 kg en abducción de cadera.", "dumbbell", "fuerza", 3, "Abducción de cadera", 20, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_25", "Abducción de cadera · 25 kg", "Levantaste 25 kg en abducción de cadera.", "dumbbell", "fuerza", 4, "Abducción de cadera", 25, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_30", "Abducción de cadera · 30 kg", "Levantaste 30 kg en abducción de cadera.", "dumbbell", "fuerza", 5, "Abducción de cadera", 30, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_40", "Abducción de cadera · 40 kg", "Levantaste 40 kg en abducción de cadera.", "dumbbell", "fuerza", 6, "Abducción de cadera", 40, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_50", "Abducción de cadera · 50 kg", "Levantaste 50 kg en abducción de cadera.", "dumbbell", "fuerza", 7, "Abducción de cadera", 50, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_60", "Abducción de cadera · 60 kg", "Levantaste 60 kg en abducción de cadera.", "dumbbell", "fuerza", 8, "Abducción de cadera", 60, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_70", "Abducción de cadera · 70 kg", "Levantaste 70 kg en abducción de cadera.", "dumbbell", "fuerza", 9, "Abducción de cadera", 70, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_80", "Abducción de cadera · 80 kg", "Levantaste 80 kg en abducción de cadera.", "dumbbell", "fuerza", 10, "Abducción de cadera", 80, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_90", "Abducción de cadera · 90 kg", "Levantaste 90 kg en abducción de cadera.", "dumbbell", "fuerza", 11, "Abducción de cadera", 90, "exercise_max_weight"],
  ["pr_abduccion_de_cadera_100", "Abducción de cadera · 100 kg", "Levantaste 100 kg en abducción de cadera.", "dumbbell", "fuerza", 12, "Abducción de cadera", 100, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_10", "Aducción de cadera · 10 kg", "Levantaste 10 kg en aducción de cadera.", "dumbbell", "fuerza", 1, "Aducción de cadera", 10, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_15", "Aducción de cadera · 15 kg", "Levantaste 15 kg en aducción de cadera.", "dumbbell", "fuerza", 2, "Aducción de cadera", 15, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_20", "Aducción de cadera · 20 kg", "Levantaste 20 kg en aducción de cadera.", "dumbbell", "fuerza", 3, "Aducción de cadera", 20, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_25", "Aducción de cadera · 25 kg", "Levantaste 25 kg en aducción de cadera.", "dumbbell", "fuerza", 4, "Aducción de cadera", 25, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_30", "Aducción de cadera · 30 kg", "Levantaste 30 kg en aducción de cadera.", "dumbbell", "fuerza", 5, "Aducción de cadera", 30, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_40", "Aducción de cadera · 40 kg", "Levantaste 40 kg en aducción de cadera.", "dumbbell", "fuerza", 6, "Aducción de cadera", 40, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_50", "Aducción de cadera · 50 kg", "Levantaste 50 kg en aducción de cadera.", "dumbbell", "fuerza", 7, "Aducción de cadera", 50, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_60", "Aducción de cadera · 60 kg", "Levantaste 60 kg en aducción de cadera.", "dumbbell", "fuerza", 8, "Aducción de cadera", 60, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_70", "Aducción de cadera · 70 kg", "Levantaste 70 kg en aducción de cadera.", "dumbbell", "fuerza", 9, "Aducción de cadera", 70, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_80", "Aducción de cadera · 80 kg", "Levantaste 80 kg en aducción de cadera.", "dumbbell", "fuerza", 10, "Aducción de cadera", 80, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_90", "Aducción de cadera · 90 kg", "Levantaste 90 kg en aducción de cadera.", "dumbbell", "fuerza", 11, "Aducción de cadera", 90, "exercise_max_weight"],
  ["pr_aduccion_de_cadera_100", "Aducción de cadera · 100 kg", "Levantaste 100 kg en aducción de cadera.", "dumbbell", "fuerza", 12, "Aducción de cadera", 100, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_20", "Press de banca con barra · 20 kg", "Levantaste 20 kg en press de banca con barra.", "dumbbell", "fuerza", 1, "Press de banca con barra", 20, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_30", "Press de banca con barra · 30 kg", "Levantaste 30 kg en press de banca con barra.", "dumbbell", "fuerza", 2, "Press de banca con barra", 30, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_40", "Press de banca con barra · 40 kg", "Levantaste 40 kg en press de banca con barra.", "dumbbell", "fuerza", 3, "Press de banca con barra", 40, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_50", "Press de banca con barra · 50 kg", "Levantaste 50 kg en press de banca con barra.", "dumbbell", "fuerza", 4, "Press de banca con barra", 50, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_60", "Press de banca con barra · 60 kg", "Levantaste 60 kg en press de banca con barra.", "dumbbell", "fuerza", 5, "Press de banca con barra", 60, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_80", "Press de banca con barra · 80 kg", "Levantaste 80 kg en press de banca con barra.", "dumbbell", "fuerza", 6, "Press de banca con barra", 80, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_100", "Press de banca con barra · 100 kg", "Levantaste 100 kg en press de banca con barra.", "dumbbell", "fuerza", 7, "Press de banca con barra", 100, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_120", "Press de banca con barra · 120 kg", "Levantaste 120 kg en press de banca con barra.", "dumbbell", "fuerza", 8, "Press de banca con barra", 120, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_140", "Press de banca con barra · 140 kg", "Levantaste 140 kg en press de banca con barra.", "dumbbell", "fuerza", 9, "Press de banca con barra", 140, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_160", "Press de banca con barra · 160 kg", "Levantaste 160 kg en press de banca con barra.", "dumbbell", "fuerza", 10, "Press de banca con barra", 160, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_180", "Press de banca con barra · 180 kg", "Levantaste 180 kg en press de banca con barra.", "dumbbell", "fuerza", 11, "Press de banca con barra", 180, "exercise_max_weight"],
  ["pr_press_de_banca_con_barra_200", "Press de banca con barra · 200 kg", "Levantaste 200 kg en press de banca con barra.", "dumbbell", "fuerza", 12, "Press de banca con barra", 200, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_20", "Press inclinado con barra · 20 kg", "Levantaste 20 kg en press inclinado con barra.", "dumbbell", "fuerza", 1, "Press inclinado con barra", 20, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_30", "Press inclinado con barra · 30 kg", "Levantaste 30 kg en press inclinado con barra.", "dumbbell", "fuerza", 2, "Press inclinado con barra", 30, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_40", "Press inclinado con barra · 40 kg", "Levantaste 40 kg en press inclinado con barra.", "dumbbell", "fuerza", 3, "Press inclinado con barra", 40, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_50", "Press inclinado con barra · 50 kg", "Levantaste 50 kg en press inclinado con barra.", "dumbbell", "fuerza", 4, "Press inclinado con barra", 50, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_60", "Press inclinado con barra · 60 kg", "Levantaste 60 kg en press inclinado con barra.", "dumbbell", "fuerza", 5, "Press inclinado con barra", 60, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_80", "Press inclinado con barra · 80 kg", "Levantaste 80 kg en press inclinado con barra.", "dumbbell", "fuerza", 6, "Press inclinado con barra", 80, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_100", "Press inclinado con barra · 100 kg", "Levantaste 100 kg en press inclinado con barra.", "dumbbell", "fuerza", 7, "Press inclinado con barra", 100, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_120", "Press inclinado con barra · 120 kg", "Levantaste 120 kg en press inclinado con barra.", "dumbbell", "fuerza", 8, "Press inclinado con barra", 120, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_140", "Press inclinado con barra · 140 kg", "Levantaste 140 kg en press inclinado con barra.", "dumbbell", "fuerza", 9, "Press inclinado con barra", 140, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_160", "Press inclinado con barra · 160 kg", "Levantaste 160 kg en press inclinado con barra.", "dumbbell", "fuerza", 10, "Press inclinado con barra", 160, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_180", "Press inclinado con barra · 180 kg", "Levantaste 180 kg en press inclinado con barra.", "dumbbell", "fuerza", 11, "Press inclinado con barra", 180, "exercise_max_weight"],
  ["pr_press_inclinado_con_barra_200", "Press inclinado con barra · 200 kg", "Levantaste 200 kg en press inclinado con barra.", "dumbbell", "fuerza", 12, "Press inclinado con barra", 200, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_5", "Press de banca con mancuernas · 5 kg", "Levantaste 5 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 1, "Press de banca con mancuernas", 5, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_7", "Press de banca con mancuernas · 7 kg", "Levantaste 7 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 2, "Press de banca con mancuernas", 7, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_10", "Press de banca con mancuernas · 10 kg", "Levantaste 10 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 3, "Press de banca con mancuernas", 10, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_12", "Press de banca con mancuernas · 12 kg", "Levantaste 12 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 4, "Press de banca con mancuernas", 12, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_15", "Press de banca con mancuernas · 15 kg", "Levantaste 15 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 5, "Press de banca con mancuernas", 15, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_20", "Press de banca con mancuernas · 20 kg", "Levantaste 20 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 6, "Press de banca con mancuernas", 20, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_25", "Press de banca con mancuernas · 25 kg", "Levantaste 25 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 7, "Press de banca con mancuernas", 25, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_30", "Press de banca con mancuernas · 30 kg", "Levantaste 30 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 8, "Press de banca con mancuernas", 30, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_35", "Press de banca con mancuernas · 35 kg", "Levantaste 35 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 9, "Press de banca con mancuernas", 35, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_40", "Press de banca con mancuernas · 40 kg", "Levantaste 40 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 10, "Press de banca con mancuernas", 40, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_45", "Press de banca con mancuernas · 45 kg", "Levantaste 45 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 11, "Press de banca con mancuernas", 45, "exercise_max_weight"],
  ["pr_press_de_banca_con_mancuernas_50", "Press de banca con mancuernas · 50 kg", "Levantaste 50 kg en press de banca con mancuernas.", "dumbbell", "fuerza", 12, "Press de banca con mancuernas", 50, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_5", "Press inclinado con mancuernas · 5 kg", "Levantaste 5 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 1, "Press inclinado con mancuernas", 5, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_7", "Press inclinado con mancuernas · 7 kg", "Levantaste 7 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 2, "Press inclinado con mancuernas", 7, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_10", "Press inclinado con mancuernas · 10 kg", "Levantaste 10 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 3, "Press inclinado con mancuernas", 10, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_12", "Press inclinado con mancuernas · 12 kg", "Levantaste 12 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 4, "Press inclinado con mancuernas", 12, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_15", "Press inclinado con mancuernas · 15 kg", "Levantaste 15 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 5, "Press inclinado con mancuernas", 15, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_20", "Press inclinado con mancuernas · 20 kg", "Levantaste 20 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 6, "Press inclinado con mancuernas", 20, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_25", "Press inclinado con mancuernas · 25 kg", "Levantaste 25 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 7, "Press inclinado con mancuernas", 25, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_30", "Press inclinado con mancuernas · 30 kg", "Levantaste 30 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 8, "Press inclinado con mancuernas", 30, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_35", "Press inclinado con mancuernas · 35 kg", "Levantaste 35 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 9, "Press inclinado con mancuernas", 35, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_40", "Press inclinado con mancuernas · 40 kg", "Levantaste 40 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 10, "Press inclinado con mancuernas", 40, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_45", "Press inclinado con mancuernas · 45 kg", "Levantaste 45 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 11, "Press inclinado con mancuernas", 45, "exercise_max_weight"],
  ["pr_press_inclinado_con_mancuernas_50", "Press inclinado con mancuernas · 50 kg", "Levantaste 50 kg en press inclinado con mancuernas.", "dumbbell", "fuerza", 12, "Press inclinado con mancuernas", 50, "exercise_max_weight"],
  ["pr_press_en_maquina_10", "Press en máquina · 10 kg", "Levantaste 10 kg en press en máquina.", "dumbbell", "fuerza", 1, "Press en máquina", 10, "exercise_max_weight"],
  ["pr_press_en_maquina_15", "Press en máquina · 15 kg", "Levantaste 15 kg en press en máquina.", "dumbbell", "fuerza", 2, "Press en máquina", 15, "exercise_max_weight"],
  ["pr_press_en_maquina_20", "Press en máquina · 20 kg", "Levantaste 20 kg en press en máquina.", "dumbbell", "fuerza", 3, "Press en máquina", 20, "exercise_max_weight"],
  ["pr_press_en_maquina_25", "Press en máquina · 25 kg", "Levantaste 25 kg en press en máquina.", "dumbbell", "fuerza", 4, "Press en máquina", 25, "exercise_max_weight"],
  ["pr_press_en_maquina_30", "Press en máquina · 30 kg", "Levantaste 30 kg en press en máquina.", "dumbbell", "fuerza", 5, "Press en máquina", 30, "exercise_max_weight"],
  ["pr_press_en_maquina_40", "Press en máquina · 40 kg", "Levantaste 40 kg en press en máquina.", "dumbbell", "fuerza", 6, "Press en máquina", 40, "exercise_max_weight"],
  ["pr_press_en_maquina_50", "Press en máquina · 50 kg", "Levantaste 50 kg en press en máquina.", "dumbbell", "fuerza", 7, "Press en máquina", 50, "exercise_max_weight"],
  ["pr_press_en_maquina_60", "Press en máquina · 60 kg", "Levantaste 60 kg en press en máquina.", "dumbbell", "fuerza", 8, "Press en máquina", 60, "exercise_max_weight"],
  ["pr_press_en_maquina_70", "Press en máquina · 70 kg", "Levantaste 70 kg en press en máquina.", "dumbbell", "fuerza", 9, "Press en máquina", 70, "exercise_max_weight"],
  ["pr_press_en_maquina_80", "Press en máquina · 80 kg", "Levantaste 80 kg en press en máquina.", "dumbbell", "fuerza", 10, "Press en máquina", 80, "exercise_max_weight"],
  ["pr_press_en_maquina_90", "Press en máquina · 90 kg", "Levantaste 90 kg en press en máquina.", "dumbbell", "fuerza", 11, "Press en máquina", 90, "exercise_max_weight"],
  ["pr_press_en_maquina_100", "Press en máquina · 100 kg", "Levantaste 100 kg en press en máquina.", "dumbbell", "fuerza", 12, "Press en máquina", 100, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_10", "Fondos en paralelas · 10 kg", "Levantaste 10 kg en fondos en paralelas.", "dumbbell", "fuerza", 1, "Fondos en paralelas", 10, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_15", "Fondos en paralelas · 15 kg", "Levantaste 15 kg en fondos en paralelas.", "dumbbell", "fuerza", 2, "Fondos en paralelas", 15, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_20", "Fondos en paralelas · 20 kg", "Levantaste 20 kg en fondos en paralelas.", "dumbbell", "fuerza", 3, "Fondos en paralelas", 20, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_25", "Fondos en paralelas · 25 kg", "Levantaste 25 kg en fondos en paralelas.", "dumbbell", "fuerza", 4, "Fondos en paralelas", 25, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_30", "Fondos en paralelas · 30 kg", "Levantaste 30 kg en fondos en paralelas.", "dumbbell", "fuerza", 5, "Fondos en paralelas", 30, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_40", "Fondos en paralelas · 40 kg", "Levantaste 40 kg en fondos en paralelas.", "dumbbell", "fuerza", 6, "Fondos en paralelas", 40, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_50", "Fondos en paralelas · 50 kg", "Levantaste 50 kg en fondos en paralelas.", "dumbbell", "fuerza", 7, "Fondos en paralelas", 50, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_60", "Fondos en paralelas · 60 kg", "Levantaste 60 kg en fondos en paralelas.", "dumbbell", "fuerza", 8, "Fondos en paralelas", 60, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_70", "Fondos en paralelas · 70 kg", "Levantaste 70 kg en fondos en paralelas.", "dumbbell", "fuerza", 9, "Fondos en paralelas", 70, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_80", "Fondos en paralelas · 80 kg", "Levantaste 80 kg en fondos en paralelas.", "dumbbell", "fuerza", 10, "Fondos en paralelas", 80, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_90", "Fondos en paralelas · 90 kg", "Levantaste 90 kg en fondos en paralelas.", "dumbbell", "fuerza", 11, "Fondos en paralelas", 90, "exercise_max_weight"],
  ["pr_fondos_en_paralelas_100", "Fondos en paralelas · 100 kg", "Levantaste 100 kg en fondos en paralelas.", "dumbbell", "fuerza", 12, "Fondos en paralelas", 100, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_5", "Aperturas con mancuernas · 5 kg", "Levantaste 5 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 1, "Aperturas con mancuernas", 5, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_7", "Aperturas con mancuernas · 7 kg", "Levantaste 7 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 2, "Aperturas con mancuernas", 7, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_10", "Aperturas con mancuernas · 10 kg", "Levantaste 10 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 3, "Aperturas con mancuernas", 10, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_12", "Aperturas con mancuernas · 12 kg", "Levantaste 12 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 4, "Aperturas con mancuernas", 12, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_15", "Aperturas con mancuernas · 15 kg", "Levantaste 15 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 5, "Aperturas con mancuernas", 15, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_20", "Aperturas con mancuernas · 20 kg", "Levantaste 20 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 6, "Aperturas con mancuernas", 20, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_25", "Aperturas con mancuernas · 25 kg", "Levantaste 25 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 7, "Aperturas con mancuernas", 25, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_30", "Aperturas con mancuernas · 30 kg", "Levantaste 30 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 8, "Aperturas con mancuernas", 30, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_35", "Aperturas con mancuernas · 35 kg", "Levantaste 35 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 9, "Aperturas con mancuernas", 35, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_40", "Aperturas con mancuernas · 40 kg", "Levantaste 40 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 10, "Aperturas con mancuernas", 40, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_45", "Aperturas con mancuernas · 45 kg", "Levantaste 45 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 11, "Aperturas con mancuernas", 45, "exercise_max_weight"],
  ["pr_aperturas_con_mancuernas_50", "Aperturas con mancuernas · 50 kg", "Levantaste 50 kg en aperturas con mancuernas.", "dumbbell", "fuerza", 12, "Aperturas con mancuernas", 50, "exercise_max_weight"],
  ["pr_cruce_de_poleas_10", "Cruce de poleas · 10 kg", "Levantaste 10 kg en cruce de poleas.", "dumbbell", "fuerza", 1, "Cruce de poleas", 10, "exercise_max_weight"],
  ["pr_cruce_de_poleas_15", "Cruce de poleas · 15 kg", "Levantaste 15 kg en cruce de poleas.", "dumbbell", "fuerza", 2, "Cruce de poleas", 15, "exercise_max_weight"],
  ["pr_cruce_de_poleas_20", "Cruce de poleas · 20 kg", "Levantaste 20 kg en cruce de poleas.", "dumbbell", "fuerza", 3, "Cruce de poleas", 20, "exercise_max_weight"],
  ["pr_cruce_de_poleas_25", "Cruce de poleas · 25 kg", "Levantaste 25 kg en cruce de poleas.", "dumbbell", "fuerza", 4, "Cruce de poleas", 25, "exercise_max_weight"],
  ["pr_cruce_de_poleas_30", "Cruce de poleas · 30 kg", "Levantaste 30 kg en cruce de poleas.", "dumbbell", "fuerza", 5, "Cruce de poleas", 30, "exercise_max_weight"],
  ["pr_cruce_de_poleas_40", "Cruce de poleas · 40 kg", "Levantaste 40 kg en cruce de poleas.", "dumbbell", "fuerza", 6, "Cruce de poleas", 40, "exercise_max_weight"],
  ["pr_cruce_de_poleas_50", "Cruce de poleas · 50 kg", "Levantaste 50 kg en cruce de poleas.", "dumbbell", "fuerza", 7, "Cruce de poleas", 50, "exercise_max_weight"],
  ["pr_cruce_de_poleas_60", "Cruce de poleas · 60 kg", "Levantaste 60 kg en cruce de poleas.", "dumbbell", "fuerza", 8, "Cruce de poleas", 60, "exercise_max_weight"],
  ["pr_cruce_de_poleas_70", "Cruce de poleas · 70 kg", "Levantaste 70 kg en cruce de poleas.", "dumbbell", "fuerza", 9, "Cruce de poleas", 70, "exercise_max_weight"],
  ["pr_cruce_de_poleas_80", "Cruce de poleas · 80 kg", "Levantaste 80 kg en cruce de poleas.", "dumbbell", "fuerza", 10, "Cruce de poleas", 80, "exercise_max_weight"],
  ["pr_cruce_de_poleas_90", "Cruce de poleas · 90 kg", "Levantaste 90 kg en cruce de poleas.", "dumbbell", "fuerza", 11, "Cruce de poleas", 90, "exercise_max_weight"],
  ["pr_cruce_de_poleas_100", "Cruce de poleas · 100 kg", "Levantaste 100 kg en cruce de poleas.", "dumbbell", "fuerza", 12, "Cruce de poleas", 100, "exercise_max_weight"],
  ["sessions_flexiones_5", "Flexiones · 5 veces", "Hiciste flexiones en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Flexiones", 5, "exercise_sessions"],
  ["sessions_flexiones_10", "Flexiones · 10 veces", "Hiciste flexiones en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Flexiones", 10, "exercise_sessions"],
  ["sessions_flexiones_25", "Flexiones · 25 veces", "Hiciste flexiones en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Flexiones", 25, "exercise_sessions"],
  ["sessions_flexiones_50", "Flexiones · 50 veces", "Hiciste flexiones en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Flexiones", 50, "exercise_sessions"],
  ["sessions_flexiones_100", "Flexiones · 100 veces", "Hiciste flexiones en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Flexiones", 100, "exercise_sessions"],
  ["pr_press_militar_con_barra_20", "Press militar con barra · 20 kg", "Levantaste 20 kg en press militar con barra.", "dumbbell", "fuerza", 1, "Press militar con barra", 20, "exercise_max_weight"],
  ["pr_press_militar_con_barra_30", "Press militar con barra · 30 kg", "Levantaste 30 kg en press militar con barra.", "dumbbell", "fuerza", 2, "Press militar con barra", 30, "exercise_max_weight"],
  ["pr_press_militar_con_barra_40", "Press militar con barra · 40 kg", "Levantaste 40 kg en press militar con barra.", "dumbbell", "fuerza", 3, "Press militar con barra", 40, "exercise_max_weight"],
  ["pr_press_militar_con_barra_50", "Press militar con barra · 50 kg", "Levantaste 50 kg en press militar con barra.", "dumbbell", "fuerza", 4, "Press militar con barra", 50, "exercise_max_weight"],
  ["pr_press_militar_con_barra_60", "Press militar con barra · 60 kg", "Levantaste 60 kg en press militar con barra.", "dumbbell", "fuerza", 5, "Press militar con barra", 60, "exercise_max_weight"],
  ["pr_press_militar_con_barra_80", "Press militar con barra · 80 kg", "Levantaste 80 kg en press militar con barra.", "dumbbell", "fuerza", 6, "Press militar con barra", 80, "exercise_max_weight"],
  ["pr_press_militar_con_barra_100", "Press militar con barra · 100 kg", "Levantaste 100 kg en press militar con barra.", "dumbbell", "fuerza", 7, "Press militar con barra", 100, "exercise_max_weight"],
  ["pr_press_militar_con_barra_120", "Press militar con barra · 120 kg", "Levantaste 120 kg en press militar con barra.", "dumbbell", "fuerza", 8, "Press militar con barra", 120, "exercise_max_weight"],
  ["pr_press_militar_con_barra_140", "Press militar con barra · 140 kg", "Levantaste 140 kg en press militar con barra.", "dumbbell", "fuerza", 9, "Press militar con barra", 140, "exercise_max_weight"],
  ["pr_press_militar_con_barra_160", "Press militar con barra · 160 kg", "Levantaste 160 kg en press militar con barra.", "dumbbell", "fuerza", 10, "Press militar con barra", 160, "exercise_max_weight"],
  ["pr_press_militar_con_barra_180", "Press militar con barra · 180 kg", "Levantaste 180 kg en press militar con barra.", "dumbbell", "fuerza", 11, "Press militar con barra", 180, "exercise_max_weight"],
  ["pr_press_militar_con_barra_200", "Press militar con barra · 200 kg", "Levantaste 200 kg en press militar con barra.", "dumbbell", "fuerza", 12, "Press militar con barra", 200, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_5", "Press de hombros con mancuernas · 5 kg", "Levantaste 5 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 1, "Press de hombros con mancuernas", 5, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_7", "Press de hombros con mancuernas · 7 kg", "Levantaste 7 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 2, "Press de hombros con mancuernas", 7, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_10", "Press de hombros con mancuernas · 10 kg", "Levantaste 10 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 3, "Press de hombros con mancuernas", 10, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_12", "Press de hombros con mancuernas · 12 kg", "Levantaste 12 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 4, "Press de hombros con mancuernas", 12, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_15", "Press de hombros con mancuernas · 15 kg", "Levantaste 15 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 5, "Press de hombros con mancuernas", 15, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_20", "Press de hombros con mancuernas · 20 kg", "Levantaste 20 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 6, "Press de hombros con mancuernas", 20, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_25", "Press de hombros con mancuernas · 25 kg", "Levantaste 25 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 7, "Press de hombros con mancuernas", 25, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_30", "Press de hombros con mancuernas · 30 kg", "Levantaste 30 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 8, "Press de hombros con mancuernas", 30, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_35", "Press de hombros con mancuernas · 35 kg", "Levantaste 35 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 9, "Press de hombros con mancuernas", 35, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_40", "Press de hombros con mancuernas · 40 kg", "Levantaste 40 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 10, "Press de hombros con mancuernas", 40, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_45", "Press de hombros con mancuernas · 45 kg", "Levantaste 45 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 11, "Press de hombros con mancuernas", 45, "exercise_max_weight"],
  ["pr_press_de_hombros_con_mancuernas_50", "Press de hombros con mancuernas · 50 kg", "Levantaste 50 kg en press de hombros con mancuernas.", "dumbbell", "fuerza", 12, "Press de hombros con mancuernas", 50, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_10", "Press de hombros en máquina · 10 kg", "Levantaste 10 kg en press de hombros en máquina.", "dumbbell", "fuerza", 1, "Press de hombros en máquina", 10, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_15", "Press de hombros en máquina · 15 kg", "Levantaste 15 kg en press de hombros en máquina.", "dumbbell", "fuerza", 2, "Press de hombros en máquina", 15, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_20", "Press de hombros en máquina · 20 kg", "Levantaste 20 kg en press de hombros en máquina.", "dumbbell", "fuerza", 3, "Press de hombros en máquina", 20, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_25", "Press de hombros en máquina · 25 kg", "Levantaste 25 kg en press de hombros en máquina.", "dumbbell", "fuerza", 4, "Press de hombros en máquina", 25, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_30", "Press de hombros en máquina · 30 kg", "Levantaste 30 kg en press de hombros en máquina.", "dumbbell", "fuerza", 5, "Press de hombros en máquina", 30, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_40", "Press de hombros en máquina · 40 kg", "Levantaste 40 kg en press de hombros en máquina.", "dumbbell", "fuerza", 6, "Press de hombros en máquina", 40, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_50", "Press de hombros en máquina · 50 kg", "Levantaste 50 kg en press de hombros en máquina.", "dumbbell", "fuerza", 7, "Press de hombros en máquina", 50, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_60", "Press de hombros en máquina · 60 kg", "Levantaste 60 kg en press de hombros en máquina.", "dumbbell", "fuerza", 8, "Press de hombros en máquina", 60, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_70", "Press de hombros en máquina · 70 kg", "Levantaste 70 kg en press de hombros en máquina.", "dumbbell", "fuerza", 9, "Press de hombros en máquina", 70, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_80", "Press de hombros en máquina · 80 kg", "Levantaste 80 kg en press de hombros en máquina.", "dumbbell", "fuerza", 10, "Press de hombros en máquina", 80, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_90", "Press de hombros en máquina · 90 kg", "Levantaste 90 kg en press de hombros en máquina.", "dumbbell", "fuerza", 11, "Press de hombros en máquina", 90, "exercise_max_weight"],
  ["pr_press_de_hombros_en_maquina_100", "Press de hombros en máquina · 100 kg", "Levantaste 100 kg en press de hombros en máquina.", "dumbbell", "fuerza", 12, "Press de hombros en máquina", 100, "exercise_max_weight"],
  ["pr_elevaciones_laterales_5", "Elevaciones laterales · 5 kg", "Levantaste 5 kg en elevaciones laterales.", "dumbbell", "fuerza", 1, "Elevaciones laterales", 5, "exercise_max_weight"],
  ["pr_elevaciones_laterales_7", "Elevaciones laterales · 7 kg", "Levantaste 7 kg en elevaciones laterales.", "dumbbell", "fuerza", 2, "Elevaciones laterales", 7, "exercise_max_weight"],
  ["pr_elevaciones_laterales_10", "Elevaciones laterales · 10 kg", "Levantaste 10 kg en elevaciones laterales.", "dumbbell", "fuerza", 3, "Elevaciones laterales", 10, "exercise_max_weight"],
  ["pr_elevaciones_laterales_12", "Elevaciones laterales · 12 kg", "Levantaste 12 kg en elevaciones laterales.", "dumbbell", "fuerza", 4, "Elevaciones laterales", 12, "exercise_max_weight"],
  ["pr_elevaciones_laterales_15", "Elevaciones laterales · 15 kg", "Levantaste 15 kg en elevaciones laterales.", "dumbbell", "fuerza", 5, "Elevaciones laterales", 15, "exercise_max_weight"],
  ["pr_elevaciones_laterales_20", "Elevaciones laterales · 20 kg", "Levantaste 20 kg en elevaciones laterales.", "dumbbell", "fuerza", 6, "Elevaciones laterales", 20, "exercise_max_weight"],
  ["pr_elevaciones_laterales_25", "Elevaciones laterales · 25 kg", "Levantaste 25 kg en elevaciones laterales.", "dumbbell", "fuerza", 7, "Elevaciones laterales", 25, "exercise_max_weight"],
  ["pr_elevaciones_laterales_30", "Elevaciones laterales · 30 kg", "Levantaste 30 kg en elevaciones laterales.", "dumbbell", "fuerza", 8, "Elevaciones laterales", 30, "exercise_max_weight"],
  ["pr_elevaciones_laterales_35", "Elevaciones laterales · 35 kg", "Levantaste 35 kg en elevaciones laterales.", "dumbbell", "fuerza", 9, "Elevaciones laterales", 35, "exercise_max_weight"],
  ["pr_elevaciones_laterales_40", "Elevaciones laterales · 40 kg", "Levantaste 40 kg en elevaciones laterales.", "dumbbell", "fuerza", 10, "Elevaciones laterales", 40, "exercise_max_weight"],
  ["pr_elevaciones_laterales_45", "Elevaciones laterales · 45 kg", "Levantaste 45 kg en elevaciones laterales.", "dumbbell", "fuerza", 11, "Elevaciones laterales", 45, "exercise_max_weight"],
  ["pr_elevaciones_laterales_50", "Elevaciones laterales · 50 kg", "Levantaste 50 kg en elevaciones laterales.", "dumbbell", "fuerza", 12, "Elevaciones laterales", 50, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_10", "Elevaciones laterales en polea · 10 kg", "Levantaste 10 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 1, "Elevaciones laterales en polea", 10, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_15", "Elevaciones laterales en polea · 15 kg", "Levantaste 15 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 2, "Elevaciones laterales en polea", 15, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_20", "Elevaciones laterales en polea · 20 kg", "Levantaste 20 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 3, "Elevaciones laterales en polea", 20, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_25", "Elevaciones laterales en polea · 25 kg", "Levantaste 25 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 4, "Elevaciones laterales en polea", 25, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_30", "Elevaciones laterales en polea · 30 kg", "Levantaste 30 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 5, "Elevaciones laterales en polea", 30, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_40", "Elevaciones laterales en polea · 40 kg", "Levantaste 40 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 6, "Elevaciones laterales en polea", 40, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_50", "Elevaciones laterales en polea · 50 kg", "Levantaste 50 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 7, "Elevaciones laterales en polea", 50, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_60", "Elevaciones laterales en polea · 60 kg", "Levantaste 60 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 8, "Elevaciones laterales en polea", 60, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_70", "Elevaciones laterales en polea · 70 kg", "Levantaste 70 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 9, "Elevaciones laterales en polea", 70, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_80", "Elevaciones laterales en polea · 80 kg", "Levantaste 80 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 10, "Elevaciones laterales en polea", 80, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_90", "Elevaciones laterales en polea · 90 kg", "Levantaste 90 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 11, "Elevaciones laterales en polea", 90, "exercise_max_weight"],
  ["pr_elevaciones_laterales_en_polea_100", "Elevaciones laterales en polea · 100 kg", "Levantaste 100 kg en elevaciones laterales en polea.", "dumbbell", "fuerza", 12, "Elevaciones laterales en polea", 100, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_5", "Pájaros con mancuernas · 5 kg", "Levantaste 5 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 1, "Pájaros con mancuernas", 5, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_7", "Pájaros con mancuernas · 7 kg", "Levantaste 7 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 2, "Pájaros con mancuernas", 7, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_10", "Pájaros con mancuernas · 10 kg", "Levantaste 10 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 3, "Pájaros con mancuernas", 10, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_12", "Pájaros con mancuernas · 12 kg", "Levantaste 12 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 4, "Pájaros con mancuernas", 12, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_15", "Pájaros con mancuernas · 15 kg", "Levantaste 15 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 5, "Pájaros con mancuernas", 15, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_20", "Pájaros con mancuernas · 20 kg", "Levantaste 20 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 6, "Pájaros con mancuernas", 20, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_25", "Pájaros con mancuernas · 25 kg", "Levantaste 25 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 7, "Pájaros con mancuernas", 25, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_30", "Pájaros con mancuernas · 30 kg", "Levantaste 30 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 8, "Pájaros con mancuernas", 30, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_35", "Pájaros con mancuernas · 35 kg", "Levantaste 35 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 9, "Pájaros con mancuernas", 35, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_40", "Pájaros con mancuernas · 40 kg", "Levantaste 40 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 10, "Pájaros con mancuernas", 40, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_45", "Pájaros con mancuernas · 45 kg", "Levantaste 45 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 11, "Pájaros con mancuernas", 45, "exercise_max_weight"],
  ["pr_pajaros_con_mancuernas_50", "Pájaros con mancuernas · 50 kg", "Levantaste 50 kg en pájaros con mancuernas.", "dumbbell", "fuerza", 12, "Pájaros con mancuernas", 50, "exercise_max_weight"],
  ["pr_face_pull_10", "Face pull · 10 kg", "Levantaste 10 kg en face pull.", "dumbbell", "fuerza", 1, "Face pull", 10, "exercise_max_weight"],
  ["pr_face_pull_15", "Face pull · 15 kg", "Levantaste 15 kg en face pull.", "dumbbell", "fuerza", 2, "Face pull", 15, "exercise_max_weight"],
  ["pr_face_pull_20", "Face pull · 20 kg", "Levantaste 20 kg en face pull.", "dumbbell", "fuerza", 3, "Face pull", 20, "exercise_max_weight"],
  ["pr_face_pull_25", "Face pull · 25 kg", "Levantaste 25 kg en face pull.", "dumbbell", "fuerza", 4, "Face pull", 25, "exercise_max_weight"],
  ["pr_face_pull_30", "Face pull · 30 kg", "Levantaste 30 kg en face pull.", "dumbbell", "fuerza", 5, "Face pull", 30, "exercise_max_weight"],
  ["pr_face_pull_40", "Face pull · 40 kg", "Levantaste 40 kg en face pull.", "dumbbell", "fuerza", 6, "Face pull", 40, "exercise_max_weight"],
  ["pr_face_pull_50", "Face pull · 50 kg", "Levantaste 50 kg en face pull.", "dumbbell", "fuerza", 7, "Face pull", 50, "exercise_max_weight"],
  ["pr_face_pull_60", "Face pull · 60 kg", "Levantaste 60 kg en face pull.", "dumbbell", "fuerza", 8, "Face pull", 60, "exercise_max_weight"],
  ["pr_face_pull_70", "Face pull · 70 kg", "Levantaste 70 kg en face pull.", "dumbbell", "fuerza", 9, "Face pull", 70, "exercise_max_weight"],
  ["pr_face_pull_80", "Face pull · 80 kg", "Levantaste 80 kg en face pull.", "dumbbell", "fuerza", 10, "Face pull", 80, "exercise_max_weight"],
  ["pr_face_pull_90", "Face pull · 90 kg", "Levantaste 90 kg en face pull.", "dumbbell", "fuerza", 11, "Face pull", 90, "exercise_max_weight"],
  ["pr_face_pull_100", "Face pull · 100 kg", "Levantaste 100 kg en face pull.", "dumbbell", "fuerza", 12, "Face pull", 100, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_5", "Encogimientos con mancuernas · 5 kg", "Levantaste 5 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 1, "Encogimientos con mancuernas", 5, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_7", "Encogimientos con mancuernas · 7 kg", "Levantaste 7 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 2, "Encogimientos con mancuernas", 7, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_10", "Encogimientos con mancuernas · 10 kg", "Levantaste 10 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 3, "Encogimientos con mancuernas", 10, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_12", "Encogimientos con mancuernas · 12 kg", "Levantaste 12 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 4, "Encogimientos con mancuernas", 12, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_15", "Encogimientos con mancuernas · 15 kg", "Levantaste 15 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 5, "Encogimientos con mancuernas", 15, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_20", "Encogimientos con mancuernas · 20 kg", "Levantaste 20 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 6, "Encogimientos con mancuernas", 20, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_25", "Encogimientos con mancuernas · 25 kg", "Levantaste 25 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 7, "Encogimientos con mancuernas", 25, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_30", "Encogimientos con mancuernas · 30 kg", "Levantaste 30 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 8, "Encogimientos con mancuernas", 30, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_35", "Encogimientos con mancuernas · 35 kg", "Levantaste 35 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 9, "Encogimientos con mancuernas", 35, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_40", "Encogimientos con mancuernas · 40 kg", "Levantaste 40 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 10, "Encogimientos con mancuernas", 40, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_45", "Encogimientos con mancuernas · 45 kg", "Levantaste 45 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 11, "Encogimientos con mancuernas", 45, "exercise_max_weight"],
  ["pr_encogimientos_con_mancuernas_50", "Encogimientos con mancuernas · 50 kg", "Levantaste 50 kg en encogimientos con mancuernas.", "dumbbell", "fuerza", 12, "Encogimientos con mancuernas", 50, "exercise_max_weight"],
  ["pr_dominadas_10", "Dominadas · 10 kg", "Levantaste 10 kg en dominadas.", "dumbbell", "fuerza", 1, "Dominadas", 10, "exercise_max_weight"],
  ["pr_dominadas_15", "Dominadas · 15 kg", "Levantaste 15 kg en dominadas.", "dumbbell", "fuerza", 2, "Dominadas", 15, "exercise_max_weight"],
  ["pr_dominadas_20", "Dominadas · 20 kg", "Levantaste 20 kg en dominadas.", "dumbbell", "fuerza", 3, "Dominadas", 20, "exercise_max_weight"],
  ["pr_dominadas_25", "Dominadas · 25 kg", "Levantaste 25 kg en dominadas.", "dumbbell", "fuerza", 4, "Dominadas", 25, "exercise_max_weight"],
  ["pr_dominadas_30", "Dominadas · 30 kg", "Levantaste 30 kg en dominadas.", "dumbbell", "fuerza", 5, "Dominadas", 30, "exercise_max_weight"],
  ["pr_dominadas_40", "Dominadas · 40 kg", "Levantaste 40 kg en dominadas.", "dumbbell", "fuerza", 6, "Dominadas", 40, "exercise_max_weight"],
  ["pr_dominadas_50", "Dominadas · 50 kg", "Levantaste 50 kg en dominadas.", "dumbbell", "fuerza", 7, "Dominadas", 50, "exercise_max_weight"],
  ["pr_dominadas_60", "Dominadas · 60 kg", "Levantaste 60 kg en dominadas.", "dumbbell", "fuerza", 8, "Dominadas", 60, "exercise_max_weight"],
  ["pr_dominadas_70", "Dominadas · 70 kg", "Levantaste 70 kg en dominadas.", "dumbbell", "fuerza", 9, "Dominadas", 70, "exercise_max_weight"],
  ["pr_dominadas_80", "Dominadas · 80 kg", "Levantaste 80 kg en dominadas.", "dumbbell", "fuerza", 10, "Dominadas", 80, "exercise_max_weight"],
  ["pr_dominadas_90", "Dominadas · 90 kg", "Levantaste 90 kg en dominadas.", "dumbbell", "fuerza", 11, "Dominadas", 90, "exercise_max_weight"],
  ["pr_dominadas_100", "Dominadas · 100 kg", "Levantaste 100 kg en dominadas.", "dumbbell", "fuerza", 12, "Dominadas", 100, "exercise_max_weight"],
  ["sessions_dominadas_asistidas_5", "Dominadas asistidas · 5 veces", "Hiciste dominadas asistidas en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Dominadas asistidas", 5, "exercise_sessions"],
  ["sessions_dominadas_asistidas_10", "Dominadas asistidas · 10 veces", "Hiciste dominadas asistidas en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Dominadas asistidas", 10, "exercise_sessions"],
  ["sessions_dominadas_asistidas_25", "Dominadas asistidas · 25 veces", "Hiciste dominadas asistidas en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Dominadas asistidas", 25, "exercise_sessions"],
  ["sessions_dominadas_asistidas_50", "Dominadas asistidas · 50 veces", "Hiciste dominadas asistidas en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Dominadas asistidas", 50, "exercise_sessions"],
  ["sessions_dominadas_asistidas_100", "Dominadas asistidas · 100 veces", "Hiciste dominadas asistidas en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Dominadas asistidas", 100, "exercise_sessions"],
  ["pr_jalon_al_pecho_10", "Jalón al pecho · 10 kg", "Levantaste 10 kg en jalón al pecho.", "dumbbell", "fuerza", 1, "Jalón al pecho", 10, "exercise_max_weight"],
  ["pr_jalon_al_pecho_15", "Jalón al pecho · 15 kg", "Levantaste 15 kg en jalón al pecho.", "dumbbell", "fuerza", 2, "Jalón al pecho", 15, "exercise_max_weight"],
  ["pr_jalon_al_pecho_20", "Jalón al pecho · 20 kg", "Levantaste 20 kg en jalón al pecho.", "dumbbell", "fuerza", 3, "Jalón al pecho", 20, "exercise_max_weight"],
  ["pr_jalon_al_pecho_25", "Jalón al pecho · 25 kg", "Levantaste 25 kg en jalón al pecho.", "dumbbell", "fuerza", 4, "Jalón al pecho", 25, "exercise_max_weight"],
  ["pr_jalon_al_pecho_30", "Jalón al pecho · 30 kg", "Levantaste 30 kg en jalón al pecho.", "dumbbell", "fuerza", 5, "Jalón al pecho", 30, "exercise_max_weight"],
  ["pr_jalon_al_pecho_40", "Jalón al pecho · 40 kg", "Levantaste 40 kg en jalón al pecho.", "dumbbell", "fuerza", 6, "Jalón al pecho", 40, "exercise_max_weight"],
  ["pr_jalon_al_pecho_50", "Jalón al pecho · 50 kg", "Levantaste 50 kg en jalón al pecho.", "dumbbell", "fuerza", 7, "Jalón al pecho", 50, "exercise_max_weight"],
  ["pr_jalon_al_pecho_60", "Jalón al pecho · 60 kg", "Levantaste 60 kg en jalón al pecho.", "dumbbell", "fuerza", 8, "Jalón al pecho", 60, "exercise_max_weight"],
  ["pr_jalon_al_pecho_70", "Jalón al pecho · 70 kg", "Levantaste 70 kg en jalón al pecho.", "dumbbell", "fuerza", 9, "Jalón al pecho", 70, "exercise_max_weight"],
  ["pr_jalon_al_pecho_80", "Jalón al pecho · 80 kg", "Levantaste 80 kg en jalón al pecho.", "dumbbell", "fuerza", 10, "Jalón al pecho", 80, "exercise_max_weight"],
  ["pr_jalon_al_pecho_90", "Jalón al pecho · 90 kg", "Levantaste 90 kg en jalón al pecho.", "dumbbell", "fuerza", 11, "Jalón al pecho", 90, "exercise_max_weight"],
  ["pr_jalon_al_pecho_100", "Jalón al pecho · 100 kg", "Levantaste 100 kg en jalón al pecho.", "dumbbell", "fuerza", 12, "Jalón al pecho", 100, "exercise_max_weight"],
  ["pr_remo_con_barra_20", "Remo con barra · 20 kg", "Levantaste 20 kg en remo con barra.", "dumbbell", "fuerza", 1, "Remo con barra", 20, "exercise_max_weight"],
  ["pr_remo_con_barra_30", "Remo con barra · 30 kg", "Levantaste 30 kg en remo con barra.", "dumbbell", "fuerza", 2, "Remo con barra", 30, "exercise_max_weight"],
  ["pr_remo_con_barra_40", "Remo con barra · 40 kg", "Levantaste 40 kg en remo con barra.", "dumbbell", "fuerza", 3, "Remo con barra", 40, "exercise_max_weight"],
  ["pr_remo_con_barra_50", "Remo con barra · 50 kg", "Levantaste 50 kg en remo con barra.", "dumbbell", "fuerza", 4, "Remo con barra", 50, "exercise_max_weight"],
  ["pr_remo_con_barra_60", "Remo con barra · 60 kg", "Levantaste 60 kg en remo con barra.", "dumbbell", "fuerza", 5, "Remo con barra", 60, "exercise_max_weight"],
  ["pr_remo_con_barra_80", "Remo con barra · 80 kg", "Levantaste 80 kg en remo con barra.", "dumbbell", "fuerza", 6, "Remo con barra", 80, "exercise_max_weight"],
  ["pr_remo_con_barra_100", "Remo con barra · 100 kg", "Levantaste 100 kg en remo con barra.", "dumbbell", "fuerza", 7, "Remo con barra", 100, "exercise_max_weight"],
  ["pr_remo_con_barra_120", "Remo con barra · 120 kg", "Levantaste 120 kg en remo con barra.", "dumbbell", "fuerza", 8, "Remo con barra", 120, "exercise_max_weight"],
  ["pr_remo_con_barra_140", "Remo con barra · 140 kg", "Levantaste 140 kg en remo con barra.", "dumbbell", "fuerza", 9, "Remo con barra", 140, "exercise_max_weight"],
  ["pr_remo_con_barra_160", "Remo con barra · 160 kg", "Levantaste 160 kg en remo con barra.", "dumbbell", "fuerza", 10, "Remo con barra", 160, "exercise_max_weight"],
  ["pr_remo_con_barra_180", "Remo con barra · 180 kg", "Levantaste 180 kg en remo con barra.", "dumbbell", "fuerza", 11, "Remo con barra", 180, "exercise_max_weight"],
  ["pr_remo_con_barra_200", "Remo con barra · 200 kg", "Levantaste 200 kg en remo con barra.", "dumbbell", "fuerza", 12, "Remo con barra", 200, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_5", "Remo con mancuerna · 5 kg", "Levantaste 5 kg en remo con mancuerna.", "dumbbell", "fuerza", 1, "Remo con mancuerna", 5, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_7", "Remo con mancuerna · 7 kg", "Levantaste 7 kg en remo con mancuerna.", "dumbbell", "fuerza", 2, "Remo con mancuerna", 7, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_10", "Remo con mancuerna · 10 kg", "Levantaste 10 kg en remo con mancuerna.", "dumbbell", "fuerza", 3, "Remo con mancuerna", 10, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_12", "Remo con mancuerna · 12 kg", "Levantaste 12 kg en remo con mancuerna.", "dumbbell", "fuerza", 4, "Remo con mancuerna", 12, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_15", "Remo con mancuerna · 15 kg", "Levantaste 15 kg en remo con mancuerna.", "dumbbell", "fuerza", 5, "Remo con mancuerna", 15, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_20", "Remo con mancuerna · 20 kg", "Levantaste 20 kg en remo con mancuerna.", "dumbbell", "fuerza", 6, "Remo con mancuerna", 20, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_25", "Remo con mancuerna · 25 kg", "Levantaste 25 kg en remo con mancuerna.", "dumbbell", "fuerza", 7, "Remo con mancuerna", 25, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_30", "Remo con mancuerna · 30 kg", "Levantaste 30 kg en remo con mancuerna.", "dumbbell", "fuerza", 8, "Remo con mancuerna", 30, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_35", "Remo con mancuerna · 35 kg", "Levantaste 35 kg en remo con mancuerna.", "dumbbell", "fuerza", 9, "Remo con mancuerna", 35, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_40", "Remo con mancuerna · 40 kg", "Levantaste 40 kg en remo con mancuerna.", "dumbbell", "fuerza", 10, "Remo con mancuerna", 40, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_45", "Remo con mancuerna · 45 kg", "Levantaste 45 kg en remo con mancuerna.", "dumbbell", "fuerza", 11, "Remo con mancuerna", 45, "exercise_max_weight"],
  ["pr_remo_con_mancuerna_50", "Remo con mancuerna · 50 kg", "Levantaste 50 kg en remo con mancuerna.", "dumbbell", "fuerza", 12, "Remo con mancuerna", 50, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_10", "Remo sentado en polea · 10 kg", "Levantaste 10 kg en remo sentado en polea.", "dumbbell", "fuerza", 1, "Remo sentado en polea", 10, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_15", "Remo sentado en polea · 15 kg", "Levantaste 15 kg en remo sentado en polea.", "dumbbell", "fuerza", 2, "Remo sentado en polea", 15, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_20", "Remo sentado en polea · 20 kg", "Levantaste 20 kg en remo sentado en polea.", "dumbbell", "fuerza", 3, "Remo sentado en polea", 20, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_25", "Remo sentado en polea · 25 kg", "Levantaste 25 kg en remo sentado en polea.", "dumbbell", "fuerza", 4, "Remo sentado en polea", 25, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_30", "Remo sentado en polea · 30 kg", "Levantaste 30 kg en remo sentado en polea.", "dumbbell", "fuerza", 5, "Remo sentado en polea", 30, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_40", "Remo sentado en polea · 40 kg", "Levantaste 40 kg en remo sentado en polea.", "dumbbell", "fuerza", 6, "Remo sentado en polea", 40, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_50", "Remo sentado en polea · 50 kg", "Levantaste 50 kg en remo sentado en polea.", "dumbbell", "fuerza", 7, "Remo sentado en polea", 50, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_60", "Remo sentado en polea · 60 kg", "Levantaste 60 kg en remo sentado en polea.", "dumbbell", "fuerza", 8, "Remo sentado en polea", 60, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_70", "Remo sentado en polea · 70 kg", "Levantaste 70 kg en remo sentado en polea.", "dumbbell", "fuerza", 9, "Remo sentado en polea", 70, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_80", "Remo sentado en polea · 80 kg", "Levantaste 80 kg en remo sentado en polea.", "dumbbell", "fuerza", 10, "Remo sentado en polea", 80, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_90", "Remo sentado en polea · 90 kg", "Levantaste 90 kg en remo sentado en polea.", "dumbbell", "fuerza", 11, "Remo sentado en polea", 90, "exercise_max_weight"],
  ["pr_remo_sentado_en_polea_100", "Remo sentado en polea · 100 kg", "Levantaste 100 kg en remo sentado en polea.", "dumbbell", "fuerza", 12, "Remo sentado en polea", 100, "exercise_max_weight"],
  ["pr_remo_en_maquina_10", "Remo en máquina · 10 kg", "Levantaste 10 kg en remo en máquina.", "dumbbell", "fuerza", 1, "Remo en máquina", 10, "exercise_max_weight"],
  ["pr_remo_en_maquina_15", "Remo en máquina · 15 kg", "Levantaste 15 kg en remo en máquina.", "dumbbell", "fuerza", 2, "Remo en máquina", 15, "exercise_max_weight"],
  ["pr_remo_en_maquina_20", "Remo en máquina · 20 kg", "Levantaste 20 kg en remo en máquina.", "dumbbell", "fuerza", 3, "Remo en máquina", 20, "exercise_max_weight"],
  ["pr_remo_en_maquina_25", "Remo en máquina · 25 kg", "Levantaste 25 kg en remo en máquina.", "dumbbell", "fuerza", 4, "Remo en máquina", 25, "exercise_max_weight"],
  ["pr_remo_en_maquina_30", "Remo en máquina · 30 kg", "Levantaste 30 kg en remo en máquina.", "dumbbell", "fuerza", 5, "Remo en máquina", 30, "exercise_max_weight"],
  ["pr_remo_en_maquina_40", "Remo en máquina · 40 kg", "Levantaste 40 kg en remo en máquina.", "dumbbell", "fuerza", 6, "Remo en máquina", 40, "exercise_max_weight"],
  ["pr_remo_en_maquina_50", "Remo en máquina · 50 kg", "Levantaste 50 kg en remo en máquina.", "dumbbell", "fuerza", 7, "Remo en máquina", 50, "exercise_max_weight"],
  ["pr_remo_en_maquina_60", "Remo en máquina · 60 kg", "Levantaste 60 kg en remo en máquina.", "dumbbell", "fuerza", 8, "Remo en máquina", 60, "exercise_max_weight"],
  ["pr_remo_en_maquina_70", "Remo en máquina · 70 kg", "Levantaste 70 kg en remo en máquina.", "dumbbell", "fuerza", 9, "Remo en máquina", 70, "exercise_max_weight"],
  ["pr_remo_en_maquina_80", "Remo en máquina · 80 kg", "Levantaste 80 kg en remo en máquina.", "dumbbell", "fuerza", 10, "Remo en máquina", 80, "exercise_max_weight"],
  ["pr_remo_en_maquina_90", "Remo en máquina · 90 kg", "Levantaste 90 kg en remo en máquina.", "dumbbell", "fuerza", 11, "Remo en máquina", 90, "exercise_max_weight"],
  ["pr_remo_en_maquina_100", "Remo en máquina · 100 kg", "Levantaste 100 kg en remo en máquina.", "dumbbell", "fuerza", 12, "Remo en máquina", 100, "exercise_max_weight"],
  ["pr_pullover_en_polea_10", "Pullover en polea · 10 kg", "Levantaste 10 kg en pullover en polea.", "dumbbell", "fuerza", 1, "Pullover en polea", 10, "exercise_max_weight"],
  ["pr_pullover_en_polea_15", "Pullover en polea · 15 kg", "Levantaste 15 kg en pullover en polea.", "dumbbell", "fuerza", 2, "Pullover en polea", 15, "exercise_max_weight"],
  ["pr_pullover_en_polea_20", "Pullover en polea · 20 kg", "Levantaste 20 kg en pullover en polea.", "dumbbell", "fuerza", 3, "Pullover en polea", 20, "exercise_max_weight"],
  ["pr_pullover_en_polea_25", "Pullover en polea · 25 kg", "Levantaste 25 kg en pullover en polea.", "dumbbell", "fuerza", 4, "Pullover en polea", 25, "exercise_max_weight"],
  ["pr_pullover_en_polea_30", "Pullover en polea · 30 kg", "Levantaste 30 kg en pullover en polea.", "dumbbell", "fuerza", 5, "Pullover en polea", 30, "exercise_max_weight"],
  ["pr_pullover_en_polea_40", "Pullover en polea · 40 kg", "Levantaste 40 kg en pullover en polea.", "dumbbell", "fuerza", 6, "Pullover en polea", 40, "exercise_max_weight"],
  ["pr_pullover_en_polea_50", "Pullover en polea · 50 kg", "Levantaste 50 kg en pullover en polea.", "dumbbell", "fuerza", 7, "Pullover en polea", 50, "exercise_max_weight"],
  ["pr_pullover_en_polea_60", "Pullover en polea · 60 kg", "Levantaste 60 kg en pullover en polea.", "dumbbell", "fuerza", 8, "Pullover en polea", 60, "exercise_max_weight"],
  ["pr_pullover_en_polea_70", "Pullover en polea · 70 kg", "Levantaste 70 kg en pullover en polea.", "dumbbell", "fuerza", 9, "Pullover en polea", 70, "exercise_max_weight"],
  ["pr_pullover_en_polea_80", "Pullover en polea · 80 kg", "Levantaste 80 kg en pullover en polea.", "dumbbell", "fuerza", 10, "Pullover en polea", 80, "exercise_max_weight"],
  ["pr_pullover_en_polea_90", "Pullover en polea · 90 kg", "Levantaste 90 kg en pullover en polea.", "dumbbell", "fuerza", 11, "Pullover en polea", 90, "exercise_max_weight"],
  ["pr_pullover_en_polea_100", "Pullover en polea · 100 kg", "Levantaste 100 kg en pullover en polea.", "dumbbell", "fuerza", 12, "Pullover en polea", 100, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_20", "Curl de bíceps con barra · 20 kg", "Levantaste 20 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 1, "Curl de bíceps con barra", 20, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_30", "Curl de bíceps con barra · 30 kg", "Levantaste 30 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 2, "Curl de bíceps con barra", 30, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_40", "Curl de bíceps con barra · 40 kg", "Levantaste 40 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 3, "Curl de bíceps con barra", 40, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_50", "Curl de bíceps con barra · 50 kg", "Levantaste 50 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 4, "Curl de bíceps con barra", 50, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_60", "Curl de bíceps con barra · 60 kg", "Levantaste 60 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 5, "Curl de bíceps con barra", 60, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_80", "Curl de bíceps con barra · 80 kg", "Levantaste 80 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 6, "Curl de bíceps con barra", 80, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_100", "Curl de bíceps con barra · 100 kg", "Levantaste 100 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 7, "Curl de bíceps con barra", 100, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_120", "Curl de bíceps con barra · 120 kg", "Levantaste 120 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 8, "Curl de bíceps con barra", 120, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_140", "Curl de bíceps con barra · 140 kg", "Levantaste 140 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 9, "Curl de bíceps con barra", 140, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_160", "Curl de bíceps con barra · 160 kg", "Levantaste 160 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 10, "Curl de bíceps con barra", 160, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_180", "Curl de bíceps con barra · 180 kg", "Levantaste 180 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 11, "Curl de bíceps con barra", 180, "exercise_max_weight"],
  ["pr_curl_de_biceps_con_barra_200", "Curl de bíceps con barra · 200 kg", "Levantaste 200 kg en curl de bíceps con barra.", "dumbbell", "fuerza", 12, "Curl de bíceps con barra", 200, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_5", "Curl alterno con mancuernas · 5 kg", "Levantaste 5 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 1, "Curl alterno con mancuernas", 5, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_7", "Curl alterno con mancuernas · 7 kg", "Levantaste 7 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 2, "Curl alterno con mancuernas", 7, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_10", "Curl alterno con mancuernas · 10 kg", "Levantaste 10 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 3, "Curl alterno con mancuernas", 10, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_12", "Curl alterno con mancuernas · 12 kg", "Levantaste 12 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 4, "Curl alterno con mancuernas", 12, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_15", "Curl alterno con mancuernas · 15 kg", "Levantaste 15 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 5, "Curl alterno con mancuernas", 15, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_20", "Curl alterno con mancuernas · 20 kg", "Levantaste 20 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 6, "Curl alterno con mancuernas", 20, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_25", "Curl alterno con mancuernas · 25 kg", "Levantaste 25 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 7, "Curl alterno con mancuernas", 25, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_30", "Curl alterno con mancuernas · 30 kg", "Levantaste 30 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 8, "Curl alterno con mancuernas", 30, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_35", "Curl alterno con mancuernas · 35 kg", "Levantaste 35 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 9, "Curl alterno con mancuernas", 35, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_40", "Curl alterno con mancuernas · 40 kg", "Levantaste 40 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 10, "Curl alterno con mancuernas", 40, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_45", "Curl alterno con mancuernas · 45 kg", "Levantaste 45 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 11, "Curl alterno con mancuernas", 45, "exercise_max_weight"],
  ["pr_curl_alterno_con_mancuernas_50", "Curl alterno con mancuernas · 50 kg", "Levantaste 50 kg en curl alterno con mancuernas.", "dumbbell", "fuerza", 12, "Curl alterno con mancuernas", 50, "exercise_max_weight"],
  ["pr_curl_martillo_5", "Curl martillo · 5 kg", "Levantaste 5 kg en curl martillo.", "dumbbell", "fuerza", 1, "Curl martillo", 5, "exercise_max_weight"],
  ["pr_curl_martillo_7", "Curl martillo · 7 kg", "Levantaste 7 kg en curl martillo.", "dumbbell", "fuerza", 2, "Curl martillo", 7, "exercise_max_weight"],
  ["pr_curl_martillo_10", "Curl martillo · 10 kg", "Levantaste 10 kg en curl martillo.", "dumbbell", "fuerza", 3, "Curl martillo", 10, "exercise_max_weight"],
  ["pr_curl_martillo_12", "Curl martillo · 12 kg", "Levantaste 12 kg en curl martillo.", "dumbbell", "fuerza", 4, "Curl martillo", 12, "exercise_max_weight"],
  ["pr_curl_martillo_15", "Curl martillo · 15 kg", "Levantaste 15 kg en curl martillo.", "dumbbell", "fuerza", 5, "Curl martillo", 15, "exercise_max_weight"],
  ["pr_curl_martillo_20", "Curl martillo · 20 kg", "Levantaste 20 kg en curl martillo.", "dumbbell", "fuerza", 6, "Curl martillo", 20, "exercise_max_weight"],
  ["pr_curl_martillo_25", "Curl martillo · 25 kg", "Levantaste 25 kg en curl martillo.", "dumbbell", "fuerza", 7, "Curl martillo", 25, "exercise_max_weight"],
  ["pr_curl_martillo_30", "Curl martillo · 30 kg", "Levantaste 30 kg en curl martillo.", "dumbbell", "fuerza", 8, "Curl martillo", 30, "exercise_max_weight"],
  ["pr_curl_martillo_35", "Curl martillo · 35 kg", "Levantaste 35 kg en curl martillo.", "dumbbell", "fuerza", 9, "Curl martillo", 35, "exercise_max_weight"],
  ["pr_curl_martillo_40", "Curl martillo · 40 kg", "Levantaste 40 kg en curl martillo.", "dumbbell", "fuerza", 10, "Curl martillo", 40, "exercise_max_weight"],
  ["pr_curl_martillo_45", "Curl martillo · 45 kg", "Levantaste 45 kg en curl martillo.", "dumbbell", "fuerza", 11, "Curl martillo", 45, "exercise_max_weight"],
  ["pr_curl_martillo_50", "Curl martillo · 50 kg", "Levantaste 50 kg en curl martillo.", "dumbbell", "fuerza", 12, "Curl martillo", 50, "exercise_max_weight"],
  ["pr_curl_predicador_10", "Curl predicador · 10 kg", "Levantaste 10 kg en curl predicador.", "dumbbell", "fuerza", 1, "Curl predicador", 10, "exercise_max_weight"],
  ["pr_curl_predicador_15", "Curl predicador · 15 kg", "Levantaste 15 kg en curl predicador.", "dumbbell", "fuerza", 2, "Curl predicador", 15, "exercise_max_weight"],
  ["pr_curl_predicador_20", "Curl predicador · 20 kg", "Levantaste 20 kg en curl predicador.", "dumbbell", "fuerza", 3, "Curl predicador", 20, "exercise_max_weight"],
  ["pr_curl_predicador_25", "Curl predicador · 25 kg", "Levantaste 25 kg en curl predicador.", "dumbbell", "fuerza", 4, "Curl predicador", 25, "exercise_max_weight"],
  ["pr_curl_predicador_30", "Curl predicador · 30 kg", "Levantaste 30 kg en curl predicador.", "dumbbell", "fuerza", 5, "Curl predicador", 30, "exercise_max_weight"],
  ["pr_curl_predicador_40", "Curl predicador · 40 kg", "Levantaste 40 kg en curl predicador.", "dumbbell", "fuerza", 6, "Curl predicador", 40, "exercise_max_weight"],
  ["pr_curl_predicador_50", "Curl predicador · 50 kg", "Levantaste 50 kg en curl predicador.", "dumbbell", "fuerza", 7, "Curl predicador", 50, "exercise_max_weight"],
  ["pr_curl_predicador_60", "Curl predicador · 60 kg", "Levantaste 60 kg en curl predicador.", "dumbbell", "fuerza", 8, "Curl predicador", 60, "exercise_max_weight"],
  ["pr_curl_predicador_70", "Curl predicador · 70 kg", "Levantaste 70 kg en curl predicador.", "dumbbell", "fuerza", 9, "Curl predicador", 70, "exercise_max_weight"],
  ["pr_curl_predicador_80", "Curl predicador · 80 kg", "Levantaste 80 kg en curl predicador.", "dumbbell", "fuerza", 10, "Curl predicador", 80, "exercise_max_weight"],
  ["pr_curl_predicador_90", "Curl predicador · 90 kg", "Levantaste 90 kg en curl predicador.", "dumbbell", "fuerza", 11, "Curl predicador", 90, "exercise_max_weight"],
  ["pr_curl_predicador_100", "Curl predicador · 100 kg", "Levantaste 100 kg en curl predicador.", "dumbbell", "fuerza", 12, "Curl predicador", 100, "exercise_max_weight"],
  ["pr_curl_en_polea_10", "Curl en polea · 10 kg", "Levantaste 10 kg en curl en polea.", "dumbbell", "fuerza", 1, "Curl en polea", 10, "exercise_max_weight"],
  ["pr_curl_en_polea_15", "Curl en polea · 15 kg", "Levantaste 15 kg en curl en polea.", "dumbbell", "fuerza", 2, "Curl en polea", 15, "exercise_max_weight"],
  ["pr_curl_en_polea_20", "Curl en polea · 20 kg", "Levantaste 20 kg en curl en polea.", "dumbbell", "fuerza", 3, "Curl en polea", 20, "exercise_max_weight"],
  ["pr_curl_en_polea_25", "Curl en polea · 25 kg", "Levantaste 25 kg en curl en polea.", "dumbbell", "fuerza", 4, "Curl en polea", 25, "exercise_max_weight"],
  ["pr_curl_en_polea_30", "Curl en polea · 30 kg", "Levantaste 30 kg en curl en polea.", "dumbbell", "fuerza", 5, "Curl en polea", 30, "exercise_max_weight"],
  ["pr_curl_en_polea_40", "Curl en polea · 40 kg", "Levantaste 40 kg en curl en polea.", "dumbbell", "fuerza", 6, "Curl en polea", 40, "exercise_max_weight"],
  ["pr_curl_en_polea_50", "Curl en polea · 50 kg", "Levantaste 50 kg en curl en polea.", "dumbbell", "fuerza", 7, "Curl en polea", 50, "exercise_max_weight"],
  ["pr_curl_en_polea_60", "Curl en polea · 60 kg", "Levantaste 60 kg en curl en polea.", "dumbbell", "fuerza", 8, "Curl en polea", 60, "exercise_max_weight"],
  ["pr_curl_en_polea_70", "Curl en polea · 70 kg", "Levantaste 70 kg en curl en polea.", "dumbbell", "fuerza", 9, "Curl en polea", 70, "exercise_max_weight"],
  ["pr_curl_en_polea_80", "Curl en polea · 80 kg", "Levantaste 80 kg en curl en polea.", "dumbbell", "fuerza", 10, "Curl en polea", 80, "exercise_max_weight"],
  ["pr_curl_en_polea_90", "Curl en polea · 90 kg", "Levantaste 90 kg en curl en polea.", "dumbbell", "fuerza", 11, "Curl en polea", 90, "exercise_max_weight"],
  ["pr_curl_en_polea_100", "Curl en polea · 100 kg", "Levantaste 100 kg en curl en polea.", "dumbbell", "fuerza", 12, "Curl en polea", 100, "exercise_max_weight"],
  ["pr_press_cerrado_20", "Press cerrado · 20 kg", "Levantaste 20 kg en press cerrado.", "dumbbell", "fuerza", 1, "Press cerrado", 20, "exercise_max_weight"],
  ["pr_press_cerrado_30", "Press cerrado · 30 kg", "Levantaste 30 kg en press cerrado.", "dumbbell", "fuerza", 2, "Press cerrado", 30, "exercise_max_weight"],
  ["pr_press_cerrado_40", "Press cerrado · 40 kg", "Levantaste 40 kg en press cerrado.", "dumbbell", "fuerza", 3, "Press cerrado", 40, "exercise_max_weight"],
  ["pr_press_cerrado_50", "Press cerrado · 50 kg", "Levantaste 50 kg en press cerrado.", "dumbbell", "fuerza", 4, "Press cerrado", 50, "exercise_max_weight"],
  ["pr_press_cerrado_60", "Press cerrado · 60 kg", "Levantaste 60 kg en press cerrado.", "dumbbell", "fuerza", 5, "Press cerrado", 60, "exercise_max_weight"],
  ["pr_press_cerrado_80", "Press cerrado · 80 kg", "Levantaste 80 kg en press cerrado.", "dumbbell", "fuerza", 6, "Press cerrado", 80, "exercise_max_weight"],
  ["pr_press_cerrado_100", "Press cerrado · 100 kg", "Levantaste 100 kg en press cerrado.", "dumbbell", "fuerza", 7, "Press cerrado", 100, "exercise_max_weight"],
  ["pr_press_cerrado_120", "Press cerrado · 120 kg", "Levantaste 120 kg en press cerrado.", "dumbbell", "fuerza", 8, "Press cerrado", 120, "exercise_max_weight"],
  ["pr_press_cerrado_140", "Press cerrado · 140 kg", "Levantaste 140 kg en press cerrado.", "dumbbell", "fuerza", 9, "Press cerrado", 140, "exercise_max_weight"],
  ["pr_press_cerrado_160", "Press cerrado · 160 kg", "Levantaste 160 kg en press cerrado.", "dumbbell", "fuerza", 10, "Press cerrado", 160, "exercise_max_weight"],
  ["pr_press_cerrado_180", "Press cerrado · 180 kg", "Levantaste 180 kg en press cerrado.", "dumbbell", "fuerza", 11, "Press cerrado", 180, "exercise_max_weight"],
  ["pr_press_cerrado_200", "Press cerrado · 200 kg", "Levantaste 200 kg en press cerrado.", "dumbbell", "fuerza", 12, "Press cerrado", 200, "exercise_max_weight"],
  ["pr_press_frances_20", "Press francés · 20 kg", "Levantaste 20 kg en press francés.", "dumbbell", "fuerza", 1, "Press francés", 20, "exercise_max_weight"],
  ["pr_press_frances_30", "Press francés · 30 kg", "Levantaste 30 kg en press francés.", "dumbbell", "fuerza", 2, "Press francés", 30, "exercise_max_weight"],
  ["pr_press_frances_40", "Press francés · 40 kg", "Levantaste 40 kg en press francés.", "dumbbell", "fuerza", 3, "Press francés", 40, "exercise_max_weight"],
  ["pr_press_frances_50", "Press francés · 50 kg", "Levantaste 50 kg en press francés.", "dumbbell", "fuerza", 4, "Press francés", 50, "exercise_max_weight"],
  ["pr_press_frances_60", "Press francés · 60 kg", "Levantaste 60 kg en press francés.", "dumbbell", "fuerza", 5, "Press francés", 60, "exercise_max_weight"],
  ["pr_press_frances_80", "Press francés · 80 kg", "Levantaste 80 kg en press francés.", "dumbbell", "fuerza", 6, "Press francés", 80, "exercise_max_weight"],
  ["pr_press_frances_100", "Press francés · 100 kg", "Levantaste 100 kg en press francés.", "dumbbell", "fuerza", 7, "Press francés", 100, "exercise_max_weight"],
  ["pr_press_frances_120", "Press francés · 120 kg", "Levantaste 120 kg en press francés.", "dumbbell", "fuerza", 8, "Press francés", 120, "exercise_max_weight"],
  ["pr_press_frances_140", "Press francés · 140 kg", "Levantaste 140 kg en press francés.", "dumbbell", "fuerza", 9, "Press francés", 140, "exercise_max_weight"],
  ["pr_press_frances_160", "Press francés · 160 kg", "Levantaste 160 kg en press francés.", "dumbbell", "fuerza", 10, "Press francés", 160, "exercise_max_weight"],
  ["pr_press_frances_180", "Press francés · 180 kg", "Levantaste 180 kg en press francés.", "dumbbell", "fuerza", 11, "Press francés", 180, "exercise_max_weight"],
  ["pr_press_frances_200", "Press francés · 200 kg", "Levantaste 200 kg en press francés.", "dumbbell", "fuerza", 12, "Press francés", 200, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_10", "Extensión de tríceps en polea · 10 kg", "Levantaste 10 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 1, "Extensión de tríceps en polea", 10, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_15", "Extensión de tríceps en polea · 15 kg", "Levantaste 15 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 2, "Extensión de tríceps en polea", 15, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_20", "Extensión de tríceps en polea · 20 kg", "Levantaste 20 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 3, "Extensión de tríceps en polea", 20, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_25", "Extensión de tríceps en polea · 25 kg", "Levantaste 25 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 4, "Extensión de tríceps en polea", 25, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_30", "Extensión de tríceps en polea · 30 kg", "Levantaste 30 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 5, "Extensión de tríceps en polea", 30, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_40", "Extensión de tríceps en polea · 40 kg", "Levantaste 40 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 6, "Extensión de tríceps en polea", 40, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_50", "Extensión de tríceps en polea · 50 kg", "Levantaste 50 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 7, "Extensión de tríceps en polea", 50, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_60", "Extensión de tríceps en polea · 60 kg", "Levantaste 60 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 8, "Extensión de tríceps en polea", 60, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_70", "Extensión de tríceps en polea · 70 kg", "Levantaste 70 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 9, "Extensión de tríceps en polea", 70, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_80", "Extensión de tríceps en polea · 80 kg", "Levantaste 80 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 10, "Extensión de tríceps en polea", 80, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_90", "Extensión de tríceps en polea · 90 kg", "Levantaste 90 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 11, "Extensión de tríceps en polea", 90, "exercise_max_weight"],
  ["pr_extension_de_triceps_en_polea_100", "Extensión de tríceps en polea · 100 kg", "Levantaste 100 kg en extensión de tríceps en polea.", "dumbbell", "fuerza", 12, "Extensión de tríceps en polea", 100, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_5", "Extensión de tríceps sobre cabeza · 5 kg", "Levantaste 5 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 1, "Extensión de tríceps sobre cabeza", 5, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_7", "Extensión de tríceps sobre cabeza · 7 kg", "Levantaste 7 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 2, "Extensión de tríceps sobre cabeza", 7, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_10", "Extensión de tríceps sobre cabeza · 10 kg", "Levantaste 10 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 3, "Extensión de tríceps sobre cabeza", 10, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_12", "Extensión de tríceps sobre cabeza · 12 kg", "Levantaste 12 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 4, "Extensión de tríceps sobre cabeza", 12, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_15", "Extensión de tríceps sobre cabeza · 15 kg", "Levantaste 15 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 5, "Extensión de tríceps sobre cabeza", 15, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_20", "Extensión de tríceps sobre cabeza · 20 kg", "Levantaste 20 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 6, "Extensión de tríceps sobre cabeza", 20, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_25", "Extensión de tríceps sobre cabeza · 25 kg", "Levantaste 25 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 7, "Extensión de tríceps sobre cabeza", 25, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_30", "Extensión de tríceps sobre cabeza · 30 kg", "Levantaste 30 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 8, "Extensión de tríceps sobre cabeza", 30, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_35", "Extensión de tríceps sobre cabeza · 35 kg", "Levantaste 35 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 9, "Extensión de tríceps sobre cabeza", 35, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_40", "Extensión de tríceps sobre cabeza · 40 kg", "Levantaste 40 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 10, "Extensión de tríceps sobre cabeza", 40, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_45", "Extensión de tríceps sobre cabeza · 45 kg", "Levantaste 45 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 11, "Extensión de tríceps sobre cabeza", 45, "exercise_max_weight"],
  ["pr_extension_de_triceps_sobre_cabeza_50", "Extensión de tríceps sobre cabeza · 50 kg", "Levantaste 50 kg en extensión de tríceps sobre cabeza.", "dumbbell", "fuerza", 12, "Extensión de tríceps sobre cabeza", 50, "exercise_max_weight"],
  ["pr_patada_de_triceps_5", "Patada de tríceps · 5 kg", "Levantaste 5 kg en patada de tríceps.", "dumbbell", "fuerza", 1, "Patada de tríceps", 5, "exercise_max_weight"],
  ["pr_patada_de_triceps_7", "Patada de tríceps · 7 kg", "Levantaste 7 kg en patada de tríceps.", "dumbbell", "fuerza", 2, "Patada de tríceps", 7, "exercise_max_weight"],
  ["pr_patada_de_triceps_10", "Patada de tríceps · 10 kg", "Levantaste 10 kg en patada de tríceps.", "dumbbell", "fuerza", 3, "Patada de tríceps", 10, "exercise_max_weight"],
  ["pr_patada_de_triceps_12", "Patada de tríceps · 12 kg", "Levantaste 12 kg en patada de tríceps.", "dumbbell", "fuerza", 4, "Patada de tríceps", 12, "exercise_max_weight"],
  ["pr_patada_de_triceps_15", "Patada de tríceps · 15 kg", "Levantaste 15 kg en patada de tríceps.", "dumbbell", "fuerza", 5, "Patada de tríceps", 15, "exercise_max_weight"],
  ["pr_patada_de_triceps_20", "Patada de tríceps · 20 kg", "Levantaste 20 kg en patada de tríceps.", "dumbbell", "fuerza", 6, "Patada de tríceps", 20, "exercise_max_weight"],
  ["pr_patada_de_triceps_25", "Patada de tríceps · 25 kg", "Levantaste 25 kg en patada de tríceps.", "dumbbell", "fuerza", 7, "Patada de tríceps", 25, "exercise_max_weight"],
  ["pr_patada_de_triceps_30", "Patada de tríceps · 30 kg", "Levantaste 30 kg en patada de tríceps.", "dumbbell", "fuerza", 8, "Patada de tríceps", 30, "exercise_max_weight"],
  ["pr_patada_de_triceps_35", "Patada de tríceps · 35 kg", "Levantaste 35 kg en patada de tríceps.", "dumbbell", "fuerza", 9, "Patada de tríceps", 35, "exercise_max_weight"],
  ["pr_patada_de_triceps_40", "Patada de tríceps · 40 kg", "Levantaste 40 kg en patada de tríceps.", "dumbbell", "fuerza", 10, "Patada de tríceps", 40, "exercise_max_weight"],
  ["pr_patada_de_triceps_45", "Patada de tríceps · 45 kg", "Levantaste 45 kg en patada de tríceps.", "dumbbell", "fuerza", 11, "Patada de tríceps", 45, "exercise_max_weight"],
  ["pr_patada_de_triceps_50", "Patada de tríceps · 50 kg", "Levantaste 50 kg en patada de tríceps.", "dumbbell", "fuerza", 12, "Patada de tríceps", 50, "exercise_max_weight"],
  ["sessions_plancha_5", "Plancha · 5 veces", "Hiciste plancha en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Plancha", 5, "exercise_sessions"],
  ["sessions_plancha_10", "Plancha · 10 veces", "Hiciste plancha en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Plancha", 10, "exercise_sessions"],
  ["sessions_plancha_25", "Plancha · 25 veces", "Hiciste plancha en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Plancha", 25, "exercise_sessions"],
  ["sessions_plancha_50", "Plancha · 50 veces", "Hiciste plancha en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Plancha", 50, "exercise_sessions"],
  ["sessions_plancha_100", "Plancha · 100 veces", "Hiciste plancha en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Plancha", 100, "exercise_sessions"],
  ["sessions_plancha_lateral_5", "Plancha lateral · 5 veces", "Hiciste plancha lateral en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Plancha lateral", 5, "exercise_sessions"],
  ["sessions_plancha_lateral_10", "Plancha lateral · 10 veces", "Hiciste plancha lateral en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Plancha lateral", 10, "exercise_sessions"],
  ["sessions_plancha_lateral_25", "Plancha lateral · 25 veces", "Hiciste plancha lateral en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Plancha lateral", 25, "exercise_sessions"],
  ["sessions_plancha_lateral_50", "Plancha lateral · 50 veces", "Hiciste plancha lateral en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Plancha lateral", 50, "exercise_sessions"],
  ["sessions_plancha_lateral_100", "Plancha lateral · 100 veces", "Hiciste plancha lateral en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Plancha lateral", 100, "exercise_sessions"],
  ["sessions_crunch_5", "Crunch · 5 veces", "Hiciste crunch en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Crunch", 5, "exercise_sessions"],
  ["sessions_crunch_10", "Crunch · 10 veces", "Hiciste crunch en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Crunch", 10, "exercise_sessions"],
  ["sessions_crunch_25", "Crunch · 25 veces", "Hiciste crunch en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Crunch", 25, "exercise_sessions"],
  ["sessions_crunch_50", "Crunch · 50 veces", "Hiciste crunch en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Crunch", 50, "exercise_sessions"],
  ["sessions_crunch_100", "Crunch · 100 veces", "Hiciste crunch en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Crunch", 100, "exercise_sessions"],
  ["pr_crunch_en_polea_10", "Crunch en polea · 10 kg", "Levantaste 10 kg en crunch en polea.", "dumbbell", "fuerza", 1, "Crunch en polea", 10, "exercise_max_weight"],
  ["pr_crunch_en_polea_15", "Crunch en polea · 15 kg", "Levantaste 15 kg en crunch en polea.", "dumbbell", "fuerza", 2, "Crunch en polea", 15, "exercise_max_weight"],
  ["pr_crunch_en_polea_20", "Crunch en polea · 20 kg", "Levantaste 20 kg en crunch en polea.", "dumbbell", "fuerza", 3, "Crunch en polea", 20, "exercise_max_weight"],
  ["pr_crunch_en_polea_25", "Crunch en polea · 25 kg", "Levantaste 25 kg en crunch en polea.", "dumbbell", "fuerza", 4, "Crunch en polea", 25, "exercise_max_weight"],
  ["pr_crunch_en_polea_30", "Crunch en polea · 30 kg", "Levantaste 30 kg en crunch en polea.", "dumbbell", "fuerza", 5, "Crunch en polea", 30, "exercise_max_weight"],
  ["pr_crunch_en_polea_40", "Crunch en polea · 40 kg", "Levantaste 40 kg en crunch en polea.", "dumbbell", "fuerza", 6, "Crunch en polea", 40, "exercise_max_weight"],
  ["pr_crunch_en_polea_50", "Crunch en polea · 50 kg", "Levantaste 50 kg en crunch en polea.", "dumbbell", "fuerza", 7, "Crunch en polea", 50, "exercise_max_weight"],
  ["pr_crunch_en_polea_60", "Crunch en polea · 60 kg", "Levantaste 60 kg en crunch en polea.", "dumbbell", "fuerza", 8, "Crunch en polea", 60, "exercise_max_weight"],
  ["pr_crunch_en_polea_70", "Crunch en polea · 70 kg", "Levantaste 70 kg en crunch en polea.", "dumbbell", "fuerza", 9, "Crunch en polea", 70, "exercise_max_weight"],
  ["pr_crunch_en_polea_80", "Crunch en polea · 80 kg", "Levantaste 80 kg en crunch en polea.", "dumbbell", "fuerza", 10, "Crunch en polea", 80, "exercise_max_weight"],
  ["pr_crunch_en_polea_90", "Crunch en polea · 90 kg", "Levantaste 90 kg en crunch en polea.", "dumbbell", "fuerza", 11, "Crunch en polea", 90, "exercise_max_weight"],
  ["pr_crunch_en_polea_100", "Crunch en polea · 100 kg", "Levantaste 100 kg en crunch en polea.", "dumbbell", "fuerza", 12, "Crunch en polea", 100, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_10", "Elevación de rodillas · 10 kg", "Levantaste 10 kg en elevación de rodillas.", "dumbbell", "fuerza", 1, "Elevación de rodillas", 10, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_15", "Elevación de rodillas · 15 kg", "Levantaste 15 kg en elevación de rodillas.", "dumbbell", "fuerza", 2, "Elevación de rodillas", 15, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_20", "Elevación de rodillas · 20 kg", "Levantaste 20 kg en elevación de rodillas.", "dumbbell", "fuerza", 3, "Elevación de rodillas", 20, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_25", "Elevación de rodillas · 25 kg", "Levantaste 25 kg en elevación de rodillas.", "dumbbell", "fuerza", 4, "Elevación de rodillas", 25, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_30", "Elevación de rodillas · 30 kg", "Levantaste 30 kg en elevación de rodillas.", "dumbbell", "fuerza", 5, "Elevación de rodillas", 30, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_40", "Elevación de rodillas · 40 kg", "Levantaste 40 kg en elevación de rodillas.", "dumbbell", "fuerza", 6, "Elevación de rodillas", 40, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_50", "Elevación de rodillas · 50 kg", "Levantaste 50 kg en elevación de rodillas.", "dumbbell", "fuerza", 7, "Elevación de rodillas", 50, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_60", "Elevación de rodillas · 60 kg", "Levantaste 60 kg en elevación de rodillas.", "dumbbell", "fuerza", 8, "Elevación de rodillas", 60, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_70", "Elevación de rodillas · 70 kg", "Levantaste 70 kg en elevación de rodillas.", "dumbbell", "fuerza", 9, "Elevación de rodillas", 70, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_80", "Elevación de rodillas · 80 kg", "Levantaste 80 kg en elevación de rodillas.", "dumbbell", "fuerza", 10, "Elevación de rodillas", 80, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_90", "Elevación de rodillas · 90 kg", "Levantaste 90 kg en elevación de rodillas.", "dumbbell", "fuerza", 11, "Elevación de rodillas", 90, "exercise_max_weight"],
  ["pr_elevacion_de_rodillas_100", "Elevación de rodillas · 100 kg", "Levantaste 100 kg en elevación de rodillas.", "dumbbell", "fuerza", 12, "Elevación de rodillas", 100, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_10", "Elevación de piernas · 10 kg", "Levantaste 10 kg en elevación de piernas.", "dumbbell", "fuerza", 1, "Elevación de piernas", 10, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_15", "Elevación de piernas · 15 kg", "Levantaste 15 kg en elevación de piernas.", "dumbbell", "fuerza", 2, "Elevación de piernas", 15, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_20", "Elevación de piernas · 20 kg", "Levantaste 20 kg en elevación de piernas.", "dumbbell", "fuerza", 3, "Elevación de piernas", 20, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_25", "Elevación de piernas · 25 kg", "Levantaste 25 kg en elevación de piernas.", "dumbbell", "fuerza", 4, "Elevación de piernas", 25, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_30", "Elevación de piernas · 30 kg", "Levantaste 30 kg en elevación de piernas.", "dumbbell", "fuerza", 5, "Elevación de piernas", 30, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_40", "Elevación de piernas · 40 kg", "Levantaste 40 kg en elevación de piernas.", "dumbbell", "fuerza", 6, "Elevación de piernas", 40, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_50", "Elevación de piernas · 50 kg", "Levantaste 50 kg en elevación de piernas.", "dumbbell", "fuerza", 7, "Elevación de piernas", 50, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_60", "Elevación de piernas · 60 kg", "Levantaste 60 kg en elevación de piernas.", "dumbbell", "fuerza", 8, "Elevación de piernas", 60, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_70", "Elevación de piernas · 70 kg", "Levantaste 70 kg en elevación de piernas.", "dumbbell", "fuerza", 9, "Elevación de piernas", 70, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_80", "Elevación de piernas · 80 kg", "Levantaste 80 kg en elevación de piernas.", "dumbbell", "fuerza", 10, "Elevación de piernas", 80, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_90", "Elevación de piernas · 90 kg", "Levantaste 90 kg en elevación de piernas.", "dumbbell", "fuerza", 11, "Elevación de piernas", 90, "exercise_max_weight"],
  ["pr_elevacion_de_piernas_100", "Elevación de piernas · 100 kg", "Levantaste 100 kg en elevación de piernas.", "dumbbell", "fuerza", 12, "Elevación de piernas", 100, "exercise_max_weight"],
  ["sessions_dead_bug_5", "Dead bug · 5 veces", "Hiciste dead bug en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Dead bug", 5, "exercise_sessions"],
  ["sessions_dead_bug_10", "Dead bug · 10 veces", "Hiciste dead bug en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Dead bug", 10, "exercise_sessions"],
  ["sessions_dead_bug_25", "Dead bug · 25 veces", "Hiciste dead bug en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Dead bug", 25, "exercise_sessions"],
  ["sessions_dead_bug_50", "Dead bug · 50 veces", "Hiciste dead bug en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Dead bug", 50, "exercise_sessions"],
  ["sessions_dead_bug_100", "Dead bug · 100 veces", "Hiciste dead bug en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Dead bug", 100, "exercise_sessions"],
  ["sessions_bird_dog_5", "Bird dog · 5 veces", "Hiciste bird dog en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Bird dog", 5, "exercise_sessions"],
  ["sessions_bird_dog_10", "Bird dog · 10 veces", "Hiciste bird dog en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Bird dog", 10, "exercise_sessions"],
  ["sessions_bird_dog_25", "Bird dog · 25 veces", "Hiciste bird dog en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Bird dog", 25, "exercise_sessions"],
  ["sessions_bird_dog_50", "Bird dog · 50 veces", "Hiciste bird dog en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Bird dog", 50, "exercise_sessions"],
  ["sessions_bird_dog_100", "Bird dog · 100 veces", "Hiciste bird dog en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Bird dog", 100, "exercise_sessions"],
  ["sessions_mountain_climbers_5", "Mountain climbers · 5 veces", "Hiciste mountain climbers en 5 entrenamientos distintos.", "run", "cardio", 1, "Mountain climbers", 5, "exercise_sessions"],
  ["sessions_mountain_climbers_10", "Mountain climbers · 10 veces", "Hiciste mountain climbers en 10 entrenamientos distintos.", "run", "cardio", 2, "Mountain climbers", 10, "exercise_sessions"],
  ["sessions_mountain_climbers_25", "Mountain climbers · 25 veces", "Hiciste mountain climbers en 25 entrenamientos distintos.", "run", "cardio", 3, "Mountain climbers", 25, "exercise_sessions"],
  ["sessions_mountain_climbers_50", "Mountain climbers · 50 veces", "Hiciste mountain climbers en 50 entrenamientos distintos.", "run", "cardio", 4, "Mountain climbers", 50, "exercise_sessions"],
  ["sessions_mountain_climbers_100", "Mountain climbers · 100 veces", "Hiciste mountain climbers en 100 entrenamientos distintos.", "run", "cardio", 5, "Mountain climbers", 100, "exercise_sessions"],
  ["sessions_burpees_5", "Burpees · 5 veces", "Hiciste burpees en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Burpees", 5, "exercise_sessions"],
  ["sessions_burpees_10", "Burpees · 10 veces", "Hiciste burpees en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Burpees", 10, "exercise_sessions"],
  ["sessions_burpees_25", "Burpees · 25 veces", "Hiciste burpees en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Burpees", 25, "exercise_sessions"],
  ["sessions_burpees_50", "Burpees · 50 veces", "Hiciste burpees en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Burpees", 50, "exercise_sessions"],
  ["sessions_burpees_100", "Burpees · 100 veces", "Hiciste burpees en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Burpees", 100, "exercise_sessions"],
  ["sessions_jumping_jacks_5", "Jumping jacks · 5 veces", "Hiciste jumping jacks en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Jumping jacks", 5, "exercise_sessions"],
  ["sessions_jumping_jacks_10", "Jumping jacks · 10 veces", "Hiciste jumping jacks en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Jumping jacks", 10, "exercise_sessions"],
  ["sessions_jumping_jacks_25", "Jumping jacks · 25 veces", "Hiciste jumping jacks en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Jumping jacks", 25, "exercise_sessions"],
  ["sessions_jumping_jacks_50", "Jumping jacks · 50 veces", "Hiciste jumping jacks en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Jumping jacks", 50, "exercise_sessions"],
  ["sessions_jumping_jacks_100", "Jumping jacks · 100 veces", "Hiciste jumping jacks en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Jumping jacks", 100, "exercise_sessions"],
  ["sessions_cuerda_de_saltar_5", "Cuerda de saltar · 5 veces", "Hiciste cuerda de saltar en 5 entrenamientos distintos.", "run", "cardio", 1, "Cuerda de saltar", 5, "exercise_sessions"],
  ["sessions_cuerda_de_saltar_10", "Cuerda de saltar · 10 veces", "Hiciste cuerda de saltar en 10 entrenamientos distintos.", "run", "cardio", 2, "Cuerda de saltar", 10, "exercise_sessions"],
  ["sessions_cuerda_de_saltar_25", "Cuerda de saltar · 25 veces", "Hiciste cuerda de saltar en 25 entrenamientos distintos.", "run", "cardio", 3, "Cuerda de saltar", 25, "exercise_sessions"],
  ["sessions_cuerda_de_saltar_50", "Cuerda de saltar · 50 veces", "Hiciste cuerda de saltar en 50 entrenamientos distintos.", "run", "cardio", 4, "Cuerda de saltar", 50, "exercise_sessions"],
  ["sessions_cuerda_de_saltar_100", "Cuerda de saltar · 100 veces", "Hiciste cuerda de saltar en 100 entrenamientos distintos.", "run", "cardio", 5, "Cuerda de saltar", 100, "exercise_sessions"],
  ["sessions_sprint_en_cinta_5", "Sprint en cinta · 5 veces", "Hiciste sprint en cinta en 5 entrenamientos distintos.", "run", "cardio", 1, "Sprint en cinta", 5, "exercise_sessions"],
  ["sessions_sprint_en_cinta_10", "Sprint en cinta · 10 veces", "Hiciste sprint en cinta en 10 entrenamientos distintos.", "run", "cardio", 2, "Sprint en cinta", 10, "exercise_sessions"],
  ["sessions_sprint_en_cinta_25", "Sprint en cinta · 25 veces", "Hiciste sprint en cinta en 25 entrenamientos distintos.", "run", "cardio", 3, "Sprint en cinta", 25, "exercise_sessions"],
  ["sessions_sprint_en_cinta_50", "Sprint en cinta · 50 veces", "Hiciste sprint en cinta en 50 entrenamientos distintos.", "run", "cardio", 4, "Sprint en cinta", 50, "exercise_sessions"],
  ["sessions_sprint_en_cinta_100", "Sprint en cinta · 100 veces", "Hiciste sprint en cinta en 100 entrenamientos distintos.", "run", "cardio", 5, "Sprint en cinta", 100, "exercise_sessions"],
  ["sessions_caminata_inclinada_5", "Caminata inclinada · 5 veces", "Hiciste caminata inclinada en 5 entrenamientos distintos.", "run", "cardio", 1, "Caminata inclinada", 5, "exercise_sessions"],
  ["sessions_caminata_inclinada_10", "Caminata inclinada · 10 veces", "Hiciste caminata inclinada en 10 entrenamientos distintos.", "run", "cardio", 2, "Caminata inclinada", 10, "exercise_sessions"],
  ["sessions_caminata_inclinada_25", "Caminata inclinada · 25 veces", "Hiciste caminata inclinada en 25 entrenamientos distintos.", "run", "cardio", 3, "Caminata inclinada", 25, "exercise_sessions"],
  ["sessions_caminata_inclinada_50", "Caminata inclinada · 50 veces", "Hiciste caminata inclinada en 50 entrenamientos distintos.", "run", "cardio", 4, "Caminata inclinada", 50, "exercise_sessions"],
  ["sessions_caminata_inclinada_100", "Caminata inclinada · 100 veces", "Hiciste caminata inclinada en 100 entrenamientos distintos.", "run", "cardio", 5, "Caminata inclinada", 100, "exercise_sessions"],
  ["sessions_bicicleta_estatica_5", "Bicicleta estática · 5 veces", "Hiciste bicicleta estática en 5 entrenamientos distintos.", "run", "cardio", 1, "Bicicleta estática", 5, "exercise_sessions"],
  ["sessions_bicicleta_estatica_10", "Bicicleta estática · 10 veces", "Hiciste bicicleta estática en 10 entrenamientos distintos.", "run", "cardio", 2, "Bicicleta estática", 10, "exercise_sessions"],
  ["sessions_bicicleta_estatica_25", "Bicicleta estática · 25 veces", "Hiciste bicicleta estática en 25 entrenamientos distintos.", "run", "cardio", 3, "Bicicleta estática", 25, "exercise_sessions"],
  ["sessions_bicicleta_estatica_50", "Bicicleta estática · 50 veces", "Hiciste bicicleta estática en 50 entrenamientos distintos.", "run", "cardio", 4, "Bicicleta estática", 50, "exercise_sessions"],
  ["sessions_bicicleta_estatica_100", "Bicicleta estática · 100 veces", "Hiciste bicicleta estática en 100 entrenamientos distintos.", "run", "cardio", 5, "Bicicleta estática", 100, "exercise_sessions"],
  ["sessions_remo_ergometro_5", "Remo ergómetro · 5 veces", "Hiciste remo ergómetro en 5 entrenamientos distintos.", "run", "cardio", 1, "Remo ergómetro", 5, "exercise_sessions"],
  ["sessions_remo_ergometro_10", "Remo ergómetro · 10 veces", "Hiciste remo ergómetro en 10 entrenamientos distintos.", "run", "cardio", 2, "Remo ergómetro", 10, "exercise_sessions"],
  ["sessions_remo_ergometro_25", "Remo ergómetro · 25 veces", "Hiciste remo ergómetro en 25 entrenamientos distintos.", "run", "cardio", 3, "Remo ergómetro", 25, "exercise_sessions"],
  ["sessions_remo_ergometro_50", "Remo ergómetro · 50 veces", "Hiciste remo ergómetro en 50 entrenamientos distintos.", "run", "cardio", 4, "Remo ergómetro", 50, "exercise_sessions"],
  ["sessions_remo_ergometro_100", "Remo ergómetro · 100 veces", "Hiciste remo ergómetro en 100 entrenamientos distintos.", "run", "cardio", 5, "Remo ergómetro", 100, "exercise_sessions"],
  ["pr_battle_ropes_10", "Battle ropes · 10 kg", "Levantaste 10 kg en battle ropes.", "dumbbell", "fuerza", 1, "Battle ropes", 10, "exercise_max_weight"],
  ["pr_battle_ropes_15", "Battle ropes · 15 kg", "Levantaste 15 kg en battle ropes.", "dumbbell", "fuerza", 2, "Battle ropes", 15, "exercise_max_weight"],
  ["pr_battle_ropes_20", "Battle ropes · 20 kg", "Levantaste 20 kg en battle ropes.", "dumbbell", "fuerza", 3, "Battle ropes", 20, "exercise_max_weight"],
  ["pr_battle_ropes_25", "Battle ropes · 25 kg", "Levantaste 25 kg en battle ropes.", "dumbbell", "fuerza", 4, "Battle ropes", 25, "exercise_max_weight"],
  ["pr_battle_ropes_30", "Battle ropes · 30 kg", "Levantaste 30 kg en battle ropes.", "dumbbell", "fuerza", 5, "Battle ropes", 30, "exercise_max_weight"],
  ["pr_battle_ropes_40", "Battle ropes · 40 kg", "Levantaste 40 kg en battle ropes.", "dumbbell", "fuerza", 6, "Battle ropes", 40, "exercise_max_weight"],
  ["pr_battle_ropes_50", "Battle ropes · 50 kg", "Levantaste 50 kg en battle ropes.", "dumbbell", "fuerza", 7, "Battle ropes", 50, "exercise_max_weight"],
  ["pr_battle_ropes_60", "Battle ropes · 60 kg", "Levantaste 60 kg en battle ropes.", "dumbbell", "fuerza", 8, "Battle ropes", 60, "exercise_max_weight"],
  ["pr_battle_ropes_70", "Battle ropes · 70 kg", "Levantaste 70 kg en battle ropes.", "dumbbell", "fuerza", 9, "Battle ropes", 70, "exercise_max_weight"],
  ["pr_battle_ropes_80", "Battle ropes · 80 kg", "Levantaste 80 kg en battle ropes.", "dumbbell", "fuerza", 10, "Battle ropes", 80, "exercise_max_weight"],
  ["pr_battle_ropes_90", "Battle ropes · 90 kg", "Levantaste 90 kg en battle ropes.", "dumbbell", "fuerza", 11, "Battle ropes", 90, "exercise_max_weight"],
  ["pr_battle_ropes_100", "Battle ropes · 100 kg", "Levantaste 100 kg en battle ropes.", "dumbbell", "fuerza", 12, "Battle ropes", 100, "exercise_max_weight"],
  ["pr_kettlebell_swing_10", "Kettlebell swing · 10 kg", "Levantaste 10 kg en kettlebell swing.", "dumbbell", "fuerza", 1, "Kettlebell swing", 10, "exercise_max_weight"],
  ["pr_kettlebell_swing_15", "Kettlebell swing · 15 kg", "Levantaste 15 kg en kettlebell swing.", "dumbbell", "fuerza", 2, "Kettlebell swing", 15, "exercise_max_weight"],
  ["pr_kettlebell_swing_20", "Kettlebell swing · 20 kg", "Levantaste 20 kg en kettlebell swing.", "dumbbell", "fuerza", 3, "Kettlebell swing", 20, "exercise_max_weight"],
  ["pr_kettlebell_swing_25", "Kettlebell swing · 25 kg", "Levantaste 25 kg en kettlebell swing.", "dumbbell", "fuerza", 4, "Kettlebell swing", 25, "exercise_max_weight"],
  ["pr_kettlebell_swing_30", "Kettlebell swing · 30 kg", "Levantaste 30 kg en kettlebell swing.", "dumbbell", "fuerza", 5, "Kettlebell swing", 30, "exercise_max_weight"],
  ["pr_kettlebell_swing_40", "Kettlebell swing · 40 kg", "Levantaste 40 kg en kettlebell swing.", "dumbbell", "fuerza", 6, "Kettlebell swing", 40, "exercise_max_weight"],
  ["pr_kettlebell_swing_50", "Kettlebell swing · 50 kg", "Levantaste 50 kg en kettlebell swing.", "dumbbell", "fuerza", 7, "Kettlebell swing", 50, "exercise_max_weight"],
  ["pr_kettlebell_swing_60", "Kettlebell swing · 60 kg", "Levantaste 60 kg en kettlebell swing.", "dumbbell", "fuerza", 8, "Kettlebell swing", 60, "exercise_max_weight"],
  ["pr_kettlebell_swing_70", "Kettlebell swing · 70 kg", "Levantaste 70 kg en kettlebell swing.", "dumbbell", "fuerza", 9, "Kettlebell swing", 70, "exercise_max_weight"],
  ["pr_kettlebell_swing_80", "Kettlebell swing · 80 kg", "Levantaste 80 kg en kettlebell swing.", "dumbbell", "fuerza", 10, "Kettlebell swing", 80, "exercise_max_weight"],
  ["pr_kettlebell_swing_90", "Kettlebell swing · 90 kg", "Levantaste 90 kg en kettlebell swing.", "dumbbell", "fuerza", 11, "Kettlebell swing", 90, "exercise_max_weight"],
  ["pr_kettlebell_swing_100", "Kettlebell swing · 100 kg", "Levantaste 100 kg en kettlebell swing.", "dumbbell", "fuerza", 12, "Kettlebell swing", 100, "exercise_max_weight"],
  ["pr_farmer_walk_5", "Farmer walk · 5 kg", "Levantaste 5 kg en farmer walk.", "dumbbell", "fuerza", 1, "Farmer walk", 5, "exercise_max_weight"],
  ["pr_farmer_walk_7", "Farmer walk · 7 kg", "Levantaste 7 kg en farmer walk.", "dumbbell", "fuerza", 2, "Farmer walk", 7, "exercise_max_weight"],
  ["pr_farmer_walk_10", "Farmer walk · 10 kg", "Levantaste 10 kg en farmer walk.", "dumbbell", "fuerza", 3, "Farmer walk", 10, "exercise_max_weight"],
  ["pr_farmer_walk_12", "Farmer walk · 12 kg", "Levantaste 12 kg en farmer walk.", "dumbbell", "fuerza", 4, "Farmer walk", 12, "exercise_max_weight"],
  ["pr_farmer_walk_15", "Farmer walk · 15 kg", "Levantaste 15 kg en farmer walk.", "dumbbell", "fuerza", 5, "Farmer walk", 15, "exercise_max_weight"],
  ["pr_farmer_walk_20", "Farmer walk · 20 kg", "Levantaste 20 kg en farmer walk.", "dumbbell", "fuerza", 6, "Farmer walk", 20, "exercise_max_weight"],
  ["pr_farmer_walk_25", "Farmer walk · 25 kg", "Levantaste 25 kg en farmer walk.", "dumbbell", "fuerza", 7, "Farmer walk", 25, "exercise_max_weight"],
  ["pr_farmer_walk_30", "Farmer walk · 30 kg", "Levantaste 30 kg en farmer walk.", "dumbbell", "fuerza", 8, "Farmer walk", 30, "exercise_max_weight"],
  ["pr_farmer_walk_35", "Farmer walk · 35 kg", "Levantaste 35 kg en farmer walk.", "dumbbell", "fuerza", 9, "Farmer walk", 35, "exercise_max_weight"],
  ["pr_farmer_walk_40", "Farmer walk · 40 kg", "Levantaste 40 kg en farmer walk.", "dumbbell", "fuerza", 10, "Farmer walk", 40, "exercise_max_weight"],
  ["pr_farmer_walk_45", "Farmer walk · 45 kg", "Levantaste 45 kg en farmer walk.", "dumbbell", "fuerza", 11, "Farmer walk", 45, "exercise_max_weight"],
  ["pr_farmer_walk_50", "Farmer walk · 50 kg", "Levantaste 50 kg en farmer walk.", "dumbbell", "fuerza", 12, "Farmer walk", 50, "exercise_max_weight"],
  ["pr_turkish_get_up_10", "Turkish get-up · 10 kg", "Levantaste 10 kg en turkish get-up.", "dumbbell", "fuerza", 1, "Turkish get-up", 10, "exercise_max_weight"],
  ["pr_turkish_get_up_15", "Turkish get-up · 15 kg", "Levantaste 15 kg en turkish get-up.", "dumbbell", "fuerza", 2, "Turkish get-up", 15, "exercise_max_weight"],
  ["pr_turkish_get_up_20", "Turkish get-up · 20 kg", "Levantaste 20 kg en turkish get-up.", "dumbbell", "fuerza", 3, "Turkish get-up", 20, "exercise_max_weight"],
  ["pr_turkish_get_up_25", "Turkish get-up · 25 kg", "Levantaste 25 kg en turkish get-up.", "dumbbell", "fuerza", 4, "Turkish get-up", 25, "exercise_max_weight"],
  ["pr_turkish_get_up_30", "Turkish get-up · 30 kg", "Levantaste 30 kg en turkish get-up.", "dumbbell", "fuerza", 5, "Turkish get-up", 30, "exercise_max_weight"],
  ["pr_turkish_get_up_40", "Turkish get-up · 40 kg", "Levantaste 40 kg en turkish get-up.", "dumbbell", "fuerza", 6, "Turkish get-up", 40, "exercise_max_weight"],
  ["pr_turkish_get_up_50", "Turkish get-up · 50 kg", "Levantaste 50 kg en turkish get-up.", "dumbbell", "fuerza", 7, "Turkish get-up", 50, "exercise_max_weight"],
  ["pr_turkish_get_up_60", "Turkish get-up · 60 kg", "Levantaste 60 kg en turkish get-up.", "dumbbell", "fuerza", 8, "Turkish get-up", 60, "exercise_max_weight"],
  ["pr_turkish_get_up_70", "Turkish get-up · 70 kg", "Levantaste 70 kg en turkish get-up.", "dumbbell", "fuerza", 9, "Turkish get-up", 70, "exercise_max_weight"],
  ["pr_turkish_get_up_80", "Turkish get-up · 80 kg", "Levantaste 80 kg en turkish get-up.", "dumbbell", "fuerza", 10, "Turkish get-up", 80, "exercise_max_weight"],
  ["pr_turkish_get_up_90", "Turkish get-up · 90 kg", "Levantaste 90 kg en turkish get-up.", "dumbbell", "fuerza", 11, "Turkish get-up", 90, "exercise_max_weight"],
  ["pr_turkish_get_up_100", "Turkish get-up · 100 kg", "Levantaste 100 kg en turkish get-up.", "dumbbell", "fuerza", 12, "Turkish get-up", 100, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_10", "Clean con kettlebell · 10 kg", "Levantaste 10 kg en clean con kettlebell.", "dumbbell", "fuerza", 1, "Clean con kettlebell", 10, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_15", "Clean con kettlebell · 15 kg", "Levantaste 15 kg en clean con kettlebell.", "dumbbell", "fuerza", 2, "Clean con kettlebell", 15, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_20", "Clean con kettlebell · 20 kg", "Levantaste 20 kg en clean con kettlebell.", "dumbbell", "fuerza", 3, "Clean con kettlebell", 20, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_25", "Clean con kettlebell · 25 kg", "Levantaste 25 kg en clean con kettlebell.", "dumbbell", "fuerza", 4, "Clean con kettlebell", 25, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_30", "Clean con kettlebell · 30 kg", "Levantaste 30 kg en clean con kettlebell.", "dumbbell", "fuerza", 5, "Clean con kettlebell", 30, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_40", "Clean con kettlebell · 40 kg", "Levantaste 40 kg en clean con kettlebell.", "dumbbell", "fuerza", 6, "Clean con kettlebell", 40, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_50", "Clean con kettlebell · 50 kg", "Levantaste 50 kg en clean con kettlebell.", "dumbbell", "fuerza", 7, "Clean con kettlebell", 50, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_60", "Clean con kettlebell · 60 kg", "Levantaste 60 kg en clean con kettlebell.", "dumbbell", "fuerza", 8, "Clean con kettlebell", 60, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_70", "Clean con kettlebell · 70 kg", "Levantaste 70 kg en clean con kettlebell.", "dumbbell", "fuerza", 9, "Clean con kettlebell", 70, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_80", "Clean con kettlebell · 80 kg", "Levantaste 80 kg en clean con kettlebell.", "dumbbell", "fuerza", 10, "Clean con kettlebell", 80, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_90", "Clean con kettlebell · 90 kg", "Levantaste 90 kg en clean con kettlebell.", "dumbbell", "fuerza", 11, "Clean con kettlebell", 90, "exercise_max_weight"],
  ["pr_clean_con_kettlebell_100", "Clean con kettlebell · 100 kg", "Levantaste 100 kg en clean con kettlebell.", "dumbbell", "fuerza", 12, "Clean con kettlebell", 100, "exercise_max_weight"],
  ["sessions_box_jump_5", "Box jump · 5 veces", "Hiciste box jump en 5 entrenamientos distintos.", "dumbbell", "fuerza", 1, "Box jump", 5, "exercise_sessions"],
  ["sessions_box_jump_10", "Box jump · 10 veces", "Hiciste box jump en 10 entrenamientos distintos.", "dumbbell", "fuerza", 2, "Box jump", 10, "exercise_sessions"],
  ["sessions_box_jump_25", "Box jump · 25 veces", "Hiciste box jump en 25 entrenamientos distintos.", "dumbbell", "fuerza", 3, "Box jump", 25, "exercise_sessions"],
  ["sessions_box_jump_50", "Box jump · 50 veces", "Hiciste box jump en 50 entrenamientos distintos.", "dumbbell", "fuerza", 4, "Box jump", 50, "exercise_sessions"],
  ["sessions_box_jump_100", "Box jump · 100 veces", "Hiciste box jump en 100 entrenamientos distintos.", "dumbbell", "fuerza", 5, "Box jump", 100, "exercise_sessions"],
  ["pr_lanzamiento_de_balon_medicinal_10", "Lanzamiento de balón medicinal · 10 kg", "Levantaste 10 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 1, "Lanzamiento de balón medicinal", 10, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_15", "Lanzamiento de balón medicinal · 15 kg", "Levantaste 15 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 2, "Lanzamiento de balón medicinal", 15, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_20", "Lanzamiento de balón medicinal · 20 kg", "Levantaste 20 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 3, "Lanzamiento de balón medicinal", 20, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_25", "Lanzamiento de balón medicinal · 25 kg", "Levantaste 25 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 4, "Lanzamiento de balón medicinal", 25, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_30", "Lanzamiento de balón medicinal · 30 kg", "Levantaste 30 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 5, "Lanzamiento de balón medicinal", 30, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_40", "Lanzamiento de balón medicinal · 40 kg", "Levantaste 40 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 6, "Lanzamiento de balón medicinal", 40, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_50", "Lanzamiento de balón medicinal · 50 kg", "Levantaste 50 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 7, "Lanzamiento de balón medicinal", 50, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_60", "Lanzamiento de balón medicinal · 60 kg", "Levantaste 60 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 8, "Lanzamiento de balón medicinal", 60, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_70", "Lanzamiento de balón medicinal · 70 kg", "Levantaste 70 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 9, "Lanzamiento de balón medicinal", 70, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_80", "Lanzamiento de balón medicinal · 80 kg", "Levantaste 80 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 10, "Lanzamiento de balón medicinal", 80, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_90", "Lanzamiento de balón medicinal · 90 kg", "Levantaste 90 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 11, "Lanzamiento de balón medicinal", 90, "exercise_max_weight"],
  ["pr_lanzamiento_de_balon_medicinal_100", "Lanzamiento de balón medicinal · 100 kg", "Levantaste 100 kg en lanzamiento de balón medicinal.", "dumbbell", "fuerza", 12, "Lanzamiento de balón medicinal", 100, "exercise_max_weight"],
  ["sessions_golpes_al_saco_5", "Golpes al saco · 5 veces", "Hiciste golpes al saco en 5 entrenamientos distintos.", "run", "cardio", 1, "Golpes al saco", 5, "exercise_sessions"],
  ["sessions_golpes_al_saco_10", "Golpes al saco · 10 veces", "Hiciste golpes al saco en 10 entrenamientos distintos.", "run", "cardio", 2, "Golpes al saco", 10, "exercise_sessions"],
  ["sessions_golpes_al_saco_25", "Golpes al saco · 25 veces", "Hiciste golpes al saco en 25 entrenamientos distintos.", "run", "cardio", 3, "Golpes al saco", 25, "exercise_sessions"],
  ["sessions_golpes_al_saco_50", "Golpes al saco · 50 veces", "Hiciste golpes al saco en 50 entrenamientos distintos.", "run", "cardio", 4, "Golpes al saco", 50, "exercise_sessions"],
  ["sessions_golpes_al_saco_100", "Golpes al saco · 100 veces", "Hiciste golpes al saco en 100 entrenamientos distintos.", "run", "cardio", 5, "Golpes al saco", 100, "exercise_sessions"],
  ["sessions_sombra_de_boxeo_5", "Sombra de boxeo · 5 veces", "Hiciste sombra de boxeo en 5 entrenamientos distintos.", "run", "cardio", 1, "Sombra de boxeo", 5, "exercise_sessions"],
  ["sessions_sombra_de_boxeo_10", "Sombra de boxeo · 10 veces", "Hiciste sombra de boxeo en 10 entrenamientos distintos.", "run", "cardio", 2, "Sombra de boxeo", 10, "exercise_sessions"],
  ["sessions_sombra_de_boxeo_25", "Sombra de boxeo · 25 veces", "Hiciste sombra de boxeo en 25 entrenamientos distintos.", "run", "cardio", 3, "Sombra de boxeo", 25, "exercise_sessions"],
  ["sessions_sombra_de_boxeo_50", "Sombra de boxeo · 50 veces", "Hiciste sombra de boxeo en 50 entrenamientos distintos.", "run", "cardio", 4, "Sombra de boxeo", 50, "exercise_sessions"],
  ["sessions_sombra_de_boxeo_100", "Sombra de boxeo · 100 veces", "Hiciste sombra de boxeo en 100 entrenamientos distintos.", "run", "cardio", 5, "Sombra de boxeo", 100, "exercise_sessions"],
  ["sessions_combinacion_jab_cross_5", "Combinación jab-cross · 5 veces", "Hiciste combinación jab-cross en 5 entrenamientos distintos.", "run", "cardio", 1, "Combinación jab-cross", 5, "exercise_sessions"],
  ["sessions_combinacion_jab_cross_10", "Combinación jab-cross · 10 veces", "Hiciste combinación jab-cross en 10 entrenamientos distintos.", "run", "cardio", 2, "Combinación jab-cross", 10, "exercise_sessions"],
  ["sessions_combinacion_jab_cross_25", "Combinación jab-cross · 25 veces", "Hiciste combinación jab-cross en 25 entrenamientos distintos.", "run", "cardio", 3, "Combinación jab-cross", 25, "exercise_sessions"],
  ["sessions_combinacion_jab_cross_50", "Combinación jab-cross · 50 veces", "Hiciste combinación jab-cross en 50 entrenamientos distintos.", "run", "cardio", 4, "Combinación jab-cross", 50, "exercise_sessions"],
  ["sessions_combinacion_jab_cross_100", "Combinación jab-cross · 100 veces", "Hiciste combinación jab-cross en 100 entrenamientos distintos.", "run", "cardio", 5, "Combinación jab-cross", 100, "exercise_sessions"],
  ["sessions_hook_al_saco_5", "Hook al saco · 5 veces", "Hiciste hook al saco en 5 entrenamientos distintos.", "run", "cardio", 1, "Hook al saco", 5, "exercise_sessions"],
  ["sessions_hook_al_saco_10", "Hook al saco · 10 veces", "Hiciste hook al saco en 10 entrenamientos distintos.", "run", "cardio", 2, "Hook al saco", 10, "exercise_sessions"],
  ["sessions_hook_al_saco_25", "Hook al saco · 25 veces", "Hiciste hook al saco en 25 entrenamientos distintos.", "run", "cardio", 3, "Hook al saco", 25, "exercise_sessions"],
  ["sessions_hook_al_saco_50", "Hook al saco · 50 veces", "Hiciste hook al saco en 50 entrenamientos distintos.", "run", "cardio", 4, "Hook al saco", 50, "exercise_sessions"],
  ["sessions_hook_al_saco_100", "Hook al saco · 100 veces", "Hiciste hook al saco en 100 entrenamientos distintos.", "run", "cardio", 5, "Hook al saco", 100, "exercise_sessions"],
  ["sessions_uppercut_al_saco_5", "Uppercut al saco · 5 veces", "Hiciste uppercut al saco en 5 entrenamientos distintos.", "run", "cardio", 1, "Uppercut al saco", 5, "exercise_sessions"],
  ["sessions_uppercut_al_saco_10", "Uppercut al saco · 10 veces", "Hiciste uppercut al saco en 10 entrenamientos distintos.", "run", "cardio", 2, "Uppercut al saco", 10, "exercise_sessions"],
  ["sessions_uppercut_al_saco_25", "Uppercut al saco · 25 veces", "Hiciste uppercut al saco en 25 entrenamientos distintos.", "run", "cardio", 3, "Uppercut al saco", 25, "exercise_sessions"],
  ["sessions_uppercut_al_saco_50", "Uppercut al saco · 50 veces", "Hiciste uppercut al saco en 50 entrenamientos distintos.", "run", "cardio", 4, "Uppercut al saco", 50, "exercise_sessions"],
  ["sessions_uppercut_al_saco_100", "Uppercut al saco · 100 veces", "Hiciste uppercut al saco en 100 entrenamientos distintos.", "run", "cardio", 5, "Uppercut al saco", 100, "exercise_sessions"],
  ["sessions_burpee_golpe_5", "Burpee + golpe · 5 veces", "Hiciste burpee + golpe en 5 entrenamientos distintos.", "run", "cardio", 1, "Burpee + golpe", 5, "exercise_sessions"],
  ["sessions_burpee_golpe_10", "Burpee + golpe · 10 veces", "Hiciste burpee + golpe en 10 entrenamientos distintos.", "run", "cardio", 2, "Burpee + golpe", 10, "exercise_sessions"],
  ["sessions_burpee_golpe_25", "Burpee + golpe · 25 veces", "Hiciste burpee + golpe en 25 entrenamientos distintos.", "run", "cardio", 3, "Burpee + golpe", 25, "exercise_sessions"],
  ["sessions_burpee_golpe_50", "Burpee + golpe · 50 veces", "Hiciste burpee + golpe en 50 entrenamientos distintos.", "run", "cardio", 4, "Burpee + golpe", 50, "exercise_sessions"],
  ["sessions_burpee_golpe_100", "Burpee + golpe · 100 veces", "Hiciste burpee + golpe en 100 entrenamientos distintos.", "run", "cardio", 5, "Burpee + golpe", 100, "exercise_sessions"],
  ["sessions_movilidad_de_tobillo_5", "Movilidad de tobillo · 5 veces", "Hiciste movilidad de tobillo en 5 entrenamientos distintos.", "run", "cardio", 1, "Movilidad de tobillo", 5, "exercise_sessions"],
  ["sessions_movilidad_de_tobillo_10", "Movilidad de tobillo · 10 veces", "Hiciste movilidad de tobillo en 10 entrenamientos distintos.", "run", "cardio", 2, "Movilidad de tobillo", 10, "exercise_sessions"],
  ["sessions_movilidad_de_tobillo_25", "Movilidad de tobillo · 25 veces", "Hiciste movilidad de tobillo en 25 entrenamientos distintos.", "run", "cardio", 3, "Movilidad de tobillo", 25, "exercise_sessions"],
  ["sessions_movilidad_de_tobillo_50", "Movilidad de tobillo · 50 veces", "Hiciste movilidad de tobillo en 50 entrenamientos distintos.", "run", "cardio", 4, "Movilidad de tobillo", 50, "exercise_sessions"],
  ["sessions_movilidad_de_tobillo_100", "Movilidad de tobillo · 100 veces", "Hiciste movilidad de tobillo en 100 entrenamientos distintos.", "run", "cardio", 5, "Movilidad de tobillo", 100, "exercise_sessions"],
  ["sessions_rotacion_toracica_5", "Rotación torácica · 5 veces", "Hiciste rotación torácica en 5 entrenamientos distintos.", "run", "cardio", 1, "Rotación torácica", 5, "exercise_sessions"],
  ["sessions_rotacion_toracica_10", "Rotación torácica · 10 veces", "Hiciste rotación torácica en 10 entrenamientos distintos.", "run", "cardio", 2, "Rotación torácica", 10, "exercise_sessions"],
  ["sessions_rotacion_toracica_25", "Rotación torácica · 25 veces", "Hiciste rotación torácica en 25 entrenamientos distintos.", "run", "cardio", 3, "Rotación torácica", 25, "exercise_sessions"],
  ["sessions_rotacion_toracica_50", "Rotación torácica · 50 veces", "Hiciste rotación torácica en 50 entrenamientos distintos.", "run", "cardio", 4, "Rotación torácica", 50, "exercise_sessions"],
  ["sessions_rotacion_toracica_100", "Rotación torácica · 100 veces", "Hiciste rotación torácica en 100 entrenamientos distintos.", "run", "cardio", 5, "Rotación torácica", 100, "exercise_sessions"],
  ["sessions_estiramiento_flexor_de_cadera_5", "Estiramiento flexor de cadera · 5 veces", "Hiciste estiramiento flexor de cadera en 5 entrenamientos distintos.", "run", "cardio", 1, "Estiramiento flexor de cadera", 5, "exercise_sessions"],
  ["sessions_estiramiento_flexor_de_cadera_10", "Estiramiento flexor de cadera · 10 veces", "Hiciste estiramiento flexor de cadera en 10 entrenamientos distintos.", "run", "cardio", 2, "Estiramiento flexor de cadera", 10, "exercise_sessions"],
  ["sessions_estiramiento_flexor_de_cadera_25", "Estiramiento flexor de cadera · 25 veces", "Hiciste estiramiento flexor de cadera en 25 entrenamientos distintos.", "run", "cardio", 3, "Estiramiento flexor de cadera", 25, "exercise_sessions"],
  ["sessions_estiramiento_flexor_de_cadera_50", "Estiramiento flexor de cadera · 50 veces", "Hiciste estiramiento flexor de cadera en 50 entrenamientos distintos.", "run", "cardio", 4, "Estiramiento flexor de cadera", 50, "exercise_sessions"],
  ["sessions_estiramiento_flexor_de_cadera_100", "Estiramiento flexor de cadera · 100 veces", "Hiciste estiramiento flexor de cadera en 100 entrenamientos distintos.", "run", "cardio", 5, "Estiramiento flexor de cadera", 100, "exercise_sessions"],
  ["sessions_estiramiento_de_isquiotibiales_5", "Estiramiento de isquiotibiales · 5 veces", "Hiciste estiramiento de isquiotibiales en 5 entrenamientos distintos.", "run", "cardio", 1, "Estiramiento de isquiotibiales", 5, "exercise_sessions"],
  ["sessions_estiramiento_de_isquiotibiales_10", "Estiramiento de isquiotibiales · 10 veces", "Hiciste estiramiento de isquiotibiales en 10 entrenamientos distintos.", "run", "cardio", 2, "Estiramiento de isquiotibiales", 10, "exercise_sessions"],
  ["sessions_estiramiento_de_isquiotibiales_25", "Estiramiento de isquiotibiales · 25 veces", "Hiciste estiramiento de isquiotibiales en 25 entrenamientos distintos.", "run", "cardio", 3, "Estiramiento de isquiotibiales", 25, "exercise_sessions"],
  ["sessions_estiramiento_de_isquiotibiales_50", "Estiramiento de isquiotibiales · 50 veces", "Hiciste estiramiento de isquiotibiales en 50 entrenamientos distintos.", "run", "cardio", 4, "Estiramiento de isquiotibiales", 50, "exercise_sessions"],
  ["sessions_estiramiento_de_isquiotibiales_100", "Estiramiento de isquiotibiales · 100 veces", "Hiciste estiramiento de isquiotibiales en 100 entrenamientos distintos.", "run", "cardio", 5, "Estiramiento de isquiotibiales", 100, "exercise_sessions"],
  ["sessions_estiramiento_de_pectoral_5", "Estiramiento de pectoral · 5 veces", "Hiciste estiramiento de pectoral en 5 entrenamientos distintos.", "run", "cardio", 1, "Estiramiento de pectoral", 5, "exercise_sessions"],
  ["sessions_estiramiento_de_pectoral_10", "Estiramiento de pectoral · 10 veces", "Hiciste estiramiento de pectoral en 10 entrenamientos distintos.", "run", "cardio", 2, "Estiramiento de pectoral", 10, "exercise_sessions"],
  ["sessions_estiramiento_de_pectoral_25", "Estiramiento de pectoral · 25 veces", "Hiciste estiramiento de pectoral en 25 entrenamientos distintos.", "run", "cardio", 3, "Estiramiento de pectoral", 25, "exercise_sessions"],
  ["sessions_estiramiento_de_pectoral_50", "Estiramiento de pectoral · 50 veces", "Hiciste estiramiento de pectoral en 50 entrenamientos distintos.", "run", "cardio", 4, "Estiramiento de pectoral", 50, "exercise_sessions"],
  ["sessions_estiramiento_de_pectoral_100", "Estiramiento de pectoral · 100 veces", "Hiciste estiramiento de pectoral en 100 entrenamientos distintos.", "run", "cardio", 5, "Estiramiento de pectoral", 100, "exercise_sessions"],
  ["sessions_estiramiento_de_dorsal_5", "Estiramiento de dorsal · 5 veces", "Hiciste estiramiento de dorsal en 5 entrenamientos distintos.", "run", "cardio", 1, "Estiramiento de dorsal", 5, "exercise_sessions"],
  ["sessions_estiramiento_de_dorsal_10", "Estiramiento de dorsal · 10 veces", "Hiciste estiramiento de dorsal en 10 entrenamientos distintos.", "run", "cardio", 2, "Estiramiento de dorsal", 10, "exercise_sessions"],
  ["sessions_estiramiento_de_dorsal_25", "Estiramiento de dorsal · 25 veces", "Hiciste estiramiento de dorsal en 25 entrenamientos distintos.", "run", "cardio", 3, "Estiramiento de dorsal", 25, "exercise_sessions"],
  ["sessions_estiramiento_de_dorsal_50", "Estiramiento de dorsal · 50 veces", "Hiciste estiramiento de dorsal en 50 entrenamientos distintos.", "run", "cardio", 4, "Estiramiento de dorsal", 50, "exercise_sessions"],
  ["sessions_estiramiento_de_dorsal_100", "Estiramiento de dorsal · 100 veces", "Hiciste estiramiento de dorsal en 100 entrenamientos distintos.", "run", "cardio", 5, "Estiramiento de dorsal", 100, "exercise_sessions"],
  ["weightloss_1", "Bajaste 1 kg", "Perdiste 1 kg desde tu primera medición registrada.", "ruler", "medidas", 1, null, 1, "measurement_weight_loss_kg"],
  ["weightloss_2", "Bajaste 2 kg", "Perdiste 2 kg desde tu primera medición registrada.", "ruler", "medidas", 2, null, 2, "measurement_weight_loss_kg"],
  ["weightloss_3", "Bajaste 3 kg", "Perdiste 3 kg desde tu primera medición registrada.", "ruler", "medidas", 3, null, 3, "measurement_weight_loss_kg"],
  ["weightloss_5", "Bajaste 5 kg", "Perdiste 5 kg desde tu primera medición registrada.", "ruler", "medidas", 4, null, 5, "measurement_weight_loss_kg"],
  ["weightloss_7", "Bajaste 7 kg", "Perdiste 7 kg desde tu primera medición registrada.", "ruler", "medidas", 5, null, 7, "measurement_weight_loss_kg"],
  ["weightloss_10", "Bajaste 10 kg", "Perdiste 10 kg desde tu primera medición registrada.", "ruler", "medidas", 6, null, 10, "measurement_weight_loss_kg"],
  ["weightloss_15", "Bajaste 15 kg", "Perdiste 15 kg desde tu primera medición registrada.", "ruler", "medidas", 7, null, 15, "measurement_weight_loss_kg"],
  ["weightloss_20", "Bajaste 20 kg", "Perdiste 20 kg desde tu primera medición registrada.", "ruler", "medidas", 8, null, 20, "measurement_weight_loss_kg"],
  ["weightgain_1", "Subiste 1 kg", "Ganaste 1 kg desde tu primera medición registrada.", "ruler", "medidas", 1, null, 1, "measurement_weight_gain_kg"],
  ["weightgain_2", "Subiste 2 kg", "Ganaste 2 kg desde tu primera medición registrada.", "ruler", "medidas", 2, null, 2, "measurement_weight_gain_kg"],
  ["weightgain_3", "Subiste 3 kg", "Ganaste 3 kg desde tu primera medición registrada.", "ruler", "medidas", 3, null, 3, "measurement_weight_gain_kg"],
  ["weightgain_5", "Subiste 5 kg", "Ganaste 5 kg desde tu primera medición registrada.", "ruler", "medidas", 4, null, 5, "measurement_weight_gain_kg"],
  ["weightgain_7", "Subiste 7 kg", "Ganaste 7 kg desde tu primera medición registrada.", "ruler", "medidas", 5, null, 7, "measurement_weight_gain_kg"],
  ["weightgain_10", "Subiste 10 kg", "Ganaste 10 kg desde tu primera medición registrada.", "ruler", "medidas", 6, null, 10, "measurement_weight_gain_kg"],
  ["bodyfatloss_1", "-1% grasa corporal", "Bajaste 1 puntos de % de grasa corporal desde tu primera medición.", "ruler", "medidas", 1, null, 1, "measurement_bodyfat_loss_pct"],
  ["bodyfatloss_2", "-2% grasa corporal", "Bajaste 2 puntos de % de grasa corporal desde tu primera medición.", "ruler", "medidas", 2, null, 2, "measurement_bodyfat_loss_pct"],
  ["bodyfatloss_3", "-3% grasa corporal", "Bajaste 3 puntos de % de grasa corporal desde tu primera medición.", "ruler", "medidas", 3, null, 3, "measurement_bodyfat_loss_pct"],
  ["bodyfatloss_5", "-5% grasa corporal", "Bajaste 5 puntos de % de grasa corporal desde tu primera medición.", "ruler", "medidas", 4, null, 5, "measurement_bodyfat_loss_pct"],
  ["bodyfatloss_7", "-7% grasa corporal", "Bajaste 7 puntos de % de grasa corporal desde tu primera medición.", "ruler", "medidas", 5, null, 7, "measurement_bodyfat_loss_pct"],
  ["bodyfatloss_10", "-10% grasa corporal", "Bajaste 10 puntos de % de grasa corporal desde tu primera medición.", "ruler", "medidas", 6, null, 10, "measurement_bodyfat_loss_pct"],
  ["waistloss_1", "-1 cm de cintura", "Redujiste 1 cm de cintura desde tu primera medición.", "ruler", "medidas", 1, null, 1, "measurement_waist_loss_cm"],
  ["waistloss_2", "-2 cm de cintura", "Redujiste 2 cm de cintura desde tu primera medición.", "ruler", "medidas", 2, null, 2, "measurement_waist_loss_cm"],
  ["waistloss_3", "-3 cm de cintura", "Redujiste 3 cm de cintura desde tu primera medición.", "ruler", "medidas", 3, null, 3, "measurement_waist_loss_cm"],
  ["waistloss_5", "-5 cm de cintura", "Redujiste 5 cm de cintura desde tu primera medición.", "ruler", "medidas", 4, null, 5, "measurement_waist_loss_cm"],
  ["waistloss_7", "-7 cm de cintura", "Redujiste 7 cm de cintura desde tu primera medición.", "ruler", "medidas", 5, null, 7, "measurement_waist_loss_cm"],
  ["waistloss_10", "-10 cm de cintura", "Redujiste 10 cm de cintura desde tu primera medición.", "ruler", "medidas", 6, null, 10, "measurement_waist_loss_cm"],
  ["armgain_1", "+1 cm de brazo", "Ganaste 1 cm de brazo desde tu primera medición.", "ruler", "medidas", 1, null, 1, "measurement_arm_gain_cm"],
  ["armgain_2", "+2 cm de brazo", "Ganaste 2 cm de brazo desde tu primera medición.", "ruler", "medidas", 2, null, 2, "measurement_arm_gain_cm"],
  ["armgain_3", "+3 cm de brazo", "Ganaste 3 cm de brazo desde tu primera medición.", "ruler", "medidas", 3, null, 3, "measurement_arm_gain_cm"],
  ["armgain_5", "+5 cm de brazo", "Ganaste 5 cm de brazo desde tu primera medición.", "ruler", "medidas", 4, null, 5, "measurement_arm_gain_cm"],
  ["chestgain_1", "+1 cm de pecho", "Ganaste 1 cm de pecho desde tu primera medición.", "ruler", "medidas", 1, null, 1, "measurement_chest_gain_cm"],
  ["chestgain_2", "+2 cm de pecho", "Ganaste 2 cm de pecho desde tu primera medición.", "ruler", "medidas", 2, null, 2, "measurement_chest_gain_cm"],
  ["chestgain_3", "+3 cm de pecho", "Ganaste 3 cm de pecho desde tu primera medición.", "ruler", "medidas", 3, null, 3, "measurement_chest_gain_cm"],
  ["chestgain_5", "+5 cm de pecho", "Ganaste 5 cm de pecho desde tu primera medición.", "ruler", "medidas", 4, null, 5, "measurement_chest_gain_cm"],
  ["thighgain_1", "+1 cm de muslo", "Ganaste 1 cm de muslo desde tu primera medición.", "ruler", "medidas", 1, null, 1, "measurement_thigh_gain_cm"],
  ["thighgain_2", "+2 cm de muslo", "Ganaste 2 cm de muslo desde tu primera medición.", "ruler", "medidas", 2, null, 2, "measurement_thigh_gain_cm"],
  ["thighgain_3", "+3 cm de muslo", "Ganaste 3 cm de muslo desde tu primera medición.", "ruler", "medidas", 3, null, 3, "measurement_thigh_gain_cm"],
  ["thighgain_5", "+5 cm de muslo", "Ganaste 5 cm de muslo desde tu primera medición.", "ruler", "medidas", 4, null, 5, "measurement_thigh_gain_cm"],
    ].forEach(([code, name, description, icon, category, tier, exercise_name, target, metric]) =>
      db.achievements.push({ id: uid('ach'), code, name, description, icon, category, tier, exercise_name, target, metric }));

    // client-1 ya entrenó un par de veces — para que Progreso/Logros no
    // arranquen todos en cero en el mock.
    const s1 = uid('ws'); db.workoutSessions.push({ id: s1, client_user_id: 'client-1', gym_id: gymId, source: 'trainer', started_at: minus(6), finished_at: minus(6) });
    const s2 = uid('ws'); db.workoutSessions.push({ id: s2, client_user_id: 'client-1', gym_id: gymId, source: 'trainer', started_at: minus(3), finished_at: minus(3) });
    db.exerciseLogs.push({ id: uid('exl'), workout_session_id: s2, client_user_id: 'client-1', exercise_name: 'Press de banca', set_number: 1, reps: 8, weight_kg: 45 });
    db.exerciseLogs.push({ id: uid('exl'), workout_session_id: s2, client_user_id: 'client-1', exercise_name: 'Sentadilla con barra', set_number: 1, reps: 8, weight_kg: 65 });
    db.bodyMeasurements.push({ id: uid('bm'), client_user_id: 'client-1', taken_at: minus(3), weight_kg: 78.5, body_fat_pct: 15.2, waist_cm: 82, chest_cm: null, arm_cm: null, thigh_cm: null });
    db.bodyMeasurements.push({ id: uid('bm'), client_user_id: 'client-1', taken_at: minus(20), weight_kg: 80, body_fat_pct: 16.1, waist_cm: 84, chest_cm: null, arm_cm: null, thigh_cm: null });

    // ---- Clases y una sesión de ejemplo ----
    const classId = uid('cls');
    db.classes.push({ id: classId, gym_id: gymId, name: 'Bailoterapia', description: 'Ritmo, energía y bienestar.', trainer_user_id: 'trainer-2', duration_minutes: 50, capacity: 20 });
    const sessId = uid('css');
    db.classSessions.push({ id: sessId, class_id: classId, gym_id: gymId, starts_at: new Date(today.getTime() + 3 * 3600000).toISOString() });
  })();

  /* ---------------- auth ---------------- */

  const auth = {
    // Devuelven { user, session } igual que el cliente real, con session
    // siempre presente — el mock simula un proyecto sin confirmación de
    // correo (el caso "hay que confirmar" se probó a mano contra Supabase
    // real, ver conversación; acá solo se cubre el camino feliz).
    // El dueño crea el gimnasio — mismo alcance que el signUpAdmin original,
    // renombrado (ver docs/MIGRATION_PLAN.md Fase 4).
    async signUpOwner({ name, email, phone, password }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('owner');
      db.profiles.push({ id, role: 'owner', gym_id: null, name, email, phone, password });
      session = { id, role: 'owner' };
      return { user: { id }, session };
    },
    // El administrador se une a un gimnasio ya creado (como un entrenador) y
    // queda pendiente de aprobación por el dueño.
    async signUpAdmin({ name, email, phone, password }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('admin');
      db.profiles.push({ id, role: 'admin', gym_id: null, name, email, phone, password });
      db.gymAdmins.push({ user_id: id, gym_id: null, status: 'pending' });
      session = { id, role: 'admin' };
      return { user: { id }, session };
    },
    async signUpTrainer({ name, email, phone, password, specialty, price }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('trainer');
      db.profiles.push({ id, role: 'trainer', gym_id: null, name, email, phone, password });
      db.trainers.push({ user_id: id, gym_id: null, specialty: specialty || 'General', price: Number(price) || 0, status: 'pending' });
      session = { id, role: 'trainer' };
      return { user: { id }, session };
    },
    async signUpClient({ name, email, phone, password }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('client');
      db.profiles.push({ id, role: 'client', gym_id: null, name, email, phone, password });
      db.clientProfiles.push({ user_id: id, gym_id: null, plan_id: null, trainer_user_id: null, face_photo_key: null, weight: null, height: null, age: null, level: 'principiante', goal: 'perder_peso', membership_status: 'pendiente', membership_expires_at: null, last_payment_at: null, created_at: new Date().toISOString() });
      session = { id, role: 'client' };
      return { user: { id }, session };
    },
    async signIn({ email, password }) {
      email = normalizeEmail(email);
      await wait();
      const p = db.profiles.find(x => x.email === email && x.password === password);
      if (!p) throw new Error('Correo o contraseña incorrectos.');
      session = { id: p.id, role: p.role };
    },
    // El mock nunca exige confirmación de correo (session siempre presente
    // arriba, ver el comentario de auth), así que la pantalla de código
    // (viewConfirmCode) nunca se llega a mostrar en test-harness.html — este
    // camino se probó a mano contra Supabase real, no acá.
    async verifyEmailCode() {
      await wait();
      throw new Error('El mock no simula confirmación de correo — probá este flujo directo contra Supabase.');
    },
    async resendConfirmCode() {
      await wait();
      throw new Error('El mock no simula confirmación de correo — probá este flujo directo contra Supabase.');
    },
    // "Olvidé mi contraseña" — a diferencia de verifyEmailCode/
    // resendConfirmCode de arriba, esto SÍ se puede simular acá (no
    // depende de un correo real llegando): el "código" del mock es
    // siempre 000000, fijo, documentado acá mismo — sirve para probar las
    // 3 pantallas nuevas en el harness sin necesitar Supabase real. Nunca
    // lanza si el correo no existe (mismo criterio que el real: no revela
    // qué correos están registrados).
    async requestPasswordReset(email) {
      await wait();
      email = normalizeEmail(email);
      const p = db.profiles.find(x => x.email === email);
      if (p) p._resetCode = '000000';
    },
    async verifyPasswordResetCode({ email, token }) {
      await wait();
      email = normalizeEmail(email);
      const p = db.profiles.find(x => x.email === email);
      if (!p || !p._resetCode || p._resetCode !== token.trim()) throw new Error('Código inválido o vencido.');
      session = { id: p.id, role: p.role };
      return { user: { id: p.id }, session };
    },
    async updatePassword(newPassword) {
      await wait();
      const s = requireAuth();
      const p = db.profiles.find(x => x.id === s.id);
      p.password = newPassword;
      p._resetCode = null;
    },
    async signOut() { await wait(); session = null; },
    // No-op: el deep link de confirmación solo existe en la app nativa
    // empaquetada, nunca en el navegador donde corre este mock.
    async setSessionFromUrl() { await wait(); return null; },
    async getSession() { await wait(); return session ? { user: { id: session.id } } : null; },
    async getMyProfile() {
      await wait();
      if (!session) return null;
      const p = profileOf(session.id);
      return { id: p.id, role: p.role, gym_id: p.gym_id, name: p.name, email: p.email, phone: p.phone, is_platform_admin: !!p.is_platform_admin };
    },
  };

  /* ---------------- gimnasio ---------------- */

  const gyms = {
    async listAll() { await wait(); return [...db.gyms]; },
    async get(gymId) { await wait(); return db.gyms.find(g => g.id === gymId) || null; },
    // Fase 16 — ya no resuelve solo un gimnasio (asumiendo "cliente"): cada
    // link ahora es de un rol específico (gym_invites), así que devuelve
    // ambos. Sigue sin ser un chequeo de seguridad, solo UX — join_gym()
    // sigue siendo la única función que de verdad une la cuenta al gimnasio.
    async getByInviteCode(code) {
      await wait();
      const inv = db.gymInvites.find(i => i.code === code);
      if (!inv) return null;
      const gym = db.gyms.find(g => g.id === inv.gym_id);
      return gym ? { gym: { ...gym }, role: inv.role } : null;
    },
    // Los 3 códigos de ESTE gimnasio — los carga el dueño/admin al entrar al
    // panel (ver actions.js enterOwnerDash) para mostrar las 3 tarjetas de
    // invitación (Clientes/Coaches/Admins).
    async getInvites(gymId) {
      await wait();
      const rows = db.gymInvites.filter(i => i.gym_id === gymId);
      return {
        client: (rows.find(r => r.role === 'client') || {}).code || null,
        admin: (rows.find(r => r.role === 'admin') || {}).code || null,
        trainer: (rows.find(r => r.role === 'trainer') || {}).code || null,
      };
    },
    async create({ name, address, hours, ownerInviteToken }) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'owner') throw new Error('Solo una cuenta de dueño puede crear un gimnasio.');
      const me = profileOf(s.id);
      if (me.gym_id) throw new Error('Esta cuenta ya tiene un gimnasio asignado.');
      const invite = db.ownerInvites.find(i => i.token === ownerInviteToken && !i.used_at);
      if (!invite) throw new Error('El link de invitación de dueño no es válido o ya fue usado.');
      const id = uid('gym');
      db.gyms.push({ id, name, address, hours, invite_code: Math.random().toString(36).slice(2, 10), currency: 'USD' });
      me.gym_id = id;
      invite.used_at = new Date().toISOString();
      invite.used_by_user_id = s.id;
      ['client', 'admin', 'trainer'].forEach(role =>
        db.gymInvites.push({ gym_id: id, role, code: Math.random().toString(36).slice(2, 10) }));
      return id;
    },
    async regenerateInvite(role) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio regeneran un link de invitación.');
      const me = profileOf(s.id);
      const row = db.gymInvites.find(i => i.gym_id === me.gym_id && i.role === role);
      if (!row) throw new Error('Este gimnasio todavía no tiene un link de invitación para ese rol.');
      row.code = Math.random().toString(36).slice(2, 10);
      return row.code;
    },
    // name/address/hours: espeja supabase-client.js (ver 20260908000100) —
    // opcionales, no tocan el dato si vienen vacíos.
    async updateSettings(gymId, { currency, brandName, brandColor, name, address, hours }) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio configuran el gimnasio.');
      const gym = db.gyms.find(g => g.id === gymId);
      if (!gym) throw new Error('Ese gimnasio no existe.');
      if (currency && currency.trim()) gym.currency = currency.trim();
      gym.brand_name = (brandName || '').trim() || null;
      gym.brand_color = (brandColor || '').trim() || null;
      if (name && name.trim()) gym.name = name.trim();
      if (address && address.trim()) gym.address = address.trim();
      if (hours && hours.trim()) gym.hours = hours.trim();
    },
    async join(gymId) {
      await wait();
      const s = requireAuth();
      if (!['trainer', 'client', 'admin'].includes(s.role)) throw new Error('Solo entrenadores, clientes y administradores se unen con esta función.');
      const me = profileOf(s.id);
      if (me.gym_id) throw new Error('Esta cuenta ya pertenece a un gimnasio.');
      if (!db.gyms.some(g => g.id === gymId)) throw new Error('Ese gimnasio no existe.');
      me.gym_id = gymId;
      if (s.role === 'trainer') db.trainers.find(t => t.user_id === s.id).gym_id = gymId;
      if (s.role === 'client') db.clientProfiles.find(c => c.user_id === s.id).gym_id = gymId;
      // El único camino hasta acá para un 'admin' es un código de invitación
      // de administrador válido de ESTE gimnasio — usarlo ES la aprobación
      // del dueño (ver join_gym() en supabase/migrations/20260908000000_admin_auto_approve.sql).
      if (s.role === 'admin') { const a = db.gymAdmins.find(x => x.user_id === s.id); a.gym_id = gymId; a.status = 'approved'; }
    },
  };

  /* ---------------- equipo ---------------- */

  const equipment = {
    async list(gymId) { await wait(); return db.equipment.filter(e => e.gym_id === gymId).map(e => ({ id: e.id, name: e.name, photoKey: e.photo_key || null })); },
    async add(gymId, name) { await wait(); const row = { id: uid('eq'), gym_id: gymId, name, photo_key: null }; db.equipment.push(row); return { id: row.id, name: row.name, photoKey: null }; },
    async remove(id) { await wait(); db.equipment = db.equipment.filter(e => e.id !== id); },
    async setPhotoKey(id, key) { await wait(); const row = db.equipment.find(e => e.id === id); if (row) row.photo_key = key; },
  };

  /* ---------------- planes ---------------- */

  const plans = {
    async list(gymId) { await wait(); return db.plans.filter(p => p.gym_id === gymId).map(p => ({ ...p })); },
    async add(gymId, { name, price, duration }) { await wait(); const row = { id: uid('plan'), gym_id: gymId, name, price, duration }; db.plans.push(row); return { ...row }; },
    async update(id, { name, price, duration }) {
      await wait();
      const p = db.plans.find(x => x.id === id);
      Object.assign(p, { name, price, duration });
      return { ...p };
    },
    async remove(id) { await wait(); db.plans = db.plans.filter(p => p.id !== id); },
  };

  /* ---------------- entrenadores ---------------- */

  function shapeTrainer(t) {
    const p = profileOf(t.user_id);
    // is_active default true para filas sembradas antes de la Etapa 2
    // (mismo criterio que el resto del seed: nunca inventar un dato, solo
    // completar el default real de la columna nueva).
    return { id: t.user_id, name: p.name, email: p.email, phone: p.phone, specialty: t.specialty, price: Number(t.price), status: t.status, isActive: t.is_active !== false };
  }

  function isStaff(s) { return s.role === 'admin' || s.role === 'owner'; }

  const trainers = {
    async listForGym(gymId) { await wait(); return db.trainers.filter(t => t.gym_id === gymId).map(shapeTrainer); },
    async listApprovedForGym(gymId) { await wait(); return db.trainers.filter(t => t.gym_id === gymId && t.status === 'approved').map(shapeTrainer); },
    async approve(userId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio aprueban entrenadores.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (t) t.status = 'approved';
    },
    async reject(userId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio rechazan entrenadores.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (t) t.status = 'rejected';
    },
    async updateProfile(userId, { specialty, price }) {
      await wait();
      const t = db.trainers.find(x => x.user_id === userId);
      Object.assign(t, { specialty, price });
    },
    async setActive(userId, active) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio activan o desactivan un entrenador.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id && x.status === 'approved');
      if (!t) throw new Error('Ese entrenador no existe o no está aprobado en tu gimnasio.');
      t.is_active = !!active;
    },

    // Espeja supabase-client.js — ver el comentario ahí.
    async markInterest(candidateUserId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'client') throw new Error('Solo un cliente puede marcar interés en un entrenador candidato.');
      const t = db.trainers.find(x => x.user_id === candidateUserId);
      const me = profileOf(s.id);
      if (!t || t.gym_id !== me.gym_id) throw new Error('Ese candidato no pertenece a tu gimnasio.');
      if (!db.trainerInterest.some(i => i.candidate_user_id === candidateUserId && i.client_user_id === s.id)) {
        db.trainerInterest.push({ candidate_user_id: candidateUserId, client_user_id: s.id, gym_id: t.gym_id });
      }
    },
    async unmarkInterest(candidateUserId) {
      await wait();
      const s = requireAuth();
      db.trainerInterest = db.trainerInterest.filter(i => !(i.candidate_user_id === candidateUserId && i.client_user_id === s.id));
    },
    async listInterestForGym(gymId) {
      await wait();
      return db.trainerInterest.filter(i => i.gym_id === gymId).map(i => ({ ...i }));
    },
  };

  /* ---------------- administradores (aprobación por el dueño) ---------------- */

  function shapeGymAdmin(a) {
    const p = profileOf(a.user_id);
    return { id: a.user_id, name: p.name, email: p.email, phone: p.phone, status: a.status };
  }

  const admins = {
    async listForGym(gymId) { await wait(); return db.gymAdmins.filter(a => a.gym_id === gymId).map(shapeGymAdmin); },
    async approve(userId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'owner') throw new Error('Solo el dueño del gimnasio aprueba administradores.');
      const me = profileOf(s.id);
      const a = db.gymAdmins.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (a) a.status = 'approved';
    },
    async reject(userId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'owner') throw new Error('Solo el dueño del gimnasio rechaza administradores.');
      const me = profileOf(s.id);
      const a = db.gymAdmins.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (a) a.status = 'rejected';
    },
  };

  /* ---------------- clientes ---------------- */

  function shapeClient(c) {
    const p = profileOf(c.user_id);
    return {
      id: c.user_id, name: p.name, email: p.email, phone: p.phone,
      planId: c.plan_id, trainerUserId: c.trainer_user_id, facePhotoKey: c.face_photo_key,
      physical: { weight: c.weight, height: c.height, age: c.age, level: c.level, goal: c.goal },
      status: c.membership_status, membershipExpiresAt: c.membership_expires_at, lastPaymentAt: c.last_payment_at,
      createdAt: c.created_at,
    };
  }

  const clients = {
    async listForGym(gymId) {
      await wait();
      return db.clientProfiles.filter(c => c.gym_id === gymId).map(syncExpiredStatus).map(shapeClient);
    },
    async getSelf(userId) {
      await wait();
      return shapeClient(syncExpiredStatus(db.clientProfiles.find(c => c.user_id === userId)));
    },
    async updatePhysical(userId, { weight, height, age, level, goal }) {
      await wait();
      Object.assign(db.clientProfiles.find(c => c.user_id === userId), { weight, height, age, level, goal });
    },
    async choosePlan(userId, planId) { await wait(); db.clientProfiles.find(c => c.user_id === userId).plan_id = planId; },
    async chooseTrainer(userId, trainerUserId) { await wait(); db.clientProfiles.find(c => c.user_id === userId).trainer_user_id = trainerUserId; },
    async setFacePhotoKey(userId, key) { await wait(); db.clientProfiles.find(c => c.user_id === userId).face_photo_key = key; },
    async suspend(userId, reason) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio suspenden un socio.');
      const me = profileOf(s.id);
      const c = db.clientProfiles.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (!c) throw new Error('Ese socio no existe en tu gimnasio.');
      c.membership_status = 'suspendido';
      c.suspended_at = new Date().toISOString();
      c.suspended_reason = (reason || '').trim() || null;
      rtEmit('client_profiles', `user_id=eq.${userId}`);
      rtEmit('client_profiles', `gym_id=eq.${me.gym_id}`);
    },
    async unsuspend(userId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio reactivan un socio.');
      const me = profileOf(s.id);
      const c = db.clientProfiles.find(x => x.user_id === userId && x.gym_id === me.gym_id && x.membership_status === 'suspendido');
      if (!c) throw new Error('Ese socio no está suspendido en tu gimnasio.');
      c.membership_status = 'pendiente';
      c.suspended_at = null;
      c.suspended_reason = null;
      rtEmit('client_profiles', `user_id=eq.${userId}`);
      rtEmit('client_profiles', `gym_id=eq.${me.gym_id}`);
    },
  };

  /* ---------------- fotos ---------------- */

  const photos = {
    facePath: (gymId, clientUserId) => `${gymId}/${clientUserId}/face.jpg`,
    progressPath: (gymId, clientUserId, dateStr) => `${gymId}/${clientUserId}/progress/${dateStr}.jpg`,
    equipmentPath: (gymId, equipmentId) => `${gymId}/equipment/${equipmentId}.jpg`,
    async upload(path, file) { await wait(); db.storage.set(path, file); return path; },
    async signedUrl(path) { await wait(10); const f = db.storage.get(path); return f ? URL.createObjectURL(f) : null; },
  };

  /* ---------------- progreso ---------------- */

  const progress = {
    async listForClient(clientUserId) {
      await wait();
      return db.progress.filter(p => p.client_user_id === clientUserId).sort((a, b) => b.taken_at.localeCompare(a.taken_at)).map(p => ({ ...p }));
    },
    async ensureToday(clientUserId) {
      await wait();
      const today = new Date().toISOString().slice(0, 10);
      let row = db.progress.find(p => p.client_user_id === clientUserId && p.taken_at === today);
      if (!row) { row = { id: uid('pg'), client_user_id: clientUserId, storage_key: null, taken_at: today }; db.progress.push(row); }
      return { ...row };
    },
    async setPhoto(progressId, storageKey) { await wait(); db.progress.find(p => p.id === progressId).storage_key = storageKey; },
  };

  /* ---------------- rutinas ---------------- */

  function findRoutine(clientUserId, source, goal) {
    return db.routines.find(r => r.client_user_id === clientUserId && r.source === source && (source === 'ia' ? r.goal === goal : true));
  }
  function ensureRoutine(clientUserId, source, goal, authorUserId) {
    let r = findRoutine(clientUserId, source, goal);
    if (!r) { r = { id: uid('rt'), client_user_id: clientUserId, source, goal: source === 'ia' ? goal : null, author_user_id: authorUserId }; db.routines.push(r); }
    return r.id;
  }
  // Etapa 2 — cada ejercicio de rutina trae ahora sets/reps/weight_kg/
  // rest_seconds además del texto de siempre (que se sigue mandando como
  // resumen de respaldo para lo que todavía lo muestre sin parsear).
  function exercisesFor(routineId) {
    return db.routineExercises.filter(e => e.routine_id === routineId).sort((a, b) => a.position - b.position).map(e => ({
      id: e.id, text: e.text, exerciseId: e.exercise_id || null,
      sets: e.sets != null ? e.sets : null, reps: e.reps != null ? e.reps : null,
      weightKg: e.weight_kg != null ? e.weight_kg : null, restSeconds: e.rest_seconds != null ? e.rest_seconds : 60,
      dayLabel: e.day_label || null, dayOfWeek: e.day_of_week != null ? e.day_of_week : null,
    }));
  }

  const routines = {
    async getAi(clientUserId, goal) {
      await wait();
      const r = findRoutine(clientUserId, 'ia', goal);
      return r ? { id: r.id, exercises: exercisesFor(r.id) } : { id: null, exercises: [] };
    },
    async getTrainer(clientUserId) {
      await wait();
      const r = findRoutine(clientUserId, 'trainer', null);
      return r ? { id: r.id, exercises: exercisesFor(r.id) } : { id: null, exercises: [] };
    },
    // Rutina "Personalizada" — el propio cliente la arma.
    async getPersonal(clientUserId) {
      await wait();
      const r = findRoutine(clientUserId, 'personal', null);
      return r ? { id: r.id, exercises: exercisesFor(r.id) } : { id: null, exercises: [] };
    },
    // `entries` ahora son objetos {text, sets, reps, weightKg, restSeconds},
    // no strings sueltos — ver buildRoutine() en src/helpers.js.
    async generateAi(clientUserId, goal, entries) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'ia', goal, null);
      db.routineExercises = db.routineExercises.filter(e => e.routine_id !== routineId);
      entries.forEach((ex, i) => db.routineExercises.push({
        id: uid('rex'), routine_id: routineId, position: i, exercise_id: ex.exerciseId || null,
        text: ex.text, sets: ex.sets ?? null, reps: ex.reps ?? null, weight_kg: ex.weightKg ?? null, rest_seconds: ex.restSeconds ?? 60,
      }));
    },
    async addTrainerExercise(clientUserId, trainerUserId, entry) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'trainer', null, trainerUserId);
      const existing = db.routineExercises.filter(e => e.routine_id === routineId);
      const nextPosition = existing.length ? Math.max(...existing.map(e => e.position)) + 1 : 0;
      db.routineExercises.push({
        id: uid('rex'), routine_id: routineId, position: nextPosition, exercise_id: entry.exerciseId || null,
        text: entry.text, sets: entry.sets ?? null, reps: entry.reps ?? null, weight_kg: entry.weightKg ?? null, rest_seconds: entry.restSeconds ?? 60,
        day_label: entry.dayLabel || null, day_of_week: entry.dayOfWeek ?? null,
      });
    },
    // Mismo patrón que addTrainerExercise, pero el autor es el propio
    // cliente (rutina "Personalizada").
    async addPersonalExercise(clientUserId, entry) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'personal', null, clientUserId);
      const existing = db.routineExercises.filter(e => e.routine_id === routineId);
      const nextPosition = existing.length ? Math.max(...existing.map(e => e.position)) + 1 : 0;
      db.routineExercises.push({
        id: uid('rex'), routine_id: routineId, position: nextPosition, exercise_id: entry.exerciseId || null,
        text: entry.text, sets: entry.sets ?? null, reps: entry.reps ?? null, weight_kg: entry.weightKg ?? null, rest_seconds: entry.restSeconds ?? 60,
        day_label: entry.dayLabel || null, day_of_week: entry.dayOfWeek ?? null,
      });
    },
    async removeExercise(exerciseId) { await wait(); db.routineExercises = db.routineExercises.filter(e => e.id !== exerciseId); },
    // Aplica una plantilla de programa entera a la rutina del cliente —
    // reemplaza los ejercicios existentes de "De tu entrenador" (igual que
    // generateAi reemplaza los de la rutina con IA), pero conservando
    // day_label para que la app pueda mostrar el programa día por día.
    // `items` ya viene aplanado y ordenado (ver applyProgramTemplate en
    // src/actions.js): [{dayLabel, exerciseId, exerciseName, sets, reps, restSeconds}]
    async applyProgramTemplate(clientUserId, trainerUserId, items) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'trainer', null, trainerUserId);
      db.routineExercises = db.routineExercises.filter(e => e.routine_id !== routineId);
      items.forEach((it, i) => db.routineExercises.push({
        id: uid('rex'), routine_id: routineId, position: i, exercise_id: it.exerciseId || null,
        text: it.exerciseName, sets: it.sets ?? null, reps: it.reps ?? null, weight_kg: null,
        rest_seconds: it.restSeconds ?? 60, day_label: it.dayLabel || null,
      }));
    },
  };

  /* ---------------- programas de entrenamiento (plantillas) ---------------- */

  const programTemplates = {
    async list() {
      await wait();
      return db.programTemplates.map(p => ({
        id: p.id, name: p.name, level: p.level, goal: p.goal, daysPerWeek: p.days_per_week, durationLabel: p.duration_label,
      }));
    },
    async listItems() {
      await wait();
      return db.programTemplateItems.map(it => ({
        id: it.id, programId: it.program_id, dayLabel: it.day_label, dayPosition: it.day_position, position: it.position,
        exerciseId: it.exercise_id, exerciseName: it.exercise_name, sets: it.sets, reps: it.reps, restSeconds: it.rest_seconds,
      }));
    },
  };

  /* ---------------- biblioteca de ejercicios ---------------- */

  const exercisesLib = {
    async list(gymId) {
      await wait();
      return db.exercises.filter(e => e.gym_id === null || e.gym_id === gymId)
        .map(e => ({
          id: e.id, gymId: e.gym_id, name: e.name, muscleGroup: e.muscle_group, equipmentName: e.equipment_name, mediaKey: e.media_key, description: e.description,
          level: e.level, goal: e.goal, kind: e.kind, suggestedSets: e.suggested_sets, suggestedReps: e.suggested_reps, suggestedRestSeconds: e.suggested_rest_seconds,
          muscleWorked: e.muscle_worked, purpose: e.purpose, bestPractices: e.best_practices || [], commonMistakes: e.common_mistakes || [], diagramPattern: e.diagram_pattern,
        }));
    },
    async add(gymId, { name, muscleGroup, equipmentName, description }) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio agregan ejercicios.');
      const row = { id: uid('ex'), gym_id: gymId, name, muscle_group: muscleGroup || 'General', equipment_name: equipmentName || null, media_key: null, description: description || null };
      db.exercises.push(row);
      return row.id;
    },
  };

  /* ---------------- clases y reservas ---------------- */

  const classesApi = {
    async listForGym(gymId) {
      await wait();
      return db.classes.filter(c => c.gym_id === gymId).map(c => ({ ...c }));
    },
    async listSessions(gymId, fromIso) {
      await wait();
      return db.classSessions.filter(s => s.gym_id === gymId && (!fromIso || s.starts_at >= fromIso))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map(s => ({ ...s, class: db.classes.find(c => c.id === s.class_id) }));
    },
    async listMyBookings(clientUserId) {
      await wait();
      return db.classBookings.filter(b => b.client_user_id === clientUserId && b.status === 'reservado').map(b => ({ ...b }));
    },
    async book(sessionId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'client') throw new Error('Solo un cliente puede reservar una clase.');
      const session = db.classSessions.find(cs => cs.id === sessionId);
      if (!session) throw new Error('Esa clase no existe.');
      const me = profileOf(s.id);
      if (session.gym_id !== me.gym_id) throw new Error('Esa clase es de otro gimnasio.');
      const cls = db.classes.find(c => c.id === session.class_id);
      const booked = db.classBookings.filter(b => b.session_id === sessionId && b.status === 'reservado').length;
      if (booked >= cls.capacity) throw new Error('Esta clase ya no tiene cupo.');
      let row = db.classBookings.find(b => b.session_id === sessionId && b.client_user_id === s.id);
      if (row) row.status = 'reservado';
      else { row = { id: uid('bkg'), session_id: sessionId, client_user_id: s.id, gym_id: session.gym_id, status: 'reservado' }; db.classBookings.push(row); }
      await achievementsApi.evaluate(s.id);
      emitGymCalendarChange(session.gym_id);
      return row.id;
    },
    async cancelBooking(bookingId) {
      await wait();
      const s = requireAuth();
      const row = db.classBookings.find(b => b.id === bookingId && b.client_user_id === s.id);
      if (!row) throw new Error('Esa reserva no existe o no es tuya.');
      row.status = 'cancelado';
      emitGymCalendarChange(row.gym_id);
    },

    // Dueño/admin crea un evento del calendario — clase + sesión de una sola
    // vez (ver createEvent en supabase-client.js, mismo contrato).
    async createEvent(gymId, { name, description, trainerUserId, durationMinutes, capacity, price, startsAtIso }) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio crean eventos.');
      const cls = { id: uid('cls'), gym_id: gymId, name, description: description || null, trainer_user_id: trainerUserId || null, duration_minutes: durationMinutes || 60, capacity: capacity || 20, price: price ?? null };
      db.classes.push(cls);
      const session = { id: uid('cs'), class_id: cls.id, gym_id: gymId, starts_at: startsAtIso };
      db.classSessions.push(session);
      emitGymCalendarChange(gymId);
      return session.id;
    },
    async removeSession(sessionId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio borran eventos.');
      const session = db.classSessions.find(cs => cs.id === sessionId);
      db.classSessions = db.classSessions.filter(cs => cs.id !== sessionId);
      db.classBookings = db.classBookings.filter(b => b.session_id !== sessionId); // on delete cascade, del lado del mock
      if (session) emitGymCalendarChange(session.gym_id);
    },
    async listBookingsForGym(gymId) {
      await wait();
      return db.classBookings.filter(b => b.gym_id === gymId).map(b => ({ ...b }));
    },
  };

  /* ---------------- notificaciones ---------------- */
  // Una fila por cliente — mismo criterio que notify_gym_clients() del lado
  // real (ver 20260910000000_events_price_and_notifications.sql). Solo
  // staff puede crearlas, un cliente solo lee/marca leídas las suyas.

  const notificationsApi = {
    async listForClient(clientUserId) {
      await wait();
      return db.notifications.filter(n => n.client_user_id === clientUserId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(n => ({ id: n.id, title: n.title, body: n.body, type: n.type, relatedId: n.related_id, createdAt: n.created_at, readAt: n.read_at }));
    },
    async markRead(notificationId) {
      await wait();
      const s = requireAuth();
      const row = db.notifications.find(n => n.id === notificationId && n.client_user_id === s.id);
      if (row && !row.read_at) row.read_at = new Date().toISOString();
    },
    async notifyGymClients(title, body, type, relatedId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio puede enviar notificaciones.');
      const me = profileOf(s.id);
      const clients = db.clientProfiles.filter(c => c.gym_id === me.gym_id);
      clients.forEach(c => {
        db.notifications.push({
          id: uid('ntf'), gym_id: me.gym_id, client_user_id: c.user_id, title, body: body || null,
          type: type || 'event_created', related_id: relatedId || null, created_at: new Date().toISOString(), read_at: null,
        });
        rtEmit('notifications', `client_user_id=eq.${c.user_id}`);
      });
      return clients.length;
    },
    // Dirección contraria: cliente -> staff. Las crea SOLO payments.confirm()
    // más abajo cuando el cliente confirma su propio pago escaneando el QR
    // (ver 20260912000000_payment_accountability_and_client_lock.sql del
    // lado real) — acá solo se leen/marcan.
    async listForStaff() {
      await wait();
      const s = requireAuth();
      return db.staffNotifications.filter(n => n.recipient_user_id === s.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(n => ({ id: n.id, title: n.title, body: n.body, type: n.type, relatedId: n.related_id, createdAt: n.created_at, readAt: n.read_at }));
    },
    async markStaffRead(notificationId) {
      await wait();
      const s = requireAuth();
      const row = db.staffNotifications.find(n => n.id === notificationId && n.recipient_user_id === s.id);
      if (row && !row.read_at) row.read_at = new Date().toISOString();
    },
  };

  /* ---------------- logros ---------------- */

  const achievementsApi = {
    async listCatalog() {
      await wait();
      return db.achievements.map(a => ({
        id: a.id, code: a.code, name: a.name, description: a.description, icon: a.icon,
        category: a.category, tier: a.tier, exerciseName: a.exercise_name, target: a.target, metric: a.metric,
      }));
    },
    async listForClient(clientUserId) {
      await wait();
      return db.clientAchievements.filter(a => a.client_user_id === clientUserId).map(a => ({ ...a }));
    },
    // Recalcula progreso contra datos reales — mismo criterio y mismas 12
    // métricas que evaluate_achievements() del lado real (ver
    // supabase/migrations/20260909000000_achievements_library.sql), nunca
    // se marca a mano. Se llama después de terminar un entrenamiento,
    // hacer check-in, reservar una clase y cargar una medición — los
    // mismos 4 disparadores que del lado real (3 funciones + 1 trigger).
    async evaluate(clientUserId) {
      await wait();
      const workouts = db.workoutSessions.filter(w => w.client_user_id === clientUserId && w.finished_at).length;
      const checkinsCount = db.checkinEvents.filter(c => c.client_user_id === clientUserId).length;
      const bookings = db.classBookings.filter(b => b.client_user_id === clientUserId && b.status === 'reservado').length;

      // Racha: tramo consecutivo de días con check-in más largo (no exige
      // que llegue hasta hoy — mismo criterio que el SQL real).
      const days = [...new Set(db.checkinEvents.filter(c => c.client_user_id === clientUserId)
        .map(c => c.created_at.slice(0, 10)))].sort();
      let streak = 0, run = 0, prevTime = null;
      for (const d of days) {
        const t = new Date(d + 'T00:00:00Z').getTime();
        run = (prevTime !== null && t - prevTime === 86400000) ? run + 1 : 1;
        streak = Math.max(streak, run);
        prevTime = t;
      }

      const myLogs = db.exerciseLogs.filter(l => l.client_user_id === clientUserId);
      const withWeight = myLogs.filter(l => l.weight_kg != null);
      const prs = new Set(withWeight.map(l => l.exercise_name)).size;
      const variety = new Set(myLogs.map(l => l.exercise_name)).size;
      const volume = withWeight.reduce((sum, l) => sum + l.weight_kg * (l.reps ?? 1), 0);
      const maxWeightByEx = {};
      withWeight.forEach(l => { maxWeightByEx[l.exercise_name] = Math.max(maxWeightByEx[l.exercise_name] || 0, l.weight_kg); });
      const sessionsByEx = {};
      myLogs.forEach(l => {
        (sessionsByEx[l.exercise_name] = sessionsByEx[l.exercise_name] || new Set()).add(l.workout_session_id);
      });
      Object.keys(sessionsByEx).forEach(k => { sessionsByEx[k] = sessionsByEx[k].size; });

      const myMeasurements = db.bodyMeasurements.filter(m => m.client_user_id === clientUserId).sort((a, b) => a.taken_at.localeCompare(b.taken_at));
      const first = myMeasurements[0], last = myMeasurements[myMeasurements.length - 1];
      let weightLoss = 0, weightGain = 0, bodyfatLoss = 0, waistLoss = 0, armGain = 0, chestGain = 0, thighGain = 0;
      if (first && last && first !== last) {
        if (first.weight_kg != null && last.weight_kg != null) {
          weightLoss = Math.max(0, first.weight_kg - last.weight_kg);
          weightGain = Math.max(0, last.weight_kg - first.weight_kg);
        }
        if (first.body_fat_pct != null && last.body_fat_pct != null) bodyfatLoss = Math.max(0, first.body_fat_pct - last.body_fat_pct);
        if (first.waist_cm != null && last.waist_cm != null) waistLoss = Math.max(0, first.waist_cm - last.waist_cm);
        if (first.arm_cm != null && last.arm_cm != null) armGain = Math.max(0, last.arm_cm - first.arm_cm);
        if (first.chest_cm != null && last.chest_cm != null) chestGain = Math.max(0, last.chest_cm - first.chest_cm);
        if (first.thigh_cm != null && last.thigh_cm != null) thighGain = Math.max(0, last.thigh_cm - first.thigh_cm);
      }

      const valueFor = a => {
        switch (a.metric) {
          case 'workouts': return workouts;
          case 'checkins': return checkinsCount;
          case 'streak_days': return streak;
          case 'class_bookings': return bookings;
          case 'personal_records': return prs;
          case 'exercise_variety': return variety;
          case 'total_volume_kg': return volume;
          case 'exercise_max_weight': return maxWeightByEx[a.exercise_name] || 0;
          case 'exercise_sessions': return sessionsByEx[a.exercise_name] || 0;
          case 'measurement_weight_loss_kg': return weightLoss;
          case 'measurement_weight_gain_kg': return weightGain;
          case 'measurement_bodyfat_loss_pct': return bodyfatLoss;
          case 'measurement_waist_loss_cm': return waistLoss;
          case 'measurement_arm_gain_cm': return armGain;
          case 'measurement_chest_gain_cm': return chestGain;
          case 'measurement_thigh_gain_cm': return thighGain;
          default: return 0;
        }
      };

      db.achievements.forEach(a => {
        const value = valueFor(a);
        let row = db.clientAchievements.find(ca => ca.client_user_id === clientUserId && ca.achievement_id === a.id);
        if (!row) { row = { client_user_id: clientUserId, achievement_id: a.id, progress: 0, earned_at: null }; db.clientAchievements.push(row); }
        row.progress = Math.floor(Math.min(value, a.target));
        if (value >= a.target && !row.earned_at) row.earned_at = new Date().toISOString();
      });
    },
  };

  /* ---------------- medidas corporales ---------------- */

  const measurements = {
    async listForClient(clientUserId) {
      await wait();
      return db.bodyMeasurements.filter(m => m.client_user_id === clientUserId).sort((a, b) => a.taken_at.localeCompare(b.taken_at)).map(m => ({ ...m }));
    },
    async recordToday(clientUserId, values) {
      await wait();
      const today = new Date().toISOString().slice(0, 10);
      let row = db.bodyMeasurements.find(m => m.client_user_id === clientUserId && m.taken_at === today);
      if (!row) { row = { id: uid('bm'), client_user_id: clientUserId, taken_at: today }; db.bodyMeasurements.push(row); }
      Object.assign(row, values);
      // Del lado real esto lo dispara un trigger (la tabla se escribe con
      // INSERT directo, no un RPC) — acá se llama a mano porque el mock no
      // tiene triggers.
      await achievementsApi.evaluate(clientUserId);
    },
  };

  /* ---------------- récords personales + sesiones de entrenamiento ---------------- */

  const workoutsApi = {
    // explicitId: espeja supabase-client.js (ver el comentario ahí) — el
    // mock nunca falla por red, pero acepta el mismo parámetro para que la
    // firma sea idéntica y el harness pueda probar el camino "con ID
    // elegido de antemano" si hace falta.
    async start(clientUserId, gymId, source, explicitId) {
      await wait();
      const row = { id: explicitId || uid('ws'), client_user_id: clientUserId, gym_id: gymId, source, started_at: new Date().toISOString(), finished_at: null };
      db.workoutSessions.push(row);
      return row.id;
    },
    async logSet(sessionId, clientUserId, exerciseName, setNumber, reps, weightKg) {
      await wait();
      db.exerciseLogs.push({ id: uid('exl'), workout_session_id: sessionId, client_user_id: clientUserId, exercise_name: exerciseName, set_number: setNumber, reps: reps ?? null, weight_kg: weightKg ?? null });
    },
    async finish(sessionId, clientUserId) {
      await wait();
      const row = db.workoutSessions.find(w => w.id === sessionId && w.client_user_id === clientUserId);
      if (!row) throw new Error('Esa sesión no existe, no es tuya, o ya estaba cerrada.');
      row.finished_at = new Date().toISOString();
      await achievementsApi.evaluate(clientUserId);
    },
    async getPersonalRecords(clientUserId) {
      await wait();
      const byName = new Map();
      db.exerciseLogs.filter(l => l.client_user_id === clientUserId && l.weight_kg != null).forEach(l => {
        const cur = byName.get(l.exercise_name);
        if (!cur || l.weight_kg > cur.maxWeightKg) byName.set(l.exercise_name, { exerciseName: l.exercise_name, maxWeightKg: l.weight_kg, achievedAt: l.created_at });
      });
      return [...byName.values()];
    },
    async countThisMonth(clientUserId) {
      await wait();
      const now = new Date();
      return db.workoutSessions.filter(w => {
        if (w.client_user_id !== clientUserId || !w.finished_at) return false;
        const d = new Date(w.finished_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
    },
  };

  /* ---------------- Fight Club Training Engine: perfil de evaluación ---------------- */

  function shapeTrainingProfile(p) {
    if (!p) return null;
    return {
      userId: p.user_id, gymId: p.gym_id, sex: p.sex,
      primaryGoal: p.primary_goal, secondaryGoal: p.secondary_goal,
      trainingTimeBucket: p.training_time_bucket, machineComfort: p.machine_comfort,
      daysPerWeek: p.days_per_week, sessionMinutes: p.session_minutes,
      preferredStyle: p.preferred_style, priorityMuscles: p.priority_muscles || [],
      somatotype: p.somatotype, evaluatedAt: p.evaluated_at, updatedAt: p.updated_at,
    };
  }

  const trainingProfileApi = {
    async get(clientUserId) {
      await wait();
      return shapeTrainingProfile(db.trainingProfiles.find(p => p.user_id === clientUserId));
    },
    async save(clientUserId, gymId, p) {
      await wait();
      let row = db.trainingProfiles.find(r => r.user_id === clientUserId);
      const now = new Date().toISOString();
      const data = {
        user_id: clientUserId, gym_id: gymId, sex: p.sex || null,
        primary_goal: p.primaryGoal, secondary_goal: p.secondaryGoal || null,
        training_time_bucket: p.trainingTimeBucket || null, machine_comfort: p.machineComfort || null,
        days_per_week: p.daysPerWeek ?? null, session_minutes: p.sessionMinutes ?? null,
        preferred_style: p.preferredStyle || null, priority_muscles: p.priorityMuscles || [],
        somatotype: p.somatotype || null, updated_at: now,
      };
      if (row) Object.assign(row, data);
      else db.trainingProfiles.push({ ...data, evaluated_at: now });
    },
    async listExcludedExercises(clientUserId) {
      await wait();
      return db.clientExercisePreferences.filter(r => r.client_user_id === clientUserId)
        .map(r => ({ id: r.id, exerciseId: r.exercise_id, exerciseName: r.exercise_name, preference: r.preference }));
    },
    async setExcludedExercises(clientUserId, items) {
      await wait();
      db.clientExercisePreferences = db.clientExercisePreferences.filter(r => r.client_user_id !== clientUserId);
      items.forEach(it => db.clientExercisePreferences.push({
        id: uid('cep'), client_user_id: clientUserId, exercise_id: it.exerciseId || null,
        exercise_name: it.exerciseName, preference: it.preference || 'excluido',
      }));
    },
    async listLimitations(clientUserId) {
      await wait();
      return db.clientLimitations.filter(r => r.client_user_id === clientUserId)
        .map(r => ({ id: r.id, joint: r.joint, painfulMovement: r.painful_movement, note: r.note }));
    },
    async setLimitations(clientUserId, items) {
      await wait();
      db.clientLimitations = db.clientLimitations.filter(r => r.client_user_id !== clientUserId);
      items.forEach(it => db.clientLimitations.push({
        id: uid('cl'), client_user_id: clientUserId, joint: it.joint,
        painful_movement: !!it.painfulMovement, note: it.note || null,
      }));
    },
  };

  /* ---------------- rating de entrenador ---------------- */

  const trainerReviewsApi = {
    async listForTrainer(trainerUserId) {
      await wait();
      return db.trainerReviews.filter(r => r.trainer_user_id === trainerUserId).map(r => ({ ...r }));
    },
    async rate(trainerUserId, rating, text) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'client') throw new Error('Solo un cliente puede calificar a su entrenador.');
      const me = profileOf(s.id);
      if (me.trainer_user_id !== trainerUserId && !db.clientProfiles.find(c => c.user_id === s.id && c.trainer_user_id === trainerUserId)) {
        throw new Error('Solo podés calificar a tu propio entrenador asignado.');
      }
      let row = db.trainerReviews.find(r => r.trainer_user_id === trainerUserId && r.client_user_id === s.id);
      if (row) { row.rating = rating; row.text = text; }
      else db.trainerReviews.push({ id: uid('trv'), trainer_user_id: trainerUserId, client_user_id: s.id, rating, text: text || null, created_at: new Date().toISOString() });
    },
  };

  /* ---------------- mensajes entrenador <-> cliente ---------------- */

  const messagesApi = {
    async getOrCreateConversation(otherUserId) {
      await wait();
      const s = requireAuth();
      const trainerUserId = s.role === 'trainer' ? s.id : otherUserId;
      const clientUserId = s.role === 'client' ? s.id : otherUserId;
      let conv = db.conversations.find(c => c.trainer_user_id === trainerUserId && c.client_user_id === clientUserId);
      if (!conv) {
        const me = profileOf(s.id);
        conv = { id: uid('cnv'), gym_id: me.gym_id, trainer_user_id: trainerUserId, client_user_id: clientUserId };
        db.conversations.push(conv);
      }
      return conv.id;
    },
    async list(conversationId) {
      await wait();
      return db.messages.filter(m => m.conversation_id === conversationId).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(m => ({ ...m }));
    },
    async send(conversationId, body) {
      await wait();
      const s = requireAuth();
      const row = { id: uid('msg'), conversation_id: conversationId, sender_user_id: s.id, body, created_at: new Date().toISOString(), read_at: null };
      db.messages.push(row);
      rtEmit('messages', `conversation_id=eq.${conversationId}`);
      return row.id;
    },
    async listConversationsForTrainer(trainerUserId) {
      await wait();
      return db.conversations.filter(c => c.trainer_user_id === trainerUserId).map(c => ({ ...c }));
    },
  };

  /* ---------------- cobros en efectivo ---------------- */

  const payments = {
    async createCashCharge(clientUserId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio generan un cobro.');
      const c = db.clientProfiles.find(x => x.user_id === clientUserId);
      const plan = db.plans.find(p => p.id === c.plan_id) || { price: 0 };
      const trainer = c.trainer_user_id ? db.trainers.find(t => t.user_id === c.trainer_user_id) : null;
      // Un cliente solo tiene UN cobro pendiente a la vez — si le quedaba
      // uno de antes sin confirmar ni cancelar, se cancela solo al generar
      // uno nuevo (ver 20260912000100_cancel_stale_pending_charges.sql,
      // mismo bug que del lado real: sin esto, getPendingForClient() podía
      // seguir mostrando ese viejo aunque el cliente ya hubiera pagado con
      // uno más nuevo).
      db.payments.filter(p => p.client_user_id === clientUserId && p.status === 'pending')
        .forEach(p => { p.status = 'cancelled'; });
      const id = uid('pay');
      db.payments.push({ id, client_user_id: clientUserId, gym_id: c.gym_id, amount: plan.price + (trainer ? trainer.price : 0), status: 'pending', created_by: s.id, confirmed_by: null, confirmed_at: null });
      emitPaymentChange(clientUserId);
      rtEmit('payments', `gym_id=eq.${c.gym_id}`); // Socios/Pagos de cualquier otro staff mirando en vivo
      return id;
    },
    // Confirma el staff (botón manual) o el propio cliente de ese cobro
    // (escaneando el QR que le muestra el mostrador, ver
    // ACTIONS.handlePaymentScan) — nunca un cliente ajeno a ese cobro
    // puntual. El plazo respeta el plan actual del cliente (diario = 1 día,
    // anual = 1 año, el resto/sin plan = 1 mes) — ver la migración
    // 20260907000000_payment_qr_flip.sql, que es el mismo criterio del lado real.
    async confirm(paymentId) {
      await wait();
      const s = requireAuth();
      const pay = db.payments.find(p => p.id === paymentId);
      if (!pay || pay.status !== 'pending') throw new Error('Este cobro ya fue procesado.');
      const isOwnClient = s.role === 'client' && pay.client_user_id === s.id;
      if (!isStaff(s) && !isOwnClient) throw new Error('No autorizado para confirmar este cobro.');
      pay.status = 'confirmed'; pay.confirmed_by = s.id; pay.confirmed_at = new Date().toISOString();
      const c = db.clientProfiles.find(x => x.user_id === pay.client_user_id);
      const plan = db.plans.find(p => p.id === c.plan_id);
      const today = new Date().toISOString().slice(0, 10);
      // 'diario' vence el mismo día — nada de sumarle un día (antes daba
      // 24hs+ de regalo, ver 20260914000000_daily_plan_same_day_expiry.sql).
      const expiresIso = plan && plan.duration === 'diario'
        ? today
        : new Date(Date.now() + (plan && plan.duration === 'anual' ? 365 : 30) * 86400000).toISOString().slice(0, 10);
      c.membership_status = 'al_dia';
      c.last_payment_at = new Date().toISOString();
      c.membership_expires_at = expiresIso;

      // Aviso al staff SOLO si confirmó el propio cliente (escaneo) — si fue
      // el staff a mano, no hace falta avisarle a sí mismo (mismo criterio
      // que confirm_cash_payment() del lado real).
      if (isOwnClient) {
        const clientProfile = profileOf(pay.client_user_id);
        const collector = pay.created_by ? profileOf(pay.created_by) : null;
        const gym = db.gyms.find(g => g.id === pay.gym_id);
        const [dd, mm, yyyy] = [expiresIso.slice(8, 10), expiresIso.slice(5, 7), expiresIso.slice(0, 4)];
        const title = `${(clientProfile && clientProfile.name) || 'Un socio'} confirmó su pago por QR`;
        const body = `Cobrado por ${(collector && collector.name) || 'el mostrador (sin registrar)'} · ${pay.amount} ${(gym && gym.currency) || 'USD'} · Válido hasta ${dd}/${mm}/${yyyy}`;
        const staffIds = [
          ...db.profiles.filter(p => p.gym_id === pay.gym_id && p.role === 'owner').map(p => p.id),
          ...db.gymAdmins.filter(a => a.gym_id === pay.gym_id && a.status === 'approved').map(a => a.user_id),
        ];
        staffIds.forEach(recipientId => {
          db.staffNotifications.push({
            id: uid('sntf'), gym_id: pay.gym_id, recipient_user_id: recipientId, title, body,
            type: 'payment_confirmed', related_id: pay.id, created_at: new Date().toISOString(), read_at: null,
          });
          rtEmit('staff_notifications', `recipient_user_id=eq.${recipientId}`);
        });
      }
      emitPaymentChange(pay.client_user_id);
      rtEmit('payments', `gym_id=eq.${pay.gym_id}`);
    },
    async cancel(paymentId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el staff del gimnasio puede cancelar un cobro.');
      const pay = db.payments.find(p => p.id === paymentId);
      if (!pay || pay.status !== 'pending') throw new Error('Este cobro ya fue procesado.');
      pay.status = 'cancelled';
      emitPaymentChange(pay.client_user_id);
      rtEmit('payments', `gym_id=eq.${pay.gym_id}`);
    },
    async getPendingForClient(clientUserId) {
      await wait();
      const rows = db.payments.filter(p => p.client_user_id === clientUserId && p.status === 'pending');
      return rows.length ? { id: rows[0].id, amount: rows[0].amount, status: rows[0].status } : null;
    },
    async getById(paymentId) { await wait(); const p = db.payments.find(x => x.id === paymentId); return p ? { ...p } : null; },
    // Espejo de payments.subscribeToClient() del lado real — ver
    // paymentListeners más arriba. onChange se llama sin argumentos (igual
    // que el callback real, que tampoco se usa por su payload — ambos lados
    // solo lo usan como "algo cambió, volvé a preguntar").
    subscribeToClient(clientUserId, onChange) {
      if (!paymentListeners.has(clientUserId)) paymentListeners.set(clientUserId, new Set());
      paymentListeners.get(clientUserId).add(onChange);
      return () => {
        const set = paymentListeners.get(clientUserId);
        if (set) set.delete(onChange);
      };
    },
  };

  /* ---------------- reseñas ---------------- */

  const reviews = {
    async listForGym(gymId) {
      await wait();
      return db.reviews.filter(r => r.gym_id === gymId).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(r => ({ id: r.id, name: profileOf(r.client_user_id).name, rating: r.rating, text: r.text, date: r.created_at.slice(0, 10) }));
    },
    async add(gymId, clientUserId, rating, text) {
      await wait();
      db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: clientUserId, rating, text, created_at: new Date().toISOString() });
    },
  };

  /* ---------------- check-in ---------------- */
  // Espeja supabase-client.js: checkIn() es la única vía de escritura,
  // exige staff (isStaff, mismo helper de trainers.approve/reject) y que el
  // cliente pertenezca al gimnasio de quien registra.

  const checkins = {
    async checkIn(clientUserId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio registran un check-in.');
      const c = db.clientProfiles.find(x => x.user_id === clientUserId);
      const me = profileOf(s.id);
      if (!c || c.gym_id !== me.gym_id) throw new Error('Ese cliente no pertenece a tu gimnasio.');
      const row = { id: uid('chk'), gym_id: c.gym_id, client_user_id: clientUserId, checked_in_by: s.id, created_at: new Date().toISOString() };
      db.checkinEvents.push(row);
      await achievementsApi.evaluate(clientUserId);
      rtEmit('checkin_events', `gym_id=eq.${c.gym_id}`);
      return { ...row };
    },
    async listForClient(clientUserId, limit) {
      await wait();
      return db.checkinEvents.filter(e => e.client_user_id === clientUserId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit || 5)
        .map(e => ({ id: e.id, created_at: e.created_at }));
    },
    async listTodayForGym(gymId) {
      await wait();
      const today = new Date().toISOString().slice(0, 10);
      return db.checkinEvents.filter(e => e.gym_id === gymId && e.created_at.slice(0, 10) === today)
        .map(e => ({ client_user_id: e.client_user_id, created_at: e.created_at }));
    },
    // Etapa 2 — "Asistencia": un rango (típicamente el mes actual) en vez de
    // solo "hoy", para poder marcar el calendario con los días que tuvieron
    // check-ins reales.
    async listRangeForGym(gymId, fromIso, toIso) {
      await wait();
      return db.checkinEvents.filter(e => e.gym_id === gymId && e.created_at >= fromIso && e.created_at < toIso)
        .map(e => ({ client_user_id: e.client_user_id, created_at: e.created_at }));
    },
  };

  /* ---------------- plataforma (Fase 16 — alta de dueño interna) ---------------- */

  const platform = {
    // Callable sin sesión (quien abre el link todavía no se registró) —
    // espeja la función security definer del lado real, que también está
    // grant-eada a "anon".
    async checkOwnerInvite(token) {
      await wait();
      return db.ownerInvites.some(i => i.token === token && !i.used_at);
    },
    async createOwnerInvite(note) {
      await wait();
      const s = requireAuth();
      const me = profileOf(s.id);
      if (me.role !== 'platform_admin') throw new Error('Solo el administrador de la plataforma puede generar invitaciones de dueño.');
      const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      db.ownerInvites.push({ token, note: note || null, created_by: s.id, created_at: new Date().toISOString(), used_at: null, used_by_user_id: null });
      return token;
    },
    // Panel de plataforma (src/screens/platform.js) — todos los gimnasios +
    // su dueño (si ya completó create_gym()).
    async listGyms() {
      await wait();
      const s = requireAuth();
      const me = profileOf(s.id);
      if (me.role !== 'platform_admin') throw new Error('Solo el administrador de la plataforma puede ver esto.');
      return db.gyms.map(g => {
        const owner = db.profiles.find(p => p.gym_id === g.id && p.role === 'owner');
        return {
          id: g.id, name: g.name, address: g.address, currency: g.currency,
          brandName: g.brand_name || '', createdAt: g.created_at || new Date().toISOString(),
          ownerName: owner ? owner.name : '', ownerEmail: owner ? owner.email : '',
        };
      });
    },
  };

  const realtimeApi = {
    subscribe(table, filter, onChange) { return rtSubscribe(table, filter, onChange); },
  };

  window.BolaAPI = {
    auth, gyms, equipment, plans, trainers, admins, clients, photos, progress, routines, payments, reviews, checkins, platform,
    exercisesLib, programTemplates, classes: classesApi, achievements: achievementsApi, measurements, workouts: workoutsApi, trainerReviews: trainerReviewsApi, messages: messagesApi, notifications: notificationsApi,
    trainingProfile: trainingProfileApi,
    realtime: realtimeApi,
  };
  window.__mockDb = db; // solo para inspección desde la consola durante las pruebas
})();
