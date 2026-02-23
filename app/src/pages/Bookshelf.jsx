import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Previewer } from 'pagedjs';
import useEmblaCarousel from 'embla-carousel-react';
import { supabase } from '../lib/supabase';
import './Bookshelf.css';

const PAGE_CHAR_LIMIT = 1200;
const MIN_PAGE_WIDTH = 280;
const MIN_PAGE_HEIGHT = 420;
const PAGE_MARGIN_RATIO = 0.04;
const PAGE_MARGIN_MIN = 12;
const PAGE_GUTTER_X = 2;
const PAGE_GUTTER_Y = 8;
const HEADER_GUTTER = 12;
const PAGE_ASPECT_RATIO = 1024 / 1536;
const RECENT_BOOK_LIMIT = 16;

const escapeHtml = (value) =>
  (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const chapterBodyToHtml = (body) => {
  const paragraphs = (body ?? '')
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '<p></p>';

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br />')}</p>`)
    .join('');
};

const extractChapterNumber = (title) => {
  if (!title) return null;
  const match = title.match(/(?:chapter|ch\.?)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const calculateChapterStartPage = (bookTitle, chapterNum) => {
  const bookHash = simpleHash(bookTitle);
  const avgPagesPerChapter = 14 + (bookHash % 8);
  const chapterHash = simpleHash(bookTitle + ':' + chapterNum);
  const offset = -5 + (chapterHash % 11);
  
  return Math.max(1, (chapterNum - 1) * avgPagesPerChapter + offset);
};

const buildPagedMarkup = (book, chapters) => {
  const bookTitle = escapeHtml(book?.title ?? '');
  const cover = book?.cover_image_url
    ? `<section class="book-cover-page" data-book-title="${bookTitle}"><img src="${escapeHtml(
        book.cover_image_url
      )}" alt="${escapeHtml(book.title)} cover" /></section>`
    : `<section class="book-cover-page book-cover-fallback" data-book-title="${bookTitle}"></section>`;

  const chapterSections = chapters
    .map((chapter, chapterIndex) => {
      const headingParts = (chapter.title ?? '')
        .split(':')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => `<span class="book-chapter-line">${escapeHtml(part)}</span>`)
        .join('');

      return `
        <section class="book-chapter-page chapter-page-${chapterIndex}" data-letterhead="${escapeHtml(chapter.title ?? '')}">
          <div class="book-body">
            <div class="book-chapter-wrap">
              <h4 class="book-chapter-heading">${headingParts || `<span class="book-chapter-line">${escapeHtml(
                chapter.title ?? ''
              )}</span>`}</h4>
              <div class="book-chapter-divider"></div>
            </div>
            <article class="book-body-copy">${chapterBodyToHtml(chapter.body ?? '')}</article>
          </div>
        </section>
      `;
    })
    .join('');

  return `${cover}${chapterSections}`;
};

const buildPagedStyles = (pageConfig) => {
  return `
  @page {
    size: ${pageConfig.width}px ${pageConfig.height}px;
    margin: ${pageConfig.margin}px;
    margin-top: ${pageConfig.margin + HEADER_GUTTER}px;
  }

  @page:left {
    @top-center {
      content: string(book-title);
      font-family: 'Cinzel', 'Georgia', serif;
      font-size: 0.7rem;
      color: #39220d;
      letter-spacing: 0.04em;
    }
  }

  @page:right {
    @top-center {
      content: string(chapter-title);
      font-family: 'Cinzel', 'Georgia', serif;
      font-size: 0.7rem;
      color: #39220d;
      letter-spacing: 0.04em;
    }
  }

  @page cover {
    size: ${pageConfig.width}px ${pageConfig.height}px;
    margin: 0;
  }

  .book-cover-page {
    page: cover;
    string-set: book-title attr(data-book-title);
    break-after: page;
    page-break-after: always;
  }

  .book-chapter-page {
    string-set: chapter-title attr(data-letterhead);
    break-before: page;
    page-break-before: always;
  }
  
  .fake-page-number {
    position: absolute;
    bottom: ${pageConfig.margin}px;
    font-family: 'Cinzel', 'Georgia', serif;
    font-size: 0.65rem;
    color: #5d482d;
    letter-spacing: 0.03em;
  }
  
  .fake-page-number.left {
    left: ${pageConfig.margin}px;
  }
  
  .fake-page-number.right {
    right: ${pageConfig.margin}px;
  }
`;
};

const splitParagraphToChunks = (paragraph, limit) => {
  if (!paragraph || paragraph.length <= limit) return [paragraph];

  const lines = paragraph.split('\n');
  const chunks = [];
  let current = '';

  lines.forEach((line) => {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit) {
      current = candidate;
      return;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= limit) {
      current = line;
      return;
    }

    const words = line.split(/(\s+)/).filter(Boolean);
    let segment = '';

    words.forEach((word) => {
      const next = `${segment}${word}`;
      if (next.length <= limit) {
        segment = next;
      } else {
        if (segment) chunks.push(segment.trimEnd());
        segment = word.trimStart();
      }
    });

    if (segment) {
      current = segment;
    }
  });

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
};

const paginateChapterBody = (body, limit) => {
  const paragraphs = (body ?? '')
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [[]];

  const expanded = paragraphs.flatMap((paragraph) => splitParagraphToChunks(paragraph, limit));

  const pages = [];
  let current = [];
  let used = 0;

  expanded.forEach((paragraph) => {
    const cost = paragraph.length + 40;
    if (current.length > 0 && used + cost > limit) {
      pages.push(current);
      current = [];
      used = 0;
    }

    current.push(paragraph);
    used += cost;
  });

  if (current.length > 0) pages.push(current);
  return pages;
};

const buildReaderPages = (book, chapters) => {
  const pages = [
    {
      type: 'cover',
      id: `cover-${book.id}`,
      title: book.title ?? 'Untitled',
      coverImageUrl: book.cover_image_url ?? '',
    },
  ];

  chapters.forEach((chapter, chapterIndex) => {
    const chunks = paginateChapterBody(chapter.body ?? '', PAGE_CHAR_LIMIT);
    chunks.forEach((paragraphs, pageIndex) => {
      pages.push({
        type: 'chapter',
        id: `${chapter.id}-${pageIndex}`,
        title: chapter.title ?? `Chapter ${chapterIndex + 1}`,
        chapterNumber: chapterIndex + 1,
        showHeading: pageIndex === 0,
        paragraphs,
      });
    });
  });

  return pages;
};

function BookshelfCarousel({ title, books, onBookOpen }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: true,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateControls = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    updateControls();
    emblaApi.on('select', updateControls);
    emblaApi.on('reInit', updateControls);
    return () => {
      emblaApi.off('select', updateControls);
      emblaApi.off('reInit', updateControls);
    };
  }, [emblaApi, updateControls]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (!books || books.length === 0) return null;

  return (
    <section className="bookshelf-section">
      <div className="bookshelf-section-head">
        <h2 className="bookshelf-section-title">{title}</h2>
        <div className="bookshelf-carousel-controls">
          <button
            type="button"
            className="bookshelf-carousel-btn"
            onClick={scrollPrev}
            disabled={!canPrev}
            aria-label="Scroll previous"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M14.5 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="bookshelf-carousel-btn"
            onClick={scrollNext}
            disabled={!canNext}
            aria-label="Scroll next"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.5 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="bookshelf-carousel" ref={emblaRef}>
        <div className="bookshelf-carousel-track">
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              className="bookshelf-tile"
              onClick={() => onBookOpen(book.id)}
            >
              <div className="bookshelf-tile-cover">
                {book.cover_image_url ? (
                  <img src={book.cover_image_url} alt={`${book.title ?? 'Book'} cover`} />
                ) : (
                  <div className="bookshelf-cover-fallback" aria-hidden="true" />
                )}
              </div>
              <div className="bookshelf-tile-meta">
                <span className="bookshelf-tile-title">{book.title}</span>
                <span className="bookshelf-tile-author">{book.author}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Bookshelf() {
  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState('');
  const [chapters, setChapters] = useState([]);

  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [status, setStatus] = useState('');
  const [readerMode, setReaderMode] = useState('loading');
  const [readerError, setReaderError] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pagedTotalPages, setPagedTotalPages] = useState(0);

  const pagedWrapperRef = useRef(null);
  const pagedContainerRef = useRef(null);
  const pagedPagesRef = useRef([]);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const loadBooks = async () => {
      setLoadingBooks(true);
      setStatus('');

      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, cover_image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        setStatus(`Unable to load books: ${error.message}`);
        setBooks([]);
        setLoadingBooks(false);
        return;
      }

      setBooks(data ?? []);
      setLoadingBooks(false);
    };

    loadBooks();
  }, []);

  useEffect(() => {
    if (!activeBookId) {
      setChapters([]);
      return;
    }

    const loadChapters = async () => {
      setLoadingChapters(true);
      setStatus('');

      const { data, error } = await supabase
        .from('chapters')
        .select('id, title, body, created_at')
        .eq('book_id', activeBookId)
        .order('created_at', { ascending: true });

      if (error) {
        setStatus(`Unable to load chapters: ${error.message}`);
        setChapters([]);
        setLoadingChapters(false);
        return;
      }

      setChapters(data ?? []);
      setLoadingChapters(false);
    };

    loadChapters();
  }, [activeBookId]);

  useEffect(() => {
    if (!activeBookId) return;

    const onEscape = (event) => {
      if (event.key === 'Escape') setActiveBookId('');
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [activeBookId]);

  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) ?? null,
    [books, activeBookId]
  );

  const recentBooks = useMemo(() => {
    return [...books]
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
      .slice(0, RECENT_BOOK_LIMIT);
  }, [books]);


  const openBook = (bookId) => {
    setActiveBookId(bookId);
    setCurrentPage(0);
    setReaderMode('loading');
    setReaderError('');
    setPagedTotalPages(0);
  };

  const closeReader = () => {
    renderTokenRef.current += 1;
    setActiveBookId('');
    setChapters([]);
    setCurrentPage(0);
    setReaderMode('loading');
    setReaderError('');
    setPagedTotalPages(0);
    pagedPagesRef.current = [];

    if (pagedContainerRef.current) {
      pagedContainerRef.current.innerHTML = '';
    }
  };

  const readerPages = useMemo(() => {
    if (!activeBook || chapters.length === 0) return [];
    return buildReaderPages(activeBook, chapters);
  }, [activeBook, chapters]);

  const isCoverOnly = !loadingChapters && chapters.length === 0 && !!activeBook?.cover_image_url;

  useEffect(() => {
    setCurrentPage(0);
  }, [readerPages.length]);

  useEffect(() => {
    if (!activeBook || loadingChapters || chapters.length === 0) {
      return;
    }

    const token = renderTokenRef.current + 1;
    renderTokenRef.current = token;

    const renderPagedBook = async () => {
      if (!pagedContainerRef.current || !pagedWrapperRef.current) {
        console.log('No container ref, retrying...');
        setTimeout(() => {
          if (renderTokenRef.current === token) renderPagedBook();
        }, 100);
        return;
      }

      const wrapper = pagedWrapperRef.current;
      const container = pagedContainerRef.current;
      setReaderMode('loading');
      setReaderError('');
      setPagedTotalPages(0);
      pagedPagesRef.current = [];
      
      // Hide container during rendering to prevent flash
      wrapper.style.visibility = 'hidden';

      try {
        if (typeof Previewer !== 'function') throw new Error('Paged Previewer unavailable');

        console.log('Starting pagedjs preview...');

        const wrapperRect = wrapper.getBoundingClientRect();
        const maxWidth = Math.floor(wrapperRect.width) - PAGE_GUTTER_X;
        const maxHeight = Math.floor(wrapperRect.height) - PAGE_GUTTER_Y;

        let pageWidth = maxWidth;
        let pageHeight = Math.floor(pageWidth / PAGE_ASPECT_RATIO);

        if (pageHeight > maxHeight) {
          pageHeight = maxHeight;
          pageWidth = Math.floor(pageHeight * PAGE_ASPECT_RATIO);
        }

        pageWidth = Math.max(MIN_PAGE_WIDTH, pageWidth);
        pageHeight = Math.max(MIN_PAGE_HEIGHT, pageHeight);
        const margin = Math.max(
          PAGE_MARGIN_MIN,
          Math.floor(Math.min(pageWidth, pageHeight) * PAGE_MARGIN_RATIO)
        );

        const pageConfig = {
          width: pageWidth,
          height: pageHeight,
          margin,
        };

        wrapper.style.setProperty('--paged-scale', '1');
        wrapper.style.setProperty('--paged-page-width', `${pageWidth}px`);
        wrapper.style.setProperty('--paged-page-height', `${pageHeight}px`);
        wrapper.style.setProperty('--paged-scaled-width', `${pageWidth}px`);
        wrapper.style.setProperty('--paged-scaled-height', `${pageHeight}px`);

        const content = document.createElement('div');
        content.innerHTML = buildPagedMarkup(activeBook, chapters);

        const previewer = new Previewer();
        const styles = buildPagedStyles(pageConfig);
        const styleUrl = URL.createObjectURL(new Blob([styles], { type: 'text/css' }));

        try {
          await previewer.preview(content.innerHTML, [styleUrl], container);
        } finally {
          URL.revokeObjectURL(styleUrl);
        }

        if (renderTokenRef.current !== token) return;

        const pages = Array.from(container.querySelectorAll('.pagedjs_page'));
        console.log('Found pages:', pages.length);
        
        if (pages.length === 0) throw new Error('Paged renderer generated zero pages');

        // Calculate and set fake page numbers
        const rawBookTitle = activeBook?.title ?? '';
        let currentChapterIndex = -1;
        let currentChapterStartPage = 1;
        let pagesInCurrentChapter = 0;

        pages.forEach((page, pageIndex) => {
          // Find chapter element in this page
          const chapterElement = page.querySelector('.book-chapter-page[class*="chapter-page-"]');
          if (chapterElement) {
            const match = chapterElement.className.match(/chapter-page-(\d+)/);
            if (match) {
              const chapterIndex = parseInt(match[1], 10);
              if (chapterIndex !== currentChapterIndex) {
                currentChapterIndex = chapterIndex;
                const chapter = chapters[chapterIndex];
                const chapterNum = extractChapterNumber(chapter?.title) ?? chapterIndex + 1;
                currentChapterStartPage = calculateChapterStartPage(rawBookTitle, chapterNum);
                pagesInCurrentChapter = 0;
              }
            }
          }

          const fakePageNum = currentChapterStartPage + pagesInCurrentChapter;
          pagesInCurrentChapter++;

          // Determine left vs right page (cover is page 0/right, then alternates)
          const isLeftPage = pageIndex % 2 === 1;
          
          // Create and append page number element
          const pageNumEl = document.createElement('div');
          pageNumEl.className = `fake-page-number ${isLeftPage ? 'left' : 'right'}`;
          pageNumEl.textContent = String(fakePageNum);
          page.appendChild(pageNumEl);

          page.classList.toggle('is-active', pageIndex === 0);
          page.style.display = 'none';
        });
        
        // Show only the active page
        if (pages[0]) pages[0].style.display = 'block';

        pagedPagesRef.current = pages;
        setPagedTotalPages(pages.length);
        setReaderMode('paged');
        setCurrentPage(0);
        
        // Show container now that we've hidden all but first page
        wrapper.style.visibility = 'visible';
        console.log('Pagination complete');
      } catch (error) {
        if (renderTokenRef.current !== token) return;
        console.error('Pagination error:', error);
        setReaderError(error instanceof Error ? error.message : 'Unknown pagination error');
        setReaderMode('fallback');
      }
    };

    setTimeout(() => {
      if (renderTokenRef.current === token) renderPagedBook();
    }, 0);
  }, [activeBook, chapters, loadingChapters]);

  const movePage = (delta) => {
    const pages = pagedPagesRef.current;
    if (pages.length === 0) return;

    setCurrentPage((previous) => {
      const next = Math.max(0, Math.min(previous + delta, pages.length - 1));
      pages.forEach((page, index) => {
        page.classList.toggle('is-active', index === next);
        page.style.display = index === next ? 'block' : 'none';
      });
      return next;
    });
  };

  return (
    <div className="page-container bookshelf-page">
      <div className="bookshelf-title-wrap" role="heading" aria-level="1">
        <span className="bookshelf-title">Bookshelf</span>
        <div className="bookshelf-title-divider" aria-hidden="true" />
      </div>

      {status && <p className="bookshelf-status">{status}</p>}
      {loadingBooks && <p className="bookshelf-status">Loading books...</p>}

      {!loadingBooks && books.length === 0 && (
        <p className="bookshelf-status">No books available yet.</p>
      )}

      {!loadingBooks && books.length > 0 && (
        <div className="bookshelf-sections">
          <BookshelfCarousel
            title="Recent additions"
            books={recentBooks}
            onBookOpen={openBook}
          />
        </div>
      )}

      {activeBook && (
        <div className="reader-modal-backdrop" onClick={closeReader}>
          <div
            className={`reader-modal${isCoverOnly ? ' is-cover-only' : ''}`}
            onClick={closeReader}
          >
            <button
              type="button"
              className="reader-close-btn reader-icon-btn"
              onClick={(event) => {
                event.stopPropagation();
                closeReader();
              }}
              aria-label="Close reader"
            >
              <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
            </button>

            {loadingChapters && <p className="bookshelf-status">Loading chapters...</p>}
            {!loadingChapters && chapters.length === 0 && activeBook?.cover_image_url && (
              <div className="reader-paged-output" ref={pagedWrapperRef}>
                <div
                  className="reader-paged-frame"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="reader-cover-only">
                    <img
                      src={activeBook.cover_image_url}
                      alt={`${activeBook.title ?? 'Book'} cover`}
                    />
                  </div>
                </div>
              </div>
            )}

            {!loadingChapters && chapters.length === 0 && !activeBook?.cover_image_url && (
              <p className="bookshelf-status">No chapters for this book yet.</p>
            )}

            {!loadingChapters && chapters.length > 0 && (
              <>
                <div className="reader-paged-output" ref={pagedWrapperRef}>
                  <div
                    className="reader-paged-frame"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="reader-paged-stage" ref={pagedContainerRef} />
                  </div>
                </div>
                
                {readerMode === 'paged' && pagedTotalPages > 1 && (
                  <div className="reader-page-nav">
                    <button
                      type="button"
                      className="reader-icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        movePage(-1);
                      }}
                      disabled={currentPage <= 0}
                      aria-label="Previous page"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M14.5 6l-6 6 6 6" />
                      </svg>
                    </button>
                    <span>{currentPage + 1} / {pagedTotalPages}</span>
                    <button
                      type="button"
                      className="reader-icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        movePage(1);
                      }}
                      disabled={currentPage >= pagedTotalPages - 1}
                      aria-label="Next page"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9.5 6l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}

            {readerError && (
              <p className="bookshelf-status">Pagination failed: {readerError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Bookshelf;
