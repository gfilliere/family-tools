import { Markdown } from "../../components/Markdown";
import type { DraftAction } from "./draftReducer";

interface InstructionsEditorProps {
  instructions: string | null;
  preview: boolean;
  dispatch: (action: DraftAction) => void;
  onPreviewChange: (preview: boolean) => void;
}

export function InstructionsEditor({
  instructions,
  preview,
  dispatch,
  onPreviewChange,
}: InstructionsEditorProps) {
  return (
    <label>
      Instructions
      <button
        type="button"
        class="preview-toggle"
        onClick={() => onPreviewChange(!preview)}
      >
        {preview ? "Edit" : "Preview"}
      </button>
      {preview ? (
        <Markdown content={instructions ?? ""} preview />
      ) : (
        <textarea
          rows={14}
          value={instructions ?? ""}
          onInput={(event) => dispatch({
            type: "fieldChanged",
            field: "instructionsMd",
            value: event.currentTarget.value,
          })}
        />
      )}
    </label>
  );
}
