export default function HeaderPinned() {
  const title = 'Galatea Fine Art'

  return (
    <header className="pinned-title" role="banner">
      <div className="pinned-inner">
        <img className="artist-inline" src="/artist.png" alt="The Artist" />
        <h1>{title}</h1>
      </div>
      <div className="pinned-divider" aria-hidden="true" />
    </header>
  )
}
