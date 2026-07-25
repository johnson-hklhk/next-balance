export function SelectBox({ type = "checkbox", label, checked = false, onChange = () => {}, ...props }) {
  return (
    <>
      <label className="select-box" style={props.style}>
        {/* The drawn box/dot. A real element rather than a pseudo so the tick
            inside it can be positioned against the mark instead of against the
            label, which changes width with every name. */}
        <span className="select-box__mark" aria-hidden="true" />
        <span className="select-box__label">{label}</span>
        <input //
          type={type}
          checked={checked}
          onChange={onChange}
          {...props}
        />
      </label>
    </>
  );
}

// Word labels rather than glyphs: the label is the button's accessible name on
// its own, so there is no aria-label or title to keep in sync with it.
export function ThemeBtn({ label, className, ...props }) {
  return (
    <button className={"theme-btn " + (className || "")} {...props}>
      <span className="theme-btn__label">{label}</span>
    </button>
  );
}
