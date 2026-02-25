import PropTypes from 'prop-types';
import './StatsInspectorModal.css';

/**
 * StatsInspectorModal - Generic bare-bones modal for stat inspection
 * Acts as a container for children content. Specific stat types (ability scores, skills, etc.)
 * should wrap this component and provide their own content.
 */
function StatsInspectorModal({ isOpen, onClose, title, children, footer }) {
  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;

  if (!isOpen) return null;

  return (
    <div className="stats-inspector-overlay" onClick={onClose}>
      <div className="stats-inspector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inspector-header">
          <h2>{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
          </button>
        </div>

        <div className="inspector-content">
          {children}
        </div>

        {footer && (
          <div className="inspector-sticky-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

StatsInspectorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  footer: PropTypes.node
};

export default StatsInspectorModal;
