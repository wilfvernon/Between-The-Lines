import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const spellSchools = [
  { code: 'CON', name: 'Conjuration', src: '/school-symbols/conjuration.png' },
  { code: 'ENC', name: 'Enchantment', src: '/school-symbols/enchantment.png' },
  { code: 'NEC', name: 'Necromancy', src: '/school-symbols/necromancy.png' },
  { code: 'DIV', name: 'Divination', src: '/school-symbols/divination.png' },
  { code: 'EVO', name: 'Evocation', src: '/school-symbols/evocation.png' },
  { code: 'ILL', name: 'Illusion', src: '/school-symbols/illusion.png' },
  { code: 'ABJ', name: 'Abjuration', src: '/school-symbols/abjuration.png' },
  { code: 'TRN', name: 'Transmutation', src: '/school-symbols/transmutation.png' },
];

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [abjurationFailBurst, setAbjurationFailBurst] = useState(0);
  const [footnoteFlashToken, setFootnoteFlashToken] = useState(0);
  const [isSuccessSequence, setIsSuccessSequence] = useState(false);
  const successNavigateTimeoutRef = useRef(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  useEffect(() => {
    return () => {
      if (successNavigateTimeoutRef.current) {
        window.clearTimeout(successNavigateTimeoutRef.current);
      }
    };
  }, []);

  const embers = useMemo(() => {
    const total = 72;
    return Array.from({ length: total }, (_, index) => {
      const lane = index % 12;
      const left = 2 + ((index * 13.7 + lane * 2.4) % 96);
      const delay = ((index * 0.37) % 8).toFixed(2);
      const duration = (8.2 + ((index * 0.49) % 4.4)).toFixed(2);
      const drift = lane % 4;
      const tier = index % 3;
      const baseSize = 2.1 + ((index * 0.31) % 2.7);
      const sizeX = baseSize + ((index % 4) * 0.16);
      const sizeY = baseSize + (((index + 3) % 4) * 0.12);
      const shapeA = 38 + ((index * 11) % 24);
      const shapeB = 40 + ((index * 7) % 22);
      const shapeC = 42 + ((index * 5) % 20);
      const shapeD = 36 + ((index * 13) % 26);
      const sway = (6 + ((index * 1.7) % 16)).toFixed(1);

      return {
        id: index,
        className: `ember ember-${lane}`,
        style: {
          left: `${left}%`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          width: `${sizeX.toFixed(2)}px`,
          height: `${sizeY.toFixed(2)}px`,
          borderRadius: `${shapeA}% ${shapeB}% ${shapeC}% ${shapeD}%`,
          opacity: tier === 0 ? 0.86 : tier === 1 ? 0.75 : 0.64,
          '--ember-sway': `${index % 2 === 0 ? '-' : ''}${sway}px`,
          '--ember-drift': drift === 0 ? '-44px' : drift === 1 ? '44px' : drift === 2 ? '-28px' : '28px',
        },
      };
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSuccessSequence) return;

    setLoading(true);
    let didSucceed = false;
    const normalizedName = email.trim().toLowerCase();
    const normalizedEmail = normalizedName.includes('@') ? normalizedName : `${normalizedName}@candlekeep.sc`;
    const normalizedPassword = password.trim().toLowerCase();

    try {
      await signIn(normalizedEmail, normalizedPassword);
      didSucceed = true;
      setIsSuccessSequence(true);
      successNavigateTimeoutRef.current = window.setTimeout(() => {
        navigate('/character');
      }, 4800);
    } catch {
      setAbjurationFailBurst((count) => count + 1);
      setFootnoteFlashToken((count) => count + 1);
    } finally {
      if (!didSucceed) {
        setLoading(false);
      }
    }
  };

  return (
    <div className={`login-container ${isSuccessSequence ? 'login-success-transition' : ''}`}>
      <div className="login-world">
        <div className="login-void" />
        <div className="stone-gate" />
        <div className="login-texture" />
        <div className="login-glow" />
        <div className="torch-flickers" />
        <div className="embers-container">
          {embers.map((ember) => (
            <div
              key={ember.id}
              className={ember.className}
              style={ember.style}
            />
          ))}
        </div>
      </div>
      <div className="portal-field">
        <div className="portal-shell" aria-hidden="true" />
        <div className="school-runes">
          {spellSchools.map((school, index) => {
            const isAbjuration = school.code === 'ABJ';
            const isDivination = school.code === 'DIV';
            const isConjuration = school.code === 'CON';
            const isRuneActive = isDivination || (isAbjuration && !isSuccessSequence) || (isConjuration && isSuccessSequence);
            const runeKey = isAbjuration ? `${school.code}-${abjurationFailBurst}` : school.code;
            const isDivinationToggle = school.code === 'DIV';

            return (
            <span
              key={runeKey}
              className={`school-rune school-rune-${index + 1} school-rune-${school.code.toLowerCase()}${isRuneActive ? ' school-rune-active' : ''}${isAbjuration && abjurationFailBurst > 0 && !isSuccessSequence ? ' school-rune-abj-burst' : ''}${isDivinationToggle ? ' school-rune-toggle' : ''}${showPassword && isDivinationToggle ? ' school-rune-toggle-active' : ''}`}
              title={school.name}
              style={{ '--rune-src': `url(${school.src})` }}
              onClick={isDivinationToggle ? () => setShowPassword((visible) => !visible) : undefined}
              onKeyDown={isDivinationToggle ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setShowPassword((visible) => !visible);
                }
              } : undefined}
              role={isDivinationToggle ? 'button' : undefined}
              tabIndex={isDivinationToggle ? 0 : undefined}
              aria-label={isDivinationToggle ? (showPassword ? 'Hide password' : 'Show password') : undefined}
            >
              <img src={school.src} alt="" className="school-symbol-image" />
            </span>
            );
          })}
        </div>

        <button
          type="submit"
          form="login-form"
          disabled={!canSubmit || loading}
          className={`candlekeep-emblem crest-submit ${canSubmit && !loading ? 'ready' : ''}`}
          aria-label={loading ? 'Entering Candlekeep' : 'Enter Candlekeep'}
        >
          <img src="/crest.png" alt="Candlekeep Crest" className="crest-image" />
        </button>

        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="form-group">
            <label htmlFor="email" className="sr-only">Name</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              required
              disabled={loading}
              autoComplete="username"
              aria-label="Name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="sr-only">Password</label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value.toLowerCase())}
              required
              disabled={loading}
              autoComplete="current-password"
              aria-label="Password"
            />
          </div>

        </form>
        <p key={`footnote-${footnoteFlashToken}-${isSuccessSequence ? 'success' : 'idle'}`} className="login-footnote">
          <span className={`footnote-hot footnote-authorised ${footnoteFlashToken > 0 && !isSuccessSequence ? 'is-flashing' : ''}${isSuccessSequence ? ' is-success' : ''}`}>Authorised</span>{' '}
          <span className={`footnote-seeker${isSuccessSequence ? ' is-success' : ''}`}>Seeker</span>{' '}
          <span className={`footnote-hot footnote-only ${footnoteFlashToken > 0 && !isSuccessSequence ? 'is-flashing' : ''}`}>Only</span>
        </p>
      </div>
    </div>
  );
}

export default Login;
