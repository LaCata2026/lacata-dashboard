-- ══════════════════════════════════════════════════════════════════
-- RLS — lacata-dashboard
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- ── Funciones auxiliares (SECURITY DEFINER evita recursión circular) ──
-- Leen la fila del usuario actual sin aplicar RLS sobre `usuarios`

CREATE OR REPLACE FUNCTION lc_user_role()
RETURNS text AS $$
  SELECT role FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION lc_user_team_id()
RETURNS uuid AS $$
  SELECT team_id FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ══════════════════════════════════════════════════════════════════
-- TABLA: tareas
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;

-- Borrar policies previas si las hay
DROP POLICY IF EXISTS "tareas_select" ON tareas;
DROP POLICY IF EXISTS "tareas_insert" ON tareas;
DROP POLICY IF EXISTS "tareas_update" ON tareas;
DROP POLICY IF EXISTS "tareas_delete" ON tareas;

-- SELECT: directors y cuentas ven todo; colaboradores solo ven
-- tareas asignadas a ellos o de su equipo
-- El operador ? verifica si el UUID existe como elemento en el jsonb array
CREATE POLICY "tareas_select" ON tareas
  FOR SELECT USING (
    lc_user_role() IN ('director', 'cuentas')
    OR assigned_to ? auth.uid()::text
    OR team_id = lc_user_team_id()
  );

-- INSERT: solo directors y cuentas crean tareas
CREATE POLICY "tareas_insert" ON tareas
  FOR INSERT WITH CHECK (
    lc_user_role() IN ('director', 'cuentas')
  );

-- UPDATE: cualquier usuario autenticado puede actualizar
-- (el control fino de qué campos puede editar queda en la app)
CREATE POLICY "tareas_update" ON tareas
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- DELETE: solo directors
CREATE POLICY "tareas_delete" ON tareas
  FOR DELETE USING (lc_user_role() = 'director');


-- ══════════════════════════════════════════════════════════════════
-- TABLA: usuarios
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;

-- SELECT: todos los autenticados ven todos los perfiles
-- (necesario para mostrar nombres y avatares en las tarjetas)
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: propio perfil (primer login) o director/service role
CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT WITH CHECK (
    id = auth.uid() OR lc_user_role() = 'director'
  );

-- UPDATE: propio perfil o director
CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE USING (
    id = auth.uid() OR lc_user_role() = 'director'
  );

-- DELETE: solo directors
CREATE POLICY "usuarios_delete" ON usuarios
  FOR DELETE USING (lc_user_role() = 'director');


-- ══════════════════════════════════════════════════════════════════
-- TABLA: equipos
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipos_select" ON equipos;
DROP POLICY IF EXISTS "equipos_write"  ON equipos;

-- SELECT: todos los autenticados ven los equipos
CREATE POLICY "equipos_select" ON equipos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT / UPDATE / DELETE: solo directors
CREATE POLICY "equipos_write" ON equipos
  FOR ALL USING (lc_user_role() = 'director');
