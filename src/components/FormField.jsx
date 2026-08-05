import React from 'react';

export default function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  rows,
  min,
  step,
  options,
  list,
  disabled = false,
}) {
  const commonProps = {
    value,
    onChange,
    placeholder,
    disabled,
    className: `miso-input ${error ? 'miso-input-error' : ''}`,
  };

  return (
    <label className="miso-field">
      <span className="miso-field-label">{label}</span>
      {type === 'textarea' ? (
        <textarea
          {...commonProps}
          rows={rows || 3}
        />
      ) : type === 'select' ? (
        <select {...commonProps}>
          <option value="">{placeholder || 'Select...'}</option>
          {(options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...commonProps}
          type={type}
          min={min}
          step={step}
          list={list}
        />
      )}
      {error ? <span className="miso-field-error">{error}</span> : null}
    </label>
  );
}
