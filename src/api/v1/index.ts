import express from 'express';
import router from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { openapiSpec } from './docs/openapi'


const app = express();

app.use(express.json())
app.use(cors())
// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  explorer: true,
}))
app.use('/api/v1', router);
app.use(errorHandler);
export default app;