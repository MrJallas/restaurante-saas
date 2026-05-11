-- Migration 041 (round 18 — Onda 1 wiring): adiciona campos opcionais
-- ao staff que ScreenManagerStaffForm (canvas screens-c.jsx:1763) coleta
-- mas que nao existiam na tabela. Sem eles o "Cadastrar e enviar acesso"
-- era placebo — form coletava CPF/telefone/email/turno mas o backend
-- aceitava so name/role/pin.
--
-- Tudo opcional + idempotente (ADD COLUMN IF NOT EXISTS) pra rodar em
-- tenants existentes sem migrar dados manualmente.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS cpf VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS email VARCHAR(120),
  ADD COLUMN IF NOT EXISTS default_shift VARCHAR(20);

-- CPF unico por tenant (quando preenchido) pra prevenir cadastro
-- duplicado. Index parcial — registros antigos com NULL nao conflitam.
CREATE UNIQUE INDEX IF NOT EXISTS staff_cpf_unique
  ON staff(cpf)
  WHERE cpf IS NOT NULL;
