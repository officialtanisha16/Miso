import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Autocomplete({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  error,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const updatePosition = () => {
    if (!inputRef.current) {
      return;
    }
    const rect = inputRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedInsideWrapper = wrapperRef.current && wrapperRef.current.contains(event.target);
      const clickedInsideList = event.target.closest && event.target.closest('.miso-autocomplete-list');
      if (!clickedInsideWrapper && !clickedInsideList) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, []);

  const handleFocus = () => {
    updatePosition();
    setIsOpen(true);
  };

  const query = (value || '').trim().toLowerCase();
  const filtered = (
    query ? options.filter((option) => option.toLowerCase().includes(query)) : options
  ).slice(0, 8);

  const handleSelect = (option) => {
    onChange({ target: { value: option } });
    setIsOpen(false);
  };

  return (
    <div className="miso-field" ref={wrapperRef}>
      <span className="miso-field-label">{label}</span>
      <input
        ref={inputRef}
        className={`miso-input ${error ? 'miso-input-error' : ''}`}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {isOpen && !disabled && filtered.length > 0
        ? createPortal(
            <ul
              className="miso-autocomplete-list"
              style={{ top: position.top, left: position.left, width: position.width }}
            >
              {filtered.map((option) => (
                <li key={option} onClick={() => handleSelect(option)}>
                  {option}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
      {error ? <span className="miso-field-error">{error}</span> : null}
    </div>
  );
}
