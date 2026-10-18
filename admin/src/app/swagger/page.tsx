'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function SwaggerPage() {
  const [spec, setSpec] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/openapi')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load OpenAPI (${res.status})`);
        return res.json();
      })
      .then(setSpec)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#F4F7F9' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0',
          background: '#fff',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18 }}>Admin API inventory</h1>
          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13 }}>
            Checklist of admin-panel endpoints. Most are planned — only Mobile Auth, Admin Auth, and
            printers catalog are implemented so far.
          </p>
        </div>
        <Link href="/" style={{ color: '#3B82F6', fontWeight: 600, fontSize: 14 }}>
          ← Back to admin UI
        </Link>
      </header>
      {error ? (
        <p style={{ padding: 24, color: '#EF4444' }}>{error}</p>
      ) : spec ? (
        <SwaggerUI spec={spec} docExpansion="list" defaultModelsExpandDepth={-1} />
      ) : (
        <p style={{ padding: 24, color: '#64748B' }}>Loading OpenAPI…</p>
      )}
    </div>
  );
}
