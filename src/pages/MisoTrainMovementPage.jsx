import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import Autocomplete from '../components/Autocomplete.jsx';
import { saveTrain, getTrain, updateMovements } from '../services/trainService.js';
import railwayStations from '../data/railwayStations.json';

const STATION_LOOKUP = new Map(
  railwayStations.map((station) => [station.name.trim().toLowerCase(), station]),
);
const STATION_NAMES = railwayStations.map((station) => station.name);

const CURRENT_STATUS_OPTIONS = [
  { value: 'Start', label: 'Start' },
  { value: 'Completed', label: 'Completed' },
  { value: 'End', label: 'End' },
];

const CURRENT_STATUS_OPTIONS_WITHOUT_START = CURRENT_STATUS_OPTIONS.filter(
  (option) => option.value !== 'Start',
);

const createBlankRow = (id) => ({
  id,
  currentStation: '',
  latitude: '',
  longitude: '',
  movementDateTime: '',
  currentStatus: '',
  remarks: '',
  isEditing: true,
  isExisting: false,
  errors: {},
});

// Zoho pads stored coordinates to 15 decimal places for display; show a
// sane, human-readable precision instead.
const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : value;
};

const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const formatNowAsMovementDateTime = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(now.getDate())}-${MONTH_ABBREVIATIONS[now.getMonth()]}-${now.getFullYear()} ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

const statusBadgeClass = (status) => {
  switch (status) {
    case 'Start':
      return 'miso-status-badge miso-status-start';
    case 'Completed':
      return 'miso-status-badge miso-status-completed';
    case 'End':
      return 'miso-status-badge miso-status-end';
    default:
      return 'miso-status-badge miso-status-default';
  }
};

const normalizeRowState = (rows) =>
  rows.map((row) => ({
    ...row,
    isEditing: Boolean(row.isEditing),
  }));

const createInitialRows = () => [createBlankRow(1)];

const defaultTrainDetails = {
  trainNumber: '',
  trainName: '',
  routeName: '',
};

