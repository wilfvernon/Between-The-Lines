import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import CharacterSheet from './pages/CharacterSheet';
import Bookshelf from './pages/Bookshelf';
import GalateaFineArt from './pages/GalateaFineArt';
import Notes from './pages/Notes';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

function App() {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const waitForFonts = async () => {
      if (document.fonts && document.fonts.ready) {
        await Promise.allSettled([
          document.fonts.load('400 1em "Goudy Bookletter 1911"'),
          document.fonts.load('400 1em "Libre Baskerville"'),
          document.fonts.load('400 1em "Inter"'),
          document.fonts.load('400 1em "Cormorant Unicase"'),
          document.fonts.load('400 1em "Medieval Sharp"'),
        ]);
        await document.fonts.ready;
      }

      if (isMounted) {
        setFontsReady(true);
      }
    };

    waitForFonts();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!fontsReady) {
    return (
      <div className="route-loading">
        <img src="/crest.png" alt="" className="loading-crest" />
      </div>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
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
