'use client';

import { useMemo, useState } from 'react';

import { EChartsComposedChart, type ChartConfig } from '@/components/evilcharts/charts/echarts-composed-chart';

export type PrintSeries = {
  hourly: { hour: number; labels: number; jobs: number }[];
  daily: { day: string; labels: number; jobs: number }[];
};

const VIEWS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

const config = {
  labels: { label: 'Labels', colors: { light: ['#6366f1', '#8b5cf6'], dark: ['#818cf8', '#a78bfa'] } },
  jobs: { label: 'Print jobs', colors: { light: ['#f59e0b'], dark: ['#fbbf24'] } },
} satisfies ChartConfig;

const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** Labels printed (bars) and print jobs (line) for today by hour, the last 7 days, or the last 30 days. */
export function LabelsChart({ series }: { series: PrintSeries | null }) {
  const [view, setView] = useState<ViewId>('7d');

  const rows = useMemo(() => {
    if (!series) return [];
    if (view === 'today') {
      const nowHour = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
      return series.hourly.filter((h) => h.hour <= nowHour).map((h) => ({ label: hourName(h.hour), labels: h.labels, jobs: h.jobs }));
    }
    const days = view === '7d' ? series.daily.slice(-7) : series.daily;
    return days.map((d) => ({ label: dayName(d.day), labels: d.labels, jobs: d.jobs }));
  }, [series, view]);

  const total = rows.reduce((sum, r) => sum + r.labels, 0);
  const jobs = rows.reduce((sum, r) => sum + r.jobs, 0);

  return (
    <section className="panel chart-panel">
      <div className="chart-head">
        <div>
          <h2>Labels printed</h2>
          <p className="chart-sum">
            <b>{total.toLocaleString()}</b> labels · {jobs.toLocaleString()} job{jobs === 1 ? '' : 's'}
            <span> {view === 'today' ? 'so far today (IST)' : view === '7d' ? 'in the last 7 days' : 'in the last 30 days'}</span>
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="Chart range">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-box">
        {!series ? (
          <p className="loading">Loading chart…</p>
        ) : (
          <EChartsComposedChart key={view} className="h-full w-full" xDataKey="label" data={rows} config={config} curveType="monotone">
            <EChartsComposedChart.Grid />
            <EChartsComposedChart.XAxis dataKey="label" />
            <EChartsComposedChart.YAxis />
            <EChartsComposedChart.Legend isClickable variant="rounded-square" />
            <EChartsComposedChart.Tooltip variant="frosted-glass" />
            {view === '30d' ? <EChartsComposedChart.Brush height={40} /> : null}
            <EChartsComposedChart.Bar dataKey="labels" variant="gradient" isClickable enableHoverHighlight />
            <EChartsComposedChart.Line dataKey="jobs" isClickable>
              <EChartsComposedChart.Dot variant="border" />
              <EChartsComposedChart.ActiveDot variant="colored-border" />
            </EChartsComposedChart.Line>
          </EChartsComposedChart>
        )}
      </div>
    </section>
  );
}
