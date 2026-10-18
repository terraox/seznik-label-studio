'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { AnalyticsFooter, type FooterInfo } from '@/components/analytics-footer';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';

type Product = { key: string; name: string; category: string; clicks: number; users: number; last7Days: number; thisMonth: number; lastClick: string };
type Data = { totalClicks: number; products: Product[]; trend: { day: string; clicks: number }[] | null; footer: FooterInfo };

export function ShopDesk() {
  const [data, setData] = useState<Data | null>(null);
  const [product, setProduct] = useState('');
  const [hideInternal, setHideInternal] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (hideInternal) params.set('internal', 'hide');
    if (product) params.set('product', product);
    api<Data>(`/api/stats/shop?${params}`).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, [hideInternal, product]);

  useEffect(load, [load]);
  const selected = data?.products.find((p) => p.key === product);

  return (
    <>
      <PageHeader kicker="Shop" title="Product clicks" lede="Taps on the buy button in the app's shop, per product. Click a row to see its daily trend.">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} /> Exclude internal accounts
        </label>
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="panel">
        <p className="lede">{data ? `${data.totalClicks.toLocaleString()} clicks across ${data.products.length} products` : 'Loading…'}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Product</th><th>Type</th><th>Clicks</th><th>People</th><th>Last 7 days</th><th>This month</th><th>Last click</th></tr></thead>
            <tbody>
              {data?.products.map((p) => (
                <tr key={p.key} onClick={() => setProduct(product === p.key ? '' : p.key)} style={{ cursor: 'pointer', fontWeight: product === p.key ? 700 : 400 }}>
                  <td>{p.name}</td><td>{p.category}</td><td>{p.clicks.toLocaleString()}</td><td>{p.users}</td>
                  <td>{p.last7Days}</td><td>{p.thisMonth}</td><td>{ago(p.lastClick)}</td>
                </tr>
              ))}
              {data && data.products.length === 0 ? <tr><td colSpan={7}>No product has been tapped yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected && data?.trend ? (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>{selected.name}: clicks per day (last 30 days, IST)</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} interval={4} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={32} />
                <Tooltip formatter={(v) => [Number(v ?? 0), 'Clicks']} />
                <Bar dataKey="clicks" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <AnalyticsFooter footer={data?.footer} />
    </>
  );
}
