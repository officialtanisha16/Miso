import express from 'express';
import {
  saveTrain,
  listTrains,
  getTrain,
  addMovement,
  updateMovements,
} from '../controllers/trainController.js';

const router = express.Router();

router.post('/save-train', saveTrain);
router.get('/trains', listTrains);
router.get('/trains/:id', getTrain);
router.post('/trains/:id/movements', addMovement);
router.patch('/trains/:id/movements', updateMovements);

export default router;
