import express from 'express';
import { saveTrain, listTrains, getTrain, addMovement } from '../controllers/trainController.js';

const router = express.Router();

router.post('/save-train', saveTrain);
router.get('/trains', listTrains);
router.get('/trains/:id', getTrain);
router.post('/trains/:id/movements', addMovement);

export default router;
