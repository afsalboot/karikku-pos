export default function AnimatedReceipt({ children }) {
  return (
    <div
      className="thermal-feed-window"
      tabIndex={0}
      role="region"
      aria-label="Invoice details"
    >
      <div className="thermal-paper">
        {children}
        <div className="thermal-paper-edge" aria-hidden="true" />
      </div>
    </div>
  );
}
