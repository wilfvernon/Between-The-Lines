import React from 'react'

export default function Gallery({ items, onItemClick }) {
  return (
    <div className="gallery">
      {items.map((item, index) => (
        <div 
          key={index}
          className="painting" 
          onClick={() => onItemClick(index)}
        >
          <img src={item.image} alt={item.name} />
        </div>
      ))}
    </div>
  )
}
