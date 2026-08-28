export type RichText = string | RichText[] | RichTextEntity;

export type RichTextEntity =
  | { type: "bold"; text: RichText }
  | { type: "italic"; text: RichText }
  | { type: "underline"; text: RichText }
  | { type: "marked"; text: RichText }
  | { type: "custom_emoji"; custom_emoji_id: string; alternative_text: string }
  | { type: "button"; button: RichMessageButton };

export interface RichMessageButton {
  text: RichText;
  style?: "danger" | "success" | "primary" | "link";
  callback_data?: string;
  url?: string;
  switch_inline_query?: string;
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
  | { type: "pullquote"; text: RichText; credit?: RichText }
  | { type: "details"; summary: RichText; blocks: InputRichBlock[]; is_open?: true }
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
  last_name?: string;
  username?: string;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
}

export interface TelegramPhotoSize extends TelegramFile {
  width: number;
  height: number;
}

export interface TelegramDocument extends TelegramFile {
  file_name?: string;
  mime_type?: string;
}

export interface TelegramSticker extends TelegramFile {
  type: "regular" | "mask" | "custom_emoji";
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
  set_name?: string;
  custom_emoji_id?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  custom_emoji_id?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type?: string };
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  sticker?: TelegramSticker;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
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
