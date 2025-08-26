import express from 'express';
import router from './route/index';

const app = express();

app.use('/api/v1', router);

export default app;