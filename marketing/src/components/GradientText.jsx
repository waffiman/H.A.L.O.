// Figma uses a clipped linear gradient for accent labels (e.g. 1:25681).
export default function GradientText({ children, className = '' }) {
  return (
    <span
      className={`bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(-89.34deg, rgb(255,139,115) 3.06%, rgb(74,249,249) 40.16%)',
      }}
    >
      {children}
    </span>
  );
}
