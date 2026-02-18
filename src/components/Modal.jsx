import React, { useEffect } from 'react'

function parseMarkdown(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

export default function Modal({ item, isOpen, onClose }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!item) return null;

  const handleBackdropClick = (e) => {
    if (e.target.id === 'modal') {
      onClose();
    }
  };

  return (
    <div 
      id="modal"
      className={`modal ${isOpen ? 'active' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <img className="modal-image" src={item.image} alt={item.name} />
        <div className="modal-details">
          <h2>{item.name}</h2>
          <div className="modal-type">{item.type}, {item.rarity}</div>
          {item.attunement && (
            <div className="modal-attunement">
              Requires attunement. {item.attunement}
            </div>
          )}
          <div 
            className="modal-description"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(item.description) }}
          />
        </div>
      </div>
    </div>
  )
}
