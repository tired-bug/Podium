import { Router, Response } from 'express';
import { requireAuth } from '../auth';

const router = Router();

router.all('*', requireAuth, (_req, res: Response) => {
  res.status(410).json({ error: 'Cloud provider integrations removed. Use Podium self-hosted deployments.' });
});

export default router;
