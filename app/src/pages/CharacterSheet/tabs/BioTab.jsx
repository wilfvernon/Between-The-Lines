import { useState, useEffect } from 'react';
import braveryIcon from '../../../assets/social/Bravery.svg';
import charmIcon from '../../../assets/social/Charm.svg';
import kindnessIcon from '../../../assets/social/Kindness.svg';
import knowledgeIcon from '../../../assets/social/Knowledge.svg';
import techniqueIcon from '../../../assets/social/Technique.svg';

export default function BioTab({ character, onBastionStatUpdate }) {
  const [activeSubtab, setActiveSubtab] = useState('bio');
  const [bastionInputs, setBastionInputs] = useState({
    bravery: character?.bravery ?? 0,
    charm: character?.charm ?? 0,
    kindness: character?.kindness ?? 0,
    knowledge: character?.knowledge ?? 0,
    technique: character?.technique ?? 0
  });
  const [bastionSaved, setBastionSaved] = useState({
    bravery: character?.bravery ?? 0,
    charm: character?.charm ?? 0,
    kindness: character?.kindness ?? 0,
    knowledge: character?.knowledge ?? 0,
    technique: character?.technique ?? 0
  });

  // Sync inputs when character changes
  useEffect(() => {
    setBastionInputs({
      bravery: character?.bravery ?? 0,
      charm: character?.charm ?? 0,
      kindness: character?.kindness ?? 0,
      knowledge: character?.knowledge ?? 0,
      technique: character?.technique ?? 0
    });
    setBastionSaved({
      bravery: character?.bravery ?? 0,
      charm: character?.charm ?? 0,
      kindness: character?.kindness ?? 0,
      knowledge: character?.knowledge ?? 0,
      technique: character?.technique ?? 0
    });
  }, [character?.id, character?.bravery, character?.charm, character?.kindness, character?.knowledge, character?.technique]);

  const toList = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

  const languages = toList(character?.languages);
  const tools = toList(character?.tools);
  const instruments = toList(character?.instruments);

  const bastionStats = [
    { key: 'bravery', label: 'Bravery', icon: braveryIcon },
    { key: 'charm', label: 'Charm', icon: charmIcon },
    { key: 'kindness', label: 'Kindness', icon: kindnessIcon },
    { key: 'knowledge', label: 'Knowledge', icon: knowledgeIcon },
    { key: 'technique', label: 'Technique', icon: techniqueIcon }
  ];

  const handleBastionInputChange = (statKey, value) => {
    const numValue = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
    setBastionInputs(prev => ({ ...prev, [statKey]: numValue }));
  };

  const handleBastionSave = async (statKey) => {
    if (bastionInputs[statKey] === bastionSaved[statKey] || !character?.id) return;
    
    try {
      const newValue = bastionInputs[statKey];
      await onBastionStatUpdate(statKey, newValue);
      setBastionSaved(prev => ({ ...prev, [statKey]: newValue }));
    } catch (err) {
      console.error(`Error saving ${statKey}:`, err);
      // Revert to saved value on error
      setBastionInputs(prev => ({ ...prev, [statKey]: bastionSaved[statKey] }));
    }
  };

  return (
    <div className="bio-tab">
      <h2>{character?.name || 'Character'}</h2>
      
      {/* Sub-tab navigation */}
      <div className="feature-subtabs">
        <button
          className={activeSubtab === 'bio' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('bio')}
        >
          Bio
        </button>
        <button
          className={activeSubtab === 'languages-tools' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('languages-tools')}
        >
          Languages and Tools
        </button>
        <button
          className={activeSubtab === 'bastion' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('bastion')}
        >
          Bastion
        </button>
      </div>

      {/* Sub-tab content */}
      <div className="feature-subtab-content">
        {activeSubtab === 'bio' && (
          <div className="bio-subtab">
            <div className="bio-main-content">
              {character.alt_image_url && (
                <div className="bio-image-section">
                  <img 
                    src={character.alt_image_url} 
                    alt={`${character.name || 'Character'} portrait`}
                    className="bio-character-image"
                  />
                </div>
              )}
              <div className="bio-info-section">
                <div className="bio-info-group">
                  <label className="bio-info-label">Name</label>
                  <p className="bio-info-value">{character.full_name || character.name || '—'}</p>
                </div>
                <div className="bio-info-group">
                  <label className="bio-info-label">Species</label>
                  <p className="bio-info-value">{character.species || '—'}</p>
                </div>
                <div className="bio-info-group">
                  <label className="bio-info-label">Age</label>
                  <p className="bio-info-value">{character.age || '—'}</p>
                </div>
                <div className="bio-info-group">
                  <label className="bio-info-label">Height</label>
                  <p className="bio-info-value">{character.height || '—'}</p>
                </div>
                <div className="bio-info-group">
                  <label className="bio-info-label">Class</label>
                  <p className="bio-info-value">
                    {character.classes && character.classes.length > 0
                      ? character.classes.map((cls, idx) => (
                          <span key={idx}>
                            {cls.class} Level {cls.level}{cls.subclass ? `, ${cls.subclass}` : ''}
                            {idx < character.classes.length - 1 ? ', ' : ''}
                          </span>
                        ))
                      : '—'
                    }
                  </p>
                </div>
                <div className="bio-info-group">
                  <label className="bio-info-label">Occupation</label>
                  <p className="bio-info-value">{character.occupation || '—'}</p>
                </div>
              </div>
            </div>
            {character.bio && (
              <div className="bio-description">
                <h3>Biography</h3>
                {character.bio.split('\n').map((paragraph, idx) => (
                  paragraph.trim() ? <p key={idx}>{paragraph}</p> : <br key={idx} />
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeSubtab === 'languages-tools' && (
          <div className="languages-tools-subtab">
            <div className="profile-cards-grid">
              <article className="profile-info-card">
                <h3>Languages</h3>
                {languages.length > 0 ? (
                  <p className="profile-info-list">{languages.join(', ')}</p>
                ) : (
                  <p className="info-text">None listed.</p>
                )}
              </article>

              <article className="profile-info-card">
                <h3>Tools</h3>
                {tools.length > 0 ? (
                  <p className="profile-info-list">{tools.join(', ')}</p>
                ) : (
                  <p className="info-text">None listed.</p>
                )}
              </article>

              <article className="profile-info-card">
                <h3>Instruments</h3>
                {instruments.length > 0 ? (
                  <p className="profile-info-list">{instruments.join(', ')}</p>
                ) : (
                  <p className="info-text">None listed.</p>
                )}
              </article>
            </div>
          </div>
        )}
        
        {activeSubtab === 'bastion' && (
          <div className="bastion-subtab">
            <div className="bastion-toolbar" role="toolbar" aria-label="Bastion stats">
              {bastionStats.map((stat) => (
                <div key={stat.key} className="bastion-stat-item">
                  <img
                    src={stat.icon}
                    alt=""
                    className={bastionInputs[stat.key] !== bastionSaved[stat.key] ? `bastion-stat-icon bastion-stat-icon-${stat.key} bastion-stat-icon-changed` : `bastion-stat-icon bastion-stat-icon-${stat.key}`}
                    aria-hidden="true"
                    onClick={() => handleBastionSave(stat.key)}
                    style={{ cursor: bastionInputs[stat.key] !== bastionSaved[stat.key] ? 'pointer' : 'default' }}
                    title={bastionInputs[stat.key] !== bastionSaved[stat.key] ? `Save ${stat.label}` : ''}
                  />
                  <span className="bastion-stat-label">{stat.label}</span>
                  <input
                    type="number"
                    className="bastion-stat-input"
                    value={bastionInputs[stat.key] === 0 ? '' : bastionInputs[stat.key]}
                    onChange={(e) => handleBastionInputChange(stat.key, e.target.value)}
                    placeholder="—"
                    min="0"
                  />
                </div>
              ))}
            </div>
            <p className="info-text">Bastions coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
