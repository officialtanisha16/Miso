import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import Autocomplete from '../components/Autocomplete.jsx';
import { getTrains } from '../services/trainService.js';

const initialDetails = {
  trainNumber: '',
  trainName: '',
  routeName: '',
};

function TrainListPage() {
  const navigate = useNavigate();

  const [trains, setTrains] = useState([]);
  const [isLoadingTrains, setIsLoadingTrains] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [details, setDetails] = useState(initialDetails);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let isMounted = true;

    getTrains()
      .then((response) => {
        if (isMounted) {
          setTrains(response?.data || []);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadError(err?.response?.data?.message || 'Unable to load trains.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingTrains(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const trainNumberOptions = useMemo(() => trains.map((train) => train.trainNumber), [trains]);
  const trainNameOptions = useMemo(() => trains.map((train) => train.trainName), [trains]);

  const findTrainBy = (field, value) => {
    const query = value.trim().toLowerCase();
    if (!query) {
      return null;
    }
    return trains.find((train) => (train[field] || '').trim().toLowerCase() === query) || null;
  };

  const updateField = (field) => (event) => {
    const value = event.target.value;

    setDetails((current) => {
      const updated = { ...current, [field]: value };

      if (field === 'trainNumber' || field === 'trainName') {
        const match = findTrainBy(field, value);
        if (match) {
          return {
            trainNumber: match.trainNumber,
            trainName: match.trainName,
            routeName: match.routeName,
          };
        }
      }

      return updated;
    });
  };

  const openExistingTrain = (id) => {
    navigate(`/movement-history/${id}`);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!details.trainNumber.trim() || !details.trainName.trim() || !details.routeName.trim()) {
      setFormError('Train Number, Train Name, and Route Name are all required.');
      return;
    }

    if (isLoadingTrains) {
      setFormError('Still loading trains, please try again in a moment.');
      return;
    }

    setFormError('');

    const trainNumberQuery = details.trainNumber.trim().toLowerCase();
    const existingTrain = trains.find(
      (train) => train.trainNumber.trim().toLowerCase() === trainNumberQuery,
    );

    if (existingTrain) {
      openExistingTrain(existingTrain.id);
      return;
    }

    navigate('/movement-history/new', {
      state: {
        trainNumber: details.trainNumber.trim(),
        trainName: details.trainName.trim(),
        routeName: details.routeName.trim(),
      },
    });
  };

  return (
    <main className="miso-page-shell">
      <section className="miso-hero-banner">
        <div>
          <p className="miso-eyebrow">MISO Project</p>
          <h1>MISO Train Movement Management</h1>
          <p className="miso-subtitle">
            Enter a train's details to open its movement history, or a new train number to create one.
          </p>
        </div>
      </section>

      <section className="miso-card">
        <div className="miso-card-header">
          <h2>Train Details</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="miso-form-grid">
            <Autocomplete
              label="Train Number"
              value={details.trainNumber}
              onChange={updateField('trainNumber')}
              options={trainNumberOptions}
              placeholder="e.g. MS-1010"
            />
            <Autocomplete
              label="Train Name"
              value={details.trainName}
              onChange={updateField('trainName')}
              options={trainNameOptions}
              placeholder="Enter train name"
            />
            <FormField
              label="Route Name"
              value={details.routeName}
              onChange={updateField('routeName')}
              placeholder="Enter route name"
            />
          </div>

          {formError ? <div className="miso-save-message miso-save-message-error">{formError}</div> : null}
          {loadError ? <div className="miso-save-message miso-save-message-error">{loadError}</div> : null}

          <div className="miso-table-footer">
            <span />
            <div className="miso-actions-right">
              <button type="submit" className="miso-btn miso-btn-primary">
                Next →
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="miso-card">
        <div className="miso-card-header">
          <h2>All Trains</h2>
        </div>

        {isLoadingTrains ? <p className="miso-subtitle">Loading trains...</p> : null}

        {!isLoadingTrains && !loadError ? (
          <div className="miso-table-wrap">
            <table className="miso-table">
              <thead>
                <tr>
                  <th>Train Number</th>
                  <th>Train Name</th>
                  <th>Route Name</th>
                  <th>Movement Records</th>
                </tr>
              </thead>
              <tbody>
                {trains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="miso-subtitle">
                      No trains found.
                    </td>
                  </tr>
                ) : (
                  trains.map((train) => (
                    <tr
                      key={train.id}
                      onClick={() => openExistingTrain(train.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{train.trainNumber}</td>
                      <td>{train.trainName}</td>
                      <td>{train.routeName}</td>
                      <td>{train.movementHistory.length}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default TrainListPage;
