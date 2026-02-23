import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import SpellManagement from '../components/SpellManagement';
import MagicItemManagement from '../components/MagicItemManagement';
import FeatManagement from '../components/FeatManagement';
import CharacterImporter from '../components/CharacterImporter';
import './AdminDashboard.css';

const sortBooks = (items) => [...items].sort((left, right) => left.title.localeCompare(right.title));
const normalizeTags = (value) => (value ?? '')
  .split(',')
  .map((tag) => tag.trim())
  .filter(Boolean);
const formatTags = (tags) => (Array.isArray(tags) ? tags.join(', ') : '');

function AdminDashboard() {
  const [mainTab, setMainTab] = useState('books'); // 'books' or 'dnd'
  const [dndTab, setDndTab] = useState('spells'); // 'spells', 'items', 'feats', 'characters'
  const [booksSubTab, setBooksSubTab] = useState('manage'); // 'manage' | 'config'

  const [spellPrefill, setSpellPrefill] = useState(null);
  const [itemPrefill, setItemPrefill] = useState(null);
  const [featPrefill, setFeatPrefill] = useState(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewOpenNonce, setReviewOpenNonce] = useState(0);

  const handlePrefill = (type, data) => {
    const payload = data ? { ...data, _nonce: Date.now() } : null;
    if (type === 'spells') setSpellPrefill(payload);
    if (type === 'items') setItemPrefill(payload);
    if (type === 'feats') setFeatPrefill(payload);
  };

  const handleNavigateTab = (type) => {
    setMainTab('dnd');
    setDndTab(type);
  };

  const handleReviewReturn = () => {
    setMainTab('dnd');
    setDndTab('characters');
    setReviewOpenNonce((prev) => prev + 1);
  };
  
  const [books, setBooks] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookCoverImage, setBookCoverImage] = useState('');
  const [bookTags, setBookTags] = useState('');
  const [bookStatus, setBookStatus] = useState('');
  const [bookSubmitting, setBookSubmitting] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [bookEditSubmitting, setBookEditSubmitting] = useState(false);

  const [selectedBookId, setSelectedBookId] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterBody, setChapterBody] = useState('');
  const [chapterStatus, setChapterStatus] = useState('');
  const [chapterDiagnostics, setChapterDiagnostics] = useState('');
  const [chapterSubmitting, setChapterSubmitting] = useState(false);
  const [editingChapter, setEditingChapter] = useState(null);
  const [chapterEditSubmitting, setChapterEditSubmitting] = useState(false);
  const [chapterRefreshing, setChapterRefreshing] = useState(false);

  const [bookshelfTags, setBookshelfTags] = useState([]);
  const [bookshelfTagInput, setBookshelfTagInput] = useState('');
  const [bookshelfStatus, setBookshelfStatus] = useState('');
  const [bookshelfLoading, setBookshelfLoading] = useState(false);
  const [bookshelfSaving, setBookshelfSaving] = useState(false);

  const loadBooks = useCallback(async () => {
    setBooksLoading(true);

    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, cover_image_url, tags')
      .order('title', { ascending: true });

    if (error) {
      setBookStatus(`Unable to load books: ${error.message}`);
      setBooks([]);
      setBooksLoading(false);
      return;
    }

    const loadedBooks = sortBooks(data ?? []);
    setBooks(loadedBooks);
    setSelectedBookId((currentId) => {
      if (loadedBooks.length === 0) return '';
      if (loadedBooks.some((book) => book.id === currentId)) return currentId;
      return loadedBooks[0].id;
    });
    setBooksLoading(false);
  }, []);

  const loadBookshelfConfig = useCallback(async () => {
    setBookshelfLoading(true);
    setBookshelfStatus('');

    const { data, error } = await supabase
      .from('bookshelf_config')
      .select('display_tags')
      .eq('key', 'default')
      .maybeSingle();

    if (error) {
      setBookshelfStatus(`Unable to load bookshelf config: ${error.message}`);
      setBookshelfLoading(false);
      return;
    }

    setBookshelfTags(Array.isArray(data?.display_tags) ? data.display_tags : []);
    setBookshelfLoading(false);
  }, []);

  const loadChapters = async (bookId) => {
    if (!bookId) {
      setChapters([]);
      setChapterDiagnostics('');
      return;
    }

    setChaptersLoading(true);
    setChapterDiagnostics('');
    const { data, error } = await supabase
      .from('chapters')
      .select('id, title, body, created_at')
      .eq('book_id', bookId)
      .order('created_at', { ascending: true });

    if (error) {
      setChapterStatus(`Unable to load chapters: ${error.message}`);
      setChapters([]);
      setChaptersLoading(false);
      return;
    }

    const chapterRows = data ?? [];
    setChapters(chapterRows);

    if (chapterRows.length === 0) {
      const { data: visibleChapters, error: visibleError } = await supabase
        .from('chapters')
        .select('id, book_id')
        .limit(25);

      if (visibleError) {
        setChapterDiagnostics(`Diagnostic query failed: ${visibleError.message}`);
      } else if (!visibleChapters || visibleChapters.length === 0) {
        setChapterDiagnostics(
          'App cannot see any chapters rows. This usually means RLS select policy is blocking this user.'
        );
      } else {
        const visibleBookIds = [...new Set(visibleChapters.map((chapter) => chapter.book_id))]
          .filter(Boolean)
          .join(', ');

        setChapterDiagnostics(
          `App can see ${visibleChapters.length} chapter row(s), but none for selected book_id ${bookId}. Visible book_id values: ${visibleBookIds}`
        );
      }
    }

    setChaptersLoading(false);
  };

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    loadBookshelfConfig();
  }, [loadBookshelfConfig]);

  useEffect(() => {
    loadChapters(selectedBookId);
  }, [selectedBookId]);

  const selectedBook = books.find((book) => book.id === selectedBookId);

  const availableTags = useMemo(() => {
    const tags = new Set();
    books.forEach((book) => {
      (book.tags ?? []).forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) tags.add(tag.trim());
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [books]);

  const handleAddBookshelfTag = () => {
    const nextTag = bookshelfTagInput.trim();
    if (!nextTag) return;
    setBookshelfTags((current) => {
      const hasTag = current.some((tag) => tag.toLowerCase() === nextTag.toLowerCase());
      return hasTag ? current : [...current, nextTag];
    });
    setBookshelfTagInput('');
  };

  const handleRemoveBookshelfTag = (tagToRemove) => {
    setBookshelfTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const handleSaveBookshelfConfig = async () => {
    setBookshelfSaving(true);
    setBookshelfStatus('');

    const payload = {
      key: 'default',
      display_tags: bookshelfTags,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('bookshelf_config')
      .upsert(payload, { onConflict: 'key' });

    if (error) {
      setBookshelfStatus(`Failed to save bookshelf config: ${error.message}`);
      setBookshelfSaving(false);
      return;
    }

    setBookshelfStatus('Bookshelf config saved.');
    setBookshelfSaving(false);
  };

  const handleRefreshChapters = async () => {
    if (!selectedBookId) return;
    setChapterRefreshing(true);
    setChapterStatus('');
    await loadChapters(selectedBookId);
    setChapterRefreshing(false);
  };

  const handleAddBook = async (event) => {
    event.preventDefault();
    setBookStatus('');
    setBookSubmitting(true);

    const payload = {
      title: bookTitle.trim(),
      author: bookAuthor.trim(),
      cover_image_url: bookCoverImage.trim() || null,
      tags: normalizeTags(bookTags),
    };

    const { data, error } = await supabase
      .from('books')
      .insert(payload)
      .select('id, title, author, cover_image_url, tags')
      .single();

    if (error) {
      setBookStatus(`Failed to add book: ${error.message}`);
      setBookSubmitting(false);
      return;
    }

    setBookStatus(`Added book: ${data.title}`);
    setBookTitle('');
    setBookAuthor('');
    setBookCoverImage('');
    setBookTags('');
    setBooks((currentBooks) => sortBooks([...currentBooks, data]));
    setSelectedBookId((currentId) => currentId || data.id);
    setBookSubmitting(false);
  };

  const startBookEdit = (book) => {
    setEditingBook({
      id: book.id,
      title: book.title,
      author: book.author,
      cover_image_url: book.cover_image_url ?? '',
      tags: formatTags(book.tags),
    });
  };

  const handleSaveBookEdit = async () => {
    if (!editingBook) return;

    setBookEditSubmitting(true);
    setBookStatus('');

    const payload = {
      title: editingBook.title.trim(),
      author: editingBook.author.trim(),
      cover_image_url: editingBook.cover_image_url.trim() || null,
      tags: normalizeTags(editingBook.tags),
    };

    const { data, error } = await supabase
      .from('books')
      .update(payload)
      .eq('id', editingBook.id)
      .select('id, title, author, cover_image_url, tags')
      .single();

    if (error) {
      setBookStatus(`Failed to update book: ${error.message}`);
      setBookEditSubmitting(false);
      return;
    }

    setBooks((currentBooks) => sortBooks(currentBooks.map((book) => (book.id === data.id ? data : book))));
    setEditingBook(null);
    setBookStatus(`Updated book: ${data.title}`);
    setBookEditSubmitting(false);
  };

  const handleDeleteBook = async (book) => {
    const shouldDelete = window.confirm(`Delete book "${book.title}" and all its chapters?`);
    if (!shouldDelete) return;

    setBookStatus('');

    const { error } = await supabase.from('books').delete().eq('id', book.id);

    if (error) {
      setBookStatus(`Failed to delete book: ${error.message}`);
      return;
    }

    const remainingBooks = books.filter((item) => item.id !== book.id);
    setBooks(remainingBooks);
    setSelectedBookId((currentId) => {
      if (currentId !== book.id) return currentId;
      return remainingBooks[0]?.id ?? '';
    });
    setBookStatus(`Deleted book: ${book.title}`);
  };

  const handleAddChapter = async (event) => {
    event.preventDefault();
    setChapterStatus('');
    setChapterSubmitting(true);

    const payload = {
      book_id: selectedBookId,
      title: chapterTitle.trim(),
      body: chapterBody.trim(),
    };

    const { data, error } = await supabase
      .from('chapters')
      .insert(payload)
      .select('id, title, body, created_at')
      .single();

    if (error) {
      setChapterStatus(`Failed to add chapter: ${error.message}`);
      setChapterSubmitting(false);
      return;
    }

    setChapterStatus('Chapter added successfully.');
    setChapterTitle('');
    setChapterBody('');
    setChapters((currentChapters) => [...currentChapters, data]);
    setChapterSubmitting(false);
  };

  const startChapterEdit = (chapter) => {
    setEditingChapter({
      id: chapter.id,
      title: chapter.title,
      body: chapter.body,
    });
  };

  const handleSaveChapterEdit = async () => {
    if (!editingChapter) return;

    setChapterEditSubmitting(true);
    setChapterStatus('');

    const payload = {
      title: editingChapter.title.trim(),
      body: editingChapter.body.trim(),
    };

    const { data, error } = await supabase
      .from('chapters')
      .update(payload)
      .eq('id', editingChapter.id)
      .select('id, title, body, created_at')
      .single();

    if (error) {
      setChapterStatus(`Failed to update chapter: ${error.message}`);
      setChapterEditSubmitting(false);
      return;
    }

    setChapters((currentChapters) =>
      currentChapters.map((chapter) => (chapter.id === data.id ? data : chapter))
    );
    setEditingChapter(null);
    setChapterStatus('Chapter updated successfully.');
    setChapterEditSubmitting(false);
  };

  const handleDeleteChapter = async (chapter) => {
    const shouldDelete = window.confirm(`Delete chapter "${chapter.title}"?`);
    if (!shouldDelete) return;

    setChapterStatus('');

    const { error } = await supabase.from('chapters').delete().eq('id', chapter.id);

    if (error) {
      setChapterStatus(`Failed to delete chapter: ${error.message}`);
      return;
    }

    setChapters((currentChapters) => currentChapters.filter((item) => item.id !== chapter.id));
    setChapterStatus(`Deleted chapter: ${chapter.title}`);
  };

  return (
    <div className="page-container admin-dashboard">
      <h1>Admin Dashboard</h1>
      <p className="admin-intro">Manage books, chapters, and D&D content.</p>

      {/* Main Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        borderBottom: '2px solid #ccc'
      }}>
        <button
          onClick={() => setMainTab('books')}
          style={{
            padding: '12px 24px',
            background: mainTab === 'books' ? '#4CAF50' : 'transparent',
            color: mainTab === 'books' ? 'white' : '#333',
            border: 'none',
            borderBottom: mainTab === 'books' ? '3px solid #4CAF50' : 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            marginBottom: '-2px'
          }}
        >
          📚 Books & Chapters
        </button>
        
        <button
          onClick={() => setMainTab('dnd')}
          style={{
            padding: '12px 24px',
            background: mainTab === 'dnd' ? '#4CAF50' : 'transparent',
            color: mainTab === 'dnd' ? 'white' : '#333',
            border: 'none',
            borderBottom: mainTab === 'dnd' ? '3px solid #4CAF50' : 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            marginBottom: '-2px'
          }}
        >
          🎲 D&D Content
        </button>
      </div>

      {/* Books & Chapters View */}
      {mainTab === 'books' && (
        <div className="admin-books-wrap">
          <div className="admin-subtabs" role="tablist" aria-label="Books sections">
            <button
              type="button"
              className={`admin-subtab ${booksSubTab === 'manage' ? 'is-active' : ''}`}
              onClick={() => setBooksSubTab('manage')}
              role="tab"
              aria-selected={booksSubTab === 'manage'}
            >
              📚 Books & Chapters
            </button>
            <button
              type="button"
              className={`admin-subtab ${booksSubTab === 'config' ? 'is-active' : ''}`}
              onClick={() => setBooksSubTab('config')}
              role="tab"
              aria-selected={booksSubTab === 'config'}
            >
              🧭 Bookshelf Config
            </button>
          </div>

          {booksSubTab === 'manage' && (
            <div className="admin-grid">
              <section className="admin-card" aria-labelledby="admin-books-title">
                <h2 id="admin-books-title">Books</h2>
              <form className="admin-form" onSubmit={handleAddBook}>
            <label htmlFor="book-title">Title</label>
            <input
              id="book-title"
              value={bookTitle}
              onChange={(event) => setBookTitle(event.target.value)}
              required
              disabled={bookSubmitting}
            />

            <label htmlFor="book-author">Author</label>
            <input
              id="book-author"
              value={bookAuthor}
              onChange={(event) => setBookAuthor(event.target.value)}
              required
              disabled={bookSubmitting}
            />

            <label htmlFor="book-cover-image">Cover PNG URL</label>
            <input
              id="book-cover-image"
              type="url"
              placeholder="https://.../cover.png"
              value={bookCoverImage}
              onChange={(event) => setBookCoverImage(event.target.value)}
              disabled={bookSubmitting}
            />

            <label htmlFor="book-tags">Display Tags (comma-separated)</label>
            <input
              id="book-tags"
              placeholder="folklore, horror, archives"
              value={bookTags}
              onChange={(event) => setBookTags(event.target.value)}
              disabled={bookSubmitting}
            />

            <button type="submit" disabled={bookSubmitting}>
              {bookSubmitting ? 'Adding…' : 'Add Book'}
            </button>
          </form>

          <div className="admin-list">
            {books.map((book) => {
              const isEditing = editingBook?.id === book.id;
              return (
                <div key={book.id} className={`admin-list-item ${selectedBookId === book.id ? 'is-active' : ''}`}>
                  {isEditing ? (
                    <div className="admin-inline-form">
                      <input
                        value={editingBook.title}
                        onChange={(event) =>
                          setEditingBook((current) => ({ ...current, title: event.target.value }))
                        }
                        disabled={bookEditSubmitting}
                      />
                      <input
                        value={editingBook.author}
                        onChange={(event) =>
                          setEditingBook((current) => ({ ...current, author: event.target.value }))
                        }
                        disabled={bookEditSubmitting}
                      />
                      <input
                        type="url"
                        placeholder="https://.../cover.png"
                        value={editingBook.cover_image_url}
                        onChange={(event) =>
                          setEditingBook((current) => ({ ...current, cover_image_url: event.target.value }))
                        }
                        disabled={bookEditSubmitting}
                      />
                      <input
                        placeholder="folklore, horror, archives"
                        value={editingBook.tags}
                        onChange={(event) =>
                          setEditingBook((current) => ({ ...current, tags: event.target.value }))
                        }
                        disabled={bookEditSubmitting}
                      />
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-action-btn"
                          onClick={handleSaveBookEdit}
                          disabled={bookEditSubmitting}
                        >
                          {bookEditSubmitting ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn is-muted"
                          onClick={() => setEditingBook(null)}
                          disabled={bookEditSubmitting}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="admin-list-copy">
                        <strong>{book.title}</strong>
                        <span>{book.author}</span>
                        {book.cover_image_url && <span>Cover: {book.cover_image_url}</span>}
                        {book.tags?.length ? <span>Tags: {book.tags.join(', ')}</span> : null}
                      </div>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-action-btn is-muted"
                          onClick={() => setSelectedBookId(book.id)}
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn is-muted"
                          onClick={() => startBookEdit(book)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn is-danger"
                          onClick={() => handleDeleteBook(book)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {!booksLoading && books.length === 0 && (
              <p className="admin-status">No books created yet.</p>
            )}
          </div>

          {bookStatus && <p className="admin-status">{bookStatus}</p>}
        </section>

        <section className="admin-card" aria-labelledby="admin-chapters-title">
          <div className="admin-section-head">
            <h2 id="admin-chapters-title">Chapters</h2>
            <button
              type="button"
              className="admin-action-btn is-muted"
              onClick={handleRefreshChapters}
              disabled={!selectedBookId || chaptersLoading || chapterRefreshing}
            >
              {chapterRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <form className="admin-form" onSubmit={handleAddChapter}>
            <label htmlFor="chapter-book">Book</label>
            <select
              id="chapter-book"
              value={selectedBookId}
              onChange={(event) => setSelectedBookId(event.target.value)}
              required
              disabled={booksLoading || books.length === 0 || chapterSubmitting}
            >
              <option value="">Select a book</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} — {book.author}
                </option>
              ))}
            </select>

            <label htmlFor="chapter-title">Chapter Title</label>
            <input
              id="chapter-title"
              value={chapterTitle}
              onChange={(event) => setChapterTitle(event.target.value)}
              required
              disabled={chapterSubmitting || books.length === 0}
            />

            <label htmlFor="chapter-body">Chapter Body (Markdown supported)</label>
            <textarea
              id="chapter-body"
              value={chapterBody}
              onChange={(event) => setChapterBody(event.target.value)}
              required
              rows={8}
              disabled={chapterSubmitting || books.length === 0}
            />

            <button type="submit" disabled={chapterSubmitting || books.length === 0}>
              {chapterSubmitting ? 'Adding…' : 'Add Chapter'}
            </button>
          </form>

          {selectedBookId && (
            <p className="admin-status admin-query-meta">
              Viewing chapters for: <strong>{selectedBook?.title ?? 'Selected book'}</strong> ({selectedBookId})
            </p>
          )}

          <p className="admin-status admin-manage-note">
            Manage existing chapters below. Use <strong>Edit</strong> to update title/body and <strong>Delete</strong>
            to remove a chapter.
          </p>

          <div className="admin-list">
            {chaptersLoading && selectedBookId && (
              <p className="admin-status">Loading chapters for selected book...</p>
            )}

            {!selectedBookId && books.length > 0 && !booksLoading && (
              <p className="admin-status">Select a book to view and edit its chapters.</p>
            )}

            {chapters.map((chapter) => {
              const isEditing = editingChapter?.id === chapter.id;
              return (
                <div key={chapter.id} className="admin-list-item">
                  {isEditing ? (
                    <div className="admin-inline-form">
                      <input
                        value={editingChapter.title}
                        onChange={(event) =>
                          setEditingChapter((current) => ({ ...current, title: event.target.value }))
                        }
                        disabled={chapterEditSubmitting}
                      />
                      <textarea
                        value={editingChapter.body}
                        rows={6}
                        onChange={(event) =>
                          setEditingChapter((current) => ({ ...current, body: event.target.value }))
                        }
                        disabled={chapterEditSubmitting}
                      />
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-action-btn"
                          onClick={handleSaveChapterEdit}
                          disabled={chapterEditSubmitting}
                        >
                          {chapterEditSubmitting ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn is-muted"
                          onClick={() => setEditingChapter(null)}
                          disabled={chapterEditSubmitting}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="admin-list-copy">
                        <strong>{chapter.title}</strong>
                        <span>{chapter.body.slice(0, 120)}{chapter.body.length > 120 ? '…' : ''}</span>
                      </div>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-action-btn is-muted"
                          onClick={() => startChapterEdit(chapter)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn is-danger"
                          onClick={() => handleDeleteChapter(chapter)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {!chaptersLoading && selectedBookId && chapters.length === 0 && (
              <p className="admin-status">
                No chapters were returned for this selected book. If chapters exist in Supabase, confirm they use
                this exact book ID and that your `chapters` select policy allows your signed-in user.
              </p>
            )}
          </div>

          {books.length === 0 && !booksLoading && (
            <p className="admin-status">Add a book first before creating chapters.</p>
          )}
          {chapterStatus && <p className="admin-status">{chapterStatus}</p>}
          {chapterDiagnostics && <p className="admin-status">{chapterDiagnostics}</p>}
        </section>
      </div>
          )}

          {booksSubTab === 'config' && (
            <section className="admin-card" aria-labelledby="admin-bookshelf-title">
              <div className="admin-section-head">
                <h2 id="admin-bookshelf-title">Bookshelf Config</h2>
                <button
                  type="button"
                  className="admin-action-btn"
                  onClick={handleSaveBookshelfConfig}
                  disabled={bookshelfSaving}
                >
                  {bookshelfSaving ? 'Saving…' : 'Save Config'}
                </button>
              </div>

              <p className="admin-status admin-manage-note">
                Select which tags should appear as bookshelf sections. These will be used when we re-enable tag rows.
              </p>

              <div className="admin-form">
                <label htmlFor="bookshelf-tag-input">Add a tag</label>
                <div className="admin-tag-input-row">
                  <input
                    id="bookshelf-tag-input"
                    list="bookshelf-tag-options"
                    placeholder="Start typing or pick a tag"
                    value={bookshelfTagInput}
                    onChange={(event) => setBookshelfTagInput(event.target.value)}
                    disabled={bookshelfLoading}
                  />
                  <button
                    type="button"
                    className="admin-action-btn"
                    onClick={handleAddBookshelfTag}
                    disabled={bookshelfLoading}
                  >
                    Add
                  </button>
                </div>
                <datalist id="bookshelf-tag-options">
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>

                <div className="admin-chip-row" role="list">
                  {bookshelfTags.length === 0 && (
                    <span className="admin-chip-empty">No tags selected yet.</span>
                  )}
                  {bookshelfTags.map((tag) => (
                    <span key={tag} className="admin-chip" role="listitem">
                      {tag}
                      <button
                        type="button"
                        className="admin-chip-remove"
                        onClick={() => handleRemoveBookshelfTag(tag)}
                        aria-label={`Remove ${tag}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {bookshelfStatus && <p className="admin-status">{bookshelfStatus}</p>}
            </section>
          )}
        </div>
      )}

      {/* D&D Content View */}
      {mainTab === 'dnd' && (
        <div>
          {reviewPending && (
            <div style={{
              padding: '12px 16px',
              background: '#fff3cd',
              color: '#856404',
              border: '1px solid #ffeaa7',
              borderRadius: '6px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>Reference data review is pending.</span>
              <button
                type="button"
                onClick={handleReviewReturn}
                style={{
                  padding: '6px 12px',
                  background: '#f39c12',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Return to review
              </button>
            </div>
          )}
          {/* D&D Sub-Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            marginBottom: '20px',
            borderBottom: '1px solid #ddd'
          }}>
            <button
              onClick={() => setDndTab('spells')}
              style={{
                padding: '10px 20px',
                background: dndTab === 'spells' ? '#2196F3' : 'transparent',
                color: dndTab === 'spells' ? 'white' : '#666',
                border: 'none',
                borderBottom: dndTab === 'spells' ? '2px solid #2196F3' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: dndTab === 'spells' ? 'bold' : 'normal'
              }}
            >
              📜 Spells
            </button>
            
            <button
              onClick={() => setDndTab('items')}
              style={{
                padding: '10px 20px',
                background: dndTab === 'items' ? '#2196F3' : 'transparent',
                color: dndTab === 'items' ? 'white' : '#666',
                border: 'none',
                borderBottom: dndTab === 'items' ? '2px solid #2196F3' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: dndTab === 'items' ? 'bold' : 'normal'
              }}
            >
              ⚔️ Magic Items
            </button>
            
            <button
              onClick={() => setDndTab('feats')}
              style={{
                padding: '10px 20px',
                background: dndTab === 'feats' ? '#2196F3' : 'transparent',
                color: dndTab === 'feats' ? 'white' : '#666',
                border: 'none',
                borderBottom: dndTab === 'feats' ? '2px solid #2196F3' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: dndTab === 'feats' ? 'bold' : 'normal'
              }}
            >
              🎯 Feats
            </button>

            <button
              onClick={() => setDndTab('characters')}
              style={{
                padding: '10px 20px',
                background: dndTab === 'characters' ? '#2196F3' : 'transparent',
                color: dndTab === 'characters' ? 'white' : '#666',
                border: 'none',
                borderBottom: dndTab === 'characters' ? '2px solid #2196F3' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: dndTab === 'characters' ? 'bold' : 'normal'
              }}
            >
              👤 Characters
            </button>
          </div>

          {/* D&D Content Based on Sub-Tab */}
          <div className="admin-card">
            {dndTab === 'spells' && (
              <SpellManagement
                prefill={spellPrefill}
                onPrefillConsumed={() => setSpellPrefill(null)}
              />
            )}
            {dndTab === 'items' && (
              <MagicItemManagement
                prefill={itemPrefill}
                onPrefillConsumed={() => setItemPrefill(null)}
              />
            )}
            {dndTab === 'feats' && (
              <FeatManagement
                prefill={featPrefill}
                onPrefillConsumed={() => setFeatPrefill(null)}
              />
            )}
            <div style={{ display: dndTab === 'characters' ? 'block' : 'none' }}>
              <CharacterImporter
                onNavigateTab={handleNavigateTab}
                onPrefill={handlePrefill}
                onReviewPendingChange={setReviewPending}
                reviewOpenNonce={reviewOpenNonce}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
