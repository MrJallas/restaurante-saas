'use client';

export function OperationalErrorBanner({
  message,
  onRetry,
  dark = false,
  hasStaleData = false,
}: {
  message: string;
  onRetry: () => void;
  dark?: boolean;
  hasStaleData?: boolean;
}) {
  return (
    <div
      role="alert"
      style={{
        margin: '10px 16px',
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${dark ? '#7f1d1d' : '#f4c7c7'}`,
        background: dark ? '#2b1518' : '#fff1f1',
        color: dark ? '#fecaca' : '#8f2020',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <span>
        {message}
        {hasStaleData ? ' Mostrando os últimos dados carregados.' : ''}
      </span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${dark ? '#fecaca' : '#8f2020'}`,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
