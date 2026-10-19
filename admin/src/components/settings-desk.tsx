'use client';

import { useState } from 'react';
import { useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';

export function SettingsDesk() {
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  async function restore() {
    try {
      await api('/api/desk/reset', { method: 'POST' });
      setConfirmReset(false);
      toast('Sample library restored');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not restore', 'bad');
    }
  }

  return (
    <>
      <PageHeader kicker="Access" title="Settings" lede="This desk has a single admin. Their username and password are set on the server." />
      <div className="split">
        <section className="panel">
          <h2>Admin sign-in</h2>
          <p>The username and password are read from <code>ADMIN_FIXED_USERNAME</code> and <code>ADMIN_FIXED_PASSWORD</code> in <code>admin/.env</code>. To change them, edit that file and restart the server.</p>
        </section>
        <section className="panel">
          <h2>How counts work</h2>
          <p>Every number comes from events the app sends while a signed-in user prints or connects a printer. Accounts marked as test accounts are left out while the switch on each screen is on.</p>
          <p className="meta">Files uploaded to the library are stored on this computer in admin/data. The records keep a URL, so a bucket can replace the folder later.</p>
        </section>
      </div>
      <section className="note" style={{ marginTop: 14 }}>
        <h2>Sample library</h2>
        <p>Restores the sample templates, art, prints, and feedback. Uploaded files in the library are removed.</p>
        {confirmReset ? (
          <div className="form-actions">
            <button type="button" className="btn danger" onClick={restore}>Yes, restore the sample</button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmReset(true)}>Restore sample desk</button>
        )}
      </section>
    </>
  );
}
