import type { InputRichMessage, TelegramMessage } from "./types";

interface TelegramEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApi {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, payload: unknown): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as TelegramEnvelope<T>;
    if (!response.ok || !json.ok || json.result === undefined) {
      throw new Error(`Telegram ${method} failed: ${json.description ?? response.statusText}`);
    }
    return json.result;
  }

  sendRichMessage(chatId: number, richMessage: InputRichMessage): Promise<TelegramMessage> {
    return this.call("sendRichMessage", {
      chat_id: chatId,
      rich_message: richMessage,
    });
  }

  editRichMessage(chatId: number, messageId: number, richMessage: InputRichMessage): Promise<TelegramMessage> {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      rich_message: richMessage,
    });
  }

  sendTextMessage(chatId: number, text: string, replyToMessageId?: number): Promise<TelegramMessage> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyToMessageId !== undefined
        ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
        : {}),
    });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<boolean> {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      ...(showAlert ? { show_alert: true } : {}),
    });
  }
}
