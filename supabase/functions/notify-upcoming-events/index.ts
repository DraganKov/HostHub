// SCAFFOLD, untested. Sends email (Resend) and SMS (Twilio) alerts for upcoming events near each user.
// Needs secrets: RESEND_API_KEY, MAIL_FROM, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM (SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase). Schedule it daily with pg_cron or a Supabase scheduled function.
// TODO before use: add an "alerts_sent(user_id, event_id)" table so nobody is alerted twice for the same event.
import { createClient } from "npm:@supabase/supabase-js@2";
const km = (a: number, b: number, c: number, d: number) => { const r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: users } = await db.from("user_settings").select("*").or("notify_email.eq.true,notify_sms.eq.true");
  const { data: events } = await db.from("events").select("*").eq("cancelled", false).gt("starts_at", new Date().toISOString());
  let sent = 0;
  for (const u of users ?? []) {
    if (u.lat == null) continue;
    const near = (events ?? []).filter((e) => new Date(e.starts_at).getTime() - Date.now() <= u.notify_days * 864e5 && km(u.lat, u.lng, e.lat, e.lng) <= u.radius_km);
    if (!near.length) continue;
    const text = "Upcoming events near you:\n" + near.map((e) => `- ${e.title} (${new Date(e.starts_at).toDateString()}, ${e.city})`).join("\n");
    if (u.notify_email) {
      const { data } = await db.auth.admin.getUserById(u.user_id);
      if (data.user?.email) await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to: data.user.email, subject: "Events near you", text }) });
    }
    if (u.notify_sms && u.phone) {
      const sid = Deno.env.get("TWILIO_SID")!;
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST",
        headers: { Authorization: "Basic " + btoa(sid + ":" + Deno.env.get("TWILIO_TOKEN")), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: u.phone, From: Deno.env.get("TWILIO_FROM")!, Body: text.slice(0, 300) }) });
    }
    sent++;
  }
  return new Response(JSON.stringify({ users_alerted: sent }), { headers: { "Content-Type": "application/json" } });
});
