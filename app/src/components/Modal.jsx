import { useEffect } from 'react';
import PropTypes from 'prop-types';

function renderDescription(text = '') {
  return text.split(/\*\*(.*?)\*\*/g).map((part, index) => {
    if (index % 2 === 1) {
      return <strong key={`strong-${index}`}>{part}</strong>;
    }
    return part;
  });
}

function Modal({ item, isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!item || !isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target.id === 'modal') {
      onClose();
    }
  };

  return (
    <div
      id="modal"
      className="modal active"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={handleBackdropClick}
    >
      <div className="modal-content">
        <button
          className="modal-close"
          type="button"
          aria-label="Close modal"
          onClick={onClose}
        >
          &times;
        </button>
        <img className="modal-image" src={item.image} alt={item.name} />
        <div className="modal-details">
          <h2 id="modal-title">{item.name}</h2>
          <div className="modal-type">
            {item.type}, {item.rarity}
          </div>
          {item.attunement && (
            <div className="modal-attunement">
              Requires attunement. {item.attunement}
            </div>
          )}
          <div className="modal-description">{renderDescription(item.description)}</div>
        </div>
      </div>
    </div>
  );
}

Modal.propTypes = {
  item: PropTypes.shape({
    image: PropTypes.string,
    name: PropTypes.string,
    type: PropTypes.string,
    rarity: PropTypes.string,
    attunement: PropTypes.string,
    description: PropTypes.string,
  }),
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default Modal;
