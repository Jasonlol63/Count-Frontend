import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const TOOLBAR_MODULES = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link"],
  ["clean"],
];

const FORMATS = ["header", "bold", "italic", "underline", "strike", "list", "bullet", "link"];

export default function RichTextEditor({ id, value, onChange, placeholder, disabled = false }) {
  return (
    <div className={`m-ann-editor${disabled ? " is-disabled" : ""}`}>
      <ReactQuill
        id={id}
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={disabled}
        modules={{ toolbar: TOOLBAR_MODULES }}
        formats={FORMATS}
      />
    </div>
  );
}
