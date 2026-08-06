import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function fuzzyMatch(options, rawQuery, limit = 8) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return options.slice(0, limit);
  }

  const threshold = Math.max(2, Math.floor(query.length * 0.3));
  const scored = [];

  for (const option of options) {
    const lower = option.toLowerCase();
    if (lower.startsWith(query)) {
      scored.push([option, 0]);
      continue;
    }
    if (lower.includes(query)) {
      scored.push([option, 1]);
      continue;
    }
    if (Math.abs(lower.length - query.length) <= threshold + 2) {
      const distance = levenshtein(query, lower);
      if (distance <= threshold) {
        scored.push([option, 10 + distance]);
      }
    }
  }

  scored.sort((a, b) => a[1] - b[1]);
  return scored.slice(0, limit).map(([option]) => option);
}

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

  const filtered = useMemo(() => fuzzyMatch(options, value || ''), [options, value]);

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
