import httpClient from '../api/httpClient.js';

export async function saveTrain(payload) {
  const response = await httpClient.post('/save-train', payload);
  return response.data;
}

export async function getTrains() {
  const response = await httpClient.get('/trains');
  return response.data;
}

export async function getTrain(id) {
  const response = await httpClient.get(`/trains/${id}`);
  return response.data;
}

export async function addMovement(id, row) {
  const response = await httpClient.post(`/trains/${id}/movements`, row);
  return response.data;
}
