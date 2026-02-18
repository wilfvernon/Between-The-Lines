import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import Gallery from './components/Gallery'
import Modal from './components/Modal'

function App() {
  const [data, setData] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    fetch('/items.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return r.json();
      })
      .then(data => {
        console.log('Data loaded:', data);
        setData(data);
      })
      .catch(error => {
        console.error('Error loading data:', error);
        setData({ title: 'Error', note: 'Failed to load items', items: [] });
      });
  }, [])

  const handleItemClick = (index) => {
    setSelectedItem(data.items[index])
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  if (!data) {
    return <div className="wrap">Loading...</div>
  }

  return (
    <>
      <div className="wrap">
        <Header 
          title={data.title}
          note={data.note}
        />
        <Gallery 
          items={data.items}
          onItemClick={handleItemClick}
        />
      </div>
      <Modal 
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  )
}

export default App
