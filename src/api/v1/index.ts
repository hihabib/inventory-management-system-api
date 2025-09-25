import express from 'express';
import router from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import cors from 'cors'


const app = express();

app.use(express.json())
app.use(cors())
app.use('/api/v1', router);
app.use(errorHandler);
export default app;