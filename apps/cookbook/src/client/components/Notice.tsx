export type Message = {
  kind: "error" | "notice";
  text: string;
};

interface NoticeProps {
  message: Message;
  onDismiss: () => void;
}

export function Notice({ message, onDismiss }: NoticeProps) {
  return (
    <div class={`notice ${message.kind === "error" ? "error" : ""}`}>
      {message.text}
      <button aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
