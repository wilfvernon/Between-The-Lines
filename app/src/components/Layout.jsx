import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import weaponIcon from '../assets/icons/entity/weapon.svg';
import archiveIcon from '../assets/icons/entity/archive.svg';
import scrollIcon from '../assets/icons/entity/scroll.svg';
import './Layout.css';

const navItems = [
  { to: '/character', iconSrc: weaponIcon, label: 'Character' },
  { to: '/bookshelf', iconSrc: archiveIcon, label: 'Bookshelf' },
  // { to: '/galatea', icon: '🎨', label: 'Galatea' },
  { to: '/notes', iconSrc: scrollIcon, label: 'Notes' },
];

function Layout() {
  const { signOut, user } = useAuth();
  const isAdmin = user?.email === 'admin@candlekeep.sc';
  const [displayName, setDisplayName] = useState('');
  const renderedNavItems = isAdmin
    ? [...navItems, { to: '/admin', icon: '⚙️', label: 'Admin' }]
    : navItems;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadCharacterName = async () => {
      if (!user) {
        if (isMounted) setDisplayName('');
        return;
      }

      const fallbackName =
        user.user_metadata?.username ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'User';

      if (isAdmin) {
        if (isMounted) setDisplayName(fallbackName);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('characters')
          .select('full_name,name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (isMounted) {
          setDisplayName(data?.full_name || data?.name || fallbackName);
        }
      } catch (err) {
        console.error('Error loading character name:', err);
        if (isMounted) setDisplayName(fallbackName);
      }
    };

    loadCharacterName();

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-title">
          <img className="app-crest" src="/crest.png" alt="" aria-hidden="true" />
          <span>Between the Lines</span>
        </div>
        <div className="header-user">
          <span className="user-email">{displayName}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="sign-out-btn"
            title="Sign Out"
            aria-label="Sign out"
          >
            ↪
          </button>
        </div>
      </header>
      
      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {renderedNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <div className="nav-icon" aria-hidden="true">
              {item.iconSrc ? (
                <img src={item.iconSrc} alt="" className="nav-icon-img" />
              ) : (
                item.icon
              )}
            </div>
            <div className="nav-label">{item.label}</div>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default Layout;
