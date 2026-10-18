const FLOW_URL = 'https://control.msg91.com/api/v5/flow';

export const OTP_LENGTH = Number(process.env.OTP_LENGTH || 6);
export const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);

export type Msg91Result = { ok: true } | { ok: false; error: string };

/** Sends the OTP through the SMS template (Flow API). The template variable is ##OTP##. */
export async function sendOtpSms(mobile: string, otp: string): Promise<Msg91Result> {
  const authkey = process.env.MSG91_AUTH_KEY || '';
  if (!authkey) return { ok: false, error: 'OTP service is not configured.' };
  try {
    const res = await fetch(FLOW_URL, {
      method: 'POST',
      headers: { authkey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID || '',
        short_url: '0',
        realTimeResponse: '1',
        recipients: [{ mobiles: `91${mobile}`, OTP: otp }],
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { type?: string; message?: string }
      | null;
    if (res.ok && data?.type === 'success') return { ok: true };
    console.error('msg91 flow rejected', res.status, data);
    return { ok: false, error: data?.message || 'Could not send the SMS.' };
  } catch (err) {
    console.error('msg91 request failed', err);
    return { ok: false, error: 'Could not reach the SMS service.' };
  }
}
