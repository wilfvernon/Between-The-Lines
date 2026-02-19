import PropTypes from 'prop-types';

function Gallery({ items, onItemClick }) {
  return (
    <div className="gallery">
      {items.map((item, index) => (
        <button
          key={item.name ?? index}
          type="button"
          className="painting"
          aria-label={`Open details for ${item.name}`}
          onClick={() => onItemClick(index)}
        >
          <img src={item.image} alt={item.name} loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
  );
}

Gallery.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string,
      image: PropTypes.string.isRequired,
    })
  ).isRequired,
  onItemClick: PropTypes.func.isRequired,
};

export default Gallery;
