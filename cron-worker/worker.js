// A dedicated Worker whose only job is to hit the main dashboard's
// escalation endpoint on a fixed schedule. It exists as its own Worker
// because the dashboard's own build (vinext, from the OpenAI Sites
// framework) generates its Worker entry point from app/ route files and has
// no way to add a `scheduled` export of its own - Cloudflare Cron Triggers
// need that export, so a tiny separate Worker carries it instead.
//
// It also doubles as the dashboard's health check: since it already runs
// every 5 minutes regardless of whether anyone is using the dashboard, it's
// the natural place to notice the app is down and push a phone notification
// (via ntfy.sh, which needs no account or API key) rather than waiting for a
// hotel to call and say tasks aren't going through.
const ALERT_TOPIC = 'freedom-services-alerts-b1b831f0a5e2';

async function sendAlert(title, message) {
  try {
    await fetch('https://ntfy.sh/' + ALERT_TOPIC, {
      method: 'POST',
      headers: { Title: title, Priority: 'urgent', Tags: 'rotating_light' },
      body: message,
    });
  } catch (error) {
    console.log('alert send failed:', error);
  }
}

export default {
  async scheduled(event, env, ctx) {
    try {
      const response = await fetch('https://dashboard.freedomservices.online/api/cron/escalate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      const body = await response.text();
      console.log('escalation run:', response.status, body);
      if (!response.ok) {
        await sendAlert('Freedom Services: escalation job failed', `Status ${response.status}: ${body}`);
      }
    } catch (error) {
      console.log('escalation run errored:', error);
      await sendAlert('Freedom Services: escalation job errored', String(error));
    }

    try {
      const response = await fetch('https://dashboard.freedomservices.online/api/cron/wall-planner-reminders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      const body = await response.text();
      console.log('wall planner reminders run:', response.status, body);
      if (!response.ok) {
        await sendAlert('Freedom Services: wall planner reminders job failed', `Status ${response.status}: ${body}`);
      }
    } catch (error) {
      console.log('wall planner reminders run errored:', error);
      await sendAlert('Freedom Services: wall planner reminders job errored', String(error));
    }

    try {
      const health = await fetch('https://dashboard.freedomservices.online/api/health');
      if (!health.ok) {
        const body = await health.text();
        console.log('health check failed:', health.status, body);
        await sendAlert('Freedom Services: dashboard is down', `Health check returned ${health.status}: ${body}`);
      }
    } catch (error) {
      console.log('health check errored:', error);
      await sendAlert('Freedom Services: dashboard is unreachable', String(error));
    }
  },
};
