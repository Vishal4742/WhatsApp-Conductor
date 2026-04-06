import { config, requireConfig } from "./config.mjs";

function getBaseUrl() {
  requireConfig(["telegramBotToken"]);
  return `https://api.telegram.org/bot${config.telegramBotToken}`;
}

export async function telegramApi(method, payload) {
  const response = await fetch(`${getBaseUrl()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error on ${method}`);
  }

  return data.result;
}

export async function sendTelegramMessage(chatId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return telegramApi("sendMessage", payload);
}

export async function answerTelegramCallback(callbackQueryId, text) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function setTelegramWebhook(webhookUrl) {
  const payload = { url: webhookUrl };

  if (config.telegramWebhookSecret) {
    payload.secret_token = config.telegramWebhookSecret;
  }

  return telegramApi("setWebhook", payload);
}
