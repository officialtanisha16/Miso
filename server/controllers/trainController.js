import {
  saveTrainToZoho,
  listTrainsFromZoho,
  getTrainFromZoho,
  addMovementToZoho,
} from '../services/zohoService.js';

export async function saveTrain(req, res) {
  try {
    const payload = req.body;

    if (!payload || !payload.trainDetails) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload. trainDetails is required.',
      });
    }

    const zohoResponse = await saveTrainToZoho(payload);

    return res.status(200).json({
      success: true,
      message: 'Train details and movement history saved successfully.',
      data: zohoResponse,
    });
  } catch (error) {
    const message = error?.response?.data?.message || error.message || 'Failed to save train details.';

    return res.status(error?.statusCode || 500).json({
      success: false,
      message,
      details: error?.response?.data || null,
    });
  }
}

export async function listTrains(req, res) {
  try {
    const trains = await listTrainsFromZoho();

    return res.status(200).json({
      success: true,
      data: trains,
    });
  } catch (error) {
    const message = error?.response?.data?.message || error.message || 'Failed to load trains.';

    return res.status(error?.statusCode || 500).json({
      success: false,
      message,
      details: error?.response?.data || null,
    });
  }
}

export async function getTrain(req, res) {
  try {
    const train = await getTrainFromZoho(req.params.id);

    return res.status(200).json({
      success: true,
      data: train,
    });
  } catch (error) {
    const message = error?.response?.data?.message || error.message || 'Failed to load the train.';

    return res.status(error?.statusCode || 500).json({
      success: false,
      message,
      details: error?.response?.data || null,
    });
  }
}

export async function addMovement(req, res) {
  try {
    const row = req.body;

    if (!row || !row.currentStation || !row.movementDateTime) {
      return res.status(400).json({
        success: false,
        message: 'currentStation and movementDateTime are required.',
      });
    }

    const zohoResponse = await addMovementToZoho(req.params.id, row);

    return res.status(200).json({
      success: true,
      message: 'Movement added successfully.',
      data: zohoResponse,
    });
  } catch (error) {
    const message = error?.response?.data?.message || error.message || 'Failed to add movement.';

    return res.status(error?.statusCode || 500).json({
      success: false,
      message,
      details: error?.response?.data || null,
    });
  }
}
