import type {
  InputRichBlock,
  InputRichMessage,
  RichBlockTableCell,
  RichMessageButton,
  RichText,
} from "../telegram/types";

export const bold = (text: RichText): RichText => ({ type: "bold", text });
export const italic = (text: RichText): RichText => ({ type: "italic", text });
export const underline = (text: RichText): RichText => ({ type: "underline", text });
export const marked = (text: RichText): RichText => ({ type: "marked", text });
export const customEmoji = (customEmojiId: string, alternativeText: string): RichText => ({
  type: "custom_emoji",
  custom_emoji_id: customEmojiId,
  alternative_text: alternativeText,
});

export function callbackButton(
  text: RichText,
  callbackData: string,
  style: RichMessageButton["style"] = "primary",
): RichMessageButton {
  return { text, callback_data: callbackData, style };
}

export function urlButton(
  text: RichText,
  url: string,
  style: RichMessageButton["style"] = "primary",
): RichMessageButton {
  return { text, url, style };
}

export function disabledButton(text: RichText): RichMessageButton {
  return { text, disabled: {} };
}

export function inlineCallback(text: RichText, callbackData: string): RichText {
  return {
    type: "button",
    button: callbackButton(text, callbackData, "link"),
  };
}

export function cell(text?: RichText, isHeader = false): RichBlockTableCell {
  return {
    ...(text !== undefined ? { text } : {}),
    ...(isHeader ? { is_header: true as const } : {}),
    align: "center",
    valign: "middle",
  };
}

export function richMessage(blocks: InputRichBlock[]): InputRichMessage {
  return { blocks, skip_entity_detection: true };
}
