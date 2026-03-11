import { useState } from 'react';
import { HPEditModal } from './CharacterSheet';
import './CharacterSheet.css';

export default function VisualHpModalTest() {
  const [currentHP, setCurrentHP] = useState(27);
  const [tempHP, setTempHP] = useState(5);
  const [maxHPModifier, setMaxHPModifier] = useState(0);
  const [damageInput, setDamageInput] = useState('12');

  return (
    <div>
      <HPEditModal
        currentHP={currentHP}
        setCurrentHP={setCurrentHP}
        tempHP={tempHP}
        setTempHP={setTempHP}
        maxHPModifier={maxHPModifier}
        setMaxHPModifier={setMaxHPModifier}
        maxHP={34}
        damageInput={damageInput}
        setDamageInput={setDamageInput}
        isOpen={true}
        onClose={() => {}}
      />
    </div>
  );
}
