import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './Notes.css';

function Notes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('write');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const [editingId, setEditingId] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingIsPublic, setEditingIsPublic] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setStatus('');

    const { data, error } = await supabase
      .from('notes')
      .select('id, user_id, title, content, is_public, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      setStatus(`Unable to load notes: ${error.message}`);
      setNotes([]);
      setLoading(false);
      return;
    }

    setNotes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const myNotes = useMemo(
    () => notes.filter((note) => note.user_id === user?.id),
    [notes, user?.id]
  );

  const visiblePublicNotes = useMemo(
    () => notes.filter((note) => note.is_public),
    [notes]
  );

  const resetComposer = () => {
    setTitle('');
    setContent('');
    setIsPublic(false);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!user?.id) return;

    if (!content.trim()) {
      setStatus('Please add note content before saving.');
      return;
    }

    setSaving(true);
    setStatus('');

    const payload = {
      user_id: user.id,
      title: title.trim() || null,
      content: content.trim(),
      is_public: isPublic,
    };

    const { error } = await supabase.from('notes').insert(payload);

    if (error) {
      setStatus(`Unable to save note: ${error.message}`);
      setSaving(false);
      return;
    }

    resetComposer();
    setStatus('Note saved.');
    setSaving(false);
    setActiveTab('my-notes');
    await loadNotes();
  };

  const startEditing = (note) => {
    setEditingId(note.id);
    setEditingTitle(note.title || '');
    setEditingContent(note.content || '');
    setEditingIsPublic(Boolean(note.is_public));
    setStatus('');
  };

  const cancelEditing = () => {
    setEditingId('');
    setEditingTitle('');
    setEditingContent('');
    setEditingIsPublic(false);
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!editingId) return;

    if (!editingContent.trim()) {
      setStatus('Note content cannot be empty.');
      return;
    }

    setUpdating(true);
    setStatus('');

    const { error } = await supabase
      .from('notes')
      .update({
        title: editingTitle.trim() || null,
        content: editingContent.trim(),
        is_public: editingIsPublic,
      })
      .eq('id', editingId);

    if (error) {
      setStatus(`Unable to update note: ${error.message}`);
      setUpdating(false);
      return;
    }

    setStatus('Note updated.');
    setUpdating(false);
    cancelEditing();
    await loadNotes();
  };

  const handleDelete = async (noteId) => {
    const confirmed = window.confirm('Delete this note?');
    if (!confirmed) return;

    setDeletingId(noteId);
    setStatus('');

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      setStatus(`Unable to delete note: ${error.message}`);
      setDeletingId('');
      return;
    }

    setStatus('Note deleted.');
    setDeletingId('');
    if (editingId === noteId) cancelEditing();
    await loadNotes();
  };

  const formatDate = (value) => {
    if (!value) return 'Unknown date';
    return new Date(value).toLocaleString();
  };

  return (
    <div className="page-container notes-page">
      <h1>Notes</h1>

      <div className="notes-subtabs" role="tablist" aria-label="Notes sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'write'}
          className={activeTab === 'write' ? 'notes-subtab active' : 'notes-subtab'}
          onClick={() => setActiveTab('write')}
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'my-notes'}
          className={activeTab === 'my-notes' ? 'notes-subtab active' : 'notes-subtab'}
          onClick={() => setActiveTab('my-notes')}
        >
          My Notes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'public'}
          className={activeTab === 'public' ? 'notes-subtab active' : 'notes-subtab'}
          onClick={() => setActiveTab('public')}
        >
          Public Notes
        </button>
      </div>

      {status && <p className="notes-status">{status}</p>}

      {activeTab === 'write' && (
        <section className="notes-card">
          <h2>Create Note</h2>
          <form className="notes-form" onSubmit={handleCreate}>
            <label htmlFor="note-title">Title (optional)</label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Session recap, clue list, NPC notes..."
              maxLength={180}
              disabled={saving}
            />

            <label htmlFor="note-content">Content</label>
            <textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write your note here..."
              rows={8}
              disabled={saving}
              required
            />

            <label className="notes-visibility-row" htmlFor="note-public">
              <input
                id="note-public"
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                disabled={saving}
              />
              Make this note public
            </label>

            <div className="notes-form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Note'}
              </button>
              <button type="button" className="ghost" onClick={resetComposer} disabled={saving}>
                Clear
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'my-notes' && (
        <section className="notes-card">
          <h2>My Notes</h2>
          {loading && <p>Loading notes...</p>}
          {!loading && myNotes.length === 0 && <p>No notes yet.</p>}
          <div className="notes-list">
            {myNotes.map((note) => {
              const isEditing = editingId === note.id;
              return (
                <article key={note.id} className="note-item">
                  {isEditing ? (
                    <form className="notes-form" onSubmit={handleUpdate}>
                      <label htmlFor={`edit-title-${note.id}`}>Title (optional)</label>
                      <input
                        id={`edit-title-${note.id}`}
                        type="text"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        maxLength={180}
                        disabled={updating}
                      />
                      <label htmlFor={`edit-content-${note.id}`}>Content</label>
                      <textarea
                        id={`edit-content-${note.id}`}
                        rows={7}
                        value={editingContent}
                        onChange={(event) => setEditingContent(event.target.value)}
                        disabled={updating}
                        required
                      />
                      <label className="notes-visibility-row" htmlFor={`edit-public-${note.id}`}>
                        <input
                          id={`edit-public-${note.id}`}
                          type="checkbox"
                          checked={editingIsPublic}
                          onChange={(event) => setEditingIsPublic(event.target.checked)}
                          disabled={updating}
                        />
                        Public note
                      </label>
                      <div className="notes-form-actions">
                        <button type="submit" disabled={updating}>
                          {updating ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button type="button" className="ghost" onClick={cancelEditing} disabled={updating}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="note-item-head">
                        <h3>{note.title || 'Untitled Note'}</h3>
                        <span className={note.is_public ? 'note-visibility public' : 'note-visibility private'}>
                          {note.is_public ? 'Public' : 'Private'}
                        </span>
                      </div>
                      <p className="note-content">{note.content}</p>
                      <p className="note-meta">Updated {formatDate(note.updated_at)}</p>
                      <div className="note-item-actions">
                        <button type="button" onClick={() => startEditing(note)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(note.id)}
                          disabled={deletingId === note.id}
                        >
                          {deletingId === note.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'public' && (
        <section className="notes-card">
          <h2>Public Notes</h2>
          {loading && <p>Loading notes...</p>}
          {!loading && visiblePublicNotes.length === 0 && <p>No public notes yet.</p>}
          <div className="notes-list">
            {visiblePublicNotes.map((note) => {
              const isOwner = note.user_id === user?.id;
              return (
                <article key={note.id} className="note-item">
                  <div className="note-item-head">
                    <h3>{note.title || 'Untitled Note'}</h3>
                    <span className="note-visibility public">Public</span>
                  </div>
                  <p className="note-content">{note.content}</p>
                  <p className="note-meta">
                    Updated {formatDate(note.updated_at)} {isOwner ? '• You' : ''}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default Notes;
