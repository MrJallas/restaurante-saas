'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  OwnerEstablishmentSettings,
  OwnerOpeningWindow,
  OwnerSettingsDay,
} from '@restaurant/shared-types';
import { OWNER_SETTINGS_DAYS } from '@restaurant/shared-types';
import { Icon, G_FONT, MBottomNav, useG } from '../../components/manager';
import { ownerEstablishmentApi } from '../../lib/api/owner-settings';
import {
  OWNER_DAY_LABELS,
  ownerSettingsFormToPatch,
  ownerSettingsToForm,
  validateOwnerSettingsForm,
  type OwnerSettingsFormState,
} from '../../lib/owner-settings-form';

export interface ScreenOwnerEstablishmentSettingsProps {
  tenantSlug: string;
  dark?: boolean;
}

export function ScreenOwnerEstablishmentSettings({
  tenantSlug,
  dark,
}: ScreenOwnerEstablishmentSettingsProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const [settings, setSettings] = useState<OwnerEstablishmentSettings | null>(null);
  const [form, setForm] = useState<OwnerSettingsFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await ownerEstablishmentApi(tenantSlug).get();
      setSettings(next);
      setForm(ownerSettingsToForm(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form || !settings) return;
    const errors = validateOwnerSettingsForm(form);
    if (errors.length > 0) {
      setError(errors[0]);
      setSuccess(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const patch = ownerSettingsFormToPatch(form, settings);
      if (Object.keys(patch).length === 1) {
        setSuccess('Nenhuma alteração para salvar.');
        return;
      }
      const next = await ownerEstablishmentApi(tenantSlug).update(patch);
      setSettings(next);
      setForm(ownerSettingsToForm(next));
      setSuccess('Configurações salvas.');
    } catch (err) {
      const apiError = err as Error & { code?: string };
      if (apiError.code === 'SETTINGS_STALE') {
        await load();
        setError(
          'Outra aba alterou os dados. Recarregamos a versão atual; revise antes de salvar.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
      }
    } finally {
      setSaving(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation || !form) {
      setError('Este dispositivo não oferece localização. Digite as coordenadas manualmente.');
      return;
    }
    setLocationBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((current) =>
          current
            ? {
                ...current,
                geofenceLatitude: coords.latitude.toFixed(7),
                geofenceLongitude: coords.longitude.toFixed(7),
              }
            : current,
        );
        setLocationBusy(false);
      },
      () => {
        setError('Não foi possível ler a localização. Autorize o acesso ou digite manualmente.');
        setLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  const setDayOpen = (day: OwnerSettingsDay, open: boolean) => {
    setForm((current) =>
      current
        ? {
            ...current,
            openingHoursConfigured: true,
            openingHours: {
              ...current.openingHours,
              [day]: open ? (current.openingHours[day] ?? [{ open: '', close: '' }]) : null,
            },
          }
        : current,
    );
  };

  const setWindow = (
    day: OwnerSettingsDay,
    index: number,
    field: keyof OwnerOpeningWindow,
    value: string,
  ) => {
    setForm((current) => {
      if (!current) return current;
      const windows = [...(current.openingHours[day] ?? [])];
      windows[index] = { ...windows[index], [field]: value };
      return {
        ...current,
        openingHours: { ...current.openingHours, [day]: windows },
      };
    });
  };

  const addWindow = (day: OwnerSettingsDay) => {
    setForm((current) => {
      if (!current) return current;
      const windows = current.openingHours[day] ?? [];
      if (windows.length >= 3) return current;
      return {
        ...current,
        openingHours: {
          ...current.openingHours,
          [day]: [...windows, { open: '', close: '' }],
        },
      };
    });
  };

  const removeWindow = (day: OwnerSettingsDay, index: number) => {
    setForm((current) => {
      if (!current) return current;
      const windows = [...(current.openingHours[day] ?? [])];
      windows.splice(index, 1);
      return {
        ...current,
        openingHours: {
          ...current.openingHours,
          [day]: windows.length > 0 ? windows : null,
        },
      };
    });
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: C.surface,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', paddingBottom: 32 }}>
        <header
          style={{
            minHeight: 56,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: C.bg,
            borderBottom: `1px solid ${C.borderFaint}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={() =>
              router.push(`/manager/configuracoes?slug=${encodeURIComponent(tenantSlug)}`)
            }
            aria-label="Voltar às configurações"
            style={{
              border: 0,
              background: 'transparent',
              color: C.ink,
              minWidth: 44,
              minHeight: 44,
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            {Icon.back(21)}
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, lineHeight: 1.2 }}>Estabelecimento</h1>
            <div style={{ marginTop: 2, fontSize: 11.5, color: C.faint, fontWeight: 650 }}>
              Configurações exclusivas do dono
            </div>
          </div>
        </header>

        {loading ? (
          <LoadingState C={C} />
        ) : error && !form ? (
          <ErrorState C={C} message={error} onRetry={() => void load()} />
        ) : form ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            style={{ padding: '16px 14px 0', display: 'grid', gap: 16 }}
          >
            {error && (
              <div role="alert" style={alertStyle(C.dangerBg, C.danger, C.borderSoft)}>
                {error}
              </div>
            )}
            {success && (
              <div
                role="status"
                aria-live="polite"
                style={alertStyle(C.successBg, C.success, C.borderSoft)}
              >
                {success}
              </div>
            )}

            <Section C={C} title="Identidade e cobrança">
              <Field label="Nome do restaurante">
                <input
                  value={form.restaurantName}
                  onChange={(event) => setForm({ ...form, restaurantName: event.target.value })}
                  maxLength={200}
                  autoComplete="organization"
                  style={inputStyle(C)}
                />
              </Field>
              <div style={twoColumns}>
                <Field label="Fuso horário">
                  <input
                    value={form.timezone}
                    onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                    list="owner-timezones"
                    autoComplete="off"
                    style={inputStyle(C)}
                  />
                  <datalist id="owner-timezones">
                    <option value="America/Sao_Paulo" />
                    <option value="America/Manaus" />
                    <option value="America/Fortaleza" />
                    <option value="America/Recife" />
                    <option value="America/Belem" />
                    <option value="America/Cuiaba" />
                  </datalist>
                </Field>
                <Field label="Moeda">
                  <select
                    value="BRL"
                    disabled
                    style={inputStyle(C)}
                    aria-describedby="currency-help"
                  >
                    <option value="BRL">BRL · Real brasileiro</option>
                  </select>
                  <SmallHelp id="currency-help" C={C}>
                    Outras moedas ainda não são suportadas.
                  </SmallHelp>
                </Field>
              </div>
              <Field label="Taxa de serviço (%)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="30"
                  step="0.01"
                  value={form.serviceFeePercent}
                  onChange={(event) => setForm({ ...form, serviceFeePercent: event.target.value })}
                  style={inputStyle(C)}
                />
                <SmallHelp C={C}>
                  Use 0 para não cobrar. A conta e o pagamento usam este valor.
                </SmallHelp>
              </Field>
            </Section>

            <Section C={C} title="Presença no restaurante">
              <ToggleRow
                C={C}
                checked={form.geofenceEnabled}
                onChange={(checked) => setForm({ ...form, geofenceEnabled: checked })}
                label="Exigir presença para entrar"
                help="Validação ocorre no backend; o navegador só envia a localização."
              />
              <div style={twoColumns}>
                <Field label="Latitude">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0000001"
                    min="-90"
                    max="90"
                    value={form.geofenceLatitude}
                    disabled={!form.geofenceEnabled}
                    onChange={(event) => setForm({ ...form, geofenceLatitude: event.target.value })}
                    style={inputStyle(C)}
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0000001"
                    min="-180"
                    max="180"
                    value={form.geofenceLongitude}
                    disabled={!form.geofenceEnabled}
                    onChange={(event) =>
                      setForm({ ...form, geofenceLongitude: event.target.value })
                    }
                    style={inputStyle(C)}
                  />
                </Field>
              </div>
              <Field label="Raio aceito (metros)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="3"
                  max="1000"
                  step="1"
                  value={form.geofenceRadiusMeters}
                  disabled={!form.geofenceEnabled}
                  onChange={(event) =>
                    setForm({ ...form, geofenceRadiusMeters: event.target.value })
                  }
                  style={inputStyle(C)}
                />
              </Field>
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={!form.geofenceEnabled || locationBusy}
                style={secondaryButton(C)}
              >
                {locationBusy ? 'Lendo localização…' : 'Usar a localização deste dispositivo'}
              </button>
            </Section>

            <Section C={C} title="Horários de funcionamento">
              {!form.openingHoursConfigured && (
                <div style={alertStyle(C.warnBg, C.warn, C.borderSoft)}>
                  Os horários ainda não foram cadastrados. Configure os dias antes de salvar.
                </div>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {OWNER_SETTINGS_DAYS.map((day) => {
                  const windows = form.openingHours[day];
                  const isOpen = windows !== null;
                  return (
                    <fieldset
                      key={day}
                      style={{
                        margin: 0,
                        padding: 12,
                        border: `1px solid ${C.borderSoft}`,
                        borderRadius: 12,
                        background: C.surface,
                      }}
                    >
                      <legend style={{ padding: 0, width: '100%' }}>
                        <label
                          style={{
                            minHeight: 44,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            cursor: 'pointer',
                            fontWeight: 800,
                            fontSize: 14,
                          }}
                        >
                          {OWNER_DAY_LABELS[day]}
                          <span
                            style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mute }}
                          >
                            <span style={{ fontSize: 12 }}>{isOpen ? 'Aberto' : 'Fechado'}</span>
                            <input
                              type="checkbox"
                              checked={isOpen}
                              onChange={(event) => setDayOpen(day, event.target.checked)}
                              style={{ width: 22, height: 22 }}
                            />
                          </span>
                        </label>
                      </legend>
                      {windows && (
                        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                          {windows.map((window, index) => (
                            <div key={`${day}-${index}`} style={{ display: 'grid', gap: 8 }}>
                              <div style={twoColumns}>
                                <Field label={`Abre · período ${index + 1}`}>
                                  <input
                                    type="time"
                                    value={window.open}
                                    onChange={(event) =>
                                      setWindow(day, index, 'open', event.target.value)
                                    }
                                    style={inputStyle(C)}
                                  />
                                </Field>
                                <Field label={`Fecha · período ${index + 1}`}>
                                  <input
                                    type="time"
                                    value={window.close}
                                    onChange={(event) =>
                                      setWindow(day, index, 'close', event.target.value)
                                    }
                                    style={inputStyle(C)}
                                  />
                                </Field>
                              </div>
                              {windows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeWindow(day, index)}
                                  style={textButton(C.danger)}
                                >
                                  Remover período {index + 1}
                                </button>
                              )}
                            </div>
                          ))}
                          {windows.length < 3 && (
                            <button
                              type="button"
                              onClick={() => addWindow(day)}
                              style={secondaryButton(C)}
                            >
                              Adicionar outro período
                            </button>
                          )}
                        </div>
                      )}
                    </fieldset>
                  );
                })}
              </div>
              <SmallHelp C={C}>
                Fechamento após meia-noite é aceito, por exemplo 18:00–01:00.
              </SmallHelp>
            </Section>

            <Section C={C} title="Administração avançada">
              <UnavailableRow C={C} label="Mesas e QR" />
              <UnavailableRow C={C} label="Cardápio" />
              <UnavailableRow C={C} label="Plano e cobrança" />
              <SmallHelp C={C}>
                Esses atalhos só serão ativados quando houver telas completas e integrações reais.
              </SmallHelp>
            </Section>

            {settings && (
              <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5, textAlign: 'center' }}>
                Última atualização: {new Date(settings.updatedAt).toLocaleString('pt-BR')}
              </div>
            )}

            <button type="submit" disabled={saving} style={primaryButton(C, saving)}>
              {saving ? 'Salvando…' : 'Salvar configurações'}
            </button>
          </form>
        ) : null}
      </main>
      <MBottomNav active="me" dark={dark} onTo={(route) => router.push(route)} />
    </div>
  );
}

function Section({
  C,
  title,
  children,
}: {
  C: ReturnType<typeof useG>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: 14,
        display: 'grid',
        gap: 14,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15, letterSpacing: -0.15 }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 750 }}>
      {label}
      {children}
    </label>
  );
}

function SmallHelp({
  C,
  id,
  children,
}: {
  C: ReturnType<typeof useG>;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <span id={id} style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.45 }}>
      {children}
    </span>
  );
}

function ToggleRow({
  C,
  checked,
  onChange,
  label,
  help,
}: {
  C: ReturnType<typeof useG>;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <label
      style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 22, height: 22, flexShrink: 0 }}
      />
      <span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{label}</span>
        <span
          style={{
            display: 'block',
            marginTop: 3,
            fontSize: 11.5,
            lineHeight: 1.4,
            color: C.faint,
          }}
        >
          {help}
        </span>
      </span>
    </label>
  );
}

function UnavailableRow({ C, label }: { C: ReturnType<typeof useG>; label: string }) {
  return (
    <div
      aria-disabled="true"
      style={{
        minHeight: 48,
        border: `1px solid ${C.borderFaint}`,
        borderRadius: 10,
        background: C.surface,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <span style={{ color: C.faint, fontSize: 11 }}>Ainda não disponível</span>
    </div>
  );
}

function LoadingState({ C }: { C: ReturnType<typeof useG> }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ padding: 32, textAlign: 'center', color: C.mute }}
    >
      Carregando configurações…
    </div>
  );
}

function ErrorState({
  C,
  message,
  onRetry,
}: {
  C: ReturnType<typeof useG>;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div style={{ padding: 16 }}>
      <div role="alert" style={alertStyle(C.dangerBg, C.danger, C.borderSoft)}>
        {message}
      </div>
      <button type="button" onClick={onRetry} style={{ ...secondaryButton(C), marginTop: 12 }}>
        Tentar novamente
      </button>
    </div>
  );
}

const twoColumns: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
};

function inputStyle(C: ReturnType<typeof useG>): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    boxSizing: 'border-box',
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 10,
    background: C.surface,
    color: C.ink,
    padding: '10px 12px',
    font: 'inherit',
    fontSize: 14,
  };
}

function primaryButton(C: ReturnType<typeof useG>, busy: boolean): React.CSSProperties {
  return {
    minHeight: 50,
    border: 0,
    borderRadius: 12,
    background: C.ink,
    color: C.bg,
    fontSize: 14,
    fontWeight: 850,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.65 : 1,
  };
}

function secondaryButton(C: ReturnType<typeof useG>): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 10,
    background: C.surface,
    color: C.ink,
    padding: '9px 12px',
    fontSize: 12.5,
    fontWeight: 750,
    cursor: 'pointer',
  };
}

function textButton(color: string): React.CSSProperties {
  return {
    minHeight: 44,
    border: 0,
    background: 'transparent',
    color,
    padding: '8px 4px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 750,
    cursor: 'pointer',
  };
}

function alertStyle(background: string, color: string, border: string): React.CSSProperties {
  return {
    padding: '11px 12px',
    borderRadius: 10,
    border: `1px solid ${border}`,
    background,
    color,
    fontSize: 12.5,
    lineHeight: 1.45,
    fontWeight: 650,
  };
}
