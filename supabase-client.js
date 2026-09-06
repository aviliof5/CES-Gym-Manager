/* Bolá — capa de acceso a datos sobre Supabase.
   Cada función mapea 1:1 a algo del esquema/backend (supabase/migrations).
   app.js no debería llamar a `supabase.from(...)` directo en ningún lado —
   solo a BolaAPI.* — así el mock de pruebas (mock-client.js) puede
   sustituir esta capa entera sin tocar app.js. */

'use strict';

(function () {
  const cfg = window.BOLA_CONFIG || {};
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  const PHOTO_BUCKET = 'photos';
  const SIGNED_URL_TTL = 60 * 60; // 1 hora

  // Empaquetada como app nativa (Capacitor), el link de confirmación de
  // Gmail no puede apuntar a http://localhost:3000 — en el celular eso es
  // el propio teléfono, no la PC de desarrollo. En su lugar apunta a un
  // esquema propio de la app; Android lo intercepta y reabre la app en vez
  // de un navegador. Requiere que este esquema esté agregado en Supabase
  // (Authentication → URL Configuration → Redirect URLs) y en
  // AndroidManifest.xml (intent-filter con este mismo scheme).
  const NATIVE_AUTH_CALLBACK = 'com.ces.gymmanager://auth-callback';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // Los campos de correo en la UI solo capturan la parte local (el sufijo
  // @gmail.com se muestra fijo al lado, ver emailField() en app.js) — acá
  // se completa antes de mandarlo a Supabase. Si ya viene con "@" (valor
  // legado, o alguien lo pasó completo) se respeta tal cual.
  function normalizeEmail(raw) {
    const v = (raw || '').trim();
    return v.includes('@') ? v : `${v}@gmail.com`;
  }

  function unwrap({ data, error }) {
    if (error) throw error;
    return data;
  }

  /* ---------------- auth ---------------- */

  const auth = {
    // El dueño crea el gimnasio (create_gym() exige role='owner' en el
    // servidor) — ver docs/MIGRATION_PLAN.md Fase 4. No inserta fila en
    // ninguna tabla aparte: su único dato extra (el gimnasio) lo setea
    // create_gym() en gyms.owner_user_id/profiles.gym_id.
    async signUpOwner({ name, email, phone, password }) {
      return unwrap(await client.auth.signUp({
        email: normalizeEmail(email), password,
        options: { data: { role: 'owner', name, phone }, emailRedirectTo: isNative() ? NATIVE_AUTH_CALLBACK : undefined },
      }));
    },

    // El administrador se une a un gimnasio ya creado por el dueño (igual
    // que un entrenador) y queda pendiente de aprobación — handle_new_user()
    // ya inserta la fila en gym_admins con status='pending'.
    async signUpAdmin({ name, email, phone, password }) {
      return unwrap(await client.auth.signUp({
        email: normalizeEmail(email), password,
        options: { data: { role: 'admin', name, phone }, emailRedirectTo: isNative() ? NATIVE_AUTH_CALLBACK : undefined },
      }));
    },

    async signUpTrainer({ name, email, phone, password, specialty, price }) {
      return unwrap(await client.auth.signUp({
        email: normalizeEmail(email), password,
        options: { data: { role: 'trainer', name, phone, specialty, price }, emailRedirectTo: isNative() ? NATIVE_AUTH_CALLBACK : undefined },
      }));
    },

    async signUpClient({ name, email, phone, password }) {
      return unwrap(await client.auth.signUp({
        email: normalizeEmail(email), password,
        options: { data: { role: 'client', name, phone }, emailRedirectTo: isNative() ? NATIVE_AUTH_CALLBACK : undefined },
      }));
    },

    async signIn({ email, password }) {
      return unwrap(await client.auth.signInWithPassword({ email: normalizeEmail(email), password }));
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    // Llamada cuando la app nativa se abre por el deep link del correo de
    // confirmación (com.ces.gymmanager://auth-callback#access_token=...).
    // Supabase pone los tokens en el fragment (#), no en query params, así
    // que hay que parsearlos a mano — no llegan por window.location porque
    // el link no navega un navegador, lo recibe el plugin App como string.
    // Si el link venció o ya se usó, Supabase manda #error_description en
    // vez de tokens; se relanza como Error para que la UI lo muestre.
    async setSessionFromUrl(url) {
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return null;
      const params = new URLSearchParams(url.slice(hashIndex + 1));
      const errorDescription = params.get('error_description');
      if (errorDescription) throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return null;
      return unwrap(await client.auth.setSession({ access_token, refresh_token }));
    },

    async getSession() {
      // supabase-js envuelve la sesión en { session }, no la devuelve
      // directa — a diferencia de casi todo lo demás en este archivo,
      // unwrap() sola no alcanza acá (se queda con el objeto envoltorio,
      // que es truthy aunque session sea null, y boot() nunca detecta que
      // no hay sesión activa).
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async getMyProfile() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return null;
      return unwrap(await client.from('profiles').select('id, role, gym_id, name, email, phone, is_platform_admin').eq('id', user.id).single());
    },
  };

  /* ---------------- gimnasio ---------------- */

  const gyms = {
    async listAll() {
      return unwrap(await client.from('gyms').select('id, name, address, hours').order('name', { ascending: true }));
    },

    async get(gymId) {
      return unwrap(await client.from('gyms').select('id, name, address, hours, invite_code, currency, brand_name, brand_color').eq('id', gymId).single());
    },

    // Resolución del link/código de invitación (sección 10 del pedido
    // original, generalizado en la Fase 16 a los 3 roles -- ver
    // gym_invites) -- no es un chequeo de seguridad, gyms ya es público para
    // cualquier autenticado; join_gym() sigue siendo quien de verdad valida
    // la unión. Devuelve null en vez de lanzar si el código no existe, para
    // que el llamador pueda caer al selector manual sin un try/catch propio.
    // Ya no asume "cliente": cada link es de un rol específico, así que
    // devuelve ambos (gym Y rol).
    async getByInviteCode(code) {
      const { data, error } = await client.from('gym_invites').select('role, gyms!inner(id, name, address, hours)').eq('code', code).maybeSingle();
      if (error) throw error;
      return data ? { gym: data.gyms, role: data.role } : null;
    },

    // Los 3 códigos de ESTE gimnasio -- lo carga el dueño/admin al entrar al
    // panel (ver actions.js enterOwnerDash) para mostrar las 3 tarjetas de
    // invitación (Clientes/Coaches/Admins).
    async getInvites(gymId) {
      const rows = unwrap(await client.from('gym_invites').select('role, code').eq('gym_id', gymId));
      const map = { client: null, admin: null, trainer: null };
      rows.forEach(r => { map[r.role] = r.code; });
      return map;
    },

    // p_owner_invite_token: Fase 16, create_gym() ahora exige un token de
    // invitación de dueño válido y sin usar (ver docs/SECURITY_AUDIT.md) --
    // sin esto, el RPC rechaza con un error claro.
    async create({ name, address, hours, ownerInviteToken }) {
      return unwrap(await client.rpc('create_gym', { p_name: name, p_address: address, p_hours: hours, p_owner_invite_token: ownerInviteToken }));
    },

    async regenerateInvite(role) {
      return unwrap(await client.rpc('regenerate_gym_invite', { p_role: role }));
    },

    // Etapa 2 — "Configuración" (pantalla nueva). update_gym_settings()
    // exige app_role_is_staff() en el servidor (owner O admin) — la RLS de
    // gyms por sí sola solo dejaría escribir al dueño (ver la migración).
    async updateSettings(gymId, { currency, brandName, brandColor }) {
      const { error } = await client.rpc('update_gym_settings', { p_currency: currency, p_brand_name: brandName || null, p_brand_color: brandColor || null });
      if (error) throw error;
    },

    async join(gymId) {
      const { error } = await client.rpc('join_gym', { p_gym_id: gymId });
      if (error) throw error;
    },
  };

  /* ---------------- equipo ---------------- */

  const equipment = {
    async list(gymId) {
      return unwrap(await client.from('equipment').select('id, name').eq('gym_id', gymId).order('created_at'));
    },
    async add(gymId, name) {
      return unwrap(await client.from('equipment').insert({ gym_id: gymId, name }).select('id, name').single());
    },
    async remove(id) {
      const { error } = await client.from('equipment').delete().eq('id', id);
      if (error) throw error;
    },
  };

  /* ---------------- planes ---------------- */

  const plans = {
    async list(gymId) {
      return unwrap(await client.from('plans').select('id, name, price, duration').eq('gym_id', gymId).order('created_at'));
    },
    async add(gymId, { name, price, duration }) {
      return unwrap(await client.from('plans').insert({ gym_id: gymId, name, price, duration }).select().single());
    },
    async update(id, { name, price, duration }) {
      return unwrap(await client.from('plans').update({ name, price, duration }).eq('id', id).select().single());
    },
    async remove(id) {
      const { error } = await client.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
  };

  /* ---------------- entrenadores ---------------- */
  // `trainers` no tiene nombre/correo propios — vienen de `profiles` vía el
  // FK trainers.user_id -> profiles.id, que PostgREST puede embeber directo.

  const TRAINER_SELECT = 'user_id, specialty, price, status, is_active, profiles!inner(name, email, phone)';

  function shapeTrainer(row) {
    return {
      id: row.user_id,
      name: row.profiles.name,
      email: row.profiles.email,
      phone: row.profiles.phone,
      specialty: row.specialty,
      price: Number(row.price),
      status: row.status,
      isActive: row.is_active !== false,
    };
  }

  const trainers = {
    async listForGym(gymId) {
      const rows = unwrap(await client.from('trainers').select(TRAINER_SELECT).eq('gym_id', gymId));
      return rows.map(shapeTrainer);
    },
    async listApprovedForGym(gymId) {
      const rows = unwrap(await client.from('trainers').select(TRAINER_SELECT).eq('gym_id', gymId).eq('status', 'approved'));
      return rows.map(shapeTrainer);
    },
    async approve(userId) {
      const { error } = await client.rpc('approve_trainer', { p_trainer_user_id: userId });
      if (error) throw error;
    },
    async reject(userId) {
      const { error } = await client.rpc('reject_trainer', { p_trainer_user_id: userId });
      if (error) throw error;
    },
    async updateProfile(userId, { specialty, price }) {
      const { error } = await client.from('trainers').update({ specialty, price }).eq('user_id', userId);
      if (error) throw error;
    },
    async setActive(userId, active) {
      const { error } = await client.rpc('set_trainer_active', { p_trainer_user_id: userId, p_active: active });
      if (error) throw error;
    },

    // "10 clientes interesados" (sección 11 del pedido original) — el
    // conteo real lo hace approve_trainer() en el servidor, esto es solo
    // para que la UI muestre el progreso. mark/unmarkInterest pasan por RPC
    // (security definer): un cliente nunca inserta/borra la fila directo.
    async markInterest(candidateUserId) {
      const { error } = await client.rpc('mark_trainer_interest', { p_candidate_user_id: candidateUserId });
      if (error) throw error;
    },
    async unmarkInterest(candidateUserId) {
      const { error } = await client.rpc('unmark_trainer_interest', { p_candidate_user_id: candidateUserId });
      if (error) throw error;
    },
    async listInterestForGym(gymId) {
      return unwrap(await client.from('trainer_candidate_interest').select('candidate_user_id, client_user_id').eq('gym_id', gymId));
    },
  };

  /* ---------------- administradores (aprobación por el dueño) ---------------- */
  // Igual patrón que `trainers`: gym_admins no tiene nombre/correo propios —
  // vienen de `profiles` vía el FK gym_admins.user_id -> profiles.id.

  const ADMIN_SELECT = 'user_id, status, profiles!inner(name, email, phone)';

  function shapeGymAdmin(row) {
    return { id: row.user_id, name: row.profiles.name, email: row.profiles.email, phone: row.profiles.phone, status: row.status };
  }

  const admins = {
    async listForGym(gymId) {
      const rows = unwrap(await client.from('gym_admins').select(ADMIN_SELECT).eq('gym_id', gymId));
      return rows.map(shapeGymAdmin);
    },
    async approve(userId) {
      const { error } = await client.rpc('approve_admin', { p_admin_user_id: userId });
      if (error) throw error;
    },
    async reject(userId) {
      const { error } = await client.rpc('reject_admin', { p_admin_user_id: userId });
      if (error) throw error;
    },
  };

  /* ---------------- clientes ---------------- */

  const CLIENT_SELECT = `
    user_id, gym_id, plan_id, trainer_user_id, face_photo_key,
    weight, height, age, level, goal,
    membership_status, membership_expires_at, last_payment_at, created_at,
    profiles!inner(name, email, phone)
  `;

  function shapeClient(row) {
    return {
      id: row.user_id,
      name: row.profiles.name,
      email: row.profiles.email,
      phone: row.profiles.phone,
      planId: row.plan_id,
      trainerUserId: row.trainer_user_id,
      facePhotoKey: row.face_photo_key,
      physical: { weight: row.weight, height: row.height, age: row.age, level: row.level, goal: row.goal },
      status: row.membership_status,
      membershipExpiresAt: row.membership_expires_at,
      lastPaymentAt: row.last_payment_at,
      createdAt: row.created_at,
    };
  }

  const clients = {
    async listForGym(gymId) {
      const rows = unwrap(await client.from('client_profiles').select(CLIENT_SELECT).eq('gym_id', gymId));
      return rows.map(shapeClient);
    },
    async getSelf(userId) {
      const row = unwrap(await client.from('client_profiles').select(CLIENT_SELECT).eq('user_id', userId).single());
      return shapeClient(row);
    },
    async updatePhysical(userId, { weight, height, age, level, goal }) {
      const { error } = await client.from('client_profiles').update({ weight, height, age, level, goal }).eq('user_id', userId);
      if (error) throw error;
    },
    async choosePlan(userId, planId) {
      const { error } = await client.from('client_profiles').update({ plan_id: planId }).eq('user_id', userId);
      if (error) throw error;
    },
    async chooseTrainer(userId, trainerUserId) {
      const { error } = await client.from('client_profiles').update({ trainer_user_id: trainerUserId }).eq('user_id', userId);
      if (error) throw error;
    },
    async setFacePhotoKey(userId, key) {
      const { error } = await client.from('client_profiles').update({ face_photo_key: key }).eq('user_id', userId);
      if (error) throw error;
    },
    async suspend(userId, reason) {
      const { error } = await client.rpc('suspend_client', { p_client_user_id: userId, p_reason: reason || null });
      if (error) throw error;
    },
    async unsuspend(userId) {
      const { error } = await client.rpc('unsuspend_client', { p_client_user_id: userId });
      if (error) throw error;
    },
  };

  /* ---------------- fotos (storage) ---------------- */
  // Ruta: {gymId}/{clientUserId}/face.jpg  ó  {gymId}/{clientUserId}/progress/{fecha}.jpg
  // (ver supabase/migrations/..._storage.sql — las políticas leen esos dos
  // primeros segmentos de la ruta).

  const photos = {
    facePath: (gymId, clientUserId) => `${gymId}/${clientUserId}/face.jpg`,
    progressPath: (gymId, clientUserId, dateStr) => `${gymId}/${clientUserId}/progress/${dateStr}.jpg`,

    async upload(path, file) {
      const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      return path;
    },

    async signedUrl(path) {
      if (!path) return null;
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
      if (error) throw error;
      return data.signedUrl;
    },
  };

  /* ---------------- progreso ---------------- */

  const progress = {
    async listForClient(clientUserId) {
      return unwrap(await client.from('progress_photos').select('id, storage_key, taken_at').eq('client_user_id', clientUserId).order('taken_at', { ascending: false }));
    },
    // Idempotente: si ya existe una foto de hoy, la devuelve en vez de fallar
    // por la restricción unique(client_user_id, taken_at).
    async ensureToday(clientUserId) {
      const today = new Date().toISOString().slice(0, 10);
      const existing = unwrap(await client.from('progress_photos').select('id, storage_key, taken_at').eq('client_user_id', clientUserId).eq('taken_at', today));
      if (existing.length) return existing[0];
      return unwrap(await client.from('progress_photos').insert({ client_user_id: clientUserId, taken_at: today }).select('id, storage_key, taken_at').single());
    },
    async setPhoto(progressId, storageKey) {
      const { error } = await client.from('progress_photos').update({ storage_key: storageKey }).eq('id', progressId);
      if (error) throw error;
    },
  };

  /* ---------------- rutinas ---------------- */

  async function ensureRoutine(clientUserId, source, goal, authorUserId) {
    let q = client.from('routines').select('id').eq('client_user_id', clientUserId).eq('source', source);
    q = source === 'ia' ? q.eq('goal', goal) : q.is('goal', null);
    const found = unwrap(await q);
    if (found.length) return found[0].id;
    const created = unwrap(await client.from('routines')
      .insert({ client_user_id: clientUserId, source, goal: source === 'ia' ? goal : null, author_user_id: authorUserId })
      .select('id').single());
    return created.id;
  }

  // Etapa 2 — cada fila de routine_exercises trae ahora exercise_id/sets/
  // reps/weight_kg/rest_seconds además del texto de siempre (ver
  // supabase/migrations/20260905000300_etapa2_features_schema.sql). Se
  // exponen en camelCase, igual que mock-client.js.
  function shapeRoutineExercise(e) {
    return { id: e.id, text: e.text, exerciseId: e.exercise_id, sets: e.sets, reps: e.reps, weightKg: e.weight_kg, restSeconds: e.rest_seconds };
  }

  async function loadRoutine(clientUserId, source, goal) {
    let q = client.from('routines').select('id, updated_at').eq('client_user_id', clientUserId).eq('source', source);
    q = source === 'ia' ? q.eq('goal', goal) : q.is('goal', null);
    const rows = unwrap(await q);
    if (!rows.length) return { id: null, exercises: [] };
    const exercises = unwrap(await client.from('routine_exercises')
      .select('id, text, exercise_id, sets, reps, weight_kg, rest_seconds').eq('routine_id', rows[0].id).order('position'));
    return { id: rows[0].id, exercises: exercises.map(shapeRoutineExercise) };
  }

  const routines = {
    getAi: (clientUserId, goal) => loadRoutine(clientUserId, 'ia', goal),
    getTrainer: (clientUserId) => loadRoutine(clientUserId, 'trainer', null),

    // `entries` son objetos {text, sets, reps, weightKg, restSeconds,
    // exerciseId}, no strings sueltos — ver buildRoutine() en src/helpers.js.
    async generateAi(clientUserId, goal, entries) {
      const routineId = await ensureRoutine(clientUserId, 'ia', goal, null);
      const { error: delErr } = await client.from('routine_exercises').delete().eq('routine_id', routineId);
      if (delErr) throw delErr;
      if (entries.length) {
        const rows = entries.map((ex, i) => ({
          routine_id: routineId, position: i, text: ex.text, exercise_id: ex.exerciseId || null,
          sets: ex.sets ?? null, reps: ex.reps ?? null, weight_kg: ex.weightKg ?? null, rest_seconds: ex.restSeconds ?? 60,
        }));
        const { error } = await client.from('routine_exercises').insert(rows);
        if (error) throw error;
      }
    },

    async addTrainerExercise(clientUserId, trainerUserId, entry) {
      const routineId = await ensureRoutine(clientUserId, 'trainer', null, trainerUserId);
      const maxRows = unwrap(await client.from('routine_exercises').select('position').eq('routine_id', routineId).order('position', { ascending: false }).limit(1));
      const nextPosition = maxRows.length ? maxRows[0].position + 1 : 0;
      const { error } = await client.from('routine_exercises').insert({
        routine_id: routineId, position: nextPosition, text: entry.text, exercise_id: entry.exerciseId || null,
        sets: entry.sets ?? null, reps: entry.reps ?? null, weight_kg: entry.weightKg ?? null, rest_seconds: entry.restSeconds ?? 60,
      });
      if (error) throw error;
    },

    async removeExercise(exerciseId) {
      const { error } = await client.from('routine_exercises').delete().eq('id', exerciseId);
      if (error) throw error;
    },
  };

  /* ---------------- cobros en efectivo ---------------- */
  // create/confirm/cancel pasan por RPC a propósito — son las únicas
  // funciones que pueden tocar payments/membership_status, y exigen rol
  // admin en el servidor. Ver supabase/migrations/..._functions.sql.

  const payments = {
    async createCashCharge(clientUserId) {
      return unwrap(await client.rpc('create_cash_charge', { p_client_user_id: clientUserId }));
    },
    async confirm(paymentId) {
      const { error } = await client.rpc('confirm_cash_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    async cancel(paymentId) {
      const { error } = await client.rpc('cancel_cash_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    async getPendingForClient(clientUserId) {
      const rows = unwrap(await client.from('payments').select('id, amount, status').eq('client_user_id', clientUserId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1));
      return rows[0] || null;
    },
    async getById(paymentId) {
      return unwrap(await client.from('payments').select('id, client_user_id, amount, status').eq('id', paymentId).single());
    },
  };

  /* ---------------- reseñas ---------------- */

  const reviews = {
    async listForGym(gymId) {
      // reviews.client_user_id -> client_profiles.user_id -> profiles.id:
      // dos saltos, no uno — PostgREST no infiere un embed directo
      // reviews->profiles porque no hay FK directa entre esas dos tablas.
      const rows = unwrap(await client.from('reviews')
        .select('id, rating, text, created_at, client_profiles!inner(profiles!inner(name))')
        .eq('gym_id', gymId).order('created_at', { ascending: false }));
      return rows.map(r => ({ id: r.id, name: r.client_profiles.profiles.name, rating: r.rating, text: r.text, date: r.created_at.slice(0, 10) }));
    },
    async add(gymId, clientUserId, rating, text) {
      const { error } = await client.from('reviews').insert({ gym_id: gymId, client_user_id: clientUserId, rating, text });
      if (error) throw error;
    },
  };

  /* ---------------- check-in ---------------- */
  // check_in_client() es la única vía de escritura (security definer, exige
  // staff en el servidor) — ver supabase/migrations/20260904000100_checkin_events.sql.
  // El cliente nunca escribe su propio check-in.

  const checkins = {
    async checkIn(clientUserId) {
      return unwrap(await client.rpc('check_in_client', { p_client_user_id: clientUserId }));
    },
    async listForClient(clientUserId, limit) {
      return unwrap(await client.from('checkin_events').select('id, created_at')
        .eq('client_user_id', clientUserId).order('created_at', { ascending: false }).limit(limit || 5));
    },
    // "Hoy" aproximado por UTC (misma precisión que el resto de la app usa
    // para fechas, ej. membership_expires_at) — alcanza para el badge
    // "✓ Hoy" del panel de staff, no es un reporte de asistencia preciso.
    async listTodayForGym(gymId) {
      const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
      return unwrap(await client.from('checkin_events').select('client_user_id, created_at')
        .eq('gym_id', gymId).gte('created_at', todayStart).order('created_at', { ascending: false }));
    },
    // Etapa 2 — "Asistencia": un rango (típicamente el mes actual) en vez de
    // solo "hoy", para poder marcar el calendario con los días que tuvieron
    // check-ins reales.
    async listRangeForGym(gymId, fromIso, toIso) {
      return unwrap(await client.from('checkin_events').select('client_user_id, created_at')
        .eq('gym_id', gymId).gte('created_at', fromIso).lt('created_at', toIso));
    },
  };

  /* ---------------- plataforma (Fase 16 — alta de dueño interna) ---------------- */

  const platform = {
    // Callable sin sesión (quien abre el link todavía no se registró) --
    // grant-eada a "anon" del lado del servidor (ver la migración). Solo
    // devuelve un booleano, nunca expone la tabla de tokens.
    async checkOwnerInvite(token) {
      return unwrap(await client.rpc('check_owner_invite', { p_token: token }));
    },
    async createOwnerInvite(note) {
      return unwrap(await client.rpc('create_owner_invite', { p_note: note }));
    },
    // Panel de plataforma (src/screens/platform.js) — todos los gimnasios +
    // su dueño. Gate real es platform_list_gyms() en el servidor (exige
    // app_is_platform_admin()).
    async listGyms() {
      const rows = unwrap(await client.rpc('platform_list_gyms'));
      return rows.map(g => ({
        id: g.id, name: g.name, address: g.address, currency: g.currency,
        brandName: g.brand_name, createdAt: g.created_at,
        ownerName: g.owner_name, ownerEmail: g.owner_email,
      }));
    },
  };

  /* ---------------- biblioteca de ejercicios ---------------- */

  const exercisesLib = {
    async list(gymId) {
      const rows = unwrap(await client.from('exercises').select('id, gym_id, name, muscle_group, equipment_name, media_key, description')
        .or(`gym_id.is.null,gym_id.eq.${gymId}`));
      return rows.map(e => ({ id: e.id, gymId: e.gym_id, name: e.name, muscleGroup: e.muscle_group, equipmentName: e.equipment_name, mediaKey: e.media_key, description: e.description }));
    },
    async add(gymId, { name, muscleGroup, equipmentName, description }) {
      const row = unwrap(await client.from('exercises')
        .insert({ gym_id: gymId, name, muscle_group: muscleGroup || 'General', equipment_name: equipmentName || null, description: description || null })
        .select('id').single());
      return row.id;
    },
  };

  /* ---------------- clases y reservas ---------------- */

  const classesApi = {
    async listForGym(gymId) {
      return unwrap(await client.from('classes').select('id, gym_id, name, description, trainer_user_id, duration_minutes, capacity').eq('gym_id', gymId));
    },
    async listSessions(gymId, fromIso) {
      let q = client.from('class_sessions').select('id, class_id, gym_id, starts_at, classes(id, name, description, trainer_user_id, duration_minutes, capacity)').eq('gym_id', gymId);
      if (fromIso) q = q.gte('starts_at', fromIso);
      const rows = unwrap(await q.order('starts_at'));
      return rows.map(s => ({ id: s.id, class_id: s.class_id, gym_id: s.gym_id, starts_at: s.starts_at, class: s.classes }));
    },
    async listMyBookings(clientUserId) {
      return unwrap(await client.from('class_bookings').select('id, session_id, client_user_id, gym_id, status').eq('client_user_id', clientUserId).eq('status', 'reservado'));
    },
    async book(sessionId) {
      return unwrap(await client.rpc('book_class', { p_session_id: sessionId }));
    },
    async cancelBooking(bookingId) {
      const { error } = await client.rpc('cancel_booking', { p_booking_id: bookingId });
      if (error) throw error;
    },
  };

  /* ---------------- logros ---------------- */
  // El progreso lo recalcula el servidor (evaluate_achievements(), disparado
  // por finish_workout_session() y check_in_client()) — el frontend solo lee.

  const achievementsApi = {
    async listCatalog() {
      return unwrap(await client.from('achievements').select('id, code, name, description, icon, target, metric'));
    },
    async listForClient(clientUserId) {
      return unwrap(await client.from('client_achievements').select('client_user_id, achievement_id, progress, earned_at').eq('client_user_id', clientUserId));
    },
  };

  /* ---------------- medidas corporales ---------------- */

  const measurements = {
    async listForClient(clientUserId) {
      return unwrap(await client.from('body_measurements')
        .select('id, client_user_id, taken_at, weight_kg, body_fat_pct, waist_cm, chest_cm, arm_cm, thigh_cm')
        .eq('client_user_id', clientUserId).order('taken_at'));
    },
    async recordToday(clientUserId, values) {
      const today = new Date().toISOString().slice(0, 10);
      const row = { client_user_id: clientUserId, taken_at: today, weight_kg: values.weight_kg, body_fat_pct: values.body_fat_pct, waist_cm: values.waist_cm, chest_cm: values.chest_cm, arm_cm: values.arm_cm, thigh_cm: values.thigh_cm };
      const { error } = await client.from('body_measurements').upsert(row, { onConflict: 'client_user_id,taken_at' });
      if (error) throw error;
    },
  };

  /* ---------------- récords personales + sesiones de entrenamiento ---------------- */

  const workoutsApi = {
    async start(clientUserId, gymId, source) {
      const row = unwrap(await client.from('workout_sessions').insert({ client_user_id: clientUserId, gym_id: gymId, source }).select('id').single());
      return row.id;
    },
    async logSet(sessionId, clientUserId, exerciseName, setNumber, reps, weightKg) {
      const { error } = await client.from('exercise_logs').insert({ workout_session_id: sessionId, client_user_id: clientUserId, exercise_name: exerciseName, set_number: setNumber, reps: reps ?? null, weight_kg: weightKg ?? null });
      if (error) throw error;
    },
    // clientUserId no lo usa el RPC (resuelve auth.uid() del lado del
    // servidor) — se acepta igual para que el call site sea idéntico al del
    // mock, que sí lo necesita para su chequeo de dueño en memoria.
    async finish(sessionId, _clientUserId) {
      const { error } = await client.rpc('finish_workout_session', { p_session_id: sessionId });
      if (error) throw error;
    },
    async getPersonalRecords(clientUserId) {
      const rows = unwrap(await client.rpc('get_personal_records', { p_client_user_id: clientUserId }));
      return rows.map(r => ({ exerciseName: r.exercise_name, maxWeightKg: r.max_weight_kg, achievedAt: r.achieved_at }));
    },
    async countThisMonth(clientUserId) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const rows = unwrap(await client.from('workout_sessions').select('id').eq('client_user_id', clientUserId).not('finished_at', 'is', null).gte('finished_at', monthStart));
      return rows.length;
    },
  };

  /* ---------------- rating de entrenador ---------------- */

  const trainerReviewsApi = {
    async listForTrainer(trainerUserId) {
      return unwrap(await client.from('trainer_reviews').select('id, trainer_user_id, client_user_id, rating, text, created_at').eq('trainer_user_id', trainerUserId));
    },
    async rate(trainerUserId, rating, text) {
      const { error } = await client.rpc('rate_trainer', { p_trainer_user_id: trainerUserId, p_rating: rating, p_text: text || null });
      if (error) throw error;
    },
  };

  /* ---------------- mensajes entrenador <-> cliente ---------------- */

  const messagesApi = {
    async getOrCreateConversation(otherUserId) {
      return unwrap(await client.rpc('get_or_create_conversation', { p_other_user_id: otherUserId }));
    },
    async list(conversationId) {
      return unwrap(await client.from('messages').select('id, conversation_id, sender_user_id, body, created_at, read_at').eq('conversation_id', conversationId).order('created_at'));
    },
    async send(conversationId, body) {
      const { data: { user } } = await client.auth.getUser();
      const row = unwrap(await client.from('messages').insert({ conversation_id: conversationId, sender_user_id: user.id, body }).select('id').single());
      return row.id;
    },
    async listConversationsForTrainer(trainerUserId) {
      return unwrap(await client.from('conversations').select('id, gym_id, trainer_user_id, client_user_id').eq('trainer_user_id', trainerUserId));
    },
  };

  window.BolaAPI = {
    auth, gyms, equipment, plans, trainers, admins, clients, photos, progress, routines, payments, reviews, checkins, platform,
    exercisesLib, classes: classesApi, achievements: achievementsApi, measurements, workouts: workoutsApi, trainerReviews: trainerReviewsApi, messages: messagesApi,
  };
})();
