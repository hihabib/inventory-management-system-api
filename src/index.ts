import http from 'http';
import app from './api/v1/index.js';
import { PORT } from './api/v1/config/env.js';


const server = http.createServer(app);


server.listen(Number(PORT), () => {
    console.log(`Server is running on port ${PORT}`);
});
