import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import trainRoutes from './routes/trainRoutes.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', trainRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`MISO Express server running on http://localhost:${PORT}`);
});
