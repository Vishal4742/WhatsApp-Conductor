import { config, requireConfig } from "../../lib/config.mjs";
import { setTelegramWebhook } from "../../lib/telegram.mjs";

export default async (request) => {
  try {
    requireConfig(["telegramBotToken", "botAdminSecret"]);

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const adminSecret = request.headers.get("x-admin-secret");
    if (adminSecret !== config.botAdminSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
    if (!siteUrl) {
      return new Response("Missing deployment URL", { status: 500 });
    }

    const webhookUrl = `${siteUrl}/.netlify/functions/telegram-webhook`;
    const result = await setTelegramWebhook(webhookUrl);
    return Response.json({ ok: true, webhookUrl, result });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