function MisoTrainMovementPage() {
  const navigate = useNavigate();
  const { trainId } = useParams();
  const location = useLocation();
  const initialTrainDetails = location.state || null;
  const onBack = () => navigate('/');

  const isExistingTrain = Boolean(trainId);
  const hasPrefilledDetails = Boolean(initialTrainDetails);

  const [step, setStep] = useState(hasPrefilledDetails ? 2 : 1);
  const [detailsError, setDetailsError] = useState('');
  const [trainDetails, setTrainDetails] = useState(initialTrainDetails || defaultTrainDetails);
  const [movementRows, setMovementRows] = useState(isExistingTrain ? [] : createInitialRows);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isExistingTrain);
  const [loadError, setLoadError] = useState('');

  const movementCount = useMemo(() => movementRows.length, [movementRows]);

  const loadTrain = () => {
    if (!isExistingTrain) {
      return;
    }

    setIsLoading(true);
    setLoadError('');

    getTrain(trainId)
      .then((response) => {
        const train = response?.data;
        setTrainDetails({
          trainNumber: train?.trainNumber || '',
          trainName: train?.trainName || '',
          routeName: train?.routeName || '',
        });
        setMovementRows(
          (train?.movementHistory || []).map((row, index) => ({
            id: `existing-${index}`,
            ...row,
            isEditing: false,
            isExisting: true,
            checked: row.currentStatus === 'Completed',
            errors: {},
          })),
        );
      })
      .catch((err) => {
        setLoadError(err?.response?.data?.message || 'Unable to load this train.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadTrain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainId]);

  const updateRow = (rowId, field, value) => {
    setMovementRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        const updatedRow = {
          ...row,
          [field]: value,
        };

        if (field === 'currentStation') {
          const station = STATION_LOOKUP.get(value.trim().toLowerCase());
          if (station) {
            updatedRow.latitude = station.latitude;
            updatedRow.longitude = station.longitude;
          }
        }

        return {
          ...updatedRow,
          errors: validateRow(updatedRow),
        };
      }),
    );
  };

  const validateRow = (row) => {
    const errors = {};

    if (!row.currentStation?.trim()) {
      errors.currentStation = 'Current Station is required.';
    }

    if (!row.latitude?.toString().trim()) {
      errors.latitude = 'Latitude is required.';
    }

    if (!row.longitude?.toString().trim()) {
      errors.longitude = 'Longitude is required.';
    }

    if (!row.movementDateTime?.trim()) {
      errors.movementDateTime = 'Movement Date & Time is required.';
    }

    return errors;
  };

  const addMovementRow = () => {
    setMovementRows((currentRows) => {
      const newRow = createBlankRow(Date.now() + currentRows.length + 1);
      return [...currentRows, newRow];
    });
    setSaveMessage('');
  };

  const toggleEditMode = (rowId) => {
    setMovementRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              isEditing: true,
            }
          : row,
      ),
    );
  };

  const deleteRow = (rowId) => {
    setMovementRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    setSaveMessage('');
  };

  const toggleRowChecked = async (rowId) => {
    const updatedRows = movementRows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const nextChecked = !row.checked;

      if (nextChecked) {
        return {
          ...row,
          checked: nextChecked,
          currentStatus: row.currentStatus === 'Planned' ? 'Completed' : row.currentStatus,
          movementDateTime: formatNowAsMovementDateTime(),
        };
      }

      return {
        ...row,
        checked: nextChecked,
        currentStatus: row.currentStatus === 'Completed' ? 'Planned' : row.currentStatus,
        movementDateTime: '',
      };
    });

    setMovementRows(updatedRows);

    if (!isExistingTrain) {
      return;
    }

    try {
      setSaveError('');
      setSaveMessage('');

      const movementHistory = updatedRows.map((row) => ({
        currentStation: row.currentStation,
        latitude: row.latitude,
        longitude: row.longitude,
        movementDateTime: row.movementDateTime,
        currentStatus: row.currentStatus,
        remarks: row.remarks,
      }));

      const response = await updateMovements(trainId, movementHistory);
      setSaveMessage(response?.message || 'Movement status updated in Zoho Creator.');
    } catch (error) {
      setSaveError(error?.response?.data?.message || 'Unable to update the movement history.');
    }
  };

  const handleNextFromDetails = () => {
    if (!trainDetails.trainNumber.trim() || !trainDetails.trainName.trim() || !trainDetails.routeName.trim()) {
      setDetailsError('Train Number, Train Name, and Route Name are all required.');
      return;
    }

    setDetailsError('');
    setStep(2);
  };

  const handleSaveNewTrain = async (nextRows) => {
    const payload = {
      trainDetails,
      movementHistory: nextRows.map((row) => ({
        currentStation: row.currentStation,
        latitude: row.latitude,
        longitude: row.longitude,
        movementDateTime: row.movementDateTime,
        currentStatus: row.currentStatus,
        remarks: row.remarks,
      })),
    };

    const response = await saveTrain(payload);

    setMovementRows(normalizeRowState(nextRows));
    setSaveMessage(response?.message || 'Train details and movement history saved successfully.');
  };

  const handleSave = async () => {
    const nextRows = movementRows.map((row) => {
      const errors = validateRow(row);
      return {
        ...row,
        errors,
        isEditing: false,
      };
    });

    const hasInvalidRows = movementRows.some(
      (row) => Object.keys(validateRow(row)).length > 0,
    );

    if (movementRows.length === 0) {
      setSaveError('Add at least one movement record before saving.');
      setSaveMessage('');
      return;
    }

    if (hasInvalidRows) {
      setMovementRows(normalizeRowState(nextRows));
      setSaveError('Please complete all required fields before saving movement history.');
      setSaveMessage('');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError('');
      setSaveMessage('');
      await handleSaveNewTrain(nextRows);
    } catch (error) {
      setSaveError(error?.response?.data?.message || 'Unable to save the train movement data.');
      setSaveMessage('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMovements = async () => {
    try {
      setIsSaving(true);
      setSaveError('');
      setSaveMessage('');

      const movementHistory = movementRows.map((row) => ({
        currentStation: row.currentStation,
        latitude: row.latitude,
        longitude: row.longitude,
        movementDateTime: row.movementDateTime,
        currentStatus: row.currentStatus,
        remarks: row.remarks,
      }));

      const response = await updateMovements(trainId, movementHistory);
      setSaveMessage(response?.message || 'Movement history updated successfully.');
      loadTrain();
    } catch (error) {
      setSaveError(error?.response?.data?.message || 'Unable to update the movement history.');
      setSaveMessage('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isExistingTrain) {
      loadTrain();
      setSaveMessage('Changes discarded.');
      setSaveError('');
      return;
    }

    setTrainDetails(defaultTrainDetails);
    setMovementRows(createInitialRows());
    setStep(hasPrefilledDetails ? 2 : 1);
    setDetailsError('');
    setSaveMessage('Form reset to its initial state.');
  };

  if (isLoading) {
    return (
      <main className="miso-page-shell">
        <p className="miso-subtitle">Loading train details...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="miso-page-shell">
        <div className="miso-save-message miso-save-message-error">{loadError}</div>
        {onBack ? (
          <button className="miso-btn miso-btn-secondary" onClick={onBack} style={{ marginTop: 16 }}>
            Back to Train List
          </button>
        ) : null}
      </main>
    );
  }

  const showDetailsStep = !isExistingTrain && step === 1;
  const showMovementStep = isExistingTrain || step === 2;

  return (
    <main className="miso-page-shell">
      <section className="miso-hero-banner">
        {onBack ? (
          <button className="miso-btn miso-btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
            ← Back to Train List
          </button>
        ) : null}
        <div>
          <p className="miso-eyebrow">MISO Project</p>
          <h1>MISO Train Movement Management</h1>
          <p className="miso-subtitle">
            {showDetailsStep
              ? 'Step 1: Enter the train details.'
              : 'Movement history for this train.'}
          </p>
        </div>
      </section>

      {isExistingTrain || (hasPrefilledDetails && showMovementStep) ? (
        <section className="miso-card">
          <div className="miso-card-header">
            <h2>Train Details</h2>
          </div>

          <div className="miso-form-grid">
            <FormField label="Train Number" value={trainDetails.trainNumber} onChange={() => {}} disabled />
            <FormField label="Train Name" value={trainDetails.trainName} onChange={() => {}} disabled />
            <FormField label="Route Name" value={trainDetails.routeName} onChange={() => {}} disabled />
          </div>
        </section>
      ) : null}

      {showDetailsStep ? (
        <section className="miso-card">
          <div className="miso-card-header">
            <h2>Train Details</h2>
          </div>

          <div className="miso-form-grid">
            <FormField
              label="Train Number"
              value={trainDetails.trainNumber}
              onChange={(event) =>
                setTrainDetails((current) => ({ ...current, trainNumber: event.target.value }))
              }
              placeholder="Enter train number"
            />
            <FormField
              label="Train Name"
              value={trainDetails.trainName}
              onChange={(event) =>
                setTrainDetails((current) => ({ ...current, trainName: event.target.value }))
              }
              placeholder="Enter train name"
            />
            <FormField
              label="Route Name"
              value={trainDetails.routeName}
              onChange={(event) =>
                setTrainDetails((current) => ({ ...current, routeName: event.target.value }))
              }
              placeholder="Enter route name"
            />
          </div>

          {detailsError ? <div className="miso-save-message miso-save-message-error">{detailsError}</div> : null}

          <div className="miso-table-footer">
            <span />
            <div className="miso-actions-right">
              <button className="miso-btn miso-btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button className="miso-btn miso-btn-primary" onClick={handleNextFromDetails}>
                Next →
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showMovementStep ? (
        <section className="miso-card">
          <div className="miso-card-header">
            <h2>Movement History</h2>
          </div>

          <div className="miso-table-wrap">
            <table className="miso-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Current Station</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Current Status</th>
                  <th style={{ textAlign: 'center' }}>Status Update</th>
                  <th>Movement Date &amp; Time</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {movementRows.map((row, index) =>
                  row.isExisting ? (
                    <tr key={row.id}>
                      <td>{row.currentStation}</td>
                      <td>{formatCoordinate(row.latitude)}</td>
                      <td>{formatCoordinate(row.longitude)}</td>
                      <td>
                        {row.currentStatus ? (
                          <span className={statusBadgeClass(row.currentStatus)}>{row.currentStatus}</span>
                        ) : null}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          className="miso-select-checkbox"
                          checked={Boolean(row.checked)}
                          onChange={() => toggleRowChecked(row.id)}
                        />
                      </td>
                      <td>{row.movementDateTime}</td>
                      <td>{row.remarks}</td>
                      <td>
                        <span className="miso-tag-recorded">Recorded</span>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <Autocomplete
                          label="Current Station"
                          value={row.currentStation}
                          onChange={(event) => updateRow(row.id, 'currentStation', event.target.value)}
                          options={STATION_NAMES}
                          placeholder="Enter station"
                          error={row.errors?.currentStation}
                          disabled={!row.isEditing}
                        />
                      </td>
                      <td>
                        <FormField
                          label="Latitude"
                          type="number"
                          value={row.latitude}
                          onChange={(event) => updateRow(row.id, 'latitude', event.target.value)}
                          placeholder="0.0000"
                          min="-90"
                          max="90"
                          step="0.0001"
                          error={row.errors?.latitude}
                          disabled={!row.isEditing}
                        />
                      </td>
                      <td>
                        <FormField
                          label="Longitude"
                          type="number"
                          value={row.longitude}
                          onChange={(event) => updateRow(row.id, 'longitude', event.target.value)}
                          placeholder="0.0000"
                          min="-180"
                          max="180"
                          step="0.0001"
                          error={row.errors?.longitude}
                          disabled={!row.isEditing}
                        />
                      </td>
                      <td>
                        <FormField
                          label="Current Status"
                          type="select"
                          value={row.currentStatus}
                          onChange={(event) => updateRow(row.id, 'currentStatus', event.target.value)}
                          options={index === 0 ? CURRENT_STATUS_OPTIONS : CURRENT_STATUS_OPTIONS_WITHOUT_START}
                          placeholder="Select status"
                          disabled={!row.isEditing}
                        />
                      </td>
                      <td />
                      <td>
                        <FormField
                          label="Movement Date &amp; Time"
                          type="datetime-local"
                          value={row.movementDateTime}
                          onChange={(event) => updateRow(row.id, 'movementDateTime', event.target.value)}
                          error={row.errors?.movementDateTime}
                          disabled={!row.isEditing}
                        />
                      </td>
                      <td>
                        <FormField
                          label="Remarks"
                          type="textarea"
                          value={row.remarks}
                          onChange={(event) => updateRow(row.id, 'remarks', event.target.value)}
                          placeholder="Add notes"
                          rows={3}
                          disabled={!row.isEditing}
                        />
                      </td>
                      <td>
                        <div className="miso-actions">
                          <button
                            type="button"
                            className="miso-btn-action"
                            onClick={() => toggleEditMode(row.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="miso-btn-action miso-btn-action-danger"
                            onClick={() => deleteRow(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div className="miso-table-footer">
            <span className="miso-record-count">{movementCount} movement record(s)</span>
            <div className="miso-actions-right">
              {!isExistingTrain ? (
                <button className="miso-btn miso-btn-secondary" onClick={() => setStep(1)}>
                  ← Back
                </button>
              ) : null}
              {!isExistingTrain ? (
                <button className="miso-btn miso-btn-success" onClick={addMovementRow}>
                  + Add Movement
                </button>
              ) : null}
              <button className="miso-btn miso-btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              {isExistingTrain ? (
                <button className="miso-btn miso-btn-primary" onClick={handleUpdateMovements} disabled={isSaving}>
                  {isSaving ? 'Updating...' : 'Update'}
                </button>
              ) : (
                <button className="miso-btn miso-btn-primary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Train Details'}
                </button>
              )}
            </div>
          </div>

          {saveMessage ? <div className="miso-save-message">{saveMessage}</div> : null}
          {saveError ? <div className="miso-save-message miso-save-message-error">{saveError}</div> : null}
        </section>
      ) : null}
    </main>
  );
}

export default MisoTrainMovementPage;
