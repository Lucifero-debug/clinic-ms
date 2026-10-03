// lib/whatsapp.ts
//
// Appointment reminders over the WhatsApp Cloud API.
//
// Business-initiated messages must use a pre-approved template — you
// cannot send free text to someone who hasn't messaged you in the last
// 24 hours. Create the template in Meta Business Manager first and put
// its name in WHATSAPP_TEMPLATE_NAME.
//
// Only ever message patients who have marketingConsent. See CONTEXT.md
// section 7 on DPDP.

const GRAPH_VERSION = "v26.0"; // check your app dashboard for the current one

export type SendResult =
  | { ok: true }
  | { ok: false; reason: string };

export function isConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_TEMPLATE_NAME
  );
}

// Indian numbers stored as 10 digits need the country code.
function e164(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;

  return digits;
}

export async function sendReminder(
  phone: string,
  params: { patientName: string; clinicName: string; when: string }
): Promise<SendResult> {
  if (!isConfigured()) {
    return { ok: false, reason: "WhatsApp is not configured" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: e164(phone),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE_NAME,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
          components: [
            {
              type: "body",
              // Order must match the {{1}} {{2}} {{3}} placeholders in
              // the approved template, exactly.
              parameters: [
                { type: "text", text: params.patientName },
                { type: "text", text: params.clinicName },
                { type: "text", text: params.when },
              ],
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("reminder failed:", res.status, detail);
      return { ok: false, reason: `WhatsApp returned ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error("reminder request failed:", err);
    return { ok: false, reason: "Could not reach WhatsApp" };
  }
}
