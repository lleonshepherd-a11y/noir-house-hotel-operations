// A dedicated Worker whose only job is to hit the main dashboard's
// escalation endpoint on a fixed schedule. It exists as its own Worker
// because the dashboard's own build (vinext, from the OpenAI Sites
// framework) generates its Worker entry point from app/ route files and has
// no way to add a `scheduled` export of its own - Cloudflare Cron Triggers
// need that export, so a tiny separate Worker carries it instead.
export default {
  async scheduled(event, env, ctx) {
    const response = await fetch('https://dashboard.freedomservices.online/api/cron/escalate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    console.log('escalation run:', response.status, await response.text());
  },
};
