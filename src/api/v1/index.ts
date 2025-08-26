import express from 'express';
import router from './route/index';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json())

app.use('/api/v1', router);
app.use(errorHandler);
export default app;