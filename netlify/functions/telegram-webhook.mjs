import { config, requireConfig } from "../../lib/config.mjs";
import { handleTelegramUpdate } from "../../lib/bot.mjs";

export default async (request) => {
  try {
    requireConfig(["telegramBotToken", "supabaseUrl", "supabaseServiceRoleKey"]);

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (config.telegramWebhookSecret) {
      const secret = request.headers.get("x-telegram-bot-api-secret-token");
      if (secret !== config.telegramWebhookSecret) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const update = await request.json();
    await handleTelegramUpdate(update);
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }
};
