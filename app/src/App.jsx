import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AssetLoader from './components/AssetLoader';
import Layout from './components/Layout';
import Login from './pages/Login';
import CharacterSheet from './pages/CharacterSheet';
import VisualCreaturesTest from './pages/VisualCreaturesTest';
import VisualHpModalTest from './pages/VisualHpModalTest';
import Bookshelf from './pages/Bookshelf';
import GalateaFineArt from './pages/GalateaFineArt';
import Notes from './pages/Notes';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

function App() {
  const fontLoadTimeout = (promise, timeoutMs) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);

  useEffect(() => {
    const waitForFonts = async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await fontLoadTimeout(Promise.allSettled([
            document.fonts.load('400 1em "Goudy Bookletter 1911"'),
            document.fonts.load('400 1em "Libre Baskerville"'),
            document.fonts.load('400 1em "Inter"'),
            document.fonts.load('400 1em "Cormorant Unicase"'),
            document.fonts.load('400 1em "Medieval Sharp"'),
            document.fonts.ready,
          ]), 3000);
        }
      } catch (error) {
        console.warn('Font loading failed; continuing with fallback fonts:', error);
      }

      // Font loading is progressive and must not block the first screen.
    };

    waitForFonts();
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/__visual/creatures" element={<VisualCreaturesTest />} />
          <Route path="/__visual/hp-modal" element={<VisualHpModalTest />} />
          <Route
            path="/"
            element={
              <AssetLoader mode="critical">
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              </AssetLoader>
            }
          >
            <Route index element={<Navigate to="/character" replace />} />
            <Route path="character" element={<CharacterSheet />} />
            <Route path="bookshelf" element={<Bookshelf />} />
            <Route path="galatea" element={<GalateaFineArt />} />
            <Route path="notes" element={<Notes />} />
            <Route path="admin" element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
