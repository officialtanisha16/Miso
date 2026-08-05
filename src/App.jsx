import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TrainListPage from './pages/TrainListPage.jsx';
import MisoTrainMovementPage from './pages/MisoTrainMovementPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TrainListPage />} />
      <Route path="/movement-history/new" element={<MisoTrainMovementPage />} />
      <Route path="/movement-history/:trainId" element={<MisoTrainMovementPage />} />
    </Routes>
  );
}
