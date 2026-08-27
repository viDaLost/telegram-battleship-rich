export type RichText = string | RichText[] | RichTextEntity;

export type RichTextEntity =
  | { type: "bold"; text: RichText }
  | { type: "italic"; text: RichText }
  | { type: "marked"; text: RichText }
  | { type: "button"; button: RichMessageButton };

export interface RichMessageButton {
  text: RichText;
  style?: "danger" | "success" | "primary" | "link";
  callback_data?: string;
  url?: string;
  disabled?: Record<string, never>;
}

export interface RichBlockTableCell {
  text?: RichText;
  is_header?: true;
  colspan?: number;
  rowspan?: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
}

export type InputRichBlock =
  | { type: "heading"; text: RichText; size: number }
  | { type: "paragraph"; text: RichText }
  | { type: "footer"; text: RichText }
  | { type: "divider" }
  | {
      type: "table";
      cells: RichBlockTableCell[][];
      is_bordered?: true;
      is_striped?: true;
      is_compact?: true;
      caption?: RichText;
    }
  | {
      type: "buttons";
      buttons: RichMessageButton[];
      align?: "left" | "center" | "right";
    };

export interface InputRichMessage {
  blocks: InputRichBlock[];
  skip_entity_detection?: boolean;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type?: string };
  from?: TelegramUser;
  text?: string;
}

export interface CallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface Update {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
}
