import { useState } from 'react';
import './ConditionsModal.css';

const CONDITIONS = [
  {
    id: 'blinded',
    label: 'Blinded',
    bullets: [
      { heading: "Can't See.", text: "You can't see and automatically fail any ability check that requires sight." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Advantage, and your attack rolls have Disadvantage." },
    ],
  },
  {
    id: 'charmed',
    label: 'Charmed',
    bullets: [
      { heading: "Can't Harm the Charmer.", text: "You can't attack the charmer or target the charmer with damaging abilities or magical effects." },
      { heading: "Social Advantage.", text: "The charmer has Advantage on any ability check to interact with you socially." },
    ],
  },
  {
    id: 'deafened',
    label: 'Deafened',
    bullets: [
      { heading: "Can't Hear.", text: "You can't hear and automatically fail any ability check that requires hearing." },
    ],
  },
  {
    id: 'frightened',
    label: 'Frightened',
    bullets: [
      { heading: "Ability Checks and Attacks Affected.", text: "You have Disadvantage on ability checks and attack rolls while the source of fear is within line of sight." },
      { heading: "Can't Approach.", text: "You can't willingly move closer to the source of fear." },
    ],
  },
  {
    id: 'grappled',
    label: 'Grappled',
    bullets: [
      { heading: "Speed 0.", text: "Your Speed is 0 and can't increase." },
      { heading: "Attacks Affected.", text: "You have Disadvantage on attack rolls against any target other than the grappler." },
      { heading: "Movable.", text: "The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it." },
    ],
  },
  {
    id: 'incapacitated',
    label: 'Incapacitated',
    bullets: [
      { heading: "Inactive.", text: "You can't take any action, Bonus Action, or Reaction." },
      { heading: "No Concentration.", text: "Your Concentration is broken." },
      { heading: "Speechless.", text: "You can't speak." },
      { heading: "Surprised.", text: "If you're Incapacitated when you roll Initiative, you have Disadvantage on the roll." },
    ],
  },
  {
    id: 'invisible',
    label: 'Invisible',
    bullets: [
      { heading: "Surprise.", text: "If you're Invisible when you roll Initiative, you have Advantage on the roll." },
      { heading: "Concealed.", text: "You aren't affected by any effect that requires its target to be seen unless the effect's creator can somehow see you." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Disadvantage, and your attack rolls have Advantage. If a creature can somehow see you, you don't gain this benefit against that creature." },
    ],
  },
  {
    id: 'paralyzed',
    label: 'Paralyzed',
    bullets: [
      { heading: "Incapacitated.", text: "You have the Incapacitated condition." },
      { heading: "Speed 0.", text: "Your Speed is 0 and can't increase." },
      { heading: "Saving Throws Affected.", text: "You automatically fail Strength and Dexterity saving throws." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Advantage." },
      { heading: "Automatic Critical Hits.", text: "Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you." },
    ],
  },
  {
    id: 'petrified',
    label: 'Petrified',
    bullets: [
      { heading: "Turned to Inanimate Substance.", text: "You are transformed into a solid inanimate substance. Your weight increases by a factor of ten, and you cease aging." },
      { heading: "Incapacitated.", text: "You have the Incapacitated condition." },
      { heading: "Speed 0.", text: "Your Speed is 0 and can't increase." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Advantage." },
      { heading: "Saving Throws Affected.", text: "You automatically fail Strength and Dexterity saving throws." },
      { heading: "Resist Damage.", text: "You have Resistance to all damage." },
      { heading: "Poison Immunity.", text: "You have Immunity to the Poisoned condition." },
    ],
  },
  {
    id: 'poisoned',
    label: 'Poisoned',
    bullets: [
      { heading: "Ability Checks and Attacks Affected.", text: "You have Disadvantage on attack rolls and ability checks." },
    ],
  },
  {
    id: 'prone',
    label: 'Prone',
    bullets: [
      { heading: "Restricted Movement.", text: "Your only movement options are to crawl or to spend movement equal to half your Speed to right yourself and end the condition." },
      { heading: "Attacks Affected.", text: "You have Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within 5 feet of you, otherwise Disadvantage." },
    ],
  },
  {
    id: 'restrained',
    label: 'Restrained',
    bullets: [
      { heading: "Speed 0.", text: "Your Speed is 0 and can't increase." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Advantage, and your attack rolls have Disadvantage." },
      { heading: "Saving Throws Affected.", text: "You have Disadvantage on Dexterity saving throws." },
    ],
  },
  {
    id: 'silenced',
    label: 'Silenced',
    bullets: [
      { heading: "Can't Speak.", text: "You can't speak, make verbal sounds, or cast spells with a verbal component." },
    ],
  },
  {
    id: 'stunned',
    label: 'Stunned',
    bullets: [
      { heading: "Incapacitated.", text: "You have the Incapacitated condition." },
      { heading: "Saving Throws Affected.", text: "You automatically fail Strength and Dexterity saving throws." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Advantage." },
    ],
  },
  {
    id: 'unconscious',
    label: 'Unconscious',
    bullets: [
      { heading: "Inert.", text: "You have the Incapacitated and Prone conditions, and you drop whatever you're holding. When this condition ends, you remain Prone." },
      { heading: "Speed 0.", text: "Your Speed is 0 and can't increase." },
      { heading: "Attacks Affected.", text: "Attack rolls against you have Advantage." },
      { heading: "Saving Throws Affected.", text: "You automatically fail Strength and Dexterity saving throws." },
      { heading: "Automatic Critical Hits.", text: "Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you." },
      { heading: "Unaware.", text: "You're unaware of your surroundings." },
    ],
  },
];

const EXHAUSTION_BULLETS = [
  { heading: "Exhaustion Levels.", text: "Cumulative. Each time received, gain 1 level. You die if your Exhaustion level reaches 6." },
  { heading: "d20 Tests Affected.", text: "When you make a d20 Test, the roll is reduced by 2 × your Exhaustion level." },
  { heading: "Speed Reduced.", text: "Your Speed is reduced by 5 × your Exhaustion level feet." },
  { heading: "Removing Exhaustion.", text: "Finishing a Long Rest removes 1 Exhaustion level. The condition ends when your level reaches 0." },
];

const EXHAUSTION_LEVELS = [1, 2, 3, 4, 5];

export default function ConditionsModal({
  isOpen,
  onClose,
  activeConditions = [],
  onToggleCondition,
  exhaustionLevel = 0,
  onSetExhaustion,
}) {
  const [expandedCondition, setExpandedCondition] = useState(null);
  const [exhaustionExpanded, setExhaustionExpanded] = useState(false);

  if (!isOpen) return null;

  const handleExhaustionClick = (level) => {
    if (exhaustionLevel === level) {
      onSetExhaustion(level - 1);
    } else {
      onSetExhaustion(level);
    }
  };

  const handleDeathBoxClick = () => {
    if (exhaustionLevel === 6) {
      onSetExhaustion(5);
    } else {
      onSetExhaustion(6);
    }
  };

  const handleExhaustionSectionClick = (event) => {
    if (event.target.closest('button')) return;
    setExhaustionExpanded((v) => !v);
  };

  const toggleExpand = (id) => {
    setExpandedCondition(prev => (prev === id ? null : id));
  };

  return (
    <div
      className="conditions-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Conditions"
    >
      <div className="conditions-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="conditions-modal-header">
          <h2>Conditions</h2>
          <button
            type="button"
            className="conditions-modal-close"
            onClick={onClose}
            aria-label="Close conditions modal"
          >
            ✕
          </button>
        </div>

        <div className="conditions-modal-body">
          {/* ── Exhaustion (sticky) ── */}
          <div className="exhaustion-section" onClick={handleExhaustionSectionClick}>
            <button
              type="button"
              className={`exhaustion-header-row${exhaustionExpanded ? ' open' : ''}`}
              onClick={() => setExhaustionExpanded(v => !v)}
              aria-expanded={exhaustionExpanded}
              aria-label="Toggle exhaustion description"
            >
              <span className="exhaustion-label">Exhaustion</span>
              <span className="expand-chevron">▾</span>
            </button>
            <div className="exhaustion-boxes">
              {EXHAUSTION_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`exhaustion-box${exhaustionLevel >= level ? ' active' : ''}`}
                  onClick={() => handleExhaustionClick(level)}
                  aria-label={`Exhaustion level ${level}`}
                >
                  <span className="exhaustion-box-num">{level}</span>
                </button>
              ))}
              <button
                type="button"
                className={`exhaustion-box${exhaustionLevel >= 6 ? ' active exhaustion-death' : ''}`}
                onClick={handleDeathBoxClick}
                aria-label="Exhaustion level 6 — death"
              >
                <span className="exhaustion-box-num">6</span>
                <img src="/icons/monster/undead.svg" alt="" className="exhaustion-box-icon" />
              </button>
            </div>
            {exhaustionExpanded && (
              <ul className="exhaustion-desc-list">
                {EXHAUSTION_BULLETS.map(({ heading, text }) => (
                  <li key={heading} className="exhaustion-desc-item">
                    <strong className="exhaustion-desc-heading">{heading}</strong>{' '}
                    <span className="exhaustion-desc-text">{text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Conditions list ── */}
          <div className="conditions-section">
            <div className="conditions-section-label">Conditions</div>
            <ul className="conditions-list">
              {CONDITIONS.map(({ id, label, bullets }) => {
                const isActive = activeConditions.includes(id);
                const isExpanded = expandedCondition === id;
                return (
                  <li key={id} className={`condition-row${isActive ? ' active' : ''}${isExpanded ? ' expanded' : ''}`}>
                    {/* Icon only — toggles condition */}
                    <button
                      type="button"
                      className="condition-icon-btn"
                      onClick={() => onToggleCondition(id)}
                      aria-pressed={isActive}
                      aria-label={`${isActive ? 'Remove' : 'Apply'} ${label}`}
                    >
                      <img src={`/icons/condition/${id}.svg`} alt="" className="condition-icon" />
                    </button>

                    {/* Name + chevron — expands description */}
                    <button
                      type="button"
                      className={`condition-expand-row${isExpanded ? ' open' : ''}`}
                      onClick={() => toggleExpand(id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} description`}
                    >
                      <span className="condition-name">{label}</span>
                      <span className="expand-chevron">▾</span>
                    </button>

                    {/* Description drawer */}
                    {isExpanded && (
                      <ul className="condition-desc-list">
                        {bullets.map(({ heading, text }) => (
                          <li key={heading} className="condition-desc-item">
                            <strong className="condition-desc-heading">{heading}</strong>{' '}
                            <span className="condition-desc-text">{text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

