import { config } from "./config.mjs";
import { getSupabaseAdmin } from "./supabase.mjs";
import { answerTelegramCallback, sendTelegramMessage } from "./telegram.mjs";

function getUserLabel(from) {
  if (!from) {
    return "Unknown user";
  }

  const parts = [from.first_name, from.last_name].filter(Boolean);
  if (parts.length) {
    return parts.join(" ");
  }

  if (from.username) {
    return `@${from.username}`;
  }

  return String(from.id);
}

function getEffectiveMessage(user) {
  return (user.message_override || config.defaultMessage || "").trim();
}

function getModeLabel(mode) {
  return mode === "personal" ? "Personal" : "Shared";
}

function buildWhatsappLink(phone, message) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
}

function buildKeyboard(contact, user) {
  return {
    inline_keyboard: [
      [{ text: "Open WhatsApp", url: buildWhatsappLink(contact.phone, getEffectiveMessage(user)) }],
      [
        { text: "Mark Sent", callback_data: "done" },
        { text: "Skip", callback_data: "skip" },
      ],
      [
        { text: "Refresh", callback_data: "current" },
        { text: "Release", callback_data: "release" },
      ],
    ],
  };
}

async function fetchUser(chatId, from) {
  const supabase = getSupabaseAdmin();
  const payload = {
    chat_id: String(chatId),
    telegram_user_id: from?.id || null,
    username: from?.username || "",
    display_name: getUserLabel(from),
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("bot_users")
    .upsert(payload, { onConflict: "chat_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateUser(chatId, values) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bot_users")
    .update(values)
    .eq("chat_id", String(chatId))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getCurrentContact(contactId) {
  if (!contactId) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function countQueue() {
  const supabase = getSupabaseAdmin();
  const requests = [
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("is_active", true).eq("status", "sent"),
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("is_active", true).eq("status", "claimed"),
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("is_active", true).eq("status", "available"),
  ];

  const [totalRes, sentRes, claimedRes, availableRes] = await Promise.all(requests);
  for (const result of [totalRes, sentRes, claimedRes, availableRes]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    total: totalRes.count ?? 0,
    sent: sentRes.count ?? 0,
    claimed: claimedRes.count ?? 0,
    available: availableRes.count ?? 0,
  };
}

async function getSharedCurrentContact(user) {
  const current = await getCurrentContact(user.current_contact_id);
  if (
    current &&
    current.status === "claimed" &&
    String(current.claimed_by_chat_id || "") === String(user.chat_id)
  ) {
    return current;
  }

  return null;
}

async function claimSharedContact(user) {
  const supabase = getSupabaseAdmin();
  const staleBefore = new Date(Date.now() - config.staleClaimMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("claim_next_shared_contact", {
    p_chat_id: String(user.chat_id),
    p_stale_before: staleBefore,
  });

  if (error) {
    throw error;
  }

  const contact = Array.isArray(data) ? data[0] : data;
  if (!contact) {
    await updateUser(user.chat_id, { current_contact_id: null });
    return null;
  }

  await updateUser(user.chat_id, { current_contact_id: contact.id });
  return contact;
}

async function getNextPersonalContact(user) {
  const supabase = getSupabaseAdmin();
  const current = await getCurrentContact(user.current_contact_id);
  if (current && current.status !== "sent") {
    return current;
  }

  const cursor = user.personal_cursor_position || 0;
  const next = await supabase
    .from("contacts")
    .select("*")
    .eq("is_active", true)
    .neq("status", "sent")
    .gt("queue_position", cursor)
    .order("queue_position", { ascending: true })
    .limit(1);

  if (next.error) {
    throw next.error;
  }

  let contact = next.data?.[0] || null;
  if (!contact) {
    const wrap = await supabase
      .from("contacts")
      .select("*")
      .eq("is_active", true)
      .neq("status", "sent")
      .order("queue_position", { ascending: true })
      .limit(1);

    if (wrap.error) {
      throw wrap.error;
    }

    contact = wrap.data?.[0] || null;
  }

  if (!contact) {
    await updateUser(user.chat_id, { current_contact_id: null });
    return null;
  }

  await updateUser(user.chat_id, {
    current_contact_id: contact.id,
    personal_cursor_position: contact.queue_position,
  });
  return contact;
}

async function resolveContactForUser(user) {
  if (user.mode === "personal") {
    return getNextPersonalContact(user);
  }

  const current = await getSharedCurrentContact(user);
  if (current) {
    return current;
  }

  return claimSharedContact(user);
}

function buildContactText(contact, user, stats) {
  const nameLine = contact.name ? `Name: ${contact.name}` : "Name: Not provided";

  return [
    `Contact ${contact.queue_position} of ${stats.total}`,
    nameLine,
    `Number: +91${contact.phone}`,
    "",
    `Mode: ${getModeLabel(user.mode)}`,
    `Your sent count: ${user.sent_count}`,
    `Your skips: ${user.skip_count}`,
    `Queue status: ${stats.available} available, ${stats.claimed} claimed, ${stats.sent} sent`,
    "",
    "Tap Open WhatsApp, send manually, then tap Mark Sent or Skip here.",
    "",
    "Message preview:",
    getEffectiveMessage(user) || "(empty)",
  ].join("\n");
}

async function showCurrentContact(chatId, from) {
  let user = await fetchUser(chatId, from);
  const contact = await resolveContactForUser(user);
  user = await fetchUser(chatId, from);

  if (!contact) {
    const stats = await countQueue();
    await sendTelegramMessage(
      chatId,
      [
        "No available contacts are left for you right now.",
        `Total: ${stats.total}`,
        `Sent: ${stats.sent}`,
        `Claimed: ${stats.claimed}`,
        `Available: ${stats.available}`,
      ].join("\n")
    );
    return;
  }

  const stats = await countQueue();
  await sendTelegramMessage(chatId, buildContactText(contact, user, stats), buildKeyboard(contact, user));
}

async function markCurrentSent(user) {
  const contact = await getCurrentContact(user.current_contact_id);
  if (!contact) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("contacts")
    .update({
      status: "sent",
      sent_by_chat_id: String(user.chat_id),
      sent_at: new Date().toISOString(),
      claimed_by_chat_id: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact.id);

  if (user.mode === "shared") {
    query = query.eq("claimed_by_chat_id", String(user.chat_id));
  }

  const { data, error } = await query.select("*").single();

  if (error) {
    throw error;
  }

  await updateUser(user.chat_id, {
    current_contact_id: null,
    personal_cursor_position: contact.queue_position,
    sent_count: (user.sent_count || 0) + 1,
  });

  return data;
}

async function skipCurrent(user) {
  const contact = await getCurrentContact(user.current_contact_id);
  if (!contact) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  if (user.mode === "shared") {
    const { error } = await supabase
      .from("contacts")
      .update({
        status: "available",
        claimed_by_chat_id: null,
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id)
      .eq("claimed_by_chat_id", String(user.chat_id));

    if (error) {
      throw error;
    }
  }

  await updateUser(user.chat_id, {
    current_contact_id: null,
    personal_cursor_position: contact.queue_position,
    skip_count: (user.skip_count || 0) + 1,
  });
  return contact;
}

async function releaseCurrent(user) {
  const contact = await getCurrentContact(user.current_contact_id);
  if (!contact) {
    return null;
  }

  if (user.mode === "shared") {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("contacts")
      .update({
        status: "available",
        claimed_by_chat_id: null,
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id)
      .eq("claimed_by_chat_id", String(user.chat_id));

    if (error) {
      throw error;
    }
  }

  await updateUser(user.chat_id, { current_contact_id: null });
  return contact;
}

async function sendStatus(chatId, from) {
  const user = await fetchUser(chatId, from);
  const stats = await countQueue();
  const current = await getCurrentContact(user.current_contact_id);
  const lines = [
    `Mode: ${getModeLabel(user.mode)}`,
    `Total contacts: ${stats.total}`,
    `Sent: ${stats.sent}`,
    `Claimed: ${stats.claimed}`,
    `Available: ${stats.available}`,
    `Your sent count: ${user.sent_count}`,
    `Your skips: ${user.skip_count}`,
  ];

  if (current) {
    lines.push(`Current contact: +91${current.phone}${current.name ? ` (${current.name})` : ""}`);
  } else {
    lines.push("Current contact: none");
  }

  await sendTelegramMessage(chatId, lines.join("\n"));
}

async function switchMode(chatId, from, nextMode) {
  const user = await fetchUser(chatId, from);
  if (user.mode === nextMode) {
    await sendTelegramMessage(chatId, `You are already in ${nextMode} mode.`);
    await showCurrentContact(chatId, from);
    return;
  }

  if (user.current_contact_id) {
    await releaseCurrent(user);
  }

  await updateUser(chatId, {
    mode: nextMode,
    current_contact_id: null,
  });

  await sendTelegramMessage(
    chatId,
    nextMode === "personal"
      ? "Switched to personal mode. The bot will behave like a solo sequential helper."
      : "Switched to shared mode. Contacts will be claimed to avoid live collisions."
  );
  await showCurrentContact(chatId, from);
}

async function handleTextMessage(message) {
  if (message.chat.type !== "private") {
    await sendTelegramMessage(message.chat.id, "Use this bot in a private Telegram chat only.");
    return;
  }

  const chatId = String(message.chat.id);
  const from = message.from;
  const text = (message.text || "").trim();

  await fetchUser(chatId, from);

  if (text === "/start" || text === "/help") {
    await updateUser(chatId, { message_override: null });
    await sendTelegramMessage(
      chatId,
      [
        "Netlify webhook WhatsApp helper is ready.",
        "Shared mode prevents two active users from working the same live contact.",
        "Personal mode behaves like a solo sequential helper.",
        "",
        "Commands:",
        "/current - show or claim your current contact",
        "/done - mark your current contact as sent and claim the next one",
        "/skip - skip your current contact and move ahead",
        "/release - release your current contact without claiming another",
        "/status - show queue and personal stats",
        "/mode - show your current mode",
        "/mode personal - switch to solo sequential mode",
        "/mode shared - switch to shared team mode",
        "/message <text> - set your personal message override",
        "/resetmessage - restore your message from DEFAULT_MESSAGE/message.txt",
      ].join("\n")
    );
    await showCurrentContact(chatId, from);
    return;
  }

  if (text === "/current" || text === "/next") {
    await showCurrentContact(chatId, from);
    return;
  }

  if (text === "/status" || text === "/count") {
    await sendStatus(chatId, from);
    return;
  }

  if (text === "/mode") {
    const user = await fetchUser(chatId, from);
    await sendTelegramMessage(chatId, `Your current mode is ${user.mode}.`);
    return;
  }

  if (text === "/mode personal" || text === "/mode shared") {
    await switchMode(chatId, from, text.endsWith("personal") ? "personal" : "shared");
    return;
  }

  if (text.startsWith("/message ")) {
    const override = text.slice("/message ".length).trim();
    if (!override) {
      await sendTelegramMessage(chatId, "Usage: /message Your text here");
      return;
    }

    await updateUser(chatId, { message_override: override });
    await sendTelegramMessage(chatId, "Your personal message override was updated.");
    await showCurrentContact(chatId, from);
    return;
  }

  if (text === "/message") {
    await sendTelegramMessage(chatId, "Usage: /message Your text here");
    return;
  }

  if (text === "/resetmessage") {
    await updateUser(chatId, { message_override: null });
    await sendTelegramMessage(chatId, "Your personal message was reset to the default.");
    await showCurrentContact(chatId, from);
    return;
  }

  if (text === "/done") {
    const user = await fetchUser(chatId, from);
    const contact = await markCurrentSent(user);
    if (!contact) {
      await sendTelegramMessage(chatId, "You do not have a current contact. Use /current.");
      return;
    }

    await sendTelegramMessage(chatId, `Marked +91${contact.phone} as sent.`);
    await showCurrentContact(chatId, from);
    return;
  }

  if (text === "/skip") {
    const user = await fetchUser(chatId, from);
    const contact = await skipCurrent(user);
    if (!contact) {
      await sendTelegramMessage(chatId, "You do not have a current contact. Use /current.");
      return;
    }

    await sendTelegramMessage(chatId, `Skipped +91${contact.phone}.`);
    await showCurrentContact(chatId, from);
    return;
  }

  if (text === "/release") {
    const user = await fetchUser(chatId, from);
    const contact = await releaseCurrent(user);
    if (!contact) {
      await sendTelegramMessage(chatId, "You do not have a current contact.");
      return;
    }

    await sendTelegramMessage(chatId, `Released +91${contact.phone}.`);
    return;
  }

  await sendTelegramMessage(chatId, "Unknown command. Use /help.");
}

async function handleCallbackQuery(callbackQuery) {
  const message = callbackQuery.message;
  if (!message || message.chat.type !== "private") {
    await answerTelegramCallback(callbackQuery.id, "Use the bot in private chat.");
    return;
  }

  const chatId = String(message.chat.id);
  const from = callbackQuery.from;
  await fetchUser(chatId, from);

  if (callbackQuery.data === "current") {
    await answerTelegramCallback(callbackQuery.id, "Refreshing");
    await showCurrentContact(chatId, from);
    return;
  }

  if (callbackQuery.data === "done") {
    const user = await fetchUser(chatId, from);
    const contact = await markCurrentSent(user);
    if (!contact) {
      await answerTelegramCallback(callbackQuery.id, "No current contact");
      await sendTelegramMessage(chatId, "You do not have a current contact. Use /current.");
      return;
    }

    await answerTelegramCallback(callbackQuery.id, "Marked sent");
    await sendTelegramMessage(chatId, `Marked +91${contact.phone} as sent.`);
    await showCurrentContact(chatId, from);
    return;
  }

  if (callbackQuery.data === "skip") {
    const user = await fetchUser(chatId, from);
    const contact = await skipCurrent(user);
    if (!contact) {
      await answerTelegramCallback(callbackQuery.id, "No current contact");
      await sendTelegramMessage(chatId, "You do not have a current contact. Use /current.");
      return;
    }

    await answerTelegramCallback(callbackQuery.id, "Skipped");
    await sendTelegramMessage(chatId, `Skipped +91${contact.phone}.`);
    await showCurrentContact(chatId, from);
    return;
  }

  if (callbackQuery.data === "release") {
    const user = await fetchUser(chatId, from);
    const contact = await releaseCurrent(user);
    if (!contact) {
      await answerTelegramCallback(callbackQuery.id, "No current contact");
      return;
    }

    await answerTelegramCallback(callbackQuery.id, "Released");
    await sendTelegramMessage(chatId, `Released +91${contact.phone}.`);
  }
}

export async function handleTelegramUpdate(update) {
  if (update.message?.text) {
    await handleTextMessage(update.message);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}
