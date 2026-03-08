import PropTypes from 'prop-types'
import Gallery from './Gallery'

export default function GalleryWithMeta({ items, onItemClick }) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonth = months[new Date().getMonth()];
  const note = 'The sun returns after a season of mourning. Life returns to the streams.';

  return (
    <div>
      <div className="subtitle">Exhibition — {currentMonth}</div>
      <div className="note">{note}</div>
      <Gallery items={items} onItemClick={onItemClick} />
    </div>
  )
}

GalleryWithMeta.propTypes = {
  items: PropTypes.array.isRequired,
  onItemClick: PropTypes.func.isRequired
}
