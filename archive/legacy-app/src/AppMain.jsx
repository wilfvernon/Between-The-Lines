import { useState, useEffect } from 'react'
import Header from './components/HeaderPinned'
import Gallery from './components/GalleryWithMeta'
import Modal from './components/Modal'

export default function AppMain() {
  const [data, setData] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/items.json', { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`)
        return r.json()
      })
      .then(data => setData(data))
      .catch(error => {
        if (error.name === 'AbortError') return
        console.error('Error loading data:', error)
        setLoadError('Unable to load gallery items right now.')
        setData({ items: [] })
      })

    return () => controller.abort()
  }, [])

  const handleItemClick = (index) => {
    setSelectedItem(data.items[index])
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedItem(null)
  }

  if (!data) return <div className="wrap">Loading...</div>
  if (loadError) return <div className="wrap">{loadError}</div>

  return (
    <>
      <Header />
      <div className="wrap">
        <Gallery items={data.items} onItemClick={handleItemClick} />
      </div>
      <Modal item={selectedItem} isOpen={isModalOpen} onClose={handleCloseModal} />
    </>
  )
}
