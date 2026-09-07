-- Bolá — rutina "Personalizada" (el cliente arma la suya, no solo IA o la
-- de su entrenador) + estructura semanal real: cada ejercicio de una
-- rutina puede quedar asignado a un día de la semana concreto (0=Lunes..
-- 6=Domingo, mismo criterio que dayIndexMon()/DAY_LABELS en el resto de la
-- app), así "Entrenamiento de hoy" en Inicio muestra lo que le toca ESE
-- día en vez de la rutina entera de una sola vez.
--
-- day_of_week es nullable y no reemplaza a day_label (que ya existía para
-- los programas aplicados, con etiquetas libres tipo "Push"/"Día 1"): una
-- rutina semanal de verdad completa los dos juntos (day_label = nombre del
-- día, para mostrar; day_of_week = el número, para poder filtrar "hoy").
-- Las rutinas que ya existían (con IA, o armadas sin día) siguen sin
-- day_of_week — seguen viéndose como una sola lista, nada se rompe.
--
-- OJO al aplicar: "alter type ... add value" no puede usarse en la misma
-- transacción en la que se lo referencia (restricción real de Postgres) —
-- correr el ALTER TYPE solo, esperar a que quede confirmado, y recién
-- después el resto de este archivo (índice único + policy que sí lo usan).

alter type routine_source add value if not exists 'personal';
