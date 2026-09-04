/* Bolá — estado global de la app + setState().
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md). `render` se
   importa de router.js: es un import circular con router.js (que a su vez
   importa `state`/`setState` de acá), pero es seguro en ES modules — ninguno
   de los dos módulos llama a un export del otro durante su propia
   evaluación de nivel superior, solo dentro de funciones que se invocan
   después de que todo el grafo de módulos terminó de cargar. */
'use strict';

import { render } from './router.js';

export const state = {
  screen: 'boot',
  session: null,
  myProfile: null,   // {id, role, gym_id, name, email, phone}
  gym: null,          // {id, name, address, hours}
  busy: false,
  error: '',
  offline: !navigator.onLine,
  showPassword: false,

  ownerTab: 'clientes',
  clientTab: 'inicio',
  trainerTab: 'clientes',

  // Dueño: crea el gimnasio — antes lo hacía "admin", ver docs/MIGRATION_PLAN.md Fase 4.
  ownerAuthMode: 'login',
  ownerLoginEmail: '', ownerLoginPassword: '', ownerLoginError: '',
  ownerReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '' },
  gymReg: { name: '', address: '', hours: '' },

  // Administrador: ahora se une a un gimnasio YA creado por el dueño y queda
  // pendiente de aprobación — mismo patrón que un entrenador (ver trainerReg
  // más abajo). adminReg no necesita specialty/price, a diferencia de trainerReg.
  adminAuthMode: 'login',
  adminLoginEmail: '', adminLoginPassword: '', adminLoginError: '',
  adminReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '' },
  pendingAdminName: '',
  gymAdminsForGym: [],   // gym_admins de ESTE gimnasio — lo carga el dueño para aprobar/rechazar

  equipment: [],
  newEquipment: '',

  plans: [],
  newPlanName: '', newPlanPrice: '', newPlanDuration: 'Mensual', editingPlanId: null,

  clientsForGym: [],
  trainersForGym: [],
  billingFilter: 'mensual',
  activeCharge: null,   // {paymentId, clientId, clientName, amount, status}

  reviews: [],
  newCommentText: '', newCommentRating: 5,

  clientAuthMode: 'login',
  clientLoginEmail: '', clientLoginPassword: '', clientLoginError: '',
  clientReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '', photoFile: null, photoPreviewUrl: null },
  clientPhysicalReg: { weight: '', height: '', age: '', level: 'principiante', goal: 'perder_peso' },
  approvedTrainersForReg: [],
  selectedPlanId: null, wantsTrainer: null, selectedTrainerId: null,
  gymList: [], selectedGymId: null, gymPickerNext: null,

  myClient: null,
  myClientPlan: null,
  myClientTrainer: null,
  progressList: [],
  routineSource: 'ia',
  aiGoal: 'perder_peso',
  aiRoutine: null,          // {id, exercises:[{id,text}]}
  trainerRoutineForMe: null,
  pendingPayment: null,     // {id, amount, status}
  clientVisitHour: null,

  // Sesión de entrenamiento en curso (pantalla "workout" — ver
  // docs/ARCHITECTURE_AUDIT.md gap de rutinas). Vive solo en memoria: no hay
  // tabla de sesiones/sets en el backend todavía, así que no se persiste
  // nada acá — es honesto mostrarlo como progreso de ESTA sesión, no
  // guardarlo como si existiera esa tabla.
  // { exercises:[{id,text}], source:'ia'|'trainer', index, doneSets:{[exerciseIndex]: Set<number>|true}, restSecondsLeft, finished }
  workout: null,

  trainerAuthMode: 'login',
  trainerLoginEmail: '', trainerLoginPassword: '', trainerLoginError: '',
  trainerReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '', specialty: '', price: '' },
  pendingTrainerName: '',

  myTrainer: null,
  trainerClients: [],
  trainerSelectedClientId: null,
  trainerSelectedClientDetail: null,   // {progress:[], routine:{id,exercises}}
  trainerRoutineDraftText: '',
  trainerProfileDraft: { specialty: '', price: '' },
};

export function setState(patch) {
  Object.assign(state, patch);
  render();
}
